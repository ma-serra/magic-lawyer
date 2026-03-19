# 🧪 Guia de Testes - Sistema de Notificações

## Testes Manuais

### 1. Testar Notificações Básicas

**Via Script:**
```bash
npm run notifications:test

# Smoke test end-to-end (inclui criação de processo, prazo, pagamento etc.)
npm run notifications:smoke

# Pacote completo (teste unitário + webhook + smoke + crons)
npm run notifications:all
```

**Via Endpoint (Desenvolvimento):**
```bash
# Criar notificação de teste diretamente via HTTP
curl "http://localhost:9192/api/test/notifications?type=processo.created&tenantId=SEU_TENANT_ID&userId=SEU_USER_ID"
```

**Tipos disponíveis para teste:**
- `processo.created`
- `prazo.expiring_7d`
- `pagamento.paid`
- `evento.created`

**Exemplo completo:**
```bash
# Usar tenantId e userId reais do seu banco de teste
curl "http://localhost:9192/api/test/notifications?type=prazo.expiring_7d&tenantId=clxxxxx&userId=userxxxxx"
```

### 2. Testar Scheduler de Prazos

**Via Cron (Produção):**
- O cron executa automaticamente a cada 15 minutos
- Verifique logs em: Vercel Dashboard → Functions → Cron Jobs

**Manual (Desenvolvimento):**
```bash
# Via script agrupado (prazos + contratos)
npm run notifications:crons

# Ou diretamente (útil para depuração)
curl -X GET "http://localhost:9192/api/cron/check-deadlines" \
  -H "Authorization: Bearer ${CRON_SECRET:-test-secret}"
```

**Ou via script:**
```typescript
// No console do Node ou script personalizado
import { DeadlineSchedulerService } from "@/app/lib/notifications/services/deadline-scheduler";
await DeadlineSchedulerService.checkExpiringDeadlines();
```

### 3. Testar Webhook Asaas

**Simulação Manual:**
```bash
npm run notifications:webhook
```

**Webhook Real:**
```bash
# Simular webhook do Asaas
curl -X POST "http://localhost:3000/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: ${ASAAS_WEBHOOK_SECRET}" \
  -d '{
    "event": "PAYMENT_CONFIRMED",
    "payment": {
      "id": "pay_real_id",
      "customer": "cus_id",
      "billingType": "BOLETO",
      "value": 10000,
      "dueDate": "2024-12-31",
      "paymentDate": "2024-12-30",
      "status": "CONFIRMED",
      "externalReference": "parcela_REAL_PARCELA_ID"
    }
  }'
```

## Checklist de Validação

### ✅ Notificações Básicas
- [ ] Evento criado via Factory sem erros
- [ ] Validação de campos obrigatórios funciona
- [ ] Preferências de canal respeitadas (exceto CRITICAL)
- [ ] Eventos CRITICAL sempre vão por REALTIME + EMAIL

### ✅ Scheduler de Prazos
- [ ] Cron executa sem erros
- [ ] Prazos D-7 são encontrados e notificados
- [ ] Prazos D-3 são encontrados e notificados
- [ ] Prazos D-1 são encontrados e notificados
- [ ] Prazos H-2 são encontrados e notificados
- [ ] Prazos vencidos são encontrados e notificados
- [ ] Duplicatas são evitadas (verificar Redis/Prisma)

### ✅ Webhook Asaas
- [ ] PAYMENT_CONFIRMED dispara `pagamento.paid`
- [ ] PAYMENT_OVERDUE dispara `pagamento.overdue`
- [ ] PAYMENT_CREATED com BOLETO dispara `boleto.generated`
- [ ] PAYMENT_CREATED com PIX dispara `pix.generated`
- [ ] ExternalReference formato `parcela_*` funciona
- [ ] ExternalReference ID direto funciona
- [ ] Fallback via `asaasPaymentId` funciona

### ✅ Canais de Entrega
- [ ] Notificações REALTIME aparecem no frontend via Ably
- [ ] Notificações EMAIL são enviadas via Nodemailer
- [ ] Status de entrega é registrado em `NotificationDelivery`

## Cenários de Teste por Tipo de Evento

### Processos
```typescript
// Criar processo
await publishNotification({
  type: "processo.created",
  tenantId: "tenant-123",
  userId: "user-456",
  payload: {
    processoId: "proc-789",
    numero: "1234567-89.2024.8.05.0001",
    clienteNome: "João Silva",
  },
});
```

### Prazos
- O scheduler automaticamente encontra e notifica prazos próximos
- Criar prazo manualmente e aguardar cron (ou executar manualmente)

### Pagamentos
- Usar webhook do Asaas ou simular via script
- Verificar se notificações são criadas para ADMIN, FINANCEIRO e CLIENTE

## Debug

### Ver Logs
```bash
# Logs do Vercel
vercel logs --follow

# Logs locais
npm run dev
# Ver console para logs de notificações
```

### Verificar Notificações no Banco
```sql
SELECT * FROM "magiclawyer"."Notification" 
WHERE "tenantId" = 'seu-tenant-id' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

### Verificar Entregas
```sql
SELECT * FROM "magiclawyer"."NotificationDelivery" 
WHERE "notificationId" IN (
  SELECT id FROM "magiclawyer"."Notification" 
  WHERE "tenantId" = 'seu-tenant-id'
)
ORDER BY "createdAt" DESC;
```

## Variáveis de Ambiente Necessárias

```bash
# Redis (para deduplicação e cache)
REDIS_URL=rediss://...

# Ably (para realtime)
ABLY_API_KEY=...
NEXT_PUBLIC_ABLY_CLIENT_KEY=...
REALTIME_INTERNAL_TOKEN=...

# Email (para envio)
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...

# Flags de recursos
NOTIFICATION_USE_NEW_SYSTEM=true

# Cron (para autenticação)
CRON_SECRET=...

# Asaas Webhook (opcional)
ASAAS_WEBHOOK_SECRET=...
```

## Troubleshooting

### Cron não executa
- Verificar `vercel.json` tem o cron configurado
- Verificar se está em ambiente de produção (crons não rodam em preview)
- Verificar logs do Vercel para erros de autenticação

### Webhook não processa
- Verificar se `externalReference` está correto
- Verificar se parcela existe no banco
- Verificar logs para erros específicos

### Notificações não aparecem
- Verificar preferências do usuário (pode estar desabilitado)
- Verificar se Ably está conectado no frontend
- Verificar logs de entrega em `NotificationDelivery`
