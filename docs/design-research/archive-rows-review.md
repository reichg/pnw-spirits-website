# UI Design Review — Archive Rows (`/blogs`, `/recipes`, `/videos`)

Prepared by: UI Design Reviewer Agent
Date: 2026-09-14
Upstream: `docs/design-research/archive-rows.md` (research), `design-review-handoff.md` (direction)
Method: local dev server driven with Playwright. Every figure below is read from
`getBoundingClientRect` / `getComputedStyle` in the live DOM, or from a screenshot I
inspected. Nothing here is read off the CSS.

---

## Overall Assessment

The design language is right and the execution of the *devices* is genuinely good. The
metadata-bearing hairline is the best idea in the brief and it survived contact with the
render intact: date left, category right, one rule per entry, and the whole thing inside
the anchor so the row is one target. The bare underlined search field, the left-aligned
pager, the back-link in the eyebrow slot, the outlined pager control, the reuse of the
landing `.emptyMessage` — all of these are correct, restrained, and unmistakably the same
system as the landing pages. There is not one generic-AI tell anywhere on these three
pages. Strip the logo and copy and the page still has character.

The composition is a different verdict. The row's anatomy does not fill the 1200px spine
it was given, and the measurements are not marginal. At 1440px every row on all three
pages is **exactly 249px tall** — 12 of 12 on `/videos`, 5 of 5 on `/blogs`, 3 of 3 on
`/recipes` — because the 160px media governs the row height on every single row measured.
That directly contradicts the principle written into `ContentRow.module.css` ("the media
never governs a complete row") and the arithmetic it was derived from. The real recipe
content box measures **129px**, not the ~182px the derivation assumed, because real titles
are one line and real deks clamp to two, not three. The cap was set against an estimate
that the render does not support, and the consequence is a page with no vertical variation
at all.

The right-hand void is worse than "reduced but structural." On `/videos` at 1440 the
widest content in a row ends at x=695 on a spine that runs to x=1320: **625px — 52% of the
spine — is empty on every row**, and beside the 160px media the text column carries 26px
of title with 134px of nothing under it. The `VIDEO` kicker sits at x=1276, 581px from the
title's right edge, with no optical relationship to anything. Hovering a video row draws a
tinted band around that emptiness and makes it *more* visible, not less. `/blogs` is the
same shape for a different reason: `BlogRecord.excerpt` has no column, so a blog row is a
title and a byline — 81% of the row body is bare ground, and today every plate is empty
because no article carries a cover photo. `/recipes` is the only one of the three where
the row reads as designed.

So the honest answer to the question the Orchestrator asked is split by page, and it is
not the split the brief predicted. The research named `/recipes` as the weakest case for
rows. Rendered, `/recipes` is the **strongest** — the photograph is legible at 160px, the
excerpt fills the middle measure, the byline closes the row. `/videos` is the one that
fails, and it fails harder than the brief anticipated, because of a factor the brief
identified but did not connect to the media cap: YouTube's blurred pillar-fill means only
about half of a 160px square is the actual frame, so the thing that has to sell the click
is roughly 80px of drink. Rows should not ship on `/videos` in this anatomy.

---

## Scorecard

| Category | Score |
|---|---:|
| Visual Hierarchy | 6 |
| Typography | 7 |
| Composition | 5 |
| Whitespace | 5 |
| Brand Character | 8 |
| Section Rhythm | 4 |
| Imagery | 4 |
| Color | 8 |
| Interaction | 8 |
| Responsiveness | 6 |
| Conversion Clarity | 6 |
| Originality | 8 |

Notes on the low scores, so they are not read as vague displeasure:

- **Section Rhythm (4)** is a measured figure, not an impression. `rowHeights` at 1440 is
  `[249 × 12]` on `/videos`, `[249 × 5]` on `/blogs`, `[249 × 3]` on `/recipes`. A page
  whose every band is the same height to the pixel has no rhythm available to it.
- **Imagery (4)** is one page carrying two others. `/recipes` earns a 7. `/videos`
  thumbnails are served at 160w from a 4:3 source (`natural: [160,120]`), so `object-fit:
  cover` upscales 1.33× to fill the square — visibly soft at 1× and worse at 2×. `/blogs`
  has no imagery at all in the data.
- **Whitespace (5)** distinguishes intentional air from accidental hole. The 48ch excerpt
  cap and the empty right side of the header are intentional and good. 134px of empty
  plate under a 26px video title is not.

---

## What Is Working — protect these

Listed because the Orchestrator asked what not to touch. These are all verified in a
render, not inferred.

1. **The metadata-bearing hairline.** It does everything the brief claimed: separates,
   dates, and categorises at the cost of one line, and it removes the card's badge
   arithmetic. It is also what stops twelve stacked squares reading as a contact sheet —
   the rule interrupts the column every row, exactly as the Director argued. Keep it
   unchanged.
2. **One anchor per row, with the rule inside it.** Verified: `aria-label` reads
   `"View recipe: Douglas-Fir Gin Fizz"` and `"Watch video on YouTube: How To Make A Spicy
   Margarita"`; the date is a real `<time datetime="2026-09-10T13:22:43.000Z">`; the
   tracked caps are not the accessible name and are not spelled out. Heading order is
   `h1` → `h2` per row with one `<main>`.
3. **The focus treatment.** A 2px gold ring at 3px offset around the entire row including
   its rule. Captured and inspected; it is the clearest focus indicator on the site.
   Keyboard order is back-link → search → first row, which is correct.
4. **`prefers-reduced-motion`.** Verified in a `reducedMotion: "reduce"` context:
   `transitionDuration` collapses to `1e-06s` on the row and the image, and the
   `scale(1.04)` is removed.
5. **Contrast.** Measured against the composited ground: title 13.57:1, kicker and
   back-link 9.66:1, date / result count / pager read-out 5.43:1 at 12–14px. Every text
   pair on these pages clears AA.
6. **The three rule tiers at rest.** Copper `rgba(184,115,51,0.8)` under the header,
   hairline opening each row and closing the run, hairline under the search field. They
   are legibly three tiers at 1440, 1024, 899, 600 and 390. This was the hardest thing
   the page had to do and it holds.
7. **The header rhythm fix from pass 2→3.** 40px above the copper rule, 64px below.
   Measured and correct: the rule now belongs to the header and clears the first row's
   hairline.
8. **Continuity with the landings.** `/blogs` at 900px and `/blogs-landing` at 900px are
   unmistakably the same family and unmistakably different kinds of page — same ground,
   same spine, same gold, same type roles, but a ruled index against a 3-up grid with
   badge kickers. This requirement is fully met.
9. **The result-count wording concern is resolved.** The Director flagged it as a risk
   from the render harness. The real pages pass the filtered total: `/videos` shows
   `50 VIDEOS` above a 5-page pager, and `?q=gin` shows `2 RECIPES MATCHING "GIN"`.
10. **The `/blogs` full-page stitching artifact is an artifact, not a defect.** Confirmed:
    the footer icons appear at y≈75 in the `fullPage` capture and are absent from the
    viewport-only capture of the same route at the same width. The Director's diagnosis is
    correct. Do not spend a pass on it.
11. **No generic-AI patterns.** No gradient text, no glass, no blob, no pill, no eyebrow
    badge above every heading, no three-card grid, no icon beside a heading, no scroll
    animation. This is a hand-made composition and it reads as one.

---

## The Three Interrogated Decisions

### 1. The media column at 10rem / 160px — **partly right, wrongly derived, wrong on `/videos`**

**It fixed the thing it was aimed at.** Cutting 312px → 160px is a real improvement and
the direction was correct. Keep the cut.

**But the derivation in the stylesheet is false against the render.** The comment states
the cap is "chosen so THE MEDIA NEVER GOVERNS A COMPLETE ROW," on the arithmetic that a
full recipe row measures ~182px of text. Measured at 1440:

| Page | media | content box | media governs by |
|---|---:|---:|---:|
| `/recipes` | 160px | **129px** | 31px |
| `/blogs` | 160px | 62–88px | 72–98px |
| `/videos` | 160px | 26–53px | 107–134px |

The media governs **20 of 20 rows measured, on all three pages, at every viewport from
1440 down to 600.** The assumed 182px required a two-line title and a three-line dek; real
recipe titles are one line (26px) and the real dek clamps to two (67px). So the governing
principle stated in the file is not achieved anywhere, and the row height is therefore a
constant 249px set by the photograph rather than a variable height set by the content.

**Does 160px still honour "the photograph is the card"?** Split answer, and the split is
the useful part:

- **`/recipes`: yes.** Inspected at 1440 and 1024. A 160px square of the Douglas-Fir Gin
  Fizz is an identifiable drink — glass, ice, citrus twist all readable. The thumbnail
  sells the click. Do not enlarge it.
- **`/videos`: no.** The channel shoots vertical, so YouTube centres a portrait frame in a
  4:3 canvas and fills the sides with a blurred zoom of itself. At 160px the real frame is
  roughly 80px wide with two blurred pillars of ghost title text either side. Inspected at
  1440 and 1024: you cannot tell one drink from another. This is not fixable by a bigger
  square — at 350px on mobile the same blur-fill becomes the dominant visual of the row.
  It is a crop/source problem the archive inherited.
- **`/blogs`: unverifiable.** No article record carries a cover photo, so every plate is
  flat `--surface-1`. Reported as a limitation, not judged.

**Also concretely wrong and cheap to fix:** `ROW_IMAGE_SIZES` declares `160px`, which
describes the box *width*. Under `object-fit: cover` a landscape source must supply
160px on its *short* axis, so a 4:3 source needs ~213px of width. Measured served images
at 1440: `/videos` `natural: [160,120]` → 1.33× upscale; `/recipes` row 0
`natural: [160,106]` → 1.51× upscale. Portrait sources (`[160,240]`) are fine. The
thumbnails are visibly soft for this reason and it is a one-line change.

### 2. The full-row hover tint — **not a table. Keep it. It is also doing almost nothing.**

The specific failure the brief warned about does not occur. Inspected at 1440 and at 1024
(the narrower gutter case the Director asked about): the `--space-s` bleed works exactly
as argued — the tint starts 16px outside each end of the hairline, so the rule reads as
sitting *inside* a band rather than as the band's border. The list does not become a
table at either width. Rule that fear out and stop spending passes on it.

Two honest caveats:

- The tint is a ~2% luminance step (`#15100d` → `#1c1613`). In the captured hover it is
  barely perceptible; the cue that actually reads is the gold title underline, which is
  localised 184px to the right of the row's left edge. The tint is not carrying the
  "this whole band is a target" job it was added to carry.
- The bleed leaves a small artifact: the hovered row's top edge is the hairline, and the
  tint runs 16px past each of its ends, so the rule appears to have a short lighter stub
  beyond each end. Visible at 1440 and 1024. Low severity, but it is a tell that the
  mechanism is a nudge rather than a shape.

**On `/videos` the tint is actively counterproductive**, because what it outlines is 900 ×
250px of empty ground. That is an argument against the row on that page, not against the
tint.

### 3. Rows on `/recipes` and `/videos` — **ship `/recipes`, do not ship `/videos`**

I am the last independent check on a decision made against the research, so I will be
plain about what I actually see.

**`/recipes`: the research was wrong and the row works.** The brief called it the weakest
case. Rendered, it is the strongest. The photograph is legible, the two-measure ragged
right between a 391px title and a 541px excerpt is the intended editorial effect and it
lands, and the byline closes the row. The remaining void is ~475px of the 1200px spine
with 71px under the content — that reads as editorial air rather than as an unfinished
row. Ship it. The `?q=gin` state in particular looks like a designed page.

**`/videos`: the research was right and the row fails.** Evidence, at 1440:

- widest content ends at x=695 on a spine ending at x=1320 → **625px, 52% of the spine,
  empty on every row**;
- text column carries 26px (one-line title) against 160px of media → 134px of empty plate
  beside it;
- bounding-box ink coverage of the row body (1200 × 209px) is ≈ **14%**;
- the `VIDEO` kicker is 581px from the nearest other mark on its own line, so the two ends
  of the metadata rule read as two unrelated marks rather than one line;
- 12 identical 249px bands, repeated for 3,582px of page.

A video has no excerpt and no byline, and that is permanent, not a data gap. No CSS value
fixes 26px of text in 160px of plate. The row is the wrong container for this item. The
research's proposed middle path — keep the row's structural language (metadata rule,
hairline rhythm, left spine, type roles) and allow **two per line at ≥900px** — would
halve the void, double the items per viewport, keep the page unmistakably part of the same
family, and cost one `grid-template-columns` rule on the list. That is the recommendation
I would route, and it needs to go back to the user because it is their direction being
questioned.

**`/blogs`: fails today, but for a content reason with a different owner.** A blog row is
a title and a byline — 81% empty body — only because `BlogRecord.excerpt` is declared and
the column does not exist. Give `/blogs` a real excerpt and it becomes `/recipes`, which is
to say it becomes good. Do not restructure `/blogs`; fix the data. That is a Backend Data /
Backend API item, not a design one.

---

## Five Highest-Impact Problems

### 1. The media governs every row, so the archive has no vertical rhythm at all

**Problem.** `grid-template-columns: min(--row-media-col, 10rem) 1fr` resolves to a 160px
media that is taller than the content on 20 of 20 rows measured, across all three pages
and every viewport from 1440 to 600. Row height is a constant 249px. The principle written
into `ContentRow.module.css` — "the media never governs a complete row" — is not achieved
anywhere, and its derivation (a "~182px" recipe row) does not match the rendered 129px.

**Why it matters.** A page of twelve pixel-identical bands cannot establish hierarchy,
cannot mark a section, and cannot give the eye anywhere to rest. It also means the void is
not a text-length problem that longer copy would solve — it is set by the photograph, so
it is invariant.

**Evidence.** `rowHeights` at 1440: `/videos` `[249 × 12]`, `/blogs` `[249 × 5]`,
`/recipes` `[249 × 3]`. Content-box heights: `/recipes` 129px, `/blogs` 62–88px,
`/videos` 26–53px, against a 160px media in all cases.

**Recommended change.** Re-derive the cap against real content rather than an estimate.
Either (a) drop the media to a height the fullest real row actually reaches — a `/recipes`
row tops out at 129px, so ~7.5rem/120px would let content govern and would still be above
the 88px reference-rail thumbnail; or (b) accept that the media governs and say so, and
then let the extra space do work (see problem 2) rather than sit empty. Whichever is
chosen, correct the stylesheet comment — a load-bearing derivation that the render
contradicts will mislead the next person to touch this file.

**Priority.** High.

---

### 2. The `/videos` row is 86% empty ground, and it disqualifies the row for that page

**Problem.** A video item has a title and nothing else. In a 1200px row that produces a
160px square, a 26–53px title, and roughly 900 × 250px of bare ground, with the category
kicker stranded 581px from the nearest mark.

**Why it matters.** This is the page most likely to be read as unfinished rather than
restrained, and it is the page with the most rows (50 items, 12 per page, 5 pages). It
also inverts the system's own thesis: the photograph is supposed to sell the click, and at
160px with YouTube's blurred pillar-fill the drink is roughly 80px wide and unidentifiable.

**Evidence.** 1440px `/videos`: `textRightEdge` 695 against a spine ending at 1320;
`gapBelowContent` 147–174px; `rowHeights [249 × 12]`; kicker at x=1276 against a title
right edge of 695. Hover capture at 1440 shows the tint band outlining the empty area.
Thumbnails served at `natural: [160,120]`.

**Recommended change.** Take the research's middle path on `/videos` only: keep every
device — metadata rule, hairlines, left spine, type roles, empty-state treatment — and
allow **two entries per line at ≥900px**, collapsing to one per line below. The page stays
in the family, the void halves, the page height drops by roughly half, and the thumbnail
can grow back toward a size where the frame is legible. This overrides a user direction, so
it must be routed to the user rather than decided by the Director. If the direction is
re-confirmed as one-per-line, the fallback is to give the video row a second line of real
information (channel, duration) — but `/api/videos` returns neither today, so that is a
backend dependency, not a CSS fix.

**Priority.** Critical (as a decision to route, not necessarily as a code change).

---

### 3. On a no-results search, the search field jumps from the right of the spine to the left

**Problem.** `archiveResultCount` returns `undefined` when `total <= 0`
(`src/utils/contentArchive.ts:180`). `.headerFoot` is `justify-content: space-between`, so
with the count gone the controls become the only child and snap to the left edge.

**Why it matters.** This fires in the middle of an interaction, on the exact keystroke
where the reader most needs the control to stay where their eye and cursor already are.
Measured at 1440, the field travels from x≈948 to x≈120 — 828px — and the reader's next
action is almost always to edit the term they just typed. It is the worst single moment in
the interface.

**Evidence.** `/recipes?q=gin` — count at x=120, field at x=948. `/recipes?q=zzzznope` —
no count, field at x=120. Both captured at 1440.

**Recommended change.** Keep the controls pinned right regardless of whether the count
renders — `margin-inline-start: auto` on `.controls`, the same mechanism `.kicker` already
uses in `ContentRow.module.css` for exactly this reason ("so a row whose source carried no
usable date still sets its category at the right end"). Better still, have the no-results
case supply a count line of its own (`0 RECIPES MATCHING "ZZZZNOPE"`) so the baseline is
never half-empty. Note that a smaller version of the same jump occurs when "Clear search"
appears and shrinks the field from 320px to 233px; pinning right fixes both.

**Priority.** High.

---

### 4. Focused search field inverts the page's own rule hierarchy

**Problem.** `.input:focus` sets `border-bottom-color: var(--rule-accent)` plus a
`box-shadow` that doubles the rule to 2px. The result is a **2px copper rule 40px above
the header's 1px copper rule**, so the control affordance (tier 3) is both the same colour
as and heavier than the structural "container starts here" mark (tier 1).

**Why it matters.** The handoff states the tier argument explicitly: "a second copper rule
anywhere below the header would flatten tier 1 into tier 2." On focus the page does exactly
that, and does it in the one state where the reader is looking at that part of the page.
Inspected in isolation the focus ring is excellent; inspected in situ it collides.

**Evidence.** `/recipes` at 1440, search field focused, crop `x:800 y:290 w:620 h:130` —
two parallel copper rules 45px apart, the upper one visibly thicker.

**Recommended change.** Keep `outline: none` and keep the doubled rule, but change the
focus colour to `--color-accent-gold`, which is this system's colour for accent *text* and
*focus* (it is already the row ring, the pager ring and the back-link ring) rather than its
colour for structural rules. That preserves the tier argument, preserves the indicator
strength, and makes the field's focus match every other focus on the page.

**Priority.** Medium.

---

### 5. The claimed 600–899px convergence with `ContentCard` does not hold above ~684px

**Problem.** `ContentRow.module.css` states: "Between 600 and 899px the row needs no rules
of its own: `--row-media-col` resolves to 26% there, which is exactly the composition
`ContentCard` already produces." It does not. The `min(26%, 10rem)` cap binds as soon as
the container exceeds 615px, which happens well inside the band.

**Why it matters.** This is an assumption carried from the research into the stylesheet as
a documented fact, and it was never checked in the band it describes. The band is also the
band where archive and landing are supposed to be provably one object, so the claim is
load-bearing for the continuity argument.

**Evidence.** Landing card vs archive row media width, measured:

| Viewport | `ContentCard` media | `ContentRow` media |
|---:|---:|---:|
| 899px | 210px | **160px** |
| 750px | 176px | **160px** |
| 600px | 140.391px | 140.391px |

The two are identical only from 600px to roughly 684px. They also differ in the same band
on the excerpt: the card clamps to 2 lines with no max-width, the row clamps to 3 at
`max-width: 539px`.

**Recommended change.** Low-cost and honest: correct the comment to state the real
break-even, since the divergence itself is not visually harmful — a 160px media and a
210px media both read fine at 899px. If the convergence is wanted as a real property,
express the cap so it engages only above the band. Do not leave a measured falsehood in a
stylesheet that documents its own derivations this carefully; the file's credibility is
one of its features.

**Priority.** Medium.

---

## Responsive Review

Reviewed at 1440, 1024, 899, 750, 600 and 390. No overflow, no horizontal scroll and no
broken wrap at any width on any of the three routes.

**1440px (desktop).** The header, spine and rules are correct. This is the width where the
void is worst, because the spine is widest and the content caps (26ch title = 391px, 48ch
excerpt = 541px) are fixed. `/recipes` holds. `/blogs` and `/videos` do not. The header's
controls line floats **exactly equidistant** between the heading and the copper rule —
heading bottom 276 → foot top 316 is 40px, and foot bottom → rule is also 40px — so the
count reads as a third band rather than as a caption to the title. This is the identical
"floating between two blocks" problem the Director correctly diagnosed and fixed one level
down in pass 2→3; it recurs one level up and was not caught. Tighten the heading→count gap
(to `--space-m`) and it becomes the caption the Linear reference actually is.

**1024px.** The best desktop width for this design. The narrower 922px spine reduces the
void proportionally and `/recipes` reads well. The hover tint bleed still resolves
correctly at the narrower gutter — checked specifically because the Director asked. The
`/videos` void is still 52% of the spine here, so the page-width reduction does not rescue
it.

**899px.** Holds. Container 809px, media 160px (not 26%, see problem 5), text column 625px.
The metadata rule's two ends are 754px apart, which is the last width at which they still
read as one line. `/blogs` at 900px against `/blogs-landing` at 900px is the continuity
test in the work order, and it passes clearly: the landing is still a 3-up grid with
badge kickers, the archive is a ruled single-column index. Same family, obviously
different kind.

**600px.** The one width where the archive row and the landing card are genuinely the same
object — both media columns measure 140.391px, both titles 340.243px, both `align-items:
start`. Verified side by side.

**390px (mobile).** The stack is correct and this is the best-looking state of `/videos` by
a wide margin: the full-width 350px square is a real photograph and the row reads as
designed. Two caveats. First, the page is **6,619px long** on `/videos` — twelve rows at
508–530px each. That is what `ContentCard` does and what the brief recommended, but it is
a long scroll for a scan-and-select surface, and the pager is 6,584px down. Second, the
YouTube pillar-blur that is merely soft at 160px becomes the dominant visual at 350px:
the captured row shows a large blurred ghost of the video title flanking the real frame on
both sides. That is a source/crop problem, not a layout one, but it is most visible here.
Mobile header, back-link, stacked count-over-search and copper rule all read well.

**Touch targets at 390px.** The row itself is 508px tall — excellent. The back-link is
79 × **11px** and "Clear search" is 107 × **18px**. Both clear WCAG 2.2 SC 2.5.8 via the
spacing exception (no other target within a 24px circle), so this is not a conformance
failure — but an 11px-tall tap target beside a 42px input is poor ergonomics and visually
inconsistent. Add vertical padding to both.

---

## Reference Fidelity

Each reference the handoff claims, checked against what is actually on screen.

| Reference | Claimed idea | Verdict |
|---|---|---|
| The Paris Review `/blog` | Metadata-bearing hairline: date left, category right | **Present and excellent.** The single best-executed idea on the page. One qualification: at a 1200px spine the rule's two ends are 1,080px apart and stop reading as one line — a problem the reference never had to solve because its rows are narrower. |
| YouTube search | `align-items: start`, top-aligned text | **Present and correct.** Verified `alignItems: "start"` at every width. Every row shares one reading start-point. |
| YouTube search (390px) | Abandon the media row at phone width | **Present and correct.** Stacks below 600px with the metadata rule retained. Verified. |
| Supabase `/blog` list mode | Density target | **Partially honoured.** Page height dropped ~25% from pass 1. But a 249px row against Supabase's 56px is not close, and because the media governs, the density is fixed and cannot respond to content. |
| Stripe `/blog` | Row structure without the drawn grid | **Present.** One hairline per row, no vertical rules. The `~870px` row height was correctly rejected. |
| Linear `/blog` | Title left, controls on one shared baseline as a caption | **Present but weakened.** The baseline is built correctly (`align-items: end`, count left, search right). The *caption* relationship is lost because the 40/40 spacing makes the line float free of the title. See Responsive Review, 1440px. |
| PUNCH `/recipes/` | Bare underlined search field | **Present and excellent.** No box, no fill, no radius, no magnifier. The most convincing single control on the page. Focus colour is the one problem (problem 4). |
| A List Apart `/articles` | Count turns navigation into inventory | **Present.** `50 VIDEOS`, `2 RECIPES MATCHING "GIN"`. Set in the meta register. Correct. |
| Dezeen `/design/` | Decisive *against* row numbering | **Honoured.** No numerals. The date takes the leading slot. Correct call. |
| NN/g `/articles` | Never float a trailing thumbnail into the dek | **Honoured at every width.** Media leads, never floats. |
| `ContentCard.module.css` 26% | Reused rather than re-derived, promoted to a token | **Token exists, but the value it names is not what ships.** Every rendered row above 684px uses the 10rem cap, not 26%. The token is currently consumed by one component that overrides it immediately. |
| `ContentLandingLayout` `.emptyMessage` | Reused verbatim for every empty state | **Present and correct.** Verified on the no-results and out-of-range states; composed rather than copied. |
| NN/g numbered pagination | Numbered pages recommended | **Not implemented**, correctly attributed to the `Pagination.tsx` boundary. At 5 pages `Previous / Page 3 of 5 / Next` is tolerable; at the archive's growth rate it will not be. Route to whoever owns `Pagination.tsx`. |

No claimed reference left no trace. The two weakened ones (Linear's caption, Supabase's
density) are weakened by spacing and by the media cap respectively, not by omission.

---

## Anti-Generic-AI Audit

Nothing to report, and that is a genuine result rather than a courtesy. Checked
explicitly: no purple/blue gradient, no glow, no glassmorphism, no rounded containers
(`border-radius: 0` is stated on the pager and the search field), no pills, no eyebrow
badge above every heading, no icon anywhere in the system, no centred sections, no
three-card grid, no identical feature tiles, no floating mockup, no gradient text, no
scroll animation, no entrance stagger. Motion is three transitions total: a colour fade, an
underline wipe and a 1.04 image scale, all reduced-motion aware.

Two minor observations rather than findings:

- The pager's `PREVIOUS` / `NEXT` are the only enclosed rectangles on the page, in a system
  whose thesis is that it has no surfaces. The outlined-not-filled choice is defensible —
  the landing's kicker badge is also a 1px outlined box — but the border is `--hairline` at
  14% ink, which is weaker than the gold text it encloses, so the box reads as a faint
  ghost rather than as a deliberate frame. Consider `--rule-accent` for the resting border.
- The archive rows show a missing cover as flat `--surface-1`; the landing cards show a
  missing cover as a warm copper gradient. Two different empty-plate treatments in one
  family. Visible side by side at 900px on `/blogs` vs `/blogs-landing`.

---

## Accessibility / UX Concerns

Verified good, and listed so they are not re-litigated: single `<main>`; `h1` → `h2` per
row; `aria-label` on every row giving a sensible name; real `<time datetime>`; visible
`:focus-visible` on row, search field, pager and back-link; correct tab order; external
links carry `target="_blank" rel="noopener noreferrer"`; reduced motion honoured; all text
pairs clear WCAG AA (lowest measured 5.43:1); the visually-hidden search label uses the
`clip-path` pattern rather than `display: none`; hover is scoped to `@media (hover: hover)`
so it does not latch on touch.

Outstanding:

1. **`/videos` rows leave the site with no visible warning.** Every row opens
   `youtube.com` in a new tab. The accessible name says so; a sighted reader gets nothing —
   the kicker reads `VIDEO`, not `YOUTUBE`. Change the kicker copy, or add the external
   indication to the metadata rule. **Medium.**
2. **The back-link (11px tall) and "Clear search" (18px tall) at 390px.** Conformant via
   the spacing exception, ergonomically poor. **Medium.**
3. **The disabled pager control** renders at `opacity: 0.4`, which composites to ≈2.53:1
   against the ground. It is a `<span role="link" aria-disabled="true">`, so the WCAG
   "inactive component" exemption arguably applies, but it is close enough to the line to
   be worth 0.5 instead of 0.4. **Low.**
4. **No closing action on the archive.** `/blogs` and `/recipes` currently have one page
   each, so the page ends with a hairline and then the global footer — the reader who
   reaches the bottom has nowhere to go inside the content. The landing pages close with a
   CTA; the archive closes with nothing. **Medium**, and a conversion question as much as
   an accessibility one.
5. **The out-of-range page reports a page it is not showing.** `?page=99` renders the
   empty-state lede and a pager reading `PAGE 5 OF 5` with `NEXT` disabled. The copy covers
   it and `PREVIOUS` gives a way back, so this is defensible — but a pager stating a page
   number while showing no rows is mildly incoherent. **Low.**

---

## Recommended Refinement Order

1. **Route the `/videos` row question to the user before any further CSS.** Everything else
   on that page is downstream of whether it stays one-per-line. Do not refine a composition
   that may be replaced.
2. **Fix the search-field jump on no-results** (problem 3). Smallest change, worst moment
   in the interface. `margin-inline-start: auto` on `.controls`.
3. **Fix the search focus colour** (problem 4). One property; restores the page's own
   stated rule hierarchy.
4. **Re-derive the media cap against measured content, and correct both stylesheet
   comments** — the "media never governs" derivation and the "600–899 convergence" claim
   (problems 1 and 5). Correct the comments even if the values stay.
5. **Fix `ROW_IMAGE_SIZES`** so a landscape source supplies 160px on its short axis. One
   line; removes a 1.33–1.51× upscale from every thumbnail.
6. **Tighten the header's heading→count gap** to `--space-m` so the controls line reads as
   a caption rather than as a third band.
7. **Add padding to the back-link and "Clear search"** so their tap targets clear 24px.
8. **Add an external-link signal to `/videos` rows** (kicker copy is the cheapest route).
9. **Raise with the Orchestrator, outside this slice:** `BlogRecord.excerpt` has no column,
   which is the direct cause of the `/blogs` void; numbered pagination lives in
   `Pagination.tsx`; `/api/videos` returns no duration or channel, which blocks the only
   available fix for a one-per-line video row.

---

## What I Could Not Verify

1. **`/admin/blogs`, the pager restyle's other consumer.** Reachable at HTTP 200 but it
   renders a `Checking access…` gate and never resolves without a session. The restyle from
   a filled radiused gold plate to an outlined square control remains **unverified**. It
   matters more than it sounds: the admin ground is the green-black `--color-bg-deep`
   family, none of the editorial tokens exist there, and the whole appearance depends on
   the global-palette fallbacks. Route to someone who can sign in.
2. **`/blogs` imagery.** No article record in the local database carries a cover photo, so
   every plate rendered as flat `--surface-1`. The archive's imagery on `/blogs` is
   untested; I judged the composition, not the photography.
3. **The truly-empty archive state** ("nothing published yet"). All three routes returned
   content, so I could only reach the empty treatment via no-results (`?q=zzzznope`) and
   out-of-range (`?page=99`). Both render correctly and share the `.emptyMessage` lede, so
   the third wording is very likely fine, but I did not see it.
4. **The error state.** I did not induce an API failure, so the `--ink-2` error lede and
   the absence of `--color-error` are read from code, not from a render.
5. **High-DPI rendering.** All captures are at `deviceScaleFactor: 1`. The 1.33–1.51×
   thumbnail upscale I measured will be proportionally worse on a 2× display; I am
   reporting the measured source dimensions rather than a rendered 2× observation.
6. **Real hover on touch.** `@media (hover: hover)` is correct in the CSS and I verified
   the media query exists, but I did not emulate a hybrid touch-and-pointer device.

---

## Final Verdict

**Needs another refinement pass.**

Not a rebuild. The design language, the devices, the accessibility, the colour discipline
and the originality are all genuinely strong, and `/recipes` is close to ready. What holds
the work back is one structural decision — the row's anatomy does not fill the spine it was
given, and the media cap that was supposed to solve that was derived from arithmetic the
render contradicts — plus one page, `/videos`, where the row is the wrong container for the
item and no amount of refinement will change that. The `/videos` question has to go back to
the user; the rest is a pass of measured corrections against a foundation worth keeping.

---
---

# Revision 2 — Focused Re-Review

Date: 2026-09-14
Scope: verification of the nine revision-2 changes, the new two-up `/videos`
composition, the `<=599px` residual, and regression-checking of the revision-1 protect
list. Not a full re-review; anything not named here is unchanged from the assessment
above.

Method unchanged: live DOM measurement and inspected screenshots. Where a figure is
quoted from `design-review-handoff.md` I re-measured it rather than accepting it.

---

## Headline: a build-state defect I hit mid-review, now resolved

While re-measuring I found `/videos` rendering **one entry per line** — the headline
change of revision 2 not in effect. This was not a stale capture: the server was
emitting `--archive-columns:1` on `/videos`, identical to `/recipes`, on 12 of 12
consecutive cold loads at 1440px, with a page height of 3772px.

Cause, read from source: the mechanism had moved from a page-level custom property to a
`columns` prop on `ContentArchiveLayoutProps`. The prop was wired everywhere —
`ContentArchiveLayout.tsx:25` defaults it to `1`, line 83 writes it to the list as an
inline custom property, line 106 derives `priority={index < columns}`, the type exists at
`content.types.ts:141`, and `ContentArchiveLayout.module.css:344` reads
`repeat(var(--archive-columns, 1), minmax(0, 1fr))` — **except at the one call site that
has to supply the value.** `src/app/(pages)/videos/page.tsx` did not pass `columns={2}`,
so the default silently produced the revision-1 composition.

The Orchestrator flagged the same thing independently and routed the one-line fix while I
was measuring. It has landed and is verified below. I record it because the shape is
worth remembering rather than because it survived: a mechanism change that reaches every
definition site and misses the single consumer is the "partial rollout leaves some call
sites on the old pattern" failure, and it failed **silently** — the prop is optional with
a valid default, so there was no type error, no lint error and no visual error anywhere
except on the one page the change existed for. A required prop, or a default of `2` set
on the page module, would each have made it loud.

**Documentation drift, still outstanding.** `design-review-handoff.md` revision 2
describes the mechanism as "one custom property on one page class — `--archive-columns: 2`
in `VideosArchivePage.module.css`." That is superseded; the comment inside
`VideosArchivePage.module.css` itself is correct and says so. The handoff should be
reconciled, since it is the document the next reviewer reads first.

---

## The Six Defects — verification

| # | Defect | Verdict | Evidence |
|---|---|---|---|
| 1 | Search field jumped 828px | **Fixed** | Verified through live keystrokes, not two static states — see below |
| 2 | Focus colour collided with tier 1 | **Fixed** | Field `rgb(226,176,126)`, header rule `rgba(184,115,51,0.8)` |
| 3 | `ROW_IMAGE_SIZES` undersized the short axis | **Fixed** | `/recipes` decodes 239x160 into a 160px box; `/videos` 239x179 into 148px. No upscale at any desktop width |
| 4 | Two false stylesheet derivations | **Fixed** | Both rewritten against measurements; read in source |
| 5a | Header count floated as a third band | **Fixed** | Heading bottom 276 to foot top 300 = **24px**; foot bottom 342 to rule 383 = **41px** |
| 5b | Tap targets 11px / 18px | **Fixed** | Back-link 79x**27**, "Clear search" 107x**34** at 390px, both via padding with cancelling negative margin — the text did not move |
| 6 | `/videos` left the site with no visible signal | **Fixed** | `Video` + `<span aria-hidden="true">` arrow; accessible name still "Watch video on YouTube: …" |
| 9 | Pager border weaker than its own text; disabled at 0.4 | **Fixed** | Border now `rgba(184,115,51,0.8)`; disabled `opacity: 0.5`, effective contrast **2.53 to 3.25** |

### Defect 1 in detail — this one is genuinely well solved

Tested as asked, through an actual keystroke sequence (`g`, `gi`, `gin`, `ginz`, `ginzz`,
then cleared, with the debounce and navigation allowed to settle between each), at 1440,
1200, 1024, 900, 600, 599 and 390px. The transition from 2 results to 0 happens between
`gin` and `ginz`, which is the exact moment revision 1 threw the field across the page.

At 1440 the field reports `x=1000, y=300, w=320, h=43` in **all seven states**. Identical
at 1200, 1024, 900 and 600. Not approximately — the same four integers. The
`margin-inline-start: auto` device is the right one and it works.

**"Clear search" out of flow — I went looking for the fragility and did not find one.**
Swept 21 widths from 320 to 1440px on `/recipes?q=gin`: clearance from the copper rule is
**5–7px at every width**, never zero, never negative. The link's right edge tracks the
field's right edge exactly at every width (1205+115 = 1320 = 1000+320). Under 200% text
size — the case where an out-of-flow element under a rule is most likely to collide — the
clearance *increases* to 11–13px, because the header's padding is in rem and scales with
it. Visually it reads as a caption hung under the field, not as something floating over
the rule.

One structural note rather than a defect: the link's box top is flush with the field's box
bottom at every width (gap exactly 0px). The visible separation comes entirely from the
link's new 8px of top padding. That is fine, but the arrangement now has no whitespace
budget left — anything that grows the link's text eats into the 5px rule clearance before
it eats into anything else.

---

## The Two-Up `/videos` Composition

Verified live after `columns={2}` landed: `568px 568px` at 1440 with the inline
`--archive-columns:2` present on the list element, `428.812px 428.812px` at 1024, a
`373px` pair at 900, single column at 899. Page height 3804 to **2204px**. Every claimed
figure checks out except one: the kicker sits **6px** past the title's right edge at 1440,
not the 9px claimed. Directionally the claim is right, and the substance — 581px down to
single digits — is the part that matters.

**Does it read as the same family, or as a third thing? The same family, clearly.** Same
ground, same spine, same hairline mechanism, same date-left / kicker-right rule, same type
roles, same media-leading geometry, same hover and focus treatments. It is a `/recipes`
row that happens to fit twice. Nothing about it announces a new component.

**Do two half-spine hairlines read as two entries or as one nicked rule? Two entries,
unambiguously.** Each rule is anchored at both ends by its own content — a date at the
left, a kicker at the right — so each reads as a complete line rather than as a fragment
of a longer one. The 64px gap is correct: measured, the two hover tints stay exactly
**32px** apart at 1440, 1024 and 900 (the 64px gap less the 16px bleed on each side), and
I confirmed visually in hover captures at all three widths that the hovered cell is
clearly bounded and never reaches its neighbour. I accept the Director's report that 32px
failed.

**An unlooked-for benefit.** The hover tint and the focus ring both read substantially
better in the two-up than in the single column, because the band is now 600px wide instead
of 1232px — much closer to the proportions of a thing a reader would call a target. The
tint I called "doing almost nothing" in revision 1 is doing noticeably more work here at
the same opacity, without the token being touched. That is a free win, and it retires my
revision-1 reservation about the tint on this page.

**What happens at 900px, and just above and below.** The threshold is correct and should
not be lowered. At 900 the two-up text column is 209px, in which a 20px title wraps to
three lines ("How To Make The Armillita Chico Cocktail"). That is the floor of a usable
measure, not a comfortable one; anything narrower turns the title into a column of
two-word lines. At 899 the single column returns cleanly — container 809px, media back to
160px, kicker 263px from the title, page 3694px. The switch is abrupt, but that is what a
breakpoint is, and the 899 composition is materially better than the 1440 single column
ever was, because an 809px container leaves a 263px void rather than a 625px one.

**The cost, stated plainly:** the 600–899 band keeps the revision-1 composition, and that
band is every tablet in portrait. It is a real cost and it is the right trade, because the
alternative is a title measure that does not work. Leave it.

**Is the plate still doing work, or is it decoration now?** It is doing work, at roughly
half efficiency. At 148px the real frame is about 85px wide, which is enough to
discriminate the things a cocktail index needs discriminated — a coupe from a rocks glass
from a highball, and the drink's colour. Across the twelve plates in the captures that
distinction is legible. But YouTube's blurred pillar-fill occupies the rest, and at twelve
plates the ghosted blurred title text flanking every frame ("Margarita", "Archbishop",
"Armillita Chico", "Cynarita") is now the page's dominant visual texture. So: not
decoration, but not the photograph the system's thesis assumes either.

I agree with the Director that enlarging it is wrong — the 350px stacked plate at 390px
proves it, where the blur is at its most obtrusive. The only lever that would actually
help is cropping the pillars off, which means either a portrait ratio on this page alone
(cheap — one page-class declaration through the same `--card-media-ratio` channel — but it
breaks the one-ratio rule and makes the media govern the row harder) or an upstream change
to what `/api/videos` requests. **Neither is worth doing now.** Record it and move on; the
two-up already extracted most of the available gain.

**What did not change:** the media still governs. Row heights are uniformly 237px at 1440
and 229px at 1024, 960 and 900, against 26–53px of title. The void per cell is still
roughly 55% of the cell. What changed is that the emptiness is now interleaved with
content at 568px intervals instead of pooled into one 625px slab per row — and that single
fact changes the page's character completely. It reads as an airy ruled two-column index
rather than as an unfinished list. **My revision-1 verdict that the row fails on `/videos`
is withdrawn. It works now.**

---

## The `<=599px` Residual — recommendation

**Adopt the count, and trim the empty-state copy at the same time.**

The movement is real and slightly larger than described. At 599px the field moves from
y=270 to y=236 and at 390px from y=255 to y=221 — 34px, as reported — but the header's
bottom edge moves with it (354 to 319 at 599; 338 to 304 at 390), so the copper rule and
**every row below it** shift up 34px too. It is a whole-header reflow, not a field nudge.

Against that: 34px is about 4% of an 844px viewport, and it fires at the moment the result
list is being replaced wholesale, which is already a large visual change. This is not
urgent and nobody is being harmed by it today.

But the fix is one line, and the objection to it — stacking "0 recipes matching “x”" above
"No recipes match “x”…" — is avoidable rather than inherent. The two lines are not
adjacent: measured, they sit about 196px apart at 1440 with the page's loudest rule
between them, in different zones of the page. The genuine clumsiness is narrower than "two
statements of the same fact"; it is that the **search term would be quoted twice**.

So the recommendation is the pair, not the single change:

1. `archiveResultCount` returns `"0 recipes matching “x”"` at zero instead of `undefined`.
   **Keep the `Number.isSafeInteger` guard** — it is doing real work, because the pages
   derive `total` from `Number(data.total)` and an API response that omits the field
   yields `NaN`. Only the `<= 0` branch should change; `NaN` must still return `undefined`.
2. `emptyMessageFor("no-results")` drops the quoted term and keeps only the advice: "Try a
   shorter search, or clear it to see the whole bar."

The result is a cleaner division than exists today — the header states the fact and what
was searched, the body gives the advice — with no duplication, and the controls row becomes
invariant at every width in every state instead of "invariant above 600px." Both files are
outside the Director's boundary, so this needs routing.

**Priority: Medium.** Worth doing; not worth blocking on.

---

## The 390px Eager-Preload Trade

**Acceptable. Do not spend a pass on it.**

Verified end to end rather than from the prop. At >=900px on `/videos` the images read
`["eager","eager","lazy","lazy","lazy"]`, and the document head carries preload links for
the logo plus the **first two** video thumbnails. `/recipes` carries the logo plus
**one**. So the LCP fix works through the mechanism that actually matters — the preload
link — and not merely as an attribute on the `<img>`.

At 390px `/videos` also preloads two. Measured there, row 0 spans y=320–829 and row 1
spans y=829–1359 against an 844px viewport, so the second preloaded image starts at y=877
and is **entirely below the fold**. The cost is one extra thumbnail fetch competing with
the true LCP candidate, on one page.

That is a small, bounded cost against a large architectural property: moving the column
decision to the client would stop cover images rendering as server-signed `<img>` in the
server response, which is what makes this whole archive family work. The trade is
correctly made and correctly recorded, and it only ever applies to pages that opt in —
currently one.

---

## Protect-List Regression Check — all intact

Re-verified on the current build at 1440px:

- **Metadata hairline** — present, one per entry, date left and kicker right, inside the
  anchor. `everyRowSelfContained: true` across all 12 rows.
- **One anchor per row** — 12 anchors, each containing its own `<time>` and `<h2>`.
- **`<time dateTime>`** — real `TIME` element, `datetime="2026-09-10T13:22:43.000Z"`.
- **Accessible names** — "Watch video on YouTube: How To Make A Spicy Margarita";
  `rel="noopener noreferrer"`, `target="_blank"`. The new arrow glyph is
  `aria-hidden="true"` on its own span and does not enter the name.
- **Focus rings** — row `:focus-visible` gives `rgb(226,176,126) 2px solid` at `3px`
  offset, plus the `--surface-1` tint.
- **Contrast** — identical to revision 1 to two decimals: title 13.57, kicker 9.66,
  back-link 9.66, date 5.43, result count 5.43, pager read-out 5.43. Pager disabled
  improved from 2.53 to 3.25.
- **Reduced motion** — row, image and back-arrow all collapse to `1e-06s`; the image
  transform is removed.
- **Structure** — one `<main>`, `h1` then `h2` per row.
- **Landing/archive continuity at 900px** — `/blogs` row grid `160px 626px` in an 810px
  single-column list; `/blogs-landing` a 3-up grid of `256.66px` columns with 257px media.
  Same copper header rule on both. The archive row carries a `<time>` rule, the landing
  card carries a badge kicker. Same family, different kind. Intact.

**A false alarm of my own, recorded so it is not rediscovered as a bug.** My first
keyboard-focus measurement read the row's background as `rgba(0,0,0,0)` and I was ready to
report the focus tint as regressed. It is not. Sampling at 0 / 100 / 300 / 900ms after
focus gives `transparent`, then `rgba(28,22,19,0.92)`, then `rgb(28,22,19)`, then
`rgb(28,22,19)` — I was reading the 200ms `background-color` transition mid-flight. The
tint is present and correct, confirmed visually in a settled capture. Anyone measuring
this element's background must wait out `--dur-fast` first.

---

## Revision-2 Scorecard

Revision 1 in brackets.

| Category | Score |
|---|---:|
| Visual Hierarchy | 7 (6) |
| Typography | 8 (7) |
| Composition | 7 (5) |
| Whitespace | 6 (5) |
| Brand Character | 8 (8) |
| Section Rhythm | 5 (4) |
| Imagery | 5 (4) |
| Color | 9 (8) |
| Interaction | 9 (8) |
| Responsiveness | 7 (6) |
| Conversion Clarity | 7 (6) |
| Originality | 8 (8) |

What still holds the remaining scores down, so the numbers are legible:

- **Section Rhythm (5)** — row heights are still uniform to the pixel (237px at 1440 on
  `/videos`, 249px on `/blogs` and `/recipes`) because the media governs every row. The
  two-up changed the page's beat, not the row's.
- **Imagery (5)** — the upscale is gone, which was the fixable half. The pillar-blur is
  not fixable in CSS, and `/blogs` still has no photographs in the data.
- **Whitespace (6)** — `/videos` is much improved; `/blogs` is unchanged and permanently a
  title, a byline and a 160px plate by the user's own decision.

---

## Remaining Items, Ranked

1. **Reconcile `design-review-handoff.md` revision 2 with the shipped mechanism.** It
   still describes the superseded `--archive-columns` page-class approach, and it is the
   document the next reader starts from. **Medium.**
2. **The `<=599px` count-plus-copy pair**, as recommended above. Two files, both outside
   the Director's boundary. **Medium.**
3. **No closing action on the archive.** Carried forward unchanged from revision 1:
   `/blogs` and `/recipes` end with a hairline and then the site footer. **Medium.**
4. **`/videos` thumbnail pillar-blur.** Now the dominant texture of that page. Not a CSS
   problem; record against `/api/videos`. **Low**, and explicitly not worth a pass now.
5. **Numbered pagination.** Carried forward; still outside the boundary. **Low.**
6. **The stale test assertion** at `ContentRow.test.tsx:259`, pinning the old
   `ROW_IMAGE_SIZES` literal. The Director records it deliberately; it belongs to Testing
   Agent and is one line. **Low**, but it is a currently-failing test.

---

## Still Unverified

Unchanged from revision 1, plus one addition:

1. **`/admin/blogs`** — still renders `Checking access…` and never resolves without a
   session. Revision 2 added two more changed properties (resting border to
   `--rule-accent`, disabled opacity to 0.5) on a page where none of the editorial tokens
   exist and the whole appearance rests on global-palette fallbacks. **More unverified
   than it was.** Route to someone who can sign in.
2. **`/blogs` imagery** — no article record carries a cover photo, so every plate renders
   flat `--surface-1`. I judged the composition, not the photography.
3. **The truly-empty archive state** and **the API-error state** — not reachable locally.
4. **High-DPI rendering** — all captures at `deviceScaleFactor: 1`. The `sizes` fix
   removes the 1x upscale I measured; I did not verify the 2x case.

---

## Revision-2 Verdict

**Ready with minor polish.**

Eight of the nine revision-2 changes verify exactly as claimed; the ninth (the kicker gap)
is right in substance and off by 3px in the figure; and the one genuine defect I found
mid-review — the missing `columns={2}` call site — has landed and is verified. The two-up
is the change that earns the upgrade: it withdraws my revision-1 finding that the row
fails on `/videos`, and it improved the hover tint and the focus ring on that page for
free. The search-field fix is the most solid single piece of work in either revision; I
looked hard for a fragility in the out-of-flow "Clear search" across 21 widths and at 200%
text size, and there is not one.

Nothing outstanding blocks release. The remaining items are a documentation reconcile, a
two-file copy-and-count pair worth doing when convenient, and a set of content-source
limitations that are correctly recorded and correctly not compensated for in CSS.
