import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

const COLUMNS = ['Campanha', 'Total', 'Fila Envio', 'Enviados', 'Entregues', 'Lidos', 'Error'];

@Controller('export')
export class ExportController {
  constructor(private readonly prisma: PrismaService) {}

  private async getRows() {
    const campaigns = await this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    return campaigns.map((c) => [
      c.name,
      c.totalCount,
      c.queuedCount,
      c.sentCount,
      c.deliveredCount,
      c.readCount,
      c.errorCount,
    ]);
  }

  @Get('campaigns.csv')
  async csv(@Res() res: Response) {
    const rows = await this.getRows();
    const csv = [COLUMNS.join(','), ...rows.map((r) => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="campanhas.csv"');
    res.send(csv);
  }

  @Get('campaigns.xlsx')
  async xlsx(@Res() res: Response) {
    const rows = await this.getRows();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Campanhas');
    sheet.addRow(COLUMNS);
    rows.forEach((r) => sheet.addRow(r));
    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="campanhas.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }

  @Get('campaigns.pdf')
  async pdf(@Res() res: Response) {
    const rows = await this.getRows();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="campanhas.pdf"');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('Campanhas por WhatsApp - Disparador Fradema', { align: 'left' });
    doc.moveDown();

    const colWidth = 70;
    let y = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    COLUMNS.forEach((col, i) => doc.text(col, 40 + i * colWidth, y, { width: colWidth }));
    doc.moveDown();
    doc.font('Helvetica');

    rows.forEach((row) => {
      y = doc.y;
      row.forEach((cell, i) => doc.text(String(cell), 40 + i * colWidth, y, { width: colWidth }));
      doc.moveDown();
    });

    doc.end();
  }

  @Get('campaigns/print')
  async print(@Res() res: Response) {
    const rows = await this.getRows();
    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Campanhas - Impressão</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 13px; }
  th { background: #f5f5f5; }
</style></head>
<body>
  <h2>Campanhas por WhatsApp - Disparador Fradema</h2>
  <table>
    <thead><tr>${COLUMNS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
