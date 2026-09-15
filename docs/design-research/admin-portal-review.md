# UI Design Review — Admin Portal

Prepared by: UI Design Reviewer Agent
Date: 2026-09-14
Upstream: `docs/design-research/admin-portal.md`, `design-review-handoff.md`
Consumer: Orchestrator (routes findings), then UI Design Director Agent / Frontend UI Agent

---

## How this review was conducted

**Everything below was rendered.** I did not review this from source. I minted an admin
token against the running dev server, injected it into `localStorage` under `adminToken`
via a Playwright init script, and drove all six surfaces in headless Chromium 1.61.0.

| What | How |
|---|---|
| Screenshots | `.screenshots/review/` — six routes × 1440×900, 1024×768, 390×844, viewport + fullPage, 5s settle |
| Geometry | `getBoundingClientRect()` on every element on every route |
| Paint | `getComputedStyle()` at rest, `:hover` (real pointer), and `:focus` (real `.focus()`) |
| Contrast | Computed by compositing alpha against the ground and applying the WCAG relative-luminance formula. **Method validated**: my figures reproduce `editorialTokens.module.css`'s own recorded ink tiers to the second decimal (13.57 / 7.35 / 5.43 vs its 13.57 / 7.38 / 5.43), and reproduce the research file's `--color-error` figure exactly (3.69:1). |
| Interaction | Confirm dialog opened and tab-cycled and Escape-dismissed at both viewports; newsletter composer filled and broadcast attempted; nonsense search for the empty state; mobile menu opened; inline session edit entered; every control hovered and focused |
| Dialog lifecycle | Confirmed deletes driven **by keyboard** on `/admin/blogs`, `/admin/classes` sessions and `/admin/classes` photos, with `document.activeElement` polled at 60ms until settled; busy state held open by stalling the `DELETE` for 30s |
| Doctrine audit | A computed-style sweep of **every element on all six routes** for `border-radius`, `box-shadow`, `backdrop-filter`, `filter`, `background-image` and any non-token `background-color`, including `::before` / `::after` |

**On destroying records: I did not.** The work order forbids destructive operations against
the dev database, and the coordinator asked for a confirmed-delete measurement. I resolved
that by intercepting at the network layer: the `DELETE` is fulfilled `200` without reaching
the server, and the subsequent list `GET` is **fetched for real and then filtered** so the
response keeps its true shape, pagination and field set minus the one record. The client
lifecycle — request, `reload()`, re-render, unmount, focus restore — runs exactly as it
would in production. That is the correct substrate for a focus question, which is entirely
a client-side DOM-lifecycle matter, and it left the database untouched. Every focus value
below was reproduced across at least two runs.

Three things are flagged as I go rather than silently:

- **The dev database changed under me mid-review.** Class sessions moved from Jul to
  Sep/Oct and the album dropped from three photos to two between my capture pass and my
  measurement pass. Absolute record values in this document are therefore not stable;
  geometry and paint are.
- **The stale `/admin/classes` eyebrow resolved itself mid-review.** My 1440 capture shows
  `PNW SPIRITS`; my later computed-style pass reads `Manage`. The in-flight fix landed. Not
  reported as a finding.

---

## Scorecard

### By surface

| Surface | Score | One-line verdict |
|---|---:|---|
| `/admin/blogs` | **7** | The thesis, delivered — ruled, dense, legible, correctly ranked. Revised down from 8: a confirmed delete lands focus on `<body>`, on the most common action in the portal. |
| `/admin/recipes` | **7** | Identical strengths and the identical focus defect; the mixed loaded/empty plate run is its other visible weakness. |
| `/admin/login` | **8** | The best single composition in the portal at 1024. Sparse at 1440. |
| `/admin` (landing) | **6** | A doubled opening rule at every viewport, 43% of the desktop viewport empty, and it repeats the header nav verbatim. |
| `/admin/classes` | **5** | Structurally right, ergonomically expensive. The album loses the rank the rest of the portal keeps, focus is dropped on the inline edit, and a confirmed photo delete lands focus in a text field that silently captures the next keystrokes. |
| `/admin/newsletter` | **5** | The white plate is sized by the form beside it, not by the email inside it, and on a phone the send controls precede the preview. |

### By category, portal-wide

| Category | Score | Note |
|---|---:|---|
| Visual Hierarchy | 7 | Correct in the lists; inverted on `/admin/newsletter`, flat in the album. |
| Typography | 8 | One scale, one family, roles held. Title 22/26.4, meta 14/19.6, eyebrow 12/0.12em. No drift found. |
| Composition | 7 | The 1200px spine and the bleeding hover tint are handled with real care. The landing and the newsletter are the two compositions that were not finished. |
| Whitespace | 6 | 80px of pure gap brackets a 160px page header on every list screen; that is where the promised eighth row went. |
| Brand Character | 9 | See "Same brand or same variables" below. This is the strongest result in the pass. |
| Section Rhythm | 6 | `/admin/classes` is three panels over 2273px with no in-page navigation. |
| Imagery | 6 | The 56px recognition token is the right idea; the empty-plate degrade is not designed. |
| Color | 8 | One hue plus ink, measured, and held. The copper budget is looser than claimed. |
| Interaction | 5 | The confirm dialog is excellent on its cancel paths and defective on its success path and in its busy state. Revised down from 8 after measuring both. |
| Responsiveness | 7 | No overflow at any width; mobile is genuinely re-composed, not collapsed. The newsletter's mobile order is wrong. |
| Conversion Clarity | 7 | "Conversion" here is task completion. The primary is unambiguous on five of six screens, but the portal loses the user's place on the action they repeat most. |
| Originality | 8 | This does not look like any admin template. It looks like this site. |

---

## Verdict on each of the eight stated claims

### 1. 80px row, `3.5rem / 1fr / auto`, ~6 records → ~8 — **PARTIALLY UPHELD**

*Measured, `/admin/blogs`, 1440×900.* Row tops: **297.8 / 377.8 / 457.8 / 537.8 / 617.8**.
Pitch is **80.0px to the decimal**, five rows running. Track resolves to
**56 / 939.2 / 164.8** at the 1200px spine — the research's derived 78% content column,
delivered. Legibility at that density holds: title `22px / 26.4px` line-height at ink-1
(13.57:1), meta `14px / 19.6px`, 12px block padding, media 56px square. Nothing is cramped.

**The density was not fully won.** Chrome before the first record measures **297.8px**
against the research's budgeted 232px:

```
 58.0  admin bar                      (research assumed 52)
 40.0  .root padding-block-start       --space-l
159.8  .header  (eyebrow 12 + 16 + titleRow 40 + 24 + headerFoot 42.8 + 24 pad)
 40.0  .header margin-bottom           --space-l
------
297.8  →  list area 602.2px  →  602.2 / 80 = 7.53 rows
```

So the portal shows **7 whole records and a sliver of an eighth**, against the claimed 8.2
and the previous grid's 6. That is still a real 25% gain and the 4.3× reduction in
per-record vertical cost is genuine. But 80px of the 297.8 is pure gap — a 40px pad above
a header and a 40px margin below its rule — and that is exactly the row that went missing.

### 2. Actions always visible at rest, worded, ≥40px, Delete last and one ink tier down — **UPHELD IN THE ROWS, NOT UPHELD IN THE ALBUM**

*Rows, measured.* Every action is `opacity: 1` at rest with no hover gate, at **67×40 (Edit)**
and **90×40 (Delete)** with 8px between them — SC 2.5.8 cleared with 16px to spare on the
short axis. Delete is last. Edit is `--ink-1` (13.57:1), Delete `--ink-2` (7.35:1). The
rank is real and legible. `aria-label` names the record on every one
(`"Delete post: Cocktails for a Gray Day: Warming the Drizzle Away"`). This is well done.

*Album tiles, measured, `/admin/classes`.* "Save caption for Photo 1" and "Delete Photo 1"
are **both 180×40, both `--ink-2` (0.66), both `--hairline-strong` (0.38), stacked 8px
apart**, with Delete last. At 390px they sit **side by side at 171×40, 8px apart**. The two
controls are pixel-identical at rest. The tier-down mechanism that ranks Edit above Delete
in a row has nothing to work with here, because the neighbour is already at the bottom
tier. Detail in Problem 3.

### 3. Delete neutral at rest, red on hover/focus inside a list; red at rest in the dialog — **UPHELD**

Verified by computed style on both readings that `/admin/classes` shows together, and on the
dialog.

| Control | Rest | Hover | Focus |
|---|---|---|---|
| Session row Delete | ink `.66`, rule `.38` | `#e2645f` ink + rule | `#e2645f` + gold ring |
| Album tile Delete | ink `.66`, rule `.38` | `#e2645f` ink + rule | `#e2645f` + gold ring |
| Blogs row Delete | ink `.66`, rule `.38` | `#e2645f` ink + rule | `#e2645f` + gold ring |
| Dialog "Delete post" | **`#e2645f` at rest** | — | — |

Identical at rest across both densities, red arriving at hover *and* at `focus-visible` so
keyboard users are warned at the same point in the interaction. `#e2645f` measures
**5.60:1 on `--surface-0`** and 5.30:1 on `--surface-1` — clears AA as text on both grounds.
The consolidation fix landed and it landed cleanly. **Do not re-open this.**

On the handoff's own scrutiny question — is the red *late* at the bottom of a 240px tile?
No. The hover target is the control, not the tile, so the red arrives at the same moment in
both cases. The problem in the album is not timing, it is that the *resting* state has no
rank (Problem 3).

### 4. Copper spent once per page, on the header primary — **NOT UPHELD AS STATED; UPHELD IN ITS NARROW SENSE**

*Full copper census, computed, `/admin/blogs` 1440×900 — six occurrences:*

| y | What | Weight |
|---:|---|---|
| 46 | active nav link underline | 2px copper |
| 18–38 | `ADMIN` brand badge outline | 1px copper, four sides |
| 56 | admin bar bottom rule | **2px copper** |
| 126–166 | "New post" primary button outline | 1px copper, four sides |
| 98 | `Manage` eyebrow | gold `#e2b07e` text |
| 257.8 | page header bottom rule | **1px copper** |

`/admin/classes` carries seven (two primary buttons). The narrow claim — *no second copper
**horizontal rule** below the page header* — is true: there is exactly one 1px copper rule
in each page body. The broad claim as written in the work order is not.

Worth stating because it has a visual consequence: **the top 258px of every list screen
carries three horizontal copper lines** — the 2px nav underline at y46, the 2px bar rule at
y56 ten pixels below it, and the 1px header rule at y257.8. At 390px the first two are the
same ten pixels apart. Two copper horizontals ten pixels apart is the "two rules doing one
rule's job" the handoff's own principle 4 forbids, and it is the one place the copper budget
is genuinely being overspent. Fixing it is cheap: the active-nav marker does not need to be
copper when it sits directly above a copper rule (Problem 6).

### 5. The landing is a 2×2 ruled block — **UPHELD AS A COMPOSITION, DEFECTIVE IN EXECUTION**

The 2×2 reads correctly and the reasoning in `AdminCardGrid.module.css` (`.cards`) is sound —
four unlike destinations are read once, not scanned, and the 64px column gap does keep the
two tint bleeds from meeting. But the block **opens on a doubled rule at every viewport**
and leaves 43% of a 1440×900 viewport empty. Problem 4.

### 6. The newsletter preview is white and stays white, framed as a specimen — **HALF UPHELD**

It stays white, and not fighting it is the right call. It is **not framed**. Measured: the
plate is `padding: 0` with `border: 1px solid rgba(242,235,227,0.14)`. A 14%-alpha warm-white
hairline drawn directly against a pure-white iframe is invisible — the white simply abuts the
dark ground with no transition. The research's instruction was *"a `--hairline` border … and
generous `--space-m` clearance so it reads as a specimen being inspected rather than as a hole
in the page."* The clearance was not implemented, so the border does nothing, so the
instruction rendered as a no-op. And the plate measures **568×648 for a three-line email**.
Problem 2.

### 7. `/admin/login` keeps an unblurred photograph at ≥900px and drops it below — **UPHELD**

Verified at 1440 (photo occupies x720–1440), 1024 (x512–1024), 390 (absent entirely). No
`filter` on the image at any width. At 1024 this is the best composition in the portal. At
1440 the form column grows to 720px while the form stays at 384px, so 336px of the dark half
is empty ground; the page reads sparser at the wider size than at the narrower one. Low
priority, noted at the end.

### 8. No radius, no shadow, no `backdrop-filter`, no blurred photography — **UPHELD, VERIFIED EXHAUSTIVELY**

A computed-style sweep of **every element on all six routes**, including `::before` and
`::after`, returned:

- `border-radius` non-zero: **0 elements**
- `box-shadow` other than `none`: **0 elements**
- `backdrop-filter` other than `none`: **0 elements**
- `background-image`: **1** — the `AdminNavCard` gold underline-wipe gradient, which is the
  public site's own `.titleText` mechanism
- `filter`: **1** — `blur(2px) saturate(1.1) brightness(0.95)` on the shell's grain
  pseudo-element, which is the shared `--grain-image` layer, not a photograph
- non-token `background-color`: **0 elements** (only `--surface-0`, `--surface-1`, and the
  preview iframe's `#fff`)

The five hand-tuned `blur(4px) brightness(0.2)` copies, the `glassOverlay`, the
`brightness(1.3) saturate(1.08)` hover, the `--radius-lg` panels and the filled `.linkActive`
pill are all gone. This claim is not merely upheld, it is airtight.

---

## Is it the same brand, or a dark page using the same variables?

**The same brand.** I opened `/recipes` and `/admin/recipes` side by side at 1440 and the
structural grammar transfers, not just the palette:

| | Public `/recipes` | Admin `/admin/recipes` |
|---|---|---|
| Opening band | eyebrow → `--fs-page` title | eyebrow → `--fs-h2` title + inline primary |
| Second band | count left, bare underlined search right | count left, bare underlined search right |
| Closing the header | 1px `--rule-accent` rule, full spine | 1px `--rule-accent` rule, full spine |
| The record run | hairline-separated, no cards | hairline-separated, no cards |
| Hover | ground to `--surface-1`, bleeding `--space-s` past the rule | ground to `--surface-1`, bleeding `--space-s` past the rule |
| Media | 160px square, `object-fit: cover`, zero radius | 56px square, `object-fit: cover`, zero radius |

That is the same page spoken at a different density, which is precisely what the research
asked for and what all three live references (WordPress, Statamic, Ghost) do by changing
chrome rather than palette. The admin's own distinguishing marks — the `ADMIN` badge outlined
rather than filled, the 2px copper bar rule the public header does not have, the trailing
action column, the one-line ellipsised title — are structural, not chromatic. **This is the
strongest outcome of the pass and nothing in the fixes below should disturb it.**

The one place the resemblance becomes a liability: the public row tints on hover *because the
row is the link*. The admin row tints on hover and the row is not a link. See Problem 5.

---

## Is it pleasant to work in?

Scanning 40 recipes: **yes.** Seven and a half records per screen, a one-line title that
never reflows, a trailing action column the eye can run down, and a search that narrows in
place without the control band ever unmounting.

Deleting one: **up to the moment it succeeds, yes — after that, no.** The dialog itself is the
best-composed interaction in the portal. Measured at 1440 and 390: it names the record in bold
ink-1 inside the sentence, says *"This cannot be undone"*, and labels its buttons **"Keep post"
/ "Delete post"** rather than OK/Cancel. Tab cycles exactly three controls and wraps. Escape
closes it and **returns focus to the exact Delete button that opened it**. Every NN/g criterion
the research raised against `window.confirm` is met. The same treatment covers the newsletter
broadcast (*"Winter release will be emailed to every subscriber on the list. A newsletter
cannot be recalled once it has been sent."* / "Keep editing" / "Send to all subscribers").

The success path is where it falls apart. On `/admin/blogs` and `/admin/recipes` a confirmed
delete drops focus to `<body>` and the admin pays eight Tab stops to get back to the list; on
the `/admin/classes` photo path it lands in a caption field that silently captures whatever
they type next. An admin clearing several records in a row — the exact scenario in the brief —
is penalised once per deletion. Problem 1, and the full measurement is in the dialog section
above.

Correcting a typo in a class session: **no.** Three problems compound.

1. Clicking "Edit session" replaces the row with an inline form, and the button that had
   focus is unmounted. Measured: `document.activeElement` after the click is **`BODY`**. A
   keyboard user has just been returned to the top of a 2273px document. SC 2.4.3.
2. The album — the most spatially demanding task on the screen — begins at **y≈1836 of 2273
   at desktop and y≈1900 of 3129 on a phone**, with no in-page navigation, no sticky panel
   header and no anchor list. Every caption correction is a ~2500px scroll on mobile.
3. Caption fields are **180px wide at 1440**, which truncates "Guests building a D…" at 19
   characters inside a 1200px spine that has 900px of free width beside it.

---

## The two dialog questions — independent measurement

The coordinator asked me to settle a measurement dispute between two agents who had each
convinced themselves of a different result. **Both of them measured something real.** Neither
had the whole picture, and the piece that was missing is the serious one.

### Method

Keyboard-driven throughout: focus the row's Delete, `Enter` to open, `Tab` to the confirming
control, `Enter` to confirm. `document.activeElement` then polled every 60ms for 4–5s, so the
value below is the **settled** value, not the value at close time. `DELETE` fulfilled at the
network layer; the follow-up `GET` fetched for real and filtered. No record was destroyed.

### The values

| Screen | What was deleted | Settled `document.activeElement` | Arrives | Next keystrokes |
|---|---|---|---|---|
| `/admin/blogs` | 2nd of 5 posts | **`BODY`** — never recovers | never | go nowhere |
| `/admin/classes` session, successor present | 1st of 3 sessions | **`BUTTON` `aria-label="Edit session: Sep 28, 2026, 6:00 PM – 8:00 PM"`**, box `[1155, 430, 67, 40]` — the successor's Edit, at the deleted row's exact y | t≈711ms | safe |
| `/admin/classes` session, list empties | the last session | **`INPUT[type=datetime-local]`** — the "Add a session" start time | t≈700ms | swallowed (the type coerces letters away) |
| `/admin/classes` photo | Photo 1 of 3 | **`INPUT[type=text]`, `.AdminInput control`, box `[120, 244, 512, 44]`, nearest label `"Caption"`** — the upload caption field | t≈882ms | **captured silently** |

The last row, verbatim from the run: I typed `leaked text` after the delete settled and read
the field back — `"leaked text"`. That field is described to the admin as *"Optional. Saved
with the next photo you upload."*

### Who was right

**The Director is right about the session delete.** Tier 2 works exactly as its comment
claims: the walk re-enters the surviving `<ul>` at the recorded index and lands on the Edit
button of the record that took the slot, at the same y the deleted row occupied. I reproduced
this in two runs. This is a genuinely good piece of engineering and it should not be reverted.

**The Frontend UI agent is right about the lists, and right about the keystroke leak — but it
attached the leak to the wrong control.** On `/admin/blogs` the settled value is `BODY` and it
never recovers, so the walk is effectively dead there, exactly as reported. The caption-field
landing is real and the silent keystroke capture is real — but it happens on the **photo**
delete, not the session delete. On the session delete the panel ancestors survive.

**Why they diverged, and it is not carelessness on either side.** The two screens sequence the
refetch differently:

- `AdminBlogList.confirmDelete` calls `reload()` **without awaiting it**, then closes the
  dialog in `finally`. The restore therefore resolves while the doomed row is still mounted —
  tier 1 matches the trigger, focus goes to a button that unmounts milliseconds later, and
  focus falls to `<body>`.
- `AdminClassManager.confirmDeleteSession` calls **`await reload()`** before closing. By the
  time the restore runs the list has already re-rendered, the trigger is genuinely gone, and
  tier 2 does its job.

One `await`, two different outcomes. That is the whole dispute.

**A third fact neither agent reported:** on `/admin/classes`, focus sits on `<body>` for
**700–880ms** before the restore lands. It does land, but there is most of a second in which a
fast admin's keystrokes go nowhere — and on the photo path, into a caption field.

### Q1 — where *should* focus go after a confirmed delete?

**The successor's primary control. Never a text-entry control. And "nowhere" must be rare
rather than routine.**

*Why the successor's Edit and not "nowhere".* An admin deleting several records in a row is
exactly the case in the brief. Their next action is either "delete the next one too" or "check
the one that just moved up", and the successor's Edit puts both one keystroke away — Tab
reaches that row's Delete. The alternative costs a full re-traverse: measured on
`/admin/blogs`, returning from `<body>` to the second row's Delete is **eight Tab stops**
(brand, four nav links, Sign out, New post, search, then two per row). Eight stops per delete,
repeated, is the difference between a tool and an obstacle.

*On the objection that this "asserts the slot is meaningful".* In a list it is. These are
ordered collections — blogs and recipes by `createdAt desc`, sessions by schedule — so the
slot is the record's position in an order the admin is actively working through. The assertion
would be wrong for an unordered grid; it is right here. I am satisfied the Director's tier 2 is
the correct target and I would not trade it for a safer-sounding "focus the list heading".

*On landing in a text input — this is not a preference, it disqualifies.* The measurement
above is a silent data-integrity bug, not an accessibility inconvenience: a keystroke after a
delete attaches text to the **next photo the admin uploads**, with no visible cause and no
error. The empty-session-list case lands in a `datetime-local` and is harmless only because
that input type discards letters. That is luck, and it will not hold the next time the fallback
resolves into a `type="text"`.

So `resolveFocusRestoreTarget` should not be allowed to *land* on a control that accepts free
text, even though the trap must still *cycle* through one.

This looks like it contradicts the hook's own opening comment — *"two copies of a selector list
is how 'focusable' comes to mean two different things in one dialog"* — and it does not. That
comment is about **cycling**, and it is correct: a trap that cannot reach a control strands it.
**Landing is a different question with a different answer.** A trap must reach everything; a
restore must land somewhere inert to a keystroke, because the user did not ask to be there.
Declare the distinction explicitly in the same file so it is stated rather than discovered:

```ts
/** What the trap cycles through. Must reach every control, or one is stranded. */
export const FOCUSABLE_SELECTOR = ...

/** What the restore walk may LAND on. Deliberately narrower, and not a second
    definition of "focusable": a trap must reach a text field, but focus must
    never be PUT in one the user did not ask for - the next keystroke would be
    captured with no visible cause. Measured: after a photo delete the walk
    resolved into the upload caption field and typing entered it silently. */
export const RESTORE_LANDING_SELECTOR = "a[href],button:not([disabled])";
```

Then `firstFocusableWithin` takes the narrower selector. This fixes three of the four rows in
the table at once: the photo delete walks past the caption field to the tile's Save/Delete, and
the emptied session list walks past the datetime input to "Add session" — which is the control
the hook's own comment says it wants there (*"its first control is the one that creates a new
record"*). The comment was right; the selector was not narrow enough to deliver it.

*On the lists resolving to `<body>` — fix the consumer, not the hook.* `AdminBlogList` and
`AdminRecipeList` should `await reload()` before `setPendingDelete(null)`, which is what
`AdminClassManager` already does and the reason it works. One keyword in two files, and it
makes the walk live on the two screens where it is currently dead code. Do this **before**
adding anything to the hook — the hook is not broken on those screens, it is being called at
the wrong moment.

*On the 700–880ms gap.* Do not chase this with focus. The honest fix is an announcement: the
list already owns an error slot, and a `role="status"` message (*"Deleted. 4 posts remain."*)
covers the gap for a screen-reader user better than any focus trick, and tells a sighted user
what happened to the row that vanished. Worth one work order; not urgent.

### Q2 — is a non-dismissable busy dialog right?

**Yes, keep it non-dismissable. No timeout. But the current implementation is not
non-dismissable — it is leaky, and that is worse.**

*The reasoning behind the decision is sound and I would defend it.* A cancel that dismisses
without cancelling is a lie, and it returns the admin to a list that is about to change with no
sign that it will. A destructive `DELETE` already in flight cannot be recalled, so there is
nothing honest for a cancel control to do. Closing toward "cannot dismiss" is right.

*I would not add a timeout, and the doctrine is not my main reason.* "Add the rung when the
rule needs it" supports the conclusion, but the stronger argument is specific: a timeout on a
non-idempotent destructive request **invents a second failure mode**. If the timer fires and
the request later succeeds, the UI has told the admin the delete did not happen while the
record is gone. One unbounded wait is better than two contradictory truths.

*What I measured, which is worse than what was reported to me.* Holding the `DELETE` open for
30s on `/admin/blogs`:

| | Measured |
|---|---|
| `Keep post` | `disabled: true` — correct |
| Confirming button | `disabled: true`, relabelled `"Deleting…"` — correct |
| `×` Close | **`disabled: false`**, `aria-label="Close"`, clicking it leaves the dialog present — a live control that does nothing |
| `Escape` | inert — correct |
| Backdrop click | inert — correct |
| `document.body.style.overflow` | `"hidden"` — correct |
| **Tab ring while busy** | `NEXTJS-PORTAL` → `A :: Admin Portal` → `A :: Manage Blogs` → `A :: Manage Recipes` → `A :: Manage Classes` |

That last row is the finding. **The focus trap does not hold during the busy state.** Tab walks
out of the dialog and onto the admin navigation links behind the scrim, which are live — a
keyboard user can navigate away mid-delete. So the dialog is not trapping the admin; it is
leaking them onto live controls while body scroll is locked and the page behind cannot be
scrolled by keyboard. The most likely cause is that disabling both action buttons leaves the
trap with a single member and its wrap logic has no branch for that, but I am reporting the
measured behaviour rather than the mechanism.

The consequence for the question asked: **"is a trapped admin with no way out acceptable?" is
not currently the live question, because the admin is not trapped.** Fix the leak first; then
the answer to the original question is yes, with three conditions, none of them a timeout:

1. **Disable the `×` while busy.** Already in flight. A control that does nothing must not be
   focusable — the same principle `.button:disabled` already states in `AdminButton.module.css`.
2. **Make the trap hold at one member and at zero.** When every control is disabled, focus
   belongs on the dialog panel itself (`tabindex="-1"`, which `Modal` already focuses on open),
   not outside it. Without this, item 1 makes the leak *worse*: disabling the `×` empties the
   ring entirely.
3. **Give the busy state a voice.** `"Deleting…"` is a label change nobody is told about.
   `role="status"` on the dialog's busy region so a screen-reader user learns why nothing
   responds. This is the real answer to "does a hung request need an escape": most of what an
   escape hatch would provide is *information*, and information is cheaper and safer than an
   exit.

*If a bound is genuinely wanted later*, put it on the `fetch` — `AbortSignal.timeout()` — not
on the dialog. A rejected request already routes into the `actionError` path both lists own, so
a timeout produces one failure mode that already has a UI instead of a second one that does
not. That is the shape to reach for, and only once something has actually hung.

---

## Six highest-impact problems

Ranked by cost to the working admin, not by ease of fix.

**Re-ranked after the dialog measurement.** This list ran to five until I measured the
confirmed-delete focus paths at the coordinator's request. That finding displaces everything
else — it is the only one in this review that can silently corrupt data — so it enters at
number one and the original five shift down. Nothing was removed.

---

### Problem 1 — A confirmed delete loses the admin's place, and on one path types into a field they cannot see

**Problem.** Four measured outcomes for the same action, across the five confirm sites that
were supposed to be unified by one primitive. Full method and values in "The two dialog
questions" above; the short form:

| Path | Settled `document.activeElement` |
|---|---|
| `/admin/blogs`, `/admin/recipes` delete | **`BODY`** — never recovers |
| `/admin/classes` session delete, successor present | successor's Edit button — **correct** |
| `/admin/classes` session delete, list empties | `INPUT[type=datetime-local]` |
| `/admin/classes` photo delete | `INPUT[type=text]`, label **"Caption"** — and **the next keystrokes enter it silently** |

I typed `leaked text` after a settled photo delete and read the field back: `"leaked text"`.
That field is labelled to the admin as *"Optional. Saved with the next photo you upload."*

**Why it matters.** Delete is the most repeated destructive action in the portal and the one
the whole `AdminConfirmDialog` exists to make safe. Three things are wrong at once, in
increasing order of severity:

- On two of five screens the admin loses their place entirely. Returning from `<body>` to the
  next row's Delete on `/admin/blogs` is **eight Tab stops**. An admin clearing five posts
  pays that five times.
- On the emptied-list path focus lands in a date field. It is harmless only because
  `datetime-local` discards letters — luck, not design.
- On the photo path it is not an accessibility inconvenience, it is a **silent data-integrity
  bug**: a keystroke after a delete attaches text to the *next photo uploaded*, with no visible
  cause, no error, and nothing on screen to indicate it happened.

This outranks everything else in this review because it is the only finding that can corrupt
data, and because it affects the action the admin performs most.

**Why this is a defect in the landing rule, not in the walk.** The ancestor walk is good work
and the Director's measurement of it is correct — on the session delete it lands on the Edit
button of the record that took the slot, at the deleted row's exact y. Do not revert it. The
walk is being asked to land on anything `FOCUSABLE_SELECTOR` matches, and that set correctly
includes text inputs because a **trap** must reach them. A **restore** must not put the user
in one they did not ask for. Those are two different questions that currently share one answer.

**Evidence.** `.../scratchpad` run output, reproduced twice per path; `useModalDismiss.ts`
`firstFocusableWithin` / `FOCUSABLE_SELECTOR`; `AdminBlogList.tsx` `confirmDelete`
(un-awaited `reload()`) vs `AdminClassManager.tsx` `confirmDeleteSession` (`await reload()`).

**Recommended change**, in dependency order:

1. `src/app/(pages)/admin/blogs/AdminBlogList.tsx` and
   `src/app/(pages)/admin/recipes/AdminRecipeList.tsx` — `await reload()` before
   `setPendingDelete(null)`. One keyword each. This alone converts `BODY` into the working
   tier-2 landing, because it is the sequencing difference that makes `/admin/classes` work.
2. `src/hooks/useModalDismiss.ts` — add `RESTORE_LANDING_SELECTOR =
   "a[href],button:not([disabled])"` beside `FOCUSABLE_SELECTOR`, with the comment explaining
   why landing is narrower than cycling, and have `firstFocusableWithin` use it. This removes
   the caption-field leak and simultaneously delivers what the hook's own empty-list comment
   already says it wants — *"its first control is the one that creates a new record"* — which
   is "Add session", not that form's first field.
3. Optional and worth a separate order: a `role="status"` announcement on the list
   (*"Deleted. 4 posts remain."*) to cover the 700–880ms window in which focus is legitimately
   nowhere while the refetch lands.

**Priority: Critical.**

---

### Problem 2 — The newsletter preview is sized by the form beside it, not by the email inside it

**Problem.** At 1440 the white preview plate measures **568 × 648px** while the email it
holds is ~150px tall. That is 368,000px² of pure white — **28% of the viewport** — and white
is 21:1 against `--surface-0` while the brightest thing in the admin's own palette is 13.57:1.
The white slab is the first, second and third thing the eye lands on. The hierarchy of the
page is inverted: the *preview* outranks the *composer*.

The mechanism is specific and it is not the iframe. Computed: `.previewPlate` is
`height: 648px` with `padding: 0` and `border: 1px solid rgba(242,235,227,0.14)`. The plate
has no height of its own — it is a stretched grid item taking the height of the form column
in the adjacent track. A three-line email and a forty-line email produce the identical 648px
slab. And the 14%-alpha hairline that was supposed to frame it is invisible against white,
so the research's "frame it as a specimen" instruction rendered as nothing at all.

**Why it matters.** The research named this surface as the one place "everything on the admin
is dark" would be false, and asked for it to be *framed*, deliberately, so it reads as a
specimen under inspection. Unframed and oversized, it reads exactly as the failure mode the
research named: a hole punched in the page.

**Evidence.** `.screenshots/review/newsletter-filled-1440.png` (iframe box `[753, 261, 566,
646]`, content ends at y≈410); `.screenshots/review/admin_newsletter-1440x900-vp.png` for the
empty state. Computed style recorded above.

**Recommended change.** In
`src/app/(pages)/admin/newsletter/AdminNewsletterComposer.module.css`:

1. On the two-column composer grid, `align-items: start` — this is what stops the plate
   inheriting the form's height.
2. On `.previewPlate`: `padding: var(--space-s);` (16px) and
   `border-color: var(--hairline-strong);`. The 16px dark gutter is what makes the hairline
   visible at all and what turns the white rectangle into a mounted specimen. This is the
   `--space-m` clearance the research asked for, at the smaller step because the plate is
   already large.
3. On `.previewPlate`: `block-size: clamp(18rem, 46vh, 28rem);` and on the iframe
   `block-size: 100%;` so the plate scrolls its own overflow rather than growing. 28rem
   (448px) is 31% shorter than today's 648px and still 60% taller than the research's
   `min-height: 280px` starting point.

**Priority: Critical.**

---

### Problem 3 — In the photo album, Save and Delete are pixel-identical at rest

**Problem.** Measured on `/admin/classes`:

| | Rest ink | Rest rule | Box (1440) | Box (390) |
|---|---|---|---|---|
| Save caption for Photo 1 | `rgba(242,235,227,0.66)` | `rgba(242,235,227,0.38)` | 180×40 @ (120, 736) | 171×40 @ (20, 2556) |
| Delete Photo 1 | `rgba(242,235,227,0.66)` | `rgba(242,235,227,0.38)` | 180×40 @ (120, 784) | 171×40 @ (199, 2556) |

Identical colour, identical rule, identical size, **8px apart**. At 1440 they are stacked with
Delete last; at 390 they are side by side under a thumb. `AdminButton.module.css` gives
`.secondary` `--ink-2`, and `AdminCardGrid` `.grid` correctly neutralises `.danger` to
`--ink-2` inside a list — so the two tones converge on the same value and the rank vanishes.

**Why it matters.** The portal's single ranking mechanism is the ink tier. In a row it works:
Edit at 13.57:1 sits visibly above Delete at 7.35:1. In the tile there is no tier below
`--ink-2` for Delete to occupy, because Save is already there. The handoff's stated principle
— *"Delete last and one ink tier down"* — is structurally unavailable in the album, and
nobody checked that when the neutral-at-rest fix landed. The result is a save control and a
destroy control that are visually the same object, 8px apart, on a phone.

There is a second, independent inconsistency on the same screen: **"Save content" and "Add
session" are `primary` (copper rule, ink-1), and "Save caption" is `secondary`.** The same
verb, on the same screen, in two treatments — the handoff's own principle 1.

**Why the stated reasoning does not rescue it.** `AdminButton.module.css` argues *"A red-ruled,
red-lettered control beside a neutral one is already unmistakable."* That is true, and it is
exactly why the dialog needs no further help. But inside a grid the danger control is **not**
red-ruled and red-lettered — the grid neutralises it, by design. The argument was written for
the singular case and then inherited by the repeated case, where its premise is false.

**Evidence.** Computed style above; `.screenshots/review/admin_classes-1440x900-full.png`
(tiles at y≈1836–2200) and `.screenshots/review/classes-390-full.png`.

**Recommended change.** In `src/app/(pages)/admin/classes/AdminClassManager.tsx`, change the
per-tile caption save button from `tone="secondary"` to `tone="primary"`. That is one word,
and it does three things at once: it restores the one-tier gap between the constructive and
the destructive control inside the tile (ink-1 13.57:1 above ink-2 7.35:1, the same gap the
rows use), it makes the three Save controls on the screen agree with each other, and it costs
no new token. Copper on a repeated control is the trade — acceptable, because the album is
one panel and not a ten-record list.

If the Director prefers not to spend copper twelve times, the alternative is to keep
`secondary` and shorten the Delete: give the tile's Delete `inline-size: auto` and let it sit
at its intrinsic ~100px width against a full-width Save, so the pair is ranked by mass rather
than by tier. Either is defensible; the present state, where they are ranked by nothing, is
not.

**Priority: Critical.**

---

### Problem 4 — `/admin` opens on a doubled rule, at every viewport

**Problem.** The landing draws a continuous 1px copper rule at y200 (the page header), then a
40px gap, then a **broken** 1px hairline at y240 — the `AdminNavCard.card::before` opening
rule, drawn separately on each of the two top cells, with a 32px nick in the middle where the
64px column gap sits. At 390 the same pair is 32px apart with the lower rule continuous. It
reads as a rendering accident: two parallel horizontals with nothing between them, the lower
one interrupted.

**Why it matters.** This is the identical defect consolidation item 3 was created to fix —
*"The **first** panel drops its own hairline and its top padding and takes the header's copper
rule as its opener (`.panel:first-of-type`)"* — and it was fixed for `AdminPanel` and not
swept to `AdminNavCard`. It is the first 250px of the admin's front door, so it is the first
thing anyone sees, and it makes a deliberately composed 2×2 block look unfinished.

**Evidence.** Border census, `/admin` 1440×900: rules at y200 (`1px rgba(184,115,51,0.8)`,
x120 w1200) and `::before` hairlines at the tops of the four nav cells (boxes at y240 x104
w600 and y240 x736 w600). Visible in `.screenshots/review/admin-1440x900-vp.png` and more
starkly in `.screenshots/review/admin-390x844-vp.png`.

**Recommended change.** Apply the mechanism this layer already owns — a custom property set
by the list and read by the child, exactly as `--admin-danger-rule` works:

1. `src/components/admin/AdminNavCard.module.css`, `.card::before`:
   `border-top: 1px solid var(--admin-navcard-rule, var(--hairline));`
2. `src/components/admin/AdminCardGrid.module.css`, in the `.cards` block:
   `.cards > :first-child { --admin-navcard-rule: transparent; }` and, inside the existing
   `@media (min-width: 900px)`, `.cards > :nth-child(-n + 2) { --admin-navcard-rule:
   transparent; }` — because at two columns the first *row* is two items and below 900px it
   is one.
3. `src/components/admin/AdminPageLayout.module.css`, `.header`: the landing's 40px
   `margin-bottom` should collapse for this composition the same way `.panel:first-of-type`
   drops its top padding, so the copper rule genuinely opens the block instead of floating
   40px above it.

**Also worth the Director's judgement, same surface:** the page ends at y513 of a 900px
viewport — **387px, 43% of the screen, empty** — and the four destinations it offers are
verbatim the four links already in the header bar two inches above them. The landing is
currently a page with no information on it. The cheapest fix that earns it back is a count
per destination (`5 posts`, `3 recipes`, `2 sessions · 3 photos`, `41 subscribers`) in the
`.hint` slot, which turns navigation into a dashboard without adding a component. Noted, not
demanded — it is a scope question for the Orchestrator.

**Priority: High.**

---

### Problem 5 — The record title is inert, so the only way into a record is a 67px button 963px away

**Problem.** `AdminCard.tsx` renders `<p className={styles.title}>{title}</p>`. The title is
not a link, not a button, and carries no handler. The row carries no handler either. The
only route into a record is the **67×40 "Edit" button at x1155**, while the title it belongs
to starts at **x192** — 963px of pointer travel at 1440.

Meanwhile the whole 1232px row tints to `--surface-1` on hover.

**Why it matters.** Two reasons, and the second is the stronger.

First, the habitual gesture in every content list the research examined is *click the name*.
Statamic, WordPress and Ghost all make the title the primary target. The research file itself
records the requirement in boundary gap 6: *"The row anatomy proposed here assumes **the title
is the link** and the actions are siblings, not descendants."* The `div[role="button"]`
problem was correctly fixed; the replacement affordance was never added, so the row went from
*wrongly* clickable to *not clickable*.

Second, the row still lights up. At 1.056:1 the tint is the documented "which row am I on"
locator rather than a false click affordance, so I am not calling it a defect on its own —
but it does mean the row behaves like the public `ContentRow`, which *is* a link, while
offering none of its reach.

**Why the counter-argument does not hold.** One could argue the admin is deliberately
explicit: two named controls, no hidden targets. That is a good argument for keeping Edit
where it is. It is not an argument for making the title unreachable — WordPress ships both
the title link and the row-action Edit, and the redundancy costs one tab stop.

**Evidence.** `AdminCard.tsx:73`; measured boxes `.title` at x192 w939.2, `.action` "Edit" at
x1155.2 w67.1, `/admin/blogs` 1440×900. Hover tint verified at `rgb(28, 22, 19)` on
`.screenshots/review/row-hover-1440.png`.

**Recommended change.** In `src/components/admin/AdminCard.tsx`, accept an optional
`onTitleActivate?: () => void`. When present, render the title as
`<button type="button" className={styles.titleButton}><span className={styles.titleText}>`
carrying **the gold underline-wipe `AdminNavCard.module.css` `.labelText` already
implements** — same mechanism, not a second one — and leave the trailing Edit in place. In
`AdminBlogList.tsx` and `AdminRecipeList.tsx` pass `onTitleActivate={() => handleEdit(record)}`.
`AdminClassManager.tsx`'s session rows should pass the session edit handler the same way.
That gives a 939px primary target, preserves the explicit control, and reuses a hover
vocabulary the portal already ships.

**Priority: High.**

---

### Problem 6 — 80px of empty gap brackets every list header, and the copper doubles at the top of the page

**Problem.** Two related spacing decisions, both measurable, both costing something.

*(a) The missing row.* `.root` sets `padding-block-start: var(--space-l)` (40px) and `.header`
sets `margin-bottom: var(--space-l)` (40px). The result is a 160px header with 80px of pure
gap bracketing it, and 297.8px of chrome before the first record against the research's
budgeted 232px. That single difference is the whole gap between the claimed 8.2 records and
the delivered 7.53.

*(b) The copper doubles.* The active nav link's 2px copper underline sits at y46; the admin
bar's 2px copper rule sits at y56. **Two 2px copper horizontals, ten pixels apart, spanning
most of the width.** At 390 they are the same ten pixels apart. The nav marker and the
structural rule are reading as one thick smeared line rather than as two marks with different
jobs — which is the exact hierarchy-flattening the "copper once per page" argument was
written to prevent, happening in the one place nobody looked.

**Why it matters.** (a) The eighth record is the difference between "the page holds my
collection" and "the page holds most of it", and it is available for two token steps. (b) A
system this disciplined about copper should not be spending it twice within ten pixels; it is
the only place in six screens where the restraint visibly slips.

**Evidence.** `AdminPageLayout.module.css:75` and `:141`; measured header bottom at y257.8 and
list top at y297.8 on `/admin/blogs`. Border census: `AdminHeader .link` bottom 2px
`rgba(184,115,51,0.8)` at y48, `AdminHeader .header` bottom 2px `rgba(184,115,51,0.8)` at y58.

**Recommended change.**

1. `src/components/admin/AdminPageLayout.module.css`, `.root`: `padding-block-start:
   var(--space-m)` (40 → 24).
2. Same file, `.header`: `margin-bottom: var(--space-m)` (40 → 24).
   Together these return 32px → list area 634.2px → **7.93 rows**, which delivers the claim
   without touching a single type or control value.
3. `src/components/Layout/AdminHeader.module.css`, `.linkActive`: change the 2px copper
   underline to `2px solid var(--color-accent-gold)`, or drop the rule and mark the active
   link with `--ink-1` against the siblings' `--ink-2` (which it already does — the rule is
   redundant with an existing signal). Ghost and Linear, both cited in the research, mark the
   active nav item with ink or a whisper-fill and reserve the accent for meaning.

**Priority: Medium.** Neither half changes what the admin can do; both change how finished it
looks and how much it holds.

---

## Responsive review

### 1440×900

The list screens are at their best here: 7.5 records, a 939px title track, a trailing action
column at a fixed x. `/admin/login` is the sparsest composition at this width — the form
column grows to 720px while the form stays at 384px, so 336px of the dark half is empty.
Capping the form column (`max-inline-size: 34rem` with the residual going to the photograph)
would make 1440 as composed as 1024 already is. `/admin/newsletter` is at its worst here,
because the taller form column makes the white plate taller too (Problem 2).

### 1024×768

Captured and reviewed for all six routes; **nothing here introduces a breakpoint**, and the
handoff was right that 1024 is uneventful. The gutter contracts from 80px to ~52px and every
composition holds. `/admin/classes` caps its form fields at 704px, leaving ~270px of empty
right gutter — correct, that is a measure cap on a form, not dead space. `/admin/login` is the
single best-composed screen in the portal at this width: the photograph takes exactly half,
the form has a 512px column and a 384px measure inside it, and the copper-ruled Sign in button
is the one control on the screen.

### 390×844

**No horizontal overflow at any route** — `scrollWidth === clientWidth === 390` measured on
the tallest page (`/admin/classes`, 3129px). Every control clears 40px in both axes. The
mobile treatment is genuinely re-composed rather than collapsed: row actions take their own
full-height line beneath the record (`--admin-card-actions-basis: 100%` on `.rows` only, so it
cannot reach the album), the album goes to one column, `NEW POST` goes full-width, and the
title ellipsis still fires correctly ("Cocktails for a Gray Day: War…").

Three mobile-specific problems:

1. **`/admin/newsletter` puts the send controls above the preview.** Measured DOM order at
   390: subject → reply-to → HTML → **SEND TEST EMAIL → SEND TO ALL SUBSCRIBERS** → PREVIEW
   (iframe at y967). The admin is asked to broadcast before they can see what they are
   broadcasting. Fix: at the narrow breakpoint, give the preview column `order: -1` relative
   to the action row, or restructure the composer to
   `grid-template-areas: "fields" "preview" "actions"`. **This is the only genuinely wrong
   reading order in the portal.**
2. **The album's Save and Delete go side by side at 171×40, 8px apart**, with identical paint
   (Problem 3). SC 2.5.8 is met; visual differentiation is zero. This is the worst instance
   of Problem 3, not a separate finding.
3. **The mobile nav panel has no scrim and does not cover the page.** It is a 210px panel
   anchored top-right on a 390px screen, so 180px of fully-lit page content sits beside it
   and the panel's left edge cuts through the "Blog posts" heading. It reads as a box stuck
   onto the page rather than as a mode the page has entered. The copper left-bar on the
   active item is a nice touch and should stay. Consider a `rgb(0 0 0 / .5)` scrim on the
   content behind it — the dialog already uses 0.65 and the vocabulary exists.

Minor, verified: the menu toggle sets `aria-expanded` correctly (`false` → `true`) but
carries **no `aria-controls`**. One attribute in `AdminHeader.tsx`.

---

## Reference fidelity

| Reference | Extracted idea | Landed? |
|---|---|---|
| **Statamic — actions visible at rest** (MM) | `opacity: 1` at rest, no hover gate | **Yes, fully.** Every action on every row and tile, at every width, with no opacity transition. The single most important research finding, and it is the one most cleanly implemented. |
| **Statamic — thumbnail sized to the text block** (MM, 32px in a 57px row = 0.56) | Size the thumb to the content, not to a number | **Yes.** 56 ÷ 80 = **0.70**, above Statamic's ratio and far below the public row's 0.36–0.41, exactly where the research derived it. |
| **Statamic — empty state keeps its controls** (VV) | The control band must survive the state it caused | **Yes, verified live.** A `zzzzqqq` search produced *"No posts match "zzzzqqq". Clear the search to see all of them."* at `--ink-2`, 24px block padding, with the search field still mounted and a **"Clear"** control present. Consolidation item 2's 64px → 24px is confirmed by render, not only by computed style. |
| **Statamic — two-band header** (MM) | Title + primary on band 1, search + count on band 2 | **Yes** on `/admin/blogs` and `/admin/recipes`. **Not applied** on `/admin` and `/admin/newsletter`, which use a title + dek and no eyebrow — see "Vocabulary drift" below. |
| **WordPress — row actions are words, ruled, not 19.9px links** (MM) | Words at a legal target size | **Yes.** 67×40 and 90×40 against WordPress's 19.9px. |
| **WordPress — restraint on the destructive colour** (MM) | Neither hidden nor shouted | **Yes, and improved on.** Neutral at rest, `#e2645f` at 5.60:1 on commitment — where WordPress's own `rgb(179,45,46)` would have been unusable on this ground. |
| **NN/g — confirmation dialogs** (TV) | Name the object, name the buttons, prefer undo | **Yes on the first two**, exhaustively. Undo remains out of scope (hard delete) and is still correctly recorded as a backend boundary gap. |
| **Grafana — control boundaries must outrank content separators** (MM, 0.20 alpha) | Two-tier line system | **Yes.** `--hairline` 0.14 (1.42:1) separates content; `--hairline-strong` **shipped at 0.38, measuring 3.20:1** — above the researched 0.36/3.00 and comfortably over WCAG 1.4.11's 3:1 on both grounds. |
| **Grafana — the header must be two bands, not four** (VV, ~200px warning) | Chrome budget | **Partially.** Two bands, but 297.8px of chrome — closer to Grafana's warning figure than to the research's 232px budget. See Problem 6. |
| **Ghost / Linear — mark the active nav by ink, not by an accent fill** (VV-S) | No filled pill | **Half.** The filled copper pill is gone (good), but it was replaced by a copper *rule* ten pixels above another copper rule. Ghost and Linear both use ink or a whisper-fill. See Problem 6(b). |
| **Research: "the title is the link"** (boundary gap 6) | Row anatomy assumption | **No.** The `div[role="button"]` was correctly removed; nothing replaced its reach. See Problem 5. |
| **Research: "frame the newsletter iframe as a specimen"** | `--hairline` border + `--space-m` clearance | **No.** The border shipped; the clearance did not, and without it the border is invisible against white. See Problem 2. |

**One reference left no meaningful trace**: Statamic's hairline-grouped row menu was correctly
and explicitly rejected (two actions do not need a menu), and that rejection is honoured — no
overflow menu exists anywhere. Recorded as a *correct* absence, not a gap.

---

## Anti-generic-AI audit

I looked specifically for the tells and found almost none. This is not a template.

| Pattern | Present? |
|---|---|
| Purple/blue gradients, glowing blobs | No. One hue plus ink, verified by sweep. |
| Glassmorphism / `backdrop-filter` | **No — zero elements across six routes.** The old `blur(14px) saturate(1.1)` `glassOverlay` is gone. |
| Rounded containers, pill shapes | **No — zero non-zero `border-radius` across six routes.** |
| Drop shadows | **No — zero.** |
| Gradient text | No. The only gradient is the gold underline-wipe, which is a 1px background-size transition. |
| Eyebrow badge above every heading | Partially, and it is the *inverse* problem — see below. |
| Icons beside every heading | No. There are no decorative icons in the portal at all. |
| Everything centred | No. Everything is left-aligned to a 1200px spine; the only centred composition is `/admin/login`, which is correct. |
| Repeated three-card grids | **No, and this is the headline result** — the 3-up 300×320 card grid was the thing being replaced, and it is gone from both lists. |
| Identical feature cards | The album tiles are identical by necessity (they are photographs), which is correct. |
| Floating dashboard mockups | No. |
| Excessive scroll animation | **No.** The only motion in the portal is a 200ms colour/border transition and a 320ms underline wipe, both collapsed to `0.001ms` under `prefers-reduced-motion` — verified by rendering the page with `reducedMotion: "reduce"`. |

**One genuine inconsistency, which is the opposite of the usual AI tell.** The eyebrow appears
on three of five shell screens (`/admin/blogs`, `/admin/recipes`, `/admin/classes` — all
reading `Manage`) and is **absent on `/admin` and `/admin/newsletter`**, which instead use a
larger title plus a dek and carry no primary in the header. Measured header heights: 160px
(blogs/recipes), 155px (classes), **102px** (landing and newsletter). So the portal ships
**two page-header vocabularies across five screens**. Consolidation item 5 settled the
eyebrow's *wording*; nobody checked its *presence*. Whichever way the Director settles it —
and I would give `/admin/newsletter` an eyebrow and a `--fs-h2` heading so four of five agree,
leaving the landing deliberately distinct as a front door — it should be one decision, stated.

On the handoff's question *"is `Manage` the right word before three call sites adopt it"*:
yes. It names the screen's function, it reads correctly above all three nouns
("Manage / Blog posts", "Manage / Cocktail recipes", "Manage / Classes"), and it is the word
the header nav already uses. Adopt it, and extend it to the newsletter as `Manage` above
`Newsletter` or keep `Send` — either is defensible, the absence is not.

---

## Accessibility / UX concerns

Verified from the rendered page, not from source.

**Strong, and not to be disturbed:**

- **Focus visibility is excellent and universal.** Every interactive control across all six
  routes takes `outline: 2px solid rgb(226,176,126)` at `outline-offset: 2px`. Gold measures
  **9.66:1 on `--surface-0`** — the most visible focus indicator I could have asked for on
  this ground. Verified on row actions, header links, sign out, primary buttons, inputs,
  textareas, the drag grip, the dialog close and both dialog buttons.
- **The hidden file input delegates its focus correctly.** The `<input type="file">` is 1×1px,
  which would normally be a focus-visibility failure — but the 1200×80 upload label takes the
  gold ring via `:focus-within`. Measured. **Not a defect; do not "fix" it.**
- **Contrast at every tier actually used:** ink-1 13.57:1, ink-2 7.35:1, ink-3 5.43:1, gold
  9.66:1, danger 5.60:1, `--hairline-strong` control boundaries 3.20:1, copper primary
  boundaries 3.60:1. Every one clears its applicable threshold. `--color-error` (3.69:1, fails
  AA) appears **nowhere** in the admin — the research's central colour finding was fully acted
  on.
- **Hit targets:** every control is ≥40px in the constrained axis at both 1440 and 390. The
  drag grip is 50×40 at desktop and 47×40 at mobile. Nothing is below SC 2.5.8's 24×24, with
  8px spacing between adjacent pairs.
- **Dialog semantics:** `role="dialog"`, focus trapped to three controls and wrapping, Escape
  dismisses, **focus returns to the invoking control**. Verified at both viewports.
- **Row actions are named for their record** — `"Delete session: Sep 21, 2026, 6:00 PM"` — so
  a screen-reader user never hears eight identical "Delete" buttons.
- **Reading order matches visual order** on all list screens. The apparent violations my tab
  audit reported inside the album are false positives: the album is a grid, so per-tile DOM
  order (grip → caption → save → delete) is correct and only looks out of order against a raw
  y-sort.

**Concerns, in order:**

1. **A confirmed delete loses focus, and on the photo path captures keystrokes.** Measured
   values in the dialog section; Problem 1. The most serious accessibility finding here, and
   the only one in this review that can alter stored data.
2. **The focus trap does not hold while the confirm dialog is busy.** Measured: Tab walks out
   of the dialog onto `Admin Portal` / `Manage Blogs` / `Manage Recipes` / `Manage Classes`
   behind the scrim, all live, while body scroll is locked. The `×` is enabled and does
   nothing. Q2 above.
3. **Focus is dropped on the inline session edit.** Clicking "Edit session" unmounts the
   focused button and `document.activeElement` becomes `BODY` — measured. SC 2.4.3. A
   keyboard user is returned to the top of a 2273px document mid-task, and the same happens
   again on Cancel. Fix: move focus to the first field of the inline form when it opens, and
   back to the row's Edit button when it closes. `AdminInput` now forwards `ref`
   (consolidation item 6), so the mechanism is already in place. **This is the highest-value
   accessibility fix available and it is small.**
4. **`/admin/newsletter` at 390 places the send controls before the preview** — a reading
   order that is wrong in the substantive sense rather than the DOM sense. See the responsive
   section.
5. **The mobile nav toggle has no `aria-controls`.** `aria-expanded` toggles correctly; the
   association to the panel is missing.
6. **The empty-plate degrade reads as a failure rather than as an absence.** All five
   `/admin/blogs` records return `coverPhoto: null` from the API, so the list shows five 56px
   boxes each outlined at `--hairline`. Five empty outlined squares down the left edge read as
   five broken images. **This is partly environmental** — the demo data has no covers, and
   `AdminBlogList.tsx` deliberately passes `{ s3Key: null }` with a stated reason ("a list of
   mostly-illustrated posts stays even") — but `/admin/recipes` shows the case that is purely
   compositional: two photographed rows with an outlined empty box between them, which reads
   as one image that failed to load rather than as one record without a cover. Consider
   dropping the 1px rule on `.mediaEmpty` (`AdminCard.module.css:177`) so an absent cover is a
   quiet void rather than an outlined frame; the rule is only needed under hover, where it
   could be restored conditionally.
7. **`<input type="datetime-local">` renders at 46px beside a 44px text input** in the same
   "Add a session" row — a 2px baseline mismatch caused by the native picker indicator, and
   the only place in the portal where browser chrome is visible (including the locale's
   leading-comma placeholder `", yyyy-mm-dd --:--"`, which reads as a rendering fault).
   `AdminInput.module.css` `.control` can take `min-block-size: var(--control-min);
   block-size: 2.75rem;` to force agreement. Cosmetic, but it is the last browser-default
   surface left in a portal that removed all the others.
8. **The album caption field is 180px wide inside a 1200px spine**, truncating captions at ~19
   characters. The tile is 180px because `auto-fill` holds an 11rem track — correct for the
   plate, wrong for the field. Consider expanding the caption field to the tile row's full
   width on focus, or moving caption editing into the existing dialog vocabulary.

---

## What genuinely works — do not "fix" these

Listed so the refinement pass does not undo them.

1. **The destructive-confirmation dialog, up to the point of confirming.** Named record, named
   buttons, "cannot be undone", red only on the confirming control, and a focus trap that
   cycles three controls and returns focus to the invoking button on Escape and on Cancel —
   all measured. Better than the references it was derived from. **Keep the composition, the
   copy and the cancel paths exactly as they are**; Problem 1 and the Q2 items are about the
   success path and the busy state, not about any of this.
2. **The ancestor-walk focus restore in `useModalDismiss.ts`.** It works: on a session delete
   it lands on the Edit button of the record that took the slot, at the deleted row’s exact y.
   The idea and the index-capture are right. Do not revert it — narrow what it may *land* on
   and fix the two consumers that call it at the wrong moment.
3. **The danger-at-rest contract** (`AdminButton.module.css` `.danger` +
   `AdminCardGrid.module.css` `.grid`). Repetition-not-severity is correct, the custom-property
   mechanism is the right one, and the rendered result is identical across the row and the
   tile. Problem 3 is about the *neighbour*, not about this rule.
4. **The gold focus ring at 2px / 2px offset**, 9.66:1, on every control including the
   delegated file input. Best-in-class.
5. **The 80px row and its `56 / 939.2 / 164.8` track.** The geometry is right; only the header
   above it needs trimming.
6. **The bleeding hover tint** (`margin-inline: calc(-1 * var(--space-s))`, tint to
   `--surface-1`, rule inset to the spine). Subtle, correct, and identical between `AdminCard`
   and `AdminNavCard` so the landing and the lists tint the same width.
7. **Zero radius, zero shadow, zero glass, zero blurred photography** — verified exhaustively.
   The doctrine held under a full-element sweep of six routes.
8. **The empty state.** 24px block padding, `--ink-2`, the search still mounted, a "Clear"
   control present. Consolidation item 2 is confirmed by render.
9. **`prefers-reduced-motion` handling.** Transitions collapse to 0.001ms rather than being
   removed, so the end state still arrives. Verified with a reduced-motion browser context.
10. **`/admin/login` at 1024.** The one place the photograph earns its keep, and the decision
   to keep it was right.
11. **The public/admin structural rhyme.** `/recipes` and `/admin/recipes` are the same page
    at two densities. That is the whole brief, achieved.

---

## Recommended refinement order

1. **Problem 1, step 1** — `await reload()` in `AdminBlogList.tsx` and `AdminRecipeList.tsx`.
   Two keywords, and it repairs the most-repeated action on the two busiest screens.
2. **Problem 1, step 2** — `RESTORE_LANDING_SELECTOR` in `useModalDismiss.ts`. Closes the
   silent keystroke capture on the photo path and fixes the emptied-list landing for free.
3. **The busy-dialog leak** (Q2, items 1–3): disable the `×`, make the trap hold at one and
   at zero members, announce the busy state. Items must land together — disabling the `×`
   without fixing the trap empties the focus ring.
4. **Problem 3** — `AdminClassManager.tsx`, one word (`tone="primary"` on the caption save).
   Highest value per character in this list, and it removes a mis-tap hazard on a phone.
5. **The dropped focus on the inline session edit** (accessibility concern 1). Small, and the
   `ref` forwarding it needs already landed.
6. **Problem 2** — `AdminNewsletterComposer.module.css`: `align-items: start`, a 16px dark
   gutter, a capped plate height. Three declarations, and it fixes the worst screen.
7. **The newsletter mobile order** (preview before send). Same file, same pass.
8. **Problem 4** — the landing’s doubled opening rule, via `--admin-navcard-rule`.
9. **Problem 6(a)** — the two `--space-l` → `--space-m` steps in `AdminPageLayout.module.css`
   that deliver the eighth row.
10. **Problem 5** — the title as a target. Largest change here; it touches `AdminCard.tsx` and
    three consumers, and it should be its own work order.
11. **Problem 6(b)** — the doubled copper at the top of the bar.
12. **The page-header vocabulary decision** (eyebrow present on three of five). A Director
    decision first, then one small edit.
13. Cosmetic tail: `aria-controls` on the mobile toggle, the datetime input’s 2px, the
    `.mediaEmpty` rule, the `/admin/login` form-column cap at 1440.

**Sequencing.** Items 1–3 touch the shared dialog layer and the two list consumers; 1 and 2
are independent of each other but both should land before 3 is judged. Items 4–9 touch
disjoint files (`AdminClassManager.tsx`, `AdminNewsletterComposer.module.css`,
`AdminCardGrid.module.css` + `AdminNavCard.module.css`, `AdminPageLayout.module.css`) and can
run in parallel with each other and alongside 1–3. Item 10 changes a shared component's
contract and should be serialised last.

---

## Anything worse than what it replaced?

I checked this deliberately, against `git show 9beccf3` and the pre-existing captures.

**Nothing is worse.** The previous admin was a 3-up grid of 320px glass cards on a blurred
full-bleed JPEG, with `window.confirm`, two byte-for-byte copies of `.adminCard`, a
`div[role="button"]` containing two real buttons, and `--color-error` (3.69:1, below AA) used
as a danger signal in five places. Every one of those is gone, and the replacements are
measurably better on density, contrast, target size, keyboard reach and screen-reader
labelling.

The closest thing to a regression is the **empty 56px plate**: the old card had no thumbnail
slot at all, so a record without a cover cost nothing, and now it costs 72px of reserved
width and draws an outlined box that reads as a broken image. That is a narrow trade the
research made knowingly and it is worth it the moment covers exist — but it is the one place
the new design asks for something the data does not yet provide, and it is why concern 4
above is worth acting on rather than waiting for the data.

---

## Final verdict

**Needs another refinement pass.**

Not a revision. The direction is right, the doctrine held under an exhaustive measurement
sweep, the brand transfer succeeded, and the confirm dialog’s composition and copy are better
than the references they came from. The visual work is close to done.

What holds it back is no longer mainly visual. Two screens (`/admin/newsletter`, `/admin`)
ship compositions that were not finished, one screen (`/admin/classes`) ranks a destroy
control identically to a save control 8px away, the title of every record is unreachable, and
the density claim is 0.5 rows short for reasons two token steps away from being fixed. Those
were the whole story until the coordinator asked for a focus measurement, and that measurement
found the thing this review would otherwise have missed: **the portal loses the admin’s place
on the action they repeat most, and on one path silently types into a field they cannot see.**

I want to be plain about what that changes in my assessment. A design pass is not finished
when the pixels are right and the most-repeated action drops the user on the floor. The
delete flow was the single decision this pass was proudest of — it replaced `window.confirm`
and it met every criterion the research set — and it was never exercised past the moment of
confirmation. That is not a criticism of the agents who built it; it is exactly the class of
gap an independent pass exists to find, and it only surfaced because someone asked for a
measurement rather than an opinion.

Items 1–3 of the refinement order are small, specific, and mostly two keywords and a selector.
With those and the six problems addressed, this reaches **Ready with minor polish**.

---

## Boundary gaps reported to the Orchestrator

Outside my review boundary; not acted on.

1. **Reading order on `/admin/newsletter` at 390 is a behaviour change**, not only a style
   change (the admin can broadcast before previewing). Testing Agent should cover it.
   *Owners: Frontend UI Agent, Testing Agent.*
2. **Focus management on the inline session edit** is a React lifecycle concern in
   `AdminClassManager.tsx`, not a CSS one. *Owner: Frontend UI Agent.*
3. **`useModalDismiss.ts` and `Modal.tsx` are shared with the public site.** Both changes I
   recommend in Problem 1 and Q2 (`RESTORE_LANDING_SELECTOR`, the single-member trap) land in
   the shared layer and therefore reach `PhotoAlbum` and `ClassSessions` on the public
   `/classes`. I reviewed the admin consumers only; **the two public Modal consumers were not
   re-measured after these changes and should be before they ship.** *Owners: Frontend UI
   Agent, Testing Agent.*
4. **The busy-state trap leak is a behaviour defect, not a visual one**, and it is reachable
   from all five admin confirm sites plus both public Modal consumers. It needs a regression
   test, not just a fix. *Owners: Frontend UI Agent, Testing Agent.*
5. **`AdminConfirmDialog`’s props are described as frozen this round**, which `useModalDismiss.ts`
   cites as a reason not to add a consumer-nominated fallback. Both of my recommendations avoid
   that freeze, but the Orchestrator should confirm the freeze is still in force before the
   fixes are scoped. *Owner: Orchestrator.*
6. **`/api/blogs` and `/api/recipes` both return `coverPhoto: null` for every demo record.**
   Research boundary gap 2 (S3 key vs signed URL, client-component fetch path) is still open,
   and until it closes the admin's 56px media column returns nothing on `/admin/blogs`. The
   design decision in concern 4 should be made knowing this, not instead of it.
   *Owners: Frontend API and Logic Agent, Backend API Agent, Architecture Agent.*
7. **The dev database mutated during this review** (sessions and album contents both changed).
   Any pixel-diff regression suite over admin captures will be unreliable for the same reason
   the handoff records for the public archives. *Owner: Testing Agent.*
8. **`AdminHeader.tsx` needs `aria-controls` on the mobile toggle** — outside both the admin
   design layer and the page components. *Owner: Frontend UI Agent.*
9. Not re-reported, confirmed landed or in flight and out of my scope: the `ADMIN_EYEBROW`
   constant adoption (**landed** — `/admin/classes` now reads `Manage`), the `onError` fallback
   on `S3CardBackgroundImage`, the two `ref` adoptions, the `×`-enabled-while-busy fix, and the
   `FOCUSABLE_SELECTOR` move into `useModalDismiss.ts` (verified single declaration site).
