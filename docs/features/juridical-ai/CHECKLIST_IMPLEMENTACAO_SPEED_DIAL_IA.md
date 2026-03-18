# Checklist Técnico – Speed Dial da IA Jurídica

> Documento mantido como registro histórico. O documento mestre ativo desta frente passou a ser [ATA_ASSISTENTE_JURIDICO_PROATIVO.md](./ATA_ASSISTENTE_JURIDICO_PROATIVO.md).

Status: Primeira implementação iniciada  
Última atualização: 16 de março de 2026

---

## 1. Objetivo

Implementar no shell autenticado um **botão flutuante contextual** para o Assistente Jurídico Proativo, com:

- botão principal;
- speed dial vertical;
- tooltips;
- drawer de workspace;
- coexistência com o dock de suporte.

---

## 2. Escopo desta primeira entrega

- [x] Definir componente isolado do dock
- [x] Plugá-lo no shell do tenant
- [x] Plugá-lo no shell admin
- [x] Criar ações contextuais por rota
- [x] Criar drawer com contexto detectado
- [x] Expor quick links reais para módulos existentes
- [x] Evitar mock de IA
- [x] Posicionar acima do dock de suporte

---

## 3. Arquivos-base

- [x] [floating-assistant-dock.tsx](/Users/robsonnonato/Documents/GitHub/magic-lawyer/components/juridical-ai/floating-assistant-dock.tsx)
- [x] [assistant-dock.ts](/Users/robsonnonato/Documents/GitHub/magic-lawyer/app/lib/juridical-ai/assistant-dock.ts)
- [x] [app-shell.tsx](/Users/robsonnonato/Documents/GitHub/magic-lawyer/components/app-shell.tsx)
- [x] [admin-app-shell.tsx](/Users/robsonnonato/Documents/GitHub/magic-lawyer/components/admin-app-shell.tsx)

---

## 4. Regras de UX

- [x] O botão principal deve ficar acima do suporte
- [x] O speed dial deve abrir verticalmente
- [x] Cada ação deve ter tooltip
- [x] O texto auxiliar lateral deve aparecer em telas maiores
- [x] O drawer deve explicar claramente o estado da feature
- [x] A UX deve assumir contexto da rota atual
- [x] O componente deve se esconder em rotas onde a interface já esteja saturada, como suporte fullscreen

---

## 5. Regras de negócio

- [x] No tenant, priorizar ações jurídicas operacionais
- [x] No admin, priorizar governança e monetização
- [x] Não mostrar a IA como funcionalidade pronta quando ainda não estiver pronta
- [x] Usar módulos reais já existentes como base operacional
- [ ] Conectar a ação a permissions por módulo e plano
- [ ] Conectar franquias de uso por plano
- [ ] Registrar auditoria de abertura e clique por ação

---

## 6. Contexto por rota

- [x] `/processos`, `/processo`, `/andamentos` → contexto `Processos e andamentos`
- [x] `/documentos` → contexto `Documentos e anexos`
- [x] `/causas`, `/juizes` → contexto `Pesquisa e fundamentos`
- [x] `/peticoes`, `/modelos-peticao` → contexto `Peças e modelos`
- [x] `/contratos`, `/procuracoes` → contexto `Contratos e instrumentos`
- [x] `/clientes` → contexto `Clientes e contexto factual`
- [x] `/admin/auditoria` → contexto `Governança e risco`
- [x] `/admin/pacotes`, `/admin/financeiro` → contexto `Monetização premium`
- [x] Demais rotas → contexto `Workspace jurídico`

---

## 7. Ações desta primeira versão

## 7.1 Tenant

- [x] Nova peça
- [x] Analisar documento
- [x] Pesquisar jurisprudência
- [x] Validar citações
- [x] Resumir processo
- [x] Estratégia do caso

## 7.2 Admin

- [x] Governança da IA
- [x] Monetização premium
- [x] Auditar uso
- [x] Pesquisa jurídica assistida

---

## 8. Quick links reais

- [x] Modelos de petição
- [x] Petições
- [x] Processos
- [x] Documentos
- [x] Contratos
- [x] Procurações
- [x] Causas
- [x] Juízes
- [x] Relatórios
- [x] Auditoria
- [x] Financeiro
- [x] Pacotes
- [x] Configurações
- [x] Suporte

---

## 9. Próximas fases técnicas

### Fase 2

- [ ] Criar `AiWorkspaceSession`
- [ ] Criar telemetria de uso por ação
- [ ] Adicionar persistência da última ação utilizada
- [ ] Conectar drawer a um formulário real de briefing

### Fase 3

- [ ] Criar ação real de geração de peça
- [ ] Criar análise real de documento
- [ ] Criar memória por caso
- [ ] Criar validação de citações

### Fase 4

- [ ] Ligar billing/franquia
- [ ] Amarrar auditoria formal
- [ ] Criar rollout flag por tenant
- [ ] Criar métricas de adoção no admin

---

## 10. Testes

- [ ] Teste unitário do resolvedor de contexto e ações
- [ ] Validação visual em tenant
- [ ] Validação visual em super admin
- [ ] Verificar coexistência com `TenantFloatingChatDock`
- [ ] Verificar coexistência com `AdminFloatingChatDock`
- [ ] Verificar mobile
- [ ] Verificar acessibilidade do botão e drawer

---

## 11. Critérios para próxima rodada

Só avançar para execução real da IA quando houver:

- [ ] modelo de billing por uso/franquia definido
- [ ] entidade de auditoria de IA definida
- [ ] prompt governance definida
- [ ] decisão formal sobre retrieval e citações
- [ ] matriz de permissão por plano/role
