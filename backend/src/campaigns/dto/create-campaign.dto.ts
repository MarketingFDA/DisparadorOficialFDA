export class CreateCampaignDto {
  name: string;
  whatsAppNumberId: string;
  // Obrigatório para canal Meta Cloud API
  templateId?: string;
  // Obrigatório para canal Evolution API (texto livre, aceita {{nome}})
  messageText?: string;
  groupId: string;
}
