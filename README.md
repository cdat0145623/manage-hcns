# Kan

Kan is an open-source project management application inspired by Trello. This repository contains the web application, tRPC API, authentication, database, email, billing, and documentation packages used to run the product.

<p align="center">
  <a href="https://kan.bn/kan/roadmap">Roadmap</a>
  ·
  <a href="https://kan.bn">Website</a>
  ·
  <a href="https://docs.kan.bn">Documentation</a>
  ·
  <a href="https://discord.gg/e6ejRb6CmT">Discord</a>
</p>

<p align="center">
  <a href="https://github.com/Zomzem-Audepartment/kanbn"><img alt="Repository" src="https://img.shields.io/badge/repository-Zomzem--Audepartment%2Fkanbn-blue"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPLv3-purple"></a>
</p>

## Features

- Workspaces, workspace members, roles, permissions, and invitations
- Public and private boards with lists, drag-and-drop cards, labels, filters, templates, and activity history
- Rich card content with descriptions, comments, checklists, attachments, mentions, due dates, members, and positions
- Calendar views for scheduled cards and events
- Recurring tasks, task masters, task instances, and task positions
- Reward configuration, approval workflows, snapshots, and reward-breach reports
- Dashboards, reports, feedback, and public board views
- Trello board import
- Webhooks, API keys, integrations, and billing through Stripe
- Email notifications, optional Redis-backed rate limiting, and S3-compatible object storage
- Social/OIDC authentication through Better Auth
- Internationalized Next.js frontend using Lingui

The repository also contains a reverse-engineered functional reference in [`docs/cfd/`](docs/cfd/README.md).

## Tech stack

- Next.js 15, React 18, TypeScript, Tailwind CSS, and Turborepo
- tRPC with Zod validation
- PostgreSQL with Drizzle ORM and Drizzle Kit
- Better Auth
- Lingui for internationalization
- Vitest for package tests
- Docker Compose for local and self-hosted deployments

## Repository structure

| Path              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `apps/web`        | Next.js web application                                              |
| `apps/docs`       | Mintlify documentation site                                          |
| `packages/api`    | tRPC routers, permissions, webhooks, integrations, and API utilities |
| `packages/db`     | Drizzle schema, migrations, repositories, and Redis client           |
| `packages/auth`   | Better Auth server/client configuration and providers                |
| `packages/email`  | Email templates and delivery helpers                                 |
| `packages/stripe` | Stripe billing integration                                           |
| `packages/shared` | Shared constants, permissions, and utilities                         |
| `packages/logger` | Application logging                                                  |
| `tooling`         | Shared TypeScript, ESLint, Prettier, and Tailwind configuration      |

## Requirements

- Node.js `>=20.18.1`
- pnpm `9.14.2` (Corepack is recommended)
- PostgreSQL 15 or Docker
- MinIO or another S3-compatible storage service when testing uploads locally

Enable the repository's package manager before installing dependencies:

```bash
corepack enable
corepack prepare pnpm@9.14.2 --activate
```

## Local development

### 1. Clone and install

```bash
git clone https://github.com/Zomzem-Audepartment/kanbn.git
cd kanbn
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

At minimum, configure `NEXT_PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET`, and `POSTGRES_URL`. For the included Docker Compose stack, also set `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_PASSWORD`.

Generate a local auth secret with:

```bash
openssl rand -base64 26 | tr -dc 'a-zA-Z0-9' | head -c 32
```

`BETTER_AUTH_TRUSTED_ORIGINS` must include the exact origin used in the browser, including forwarded development ports when applicable. Keep `NEXT_PUBLIC_BASE_URL` consistent with that origin.

The complete variable list and comments are maintained in [`.env.example`](.env.example). Optional variables enable email, OAuth/OIDC providers, Trello import, Redis, S3 storage, Stripe, notifications, and iframe embedding.

### 3. Start PostgreSQL and storage

You can use the repository's Docker Compose stack:

```bash
docker compose up -d postgres
```

The root Compose file publishes PostgreSQL on `localhost:5632` and expects the local `POSTGRES_URL` to use that published port, for example:

```dotenv
POSTGRES_URL=postgresql://kan:password@localhost:5632/kan_db
```

For file uploads, start MinIO separately or provide an S3-compatible service. When using the root Compose file, the web container expects the external Docker network `minio_minio-net`; create/configure that network and the buckets named by `NEXT_PUBLIC_AVATAR_BUCKET_NAME` and `NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME`.

### 4. Run migrations and start the app

```bash
pnpm db:migrate
pnpm dev
```

The development server is available at [http://localhost:3000](http://localhost:3000) unless the web app configuration overrides the port.

Useful commands:

```bash
pnpm build          # Build all packages and applications
pnpm lint           # Lint the workspace
pnpm typecheck      # Type-check the workspace
pnpm format:fix     # Format files
pnpm db:generate    # Generate a Drizzle migration
pnpm db:push        # Push the schema directly to the database
pnpm db:studio      # Open Drizzle Studio
```

Package tests can be run with the package scripts, for example:

```bash
pnpm --filter @kan/web test
pnpm --filter @kan/api test
pnpm --filter @kan/auth test
```

## Docker deployment

The root [`docker-compose.yml`](docker-compose.yml) builds and runs three services:

- `migrate`: applies Drizzle migrations and exits
- `web`: builds and runs the Next.js application
- `postgres`: runs PostgreSQL 15

Build and start the stack:

```bash
docker compose up -d --build
```

The web service is exposed on `${WEB_PORT:-3001}`. View logs or stop the stack with:

```bash
docker compose logs -f web
docker compose down
```

For deployment using pre-built images, see [`deploy/docker-compose.yml`](deploy/docker-compose.yml) and the helper targets in [`Makefile`](Makefile):

```bash
make build
make push TAG=v1.0.0
make deploy TAG=v1.0.0
```

The production pipeline builds, pushes, and deploys two application images:

- `kanbn-web`: the Next.js application and the embedded daily-task scheduler
- `kanbn-migrate`: the one-shot database migrator

The deployment Compose file reads its environment from `deploy/.env` and supports overriding `REGISTRY`, `WEB_IMAGE`, `MIGRATE_IMAGE`, and `TAG`. When the production web server starts, it materializes daily task instances at 07:00 and checks for missed instances every 15 minutes from 08:05 through 23:50 in `Asia/Ho_Chi_Minh`.

Check the web server and scheduler logs together with:

```bash
cd deploy
docker compose ps web
docker compose logs -f web
```

## Database workflow

Database schema and migrations live in [`packages/db`](packages/db):

```bash
cd packages/db
pnpm generate       # Generate a migration after schema changes
pnpm migrate        # Apply pending migrations
pnpm studio         # Open Drizzle Studio
```

Use migrations for committed schema changes. Do not edit existing migration files after they have been applied.

## Environment variables

The supported variables are grouped in [`.env.example`](.env.example):

- Core app and database: `NEXT_PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET`, `POSTGRES_*`
- Email: `SMTP_*`, `EMAIL_FROM`, `NEXT_PUBLIC_DISABLE_EMAIL`
- Storage: `S3_*`, `NEXT_PUBLIC_STORAGE_*`, and bucket names
- Authentication: `NEXT_PUBLIC_ALLOW_CREDENTIALS`, `NEXT_PUBLIC_DISABLE_SIGN_UP`, `BETTER_AUTH_TRUSTED_ORIGINS`, and provider credentials
- Integrations: Trello, Redis, Stripe, Novu, and webhook settings
- Operations: `LOG_LEVEL`, `CORS_ORIGINS`, `ALLOWED_FRAME_ANCESTORS`, and `NEXT_API_BODY_SIZE_LIMIT`

Never commit secrets. Use separate `.env` files for local development and deployment environments.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Use focused conventional commits such as `feat:`, `fix:`, `refactor:`, or `docs:`. For UI changes, include screenshots in the pull request.

Before submitting changes, run:

```bash
pnpm lint
pnpm typecheck
```

## License

Kan is licensed under the [AGPLv3 license](LICENSE).

## Contact

For support, join the [Discord server](https://discord.gg/e6ejRb6CmT) or email [henry@kan.bn](mailto:henry@kan.bn).
