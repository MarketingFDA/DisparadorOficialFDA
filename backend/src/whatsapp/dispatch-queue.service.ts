import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappApiService } from './whatsapp-api.service';
import { EvolutionApiService } from './evolution-api.service';
import { CampaignStatus, Channel, MessageStatus } from '@prisma/client';

// Lote pequeno processado a cada tick, espaçado por um delay entre envios.
// Meta Cloud API: rate limit é por throughput de conversas, não por timing entre
// chamadas — 1.2s é só uma folga conservadora.
// Evolution API (número normal, não-oficial): delay de 10s entre cada envio,
// para reduzir a chance de o WhatsApp detectar padrão de disparo em massa.
// Mesmo assim NÃO há garantia: número normal pode ser banido pelo WhatsApp a
// qualquer momento nesse canal — ver EVOLUTION_SETUP.md.
const BATCH_SIZE = 5;
const DELAY_BETWEEN_SENDS_MS: Record<Channel, number> = {
  META_CLOUD_API: 1200,
  EVOLUTION_API: 10000,
};

@Injectable()
export class DispatchQueueService {
  private readonly logger = new Logger(DispatchQueueService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappApiService,
    private readonly evolution: EvolutionApiService,
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

      const delay = DELAY_BETWEEN_SENDS_MS[campaign.whatsAppNumber.channel];
      for (const message of pending) {
        await this.sendOne(campaign, message);
        await this.sleep(delay);
      }
    }
  }

  private async sendOne(
    campaign: {
      id: string;
      whatsAppNumber: { channel: Channel; phoneNumberId: string | null; evolutionInstanceName: string | null };
      template: { name: string; language: string } | null;
      messageText: string | null;
    },
    message: { id: string; contact: { phone: string; name: string } },
  ) {
    try {
      const externalMessageId =
        campaign.whatsAppNumber.channel === Channel.META_CLOUD_API
          ? await this.sendViaMeta(campaign, message)
          : await this.sendViaEvolution(campaign, message);

      await this.prisma.$transaction([
        this.prisma.campaignMessage.update({
          where: { id: message.id },
          data: { status: MessageStatus.SENT, sentAt: new Date(), metaMessageId: externalMessageId },
        }),
        this.prisma.campaign.update({
          where: { id: campaign.id },
          data: { sentCount: { increment: 1 } },
        }),
      ]);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Falha desconhecida';
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

  private async sendViaMeta(
    campaign: {
      whatsAppNumber: { phoneNumberId: string | null };
      template: { name: string; language: string } | null;
    },
    message: { contact: { phone: string; name: string } },
  ): Promise<string> {
    if (!campaign.whatsAppNumber.phoneNumberId || !campaign.template) {
      throw new Error('Campanha no canal Meta sem phoneNumberId ou template configurado');
    }
    const result = await this.whatsapp.sendTemplateMessage({
      phoneNumberId: campaign.whatsAppNumber.phoneNumberId,
      toPhoneE164: message.contact.phone,
      templateName: campaign.template.name,
      language: campaign.template.language,
      bodyParams: [message.contact.name],
    });
    return result.metaMessageId;
  }

  private async sendViaEvolution(
    campaign: {
      whatsAppNumber: { evolutionInstanceName: string | null };
      messageText: string | null;
    },
    message: { contact: { phone: string; name: string } },
  ): Promise<string> {
    if (!campaign.whatsAppNumber.evolutionInstanceName || !campaign.messageText) {
      throw new Error('Campanha no canal Evolution sem instância ou texto de mensagem configurado');
    }
    const text = campaign.messageText.replace(/{{\s*nome\s*}}/gi, message.contact.name);
    const result = await this.evolution.sendText({
      instanceName: campaign.whatsAppNumber.evolutionInstanceName,
      toPhoneE164: message.contact.phone,
      text,
    });
    return result.externalMessageId;
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
