# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Magic Lawyer is a multi-tenant SaaS for law firms built with Next.js 16 (App Router, Turbopack), Prisma + PostgreSQL, HeroUI + Tailwind CSS 4, and NextAuth.js. It runs on port **9192**.

### Starting services

1. **Docker daemon** must be running first (needed for PostgreSQL):
   ```
   sudo dockerd &>/tmp/dockerd.log &
   sudo chmod 666 /var/run/docker.sock
   ```
2. **Local services**: `npm run services:up` (starts PostgreSQL via Docker Compose on port 8567 and starts Redis if it is not already running)
3. **Dev server**: `npm run dev`
4. **First-time bootstrap**: `npm run setup:dev` installs dependencies, starts services, applies `prisma db push`, seeds the database, and launches the app on port 9192

### Database

- `DATABASE_URL` must use port **8567** (Docker Compose maps 8567->5432), user `magiclawyer`, password `MagicLawyer@2025`, db `magic_lawyer`
- Push schema: `npx prisma db push`
- Seed: `npm run prisma:seed` (creates test tenants with credentials listed in README)
- Prisma client generates to `./generated/prisma` (custom output path)

### Environment (.env)

Copy `.env.example` to `.env`. Key values to set:
- `DATABASE_URL=postgresql://magiclawyer:MagicLawyer@2025@localhost:8567/magic_lawyer?schema=magiclawyer`
- `NEXTAUTH_SECRET` — any non-empty string for dev
- `REDIS_URL=redis://localhost:6379`
- `CERT_ENCRYPTION_KEY` — 32 bytes hex, required for digital certificate upload. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Set `ABLY_API_KEY=` and `NEXT_PUBLIC_ABLY_CLIENT_KEY=` to **empty** (not the placeholder values) — the app gracefully skips realtime features when these are empty, but crashes with "invalid key parameter" if they contain placeholder text.
- `ESAJ_TLS_INSECURE=true`, `ESAJ_TLS_LEGACY=true` — recommended for e-SAJ scraping

### Testing

- `npm test` — runs Jest unit tests (2 suites, 12 tests)
- `npm run test:e2e` — Playwright (requires separate setup)
- See README for `npm run lint` and other commands

### Lint caveat

ESLint (`npm run lint`) has a pre-existing config incompatibility between `@next/eslint-plugin-next` v16 and the `FlatCompat` adapter in `eslint.config.mjs`. This is a known issue in the repo, not an environment problem.

### Geo-restriction for court systems

The e-SAJ (TJBA) and PJe Comunica APIs block access from outside Brazil. When testing from a cloud VM outside Brazil:
- **TJSP e-SAJ**: Works (more permissive)
- **TJBA e-SAJ**: Blocked (ECONNRESET)
- **PJe Comunica**: Blocked (CloudFront 403)

For full testing, use a Brazilian IP (local dev or Vercel production with BR edge).

### Test login credentials

| Tenant | Role | Email | Password |
|--------|------|-------|----------|
| Sandra | ADMIN | sandra@adv.br | Sandra@123 |
| Sandra | ADVOGADO | luciano.santos@adv.br | Luciano@123 |
| Salba | ADMIN | luciano@salbaadvocacia.com.br | Luciano@123 |
| Luana | ADMIN | luana@adv.br | Luana@123 |
| Fred | ADMIN | fredericopleitaoadv@gmail.com | Fred@123 |

### HeroUI Select fix pattern

When using `<Select>` from HeroUI with async data (SWR), always follow `docs/fixes/correcao-erro-select.md`:
1. Validate `selectedKeys` against the current collection before passing
2. Add `textValue` prop to every `<SelectItem>`
