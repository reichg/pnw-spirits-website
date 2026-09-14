"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ARCHIVE_QUERY_PARAM, buildArchiveHref } from "@/utils/contentArchive";
import type { ContentArchiveSearchProps } from "./content.types";
import styles from "./ContentArchiveSearch.module.css";

/**
 * Long enough that a typed word is not four navigations, short enough that the
 * list feels attached to the field. Each navigation is a server round-trip and
 * a fresh uncached fetch, so this is a cost ceiling as much as a feel setting.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The one client component in the archive, and it is a leaf on purpose.
 *
 * Everything above it - the layout and every row - is a server component, which
 * is what keeps cover photos signed on the server and rendered as real <img> in
 * the server response. Pushing the boundary any higher would undo that.
 *
 * It reads no state of its own from the URL: `query` is passed down by the
 * server page, which has already parsed and trimmed it. useSearchParams is
 * deliberately not used, both because the value is already in hand and because
 * it would oblige every ancestor to sit inside a Suspense boundary.
 *
 * Navigation targets are built by buildArchiveHref and never by string
 * concatenation - the term is user input and may contain `&`, `#` or a space -
 * and `page` is omitted, which is what makes a new search reset to page 1
 * rather than land the reader on page 7 of a different result set.
 */
export default function ContentArchiveSearch({
  basePath,
  query,
  label,
  placeholder,
}: ContentArchiveSearchProps): React.ReactNode {
  const router = useRouter();
  // Generated rather than a constant: a hardcoded id would collide the moment a
  // page rendered two archive controls, and a duplicate id silently repoints
  // the second label at the first input.
  const fieldId = useId();
  const [value, setValue] = useState(query);
  /**
   * The term the URL currently holds, as far as this field knows. It is a ref
   * rather than state because nothing renders from it: it exists only to answer
   * "has this changed because the user typed, or because the address changed
   * underneath us?" - the two cases that a single `value` cannot tell apart.
   */
  const committed = useRef(query);

  // A term that arrived from outside the field: the page's own "Clear search"
  // link, a back navigation, or a shared URL. Adopted without clobbering what
  // the user may be typing, because it only fires when the prop itself moved.
  useEffect(() => {
    if (query !== committed.current) {
      committed.current = query;
      setValue(query);
    }
  }, [query]);

  // Debounced navigation. `replace`, not `push`: pushing would put one history
  // entry on the stack per keystroke, so Back out of a recipe would walk the
  // reader backwards through their own typing one letter at a time.
  useEffect(() => {
    if (value === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = value;
      router.replace(buildArchiveHref(basePath, { query: value }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, basePath, router]);

  return (
    // A real GET form, not a div with an input in it. Without JavaScript the
    // browser submits to `action` and produces the same URL this component
    // would have built - the param name is the shared constant, and dropping
    // `page` is what resets a new search to the first page. With JavaScript the
    // submit is intercepted so Enter commits immediately instead of waiting out
    // the debounce.
    <form
      className={styles.form}
      role="search"
      action={basePath}
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        committed.current = value;
        router.replace(buildArchiveHref(basePath, { query: value }));
      }}
    >
      {/* Visually hidden rather than absent: the field's visible affordance is
          its placeholder, and a placeholder is not an accessible name - it is
          erased the moment the user types. */}
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className={styles.input}
        type="search"
        name={ARCHIVE_QUERY_PARAM}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}
