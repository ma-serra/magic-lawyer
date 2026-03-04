# Plano de Implementação - Módulo INPI (`/inpi`)

## Objetivo de negócio
Criar um módulo multi-tenant para análise de viabilidade de marca, permitindo:
- pesquisar colisões por nome/classe;
- manter dossiês por escritório;
- operar com catálogo global compartilhado;
- preservar isolamento de dados sensíveis de cada tenant.

## Arquitetura alvo
1. Catálogo global (`InpiCatalogMarca`): base de referência compartilhada.
2. Dossiê por tenant (`InpiDossie`): carteira privada do escritório.
3. Colisões por dossiê (`InpiDossieColisao`): snapshot de análise para auditoria.
4. Log de busca (`InpiBuscaLog`): histórico operacional por tenant.

## Etapas

### Etapa 1 - Base técnica e dados (concluída)
- [x] Criar modelos Prisma para catálogo, dossiês, colisões e logs.
- [x] Garantir isolamento multi-tenant por `tenantId`.
- [x] Criar enums de status e risco INPI.
- [x] Atualizar schema e sincronizar banco.

### Etapa 2 - Regras de negócio server-side (concluída)
- [x] Implementar ações server para:
  - sincronização de catálogo base;
  - busca no catálogo;
  - criação de dossiê;
  - reanálise de colisões;
  - atualização de status do dossiê;
  - métricas operacionais.
- [x] Aplicar controle de acesso:
  - `ADMIN`: leitura/escrita/sync;
  - demais usuários internos: leitura (e edição se permissão equivalente);
  - `CLIENTE` e `SUPER_ADMIN` fora da rota `/inpi`.

### Etapa 3 - UI/UX operacional (concluída)
- [x] Criar página `/inpi` com padrão visual dos módulos estabilizados.
- [x] Criar cards de métricas, painel de novo dossiê e pesquisa de catálogo.
- [x] Exibir dossiês em cards clicáveis com modal de detalhes.
- [x] Adicionar filtros, paginação e ações de reanálise/status.

### Etapa 4 - Hardening para produção (pendente)
- [x] Integrar consulta oficial de marcas via dados abertos do INPI (on-demand/live).
- [x] Versionar snapshots de análise por dossiê (histórico temporal completo).
- [x] Implementar trilha de auditoria dedicada (eventos INPI críticos).
- [x] Aplicar contenção por tenant na consulta oficial (lock/cooldown/rate limit).
- [x] Exibir status operacional de pesquisa em execução na UI (`executando pesquisa...`).
- [x] Adicionar tutorial de uso dentro da tela `/inpi`.
- [x] Expor catalogo completo de classes NICE (1-45) com descricao na UI.
- [x] Exibir uso de classes NICE por tenant (dossies + buscas) para apoiar decisao.
- [x] Permitir editar classe NICE de dossie e disparar reanalise automatica ao alterar.
- [x] Implementar busca oficial completa em background (queue + worker + status/progresso).
- [x] Exibir feedback de progresso/ETA e permitir reprocessar busca para captar novos registros.
- [ ] Adicionar testes E2E cobrindo fluxos de admin/advogado/secretaria.
- [ ] Definir política comercial de acesso premium ao catálogo avançado.

## Critério de pronto (MVP atual)
- dossiês funcionais por tenant;
- análise de colisão funcional em catálogo global;
- sincronização de catálogo base funcional;
- UI padronizada e usável.

## Próximo incremento recomendado
Conectar uma fonte oficial homologada e adicionar monitoramento ativo de mudanças de status de processo INPI por dossiê.
