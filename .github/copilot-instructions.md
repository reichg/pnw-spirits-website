## PNW Spirits Copilot Instructions

These instructions define how to implement changes safely and consistently in this repository.

## 1) Project Scope And Stack

- Application type: Next.js App Router website with public pages and admin workflows.
- Language and framework: TypeScript + React + Next.js.
- Data layer: Prisma with Postgres.
- Supporting services: AWS S3, Redis, and Nodemailer.

## 2) Core Non-Negotiable Rules

- Always add new code below all import statements in each file.
- Do not add duplicate styling tags or repeat CSS class definitions in styling files.
- Always use the global theme colors defined in `src/app/globals.css` and `src/app/globalTheme.module.css`.
- Keep changes tightly scoped to the request. Avoid unrelated refactors.
- Never commit secrets or hardcode credentials/tokens.
- Never edit generated Prisma client files under `generated/prisma/` manually.

## 3) Source Of Truth For Structure

- App routes and pages live under `src/app/`.
- API routes live under `src/app/api/**/route.ts`.
- Reusable UI components live under `src/components/`.
- Utilities and shared services live under `src/utils/`.
- Prisma schema and migrations live under `prisma/`.
- Postman collection lives under `postman/`.

## 4) Backend/API Conventions

- Use `NextRequest` and `NextResponse` in route handlers.
- Validate all request body/query inputs at API boundaries using zod `safeParse`.
- Return structured 400 responses for validation failures with details when practical.
- For admin-only mutations, call `requireAdmin(req)` at the top of handler logic.
- Import Prisma only from `@/utils/prisma`.
- Use shared logger utilities from `@/utils/logger` for operational errors and important events.
- For mutation routes touching cached data, call the corresponding cache invalidation helper.
- Prefer safe, user-facing error messages and avoid exposing internal stack traces in responses.

## 5) S3 And Media Conventions

- Store S3 object keys in the database, not short-lived signed URLs.
- Generate signed URLs on demand through utility helpers and API route logic.
- Validate file type/size in upload flows and keep validation consistent with existing behavior.
- When replacing/removing media, avoid deleting shared objects still referenced elsewhere.

## 6) Prisma And Data Safety

- Keep schema updates in `prisma/schema.prisma` only.
- Every schema change must include a migration in `prisma/migrations/`.
- Use Prisma transactions for multi-step writes that must succeed or fail together.
- Preserve existing model/API contracts unless the task explicitly requires a breaking change.

## 7) Frontend And Styling Conventions

- Prefer small, focused, reusable components.
- Keep component styles in CSS modules colocated with components.
- Reuse theme variables (`var(--color-*)`, `var(--shadow-*)`, `var(--radius-*)`) instead of hardcoded values.
- Keep pages and components responsive for mobile and desktop.
- Maintain accessibility: semantic HTML, labels for form inputs, keyboard-friendly interactions.

## 8) Performance And Caching

- Follow established Redis key/TTL patterns in `src/utils/redisClient.ts`.
- Cache read-heavy list endpoints where applicable.
- Invalidate relevant cache entries after create/update/delete operations.

## 9) Quality Gates Before Finishing

- Run lint checks: `npm run lint`.
- If Prisma schema changed: run `npx prisma generate` and create migration with `npx prisma migrate dev`.
- Validate key user flows affected by the change (admin and public paths as appropriate).
- Do not claim tests were run unless they were actually run.

## 10) Documentation And Change Hygiene

- For non-trivial behavior/architecture changes, update `docs/decision-log.md`.
- Keep README and docs consistent with actual scripts and capabilities.
- Add concise comments only where logic is non-obvious.
- Remove dead code/imports introduced by your changes.

## 11) Common Pitfalls To Avoid

- Do not bypass zod validation on API boundaries.
- Do not import server-only utilities into client components.
- Do not hardcode color hex values when a theme token exists.
- Do not introduce duplicate CSS class definitions.
- Do not silently skip cache invalidation for data mutations.
