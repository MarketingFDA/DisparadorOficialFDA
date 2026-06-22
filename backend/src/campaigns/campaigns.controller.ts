import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MessageStatus } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query('q') q?: string) {
    return this.campaignsService.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Get(':id/messages')
  messages(
    @Param('id') id: string,
    @Query('status') status?: MessageStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.campaignsService.messages(id, status, page ? Number(page) : undefined, pageSize ? Number(pageSize) : undefined);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignsService.update(id, dto);
  }

  @Delete('all')
  removeAll() {
    return this.campaignsService.removeAll();
  }

  @Post('bulk-delete')
  bulkDelete(@Body('ids') ids: string[]) {
    return this.campaignsService.bulkDelete(ids);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaignsService.remove(id);
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.campaignsService.sync(id);
  }

  @Post(':id/dispatch')
  dispatch(@Param('id') id: string) {
    return this.campaignsService.dispatch(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.campaignsService.pause(id);
  }
}
