import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  findGroups() {
    return this.prisma.contactGroup.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createGroup(name: string, description?: string) {
    return this.prisma.contactGroup.create({ data: { name, description } });
  }

  findContactsByGroup(groupId: string) {
    return this.prisma.contact.findMany({ where: { groupId }, orderBy: { name: 'asc' } });
  }
}
