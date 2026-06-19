import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MessageStatus } from '@prisma/client';

const STATUS_MAP: Record<string, MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

const COUNTER_FIELD: Record<MessageStatus, string | null> = {
  PENDING: null,
  QUEUED: 'queuedCount',
  SENT: 'sentCount',
  DELIVERED: 'deliveredCount',
  READ: 'readCount',
  FAILED: 'errorCount',
};

@Controller('webhooks/meta')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly prisma: PrismaService) {}

  // Verificação inicial do webhook (handshake exigido pela Meta)
  @Get()
  verify(@Query() query: Record<string, string>, @Res() res: Response) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return res.status(HttpStatus.OK).send(challenge);
    }
    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  // Callbacks de status (sent/delivered/read/failed) e mensagens recebidas
  @Post()
  async receive(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    if (!this.isValidSignature(req)) {
      this.logger.warn('Assinatura inválida no webhook da Meta — descartando payload');
      return res.sendStatus(HttpStatus.FORBIDDEN);
    }

    // Responde 200 imediatamente (recomendação da Meta) e processa em seguida
    res.sendStatus(HttpStatus.OK);

    try {
      const body = req.body;
      const entries = body?.entry ?? [];
      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          const statuses = change?.value?.statuses ?? [];
          for (const status of statuses) {
            await this.handleStatusUpdate(status);
          }
        }
      }
    } catch (err) {
      this.logger.error('Erro ao processar webhook da Meta', err as Error);
    }
  }

  private isValidSignature(req: RawBodyRequest<Request>): boolean {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) return true; // permite rodar sem validação em dev, se não configurado

    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signatureHeader || !req.rawBody) return false;

    const expected =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private async handleStatusUpdate(status: { id: string; status: string; errors?: { code: string; title: string }[] }) {
    const metaMessageId = status.id;
    const newStatus = STATUS_MAP[status.status];
    if (!metaMessageId || !newStatus) return;

    const message = await this.prisma.campaignMessage.findUnique({
      where: { metaMessageId },
    });
    if (!message) {
      this.logger.warn(`Mensagem com wamid=${metaMessageId} não encontrada no banco`);
      return;
    }

    // Evita retroceder status (ex: webhook de "delivered" chegando depois de "read")
    const order: MessageStatus[] = ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ'];
    const currentIdx = order.indexOf(message.status);
    const newIdx = order.indexOf(newStatus);
    if (newStatus !== 'FAILED' && currentIdx >= 0 && newIdx >= 0 && newIdx <= currentIdx) {
      return;
    }

    const timestampField =
      newStatus === 'SENT'
        ? 'sentAt'
        : newStatus === 'DELIVERED'
          ? 'deliveredAt'
          : newStatus === 'READ'
            ? 'readAt'
            : 'failedAt';

    const previousCounterField = COUNTER_FIELD[message.status];
    const newCounterField = COUNTER_FIELD[newStatus];

    await this.prisma.$transaction(async (tx) => {
      await tx.campaignMessage.update({
        where: { id: message.id },
        data: {
          status: newStatus,
          [timestampField]: new Date(),
          ...(newStatus === 'FAILED'
            ? {
                errorCode: status.errors?.[0]?.code,
                errorMessage: status.errors?.[0]?.title,
              }
            : {}),
        },
      });

      const decrements: Record<string, { decrement: number }> = {};
      const increments: Record<string, { increment: number }> = {};
      if (previousCounterField) decrements[previousCounterField] = { decrement: 1 };
      if (newCounterField) increments[newCounterField] = { increment: 1 };

      await tx.campaign.update({
        where: { id: message.campaignId },
        data: { ...decrements, ...increments },
      });
    });
  }
}
