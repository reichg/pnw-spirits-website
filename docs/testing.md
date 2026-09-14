# Testing

How this repo's test suite is set up, what that setup can and cannot observe, and
the conventions that keep assertions honest.

The suite runs in seconds and is expected to be green on every branch. For the
current figures, run it — `pnpm test` prints the file and test counts.

## How to run

```
pnpm test          # vitest run — the whole suite
pnpm vitest run    # same thing, invoking Vitest directly
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint . --max-warnings=0
```

There is no watch script; use `pnpm vitest` directly if you want watch mode.

## Where tests live

Tests sit next to the code they cover, as `*.test.ts` / `*.test.tsx`. Vitest
collects `src/**/*.{test,spec}.{ts,tsx}` (see `vitest.config.ts`). There is no
central `src/test/` or top-level `tests/` directory, and adding one would put
files outside the conventions every existing test follows. The one exception is
`src/__tests__/smoke.test.ts`, which asserts only that the runner runs and
belongs to no module.

The `@/` alias resolves to `src/` in tests, matching `tsconfig.json`.

## The environment constraint (read this before writing a component test)

`vitest.config.ts` sets `environment: "node"`. There is **no jsdom, no
happy-dom, and no `@testing-library/react`** in this project — check
`package.json` before assuming otherwise. That is a deliberate constraint, not
an oversight, and it shapes every component test in the repo.

### The house pattern: render to a string, assert on the HTML

Component tests render with `renderToStaticMarkup` from `react-dom/server` and
assert against the emitted HTML string:

```tsx
import { renderToStaticMarkup } from "react-dom/server";

const html = renderToStaticMarkup(<ContentRow item={ITEM} />);
expect(html).toMatch(/<time[^>]*datetime="2026-01-02T12:00:00\.000Z"/i);
```

Every component test in the repo works this way. It covers server components
very well: branches, optional fields, attributes, emitted text, and element
structure are all observable.

Note the casing in that example. **React emits HTML attribute names in
lowercase**, so the `dateTime` prop renders as `datetime`, `ariaLabel` as
`aria-label`, and so on. An assertion spelling the JSX prop name never matches.
Match case-insensitively (`/…/i`) rather than guessing.

### What this setup cannot observe

- **Interactive behavior in client components.** No DOM, no event dispatch, no
  effects. A `"use client"` component whose value is its interactivity is
  genuinely untestable here — assert on the markup it emits at first paint and
  say so in a comment, rather than papering over the gap. `ContentRow.test.tsx`
  documents this for the `S3CardBackgroundImage` branch, which returns `null`
  until a `useEffect` resolves a signed URL and therefore renders empty under a
  static render — the same thing it does at first paint in production.
- **Anything resolved by a Next.js build-time config injection.** Vitest does
  not perform it. `next/image` in particular emits `q=75` in `srcSet` regardless
  of the quality the component passes, and warns on stderr about it. Asserting
  on that value pins the test artifact, not the code.

### CSS-module class names are not a contract

The transform hashes them. **No assertion may depend on a CSS-module class
name.** Identify elements by tag, attribute, accessible name, or text instead —
`aria-current="page"`, `<time datetime>`, `alt`, heading text. Where a visual
state has no other observable, give it a real attribute rather than reaching for
the class name.

When the _presence_ of a class is the behavior under test, assert its shape
rather than its value. `ContentArchiveLayout.test.tsx` pins that a caller's
`className` lands beside the layout's own root class with
`expect(html).toMatch(/<main class="\S+ page-specific"/)` — the merge is the
contract; the hashed value is not.

Note also that Vitest does not process the CSS itself here, so anything a page
expresses purely through a stylesheet — the `--archive-columns` custom property
that gives `/videos` its two-up rows, for example — is out of reach of this
suite entirely. Verify those with `pnpm screenshot`.

## Mutation-check your load-bearing assertions

**A negative assertion that was never seen to fail is not evidence.** Before
relying on one, break the source deliberately and confirm the test goes red.
This convention exists because the suite has repeatedly produced assertions that
passed for free:

- `expect(html).toContain("aren't ...")` never matched anything, because React
  escapes the apostrophe to `&#x27;` in static markup. Every _negative_
  assertion built around that string then passed vacuously — which was exactly
  the failure they existed to catch. The fix was to assert on an
  apostrophe-free slice of the copy; see the `NO_CONTENT_COPY` constants in
  `src/app/(pages)/blogs/page.test.tsx`, `recipes/page.test.tsx` and
  `videos/page.test.tsx`.
- `expect(html).not.toContain("q=")` was intended to prove a query param was
  absent, and matched `next/image`'s own `&q=75` instead.

Two practices follow from it:

1. **Pair a negative assertion with a positive one.** "The signature is not in
   the log" passes against code that simply stopped logging. `src/utils/s3.test.ts`
   pairs every such check with an assertion that the S3 key _is_ still present,
   so what is pinned is redaction rather than deletion of the log line.
2. **Prove the sweep was not vacuous.** When a test asserts something over a set
   of call sites, also assert the set was non-empty — otherwise "no site
   leaked" is true of zero sites.

## Coverage shape

Rather than an inventory that goes stale, here is where coverage lives and what
each layer asserts:

| Area         | Location                           | What is asserted                                                                                                                                    |
| ------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| API routes   | `src/app/api/**/route.test.ts`     | Zod param parsing and clamping, status codes, cache keys and invalidation, upstream-failure handling, that error bodies do not echo upstream detail |
| Server pages | `src/app/(pages)/**/page.test.tsx` | Rendered HTML for the URL-driven archive and landing surfaces: pagination links, search state, empty states, real `<img>` in the SSR document       |
| Shared UI    | `src/components/**/*.test.tsx`     | Emitted structure of the shared content components under every branch of their item contract                                                        |
| Services     | `src/services/**/*.test.ts`        | Domain rules, schemas, error mapping                                                                                                                |
| Utilities    | `src/utils/*.test.ts`              | Pure helpers — pagination math, item adapters, logging redaction, auth, S3                                                                          |

Roughly half the suite uses `vi.mock`; `fetch`, Prisma, Redis and the S3 client
are the usual mock boundaries. Prefer mocking at that outer edge and letting the
real module under test run.

## No end-to-end tests

There are no E2E tests and no Playwright test specs or config in this repo.
`playwright` **is** a devDependency, but only to drive
`scripts/screenshot.mjs` (`pnpm screenshot`), which captures pages from the
local dev server for design review. Do not read its presence as an existing E2E
harness.

### The admin run carries a token — it is still not an auth harness

`pnpm screenshot --admin` captures the auth-gated `/admin` routes, and to get
past the gate it carries an admin JWT (`SCREENSHOT_ADMIN_TOKEN`, or
`--admin-token`). That is not authentication coverage. The script never logs
in: it takes a token minted by hand, out of band, and seeds it into
`localStorage` before the first navigation. No run exercises the login form,
the credential check, or session expiry — `/admin/login` is in the captured
set, but only as a page to photograph.

It also **never verifies the token's signature**, and that is deliberate rather
than an omission to fix. The script has no access to `JWT_SECRET` and does not
need it: the server is the thing that verifies, and the browser gate only
decodes. Its pre-flight check is structural (three base64url segments, a
numeric `exp` still in the future) and mirrors `isTokenValid()` in
`AdminTokenContext.tsx`, which is what actually decides whether the gate opens.
A stricter check here would reject tokens the app itself would accept.

The auth logic a screenshot run steps around is covered by unit tests instead:
`src/utils/auth.test.ts` pins the server-side `isAdmin` / `requireAdmin`
behavior, including the signature-verification failure path, and
`AdminTokenContext.test.ts` pins the client gate's `isTokenValid`.

## When behavior changes

Per the project rules, a behavior change needs Vitest coverage in the same
change. Practically: add the test next to the code, assert through the house
pattern above, and mutation-check anything load-bearing before calling it done.
