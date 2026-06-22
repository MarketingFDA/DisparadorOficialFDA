import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchQueueService } from '../whatsapp/dispatch-queue.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignStatus, Channel, MessageStatus } from '@prisma/client';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchQueue: DispatchQueueService,
  ) {}

  findAll(search?: string) {
    return this.prisma.campaign.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      include: { whatsAppNumber: true, template: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { whatsAppNumber: true, template: true, group: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  async create(dto: CreateCampaignDto) {
    const number = await this.prisma.whatsAppNumber.findUnique({ where: { id: dto.whatsAppNumberId } });
    if (!number) throw new NotFoundException('Número de WhatsApp não encontrado');

    if (number.channel === Channel.META_CLOUD_API && !dto.templateId) {
      throw new BadRequestException('templateId é obrigatório para campanhas no canal Meta Cloud API');
    }
    if (number.channel === Channel.EVOLUTION_API && !dto.messageText?.trim()) {
      throw new BadRequestException('messageText é obrigatório para campanhas no canal Evolution API');
    }

    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        whatsAppNumberId: dto.whatsAppNumberId,
        templateId: number.channel === Channel.META_CLOUD_API ? dto.templateId : undefined,
        messageText: number.channel === Channel.EVOLUTION_API ? dto.messageText : undefined,
        groupId: dto.groupId,
      },
    });
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOne(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Só é possível editar campanhas em rascunho');
    }
    return this.prisma.campaign.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.campaignMessage.deleteMany({ where: { campaignId: id } });
    return this.prisma.campaign.delete({ where: { id } });
  }

  async bulkDelete(ids: string[]) {
    await this.prisma.campaignMessage.deleteMany({ where: { campaignId: { in: ids } } });
    const result = await this.prisma.campaign.deleteMany({ where: { id: { in: ids } } });
    return { deleted: result.count };
  }

  async removeAll() {
    await this.prisma.campaignMessage.deleteMany({});
    const result = await this.prisma.campaign.deleteMany({});
    return { deleted: result.count };
  }

  // "Sincronizar" do dropdown Ações: recalcula os contadores agregados a partir das mensagens reais
  async sync(id: string) {
    const campaign = await this.findOne(id);
    const counts = await this.prisma.campaignMessage.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: true,
    });

    const data = {
      totalCount: 0,
      queuedCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      errorCount: 0,
    };
    for (const row of counts) {
      data.totalCount += row._count;
      if (row.status === MessageStatus.QUEUED) data.queuedCount = row._count;
      if (row.status === MessageStatus.SENT) data.sentCount = row._count;
      if (row.status === MessageStatus.DELIVERED) data.deliveredCount = row._count;
      if (row.status === MessageStatus.READ) data.readCount = row._count;
      if (row.status === MessageStatus.FAILED) data.errorCount = row._count;
    }

    return this.prisma.campaign.update({ where: { id }, data });
  }

  // Cria as CampaignMessage (uma por contato do grupo) e inicia a fila de disparo
  async dispatch(id: string) {
    const campaign = await this.findOne(id);
    if (campaign.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Campanha já está em envio');
    }

    const existingCount = await this.prisma.campaignMessage.count({ where: { campaignId: id } });
    if (existingCount === 0) {
      const contacts = await this.prisma.contact.findMany({ where: { groupId: campaign.groupId } });
      if (contacts.length === 0) {
        throw new BadRequestException('O grupo de destinatários selecionado não tem contatos');
      }
      await this.prisma.campaignMessage.createMany({
        data: contacts.map((c) => ({ campaignId: id, contactId: c.id, status: MessageStatus.PENDING })),
      });
      await this.prisma.campaign.update({ where: { id }, data: { totalCount: contacts.length } });
    }

    await this.dispatchQueue.startCampaign(id);
    return this.findOne(id);
  }

  async pause(id: string) {
    await this.dispatchQueue.pauseCampaign(id);
    return this.findOne(id);
  }
}
