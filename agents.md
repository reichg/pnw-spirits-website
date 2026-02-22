---
name: repo-operating-system
description: Canonical instructions for Copilot agents working in this repo (Next.js + TS + Prisma + Postgres).
---

# What this repo is
A Next.js (App Router) web app using:
- TypeScript (strict)
- React components
- Prisma ORM
- Postgres

# Golden rules (always)
1. ALWAYS start with the orchestrator and pass off tasks to subagents.
2. Prefer small, reviewable PRs (<= ~300 LOC net) unless explicitly requested otherwise.
3. No breaking changes without a migration + docs + clear PR notes.
4. Never commit secrets. Use `.env.example` and GitHub Actions secrets.
5. Keep changes scoped: update code + tests + docs together.
6. If unclear requirements: propose 2–3 options with tradeoffs, then pick a default and proceed.

# Commands (authoritative)
- Install: `npm i`
- Dev: `npm dev`
- Typecheck: `npm typecheck`
- Lint: `npm lint`
- Unit tests: `npm test`
- E2E tests (Playwright): `npm test:e2e`
- Prisma:
  - Generate: `npm prisma:generate`
  - Migrate dev: `npm prisma:migrate`
  - Migrate deploy (CI/prod): `npm prisma:deploy`

# Architecture conventions
- Next.js App Router under `/app`
- Server-only code: `/server` (or `/lib/server`) — do not import into client components
- Database access only via Prisma client wrapper: `/server/db.ts`
- API routes in `/app/api/**/route.ts`
- Prefer server actions when appropriate; otherwise API routes

# Data & validation
- Use `zod` for runtime validation at boundaries (API/routes/forms).
- All DB writes must validate input with zod schemas.
- Use Prisma transactions for multi-step writes.

# React + UI conventions
- Client components declare `"use client"` at top.
- Keep components pure; side effects only in hooks.
- Accessibility: labels for inputs, keyboard navigable, sensible aria-*.

# Testing standards
- Unit: Jest/Vitest (pick one) for pure functions + server logic
- Component: React Testing Library for key UI flows
- E2E: Playwright for critical journeys
- Every bug fix should add a regression test.

# Migrations
- Every Prisma schema change requires a migration.
- Do not edit generated migration SQL after applied unless you know the implications.

# Documentation expectations
- New features update: docs/architecture.md (if structural), docs/dev-setup.md (if setup), docs/testing.md (if tests), docs/release.md (if release process changes).
- Add an entry to docs/decision-log.md for non-trivial choices.

# Security & privacy
- Treat all user input as untrusted.
- Use parameterized queries only (Prisma does this by default).
- Avoid exposing internal errors; return safe messages.