# Design Research — Archive Rows (`/blogs`, `/recipes`, `/videos`)

Prepared by: Design Researcher Agent
Date: 2026-09-13
Consumer: UI Design Director Agent (then Frontend UI Agent)

---

## Project Understanding

**Product.** A Pacific Northwest craft-spirits / cocktail site (Next.js 16 App Router, React 19,
CSS Modules, TypeScript, Vitest). Content is editorial: blog articles, cocktail recipes, and
YouTube videos, all administered through `/admin` with uncontrolled, admin-uploaded cover
photography.

**Established visual language.** A warm-dark editorial system already shipped and is documented
at length in `src/components/ui/editorialTokens.module.css`, `ContentLandingLayout.module.css`
and `ContentCard.module.css`. Its thesis is **"warm-dark editorial; the photograph is the card."**
Concretely: no card surface at all (no background, border, radius or shadow), one fixed media
crop per page, hierarchy carried by size and ink opacity rather than weight, copper for
structural rules and gold for accent text, and a single 1200px left spine.

**The work.** Three archive/index pages are still on an unrelated older language (blurred
full-bleed background photo, centred `2.2em` heading, floating glass cards) and must be
overhauled to extend — not replace — the editorial system:

| Route | Chain | Notes |
|---|---|---|
| `/blogs` | `page.tsx` → `PaginatedBlogList` → `BlogList` | server-paginated |
| `/recipes` | `page.tsx` → `PaginatedRecipeList` → `RecipeList` | server-paginated + debounced search |
| `/videos` | `page.tsx` → `VideoList` → `VideoGrid` | server-paginated, external YouTube links |

**Audience and goal.** Home-bar readers arriving from the three landing pages' "View All"
buttons. These are *destinations of intent* — the reader has already said "show me all of
them." The conversion goal is therefore **scan-and-select**, not persuade. That distinction
governs almost every recommendation below.

**Direction from the user.** The lists must be laid out as **rows**, not the landing pages'
3-up card grid.

**Constraints.** Warm-dark ground; gold as the single accent and copper as secondary, with no
new colour families; type/spacing/motion from `editorialTokens.module.css`; CSS Modules only,
no new dependencies; a row must be one sensibly-named link target with a visible focus ring
and `prefers-reduced-motion` honoured.

---

## Design Territory

Five characteristics guided the search. They deliberately extend the landing system's own
stated set (*editorial, warm-dark, tactile, restrained, quick*) rather than opening a new one:

1. **Indexical** — the page's job is to be a findable list, not a showcase.
2. **Dense** — more items per viewport than the card grid delivers, measurably.
3. **Ruled** — structure carried by hairlines and alignment rather than by panels.
4. **Scannable-left** — one hard left spine that the eye can run down without re-aiming.
5. **Restrained** — the photograph still sells the click; nothing else should compete.

---

## Research Limitations

**Browser tooling was available and was used.** Playwright 1.61.0 is a pinned devDependency in
this repo and Chromium 149 launched successfully. Every reference in the matrix below was
loaded in headless Chromium at 1440×1000 and, where relevant, re-loaded at 390×844 with a
mobile user-agent and touch enabled. Screenshots were captured and **visually inspected**, and
selected geometry was **measured in the live DOM** rather than estimated.

Classification used throughout:

- **VV — Visually Verified.** Directly observed in a rendered screenshot I inspected.
- **MM — Measured.** Read out of the live DOM via `getBoundingClientRect` / `getComputedStyle`.
- **TV — Textually Verified.** Supported by written material (including this repo's own
  recorded measurements) but not directly seen by me.
- **INF — Inference.** My design interpretation, not evidence.

**Known gaps, stated rather than papered over:**

- Hover and focus states were **not** systematically captured as rendered stills. Where I
  describe an interaction it is marked INF unless a resting affordance was visible. Treat
  every hover recommendation below as a proposal, not an observation.
- `every.to/archive`, `eater.com/videos` and `newyorker.com/magazine/archive` returned 404 or a
  redirect and were dropped; `awwwards.com/websites/` returned an empty title (likely a bot
  wall) and was dropped. These are recorded here so the omission is not silent.
- `instrument.com/work`, `fontsinuse.com`, `kottke.org` and `thisiscolossal.com` were captured
  and inspected but yielded nothing transferable; they are listed under Rejected References.

---

## Candidate References

Eighteen sites were loaded. Seven are carried forward as influences. The selection is
deliberately split between three groups, because the single most useful finding was that
"row archive" is not one pattern but **two distinct species** plus a large body of
counter-evidence.

**Group A — genuine row archives (the core evidence).**

| Site | Why chosen |
|---|---|
| **Stripe — `/blog`** | The most crafted multi-column editorial row found. Full-container rows on an explicit drawn grid. |
| **Supabase — `/blog` (list mode)** | The only in-the-wild list/grid **toggle** found, and the densest ruled index row. |
| **YouTube — search results** | The canonical media-leading row, and the most usability-tested list on the web. Directly relevant to `/videos`. |
| **NN/g — `/articles`** | A text-first row index that *mixes video into a text list* — exactly our `/videos` vs `/blogs` problem. |
| **A List Apart — `/articles`** | The density ceiling for a thumbnail-free editorial row. |

**Group B — editorial row detail (device-level steals).**

| Site | Why chosen |
|---|---|
| **The Paris Review — `/blog`** | The metadata-bearing separator rule, and a small-thumbnail editorial row in the rail. |

**Group C — the direct competitor, as counter-evidence.**

| Site | Why chosen |
|---|---|
| **Difford's Guide — `/cocktails`** | The closest direct competitor to `/recipes`. It deliberately does **not** use rows. |

Also inspected and cited below for archive-header and control patterns, though not carried as
row influences: Linear `/blog`, Vercel `/blog`, Resend `/blog`, Aeon `/essays`, PUNCH
`/recipes/`, Imbibe `/category/recipes/`, MUBI Notebook, Dezeen `/design/`, TED `/talks`.

---

## Reference Extraction Matrix

| Reference | Evidence | Observed idea | Why it works | Relevance | Proposed adaptation to our tokens |
|---|---|---|---|---|---|
| **Stripe /blog** | VV | Each post is a full-container row on an explicitly *drawn* grid: faint dotted vertical rules at the column boundaries and a dashed horizontal rule between rows. Text column at left (kicker → title → dek → "Read more ›"), date top-right, authors mid-right, and the image occupying the lower right. | The grid is the ornament. On a page with no card surfaces, drawing the structure is what keeps a wide row from reading as loose debris. | High | Use one hairline (`--hairline`) *between* rows only — not a full drawn grid, which would add 4–5 vertical rules the warm-dark ground cannot carry without noise. Take the structural idea, not the density of rules. |
| **Stripe /blog** | VV | A **short vertical accent tick** (~2–3px wide, one line tall) immediately left of the kicker, and again left of the date. | It marks the start of a metadata column at almost zero cost and without a box, badge or fill. | High | This is the single best substitute for the landing card's straddling kicker badge, which has no seam to straddle in a row. Render as a `::before` at `2px` wide in `--rule-accent` (copper). Copper is already this system's rule colour and never its text colour, so the tick is consistent by construction. |
| **Stripe /blog** | VV | Row height ≈ 870px at 1440 — roughly **one row per viewport**. | Reads as a series of announcements. | High (as a warning) | **Reject this proportion.** A reader who clicked "View All" wants a list, not ten hero units. Our row must target 4–6 per viewport, not 1. |
| **Supabase /blog** | MM | List mode row: 12-column grid, **56px tall**, `padding: 16px 8px`; title at col 1 (14px, weight 400), category label at x≈844 (**9px uppercase, 0.63px ≈ 0.07em tracking**), date right-aligned at x≈1002; separator at ~**8% ink alpha**. No thumbnail, no excerpt. | ~18 rows per 1000px viewport. This is what a true *index* costs and delivers. | High | Our `--hairline` is 14% ink — correct, because a dark ground needs more alpha than Supabase's light one to read as the same rule. The 0.07em tracking sits between our `--fs-eyebrow` role (0.12–0.14em) and `.meta` (0.06em); use our existing `.meta` tracking rather than adding a third. |
| **Supabase /blog** | VV | A **list/grid toggle** as two icon buttons at the far right of the control bar. Critically, the two modes are *not* the same content re-flowed: list mode drops the thumbnail **and** the excerpt entirely. | The toggle is honest because the modes differ in information, not decoration. | High | See "The view-toggle question" below. The finding argues against a toggle for us, not for one. |
| **Supabase /blog** | VV (390px) | At phone width the row **sheds trailing columns**: avatars, category pill and the right-aligned date all disappear; the date drops to a second line under the title. Filter chips collapse to one native-looking `select`; search collapses to an icon button. | Column-shedding preserves the *list-ness* of a list where stacking would destroy it. | High | The correct collapse for a thumbnail-free row. Not the correct collapse for ours (we have a thumbnail) — see YouTube. |
| **YouTube search** | MM | Row 1152px wide × 281px tall. Thumbnail **500px = 43.4% of row width, ratio exactly 1.78 (16:9)**. Title 18px / 26px line-height, weight **400**. Media leads; text is **top-aligned**, not vertically centred. | Top-aligning the text against the media gives every row one shared reading start-point, so the eye runs straight down a single left edge of copy. | High | Adopt top alignment (`align-items: start`) without hesitation — our `ContentCard` already does exactly this in its 600–899px state. **Do not** adopt 43%: that is sized for a wide 16:9 still, and ours is square. |
| **YouTube search** | VV | Duration chip overlaid bottom-right on the thumbnail, on a dark opaque plate. | Puts the one fact that decides a video click on the one element the eye is already on. | Medium | Only adoptable if duration is available. `/api/videos` does not currently return it, so this is a **content-model dependency**, not a CSS decision. Flagged as a gap, not recommended as scope. |
| **YouTube search** | VV (390px) | At 390px the horizontal row is **abandoned entirely** — it becomes a 2-up grid of stacked cards (thumbnail above, title below). | The most-tested video list on the web concluded that a media row does not survive a phone. | High | Strong evidence that our row must stack below ~600px rather than shrink. It also matches what `ContentCard.module.css` already does at ≤599px. |
| **NN/g /articles** | VV | A **text-only** row index; only the video items carry a thumbnail, trailing on the **right**. Meta is one dim line: `August 28, 2026 \| Article: 3 minutes to read`. | Folding *type* and *duration* into the meta line makes a mixed index self-describing without badges. | High | Directly answers how a video row can sit in the same family as an article row: the media is the exception, and the meta line carries the type. |
| **NN/g /articles** | VV (390px) | At 390px the trailing thumbnail is left **floated inside the dek**, so the last line of copy wraps underneath it in a ragged L. | It is a visible defect on a site that writes usability guidelines. | High (as anti-pattern) | **Explicitly forbid** floating a trailing thumbnail into the text at any width. |
| **NN/g /articles** | VV | Pagination as `Previous « 1 2 3 4 5 6 7 8 9 10 » Next`, centred under the list. | Numbered pages are the only pager that lets a reader jump, and the only one that tells them how deep the archive is at a glance. | High | See "The pagination question". |
| **A List Apart /articles** | VV | Pure text rows: title → `by Author · Date` → a 2–3 line dek. **No thumbnails and no separator rules at all** — rows are divided by whitespace alone. ~6 rows per viewport. | Proves that in an index, the *rule* is optional if the vertical rhythm is disciplined enough. | Medium | Useful as the density benchmark to beat. We should not drop the rule, because our rows carry a photograph and therefore have a ragged right edge that whitespace alone will not resolve. |
| **A List Apart** | VV | Right rail: a topic list with the **count right-aligned** on each row, over a hairline. | A count turns a navigation list into an inventory. | Medium | Supports showing a result count in the archive header (see below). |
| **The Paris Review /blog** | VV | Between entries, a **full-width hairline that carries the metadata**: date set at the left end of the rule, category set in small caps at the right end (`September 10, 2026 ——— FIRST PERSON`). | One move solves three problems: it separates the rows, it places the date, and it places the kicker — at the cost of a single line. | **Highest** | This is the most transferable single device found. It replaces our card's straddling kicker badge with something that is *native to a row* rather than borrowed from a card. Date left in `--ink-3`, kicker right in `--color-accent-gold`, both at `--fs-eyebrow`, sitting on a `--hairline` rule. |
| **The Paris Review** | VV | Rail rows: a small (~88px) thumbnail leading at left, serif title + `By Author` + dim date at right. | A thumbnail can be small and still do its job when the row is short. | Medium | Confirms the small end of the thumbnail range is viable. |
| **Difford's Guide /cocktails** | VV | The nearest direct competitor renders its recipe archive as a **dense 6-up grid** of square, black-ground drink photographs with a serif title and a one-line dek — plus a `LOAD MORE CONTENT` button. | A cocktail is *identified by its photograph*. The grid maximises the number of identifiable glasses per viewport. | High | Genuine counter-evidence for `/recipes` specifically. Recorded in "What argues against rows" rather than suppressed. Note their crop is square on a dark ground — the same decision our system already made. |
| **Linear /blog** | VV | Archive header: large left-aligned title; beneath it one shared baseline row with **plain-text filter tabs left** (active in full ink, rest dim — no pills, no boxes) and a **pill search field + RSS icon right**. | Controls read as a caption to the title rather than as a toolbar bolted above the content. | High | The recommended archive-header composition. Plain-text tabs beat pills here: a pill is a filled surface, and this system has no filled surfaces. |
| **Vercel /blog** | VV | Meta **leads**: `8 September   General` sits above the title; excerpt and authors below. Same title-left / filters-left / search-right header as Linear. | Confirms Linear's header is a convention, not a one-off. | Medium | Reinforces the header recommendation. Note both Linear and Vercel draw **vertical hairlines between grid columns** — a ruled cell rather than a card. |
| **Resend /blog** | VV | Same header on a **dark** ground: oversized serif title left, search + Subscribe right, filter pills below. Byline as `avatar · Name · Date`. | Shows the header pattern survives a dark ground, which is our case. | Medium | Confirms the pattern transfers to `--surface-0` without modification. |
| **Aeon /essays** | VV | Header is centred: title, then `Latest / Popular` as underlined text tabs (active underlined), then a lede sentence in which the **category names are inline links** acting as filters. | Filters as running prose is the most restrained filter UI seen anywhere in the set. | Medium | An elegant fallback if a filter row is ever wanted on `/blogs` without adding a control bar. Not needed now. |
| **PUNCH /recipes/** | VV | Hero search rendered as a **bare underlined field** — magnifier glyph, placeholder, and a single hairline beneath. No box, no fill, no radius. | A boxed input is a card by another name. An underlined field is the only search treatment consistent with a system that has no surfaces. | **Highest** | This is the answer for the `/recipes` search input. Bare field, `1px solid var(--hairline)` bottom border only, going to `--rule-accent` on focus. |
| **Dezeen /design/** | VV | "Top design stories" rail is numbered `1 2 3 4 5` — numeral set large but in a **pale, quiet grey**, left of a 2-line title, hairline between rows. | The numeral is a column marker, not a headline. And it is on a *ranked* list ("Most popular"), where the number means something. | High | Decisive for the numbering question — see below. |
| **TED /talks** | VV | Video index is a **4-up grid** of 16:9 stills with a duration chip overlaid bottom-right; controls are search-left plus `Sort by`, `Topics`, `Subtitles`, `Duration` dropdowns. | Video browsing is visual-first; nobody reads a video index. | High | Second independent vote (with YouTube's mobile behaviour) that video wants a grid. |
| **MUBI Notebook** | VV | Kicker as a small overlay label on the image's top-left; meta line `Authors • Date` with a middle dot, closed by a hairline **below** each cell, with a comment count right-aligned on the same line. | A two-ended meta line (primary left, secondary right) uses the full width without inventing a column. | Medium | Supports the two-ended meta rule recommended below. |

---

## Recommended Row Anatomy Spec

This is a concrete proposal for the Director to accept, amend or reject. Every value is either
an existing token, a figure already derived in this repo, or a figure derived here from a
measured reference — none are taste picks.

### Which species of row

Two species were found, and they are not interchangeable:

- **Index row** (Supabase 56px, A List Apart, NN/g): little or no media, ~12–18 rows per
  viewport, reads like a table of contents.
- **Editorial row** (YouTube 43% media, Stripe, Paris Review rail): media leads, 4–6 rows per
  viewport, reads like a shortened card.

**Recommendation: the editorial row.** The index row is denser and genuinely excellent, but it
requires abandoning the cover photograph — and this system's entire thesis is that the
photograph is the object. Abandoning it on the archive pages would make the archives a
different design language from the landings they are reached from. The editorial row keeps the
photograph while still roughly doubling the items per viewport against the 3-up grid.

### Geometry

| Property | Value | Derivation |
|---|---|---|
| Row container | Inherits the `--container: 1200px` spine from `.root > *` | Existing contract. |
| Grid | `grid-template-columns: 26% 1fr` | **Already derived and measured in this repo.** `ContentCard.module.css` records that 34% leaves 115px of void beside the text at 899px, 30% leaves 90px, and 26% leaves 25px while remaining "the narrowest column at which the thumbnail still reads as a photograph rather than an icon." Reusing that derivation is strictly better than inventing a second one. At the 1200px spine, 26% = 312px. |
| Column gap | `var(--space-m)` (1.5rem) | Matches `ContentCard`'s existing `column-gap` in its row state. |
| Media ratio | `1 / 1` on all three pages | Existing page contract; see the videos question below. |
| Alignment | `align-items: start` | MM on YouTube (text top-aligned, not centred); already in `ContentCard`'s row state. |
| Vertical padding | `var(--space-l)` (2.5rem) above and below | Matches `ContentCard`'s existing row padding. |
| Separator | `border-top: 1px solid var(--hairline)` on `.row + .row` | Existing token; existing mechanism in `ContentCard`. |
| Density check (INF) | 312px media + 2×40px padding ≈ 392px per row → ~2.5 rows per 1000px viewport at 1440 | Roughly 2× the 3-up grid's effective density for a 10-item page, and far short of Stripe's 1-per-viewport. |

> **On `26%`:** it currently exists as a literal inside a media query in `ContentCard.module.css`.
> If the archive row adopts the same value, it is shared between two components and should
> become a token — `--row-media-col: 26%` — declared in `editorialTokens.module.css`. This is
> the **only** new token this research finds justified, and it clears that file's own stated bar
> ("Add the rung when the rule that needs it is written"): the rule now exists in two places.
> Token naming and the decision to add it belong to the Director; I am recording the
> justification, not making the call.

### Type roles — all existing tokens, none new

| Element | Token | Treatment |
|---|---|---|
| Date (left end of separator rule) | `--fs-eyebrow` | `--ink-3`, tracked 0.12em, uppercase |
| Kicker (right end of separator rule) | `--fs-eyebrow` | `--color-accent-gold`, tracked 0.12em, uppercase |
| Title | `--fs-card` | `--ink-1`, weight 600 (the system ceiling), `line-height: 1.2`, `max-width: 26ch` |
| Excerpt | `--fs-body` | `--ink-2`, `line-height: 1.5`, `-webkit-line-clamp: 2` |
| Byline | `--fs-meta` | `--ink-3`, weight 500, tracked 0.06em, uppercase |

The `26ch` title cap is load-bearing and already documented: `ContentCard.module.css` records
that it binds precisely in the 600–899px index row, "where the text column is far wider than a
title wants to be." An archive row is that state at every width, so the cap matters more here
than it ever did on the card.

### The separator rule carries the metadata (the Paris Review device)

Rather than porting the card's straddling kicker badge — which exists to bridge a seam between
a photo above and text below, a seam a row does not have — put the date and the kicker on the
hairline that divides the rows:

```
─── 14 MAR 2026 ─────────────────────────────────────────────── RECIPE ───
[ photo ]   Old Fashioned
            Two ounces of rye, a sugar cube, and the patience to stir it...
            BY JANE DOE
```

This is a `display: flex; justify-content: space-between` line sitting on
`border-top: 1px solid var(--hairline)`. It costs one line, removes the badge's negative-margin
arithmetic entirely, and gives the row a left-and-right anchored top edge that a photograph's
ragged right cannot disturb.

**Accessibility note (INF):** the metadata rule must render *inside* the row's single anchor, so
that the date and kicker are part of the link's content and the whole row is one target. The
accessible name should continue to come from the existing `ariaLabel` field on
`ContentItem` (e.g. "View recipe: Old Fashioned"), so the tracked-caps date does not get
read out letter-by-letter as the link's name.

### Hover and focus

All of this is **INF** — I did not capture rendered hover stills, and it should be treated as a
proposal to verify during the Director's render-and-refine loop.

| State | Proposal | Rationale |
|---|---|---|
| Row hover | `background: var(--surface-1)` bled to the full row, plus the existing image `scale(1.04)` and the existing gold title underline wipe | `--surface-1` (#1c1613) already exists as the system's raised warm-dark ground. A full-row tint is what makes a row feel like a target; a card does not need it because its bounds are its photograph. |
| Row focus | `outline: 2px solid var(--color-accent-gold); outline-offset: 3px` | Identical to `.card:focus-visible` today. Do not invent a second focus treatment. |
| Resting veil | **Drop it** on the archive row | The veil on `ContentCard` is justified there because the media is large and uncontrolled. At 312px in a dense list, ten dimmed thumbnails read as ten disabled rows. |
| Arrow affordance | **Do not add** | Stripe's "Read more ›" exists because its text column is not itself the link. Ours is. A chevron on a full-row link is redundant, and it competes with the gold underline that already signals the target. |
| Reduced motion | Collapse transitions to `0.001ms` and drop the image `transform`, exactly as `ContentCard.module.css` already does | Reuse the existing block verbatim; do not re-derive. |

### Mobile collapse

The hardest part, and the references disagree in an instructive way. **YouTube abandons the row
entirely at 390px** (VV) — it becomes a stacked 2-up. **Supabase keeps the row but sheds its
trailing columns** (VV). The difference is the thumbnail: a row with media cannot survive a
phone, a row without media can.

Because our row has media, the recommendation follows YouTube:

| Range | Behaviour |
|---|---|
| ≥900px | `26% / 1fr` row, metadata rule above, media leading |
| 600–899px | **Unchanged.** This is exactly the state `ContentCard.module.css` already produces for the landing card. |
| ≤599px | **Stack.** Media returns to full width, text beneath, metadata rule retained above the row, excerpt clamp relaxed to 3 lines |

**This convergence is the most important structural finding for the Director and deserves an
explicit decision.** `ContentCard` already *is* a row between 600 and 899px. So an archive row
and a landing card are the same object in that band, and differ only at ≥900 (grid vs. row) and
at ≤599 (identical again). Two paths follow:

- **(a) Extend `ContentCard`** with a row variant, since it already contains ~80% of the row CSS.
  Minimal new code; risks overloading a component whose props contract
  (`ContentCardProps`) is documented as "a normative cross-slice contract."
- **(b) A sibling `ContentRow`** consuming the same `ContentItem` type, with the shared
  values (`--row-media-col`, the hairline, the reduced-motion block) tokenised or extracted.
  More files; cleaner boundary.

This is an architecture/direction call, not a research call. I am flagging it because choosing
(a) blind would silently couple the archive design to the landing card's future.

### Empty, loading and error states

Today all three pages inline these as hardcoded `style={{ color: 'var(--color-error)' }}` and
`fontSize: '1.2em'` objects inside the Paginated* components — outside the token system
entirely. The landing shell already answers this properly:
`ContentLandingLayout.module.css` `.emptyMessage` sets the message as a **lede on the page
ground** (`--fs-lede`, `--ink-2`, `max-width: 48ch`, `padding-block: --space-xl`) with
explicitly no panel, no radius and no rules of its own, on the documented ground that the
header rule above and the CTA rule below already bracket it.

**Recommendation:** all three states reuse that treatment verbatim.

- **Empty** — the lede treatment, with the page's own copy.
- **Loading** — the same slot, same type role. No spinner. INF: a spinner is a widget, and this
  system has no widgets; a skeleton is worse, because it would draw ten grey card shapes on a
  page whose thesis is that there are no card shapes. A quiet line of text is consistent, and
  the fetch is a single paginated call.
- **Error** — the same slot, in `--ink-2` rather than `--color-error`. `--color-error` (#c1440e)
  is a red-orange that sits inside the copper family and will read as an *accent*, not an
  alarm, on `--surface-0`. It is also the only place any of these pages would use a fourth
  colour. Keep the copy plain and add a retry affordance styled as the existing
  `.viewAllButton`, which already has a documented focus and hover contract.

Each state must be announced to assistive technology — `aria-live="polite"` on the region, or
`aria-busy` on the list — since all three pages swap content client-side without navigation.

---

## The Four Direct Questions

### 1. Should the rows be numbered (01, 02, 03…)?

**No.** Three reasons, in descending order of force:

1. **The numbers restart on every page.** These archives are server-paginated (`ARCHIVE_PAGE_SIZE`, currently 12). `01` would appear at the top of page 1, page 2 and page 7. A reader who paginates sees
   the same numeral head three different lists, which reads as a bug. Continuing the count
   across pages (`11, 12, 13…`) fixes that but introduces a number whose meaning is "offset
   into a reverse-chronological feed" — information no reader wants.
2. **Numbering implies rank, and ours is chronology.** The one numbered list in the reference
   set — Dezeen's rail (VV) — is numbered because it is literally headed "Most popular." The
   numeral means rank, so it earns its column. Our archive is newest-first, where the honest
   leading value is the **date**.
3. **It would be the loudest thing on the row.** In a system where hierarchy is carried by
   opacity and 600 is the weight ceiling, a display-scale numeral would outrank the title.
   Dezeen avoids this by setting its numerals in a pale grey — which is to say, by making the
   number quiet enough that one may reasonably ask why it is there.

**The alternative, and it is a better one:** lead with the **date**, on the separator rule, at
the left end (the Paris Review device above). It gives the row exactly the leading column a
numbered list would give it, carries real information, is stable across pagination, and needs
no new type token.

### 2. Is a rows/grid view toggle a real pattern, or a tell of indecision?

**It is a real pattern — Supabase ships one (VV) — but it is the wrong move here, and Supabase
itself shows why.**

The toggle is legitimate there because the two modes carry **different information**: grid mode
shows the cover image and the excerpt; list mode drops both and becomes a 56px title-and-date
index (MM). The user is choosing between *browsing* and *finding*, which are genuinely different
tasks. The control is honest because the modes are not the same content re-flowed.

A toggle between our proposed archive row and our 3-up card would offer **the same five fields
in two arrangements**. That is decoration, and it costs: a persisted preference, two CSS paths
to maintain in perpetuity, two responsive matrices to test, and a control in the header that
tells the reader the designer could not decide.

**Recommendation: no toggle.** Ship one composition per page and commit to it.

**The one condition that would change this:** if `/recipes` later grows to hundreds of entries
and a genuine "find the drink I already know the name of" task appears, the correct response is
Supabase's — add a *stripped* index mode (title + date, no photo, no dek, ~56px rows), not a
mode that re-flows the same row. That is a different feature with a different justification,
and it should be argued on its own merits when the need is real.

### 3. Pagination: Prev/Next, numbered pages, load-more, or infinite scroll?

The references split by archive length (all VV): Difford's uses `LOAD MORE CONTENT`; Aeon,
Linear and Vercel effectively run long/infinite; **NN/g — the longest, most deliberately
indexed archive in the set — uses numbered pages**, `Previous « 1 2 3 … 10 » Next`, centred.

**Recommendation: numbered pages.** Keep Prev/Next, add the numerals.

The current shared `Pagination.tsx` renders `Previous / "Page X of Y" / Next`. `Page 3 of 47`
tells a reader how deep the archive is but gives them no way to act on it — they must click
Next 44 times. Numbered pages are the only pager in the set that supports both orientation and
jumping, and they suit a reverse-chronological archive where "page 9" is a meaningful location.

Infinite scroll is the wrong answer here on two independent grounds: it destroys the footer
(these pages have a closing CTA in the landing system's language), and it makes a specific item
unreachable by URL.

**Two defects found while researching this, both outside my boundary and reported as gaps:**

- **Page state is not in the URL.** All three pages hold `page` in React state
  (`useState<number>(1)`). A reader on page 4 who opens a recipe and presses Back returns to
  page 1. On archive pages specifically — where the whole interaction is "scan, open, come
  back, scan more" — this is the most damaging single defect on the three pages, and no amount
  of visual work fixes it. It should be a search param.
- **The shared pager is not shared.** `src/components/ui/Pagination.tsx` is imported by exactly
  one file, `src/app/(pages)/admin/blogs/AdminBlogList.tsx`. `BlogList`, `RecipeList` and
  `VideoList` each hand-roll their own pager markup and CSS — and `VideoList`'s even uses
  different labels (`← Prev` / `Next →` vs. `Previous` / `Next`). Restyling the shared component
  would therefore reach the admin page and **none** of the three archives.

### 4. Videos: shared or differing row ratio — and is the 16:9 premise right?

**The premise in the work order is incorrect, and I verified it rather than designing around
it.**

The work order states videos have a 16:9 thumbnail. They do not. `src/app/api/videos/route.ts`
selects `snippet.thumbnails.high` first. I loaded YouTube's thumbnail variants in Chromium and
read their intrinsic dimensions (MM):

| Variant | Intrinsic size | Ratio |
|---|---|---|
| `high` (**what the route requests**) | **480 × 360** | **4:3** |
| `medium` | 320 × 180 | 16:9 |
| `sddefault` | 640 × 480 | 4:3 |
| `maxresdefault` | 1280 × 720 | 16:9 |

And `VideoLandingPage.module.css` records a further measured finding (TV — this repo's own
recorded measurement, which I did not re-derive): the channel shoots **vertical** (source frames
at 2:3), so YouTube centres that portrait frame as a 240px column inside the 480px canvas and
fills the remaining 120px on each side with a blurred, zoomed copy of itself. The file records
that a 16:9 crop "trims 12.5% off the top and bottom of the glass" and leaves the real frame
holding only 50% of the card width, against 67% at 1:1 — and that both were rendered at 1440px
before square was chosen.

**Recommendation: all three archives share `1 / 1`.** Not as a consistency preference but
because 16:9 is measurably the wrong crop for this specific channel's thumbnails. The system
already states the rule — "ONE fixed ratio per page, held at every viewport… size changes across
breakpoints, framing does not" — and the archive is a new size of the same page, not a new
framing.

A shared ratio also buys something a row layout specifically needs: `/blogs`, `/recipes` and
`/videos` rows land on the **same left text edge** at every width, so the three archives read as
one system.

**Caveat, honestly stated (INF):** this reasoning is contingent on the channel continuing to
publish vertical. If it switches to landscape, square still holds acceptably (a letterboxed
16:9 still keeps its bars inside the square — cosmetic), but the derivation should be re-run.
If the route were changed to request `maxresdefault`, the whole question reopens. That is a
backend decision, not a design one.

---

## What Argues *Against* Rows

The work order asked for this plainly, so here it is plainly.

**`/recipes` is the weakest case for rows of the three, and the evidence is not close.**

1. **The direct competitor rejects rows for exactly this content.** Difford's Guide — the
   largest cocktail recipe index on the web — renders its archive as a dense **6-up grid** of
   square drink photographs (VV). Not a row in sight.
2. **A cocktail is identified by its photograph, not its title.** "Green Fizz," "Isle of Islay"
   and "The Gentlemen" (VV, Difford's) are opaque as strings and instant as images. A row
   spends ~74% of its width on text for an item whose text is the least discriminating thing
   about it.
3. **Row layout fights the search feature.** `/recipes` has a debounced search. Search results
   are a *recognition* task — the reader is matching against a remembered drink. Recognition is
   best served by many small images at once, which is the grid.
4. **Our own system already measured this.** `ContentLandingLayout.module.css` records that
   square minimises worst-case crop loss across a mixed-orientation library, and that at 4:5 the
   landscape studio shots were "magnified until the garnish ran off the frame edge." The square
   crop was chosen to make glasses comparable at a glance — a property a grid exploits and a
   row mostly wastes.

**`/videos` is the second-weakest.** Two independent references (VV) converge: TED's video index
is a 4-up grid, and YouTube — which *does* use rows on desktop search — **abandons them at
390px for a 2-up grid**. Additionally, videos carry no excerpt, so a video row is a photograph
and two short lines beside 74% of empty width. That void is real, not theoretical: the repo's
own measurements in `ContentCard.module.css` are all about how much void a media column leaves
beside the text.

**`/blogs` is the strongest case for rows, and it is a good one.** Articles have real titles,
real authors and real deks; the text genuinely is the discriminating content; and the reference
set's best row archives (Stripe, NN/g, A List Apart, Supabase) are all article archives. No
reservation here.

**None of this overrides the user's direction**, and the spec above is written to execute it as
well as it can be executed. But the Director should know that rows on `/recipes` is a choice
being made *against* the available evidence, not with it, and should watch for the specific
failure mode it predicts: a long right-hand void beside short cocktail names.

**A middle path worth the Director's consideration (INF):** keep the row on `/blogs` where the
evidence supports it, and on `/recipes` and `/videos` keep the *row's structural language* —
the metadata-bearing separator rule, the hairline rhythm, the left spine, the type roles — while
allowing two rows per line at ≥900px. The pages then read as one family and the image-led
content gets twice the items per viewport. This is a compromise, it is not what was asked for,
and it should be raised with the user rather than assumed.

---

## Idea Scoring

Rough 1–5, higher is better except Performance Cost and Implementation Cost where higher means
*cheaper*.

| Idea | Brand fit | Audience fit | Usability | Conversion | Distinctive | A11y | Perf cost | Impl cost |
|---|---|---|---|---|---|---|---|---|
| Metadata-bearing separator rule (Paris Review) | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 4 |
| `26% / 1fr` media-leading row, top-aligned | 5 | 4 | 5 | 4 | 3 | 5 | 5 | 4 |
| Copper accent tick before kicker (Stripe) | 5 | 4 | 4 | 3 | 4 | 5 | 5 | 5 |
| Bare underlined search field (PUNCH) | 5 | 5 | 4 | 4 | 4 | 4 | 5 | 5 |
| Archive header: title left, controls on one baseline (Linear) | 5 | 5 | 5 | 4 | 3 | 5 | 5 | 4 |
| Numbered pagination (NN/g) | 4 | 5 | 5 | 4 | 2 | 5 | 5 | 3 |
| Full-row `--surface-1` hover tint | 4 | 4 | 5 | 4 | 3 | 5 | 5 | 5 |
| Result count in header | 4 | 5 | 5 | 3 | 2 | 5 | 5 | 4 |
| Stack below 600px (YouTube) | 5 | 5 | 5 | 4 | 2 | 5 | 5 | 5 |
| Sequential row numbering | 2 | 2 | 2 | 2 | 4 | 3 | 5 | 4 |
| List/grid view toggle | 2 | 3 | 3 | 2 | 3 | 3 | 4 | 2 |
| Duration chip on video thumbnails | 4 | 5 | 5 | 5 | 3 | 4 | 5 | 1 |

The duration chip scores highest on conversion of anything in the table and worst on
implementation cost, because `/api/videos` does not return duration — it needs a second YouTube
API call (`videos.list` with `part=contentDetails`). That is a backend change and should be
decided on its own merits, not smuggled in as a design detail.

---

## Rejected Ideas

| Idea | Source | Why rejected |
|---|---|---|
| Stripe's full drawn grid (dotted verticals at every column boundary) | Stripe (VV) | Beautiful on Stripe's near-white ground. On `--surface-0` it would mean 4–5 light vertical rules plus a horizontal rule per row — visual noise on a ground that carries a film-grain layer already. Take the row structure, leave the scaffolding. |
| Stripe's ~870px row height | Stripe (VV) | One row per viewport. The opposite of what a reader who clicked "View All" asked for. |
| Sequential row numbering (01, 02, 03) | Dezeen (VV) | Numbers restart per page; imply a rank the content does not have; would outrank the title in a system with no weight headroom. See Q1. |
| List/grid view toggle | Supabase (VV) | Legitimate only when the modes carry different information. Ours would not. See Q2. |
| Infinite scroll / load-more | Difford's (VV) | Destroys the closing CTA the landing system establishes; makes items unreachable by URL. |
| Floating a trailing thumbnail into the dek on mobile | NN/g (VV, 390px) | Produced a visibly broken ragged wrap on the reference itself. Forbid at all widths. |
| Trailing (right-hand) media | NN/g (VV) | Works there because most rows have no media at all, so the thumbnail is an exception marker. Ours has media on every row; trailing media would put the ragged edge on the reader's return sweep. |
| Vertically centring text against the media | — | Contradicts YouTube's measured top alignment and `ContentCard`'s existing `align-items: start`. Centring makes every row start at a different height, destroying the single left reading edge that is the whole point of a row. |
| Filter pills / chips | Vercel, Resend, Supabase (VV) | A pill is a filled, radiused surface. This system's founding decision is that it has no surfaces. Linear's plain-text tabs (VV) achieve the same function inside the language. |
| Imbibe's left filter rail | Imbibe (VV) | Consumes ~240px of a 1200px spine permanently to serve a filter set we do not have. It also breaks the single left spine every other page in this system shares. |
| Spinner or skeleton loading state | — | A spinner is a widget; a skeleton would draw ten grey card rectangles on a page whose thesis is that there are no cards. |
| `--color-error` for the error state | current code | A red-orange inside the copper family; on `--surface-0` it reads as an accent rather than an alarm, and it is the only fourth colour on the page. |
| Keeping the resting veil on archive thumbnails | `ContentCard` (repo) | Justified on a large card image; at 312px across ten rows it reads as ten disabled rows. |
| Arrow / "Read more ›" affordance | Stripe (VV) | Stripe needs it because its text column is not the link. Ours is the link. Redundant, and it competes with the gold underline. |

**Rejected references** (captured and inspected, nothing transferable): `instrument.com/work`
(staggered masonry, not rows); `fontsinuse.com` (dense image grid); `kottke.org` (dashed-rule
rows, no thumbnails, no applicable craft); `thisiscolossal.com`; `pentagram.com/work`;
`vimeo.com/channels/staffpicks`.

---

## Recommended Visual Direction

A **ruled editorial index on the existing warm-dark ground.** The archive is not a different
design from the landing pages; it is the same design at a different density, and the mechanism
that carries the difference is the **hairline**, not a new surface, colour or component vocabulary.

Four moves define it:

1. **The rule does the work.** Every row opens on a hairline that carries its date at the left
   end and its category at the right end. That rule replaces the card's straddling kicker badge,
   separates the rows, and states the container width — the same job the copper rule does under
   the landing header, one tier quieter.
2. **The photograph leads but yields.** The cover image stays, square, at 26% — enough to be a
   photograph, not enough to be the event. On the landings the photograph *is* the card; in the
   archive it is the row's left margin.
3. **One left spine, top to bottom.** Header, controls, every row's metadata rule, every row's
   media, and the pager all start on the same 1200px left edge. The reader's eye should never
   re-aim horizontally while scanning.
4. **Controls read as a caption, not a toolbar.** Under the page title, on one shared baseline:
   result count left, search right, both set in the type roles the system already owns, with
   the search as a bare underlined field rather than a box.

### Archive header vs. landing header

The landing header is a poster — eyebrow, an 18ch heading at `--fs-page`, a 48ch lede, and a
deliberately empty right side, closed by a copper rule. The archive header must be recognisably
its sibling and unmistakably a different kind of page. Recommended differences:

| | Landing | Archive |
|---|---|---|
| Eyebrow | e.g. "Pacific Northwest" | **A back-link to the section page** — `← Recipes` — at `--fs-eyebrow` in `--color-accent-gold`. Occupies the eyebrow's slot and orients the reader who arrived via "View All". |
| Heading | "Recipes" at `--fs-page` | "All Recipes" at `--fs-page`, same slot |
| Lede | 48ch intro sentence | **Replaced by a result count** — `47 recipes` at `--fs-meta` in `--ink-3`. An inventory statement, not a pitch. (Supported by A List Apart's counted topic list, VV.) |
| Right side | Deliberately empty | **The search field** on `/recipes`, bottom-aligned to the heading's baseline. Empty on `/blogs` and `/videos` — asymmetry preserved. |
| Closing rule | `1px solid var(--rule-accent)` (copper) | **Unchanged.** The copper rule is the system's "container starts here" signal and must not be weakened; it is also what separates the header rule from the `--hairline` row rules below, so the two never read as the same tier. |

The `/recipes` search field, per PUNCH (VV): no box, no fill, no radius — placeholder at
`--fs-body` in `--ink-3`, a `1px solid var(--hairline)` bottom border going to `--rule-accent`
on `:focus-visible`, with a visible label (or a properly associated visually-hidden one; the
current `aria-label="Search Recipes"` is acceptable but a visible label is better on a page
where search is the primary control).

---

## Guidance for UI Design Director

Concrete and actionable. The Director owns every final call; this is the evidence.

**Settled by evidence — recommend adopting:**

1. Media-leading row at `26% / 1fr`, `column-gap: --space-m`, `align-items: start`, `1/1` media,
   `--space-l` vertical padding, `--hairline` separator. Reuses the repo's own derivation.
2. The metadata-bearing separator rule (date left / kicker right, `--fs-eyebrow`, `--ink-3` and
   `--color-accent-gold`). **The highest-value single idea in this brief.**
3. Stack below 600px; leave 600–899px exactly as `ContentCard` already renders it.
4. `1 / 1` on all three archives — the 16:9 premise is measurably wrong for this channel.
5. Archive header: back-link eyebrow, `--fs-page` heading, result count replacing the lede,
   copper closing rule retained.
6. Bare underlined search field on `/recipes`.
7. No row numbering; no view toggle.
8. Empty / loading / error all reuse the `.emptyMessage` lede treatment; no spinner, no skeleton,
   no `--color-error`; add `aria-live`.
9. Reuse `ContentCard`'s existing `:focus-visible` and `prefers-reduced-motion` blocks verbatim.

**Decisions I am explicitly leaving to you:**

- **`ContentCard` variant vs. a sibling `ContentRow`.** Consequential and architectural. See
  "Mobile collapse" above for the trade-off; it may warrant an Architecture Agent opinion.
- **Whether to add `--row-media-col: 26%`.** It is the only new token this research finds
  justified — the value is about to exist in two components, which clears
  `editorialTokens.module.css`'s own stated bar. Naming and the call are yours.
- **The full-row `--surface-1` hover tint.** Proposed but unverified (INF). Worth a render in
  your refine loop; watch that a tinted row does not turn the hairlines into cell borders and
  make the list read as a table.
- **Whether to raise the `/recipes` reservation with the user.** The evidence against rows there
  is strong and comes from the direct competitor. You may reasonably ship rows anyway for
  cross-page consistency — but the trade should be made knowingly.

**Things to watch during render-and-refine:**

- The right-hand void on `/videos` rows (no excerpt) and on short cocktail names. This is the
  predicted failure mode of rows here, and it is the thing to look at first in the rendered page.
- Rule tier collisions: the header's copper `--rule-accent`, the row hairlines, and the closing
  CTA rule must remain three legible tiers. On the landing pages there are only two.
- The `26ch` title cap now binds at *every* width, not just 600–899px. Verify it does not make a
  long blog title wrap mid-word against a very wide column at 1440.
- Ten square thumbnails in a vertical column is a new rhythm this system has not rendered before.
  Verify that ten uncontrolled admin photographs stacked at 312px do not read as a contact sheet.

**Out of your boundary but blocking a good result — raise to the Orchestrator:**

- Pagination page state is not in the URL on any of the three pages (Frontend API and Logic).
- `src/components/ui/Pagination.tsx` is used only by the admin blog list; the three archives
  hand-roll their own pagers with inconsistent labels (Frontend UI / Quality).
- Video duration is not returned by `/api/videos`, which blocks the highest-conversion video
  idea found (Backend API).

---

## Addendum — Convergence With Work That Landed in Parallel

Recorded at handoff. The working tree was clean when this research began; by the time the brief
was written, sibling specialists had landed archive scaffolding in files outside my boundary
(`src/components/ui/content.types.ts`, `src/utils/contentArchive.ts`, and edits to
`Pagination.tsx`). I inspected it read-only and am reconciling this brief against it rather than
leaving stale references behind. Four items change status:

1. **`ContentLanding.types.ts` → `content.types.ts`; `ContentLandingItem` → `ContentItem`.**
   Identifier references in this brief have been updated to match. No recommendation changes.

2. **The `ContentCard`-variant vs. sibling-`ContentRow` question is settled.** `ContentRowProps`
   now exists alongside `ContentCardProps`, i.e. option **(b)**. The open question in "Mobile
   collapse" above is therefore closed; the shared-value concern behind it still stands, and is
   exactly what the proposed `--row-media-col` token addresses.

3. **The URL-state defect is fixed.** `contentArchive.ts` introduces `ARCHIVE_PAGE_PARAM`,
   `ARCHIVE_QUERY_PARAM`, `buildArchiveHref` and `parseArchivePage`, and
   `ContentArchiveLayoutProps` takes `hrefForPage`, with `Pagination` moving to a link mode. The
   defect reported under Q3 is resolved; it is recorded there as found evidence, not as
   outstanding work. **The numbered-pages recommendation is unaffected and now cheaper** — a
   link-mode pager that already derives an href per page is one loop away from rendering
   numerals.

4. **The metadata-bearing separator rule is independently corroborated.** `ContentTimestamp`
   was split out of `meta` with the recorded reason that "the archive row places the date
   independently of the byline" and emits `<time dateTime={iso}>{label}</time>`. That is the
   Paris Review device arrived at from the data side. Two consequences for the Director:
   the date is available in both machine and human form, so the rule's left end should be a
   real `<time>` element; and `meta` is now optional, so a video row legitimately has a
   timestamp and no byline — which means **the row must not reserve byline space it may never
   fill**.

Nothing here weakens the brief's recommendations; items 3 and 4 strengthen two of them. The
remaining open gaps are unchanged: video duration is still absent from `/api/videos`, and
`/classes` and `/contact` remain on the old blurred-photo language.
