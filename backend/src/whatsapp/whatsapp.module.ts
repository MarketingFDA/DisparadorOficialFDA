import { Module } from '@nestjs/common';
import { WhatsappApiService } from './whatsapp-api.service';
import { WebhooksController } from './webhooks.controller';
import { DispatchQueueService } from './dispatch-queue.service';

@Module({
  controllers: [WebhooksController],
  providers: [WhatsappApiService, DispatchQueueService],
  exports: [WhatsappApiService, DispatchQueueService],
})
export class WhatsappModule {}
