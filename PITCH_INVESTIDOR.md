# Magic Lawyer — visao tecnica em 5 minutos

- SaaS B2B white label e multi-tenant para escritorios de advocacia. Cada tenant escolhe dominio, branding e regras de negocio sem perder isolamento de dados.
- Foco em produtividade juridica: cadastros ricos, automacao de prazos, portal do cliente e integrações financeiras.

## Produto vivo (principais modulos em producao)
- `app/(protected)/processos`: pipeline completo de casos com filtros por status/fase/grau, segredo de justica, valores e prazos; cards com contadores de docs/eventos; importacao em massa.
- `app/(protected)/clientes`: CRM juridico com PF/PJ, criacao/edicao/reset de acesso, metrica de carteira, filtros inteligentes e importacao via Excel; gera credenciais automaticamente.
- `app/(protected)/agenda`, `tarefas`, `eventos`: agenda compartilhada por tenant com prazos principais e vinculo com processos.
- `app/(protected)/documentos`, `procuracoes`, `modelos-*`: acervo central, assinatura digital (Clicksign), versionamento e templates.
- `app/(protected)/financeiro`, `contratos`, `parcelas`, `honorarios`: cobrancas recorrentes, integracao Asaas (boletos/PIX), inadimplencia e relatorios.
- `app/(protected)/juizes` e `pacotes`: base estrategica de magistrados com pacotes comercializaveis.
- `app/admin/*`: camadas de super-admin para auditar tenants, faturamento, pacotes e suporte.
- `portal-advogado` e `area do cliente`: acompanham processos, documentos e comunicados em tempo real.

## Arquitetura moderna
- Frontend/Backend unificado: Next.js 15 (App Router + Server Components) com turbopack; React 18; HeroUI + Tailwind.
- Multitenancy: isolamento por `tenantId` em middleware e em Server Actions; permicoes granulares (SUPER_ADMIN, ADMIN, ADVOGADO, SECRETARIA, FINANCEIRO, CLIENTE, CONVIDADO).
- Dados: PostgreSQL + Prisma 6; seeds por tenant (`prisma/seed.js` e `/seeds/tenants`).
- Realtime e automacao: Ably para notificacoes push; Vercel Workflow + Vercel Queues para processamento assincrono; Redis para cache, estado e locks.
- Integracoes chaves: Asaas (billing), Cloudinary (arquivos), Clicksign (assinatura), Google Calendar, NextAuth para SSO multi-tenant, Nodemailer com templates por tenant.
- Storage e CDN prontos para white label (logos, temas, favicons dinamicos).

## Defensabilidade e diferencial
- White label nativo: cada escritorio com identidade visual, dominio e email transacional proprios sem sacrificar a base unica.
- Automacao de prazos e alertas multicanal (app, email, push) reduz risco operacional e aumenta stickiness.
- CRM + Processos + Financeiro + Documentos no mesmo tenant; dados fluem entre modulos sem integrações externas caras.
- Importadores (Excel) para clientes e processos aceleram onboarding; `setup:dev` sobe o ambiente local com PostgreSQL, Redis, schema, seed e aplicacao.
- Base de juizes e pacotes cria linha de receita adicional e barreira de conteudo proprietario.

## Maturidade de engenharia
- Scripts de operacao: `dev` com turbopack, `services:up/down` para infraestrutura local, `dev:ngrok` e `dev:asaas` para webhooks pontuais, `notifications:*` para testes de prazos/webhooks.
- Qualidade: ESLint + Prettier, Jest + Testing Library, Playwright para e2e; CI-friendly.
- Observabilidade baseline: toasts e realtime no front; execucoes monitoradas pela Vercel; cron endpoints versionados (`/api/cron/*`).

## Roadmap curto (decks do repo `docs/`)
- Integração direta com PJe/Comunica para captura automatica de andamentos.
- Marketplace de modelos e workflows configuraveis por tenant.
- App mobile e API publica para integrações de parceiros.

**Porque agora?** Tecnologia ja integrada e com UX polida (cards, filtros inteligentes, importadores). Precisa capital para escalar aquisicao B2B, ampliar integrações de tribunais e consolidar base proprietaria de magistrados.***
