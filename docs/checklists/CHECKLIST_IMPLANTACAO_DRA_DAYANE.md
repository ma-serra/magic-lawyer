# ✅ Checklist de Implantação - Dra. Dayane

Este documento consolida apenas itens de trabalho levantados na reunião de implantação com a Dra. Dayane.

Use este checklist para validar o que já foi entregue, o que já foi testado e o que ainda está pendente.

### 🔗 **CHECKLISTS RELACIONADOS:**
- **[CHECKLIST_TOTAL_MAGICLAWYER.md](./CHECKLIST_TOTAL_MAGICLAWYER.md)** - checklist global do produto e referência principal de progresso

**Última atualização:** 06/04/2026  
**Origem:** reunião de implantação com a Dra. Dayane  
**Status:** revisão do pacote publicado em `main` entre 03/04/2026 e 06/04/2026 concluída; validação operacional segue em andamento

---

## ✅ Pacote revisado nesta atualização

- [x] 03/04/2026 `662447a` - `release: v1.0.14-beta.4`
- [x] 03/04/2026 `08adcb6` - `release: deploy support, process, and UX updates`
- [x] 03/04/2026 `2f98643` - `fix: normalize mojibake across app screens`
- [x] 06/04/2026 `a8ef070` - `feat: melhora responsividade e navegacao de prazos do processo`
- [x] 06/04/2026 `bdc2277` - `feat: ship document workflow and notification audit`
- [x] 06/04/2026 `8447fd5` - `fix: add mojibake scanner and audit copy repair`
- [x] 06/04/2026 `0481b13` - `feat: formalize rito processual and deadline context` (preview de homologação)

---

## ✅ Validado na reunião

- [x] Cadastro básico de cliente realizado durante a reunião.
- [x] Cadastro básico de processo realizado durante a reunião.
- [x] Documento anexado ao processo em teste.
- [x] Prazo criado no processo em teste.
- [x] Evento de agenda criado no processo em teste.
- [x] Integração com Telegram configurada e testada.
- [x] Integração com Google Calendar configurada e testada.
- [x] Envio de e-mail de teste do escritório validado.

---

## ✅ Validado no código e testes locais

### Perfil, escritório e notificações

- [x] Tornar o botão flutuante arrastável ou reposicionar para não ficar na frente das ações.
- [x] Separar a central de notificações por filtros rápidos ou abas.
- [x] Diferenciar notificações do sistema de notificações processuais.
- [x] Permitir configurar quantidade e frequência de lembretes para prazo e audiência.
- [x] Criar alertas mais fortes para audiência, incluindo véspera e horas antes.
- [x] Reabilitar a permissão para alterar logo ou imagem do escritório nas configurações.
- [x] Criar auditoria administrativa de notificações por canal, com despacho, supressão, entrega, custo, provider e exportação CSV.
- [x] Corrigir textos quebrados por encoding/mojibake nas telas críticas e adicionar verificação automatizada contra regressão.
- [x] Enriquecer notificações de prazo com cliente, processo, vencimento e link direto para o prazo ou para a lista de prazos.
- [x] Executar disparo real de validação por e-mail e Telegram em 06/04/2026 usando prazo real da Dra. Dayane, sem persistir teste no banco dela.

### Processos e cadastros

- [x] Criar botão para cadastrar cliente direto da tela de novo processo, sem sair do fluxo.
- [x] Corrigir o preenchimento automático do endereço ao buscar CNPJ.
- [x] Corrigir selects para funcionar corretamente com touchpad ou mousepad.
- [x] Permitir busca digitável nos campos de tribunal, comarca, vara e órgão julgador.
- [x] Revisar o campo "número interno" para não gerar confusão.
- [x] Transformar "classe processual" em select com opções padrão e possibilidade de ajuste.
- [x] Revisar o campo "órgão julgador" considerando mudança de instância em caso de recurso.
- [x] Corrigir o erro de redirecionamento ao salvar a edição do processo.
- [x] Criar tipo de registro específico para solicitações feitas ao cliente.
- [x] Completar o cadastro da autoridade com os campos que ficaram pendentes no teste.
- [x] Permitir editar partes vinculadas ao processo sem remover o vínculo.
- [x] Corrigir a exibição do grau do processo nas listagens e formulários.
- [x] Melhorar a aba de documentos do processo para renomear, mover, criar pasta e vincular documentos.
- [x] Padronizar barra de progresso nos uploads de documentos, fotos, anexos e importações.

### Prazos e agenda

- [x] Fazer o prazo criado no cadastro do processo aparecer corretamente na central de prazos.
- [x] Permitir vincular prazo a audiência, evento ou andamento.
- [x] Considerar feriados locais e regionais na contagem de prazo.
- [x] Permitir evento online com link clicável.
- [x] Melhorar a configuração de lembretes de evento para não depender de um único aviso.
- [x] Revisar o uso do horário final do evento para conflito de agenda e organização do advogado.
- [x] Criar atalho do prazo principal para abrir a área de prazos do processo.
- [x] Melhorar a responsividade e a leitura da área de prazos no contexto do processo.
- [x] Substituir o conceito operacional de "regime de prazo" por "rito do processo" no fluxo principal.
- [x] Adicionar "tipo legal do prazo" com sugestão automática de fundamento e regra-base por rito.

### Relatórios, cliente e documentos

- [x] Gerar relatório consolidado mensal por cliente com texto objetivo e enxuto.
- [x] Permitir gerar relatório a partir dos andamentos registrados no período.
- [x] Incluir solicitações feitas ao cliente dentro do relatório consolidado.
- [x] Refinar o que o cliente pode ou não visualizar no portal.
- [x] Validar em código o fluxo de primeiro acesso do cliente.

### Petições e modelos

- [x] Preencher automaticamente variáveis do modelo: processo, tribunal, cliente, parte contrária e dados relacionados.
- [x] Aplicar automaticamente a logo do escritório nos modelos.
- [x] Permitir busca de modelos e petições por palavra-chave ou trecho do conteúdo.
- [x] Organizar tipos e categorias de petição conforme uso jurídico real.

### Infra e qualidade

- [x] `npm run typecheck` executado com sucesso em 03/04/2026.
- [x] `npm test` executado com sucesso em 03/04/2026.
- [x] `npm run build` executado com sucesso em 03/04/2026.
- [x] Deploy de produção versionado e publicado em 03/04/2026 (`1.0.14-beta.5`).
- [x] `npm run typecheck` executado com sucesso em 06/04/2026.
- [x] `npm run check:mojibake` criado e executado com sucesso em 06/04/2026.
- [x] `npm test -- admin-audit-center.test.ts notification-audit.test.ts` executado com sucesso em 06/04/2026.
- [x] `npm run prisma:push` executado com sucesso em 06/04/2026 para sincronizar a auditoria de notificações de forma aditiva.
- [x] Pacote complementar publicado em `main` em 06/04/2026, sem alteração da versão do `package.json`.
- [x] `npm test -- notification-links.test.ts notification-policy-telegram.test.ts deadline-digests.test.ts` executado com sucesso em 06/04/2026.
- [x] Branch de preview `preview/full-tree-20260406` publicada em 06/04/2026 para homologação do pacote com rito do processo e notificações enriquecidas.

### Suporte e implantação

- [x] Manter chat e pinpad flutuantes visíveis nas rotas de suporte para destravar a implantação assistida.

---

## 📋 Pendências ou itens que ainda exigem validação operacional

### Perfil, escritório e notificações

- [ ] Finalizar a integração de notificações por WhatsApp.
- [ ] Refinar os canais ativos por usuário: e-mail, Telegram, WhatsApp e in-app.
- [ ] Homologar com a Dra. Dayane a nova auditoria de notificações e validar quais canais devem ser priorizados no uso real.
- [ ] Revisar com a Dra. Dayane se a régua de alertas de prazo deve manter a antecedência atual ou ser ajustada.
- [ ] Homologar com a Dra. Dayane o novo texto das notificações com cliente e link direto para o prazo.

### Processos e cadastros

- [ ] Ajustar responsividade para notebooks com resolução 1366x768 em todos os fluxos principais.
- [ ] Garantir que edição e atualização do processo funcionem sem mensagem de erro em fluxo real.
- [ ] Permitir vincular partes já existentes sem recadastrar manualmente.
- [ ] Homologar em uso real o novo fluxo de organização de documentos na aba do processo.

### Prazos e agenda

- [ ] Remover ou ocultar a recorrência da agenda para o uso jurídico padrão.
- [ ] Homologar com a Dra. Dayane a navegação do prazo principal e a leitura da aba de prazos no processo.
- [ ] Homologar com a Dra. Dayane o novo fluxo de rito do processo e tipo legal do prazo.

### Relatórios, cliente e documentos

- [ ] Validar o fluxo de primeiro acesso do cliente com envio estável por e-mail no ambiente real.
- [ ] Validar o fluxo para o cliente anexar documentos pelo portal.
- [ ] Criar tutorial curto para o cliente anexar documentos.
- [ ] Criar tutoriais curtos por módulo para advogado e equipe.

### Petições e modelos

- [ ] Evoluir o módulo de petições para trabalhar com modelos reais em Word.
- [ ] Receber e importar a base de modelos reais da Dra. Dayane para montagem do módulo.

### Integrações e implantação

- [ ] Resolver a reativação e estabilização da integração com o Juiz Brasil.
- [ ] Definir o provedor final da integração de WhatsApp.
- [ ] Avaliar integração com Apple Calendar, caso Google Calendar não seja o calendário principal da usuária.
- [ ] Validar novos testes com processos reais e mais movimentados.
- [ ] Manter o fluxo de suporte assistido para implantação quando houver bloqueio técnico no computador da usuária.

---

## 📝 Observações

- Nesta atualização, `[x]` significa item validado em reunião, no produto por leitura de código, por revisão dos commits publicados em `main` ou por testes locais.
- O checklist usa dois níveis: validação técnica e validação operacional.
- "Feito no código" não significa que o item já foi homologado pela Dra. Dayane em uso real.
- Itens marcados como pendentes podem já ter backend ou UI parcial, mas ainda exigem validação operacional, ajuste fino de UX ou integração externa.
- A revisão de 06/04/2026 considerou o pacote publicado entre sexta-feira, 03/04/2026, e segunda-feira, 06/04/2026.
