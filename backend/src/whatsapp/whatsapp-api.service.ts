import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface SendTemplateParams {
  phoneNumberId: string;
  toPhoneE164: string;
  templateName: string;
  language: string;
  bodyParams?: string[];
}

export interface SendTemplateResult {
  metaMessageId: string;
}

@Injectable()
export class WhatsappApiService {
  private readonly logger = new Logger(WhatsappApiService.name);
  private readonly client: AxiosInstance;
  private readonly apiVersion: string;

  constructor() {
    this.apiVersion = process.env.META_API_VERSION || 'v20.0';
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN || ''}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  async sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult> {
    const components = params.bodyParams?.length
      ? [
          {
            type: 'body',
            parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
          },
        ]
      : undefined;

    const payload = {
      messaging_product: 'whatsapp',
      to: params.toPhoneE164,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.language },
        ...(components ? { components } : {}),
      },
    };

    const { data } = await this.client.post(`/${params.phoneNumberId}/messages`, payload);
    const metaMessageId = data?.messages?.[0]?.id;
    if (!metaMessageId) {
      this.logger.error(`Resposta inesperada da Meta ao enviar mensagem: ${JSON.stringify(data)}`);
      throw new Error('Meta não retornou um id de mensagem (wamid)');
    }
    return { metaMessageId };
  }

  async fetchMessageTemplates(wabaId: string) {
    const { data } = await this.client.get(`/${wabaId}/message_templates`, {
      params: { limit: 200 },
    });
    return data?.data ?? [];
  }
}
