import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappApiService } from './whatsapp-api.service';
import { CampaignStatus, MessageStatus } from '@prisma/client';

// Lote pequeno processado a cada tick, espaçado por um delay entre envios
// para respeitar o rate limit da Meta (tier inicial costuma ser 250 conversas/24h
// em número novo, bem mais folgado que o limite de throughput da própria API).
const BATCH_SIZE = 5;
const DELAY_BETWEEN_SENDS_MS = 1200;

@Injectable()
export class DispatchQueueService {
  private readonly logger = new Logger(DispatchQueueService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappApiService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick() {
    if (this.processing) return; // evita sobreposição entre ticks
    this.processing = true;
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error('Erro processando fila de disparo', err as Error);
    } finally {
      this.processing = false;
    }
  }

  private async processBatch() {
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.SENDING },
      include: { whatsAppNumber: true, template: true },
    });

    for (const campaign of campaigns) {
      const pending = await this.prisma.campaignMessage.findMany({
        where: { campaignId: campaign.id, status: MessageStatus.PENDING },
        include: { contact: true },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) {
        const remaining = await this.prisma.campaignMessage.count({
          where: { campaignId: campaign.id, status: MessageStatus.PENDING },
        });
        if (remaining === 0) {
          await this.prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: CampaignStatus.COMPLETED, finishedAt: new Date() },
          });
        }
        continue;
      }

      for (const message of pending) {
        await this.sendOne(campaign, message);
        await this.sleep(DELAY_BETWEEN_SENDS_MS);
      }
    }
  }

  private async sendOne(
    campaign: { id: string; whatsAppNumber: { phoneNumberId: string }; template: { name: string; language: string } },
    message: { id: string; contact: { phone: string; name: string } },
  ) {
    try {
      const result = await this.whatsapp.sendTemplateMessage({
        phoneNumberId: campaign.whatsAppNumber.phoneNumberId,
        toPhoneE164: message.contact.phone,
        templateName: campaign.template.name,
        language: campaign.template.language,
        bodyParams: [message.contact.name],
      });

      await this.prisma.$transaction([
        this.prisma.campaignMessage.update({
          where: { id: message.id },
          data: { status: MessageStatus.SENT, sentAt: new Date(), metaMessageId: result.metaMessageId },
        }),
        this.prisma.campaign.update({
          where: { id: campaign.id },
          data: { sentCount: { increment: 1 } },
        }),
      ]);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error?.message || err?.message || 'Falha desconhecida';
      this.logger.error(`Falha ao enviar mensagem ${message.id}: ${errorMessage}`);
      await this.prisma.$transaction([
        this.prisma.campaignMessage.update({
          where: { id: message.id },
          data: { status: MessageStatus.FAILED, failedAt: new Date(), errorMessage },
        }),
        this.prisma.campaign.update({
          where: { id: campaign.id },
          data: { errorCount: { increment: 1 } },
        }),
      ]);
    }
  }

  async startCampaign(campaignId: string) {
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SENDING, startedAt: new Date() },
    });
  }

  async pauseCampaign(campaignId: string) {
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.PAUSED },
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
