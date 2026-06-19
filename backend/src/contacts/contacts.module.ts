import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ImportService } from './import.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, ImportService],
})
export class ContactsModule {}
