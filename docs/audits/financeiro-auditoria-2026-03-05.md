# Auditoria Financeiro (2026-03-05)

Escopo auditado:

1. Dashboard
2. Parcelas
3. Recibos
4. Honorários
5. Dados bancários

## Criticidade Alta

### [Recibos] Vazamento de escopo por papel na listagem

- Arquivo: `app/actions/recibos.ts`
- Evidência:
  - bloco de papel `CLIENTE` e `ADVOGADO` está "simplificado" sem filtro real (`lines 283-299`)
  - filtros operacionais adicionais também foram removidos (`lines 301-303`)
- Impacto:
  - advogado/cliente pode visualizar recibos pagos fora do seu escopo esperado.

### [Recibos] Autorização incorreta no detalhe do recibo

- Arquivo: `app/actions/recibos.ts`
- Evidência:
  - cliente compara `cliente.id` com `session.user.id` (`line 557`) em vez de relação correta cliente↔usuário.
  - advogado está com bypass explícito: `const isAdvogado = true` (`lines 566`, `658`).
- Impacto:
  - bloqueio indevido para cliente legítimo e permissão indevida para advogado.

### [Honorários] Exclusão não funciona (falso positivo de sucesso)

- Arquivo: `app/actions/honorarios-contratuais.ts`
- Evidência:
  - "soft delete" faz `update` com `data: {}` (`lines 586-589`), sem alterar nada.
- Impacto:
  - UI informa "removido" mas registro permanece ativo.

### [Honorários] Mutações sem guard de permissão

- Arquivo: `app/actions/honorarios-contratuais.ts`
- Evidência:
  - `create/update/delete` não chamam `checkPermission` para `criar/editar/excluir`.
- Arquivo relacionado: `app/(protected)/financeiro/honorarios/page.tsx`
- Evidência:
  - rota verifica apenas `financeiro.visualizar` (`line 26`) e renderiza tela com mutações.
- Impacto:
  - usuário com permissão de visualizar pode alterar/excluir honorários.

### [Honorários] Validação de update com precedência lógica incorreta

- Arquivo: `app/actions/honorarios-contratuais.ts`
- Evidência:
  - condição de SUCESSO mistura `||` fora do escopo do tipo (`lines 459-464`).
- Impacto:
  - atualização de tipo não-SUCESSO pode ser bloqueada com erro de SUCESSO.

### [Dashboard] Filtro de período financeiro aplicado em `createdAt` do contrato

- Arquivo: `app/actions/dashboard-financeiro.ts`
- Evidência:
  - filtro de data em `where.createdAt` (`lines 160-169`) no contrato.
- Impacto:
  - análise financeira por período fica distorcida (perde parcelas/pagamentos de contratos antigos).

### [Dados bancários] Exposição ampla em endpoint "ativos"

- Arquivo: `app/actions/dados-bancarios.ts`
- Evidência:
  - `getDadosBancariosAtivos()` retorna todas contas ativas do tenant (`lines 959-987`) sem escopo por papel.
- Impacto:
  - advogado/usuário pode enxergar dados bancários além do necessário em telas dependentes.

## Criticidade Média

### [Parcelas] Listagem sem paginação server-side

- Arquivo: `app/actions/parcelas-contrato.ts`
- Evidência:
  - `listParcelasContrato` usa `findMany` sem `skip/take` (`lines 111-129`).
- Impacto:
  - degrada em base grande.

### [Honorários] Listagem sem paginação server-side

- Arquivo: `app/actions/honorarios-contratuais.ts`
- Evidência:
  - `listHonorariosContratuais` usa `findMany` sem `skip/take` (`lines 106-136`).
- Impacto:
  - degrada em base grande.

### [Recibos] Anti-padrão de carregar 1000 registros e paginar no client

- Arquivo: `app/(protected)/financeiro/recibos/recibos-content.tsx`
- Evidência:
  - fetch fixo com `pagina: 1, itensPorPagina: 1000` (`line 75`) e paginação local.
- Impacto:
  - custo alto de payload e lentidão com crescimento.

### [Dashboard] Fan-out de múltiplas SWR e actions separadas

- Arquivo: `app/hooks/use-dashboard-financeiro.ts`
- Evidência:
  - 7 chamadas paralelas no mesmo carregamento (`lines 164-170`).
- Impacto:
  - custo de rede/CPU no servidor maior que necessário.

### [SWR] Chave cache compartilhada com formatos diferentes

- Arquivos:
  - `app/hooks/use-dashboard-financeiro.ts` (`line 85`)
  - `app/hooks/use-dados-bancarios.ts` (`line 84`)
- Evidência:
  - ambos usam `"dados-bancarios-ativos"` com retornos de shape diferente.
- Impacto:
  - inconsistência transitória de dados em navegação entre telas.

### [Honorários] Cálculo de simulação com base hardcoded

- Arquivo: `app/(protected)/honorarios/honorarios-content.tsx`
- Evidência:
  - `valorBase = 100000` em cálculo (`line 328`).
- Impacto:
  - resultado de cálculo pode induzir decisão errada.

## Criticidade Baixa / Dívida técnica

### [Recibos] Código legado de FATURA convivendo com fluxo atual de PARCELA

- Arquivo: `app/actions/recibos.ts`
- Evidência:
  - tipo/funções para FATURA ainda presentes, mas listagem atual é operacional de parcelas pagas.
- Impacto:
  - manutenção confusa.

### [Financeiro] Duplicidade de implementação de dashboard antigo

- Arquivo: `app/(protected)/dashboard/financeiro/dashboard-financeiro-content.tsx`
- Evidência:
  - arquivo legado completo coexistindo com novo `/financeiro/dashboard`.
- Impacto:
  - risco de divergência de UI/regra futura.

## Plano TODO (execução por item)

### 1) Dashboard

- [ ] Trocar filtro temporal para base financeira correta (pagamento/vencimento), não `createdAt` do contrato.
- [ ] Consolidar endpoint para reduzir fan-out de 7 chamadas.
- [ ] Padronizar semântica de métricas (ex.: ticket sobre recebido vs total contratado).

### 2) Parcelas

- [ ] Implementar paginação server-side (`page`, `pageSize`, `total`).
- [ ] Revisar escopo por papel (admin global; demais por regra de negócio do escritório).
- [ ] Validar geração automática com configuração explícita (remover defaults de demonstração para produção).

### 3) Recibos

- [ ] Corrigir escopo por papel no `getRecibosPagos`.
- [ ] Corrigir autorização no detalhe (`CLIENTE` e `ADVOGADO`).
- [ ] Mover busca/paginação para server-side real (remover `1000` no client).
- [ ] Decidir e limpar fluxo FATURA legado (ou reativar formalmente).

### 4) Honorários

- [ ] Corrigir delete (hard delete controlado ou soft delete com campo real no schema).
- [ ] Adicionar `checkPermission` em create/update/delete.
- [ ] Corrigir validação de update do tipo SUCESSO (precedência lógica).
- [ ] Substituir simulação hardcoded por base informada pelo usuário/contrato.
- [ ] Adicionar paginação server-side na listagem.

### 5) Dados bancários

- [ ] Aplicar escopo por papel em `getDadosBancariosAtivos`.
- [ ] Unificar chave SWR para evitar colisão de formatos.
- [ ] Validar banco/chave/documento com mensagens de domínio financeiro mais claras.
- [ ] Revisar política de visibilidade por papel (admin/financeiro/global, advogado/cliente/escopo).

## Gaps de qualidade

- Não há cobertura E2E robusta para os fluxos financeiros principais (dashboard, parcelas, honorários, recibos, dados bancários).
- Recomenda-se suíte E2E mínima por papel: `ADMIN`, `FINANCEIRO`, `ADVOGADO`, `CLIENTE`.
