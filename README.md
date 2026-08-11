# COSTRA

Professional construction project cost-control foundation.

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL: `docker compose up -d db`.
3. Install packages: `npm install`.
4. Prepare the database: `npm run db:generate && npm run db:migrate && npm run db:seed`.
5. Start both applications: `npm run dev`.
6. Open `http://localhost:5173` and sign in with `manager@costra.local` / `ChangeMe123!`.

The seed password is for local development only. Change it before using the application outside a local environment.

## Docker

Copy `.env.example` to `.env`, then run `docker compose up --build`. The web app is served at `http://localhost:8080`; the API health endpoint is `http://localhost:3000/api/health`.

## Structure

- `apps/web` — React, Vite, responsive application shell
- `apps/api` — Express API, JWT authentication, validation, RBAC and audit services
- `prisma` — PostgreSQL schema, migrations and development seed

The first financial module, Budget & Cost Structure, is implemented with project-scoped categories, cost codes, immutable original budgets, controlled approved-budget revisions, database-calculated summaries, validation and auditing. Commitments, actuals, forecasts and other downstream modules remain placeholders.

## Verification

- `npm test -w @costra/api` — budget-domain test suite
- `npm run typecheck` — API and web TypeScript validation
- `npm run build` — production builds
