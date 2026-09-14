import type { AdminButtonProps, AdminCardActionTone } from "./admin.types";
import styles from "./AdminButton.module.css";

/**
 * A standalone admin control.
 *
 * It shares AdminCardActionTone with the card's action row rather than
 * declaring a second tone vocabulary. "Which of these three things is this
 * control" is one question, and answering it with two enums is how a system
 * ends up with a `danger` that means something different depending on where
 * you are standing.
 *
 * `danger` is red at rest and neutral-until-touched inside a list, and that is
 * one rule rather than two: the resting alarm answers REPETITION, and the list
 * is the thing that knows a control is repeated. No prop expresses it -
 * AdminCardGrid sets --admin-danger-rule / --admin-danger-ink on the <ul> and
 * they inherit. See AdminButton.module.css .danger.
 *
 * `busy` marks the control in flight and sets aria-busy; it does NOT change the
 * label, because only the screen knows whether the right word is "Sending...",
 * "Uploading..." or "Saving...". A busy state belongs on the control that is
 * busy rather than on a page-level overlay, which would block the very controls
 * the admin needs in order to retry - and it is owed here at all only because
 * sending a newsletter and uploading photos are the two admin operations that
 * can cross the one-second line where a wait stops being imperceptible.
 *
 * `type` defaults to "button". The native default is "submit", which is how a
 * "Delete" beside a form silently posts it.
 */
export default function AdminButton({
  tone = "secondary",
  type = "button",
  disabled,
  busy,
  fullWidth,
  ariaLabel,
  onClick,
  children,
}: AdminButtonProps): React.ReactNode {
  // BUSY IS `aria-disabled`, NOT `disabled`, AND IT OUTRANKS `disabled`.
  //
  // THE DEFECT. `disabled` takes an element out of the tab order and the
  // browser blurs it the instant it is set. `busy` is by definition the flag a
  // control raises about ITS OWN press, so every busy control in this admin
  // disabled itself under the admin's own finger and dropped focus to <body>
  // for the length of its own request. Measured in the blog editor: Save put
  // activeElement at BODY at 1ms and held it there for the full ~750ms of the
  // PUT. It looked survivable only because that dialog then unmounts and
  // useModalDismiss restores focus on the way out; on /admin/classes, where
  // nothing unmounts, the admin simply loses their place on every save, every
  // add, and every upload, for as long as the network takes.
  //
  // aria-disabled keeps the control mounted, named, focusable and inert, so
  // focus never moves at all - the least surprising outcome, and the only one
  // that needs no guess about where the admin wanted to be. A screen reader
  // also announces the state change on the element it is already sitting on,
  // which is a better answer to "why did nothing happen" than silence from
  // <body>. This is the same correction Pagination.tsx records for its boundary
  // controls, which disabled themselves on the press that reached the boundary;
  // one defect, one technique, and now one spelling across both.
  //
  // IT OUTRANKS `disabled` because several callers state both for the same
  // moment - AdminClassManager's `addSessionLocked` includes `sessionBusy`,
  // AdminNewsletterComposer's `canSubmit` includes `!sendingAction` - and if
  // the native attribute still won there, the fix would not reach the controls
  // that need it most. `busy` is the more specific statement about the instant
  // focus is at stake, so it decides that instant.
  const inert = busy === true;

  return (
    <button
      type={type}
      className={[styles.button, TONE_CLASS[tone], fullWidth && styles.fullWidth]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      // The visual "unavailable" treatment is selected off these two attributes
      // directly (AdminButton.module.css), not off a third class, so the state
      // the assistive tech hears and the state the eye sees cannot disagree.
      aria-disabled={inert || undefined}
      disabled={inert ? false : disabled}
      onClick={inert ? swallowActivation : onClick}
    >
      {children}
    </button>
  );
}

/**
 * What makes an `aria-disabled` control actually inert.
 *
 * A native `disabled` button cannot be activated at all; an aria-disabled one
 * is focusable AND clickable, so inertness is now this file's job rather than
 * the browser's. Dropping `onClick` is only half of it: a `type="submit"` has
 * an activation behaviour of its own - submitting the form - that no absent
 * handler prevents. Enter, Space and a pointer click all dispatch a click whose
 * default action is that submission, and so does implicit submission (Enter in
 * a text field fires a click at the form's default button, which is this one).
 * preventDefault cancels the activation behaviour on all four paths at once.
 *
 * Hence a real handler while busy rather than `undefined`: "no handler" would
 * be correct for every `type="button"` in the admin and silently wrong for
 * every Save and Send in it - and Send is "email every subscriber a second
 * time".
 *
 * REJECTED: rendering `type="button"` while busy. It stops submission too, but
 * by removing the form's default button, which changes where implicit
 * submission goes rather than stopping it - a form left with no submit button
 * still submits on Enter when it has a single field that blocks implicit
 * submission. Keeping the control a submit and cancelling it keeps this button
 * the one place that decision is made.
 *
 * stopPropagation because an activation that has been refused should not also
 * be observable to an ancestor as a click that happened.
 */
function swallowActivation(event: React.MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

const TONE_CLASS: Record<AdminCardActionTone, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
};
