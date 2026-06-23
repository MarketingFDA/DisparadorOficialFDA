import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappApiService } from './whatsapp-api.service';
import { EvolutionApiService } from './evolution-api.service';
import { CampaignStatus, Channel, MessageStatus } from '@prisma/client';

// Meta Cloud API: rate limit é por throughput de conversas, não por timing entre
// chamadas — lote pequeno com 1.2s de folga entre envios é só conservador.
const META_BATCH_SIZE = 5;
const META_DELAY_MS = 1200;

// Evolution API (número normal, não-oficial): várias camadas de proteção contra
// bloqueio, nenhuma delas garante segurança sozinha — ver EVOLUTION_SETUP.md.

// 1) Intervalo fixo entre envios — pedido explícito do usuário pra parar de
// escalar com o volume do dia (era 10s a 6min dependendo de sentToday).
const EVOLUTION_MESSAGE_DELAY_MS = 20_000;

// 2) Aquecimento progressivo: número recém-conectado manda menos por dia,
// independente do que a campanha tenha pendente. Mandar muito num número novo
// é o maior gatilho de bloqueio que existe — mais importante que o timing.
const WARMUP_CAPS: { maxDays: number; dailyCap: number }[] = [
  { maxDays: 3, dailyCap: 40 },
  { maxDays: 7, dailyCap: 150 },
  { maxDays: 14, dailyCap: 400 },
  { maxDays: Infinity, dailyCap: Infinity },
];

// 3) Janela de horário: nada de disparo de madrugada, que é padrão de bot.
const SENDING_WINDOW_START_HOUR = 8;
const SENDING_WINDOW_END_HOUR = 21;
const SENDING_WINDOW_TIMEZONE = 'America/Sao_Paulo';

// 4) Circuit breaker: se a taxa de falha recente for alta, só loga um alerta
// (possível bloqueio/throttling pelo WhatsApp) — não pausa nem desacelera mais
// o envio, a pedido do usuário (sempre 20s entre mensagens, mesmo com erro alto).
const CIRCUIT_BREAKER_SAMPLE_SIZE = 20;
const CIRCUIT_BREAKER_MIN_SAMPLE = 10;
const CIRCUIT_BREAKER_FAILURE_RATE = 0.3;

// 5) "Digitando..." antes de cada envio — a Evolution API simula presença de
// composing pelo tempo informado em vez de a mensagem aparecer instantânea.
const TYPING_DELAY_MIN_MS = 1500;
const TYPING_DELAY_MAX_MS = 4000;

type CampaignWithRelations = {
  id: string;
  whatsAppNumberId: string;
  whatsAppNumber: {
    channel: Channel;
    phoneNumberId: string | null;
    evolutionInstanceName: string | null;
    connectedAt: Date | null;
  };
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
  // Evita logar o aviso de teto de aquecimento/fora da janela a cada 5s.
  private readonly lastSkipLogAt = new Map<string, number>();

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

  // Campanhas criadas com scheduledAt ficam QUEUED até esse horário chegar.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async promoteScheduledCampaigns() {
    const due = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.QUEUED, scheduledAt: { lte: new Date() } },
    });
    for (const campaign of due) {
      try {
        await this.dispatchNow(campaign.id, campaign.groupId);
      } catch (err) {
        this.logger.error(`Falha ao iniciar campanha agendada ${campaign.id}: ${(err as Error).message}`);
        await this.prisma.campaign
          .update({ where: { id: campaign.id }, data: { status: CampaignStatus.FAILED } })
          .catch(() => {});
      }
    }
  }

  // Cria as CampaignMessage (uma por contato do grupo, se ainda não existirem) e inicia o envio.
  // Usado tanto pelo disparo manual (POST /campaigns/:id/dispatch) quanto pela promoção de agendadas.
  async dispatchNow(campaignId: string, groupId: string) {
    const existingCount = await this.prisma.campaignMessage.count({ where: { campaignId } });
    if (existingCount === 0) {
      const contacts = await this.prisma.contact.findMany({ where: { groupId } });
      if (contacts.length === 0) {
        throw new BadRequestException('O grupo de destinatários selecionado não tem contatos');
      }
      await this.prisma.campaignMessage.createMany({
        data: contacts.map((c) => ({ campaignId, contactId: c.id, status: MessageStatus.PENDING })),
      });
      await this.prisma.campaign.update({ where: { id: campaignId }, data: { totalCount: contacts.length } });
    }
    await this.startCampaign(campaignId);
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

  // Canal Evolution: no máximo 1 envio por tick por número, respeitando pausa
  // adaptativa, janela de horário e teto de aquecimento — sem bloquear outras
  // campanhas (inclusive Meta) enquanto está "descansando" ou fora da janela.
  private async processEvolutionCampaign(campaign: CampaignWithRelations) {
    const numberId = campaign.whatsAppNumberId;

    const nextAllowed = this.nextAllowedSendAt.get(numberId) ?? 0;
    if (Date.now() < nextAllowed) return;

    if (!this.isWithinSendingWindow()) {
      this.logSkipOncePerHour(numberId, 'fora-da-janela', 'Fora da janela de horário de envio (8h-21h, América/São Paulo)');
      return;
    }

    const message = await this.prisma.campaignMessage.findFirst({
      where: { campaignId: campaign.id, status: MessageStatus.PENDING },
      include: { contact: true },
    });
    if (!message) {
      await this.completeCampaignIfDone(campaign.id);
      return;
    }

    const sentToday = await this.countSentTodayForNumber(numberId);
    const cap = this.warmupCapFor(campaign.whatsAppNumber.connectedAt);
    if (sentToday >= cap) {
      this.logSkipOncePerHour(
        numberId,
        'teto-aquecimento',
        `Teto de aquecimento do dia atingido (${sentToday}/${cap === Infinity ? '∞' : cap}) — retoma amanhã`,
      );
      return;
    }

    await this.sendOne(campaign, message);
    // Mantém o log de alerta (visibilidade de possível bloqueio/throttling), mas
    // não aplica mais resfriamento extra — pedido do usuário: sempre 20s, mesmo
    // com taxa de erro alta.
    await this.checkCircuitBreaker(numberId);

    this.nextAllowedSendAt.set(numberId, Date.now() + EVOLUTION_MESSAGE_DELAY_MS);
  }

  private logSkipOncePerHour(numberId: string, key: string, message: string) {
    const mapKey = `${numberId}:${key}`;
    const last = this.lastSkipLogAt.get(mapKey) ?? 0;
    if (Date.now() - last > 60 * 60_000) {
      this.logger.log(`[${numberId}] ${message}`);
      this.lastSkipLogAt.set(mapKey, Date.now());
    }
  }

  private isWithinSendingWindow(): boolean {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: SENDING_WINDOW_TIMEZONE,
      }).format(new Date()),
    ) % 24;
    return hour >= SENDING_WINDOW_START_HOUR && hour < SENDING_WINDOW_END_HOUR;
  }

  private warmupCapFor(connectedAt: Date | null): number {
    const daysSinceConnected = connectedAt ? (Date.now() - connectedAt.getTime()) / (24 * 60 * 60_000) : 0;
    const tier = WARMUP_CAPS.find((t) => daysSinceConnected <= t.maxDays) ?? WARMUP_CAPS[WARMUP_CAPS.length - 1];
    return tier.dailyCap;
  }

  // Retorna true se a taxa de falha recente estiver alta — quem chama aplica um
  // resfriamento extra no delay, mas a campanha continua em SENDING.
  private async checkCircuitBreaker(whatsAppNumberId: string): Promise<boolean> {
    const recent = await this.prisma.campaignMessage.findMany({
      where: {
        campaign: { whatsAppNumberId },
        status: { in: [MessageStatus.SENT, MessageStatus.FAILED] },
      },
      orderBy: { updatedAt: 'desc' },
      take: CIRCUIT_BREAKER_SAMPLE_SIZE,
    });
    if (recent.length < CIRCUIT_BREAKER_MIN_SAMPLE) return false;

    const failures = recent.filter((m) => m.status === MessageStatus.FAILED).length;
    if (failures / recent.length >= CIRCUIT_BREAKER_FAILURE_RATE) {
      this.logger.warn(
        `Taxa de erro alta (${failures}/${recent.length}) no número ${whatsAppNumberId} — possível sinal de bloqueio/throttling pelo WhatsApp (envio continua sem desacelerar)`,
      );
      return true;
    }
    return false;
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
      const errorMessage = this.extractErrorMessage(err);
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

  // Evolution API e Meta Cloud API têm formatos de erro diferentes; aqui tentamos
  // extrair algo legível para o usuário em vez do genérico "Request failed...".
  private extractErrorMessage(err: any): string {
    const responseMessage = err?.response?.data?.response?.message;
    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      const first = responseMessage[0];
      if (typeof first === 'object' && first?.exists === false) {
        return `Número não tem WhatsApp (${first.number ?? '?'})`;
      }
      if (typeof first === 'string') return responseMessage.join('; ');
    }
    return (
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      'Falha desconhecida'
    );
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
      delayMs: this.randomBetween(TYPING_DELAY_MIN_MS, TYPING_DELAY_MAX_MS),
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
