"use client";

import type { ReactNode } from "react";
import AdminButton from "./AdminButton";
import AdminDialog from "./AdminDialog";
import { ModalDismissLock } from "@/components/ui/Modal";

export type AdminConfirmDialogProps = {
  isOpen: boolean;
  /** The action, as a title: "Delete blog". */
  heading: string;
  /** What will happen, naming the record it will happen to. */
  message: ReactNode;
  /** The action, as a button: "Delete blog". Never "OK". */
  confirmLabel: string;
  /** The same action in progress: "Deleting...". */
  confirmBusyLabel: string;
  /** The way out, as a button: "Keep blog". Never "Cancel". */
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The replacement for `window.confirm` on a destructive admin action.
 *
 * WHAT `window.confirm("Delete this blog?")` GOT WRONG, all three at once:
 * its buttons are the browser's OK and Cancel rather than the actions they
 * perform; it does not say WHICH blog, which is precisely the failure mode that
 * trains an admin to click through without reading; and it is unstyleable
 * browser chrome dropped into the middle of a branded tool. Naming the record
 * and naming both buttons is what turns a reflex back into a decision.
 *
 * WHY BOTH LABELS ARE REQUIRED PROPS RATHER THAN DEFAULTS. A default of
 * "Confirm"/"Cancel" would be reachable by omission, and the entire value of
 * this component is that it is not reachable. `confirmBusyLabel` is separate
 * for the reason AdminButton records: `busy` makes the control inert and
 * announces the state, but only the screen knows whether the word is
 * "Deleting...", "Sending..." or "Publishing...".
 *
 * WHAT `busy` MEANS ON THE CONFIRMING CONTROL, SINCE IT CHANGED. It is now
 * `aria-disabled`, not `disabled` - focusable, named, and inert because
 * AdminButton cancels the activation. That matters most HERE, in a focus-
 * trapped dialog: while busy, Modal's close is disabled by the dismiss lock and
 * the cancel below is disabled by the same `busy`, so a natively-disabled
 * confirm left this dialog with ZERO focusable elements and focus on <body>
 * under the admin's own press. Measured after: three Tabs all stay on the
 * confirming control, and four activations of it while busy produce one
 * request. The dialog now has exactly one tab stop while it works, and it is
 * the control that is working.
 *
 * THE DESTRUCTIVE CONTROL IS LAST AND IS THE ONLY --danger IN THE SYSTEM AT
 * THAT MOMENT. A row's Delete is neutral at rest - eight red rows are eight
 * alarms and none of them is one - so the alarm belongs here, where the
 * commitment is.
 *
 * NO UNDO, AND THAT IS THE HONEST GAP. The reference tools that handle this
 * best make deletion reversible and skip the dialog; `DELETE /api/blogs/:id`
 * destroys the row and its S3 media outright, so a dialog is the only recovery
 * this surface can offer. A soft-delete column would be the real answer and is
 * a backend change.
 */
export default function AdminConfirmDialog({
  isOpen,
  heading,
  message,
  confirmLabel,
  confirmBusyLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: AdminConfirmDialogProps): React.ReactNode {
  return (
    // WHILE BUSY, NO DISMISSAL ROUTE IS LIVE - and this is declared rather
    // than enforced here, which is the correction. The first version neutered
    // `onClose`, which reaches Escape and the backdrop but NOT the close
    // button: Modal renders that button itself and wired it to the same
    // no-op, so the most clickable control in the dialog sat enabled and did
    // nothing, as the only stop in the tab ring, with body scroll locked. A
    // dialog whose one reachable control is dead reads as frozen.
    //
    // Modal owns all four routes, so the lock is declared for it to enforce.
    //
    // Closed toward disabled rather than toward enabled because the request is
    // already in flight and cannot be recalled: a "cancel" that dismisses
    // without cancelling returns the admin to a list that is about to change
    // under them with no sign that it will. The confirming control says
    // "Deleting..." and carries aria-busy throughout, so the state is legible
    // while it lasts.
    <ModalDismissLock locked={busy === true}>
      <AdminDialog
        isOpen={isOpen}
        onClose={onCancel}
        heading={heading}
        size="compact"
        actions={
          <>
            <AdminButton onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </AdminButton>
            <AdminButton tone="danger" onClick={onConfirm} busy={busy}>
              {busy ? confirmBusyLabel : confirmLabel}
            </AdminButton>
          </>
        }
      >
        <p>{message}</p>
      </AdminDialog>
    </ModalDismissLock>
  );
}
