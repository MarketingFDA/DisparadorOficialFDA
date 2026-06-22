import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async removeGroup(groupId: string) {
    const group = await this.prisma.contactGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Grupo não encontrado');

    const campaignsUsingGroup = await this.prisma.campaign.count({ where: { groupId } });
    if (campaignsUsingGroup > 0) {
      throw new BadRequestException('Esse grupo tem campanhas vinculadas — remova as campanhas antes de excluir o grupo');
    }

    await this.prisma.contact.deleteMany({ where: { groupId } });
    await this.prisma.contactGroup.delete({ where: { id: groupId } });
    return { deleted: true };
  }
}
