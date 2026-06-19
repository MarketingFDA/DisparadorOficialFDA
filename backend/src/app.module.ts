import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { TemplatesModule } from './templates/templates.module';
import { ContactsModule } from './contacts/contacts.module';
import { NumbersModule } from './numbers/numbers.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    WhatsappModule,
    CampaignsModule,
    TemplatesModule,
    ContactsModule,
    NumbersModule,
    ExportModule,
  ],
})
export class AppModule {}
