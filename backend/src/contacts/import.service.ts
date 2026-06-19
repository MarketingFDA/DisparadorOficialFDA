import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

export interface ImportResult {
  groupId: string;
  imported: number;
  skipped: number;
  errors: string[];
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  // Normaliza telefone para E.164 assumindo Brasil (+55) quando o DDI não vier incluso
  private normalizePhone(raw: string): string | null {
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
    if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
    if (digits.length > 11) return `+${digits}`;
    return null;
  }

  async importFromXlsx(buffer: Buffer, groupName: string, existingGroupId?: string): Promise<ImportResult> {
    const group = existingGroupId
      ? await this.prisma.contactGroup.findUniqueOrThrow({ where: { id: existingGroupId } })
      : await this.prisma.contactGroup.upsert({
          where: { name: groupName },
          create: { name: groupName },
          update: {},
        });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Coleta as linhas válidas primeiro (eachRow é síncrono), processa upserts depois em sequência
    const rows: { rowNumber: number; name: string; phone: string; email?: string }[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // assume cabeçalho na primeira linha

      const name = String(row.getCell(1).value ?? '').trim();
      const phoneRaw = String(row.getCell(2).value ?? '').trim();
      const email = String(row.getCell(3).value ?? '').trim() || undefined;

      if (!name || !phoneRaw) {
        skipped += 1;
        return;
      }

      const phone = this.normalizePhone(phoneRaw);
      if (!phone) {
        skipped += 1;
        errors.push(`Linha ${rowNumber}: telefone inválido (${phoneRaw})`);
        return;
      }

      rows.push({ rowNumber, name, phone, email });
    });

    for (const row of rows) {
      try {
        await this.prisma.contact.upsert({
          where: { phone_groupId: { phone: row.phone, groupId: group.id } },
          create: { name: row.name, phone: row.phone, email: row.email, groupId: group.id },
          update: { name: row.name, email: row.email },
        });
        imported += 1;
      } catch (err: any) {
        skipped += 1;
        errors.push(`Linha ${row.rowNumber}: ${err.message}`);
      }
    }

    return { groupId: group.id, imported, skipped, errors };
  }
}
