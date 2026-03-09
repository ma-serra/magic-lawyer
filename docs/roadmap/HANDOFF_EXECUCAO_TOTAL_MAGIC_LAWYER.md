# Handoff Master - Execução Total do Magic Lawyer

## 1. Objetivo deste documento
Este documento foi criado para permitir continuidade imediata do projeto em outro motor/assistente sem perda de contexto.

Ele consolida:
- o que já foi implementado,
- o que está funcional hoje,
- o que está pendente para visão de produto "imparável",
- o plano técnico completo para executar as próximas integrações (JusBrasil, ClickSign multi-tenant, WhatsApp/Telegram/SMS),
- e a sequência prática de execução (arquitetura, banco, backend, frontend, testes, rollout).

---

## 2. Snapshot atual (data de referência)
Data de referência do handoff: **2026-03-08**.

Estado geral estimado:
- **Sistema geral (produto como SaaS jurídico): ~80%**
- **Escopo avançado omnichannel + integrações externas estratégicas: ~60-65%**

Principais blocos já existentes e reaproveitáveis:
- Multi-tenant robusto com tenant isolado por `tenantId`.
- Sistema de notificações com fila, preferências, templates e entregas.
- Infra Redis + BullMQ já operacional para jobs assíncronos.
- Fluxos financeiros com Asaas já avançados.
- Configuração de credenciais de email por tenant.
- Base de suporte/chat já funcional.
- Módulo INPI com busca em background e histórico.
- Módulos jurídicos principais com estrutura madura (processos, andamentos, contratos, procurações etc.).

---

## 3. Registro resumido do que foi trabalhado nesta jornada

## 3.1. Frontend/UX padronizado em múltiplos módulos
- Padronização visual ampla com `PeoplePageHeader`, `PeoplePanel`, `PeopleMetricCard`.
- Vários ajustes de consistência visual entre módulos.
- Ajustes de interação (cards pressáveis, modais, filtros, tabs, navegação).

## 3.2. Estabilidade React/HeroUI
- Correção de erros de hidratação em cenários de:
  - `<button>` dentro de `<button>`,
  - `<a>` dentro de `<a>`,
  - ordem de hooks inconsistente.
- Ajustes no padrão de `Select` HeroUI com `selectedKeys` válidos + `textValue`.
- Adoção/expansão de componentes de data da HeroUI.

## 3.3. Módulos jurídicos e operacionais
- Melhorias relevantes em:
  - Advogados (detalhamento e relações),
  - Clientes (consistência de hooks e visual),
  - Processos (filtros, views, importação, formulários),
  - Andamentos (status/resolução/reabertura),
  - Procurações e Modelos,
  - Contratos e Modelos de contrato,
  - Documentos e anexos.

## 3.4. Causas oficiais
- Fluxo de sincronização oficial com proteção de rate-limit e lock.
- Ajustes de fallback e comportamento de sincronização por escopo.
- Evolução de UX com leitura de conteúdo longo via modal.

## 3.5. Juízes
- Evolução para visão operacional/admin.
- Vinculação com processos e filtros.
- Ajustes de regra de negócio multi-tenant.

## 3.6. INPI
- Módulo com busca oficial em background.
- Histórico e detalhamento de resultados.
- Melhorias progressivas de UX e monitoramento de execução.

## 3.7. Agenda e Tarefas
- Melhorias de filtro/consistência e revisão de regras.
- Reestruturação de Tarefas (lista/kanban com foco em contexto).

## 3.8. Financeiro
- Grande revisão estrutural (rotas, semântica, consistência de navegação).
- Reorganização para clareza de domínio.

## 3.9. Suporte (global + tenant)
- Chat/ticket em tempo real com evolução de UX.
- Fluxos de atribuição, notificação, finalização e controle.
- Melhoria contínua de comportamento multi-janela e visibilidade.

## 3.10. Configurações do escritório
- Consolidado em modelo de tela única por abas.
- Revisão de branding/email/certificados/tribunais/tipos etc.

## 3.11. Entrega recente: landing comercial + leads
Implementado recentemente:
- Landing `/precos` em formato mais comercial.
- Matriz pública Plano x Módulo.
- Chat de captação com fluxo guiado.
- Novo módulo admin de leads com funil e detalhamento.

Arquivos principais da entrega recente:
- `app/(public)/precos/page.tsx`
- `app/(public)/precos/precos-content.tsx`
- `app/actions/leads.ts`
- `app/admin/leads/page.tsx`
- `app/admin/leads/leads-content.tsx`
- `app/hooks/use-admin-navigation.ts`
- `components/app-sidebar.tsx`
- `components/public-navbar.tsx`
- `config/site.ts`
- `prisma/schema.prisma`

---

## 4. O que já existe e permite avançar rápido no escopo novo

## 4.1. Sistema de notificação pronto para expansão de canais
Já existe:
- `Notification`, `NotificationDelivery`, `NotificationPreference`, `NotificationTemplate`.
- canais atuais: `REALTIME`, `EMAIL`, `PUSH`.
- fluxo de dispatch via `NotificationService` com delivery por canal.

Arquivos base:
- `app/lib/notifications/notification-service.ts`
- `prisma/schema.prisma` (bloco Notification)

## 4.2. Infra assíncrona pronta
Já existe:
- BullMQ + Redis para jobs de notificação e outros workers.
- padrões de lock, deduplicação e progresso para tarefas longas.

Arquivos base:
- `app/lib/notifications/notification-queue.ts`
- `app/lib/notifications/redis-singleton.ts`
- `app/lib/notifications/notification-worker.ts`

## 4.3. Email multi-tenant já maduro
Já existe:
- credencial por tenant (`TenantEmailCredential`),
- ações para CRUD/teste de credenciais,
- envio per-tenant.

Arquivos base:
- `app/actions/tenant-email-credentials.ts`
- `app/lib/email-service.ts`
- `prisma/schema.prisma` (`TenantEmailCredential`)

## 4.4. Padrão de webhook robusto
Já existe:
- webhook Asaas com validação, resolução de tenant, idempotência e atualização de estado.

Arquivo base:
- `app/api/webhooks/asaas/route.ts`

## 4.5. ClickSign já existe, mas ainda global
Já existe:
- integração funcional em `app/lib/clicksign.ts`,
- uso em `app/lib/documento-assinatura.ts`.

Gap:
- token ainda global via env (`CLICKSIGN_ACCESS_TOKEN`) e não por tenant.

---

## 5. Grandes pendências para visão "100%" de produto

## 5.1. JusBrasil
- Não integrado ainda.
- Precisa estratégia de ingestion segura (API oficial contratada, compliance de uso, limites e cache).

## 5.2. ClickSign multi-tenant
- Hoje token/config está global.
- Precisa configuração por tenant com validação, criptografia, teste e fallback.

## 5.3. Canais WhatsApp / Telegram / SMS
- Não implementados como canais do `NotificationService`.
- Necessário:
  - abstração de provedores por tenant,
  - rastreabilidade por mensagem/entrega,
  - opt-in/opt-out e política anti-spam,
  - fallback de canal.

## 5.4. Comunicação bidirecional
Dois níveis:
- Magic Lawyer -> tenants (avisos de sistema, cobrança, incidentes, campanhas institucionais).
- Tenant -> clientes (cobrança, lembrete, aniversário, atualização de processo etc.).

---

## 6. Arquitetura alvo para as próximas integrações

## 6.1. Princípio
Não criar implementação isolada por módulo.
Centralizar tudo em um **Orquestrador Omnichannel Multi-tenant**.

## 6.2. Modelagem sugerida (Prisma)
Adicionar entidades (nomes sugeridos):

1. `TenantChannelProvider`
- `tenantId`
- `channel` (`EMAIL`, `WHATSAPP`, `TELEGRAM`, `SMS`)
- `provider` (ex.: `RESEND`, `META`, `EVOLUTION`, `TWILIO`, `TELEGRAM_BOT`)
- `credentialsEncrypted` (Json criptografado)
- `active`
- `lastValidatedAt`
- `healthStatus`

2. `TenantChannelTemplate`
- `tenantId`
- `channel`
- `slug`
- `title`
- `body`
- `variables`
- `active`

3. `MessageThread`
- `tenantId`
- `entityType` (`CLIENTE`, `USUARIO`, `TICKET`, `LEAD`)
- `entityId`
- `subject`
- `status`

4. `Message`
- `threadId`
- `direction` (`OUTBOUND`, `INBOUND`)
- `channel`
- `body`
- `metadata`
- `sentAt`

5. `MessageDelivery`
- `messageId`
- `provider`
- `providerMessageId`
- `status` (`PENDING`, `SENT`, `DELIVERED`, `FAILED`, `READ`)
- `errorCode`
- `errorMessage`

6. `CommunicationAutomationRule`
- `tenantId`
- `eventType` (`COBRANCA_VENCIMENTO`, `ANIVERSARIO_CLIENTE`, `PRAZO_CRITICO`)
- `channelPriority` (array)
- `templateId`
- `active`
- `quietHoursPolicy`

7. `ClicksignTenantConfig`
- `tenantId` unique
- `apiBase`
- `accessTokenEncrypted`
- `ambiente`
- `integracaoAtiva`
- `ultimaValidacao`

8. `JusbrasilTenantConfig` (se houver credencial por tenant)
- `tenantId` unique
- `apiKeyEncrypted`
- `endpointBase`
- `integracaoAtiva`
- `ultimaValidacao`

## 6.3. Segurança obrigatória
- Segredos criptografados em banco.
- Rotação de credencial.
- Masking de dados sensíveis em logs.
- auditoria de alterações de configuração.
- rate-limit por tenant/canal.
- anti-flood por destinatário.

---

## 7. Roadmap faseado de execução (ordem recomendada)

## Fase 0 - Congelamento e baseline
Objetivo:
- estabilizar branch antes da próxima onda.

Checklist:
- [ ] consolidar commits pendentes.
- [ ] gerar snapshot de schema e actions atuais.
- [ ] validar build e testes atuais.

## Fase 1 - Infra omnichannel mínima
Objetivo:
- preparar base técnica multi-tenant para canais.

Entregas:
- [ ] migration Prisma dos modelos de provider/thread/message/delivery.
- [ ] criptografia e validação de credenciais por tenant.
- [ ] CRUD admin/tenant para configurações de canal.

## Fase 2 - Expandir NotificationChannel
Objetivo:
- plugar novos canais no motor existente.

Entregas:
- [ ] incluir `WHATSAPP`, `TELEGRAM`, `SMS` em enum de canal.
- [ ] adaptar `NotificationService.processChannelDelivery`.
- [ ] registrar `provider` e `providerMessageId`.

## Fase 3 - Adaptadores de canal
Objetivo:
- implementação concreta por canal com contrato único.

Entregas:
- [ ] `WhatsappChannel` (primeiro provider oficial escolhido).
- [ ] `TelegramChannel`.
- [ ] `SmsChannel`.
- [ ] retry policy + circuit breaker por provider.

## Fase 4 - UX de configuração por tenant
Objetivo:
- tenant configurar suas credenciais com segurança.

Entregas:
- [ ] aba Comunicação em Configurações.
- [ ] teste de conexão por canal.
- [ ] status operacional por canal (ativo/inativo/erro).

## Fase 5 - Magic Lawyer -> Tenants
Objetivo:
- canal institucional da plataforma.

Entregas:
- [ ] tela super-admin para campanhas operacionais.
- [ ] segmentação por status de assinatura/plano.
- [ ] envio por canal prioritário e fallback.
- [ ] auditoria completa de envios.

## Fase 6 - Tenant -> Clientes
Objetivo:
- comunicação de negócio do escritório com cliente final.

Entregas:
- [ ] central de comunicação do tenant.
- [ ] templates por evento (cobrança, lembretes, aniversários, status de processo).
- [ ] inbox/thread por cliente.
- [ ] opt-out por canal.

## Fase 7 - ClickSign multi-tenant
Objetivo:
- remover dependência global de env.

Entregas:
- [ ] `ClicksignTenantConfig`.
- [ ] actions de configuração por tenant.
- [ ] troca de `app/lib/clicksign.ts` para resolver credencial por tenant.
- [ ] teste E2E assinatura em tenant A e tenant B com credenciais distintas.

## Fase 8 - JusBrasil
Objetivo:
- ingestão oficial de dados (com contrato/API).

Entregas:
- [ ] cliente oficial JusBrasil.
- [ ] normalização de payload e persistência.
- [ ] cache + throttling + fila.
- [ ] rastreabilidade de origem e timestamp dos dados.

## Fase 9 - Observabilidade/SRE
Objetivo:
- evitar cegueira operacional.

Entregas:
- [ ] painel de health por canal/provider.
- [ ] métricas de entrega, erro e latência.
- [ ] alertas para falhas massivas.
- [ ] SLA interno por fluxo de comunicação.

## Fase 10 - Billing e monetização
Objetivo:
- transformar comunicação avançada em pacote vendável.

Entregas:
- [ ] limites por plano (mensagens/mês, canais habilitados).
- [ ] cobrança por excedente.
- [ ] visão de consumo por tenant.

---

## 8. Checklist de implementação técnica (detalhe)

## 8.1. Banco e migrations
- [ ] criar migration com novos modelos.
- [ ] criar índices compostos de performance:
  - `tenantId + channel + createdAt`,
  - `providerMessageId`,
  - `status + createdAt`.
- [ ] revisar cascatas para evitar órfãos.

## 8.2. Backend
- [ ] criar `app/actions/comunicacao.ts` (ou domínio equivalente).
- [ ] criar `app/lib/channels/` com adaptadores.
- [ ] criar camada `ProviderResolver` por tenant/canal.
- [ ] criar webhook endpoints por provider.

## 8.3. Frontend
- [ ] configurar UI de canal por tenant.
- [ ] central de mensagens (threads + timeline + status de entrega).
- [ ] envio manual e envio por automação.

## 8.4. Auditoria
- [ ] toda mudança de credencial/config precisa log.
- [ ] toda campanha/disparo precisa log.
- [ ] toda falha crítica precisa evento de observabilidade.

## 8.5. LGPD e compliance
- [ ] campo de consentimento por canal para contatos.
- [ ] campo `optOutAt` por canal.
- [ ] política de retenção de mensagens.
- [ ] anonimização em export e logs.

---

## 9. Estratégia de testes (obrigatória)

## 9.1. Unit
- [ ] validação de templates/variáveis.
- [ ] roteamento de canal por prioridade.
- [ ] fallback e retry policy.

## 9.2. Integration
- [ ] mock de provider com cenários de falha.
- [ ] webhook idempotente.
- [ ] deduplicação por `providerMessageId`.

## 9.3. E2E
- [ ] tenant A e tenant B com credenciais diferentes.
- [ ] disparo evento -> entrega canal correto.
- [ ] queda de provider -> fallback para outro canal.
- [ ] leitura de status em UI sem vazamento cross-tenant.

---

## 10. Definição de pronto (DoD) para o novo escopo

Só considerar "100%" quando:
- [ ] ClickSign multi-tenant em produção validado.
- [ ] pelo menos 2 novos canais de comunicação ativos (ex.: WhatsApp + Telegram, ou WhatsApp + SMS).
- [ ] canal institucional Magic Lawyer -> Tenants ativo.
- [ ] canal tenant -> clientes ativo com trilha e consentimento.
- [ ] JusBrasil integrado (ou milestone contratual técnica pronta para ativar).
- [ ] monitoramento e alertas operacionais ativos.
- [ ] documentação operacional e playbooks de suporte finalizados.

---

## 11. Riscos e mitigação

Riscos principais:
1. Bloqueio/limite de API externa.
2. Vazamento de dados por falha de isolamento.
3. Spam/ban por envio sem controle.
4. Crescimento de custo de mensageria sem governança.

Mitigação:
1. fila + rate-limit + cache + retry com backoff.
2. contratos de acesso por tenant e testes de isolamento.
3. opt-in/opt-out + janela de silêncio + limite diário.
4. quotas por plano e alertas de consumo.

---

## 12. Ordem de leitura para novo motor/assistente
Antes de codar, ler nesta ordem:

1. `docs/roadmap/HANDOFF_EXECUCAO_TOTAL_MAGIC_LAWYER.md` (este documento)
2. `prisma/schema.prisma`
3. `app/lib/notifications/notification-service.ts`
4. `app/actions/tenant-email-credentials.ts`
5. `app/lib/email-service.ts`
6. `app/lib/clicksign.ts`
7. `app/lib/documento-assinatura.ts`
8. `app/api/webhooks/asaas/route.ts`
9. `app/(public)/precos/precos-content.tsx`
10. `app/admin/leads/leads-content.tsx`

---

## 13. Comandos operacionais para retomar execução local

Pré-requisitos:
- Docker rodando.
- Redis local.
- `.env` válido.

Sequência recomendada:

```bash
# 1) Banco e redis
npm run db:up
redis-server --daemonize no

# 2) Prisma
npx prisma generate
npx prisma db push

# 3) App
PORT=9192 npx next dev --turbopack

# 4) Validação
npx tsc --noEmit
npm test -- --runInBand
```

---

## 14. Próximo ciclo recomendado (curto prazo)
Sprint sugerida (primeiros 7-10 dias):

1. ClickSign multi-tenant.
2. Canais `WHATSAPP` e `TELEGRAM` na arquitetura de notificação.
3. Tela de configuração por tenant para canais.
4. Automação de cobrança e lembrete por canal.
5. E2E com dois tenants e isolamento completo.

---

## 15. Conclusão
O Magic Lawyer já tem base técnica suficiente para virar plataforma jurídica omnichannel em nível alto.
O que falta não é "refazer sistema", e sim completar integrações estratégicas com disciplina de produto:
- multi-tenant real,
- segurança,
- observabilidade,
- e operação comercial escalável.

Este documento é a trilha oficial para executar isso de ponta a ponta em outro motor.

