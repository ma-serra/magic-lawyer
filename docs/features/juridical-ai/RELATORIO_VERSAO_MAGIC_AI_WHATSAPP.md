# Relatorio Executivo - Magic AI Juridica

Data base: 18 de marco de 2026
Status: documento vivo da versao em desenvolvimento
Uso recomendado: resumo para WhatsApp, alinhamento interno e checkpoint de release

## Atualizacao complementar - 18 de marco de 2026 (calculo de sentencas civeis)

Entrou uma frente nova e muito relevante no Magic AI:

- o workspace ganhou a aba `Calculos`;
- nasceu a tarefa dedicada `SENTENCE_CALCULATION`;
- o sistema agora consegue ler o dispositivo da sentenca e separar itens condenatorios;
- a IA passou a identificar natureza do comando, valor mencionado, indexador, juros, termo inicial e dependencias de calculo;
- o resultado agora monta um **memorial preliminar de calculo** em markdown;
- a tela passou a separar:
  - itens que ja entram no memorial;
  - insumos obrigatorios ainda faltantes;
  - pontos de revisao humana obrigatoria;
- a frente foi documentada como produto em `CALCULO_SENTENCAS_CIVEIS_IA.md`.

Leitura executiva:

- isso aproxima o Magic Lawyer de uma dor muito concreta de cumprimento de sentenca;
- a frente deixa de ser so IA textual e entra em territorio de ganho operacional real;
- o produto fica mais forte para escritorio que quer reduzir trabalho manual na leitura de sentencas e preparacao de memoriais.

## Atualizacao complementar - 18 de marco de 2026 (blindagem de prazos)

Entrou uma frente operacional critica paralela:

- o cron de prazos deixou de ser diario e passou a rodar a cada 15 minutos, para que o alerta `H-2` seja real e nao decorativo;
- alertas criticos de prazo agora geram popup obrigatorio ao entrar no sistema, com acao explicita de `Marcar que li`;
- o popup grava leitura no banco, em vez de ser so aviso visual;
- o novo motor de notificacoes passou a suportar Telegram de verdade;
- o advogado agora consegue conectar seu Telegram no perfil usando o bot do escritorio;
- as preferencias de notificacao passaram a refletir o estado do Telegram;
- os alertas de horizonte deixaram de ser aviso unitario solto e passaram a sair em lista, para `30 dias` e `10 dias`, no formato `Cliente - Processo - Prazo final`;
- a malha foi fechada em **3 frentes de prazo**:
  - `Frente 1 · Monitoramento`: 30 dias
  - `Frente 2 · Atencao`: 10 dias, 7 dias e 3 dias
  - `Frente 3 · Critica`: 1 dia, 2 horas e vencido
- o usuario agora pode **silenciar alertas de prazo por processo**, sem desligar o resto do escritorio;
- processo silenciado sai inclusive dos digests daquele usuario;
- o controle de silenciar ou reativar entrou no popup critico, na central de notificacoes e dentro da aba de prazos do processo;
- WhatsApp foi mantido fora desta rodada de forma deliberada.

Leitura executiva:

- email e in-app ja existiam;
- popup obrigatorio e Telegram real eram lacunas;
- agora a blindagem de prazo ficou mais compativel com a gravidade operacional do escritorio;
- o advogado ganhou controle fino por processo, sem perder a escalada forte dos casos realmente ativos.

## Atualizacao complementar - 17 de marco de 2026

Entrou mais uma camada critica no Magic AI:

- o resultado da IA agora mostra **lastro e fontes verificaveis** com processo, causa, documento, memoria do caso, modelo interno e referencias extraidas;
- esse lastro agora ficou **clicavel e verificavel**, com links internos do tenant e links oficiais externos para diplomas e pesquisa jurisprudencial;
- a validacao de citacoes agora ganhou **confirmacao externa assistida de verdade**, buscando a fonte oficial e, nos diplomas legais, confirmando o artigo/dispositivo no texto retornado;
- a jurisprudencia agora tambem pode ganhar **match automatico em base oficial agregada**, usando o LexML quando houver correspondencia de busca;
- o sistema agora diferencia quando o **portal oficial esta online**, quando houve **match em base oficial** e quando a fonte oficial esta **protegida por restricao automatizada**, em vez de mascarar isso como indisponibilidade genérica;
- a saida da IA passou a ser reaproveitavel em fluxo nativo do produto via **exportacao direta para Modelos de Peticao**;
- a saida da IA agora tambem pode virar **Documento do processo**, em markdown rastreavel dentro do acervo do tenant;
- o workspace ficou mais defensavel para demo com escritorio, porque a narrativa saiu de "texto gerado" para "texto gerado com origem rastreavel dentro do tenant".

Valor pratico desta rodada:

- melhora percepcao de seguranca juridica;
- aproxima a funcionalidade do que concorrentes maduros vendem como IA fundamentada;
- conecta o Magic AI ao acervo operacional real do escritorio, em vez de deixar a saida isolada.
- cria uma primeira camada concreta de verificacao juridica assistida, sem depender so do discurso comercial.
- melhora a defensabilidade da demo, porque a citacao nao fica apenas "confirmavel"; ela passa a carregar estado de verificacao externa quando a fonte oficial responde.

## Mensagem curta para WhatsApp

Pessoal, nesta versao avancamos forte na frente de IA juridica do Magic Lawyer.

O que entrou:

- consolidamos a frente inteira em um documento mestre unico;
- o Magic AI ganhou validacao auditavel de citacoes com radar de referencias;
- a pesquisa juridica agora gera briefing estruturado, com consultas, tribunais-alvo, angulos favoraveis e checklist de validacao;
- o workspace ficou mais operacional, com historico pesquisavel, reabertura de rascunhos e exportacao/copia da saida em markdown;
- a geracao de pecas ficou mais forte, com bases utilizadas, pontos de prova, contrapontos e checklist de revisao;
- o resultado passou a exibir lastro verificavel do proprio tenant;
- o resultado passou a exibir links verificaveis para fonte interna e oficial;
- a saida da IA agora pode virar modelo nativo do sistema com um clique;
- a saida da IA agora tambem pode virar peticao interna do escritorio, como rascunho operacional ligado ao processo;
- a saida da IA agora tambem pode virar documento nativo do escritorio, entrando em `Documentos` e no processo vinculado;
- o fluxo tenant/admin do Magic AI foi validado com testes e2e.

Leitura executiva:

- ja temos demonstracao competitiva boa para peca, analise, memoria, citacoes e pesquisa guiada;
- ainda faltam fontes juridicas verificaveis em retrieval real para falar em paridade plena com lideres maduros;
- a proxima frente e conectar isso mais fundo ao acervo, documentos e fluxos nativos do sistema.

## Objetivo desta versao

Chegar na reuniao de quarta-feira com percepcao clara de paridade nas frentes criticas do assistente juridico:

- geracao de pecas;
- analise documental;
- memoria por caso;
- validacao de citacoes;
- pesquisa juridica assistida;
- governanca administrativa;
- trilha auditavel;
- narrativa comercial forte.

## Entregas executadas

### 1. Documento mestre consolidado

Arquivo principal:

- `docs/features/juridical-ai/ATA_ASSISTENTE_JURIDICO_PROATIVO.md`

Decisao aplicada:

- a ata virou documento unico e mestre;
- PRD e checklist antigos ficaram absorvidos;
- o topo do documento agora registra a urgencia estrategica da reuniao de quarta-feira.

### 2. Validacao de citacoes com radar auditavel

O motor local da IA agora classifica referencias por tipo e confiabilidade:

- legal;
- jurisprudencial;
- doutrinaria.

Status aplicados:

- `CONFIRMAVEL`
- `INCOMPLETA`
- `FRAGIL`

Valor pratico:

- diminui risco de usar citacao frouxa em peca;
- melhora a narrativa de seguranca juridica do produto;
- cria base para evoluir depois para validacao com fonte externa.

### 3. Briefing jurisprudencial estruturado

Antes:

- a pesquisa era mais generica e textual.

Agora:

- objetivo da pesquisa;
- consultas principais;
- consultas alternativas;
- tribunais-alvo;
- angulos favoraveis;
- angulos contrarios;
- checklist de validacao.

Valor pratico:

- o advogado nao recebe so "texto de IA";
- recebe plano de busca juridica aproveitavel na rotina.

### 4. Geracao de pecas mais robusta

O rascunho passou a trazer:

- bases utilizadas;
- contexto do processo mais completo;
- pontos de prova e sustentacao;
- riscos e contrapontos;
- checklist de pedidos e providencias;
- observacoes do escritorio.

Valor pratico:

- a peca ficou mais proxima de um fluxo juridico real;
- melhora demonstracao para escritorio exigente;
- reduz cara de "texto generico de chat".

### 5. Workspace mais operacional

Entrou no proprio Magic AI:

- historico pesquisavel;
- filtros por sessoes, rascunhos e memorias;
- reabertura de rascunhos salvos;
- copia do markdown;
- download em `.md`.

Valor pratico:

- transforma a IA em ferramenta de trabalho, nao so experimento;
- facilita revisao, reaproveitamento e auditoria;
- melhora a historia comercial da funcionalidade premium.

### 6. Governanca e demonstracao

Continuamos com:

- prompt governance no admin;
- cockpit administrativo de uso;
- trilha auditavel de interacao;
- speed dial contextual no tenant e no admin.

Entrou forte nesta rodada:

- rollout por tenant dentro do admin da IA;
- estágio por escritório com política própria;
- override temporário de tier para piloto comercial;
- liberação granular por tarefa;
- dono da operação, notas e próxima revisão;
- leitura de onboarding por tenant no cockpit.

Valor prático:

- o produto passou a ter governança real de expansão;
- conseguimos demonstrar piloto premium sem mexer no plano-base do escritório;
- a liberação deixou de ser "tudo ou nada" e passou a ser controlada por tarefa.

### 7. Lastro verificavel e reaproveitamento nativo

Entrou nesta rodada:

- processo vinculado como ancora do resultado;
- causas do catalogo vinculadas como base de tese e pesquisa;
- documentos internos do processo como prova de sustentacao;
- memoria do caso como continuidade estrategica;
- referencias extraidas do proprio texto com classificacao de rastreabilidade;
- links oficiais para:
  - Constituicao Federal;
  - CPC;
  - CDC;
  - CLT;
  - CPP;
  - Codigo Civil;
  - Codigo Penal;
- links publicos de pesquisa para STJ, STF, TST, TSE e tribunais com pagina publica configurada;
- verificacao automatica de disponibilidade da fonte oficial quando houver link externo direto;
- status adicional de verificacao externa por referencia:
  - `Fonte oficial online`
  - `Match em base oficial`
  - `Portal oficial com restricao`
  - `Fonte sem match`
  - `Pesquisa oficial`
  - `Fonte indisponivel`
  - `Sem confirmacao externa`
- persistencia de snapshot de verificacao no log da execucao;
- exportacao do rascunho auditavel para `ModeloPeticao`.
- exportacao do rascunho auditavel para `Peticao`, com processo vinculado e trilha de origem.
- exportacao do rascunho auditavel para `Documento`, com upload estruturado e vinculo ao processo quando houver.
- leitura comercial no workspace do tenant com:
  - plano atual;
  - piloto premium quando existir override;
  - próximo tier recomendado;
  - CTA direto para billing.
- bloqueio real de tarefas e do workspace conforme rollout do tenant, refletindo tanto na UI quanto nas actions server-side.
- regra operacional reforçada para processo monitorado:
  - toda movimentação nova descoberta por captura manual, sync em background, cron ou integração futura deve entrar no sistema;
  - toda movimentação nova em processo já monitorado agora pode disparar notificação para todos os advogados vinculados ao processo, não só responsável isolado.

Valor pratico:

- a IA fica mais proxima de uma ferramenta de escritorio e menos parecida com um chat generico;
- o resultado agora pode entrar no acervo operacional do tenant;
- o rascunho agora consegue entrar no fluxo real de peticoes do escritorio;
- a necessidade de busca manual caiu mais um degrau, porque parte das referencias juridicas agora ja volta com confirmacao automatica em fonte oficial ou base oficial agregada;
- quando o portal oficial bloqueia automacao, o produto agora deixa isso explicito e auditavel, em vez de fingir que a fonte simplesmente "nao existe";
- a camada comercial ficou mais madura porque agora existe piloto governado, upsell interno e proteção operacional por tenant;
- melhora narrativa comercial e reduz fragilidade na demonstracao.
- reduz risco operacional de "o andamento entrou e ninguém viu", que é um ponto crítico para escritório.

## Validacao executada

Rodado nesta rodada:

- `npm test -- --runInBand app/lib/__tests__/juridical-ai-engine.test.ts`
- `npm test -- --runInBand app/lib/__tests__/juridical-ai-rollout.test.ts app/lib/__tests__/juridical-ai-assistant-dock.test.ts app/lib/__tests__/citation-verifier.test.ts app/lib/__tests__/juridical-ai-engine.test.ts`
- `npm test -- --runInBand app/lib/__tests__/citation-verifier.test.ts app/lib/__tests__/juridical-ai-engine.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `npx playwright test e2e/juridical-ai-workspace.spec.ts --config playwright.local.config.ts`

Resultado:

- tudo passando ao final da rodada.

## O que ainda falta para paridade mais pesada

Ainda nao podemos vender como paridade plena nestes pontos:

- jurisprudencia com lastro externo real em escala;
- validacao automatica de citacoes com confirmacao externa robusta em mais fontes e com maior profundidade;
- workflow juridico pesado estilo ERP;
- camada proativa conectada a processo real em escala;
- reaproveitamento da saida da IA em mais fluxos nativos alem de modelos, peticoes e documentos.
- cobertura ainda mais profunda de rollout/onboarding e comercializacao automatizada por plano.

## Proximas frentes recomendadas

Ordem sugerida:

1. aprofundar fontes verificáveis e cobertura de tribunais;
2. expandir reaproveitamento da IA para mais fluxos nativos;
3. fortalecer memória por caso com continuidade estratégica;
4. adicionar insights proativos ligados a processo, prazo e risco;
5. amadurecer billing/planos da IA além do rollout comercial interno.

## Observacao de release

Este relatorio descreve o estado da versao local em desenvolvimento.
Se houver commit e push depois desta rodada, atualizar:

- hash do commit;
- versao do `package.json`;
- data/hora da publicacao;
- resumo executivo do que entrou no deploy.
