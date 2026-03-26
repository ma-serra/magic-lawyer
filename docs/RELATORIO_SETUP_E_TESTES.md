# Relatório: Setup do Ambiente e Testes de Importação de Processos

**Data:** 25/02/2026  
**Autor:** Cursor Cloud Agent  
**Branch:** `cursor/development-environment-setup-f749`

---

## 1. Resumo Executivo

O ambiente de desenvolvimento do Magic Lawyer foi configurado do zero em uma VM cloud, incluindo todos os serviços necessários (Docker, PostgreSQL, Redis, Node.js). Foram realizados testes completos do fluxo de importação de processos por três vias distintas, resultando em **261 processos importados com sucesso** (259 via planilha + 2 via scraping automático).

---

## 2. Ambiente Configurado

### 2.1 Serviços instalados

| Serviço | Versão | Porta | Comando |
|---------|--------|-------|---------|
| Node.js | v22.22.0 | — | Pré-instalado |
| Docker | 28.5.2 | — | `sudo dockerd` |
| PostgreSQL | 16 Alpine | 8567 | `npm run db:up` |
| Redis | 7.0.15 | 6379 | `redis-server --daemonize no` |
| Next.js (Turbopack) | 16.1.6 | 9192 | `PORT=9192 npx next dev --turbopack` |

### 2.2 Configurações de ambiente (.env)

Variáveis adicionadas/ajustadas em relação ao `.env.example` original:

| Variável | Valor/Formato | Motivo |
|----------|--------------|--------|
| `DATABASE_URL` | `postgresql://magiclawyer:MagicLawyer@2025@localhost:8567/...` | Docker Compose mapeia porta 8567→5432 |
| `NEXTAUTH_SECRET` | String não-vazia | Necessário para NextAuth funcionar |
| `ABLY_API_KEY` | (vazio) | Valores placeholder causam crash no Ably client |
| `NEXT_PUBLIC_ABLY_CLIENT_KEY` | (vazio) | Idem |
| `CERT_ENCRYPTION_KEY` | 64 chars hex (32 bytes) | Necessário para upload de certificados digitais |

### 2.3 Banco de dados

- Schema Prisma pushed com `npx prisma db push`
- 3 schemas: `magiclawyer`, `support`, `audit`
- Seed executado com `npm run prisma:seed` — criou 4 tenants de teste (Souza Costa, Salba, RVB e Tenant Interno de Testes)
- 260 processos iniciais do seed

---

## 3. Bug Corrigido

### 3.1 Select de Tribunal no Portal do Advogado

**Arquivo:** `app/(protected)/portal-advogado/portal-advogado-content.tsx`

**Problema:** O dropdown de seleção de tribunal não persistia o valor selecionado. Ao clicar em TJBA ou TJSP, o checkmark aparecia mas o campo voltava para "Selecione" ao fechar o dropdown. Isso impedia completamente o uso do sync no Portal do Advogado.

**Causa raiz:** Duas questões documentadas em `docs/fixes/correcao-erro-select.md`:
1. `selectedKeys` continha chave (`"TJSP"`) inexistente na coleção quando os dados SWR ainda não tinham carregado
2. `SelectItem` não tinha `textValue`, impedindo o render do valor no trigger

**Correção aplicada:**
```tsx
// ANTES
selectedKeys={syncTribunalSigla ? [syncTribunalSigla] : []}
// ...
<SelectItem key={tribunal.sigla}>

// DEPOIS
selectedKeys={
  syncTribunalSigla && syncTribunais.some((t) => t.sigla === syncTribunalSigla)
    ? [syncTribunalSigla]
    : []
}
// ...
<SelectItem key={tribunal.sigla} textValue={`${tribunal.sigla} · ${tribunal.nome}`}>
```

**Resultado:** Dropdown funciona corretamente. Valor selecionado persiste, botão de sync é habilitado, sincronização via Portal do Advogado ficou operacional.

---

## 4. Testes de Importação de Processos

### 4.1 Importação via Planilha (3 arquivos reais)

| Planilha | Tamanho | Processos | Novos criados | Resultado |
|----------|---------|-----------|--------------|-----------|
| TODOS OS PROCESSOS DO FÓRUM.xls | 63 KB | 143 sincronizados | 0 (atualizou existentes) | ✅ Sucesso |
| PROJUDI.xls | 95 KB | 222 sincronizados | **222 novos** | ✅ Sucesso |
| JUSTIÇA DO TRABALHO.xls | 107 KB | 37 sincronizados | **37 novos** | ✅ Sucesso |

**Total:** 259 novos processos importados via planilha (260 → 519)

### 4.2 Sync Automático via OAB (e-SAJ)

| Tribunal | OAB | Resultado | Processos |
|----------|-----|-----------|-----------|
| TJBA | 19872BA (Sandra) | ❌ ECONNRESET (geo-restrição) | 0 |
| **TJSP** | **19872BA (Sandra)** | **✅ Sucesso** | **2 criados** |
| TJBA | 69211BA (Luciano) | ❌ ECONNRESET (geo-restrição) | 0 |
| TJSP | 69211BA (Luciano) | ⚠️ Sem dados (OAB de BA, não SP) | 0 |

**Total:** 2 processos importados automaticamente via scraping (519 → 521)

**Processos trazidos do TJSP:**
1. `1113802-23.2018.8.26.0100` — Epc Distribuidora de Veículos Ltda. (8 partes)
2. `1000151-76.2019.8.26.0100` — Fundação de Rotarianos de São Paulo (3 partes)

### 4.3 Upload de Certificado Digital

| Etapa | Resultado |
|-------|-----------|
| Upload do .pfx (Sandra admin) | ✅ Criptografado e salvo com AES-256-GCM |
| Ativação automática | ✅ Status "Ativo" com badge PJE |
| Teste conexão PJe Comunica | ⚠️ TLS handshake OK, CloudFront 403 (geo-restrição) |

**Certificado:** LUCIANO DE SOUSA SANTOS (CPF: 630.479.425-87), ICP-Brasil A1, válido até 17/12/2026

---

## 5. Limitações Identificadas

### 5.1 Geo-restrição (ambiente cloud)

A VM roda nos EUA (IP: 3.136.249.249). Os tribunais brasileiros bloqueiam conexões estrangeiras:
- **TJBA e-SAJ:** Firewall rejeita IPs de fora do Brasil (ECONNRESET)
- **PJe Comunica:** CloudFront configurado para bloquear países fora do Brasil (403)
- **TJSP e-SAJ:** Funciona (mais permissivo)

**Solução:** Testar em ambiente com IP brasileiro (Vercel produção ou dev local).

### 5.2 PJe API (parcialmente implementado)

A infraestrutura mTLS está pronta (`lib/api/juridical/pje/comunica.ts`), mas as chamadas reais à API do PJe para buscar processos ainda não estão completamente implementadas. O arquivo `lib/api/juridical/pje.ts` não existe.

### 5.3 ESLint

Incompatibilidade pré-existente entre `@next/eslint-plugin-next` v16 e o adaptador `FlatCompat` em `eslint.config.mjs`.

---

## 6. Arquivos Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `AGENTS.md` | Novo | Instruções para agentes Cloud |
| `docs/RELATORIO_SETUP_E_TESTES.md` | Novo | Este relatório |
| `.env.example` | Atualizado | DATABASE_URL correta, CERT_ENCRYPTION_KEY, ESAJ configs |
| `app/(protected)/portal-advogado/portal-advogado-content.tsx` | Fix | Correção do Select de tribunal |

---

## 7. Testes Automatizados

```
✅ npm test — 2 suites, 12 testes passando
⚠️ npm run lint — erro pré-existente de configuração ESLint (não introduzido por nós)
✅ Dev server (Turbopack) — inicia em ~1.3s na porta 9192
✅ Login manual — sandra@adv.br e luciano.santos@adv.br funcionando
✅ Importação via planilha — 3 arquivos testados com sucesso
✅ Sync OAB (TJSP) — 2 processos trazidos automaticamente
✅ Upload certificado digital — criptografado e ativado
```

---

## 8. Próximos Passos Recomendados

1. **Testar TJBA e PJe em ambiente brasileiro** — deploy na Vercel ou dev local para validar sync com IP do Brasil
2. **Implementar PJe API** — criar `lib/api/juridical/pje.ts` para buscar processos via API oficial
3. **Persistir movimentações** — o TODO na linha 294 de `juridical-capture.ts` para salvar `MovimentacaoProcesso`
4. **Sync automático (cron)** — adicionar job periódico para re-sincronizar processos
5. **Corrigir ESLint** — atualizar config para compatibilidade com `@next/eslint-plugin-next` v16
