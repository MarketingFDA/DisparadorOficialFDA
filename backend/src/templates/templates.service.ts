import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { TemplateStatus } from '@prisma/client';

const META_STATUS_MAP: Record<string, TemplateStatus> = {
  APPROVED: TemplateStatus.APPROVED,
  PENDING: TemplateStatus.PENDING,
  IN_APPEAL: TemplateStatus.PENDING,
  REJECTED: TemplateStatus.REJECTED,
  PAUSED: TemplateStatus.PAUSED,
  DISABLED: TemplateStatus.PAUSED,
};

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappApiService,
  ) {}

  findAll(whatsAppNumberId?: string) {
    return this.prisma.template.findMany({
      where: whatsAppNumberId ? { whatsAppNumberId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async sync(whatsAppNumberId: string) {
    const number = await this.prisma.whatsAppNumber.findUnique({ where: { id: whatsAppNumberId } });
    if (!number) throw new NotFoundException('Número de WhatsApp não encontrado');

    const metaTemplates = await this.whatsapp.fetchMessageTemplates(number.wabaId);

    let synced = 0;
    for (const t of metaTemplates) {
      const bodyComponent = (t.components || []).find((c: any) => c.type === 'BODY');
      const headerComponent = (t.components || []).find((c: any) => c.type === 'HEADER');
      const footerComponent = (t.components || []).find((c: any) => c.type === 'FOOTER');
      const bodyText: string = bodyComponent?.text || '';
      const variablesCount = (bodyText.match(/{{\d+}}/g) || []).length;

      await this.prisma.template.upsert({
        where: {
          whatsAppNumberId_name_language: {
            whatsAppNumberId: number.id,
            name: t.name,
            language: t.language,
          },
        },
        create: {
          whatsAppNumberId: number.id,
          metaTemplateId: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: META_STATUS_MAP[t.status] || TemplateStatus.PENDING,
          bodyText,
          headerType: headerComponent?.format,
          footerText: footerComponent?.text,
          variablesCount,
          rawPayload: t,
        },
        update: {
          metaTemplateId: t.id,
          category: t.category,
          status: META_STATUS_MAP[t.status] || TemplateStatus.PENDING,
          bodyText,
          headerType: headerComponent?.format,
          footerText: footerComponent?.text,
          variablesCount,
          rawPayload: t,
          syncedAt: new Date(),
        },
      });
      synced += 1;
    }

    return { synced };
  }
}
