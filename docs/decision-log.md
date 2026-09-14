# Decision Log

## 2026-02-22: Recipe Search Feature Added

> **Superseded (2026-09-14).** No `/api/recipes/search` endpoint was ever
> shipped, and there is none today. Recipe search is a `?search=` query
> parameter on `GET /api/recipes`, parsed through the shared `searchParam`
> schema in `src/utils/pagination.ts`. The rest of this entry stands as the
> original decision.

### Summary

Implemented recipe search functionality across API and UI. Users can now search for recipes by name, ingredient, or tags.

### API Contract Change

- Added `/api/recipes/search` endpoint.
- Accepts query parameters: `q` (string, search term), `ingredients` (array), `tags` (array).
- Returns filtered recipe list with relevant metadata.
- Input validated with zod; output conforms to new recipe search schema.

### UI Accessibility Improvements

- Search input labeled and keyboard accessible.
- Results list uses semantic HTML and ARIA roles.
- Focus management and clear error messages for invalid input.

### Rationale

Enhances user experience and discoverability. API contract change required to support flexible search. Accessibility improvements ensure inclusivity.

---

## 2026-02-22: Recipe Cache Invalidation

## 2026-02-22: Direct-to-S3 Media Uploads

### Summary

- `/api/s3-signed-url` now supports POST for generating signed S3 PUT URLs for uploads. Request: `{ key, contentType }`. Response: `{ url }`.

- Progress and error handling remain unchanged for users.

### Security

- S3 credentials are never exposed to the client; only signed URLs are used.
- File type and size validation should be enforced client-side and/or in S3 bucket policy.

### Follow-up

- Consider removing `/api/uploads` if no longer needed.
- Add E2E tests for large file uploads.

---

## 2026-09-14: Archive Pages Are URL-Driven Server Components

### Summary

`/blogs`, `/recipes` and `/videos` were `"use client"` component trees that
fetched their list after hydration and held the current page in React state.
They are now async server components: they read `searchParams` (a `Promise` in
Next 16), fetch server-side with `cache: "no-store"`, sign cover photos through
`mapWithSignedImageUrl`, and emit real `<img>` elements into the SSR document.
Page and search state live in the URL as `?page=` / `?q=`, and pagination is
`<Link>`-based.

### Rationale

Client state made a paged archive unshareable and uncrawlable — there was no URL
for page 3 — and deferred every cover image to a post-hydration round trip, so
the first paint was an empty grid. Moving the state into the URL fixes both at
once, and pagination that is plain anchors works with JavaScript disabled and is
followable by a crawler.

The per-route list components this replaced (`BlogList`, `RecipeList`,
`VideoGrid`, `PaginatedBlogList`, `PaginatedRecipeList`) were deleted rather than
kept alongside; three near-identical trees were the thing being consolidated, and
leaving them in place would have preserved the duplication the change exists to
remove.

### Revisit when

An archive needs interactivity that cannot be pushed into a leaf client
component. The search box is already the shape of that exception —
`ContentArchiveSearch` is a client component inside a server page — so prefer
adding another leaf before converting a page back. Reverting a whole page to
`"use client"` gives up the shareable URL, the crawlable pagination and the
server-signed imagery together.

---

## 2026-09-14: One Content Item Shape, One Adapter Per Domain

### Summary

- `src/components/ui/ContentLanding.types.ts` is now
  `src/components/ui/content.types.ts`; `ContentLandingItem` is now `ContentItem`.
- `ContentItem` carries a structured `timestamp?: { iso, label }`. `meta` is
  byline-only and **must never be a date**.
- The three per-route `toContentLandingItem.ts` copies collapsed into
  `src/utils/contentItems.ts` (`toBlogItem` / `toRecipeItem` / `toVideoItem`),
  serving the landing grids and the archive rows from one adapter per domain.

### Rejected: a `variant` flag on the adapter

The obvious way to make one adapter serve two compositions is a
`variant: "card" | "row"` parameter that pre-formats the date into `meta` for
cards and omits it for rows. Splitting the date into `{ iso, label }` instead
removes the need for the branch entirely: the row places the date independently
as `<time dateTime={iso}>{label}</time>`, the card falls back to the label in its
single secondary line, and the adapter never learns which surface called it. A
`variant` flag would put surface knowledge back into a module that currently has
none, and would grow a third value the next time a surface is added.

### Rejected: `src/services/` as the home for the adapters

These are view-model mappings onto a UI contract, not domain rules, and a module
under `services/` importing from `components/ui/` inverts the dependency
direction this codebase already documents — `signedImageService` stays generic in
its item type precisely so the dependency points from a page into `services/` and
never back out. They live in `src/utils/`, beside `contentDetail.ts`, which is
the other neutral helper the content pages share and the owner of the date
formatter they reuse.

### Rationale for the rename

One item shape now feeds two compositions. A file named for one of them
mislabels every archive consumer that imports it.

### Revisit when

A surface needs an item field the other genuinely cannot produce. Add the
optional field to `ContentItem` before adding a surface parameter to the
adapters; the moment an adapter takes a surface argument, the duplication this
entry removed starts growing back. If the adapters ever need domain rules rather
than field mapping, that logic belongs in `services/` — but then the service
returns a domain type and the mapping onto `ContentItem` stays in `utils/`.

---

## 2026-09-14: Pagination Math Has One Owner

### Summary

`src/utils/pagination.ts` is the single owner of `totalPagesFor(total, pageSize)`
and `paginationParams(defaultPageSize)`, plus the shared `searchParam` schema and
the `MAX_PAGE` / `MAX_PAGE_SIZE` / `MAX_SEARCH_LENGTH` bounds. Four separate
page-count derivations were collapsed onto it, and `/api/blogs`, `/api/recipes`
and `/api/videos` now parse `?page=` / `?pageSize=` through one Zod shape.

### Rationale

The four copies had drifted, and one was wrong: `AdminBlogList` computed
`totalPages === 0` for an empty list, which is a pager with no pages. The shared
helper floors at 1, so zero entries report a single empty page and no consumer
special-cases emptiness. That floor is the contract, not an implementation
detail — a caller that wants 0 must not fork the helper to get it.

The bounds exist to keep `(page - 1) * pageSize` inside the safe-integer range,
where an unbounded product turns a public endpoint into a 500 via a query param,
and to keep the Redis key space finite — both list routes invalidate with a
`keys("<prefix>:*")` scan, so unbounded distinct search terms make every admin
write progressively slower.

### Constraints on the module

It is pure and imports nothing server-only, because `totalPagesFor` is read from
server and client components alike; a server-only import here would be dragged
into the client bundle. `zod` is the sole dependency and is safe on that count
(isomorphic, `sideEffects: false`, so a client importing only `totalPagesFor`
tree-shakes the schema half away).

### Revisit when

Never by forking. A new pager adopts this module; a new bound is added here. If
something server-only ever looks necessary inside it, split the schema half into
its own module rather than making the page-count half unsafe for the client.

---

## 2026-09-14: Per-Page Archive Layout Travels as a CSS Custom Property

### Summary

`/videos` renders two rows per line at ≥900px. It does this by declaring
`--archive-columns: 2` in `VideosArchivePage.module.css`; the shared
`ContentArchiveLayout` reads `repeat(var(--archive-columns, 1), minmax(0, 1fr))`.
`ContentRow` itself was not changed and takes no layout prop.

### Rejected: a `columns` prop

Threading a prop would make the shared row component aware that one of its three
callers is different, and the next art-directed page would add a second prop. The
custom property keeps the shared components page-agnostic: the page states what
it wants, the layout honours it, and a page that says nothing gets one column.

This rides the same channel `--card-media-ratio` already uses, so it is an
existing pattern rather than a new one.

### Revisit when

A layout difference cannot be expressed in CSS — a different DOM structure or a
different item contract rather than a different grid. That is a signal for a
distinct component, not a prop on the shared one.

### Note for testing

Vitest does not process CSS here, so this seam has no unit coverage by
construction. Verify it with `pnpm screenshot`. See `docs/testing.md`.

---

## 2026-09-14: Security Conventions From the Content Read Path

### Summary

Hardening the routes the archives drive traffic through produced four
conventions that apply beyond the routes that were fixed. They are recorded here
because a contributor writing a _new_ route will not read the comment at the site
that motivated them.

### The conventions

- **Never log a presigned S3 URL.** It carries its signature in the query
  string, which makes it a bearer credential. `src/utils/s3.ts` logs the key with
  the query stripped, and refuses to echo back a value it could not parse — a
  malformed URL must not leak a signature by falling through. Five sites were
  logging the full URL.
- **Parse route and query ids with a schema, never `parseInt`.** `parseInt` is
  too permissive for a primary key: `/api/blogs/1abc` served blog 1, and a
  non-numeric id became `NaN`, which reached Prisma and was interpolated into
  cache keys. Ids now go through a bounded `z.coerce.number().int().positive()`.
- **Never pass an untrusted value into an upstream URL or a cache key
  unvalidated.** `?channelId=` on `/api/videos` reached both: an `&` or `=` let
  an anonymous caller append parameters to a YouTube call authenticated with our
  key, and an unbounded value let one caller mint unbounded cached entries. It is
  now bounded by a character-class regex — deliberately looser than a real
  channel id so a non-standard `YOUTUBE_CHANNEL_ID` still works, tight enough
  that neither sink can be steered.
- **Never return an upstream error body to a client.** `/api/videos` was
  forwarding raw upstream errors, which can quote the request URL and with it the
  API key. Absent and malformed credentials now collapse into one generic 400:
  the caller learns the route cannot serve, not which credential is missing.

### Stack traces in logs are deliberate

`src/utils/logger.ts` serialized every `Error` to `{}`, because `name`,
`message`, `stack` and `cause` are non-enumerable own properties and
`JSON.stringify` skips them. A replacer now unwraps them, and it **keeps `stack`
on purpose**. The project rule against exposing stack traces concerns response
bodies; this logger writes to `console` only and never to a response, which is a
different trust boundary. Do not strip the stack citing that rule — it is the
only thing that makes a logged error locatable.
