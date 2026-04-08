# Checklist de Implantação - Dra. Dayane

Este documento consolida apenas os itens levantados na implantação da Dra. Dayane.

Use este checklist para separar:
- o que já foi validado em reunião ou em uso real
- o que já foi implementado e validado no código/testes locais
- o que ainda depende de homologação operacional ou implementação adicional

### Checklists relacionados
- [CHECKLIST_TOTAL_MAGICLAWYER.md](./CHECKLIST_TOTAL_MAGICLAWYER.md) - checklist global do produto e referência principal de progresso

**Última atualização:** 08/04/2026  
**Origem:** reunião de implantação com a Dra. Dayane e feedbacks operacionais enviados entre 03/04/2026 e 08/04/2026  
**Status:** checklist revisado com critério separado de produção/evidência, código/testes locais e homologação operacional

---

## Pacote revisado nesta atualização

- [x] 03/04/2026 `662447a` - `release: v1.0.14-beta.4`
- [x] 03/04/2026 `08adcb6` - `release: deploy support, process, and UX updates`
- [x] 03/04/2026 `2f98643` - `fix: normalize mojibake across app screens`
- [x] 06/04/2026 `a8ef070` - `feat: melhora responsividade e navegacao de prazos do processo`
- [x] 06/04/2026 `bdc2277` - `feat: ship document workflow and notification audit`
- [x] 06/04/2026 `8447fd5` - `fix: add mojibake scanner and audit copy repair`
- [x] 06/04/2026 `0481b13` - `feat: formalize rito processual and deadline context`
- [x] 07/04/2026 `042b76a` - `feat: improve process intake and legal catalogs`
- [x] 07/04/2026 `404bea7` - `chore: allow controlled process cause cleanup`

---

## Validado na reunião

- [x] Cadastro básico de cliente realizado durante a reunião.
- [x] Cadastro básico de processo realizado durante a reunião.
- [x] Documento anexado ao processo em teste.
- [x] Prazo criado no processo em teste.
- [x] Evento de agenda criado no processo em teste.
- [x] Integração com Telegram configurada e testada.
- [x] Integração com Google Calendar configurada e testada.
- [x] Envio de e-mail de teste do escritório validado.

---

## Validado com a Dra. Dayane após a reunião

- [x] Dra. Dayane validou em 06/04/2026 a frequência atual da régua de notificações de prazo, sem necessidade de aumentar ou diminuir os alertas neste momento.
- [x] A Dra. Dayane confirmou em 07/04/2026 que a frequência de notificações está adequada para o uso atual.

---

## Validado no código e testes locais

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
- [x] Corrigir o seletor de tribunal no modal rápido de autoridade para busca e rolagem no próprio modal.
- [x] Permitir editar partes vinculadas ao processo sem remover o vínculo.
- [x] Permitir cadastrar múltiplas partes já no fluxo de novo processo, incluindo réu, reclamado, autor extra e equivalentes.
- [x] Corrigir a exibição do grau do processo nas listagens e formulários.
- [x] Melhorar a aba de documentos do processo para renomear, mover, criar pasta e vincular documentos.
- [x] Padronizar barra de progresso nos uploads de documentos, fotos, anexos e importações.
- [x] Tornar o e-mail opcional no cadastro de cliente quando não houver criação de acesso.
- [x] Exigir telefone ou celular no cadastro de cliente como contato mínimo obrigatório.
- [x] Mover a criação de acesso do cliente para checkbox inline no mesmo formulário de cadastro.
- [x] Permitir criar área do processo direto do formulário de novo/editar processo, sem ir para Configurações.
- [x] Adicionar a fase processual "Alegações finais" no fluxo de processos.
- [x] Separar "Classe processual" de "Assuntos do processo" no cadastro e edição do processo.
- [x] Reusar o catálogo de causas como base de "Assuntos do processo" com multiseleção.
- [x] Permitir criar classe processual direto do formulário de processo.
- [x] Permitir criar assunto do processo direto do formulário de processo.
- [x] Exibir links de criação rápida abaixo dos campos de área, classe processual e assuntos do processo, sem exigir ida prévia a Configurações.
- [x] Exibir classe processual e assuntos do processo separadamente nas telas principais de processo e na visão do cliente.
- [x] Expandir o catálogo padrão de classes processuais com opções cíveis, criminais e trabalhistas mais comuns para uso imediato no escritório.
- [x] Expandir o catálogo padrão de assuntos do processo com base nas sugestões práticas da Dra. Dayane.
- [x] Persistir em banco o catálogo padrão de classes e assuntos do processo, com seed real para tenants novos e backfill idempotente para tenants existentes.
- [x] Reutilizar componentes tipados nos formulários de área, classe e assunto entre páginas próprias e modais rápidos, evitando divergência de campos.
- [x] Reutilizar a seção de classificação do processo entre os fluxos de novo processo e editar processo.
- [x] Permitir busca com sugestão e digitação livre no campo "Órgão Julgador".
- [x] Padronizar a linguagem do fluxo de processo para "Autoridade do caso", separando esse conceito do campo textual "Órgão julgador".
- [x] Sincronizar em runtime as áreas padrão do processo no tenant, para que escritórios existentes recebam o catálogo no próprio banco sem depender de criação manual.
- [x] Persistir em banco o catálogo judicial de `tribunal -> comarca/seção -> vara`, deixando de depender apenas do histórico já cadastrado em processos e autoridades.
- [x] Carregar automaticamente `Comarca / Seção` a partir do tribunal selecionado e do `Órgão julgador` quando houver correspondência determinística.
- [x] Adotar no fluxo principal o modelo `Área do processo + Rito / Procedimento da área`.
- [x] Filtrar o campo `Rito / Procedimento da área` de acordo com a área selecionada, cobrindo cível, penal e trabalhista.
- [x] Remover o campo `Foro` do formulário principal de novo/editar processo, mantendo compatibilidade apenas no banco e na leitura legada.

### Prazos e agenda

- [x] Fazer o prazo criado no cadastro do processo aparecer corretamente na central de prazos.
- [x] Permitir vincular prazo a audiência, evento ou andamento.
- [x] Considerar feriados locais e regionais na contagem de prazo.
- [x] Permitir evento online com link clicável.
- [x] Reorganizar a agenda para abrir na visão principal `Geral`, com listagem mensal de todos os eventos, tabs `Geral / Calendário / Lista`, filtros inline sempre visíveis e cards-resumo do período.
- [x] Melhorar a configuração de lembretes de evento para não depender de um único aviso.
- [x] Revisar o uso do horário final do evento para conflito de agenda e organização do advogado.
- [x] Criar atalho do prazo principal para abrir a área de prazos do processo.
- [x] Melhorar a responsividade e a leitura da área de prazos no contexto do processo.
- [x] Substituir o conceito operacional de "regime de prazo" por "rito do processo" no fluxo principal.
- [x] Adicionar "tipo legal do prazo" com sugestão automática de fundamento e regra-base por rito.
- [x] Permitir prazo manual mesmo quando o processo ainda não possui regra automática de prazo pelo CPC, evitando bloqueio indevido em fluxos penal e trabalhista.

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
- [x] Deploy de produção atual publicado com sucesso na `main` em 06/04/2026, com check da Vercel concluído para o commit `544c704`.
- [x] `npm run typecheck` executado com sucesso em 07/04/2026.
- [x] `npm run check:mojibake` executado com sucesso em 07/04/2026.
- [x] `npm test` executado com sucesso em 07/04/2026.
- [x] `npm run repo:hygiene` executado com sucesso em 07/04/2026 antes do deploy de produção.
- [x] Deploy de produção atual publicado com sucesso na `main` em 07/04/2026, com status `Ready` na Vercel para o commit `404bea7`.
- [x] `npm run prisma:push` executado com sucesso em 08/04/2026 para sincronizar `procedimentoProcessual` e o catálogo judicial persistido.
- [x] `npm run typecheck` executado com sucesso em 08/04/2026.
- [x] `npm run check:mojibake` executado com sucesso em 08/04/2026.
- [x] `npm test` executado com sucesso em 08/04/2026.

### Suporte e implantação

- [x] Manter chat e pinpad flutuantes visíveis nas rotas de suporte para destravar a implantação assistida.

---

## Pendências técnicas

### Perfil, escritório e notificações

- [ ] Finalizar a integração de notificações por WhatsApp.
- [ ] Refinar os canais ativos por usuário com o WhatsApp fechado no fluxo principal: e-mail, Telegram, WhatsApp e in-app.

### Processos e cadastros

- [ ] Ajustar responsividade para notebooks com resolução 1366x768 em todos os fluxos principais.
- [ ] Permitir vincular partes já existentes sem recadastrar manualmente.
- [ ] Fazer limpeza assistida dos cadastros antigos em que classe processual foi usada como assunto.

### Prazos e agenda

- [ ] Remover ou ocultar a recorrência da agenda para o uso jurídico padrão.

### Petições e modelos

- [ ] Evoluir o módulo de petições para trabalhar com modelos reais em Word.
- [ ] Receber e importar a base de modelos reais da Dra. Dayane para montagem do módulo.

### Integrações e implantação

- [ ] Resolver a reativação e estabilização da integração com o Juiz Brasil.
- [ ] Definir o provedor final da integração de WhatsApp.
- [ ] Avaliar integração com Apple Calendar, caso Google Calendar não seja o calendário principal da usuária.

### Relatórios, cliente e documentos

- [ ] Criar tutorial curto para o cliente anexar documentos.
- [ ] Criar tutoriais curtos por módulo para advogado e equipe.

---

## Pendências de homologação / uso real

### Perfil, escritório e notificações

- [ ] Homologar com a Dra. Dayane a nova auditoria de notificações e validar quais canais devem ser priorizados no uso real.

### Processos e cadastros

- [ ] Garantir que edição e atualização do processo funcionem sem mensagem de erro em fluxo real.
- [ ] Homologar em uso real o novo fluxo de organização de documentos na aba do processo.
- [ ] Homologar em uso real o cadastro de múltiplas partes no novo processo.
- [ ] Homologar em uso real o novo cadastro de cliente com e-mail opcional e acesso inline.
- [ ] Homologar com a Dra. Dayane o novo fluxo de classe processual + assuntos do processo.
- [ ] Homologar com a Dra. Dayane a criação rápida inline de área, classe e assunto no formulário do processo.
- [ ] Homologar com a Dra. Dayane o novo catálogo jurídico padrão de classes e assuntos no cadastro de processos reais.
- [ ] Homologar com a Dra. Dayane a nova linguagem de "Autoridade do caso" e a distinção prática entre autoridade, tribunal e órgão julgador.
- [ ] Confirmar em uso real a experiência de digitação livre no campo "Órgão julgador".
- [ ] Confirmar em uso real o catálogo de áreas padrão já sincronizado no tenant.
- [ ] Homologar em uso real o novo carregamento automático de `Comarca / Seção` por tribunal, incluindo o cenário `TRF1 -> SJPA`.
- [ ] Homologar com a Dra. Dayane o novo modelo `Área do processo + Rito / Procedimento da área`, incluindo o caso penal ordinário.

### Prazos e agenda

- [ ] Homologar com a Dra. Dayane a navegação do prazo principal e a leitura da aba de prazos no processo.
- [ ] Homologar com a Dra. Dayane o novo fluxo de rito do processo e tipo legal do prazo.
- [ ] Homologar com a Dra. Dayane a nova visão principal `Geral` da agenda, validando a leitura mensal de todos os eventos e o uso dos filtros inline no fluxo real.
- [ ] Confirmar em uso real a nova fase processual "Alegações finais" nos cadastros do escritório.

### Relatórios, cliente e documentos

- [ ] Validar o fluxo de primeiro acesso do cliente com envio estável por e-mail no ambiente real.
- [ ] Validar o fluxo para o cliente anexar documentos pelo portal.

### Integrações e implantação

- [ ] Validar novos testes com processos reais e mais movimentados.
- [ ] Manter o fluxo de suporte assistido para implantação quando houver bloqueio técnico no computador da usuária.

---

## Observações

- Neste checklist, `[x]` em **Validado na reunião** ou **Validado com a Dra. Dayane** significa item com evidência operacional.
- Neste checklist, `[x]` em **Validado no código e testes locais** significa item implementado e revisado tecnicamente, mas que ainda pode depender de homologação em uso real.
- O checklist separa explicitamente `pendência técnica` de `homologação / uso real` para evitar falso pendente de item já implementado.
- A revisão de 07/04/2026 incorpora os feedbacks operacionais enviados pela Dra. Dayane após o início do uso real do sistema.
