import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface SendTextParams {
  instanceName: string;
  toPhoneE164: string;
  text: string;
}

export interface SendTextResult {
  externalMessageId: string;
}

// Cliente para a Evolution API (WhatsApp não-oficial, via Baileys).
// Diferente da Meta Cloud API: roda numa instância própria (ex: Docker local
// exposto por túnel) configurada em EVOLUTION_API_URL/EVOLUTION_API_KEY.
// Ver EVOLUTION_SETUP.md para detalhes de configuração e riscos.
@Injectable()
export class EvolutionApiService {
  private readonly logger = new Logger(EvolutionApiService.name);
  private readonly client: AxiosInstance | null;

  constructor() {
    const baseURL = process.env.EVOLUTION_API_URL;
    const apikey = process.env.EVOLUTION_API_KEY;
    this.client = baseURL
      ? axios.create({
          baseURL,
          headers: { apikey: apikey || '' },
          timeout: 15000,
        })
      : null;
  }

  async sendText(params: SendTextParams): Promise<SendTextResult> {
    if (!this.client) {
      throw new Error(
        'EVOLUTION_API_URL não configurada no backend — ver EVOLUTION_SETUP.md',
      );
    }

    const { data } = await this.client.post(`/message/sendText/${params.instanceName}`, {
      number: params.toPhoneE164,
      text: params.text,
    });

    const externalMessageId = data?.key?.id;
    if (!externalMessageId) {
      this.logger.error(`Resposta inesperada da Evolution API ao enviar mensagem: ${JSON.stringify(data)}`);
      throw new Error('Evolution API não retornou um id de mensagem');
    }
    return { externalMessageId };
  }
}
