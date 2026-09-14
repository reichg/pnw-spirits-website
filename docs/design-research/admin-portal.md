# Design Research — Admin Portal (`/admin`, `/admin/blogs`, `/admin/recipes`, `/admin/classes`, `/admin/newsletter`, `/admin/login`)

Prepared by: Design Researcher Agent
Date: 2026-09-14
Consumer: UI Design Director Agent (then Frontend UI Agent)

---

## Project Understanding

**Product.** A Pacific Northwest craft-spirits / cocktail site (Next.js 16 App Router, React 19,
CSS Modules, TypeScript, Vitest). The public site shipped a documented **"warm-dark editorial;
the photograph is the card"** system: `src/components/ui/editorialTokens.module.css` is its
written constitution, realised in `ContentCard.module.css`, `ContentRow.module.css`,
`ContentLandingLayout.module.css` and `ContentArchiveLayout.module.css`.

**The admin has not been touched by that work.** Read from source, the six surfaces are:

| Surface | File | Current state |
|---|---|---|
| Landing | `AdminLanding.module.css` | Full-bleed `Vermouth.jpg` at `blur(4px) brightness(0.2) saturate(1)`, one 720px `rgba(1,8,4,0.96)` panel with a copper-mix border and `--radius-lg`, 2-col grid of nav "buttons" |
| Blogs list | `AdminBlogList.module.css` | Full-bleed `Bottles.jpg`, same blur recipe, **3-up grid of 300px × 20rem cards**, each with a `.glassOverlay` div at `backdrop-filter: blur(14px)` and a `:hover` firing `filter: brightness(1.3) saturate(1.08)` plus a `0 0 0 3px` copper ring |
| Recipes list | `AdminRecipeList.module.css` | A near-verbatim second copy of the blog card block (`.adminCard`, `.glassOverlay`, `.adminCardContent`, `.adminCardTitle`, `.adminCardMeta`, `.adminCardActions` all duplicated), plus four dead rules (`.title`, `.author`, `.actions`, `.error` each declared twice) |
| Classes manager | `AdminClassManager.module.css` (473 lines) | Three stacked `<section>` panels on `--color-bg-secondary` with `--color-border`, a sessions `<ul>`, a `sessionForm`, and a **drag-reorderable photo grid** of `aspect-ratio: 4/3` thumbs with `.dragHandle`, `.limitBadge` and a dashed `.uploadArea` |
| Newsletter composer | `AdminNewsletterComposer.module.css` | Full-bleed `Vermouth.jpg` + `rgba(1,8,4,0.61)` scrim, a 900px panel, a form, and a **white `<iframe srcDoc>` HTML preview** at `min-height: 280px` |
| Login | `AdminLogin*.module.css` | Own shell; `AdminHeader.tsx` returns `null` at `/admin/login`, so this page carries the brand alone |

**Who uses it.** A small team. The work is: publish and edit blog posts and cocktail recipes,
schedule class sessions, reorder a photo album by drag, and send a newsletter. Page size is 10
(`AdminBlogList.tsx`, `pageSize = 10`).

**Measured density of what exists today (computed from the CSS, not rendered).** The blogs grid
is `repeat(3, 1fr)` with `gap: 2rem` and `padding: 15px`; cards are `height: 20rem` (320px). Row
pitch is therefore 352px. At 1440×900, after the admin header (~52px), the centred action row
(~2rem plus a button) and a 2rem heading, roughly 740px of list area remains — **two rows, six of
the ten records on the page.** Four of every ten records require a scroll to see at all.

**The conversion goal.** There isn't one. This is a tool. The goal is *task completion per unit
of attention*: find the record, confirm it is the right one, act on it, and not destroy anything
by accident.

---

## The Central Tension, Stated and Resolved

A public editorial page is a **reading surface**: the photograph is the subject, chrome is
suppressed, and the system's founding move is that there is no card — no background, border,
radius or shadow. An admin list is a **working surface**: the subject is a set of records to be
scanned, compared and acted on, and the controls are the reason the admin opened the page.

Copying the public card onto the admin fails in a specific, measurable way. `ContentCard`'s media
is `aspect-ratio: 1/1` at full column width; `ContentRow`'s is `clamp(8.75rem, 26%, 10rem)` —
140–160px square. In a list of 10 records, a 140px photograph is **2.6× the height of the
title-plus-meta text block it accompanies** (title at `--fs-card` 22px × 1.2 = 26.4px, meta at
`--fs-meta` 14px × 1.3 = 18.2px, plus an 8px gap = 52.6px). The photograph would win a contest it
has no business entering: an admin scanning for "the old fashioned post I wrote Tuesday" reads the
title and the date, not the glass.

The research below found that **every** content-management tool examined resolves this the same
way, and none of them resolved it by removing the image. They resolve it by **demoting the image
to a recognition token roughly the height of the text block beside it** — Statamic's asset rows
put a 32px square in a 57px row (measured) — and by giving the freed space to the title, the
metadata and a fixed trailing action column.

That is the transferable answer, and it is *consistent with* rather than a departure from this
system's thesis. "The photograph is the card" is a claim about what sells a click on a reading
surface. On a working surface nothing is being sold, so the photograph reverts to what it is:
the fastest way to confirm you are looking at the right record.

---

## Design Territory

Five characteristics guided the search. They extend the public system's stated set (*editorial,
warm-dark, tactile, restrained, quick*) rather than opening a new one:

1. **Instrumental** — the page is a tool, and every element must justify the vertical space it
   takes from the next record.
2. **Dense but ruled** — more records per viewport than today, structure carried by hairlines and
   a fixed action column rather than by panels.
3. **Unambiguous** — the controls are visible at rest, labelled in words, and reachable by
   keyboard and by touch.
4. **Recoverable** — destruction is either confirmed specifically or undoable; never both absent.
5. **Same voice, different register** — the same ground, ink tiers, type scale and copper rule as
   the public site, spoken as an instrument rather than as a magazine.

---

## Research Limitations

**Browser tooling was available and was used.** Playwright 1.61.0 is a pinned devDependency and
Chromium launched successfully. Where a reference below is marked VV or MM, I loaded it in
headless Chromium at 1440×900, inspected the rendered screenshot, and — for MM — read geometry
out of the live DOM with `getBoundingClientRect` / `getComputedStyle`.

Classification used throughout, matching `archive-rows.md`:

- **VV — Visually Verified.** Observed in a rendered screenshot of the *live application* that I
  inspected.
- **VV-S — Visually Verified, product screenshot.** Observed in a rendered *image of the product*
  embedded in a marketing or documentation page I loaded. Real pixels, but art-directed by the
  vendor and not a live app. Never treated as a measurement.
- **MM — Measured.** Read out of the live DOM.
- **TV — Textually Verified.** Supported by written material (including this repo's own recorded
  measurements and the W3C / NN/g sources cited) but not directly seen.
- **INF — Inference.** My design interpretation, or arithmetic I performed on repo values.

### Access log — every reference the work order named, and what actually happened

Recorded in full so the coverage gaps are not silent.

| Named in brief | Outcome |
|---|---|
| **Statamic** | **Reached live and logged in.** `demo.statamic.com/cp` ships prefilled demo credentials on its login form. Entries list, asset browser, row-action menu and empty state all VV + MM. The single richest reference in this study. |
| **Ghost admin** | `demo.ghost.io/ghost/` loads but redirects to `#/signin` with **empty** credential fields; `ghost.org/demo/` returns 404. **The Ghost post list was never seen and nothing is claimed about it.** Ghost's *dark-mode dashboard* was captured as VV-S from `ghost.org`. |
| **Linear** | `linear.app` loaded; the hero mock shows an **issue detail**, not an issue list. Sidebar density captured VV-S. **Linear's list view was not seen**; no row measurement is claimed. |
| **Sanity Studio** | `sanity.io/studio` loaded; the studio demo on that page is a **video player**, not a rendered UI. No auth-free studio found. **Dropped.** |
| **Contentful** | `contentful.com` returns 200; the app is behind auth and no public demo was found. **Dropped, not examined.** |
| **Craft CMS** | `craftcms.com/demo` is a lead-capture form ("Request Demo"), not a live instance. The features page showed a low-resolution entry-list product shot (VV-S) with a small leading thumbnail; too small to measure. |
| **Kirby** | `trykirby.com` redirects to `getkirby.com/try`; `getkirby.com/panel` returns the site's own "Oh no!" 404. **Panel never seen. Dropped.** |
| **Prismic** | `prismic.io/page-builder` loaded but sits behind a modal cookie wall that obscured the product mock. VV-S of the page-builder chrome only; nothing transferable about *lists*. |
| **Notion database views** | No auth-free database view found. `notion.com/product/database` is 404; `notion.com/product/docs` renders a **document**, not a database view. **Dropped — nothing is claimed about Notion.** |
| **Cosmos / Arc Publishing** | No public demo or product render found. **Not examined.** |

### Additional references I added, and their outcomes

| Reference | Outcome |
|---|---|
| **WordPress** via `playground.wordpress.net` | **Reached live.** A real WordPress 7.1 `wp-admin/edit.php` booted in-browser. Posts list VV + MM, including the row-action reveal mechanism measured at rest, hover and focus. |
| **Grafana** `play.grafana.org/dashboards` | **Reached live.** The only *dark-ground* production list I could measure. VV + MM. |
| Decap CMS `demo.decapcms.org` | Loads to a login screen. Not pursued. |
| Vendure `demo.vendure.io/admin` | Login form reached; the documented demo credentials were rejected. **Failed.** |
| Directus, Medusa, Strapi, Wagtail demos | `demo.directus.io` now redirects to a contact page; `demo.medusajs.com` has an expired certificate; `demo.strapi.io` and `demo.wagtail.io` do not resolve. **All dead.** |
| Shopify Polaris docs | `polaris.shopify.com/components/...` now 301s to `shopify.dev/docs/api/polaris`, which did not render the component examples. **Dropped.** |

### Other honest gaps

- **No dark-themed, warm-palette CMS was found in a live, measurable state.** Statamic and
  WordPress are light-content tools; Grafana is dark but cool blue-grey; Ghost's dark admin was
  only VV-S. Every warm-dark recommendation below therefore rests on *this repo's own* measured
  token contract plus contrast arithmetic I performed, not on an external exemplar. That is
  stated again where it matters.
- **I did not render this repo's own admin.** It needs auth and a database. The "six of ten
  records" figure above is arithmetic on the CSS (INF), not a screenshot.
- **Touch behaviour was not tested.** No reference was loaded at phone width with touch emulation
  for this study; the touch arguments below come from the standards text (TV), not observation.

---

## Candidate References

Three live applications carry the weight. Everything else is supporting or counter-evidence.

**Group A — live, measured applications.**

| Reference | Why chosen |
|---|---|
| **Statamic control panel** (`demo.statamic.com/cp`) | The only *editorially branded* CMS I could get inside. Gives an entries list, a thumbnail-bearing asset list, a row-action menu, a search-driven empty state and a complete toolbar, all measurable. |
| **WordPress posts list** (WP 7.1 via Playground) | The most-used admin list in existence and the canonical hover-reveal row-action pattern. Its reveal mechanism turns out to be far better engineered than its reputation. |
| **Grafana dashboards** (`play.grafana.org`) | The only live *dark-ground* list available. Used strictly for dark-ground calibration (separator vs control-boundary alpha) and as the "generic dark SaaS" counter-example. |

**Group B — product screenshots (VV-S), used for composition only, never measurement.**

| Reference | Why chosen |
|---|---|
| **Ghost admin, dark mode** (`ghost.org` hero) | The closest thing found to a *warm-ish dark editorial* admin, and a publisher's tool by definition. |
| **Linear** (`linear.app` hero) | For sidebar and chrome density on a near-black ground. |
| **Craft CMS** (`craftcms.com/features`) | Only to confirm that a leading thumbnail in an editorial entry list is a convention, not a one-off. |

**Group C — standards and guidance (TV).** W3C *Understanding* documents for SC 2.5.8 and
SC 1.4.13; NN/g on confirmation dialogs and on the three response-time limits.

---

## Reference Extraction Matrix

| Reference | Evidence | Observed idea | Why it works | Relevance | Proposed adaptation to our tokens |
|---|---|---|---|---|---|
| **Statamic — entries list** | MM | Rows are a flat table at a **~45.8px pitch** (row tops 330 → 377 → 422 → 468 → 514 → 560). Title is **14px / weight 400 / 20px line-height** in full ink. There is **no thumbnail at all** in the entries list. | An entry list is an index. The collection knows what it contains; the row only has to disambiguate *which one*. | High | Confirms the title, not the media, is the row's subject. Our title should be **one line, no wrap, ellipsis** — not the public card's 26ch wrapped block. |
| **Statamic — entries list** | VV | Publish status is a **~7px filled dot** immediately left of the title. Not a pill, not a badge, not a coloured row. | A dot costs about 12px of row width and zero vertical space, and it is scannable as a column down the left edge. | High | Directly adoptable and exactly in register: this system has no filled surfaces, so a badge would be foreign but a mark is not. Use it for draft-vs-published once that state exists. |
| **Statamic — entries list** | VV | Author renders as a **small outlined chip**; date is plain right-of-centre text. Two different metadata treatments in one row. | The chip marks a *facet you can filter by*; the date is just a fact. | Medium | **Take the distinction, not the chip.** A chip is a bordered surface. Render the author at `--fs-meta` / `--ink-3` and let the copper rule carry any facet marking, per this system's rules-not-surfaces doctrine. |
| **Statamic — entries list** | MM | The trailing row action is a **single `…` button, `opacity: 1` and `visibility: visible` at rest**, pinned at x≈1347 of a 1440 viewport. Hovering the row changed neither the button's opacity nor the row background. | Statamic simply declines the hover-reveal trade entirely. Nothing is hidden, so nothing has to be un-hidden on touch or by keyboard. | **Highest** | The single most important finding for our action controls. See Question 3. |
| **Statamic — row menu** | MM | The menu is **256px wide, 12px radius**, items **32px tall**, split into two hairline-separated groups: *[Visit URL, Edit]* / *[Duplicate, Unpublish]*. Each item carries a leading 16px outline icon. | Grouping separates "go look at it" from "change it". The hairline does the work a colour would otherwise have to do. | High | The grouping device transfers; the 12px radius and the popup surface do not (see "What NOT to take"). **Note honestly: no Delete item appeared in the demo's menu, so I saw no destructive treatment here and claim none.** |
| **Statamic — asset browser** | MM | Thumbnail is a **32 × 32px square, `border-radius: 4px`, `object-fit: cover`**, leading the filename *inside* the name cell. Row height and pitch are both **57px**. The name column is **429px of a ~1128px table = 38%**. | 32px in a 57px row is **56% of row height** — large enough to recognise a photograph, too small to become the subject. | **Highest** | This is the measured ratio the whole recommendation is built on. See Question 1. Our rows are taller, so the thumbnail scales with them rather than adopting this absolute number. |
| **Statamic — toolbar** | MM | `<h1>` **25px / weight 500** at x=241, y=101. On the same baseline at the trailing edge: a `…` overflow, a two-button **view-mode toggle**, then the primary **Create Entry** button (112 × 40px, 8px radius). **Search sits on its own band below**, as a 385px field, with a `Filters` button beside it and a column-config button at the far right. | Two bands: *what this page is and the one thing you came to create* on top, *how you narrow it* beneath. The eye never hunts for the primary action. | **Highest** | Almost exactly the header this repo already built for `/blogs` and `/recipes`. See Question 6. |
| **Statamic — toolbar** | MM | The primary button is **40px tall**. The row menu items are **32px tall**. | 40px for the one-per-page primary; 32px inside a menu where the pointer is already committed and the spacing exception applies. | High | Gives a defensible two-tier control height. See the new-token section. |
| **Statamic — empty state** | VV | A nonsense search (`zzzzqqq`) produced a **dashed-outline band the full width of the list, ~72px tall, containing centred muted text "No results"**. No illustration, no skeleton, no CTA. **The search field, its clear ×, and the Filters button all remained.** | The controls that *caused* the empty state must survive it, or the user is stranded in a state they cannot exit. | **Highest** | The decisive evidence for Question 5, and it *supports* this repo's no-skeleton rule while adding a requirement the public pages do not have. |
| **Statamic — footer** | VV | `1–6 of 6` set small and muted at the **bottom-left inside the list band**. | An inventory count tells you whether you are looking at everything. | Medium | `ContentArchiveLayout.module.css` already has `.resultCount`; reuse it rather than inventing a footer. |
| **WordPress — posts list** | MM | Row height is **55.6px at rest, 55.6px on hover, and 55.6px on focus — identical to the decimal.** | Zero layout shift when the actions appear. | **Highest** | The mechanism below is the reason, and it is worth understanding even though we will not need it. |
| **WordPress — posts list** | MM | `.row-actions` is **`display: block`, `visibility: visible`, `opacity: 1` at all times**. It is hidden purely by `position: relative; left: -129987px`. On hover *and* on `:focus-within` (verified with the pointer parked at 700,700) `position` flips to `static` and the block snaps back to x=227. | The actions never leave the flow, so the row reserves their 19.9px permanently; and they never leave the accessibility tree, so a screen reader and the tab order always have them. | **Highest** | The most sophisticated hover-reveal implementation I have seen — and it **still** costs 19.9px of every row to hide something. If you are paying the height anyway, showing the actions is free. See Question 3. |
| **WordPress — posts list** | MM | The revealed action set is inline text: `Edit \| Quick Edit \| Trash \| View` at **13px**, with **Trash alone in `rgb(179,45,46)`**. Destructive is marked by colour only, at the same size, in the same run. | Restraint: the destructive action is neither hidden nor shouted. | High (with a hard caveat) | The *restraint* transfers. The *implementation* does not: that link's hit area is at most 19.9px tall, **below the WCAG 2.2 SC 2.5.8 minimum of 24 × 24 CSS px** (TV). And our ground makes the colour half of it impossible — see Question 4. |
| **WordPress — posts list** | MM | Toolbar: `<h1>` **23px / weight 400** at x=182, with **"Add Post" as a small outlined button on the same baseline immediately to its right** (x=243, 32px tall) — not at the far edge. Search is a separate 177px field at the top right. Counts (`All (1) \| Published (1)`) sit beneath the title as plain text links. | Putting the create action *next to the title* rather than opposite it ties it to the noun. | Medium | An alternative to Statamic's far-right primary. Our 1200px spine is wide; at that width a far-right primary has a long travel from the title. Flagged for the Director as a genuine choice, not settled here. |
| **Grafana — dashboards** | MM | Search input border is **`rgba(204,204,220,0.2)` — 20% ink alpha on a dark ground** — while the list separators are far fainter. | A dark UI needs the *edge of a control* to be materially stronger than the *separator between content*. They are not the same line. | **Highest** | Our `--hairline` is 14% ink (1.43:1 against `--surface-0`). That is correct for a separator and **too faint for a control boundary**. See the new-token section. |
| **Grafana — dashboards** | MM | Row pitch **36px**; `<h1>` **28px / weight 400** in the same `rgb(204,204,220)` ink as body text. | At 36px a row holds one line and nothing else. Grafana's list is a file tree, not a content index. | Medium (as a floor) | 36px is the density floor. It is too tight for us: it cannot hold a thumbnail or a second metadata line. |
| **Grafana — dashboards** | VV | Header stack is **four separate bands**: title, dek, full-width search, filter row, then a tinted column-header band, then rows. | Each band is legible; together they consume ~200px before a single record appears. | High (as a warning) | On a 900px viewport that is 22% of the screen spent on chrome. Our header must be **two bands, not four**. |
| **Ghost — dark admin dashboard** | VV-S | Near-black ground; content grouped into panels with a very faint 1px border and ~6px radius. The "Recent posts" table sets its column heads (`TITLE`, `SENDS`, `OPEN RATE`) in **tiny uppercase tracked grey caps**, with titles beneath in full-ink 14px at roughly a 36px pitch. | The uppercase tracked micro-caps do exactly what an eyebrow does on the public site: label a column without competing with it. | High | **We already have this role.** `--fs-eyebrow` (11→12px, tracked 0.12em, uppercase) is the identical treatment, and `ContentRow.module.css` already sets `.date` / `.kicker` that way. Column heads in the admin should be `--fs-eyebrow` / `--ink-3`, reusing the existing rule rather than inventing a head style. |
| **Ghost — dark admin dashboard** | VV-S | The left nav is a plain text list — `Posts / Drafts / Scheduled / Published / Free posts / Paid posts / Newsletters` — with **no pills, no boxes, no active fill**, only small coloured dots against three items. | A publisher's tool can navigate on text alone. | Medium | Supports keeping our `AdminHeader` links as text, and argues against the current `.linkActive { background: var(--color-accent-copper) }` filled pill. See Question 7. |
| **Linear** | VV-S | Sidebar items sit at roughly a 30px pitch with 13–14px labels and monochrome 16px icons on a near-black ground; the active item is a **very low-contrast raised fill**, not an accent colour. | Marking the active item with a change of *ground* rather than a change of *hue* keeps the accent free for meaning. | Medium | Our `--surface-1` (#1c1613, a measured 1.056:1 against `--surface-0`) is exactly such a whisper-fill and already exists. |
| **Craft CMS** | VV-S | The entry list mock shows a small leading thumbnail next to the entry title. Resolution too low to measure. | Confirms the leading-thumbnail convention in an editorial CMS. | Low | Corroboration only. No number is taken from it. |
| **W3C — SC 2.5.8** | TV | Pointer targets must be **at least 24 × 24 CSS px**, with a spacing exception measured by a 24px-diameter circle centred on each target's bounding box that must not intersect another target's circle. | The floor is a standard, not a preference. | **Highest** | Sets the minimum for every Edit / Delete / drag-handle control in the admin, and rules out WordPress's 19.9px inline text links as a model. |
| **W3C — SC 1.4.13** | TV | Content revealed on hover or focus must be **dismissable, hoverable and persistent**. | Any hover-reveal takes on three obligations the author must then discharge. | High | Reinforces Question 3: do not reveal on hover, and the criterion stops applying. |
| **NN/g — confirmation dialogs** | TV | Confirm only for serious, irreversible consequences; label buttons with the **action** ("Delete file" / "Keep file") rather than Yes/No; a confirmation with no identifying detail — "these 2 items" — trains reflexive clicking; **undo is the better alternative** where it is available. | Our `window.confirm("Delete this blog?")` fails on every count: browser-chrome styling, OK/Cancel labels, and no identification of *which* blog. | **Highest** | See Question 4. |
| **NN/g — response times** | TV | 0.1s feels instantaneous and needs no feedback; up to 1.0s the user stays in flow and **no special feedback is required**; beyond 10s a percent-done indicator and an escape are required. | Gives an evidence threshold for when a loading affordance is owed at all. | **Highest** | Settles Question 5 against skeletons for our list fetches, and *for* a control-level busy state on save and send. |

---

## The Seven Direct Questions

### 1. How should a content row allocate space between thumbnail, title, metadata and actions?

**Measured evidence.**

| Source | Thumb | Row height | Thumb ÷ row | Title | Actions |
|---|---|---|---|---|---|
| Statamic assets (MM) | 32 × 32, 4px radius, `cover` | 57px | **0.56** | 14px, leading the name cell | trailing `…`, always visible |
| Statamic entries (MM) | none | 45.8px | — | 14px / 400 | trailing `…`, always visible |
| WordPress posts (MM) | none | 55.6px | — | 14px / 600 | inline text under the title |
| Grafana (MM) | none | 36px | — | 14px | none per row |
| **Our public `ContentRow` (repo)** | 140–160px square | ~392px (TV, `archive-rows.md`) | 0.36–0.41 | `--fs-card` | none — the row *is* the link |

Two findings, and they point the same way.

**Finding A: nobody sizes an admin thumbnail in absolute pixels; they size it to the text beside
it.** Statamic's 32px square sits in a 57px row holding a single 14px line plus 12px of padding
each side. The thumbnail is the height of the content, less the padding. That is a *rule*, not a
number, and it is the one worth importing — because our rows are taller than Statamic's.

**Finding B: the action column is fixed-width and the text column is what flexes.** Every measured
row puts actions at the trailing edge in a column of constant width (Statamic's trailing cell
measured **53px** in the entries list and **52px** in the asset browser — the same column across
two different tables) and lets the name column absorb the remaining width (429px, 38% of the
table).

**Derivation for us.** Our text block is fixed by tokens we already own:

```
title   --fs-card  = 22px at 1440 × line-height 1.2  = 26.4px
gap     --space-2xs                                  =  8.0px
meta    --fs-meta  = 14px at 1440 × line-height 1.3  = 18.2px
                                              block  = 52.6px
```

A thumbnail at **56px (3.5rem)** is the smallest round rem step that covers that block, giving a
thumb ÷ row ratio of 56 ÷ 80 = **0.70** at `--space-xs` (12px) vertical padding, or 56 ÷ 88 =
**0.64** at `--space-s` (16px). Both sit above Statamic's 0.56 and far below our public row's
0.36–0.41 — which is the correct place to land, because our row is a *record* and Statamic's is a
*filename*.

**Proposed track at the 1200px spine** (INF, arithmetic):

```
grid-template-columns: 3.5rem  minmax(0, 1fr)  auto
column-gap:            var(--space-s)  /  var(--space-m)

  56  media
+ 16  --space-s
+ ?   content (flex)
+ 24  --space-m
+168  actions  (two 40px-tall text controls ≈ 72 + 8 + 88)
= content resolves to 936px, i.e. 78% of the spine
```

Compare Statamic's 38% name column — ours is wider because we spend nothing on an author chip, a
size column, a dimensions column or a checkbox. That is the right trade for five small
collections.

**The title must be one line.** `ContentCard` and `ContentRow` both cap the title at `26ch` and let
it wrap, which is right for a grid where ragged tops must be avoided. In an admin row a wrapping
title makes every row a different height, and the moment rows differ in height the trailing action
column stops being a column the eye can run down. Set
`white-space: nowrap; overflow: hidden; text-overflow: ellipsis` and let the 936px track do the
work. **This is a deliberate, stated departure from the public card's title rule**, and the
Director should record it as such rather than let it read as an oversight.

---

### 2. Density: how many records fit a 1440 × 900 viewport?

| Surface | Pitch | Records in the first viewport |
|---|---|---|
| Grafana (MM) | 36px | ~18 |
| Statamic entries (MM) | 45.8px | ~13 |
| Statamic assets (MM) | 57px | ~10 |
| WordPress posts (MM) | 55.6px | ~12 |
| **Our admin today (INF, from CSS)** | 352px per *row of three* | **6 of 10** |
| **Our public archive row (TV)** | ~392px | ~2.5 |
| **Proposed admin row (INF)** | **81px** (80 + 1px hairline) | **~8 of 10** |

The arithmetic for the proposal: 900px viewport − 52px admin header − ~180px page header block
(heading band + control band + the `--rule-accent` rule) = **668px of list area ÷ 81 = 8.2 rows.**

Eight of ten, against six of ten today, while *gaining* a thumbnail the current list does not have.
That is the whole density argument, and it is worth stating plainly: the gain does not come from
squeezing, it comes from **turning a 3-up grid of 320px-tall cards into a 1-up list of 80px rows**,
which is a 4.3× reduction in the vertical cost of a record.

**Do not chase Grafana's 36px.** At 36px there is no thumbnail, no second metadata line and no
40px action target — it buys ten more rows by deleting everything the admin came for.

**A note on the page-size mismatch.** Page size is 10 and the first viewport holds 8. The Director
may want to consider whether the pager row is worth its ~80px at that ratio, or whether the count
(`1–10 of 43`) in the header band does enough. That is a composition decision and I am leaving it
open.

---

### 3. Always-visible actions, or revealed on hover / focus?

**The evidence is one-sided, and the strongest argument against hover-reveal comes from the tool
that implements it best.**

WordPress's mechanism is genuinely excellent engineering (MM): the `.row-actions` block is never
`display: none` and never `opacity: 0`; it stays in the accessibility tree and in the layout flow
at all times, hidden only by `left: -129987px`, and it returns on `:hover` **and** on
`:focus-within`. Row height is **55.6px in all three states** — no shift.

But the flow position is the point. **Because the block never leaves the flow, every row pays
19.9px of height for it whether or not it is visible.** If you are already paying the space, hiding
the contents buys nothing except:

- a touch device where `:hover` does not exist (TV) — WordPress is rescued here only because
  tapping the row also focuses it;
- three fresh obligations under SC 1.4.13 — dismissable, hoverable, persistent (TV);
- an admin who cannot see, before committing the pointer, whether a row *has* a delete.

Statamic simply does not make the trade (MM: `opacity: 1`, `visibility: visible` at rest, and
hovering changed neither the button nor the row background). Neither should we.

**Recommendation: actions are visible at rest, always, on every row, at every width.** No opacity
transition, no `:hover` gate. Hover changes the row *ground* (`--surface-1`, a 1.056:1 whisper that
already exists) to confirm which row the pointer is on, and nothing else.

**Target size.** Each action control gets a minimum 40 × 40px hit area. The justification is
twofold: SC 2.5.8 requires 24 × 24 (TV), and **this repo has already been here** —
`editorialTokens.module.css` derives `--step-marker: 2.5rem` (40px) for the recipe method disc and
records the reasoning verbatim: *"it also clears the WCAG 2.2 minimum target size (24x24) with room
to spare"*, and *"a target size that shrank with the viewport would shrink on exactly the device
being held one-handed."* The admin's controls face the same problem and deserve the same answer —
but **not the same token**, because `--step-marker` is named for its role and that role is a
numbered step. See the new-token section.

**Labels, not icons.** Statamic can use a bare `…` because a Statamic admin is in the CP daily.
This admin is used by a small team, intermittently, across five unlike sections. Icon-only controls
would require tooltips, and a tooltip is content-on-hover, which re-opens SC 1.4.13 (TV) for no
gain. Use the words "Edit" and "Delete".

---

### 4. Destructive actions: distinguishing Delete without shouting

**What the code does today.** `AdminBlogList.tsx` calls `confirm("Delete this blog?")` and
`AdminRecipeList.tsx` calls `window.confirm("Delete this recipe?")`. Against NN/g's criteria (TV)
this fails three ways at once: the buttons are the browser's **OK / Cancel** rather than named
actions; the message **does not identify which record** is about to be destroyed — the exact
"these 2 items" failure mode NN/g names; and it is unstyleable browser chrome dropped into a
branded tool. `AdminClassManager.module.css` additionally ships a `.dangerButton` filled with
`var(--color-error)`, which is a separate problem — see below.

**What the references do.**

- WordPress (MM): Delete is *not* delete. It is **Trash** — a reversible soft-delete — rendered as
  a plain 13px text link in `rgb(179,45,46)`, third in an inline run, with **no confirmation at
  all**. The safety comes from reversibility, not from a dialog.
- Statamic (MM): row actions are grouped in a menu with a hairline between *navigate* and *mutate*
  groups. **The demo's menu contained no Delete, so I saw no destructive treatment and claim none.**
- NN/g (TV): confirm only for serious and irreversible consequences; name the buttons for the
  actions; identify the object; prefer undo where it exists.

**The colour problem, measured.** This is the finding that most constrains the Director, and it is
new — `archive-rows.md` rejected `--color-error` on a reading surface for softer reasons. I computed
relative luminance by compositing against the ground, the same method `editorialTokens.module.css`
records for its ink tiers; my method reproduces that file's own figures to within 0.06 (it records
ink-1 13.57 / ink-2 7.38 / ink-3 5.43; I get 13.51 / 7.38 / 5.41), so the numbers below are
trustworthy:

| Colour | Hue | Contrast vs `--surface-0` (#15100d) | Verdict |
|---|---|---|---|
| `--surface-0` ground itself | **23°** | — | The ground is *itself* an orange |
| `--color-accent-copper` #b87333 | **29°** | 4.98 : 1 | 6° from the ground |
| `--color-error` #c1440e | **18°** | **3.69 : 1** | **5° from the ground, 11° from copper — and it fails AA (4.5:1) for normal text outright** |
| `--color-accent-gold` #e2b07e | 30° | 9.66 : 1 | fine, but it is already the link colour |
| candidate danger #e2645f | 2° | 5.60 : 1 | 27° off copper; clears AA with margin |

**`--color-error` cannot signal danger in this system.** It is a burnt orange five degrees of hue
from the page ground and eleven from the structural accent, and it does not even meet AA as text. A
"Delete" in `--color-error` on `--surface-0` reads as *another accent*, not as an alarm. The
`.dangerButton` in the classes manager is currently a **solid fill** of that colour, which is the
worst version: a filled surface (foreign to this system) in a colour that does not mean what it is
trying to mean.

**Recommendation — a three-part answer, in order of how much it buys.**

1. **Distinguish by position and word, not by colour, in the row.** "Edit" and "Delete" as two text
   controls at the trailing edge, with **Delete last** and set one ink tier down (`--ink-2` against
   Edit's `--ink-1`). Hierarchy by ink tier is this system's founding mechanism — the token file
   says so explicitly: *"Hierarchy is carried by opacity, not by weight."* Applying it to a pair of
   controls is consistent, not novel.
2. **Replace `window.confirm` with a real dialog that names the record.** "Delete *Smoked Maple Old
   Fashioned*?" with buttons labelled **"Delete recipe"** and **"Keep recipe"** (NN/g, TV). This is
   where — and *only* where — a true danger colour appears, on the confirming button.
3. **Colour, if used at all, needs a token this system does not have.** A danger hue must sit near
   0–2° and clear 4.5:1. `#e2645f` measures **5.60:1 on `--surface-0` and 5.30:1 on `--surface-1`**
   and is 27° off copper. I am proposing the *requirement* and a value that satisfies it; **the
   exact hue is the Director's to settle.** What is not negotiable is that `--color-error` is not
   it.

**Undo is out of scope but should be recorded.** WordPress's real answer is that Trash is
reversible. Our `DELETE /api/blogs/:id` is a hard delete. Making it reversible is a backend change
outside both this brief and the Director's boundary — flagged to the Orchestrator below rather than
designed around here.

---

### 5. Empty, loading and error states on a working surface

**The public rule, quoted from `ContentArchiveLayout.tsx`:** *"No panel, no spinner, no skeleton and
no error colour: a skeleton would draw twelve grey card shapes on a page whose thesis is that there
are no card shapes."*

**Does that rule hold on a working surface? Mostly yes — and the evidence sharpens it rather than
overturning it.**

- **Skeletons: the rule holds, and now for a second reason.** The lists fetch paginated JSON from a
  Redis-cached route. NN/g's thresholds (TV) put anything under 1.0s in the "no special feedback
  required" band; a skeleton is feedback for a 2–10s wait. Drawing eight grey 80px rectangles to
  cover a sub-second fetch is theatre. **The public rule transfers unchanged.**
- **Empty states: the rule needs one addition.** Statamic's empty state (VV) is exactly this repo's
  `.emptyMessage` treatment — plain muted text, no illustration, no panel. But it kept the **search
  field, its clear ×, and the Filters button** on screen. On the public archive an empty state is a
  dead end you leave by navigating; on a working surface it is a state the admin *put themselves
  into* and must be able to reverse **in place**. So: reuse `.emptyMessage` verbatim, and require
  that the control band above it never unmounts. `ContentArchiveLayout` already declares a
  `.clearSearch` affordance for this exact purpose — the admin should use it, not re-derive it.
- **Errors: the public rule holds on colour but not on silence.** `archive-rows.md` rejected
  `--color-error` for error text, and the contrast measurement above independently confirms that
  rejection with a number (3.69:1, below AA). But a public reader who sees no articles has lost
  nothing, whereas an admin whose *save* silently failed has lost work. **Distinguish by
  consequence:** a failed *read* (list did not load) is `--ink-2` prose in the `.emptyMessage` slot,
  no colour; a failed *write* (save, delete, send) must be an assertive, persistent message anchored
  to the control that failed, and must not vanish on the next render.
  `AdminNewsletterComposer.tsx` already gets `role="status"` / `aria-live="polite"` right for its
  success path; the failure path should be `role="alert"`.
- **Loading: the one place a busy state is genuinely owed.** Sending a newsletter and uploading
  photos are the operations that can cross NN/g's 1-second line (TV). Those need a **control-level
  busy state** — the button disables and changes its own label ("Sending…") — not a page-level
  overlay. `AdminClassManager.tsx` already renders a plain `<p>Loading cocktail classes…</p>`, which
  is the right register and merely needs the token treatment.

---

### 6. Toolbar composition: title, search, and "New &lt;thing&gt;"

**Two live layouts, and they disagree about one thing.**

| | Statamic (MM) | WordPress (MM) |
|---|---|---|
| Title | 25px / 500, far left | 23px / 400, far left |
| Primary create | **far right, same baseline**, 112 × 40px | **immediately right of the title**, 32px tall |
| Search | own band below, 385px field, left | far right of a second band, 177px field |
| Filters | `Filters` button beside search | three `<select>`s + Apply, left of the band |
| Count | `1–6 of 6`, bottom-left of the list | `1 item`, right of the filter band |
| Bands before the first record | **2** | 3 |
| Grafana, for contrast (VV) | — | **4 bands, ~200px of chrome** |

**Recommendation: two bands, and reuse the header this repo already built.**

`ContentArchiveLayout.module.css` already declares `.header` with
`border-bottom: 1px solid var(--rule-accent)` and `padding-bottom: var(--space-l)`, a `.headerFoot`
row, `.resultCount` at `--fs-meta`, a `.controls` slot, and `.clearSearch`. That *is* Statamic's
two-band header, in this project's tokens, already derived and already shipped. Duplicating it in
the admin would be the precise failure `editorialTokens.module.css` was written to prevent —
*"one page at brightness(0.2), the next at (0.25)"*.

- **Band 1:** `<h1>` left at **`--fs-h2` (24 → 32px), not `--fs-page` (36 → 64px)**. `--fs-page` is a
  poster size for a landing page whose heading is the only thing above the fold; an admin page
  heading is a label on a tool, and the 32px saving goes to a ninth row. Primary action ("New
  Recipe") trailing, on the same baseline. **I am not settling the Statamic-vs-WordPress
  disagreement about where the primary sits** — at a 1200px spine the far-right position is a long
  travel from the title, and that is a composition judgement the Director owns.
- **Band 2:** the existing bare underlined search field left (`archive-rows.md` derived this from
  PUNCH and it is already implemented in `.controls`), result count right (`1–10 of 43`).
- **Then the `--rule-accent` rule**, then rows. Nothing else.

One genuine addition the public archive does not need: **the blogs list has a "Continue Draft"
button that appears conditionally** (`hasDraft` from `localStorage`). A control that appears and
disappears inside the primary cluster will shift the primary button's position between visits. It
should sit in the second band, not the first.

---

### 7. How a branded admin signals it is the admin

**What the references do.**

- Statamic (VV): the *outer chrome* is near-black — measured body background
  `oklch(0.274 0.006 286.033)` — while the *content* sits on a white card with a radius. The tool is
  dark; the work is light. A full-width dark top bar carries the logo and a `Pro` badge.
- Ghost (VV-S): the admin is *entirely* dark in dark mode, with the marketing site light. The mode
  switch is the signal.
- WordPress (VV): a black admin bar plus a black left rail, against a light workspace.

All three separate the admin from the public site by **changing the chrome, not the brand**.

**The inversion trick does not transfer, and this is the one place where having no live warm-dark
exemplar bites.** Statamic's and WordPress's move is *dark chrome around light content*. Our public
site is **already dark**. Inverting would mean a light admin — abandoning the ground, the ink tiers,
the copper rule and the entire token contract for five pages. That is not a brand extension, it is
a second design system.

**Recommendation: signal the admin with structure and vocabulary, not with a different palette.**

1. **Keep the existing "Admin" badge**, but restyle it. `AdminHeader.module.css` currently fills it
   with `background: var(--color-accent-copper)` and `--color-text-inverse` — a filled surface, in a
   system whose founding decision is that it has no filled surfaces. Render it instead as
   `--fs-eyebrow`, uppercase, tracked, in `--ink-2`, inside a **1px `--rule-accent` outline**.
   Copper as a *rule* around it is exactly the doctrine; copper as a *fill* behind it is not.
2. **Make the header rule carry the distinction.** The header already has
   `border-bottom: 2px solid var(--color-accent-copper)`. The public header does not. A single
   continuous copper rule under the admin bar is a strong, cheap, wordless signal — and it is the
   one element in this system licensed to be copper.
3. **Drop the filled active-link pill.** `.linkActive { background: var(--color-accent-copper) }` is
   the same filled-surface problem. Ghost (VV-S) and Linear (VV-S) both mark the active nav item
   with either full ink against dim ink, or a whisper-fill. We have both: `--ink-1` against
   `--ink-2`, and `--surface-1`.
4. **Delete the blurred photograph from every page shell.** It appears in `AdminLanding`,
   `AdminBlogList`, `AdminRecipeList`, `AdminClassManager` and `AdminNewsletterComposer` as five
   separate copies of `blur(4px) brightness(0.2) saturate(1)` — the exact per-page drift the token
   file exists to end. It also costs a full-resolution JPEG decode on every admin page load to
   produce something that is, by construction, unreadable.

---

## Recommended Direction

Expressed in the existing token vocabulary so the Director can implement against it. Every value
below is either an existing token, arithmetic on existing tokens, or a new rung explicitly declared
in the next section.

### The page shell (all surfaces)

```
.root
  composes editorialSurface          /* the whole token contract, one declaration site */
  background: var(--surface-0)
  no background image, no ::before blur, no glassOverlay
  padding-inline: var(--gutter)
  > * { max-inline-size: var(--container); margin-inline: auto }   /* the 1200px spine */
```

The grain layer from `ContentLandingLayout`'s `.root` is the Director's call: it is part of the
brand's tactility, and it is also a fixed extra paint on a surface that will be scrolled and
re-rendered often.

### The admin row

```
.row
  display: grid
  grid-template-columns: 3.5rem  minmax(0, 1fr)  auto
  column-gap: var(--space-s)              /* media → content */
  align-items: center
  padding-block: var(--space-xs)          /* 12px; row resolves to 80px */
  border-top: 1px solid var(--hairline)   /* on .row + .row, as ContentRow already does */

.row:hover, .row:focus-within
  background-color: var(--surface-1)      /* 1.056:1 — a whisper, exactly as intended */

.media    3.5rem square, aspect-ratio 1/1, background var(--surface-1) when empty
          radius: 0  ← see note
.title    --fs-card / --ink-1 / weight 600 / line-height 1.2 / nowrap + ellipsis
.meta     --fs-meta / --ink-3 / uppercase / letter-spacing 0.06em
          (reuse ContentRow's existing .byline treatment verbatim)
.actions  display flex, gap var(--space-2xs), min-height 2.5rem per control
.edit     --fs-meta / --ink-1
.delete   --fs-meta / --ink-2, last in the cluster
```

**Note on the media radius.** Statamic uses 4px (MM). This system uses **zero** radius on media
everywhere — `ContentCard.module.css` opens with *"Zero radius, zero border, zero shadow."* Holding
zero in the admin costs nothing and keeps one rule instead of two. Recommended: **zero**.

**Note on the resting veil.** `ContentCard` draws a veil over its media that lifts on hover.
`archive-rows.md` already rejected carrying it onto the archive row — *"at 312px across ten rows it
reads as ten disabled rows."* At 56px across eight rows the argument is stronger still. **No veil.**

**Alignment is `center`, not `start`.** This is a second deliberate departure. `ContentRow` uses
`align-items: start` because YouTube's measured top-alignment gives a tall row one shared reading
start-point. In an 80px row with a one-line title, centring is what keeps the 56px media, the 52.6px
text block and the 40px controls on one optical axis. Recorded here so it does not read as an
inconsistency.

### The page header

Compose `ContentArchiveLayout`'s `.header` / `.headerFoot` / `.resultCount` / `.controls` /
`.clearSearch` / `.emptyMessage` / `.pagerRow`, with two admin-specific overrides: `--fs-h2` for the
heading, and a trailing primary action slot in band 1.

**The Director must choose between two implementations**, and this is a real architectural decision
I am deliberately not making:

- **(a) Compose from `ContentArchiveLayout.module.css`.** Zero duplication, guaranteed consistency —
  but it couples a public-surface module to the admin, and the `composes`-ordering hazard that file
  documents at length now spans two feature areas.
- **(b) Extract a shared archive shell that the public archive and the admin both compose.**
  Correct, and a larger change than this brief implies.

What must *not* happen is (c): a third hand-written header. That is how the admin got two copies of
`.adminCard` in the first place.

---

## Consistency Check Across All Six Surfaces

Required by the work order, and two of these do not fit cleanly.

| Surface | Does the row anatomy apply? | Notes |
|---|---|---|
| **`/admin` landing** | **Partly.** | Five navigation destinations, no thumbnail, no actions. The row reduces cleanly to `label + hint` over a `--hairline`. **Open question for the Director:** five ruled rows on a 1200px spine is a thin page; a 2-col ruled arrangement may compose better. Either way the current `color-mix` bordered button-cards and the `translateY(-2px)` hover lift should go — the public system's only lift is on the closing CTA, and it is already neutralised for reduced motion there. |
| **`/admin/blogs`** | **Yes, with a data caveat.** | See "Boundary gaps" — `coverPhoto` exists on the model but the list component's local `Blog` interface omits it, and the API returns an S3 **key**, not a signed URL. |
| **`/admin/recipes`** | **Yes.** | `AdminRecipeList.tsx` already types `coverPhoto?: string`. Same signing caveat. |
| **`/admin/classes`** | **Partly — and this is where a naive rollout breaks.** | Three parts, three answers. (1) **Page Content** is a form: it takes the field / label / input treatment, not the row. (2) **Class Dates & Times** *is* a row list and should adopt the row anatomy — media slot omitted, session label as title, location as meta, Edit / Delete trailing. (3) The **photo album is a drag-reorderable grid and must stay a grid.** Spatial order is the information; converting it to rows would destroy the thing being edited. It needs its own spec: keep `aspect-ratio: 4/3`, restyle to `--hairline` / `--surface-1` / zero radius, and — critically — **the drag handle is a control that must be permanently visible and at least 24 × 24px** (TV, SC 2.5.8). It is also the one place where a pointer-only affordance would be a genuine barrier, so a keyboard reorder path matters more here than anywhere else in the admin. **I am flagging this as the highest-risk surface and not designing it in this document.** |
| **`/admin/newsletter`** | **No.** | A form plus a **white `<iframe srcDoc>`**. Email HTML is light; that rectangle cannot be made warm-dark and should not be fought. Frame it deliberately: a `--hairline` border, a `--fs-eyebrow` / `--ink-3` caption above it reading "Preview", and generous `--space-m` clearance so it reads as a *specimen being inspected* rather than as a hole in the page. **Any recommendation phrased as "everything on the admin is dark" is false on this surface** — stated here rather than left to be discovered in implementation. |
| **`/admin/login`** | **No.** | No list, and `AdminHeader.tsx` returns `null` at `/admin/login`, so this page carries the brand alone. It is the one admin surface where a centred composition is correct, and arguably the one place the photograph earns its keep. **The Director should decide explicitly** whether "delete the blurred background everywhere" includes login, rather than letting it fall out of a global find-and-replace. |

---

## New Tokens This Direction Requires

`editorialTokens.module.css` states its own rule: *"A rung nothing reads is scaffolding the next
person has to guess the intent of… Add the rung when the rule that needs it is written."* Each entry
below names the rule that needs it. Values are proposals; the Director settles them.

| Proposed token | Value | The rule that needs it | Why an existing token will not do |
|---|---|---|---|
| `--control-min` | `2.5rem` (40px) | *"Every interactive control in the admin has a hit area of at least `--control-min` in both axes."* | `--step-marker` is **already 40px and already justified on WCAG target-size grounds** — but that file's own naming doctrine is that geometry values are *"named for their role and not for their size"*, and its role is the recipe method disc. Reusing it would make one name serve two unrelated decisions, and the next person to retune the disc would move the buttons. |
| `--admin-thumb` | `3.5rem` (56px) | *"A record's cover image is rendered at `--admin-thumb` square, sized to cover the title-plus-meta block beside it (26.4 + 8 + 18.2 = 52.6px)."* | `--row-media-col` is `26%` — a percentage explicitly declared *"with no ceiling on it"* for a media-leading reading row. An 80px admin row needs a fixed small square, not a percentage of a 1200px spine. |
| `--hairline-strong` | `rgb(var(--ink) / 0.36)` | *"A line that bounds an interactive control uses `--hairline-strong`; a line that separates content uses `--hairline`."* | **Measured**: `--hairline` at 0.14 is **1.43:1** against `--surface-0` — correct for a separator, and far below the 3:1 that WCAG 1.4.11 asks of a boundary that makes a control perceivable. I computed the alpha ramp: **0.36 is the first step reaching 3.00:1 on `--surface-0` and 3.02:1 on `--surface-1`** — so a control keeps a legal boundary even when its row is hovered. External corroboration: Grafana uses **0.20** ink alpha for input borders against far fainter content separators (MM), i.e. the same two-tier distinction, on a ground lighter than ours. |
| `--danger` | near 0–2° hue, ≥ 4.5:1 on `--surface-0`; `#e2645f` measures **5.60:1** (and 5.30:1 on `--surface-1`) | *"The confirming button of a destructive dialog is `--danger`. Nothing else in the system is."* | **Measured**: `--color-error` `#c1440e` is hue 18° against a ground at 23° and copper at 29°, and it is **3.69:1 — below AA for normal text**. It cannot read as an alarm here and should not be used as one. |

**A note in the token file's own idiom: `--rule-accent` already clears the control-boundary bar.**
Copper at its declared 0.8 alpha composites to **3.59:1 on `--surface-0` and 3.46:1 on
`--surface-1`** — above the 3:1 threshold on both grounds. It is therefore the *only existing token*
that can legally bound an interactive control, which gives the admin's primary button a
brand-native edge treatment with no new colour at all, and is a pleasing confirmation of the
"structural rules only, never text" doctrine. `--hairline-strong` is still worth having for the
neutral controls (inputs, secondary buttons) that should not all be copper.

**No token is proposed for**: a radius (this system's answer is zero and the admin gives no reason
to change it); a panel background (`--surface-1` already exists and the admin needs no third
ground); a shadow (there are none anywhere in the system, and the admin does not need to invent
depth); an admin-specific type size (`--fs-h2`, `--fs-card`, `--fs-meta` and `--fs-eyebrow` cover
every role identified above).

---

## What NOT to Take

Most admin UI is generic SaaS grey-blue. Named explicitly, because importing any of these would
destroy the thing that makes this project's design worth extending.

| Pattern | Seen in | Why it would break this brand |
|---|---|---|
| **Dark chrome wrapped around a white content card** | Statamic (MM: body `oklch(0.274…)`, content card white) | The defining move of both Statamic and WordPress, and completely wrong here. Our public site is already dark; a white workspace would abandon `--surface-0`, all three ink tiers and the copper rule in one step. |
| **Cool blue-grey dark mode** | Grafana (MM: ink `rgb(204,204,220)` — a lavender-grey; primary a saturated blue) | `editorialTokens.module.css` chose a warm near-black *specifically* because *"the global `--color-bg-deep` #020f05 is green-black and fights copper."* A cool-grey ink would re-open that exact fight. |
| **A saturated indigo / blue primary button** | Statamic's `Create Entry` (VV), Grafana, WordPress | A fourth colour family on a page whose whole palette is one hue plus ink. The primary action should be copper-ruled or gold, not blue. |
| **Filled pills, chips and badges** | Statamic's author chips (VV); our own `.brandBadge`, `.linkActive`, `.limitBadge` | `archive-rows.md` already rejected pills for the public archive: *"a pill is a filled, radiused surface. This system's founding decision is that it has no surfaces."* The admin does not get an exemption. |
| **Glass / `backdrop-filter` panels** | Our own `.glassOverlay` (`backdrop-filter: blur(14px) saturate(1.1)`) | Costs a compositor layer per card on a list that scrolls, and belongs to a visual language this project replaced. |
| **Brightness / saturate hover filters** | Our own `.adminCard:hover { filter: brightness(1.3) saturate(1.08) }` | Re-tints an uploaded photograph on hover. The public system's hover is a 1.04 image scale and a gold underline wipe; that vocabulary already exists. |
| **Card grids for record lists** | Our own 3-up 300 × 320px admin grid | Measured cost: 352px of pitch per three records, six of ten visible. A grid is for browsing by image; an admin is scanning by title. |
| **Rounded corners and drop shadows on rows** | Statamic (12px menu radius), Ghost (VV-S, ~6px panels) | Zero radius and zero shadow are stated rules of this system, not defaults left unset. |
| **Hover-only row actions** | WordPress (MM) | Even the best implementation found still charges every row 19.9px to hide them. See Question 3. |
| **Inline text links as action targets** | WordPress `Edit \| Quick Edit \| Trash \| View` (MM: 19.9px block height) | Below the 24 × 24px SC 2.5.8 minimum (TV). |
| **`window.confirm`** | Our own code, both lists | Unstyleable browser chrome, OK / Cancel labels, and no identification of the record — all three of NN/g's named failure modes at once (TV). |
| **A four-band header** | Grafana (VV: title, dek, search, filters, column head) | ~200px of chrome before the first record on a 900px screen. |
| **Skeleton loaders** | Common everywhere | Rejected for the public pages on thesis grounds, and rejected again here on evidence grounds: sub-1s fetches sit inside NN/g's "no feedback required" band (TV). |
| **`--color-error` as a danger signal** | Our own `.dangerButton`, `.error`, `.limitBadge`, `.publicLimitWarning` | **Measured: 3.69:1 (fails AA) and 5° of hue from the page ground.** It reads as a third accent, not as a warning. |
| **Icon-only row controls** | Statamic's `…` (MM) | Correct for a daily-use CP; wrong for an intermittently-used five-section admin, and tooltips would re-open SC 1.4.13 (TV). |
| **The blurred full-bleed photograph** | Our own, five copies | Five hand-tuned duplicates of one filter chain — precisely the drift the token contract was created to end. |

---

## Idea Scoring

1–5, as in `archive-rows.md`. Performance and implementation are cost scales (5 = cheap).

| Idea | Brand fit | Audience fit | Usability | Task value | Distinctive | A11y | Perf cost | Impl cost |
|---|---|---|---|---|---|---|---|---|
| 80px ruled row replacing the 320px card grid | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 3 |
| Actions always visible at rest (Statamic) | 5 | 5 | 5 | 5 | 3 | 5 | 5 | 5 |
| `--control-min` 40px hit areas | 5 | 5 | 5 | 4 | 2 | 5 | 5 | 5 |
| 56px square thumbnail sized to the text block | 5 | 5 | 4 | 4 | 4 | 5 | 3 | 2 |
| Compose the existing `ContentArchiveLayout` header | 5 | 5 | 5 | 4 | 3 | 5 | 5 | 3 |
| Named confirmation dialog replacing `window.confirm` | 5 | 5 | 5 | 5 | 3 | 4 | 5 | 2 |
| `--hairline-strong` for control boundaries | 5 | 4 | 5 | 3 | 5 | 5 | 5 | 5 |
| Delete the blurred background + `glassOverlay` | 5 | 4 | 4 | 3 | 3 | 4 | 5 | 5 |
| Status dot instead of a status badge | 5 | 4 | 4 | 4 | 4 | 3 | 5 | 4 |
| `--fs-h2` page heading instead of `--fs-page` | 5 | 5 | 4 | 4 | 2 | 5 | 5 | 5 |
| Hairline-grouped overflow menu (Statamic) | 4 | 3 | 3 | 3 | 3 | 3 | 5 | 3 |
| A new `--danger` hue | 3 | 5 | 5 | 5 | 2 | 5 | 5 | 4 |
| Soft-delete + undo instead of confirmation | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 1 |
| Inverting to a light admin (Statamic / WordPress model) | 1 | 3 | 4 | 3 | 1 | 4 | 5 | 1 |
| Hover-revealed row actions | 3 | 2 | 2 | 2 | 2 | 2 | 4 | 4 |

The two lowest rows are there to be visible as rejections, not as options.

---

## Rejected Ideas

| Idea | Source | Why rejected |
|---|---|---|
| Light content panels on dark chrome | Statamic (MM), WordPress (VV) | Would abandon `--surface-0` and the three ink tiers across five pages. See Question 7. |
| A list / grid view toggle | Statamic assets (VV) | `archive-rows.md` already settled this: a toggle is honest only when the modes carry different information. Both of ours would show the same fields. |
| Author chips / status pills | Statamic (VV) | Filled radiused surfaces in a system with no surfaces. |
| Sequential row numbering | — | Rejected once already in `archive-rows.md` for the public archive; the arguments (numbers restart per page, imply a rank the content does not have) are unchanged. |
| Zebra striping | Statamic (VV) | Needs a second background tint; `--surface-1` is already spoken for as the hover ground, and a third ground would be a new token serving decoration. |
| A checkbox / bulk-select column | Statamic (VV), WordPress (VV) | Justified at hundreds of records. At a page size of 10 across five small collections it spends ~47px of every row on an operation nobody has asked for. Revisit if bulk publish / delete is ever requested. |
| A per-row `…` overflow menu | Statamic (MM) | Two actions do not need a menu. A menu adds a popup surface, focus management and a second click to reach Delete. |
| Sortable column headers | Statamic, WordPress (VV) | Implies a table; the row is a grid of unlike parts, not a table of like cells. `createdAt desc` is the only order an editorial admin needs. |
| `--color-error` for danger | our code | **Measured 3.69:1 (below AA) and 5° of hue from the ground.** |
| Skeleton rows during fetch | common | Sub-1s fetch; NN/g's no-feedback band (TV). |
| Page-level loading overlay | — | Blocks the controls the admin needs in order to retry. Busy states belong on the control that is busy. |
| `translateY(-2px)` hover lift on nav cards | our `AdminLanding` | Displacement on a working surface, and the public system's only lift is already a documented exception. |
| A dedicated admin font or type scale | — | The scale in `editorialTokens.module.css` covers every role found. A second scale is a second system. |

---

## Guidance for the UI Design Director

**Settled by evidence — implement these.**

1. One row, 80px, `3.5rem / 1fr / auto`, hairline-separated, `--surface-1` on hover, used by the
   blogs list, the recipes list and the classes *sessions* list. It replaces both duplicated
   `.adminCard` blocks.
2. Actions visible at rest on every row, labelled in words, ≥ 40px hit area, Delete last and one ink
   tier down.
3. Two header bands, composed from the archive header this repo already owns, heading at `--fs-h2`.
4. No blurred photograph, no `glassOverlay`, no `backdrop-filter`, no radius, no shadow, no
   `brightness()` hover, on any admin surface.
5. No skeletons; the empty state reuses `.emptyMessage` **and keeps the control band mounted above
   it**; write failures are assertive and anchored to their control.
6. `--color-error` is retired from the admin. If a danger colour is wanted, it is a new token near
   0–2° clearing 4.5:1.

**Yours to decide — I have deliberately not settled these.**

1. Whether the primary create action sits beside the title (WordPress) or at the far trailing edge
   (Statamic) on a 1200px spine.
2. Whether to compose `ContentArchiveLayout.module.css` directly or extract a shared shell first.
3. Whether the `/admin` landing is a 1-col ruled list or a 2-col ruled arrangement.
4. Whether the grain layer belongs on a frequently re-rendered working surface.
5. Whether `/admin/login` keeps its photograph.
6. The exact `--danger` hue, and whether the system takes one at all.

**Do not let these be discovered in implementation.**

- The **classes photo album must stay a grid**; it is the highest-risk surface and is not specced
  here. Its drag handle is a permanently-visible ≥ 24px control and needs a keyboard path.
- The **newsletter preview iframe is white and will stay white.** Frame it; do not fight it.
- The **blogs list cannot render a thumbnail today** — see below.

---

## Boundary Gaps Reported to the Orchestrator

Found during research, outside this specialist's boundary, not acted on.

1. **`AdminBlogList.module.css` ships invalid CSS.** `.adminPageBg::before` declares `top: -10;` and
   `left: -10;` — unitless non-zero lengths, which are invalid and silently dropped, so that layer
   has never been offset as intended. It is scheduled for deletion under this direction, but the bug
   should be recorded rather than quietly overwritten. *Owner: Frontend UI Agent.*
2. **The admin thumbnail has a data-path dependency.** `Blog.coverPhoto` and
   `CocktailRecipe.coverPhoto` exist on the Prisma model, and `/api/blogs` returns the record, but it
   returns the **S3 key, not a signed URL** (`src/app/api/blogs/route.ts`: *"Only return S3 keys for
   coverPhoto; signed URLs are fetched on-demand by the frontend"*). The public archive solves this
   by server-signing in `src/app/(pages)/blogs/page.tsx` via `services/media/signedImageService`; the
   admin lists are **client components that `fetch` the API directly**, so they have no such path.
   Rendering 10 thumbnails per page needs either a server-component wrapper or a batch-signing
   route. Additionally, `AdminBlogList.tsx`'s local `Blog` interface omits `coverPhoto` entirely.
   *Owners: Frontend API and Logic Agent, Backend API Agent, Architecture Agent.*
3. **Hard delete with no undo.** `DELETE /api/blogs/:id` destroys the record. WordPress's actual
   answer to destructive safety (MM) is reversibility, not a dialog. A soft-delete column would be an
   expand-and-contract schema change. *Owners: Backend Data Agent, Backend API Agent.*
4. **`AdminRecipeList.module.css` contains dead duplicated rules.** `.title`, `.author`, `.actions`
   and `.error` are each declared twice, and its `.adminCard` block duplicates
   `AdminBlogList.module.css` almost verbatim. *Owners: Frontend UI Agent, Quality Agent.*
5. **`--color-error` is used as a danger signal in at least five places** — `.dangerButton`,
   `.limitBadge`, `.publicLimitWarning` (all `AdminClassManager.module.css`) and `.error` in both
   list modules — and it measures 3.69:1 against `--surface-0`, below WCAG AA. Any fix must reach all
   of them, not only the ones this redesign happens to touch. *Owner: whoever the Orchestrator
   assigns the admin CSS boundary to.*
6. **`AdminBlogList.tsx` renders each record as `<div role="button" tabIndex={0}>` with two real
   `<button>`s nested inside**, and relies on `e.target.closest("button")` to suppress the outer
   handler. Interactive controls nested inside an interactive control is invalid and produces an
   ambiguous tab order. The row anatomy proposed here assumes the title is the link and the actions
   are siblings, not descendants. **Already converging:** a sibling specialist has introduced
   `src/components/admin/admin.types.ts`, whose header identifies this same
   `<div role="button">`-containing-`<button>` problem and shapes its contract around it. The
   `role="button"` is still present in both list components at the time of writing, so the gap is
   real, but it is **already owned** - do not route it twice. *Owner: Architecture Agent (contract),
   Frontend UI Agent (markup).*
