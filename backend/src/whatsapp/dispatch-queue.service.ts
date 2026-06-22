import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappApiService } from './whatsapp-api.service';
import { EvolutionApiService } from './evolution-api.service';
import { CampaignStatus, Channel, MessageStatus } from '@prisma/client';

// Meta Cloud API: rate limit é por throughput de conversas, não por timing entre
// chamadas — lote pequeno com 1.2s de folga entre envios é só conservador.
const META_BATCH_SIZE = 5;
const META_DELAY_MS = 1200;

// Evolution API (número normal, não-oficial): pausa adaptativa por volume de
// mensagens já enviadas HOJE por aquele número — quanto mais mensagens, maior o
// intervalo entre envios, simulando um padrão mais humano. Mesmo assim NÃO há
// garantia: o número pode ser banido pelo WhatsApp a qualquer momento nesse
// canal — ver EVOLUTION_SETUP.md. Os limiares abaixo são um ponto de partida
// conservador, ajustável conforme a experiência de uso real.
interface EvolutionTier {
  upTo: number; // tier se aplica enquanto sentToday <= upTo
  minDelayMs: number;
  maxDelayMs: number;
}
const EVOLUTION_TIERS: EvolutionTier[] = [
  { upTo: 20, minDelayMs: 10_000, maxDelayMs: 18_000 }, // até 20 msgs/dia: 10-18s entre envios
  { upTo: 50, minDelayMs: 20_000, maxDelayMs: 30_000 }, // 21-50 msgs/dia: 20-30s
  { upTo: 100, minDelayMs: 35_000, maxDelayMs: 50_000 }, // 51-100 msgs/dia: 35-50s
  { upTo: 300, minDelayMs: 60_000, maxDelayMs: 90_000 }, // 101-300 msgs/dia: 1-1.5min
  { upTo: 600, minDelayMs: 90_000, maxDelayMs: 150_000 }, // 301-600 msgs/dia: 1.5-2.5min
  { upTo: 1000, minDelayMs: 150_000, maxDelayMs: 240_000 }, // 601-1000 msgs/dia: 2.5-4min
  { upTo: Infinity, minDelayMs: 240_000, maxDelayMs: 360_000 }, // acima de 1000/dia: 4-6min
];

// Pausas extras ("descanso") ao cruzar marcos de mensagens enviadas no dia.
// O marco de 1000 se repete a cada 500 mensagens adicionais (1500, 2000, ...)
// como rede de segurança caso o volume passe do combinado.
const EVOLUTION_CHECKPOINTS: { at: number; minMs: number; maxMs: number; repeatEvery?: number }[] = [
  { at: 20, minMs: 2 * 60_000, maxMs: 4 * 60_000 },
  { at: 50, minMs: 8 * 60_000, maxMs: 12 * 60_000 },
  { at: 100, minMs: 20 * 60_000, maxMs: 30 * 60_000 },
  { at: 300, minMs: 45 * 60_000, maxMs: 75 * 60_000 },
  { at: 600, minMs: 75 * 60_000, maxMs: 120 * 60_000 },
  { at: 1000, minMs: 150 * 60_000, maxMs: 240 * 60_000, repeatEvery: 500 },
];

type CampaignWithRelations = {
  id: string;
  whatsAppNumberId: string;
  whatsAppNumber: { channel: Channel; phoneNumberId: string | null; evolutionInstanceName: string | null };
  template: { name: string; language: string } | null;
  messageText: string | null;
};

@Injectable()
export class DispatchQueueService {
  private readonly logger = new Logger(DispatchQueueService.name);
  private processing = false;

  // Próximo horário permitido de envio por número do canal Evolution (em memória —
  // some num restart do processo; na pior hipótese isso só faz um envio sair um
  // pouco mais cedo logo após o backend reiniciar, o tier de delay em si continua
  // correto pois é recalculado a partir do banco a cada envio).
  private readonly nextAllowedSendAt = new Map<string, number>();

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
      if (campaign.whatsAppNumber.channel === Channel.EVOLUTION_API) {
        await this.processEvolutionCampaign(campaign);
      } else {
        await this.processMetaCampaign(campaign);
      }
    }
  }

  // Canal Meta: processa em lote pequeno, delay curto fixo (rate limit é da Meta).
  private async processMetaCampaign(campaign: CampaignWithRelations) {
    const pending = await this.prisma.campaignMessage.findMany({
      where: { campaignId: campaign.id, status: MessageStatus.PENDING },
      include: { contact: true },
      take: META_BATCH_SIZE,
    });

    if (pending.length === 0) {
      await this.completeCampaignIfDone(campaign.id);
      return;
    }

    for (const message of pending) {
      await this.sendOne(campaign, message);
      await this.sleep(META_DELAY_MS);
    }
  }

  // Canal Evolution: no máximo 1 envio por tick por número, respeitando a pausa
  // adaptativa calculada após o envio anterior — não bloqueia outras campanhas
  // (inclusive Meta) enquanto está "descansando".
  private async processEvolutionCampaign(campaign: CampaignWithRelations) {
    const nextAllowed = this.nextAllowedSendAt.get(campaign.whatsAppNumberId) ?? 0;
    if (Date.now() < nextAllowed) return;

    const message = await this.prisma.campaignMessage.findFirst({
      where: { campaignId: campaign.id, status: MessageStatus.PENDING },
      include: { contact: true },
    });

    if (!message) {
      await this.completeCampaignIfDone(campaign.id);
      return;
    }

    await this.sendOne(campaign, message);

    const sentToday = await this.countSentTodayForNumber(campaign.whatsAppNumberId);
    const delay = this.delayForEvolutionCount(sentToday);
    this.nextAllowedSendAt.set(campaign.whatsAppNumberId, Date.now() + delay);
  }

  private async completeCampaignIfDone(campaignId: string) {
    const remaining = await this.prisma.campaignMessage.count({
      where: { campaignId, status: MessageStatus.PENDING },
    });
    if (remaining === 0) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.COMPLETED, finishedAt: new Date() },
      });
    }
  }

  private async countSentTodayForNumber(whatsAppNumberId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.campaignMessage.count({
      where: {
        campaign: { whatsAppNumberId },
        OR: [{ sentAt: { gte: startOfDay } }, { failedAt: { gte: startOfDay } }],
      },
    });
  }

  private delayForEvolutionCount(sentToday: number): number {
    const tier = EVOLUTION_TIERS.find((t) => sentToday <= t.upTo) ?? EVOLUTION_TIERS[EVOLUTION_TIERS.length - 1];
    let delay = this.randomBetween(tier.minDelayMs, tier.maxDelayMs);

    for (const checkpoint of EVOLUTION_CHECKPOINTS) {
      const crossed =
        sentToday === checkpoint.at ||
        (checkpoint.repeatEvery !== undefined &&
          sentToday > checkpoint.at &&
          (sentToday - checkpoint.at) % checkpoint.repeatEvery === 0);
      if (crossed) {
        delay += this.randomBetween(checkpoint.minMs, checkpoint.maxMs);
      }
    }
    return delay;
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min));
  }

  private async sendOne(campaign: CampaignWithRelations, message: { id: string; contact: { phone: string; name: string } }) {
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
