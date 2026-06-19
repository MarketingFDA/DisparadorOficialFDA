import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  findAll(@Query('whatsAppNumberId') whatsAppNumberId?: string) {
    return this.templatesService.findAll(whatsAppNumberId);
  }

  @Post('sync')
  sync(@Body('whatsAppNumberId') whatsAppNumberId: string) {
    return this.templatesService.sync(whatsAppNumberId);
  }
}
