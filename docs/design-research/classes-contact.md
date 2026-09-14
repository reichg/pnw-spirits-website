# Design Research — Classes & Contact (`/classes`, `/contact`)

Prepared by: Design Researcher Agent
Date: 2026-09-14
Consumer: UI Design Director Agent (then Frontend UI Agent)

---

## Project Understanding

**Product.** The PNW Spirits — a Pacific Northwest craft-cocktail brand site (Next.js 16 App
Router, React 19, CSS Modules, TypeScript 6, Vitest 4). Editorial content (blogs, recipes,
videos) already runs on a shipped, heavily-documented visual system whose thesis is
**"warm-dark editorial; the photograph is the card."**

**The established system, restated from the source files rather than from memory.**
`src/components/ui/editorialTokens.module.css` is the single declaration site: warm near-black
ground `--surface-0: #15100d`, one warm off-white ink at three opacities (hierarchy is carried
by opacity, never by weight — 600 is the stated ceiling), copper `--rule-accent` for structural
rules and *never* for text, gold `--color-accent-gold` for accent text and for the one filled
CTA, a fluid type scale, a six-rung spacing scale, a 1200px left spine, ~1kB inline film grain
at 0.035, and `--ease-out-soft` motion. `ContentLandingLayout.module.css` composes those into a
shell: asymmetric left-aligned header (eyebrow → 18ch heading → 48ch lede) closed by a **copper
rule**, a 3-up grid, an `.emptyMessage` lede, and a close of **hairline + gold CTA**.
`ContentDetailShell.module.css` adds the two-up masthead (title block left, byline block flush
right, both landing on the copper rule) and re-uses that same close byte-for-byte, explicitly so
that "a reader who arrives here from one of them leaves by the same door."

**The work.** Two pages are still on the pre-system language — a blurred full-bleed photo
backdrop at `brightness(0.2)`, centred `em`-based type, translucent brown panels, `--shadow-md`
everywhere, and (on `/contact`) a **cream** panel. They must be brought into the editorial
system, extending it rather than replacing it.

| Route | Files | Current composition |
|---|---|---|
| `/classes` | `src/app/(pages)/classes/page.tsx`, `ClassesPage.module.css`, `src/components/Class/ClassSessions.tsx` + `.module.css`, `src/components/Class/PhotoAlbum.tsx` + `.module.css` | Centred column on blurred `Vermouth.jpg`. Gold `2.4em` h1 → 70ch centred intro → brown "Hire The PNW Spirits" button → "Upcoming Sessions" (auto-fill card grid → modal) → "From Past Classes" (Swiper carousel → lightbox) |
| `/contact` | `src/app/(pages)/contact/page.tsx`, `ContactPage.module.css`, `ContactForm.tsx` + `.module.css`, `useContactForm.ts` | Centred column on blurred `Bottles.jpg`. Three stacked 760px panels: a translucent-brown "Get In Touch / Contact" card with a large mailto; a translucent-brown "Send a message" form; a **cream** "Check out my channels" panel with three round white social icon buttons |

**Audience and conversion goal.** These two pages are the only *transactional* surfaces on a
site that is otherwise editorial. `/classes` answers "is there a date I can come to, and is this
any good?" `/contact` answers "how do I hire you?" The single conversion objective across both
is **an inbound enquiry** — and the two pages are already wired to each other: the `/classes`
CTA points at `/contact`, and `ContactForm`'s category default is `CONTACT_CATEGORIES[0]`, which
is `"hire_event"` → *"Hire for an event"*. The pages are one funnel that currently looks like
two unrelated sites.

**Constraints (from the work order and from the repo).** Warm-dark ground; existing token
vocabulary wherever possible; no new npm dependencies; no changes to `globals.css` or
`LandingPage.module.css`; CSS Modules only; `prefers-reduced-motion` honoured; admin-editable
content that can be empty.

---

## The Two Structural Facts That Govern Everything Below

I found these before I looked at a single reference, and they eliminate more candidate
compositions than any reference does. Both are read directly out of the repo.

### Fact 1 — a session is a date, not a thing

`prisma/schema.prisma`, `model ClassSession`:

```
startTime DateTime
endTime   DateTime?
location  String?
```

That is the whole record. A session has **no title, no description, no image, and no
destination of its own**. There is exactly one `CocktailClass` (a singleton, per
`classService.ts`: *"The public /classes page is a SINGLETON: one title + one description plus a
list of upcoming sessions"*), so every session is **the same class on a different night**.

Three consequences, all of them load-bearing:

1. **The current card grid is asserting something untrue.** A grid of cards says "here are N
   different offerings, pick one." The page has one offering and N dates. Four cards that are
   identical except for a date read as four products.
2. **The session modal adds nothing.** `ClassSessions.tsx` renders `date / time / location` on
   the card and then `dateFormatter / timeFormatter / location` in the modal — the same three
   values, larger. It is a zero-information interaction that costs a click, a focus trap, and a
   client component.
3. **`ContentCard` and `ContentRow` cannot be reused for a session.** `ContentItem`
   (`content.types.ts`) requires `title`, `media` and `link`. A session has none of the three,
   and there is no honest value to synthesise for any of them. Any attempt to force it would
   mean inventing a fake title ("Cocktail Class"— repeated N times), a fake image (the same
   photo N times), and a fake link.

### Fact 2 — the gallery is the only place on `/classes` where the system's thesis can operate

"The photograph is the card" needs photographs. The session list has none. The past-class album
is therefore not a decorative afterthought on this page — **it is the only element carrying the
brand's primary visual argument**, and it is currently the most system-foreign thing on the
site: `border-radius: var(--radius-md)`, `1px solid var(--color-border-dark)`,
`box-shadow: var(--shadow-md)`, `object-fit: contain`, a `4 / 3` frame, a `scale(1.04)` hover,
and a full-carousel `rgba(0,0,0,0.582)` + `blur(3px)` overlay carrying an animated martini glass
— shown **at every breakpoint**, including desktop, where there is no swipe.

`ContentCard.module.css` states the countervailing rule in as many words: *"There is no card
surface: no background, no border, no radius and no shadow."* And on its own resting veil:
*"Nothing on this card is legible only while the veil is drawn."* The swipe overlay is a veil
that permanently dims the photographs while carrying content **on top of them**, which is the
one thing that file forbids.

---

## Design Territory

Five characteristics guided the search. They extend the shipped set (*editorial, warm-dark,
tactile, restrained, quick*) rather than opening a new one:

1. **Calendrical** — the page's job on `/classes` is to make a date feel like an occasion
   without dressing it as a product.
2. **Hospitable** — `/contact` must read as an invitation, not a support ticket. The register is
   a restaurant, not a helpdesk.
3. **Ruled** — structure carried by hairlines, copper and alignment rather than by panels. This
   is the single biggest departure from both pages as they stand.
4. **Ranked** — on both pages three things currently have equal visual weight and shouldn't.
   Establishing rank *is* the design work here.
5. **Graceful when empty** — an empty schedule is a frequent, ordinary state on this site, not
   an edge case, and it must be composed rather than patched.

---

## Research Limitations

**Browser tooling was available and was used.** Playwright 1.61.0 is a pinned devDependency;
Chromium **149.0.7827.55** launched successfully. Every reference carried forward below was
loaded in headless Chromium at **1440 × 900** (deviceScaleFactor 0.65 for capture), screenshots
were captured and **visually inspected by me**, and for the strongest references geometry was
**read out of the live DOM** via `getBoundingClientRect` / `getComputedStyle` rather than
estimated. Four references were re-loaded on a **Pixel 7** profile with touch enabled.

Classification used throughout, matching `archive-rows.md` and `admin-portal.md`:

- **VV — Visually Verified.** Directly observed by me in a rendered screenshot.
- **MM — Measured.** Read out of the live DOM.
- **TV — Textually Verified.** Supported by written material or by this repo's own recorded
  measurements, not seen by me.
- **INF — Inference.** My design interpretation, not evidence.
- **CALC — Computed.** Arithmetic I performed here (contrast, `ch` resolution), shown so it can
  be checked.

### Access log — every URL attempted, and what actually happened

| URL | Outcome |
|---|---|
| `barbican.org.uk/whats-on` | **Loaded, measured, mobile-checked.** Carried forward. |
| `pioneerworks.org/programs` | **Loaded, measured.** Carried forward. |
| `somersethouse.org.uk/whats-on` | **Loaded, inspected at two scroll depths.** Carried forward. |
| `roughtrade.com/en-gb/events` | **Loaded, inspected.** Carried forward (VV only — my measurement selectors missed; see below). |
| `noma.dk/contact/` | **Loaded, measured, mobile-checked.** Carried forward — the strongest single reference for the form. |
| `linear.app/contact/sales` | **Loaded, measured.** Carried forward. |
| `humaan.com/contact` | **Loaded, measured, mobile-checked.** Carried forward. |
| `acehotel.com/contact/` | **Loaded, inspected.** Carried forward. |
| `basicagency.com/contact` | **Loaded, inspected.** Carried forward. |
| `instrument.com/contact` | **Loaded, inspected at three scroll depths.** Carried forward. |
| `pentagram.com/contact` | **Loaded, inspected.** Carried forward as counter-evidence. |
| `punchdrink.com/` and `punchdrink.com/?s=<gibberish>` | **Loaded, inspected.** Carried forward for the empty state. |
| `eventbrite.com/d/wa--seattle/<gibberish>/` | **Loaded, inspected.** Carried forward for the empty state. |
| `sohohouse.com/en-us/contact-us` | **Loaded, inspected.** Carried forward as a form variant. |
| `stripe.com/contact/sales` | Loaded and inspected. **Dropped** — a three-step progressive-disclosure stepper solving a lead-qualification problem we do not have. |
| `exploretock.com/` | Loaded and inspected. **Dropped** — marketplace chrome, nothing transferable. |
| `deathandcompany.com/` | Loaded and inspected. **Dropped** — the landing page is a single full-bleed autoplaying hero; I could not reach a schedule surface. |
| `locomotive.ca/en/contact` | Loaded and inspected. **Dropped** — a click-to-start WebGL toy. Zero transferable contact-page structure. |
| `sipsmith.com/pages/distillery-tours` | **Age gate not defeated** across three attempts (typed DOB, keyboard Enter, direct click on ENTER — the field validated as empty). I could see, partially occluded behind the gate, a horizontal experience row carrying title → subtitle → a calendar-icon dateline (`Sep 23, Oct 21`) → dek → duration (`3 hours`) → `From £90` → `BOOK NOW`. **I am recording that as VV-partial and using it for nothing load-bearing**, because I never saw the full row uncropped. |
| `angelsenvy.com/us/en/tours-experiences/` | **Age gate, not defeated.** Dropped. |
| `brooklynbrewery.com/visit-us/` | **Age gate, not defeated.** Dropped. |
| `talesofthecocktail.org/events/` | **Age gate, not defeated.** Dropped. |
| `177milkstreet.com/cooking-school` | Loaded but fully occluded by a subscription interstitial + cookie wall. Dropped. |
| `dandelionchocolate.com/classes/` | Loaded but fully occluded by a newsletter interstitial. Dropped. |
| `moma.org/calendar/` | Cloudflare interstitial ("Just a moment…"). Dropped. |
| `roughtrade.com/en-gb/events?venue=<gibberish>` | **HTTP 403 Cloudflare.** My attempt to observe a real empty event list failed; see the gap note below. |
| `acehotel.com/calendar/` | **HTTP 404.** Dropped. |
| `leiths.com/cookery-courses` | **HTTP 404.** Dropped. |
| `westwardwhiskey.com/pages/visit` | **HTTP 404.** Dropped — this was my one attempt at a direct PNW peer and it failed. |

### Honest gaps, stated rather than papered over

- **The alcohol industry is materially under-represented in this brief, and that is not a
  choice.** Four of the five distillery/brewery/cocktail-institution references I selected sat
  behind age gates that headless Chromium could not pass, and the one direct Pacific Northwest
  peer 404'd. The transferable evidence below therefore comes disproportionately from arts
  venues, record shops, restaurants and design studios. I judged that acceptable because the
  *problems* — a dated schedule, a designed contact form, a dignified empty state — are
  structurally identical across those sectors, and because `archive-rows.md` already banked the
  drinks-industry evidence (Difford's Guide, PUNCH, Imbibe) that this page's *card and prose*
  decisions rest on. But a reader of this doc should know the sampling is skewed.
- **No hover or focus state was captured as a rendered still.** Every interaction
  recommendation below is marked INF unless a resting affordance was visible.
- **I never observed a real, in-the-wild "no upcoming events" schedule.** Rough Trade's filtered
  empty list 403'd. The two empty states I did observe (PUNCH search, Eventbrite search) are
  *search* empties, not *schedule* empties, and the difference matters: a search empty is the
  reader's fault and a schedule empty is the business's. I have flagged where I am extrapolating
  across that gap.
- **Rough Trade's text stack is VV, not MM** — my selectors did not resolve against its markup
  and I did not re-run. The type sizes I attribute to it are read off the screenshot, so I give
  no numbers for it.
- Screenshots were written to the session scratchpad
  (`…/scratchpad/shots/`), which is temporary and **is not committed**. They are not available
  to the Director as artefacts; this document is the durable record.

---

## Candidate References

Thirteen references are carried forward, in three groups. The split is deliberate: the single
most useful finding is that **"a schedule" and "a designed contact page" are each two distinct
species**, and choosing between the species matters far more than any surface detail.

**Group A — dated schedules (`/classes`).**

| Site | Why chosen |
|---|---|
| **Barbican — `/whats-on`** | The most disciplined date-grouped event index found, and fully measurable. |
| **Pioneer Works — `/programs`** | The date used as the *kicker*, over a surfaceless image grid. The closest structural analogue to this repo's own `ContentCard`. |
| **Somerset House — `/whats-on`** | The opposite convention: the date is the *last* line. Kept precisely because it contradicts Pioneer Works. |
| **Rough Trade — `/events`** | The tightest four-line event text stack: title → date/time → price → venue. |

**Group B — designed contact pages (`/contact`).**

| Site | Why chosen |
|---|---|
| **noma — `/contact`** | The strongest reference in the entire brief. A completely surfaceless form: bare underlined fields, paired columns, a select marked only by a chevron, a boxed textarea, a ghost submit. |
| **Linear — `/contact/sales`** | The same problem solved **on a dark ground**, with the direct-email escape hatch placed beside the submit. |
| **Humaan — `/contact`** | The ranking answer: headline → one CTA → quiet email directory → socials as a footer note. |
| **Ace Hotel — `/contact`** | A hospitality brand, independently arriving at bare underlined fields and a paired first row. |
| **Basic/Dept — `/contact`** | Contact as a routed email *directory*, with no form above the fold. |
| **Instrument — `/contact`** | Reason-for-contact as three top-level routes instead of a form field. |
| **Pentagram — `/contact`** | Counter-evidence: a contact page with **no form at all**. |
| **Soho House — `/contact-us`** | A form-as-single-ruled-table variant of the noma thesis. |

**Group C — empty states.**

| Site | Why chosen |
|---|---|
| **PUNCH — no-results** | States absence in one sentence and keeps every piece of page furniture. |
| **Eventbrite — no-results** | States absence and immediately offers an alternative path. |

---

## Reference Extraction Matrix

| Reference | What it is | Evidence | The specific transferable move | Applies to | Confidence |
|---|---|---|---|---|---|
| **Barbican /whats-on** | Arts-centre event index | MM | Events are grouped under a **date heading** set at **21.25px / 26.56px, weight 700, spanning the full 983px container, `margin: 34px 0 17px`** — i.e. a *quiet marker*, roughly 1.25× body, not a display size. | `/classes` | Measured |
| **Barbican /whats-on** | — | MM | Row = 983 × **224px**, media **280 × 224px = 28.5% of container** at a 5:4 crop (`aspect-ratio: 582/466`), text starting at x=356. Row pitch 243px → **~4.5 rows per 1000px viewport.** | `/classes` | Measured |
| **Barbican /whats-on** | — | MM | The time is a **separate line under the title at 17px / 22.1px in `rgb(89,89,89)`** — a dimmed tier, never the title's tier. | `/classes` | Measured |
| **Barbican /whats-on** | — | MM | A per-row **"More info" button, 131 × 47px, right-aligned at x=898** inside the row. | `/classes` | Measured — and **rejected** below |
| **Barbican /whats-on** | — | VV (390px) | On mobile the date heading survives intact above the rows; the rows shed the media and keep kicker → title → time. | `/classes` | Observed |
| **Pioneer Works /programs** | Arts venue programme index | VV + MM | **The date is the kicker.** `PROGRAM   TUESDAY, SEP 15, 2026` in small tracked caps sits *directly under the image and above the title*. Titles measure **36px / 39.6px (lh 1.10) at weight 400**; images are **323px wide in a 4-up on a 1380px container**. No card surface whatsoever — image on white, text under it. | `/classes` | Measured |
| **Pioneer Works /programs** | — | MM | Image heights are **ragged (200 / 181 / 181px)** — no fixed ratio — so the text baselines across a row do not align. | `/classes` | Measured — **counter-evidence**; this repo's fixed `--card-media-ratio` is the better answer and the ragged row is what it prevents |
| **Somerset House /whats-on** | Arts centre what's-on | VV | The **date range is the last line of the card**, after the dek, in a quiet ink: title → dek → `30 Jul–1 Nov 2026`. Categories are pill tags above the title. | `/classes` | Observed |
| **Rough Trade /events** | Record-shop gig listings | VV | A four-line stack under each image: **title (bold) → date + time → price → venue**, each on its own line, each a step quieter than the last. No separators, no icons. | `/classes` | Observed |
| **noma /contact** | Restaurant enquiry form | MM | **Every single-line field is a bare rule**: `border-width: 0 0 1px`, no background, no radius, no padding, text at 15px / 27px. The label sits **above** at 18px / 32.4px in the same ink as the field text. | `/contact` | Measured |
| **noma /contact** | — | MM | **Fields are paired**: `Your name` and `Your email` at **385px each, x = 320 and x = 735** (a 30px gutter, 800px total) on a 1360px form container — i.e. the form occupies **59% of the container**. | `/contact` | Measured |
| **noma /contact** | — | MM | **The textarea is the only boxed field**: `border-width: 1px` on all four sides at **800 × 272px**, spanning both columns, while every input is `0 0 1px`. | `/contact` | Measured |
| **noma /contact** | — | MM | The `<select>` gets **exactly one distinguishing mark**: a chevron. Same 385px width, same bare `0 0 1px` rule, same ink. Nothing else — no second border weight, no fill, no glow. | `/contact` | Measured |
| **noma /contact** | — | MM | Submit is a **ghost button**: 148 × 36px, `background: transparent`, `border: 1px`, **`border-radius: 0`**, `padding: 0 44px`, left-aligned on the form's own left edge (x = 320, identical to the first field). | `/contact` | Measured |
| **noma /contact** | — | VV (390px) | The pairs collapse to one column, labels stay above, underlines stay bare, the textarea keeps its box. | `/contact` | Observed |
| **Linear /contact/sales** | Dark-ground sales contact | MM | **Two-up separated by a vertical hairline**: left = h1 at **48px / 48px, weight 510** + a three-item benefit list + a small escape hatch; right = the form at **607px, x = 753** (42% of 1440). | `/contact` | Measured |
| **Linear /contact/sales** | — | MM | **The direct-email escape hatch sits inline beside the submit**: `Send message` (134 × 44px, 13px, pill radius) with *"You can also email us at sales@linear.app"* on the same line to its right. | `/contact` | Measured |
| **Linear /contact/sales** | — | MM | Labels at **14px / 21px weight 400 in `rgb(138,143,152)`** — a dim tier, above the field. Fields 40px tall on `rgba(255,255,255,0.05)` with a `1px rgba(255,255,255,0.05)` border and 8px radius. | `/contact` | Measured — the *rank* transfers, the *surface* does not |
| **Humaan /contact** | Studio contact | MM | The page is **headline → one CTA → directory → footnote**, in that order and nothing else. h1 at **100px / 100px, weight 500, `max-width: 623px`**; email links at **17px / 26px at 0.7 ink alpha**; socials on a hairline footer row at the far right. | `/contact` | Measured |
| **Humaan /contact** | — | MM | **Social links are plain text, not icons** — `Twitter X · Instagram · LinkedIn` at the same 17px, at the far right of a hairline rule, with no circles, no fills and no hover chrome. | `/contact` | Measured |
| **Ace Hotel /contact** | Hotel group contact | VV | Independently arrives at **bare underlined fields** on a warm ground; `Name` is a **group label over a paired First/Last row**; the select `Who do you wish to contact?` is marked only by a chevron. | `/contact` | Observed |
| **Basic/Dept /contact** | Agency contact | VV | Contact as a **routed email directory**: `NEW BUSINESS / biz@…`, `PRESS / press@…`, `JOIN US / recruitment@…`. No form above the fold at all. | `/contact` | Observed |
| **Instrument /contact** | Agency contact | VV | Reason-for-contact is **three top-level route buttons** (`START A PROJECT` / `PRESS & MEDIA` / `WRITE US A NOTE`) sitting on a hairline under the display title — **not** a field inside a form. | `/contact` | Observed |
| **Pentagram /contact** | Design-studio contact | VV | `Contact` as a plain heading over a grid of **office photographs and addresses. There is no form.** | `/contact` | Observed — counter-evidence on rank |
| **Soho House /contact-us** | Hospitality enquiry | VV | The form is **one bordered block subdivided by internal hairlines** — rules-not-boxes, wrapped in a single outer frame — with floating labels inside each cell and the message cell largest. | `/contact` | Observed |
| **PUNCH no-results** | Drinks magazine | VV | The empty state is **one sentence at body size in the content column** — *"No results were found for …"* — and **every piece of page furniture stays**: the filters rail, the rules, the pagination. No illustration, no panel, no apology. | both | Observed |
| **Eventbrite no-results** | Event marketplace | VV | *"Nothing matched your search, but you might like these options."* — the empty state **states the absence and immediately offers an alternative path**, then renders that path as real content. | `/classes` | Observed |

---

## Contrast Arithmetic That Constrains Both Pages

Every figure below is **CALC** — I composited each alpha against the ground and computed
relative luminance on the result, the same method `editorialTokens.module.css` records. My
numbers reproduce that file's to within rounding (it records ink-1 13.57 / ink-2 7.38 / ink-3
5.43; I get 13.51 / 7.38 / 5.41), which is a useful cross-check that the token file is accurate.

| Pair | Ratio | Consequence |
|---|---|---|
| `--color-accent-gold` #e2b07e on `--surface-0` | **9.66 : 1** | Gold text and the gold-filled CTA are unconstrained. (The token file records "about 9.1" — same conclusion.) |
| `--surface-0` on a gold fill | **9.66 : 1** | `.viewAllButton`'s label is safe. |
| ink @ 0.92 (`--ink-1`) | 13.51 : 1 | — |
| ink @ 0.66 (`--ink-2`) | 7.38 : 1 | — |
| ink @ 0.55 (`--ink-3`) | **5.41 : 1** | The quietest legal tier. |
| ink @ 0.45 | **4.02 : 1** | **Fails AA.** |
| ink @ 0.40 | 3.43 : 1 | Fails. |
| **`--hairline` (ink @ 0.14) vs the ground** | **1.43 : 1** | **See below — this is the most important number in this document.** |
| **`--rule-accent` (copper @ 0.8) vs the ground** | **3.59 : 1** | Passes WCAG 2.2 SC 1.4.11 (3:1 for non-text UI identification). |
| `--color-accent-copper` #b87333 as *text* on the ground | 4.98 : 1 | Consistent with the token file's rule that copper is never text at small sizes. |
| `--color-accent-secondary` #7c5c3e (the current `/classes` CTA fill) on the ground | **3.11 : 1** | Near-zero figure/ground separation, exactly as `ContentLandingLayout.module.css` already asserts about this very button. |

### The finding that decides the form

**A form field whose only boundary is `--hairline` fails WCAG 2.2 SC 1.4.11 at 1.43 : 1.**

SC 1.4.11 requires 3:1 for "visual information required to identify user interface components
and states." A bare underlined input's underline *is* its boundary — it is the only thing
saying "an input is here." `--hairline` is a **decorative separator** colour, derived for
dividing rows of text, and it is 1.43:1. `--rule-accent` is **3.59:1** and passes.

So: **the noma/Ace bare-underline field is exactly right for this system, and the rule must be
copper, not hairline.** This is a very satisfying fit rather than a compromise — it gives copper
a second structural job alongside opening every page, keeps gold reserved for accent text and
the one CTA, and means the form is drawn in the site's own two structural colours and nothing
else.

**Corollary: no placeholder text anywhere in the form.** There is no ink tier below `--ink-3`
that clears AA (0.45 → 4.02:1), so a placeholder would have to be set at the *same* tier as its
own label and would compete with it. Both noma and Ace run placeholder-free. (Disabled controls
are exempt from 1.4.3 as inactive UI components, so the current `opacity: 0.6` is not a defect —
but see the sending-state note below for why I still recommend changing it.)

---

## Recommended Composition — `/classes`

### 1. The top of the page

**Reuse `ContentLandingLayout`'s `.header` composition verbatim.** Eyebrow (gold, `--fs-eyebrow`,
0.14em tracked caps) → `.heading` (`--fs-page`, 18ch cap, `--ink-1`) → `.intro` (`--fs-lede`,
48ch, `--ink-2`) → **copper rule**. The DB's `cocktailClass.title` takes the heading slot and
`cocktailClass.description` takes the lede slot.

Why this and not a hero: `/classes` is reached from the nav by someone who already knows what
the brand is. The landing header is this system's stated answer to "open a page," it is
asymmetric by design (right side deliberately empty), and it ends on the copper rule that
"announces the row and states the container width." Using it means `/classes` opens on the same
mark as `/recipes-landing` and `/blogs-landing` — which is the entire argument for having a
system.

Two content risks, flagged for the Director rather than solved here:

- `CocktailClass.description` is an uncapped `String` in the schema with no length limit in
  `classSchemas`. A long admin paragraph set at `--fs-lede` / 48ch will produce a ten-line lede
  where the system expects two or three. If that is a real risk, the honest answer is the
  `--fs-prose` / `--measure-prose` pair the detail pages already use for continuous reading —
  but that is a call about the lede's *role*, which belongs to the Director.
- There is no eyebrow in the data. It has to be a static string on the page (as it is on all
  three landing pages).

### 2. The session schedule — three structures considered, one recommended

I evaluated three and am recommending the third.

**(A) The card grid — the current structure. Rejected.**
A card asserts a distinct object with its own identity and its own destination. Fact 1 says
there is one offering and N dates. Beyond the semantic problem, `ContentCard` cannot be reused
(no `title`, no `media`, no `link`), so keeping a grid means authoring a **second card
vocabulary** — with a background, a border, a radius and a shadow — inside a system whose thesis
is that there is no card surface. That is the exact drift `editorialTokens.module.css` exists to
prevent.

**(B) Date-grouped rows — the Barbican structure. Rejected here, for a reason specific to this
data.**
Barbican's date grouping is excellent and fully measured above: `Mon 14 Sep` at 21.25px/700
spanning the container, then 4–5 rows beneath it. But grouping earns its keep only when **many
events share a day**. This class runs at most one session per day. Every group would contain
exactly one row, and the group heading would be a heading whose only child repeats it. The
structure would cost one extra line and one extra type role per session and buy nothing.

**(C) A dated index list — the date *is* the row. Recommended.**

One `<li>` per session, each opening on a hairline, with no media and no card. The anatomy:

| Slot | Content | Token | Rationale |
|---|---|---|---|
| Primary line, left | `Sat, October 11, 2026` (the existing `dateFormatter` output) | `--fs-card` (18 → 22px), weight 600, `--ink-1` | The date is the only thing the reader is here for, so it takes the card-title role — the same rank a recipe title takes on a landing page. |
| Secondary line, left | `6:00 PM – 8:30 PM`, as two `<time>` elements | `--fs-meta` (13 → 14px), 0.06em tracked caps, `--ink-3` (5.41:1) | This is `.meta`'s exact role from `ContentDetailShell`. Barbican independently puts its time on a separate, dimmer line (17px in `rgb(89,89,89)`). |
| Right track | `location`, when present | `--fs-meta`, 0.06em tracked caps, `--ink-3`, flush right | See the alignment question below. |
| Separator | `border-top: 1px solid var(--hairline)` per row, `border-bottom` on the list | existing | Byte-identical to `ContentArchiveLayout`'s `.list` + `ContentRow` mechanism. A separator is *not* a UI-component boundary, so `--hairline`'s 1.43:1 is correct here and only here. |
| Row padding | `padding-block: var(--space-m)` | existing | Smaller than the archive row's `--space-l`, because this row is two short lines rather than a 160px plate. Estimated row height ≈ 24 + 22 + 8 + 18 + 24 ≈ **96px**; eight sessions ≈ 768px. INF — not rendered. |

**Why the date deserves the card-title rank.** Pioneer Works (MM) puts the date *above* the
title as a tracked-caps kicker; Somerset House (VV) puts the date *last*, after the dek; Rough
Trade (VV) puts it second, under the title. Three good sites, three different answers — because
on all three the date is **subordinate to a named event**. Here there is no named event. The
convention that transfers is not any of their placements but the principle underneath all
three: *the date sits at the rank of the information it is subordinate to.* When it is
subordinate to nothing, it is the title.

**The alignment question — and a recorded decision this touches.**

A one-line row with everything in the left 300px of a 1200px spine is the failure
`ContentDetailShell.module.css` records verbatim: *"the page rendered as two full-width rules
250px apart with a half-width paragraph between them, and read as a hole rather than as
asymmetry."* Something has to occupy the right of the spine, and the only honest candidate a
session carries is its `location`.

That means reusing the masthead's two-up — `grid-template-columns: minmax(0, 1fr)
fit-content(14rem)`, `column-gap: var(--col-gap)` — with the location in the right track as a
tracked-caps `--ink-3` block, i.e. exactly the `.meta` role.

**This requires the Director to amend a decision that is on record.** `ContentDetailShell`
states: *"Right alignment appears nowhere else in this system and is confined to this one block
on purpose."* I am not going to quietly break that. My argument for amending it is that the
justification given there transfers exactly: *"The byline is the only furniture that exists on
every article and every recipe … so it is the only candidate that can occupy the right of the
spine without inventing content."* The location is that candidate for a session row. The
amended wording would be *"confined to metadata blocks occupying the right edge the rules
declare"* — a rule with a reason rather than a count of one. **The Director owns this call.**

Two things to weigh against it:

- `location` is `String?`. When absent the track collapses and the row is left-weighted. If
  *no* session has a location, every row is left-weighted and the hole returns. INF: the
  hairlines still declare the width and the list still reads, but it is thinner. There is no
  reference in my set that resolves this, because every scheduled event in the wild has a venue.
- Below 900px the masthead's own breakpoint already converts the right-aligned column into a
  left-aligned horizontal strip with the `::before` hairline separators, and that mechanism is
  documented as correct at every width with no breakpoint tuning. It transfers for free.

**The alternative, if the Director declines the amendment:** put time and location on one
left-aligned meta line separated by the same `::before` hairline device (`Sat, October 11,
2026` / `6:00 PM – 8:30 PM · PORTLAND, OR`), and cap the schedule block's width rather than
releasing it to the spine. This keeps one scanning edge and one recorded decision intact, at the
cost of a composition that does not use the full spine the rules declare.

**Drop the modal.** It renders the same three values the row already shows. Removing it deletes
a `Modal` mount, a focus trap, a piece of client state and a click, and it converts
`ClassSessions` from a client component into plain markup. The only thing that would justify a
session modal is a session gaining content of its own (a price, a capacity, a per-session
description, a booking link) — which is a schema change, not a design decision. **Recorded as a
boundary gap, not proposed as scope.**

### 3. Where the hire CTA sits

**At the close, reusing `.viewAllRow` + `.viewAllButton` byte-for-byte.** Not at the top, where
it is today.

Four reasons:

1. **The system has exactly one conversion construct and it closes every page.**
   `ContentDetailShell` states the reason: *"a reader who arrives here from one of them leaves
   by the same door."* `/classes` is currently the one page with its own bespoke door.
2. **The current door is the wrong colour.** `--color-accent-secondary` #7c5c3e on the warm-dark
   ground is **3.11:1** (CALC) — and `ContentLandingLayout.module.css` already says so in
   writing about this exact button: *"the fill is gold rather than that page's brown, which has
   almost no figure/ground separation on the warm-dark ground."* Gold is 9.66:1.
3. **Sequencing.** "Hire us" is the ask you make *after* the schedule has shown the class is
   real and the gallery has shown it is good. Asking before showing anything is what the page
   does now.
4. **Humaan (MM) is the only reference in my set that puts its single CTA at the top** — and it
   can, because its page has no content below it to earn. Ours does.

**Except in the empty case, which inverts the argument.** With no sessions, the hire CTA is the
only thing the page can offer, and a reader should not have to scroll past two empty sections to
find it. The Eventbrite device (VV) is the answer: the empty message itself carries the
alternative path, as an **inline gold link** inside the sentence — not a second button. One
filled CTA per page stays true.

### 4. How the past-class gallery is framed

The gallery's job is to be evidence, and it currently reads as a photo dump because it is
dressed as a widget. Four changes, all of which *remove* rather than add:

| Change | From | To | Why |
|---|---|---|---|
| Surface | `border-radius: var(--radius-md)`, `1px solid var(--color-border-dark)`, `box-shadow: var(--shadow-md)` | none of the three | `ContentCard.module.css`: *"There is no card surface: no background, no border, no radius and no shadow."* This is the single change that makes the gallery belong to the site. |
| Fit + ratio | `object-fit: contain` at `4 / 3` | `object-fit: cover` at `1 / 1` | The derivation is already in this repo and I am not re-deriving it: the library is roughly half 2:3 portrait and half 3:2 landscape, and square minimises the worst-case crop (33% either way vs 47% at 4:5 or 5:4). `contain` never crops but letterboxes, which produces a strip of photos at visibly different apparent scales — the exact "three different apparent focal distances" defect `ContentLandingLayout.module.css` records. Equal square plates are what stop a strip reading as a dump. |
| Caption | centred, `0.95em`, `--color-text-inverse` | left, `--fs-meta`, `--ink-3` | `editorialTokens.module.css` explicitly declines a caption token because *"a figure caption or a photo credit is meta-register text at 13–14px, which is exactly `--fs-meta`."* Left-aligned so the caption starts on the plate's own left edge. |
| Hover | `transform: scale(1.04)` on the image | the card's resting-veil-that-lifts, or nothing | INF. The card's veil is justified *because* nothing is legible only while it is drawn. A scale on a cropped square is a second image-motion vocabulary. |

**Remove the animated swipe overlay.** This is my strongest single recommendation on `/classes`
and it is a consistency argument rather than a reference finding, so I am marking it INF and
stating the reasoning in full:

- It paints `rgba(0,0,0,0.582)` + `backdrop-filter: blur(3px)` **over the photographs** — the one
  asset the system says must never be permanently dimmed — and puts content *on top of* that
  veil, which `ContentCard.module.css` forbids in as many words.
- It is rendered **at every breakpoint**, including 1440px desktop, where "Swipe" is not the
  interaction available.
- It is ~120 lines of SVG and six keyframe animations for an affordance that Swiper's
  `dynamicBullets` pagination already carries, and that a partial next-slide peek carries better.
- Under `prefers-reduced-motion` it does not disappear — it becomes a static blurred veil over
  the photographs, which is the worst of both outcomes.

The quieter affordance, in the system's own terms: keep the gold pagination bullets (already
themed), let the last slide peek at the clip edge, and let the photographs do the work.

### 5. What each empty state does

There are **three** empty states, not two, and they should not all behave the same way. The
governing evidence is PUNCH (VV: one sentence, all furniture retained, no illustration) and
Eventbrite (VV: state the absence, offer the path).

| State | Recommendation |
|---|---|
| **No class record at all** (`class: null` — the service returns this and the page falls back to `"Cocktail Classes"`) | Header renders with the fallback title and **no lede**. The header's copper rule still fires, so the page still opens correctly. Both sections then hit their own empty states below. This is a cold-start state, and it should look like a page that is waiting, not a page that is broken. |
| **No sessions** | **Reuse `.emptyMessage` verbatim** — `--fs-lede`, `--ink-2`, `padding-block: var(--space-xl)`, `> span { max-width: 48ch }`. Keep the section heading and keep its rule. The message states the absence and **carries the path inline in gold**, e.g. *"No dates are on the calendar right now — [tell us what you have in mind] and we'll build one around it."* Rationale: absence of dates is **information the reader came for**, so the section must exist in order to deliver it. |
| **No photos** | **Omit the section entirely.** Do not render a heading, a rule, or an empty message. Rationale: the current copy — *"Photos from past classes will appear here after our next session"* — is a promise about the future that tells the reader nothing and costs a full section of vertical space plus one of the page's structural brackets. The asymmetry with sessions is the point: a missing schedule is an answer; a missing gallery is a non-event. |

INF on the asymmetry — I found no reference that renders one empty section and suppresses
another on the same page, because I could not reach a real schedule empty (see the gaps). The
argument is from the system, not from evidence.

**And a note on `--empty-block-pad`:** `ContentLandingLayout` already parameterises this knob
(`var(--empty-block-pad, var(--space-xl))`) precisely so a surface that lands several empty
states in one screen can tighten them. If both `/classes` sections could ever be empty at once
under the Director's composition, that knob is already there and no new token is needed.

---

## Recommended Composition — `/contact`

### 1. The ranking problem, which is the whole design

Three things currently occupy three equal 760px panels, and the **cream** one — visually
foreign, `rgba(255,248,236,0.9)`, carrying three white circular buttons — is the loudest.
The correct rank, read off the references:

| Rank | Element | Evidence |
|---|---|---|
| 1 | **The invitation** — headline + a lede that names the two ways to reach you | Humaan (MM): headline → CTA → directory → footnote, and nothing else on the page. Instrument (VV) and Basic/Dept (VV) both open on a display-scale title with routing directly beneath. |
| 2 | **The form** | Linear (MM) gives it 42% of the viewport, to the *right* of the reason-to-contact. noma (MM) gives it 59%. Neither gives it a panel. |
| 3 | **The direct email** — escape hatch, permanently visible, never a panel | Linear (MM) places it inline beside the submit. Pentagram (VV) and Basic/Dept (VV) go further and let a directory of addresses *replace* the form. |
| 4 | **The social channels** — a footnote | Humaan (MM): plain text links at the far right of a hairline footer row, 17px, **no icons, no circles, no fills**. |

### 2. The composition

**Open on `ContentDetailShell`'s masthead, not on a panel.**

- Left track: `.eyebrow` (gold tracked caps, *"Get in touch"*) → the page title → a lede.
- Right track (the byline's `fit-content(14rem)` slot): **the three social channels**, as three
  plain text links — `INSTAGRAM` / `FACEBOOK` / `YOUTUBE` — in `.meta`'s exact role: stacked,
  right-aligned, `--fs-meta`, 0.06em tracked caps, `--ink-3` (5.41:1), landing on the copper
  rule. Below 900px the masthead's existing breakpoint turns them into a left-aligned horizontal
  strip with hairline separators, for free.
- Both blocks land on the **copper rule**, which opens the page exactly as it does everywhere
  else.

This one move deletes the cream panel, deletes the round icon buttons, deletes the third equal
panel, and gives the socials the footnote rank Humaan's measured page gives them — using a
construct that already exists and requires no new CSS beyond the link states. It also happens to
remove three `react-icons` imports from this page; that is a small bonus, not the reason.

**The direct email goes in the lede, inside the sentence.** One line, `--fs-lede`, `--ink-2`,
with the address as a gold inline link — e.g. *"Have a question, an idea, or a date in mind?
Write to **info@thepnwspirits.com**, or send the note below."* This is the Aeon "controls as
running prose" device that `archive-rows.md` already identified as the most restrained filter UI
in its set, applied to a ranking problem instead of a filter. **One sentence does the ranking
that three panels currently fail to do.** It replaces the current `clamp(1.15rem, 3.5vw, 1.9rem)`
mailto — which is larger than some of the site's own page headings.

**Optional, and scored below:** Linear's measured second placement, *"Prefer email?
info@thepnwspirits.com"* set at `--fs-meta` / `--ink-3` beside the submit. It catches the reader
at the moment they decide the form is too much friction. The cost is the same address twice on
one page.

**Reject the Instrument route-buttons pattern here.** Three top-level routing buttons is a
genuinely better UI than a category `<select>` — but it presumes three *different destinations*.
This site has one inbox and a `category` enum that is a label on one message. Three buttons that
all open the same form with a different default would be three doors into one room. (And it
would put three filled buttons on a page that should have exactly one.)

### 3. The form's own layout

**Container.** Cap the form. A form released to the 1200px spine is the same hole the masthead
was built to fix. The measured references bracket it: noma 800px on a 1360px container (59%),
Linear 607px on 1440 (42%).

Then the `ch` trap, which must be stated because this system caps measures in `ch` and **`ch`
resolves against the element's own `font-size`** (`ContentDetailShell` documents this exact
hazard for `--measure-prose` on a 52px title):

- `--measure-prose` is `44ch`. On an element at `--fs-prose` (19px) it resolves to **554px**. On
  an element at `--fs-body` (17px) it resolves to **496px**. (CALC, using the repo's own measured
  Geist advance of 0.6630em per `ch`.)

**Pairing arithmetic (CALC).** With two fields and a `--col-gap` of 36px inside 554px, each
field is **259px = 20.6ch = ~31 rendered characters** (via the repo's measured 1.50
rendered-characters-per-`ch`). Inside 496px, each is 230px ≈ 31 characters too.

| Option | Consequence |
|---|---|
| **Single column at `--measure-prose`** | Every field holds ~62 rendered characters. Zero risk. Produces a five-row queue — the "support ticket" register the work order asks us to escape. |
| **Paired at `--measure-prose`** (recommended) | Three rows instead of five. ~31 characters visible per paired field. A 31-character name covers essentially everyone; a 31-character email covers most (real-world mean is ~22) and the rest scroll *within the input*, which is normal non-destructive single-line behaviour. |
| **Paired at a wider, new container** (~700px, ≈ noma's 59% of our spine) | ~46 characters per paired field. Comfortable — but it requires a width this system does not have a token for. |

**I considered and then abandoned a `--measure-form` token.** The derivation was clean (two
24ch-capable fields at `--fs-body` plus `--col-gap` → 36rem = 576px), but 576px against
`--measure-prose`'s 554px is a 4% difference — **two names for one decision**, which is the exact
bar `editorialTokens.module.css` sets when it declines a caption token and a blockquote token.
Recommendation: **reuse `--measure-prose`, add no token**, and accept the 31-character
measurement as a stated cost.

**Row structure.**

| Row | Fields | Why |
|---|---|---|
| 1 | `Name` + `Email` | noma pairs exactly these two (MM, 385px each). Ace pairs First/Last. They are the two shortest-to-type and most-related fields. |
| 2 | `Phone (optional)` + `Reason for reaching out` | Both are short — a phone is ~14 characters and the longest category label, *"General inquiry"*, is 15. Neither is at risk from the 31-character measure. |
| 3 | `Message`, full width | noma's textarea spans both columns (MM, 800px). |

Grid: `repeat(2, minmax(0, 1fr))`, `column-gap: var(--col-gap)`, `row-gap: var(--space-m)`,
collapsing to one column at the system's existing 599px breakpoint. noma's measured mobile
behaviour is exactly this collapse. **If the Director judges the 31-character email risk
unacceptable, unpair row 1 only and keep row 2 paired** — that still gets the form to four rows.

**Field treatment — the noma/Ace bare rule, drawn in copper.**

| Property | Value | Source |
|---|---|---|
| background | none | noma MM (`background: transparent` on every input) |
| border | `0 0 1px` — **`1px solid var(--rule-accent)`** on the bottom only | noma MM for the geometry; **CALC for the colour** — `--hairline` is 1.43:1 and fails SC 1.4.11; `--rule-accent` is 3.59:1 and passes |
| radius | `0` | noma MM (`border-radius: 0` on every field *and* on the submit) |
| padding | `var(--space-2xs) 0` | INF — derived so the box clears the 24px target minimum: 17px × 1.5 + 8 + 8 + 1 ≈ 42px |
| font | `--fs-body`, `--ink-1` | System |
| label | above the field, `--fs-eyebrow`, 0.12em tracked caps, `--ink-3` | noma and Linear both put the label above (MM). **`--ink-3`, not gold** — gold labels spend the accent five times in one form, and `.meta`/`.backLink` already establish `--ink-3` tracked caps as this system's furniture register |
| placeholder | **none** | CALC — no legal ink tier exists below `--ink-3` |
| focus | `outline: 2px solid var(--color-accent-gold)`, `outline-offset: 3px`, plus the underline to 2px | The system's existing focus contract, unmodified. Gold at 9.66:1 is the strongest signal available, and an offset ring around a boxless field is unambiguous |

**Why not Linear's filled fields.** Linear's `rgba(255,255,255,0.05)` + 8px radius is a real,
measured dark-ground answer — but a filled rounded field is a surface, and this system has no
surfaces. noma's answer transposes; Linear's does not. What *does* transfer from Linear is the
*rank* (label tier dimmer than value tier) and the escape-hatch placement.

**Soho House (VV) is the credible alternative** to per-field rules: one outer bordered block
subdivided by internal hairlines. It is the same rules-not-boxes thesis with one frame around
it. I prefer the noma form here because the outer frame is a panel by another name, and panels
are what this redesign is removing — but it is a legitimate option if the Director wants the
form to read as one object.

### 4. The select

**Exactly one distinguishing mark: a chevron.** noma (MM) gives its `Reason for your inquiry`
select the identical 385px bare rule as every other field and marks it with a chevron and
nothing else. Ace (VV) does the same.

The current implementation gives it **three** marks at once — `border-width: 2px`,
`border-color: rgba(190,152,95,0.75)`, a lighter `background-color`, and a hover
`box-shadow: 0 0 12px` glow. Three distinctions for one difference.

Keep `appearance: none` and the existing inline-SVG data-URI approach (it costs no dependency
and no request), but restate the stroke to the copper `#b87333` so the chevron reads as part of
the rule rather than as an accent word. Render the current value in `--ink-1` — the same tier as
a typed value — so a chosen category reads as chosen.

### 5. Submit and status

**Submit: reuse `.viewAllButton`.** Gold fill, `--surface-0` label (9.66:1), `--radius-xs`,
tracked uppercase, the 2px lift + `brightness(1.05)` on hover, the ink-not-gold focus ring, and
the `prefers-reduced-motion` neutralisation — all of it already written and already documented.
`.viewAllButton`'s own comment notes it had to restate every property a `<button>` gets for free
from the UA, which means a real `<button type="submit">` composing it is strictly safe.

This deletes the current `linear-gradient(135deg, gold → accent-primary)` fill, the
`0 0 16px rgba(226,176,126,0.4)` glow and the `--radius-md`, and makes the contact page's
conversion control identical to every other page's.

**Placement: left, on the form's own left edge.** noma's submit sits at x = 320 — pixel-identical
to the first field's left edge (MM). Not right-aligned, not stretched. `.viewAllButton`'s
existing ≤599px rule (`width: 100%; max-width: 22rem`) handles mobile without new CSS.

**Status line: no panel.** The current success/error panels introduce `#1f5133`,
`rgba(120,200,150,0.2)`, `#7a2020` and `rgba(210,110,90,0.18)` — two colour families this
palette does not contain, on a page that is about to have exactly two structural colours.

Recommended: one line of text directly under the button at `--fs-body` in `--ink-1`, with a 2px
`border-inline-start: var(--rule-accent)` and `padding-inline-start: var(--space-s)` — the short
vertical accent tick `archive-rows.md` already extracted from Stripe and recommended for this
system. **The wording carries success versus failure**, which also satisfies SC 1.4.1 (colour is
not the only signal) for free.

I am not going to pretend this is fully satisfying: **an error genuinely reads better in a
distinct colour, and this palette does not contain one.** If the Director wants one, that is a
real new token and I have flagged it below with a derived candidate rather than leaving the
Director to pick a red.

**One behavioural note, out of my lane but worth recording:** the current sending state applies
`opacity: 0.6` to all five fields. Dimming the whole form to say "one button is busy" is the
wrong locus; the button already swaps its own label to *"Sending…"*. Frontend UI Agent's call.

---

## Explicit Reuse Decisions

| Element | Reuse or new | Which construct | Justification |
|---|---|---|---|
| `/classes` page shell | **Reuse** | `.root` from `ContentLandingLayout` (ground, grain, spine, gutter, grain layer) | One declaration site; deletes the blurred `Vermouth.jpg` backdrop, the `brightness(0.2)` filter and the bespoke `clamp()` padding. |
| `/classes` header | **Reuse** | `.header` + `.eyebrow` + `.heading` + `.intro` + the copper rule | The system's stated answer to "open a page." |
| `/classes` section headings | **Reuse** | `--fs-h2` (24 → 32px), the token file's stated role: *"still the same 2:1 under `--fs-page` where these heads are used on a landing-scale page"* | The token exists and is currently unused on this page. Deletes the `1.6em` / `--color-accent-light` / centred / `--color-border-dark` heading. |
| `/classes` session list | **NEW — and it must be** | A dated index row | `ContentCard` and `ContentRow` both require `title` + `media` + `link` from `ContentItem`. A session has none of the three (Fact 1). This is the one genuinely new composition in this brief and it is forced by the data model, not by taste. |
| — its separators | **Reuse** | `border-top: 1px solid var(--hairline)` per row, `border-bottom` on the list | Byte-identical to `ContentArchiveLayout` `.list` + `ContentRow`. |
| — its two-up geometry | **Reuse, with an amendment request** | `.masthead`'s `minmax(0, 1fr) fit-content(14rem)` + its ≤899px collapse | See the alignment question. The Director must decide whether to widen the recorded right-alignment rule. |
| — its meta type role | **Reuse** | `.meta` (`--fs-meta`, 0.06em, uppercase, `--ink-3`) | Already proven at 5.41:1 on this ground. |
| `/classes` session modal | **Delete** | — | Renders the same three values as the row (Fact 1). |
| `/classes` hire CTA | **Reuse** | `.viewAllRow` + `.viewAllButton`, at the close | Deletes the brown `.ctaButton` at 3.11:1. |
| `/classes` gallery plates | **Reuse the card's media rules** | `aspect-ratio: 1/1`, `object-fit: cover`, `background: var(--surface-1)` behind, no radius/border/shadow | The square derivation is already recorded and measured in this repo. |
| `/classes` gallery captions | **Reuse** | `--fs-meta` / `--ink-3`, left-aligned | The token file explicitly declines a caption token on exactly this ground. |
| `/classes` swipe hint | **Delete** | — | Permanently veils the photographs, shows at every breakpoint, survives `prefers-reduced-motion` as a static veil. |
| `/classes` Swiper carousel | **Keep** | `swiper` 12.2.0 is already a pinned dependency; `ALBUM_BREAKPOINTS` and `MAX_ALBUM_PHOTOS` are already a shared config module | Nothing here argues for replacing it, and doing so would be a dependency change outside this brief's remit. Retheme only. |
| `/classes` + `/contact` empty messages | **Reuse** | `.emptyMessage` + its `> span { max-width: 48ch }` + the `--empty-block-pad` knob | Already the system's answer, already parameterised for density. |
| `/contact` page shell | **Reuse** | `.root` | Deletes the blurred `Bottles.jpg` backdrop and the inset box-shadows. |
| `/contact` masthead | **Reuse** | `.masthead` + `.mastheadLead` + `.eyebrow` + `.title` + `.meta` + the copper rule | Deletes the first translucent-brown panel outright. |
| `/contact` social channels | **Reuse** | `.meta`'s role, in the masthead's right track | Deletes the cream panel, the three round buttons and the white fills. |
| `/contact` direct email | **Reuse** | A gold inline link inside the `.intro` lede | Deletes the `clamp(1.15rem, 3.5vw, 1.9rem)` mailto and its `::after` scaleX underline animation. |
| `/contact` form fields | **NEW rule, existing tokens** | Bare `border-bottom: 1px solid var(--rule-accent)` | No form construct exists in this system yet. Every value is an existing token; only the *combination* is new. |
| `/contact` form width | **Reuse** | `--measure-prose` (with the `ch`-resolution caveat above) | No new token; the 36rem alternative was derived and rejected as a duplicate decision. |
| `/contact` labels | **Reuse** | `--fs-eyebrow` / 0.12em / `--ink-3` | The furniture register `.backLink` and `.meta` already establish. |
| `/contact` submit | **Reuse** | `.viewAllButton` | Deletes the gradient, the glow and the `--radius-md`. |
| `/contact` status line | **Reuse** | `--fs-body` / `--ink-1` + a 2px `--rule-accent` tick | Deletes four off-palette colours. |
| `/contact` form container panel | **Delete** | — | The translucent-brown panel, its `rgba(190,152,95,0.3)` border and its `--shadow-md`. |

---

## Proposed New Tokens

**The recommended direction needs zero new tokens.** That is the headline, and it is the result
of two derivations I performed and then rejected:

| Candidate | Derivation | Verdict |
|---|---|---|
| `--measure-form` | Two ~24ch fields at `--fs-body` plus `--col-gap` → 36rem = 576px | **Rejected.** 576px vs `--measure-prose`'s 554px is 4% — two names for one decision, which is the bar `editorialTokens.module.css` sets when it declines both a caption token and a blockquote token. |
| A spacing rung for the session row | `--space-m` (24px) block padding, `--space-2xs` (8px) between the date and time lines | **Not needed.** Both rungs exist and both have readers. |
| A session-row media column | — | **Not needed.** A session has no media. |

**One token is genuinely open, and only if the Director wants a coloured error state:**

| Token | Purpose | Derived candidate | Constraints it must satisfy |
|---|---|---|---|
| `--rule-danger` | Distinguish a failed submit from a successful one by more than wording | **`#d9705a` → 5.77:1 on `--surface-0`** (CALC) | Must clear 3:1 as a rule and 4.5:1 if it ever carries text; must sit in the warm family so it does not fight copper. For comparison I also computed #c2553f (4.20:1 — text-marginal) and #b8483a (3.62:1 — rule-only). #d9705a is the first candidate that is safe in both roles. |

My recommendation is **not** to add it: the wording plus a copper tick plus `aria-live` carries
the state, and a colour introduced for one line of text on one page is exactly the kind of rung
this token file argues against. But the trade-off is real and the Director owns it, so the
derivation is here rather than left as an exercise.

---

## What NOT To Do

Specific moves that would look award-winning in isolation and would break this system.

1. **Do not give a session a per-row "Book now" / "More info" button.** Barbican measures one at
   131 × 47px right-aligned in every row (MM), and it is right *for Barbican*, where each event
   has its own page. There is no booking system here and no per-session destination — every
   button would open the same `/contact`. Four identical CTAs in a list, plus the page's real
   CTA at the close, is five filled buttons on a page that should have one.
2. **Do not build a calendar widget.** Barbican's date picker (MM) serves 8,912px of listings.
   This page will typically hold three to eight sessions. A month grid to navigate six dates is
   chrome that outweighs its content, and it would introduce a grid, a hover state, a disabled
   state and a focus-management problem for zero information gain.
3. **Do not keep the session modal.** It shows what the row already shows.
4. **Do not keep the animated swipe overlay** — it veils the photographs at every breakpoint and
   persists under `prefers-reduced-motion` as a static blur.
5. **Do not add a lightbox zoom, pan, or slide-transition flourish** while removing the swipe
   hint. The lightbox is correct; making it more cinematic would re-open the same door.
6. **Do not adopt Instrument's three routing buttons** on `/contact`. Three routes require three
   destinations; there is one inbox.
7. **Do not adopt Humaan's 100px display headline.** It is measured and it is beautiful — and it
   is a studio's one-page contact site. Our `--fs-page` tops out at 64px and `--fs-title` at
   52px, both derived against measured reference ratios in this repo. A 100px headline on a page
   that then shows a form would make the form look like an afterthought.
8. **Do not adopt Pentagram's no-form contact page.** It is strong counter-evidence about rank —
   a form is not automatically the primary object — but Pentagram can drop the form because its
   inbound traffic knows exactly which of five offices to write to. A small brand needs the
   category enum and needs the message.
9. **Do not adopt Linear's filled, rounded form fields.** Measured and good on a dark ground —
   but `rgba(255,255,255,0.05)` at 8px radius is a surface, and this system has none.
10. **Do not draw the field underline in `--hairline`.** 1.43:1. It will look more refined and it
    fails SC 1.4.11.
11. **Do not make gold the label colour.** Five gold labels in one form spend the page's single
    accent on furniture; the system reserves gold for accent text and the one filled CTA.
12. **Do not keep any of the four status-panel colours.** They are off-palette.
13. **Do not add a scroll-reveal stagger to the session list.** `ContentRow.module.css` already
    settled this for lists: *"Twelve items either fire at once, which is not a stagger, or cascade
    for 840ms down a page the reader is already scrolling past."* The card grid's 70ms cascade is
    for three items at the fold.
14. **Do not introduce a second empty-state vocabulary** (illustration, icon, dashed box). PUNCH
    (VV) states absence in one sentence with all furniture retained, and `.emptyMessage` already
    encodes exactly that: *"no panel, no radius, no shadow, and no rules of its own."*
15. **Do not centre anything.** Both pages are centred today and the system is a single left
    spine. The only right-aligned thing in the system is the masthead's meta block, and extending
    even that requires the Director to amend a recorded decision.

---

## Idea Scoring

1–5, where 5 is best. "Perf" and "Impl" are scored so that 5 = cheapest.

| Idea | Brand fit | Audience fit | Usability | Conversion | Distinct. | A11y | Perf | Impl |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Session schedule as a dated index row | 5 | 5 | 5 | 4 | 4 | 5 | 5 | 4 |
| Location flush right (masthead two-up) | 4 | 4 | 4 | 3 | 4 | 5 | 5 | 5 |
| Hire CTA moved to the close, as `.viewAllButton` | 5 | 5 | 5 | 5 | 3 | 5 | 5 | 5 |
| Drop the session modal | 5 | 4 | 5 | 4 | 3 | 5 | 5 | 5 |
| Gallery: no surface, `cover` at 1/1 | 5 | 5 | 4 | 4 | 4 | 5 | 5 | 4 |
| Remove the swipe overlay | 5 | 4 | 4 | 3 | 3 | 5 | 5 | 5 |
| Omit the empty photo section entirely | 5 | 5 | 5 | 4 | 4 | 5 | 5 | 5 |
| Empty sessions message carrying an inline gold path | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 5 |
| Socials as `.meta` in the masthead right track | 5 | 4 | 4 | 3 | 4 | 5 | 5 | 5 |
| Direct email inline in the lede sentence | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 5 |
| Direct email *also* beside the submit (Linear) | 4 | 5 | 5 | 5 | 3 | 5 | 5 | 5 |
| Bare copper-underlined fields | 5 | 4 | 4 | 4 | 5 | 5 | 5 | 4 |
| Paired name/email + phone/category rows | 4 | 5 | 4 | 4 | 3 | 5 | 5 | 5 |
| Select marked by a chevron only | 5 | 4 | 4 | 4 | 4 | 4 | 5 | 5 |
| Textarea as the only boxed field | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 5 |
| Submit reusing `.viewAllButton` | 5 | 5 | 5 | 5 | 3 | 5 | 5 | 5 |
| Status as text + copper tick, no panel | 5 | 4 | 4 | 4 | 4 | 4 | 5 | 5 |
| *Rejected:* per-session CTA button | 2 | 3 | 3 | 2 | 2 | 4 | 5 | 4 |
| *Rejected:* calendar picker widget | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 1 |
| *Rejected:* Instrument routing buttons | 3 | 3 | 4 | 3 | 4 | 5 | 5 | 4 |
| *Rejected:* `--rule-danger` token | 3 | 4 | 4 | 4 | 2 | 5 | 5 | 4 |

The two lowest-confidence rows are "select marked by a chevron only" and "status as text + copper
tick," both scored 4 on accessibility rather than 5: the first because a chevron is the sole
affordance distinguishing a combobox from a text field, and the second because it leans entirely
on wording plus `aria-live` to convey failure. Both are defensible; neither is free.

---

## Recommended Visual Direction

`/classes` and `/contact` stop being two bespoke pages and become **the same page system at two
densities**: a copper-ruled header, a hairline-ruled body, and a gold door at the close.

On `/classes` the copper rule opens the page under a left-aligned title and lede; a **dated
index list** follows, where each session is a hairline, a date in the card-title rank, a dimmed
tracked-caps time beneath it and a location flush against the spine's right edge; then a strip
of **square, surfaceless photographs** that is the page's only image content and is allowed to
be exactly that; then the page closes on the site's one gold CTA. When there are no dates, the
schedule section stays and says so in a lede that carries the way forward in gold. When there
are no photographs, the section is not there at all.

On `/contact` the same copper rule opens a two-up masthead: the invitation on the left, the three
channels reduced to three quiet tracked-caps words on the right. The direct email lives inside
the lede sentence, where it does its ranking work in prose instead of in a panel. Beneath the
rule the form is drawn entirely in the site's two structural colours — **copper rules and ink
labels, no panels, no fills, no radii** — with name and email paired, phone and category paired,
and a single boxed textarea whose frame is the one place the form says "write here." It closes on
the same gold door as every other page, with the status line beneath it carried by a copper tick
and by its own wording.

Neither page keeps a blurred photographic backdrop, a translucent panel, a shadow, a cream
surface, a round icon button, a gradient, a glow, or a centred axis.

---

## Guidance for the UI Design Director

Concrete, ordered, and stating what I am **not** deciding.

1. **Decide the right-alignment amendment first.** Everything in the `/classes` schedule
   composition hangs off it. `ContentDetailShell.module.css` records right alignment as
   "confined to this one block on purpose"; the session `location` is the same kind of candidate
   for the same job. Either widen the recorded rule and reuse `.masthead`'s two-up, or take the
   left-aligned fallback (time and location on one meta line with the existing `::before`
   hairline separators) and cap the schedule's width. **This is your call, not mine** — I have
   argued for the amendment and given you the fallback in full.
2. **Set the session row's exact rungs.** I have proposed `--fs-card` / 600 / `--ink-1` for the
   date, `--fs-meta` / 0.06em caps / `--ink-3` for time and location, `--space-m` block padding
   and `--space-2xs` between the two lines, for an estimated 96px row. The estimate is INF, not
   rendered — verify it in your render-and-refine loop and adjust the padding rung, not the type
   roles.
3. **Take the copper underline as non-negotiable.** `--hairline` at 1.43:1 fails SC 1.4.11 as a
   field boundary; `--rule-accent` at 3.59:1 passes. Every other field property is
   yours to tune.
4. **Decide the form container.** I recommend `--measure-prose` with paired rows and a stated
   31-rendered-character cost; the alternatives (single column, or a new ~700px width) are
   costed above. If you take `--measure-prose`, note the `ch`-resolution trap: it yields 554px on
   a `--fs-prose` element and 496px on a `--fs-body` one, and `.measured` in
   `ContentDetailShell` is the existing mechanism for stating both together.
5. **Decide whether `--rule-danger` exists.** You own `editorialTokens.module.css`. My
   recommendation is no; the derived candidate is `#d9705a` (5.77:1) if yes.
6. **Decide whether the direct email appears once or twice.** Once, in the lede, is my
   recommendation. Linear's measured by-the-submit placement is scored above if you want both.
7. **The two deletions I would defend hardest** are the swipe overlay and the session modal.
   Both remove code, both remove a client boundary, and both remove something that contradicts a
   rule this system has already written down.
8. **When you write the new session-row module, record the derivations in it.** The two prior
   research cycles produced files whose comments are the reason a third page can be built without
   re-deriving anything. A new construct that does not explain itself is the drift those files
   exist to prevent.

---

## Boundary Gaps Reported to the Orchestrator

Every item below is outside `docs/design-research/classes-contact.md`, which is the only file I
own. **I have edited nothing else.**

1. **`classService.ts` does not filter sessions to the future.**
   `prisma.classSession.findMany({ where: { classId }, orderBy: { startTime: "asc" } })` has no
   `startTime: { gte: now }` clause, so the section titled **"Upcoming Sessions"** will list past
   dates ascending from the oldest the moment the first session elapses — and the *first* row a
   reader sees will be the oldest one. This is a correctness defect that no visual direction can
   fix, and it interacts directly with the empty state: a schedule that never empties will never
   show the empty state that this research designs. **Routes to Backend Services Agent** (and
   Backend Data Agent if an index on `(classId, startTime)` is wanted — `@@index([startTime])`
   already exists). Testing Agent will need coverage for the boundary.
2. **`ContentDetailShell.module.css` carries a recorded decision that the recommended `/classes`
   schedule would widen** ("right alignment … confined to this one block on purpose"). If the
   Director accepts the amendment, that comment must be updated in the same task, or the next
   reader will find a rule contradicted by shipped code. **Routes to UI Design Director Agent.**
3. **Removing the session modal changes component behaviour**, not just styling:
   `ClassSessions.tsx` loses its `useState`, its `Modal` mount and arguably its `"use client"`
   directive, and `ClassSessions.test.tsx` asserts the modal. **Routes to Frontend UI Agent +
   Testing Agent.**
4. **Removing the swipe overlay touches `PhotoAlbum.tsx` markup** (the `SwipeHint` component,
   the `interacted` / `locked` / `readyRef` state and the `onTouchStart` / `onSlideChange` /
   `onLock` / `onUnlock` handlers that exist only to drive it) as well as
   `PhotoAlbum.module.css` and `PhotoAlbum.test.tsx`. **Routes to Frontend UI Agent + Testing
   Agent.**
5. **A session has no content of its own.** If the product wants per-session pricing, capacity,
   a description or a booking link — any of which would justify a modal or a destination — that
   is a `ClassSession` schema change. **Recorded as a content-model dependency, explicitly not
   proposed as scope.** Routes to Backend Data Agent if ever taken up.
6. **`CocktailClass.description` is uncapped** in both `schema.prisma` and `classSchemas`, and it
   is about to occupy a 48ch lede slot. If a length ceiling is wanted, it belongs at the Zod
   trust boundary. **Routes to Backend Services Agent / Backend Security Agent.**
7. **The contact status line uses `role="status" aria-live="polite"` for both outcomes.** An
   error arguably warrants `role="alert"`. Out of my lane; **routes to Frontend UI Agent.**
8. **`/classes` and `/contact` are one funnel with no parameter between them.** The `/classes`
   CTA links to bare `/contact`, and `ContactForm` happens to default to `hire_event` — so the
   right thing happens by coincidence rather than by contract. A `?reason=hire_event` deep link
   with the form reading it would make the funnel explicit. **Not proposed as scope; routes to
   Frontend API and Logic Agent if wanted.**
9. **Reference screenshots are not committed.** They live in the session scratchpad, which is
   temporary. If the Director wants the visual evidence rather than this document's description
   of it, the capture scripts would need to be re-run. **Flagged so the absence is not discovered
   later.**
