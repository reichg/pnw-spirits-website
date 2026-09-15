# Design Review Handoff

Prepared by: UI Design Director Agent
Date: 2026-09-14 — admin portal, consolidation pass
Consumer: UI Design Reviewer Agent
Upstream research: `docs/design-research/admin-portal.md`

> **Scope note.** This document covers the **admin portal** overhaul and, in
> detail, the consolidation pass that closed the eight shared-layer questions the
> four page slices raised. The previous contents of this file described the
> `/blogs` `/recipes` `/videos` archive-row task, which has already been reviewed
> (`docs/design-research/archive-rows-review.md`); it is preserved in git history
> at commit `9beccf3`.

---

## Project Goal

Replace the admin portal's older vocabulary — bordered cards on
`--color-bg-secondary`, `window.confirm`, browser-default controls, five screens
each art-directing themselves — with one shared design layer under
`src/components/admin/`, so that the portal reads as the same brand as the public
site while remaining a working surface rather than a marketing one.

Four Frontend UI specialists rebuilt the five screens against that layer in
parallel. They deliberately did not settle questions that belonged to the shared
layer, and reported eight of them. **This pass answers those eight.** It is
consolidation, not a redesign: no screen was recomposed.

---

## Final Visual Direction

Four characteristics, unchanged from the earlier waves:

- **editorial** — the public site's type roles and ink tiers, at admin density
- **warm-dark** — one warm near-black ground, one warm off-white ink at three
  opacities, one copper accent; hierarchy carried by opacity, not by weight
- **flat and ruled** — no fills, no shadows, no radii, no glass; a control is
  identified by its edge and ranked by the tier that edge is drawn at
- **dense** — every pixel of chrome is taken from the list, and the budget is
  stated where it is spent

The admin distinguishes itself from the public site by **structure and density**,
not by a second palette: `adminTokens.module.css` composes the public
`editorialSurface` and adds only what a working surface needs
(`--control-min`, `--record-thumb`, `--hairline-strong`, `--danger`).

---

## Key Design Principles (the ones this pass applied)

1. **One thing, one treatment, per screen.** Two Deletes on one screen is a
   defect regardless of which one is prettier.
2. **Repetition, not severity, sets a resting alarm.** A destructive control is
   red before it is touched only where it appears once.
3. **The list owns contextual decisions; the control owns its own behaviour.**
   Density, flow, and now the resting danger paint all travel down as inherited
   custom properties. A prop would be a second place to state a fact the page
   shape already states.
4. **Whitespace first, a rule only where whitespace is ambiguous** — and never
   two rules doing one rule's job.
5. **Shared modules are read-only downward, never upward.** `admin/` may compose
   `ui/`; `ui/` must never learn that an admin exists. Where the admin needs a
   different value out of a shared rule, it sets a custom property that the
   shared rule reads, with the public value as the default.

---

## The Eight Consolidation Items

| # | Question | Answer |
|---|----------|--------|
| 1 | Two Delete treatments on `/admin/classes` | `AdminCardGrid` `.grid` sets `--admin-danger-rule` / `--admin-danger-ink`; every danger control inside a list is neutral at rest and reddens on hover/focus. The portalled dialog is in no list and stays red. No consumer change. |
| 2 | `AdminEmptyState` too airy | `ContentLandingLayout` `.emptyMessage` now reads `--empty-block-pad` (default `--space-xl`, unchanged for the public); the admin sets `--space-m`. Measured 64px → 24px. |
| 3 | Double rule opening every screen | The **first** panel drops its own hairline and its top padding and takes the header's copper rule as its opener (`.panel:first-of-type`). Returns 24px to the list. |
| 4 | No fallback when an S3 image fails | `.mediaImage::after` paints the empty plate over a failed image. Verified in the running page in **both** states — loaded covers unaffected, dead keys lose the glyph. Chromium/Firefox only; the real fix is `onError` in `S3CardBackgroundImage` (boundary gap). |
| 5 | Eyebrow wording drift | `ADMIN_EYEBROW = "Manage"` exported from `admin.types.ts`; the eyebrow names the screen's function, never the brand. **Three call sites still pass literals and are a boundary gap.** |
| 6 | `AdminInput` does not forward `ref` | Prop types switched to `ComponentPropsWithRef<"input" \| "textarea">`; React 19 carries `ref` through the existing spread. |
| 7 | Grain data URI duplicated in two modules | `--grain-image` / `--grain-opacity` in `editorialTokens.module.css`; both shells read them. One declaration site; zero pixel diff on every public grain-bearing route. |
| 8 | `Modal` close control and backdrop | Close raised to 40px for **both** surfaces, every painted value tokenised with the public value as the default, a stated gold focus ring, and a `background` on `:hover` that stops `globals.css` `button:hover` painting a brown fill behind it. `Modal` gained `backdropClassName`; the admin opts out of the 3px blur. The admin's `.panel.panel > button` structural selector is deleted. |

---

## References Actually Used

Carried forward from `docs/design-research/admin-portal.md`; this pass adopted no
new references.

| Reference | Extracted idea | Adaptation | Where it landed |
|-----------|----------------|------------|-----------------|
| Statamic control panel (visually verified in research) | The empty state keeps its search field and its clear control on screen — an admin must be able to reverse a state it put itself into | Kept as a **requirement on the consumer**, documented at the top of `AdminEmptyState.module.css`, rather than as component behaviour | `AdminEmptyState.module.css` header |
| WordPress list tables (visually verified in research) | Row actions are words, not icons | Words at `--control-min` in both axes, ruled rather than bare — WordPress's own 19.9px inline links fail SC 2.5.8 | `AdminCard.module.css` `.action` |
| WordPress / Ghost / Statamic, all three | A branded admin separates itself by chrome and density, not by a different palette | The grain, the copper rule and the ink tiers are the public site's; only density and the control vocabulary change | `adminTokens.module.css`, this pass's `--grain-image` token |

---

## References or Ideas Rejected

- **A `repeated` (or `context`) prop on `AdminButton`** for item 1. A control
  cannot answer "am I repeated"; the list can, and already does for density.
- **Making `tone="danger"` neutral everywhere.** That would have taken the alarm
  off the one control in the application that should carry it at rest.
- **Restyling `Modal`'s close control globally** for item 8. The admin's flat
  square control is the admin's vocabulary, not a defect in the public dialog.
  Only the size, the focus ring and the hover-fill leak changed for everyone,
  each on its own argument.
- **A `.mediaImage::after` fallback, then un-rejected.** It was reverted mid-pass
  on a misread screenshot and restored after a live with/without test. The full
  measurement is recorded in `AdminCard.module.css`; see Known Limitations.
- **Narrowing `AdminPageLayoutProps["eyebrow"]` to the constant's type.** Correct,
  and it would break three files this specialist does not own. Deferred to the
  follow-up that adopts the constant.

---

## Important Implementation Files

Changed in this pass:

- `src/components/admin/AdminButton.module.css` — danger rest/hover contract
- `src/components/admin/AdminButton.tsx` — docblock
- `src/components/admin/AdminCardGrid.module.css` — `.grid` danger context
- `src/components/admin/AdminCard.module.css` — failed-image plate
- `src/components/admin/AdminPanel.module.css` — first-panel rule
- `src/components/admin/AdminEmptyState.module.css` — block padding
- `src/components/admin/AdminInput.tsx` — ref forwarding
- `src/components/admin/admin.types.ts` — `ADMIN_EYEBROW`
- `src/components/admin/adminTokens.module.css` — `--danger` reader list
- `src/components/admin/AdminDialog.module.css` / `.tsx` — close control by token, backdrop opt-out
- `src/components/admin/AdminPageLayout.module.css` — grain token
- `src/components/ui/editorialTokens.module.css` — `--grain-image`, `--grain-opacity`
- `src/components/ui/ContentLandingLayout.module.css` — grain token, `--empty-block-pad`
- `src/components/ui/Modal.module.css` / `Modal.tsx` — close control tokens, focus ring, hover-fill fix, `backdropClassName`

Not changed and not owned here: everything under `src/app/(pages)/admin/**`,
`src/components/Media/**`, `src/hooks/**`, `src/app/globals.css`,
`src/components/Layout/**`.

---

## Viewports Reviewed

1440×900 and 390×844, rendered against the running dev server.

- Admin: `/admin`, `/admin/blogs`, `/admin/recipes`, `/admin/classes`,
  `/admin/newsletter` → `.screenshots/consolidation-final/`
  (`.screenshots/consolidation/` is an earlier run of the same set)
- Admin states: the destructive confirmation dialog at both viewports, its close
  control at rest and on hover, and a search-driven empty state
- Public before/after: all ten default routes at both viewports →
  `.screenshots/public-before/`, `.screenshots/public-after/`, plus
  `.screenshots/public-after2/` as the noise-floor control
- Public modal states: the `/classes` session modal and photo lightbox, at rest
  and with the close control hovered, before and after

1024px was not captured in this pass; nothing here introduces a breakpoint.

---

## Known Limitations

1. **Item 5 is half-landed.** The constant exists; `AdminClassManager.tsx` still
   renders `eyebrow="PNW Spirits"` and the blogs/recipes lists still render the
   literal `"Manage"`. **The portal still ships two eyebrows.** Boundary gap.
2. **Item 4 covers Chromium and Firefox only.** Safari renders no pseudo-elements
   on `<img>`, and the public `/classes` album still shows the glyph. Both need
   the same `onError` in `S3CardBackgroundImage`. Boundary gap.
3. **Admin thumbnails are frequently blank in `.screenshots/`** regardless of
   what any rule does — the capture script's wait does not reliably outlast a
   signed-S3 round trip. `consolidation-final/` was captured with a 4.5s wait and
   does show them. A blank plate in an older capture is not evidence.
4. **The public `/blogs` and `/recipes` archive captures have no usable noise
   floor.** Two consecutive identical runs differed by 8–11% of pixels and by
   1245px of page height, because the record set is changing under the dev server
   while other agents work. Only routes with a stable record set were used as
   evidence.
5. **`Modal` has no interactive test coverage** in this repo (node environment,
   no jsdom, no `@testing-library/react`). Everything in item 8 was verified by
   rendering and by computed-style probes, not by a test.
6. **The dev-overlay badge at y≈787–880** appears in public captures and accounts
   for the `contact` and `recipes` diffs.

---

## Areas That Need Independent Scrutiny

1. **Item 3 across states, not just the loaded one.** `/admin/classes` has a
   loading branch and an error branch that render before any panel exists; the
   first-panel rule only engages once a `<section>` is the first of its type.
   Worth checking that the header does not look unclosed in those states.
2. **Item 1 at the moment of commitment.** The resting paint is now identical for
   a row Delete and a tile Delete. Is the hover/focus red arriving *late* for a
   control that sits at the bottom of a 240px tile rather than at the end of an
   80px row?
3. **The admin dialog without its blur.** The page behind the scrim is now sharp.
   Judge whether the dialog still separates from a dense working surface at
   1440px, where three panels of content sit behind it.
4. **The 40px `Modal` close on the public photo lightbox.** It grew 8px on a
   surface this pass did not otherwise touch; check it against the image at 390px.
5. **Empty-state density at 24px inside a panel** — three of them can still land
   on one classes screen. The gated-empty state could not be reproduced in this
   pass (the demo record now has content), so item 2 was verified by computed
   style rather than by a render of that exact screen.
6. **Whether `ADMIN_EYEBROW = "Manage"` is the right word** before three call
   sites adopt it. Changing it later is one edit; changing it after is three.
