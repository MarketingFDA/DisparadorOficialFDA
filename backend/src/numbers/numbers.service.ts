import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiService } from '../whatsapp/evolution-api.service';
import { Channel } from '@prisma/client';

export interface CreateNumberInput {
  label: string;
  channel: Channel;
  displayNumber?: string;
  isTestNumber?: boolean;
  // Meta Cloud API
  phoneNumberId?: string;
  wabaId?: string;
  // Evolution API
  evolutionInstanceName?: string;
}

@Injectable()
export class NumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionApiService,
  ) {}

  findAll() {
    return this.prisma.whatsAppNumber.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(data: CreateNumberInput) {
    if (data.channel === Channel.META_CLOUD_API) {
      if (!data.phoneNumberId || !data.wabaId) {
        throw new BadRequestException('phoneNumberId e wabaId são obrigatórios para o canal Meta Cloud API');
      }
    } else if (data.channel === Channel.EVOLUTION_API) {
      if (!data.evolutionInstanceName) {
        throw new BadRequestException('evolutionInstanceName é obrigatório para o canal Evolution API');
      }
      // Cria a instância remotamente na Evolution API antes de salvar o número,
      // para o usuário poder escanear o QR Code direto pela tela do Disparador.
      try {
        await this.evolution.createInstance(data.evolutionInstanceName);
      } catch (err: any) {
        const message = err?.response?.data?.response?.message || err?.response?.data?.message || err?.message || 'Falha desconhecida';
        throw new BadRequestException(`Não foi possível criar a instância na Evolution API: ${message}`);
      }
    }

    return this.prisma.whatsAppNumber.create({
      data: {
        label: data.label,
        channel: data.channel,
        displayNumber: data.displayNumber,
        isTestNumber: data.isTestNumber ?? true,
        phoneNumberId: data.channel === Channel.META_CLOUD_API ? data.phoneNumberId : undefined,
        wabaId: data.channel === Channel.META_CLOUD_API ? data.wabaId : undefined,
        evolutionInstanceName: data.channel === Channel.EVOLUTION_API ? data.evolutionInstanceName : undefined,
      },
    });
  }

  async getQrCode(id: string) {
    const number = await this.findEvolutionNumber(id);
    return this.evolution.getQrCode(number.evolutionInstanceName!);
  }

  async getConnectionState(id: string) {
    const number = await this.findEvolutionNumber(id);
    return this.evolution.getConnectionState(number.evolutionInstanceName!);
  }

  private async findEvolutionNumber(id: string) {
    const number = await this.prisma.whatsAppNumber.findUnique({ where: { id } });
    if (!number) throw new NotFoundException('Número não encontrado');
    if (number.channel !== Channel.EVOLUTION_API || !number.evolutionInstanceName) {
      throw new BadRequestException('Esse número não é do canal Evolution API');
    }
    return number;
  }
}
