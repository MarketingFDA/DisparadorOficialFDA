import { Body, Controller, Get, Post } from '@nestjs/common';
import { NumbersService } from './numbers.service';

@Controller('numbers')
export class NumbersController {
  constructor(private readonly numbersService: NumbersService) {}

  @Get()
  findAll() {
    return this.numbersService.findAll();
  }

  @Post()
  create(
    @Body()
    body: { label: string; phoneNumberId: string; wabaId: string; displayNumber?: string; isTestNumber?: boolean },
  ) {
    return this.numbersService.create(body);
  }
}
