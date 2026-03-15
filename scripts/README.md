# Scripts de Desenvolvimento

O fluxo local foi simplificado para separar bootstrap, operacao diaria e casos opcionais como `ngrok` e Asaas.

## Fluxo recomendado

### Primeira vez ou maquina nova

```bash
npm run setup:dev
```

Esse comando:
- instala dependencias
- sobe PostgreSQL e Redis
- aplica `prisma db push`
- roda seed
- inicia a aplicacao em `http://localhost:9192`

### Dia a dia

```bash
npm run dev
```

Use isso quando o ambiente ja estiver preparado e voce so quiser subir a aplicacao.

## Scripts principais

### `npm run services:up`

Sobe os servicos locais obrigatorios:
- PostgreSQL via Docker Compose
- Redis, apenas se ele ainda nao estiver rodando

### `npm run services:down`

Para PostgreSQL e Redis.

### `npm run dev:ngrok`

Inicia a aplicacao local junto com `ngrok`.

Use apenas quando precisar expor callbacks externos.

### `npm run dev:asaas`

Inicia a aplicacao, sobe `ngrok` e dispara a limpeza/sincronizacao do sandbox Asaas.

Esse script deixou de ser o fluxo padrao. Ele existe so para testes de billing/webhook.

### `npm run reset:dev`

Reseta o banco local de forma explicita e reaplica o seed.

Use so quando voce realmente quiser destruir os dados locais.

## O que saiu do fluxo padrao

Os scripts antigos acoplavam:
- `pkill` em massa
- reset destrutivo de banco
- `ngrok`
- limpeza do Asaas

Isso foi removido do caminho principal para evitar que um comando cotidiano execute operacoes caras ou destrutivas por padrao.
