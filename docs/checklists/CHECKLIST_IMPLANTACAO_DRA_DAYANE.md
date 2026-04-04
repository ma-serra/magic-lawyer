# ✅ Checklist de Implantação - Dra. Dayane

Este documento consolida apenas itens de trabalho levantados na reunião de implantação com a Dra. Dayane.

Use este checklist para validar o que já foi entregue, o que já foi testado e o que ainda está pendente.

### 🔗 **CHECKLISTS RELACIONADOS:**
- **[CHECKLIST_TOTAL_MAGICLAWYER.md](./CHECKLIST_TOTAL_MAGICLAWYER.md)** - checklist global do produto e referência principal de progresso

**Última atualização:** 03/04/2026  
**Origem:** reunião de implantação com a Dra. Dayane  
**Status:** validação técnica concluída e validação operacional em andamento

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

- [x] Permitir editar partes vinculadas ao processo sem remover o vinculo.
- [x] Corrigir a exibicao do grau do processo nas listagens e formularios.

### Prazos e agenda

- [x] Fazer o prazo criado no cadastro do processo aparecer corretamente na central de prazos.
- [x] Permitir vincular prazo a audiência, evento ou andamento.
- [x] Considerar feriados locais e regionais na contagem de prazo.
- [x] Permitir evento online com link clicável.
- [x] Melhorar a configuração de lembretes de evento para não depender de um único aviso.
- [x] Revisar o uso do horário final do evento para conflito de agenda e organização do advogado.

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
- [x] Deploy de producao versionado e publicado em 03/04/2026 (`1.0.14-beta.5`).

### Suporte e implantacao

- [x] Manter chat e pinpad flutuante visiveis nas rotas de suporte para destravar a implantacao assistida.

---

## 📋 Pendências ou itens que ainda exigem validação operacional

### Perfil, escritório e notificações

- [ ] Melhorar o texto das notificações para sempre mostrar cliente ou parte, além do número do processo.
- [ ] Finalizar a integração de notificações por WhatsApp.
- [ ] Refinar os canais ativos por usuário: e-mail, Telegram, WhatsApp e in-app.

### Processos e cadastros

- [ ] Ajustar responsividade para notebooks com resolução 1366x768.
- [ ] Garantir que edição e atualização do processo funcionem sem mensagem de erro em fluxo real.
- [ ] Permitir vincular partes já existentes sem recadastrar manualmente.

### Prazos e agenda

- [ ] Revisar a nomenclatura "regime de prazo" para um termo mais claro no contexto jurídico.
- [ ] Remover ou ocultar a recorrência da agenda para o uso jurídico padrão.

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

- Nesta atualização, `[x]` significa item validado em reunião, no produto por leitura de código ou por testes locais.
- O checklist usa dois níveis: validação técnica e validação operacional.
- "Feito no código" não significa que o item já foi homologado pela Dra. Dayane em uso real.
- Itens marcados como pendentes podem já ter backend ou UI parcial, mas ainda exigem validação operacional, ajuste fino de UX ou integração externa.
- A validação técnica de 03/04/2026 considerou principalmente leitura de código, fluxos internos e testes locais do projeto.
