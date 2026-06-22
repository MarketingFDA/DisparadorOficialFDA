import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.whatsAppNumber.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(data: CreateNumberInput) {
    if (data.channel === Channel.META_CLOUD_API) {
      if (!data.phoneNumberId || !data.wabaId) {
        throw new BadRequestException('phoneNumberId e wabaId são obrigatórios para o canal Meta Cloud API');
      }
    } else if (data.channel === Channel.EVOLUTION_API) {
      if (!data.evolutionInstanceName) {
        throw new BadRequestException('evolutionInstanceName é obrigatório para o canal Evolution API');
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
}
