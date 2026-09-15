"use client";

import type { ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import styles from "./AdminDialog.module.css";

export type AdminDialogSize = "compact" | "form";

export type AdminDialogProps = {
  isOpen: boolean;
  /** Escape, the backdrop and the close button all arrive here. */
  onClose: () => void;
  /** Rendered as the dialog's <h2> AND used as its accessible name, so the two
   *  cannot drift - a dialog whose spoken name differs from its visible title
   *  is unanswerable by voice. */
  heading: string;
  /** `compact` for a question, `form` for an editor. See the stylesheet. */
  size?: AdminDialogSize;
  /** The trailing control row. Omit it when the dialog's controls belong inside
   *  its own <form> - a submit button rendered outside the form it submits is
   *  a `form` attribute nobody remembers to add. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * The admin's dialog chrome, over the shared `Modal`.
 *
 * Modal owns everything hard: the portal out of any clipped ancestor, the focus
 * trap, Escape, the scroll lock and focus restore on close. This adds the two
 * things Modal deliberately does not know about.
 *
 * ONE - the token set. The panel is portalled into `document.body`, so it is
 * outside `AdminPageLayout.root` and inherits none of the admin's custom
 * properties. Every `var(--ink-1)` inside a dialog would resolve to nothing.
 * The stylesheet composes `adminSurface` onto the panel to carry the whole
 * contract across the portal boundary - which is the same reason the admin
 * chrome and the auth gate compose it rather than inherit it.
 *
 * TWO - the panel treatment. Modal's default panel is the app's older
 * vocabulary: a radius, a drop shadow and `--color-bg-deep`. Three admin
 * dialogs restating the override would be three chances to disagree about it.
 *
 * WHY A WRAPPER AND NOT A SECOND MODAL. Everything worth reusing is in Modal
 * and none of it is visual; re-implementing a focus trap to change a background
 * colour is how a system ends up with two dismissal contracts and one of them
 * wrong.
 */
export default function AdminDialog({
  isOpen,
  onClose,
  heading,
  size = "form",
  actions,
  children,
}: AdminDialogProps): React.ReactNode {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      label={heading}
      className={`${styles.panel} ${SIZE_CLASS[size]}`}
      // The scrim is not reachable from the panel's class - it is the panel's
      // parent - and the admin has no blur anywhere else in it.
      backdropClassName={styles.backdrop}
    >
      {/* <h2>, not <h1>: aria-modal hides the rest of the document while this is
          open, so this is the top of the only outline that exists - but the
          page's own <h1> is still in the DOM behind it, and two <h1>s in one
          document is a worse answer than one level of nesting. */}
      <h2 className={styles.heading}>{heading}</h2>
      <div className={styles.body}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </Modal>
  );
}

const SIZE_CLASS: Record<AdminDialogSize, string> = {
  compact: styles.compact,
  form: styles.form,
};
