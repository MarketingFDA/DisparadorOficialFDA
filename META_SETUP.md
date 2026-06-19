# Checklist — Configuração da Meta Cloud API (WhatsApp)

Passo a passo para conectar este sistema a um número de WhatsApp via Meta Cloud API.

## 1. Business Manager

Acesse [business.facebook.com](https://business.facebook.com) e confirme que existe uma conta Business Manager da Fradema (separada da conta usada pelo VB365, se aplicável).

## 2. Meta Developer App

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps).
2. Crie um app do tipo **Business**.
3. Em "Adicionar produtos ao seu app", adicione **WhatsApp**.
4. Isso gera automaticamente um **WABA de teste** (WhatsApp Business Account) e um **número de teste grátis** — ideal para desenvolver sem mexer no número real em produção no VB365.

## 3. Coletar credenciais

No painel do app, em **WhatsApp > API Setup**:

- `Phone Number ID` (do número de teste)
- `WhatsApp Business Account ID` (WABA ID)
- Um token de acesso temporário (válido por 24h) — usar só para testes manuais iniciais.

Para um token permanente: **Business Settings > Users > System Users** → criar um System User → gerar token com permissão `whatsapp_business_messaging` (e `whatsapp_business_management` se for sincronizar templates). Esse é o `META_ACCESS_TOKEN` definitivo.

## 4. Verificar números de teste

Em **WhatsApp > API Setup > To**, adicione e verifique (via código SMS/chamada) até 5 números de telefone que vão receber as mensagens de teste durante o desenvolvimento.

## 5. Configurar o Webhook

Só depois que o backend estiver publicado no Railway (URL pública HTTPS):

1. Escolha um `META_WEBHOOK_VERIFY_TOKEN` (qualquer string secreta) e configure essa mesma string como variável de ambiente no backend.
2. No painel do app, em **WhatsApp > Configuration > Webhook**, clique em editar e informe:
   - **Callback URL**: `https://<seu-backend>.up.railway.app/webhooks/meta`
   - **Verify Token**: o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`
3. Inscreva o campo **messages** (cobre mensagens recebidas e atualizações de status: sent/delivered/read/failed).

## 6. App Secret

Em **App Settings > Basic**, copie o **App Secret** → variável `META_APP_SECRET` no backend (usado para validar a assinatura `X-Hub-Signature-256` dos webhooks recebidos).

## 7. Migração futura para o número real (produção, hoje no VB365)

Fora do escopo deste MVP. Quando chegar a hora:

- A portabilidade de número WhatsApp Business tem processo próprio na Meta (Business Verification costuma ser pré-requisito para sair do tier de testes).
- Vai existir uma janela de possível interrupção do canal — coordenar com a operação do VB365 antes de migrar.
- Depois de migrado, trocar `Phone Number ID` / `WABA ID` / `META_ACCESS_TOKEN` no backend para os do número real.
