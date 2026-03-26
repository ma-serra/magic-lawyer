# Gestão de Variáveis de Ambiente

## Objetivo

Evitar que o `.env` vire um repositório de chaves soltas e difíceis de manter conforme o produto cresce.

## Convenção aplicada

- `.env.example` é a **fonte única** de template.
- Agrupar por domínio (CORE, PAGAMENTOS, INTEGRAÇÕES, etc).
- Cada variável nova deve ficar em:
  1. bloco de domínio correto;
  2. com comentário objetivo;
  3. com valor padrão seguro (ou vazio) para ambientes opcionais.
- Segredo real **nunca** no `.env.example`.

## Estrutura padrão

- **CORE**
  - `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
  - `DATABASE_URL`, `REDIS_URL`
- **APP / Session**
  - `FIRST_ACCESS_TOKEN_SECRET`, `INTERNAL_API_TOKEN`, `INTERNAL_ADMIN_TOKEN`
- **Realtime / Notificações**
  - `ABLY_API_KEY`, `NEXT_PUBLIC_ABLY_CLIENT_KEY`, `REALTIME_*`
- **Pagamentos**
  - `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `CRON_SECRET`
- **Storage / Upload**
  - `CLOUDINARY_*`, `CERT_ENCRYPTION_KEY`
- **Integrações Jurídicas**
  - `COMUNICA_*`, `GOOGLE_*`, `CLICKSIGN_*`
- **Infra / Operação**
  - `POLLING_CONTROL_*`, `POLLING_LOAD_*`, `LOG_SILENT`, `TEST_MODE`

## Regra para novos módulos

Antes de adicionar qualquer novo conjunto de variáveis:
1. Verificar se já existe variável de configuração do módulo no `.env.example`;
2. Se não existir, adicionar novo bloco no `.env.example`;
3. Documentar comportamento padrão e impacto em `docs/` (setup do recurso).

## Boas práticas

- Mantenha `.env` apenas com valores locais.
- Não versionar `.env` com segredos.
- Para ambientes locais, usar:
  - `.env.local` (se necessário em scripts específicos)
  - `.env` apenas para desenvolvimento ativo.

## Exceção para testes de carga

Variáveis de teste (`POLLING_LOAD_*`) ficam sob seção específica de operação e devem ficar comentadas ou ausentes em produção.
