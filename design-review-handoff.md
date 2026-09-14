# Design Review Handoff

Prepared by: UI Design Director Agent
Date: 2026-09-14 (revision 2, reconciled after the revision-2 review)
Consumer: UI Design Reviewer Agent
Upstream: `docs/design-research/archive-rows.md` (research),
`docs/design-research/archive-rows-review.md` (independent review of revision 1)

> **Revision 2** answers the review's verdict of "needs another refinement pass".
> Every change since revision 1 is listed under
> [What Revision 2 Changed](#what-revision-2-changed), with the measurement that
> drove it. Sections above that point describe the current state, not the
> original one.
>
> **This document has since been reconciled against what actually shipped.** An
> earlier draft described the two-up on `/videos` as a `--archive-columns: 2`
> declaration on the page's CSS class. That mechanism was replaced by a `columns`
> prop while fixing an LCP defect it caused, and item 1 below now describes the
> shipped one. Two verdicts from the revision-2 review are also folded in: the
> hover tint is settled and stays as it is, and the reviewer withdrew its
> revision-1 finding that the row fails on `/videos`.

---

## Project Goal

Overhaul the three content archive pages — `/blogs`, `/recipes`, `/videos` — so they
extend the shipped warm-dark editorial system rather than continuing the older
blurred-photo / glass-card language they were on.

The user directed that the lists be laid out as **rows**, not the landing pages' 3-up
card grid. Revision 1 shipped a single-column row on all three pages. The independent
review measured `/videos` at 14% ink coverage with 52% of the spine empty on every
row, judged the research right about `/videos` and wrong about `/recipes`, and routed
the question back to the user.

**The user's answer, and the shape of revision 2:** `/videos` takes the research's
middle path - two entries per line at >=900px, one per line below - while `/blogs` and
`/recipes` stay single-column. It is still a row, not a card: the metadata-bearing
hairline, the type roles, the hover tint, the focus ring, one anchor per entry and the
real `<time>` all survive unchanged. Only the number of entries sharing a line changed,
and it changed on the list rather than in `ContentRow`.

**Outcome:** the revision-2 review withdrew the finding that the row fails on `/videos`.

The reader arrives here from a landing page's "View All" button, so they have already
chosen. The conversion goal is **scan-and-select**, not persuade.

---

## Final Visual Direction

**A ruled editorial index on the existing warm-dark ground.**

Five characteristics, extending the landing system's own stated set rather than opening
a new one:

1. **Indexical** — the page is a findable list, not a showcase.
2. **Ruled** — structure is carried by hairlines and alignment, never by panels.
3. **Scannable-left** — one hard left spine the eye runs down without re-aiming.
4. **Warm-dark editorial** — unchanged ground, ink tiers, copper rules, gold accent text.
5. **Restrained** — the photograph still sells the click; nothing else competes.

The archive is not a second design language. It is the same design at a different
density, and the mechanism carrying the difference is the **hairline**, not a new
surface, colour or component vocabulary. No new colour family, no new type role, no
new surface, one new geometry token.

---

## Key Design Principles

### The rule does the work

Every row opens on a hairline that carries its date at the left end and its category
at the right. That one line separates the rows, places the date and places the kicker —
replacing the landing card's straddling kicker badge, which exists to bridge a seam
between a photo above and text below that a row does not have.

### The photograph leads but yields

On the landings the photograph _is_ the card. In the archive it is the row's left
margin: square, 140-160px, enough to be a photograph and not enough to be the event.

### The photograph sets the row height, and the column is the lever

Revision 1 claimed the cap made the text govern the row. Measured, it does not and
cannot: a recipe's content box is 129px, an article's 62-88px and a video's 26-53px,
so a 160px plate governs every row. Parity would mean a ~30px square on `/videos`,
which is not a photograph, and a photograph is this system's thesis. So the honest
principle is the opposite one - the media sets the height, the ceiling stops that
height being absurd, and where the void is intolerable the fix is to **narrow the
column, never to shrink or enlarge the plate**.

### One left spine, top to bottom

Header, controls, every row's metadata rule, every row's media, the closing rule and
the pager all start on the same 1200px left edge. Nothing makes the eye re-aim
horizontally while scanning — including the pager, which is left-aligned rather than
centred.

### Controls read as a caption, not a toolbar

Under the page title, on one shared baseline: result count left, search right. The
search is a bare underlined field, because a boxed input is a card by another name and
this system has no surfaces.

### Three rule tiers, held apart by distance and colour

1. copper `--rule-accent` under the header — "the container starts here";
2. `--hairline` opening every row and closing the run of rows;
3. `--hairline` under the search field, a control affordance rather than structure,
   separated from tier 2 by the whole header.
   A second copper rule anywhere below the header would flatten tier 1 into tier 2.

---

## References Actually Used

Evidence classes are the brief's: VV visually verified, MM measured in the live DOM,
INF inference. Every item below is traceable to a row of the brief's extraction matrix.

| Reference                                       | Evidence                  | Extracted idea                                                                                                                                        | Adaptation                                                                                                                                                                                                                                                                                                            | Implementation                                                                  |
| ----------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| The Paris Review `/blog`                        | VV                        | A full-width hairline between entries that _carries the metadata_ — date at the left end, category in small caps at the right.                        | Date in `--ink-3`, kicker in `--color-accent-gold`, both at `--fs-eyebrow`/0.12em, hanging under a `--hairline` rule. Rendered **inside** the row's anchor so the whole row including its rule is one link target; the accessible name still comes from `item.ariaLabel`. The date is a real `<time dateTime={iso}>`. | `ContentRow.tsx` `.rule`; `ContentRow.module.css` `.rule` / `.date` / `.kicker` |
| YouTube search results                          | MM                        | Media leads and the text is **top-aligned**, not vertically centred, so every row shares one reading start-point.                                     | `align-items: start`. The measured 43.4% media width was **not** adopted — it is sized for a wide 16:9 still and ours is square.                                                                                                                                                                                      | `ContentRow.module.css` `.row`                                                  |
| YouTube search (390px)                          | VV                        | At phone width the media row is abandoned entirely rather than shrunk.                                                                                | Row stacks below 600px: media full width, text beneath, metadata rule retained above. Matches what `ContentCard` already does at `≤599px`.                                                                                                                                                                            | `ContentRow.module.css` `@media (max-width: 599px)`                             |
| Supabase `/blog` list mode                      | MM                        | A true index row is dense and sheds trailing columns rather than stacking.                                                                            | Taken as a density target to move toward, not a composition to copy — we keep the photograph, so the row cannot reach 56px. Informed the decision to cut the media cap and add a third excerpt line.                                                                                                                  | `ContentRow.module.css` media ceiling comment                                   |
| Stripe `/blog`                                  | VV                        | Rows on an explicitly drawn grid; the grid is the ornament.                                                                                           | Structure taken, scaffolding left: ONE hairline per row, no vertical column rules. The `~870px` row height was explicitly rejected.                                                                                                                                                                                   | `ContentRow.module.css` `.rule`                                                 |
| Linear `/blog` (corroborated by Vercel, Resend) | VV                        | Archive header: large left-aligned title, then one shared baseline with controls read as a caption rather than a toolbar.                             | Result count left, search right, on one `align-items: end` baseline under an `--fs-page` heading. Filter pills rejected — a pill is a filled surface.                                                                                                                                                                 | `ContentArchiveLayout.module.css` `.headerFoot`                                 |
| PUNCH `/recipes/`                               | VV                        | Hero search as a **bare underlined field** — no box, no fill, no radius.                                                                              | `border-bottom: 1px solid var(--hairline)` only, going to `--rule-accent` on focus. The reference's magnifier glyph was **not** adopted: there is no icon anywhere else in this system.                                                                                                                               | `ContentArchiveSearch.module.css`                                               |
| A List Apart `/articles`                        | VV                        | A right-rail topic list with the count right-aligned turns navigation into an inventory.                                                              | A result count replaces the landing header's 48ch lede, set in the meta register (`--fs-meta`, `--ink-3`) — an inventory statement, not a pitch.                                                                                                                                                                      | `ContentArchiveLayout.module.css` `.resultCount`                                |
| Dezeen `/design/`                               | VV                        | The one numbered list in the reference set is numbered because it is literally "Most popular" — the numeral means rank.                               | Decisive **against** row numbering here: our archive is chronological and server-paginated, so `01` would head three different pages. The date takes the leading-column slot instead.                                                                                                                                 | No implementation, by design                                                    |
| NN/g `/articles` (390px)                        | VV                        | A trailing thumbnail floated into the dek produces a visibly broken ragged wrap.                                                                      | Explicitly forbidden at every width; media leads and never floats.                                                                                                                                                                                                                                                    | `ContentRow.module.css`                                                         |
| This repo, `ContentCard.module.css`             | TV (recorded measurement) | 26% is the narrowest media column at which the thumbnail still reads as a photograph rather than an icon; at a 899px viewport it leaves 25px of void. | Reused as the shared value rather than re-derived, and promoted to `--row-media-col`.                                                                                                                                                                                                                                 | `editorialTokens.module.css`                                                    |
| This repo, `ContentLandingLayout.module.css`    | TV                        | The `.emptyMessage` lede treatment: a lede on the page ground, no panel, no radius, no rules of its own.                                              | Reused verbatim for every state that leaves the list without rows.                                                                                                                                                                                                                                                    | `ContentArchiveLayout.module.css` `.emptyMessage`                               |

---

## References or Ideas Rejected

| Idea                                  | Source                        | Why rejected here                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequential row numbering (01, 02, 03) | Dezeen (VV)                   | Numerals restart on every paginated page; they imply a rank this content does not have; and a display-scale numeral would outrank the title in a system whose weight ceiling is 600. The date does the same job and carries real information. |
| List/grid view toggle                 | Supabase (VV)                 | Legitimate there because the two modes carry different information (list mode drops both the thumbnail and the excerpt). Ours would be the same five fields in two arrangements.                                                              |
| Stripe's full drawn grid              | Stripe (VV)                   | 4–5 vertical hairlines per row on a ground that already carries a film-grain layer.                                                                                                                                                           |
| Stripe's `~870px` row height          | Stripe (VV)                   | One row per viewport is the opposite of what a reader who clicked "View All" asked for.                                                                                                                                                       |
| Resting veil on the thumbnail         | This repo's `ContentCard`     | Justified on a large uncontrolled card image. Twelve dimmed 160px thumbnails in a column read as twelve disabled rows.                                                                                                                        |
| Entrance stagger                      | This repo's `ContentCard`     | The 70ms cascade is right for three items at the fold. Twelve items either fire at once, which is not a stagger, or cascade for 840ms down a page already being scrolled.                                                                     |
| `"Read more ›"` / chevron affordance  | Stripe (VV)                   | Stripe needs it because its text column is not the link. Ours is the link; a chevron would compete with the gold underline.                                                                                                                   |
| Spinner or skeleton loading state     | —                             | A skeleton would draw twelve grey card shapes on a page whose thesis is that there are no card shapes.                                                                                                                                        |
| `--color-error` for the error state   | current code                  | A red-orange inside the copper family; on `--surface-0` it reads as an accent, not an alarm, and it would be the page's only fourth colour.                                                                                                   |
| Magnifier glyph in the search field   | PUNCH (VV)                    | There is no icon anywhere else in this system; it would be the first, carrying nothing the placeholder does not.                                                                                                                              |
| In-field ✕ clear button               | —                             | The pages already render a "Clear search" link on the same baseline. Two clear affordances is one too many.                                                                                                                                   |
| Filter pills / chips                  | Vercel, Resend, Supabase (VV) | A pill is a filled, radiused surface.                                                                                                                                                                                                         |
| Copper accent tick before the kicker  | Stripe (VV)                   | The brief proposes it as the substitute for the card's badge. The metadata-bearing hairline is already that substitute; using both would put three marks on one line. Available if the reviewer disagrees.                                    |

---

## Important Implementation Files

Files created or changed in this pass, all inside the assigned boundary:

| File                                                                                  | What it holds                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/ContentRow.tsx`                                                    | New. Server component. The archive row: metadata rule, media, title/excerpt/byline, all inside one anchor.                                                                                                                                                                                                                                                |
| `src/components/ui/ContentRow.module.css`                                             | Row composition, the floored-and-capped media column, hover/focus, responsive collapse. Knows nothing about any page.                                                                                                                                                                                                                                     |
| `src/components/ui/ContentArchiveLayout.tsx`                                          | Server component. Archive shell: header, list, empty state, pager row. Sole owner of the column count: writes it to `.list` as an inline custom property and derives which rows are preloaded from the same value.                                                                                                                                        |
| `src/components/ui/ContentArchiveLayout.module.css`                                   | Header composition, the three-rule-tier argument, the `.list` grid that reads `--archive-columns` (written inline by the layout, not declared by any page class — see revision 2 item 1), `.clearSearch` (composed by the page modules), empty state, pager row. Composes `.root` from `ContentLandingLayout.module.css` rather than restating the shell. |
| `src/components/ui/ContentArchiveSearch.tsx`                                          | New. The only client module; a leaf. Debounced `router.replace` over a real GET form.                                                                                                                                                                                                                                                                     |
| `src/components/ui/ContentArchiveSearch.module.css`                                   | New. Bare underlined field.                                                                                                                                                                                                                                                                                                                               |
| `src/components/ui/Pagination.module.css`                                             | Restyled for both modes and both consumers.                                                                                                                                                                                                                                                                                                               |
| `src/components/ui/editorialTokens.module.css`                                        | One new token: `--row-media-col: 26%`.                                                                                                                                                                                                                                                                                                                    |
| `src/components/ui/content.types.ts`                                                  | `ContentArchiveLayoutProps` amended; `ContentArchiveBackLink` added. Archive types only.                                                                                                                                                                                                                                                                  |
| `src/app/(pages)/{blogs,recipes,videos}/{Blogs,Recipes,Videos}ArchivePage.module.css` | Per-page crop contract, plus a `.clearSearch` that composes the shell's. `VideosArchivePage.module.css` carries a pointer to where the two-up is declared, so nobody adds a second declaration of it here.                                                                                                                                                |

---

## Viewports Reviewed

Rendered against the local dev server and **visually inspected** as images, not read
off the CSS.

| Viewport         | Routes                                         | Notes                                                                                |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1440×900         | `/blogs`, `/recipes`, `/videos`                | Full page and viewport-only. Three passes.                                           |
| 1024×768         | `/blogs`, `/recipes`, `/videos`                | Two passes.                                                                          |
| 899×900, 600×900 | `/recipes` and `/recipes-landing` side by side | The band where the archive row and the landing card are meant to be the same object. |
| 390×844          | `/blogs`, `/recipes`, `/videos`                | Touch emulation on, per the screenshot script.                                       |

Interaction states captured and inspected separately at 1440×900: row hover, row
`:focus-visible`, search field focus, live typed search (`?q=gin`, debounce →
`router.replace` → 2 results + "Clear search" appearing), the no-results empty state,
and the pager mid-range at `?page=3` with both controls live.

**Revision 2 re-render.** Every change was re-rendered and re-measured. Geometry was
read out of the live DOM at **1440, 1024, 900, 899, 750, 600 and 390** on all three
routes (row heights, media widths, grid template, title/kicker x-positions, content-box
heights, horizontal overflow); header geometry was measured at 1440 and 390 across
`/recipes`, `?q=gin` and `?q=zzzznope` to prove the search field does not move; served
image dimensions and srcsets were read after `img.decode()` at 1440 and 390; and the
following were captured and inspected as images: the two-up `/videos` list at 1440 and
1024, a `/videos` row hover showing both columns, the focused search field in situ
under the copper rule, the no-results header, the mobile header with "Clear search",
and the pager mid-range. Computed colours were read for the focus rule, the header rule
and the pager border.

Screenshots are under `.screenshots/pass1` … `pass7`, `band` and `states`
(gitignored); revision 2 is `pass5`, `pass6` and `pass7`.

**Content reality during review, stated plainly:** the local database held 3 recipes
and 5 articles, and none of the 5 article records carried a cover photo, so `/blogs`
was reviewed as five empty plates. `/api/videos` answered normally here (the YouTube
key is configured locally), so `/videos` was reviewed with a full 12-row page and a
live 5-page pager — the most useful of the three for judging density.

---

## What Revision 2 Changed

Nine changes, all answering `docs/design-research/archive-rows-review.md`. Each was
re-rendered and re-measured rather than reasoned about; the measurements below are
after the change.

### 1. `/videos` is two entries per line at >=900px

The user's decision, and the largest change.

**As shipped**, the column count is a prop on the layout, not a declaration in page CSS:

| Site                              | What it holds                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `content.types.ts`                | `ContentArchiveColumns = 1 \| 2`; `columns?: ContentArchiveColumns` on `ContentArchiveLayoutProps`                                            |
| `ContentArchiveLayout.tsx`        | `columns = 1` default; writes `style={{ "--archive-columns": columns }}` on `.list`; derives `priority={index < columns}` from the same value |
| `ContentArchiveLayout.module.css` | `.list` reads `repeat(var(--archive-columns, 1), minmax(0, 1fr))` inside `@media (min-width: 900px)`                                          |
| `videos/page.tsx`                 | passes `columns={2}`                                                                                                                          |
| `VideosArchivePage.module.css`    | declares nothing; carries a pointer to where the two-up lives                                                                                 |

`ContentRow` is untouched and still knows nothing about any page. Two is the typed
ceiling because a third column at the 1200px spine leaves ~370px per entry, narrower
than the 600px-viewport case the single-column row already collapses at.

**Why it is not a page-class custom property, which is what it was first.** It began on
the same channel `--card-media-ratio` uses and needed no prop at all. That was wrong,
and Testing Agent found why: the same number also decides which rows are preloaded,
`priority` is a server-render decision, and **a server render cannot read a custom
property**. So `/videos` went two-up in CSS while the layout went on preloading only
index 0, leaving the second row of the first line on `loading="lazy"` when it was as
likely to be the LCP element as the first.

The rule to carry forward, because it is the part that stops someone moving this back
into CSS: **a value two systems must agree on cannot live in a channel only one of them
can see.** `--card-media-ratio` stays a page-class property precisely because exactly one
CSS rule reads it and nothing in JS does. `--archive-columns` is read by the grid _and_
by the render, so it has one declaration site — the prop — and the layout writes the
custom property itself.

The emission-order objection recorded for `--card-media-ratio` does not transfer, and
that is worth stating too: it is about two _class_ rules landing on one element at equal
specificity, where CSS Modules' stylesheet order decides the winner and is not
guaranteed. The style attribute is a higher-precedence origin than any selector, so an
inline custom property has no contest to lose. It is the most deterministic of the three
options considered, not the least.

**How the missing call site failed — worth knowing before adding the next page-level
layout option.** The prop was wired at every _definition_ site and missing only at the
_consumer_: `videos/page.tsx` did not yet pass `columns={2}`. Because the prop is
optional with a valid default, that produced **no type error, no lint error, no test
failure and no visual error anywhere except the single page the feature existed for** —
which quietly rendered single-column. The reviewer hit it independently before the
warning reached them. An optional prop with a sensible default is the right shape here,
but it turns "call site not updated" from a compile error into a silent behaviour change
on exactly one route, and only a render of that route catches it.

**Measured at 1440:** columns `568px 568px`, row height 237px (was 249px), page height
2204px (was 3804px). The kicker sits **6px** past the title's right edge, against 581px
in revision 1. (An earlier draft of this document recorded 9px; 6px is the reviewer's
measurement and is the correct figure.) Column gap is `--space-xl` (64px), not
`--col-gap` (32px): each row bleeds its hover tint `--space-s` past both ends, and at
32px the two tints met in the middle and the two hairlines read as one nicked rule.
Verified in a hover capture that the two tints stay 32px apart.

Below 900px nothing changed: `listCols` is `none` at 899 and below, and `/videos` at
390 is the same 6813px stack it was.

### 1b. Preloading follows the grid, not the item index

`priority` is now `index < columns` rather than `index === 0`: the layout preloads the
first LINE. Verified in the DOM - `/videos` at 1440 and 1024 has its first two images
eager and everything from the third lazy; `/recipes` and `/blogs` still have exactly one
eager image and one row preload, which is the rule the original comment exists to
protect. It is not viewport-aware and cannot be, so a two-up page also preloads two at
390px, where the second row is at the fold rather than above it; that is one extra
thumbnail on the one page that opts in, against moving the whole boundary into the
browser and losing the server-rendered `<img>`.

### 2. The search field no longer moves

Measured at 1440 across `/recipes`, `?q=gin` and `?q=zzzznope`: the field is at
**x=1000, width 320, y=300 in all three**. Revision 1 moved it 828px when the count
disappeared on a no-results search.

Two mechanisms. `justify-content: space-between` is gone from `.headerFoot` - it
positioned children by counting them, and the count is optional - replaced by
`margin-inline-start: auto` on `.controls`, the same device `.kicker` already uses.
And "Clear search" is now **out of flow**, hung under the field's right end, so its
arrival cannot resize the field (it previously shrank it 320px -> 233px) and costs no
width. An intermediate version reserved a 30rem slot for it in flow; that was rendered,
and it left the field's underline stopping 160px short of the copper rule with nothing
in the gap, so it was rejected. Out of flow the field is flush with the spine's right
edge and the link reads as a caption to it, which is what it is.

### 3. Search focus is gold, not copper

`border-bottom-color` and the doubling `box-shadow` go to `--color-accent-gold`.
Verified computed: focused field `rgb(226,176,126)`, header rule
`rgba(184,115,51,0.8)` - two different colours, where revision 1 put a 2px copper rule
40px above a 1px copper one and flattened its own tier argument.

### 4. `ROW_IMAGE_SIZES` describes the short axis

Was `160px`, the box **width**; under `object-fit: cover` a landscape source must
supply 160px on its **height**. Now `240px` (160 x 1.5, the widest ratio the library
holds). Measured after: `/recipes` serves `w=256` and decodes 239x160 - short axis
exactly the box, no upscale, against 1.51x before. `/videos` decodes 239x179 against
a 148px box.

A first attempt wrote the phone case honestly as `150vw` and **made things worse**:
next/image filters the srcset to `deviceSizes >= 640 * smallestRatio` whenever it
finds any vw token, so one vw figure collapsed the whole srcset to
`1080w 1200w 1920w 2048w 3840w` and a 148px desktop plate fetched `w=1080`. Caught by
measuring rather than by reading the CSS. The shipped string is all-px for that reason.

### 5. Both false stylesheet derivations are corrected

The review was right that a load-bearing comment contradicted by the render is worse
than no comment. Two were rewritten against measurements:

- **"the media never governs a complete row."** It governs 20 of 20 rows. The comment
  now states what the ceiling actually does and why parity is not reachable.
- **"between 600 and 899px the row is exactly what `ContentCard` produces."** The cap
  binds from a ~684px viewport, so they are identical from 600 to ~684 and siblings
  above it. The comment now carries the measured table and notes the excerpt differs in
  the same band too.

### 6. Header heading -> count gap is `--space-m`

40/40 made the controls line a third band floating between the heading and the copper
rule. Now 24 above / 40 below: measured, heading bottom 276, foot top 300, rule 383.
It reads as the caption the Linear reference is.

### 7. Tap targets

Back-link 11px -> **28px**; "Clear search" 18px -> **36px**. Both by
`padding-block: var(--space-2xs)` with a matching negative `margin-block`, so the hit
area grows and the layout does not move at all.

### 8. `/videos` rows show that they leave the site

An `aria-hidden` `↗` trailing the kicker: `VIDEO ↗`. It is a text character carrying a
direction, with the header's back-link `←` as its precedent, not an icon. The better
fix is the kicker copy itself ("YouTube"), which is set by the adapter in
`src/utils/contentItems.ts` and is outside this boundary.

### 9. Two pager points from the review's minor list

Resting border `--hairline` -> `--rule-accent` (it was weaker than the gold text it
enclosed; copper is already this system's outline colour on the landing card's kicker
badge), and the disabled control `opacity: 0.4` -> `0.5`.

---

## What the Revision 1 Render Loop Changed

Three passes. What changed between them, and why:

**Pass 1 → 2. The media column was cut from 312px to 160px, and the excerpt clamp
went from 2 lines to 3.**
The brief's `26%` was measured by `ContentCard` inside a container of at most ~809px.
At the 1200px spine the same 26% resolves to 312px, and the render confirmed the
arithmetic: a 312px square governed every row against a text block of ~126px on a
recipe, ~75px on an article and ~30px on a video. Roughly 180px of void per row,
repeated twelve times — worse than the 34% case `ContentCard`'s own measurements
rejected at a single breakpoint. The cap is set at 10rem so the media never governs a
row that actually has text, and the third excerpt line fills the gap with information
rather than shrinking the photograph further. `/videos` went from 4380px to 3804px of
page at 1440.

**Pass 2 → 3. The header's padding above the copper rule was cut from
`clamp(2rem, 5vw, 3.5rem)` to `--space-l`.**
Rendered, the gap above the rule (56px) and below it (64px) were near enough to equal
that the rule floated between the header and the list instead of closing the header.
40px above / 64px below makes it belong to the header, and keeps tier 1 clear of the
first row's hairline.

**Decided by rendering, not by argument:**

- The **full-row `--surface-1` hover tint** was proposed in the brief as INF and is
  kept. The specific failure the brief warned about — a tint turning the hairlines
  into cell borders and the list into a table — is avoided by bleeding the tint
  `--space-s` past the rules on both sides while the content stays on the spine. The
  rendered hover shows a band the rules sit _inside_, not a cell. **Settled, and no
  longer contested:** the reviewer verified this independently at 1440 and 1024 in
  revision 1 and ruled the brief's fear out, and in revision 2 found the tint and the
  focus ring read markedly better in a 600px-wide two-up column than they did across
  the full 1232px row — which also retires its remaining reservation about the tint on
  `/videos`. It stays unstrengthened.
- The **`26ch` title cap** was checked at 1440 against real titles up to
  "Barrel-Aging in a Wet Climate: What the Damp Does". It wraps to two lines cleanly,
  never mid-word, and the resulting two-measure ragged right against the 48ch excerpt
  is the intended editorial effect.
- **Twelve square thumbnails stacked** do not read as a contact sheet at 160px, mostly
  because the metadata rule interrupts the column every row. At 312px in pass 1 they
  were closer to it.

---

## Known Limitations

1. **`/blogs` rows carry a permanent right-hand void, and it is a content shape rather
   than a layout defect.** `BlogRecord.excerpt` is declared but has no database column,
   and the user's decision is to leave it. So a blog row is a date, a category, a title
   and a byline - an 88px content box beside a 160px plate - and that is now the
   permanent shape of every blog row rather than an edge case. The row handles the
   absence correctly (no reserved dek space, no collapsed box, the byline sits directly
   under the title), and it was **deliberately not compensated for in CSS**.
   _Does it change my view of the media cap on `/blogs`?_ No, and the reasoning is
   worth recording: a narrower plate would close the void, but the photograph is the
   only thing that will ever distinguish five similarly-titled articles, and today
   there are no photographs in the data at all - so tuning the cap now would be tuning
   against an empty grey square. Once articles carry covers, a blog row is a recipe row
   minus the dek and 160px is right for it. If `excerpt` is never added, narrowing it
   is already a one-line change with no code: `.row` reads
   `clamp(8.75rem, var(--row-media-col, 26%), 10rem)`, so `BlogsArchivePage.module.css`
   can set its own `--row-media-col` on the page class - and that one IS a pure page-class
   value, because no JS reads it.
2. **`/videos` rows still have empty ground under the title**, now ~90px beside a
   148px plate rather than ~134px beside 160px across a 52%-empty spine. A video item
   is a title and nothing else, permanently: `/api/videos` returns no description, no
   byline and no duration. The two-up halved the page and brought the kicker back to
   6px past the title; what remains is the floor set by the photograph, and the review
   is explicit that enlarging it is not the answer for this channel's pillar-filled
   thumbnails.
3. **The YouTube thumbnails are still soft in substance if not in resolution.** The
   `sizes` fix removed the upscale, but the source is a 480x360 4:3 canvas holding a
   centred portrait frame with a blurred zoom of itself filling ~57% of the width. At
   any plate size roughly half of what is shown is blur. That is a source/crop problem
   the archive inherits from `/api/videos` requesting `thumbnails.high`.
4. **Numbered pagination was recommended by the brief and is not implemented.**
   `Pagination.tsx` is markup and is outside this agent's boundary; only
   `Pagination.module.css` was assigned. The pager is still
   `Previous / Page X of Y / Next`.
5. **One stale test assertion is left failing, deliberately.**
   `src/components/ui/ContentRow.test.tsx:259` pins the old `ROW_IMAGE_SIZES` literal.
   The tripwire worked exactly as its own comment says it should - the value changed,
   and the test failed. The file belongs to Testing Agent and was not edited from here;
   the required change is one line, recorded in the specialist report. `pnpm lint` and
   `pnpm typecheck` are clean.
6. **`ContentCard.module.css` keeps its own `26%` literal** and does not yet consume
   `--row-media-col`. Outside the boundary. Adopting it there is a genuine no-op —
   the token is the bare percentage and the archive's ceiling lives in
   `ContentRow.module.css` specifically so that adoption cannot re-crop the landing
   card.
7. **`aria-live` on the results region was not implemented.** The brief asked for it
   on the grounds that all three pages swap content client-side without navigation.
   That premise no longer holds: these are now server components and a search or a
   page change is a real navigation, which assistive technology already announces.
   An `aria-live` region on a server-rendered list would announce on first paint.
8. **The image quality constant (85) is duplicated** in `ContentRow.tsx`, as it already
   is in `ContentCard.tsx` and `S3CardBackgroundImage.tsx`. `next.config.ts`
   `images.qualities` is the real source of truth, and the two existing copies record
   why a shared const cannot cross the client boundary.
9. **The archive shell composes `.root` from `ContentLandingLayout.module.css`.** This
   avoids a second copy of the ground, grain, padding and spine — but it does couple
   the two page families, and it means the archive's `<main>` carries a class named for
   the landing layout. The alternative (a shared `editorialShell.module.css`) requires
   editing `ContentLandingLayout.module.css`, which is outside the boundary.
10. **Full-page screenshots of `/blogs` show a stitching artifact** — the footer's icons
    appear near the top. Independently confirmed by the reviewer as a Playwright
    artifact, absent from viewport-only captures. Not a rendering defect.
11. **One movement remained at <=599px only, and the fix is landing outside this
    boundary as this document is written.** When a search matched nothing,
    `archiveResultCount` returned `undefined`, and on a phone the count is a stacked
    sibling rather than a side-by-side one, so the field rose 34px. The desktop jump is
    fully closed by the layout (the field does not move by a pixel in any of the three
    search states); the mobile one could not be closed from inside the layout, because
    the element whose space would have to be reserved is not rendered at all. The fix
    is the reviewer's own suggestion — have `archiveResultCount` return
    `"0 recipes matching “x”"` instead of `undefined` — and at the time of writing
    another specialist is applying exactly that in `src/utils/contentArchive.ts`, which
    is outside this boundary. **A reviewer should confirm the state rather than trust
    either reading here:** if the count now renders at zero, this limitation is gone and
    the header holds still at every width; if it does not, the 34px mobile rise is still
    present. Nothing in the layout needs to change either way.

---

## Areas That Need Independent Scrutiny

Revision 2. The previous list is superseded: items 2, 3, 4 and 6 on it were resolved or
ruled out by the review, and the pager item is carried forward unchanged because it is
still unverified.

1. **RESOLVED in the revision-2 review, recorded so it is not re-opened.** The two-up
   `/videos` composition was reviewed and the reviewer **withdrew its revision-1 verdict
   that the row fails on that page**. It also found the hover tint and the focus ring
   read markedly better in a 600px column than across the full-spine row. The open
   questions listed here in the previous draft — whether two half-spine hairlines 64px
   apart read as two entries, and whether the hovered tint stays separate from its
   neighbour — were answered in the affirmative. Nothing here needs another look.
2. **The remaining `/videos` void.** ~90px of ground under a one-line title beside a
   148px plate. Halved from revision 1 and no longer spread across 52% of the spine,
   but still there, and it is now bounded below by the photograph rather than by
   anything that can be tuned. Not judged a failure by the revision-2 review; listed
   because it is the page's floor and a future reviewer should know it is deliberate.
3. **"Clear search" positioned absolutely.** It is the one place the layout takes a
   node the page supplied out of flow. It buys a control that provably never moves, and
   it lands 5px above the copper rule at 1440 — measured, not estimated. Check that
   clearance at 1024, 900 and 390, and check that it still reads as belonging to the
   field rather than floating over the rule.
4. **The gold focus rule on the search field.** This is the reviewer's own prescription
   and the computed colours are now demonstrably different (`rgb(226,176,126)` against
   `rgba(184,115,51,0.8)`). But it is still a 2px warm rule 40px above a 1px warm rule.
   Confirm the two read as different tiers and not merely as different weights.
5. **The pager restyle against the admin blog list.** Unchanged from revision 1 and
   **still unverified**: `/admin/blogs` renders a `Checking access…` gate without a
   session, which the reviewer also hit. Revision 2 additionally moved its resting
   border from `--hairline` to `--rule-accent` and its disabled opacity from 0.4 to
   0.5, so there is now slightly more to check. None of the editorial tokens exist on
   that page; the whole appearance rests on the global-palette fallbacks. Route it to
   someone who can sign in.
6. **The `/blogs` media cap, if `excerpt` never arrives.** I argued above for leaving
   it at 160px and the argument depends on articles eventually carrying cover photos.
   If that is not going to happen, the judgement should be revisited — and the change
   is one declaration on the page class, no code.
