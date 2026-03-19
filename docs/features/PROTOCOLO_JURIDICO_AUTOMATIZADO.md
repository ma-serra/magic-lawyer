# Protocolo Juridico Automatizado

## Objetivo

Levar o Magic Lawyer ao nivel de paridade operacional com ofertas como **Protocolo Juridico Preambulo / CPJ-3C**, permitindo que o escritorio envie peticoes intermediarias diretamente aos sistemas dos tribunais, com trilha auditavel, recibo real e cobranca integrada.

Este documento existe para deixar a frente **pre-pronta para execucao**, partindo do que o produto ja possui hoje e definindo o que falta para sair de "protocolo manual com numero informado pelo usuario" para **protocolo automatizado real**.

## Regra dura

Nada aqui deve ser tratado como pronto com base em mock.

So consideramos "protocolo automatizado implementado" quando houver:

- autenticacao real no tribunal alvo;
- envio real de peticao e anexos;
- recebimento real de numero/recibo de protocolo;
- persistencia do resultado no processo e na peticao;
- notificacao real para os responsaveis;
- trilha de auditoria completa.

Se um tribunal ainda nao permitir isso ou exigir etapa humana, o produto deve assumir isso explicitamente como:

- `semiautomatico`, quando o sistema prepara e acompanha, mas exige acao humana final;
- `manual assistido`, quando o sistema so organiza arquivo, metadados e checklist.

## Por que isso importa

Esse e um dos blocos mais fortes de diferenciacao do CPJ-3C / Preambulo:

- reduz operacao manual da secretaria;
- reduz erro de upload, anexo errado e perda de prazo;
- cria ganho claro de produtividade;
- vira modulo comercializavel por faixa de consumo;
- aumenta a dependencia operacional do escritorio ao sistema;
- aproxima o Magic Lawyer de um ERP juridico de alta maturidade.

## Leitura da oferta concorrente

O SKU observado no ecossistema CPJ-3C / Preâmbulo posiciona protocolo como:

- envio automatizado de pecas intermediarias diretamente aos tribunais;
- reducao de erro manual;
- ganho operacional para secretaria e controladoria;
- produto cobrado por faixa de consumo.

Leitura estrategica:

- nao e so uma feature; e um modulo monetizavel de alta recorrencia;
- ele gruda o escritorio no sistema porque entra no centro da operacao;
- ele conversa diretamente com prazos, peticoes, auditoria, financeiro e produtividade.

### Faixas comerciais observadas

Referencia comercial do concorrente:

- `0 - 125`: R$ 350,00 / R$ 3,40
- `126 - 250`: R$ 625,00 / R$ 3,20
- `251 - 417`: R$ 917,00 / R$ 3,00
- `418 - 833`: R$ 1.667,00 / R$ 2,80
- `834 ou mais`: sob negociação / enterprise

Decisao para o Magic Lawyer:

- nao copiar o nome comercial;
- sim copiar o raciocinio de venda por faixa;
- manter uma modalidade complementar por uso, para escritorios menores;
- ligar tudo ao billing nativo do tenant.

## O que ja existe no Magic Lawyer

Hoje ja temos base real para essa frente:

### Dominio de peticoes

- cadastro completo de peticoes em [app/actions/peticoes.ts](../../app/actions/peticoes.ts)
- status de peticao e numero de protocolo manual no mesmo fluxo
- vinculacao com processo, causa e documento
- tela operacional em [app/(protected)/peticoes/peticoes-content.tsx](../../app/(protected)/peticoes/peticoes-content.tsx)

### Certificado digital

- upload, ativacao, teste e logs de certificado A1 em [app/actions/digital-certificates.ts](../../app/actions/digital-certificates.ts)
- painel operacional em [app/(protected)/configuracoes/digital-certificates-panel.tsx](../../app/(protected)/configuracoes/digital-certificates-panel.tsx)
- documentacao tecnica em [docs/features/digital-certificates.md](./digital-certificates.md)

### Integracoes juridicas e captura

- uso de certificado A1 no ecossistema PJe/Comunica ja existente em [app/api/cron/comunica/route.ts](../../app/api/cron/comunica/route.ts)
- captura juridica e cron existentes no stack do produto
- auditoria operacional e sistema de notificacoes ja prontos

### Infra de execucao assincrona

- Vercel Workflow para fluxos longos
- Vercel Queue para lotes/retentativas
- Redis como apoio de estado, lock e deduplicacao

### Billing e venda de add-ons

- modulo de pacotes premium e cobranca ja existe
- billing/Asaas e ledger comercial ja existem no produto

Conclusao: a frente de protocolo nao parte do zero. Ela parte de um produto que ja possui:

- peticao;
- documento;
- processo;
- certificado;
- fila/workflow;
- notificacao;
- auditoria;
- billing.

O que falta e fechar o **orquestrador de protocolo** e os **adaptadores por tribunal**.

## O que ainda falta para a paridade real

1. Botao e fluxo real de `Protocolar automaticamente`.
2. Orquestrador de execucao por tribunal.
3. Adaptadores reais de peticionamento por sistema.
4. Persistencia forte de job, tentativas, recibos e anexos enviados.
5. Controle de fila, retentativa, erro transitorio e reprocessamento.
6. Tela de fila operacional de protocolos.
7. Precificacao por faixa e consumo.
8. Notificacao em tempo real do resultado.
9. Regras de permissao e dupla confirmacao para protocolo.
10. Prova juridica de tudo que foi enviado.

## Escopo de produto

### Nome comercial sugerido

- `Protocolo Automatizado`
- `Protocolo Inteligente`
- `Protocolo Juridico Magic`

Minha recomendacao: **Protocolo Juridico Automatizado**.

### O que o usuario faz

Dentro da peticao ou do processo, o usuario deve poder:

1. selecionar a peticao pronta para protocolo;
2. validar processo, classe, tribunal e advogado patrono;
3. escolher certificado ativo quando houver mais de um;
4. revisar anexos e ordem dos arquivos;
5. acionar `Protocolar automaticamente`;
6. acompanhar status em tempo real;
7. receber numero/recibo real quando concluir.

### O que o sistema faz

1. valida pre-requisitos;
2. garante que o PDF final e os anexos estejam no formato permitido;
3. abre workflow de protocolo;
4. autentica no tribunal com credencial/certificado;
5. executa o envio;
6. captura comprovante, protocolo e timestamps;
7. atualiza peticao e processo;
8. notifica responsaveis;
9. registra tudo em auditoria.

## Integracao com o que ja existe

### Peticoes

Usar a entidade atual `Peticao` como origem do protocolo.

Novos estados sugeridos:

- `AGUARDANDO_PROTOCOLO`
- `EM_PROTOCOLO`
- `PROTOCOLO_FALHOU`
- `PROTOCOLO_PENDENTE_REVISAO`
- `PROTOCOLO_RECEBIDO`

O estado `PROTOCOLADA` so deve ser usado quando houver comprovante real ou confirmacao manual autenticada.

### Documentos

O protocolo deve consumir:

- documento principal da peticao;
- anexos complementares;
- metadados de tamanho, tipo e hash.

### Certificados

Reusar o fluxo existente de `DigitalCertificate`.

O protocolo automatizado deve exigir:

- certificado ativo e valido;
- teste de conectividade recente;
- responsavel registrado;
- log de uso do certificado.

### Processo

Atualizar automaticamente:

- ultimo protocolo;
- historico da movimentacao operacional;
- alertas se houver falha;
- notificacao dos advogados do processo.

### Notificacoes

Enviar para os advogados do processo:

- protocolo iniciado;
- protocolo aguardando intervencao;
- protocolo concluido;
- protocolo falhou;
- recibo disponivel.

Canais iniciais:

- in-app;
- email;
- popup quando o usuario estiver online.

Telegram pode entrar depois se o escritorio quiser.

### Auditoria

Toda execucao deve gerar:

- ator que disparou;
- tenant;
- processo;
- peticao;
- tribunal;
- certificado usado;
- anexos enviados;
- hash do payload;
- timestamps por etapa;
- numero do protocolo;
- recibo;
- erro bruto, quando houver;
- snapshot do retorno do tribunal.

## Arquitetura recomendada

### 1. Camada de produto

Telas e pontos de entrada:

- `/peticoes`
- `/processos/[processoId]`
- futura fila global `/processos/protocolos`
- admin de pacote/comercializacao

### 2. Camada de orquestracao

Usar **Vercel Workflow** como motor principal do protocolo.

Motivo:

- execucao longa;
- tentativas;
- espera por callback/confirmacao;
- checkpoints por etapa;
- rastreio por run.

### 3. Camada de adaptadores

Criar adaptadores por sistema:

- `PJE`
- `ESAJ`
- `EPROC`
- `PROJUDI`
- outros, quando houver demanda comprovada

Cada adaptador deve expor interface unica, por exemplo:

- `validatePrerequisites`
- `authenticate`
- `prepareSubmission`
- `submit`
- `pollReceipt`
- `normalizeResult`

### 4. Camada de persistencia

Criar dominio proprio para protocolo:

- `ProtocoloJob`
- `ProtocoloAttempt`
- `ProtocoloReceipt`
- `ProtocoloAttachment`
- `ProtocoloBillingLedger`

Essas entidades nao existem ainda e devem nascer separadas de `Peticao`, para nao misturar estado processual com estado tecnico de entrega.

### 5. Camada de auditoria juridica

Tudo o que entrar/sair precisa ficar consultavel em `/admin/auditoria` e, em visao tenant, no processo/peticao.

## Fluxo operacional recomendado

### Fluxo feliz

1. usuario clica em `Protocolar automaticamente`;
2. sistema valida certificado, peticao, documento, permissao e tribunal;
3. workflow cria `ProtocoloJob`;
4. adaptador autentica no tribunal;
5. sistema sobe peca e anexos;
6. tribunal retorna protocolo/recibo;
7. job persiste resultado;
8. peticao e marcada como protocolada;
9. processo recebe log/andamento operacional;
10. advogados sao notificados.

### Fluxo de falha

1. falha de autenticacao;
2. falha de captcha/WAF;
3. falha de formato de arquivo;
4. falha de indisponibilidade do tribunal;
5. falha de sessao expirada;
6. protocolo recebido sem comprovante consolidado.

Cada caso deve cair em categoria fechada e nunca apenas em "erro desconhecido".

## Tribunais e rollout

### Ordem recomendada

1. **PJe** com certificado A1
2. **e-SAJ**
3. **eproc**
4. **Projudi**

### Justificativa

O produto ja tem infraestrutura juridica e certificado voltados a PJe. O menor caminho para valor real e iniciar por onde ja temos:

- certificado;
- conectividade;
- cron juridico;
- trilha de logs.

### Status esperado por fase

#### Fase 1 - manual assistido

- checklist e validacao antes do protocolo;
- pacote pronto para envio;
- captura do numero informado manualmente;
- auditoria e recibo anexado manualmente.

#### Fase 2 - semiautomatico

- sistema prepara tudo;
- autentica;
- sobe anexos;
- para apenas no ponto de captcha/WAF ou confirmacao humana.

#### Fase 3 - automatico real

- protocolo ponta a ponta com comprovante real.

## Comercializacao

Essa frente deve ser vendida como add-on premium, com duas modalidades:

### 1. Pacote por faixa

Exemplo inspirado no modelo do concorrente:

- faixa 1: ate 125 protocolos
- faixa 2: 126 a 250
- faixa 3: 251 a 417
- faixa 4: 418 a 833
- enterprise: sob consulta

Recomendacao comercial inicial do Magic Lawyer:

- `Starter`: ate 125 protocolos
- `Growth`: 126 a 250
- `Scale`: 251 a 417
- `Controladoria`: 418 a 833
- `Enterprise`: acima disso, contrato dedicado

Cada faixa precisa mostrar no tenant:

- cota contratada;
- consumo atual;
- custo medio por protocolo;
- estimativa de fim de faixa;
- opcao de upgrade.

### 2. Cobranca por uso

Para escritorios menores ou rollout:

- preco por protocolo bem-sucedido;
- sem cobranca em falha tecnica do nosso lado;
- politica clara para tentativa parcialmente concluida.

### Integracao com o produto atual

Usar o modulo de pacotes e billing ja existente.

O tenant deve conseguir:

- contratar o add-on;
- acompanhar consumo;
- ver saldo/faixa;
- receber alerta de uso;
- comprar mais.

### Integracao funcional no produto

O modulo precisa se conectar, desde o primeiro dia, a estes pontos reais:

#### 1. Peticoes

- botao `Protocolar automaticamente`;
- selecao da peca final;
- fila de execucao;
- comprovante depois do envio.

#### 2. Processos

- timeline operacional do protocolo;
- status do ultimo protocolo;
- alertas se houver falha, devolucao ou pendencia.

#### 3. Certificado digital

- escolha do A1 ativo;
- validacao previa;
- log de uso do certificado por protocolo.

#### 4. Auditoria

- quem disparou;
- o que foi enviado;
- quando foi enviado;
- para qual tribunal;
- com qual certificado;
- qual foi o recibo.

#### 5. Notificacoes

- iniciado;
- em processamento;
- aguardando intervencao;
- concluido;
- falhou.

#### 6. Billing

- debito de consumo por faixa ou por uso;
- ledger por tenant;
- relatorio operacional/comercial no admin.

## Como vamos integrar

### Fase 0 - pre-pronto agora

Antes de escrever o primeiro adaptador real, esta frente precisa estar fechada nestes blocos:

1. documento de produto;
2. definicao de arquitetura;
3. definicao do dominio Prisma;
4. definicao do workflow;
5. definicao do modelo comercial;
6. definicao da UX tenant/admin;
7. definicao do rollout por tribunal.

### Fase 1 - produto assistido

- estado de peticao preparado para protocolo;
- checklist juridico e tecnico;
- anexos consolidados;
- recibo e numero ainda podem entrar manualmente;
- auditoria completa desde ja.

### Fase 2 - protocolo semiautomatico

- workflow real;
- autenticacao e preparo reais;
- sistema sobe arquivos e percorre etapas;
- pode parar em captcha, WAF ou confirmacao humana.

### Fase 3 - protocolo automatico real

- envio real ponta a ponta;
- numero de protocolo real;
- comprovante real;
- status refletido na peticao e no processo;
- cobranca automatica por consumo.

## Backlog tecnico de integracao

### Dominio

- `ProtocoloJob`
- `ProtocoloAttempt`
- `ProtocoloReceipt`
- `ProtocoloAttachment`
- `ProtocoloBillingLedger`

### Workflow

- `startProtocolJob`
- `validateProtocolPrerequisites`
- `authenticateTribunal`
- `uploadPeticaoPrincipal`
- `uploadAnexos`
- `submitProtocol`
- `captureReceipt`
- `notifyResult`
- `postBillingUsage`

### UX tenant

- CTA na peticao
- fila `/processos/protocolos`
- detalhe por job
- recibo para download
- reprocessar / retomar / confirmar manualmente

### UX admin

- throughput por tribunal
- sucesso e falha por adaptador
- tenants de maior consumo
- receita do add-on
- incidentes de protocolo

## Regras de seguranca e juridicas

1. Nao protocolar sem documento principal final.
2. Nao protocolar sem certificado ativo e valido.
3. Nao protocolar se o patrono do certificado nao estiver autorizado no processo.
4. Exigir confirmacao adicional em casos sensiveis.
5. Guardar hash do arquivo enviado.
6. Guardar recibo integral do tribunal.
7. Guardar horario e fuso da operacao.
8. Guardar id do workflow e das tentativas.
9. Nao mascarar falha de tribunal como sucesso.
10. Nunca atualizar `PROTOCOLADA` sem evidencia real ou confirmacao manual autenticada.

## O que precisa entrar no produto

### Tenant

- botao `Protocolar automaticamente` na peticao;
- fila de protocolos;
- status detalhado por etapa;
- comprovante para download;
- filtros por tribunal, status, advogado e periodo.

### Admin

- telemetria de uso do modulo;
- falhas por tribunal;
- sucesso por adaptador;
- tenants com maior volume;
- receita do add-on;
- incidentes de protocolo.

## Como isso conversa com a ATA

Essa frente e uma resposta direta ao gap identificado contra o **CPJ-3C / Preambulo**:

- automacao operacional profunda;
- workflow juridico em escala;
- protocolo eletronico como produto;
- monetizacao por uso/faixa;
- robustez operacional de ERP juridico.

Por isso, ela deve ser tratada como frente paralela e prioritaria da paridade competitiva.

## Definicao de pronto

Considerar essa frente "pronta para venda" somente quando houver:

- pelo menos 1 adaptador real em producao;
- cobranca integrada;
- recibo real persistido;
- auditoria completa;
- fila operacional consultavel;
- notificacao de sucesso/falha;
- cobertura E2E do fluxo feliz e dos erros principais;
- texto comercial claro no tenant e no admin.

## Proximos passos

1. Criar modelos Prisma do dominio de protocolo.
2. Criar `workflow` de protocolo juridico.
3. Criar primeiro adaptador real `PJE`.
4. Adicionar botao e fila na experiencia de peticoes.
5. Integrar com billing/pacotes.
6. Integrar com auditoria e notificacoes.
7. Fechar rollout tenant por tenant.

## Leitura honesta do estado atual

Hoje o Magic Lawyer ja tem fundamentos suficientes para comecar essa frente do jeito certo.

O que existe:

- certificado;
- peticao;
- processo;
- notificacao;
- auditoria;
- workflow;
- billing.

O que ainda nao existe:

- protocolo automatizado real ponta a ponta.

Entao a direcao esta correta, mas o trabalho ainda e de implementacao verdadeira, nao de acabamento.
