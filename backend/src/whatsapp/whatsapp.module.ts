import { Module } from '@nestjs/common';
import { WhatsappApiService } from './whatsapp-api.service';
import { EvolutionApiService } from './evolution-api.service';
import { WebhooksController } from './webhooks.controller';
import { DispatchQueueService } from './dispatch-queue.service';

@Module({
  controllers: [WebhooksController],
  providers: [WhatsappApiService, EvolutionApiService, DispatchQueueService],
  exports: [WhatsappApiService, EvolutionApiService, DispatchQueueService],
})
export class WhatsappModule {}
