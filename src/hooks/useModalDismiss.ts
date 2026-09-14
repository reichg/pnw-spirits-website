import { useEffect, useRef } from "react";

/**
 * The natively focusable elements a focus trap cycles through, and the ones the
 * restore walk below is allowed to land on.
 *
 * Declared here rather than in Modal.tsx, which is where it used to live and
 * which now imports it. The restore walk needs the identical definition, and two
 * copies of a selector list is how "focusable" comes to mean two different
 * things in one dialog - the trap cycling through one set while focus is
 * restored into another. Modal already depends on this module, so moving the
 * constant down to the shared layer adds no edge.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Where the walk stops. These are page-shell elements: reaching one means every
 * container the user was actually inside has been destroyed, and anything found
 * below it is a different part of the page.
 *
 * MAIN is on this list because of a measured bug, and it is the whole reason
 * this constant exists. On /admin/classes a confirmed delete unmounts all three
 * panels, so the first surviving rung is <main>; the walk re-entered <main> at
 * the album panel's index and took that panel's first focusable control, which
 * is the UPLOAD caption field sitting above the grid. Focus landed in a text
 * input the admin never chose, and keystrokes after a delete silently became
 * the next upload's caption. That is exactly the teleport BODY was already on
 * this list to prevent, one rung lower down.
 */
const SHELL_TAGS = new Set(["MAIN", "BODY", "HTML"]);

/**
 * One rung of the trigger's ancestry, captured when the modal opens: an element
 * and the index the child below it occupied inside that element.
 *
 * The index is what distinguishes "focus the list again" from "focus the record
 * that took the deleted one's place".
 */
export type FocusAnchorStep = {
  parent: Element;
  index: number;
};

function firstFocusableWithin(root: Element | null): HTMLElement | null {
  if (!root) return null;
  if (root.matches(FOCUSABLE_SELECTOR)) return root as HTMLElement;
  return root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

/**
 * The nearest still-attached ancestor that is not the page shell, or null.
 * Exported shape is internal; it exists so the walk and the deferred correction
 * below cannot disagree about which rung they are talking about.
 */
function findSurvivingAnchor(
  anchorPath: readonly FocusAnchorStep[],
): FocusAnchorStep | null {
  for (const anchorStep of anchorPath) {
    if (!anchorStep.parent.isConnected) continue;
    // The FIRST survivor is the answer, so this returns rather than continuing:
    // every rung above it is further from where the user was.
    return SHELL_TAGS.has(anchorStep.parent.tagName) ? null : anchorStep;
  }
  return null;
}

/**
 * Where focus should go when a modal closes.
 *
 *   1. The trigger, if it is still in the document. Escape, Cancel, and every
 *      modal whose opener survives (ClassSessions, the newsletter's submit
 *      button) end here - with one MEASURED caveat. PhotoAlbum's thumbnails sit
 *      inside Swiper, which preventDefaults pointerdown in order to drag, so a
 *      MOUSE-opened lightbox never focused its thumb and `previouslyFocused` is
 *      already <body>. Tier 1 then "answers" with <body> and focus is not
 *      restored; activating the same thumb by KEYBOARD restores correctly. That
 *      is a PhotoAlbum defect, not one this resolver can fix - it can only hand
 *      back what it was given.
 *   2. The nearest surviving non-shell ANCESTOR of the trigger, re-entered at
 *      the index the trigger's branch occupied - so after deleting the 2nd of 4
 *      records this lands on the record now sitting 2nd.
 *   3. Nothing, and tier 3 is what keeps tier 2 honest. See SHELL_TAGS.
 *
 * Pure, and that is deliberate: it takes its DOM in as arguments and touches
 * nothing global, so the decision is executable in the node test environment
 * with structural fakes.
 */
export function resolveFocusRestoreTarget(
  trigger: Element | null,
  anchorPath: readonly FocusAnchorStep[],
): HTMLElement | null {
  if (trigger && trigger.isConnected) {
    const element = trigger as HTMLElement;
    if (typeof element.focus === "function") return element;
  }

  const anchorStep = findSurvivingAnchor(anchorPath);
  if (!anchorStep) return null;

  const siblings = anchorStep.parent.children;
  const candidate =
    siblings.length > 0
      ? siblings[Math.min(anchorStep.index, siblings.length - 1)]
      : null;

  return (
    firstFocusableWithin(candidate) ?? firstFocusableWithin(anchorStep.parent)
  );
}

function captureAnchorPath(trigger: Element | null): FocusAnchorStep[] {
  const path: FocusAnchorStep[] = [];
  let node: Element | null = trigger;

  while (node) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    path.push({ parent, index: Array.from(parent.children).indexOf(node) });
    // The shell rung is recorded rather than skipped, so the stop condition is
    // reached by data instead of by the absence of data - and so it is testable.
    if (SHELL_TAGS.has(parent.tagName)) break;
    node = parent;
  }

  return path;
}

/**
 * How long to keep watching for the list to re-render after the modal closes.
 * Measured: on /admin/blogs the deleted row is still in the DOM when the modal
 * unmounts and is gone ~50ms later. 600ms is generous for that and short enough
 * that it cannot collide with a later, unrelated interaction.
 *
 * Exported so the test asserts the bound is wired to this declared window
 * rather than to a literal that could drift away from it.
 */
export const SETTLE_WINDOW_MS = 600;

/**
 * THE ORDERING PROBLEM, AND WHY A SECOND PASS IS NEEDED AT ALL.
 *
 * This was wrong when it shipped, and the bug is worth stating plainly because
 * the shape of it is not obvious. Focus is restored in the modal's unmount
 * CLEANUP, which runs before the list re-renders. Measured on /admin/blogs with
 * a real delete: at cleanup the deleted row's Delete button is still connected,
 * so tier 1 matches and focus goes to it - and ~50ms later React drops the row,
 * the focused element leaves the document, and focus falls to <body> and stays
 * there. So tier 2, the walk written for exactly this case, was never reached
 * on the two lists it was written for, and the restore looked correct for one
 * frame.
 *
 * This re-checks once the DOM has actually changed, and it is hedged three ways
 * so that a deferred focus move - which is its own class of bug - cannot take
 * focus away from anyone:
 *
 *   - it aborts unless focus is on <body>. If the user has clicked or tabbed
 *     anywhere, or the tier-1 restore is still standing, activeElement is not
 *     <body> and this does nothing.
 *   - it aborts if the trigger is still connected, because then nothing moved.
 *   - it is bounded by SETTLE_WINDOW_MS and disconnects after one correction,
 *     so it cannot fire late into an unrelated interaction.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER: a re-render that arrives after the
 * window, which on /admin/classes is the case - that page reloads all three
 * panels and the surviving rung is <main>, i.e. shell, so the walk declines and
 * focus stays on <body>. Chasing that from here would mean a generic hook
 * guessing at an arbitrarily slow refetch it cannot observe the end of. The
 * component that knows its own mutation finished is the page, and that is where
 * the remaining fix belongs.
 *
 * WHERE IT ACTUALLY FIRES, MEASURED - because this was reported as dead code
 * and it is not. Instrumented and driven against the live app, the only shape
 * that reaches `target.focus()` is a surviving parent that is momentarily EMPTY
 * of focusables and then gains some, and that shape is real on the two lists:
 *
 *   PAGE CLAMP on /admin/blogs and /admin/recipes. Deleting the only record on
 *   the last page arrives as TWO reads. The first commits an empty page and
 *   re-arms the fetch, so at cleanup the rows container is rendered with zero
 *   children, the walk finds it and has nothing to offer, and focus is on
 *   <body>. One round trip later the clamped page lands inside that same
 *   container and this correction focuses its first row. Measured: FIRED ->
 *   "Edit post: Fixture 11" / "Edit recipe: Fixture 11".
 *
 * It is NOT redundant with the screens' own restore. That one deliberately
 * stands down for this exact window (`if (items.length === 0 && total > 0)
 * return`), and on the editor's save-and-close path - where an edit drops the
 * record out of an active search - nothing screen-side is armed at all, because
 * those intents are set only by deletes. This is the only thing acting there.
 *
 * Every other consumer stands down rather than firing - and the reasons are not
 * the same one, which matters when debugging: ClassSessions and the newsletter
 * keep their trigger connected AND focused, so tier 1 answers and the first
 * `attempt` sees focus already held. PhotoAlbum on the mouse path stands down
 * via the TRIGGER-CONNECTED guard instead, never the focus-already-held one -
 * its trigger survives but never held focus (see the Swiper caveat on
 * resolveFocusRestoreTarget), so focus sits on <body> and the correction
 * correctly declines to move it;
 * /admin/classes destroys every rung below <main>, so the deferred pass
 * declines identically to the immediate one - a detached rung never re-attaches.
 *
 * Exported for the tests below, which is the same bargain `resolveFocusRestore-
 * Target` already makes: it takes its DOM in as arguments, so a fake
 * MutationObserver plus a stubbed `document`/`window` drives the whole decision
 * surface in the node environment with no browser.
 */
export function scheduleSettleCorrection(
  trigger: Element | null,
  anchorPath: readonly FocusAnchorStep[],
): void {
  // THE OUTERMOST non-shell rung, not the nearest surviving one, and the
  // difference is the whole reason this function works. At cleanup time the
  // list has not re-rendered yet, so the NEAREST surviving rung is the row's
  // own action container - the doomed branch. Observing it watches a node that
  // is about to be detached, and the re-render happens in the list above it, so
  // the correction never fires. Measured: focus stayed on <body>.
  //
  // The outermost non-shell rung is stable by construction. If an ancestor is
  // destroyed so is everything under it, so this rung survives exactly when any
  // rung survives - which is exactly when tier 2 has an answer to give. If it
  // dies, only the shell is left and tier 2 declines anyway, so there would be
  // nothing to correct to.
  let watched: Element | null = null;
  for (const anchorStep of anchorPath) {
    if (SHELL_TAGS.has(anchorStep.parent.tagName)) break;
    watched = anchorStep.parent;
  }
  if (!watched) return;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    window.clearTimeout(timer);
  };

  const attempt = () => {
    if (done) return;
    // Never steal focus from whoever has it.
    if (document.activeElement !== document.body) return finish();
    // Nothing has unmounted, so there is nothing to correct.
    if (trigger?.isConnected) return;

    const target = resolveFocusRestoreTarget(null, anchorPath);
    if (!target) return;
    target.focus();
    finish();
  };

  const observer = new MutationObserver(attempt);
  observer.observe(watched, { childList: true, subtree: true });
  const timer = window.setTimeout(finish, SETTLE_WINDOW_MS);
}

// Shared dismissal/affordance side-effects for any modal-like surface
// (session-details dialog, photo lightbox, admin confirm dialog). Wiring all of
// Escape-to-close, background scroll lock, and focus restore here keeps every
// modal on one behavior contract instead of re-implementing the side-effects
// per modal.
//
// Effects run only on the client, so `document`/`window` are always defined when
// the bodies execute; the `typeof` guards are belt-and-suspenders for any future
// non-DOM environment and to keep the file safe to import anywhere.
export function useModalDismiss(params: {
  isOpen: boolean;
  onDismiss: () => void;
}): void {
  const { isOpen, onDismiss } = params;

  // Read the latest `onDismiss` through a ref so callers can pass an inline
  // closure without re-running (and tearing down) the listener each render. The
  // ref is synced in a commit-time effect (not during render) so the Escape
  // handler always sees the latest closure without re-keying the listener.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;

    // Captured BEFORE the dialog moves focus into itself, which is why this
    // effect has to run ahead of Modal's initial-focus effect. It does, because
    // Modal calls this hook above that effect and React runs effects in call
    // order. Moving the useModalDismiss call below it would silently capture the
    // dialog's own panel as the trigger.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const anchorPath = captureAnchorPath(previouslyFocused);

    // Capture the prior inline overflow so we restore it exactly rather than
    // clobbering a value another component may have set.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      // Immediate, so a dismissal that changed nothing (Escape, Cancel) has no
      // visible gap where focus sits on <body> and Tab escapes the region.
      resolveFocusRestoreTarget(previouslyFocused, anchorPath)?.focus();
      // Deferred, for the dismissal that destroyed its own trigger. See above.
      scheduleSettleCorrection(previouslyFocused, anchorPath);
    };
  }, [isOpen]);
}
