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

---

## 2026-09-14: The Admin Composes the Editorial Contract and Adds Four Rungs

### Summary

`src/components/admin/adminTokens.module.css` declares `.adminSurface`, which
`composes` `.editorialSurface` from the public contract and adds exactly four
custom properties: `--control-min` (`2.5rem`), `--record-thumb` (`3.5rem`),
`--hairline-strong` (`rgb(var(--ink) / 0.38)`) and `--danger` (`#e2645f`). Every
ground, ink tier, type step, spacing rung, container and motion token is consumed
from the composed rule unchanged. The rule is custom-properties-only, and that is
load-bearing: `composes` puts a second class name on the element at equal
specificity, so a colour or a padding declared in both rules would be settled by
CSS Modules' emission order — visible on one build, gone on the next.

### Rationale — a second token file, not four more rungs in the public one

Dependency direction. `src/components/ui/` is the domain-agnostic set any page
may read; `src/components/admin/` assumes an authenticated operator and must
never be imported by a public page. Putting `--danger` and `--control-min` in the
public contract would hand every public surface two tokens nothing there may use,
and the next person retuning the public scale would have to reason about an admin
dialog. The admin composes down into the shared contract; the shared contract
never reaches up.

The rungs are not prefixed `--admin-*`. `editorialTokens.module.css` states the
naming doctrine twice: a geometry value is named for its role and not for its
size — and a prefix names the file, not the role. Inside `.adminSurface` every
token is admin-scoped by construction, because the class is the boundary.

Three unrelated shells compose the rule — the page shell, the admin chrome and
the auth gate — and the last two render outside the page `<main>`, so they cannot
inherit the set from it. A rule carrying real declarations could not have served
all three.

### `--hairline-strong` is 0.38, not the 0.36 the research derived

`--hairline` is 14% ink, which measures **1.42:1** against `--surface-0`. That is
right for a line that separates content, and far below the **3:1** WCAG 1.4.11
asks of a line that bounds an interactive control. The ramp, composited and
measured on both grounds the admin paints on:

```
alpha   vs --surface-0   vs --surface-1
0.34        2.80             2.82
0.36        2.993            3.012
0.38        3.20             3.21
0.40        3.42             3.42
```

**0.36 reaches 3.002 on `--surface-0` only if the composite is quantised to 8
bits before measuring; measured continuously it is 2.993.** A token whose entire
justification is "it clears 3:1" must not sit on the step where the answer
depends on which arithmetic you happen to use. 0.38 is the first rung on the
file's own 0.02 ladder that clears the threshold on both grounds under either
method — and the margin is spent, not decorative, because a control keeps its
boundary when its row is hovered onto `--surface-1` and the ground moves under
it.

`--rule-accent` already clears the same bar: copper at its declared 0.8 alpha
composites to **3.60:1 on `--surface-0` and 3.47:1 on `--surface-1`**, which is
why the admin's primary button is copper-ruled and needed no new colour at all.
`--hairline-strong` exists for the neutral controls — inputs, secondary buttons,
row actions — that should not all be copper.

### `--danger` is `#e2645f`, and `--color-error` is retired from the admin

This is the finding most likely to be undone, because a contributor reaching for
"the error colour" will reach for the wrong one. `--color-error` (`#c1440e`)
measures **3.69:1 on `--surface-0` — below AA for normal text outright** — and it
sits at hue 18° against a page ground at 22.5° and copper at 28.9°. Five degrees
of hue from the ground it is painted on. It cannot read as an alarm in this
palette; it reads as a third accent that happens to be hotter. It was in use as a
danger signal in five places across the admin, and every one of them was wrong
for the same reason.

`#e2645f` is hue 2.3° — 20° off the ground, 27° off copper — and measures
**5.60:1 on `--surface-0` and 5.30:1 on `--surface-1`**, so it clears AA for
normal text on either ground a message can land on, while staying at the red end
of the same warm family. Rejected on measurement: `#d9635e` (5.30 / 5.02, which
clears AA by too little on `--surface-1`, where a dialog may sit), `#ef7a72`
(6.92:1, ample, but at that lightness it reads as salmon, and an alarm that reads
as decoration has failed), and any blue or magenta signal, which would open a
second hue family on a palette that is one hue plus ink.

### Rejected: reusing `--step-marker` for `--control-min`

`--step-marker` is already `2.5rem` and already justified on WCAG target-size
grounds in the public token file, verbatim. It is not reused, because it is named
for the recipe method disc and means "the diameter at which a numeral is legible
at arm's length over a shaker". One name serving two unrelated decisions is how a
system grows a value nobody dares change: the next person retuning the disc would
silently resize every button in the admin. Two names, one number, two reasons —
and if either reason changes, only one moves.

The same argument rules out `--row-media-col` as the home for `--record-thumb`.
It is 26%, a percentage declared with no ceiling for a media-leading reading row;
26% of the admin spine is 312px, and an 80px line needs a fixed small square.

### Revisit when

A fifth rung is proposed. The public file's own rule governs here — _"add the
rung when the rule that needs it is written"_ — and each of these four names the
rule in its comment. No token was added for a radius (the system's answer is
zero), a panel background (`--surface-1` exists), a shadow (there are none
anywhere), or an admin-specific type size (`--fs-h2`, `--fs-card`, `--fs-meta`
and `--fs-eyebrow` cover every role found).

Re-deriving a contrast figure is also a legitimate reason to return: these were
re-measured rather than inherited, and the method reproduces the public file's
own ink tiers (13.57 / 7.35 / 5.43 against its recorded 13.57 / 7.38 / 5.43). One
published figure did not survive that re-derivation, which is the whole reason
`--hairline-strong` is 0.38.

---

## 2026-09-14: `--danger` Is Spent Once Per Screen State, and Never as a Fill

### Summary

`--danger` has exactly three readers and the list is closed on purpose: the
confirming control of a destructive dialog; a failed **write**, at either scope
(`AdminStatus tone="error"` for the screen's message, an `AdminField` error
caption for one control's); and a Delete **in a repeated context**, at `:hover`
and `:focus-visible` only. It is never a fill.

### Three answers by role, which is what stops it meaning nothing

The question is not "is this bad" but "what is this reporting":

- A failed **write** takes `--danger`. The admin has lost work.
- A failed **read** takes no colour at all — `--ink-2` prose in the empty slot.
  Nothing was lost; the list simply did not arrive.
- A **fact** being reported, where nothing failed and nothing was destroyed,
  takes a neutral badge. The album's "not shown publicly" chip is the live
  example.

A colour that appears on all three appears constantly, and a colour that appears
constantly is a fourth accent rather than an alarm.

### Delete is neutral at rest in a list and red at rest in a dialog

The criterion is **repetition, not severity**. Eight rows of red Delete is eight
alarms, and this system's founding mechanism is that hierarchy is carried by
opacity rather than by weight — so a row's Delete sits at `--ink-2`, one tier
under Edit at `--ink-1`, and the alarm arrives at the moment of commitment
instead.

The mechanism is that **the list is what makes a control repeated, so the list is
what neutralises the resting alarm.** `AdminCardGrid.module.css` sets
`--admin-danger-rule: var(--hairline-strong)` and
`--admin-danger-ink: var(--ink-2)` on `.grid` — on the grid, not on one density,
because the criterion is "inside a list of records" and a row list that grows an
inline Delete tomorrow should inherit the same answer. The confirming control of
a confirmation dialog is portalled into `document.body`, outside every grid, so
it never receives the neutralisation and keeps its red. Hover and
`:focus-visible` re-declare `--danger` on the element itself, where an own
declaration beats an inherited one regardless of specificity, so a keyboard user
is warned at the same point in the interaction as a pointer user.

That is why the same component with the same `tone="danger"` is red in a dialog
and neutral on a tile — one behaviour with one explanation, rather than two
components that happen to agree.

### Rejected: a `repeated` prop on the button

The page's shape already states the fact. A boolean would be a second place to
declare it, and the first call site to forget it would be a red tile in a grid of
twelve with nothing to explain it.

### Rejected: `--danger` as a fill

This system has one filled surface in total — the gold CTA, a documented
exception. A filled `--danger` button would need dark text on it and a second
button anatomy to carry it. As a rule and as text on a control whose neighbour is
neutral, it is already unmistakable.

### Revisit when

A fourth reader is proposed. Check first which of the three roles it actually
occupies; two of the three take no colour at all, and most candidates turn out to
be facts. If the roster genuinely grows, it grows in the token's own comment,
which is where the closed list is declared.

---

## 2026-09-14: The Admin Card Is a Non-Interactive Container With No Root Passthrough

### Summary

`AdminCard` is a plain container for one manageable record. Its actions are real,
individually focusable `<button>`s rendered as siblings, and `AdminCardProps`
exposes **no `...rest`, no `rootRef`, no `style` and no `className`** on the card
root. `AdminNavCard` is a separate component for the one case where a whole card
is a link.

### Rationale

What this replaced was a `<div role="button" tabIndex={0} onClick>` containing
`<button>Edit</button>` and `<button>Delete</button>` in both list components,
and the same shape again on the album tile. Interactive content nested inside an
interactive element is invalid, and the cost was not theoretical: the card was a
single ambiguous tab stop announced as a button whose content is two more
buttons, every inner handler had to stop propagation to keep the outer one from
firing, and the outer key handler swallowed Space inside the album's caption
field.

**The absence of a passthrough is the load-bearing half.** Any `...rest` would
let a consumer spread an `onClick` or a `role="button"` back onto the root and
silently re-create the bug the contract exists to remove. There is no escape
hatch on purpose. The sortable album still works, because the node ref, the
transform style and the dragging state position the card _within its list_ and
therefore belong to a wrapper the consumer renders around the card; only the drag
grip, which the card must place in its own corner slot, is passed in — as a node,
because the activator carries the drag library's attributes and listeners.

Whole-card click-to-edit is deliberately not preserved. Every way of restoring it
re-creates the nesting, and the actions row already gives each card a named,
reachable Edit control.

### Rejected: one component with an optional `href`

A landing entry is not a card with a link in its action row — it is a card whose
entire surface is the target, which is only legal _because_ it contains no other
interactive content. That is the exact inverse of `AdminCardProps`' defining
guarantee. Folding both into one component would mean a card that is interactive
or not depending on which fields were passed, and the first consumer to put a
link action beside two buttons would land back on the same rule. Two components,
each with one honest shape.

### Revisit when

Never by adding a spread to the root. If a consumer needs to position or decorate
the card, it wraps it. If a new surface genuinely needs the whole card to be the
target, it takes `AdminNavCard`'s shape — a card containing no other interactive
content — rather than a flag on this one.

---

## 2026-09-14: One Opening Rule, Two Gates

### Summary

The page header's copper rule _is_ the opening rule, so the first thing below it
must not draw its own. `AdminPageLayout.module.css` declares
`--admin-opening-rule: transparent` on `.header + *`; `AdminCardGrid.module.css`
gates it by position in the list (`.rows > .item:first-child`,
`.cards > .item:first-child`, and `:nth-child(-n + 2)` above the 900px seam); the
card paints the resolved value.

### Rationale

Three different components can be the first thing under that header — an
`AdminPanel` on `/admin/classes`, a nav of `AdminNavCard`s on `/admin`, a list of
`AdminCard`s on `/admin/blogs` and `/admin/recipes` — and each drew its own
opening hairline. Whichever arrived first therefore drew a second horizontal rule
below the copper one with no content between them. That is not a hierarchy of two
tiers, it is one rule drawn twice, and the copper is already the stronger and
already says "the header ends and the body begins". Measured before the fix on
`/admin/blogs` at 1440×900: copper at y257.8, hairline at y297.8, both x120
w1200. On `/admin` the lower rule arrived _twice_, at x120 w568 and x752 w568,
with a 64px nick in it where the column gap sits.

**Two gates, because neither fact is sufficient alone.** "You open the page" is a
fact about position in the shell and is knowable only in the shell. "You are the
first record in the run" is a fact about position in a list and is knowable only
in the list. A list nested inside a panel opens no page, and a record halfway
down a list opens no run. So the shell grants a permission and the list spends it
— which is also why it travels as an inherited custom property rather than as a
descendant selector, since CSS Modules hashes class names per file and a
`.header + .rows` selector cannot be written across two of them.

The distinction earns its keep on `/admin/classes`: its sessions list is also
`rows`, but it sits inside the _second_ panel, under that panel's heading and
description, so its first record's hairline is doing real work bracketing the
run. The shell sets the permission only on its own first child, so the fallback
there resolves to `--hairline` and the rule survives. Clearing it would not fix a
defect, it would create one.

The landing's gate is `:nth-child(-n + 2)` above 900px and `:first-child` below,
not `:first-of-type`: the landing's first _row_ is two entries above the seam and
one below it, so a selector matching a single first child would clear the left
column at 1440 and leave the right one doubled.

### Outstanding: `AdminPanel` has not converged on this

`AdminPanel.module.css` answers the same defect independently, with
`.panel:first-of-type { padding-top: 0; border-top: none }`. These are one
problem, not two that present alike — every instance is the same sentence, and
only the distance from the shell varies. A panel _is_ the shell's first child, so
the positional gate the other two need is invisible there.

Converging is two lines and is deliberately not done: the panel's
`:first-of-type` block also drops `padding-top`, which is a spacing decision this
property says nothing about and which would have to survive separately. Recorded
so that a fourth site does not arrive at a fourth answer.

### Revisit when

A fourth component can be the first thing under the page header. It reads
`--admin-opening-rule` rather than adding a positional selector of its own — and
that is the occasion to converge `AdminPanel`, carrying its padding decision
across by hand.

---

## 2026-09-14: Focus Restore After a Destructive Action Declines Rather Than Guesses

### Summary

`src/hooks/useModalDismiss.ts` restores focus in three tiers: the trigger, if it
is still in the document; otherwise the nearest surviving non-shell **ancestor**
of the trigger, re-entered at the index the trigger's branch occupied; otherwise
nothing. `SHELL_TAGS` is `MAIN`, `BODY`, `HTML` — reaching one of those means
every container the user was actually inside has been destroyed, and the walk
declines.

### Rationale

A destructive action destroys the very control that closed the dialog, so tier 1
has nothing to return to. Recording the index, and not only the ancestor, is what
distinguishes "focus the list again" from "focus the record that took the deleted
one's place": after deleting the 2nd of 4 sessions, focus lands on the Edit
button of the record now sitting 2nd, at the deleted row's exact y. An admin
clearing several records in a row is the case this exists for, and the
alternative costs a full re-traverse — measured on `/admin/blogs`, returning from
`<body>` to the second row's Delete is **eight Tab stops**.

### Why tier 3 declines, and why `MAIN` is on the stop list

`MAIN` is there because of a measured bug, and it is the whole reason the stop
list exists as a named constant. On `/admin/classes` a confirmed delete unmounts
all three panels, so the first surviving rung is `<main>`; the walk re-entered
`<main>` at the album panel's index and took that panel's first focusable control
— the **upload caption field** sitting above the grid. Focus landed in a text
input the admin never chose, and keystrokes after a delete silently became the
next upload's caption. Typing `leaked text` after a settled delete and reading
the field back returned `"leaked text"`; that field is described to the admin as
_"Optional. Saved with the next photo you upload."_

That is a silent data-integrity failure, not an accessibility inconvenience, and
it is what makes "land nowhere" the correct answer at the shell boundary. A walk
that keeps climbing until it finds _something_ focusable will always find
something; the question is whether that something has any relationship to where
the user was. Above the last surviving container, it does not.

The restore also runs twice — immediately in the modal's unmount cleanup, and
again once the DOM has actually changed — because at cleanup time the deleted row
is typically still mounted, so tier 1 matches a button that unmounts about 50ms
later and focus falls to `<body>`. The deferred pass aborts unless focus is still
on `<body>`, aborts if the trigger is still connected, and is bounded, so it can
never take focus from someone who has already moved on.

### Rejected: a second, narrower selector for landing

The independent review proposed splitting `FOCUSABLE_SELECTOR` into a wide
cycling set and a narrow `RESTORE_LANDING_SELECTOR` of
`"a[href],button:not([disabled])"`, on the principle that a trap must _reach_ a
text field but a restore must never _land_ in one. The principle is right; the
implementation answers it differently — **one selector, with the landing bounded
by where the walk stops.** Two copies of a focusable-element list is how
"focusable" comes to mean two different things in one dialog, the trap cycling
through one set while focus is restored into another. And a narrower selector
would still have landed _somewhere_ inside the album panel, one control further
along, rather than admitting that the panel is not where the user was. Adding
`MAIN` to the stop list answers the same measurement at its cause.

### Revisit when

A restore lands somewhere unrelated again. Check the stop list first — the
question is almost always "which container did the user actually lose", not
"which elements are focusable". If a second selector is ever genuinely needed, it
has to arrive with an argument for why cycling and landing disagree about a
specific element, and both definitions must live in this one file.

---

## 2026-09-14: A Busy Destructive Dialog Has No Dismissal Route and No Timeout

### Summary

While a destructive request is in flight, `AdminConfirmDialog` declares a
dismissal lock that `Modal` enforces across all four routes — Escape, the
backdrop, Cancel and the close button — and the confirming control relabels
itself and carries `aria-busy` throughout. There is **no timeout**.

### Rationale — closed toward disabled, not toward enabled

The request is already in flight and cannot be recalled, so there is nothing
honest for a cancel control to do. A "cancel" that dismisses without cancelling
returns the admin to a list that is about to change under them with no sign that
it will.

The lock is _declared_ rather than enforced inside the dialog, which is the
correction over the first version: neutering `onClose` reaches Escape and the
backdrop but **not** the close button, because `Modal` renders that button itself
and wired it to the same no-op — so the most clickable control in the dialog sat
enabled, doing nothing, as the only stop in the tab ring, with body scroll
locked. A dialog whose one reachable control is dead reads as frozen. `Modal`
owns all four routes, so the lock is declared for it to enforce.

### Rationale — why no timeout

A timeout on a **non-idempotent** destructive request invents a second failure
mode. If the timer fires and the request later succeeds, the UI has told the
admin the delete did not happen while the record is gone. One unbounded wait is
better than two contradictory truths.

If a bound is genuinely wanted later it belongs on the `fetch` —
`AbortSignal.timeout()` — and not on the dialog. A rejected request already
routes into the action-error path every list owns, so a timeout there produces
one failure mode that already has a UI instead of a second one that does not.
Reach for it only once something has actually hung.

### The honest gap

The reference tools that handle destruction best make it reversible and skip the
dialog entirely. `DELETE /api/blogs/:id` destroys the row and its S3 media
outright, so a dialog is the only recovery this surface can offer. Soft delete is
the real answer and is a backend change.

### Revisit when

Soft delete arrives. At that point the confirmation is the thing to reconsider,
not the timeout: a reversible delete can lose the dialog and gain an undo, and
this entry's reasoning about in-flight cancellation stops applying, because there
is then something honest to cancel.

---

## 2026-09-14: The Newsletter Preview Is a White Specimen, Deliberately

### Summary

The composer's HTML preview is a white plate on a warm-dark page, and it stays
white. It is framed rather than fought — a dark gutter inside the plate so the
hairline is visible against the white, and a `--fs-eyebrow` "Preview" caption
above it — and it is **not** sized to its content. The iframe carries
`sandbox=""`, plain empty.

### Rationale — framed, not fought

Email HTML is light and a real inbox is white, so any recommendation phrased as
"everything on the admin is dark" is simply false on this surface. But an
unframed white rectangle inverts the page's hierarchy: white is 21:1 against
`--surface-0` where the brightest ink this palette owns is 13.57:1, so the
specimen outranks the composer. Measured before the fix at 1440×900, the plate
was 568 × 648px for a roughly 150px email — 28% of the viewport — and the
hairline that was meant to frame it was 14% alpha drawn directly against pure
white, which is invisible. The dark gutter is what makes the border visible at
all, and what turns the rectangle into a mounted specimen.

One correction worth recording, because the wrong mechanism would send the next
reader to the wrong line: the 648px was **not** a stretched grid item inheriting
the form column's height, and the plate was already start-aligned. 648 is exactly
72vh of 900, and the same capture at 1024×768 measured 553 = 72vh of 768. The
height was always a declaration. The plate now opens at 22rem — the empty state's
own height, so typing the first character can never make the specimen _shrink_ —
and at the two-column width it clamps between that floor and 28rem.

### Rationale — why it cannot be sized to its content

This is the thing the next person will try. Auto-sizing an iframe to its document
requires measuring that document from the parent, and `sandbox=""` puts the frame
in a unique opaque origin **precisely so the parent cannot reach into it**.
Giving the measurement back would mean handing the frame's script a channel into
this page. A fixed window that the email scrolls inside is the correct trade, and
it is also what an email client does.

### `sandbox=""`, and explicitly not `allow-scripts allow-same-origin`

A `srcdoc` frame inherits the **embedder's** origin, so a `<script>` in pasted
newsletter HTML would run same-origin with this page and could read the admin
bearer token straight out of `localStorage`. Three things make that concrete
here: this HTML is routinely pasted from third-party templates, it is re-hydrated
from a `localStorage` draft on mount, and the token sits one `getItem` away.

`allow-scripts allow-same-origin` together are equivalent to no sandbox at all —
they let the frame reach out and remove its own sandbox attribute. Empty also
happens to be the faithful preview: no email client runs JavaScript, so a script
that ran here would be showing the admin something no subscriber will ever see.

### Revisit when

Never for the sandbox flags. For the plate's bounds: if the composer grows a
"send a test to myself" path, that is the better answer to "does this email look
right", and the preview can shrink rather than grow.

---

## 2026-09-14: One Authenticated-Fetch Policy, One Session Policy

### Summary

`src/hooks/useAdminFetch.ts` is the single authenticated fetch for every admin
surface. On 401 or 403 it ends the session — and then **returns the response**.
It does not throw, does not stop the caller, and does not navigate.
`AdminAuthGate` is the sole owner of where an unauthenticated admin lands.

### Rationale

Four hand-rolled copies each answered the redirect differently: a hard
`window.location.href`, a `router.push`, and an 800ms-delayed hard navigation
that raced the gate. Two independent redirect mechanisms is how that happens. The
gate already watches session validity, so clearing the token is enough to trigger
it, and every caller keeps one way of reacting to a response instead of one way
plus an invisible navigation.

Returning rather than throwing follows from the same rule: the caller asked for a
response and gets one, so the session-ending branch cannot change a call's
control flow behind its back.

**A tokenless call is still sent, unauthenticated.** The server is the
authorization boundary, so a client-side rejection would add a second,
client-only failure mode with a different shape than the 401 it is imitating —
the exact duplication this hook exists to remove. Some admin GETs are
legitimately anonymous and return a capped public result, which the classes
manager depends on to paint before a token is available. A caller that must not
run anonymously gates on `isAuthenticated` rather than expecting the fetch to
throw.

The `headers` field is narrowed from `HeadersInit` to a plain record because the
helper merges by spreading, and spreading a `Headers` instance yields `{}`
silently — the copies this replaced were one `new Headers(...)` away from
dropping the bearer token. Narrowing turns that into a compile error instead of a
runtime 401.

### Safe error text has one owner too

`readAdminError` reads a **clone** of the response, so a caller can still consume
the body itself, and surfaces a server `{ error }` string only when it looks like
one of our own curated messages: single-line and under 200 characters. A proxy's
HTML error page, a driver dump or a stack trace fails that shape and is replaced
by the caller's fallback, so an unexpected upstream body can never become UI
text. It never throws, and never returns a token or any part of the request.

### Revisit when

A surface needs a different session outcome — a soft "your session expired, here
is what you were doing" rather than an immediate sign-out. That is a change to
the gate, which owns the landing, not to the fetch, which owns the credential.
Adding a navigation here re-creates the race this entry removed.
