import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { NumbersService } from './numbers.service';
import type { CreateNumberInput } from './numbers.service';

@Controller('numbers')
export class NumbersController {
  constructor(private readonly numbersService: NumbersService) {}

  @Get()
  findAll() {
    return this.numbersService.findAll();
  }

  @Post()
  create(@Body() body: CreateNumberInput) {
    return this.numbersService.create(body);
  }

  @Get(':id/qrcode')
  getQrCode(@Param('id') id: string) {
    return this.numbersService.getQrCode(id);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.numbersService.getConnectionState(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.numbersService.remove(id);
  }
}
