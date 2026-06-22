export class CreateCampaignDto {
  name: string;
  whatsAppNumberId: string;
  // Obrigatório para canal Meta Cloud API
  templateId?: string;
  // Obrigatório para canal Evolution API (texto livre, aceita {{nome}})
  messageText?: string;
  groupId: string;
  // ISO 8601. Se informado, a campanha entra QUEUED e começa sozinha nesse horário.
  scheduledAt?: string;
}
