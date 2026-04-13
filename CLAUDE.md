# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kan** là open-source project management alternative cho Trello, với các tính năng board visibility, workspace members, Trello imports, labels, comments, activity log, và templates.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + tRPC + Tailwind CSS |
| Backend | tRPC routers + Drizzle ORM |
| Database | PostgreSQL |
| Auth | Better Auth |
| Email | React Email |
| Storage | S3/MinIO |
| Monorepo | Turborepo + pnpm |

## Commands

### Root (workspace)
```bash
pnpm dev              # Run all packages in dev mode (turbo watch)
pnpm build            # Build all packages
pnpm dev:next         # Run only Next.js web app
pnpm db:migrate       # Run database migrations
pnpm db:generate      # Generate Drizzle client
pnpm db:studio        # Open Drizzle Studio
pnpm db:push          # Push schema to database
pnpm lint             # Lint all packages
pnpm lint:fix         # Fix lint errors
pnpm format           # Format all packages
pnpm format:fix       # Fix formatting
pnpm typecheck        # Type check all packages
```

### Docker
```bash
docker compose up -d --build     # Build and start all services
docker compose down              # Stop all services
docker compose logs -f web        # View web logs
docker compose logs -f migrate    # View migration logs
```

## Project Structure

```
kanbn/
├── apps/
│   ├── web/                     # Next.js Frontend
│   │   └── src/
│   │       ├── components/       # Reusable UI components
│   │       ├── hooks/            # Custom React hooks
│   │       ├── locales/         # i18n translations
│   │       ├── pages/            # Next.js pages (API, _app)
│   │       ├── views/            # Page-level components
│   │       │   ├── account/      # Account management
│   │       │   ├── board/       # Board views
│   │       │   ├── calendar/    # Calendar views
│   │       │   ├── card/        # Card detail views
│   │       │   └── members/    # Member management
│   │       ├── scripts/         # CLI scripts (create-admin)
│   │       └── utils/           # Utilities (api, cors)
│   └── docs/                    # Documentation app
│
├── packages/
│   ├── api/                     # tRPC API routers
│   │   └── src/routers/
│   │       ├── attachment.ts    # File attachment router
│   │       ├── board.ts         # Board router
│   │       ├── card.ts          # Card router
│   │       ├── permission.ts    # Permission router
│   │       └── user.ts          # User router
│   ├── auth/                    # Better Auth integration
│   ├── db/                      # Drizzle ORM + migrations
│   │   ├── src/
│   │   │   ├── repository/     # Data access layer
│   │   │   │   ├── card.repo.ts
│   │   │   │   ├── cardAttachment.repo.ts
│   │   │   │   └── ...
│   │   │   └── schema/          # Database schemas
│   │   └── migrations/         # SQL migrations
│   ├── email/                   # React Email templates
│   ├── logger/                  # Logging utility
│   ├── shared/                  # Shared utilities
│   │   └── src/utils/
│   │       └── generateRruleString.ts
│   └── stripe/                  # Stripe integration
│
├── tooling/                      # Turborepo config
├── turbo.json                   # Turbo pipeline config
└── docker-compose.yml            # Docker services
```

## Architecture

### API Flow
```
Client (tRPC) → Next.js API → tRPC Router → Service → Drizzle ORM → PostgreSQL
                                       ↓
                              S3 Storage (attachments/avatars)
```

### Key Patterns
- **tRPC Routers** - Type-safe API endpoints in `packages/api/src/routers/`
- **Repository Pattern** - Data access in `packages/db/src/repository/`
- **Drizzle ORM** - Type-safe database queries and schema
- **Better Auth** - Authentication with multiple providers
- **S3/MinIO** - File storage for attachments and avatars

## Database

### Core Models
- `boards` - Kanban boards
- `cards` - Tasks/cards with due dates, recurrence
- `board_members` - Board access control
- `card_attachments` - File attachments (S3)
- `card_activity` - Activity history
- `users` - User accounts
- `workspaces` - Workspace organizations

### Migrations
```bash
pnpm db:generate    # Generate migration files
pnpm db:migrate     # Run migrations
pnpm db:push        # Push schema (dev only)
pnpm db:studio      # Visual database editor
```

## Environment Variables

### Required
```bash
NEXT_PUBLIC_BASE_URL=https://your-domain.com
BETTER_AUTH_SECRET=<random-32-char-string>
POSTGRES_URL=postgresql://user:pass@host:5432/db
```

### S3 Storage (MinIO)
```bash
S3_REGION=ap-southeast-1
S3_ENDPOINT=http://localhost:9010
S3_ACCESS_KEY_ID=<your-access-key>
S3_SECRET_ACCESS_KEY=<your-secret-key>
S3_FORCE_PATH_STYLE=true
NEXT_PUBLIC_AVATAR_BUCKET_NAME=<your-bucket>
NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME=<your-bucket>
NEXT_PUBLIC_STORAGE_DOMAIN=localhost:9010
NEXT_PUBLIC_USE_VIRTUAL_HOSTED_URLS=false
```

### Email (Resend)
```bash
EMAIL_FROM="Kan <hello@mail.kan.bn>"
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=<your-api-key>
SMTP_SECURE=true
```

## Development Workflow

### Document-First Development (Required)
For every new feature:
1. **SPEC.md** - Create spec file **at the same level as the code** describing business rules, requirements, and logic
2. **Types** - Define TypeScript types/interfaces if needed
3. **Tests** - Write unit tests covering core business logic
4. **Implementation** - Implement the feature

### Code Organization
- Each module folder contains its own spec, types, business logic, and tests
- tRPC routers should be thin - delegate to repository/service layer
- Use Zod for input validation in tRPC procedures

### Adding New tRPC Router
1. Create router in `packages/api/src/routers/`
2. Register in `packages/api/src/index.ts`
3. Use in frontend via `api.routerName.useQuery()` / `useMutation()`

### Adding New Repository
1. Create file in `packages/db/src/repository/`
2. Export typed functions
3. Use in tRPC routers

### Database Changes
1. Modify schema in `packages/db/src/schema/`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:migrate` to apply

## Important Notes

- Dùng `pnpm` ( không dùng npm/yarn)
- Build từ source trong Docker ( không dùng pre-built image)
- MinIO cần chạy local cho file attachments (port 9010)
- Merge main vào dev trước khi deploy
