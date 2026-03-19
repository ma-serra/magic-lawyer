# Telegram Global da Plataforma

## Decisão

O Magic Lawyer deve operar com **um bot global da plataforma** no Telegram.

Nome recomendado:
- `Magic Radar`

Username sugerido:
- `@magicradarbot`
- alternativas: `@magiclawyerbot`, `@magicprazosbot`

Regra de produto:
- o padrão é **bot global**
- bot por tenant fica como **override opcional** para enterprise/white-label

## O que já ficou pronto no código

- fallback global por env para Telegram
- vínculo do usuário continua multi-tenant (`tenantId + userId`)
- envio continua isolado por tenant, mesmo usando um bot global
- painel admin do tenant já reconhece fallback global
- perfil do usuário já mostra corretamente quando o bot é global

## Variáveis de ambiente

Adicionar no ambiente:

```env
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_BOT_USERNAME=@magicradarbot
TELEGRAM_BOT_DISPLAY_NAME=Magic Radar
```

## Passo a passo no BotFather

1. Abra o Telegram e procure por `@BotFather`
2. Envie `/newbot`
3. Defina o nome:
   `Magic Radar`
4. Defina o username:
   `magicradarbot`
5. Copie o token gerado pelo BotFather
6. Envie `/setdescription`
7. Escreva uma descrição curta:
   `Alertas críticos, prazos e atualizações processuais do Magic Lawyer.`
8. Envie `/setuserpic`
9. Suba um avatar simples da plataforma
10. Envie `/setcommands`

Use esta lista:

```text
start - Conectar sua conta do Magic Lawyer
help - Ver ajuda rápida
status - Ver status do vínculo atual
```

## Como finalizar no Magic Lawyer

1. Cadastre no ambiente de produção:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=@magicradarbot
TELEGRAM_BOT_DISPLAY_NAME=Magic Radar
```

2. Faça um deploy
3. Entre no sistema com um usuário advogado
4. Vá em `Perfil`
5. Clique em `Conectar Telegram`
6. Clique em `Abrir bot no Telegram`
7. Envie o comando `/start ml_notify_XXXX`
8. Volte ao sistema
9. Clique em `Confirmar conexão`

## Como validar

Checklist:
- o perfil deve mostrar `Conectado`
- a origem do bot deve aparecer como `Bot global da plataforma`
- o vínculo deve gravar `telegramChatId` no usuário
- uma notificação crítica deve gerar delivery `TELEGRAM`
- o tenant não deve precisar configurar bot próprio

## Quando usar bot por tenant

Só faz sentido em:
- contrato enterprise com white-label extremo
- operação com identidade própria do escritório
- necessidade de inbox separado por cliente grande

Fora disso, manter **um bot global** é a escolha correta.
