"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useModalDismiss } from "@/hooks/useModalDismiss";
import styles from "./Modal.module.css";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible name for the dialog, applied via aria-label. */
  label: string;
  /** Optional extra class merged onto the dialog panel. */
  className?: string;
  children: React.ReactNode;
};

// Selector for the natively focusable elements a focus trap should cycle
// through. Kept here (not per-render) since it never changes.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Client-detection store: the snapshot is true on the client and false on the
// server, so `mounted` flips to true exactly once after hydration. This gates
// the portal (document.body is unavailable during SSR) without calling setState
// in an effect. The store never emits, so subscribe is a no-op.
const subscribe = () => () => {};

// Single shared, generic dialog primitive. Renders a backdrop + centered panel
// via a portal into document.body so it escapes any clipped/transformed
// ancestor (carousels, overflow-hidden cards). Generic by design: it carries no
// knowledge of sessions or photos, so a text-details modal and an image
// lightbox share one accessibility + dismissal contract.
//
// Escape-to-close, background scroll lock, and focus restore on close are owned
// by useModalDismiss; this component adds portal/backdrop rendering, the focus
// trap, and initial focus move.
export default function Modal({
  isOpen,
  onClose,
  label,
  className,
  children,
}: ModalProps): React.ReactNode {
  // Portal only after mount so the server render and the first client paint
  // match (document.body is unavailable during SSR), keeping hydration safe.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalDismiss({ isOpen, onDismiss: onClose });

  // Move focus into the dialog when it opens so keyboard users land inside the
  // trap. Focus restore on close is handled by useModalDismiss.
  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  // Keep Tab/Shift+Tab inside the dialog by wrapping focus at the boundaries.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) {
      // Nothing focusable inside: hold focus on the panel itself.
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || active === panel) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    // Clicking the backdrop closes; clicks that originate inside the panel are
    // ignored via the target check so interacting with content never dismisses.
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={
          className ? `${styles.panel} ${className}` : styles.panel
        }
        onKeyDown={handleKeyDown}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close"
          className={styles.close}
          onClick={onClose}
        >
          <span aria-hidden="true">&times;</span>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
