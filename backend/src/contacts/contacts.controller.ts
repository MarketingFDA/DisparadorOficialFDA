import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContactsService } from './contacts.service';
import { ImportService } from './import.service';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly importService: ImportService,
  ) {}

  @Get('groups')
  findGroups() {
    return this.contactsService.findGroups();
  }

  @Post('groups')
  createGroup(@Body('name') name: string, @Body('description') description?: string) {
    return this.contactsService.createGroup(name, description);
  }

  @Get('groups/:id')
  findContactsByGroup(@Param('id') id: string) {
    return this.contactsService.findContactsByGroup(id);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Body('groupName') groupName: string,
    @Body('groupId') groupId?: string,
  ) {
    return this.importService.importFromXlsx(file.buffer, groupName, groupId);
  }
}
