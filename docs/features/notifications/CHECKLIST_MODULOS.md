# ✅ Checklist de Notificações por Módulo

Este documento rastreia quais eventos de notificação já estão implementados em cada módulo do sistema.

**Última atualização:** 01/11/2024

---

## 📋 Processos

### Eventos Implementados ✅
- [x] `processo.created` - Notifica quando processo é criado
- [x] `processo.updated` - Notifica quando processo é atualizado
- [x] `processo.status_changed` - Notifica mudança de status
- [x] `processo.document_uploaded` - Notifica quando documento é anexado ao processo

### Onde está implementado:
- **Server Actions:**
  - `app/actions/processos.ts` (criação, atualização, mudança de status)
  - `app/actions/documentos-explorer.ts` (upload de documento → `processo.document_uploaded`)
  - `app/actions/upload-documento-peticao.ts` (upload de petição → `processo.document_uploaded`)
- **Integração:** Sistema híbrido (notificações via `HybridNotificationService`)

### Status:
✅ **COMPLETO** - Todos os eventos de processo implementados

---

## ⏰ Prazos

### Eventos Implementados ✅
- [x] `prazo.created` - Notifica quando prazo é criado
- [x] `prazo.expiring_7d` - Notifica 7 dias antes do vencimento
- [x] `prazo.expiring_3d` - Notifica 3 dias antes do vencimento
- [x] `prazo.expiring_1d` - Notifica 1 dia antes do vencimento
- [x] `prazo.expiring_2h` - Notifica 2 horas antes do vencimento
- [x] `prazo.expired` - Notifica quando prazo venceu

### Onde está implementado:
- **Server Action:** `app/actions/andamentos.ts` (criação)
- **Cron Job:** `app/api/cron/check-deadlines/route.ts`
- **Serviço:** `app/lib/notifications/services/deadline-scheduler.ts`

### Status:
✅ **COMPLETO** - Todos os eventos de prazo estão implementados e funcionando via cron de 15 em 15 minutos

---

## 💰 Financeiro

### Eventos Implementados ✅
- [x] `pagamento.created` - Notifica quando pagamento é criado
- [x] `pagamento.paid` - Notifica quando pagamento é confirmado
- [x] `pagamento.failed` - Notifica quando pagamento falha
- [x] `pagamento.overdue` - Notifica quando pagamento está em atraso
- [x] `pagamento.estornado` - Notifica quando pagamento é estornado
- [x] `boleto.generated` - Notifica quando boleto é gerado
- [x] `pix.generated` - Notifica quando PIX é gerado

### Onde está implementado:
- **Server Action:** `app/actions/cobranca-asaas.ts` (geração de boleto/PIX)
- **Webhook:** `app/api/webhooks/asaas/route.ts`
- **Serviço:** `app/lib/notifications/services/asaas-webhook.ts`

### Eventos do Webhook Asaas Mapeados:
- ✅ `PAYMENT_CREATED` → `boleto.generated` / `pix.generated` / `pagamento.created`
- ✅ `PAYMENT_CONFIRMED` → `pagamento.paid`
- ✅ `PAYMENT_RECEIVED` → `pagamento.paid`
- ✅ `PAYMENT_OVERDUE` → `pagamento.overdue`
- ✅ `PAYMENT_UPDATED` (REPROVED_BY_RISK_ANALYSIS) → `pagamento.failed`
- ✅ `PAYMENT_UPDATED` (CHARGEBACK_DISPUTE_LOST) → `pagamento.failed`
- ✅ `PAYMENT_REFUNDED` → `pagamento.estornado`

### Status:
✅ **COMPLETO** - Todos os eventos críticos do Asaas estão mapeados e funcionando

---

## 📝 Contratos

### Eventos Implementados ✅
- [x] `contrato.created` - Notifica quando contrato é criado
- [x] `contrato.signed` - Notifica quando contrato é assinado (status → ATIVO)
- [x] `contrato.expired` - Notifica quando contrato expira
- [x] `contrato.expiring` - Notifica quando contrato está próximo do vencimento (7 dias)
- [x] `contrato.cancelled` - Notifica quando contrato é cancelado
- [x] `contrato.status_changed` - Notifica mudanças gerais de status

### Onde está implementado:
- **Server Action:** `app/actions/contratos.ts` (criação e atualização manual)
- **Cron Job:** `app/api/cron/check-contracts/route.ts`
- **Serviço:** `app/lib/notifications/services/contrato-scheduler.ts`

### Status:
✅ **COMPLETO** - Eventos manuais e automáticos (cron diário) implementados

---

## 📅 Agenda

### Eventos Implementados ✅
- [x] `evento.created` - Notifica quando evento é criado
- [x] `evento.updated` - Notifica quando evento é atualizado
- [x] `evento.cancelled` - Notifica quando evento é cancelado
- [x] `evento.confirmation_updated` - Notifica quando confirmação é atualizada
- [x] `evento.reminder_1d` - Lembrete automático 1 dia antes do evento
- [x] `evento.reminder_1h` - Lembrete automático 1 hora antes do evento

### Onde está implementado:
- **Server Action:** `app/actions/eventos.ts` (criação, atualização, cancelamento)
- **Cron Job:** `app/api/cron/check-event-reminders/route.ts` (executa a cada 15min)
- **Serviço:** `app/lib/notifications/services/event-reminder-scheduler.ts`

### Status:
✅ **COMPLETO** - Todos os eventos de agenda implementados, incluindo lembretes automáticos

---

## 📄 Documentos

### Eventos Implementados ✅
- [x] `documento.uploaded` - Notifica equipe e responsáveis quando documentos são enviados (explorer, cliente, petição, procuração)
- [x] `documento.approved` - Notifica quando documento é aprovado/assinado via assinatura digital
- [x] `documento.rejected` - Notifica quando documento é rejeitado ou assinatura cancelada
- [x] `documento.expired` - Notifica quando documento/assinatura expira (verificação diária via cron)

### Onde está implementado:
- **Server Actions:**
  - `app/actions/documentos-explorer.ts` (upload)
  - `app/actions/clientes.ts` (upload)
  - `app/actions/upload-documento-peticao.ts` (upload)
  - `app/actions/documentos-procuracao.ts` (upload)
- **Integração Assinaturas:**
  - `app/lib/documento-assinatura.ts` (approved/rejected quando status muda)
  - `app/actions/assinaturas.ts` (cancelamento de assinatura)
- **Cron Job:** `app/api/cron/check-documents/route.ts` (verificação diária às 10:00 UTC)
- **Serviço:** `app/lib/notifications/services/document-scheduler.ts`
- **Helper:** `DocumentNotifier` com métodos `notifyUploaded`, `notifyApproved`, `notifyRejected`, `notifyExpired`

### Status:
✅ **COMPLETO** - Todos os eventos de documentos implementados com workflow de assinatura integrado

---

## 👥 Equipe

### Eventos Implementados ✅
- [x] `equipe.user_invited` - Notifica administração quando novos convites são emitidos
- [x] `equipe.user_joined` - Notifica a entrada de novos membros que aceitaram convites
- [x] `equipe.permissions_changed` - Notifica alterações manuais de permissões individuais
- [x] `equipe.user_removed` - Notifica quando usuário é removido/inativado da equipe

### Onde está implementado:
- **Server Actions:**
  - `app/actions/convites-equipe.ts` (convites + aceite)
  - `app/actions/equipe.ts` (permissões individuais)
  - `app/actions/admin.ts` (remoção/inativação via `updateTenantUser`)
- **Helper:** `NotificationHelper` com todos os métodos (`notifyEquipeUserInvited`, `notifyEquipeUserJoined`, `notifyEquipePermissionsChanged`, `notifyEquipeUserRemoved`)

### Status:
✅ **COMPLETO** - Todos os eventos de equipe implementados

---

## 📊 Resumo Geral

| Módulo | Status | Implementados | Pendentes |
|--------|--------|---------------|-----------|
| Processos | ✅ Completo | 4/4 | 0 |
| Prazos | ✅ Completo | 6/6 | 0 |
| Financeiro | ✅ Completo | 7/7 | 0 |
| Contratos | ✅ Completo | 6/6 | 0 |
| Agenda | ✅ Completo | 6/6 | 0 |
| Documentos | ✅ Completo | 4/4 | 0 |
| Equipe | ✅ Completo | 4/4 | 0 |

**Total:** 37/37 eventos implementados (100%) 🎉

---

## 🎯 Próximos Passos

1. **Prioridade Alta:**
   - ✅ Todos os eventos implementados! (100% de cobertura)
   - Revisar e validar todos os eventos com stakeholders

2. **Prioridade Média:**
   - Adicionar testes E2E para cada módulo
   - Monitorar métricas de entrega via `/api/internal/notifications/metrics`
   - Validar integração completa em ambiente de staging

3. **Prioridade Baixa:**
   - Otimizar deduplicação de lembretes de eventos
   - Adicionar dashboard de métricas na UI admin
   - Expandir cobertura de testes automatizados

## 📚 Documentação Relacionada

- [HTTP Fallback](HTTP_FALLBACK.md) - Fallback HTTP/polling quando WebSocket falha
- [Read/Unread Legado](READ_UNREAD_LEGADO.md) - Compatibilidade sistema legado/novo
- [LGPD e Consentimento](LGPD_CONSENTIMENTO.md) - Conformidade com LGPD
- [Métricas e Observabilidade](METRICS.md) - Endpoint de métricas e monitoramento
