import { useEffect, useRef } from "react";

// Shared dismissal/affordance side-effects for any modal-like surface
// (session-details dialog, photo lightbox, etc.). Wiring all of Escape-to-close,
// background scroll lock, and focus restore here keeps every modal on one
// behavior contract instead of re-implementing the side-effects per modal.
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

    // Capture the trigger so focus can return to it after the modal closes.
    const previouslyFocused = document.activeElement;

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

      // Only restore focus if the trigger is still in the document and focusable.
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);
}
