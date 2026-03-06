# Plano de Evolução — Módulo de Suporte

Atualizado em: 05/03/2026

## Objetivo de negócio

Transformar o suporte em uma operação SaaS madura:

- chat para resposta rápida;
- ticket para execução assíncrona e rastreável;
- governança global para o time Magic Lawyer (SUPER_ADMIN);
- isolamento multi-tenant no conteúdo operacional.

## Princípios obrigatórios

1. Dados de tenant nunca vazam para outros tenants.
2. Métricas de SLA/tempo médio ficam restritas ao SUPER_ADMIN.
3. Toda alteração operacional relevante gera trilha de auditoria.
4. Fluxo precisa funcionar com alto volume (fila, paginação, filtros, reabertura).

## Fase 1 — Crítica (operação real)

Status: Em implementação.

- [x] Restrição de visibilidade de SLA no tenant (UI + backend).
- [x] Disponibilidade automática no painel de suporte (super admin).
- [x] Upload de imagens no ticket e no chat (até 5 por envio).
- [x] Estados operacionais além de "em andamento":
  - Aguardando cliente
  - Aguardando terceiro
- [x] Guia de transição de status (copy operacional dentro da tela).
- [x] Macro de resposta para handoff interno e retorno ao cliente.
- [x] Motivo obrigatório ao mover para "Aguardando terceiro" (backend + UI).

Critérios de aceite:

1. Ticket não fica preso em chat: pode aguardar cliente/terceiro com clareza.
2. Fila de atendimento diferencia backlog ativo de espera externa.
3. Tenant não acessa dados de SLA, mesmo por chamada direta.

## Fase 2 — Escala e produtividade

Status: Pendente.

- [ ] Formulário estruturado de abertura de ticket:
  - módulo afetado
  - impacto
  - urgência
  - ambiente
  - evidência/anexo
- [ ] Regras de automação:
  - ticket parado (stale)
  - lembrete de inatividade
  - fechamento automático com janela de reabertura
- [ ] Playbook de encaminhamento interno por competência.
- [ ] Templates de resposta por categoria.
- [ ] Base de conhecimento integrada ao fluxo de abertura.

Critérios de aceite:

1. Redução de retrabalho por informações incompletas.
2. Menor tempo de triagem.
3. Menor tempo de resolução para tickets repetitivos.

## Fase 3 — Excelência operacional

Status: Pendente.

- [ ] Gestão de problema raiz (um problema para múltiplos tickets).
- [ ] Painel de capacidade da operação (backlog aging, throughput).
- [ ] CSAT por ticket e por tenant.
- [ ] Health score de tenant para prevenção.
- [ ] Relatórios executivos com exportação e séries históricas.

Critérios de aceite:

1. Operação previsível com indicadores de capacidade.
2. Priorização baseada em impacto e recorrência.
3. Evolução contínua com dados objetivos.

## Riscos e controles

- Risco: overfitting de fluxo para um único escritório.
  - Controle: manter configuração global com políticas por tenant quando necessário.
- Risco: excesso de complexidade na UI.
  - Controle: manter modo simples por padrão e avançado em blocos dedicados.
- Risco: custo de polling/realtime.
  - Controle: priorizar invalidação inteligente e polling com janela controlada.

## Próximas entregas sugeridas (ordem)

1. Formulário estruturado de abertura de ticket (módulo/impacto/ambiente).
2. Regras automáticas de ticket parado e lembretes.
3. Templates de resposta por categoria com atalhos por módulo.
