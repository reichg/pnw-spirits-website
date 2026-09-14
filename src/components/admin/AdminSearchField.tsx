"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./AdminSearchField.module.css";

/**
 * Long enough that a typed word is not four fetches, short enough that the list
 * still feels attached to the field. The same 300ms `ContentArchiveSearch`
 * settled on, for the same reason on the other side of the boundary: each
 * commit here is an uncached round trip to a paged API route.
 */
const SEARCH_DEBOUNCE_MS = 300;

export type AdminSearchFieldProps = {
  /** Accessible name. Rendered visually hidden - the placeholder is the visible
   *  affordance, and a placeholder is not a name: it is erased on first keypress. */
  label: string;
  placeholder: string;
  /** The term the list is currently filtered by - not what is typed. */
  value: string;
  /**
   * Called with a committed term: debounced while typing, immediate on Enter
   * and on Clear.
   *
   * MUST BE STABLE (a `useCallback` with no changing deps). It is a dependency
   * of the debounce effect below, so a fresh identity on every parent render
   * restarts the timer, and a list that re-renders on an interval would never
   * commit a search at all.
   */
  onSearch: (term: string) => void;
};

/**
 * The admin's list search: a controlled field over client state.
 *
 * WHY NOT `ContentArchiveSearch`, which looks identical and is three doors
 * away. That component drives the router: it commits by `router.replace` to a
 * built archive href, it is a real GET `<form action={basePath}>` so the
 * archive keeps working without JavaScript, and its whole reason to exist is
 * that an archive page is a *server* component whose query lives in the URL. An
 * admin list has no URL to write to - it is one client component holding its
 * own page and term in `useState` behind an auth gate - so reusing it would
 * mean handing it a `basePath` it must not navigate to and then intercepting
 * the navigation it exists to perform. Two components, one shape, two
 * mechanisms; the shared part is the bare underlined field, which is a
 * stylesheet, not a component.
 *
 * WHY IT STILL OWNS A `<form>`. Enter has to commit immediately rather than
 * wait out the debounce, and implicit submission is what a browser gives a
 * single-input form for free; a `<div role="search">` would need a keydown
 * handler to fake it. There is no `action` and the input has no `name` because
 * there is nothing to submit to - the admin subtree does not render at all
 * without JavaScript, so the no-JS fallback `ContentArchiveSearch` carefully
 * preserves has no meaning here.
 *
 * WHY THE CLEAR CONTROL IS PART OF THIS COMPONENT. The empty state it rescues
 * is the reason: an admin who searches their way into "no blogs match" must be
 * able to reverse it *in place*, so the control that caused the empty state has
 * to outlive it. Owning it here is what makes that structural rather than a
 * rule each screen has to remember.
 */
export default function AdminSearchField({
  label,
  placeholder,
  value,
  onSearch,
}: AdminSearchFieldProps): React.ReactNode {
  // Generated, not a constant: a hardcoded id collides the moment a screen
  // renders two of these, and a duplicate id silently repoints the second
  // label at the first input.
  const fieldId = useId();
  const [draft, setDraft] = useState(value);
  /** The field Clear hands focus back to - see the Clear control below. */
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * The term the list currently holds, as far as this field knows. A ref
   * because nothing renders from it - it exists only to tell "the user typed"
   * apart from "the term changed underneath us", which one `draft` cannot do.
   */
  const committed = useRef(value);

  // A term that arrived from outside: a screen resetting its own filter, say.
  // Adopted without clobbering what is being typed, because it fires only when
  // the prop itself moved.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draft;
      onSearch(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, onSearch]);

  // Enter and Clear skip the debounce. Setting `committed` first is what stops
  // the effect above from firing a second, identical commit 300ms later.
  const commitNow = useCallback(
    (term: string) => {
      committed.current = term;
      setDraft(term);
      onSearch(term);
    },
    [onSearch],
  );

  return (
    <form
      className={styles.field}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        commitNow(draft);
      }}
    >
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        ref={inputRef}
        className={styles.input}
        type="search"
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
      />
      {/* Rendered only when there is something to clear, which is exactly when
          an empty list needs an exit. The field reserves its width permanently
          in CSS so appearing does not reflow the input under the cursor.

          IT UNMOUNTS ITSELF, so it has to say where focus goes first.
          Activating it empties `draft`, which is the condition it renders
          under - the control removes itself as a direct result of its own
          press, and the browser answers by dropping focus to <body>. Measured
          stable at BODY for >940ms on both list screens.

          That was a chained failure, not a cosmetic one: the lists' post-delete
          restore sends focus HERE when a search emptied them, because the empty
          copy names this control ("Clear the search to see all of them"). So a
          keyboard admin was being routed to the one control that stranded them.

          THE TARGET IS THE FIELD THIS BUTTON JUST CLEARED. It is the only
          element in this form that never unmounts; it is where the admin is
          already headed, since the reason to clear a search is to search again
          or to read the restored list; and it is what every native search
          field's own clear affordance does.

          The lists' rule that focus must never be parked in a text field the
          admin did not choose still holds and is not being bent: that rule
          exists because focus landing in a field after an UNRELATED transition
          (a delete) turned the next keystrokes into an upload caption. Pressing
          a field's own Clear is that admin choosing this field.

          REJECTED: leaving it to `focusIfOrphaned` in @/components/admin/
          adminFocus - that helper restores focus after the fact and declines
          unless focus is already on <body>, which means accepting the drop and
          then correcting it a frame later. Here the drop is preventable, and
          the control that causes it is the one holding focus, so the handoff is
          synchronous and nothing ever reaches <body>.
          REJECTED: rendering Clear permanently and marking it aria-disabled,
          the way the pager's boundary controls now keep their place. The pager
          is a fixed pair whose shape should not change as you page; a Clear
          that is always on screen is a permanent tab stop and a permanent piece
          of furniture for a state that is usually absent. */}
      {draft ? (
        <button
          type="button"
          className={styles.clear}
          onClick={(event) => {
            // Asked BEFORE anything moves: is this button the thing focus would
            // be lost from? A pointer user who never focused it - iOS Safari
            // does not focus a button on tap - is left alone, so clearing a
            // search by tapping cannot summon the on-screen keyboard for a
            // field they did not ask to type in.
            const stranding = document.activeElement === event.currentTarget;
            // Focus first, commit second. React batches the state update until
            // after this handler returns, so the button is still mounted here
            // either way - but moving focus off it before the render that
            // removes it keeps this correct even under a synchronous flush.
            if (stranding) inputRef.current?.focus();
            commitNow("");
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
