# Documento Mestre – Assistente Jurídico Proativo e Geração de Peças

## Alerta estratégico imediato

**Na quarta-feira teremos reunião com 3 escritórios que hoje usam 2 sistemas concorrentes diretos.  
Nosso objetivo mínimo é chegar nessa conversa com paridade funcional perceptível nas frentes críticas.**

Paridade mínima exigida para a reunião:

- geração de peças assistida;
- análise documental;
- memória por caso;
- validação de citações;
- pesquisa jurídica assistida;
- governança administrativa da IA;
- trilha auditável de uso;
- narrativa comercial clara sobre o que já está pronto, o que está em rollout e o que entra nas próximas fases.

Decisão de documentação:

- este arquivo passa a ser o **documento único e mestre** da frente de IA jurídica;
- PRD e checklist antigos ficam absorvidos por este documento;
- qualquer planejamento, execução, paridade competitiva e status de entrega deve ser mantido aqui.

Data: 16 de março de 2026  
Status: Documento mestre consolidado para planejamento e execução em escala  
Escopo: criar no Magic Lawyer uma camada de IA jurídica premium, comparável e superior ao pacote de IA do Jusbrasil, integrada ao sistema interno e acessível por botão flutuante contextual.

### Atualização executada em 17 de março de 2026

Já entrou no produto:

- radar auditável de referências;
- briefing jurisprudencial estruturado;
- histórico pesquisável e reabertura de rascunhos;
- exportação e cópia em markdown;
- lastro verificável com processo, causa, documento, memória e referências extraídas;
- reaproveitamento da saída da IA em fluxo nativo por exportação direta para modelos de petição.
- frente de cálculo de sentenças cíveis no Magic AI, com memorial preliminar e leitura de comandos condenatórios.

### Frente derivada aberta: Cálculo de Sentenças Cíveis

Fica aberta como frente formal de paridade competitiva e monetização premium a entrega de:

- leitura de sentença com IA;
- estruturação de memorial preliminar;
- identificação de condenações, indexadores, juros e termo inicial;
- reaproveitamento em petições e cumprimento de sentença.

Documento dedicado:

- [CALCULO_SENTENCAS_CIVEIS_IA.md](./CALCULO_SENTENCAS_CIVEIS_IA.md)

### Prioridade operacional imediata - blindagem de prazos

Prazos são o coração operacional do escritório.

Para a reunião e para a operação real, ficou decidido que alertas de prazo no limite entram como **P0 transversal do produto**, mesmo fora do núcleo de IA. Não é aceitável depender apenas de inbox passiva.

#### O que já existia pronto

- cron oficial de verificação de prazos;
- eventos de prazo crítico (`prazo.expiring_1d`, `prazo.expiring_2h`, `prazo.expired`) e, agora, digest operacional em lista para `30 dias` e `10 dias`;
- notificação in-app via realtime;
- fallback HTTP/polling;
- envio por email;
- centro de notificações e marcação de leitura;
- políticas de criticidade para prazo.

#### O que estava faltando

- Telegram real no novo motor de notificações;
- decisão de produto: operar com **um bot global da plataforma** no Telegram, deixando bot por tenant apenas como override enterprise;
- popup obrigatório na cara do advogado ao entrar;
- confirmação explícita de leitura para alerta crítico;
- cadência forte o suficiente para `H-2` funcionar de verdade;
- onboarding operacional do advogado para receber Telegram;
- priorização formal disso na trilha de produto.

#### Decisão de execução

Entrar agora, nesta ordem:

1. email;
2. in-app;
3. popup obrigatório com “Marcar que li”;
4. Telegram real;
5. WhatsApp fica deliberadamente para depois.

#### Regra fechada em 18 de março de 2026

Os alertas de prazo passam a operar em **3 frentes**:

1. **Frente 1 · Monitoramento**
   - digest operacional em lista para `30 dias`
2. **Frente 2 · Atenção**
   - digest em lista para `10 dias`
   - reforços individuais para `7 dias` e `3 dias`
3. **Frente 3 · Crítica**
   - alertas em `1 dia`, `2 horas` e `vencido`
   - popup obrigatório
   - in-app
   - email
   - Telegram

Regras adicionais obrigatórias:

- quanto mais perto do vencimento, mais forte a cadência;
- o usuário pode marcar que já leu;
- o usuário pode silenciar alertas de prazo de um processo específico;
- o mute é por `tenant + usuário + processo`;
- processo silenciado sai das três frentes, inclusive dos digests;
- o controle precisa existir no popup, na central de notificações e na visão de prazo do processo.

#### Entregas executadas nesta frente

- cron de prazos elevado para execução a cada 15 minutos;
- popup crítico de prazo no shell autenticado;
- confirmação explícita de leitura com gravação no banco;
- canal real de Telegram no novo motor;
- fluxo de conexão do advogado com bot do Telegram via perfil;
- página de preferências preparada para refletir o estado do Telegram;
- notificação em lista para prazos a `30 dias` e `10 dias`, no formato `Cliente - Processo - Prazo final`;
- ampliação da cadência para `7 dias` e `3 dias`, completando a frente de atenção;
- três frentes formalizadas no produto e na comunicação;
- botão de silenciar alertas de prazo por processo;
- popup crítico com ação de silenciar o processo;
- central de notificações com controle de silenciar ou reativar alertas daquele processo;
- aba de prazos do processo com estado do alerta e mute por processo;
- priorização desta frente mantida como obrigatória até estabilização completa.

---

## 1. Decisão de produto

O Magic Lawyer terá um **Assistente Jurídico Proativo** nativo do sistema, com foco em:

- geração de peças;
- análise de documentos;
- pesquisa jurisprudencial assistida;
- validação de citações;
- memória por caso;
- sugestões proativas em processos;
- inteligência jurídica contextual ao tenant e ao caso.

Essa funcionalidade será tratada como produto central de monetização, não como acessório.

---

## 2. O que são "peças" neste contexto

No contexto jurídico, "peças" são documentos jurídicos produzidos para atuação profissional, por exemplo:

- petição inicial;
- contestação;
- réplica;
- recurso;
- manifestação;
- impugnação;
- memoriais;
- contrato;
- parecer;
- notificação extrajudicial;
- requerimento administrativo;
- minuta de documento processual.

No Magic Lawyer, "criar peça" não será um editor solto. Será um fluxo orientado por IA com:

- tipo de peça;
- contexto do caso;
- documentos de apoio;
- tribunal/rito;
- tese principal;
- estratégia;
- citações verificadas;
- versão final editável.

---

## 3. Meta de paridade e superação

Objetivo formal: alcançar paridade funcional com o pacote descrito do Jusbrasil e construir diferenciais nativos do Magic Lawyer.

### 3.1 Paridade alvo

Precisamos cobrir:

- acervo ilimitado de jurisprudência;
- acervo ilimitado de modelos e peças;
- IA jurídica com raciocínio fundamentado;
- pesquisa jurisprudencial assistida por IA;
- análise de conteúdo jurídico;
- geração de peças e documentos;
- validação de citações;
- análise de múltiplos documentos;
- memória/histórico contínuo por caso;
- notícias jurídicas curadas;
- produção ilimitada de peças;
- uploads ilimitados de documentos;
- insights proativos processuais;
- sugestões de ações em processos;
- suporte prioritário;
- prioridade em lançamentos.

### 3.2 Diferenciais que o nosso produto deve ter

- IA ligada ao caso real, cliente real, andamento real e documentos reais do tenant.
- Geração de peça com base no processo do escritório, não em prompt isolado.
- Sugestões proativas sobre prazos, riscos, falhas documentais e próximos passos.
- Auditoria de uso da IA para proteção operacional e jurídica.
- Memória por processo, cliente, contrato e estratégia do escritório.
- Controle por plano, tenant, role, franquia e logs.

---

## 4. Visão de UX

## 4.1 Entrada principal

A experiência será exposta por um **botão flutuante tipo speed dial**, visível nas telas internas autorizadas.

Nome de trabalho:

- `Magic AI`
- `Jus IA`
- `Assistente Jurídico`

Minha recomendação: **Magic AI Jurídica**.

## 4.2 Comportamento do botão

- botão flutuante persistente;
- abre um speed dial vertical;
- cada ação tem ícone + label + tooltip;
- comportamento contextual por tela;
- visual premium, sem parecer chat genérico;
- disponível no shell autenticado;
- não competir com o dock de suporte; precisa coexistir.

## 4.3 Tooltip-mãe do FAB

Texto recomendado:

`Treinada para jurídico. Gere peças, analise documentos e receba sugestões sobre seus processos.`

## 4.4 Ações do speed dial

Conjunto inicial recomendado:

1. `Nova peça`
2. `Analisar documento`
3. `Pesquisar jurisprudência`
4. `Validar citações`
5. `Resumir processo`
6. `Comparar documentos`
7. `Estratégia do caso`
8. `Perguntar à IA`

## 4.5 Comportamento contextual

Se o usuário estiver em `/processos/[id]`, o speed dial deve priorizar:

- resumir processo;
- sugerir próxima ação;
- gerar peça com base no caso;
- validar citações da tese;
- analisar anexos do processo.

Se estiver em `/documentos`, prioriza:

- analisar documento;
- extrair fatos;
- gerar minuta;
- comparar versões;
- identificar cláusulas, riscos ou lacunas.

Se estiver em `/andamentos`, prioriza:

- resumir movimentação;
- sugerir providência;
- gerar minuta de petição ligada ao andamento.

---

## 5. Estrutura de produto por planos

## 5.1 Essencial

Objetivo: consultas confiáveis e tarefas rápidas.

Inclui:

- IA jurídica com uso controlado;
- pesquisa jurisprudencial assistida;
- acervo de modelos e peças;
- geração assistida de documentos;
- validação de citações;
- análise básica de conteúdo;
- limite mensal de mensagens;
- limite de uploads;
- sem memória longa por caso.

## 5.2 Profissional

Objetivo: casos complexos e uso recorrente.

Inclui tudo do Essencial, mais:

- análise de múltiplos documentos;
- memória por caso;
- histórico contínuo;
- raciocínio ampliado;
- notícias jurídicas curadas;
- upload ampliado;
- maior franquia de uso;
- biblioteca premium adicional.

## 5.3 Premium

Objetivo: operação intensiva e atuação proativa.

Inclui tudo do Profissional, mais:

- produção ilimitada de peças;
- mensagens ilimitadas ou franquia muito alta;
- uploads ilimitados;
- insights processuais proativos;
- sugestões de ações em processos;
- suporte prioritário;
- acesso antecipado a novos recursos.

Decisão importante:

- "produção ilimitada de peças" deve ser controle de produto, não promessa cega de custo infinito.
- internamente, precisamos de rate limit, monitoramento de uso, fila e política anti-abuso.

---

## 6. Módulos funcionais que precisamos construir

## 6.1 Geração de peças

Core do produto.

Fluxo ideal:

1. usuário escolhe tipo de peça;
2. sistema pergunta o contexto mínimo necessário;
3. IA lê processo/documentos relacionados;
4. monta estrutura jurídica;
5. sugere fundamentação;
6. valida referências/citações;
7. gera rascunho editável;
8. salva histórico de versões;
9. permite exportar ou enviar para Documentos.

Entradas:

- tipo de peça;
- área do direito;
- tribunal/rito;
- objetivo;
- fatos;
- documentos;
- jurisprudências selecionadas;
- estilo do escritório;
- tom e estratégia.

Saídas:

- peça completa;
- resumo da linha argumentativa;
- citações usadas;
- pontos pendentes de revisão humana;
- score de confiança.

## 6.2 Pesquisa jurisprudencial assistida

Capacidades:

- busca semântica;
- refinamento por tribunal, tema, período, órgão julgador, relator;
- sugestão de termos alternativos;
- síntese dos entendimentos;
- indicação de precedentes favoráveis e contrários;
- aproveitamento na geração da peça.

## 6.3 Validação de citações

Capacidade crítica.

O sistema precisa:

- verificar se a citação existe;
- apontar a fonte;
- marcar nível de confiança;
- rejeitar citação fraca ou não confirmada;
- sinalizar quando a referência foi inferida e não localizada.

Saída mínima:

- `confirmada`
- `parcial`
- `não confirmada`

## 6.4 Análise de documentos

Casos:

- contrato;
- decisão;
- sentença;
- petição adversa;
- edital;
- laudo;
- notificação;
- parecer;
- documento administrativo.

Resultados esperados:

- resumo executivo;
- pontos críticos;
- riscos;
- prazos extraíveis;
- obrigações;
- cláusulas sensíveis;
- inconsistências;
- perguntas sugeridas.

## 6.5 Memória por caso

A IA precisa lembrar:

- fatos relevantes do processo;
- estratégia adotada;
- teses anteriores;
- documentos já anexados;
- preferências do escritório;
- pedidos já formulados;
- última orientação humana relevante.

Essa memória não pode ser um chat solto. Ela deve ser vinculada a entidades do sistema:

- processo;
- cliente;
- contrato;
- documento;
- dossiê de IA.

## 6.6 Insights proativos processuais

O sistema deve sugerir:

- providência processual;
- revisão de documento faltante;
- oportunidade de gerar peça;
- risco de perda de prazo;
- inconsistência entre andamento e ação planejada;
- precedentes úteis para o caso;
- pontos frágeis da tese.

## 6.7 Notícias jurídicas curadas

Não basta agregar notícia.

Precisamos:

- fontes confiáveis;
- categorização por área;
- relevância por perfil do escritório;
- impacto operacional;
- conexão com casos ou temas monitorados.

---

## 7. Guardrails e exigências jurídicas

Essa feature não pode operar como chat genérico.

Obrigatório:

- grounding em fontes e documentos reais;
- separação por tenant;
- trilha de auditoria;
- histórico versionado do prompt;
- versão do modelo usada;
- logs de quem gerou, quando, e a partir de quais insumos;
- indicação clara de que o material exige revisão profissional;
- política de retenção e anonimização quando necessário;
- bloqueio de vazamento entre tenants;
- respeito a LGPD e sigilo profissional.

Regras do produto:

- nenhuma peça deve sair como "final automática" sem revisão humana;
- toda citação usada em peça deve ter trilha verificável;
- toda sugestão crítica deve registrar base factual;
- respostas com baixa confiança precisam sinalizar isso explicitamente.

---

## 8. Arquitetura recomendada

## 8.1 Camadas

1. `UI contextual`
2. `orquestrador jurídico`
3. `retrieval de documentos e jurisprudência`
4. `motor de geração`
5. `validador de citações`
6. `memória por caso`
7. `auditoria e billing`

## 8.2 Entidades novas prováveis

- `AiWorkspaceSession`
- `AiCaseMemory`
- `AiPromptVersion`
- `AiExecutionLog`
- `AiCitationValidation`
- `AiDraftDocument`
- `AiDocumentAnalysis`
- `AiActionSuggestion`
- `AiUsageLedger`

## 8.3 Integrações internas que devem ser reaproveitadas

- processos;
- andamentos;
- documentos;
- clientes;
- contratos;
- jurisprudência;
- notificações;
- billing;
- suporte;
- auditoria.

## 8.4 Integrações externas prováveis

- LLM principal;
- embeddings;
- OCR;
- storage de anexos;
- jurisprudência e doutrina licenciada;
- fonte de notícias jurídicas.

---

## 9. Governança de prompts

Precisamos tratar prompt como ativo versionado.

Obrigatório:

- prompts por tarefa;
- versão publicada;
- changelog;
- avaliação por casos de teste;
- rollback;
- ajuste por área do direito;
- ajuste por tipo de peça;
- ajuste por tribunal/rito;
- ajuste por perfil do tenant.

Prompt único para tudo é erro de arquitetura.

Precisaremos ao menos destes conjuntos:

- `geração de peça`
- `análise documental`
- `pesquisa jurisprudencial`
- `validação de citação`
- `resumo processual`
- `sugestão de ação`
- `memória e continuidade`

---

## 10. Catálogo inicial do speed dial

| Ação | Objetivo | Entrada principal | Saída |
| --- | --- | --- | --- |
| Nova peça | Produzir minuta estruturada | processo, tipo de peça, documentos | rascunho editável |
| Analisar documento | Extrair riscos e síntese | documento/anexo | resumo + alertas |
| Pesquisar jurisprudência | Encontrar precedentes úteis | tese/tema/caso | lista + síntese |
| Validar citações | Confirmar referências | texto/citação | status + fonte |
| Resumir processo | Leitura rápida do caso | processo | resumo executivo |
| Comparar documentos | Ver diferenças relevantes | 2+ documentos | delta + impactos |
| Estratégia do caso | Avaliar linha de atuação | processo + tese | plano sugerido |
| Perguntar à IA | Uso livre controlado | pergunta + contexto | resposta fundamentada |

---

## 11. Ordem correta de implementação

## Fase 1 – Fundação

- botão flutuante com speed dial e tooltips;
- painel/modal do assistente;
- controle de permissão por plano;
- auditoria de uso;
- usage ledger;
- infraestrutura de prompts;
- anexos e contexto manual.

## Fase 2 – Valor real

- geração de peças;
- análise de documentos;
- resumo processual;
- validação de citações;
- memória por caso.

## Fase 3 – Inteligência conectada

- jurisprudência assistida;
- ingestão de múltiplos documentos;
- biblioteca de modelos premium;
- reuso de contexto por tenant e área.

## Fase 4 – Proatividade

- sugestões automáticas em processos;
- insights processuais;
- alertas jurídicos inteligentes;
- notícias curadas;
- priorização por risco/oportunidade.

## Fase 5 – Comercialização madura

- tiers Essencial / Profissional / Premium;
- limites e franquias;
- billing integrado;
- oferta no painel do tenant;
- upgrade self-service;
- telemetria por recurso.

---

## 12. Critérios de aceite

O projeto só é considerado bem implementado quando:

- o usuário consegue abrir o assistente de qualquer tela autorizada;
- o assistente entende contexto do módulo atual;
- a geração de peça produz documento útil e auditável;
- as citações possuem verificação;
- o uso é cobrado/controlado por plano;
- nada vaza entre tenants;
- o admin consegue auditar uso, custo, volume e erros;
- o suporte consegue diagnosticar falhas;
- a UX parece produto premium, não modal improvisado.

---

## 13. Riscos que precisam ser controlados

- hallucination jurídica;
- citação falsa;
- peça com fundamentação fraca;
- vazamento entre tenants;
- custo excessivo por uso descontrolado;
- excesso de confiança do usuário;
- falta de trilha auditável;
- UI invasiva ou poluída;
- latência alta em documentos grandes.

---

## 14. Decisões firmadas nesta ata

- Teremos sim geração de peças com IA.
- A feature será tratada como motor premium do produto.
- O acesso principal será por botão flutuante com speed dial e tooltip.
- O botão será contextual às telas internas.
- A solução precisa ser treinada/orquestrada para jurídico.
- Prompt e regra de negócio poderão e deverão evoluir por versão.
- Nada crítico sairá sem trilha, validação e revisão humana.

---

## 15. Próximos entregáveis de documentação

Após esta ata, os próximos documentos devem ser:

1. `PRD_ASSISTENTE_JURIDICO.md`
2. `ARQUITETURA_ASSISTENTE_JURIDICO.md`
3. `CHECKLIST_IMPLEMENTACAO_SPEED_DIAL_IA.md`
4. `MATRIZ_PLANOS_IA_JURIDICA.md`
5. `PROMPT_GOVERNANCE_IA_JURIDICA.md`
6. `TEST_PLAN_IA_JURIDICA.md`

---

## 16. Ponto de partida técnico do repositório

O repositório já possui base reaproveitável para essa visão:

- shell autenticado com docks flutuantes;
- suporte/chat flutuante;
- documentos;
- processos;
- andamentos;
- relatórios;
- auditoria;
- billing;
- features já documentadas de FAB e OCR/IA.

Isso reduz o risco. O que falta agora não é conceito. É execução disciplinada.

---

## 17. Mapa competitivo prático

Objetivo desta seção: separar o que vale copiar de concorrentes diretos e o que deve virar diferencial nativo do Magic Lawyer.

### 17.1 Concorrente A: Jus IA / Jusbrasil

Resumo real:

- o Jus IA é uma camada de IA jurídica apoiada em base própria do Jusbrasil;
- ele é fortemente orientado a pesquisa, referências verificáveis, geração de documentos e memória por caso;
- o produto é vendido como assistente jurídico pronto para o advogado brasileiro, não como IA genérica.

#### Copiar do Jus

1. **Validação de citações com lastro visível**
- O Jus IA destaca a verificação automática de citações diretamente na base do Jusbrasil.
- Isso é uma feature crítica para confiança jurídica.
- No Magic Lawyer, isso precisa existir com status claro por referência:
  - encontrada;
  - parcial;
  - frágil;
  - não confirmada.

2. **Casos com memória persistente**
- O Jus IA já organiza interações por “casos”, com contexto contínuo e documentos persistidos.
- Isso confirma que memória por caso não é luxo; é núcleo de produto.
- No Magic Lawyer, a memória deve ser mais forte porque já temos processo, cliente, documentos e trilha interna.

3. **Pesquisa jurídica conversacional com fonte**
- O Jus IA vende a ideia de responder com base jurídica verificável e links para conferência.
- O que precisamos copiar aqui não é o chat em si, e sim:
  - pesquisa assistida por tese;
  - sugestão de termos de busca;
  - recorte por tribunal;
  - referência rastreável.

4. **Análise de documentos como tarefa principal**
- O Jus IA trata análise documental como fluxo central, não como acessório.
- Isso reforça que nosso `Analisar documento` precisa virar produto de verdade:
  - resumo;
  - fatos;
  - riscos;
  - obrigações;
  - pontos para peça.

5. **Onboarding e educação contínua**
- O Jus IA Academy mostra que o produto é ensinado, não só entregue.
- Precisamos copiar isso com:
  - biblioteca de casos de uso;
  - guias rápidos;
  - onboarding por role;
  - vídeos/tooltips de uso seguro.

#### O que o Jus tem e nós ainda não temos no mesmo nível

- base própria massiva de jurisprudência e conteúdo jurídico para retrieval;
- validação de referências já percebida como produto maduro;
- espaços/casos compartilhados com memória persistente multi-interação;
- experiência mais pronta para pesquisa conversacional jurídica;
- camada educacional e marketing da IA mais madura.

#### O que não devemos copiar cegamente do Jus

- experiência excessivamente centrada em chat solto;
- fluxo que começa na pergunta e só depois tenta achar o caso;
- promessa implícita de confiança alta sem mostrar a trilha operacional do escritório.

Decisão para o Magic Lawyer:

- nosso eixo deve ser **caso primeiro, processo primeiro, tenant primeiro**;
- o chat é interface, não o produto principal;
- o diferencial precisa ser contexto operacional interno + auditoria + cobrança por plano.

### 17.2 Concorrente B: CPJ-3C / Preâmbulo

Resumo real:

- o CPJ-3C é um software jurídico orientado a operações estruturadas e escritórios maiores;
- a proposta é ERP jurídico pesado, com controladoria, workflow, financeiro, BI, publicações, andamentos e integrações;
- a comunicação deles foca escala, previsibilidade, automação e operação de grande porte.

#### Copiar do CPJ-3C

1. **Workflow jurídico parametrizável**
- O CPJ-3C enfatiza workflow automatizado e encadeamento de tarefas.
- Isso é crítico e ainda não está maduro no nosso produto no mesmo nível.
- Precisamos copiar:
  - regras por evento;
  - geração automática de tarefa;
  - responsáveis por etapa;
  - SLA por operação;
  - visão de gargalo.

2. **Controladoria de alta performance**
- O CPJ-3C se posiciona como ferramenta de previsibilidade operacional.
- O que vale copiar:
  - visão de publicações distribuídas;
  - prazos com inteligência operacional;
  - fila de trabalho;
  - indicadores por equipe, área e célula.

3. **Financeiro realmente conectado ao jurídico**
- A Preâmbulo comunica “financeiro 100% integrado”.
- Precisamos perseguir esse mesmo nível de integração:
  - evento jurídico impactando cobrança;
  - evento de cobrança impactando operação;
  - leitura unificada de rentabilidade por cliente, processo e escritório.

4. **Portal / app do cliente realmente produto**
- O CPJ Connect é vendido como área exclusiva de cliente com marca do escritório.
- Aqui vale copiar:
  - experiência mobile-first;
  - acompanhamento simplificado;
  - percepção premium para o cliente final;
  - comunicação proativa e não só consulta passiva.

5. **Automação operacional profunda**
- A comunicação do CPJ inclui distribuição de publicações, workflow, captura de andamentos e até protocolo eletrônico em conteúdos de apoio.
- O Magic Lawyer precisa copiar essa ambição operacional:
  - menos clique manual;
  - menos secretaria operando no braço;
  - mais automação por evento.
- Essa frente agora tem documento dedicado de execução em [PROTOCOLO_JURIDICO_AUTOMATIZADO.md](../PROTOCOLO_JURIDICO_AUTOMATIZADO.md).

6. **Ecossistema de produtos acoplados**
- O CPJ aparece conectado a CPJ Connect, CPJ-Cobrança e outras soluções via API.
- Isso reforça que nosso produto também precisa ser pensado como ecossistema:
  - core processual;
  - IA;
  - cobrança;
  - cliente;
  - integrações.

#### O que o CPJ-3C tem e nós ainda não temos no mesmo nível

- workflow jurídico realmente profundo e parametrizável;
- controladoria jurídica orientada a escala de grandes bancas;
- distribuição operacional de publicações com encadeamento;
- produto de cliente/mobile mais claramente empacotado;
- ecossistema maduro de módulos acoplados;
- percepção de robustez para operações jurídicas pesadas.
- protocolo juridico automatizado ponta a ponta com recibo real de tribunal.

#### O que não devemos copiar cegamente do CPJ-3C

- UX pesada e excessivamente ERP onde isso prejudique adoção;
- complexidade de implantação antes de consolidar a base do produto;
- customização infinita sem padrão de produto;
- foco só em controladoria e backoffice, deixando a experiência premium do advogado para trás.

Decisão para o Magic Lawyer:

- copiar a profundidade operacional;
- não copiar a sensação de sistema antigo/pesado;
- fazer a mesma robustez com uma experiência mais moderna, contextual e orientada a produto SaaS.

### 17.3 Leitura honesta do claim de mercado do CPJ-3C

Existe material da própria Preâmbulo dizendo que:

- o CPJ-3C gerencia **mais de 11 milhões de processos**;
- em conteúdo de blog da empresa, eles afirmam que **cerca de 20% dos processos jurídicos do país** tramitam no sistema.

Decisão de leitura:

- tratar isso como **claim comercial do próprio fornecedor**, não como verdade regulatória independente;
- é um indicativo forte de relevância de mercado;
- não devemos repetir esse número externamente sem o devido contexto e sem fonte explícita.

### 17.4 O que isso significa para a nossa estratégia

#### Copiar do Jus

- referências verificáveis;
- casos com memória;
- análise documental forte;
- pesquisa jurídica assistida;
- produto educado/onboarded.

#### Copiar do CPJ-3C

- workflow jurídico profundo;
- controladoria operacional;
- integração jurídico + financeiro;
- portal/app de cliente mais robusto;
- automação por evento em escala.

#### O que deve ser diferencial do Magic Lawyer

- multi-tenant white label nativo;
- IA conectada ao caso real do escritório;
- cockpit administrativo com monetização premium;
- auditoria forte por uso, prompt, sessão, email, cron e webhook;
- experiência moderna, contextual e mais agradável que ERP jurídico clássico.

### 17.5 Lista objetiva do que eles oferecem e nós ainda precisamos implementar

1. Retrieval jurídico robusto com fontes verificáveis em escala.
2. Validação de citações madura como produto principal.
3. Casos compartilhados com memória persistente forte.
4. Pesquisa jurisprudencial assistida com lastro real.
5. Workflow jurídico parametrizável por evento.
6. Controladoria jurídica orientada a operação pesada.
7. Portal/app de cliente mais forte e mais nativo.
8. Ecossistema mais amarrado entre jurídico, cobrança, cliente e automação.
9. Educação de produto e onboarding específico da IA.
10. Posicionamento comercial mais claro para grandes bancas e operação enterprise.
11. Protocolo jurídico automatizado como módulo comercializável com preço por faixa/uso.

### 17.5.1 Frente derivada aberta agora: Protocolo Juridico Automatizado

Para responder diretamente ao gap do CPJ-3C / Preâmbulo, fica aberta a frente formal de **Protocolo Juridico Automatizado**, com documento dedicado em:

- [PROTOCOLO_JURIDICO_AUTOMATIZADO.md](../PROTOCOLO_JURIDICO_AUTOMATIZADO.md)

Esse documento foi reforcado para ficar **pre-pronto para execucao**, incluindo:

- leitura do SKU comercial da Preâmbulo;
- espelho de monetizacao por faixa;
- integracao real com peticoes, processos, certificado, auditoria, notificacoes e billing;
- backlog tecnico de dominio + workflow + adaptadores por tribunal.

Essa frente deve nascer integrada a:

- peticoes;
- certificados A1;
- workflow;
- auditoria;
- notificacoes;
- billing/pacotes.

E so pode ser considerada pronta quando houver:

- adaptador real de tribunal;
- protocolo real;
- recibo real;
- trilha auditavel;
- cobranca integrada.

### 17.6 Fontes oficiais consultadas

- Jus IA: https://ia.jusbrasil.com.br/
- Planos Jus IA: https://ia.jusbrasil.com.br/planos
- Validação de referências no Jus IA: https://suporte.jusbrasil.com.br/hc/pt-br/articles/35777133815700-Como-analisar-refer%C3%AAncias-com-o-Jus-IA
- Casos no Jus IA: https://ia.jusbrasil.com.br/jusia-academy/como-usar-a-funcionalidade-de-casos-no-jus-ia/5635776528
- Atualizações do Jus IA: https://ia.jusbrasil.com.br/jusia-academy/jusbrasil-explica-evolucoes-e-melhores-casos-de-uso-do-jus-ia/5553303794
- Validação automática de citações do Jus IA: https://justech.jusbrasil.com.br/post/validacao-automatica-de-citacoes-mais-seguranca-nas-respostas-do-jus-ia
- CPJ-3C produto: https://preambulo.com.br/software-cpj-3c/
- CPJ-3C produto / CPJ Connect: https://preambulo.com.br/cpj-3c
- CPJ-3C mais utilizado / financeiro / workflow: https://conteudo.preambulo.com.br/cpj-3c-software-juridico-mais-utilizado-do-brasil
- Gestão jurídica com CPJ-3C: https://preambulo.com.br/blog/cpj-3c-gestao-juridica-de-escritorios/
- Protocolo eletrônico e automação: https://preambulo.com.br/blog/protocolo-eletronico/
- CPJ-Cobrança integrado: https://preambulo.com.br/blog/cpj-cobranca-juridica-extrajudicial/

---

## 18. Status executado no produto

### 18.1 Já implementado

- botão flutuante com speed dial contextual no tenant e no admin;
- workspace tenant para:
  - peças;
  - análise documental;
  - perguntas;
  - estratégia;
  - resumo processual;
  - validação de citações;
  - briefing de pesquisa;
- sessão auditável de IA;
- usage ledger por tipo de uso;
- governança de prompts no admin;
- cockpit admin com adoção, custo, execuções e telemetria;
- governança de rollout por tenant dentro do cockpit admin com:
  - estágio por escritório;
  - override temporário de tier;
  - liberação granular por tarefa;
  - dono operacional, notas e próxima revisão;
- memória por caso vinculada a processo;
- controle por plano;
- leitura comercial dentro do próprio workspace do tenant com:
  - próximo tier recomendado;
  - piloto premium quando houver override;
  - CTA direto para billing do escritório;
- telemetria de abertura do FAB, clique no dock e abertura do workspace;
- radar de referências no resultado de validação de citações;
- briefing jurisprudencial estruturado com:
  - consultas principais;
  - consultas alternativas;
  - tribunais-alvo;
  - ângulos favoráveis;
  - ângulos contrários;
  - checklist de validação;
- histórico pesquisável no workspace;
- reabertura de rascunhos salvos no painel de histórico;
- copiar e baixar saída em markdown direto do resultado;
- geração de peça mais robusta com:
  - bases utilizadas;
  - pontos de prova;
  - contrapontos;
  - checklist mais forte de revisão;
- retrieval jurídico verificável v1 com:
  - links clicáveis para processo, causa, documento, memória e modelo interno;
  - links oficiais para diplomas relevantes no Planalto;
  - links públicos de pesquisa jurisprudencial em tribunais e cortes superiores;
  - lastro exibido no próprio resultado do workspace;
- confirmação externa assistida de citações com:
  - checagem automática da fonte oficial quando houver link direto;
  - confirmação textual do artigo/dispositivo em diplomas oficiais do Planalto;
  - confirmação automática em base oficial agregada do LexML quando houver match de busca;
  - distinção entre fonte oficial confirmada, match em base oficial, portal oficial com restrição, fonte oficial sem match, link oficial de pesquisa e fonte indisponível;
  - degradação segura quando a confirmação externa não puder ser feita;
- snapshot de verificação persistido no log da execução de IA;
- reaproveitamento nativo da saída em:
  - modelos de petição;
  - petições do escritório como rascunho operacional;
  - documentos do processo em markdown rastreável dentro do acervo do tenant;
- regra operacional de processo monitorado:
  - toda nova movimentação descoberta por captura manual, sync em background, cron ou integração futura com Jusbrasil deve ser persistida no processo;
  - toda nova movimentação em processo já monitorado deve notificar todos os advogados vinculados ao processo;
  - primeira importação pode absorver histórico sem bombardear o time, mas a partir do momento em que o processo já está dentro do escritório, qualquer movimentação nova vira evento operacional e notificação;
- bloqueio real por task no backend e na UI conforme rollout do tenant;
- relatório executivo em MD para comunicação interna e WhatsApp.

### 18.2 Em implementação prioritária

- validação de citações em nível mais maduro e defensável, com enriquecimento de fontes e confirmação externa mais profunda;
- pesquisa jurisprudencial assistida com lastro mais profundo e cobertura ampliada;
- reaproveitamento da saída da IA em fluxos nativos adicionais do sistema;
- onboarding de produto e segurança de uso mais profundos;
- evolução do portal do cliente e da camada proativa.

### 18.3 Ainda não podemos vender como paridade plena

- jurisprudência ilimitada com base própria validada;
- validação automática de citações em escala com fonte externa confirmada;
- workflow jurídico profundo estilo ERP pesado;
- controladoria jurídica enterprise;
- portal/app do cliente no mesmo nível de robustez dos líderes maduros;
- notícias jurídicas curadas como produto recorrente.

## 19. Integrações necessárias para eliminar manualidade onde ela não agrega valor

### 19.1 Já integradas ou em uso

- Planalto para diplomas oficiais;
- portais oficiais de tribunais quando houver rota pública verificável;
- buscas oficiais específicas já mapeadas para STJ, STF, TST e TSE;
- LexML Brasil como base oficial agregada para reforço de conferência automática em legislação e jurisprudência;
- acervo interno do tenant: processos, documentos, memórias e modelos.

### 19.2 Gratuitas que ainda devemos aprofundar

- expandir confirmação automática em cortes com busca oficial previsível;
- aprofundar extração automática em STJ, STF, TST, TSE e tribunais com endpoints públicos estáveis;
- consolidar extração automática de metadados de resultados oficiais para reduzir revisão humana.

### 19.3 Pagas ou estruturais para paridade plena

- licenciamento ou construção de base jurídica massiva própria para retrieval e verificação em escala;
- índice próprio de inteiro teor de julgados, legislação, doutrina e peças com atualização contínua;
- eventual contratação de fonte premium de conteúdo jurídico estruturado, caso a estratégia escolhida não seja montar corpus proprietário;
- infraestrutura de navegação/browser automation resiliente para portais oficiais protegidos por WAF ou anti-bot quando a base pública não entregar API ou HTML estável.

### 19.4 Regra de produto

- manual fica apenas no que exige juízo jurídico humano;
- pesquisa operacional repetitiva, confirmação de existência de fonte e rastreio de referência devem ser automatizados sempre que houver base oficial ou acervo confiável disponível.
- o mesmo vale para andamentos e movimentações processuais: descobrir, persistir e notificar é obrigação do sistema; decidir a estratégia jurídica continua sendo obrigação humana.
