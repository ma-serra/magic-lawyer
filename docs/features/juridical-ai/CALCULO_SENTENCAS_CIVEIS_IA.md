# Calculo de Sentencas Civeis com IA

## Objetivo

Dar ao Magic Lawyer uma frente real de leitura assistida de sentencas civeis para:

- extrair comandos condenatorios;
- separar itens calculaveis e itens dependentes de prova externa;
- identificar indexador, juros e termo inicial;
- estruturar memorial preliminar de calculo;
- reduzir erro operacional no cumprimento de sentenca.

## Referencia competitiva

Frente inspirada na oferta "Calculo de sentencas civeis" comercializada no ecossistema CPJ/Jarvis.

Leitura estrategica:

- a proposta deles ataca uma dor real e recorrente de escritorio;
- isso conversa diretamente com cumprimento de sentenca, contadoria, controladoria e peticionamento;
- para o Magic Lawyer, essa frente precisa ser nativa ao caso, nao uma calculadora solta.

## Escopo minimo do produto

### V1

- leitura do dispositivo da sentenca;
- identificacao de condenacoes por item;
- classificacao do item:
  - obrigacao de fazer;
  - multa;
  - liberacao de valor;
  - restituicao;
  - indenizacao;
  - improcedencia;
  - outro;
- extracao de valor mencionado;
- deteccao de correcao monetaria;
- deteccao de juros;
- deteccao de termo inicial;
- lista de insumos obrigatorios;
- memorial preliminar em markdown;
- trilha auditavel no workspace do Magic AI.

### V2

- leitura automatica de sentenca a partir de documento do processo;
- reaproveitamento direto em peticao de cumprimento de sentenca;
- exportacao para documento financeiro ou memoria de calculo;
- regras por tipo de acao;
- cruzamento com depositos e pagamentos no processo.

### V3

- memoria calculistica por processo;
- checklist de contadoria;
- integracao com protocolo automatizado;
- precificacao premium por uso ou faixa.

## Regra de prudencia

O sistema pode estruturar o calculo e o memorial preliminar, mas nao pode fingir exatidao quando faltarem:

- datas-base;
- comprovantes de pagamento;
- valor efetivamente pago;
- limite de multa exigindo apuracao;
- deposito judicial;
- abatimentos;
- eventos posteriores a sentenca.

Quando isso ocorrer, a IA deve:

- sinalizar dependencia;
- nao inventar numero;
- marcar revisao humana obrigatoria.

## Integracao no produto

Essa frente deve ficar conectada a:

- Magic AI;
- processos;
- documentos;
- peticoes;
- financeiro;
- protocolo juridico automatizado.

## Estado atual

Ja implementado:

- tarefa dedicada `SENTENCE_CALCULATION` no Magic AI;
- aba propria de `Calculos` no workspace;
- leitura estruturada do dispositivo;
- memorial preliminar em markdown;
- renderizacao de itens condenatorios, insumos obrigatorios e revisao humana.

A fazer depois desta base:

- leitura automatica a partir de PDF/arquivo com OCR mais forte;
- modelos nativos de cumprimento de sentenca;
- calculo assistido por tipo de condenacao;
- integracao mais profunda com financeiro e protocolo.
