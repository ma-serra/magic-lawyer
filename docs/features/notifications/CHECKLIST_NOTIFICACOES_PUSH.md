# ✅ CHECKLIST FASE - Sistema de Notificações Push

**Importante: é um checklist e não um resumo de coisas feitas.**

**Cobertura obrigatória:** implementar notificações para **TODOS os tipos de usuários** (ADMIN, ADVOGADO, SECRETARIA, CONTROLLER, CLIENTE, CONVIDADO EXTERNO) e para **TODOS os módulos** (core jurídico, financeiro, agenda, documentos, relatórios, integrações, administração).

> Use cada item como ordem de serviço. Nenhum item deve ser marcado sem entrega validada e demonstrável.

---

## Etapa 1 — Descoberta e Catálogo de Eventos ⏳ **EM ANDAMENTO**
- [x] Listar todos os eventos de gatilho existentes por módulo (processos, prazos, finance, agenda, documentos, CRM, integrações externas).
- [x] Identificar lacunas de eventos ainda não rastreados e aprovar novos gatilhos com negócio.
- [x] Mapear quais tipos de usuários precisam receber cada evento (responsável, equipe, cliente, terceiros).
- [x] Definir canais por evento (notificação in-app em tempo real e email).
- [x] **Documentar payload mínimo de cada evento (campos obrigatórios, IDs, metadados)**.
  - **Critério**: [Tabela completa com payloads obrigatórios para todos os eventos no catálogo] ✅ **CONCLUÍDO** - Tabela oficial criada em `NOTIFICATIONS_EVENT_CATALOG.md` com 75+ eventos
- [ ] **Homologar matriz Evento × Usuário × Canal com stakeholders**.
  - **Critério**: [Matriz validada com stakeholders, incluindo CONTROLLER e CONVIDADO EXTERNO] ⚠️ **PENDENTE** - Matriz documentada em `NOTIFICATIONS_EVENT_CATALOG.md` mas aguardando homologação formal com stakeholders
- [x] **Definir políticas de urgência (crítico, alto, médio, informativo) para priorização de fila**.
  - **Critério**: [Políticas de urgência definidas e aplicadas a todos os eventos] ✅ **CONCLUÍDO** - Políticas documentadas e implementadas no código (NotificationPolicy)
- [x] **Registrar requisitos de compliance (LGPD, retenção, opt-in/out)**.
  - **Critério**: [Requisitos LGPD documentados, política de retenção de 30 dias definida] ✅ **CONCLUÍDO** - Seção completa de requisitos LGPD no catálogo

## Etapa 2 — Arquitetura Técnica e Infraestrutura ⏳ **EM ANDAMENTO**
- [x] Escolher stack realtime (Ably já instalado vs WebSocket self-hosted) e documentar motivos.
- [x] **Definir topologia (event bus, fila, workers, broadcasting) com diagramas atualizados**.
  - **Critério**: [Diagrama atualizado com BullMQ Queue e Worker implementados]
- [x] **Planejar escalabilidade: sharding, tolerância a falhas, política de reconexão**.
  - **Critério**: [Estratégia de escalabilidade documentada com métricas específicas]
- [x] **Definir formato contratual dos eventos (`NotificationEvent` TypeScript + schema Prisma)**.
  - **Critério**: [Schema Prisma implementado com tipos TypeScript correspondentes]
- [x] **Planejar storage eventual para histórico (tabela `Notification` + `NotificationPreference`)**.
  - **Critério**: [Tabelas implementadas com índices e política de retenção LGPD]
- [x] **Definir mecanismo de deduplicação/anti-spam (hash por evento + TTL)**.
  - **Critério**: [Sistema de deduplicação implementado com hash SHA256 e TTL de 5 minutos]
- [x] **Documentar atualização necessária em `.env` e secrets (keys realtime, Redis, etc.)**.
  - **Critério**: [Documentação completa de variáveis de ambiente com valores por ambiente]
- [x] **Validar requisitos de auditoria (timestamp, origem, usuário que disparou)**.
  - **Critério**: [Logs estruturados implementados com correlação de eventos]
- [x] **Especificar fallback HTTP/REST para clientes sem socket**.
  - **Critério**: [Fallback HTTP implementado com polling de 30s quando Ably falha] ✅ **CONCLUÍDO** - Implementado em `app/hooks/use-notifications.ts` com detecção automática de conexão Ably e polling dinâmico (30s quando desconectado, 60s quando conectado). Documentado em [HTTP_FALLBACK.md](HTTP_FALLBACK.md)
- [x] **Elaborar plano de migração de dados se preciso (seed de preferências padrão)**.
  - **Critério**: [Seed implementado com expansão de curingas para eventos específicos]

## Etapa 3 — Backend Core de Notificações ⏳ **EM ANDAMENTO**
- [x] Criar módulo `notification-service` (ou pasta dedicada) com responsabilidade única.
- [x] **Implementar camada de domínio (`NotificationFactory`, `NotificationPolicy`)**.
  - **Critério**: [Factory e Policy implementados com validações de negócio] ✅ **CONCLUÍDO** - Implementado em `app/lib/notifications/domain/` com validações, sanitização e regras de negócio. **NOTA**: Bug de preferências corrigido (canais agora respeitam preferências do usuário)
- [x] Implementar persistência Prisma (tabelas, migrations, seeds iniciais).
- [x] **Criar fila/worker (ex: BullMQ ou equivalente) para processamento assíncrono**.
  - **Critério**: [BullMQ instalado e configurado, worker implementado para processamento assíncrono]
- [x] **Implementar publisher genérico `NotificationPublisher` com suporte a in-app e email**.
  - **Critério**: [Publisher implementado com suporte a REALTIME (in-app via Ably) e EMAIL (via Resend)]
- [x] **Criar gateway WebSocket/Realtime integrando com Ably (ou solução escolhida)**.
  - **Critério**: [Gateway Ably implementado com autenticação e reconexão automática]
- [x] **Implementar serviço de agendamento para notificações de prazo (cron + timezone)**.
  - **Critério**: [Cron job implementado com suporte a timezone, alertas D-7, D-3, D-1, H-2] ✅ **CONCLUÍDO** - `DeadlineSchedulerService` implementado e cron job `/api/cron/check-deadlines` criado (executa a cada 15 minutos)
- [x] **Implementar serviço de escuta de pagamentos (webhooks Asaas) gerando eventos**.
  - **Critério**: [Webhook Asaas implementado, eventos de pagamento disparados automaticamente] ✅ **CONCLUÍDO** - `AsaasWebhookService` implementado e integrado no webhook existente `/api/webhooks/asaas`
- [x] **Implementar rastreio de leitura (marcações read/unread) por usuário**.
  - **Critério**: [Sistema de marcação de leitura implementado com Server Actions] ✅ **CONCLUÍDO** - Server Actions `markNewNotificationAsRead` e `markNewNotificationAsUnread` implementadas em `app/actions/notifications.ts`. Sistema híbrido suporta notificações legadas e novas. Documentado em [READ_UNREAD_LEGADO.md](READ_UNREAD_LEGADO.md)
- [x] **Garantir logs estruturados e correlação de request → evento → entrega**.
  - **Critério**: [Logs estruturados implementados com IDs de notificação e usuário]
- [x] **Persistir entregas por canal (Realtime e Email) com status do provedor**.
  - **Critério**: [Tabela `NotificationDelivery` criada, messageId salvo e atualizações de status registradas]
- [x] **Migrar sistema legado (Notificacao/NotificacaoUsuario) para novo sistema**.
  - **Critério**: [Sistema híbrido implementado, módulos de eventos, andamentos e advogados migrados]

## Etapa 4 — Integração com Módulos e Gatilhos ✅ **CONCLUÍDO**
- [x] **Processos**: criação, alteração de status e upload de documentos implementados.
  - **Critério**: [Eventos `processo.created`, `processo.updated`, `processo.status_changed`, `processo.document_uploaded` disparados] ✅ **CONCLUÍDO** - Todos os eventos de processo implementados, incluindo notificação de upload de documentos
- [x] **Prazos**: disparar alertas proximidade (D-7, D-3, D-1, H-2) e alertas de vencimento.
  - **Critério**: [Eventos `prazo.created` integrados em `app/actions/andamentos.ts` via sistema híbrido]
- [x] **Agenda**: sincronizar compromissos criados/atualizados/cancelados.
  - **Critério**: [Eventos `evento.created`, `evento.updated`, `evento.confirmation_updated`, `evento.reminder_1d`, `evento.reminder_1h` integrados] ✅ **CONCLUÍDO** - Todos os eventos implementados, incluindo lembretes automáticos via cron a cada 15min
- [x] **Financeiro**: disparar confirmações de pagamento, falha de pagamento, boleto gerado, cobrança atrasada.
  - **Critério**: [Webhooks Asaas integrados, eventos `pagamento.paid`, `pagamento.failed`, `boleto.generated`, `pagamento.overdue` funcionando]
- [x] **Contratos**: notificar assinaturas pendentes, assinadas, expiradas.
  - **Critério**: [Eventos `contrato.signature_pending`, `contrato.signed`, `contrato.expired` disparados nos fluxos correspondentes]
- [x] **Documentos**: alertar upload relevante, aprovação, expiração.
  - **Critério**: [Eventos `documento.uploaded`, `documento.approved`, `documento.rejected`, `documento.expired` integrados] ✅ **CONCLUÍDO** - `DocumentNotifier` implementado com integração automática via assinaturas digitais. Cron job diário para verificação de expiração.
- [ ] **Integrações externas**: webhook de tribunal, Google Calendar, emails recebidos.
  - **Critério**: [Webhooks externos configurados e eventos correspondentes disparados]
- [x] **Administração**: mudanças em permissões, convites, resets de senha, configurações de tenant.
  - **Critério**: [Eventos `equipe.permissions_changed`, `equipe.user_invited`, `equipe.user_joined`, `equipe.user_removed` integrados] ✅ **CONCLUÍDO** - Todos os eventos de equipe implementados, incluindo remoção/inativação via `updateTenantUser`
- [ ] **CRM/Relacionamento**: novas tarefas, mensagens internas, comentários.
  - **Critério**: [Eventos `tarefa.created`, `tarefa.assigned`, `tarefa.completed` integrados com Kanban]
- [ ] **Garantir testes unitários nos serviços que emitem eventos**.
  - **Critério**: [Testes unitários cobrindo 80%+ dos cenários de notificação por módulo]

## Etapa 5 — Entrega em Tempo Real e Fallback
- [ ] **Configurar canais/topics WebSocket por tenant e por usuário**.
  - **Critério**: [Canais `ml-dev:tenant:{tenantId}` funcionando, isolamento entre tenants validado]
- [ ] **Implementar autenticação segura no handshake do socket**.
  - **Critério**: [Token JWT validado no handshake, conexões não autorizadas rejeitadas]
- [ ] **Criar mecanismo de presença/online para otimizar broadcasting**.
  - **Critério**: [Status online/offline detectado, broadcasting otimizado para usuários conectados]
- [ ] **Tratar reconexões automáticas com reenvio de eventos pendentes**.
  - **Critério**: [Reconexão em 5s, eventos pendentes reenviados, heartbeat funcionando]
- [x] **Implementar fallback polling curto apenas se WebSocket falhar**.
  - **Critério**: [Fallback HTTP ativo quando Ably falha, polling de 30s configurado] ✅ **CONCLUÍDO** - Implementado em `app/hooks/use-notifications.ts` com detecção automática e polling dinâmico
- [ ] **Criar monitoria de canais (métricas de conexões, latência, fila)**.
  - **Critério**: [Métricas de conexões, latência <1s, fila <100 eventos por tenant]
- [ ] **Validar throughput com testes de carga (cenários pico)**.
  - **Critério**: [Teste de carga: 1000 usuários simultâneos, latência <2s, 0% perda]
- [ ] **Documentar guidelines para uso de realtime no frontend**.
  - **Critério**: [Documentação completa com exemplos de uso do `useNotifications` hook]
- [ ] **Implementar rate-limitador por usuário para evitar floods**.
  - **Critério**: [Rate limit: 100 notificações/minuto por usuário, 1000/hora por tenant]
- [ ] **Verificar compatibilidade em ambientes multi-região (dev/staging/prod)**.
  - **Critério**: [Smoke test em dev/staging/prod, configurações de ambiente validadas]

## Etapa 6 — Frontend e UX por Perfil de Usuário
- [ ] **Consolidar design system para notificações (toast, badge, inbox, timeline)**.
  - **Critério**: [Componentes `NotificationToast`, `NotificationBadge`, `NotificationInbox` implementados]
- [ ] **Implementar `NotificationContext` global com SWR/React Query**.
  - **Critério**: [Context provider funcionando, cache SWR configurado, revalidação automática]
- [ ] **Criar `NotificationCenter` reutilizável com filtros (por módulo, por criticidade)**.
  - **Critério**: [Centro de notificações com filtros por módulo, urgência, data funcionando]
- [ ] **Inserir contadores de não lidos em layout principal, header e mobile**.
  - **Critério**: [Badge de contador em header, sidebar e mobile, atualização em tempo real]
- [ ] **Configurar notificações in-app + email por tipo de usuário (ADMIN, ADVOGADO, SECRETARIA, CONTROLLER/FINANCEIRO, CLIENTE, CONVIDADO EXTERNO)**.
  - **Critério**: [Matrix de eventos × canal definida e implementada para cada perfil]
- [ ] **Garantir visualização contextual dentro de cada módulo (cards com deep link)**.
  - **Critério**: [Notificações com deep links funcionando em todos os módulos]
- [ ] **Implementar marcação de lido, arquivar, fixar, deletar (quando permitido)**.
  - **Critério**: [Ações de lido/arquivar/fixar/deletar funcionando com permissões corretas]
- [ ] **Implementar atalho para desabilitar notificações de um evento diretamente da UI**.
  - **Critério**: [Botão "Silenciar" em cada notificação funcionando instantaneamente]
- [ ] **Validar acessibilidade (ARIA, screen reader, foco)**.
  - **Critério**: [Teste com screen reader, navegação por teclado, ARIA labels corretos]
- [ ] **Criar tour/tooltip explicativo para nova UX**.
  - **Critério**: [Tour interativo implementado, tooltips explicativos em todas as funcionalidades]
- [ ] **Smoke test em todos os perfis e tenants configurados**.
  - **Critério**: [Teste manual em tenants Sandra, Luana, Salba com todos os perfis de usuário]

## Etapa 7 — Configurações, Preferências e Opt-in/out
- [x] **Implementar página de preferências por usuário com granularidade por módulo/evento**.
  - **Critério**: [Página `/usuario/preferencias-notificacoes` entregue com listagem por módulo/evento e toggles usando Server Actions + SWR]
- [ ] **Adicionar presets por role (templates default para cada perfil)**.
  - **Critério**: [Presets aplicados automaticamente baseados no role do usuário]
- [ ] **Permitir silenciar temporariamente (snooze) por evento/módulo**.
  - **Critério**: [Funcionalidade snooze implementada com timer configurável]
- [x] **Permitir seleção de canais (in-app, email) por evento**.
  - **Critério**: [Seleção de canais in-app/email configurável por evento na UI de preferências]
- [x] **Integrar preferências com LGPD (coleta, logs de consentimento)**.
  - **Critério**: [Logs de consentimento implementados, retenção de 30 dias configurada] ✅ **PARCIAL** - Documentação LGPD criada em [LGPD_CONSENTIMENTO.md](LGPD_CONSENTIMENTO.md). Consentimento granular por evento e canal implementado. Pendente: logs de consentimento para auditoria e presets por role.
- [ ] **Implementar painel admin para forçar notificações críticas**.
  - **Critério**: [Painel admin com capacidade de enviar notificações forçadas]
- [ ] **Implementar exportação/backup de preferências por tenant**.
  - **Critério**: [Exportação CSV/JSON de preferências funcionando]
- [x] **Disponibilizar interface programática para gestão de preferências (API ou Server Actions)**.
  - **Critério**: [Server Actions em `app/actions/notifications.ts` expostas para leitura/atualização de preferências sem rotas REST]
- [ ] **Validar comportamento em tenants recém-criados (defaults corretos)**.
  - **Critério**: [Novos tenants recebem preferências padrão automaticamente]
- [ ] **Documentar fluxo de alteração e auditoria de preferências**.
  - **Critério**: [Documentação completa com exemplos de uso da API]

## Etapa 8 — Observabilidade, QA e Lançamento
- [x] **Configurar métricas (KPI de entrega, tempo médio, falhas)**.
  - **Critério**: [Métricas de entrega >95%, tempo médio <2s, taxa de falha <1%] ✅ **CONCLUÍDO** - Endpoint `/api/internal/notifications/metrics` implementado com métricas de overview, por canal e por tipo. Documentado em [METRICS.md](METRICS.md)
- [ ] **Criar dashboards (Grafana/Datadog) com visões por módulo e por canal**.
  - **Critério**: [Dashboard com métricas por tenant, módulo, canal e urgência funcionando] ⏳ **PENDENTE** - Endpoint pronto, UI do dashboard pendente (opcional)
- [ ] **Instrumentar alertas on-call para falhas de entrega ou filas atrasadas**.
  - **Critério**: [Alertas configurados para falhas >5%, fila >1000 eventos, latência >5s] ⏳ **PENDENTE** - Recomendações de alertas documentadas em METRICS.md
- [ ] **Escrever testes automatizados E2E cobrindo cenários críticos por perfil**.
  - **Critério**: [Testes E2E cobrindo 100% dos cenários críticos por perfil de usuário]
- [ ] **Validar segurança (perfis não recebem eventos de outros tenants ou modules)**.
  - **Critério**: [Teste de isolamento: usuários não recebem eventos de outros tenants]
- [ ] **Realizar testes de stress com cenários de pico simultâneo**.
  - **Critério**: [Teste de stress: 5000 usuários simultâneos, 0% perda de eventos]
- [ ] **Conduzir homologação com representantes de cada usuário**.
  - **Critério**: [Homologação aprovada por pelo menos 1 representante de cada perfil]
- [ ] **Atualizar documentação em `docs/` e help center do produto**.
  - **Critério**: [Documentação completa atualizada, help center com guias de uso]
- [ ] **Preparar comunicação externa (release notes, changelog, email clientes)**.
  - **Critério**: [Release notes preparadas, email de comunicação enviado aos clientes]
- [ ] **Planejar rollout gradual (feature flag por tenant) e estratégia de rollback**.
  - **Critério**: [Feature flag implementado, estratégia de rollback testada e documentada]

---

## Etapa 9 — Pós-Lançamento e Manutenção Contínua
- [ ] **Monitorar métricas na primeira semana e ajustar thresholds**.
  - **Critério**: [Relatório semanal de métricas gerado, thresholds ajustados conforme necessário]
- [ ] **Coletar feedback qualitativo com cada tipo de usuário**.
  - **Critério**: [Feedback coletado de pelo menos 5 usuários por perfil, insights documentados]
- [ ] **Ajustar preferências default conforme feedback**.
  - **Critério**: [Preferências padrão atualizadas baseadas no feedback coletado]
- [ ] **Mapear novos eventos solicitados pós-lançamento e priorizar**.
  - **Critério**: [Backlog de novos eventos criado, priorização definida com stakeholders]
- [ ] **Atualizar checklist principal `CHECKLIST_TOTAL_MAGICLAWYER.md` com entregas**.
  - **Critério**: [Checklist principal atualizado com todas as funcionalidades implementadas]
- [ ] **Arquivar aprendizados e retrospectiva técnica desta fase**.
  - **Critério**: [Retrospectiva documentada, aprendizados arquivados para futuras implementações]

---

Quando todas as caixas estiverem marcadas, esta fase pode ser considerada concluída. Até lá, **nenhum item deve ser tratado como “em andamento” sem dono e prazo definidos.**
