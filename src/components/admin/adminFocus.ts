/**
 * Focus restoration for the admin screens.
 *
 * WHY THIS FILE EXISTS. Three screens - the posts list, the recipes list and
 * the classes manager - each rebuild their own contents in response to a
 * transition the admin started, and each therefore has to put focus back
 * somewhere afterwards. They had grown one copy of these two functions apiece.
 * Three copies of a focus-restore primitive is one reworded comment away from
 * three subtly different primitives, and the failure mode is silent: nothing on
 * screen looks broken when focus is merely dropped.
 *
 * WHY IT LIVES UNDER `components/admin/`. Every consumer is an admin screen,
 * and this directory already holds the non-component admin helpers
 * (`adminRecords.ts`, `adminUpload.ts`) next to the components they serve.
 * `src/hooks/` was rejected because neither of these is a hook. `src/utils/`
 * was rejected because that directory is environment-neutral, server-capable
 * code - `prisma.ts`, `s3.ts`, `jwtSecret.ts` - and these two functions touch
 * `document` unconditionally, so a server import of them is a crash rather than
 * a mistake the type checker would catch.
 *
 * WHY `Pagination` DOES NOT IMPORT THIS, although it is a shared component with
 * the same class of bug: its boundary controls stay mounted and keep focus
 * (they are `aria-disabled`, not `disabled`), so there is no orphaned focus to
 * restore. The same is true of `AdminSearchField`'s Clear, which hands focus to
 * the field it just cleared synchronously, while it still holds focus itself.
 * Preventing the drop beats detecting it; this module is for the transitions
 * where prevention is not available, because the element that had focus is
 * genuinely gone by the time anyone can react.
 */

/**
 * A control, found by the accessible name the calling screen gave it.
 *
 * A DOM READ, AND IT IS THE ONLY ROUTE THERE. `AdminCard` renders its action
 * buttons itself and `AdminCardAction` carries no `id` and no `ref` - that
 * contract's guarantee rather than an omission, since the card refuses a root
 * passthrough precisely so no consumer can reach back into it. So the control
 * is addressed the way the rest of the page addresses it: by the name it is
 * announced under.
 *
 * Matched on an exact attribute VALUE rather than interpolated into a selector
 * string, so a record title containing a quote or a bracket cannot turn into a
 * malformed query. That is not hypothetical - these names are built from
 * admin-authored titles.
 *
 * `root` is `ParentNode`, not `HTMLElement`, because two of the three callers
 * pass `document` for a control that lives outside the region they own (the
 * toolbar's "New post"). The classes manager's copy was typed `HTMLElement`
 * only because it happened to scope every lookup to a ref; widening loses it
 * nothing, and narrowing would have broken the other two. Callers should still
 * pass the narrowest root that contains the control, so a record title that
 * happens to match something elsewhere on the page cannot be focused instead.
 */
export function findByAccessibleName(
  root: ParentNode | null,
  name: string,
): HTMLButtonElement | null {
  if (!root) return null;
  return (
    Array.from(root.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === name,
    ) ?? null
  );
}

/**
 * Move focus to `target`, but ONLY if the page has lost it.
 *
 * THE `body` CHECK IS THE WHOLE CONTRACT. Do not "simplify" it away.
 *
 * A transition that unmounts the control holding focus makes the browser drop
 * focus to <body>. `body` is therefore the signal that the focus being restored
 * is the focus this screen took away. If the admin has since put focus
 * somewhere themselves - and these restores can land a network round trip after
 * the action that queued them - then the page has not lost anything, and moving
 * them is the more hostile of the two failures.
 *
 * It is also how a screen-side restore arbitrates with `useModalDismiss`. That
 * hook restores focus from its unmount cleanup and hedges with a bounded
 * MutationObserver (<=600ms) which stands down the moment anything holds focus.
 * Both sides ask the same question before acting, so whichever lands first
 * wins and the other declines: they cannot fight over the same keystroke, and
 * neither has to know whether the other ran.
 */
export function focusIfOrphaned(target: HTMLElement | null): void {
  if (!target) return;
  const active = document.activeElement;
  if (active && active !== document.body) return;
  target.focus();
}
