# Web-embedded Task Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start daily-task materialization and missed-status polling automatically inside the production Next.js server without a separate scheduler image or container.

**Architecture:** Next.js instrumentation dynamically imports a singleton scheduler runtime from `@kan/db` in the production Node.js runtime. The existing CLI reuses that runtime, while deployment files only build and run web plus migration images.

**Tech Stack:** Next.js 15 Pages Router, React 18, TypeScript, node-cron, Drizzle ORM, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-18-web-embedded-task-scheduler-design.md`

## Global Constraints

- Keep React 18 and the Next.js Pages Router.
- Run the embedded scheduler only in production Node.js runtime.
- Materialize at 07:00 in `Asia/Ho_Chi_Minh`.
- Poll missed status every 15 minutes from 08:05 through 23:50.
- Preserve the existing manual CLI commands.
- Do not include unrelated dirty local files in commits.

---

### Task 1: Scheduler timing and startup catch-up

**Files:**

- Modify: `packages/db/src/scheduler/task-instance-scheduler.test.ts`
- Modify: `packages/db/src/scheduler/task-instance-scheduler.ts`

**Interfaces:**

- Consumes: `registerTaskInstanceScheduler(options)` and `Schedule` callback contract.
- Produces: `MISSED_STATUS_SCHEDULE` and startup decisions based on `currentMinutesOfDay`.

- [ ] Write failing tests for the `08:05` schedule and for skipped/allowed startup missed checks around `08:05`.
- [ ] Run `pnpm --filter @kan/db test -- task-instance-scheduler.test.ts` and confirm the new assertions fail for the old all-day schedule.
- [ ] Replace `currentHour` with `currentMinutesOfDay`, retain the 07:00 materialization catch-up, and gate missed catch-up at 08:05.
- [ ] Run the focused test again and confirm it passes.

### Task 2: Reusable singleton scheduler runtime

**Files:**

- Create: `packages/db/src/scheduler/task-instance-scheduler-runtime.test.ts`
- Create: `packages/db/src/scheduler/task-instance-scheduler-runtime.ts`
- Modify: `packages/db/src/scripts/task-instance-scheduler.ts`
- Modify: `packages/db/package.json`

**Interfaces:**

- Consumes: `registerTaskInstanceScheduler`, Drizzle client, node-cron and application timezone utilities.
- Produces: `startTaskInstanceScheduler(): Promise<TaskInstanceSchedulerHandle>` and `TaskInstanceSchedulerHandle.stop(): Promise<void>`.

- [ ] Write a failing test proving two starts in one process share one initialization.
- [ ] Run the focused runtime test and confirm it fails because the runtime does not exist.
- [ ] Implement the singleton runtime with per-run error logging and a retryable failed initialization.
- [ ] Refactor the CLI to call the runtime and retain SIGINT/SIGTERM cleanup.
- [ ] Export the runtime subpath from `@kan/db` and rerun the focused tests.

### Task 3: Next.js server startup integration

**Files:**

- Create: `apps/web/src/instrumentation.test.ts`
- Create: `apps/web/src/instrumentation.ts`
- Create: `apps/web/src/instrumentation-node.ts`

**Interfaces:**

- Consumes: `startTaskInstanceScheduler()` from `@kan/db/scheduler/task-instance-scheduler-runtime`.
- Produces: Next.js `register(): Promise<void>` lifecycle hook.

- [ ] Write a failing test proving scheduler startup is allowed only for production Node.js runtime.
- [ ] Run the focused web test and confirm it fails because instrumentation does not exist.
- [ ] Implement `register()` with a guarded dynamic import.
- [ ] Rerun the focused test and confirm it passes.

### Task 3.1: Runtime-specific recurrence compatibility

**Files:**
- Modify: `packages/db/src/repository/taskInstance.repo.ts`

**Interfaces:**
- Consumes: the `rrule` package's CommonJS-compatible and ESM exports.
- Produces: one `RRule` constructor usable by both the tsx CLI and the Turbopack Node bundle.

- [ ] Run the production build and capture the default-export failure from the instrumentation bundle.
- [ ] Normalize the namespace/default package shapes without changing recurrence behavior.
- [ ] Execute one real virtual-instance generation through tsx and expect one result.
- [ ] Rebuild production and confirm the instrumentation bundle compiles.

### Task 4: Remove the separate scheduler deployment

**Files:**

- Modify: `apps/web/Dockerfile`
- Modify: `cloud/docker-compose.yml`
- Modify: `deploy/docker-compose.yml`
- Modify: `Makefile`
- Modify: `README.md`

**Interfaces:**

- Consumes: the web standalone build that traces instrumentation dependencies.
- Produces: deployment workflows containing only web and migration application images.

- [ ] Remove scheduler-specific Docker stages, services, image variables, build, push and pull commands.
- [ ] Update deployment documentation to state that scheduler starts with production web.
- [ ] Search tracked deployment files for stale `kanbn-scheduler` references and confirm none remain.

### Task 5: Verification

**Files:**

- Verify all files above; do not modify unrelated local files.

**Interfaces:**

- Consumes: completed implementation.
- Produces: test, typecheck and production-build evidence.

- [ ] Run focused scheduler and instrumentation tests.
- [ ] Run `pnpm --filter @kan/db typecheck` and `pnpm --filter @kan/web typecheck`.
- [ ] Run `pnpm --filter @kan/db lint` and `pnpm --filter @kan/web lint`.
- [ ] Run the production web Docker build or the closest available standalone production build and record the exact result.
- [ ] Inspect `git diff --check`, `git status --short` and the staged file list before proposing a commit.
