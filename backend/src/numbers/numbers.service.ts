import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NumbersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.whatsAppNumber.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(data: { label: string; phoneNumberId: string; wabaId: string; displayNumber?: string; isTestNumber?: boolean }) {
    return this.prisma.whatsAppNumber.create({ data });
  }
}
