"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE_SELECTOR, useModalDismiss } from "@/hooks/useModalDismiss";
import styles from "./Modal.module.css";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible name for the dialog, applied via aria-label. */
  label: string;
  /** Optional extra class merged onto the dialog panel. */
  className?: string;
  /**
   * Optional extra class merged onto the BACKDROP.
   *
   * It exists because `className` provably cannot reach it: the backdrop is the
   * panel's parent, so not even a custom property set by the panel's class
   * arrives here, and the backdrop is where the scrim and the 3px blur live.
   * The admin surface has no blur anywhere else in it and opts out through
   * this; the public dialogs pass nothing and are unchanged.
   */
  backdropClassName?: string;
  children: React.ReactNode;
};

// FOCUSABLE_SELECTOR moved to useModalDismiss, which now needs the identical
// definition for its focus-restore walk. Two copies would let "focusable" mean
// two things inside one dialog - the trap cycling through one set while focus is
// restored into another.

/**
 * Whether this dialog may currently be dismissed.
 *
 * WHY A CONTEXT AND NOT A PROP, which is the ordinary shape. The lock is owned
 * by the leaf that knows it (AdminConfirmDialog, from its `busy` flag) and
 * consumed by the primitive that owns every dismissal route (this file), with
 * AdminDialog in between - a component that has no business knowing whether a
 * given dialog is mid-request. A prop would have to be threaded through it
 * anyway, and AdminDialog is outside this specialist's boundary this round.
 *
 * WHY THE LOCK LIVES HERE AT ALL. It used to live in AdminConfirmDialog, which
 * neutered `onClose` while busy. That disabled Escape and the backdrop and left
 * the CLOSE BUTTON enabled and wired to a no-op - so the most clickable control
 * in a locked dialog silently did nothing, the tab ring contained exactly that
 * one dead stop, and body scroll was locked. A dialog whose only reachable
 * control does nothing reads as frozen, which is worse than either answer.
 * There are four dismissal routes and three of them are declared in this file,
 * so this is the only place all four can be made to agree.
 */
const ModalDismissLockContext = createContext(false);

/**
 * Marks everything inside as undismissable. Renders no DOM.
 *
 * Deliberately a boolean rather than a reason string: nothing renders it, and a
 * value nothing reads is scaffolding the next person has to guess the intent of.
 */
export function ModalDismissLock({
  locked,
  children,
}: {
  locked: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <ModalDismissLockContext.Provider value={locked}>
      {children}
    </ModalDismissLockContext.Provider>
  );
}

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
  backdropClassName,
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
  const dismissLocked = useContext(ModalDismissLockContext);

  // THE ONE GATE. Escape, the backdrop and the close button all come through
  // here, so "is this dialog dismissable right now" is answered once instead of
  // three times. Not memoised: useModalDismiss reads its handler through a ref
  // refreshed every render, so a fresh closure is what keeps `dismissLocked`
  // current rather than something to avoid.
  const requestClose = () => {
    if (dismissLocked) return;
    onClose();
  };

  // Called ABOVE the initial-focus effect on purpose: this hook captures the
  // trigger from document.activeElement, and React runs effects in call order,
  // so it has to read the outside world before the effect below moves focus in.
  useModalDismiss({ isOpen, onDismiss: requestClose });

  // INITIAL FOCUS LANDS ON THE PANEL, NOT ON THE CLOSE BUTTON.
  //
  // It used to be the close button, and the cost was measurable rather than
  // theoretical: the button's accessible name is "Close", so opening a dialog
  // whose entire purpose is to deliver a message announced "Close, button" and
  // the message was never read. On a confirmation that names the record about to
  // be destroyed, that is the one sentence the admin needed.
  //
  // The panel already carries role="dialog", aria-modal="true", an aria-label
  // and tabIndex={-1}, so focusing it announces the dialog's own name and then
  // reads into its content - the message. Every prerequisite was already here;
  // the bug was aiming one line at the wrong ref.
  //
  // THE THREE ALTERNATIVES, AND WHY EACH LOSES:
  //   - the first focusable control ("Keep post"): announces the way out before
  //     the question, which is the same failure as the close button wearing
  //     different clothes, and on a form-sized dialog it drops the user into the
  //     trailing action row rather than at the top of the form;
  //   - the heading: announces the same string this already does, because
  //     AdminDialog uses one value for both its <h2> and the aria-label so they
  //     cannot drift - and it would need a tabIndex={-1} on a non-interactive
  //     element in every dialog to say it;
  //   - leaving it: the status quo.
  //
  // It is also the right answer for the two public consumers. The photo
  // lightbox has no meaningful control except Close, and the session dialog is a
  // block of details - in both, the content is the point.
  //
  // Tab from the panel falls to the first focusable descendant natively, and
  // Shift+Tab is handled by the trap's `active === panel` branch below.
  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  // Locking disables the close button, and the control the user just pressed to
  // cause the lock (the confirm button) disables itself at the same moment - so
  // a locked dialog can contain NO enabled focusable element at all. When the
  // focused element is disabled the browser drops focus to <body>, and focus on
  // <body> is outside the panel, which means the Tab trap below - an onKeyDown
  // on the panel - never fires and Tab walks into the page behind the dialog.
  // Pulling focus back to the panel keeps the trap armed; the panel is
  // tabIndex={-1}, so it can hold focus, and the trap's own "nothing focusable
  // inside" branch then keeps Tab on it.
  useEffect(() => {
    if (!isOpen || !dismissLocked) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (!panel.contains(document.activeElement)) panel.focus();
  }, [isOpen, dismissLocked]);

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
    <div
      className={
        backdropClassName
          ? `${styles.backdrop} ${backdropClassName}`
          : styles.backdrop
      }
      onMouseDown={(event) => {
        // Clicks that originate INSIDE the panel are not dismissals and must
        // keep their default behaviour - focusing a control, placing a caret,
        // starting a selection - so they leave before the preventDefault below.
        if (event.target !== event.currentTarget) return;

        // THE DEFAULT ACTION OF A MOUSEDOWN IS THE BROWSER'S FOCUSING STEP, and
        // the backdrop is not focusable, so that step moves focus to <body> -
        // outside the panel - and moves the sequential-navigation starting
        // point with it. Preventing it stops both in one go. Both branches
        // below were measured wrong because of it, in different ways:
        //
        //   LOCKED. The dismissal is refused, the dialog stays up, and focus is
        //   now on <body>. The trap is an onKeyDown on the PANEL, so it never
        //   fires, and aria-modal="true" is being asserted over a page nothing
        //   makes inert. Measured: focus BUTTON "Deleting…" -> backdrop click
        //   -> BODY -> eight consecutive Shift+Tab stops on other records' Edit
        //   and Delete, all enabled; Enter on one retargets the still-open,
        //   still-locked dialog at a DIFFERENT record while the original DELETE
        //   is in flight - the mislabeled confirmation AdminConfirmDialog names
        //   the record to prevent. window.confirm could not be escaped, so this
        //   was the one respect in which the replacement was worse.
        //
        //   Plain Tab does NOT escape, because the click also parks the
        //   sequential-navigation starting point on the backdrop, which is last
        //   in document order. Only Shift+Tab gets out. A regression test that
        //   presses Tab passes against the broken code.
        //
        //   UNLOCKED. Measured focus after a backdrop close was <body>, not the
        //   trigger. A mousedown is a discrete event, so React flushes it
        //   synchronously: the unmount cleanup's focus restore runs INSIDE the
        //   dispatch and the focusing step then overwrites it. Escape and
        //   Cancel have no competing default action, which is why this was the
        //   only dismissal route that dropped focus.
        //
        // REJECTED: re-running the focus-recovery effect above - its deps are
        // [isOpen, dismissLocked] and a backdrop mousedown changes neither, and
        // widening it to a focusout listener means a permanent listener that
        // has to tell focus the dialog gave up from focus the browser took.
        // REJECTED: preventing default only while locked - it leaves the
        // unlocked route dropping focus to <body>, and both are this one bug.
        // DEFERRED: marking the rest of the page inert, which is what
        // aria-modal should be paired with. That is a change to every consumer
        // and to the portal's siblings, not to this handler.
        event.preventDefault();
        requestClose();
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
        {/* Disabled rather than hidden while locked: removing it would reflow
            the panel's corner mid-interaction and would tell a screen reader the
            control had ceased to exist, when what is true is that it is
            temporarily unavailable. `disabled` also takes it out of
            FOCUSABLE_SELECTOR, so the trap stops offering a dead tab stop. */}
        <button
          type="button"
          aria-label="Close"
          className={styles.close}
          disabled={dismissLocked}
          onClick={requestClose}
        >
          <span aria-hidden="true">&times;</span>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
