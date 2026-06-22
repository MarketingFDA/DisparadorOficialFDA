import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NumbersController } from './numbers.controller';
import { NumbersService } from './numbers.service';

@Module({
  imports: [WhatsappModule],
  controllers: [NumbersController],
  providers: [NumbersService],
})
export class NumbersModule {}
