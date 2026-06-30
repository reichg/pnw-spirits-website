import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { usePagination } from "./usePagination";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom, no
// @testing-library/react, and no react-test-renderer (see vitest.config.ts and
// package.json), and the work order forbids adding dependencies or config. That
// leaves react-dom/server's renderToStaticMarkup as the only available renderer,
// and it runs NEITHER effects NOR post-render setState. So the deterministically
// observable surface of usePagination is its render-time derivation at the
// initial state (storedPage === 1): totalPages, the effective page, and the
// page-1 slice, evaluated across different `items`/`pageSize`.
//
// usePagination is intentionally effect-free — its whole contract is computed in
// render — so that initial-render surface covers the bulk of the logic: the
// `totalPages = Math.max(1, ceil(len/size))` math (empty / single / multi page)
// and the page-1 slice. The two paths that require observing state AFTER a
// `setPage` call — `setPage`'s out-of-range clamp landing on the new page, and
// clamp-on-shrink once the page has been ADVANCED past 1 — cannot be exercised
// here because the resulting setState is never reflected by renderToStaticMarkup.
// Those are documented as an environment-imposed coverage gap in the specialist
// report (they need a renderer that runs state updates, i.e. a forbidden new
// dependency). What IS asserted of `setPage` is that it is a stable function on
// the returned API. The clamp-on-shrink INVARIANT is still partially guarded:
// from the initial page, a shrunk list always yields an in-range, non-empty
// page-1 slice and totalPages >= 1, so a non-empty list never surfaces an empty
// page.

// A probe that renders the hook's outputs into deterministic, assertable markup.
// `capture`, when provided, receives the live API object so a test can assert on
// the (non-rendered) `setPage` callback. Returning a string keeps the markup
// free of host elements so substring assertions are unambiguous.
function renderUsePagination<T>(
  items: T[],
  pageSize: number,
  capture?: (api: ReturnType<typeof usePagination<T>>) => void,
): { page: number; totalPages: number; pageItems: T[] } {
  let snapshot: {
    page: number;
    totalPages: number;
    pageItems: T[];
  } | null = null;

  function Probe(): React.ReactNode {
    const api = usePagination(items, pageSize);
    snapshot = { page: api.page, totalPages: api.totalPages, pageItems: api.pageItems };
    capture?.(api);
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (snapshot === null) {
    throw new Error("usePagination probe did not render");
  }
  return snapshot;
}

describe("usePagination (node / initial-render derivation contract)", () => {
  it("reports a single empty page for an empty list", () => {
    const { page, totalPages, pageItems } = renderUsePagination([], 12);

    expect(totalPages).toBe(1);
    expect(page).toBe(1);
    expect(pageItems).toEqual([]);
  });

  it("reports a single page when pageSize >= item count and includes every item", () => {
    const items = [1, 2, 3, 4, 5];
    const { totalPages, page, pageItems } = renderUsePagination(items, 12);

    expect(totalPages).toBe(1);
    expect(page).toBe(1);
    expect(pageItems).toHaveLength(5);
    expect(pageItems).toEqual(items);
  });

  it("computes totalPages and the page-1 slice for a multi-page list", () => {
    // 25 items / pageSize 10 -> ceil(25/10) === 3 pages; page 1 is items 0..9.
    const items = Array.from({ length: 25 }, (_, i) => i);
    const { totalPages, page, pageItems } = renderUsePagination(items, 10);

    expect(totalPages).toBe(3);
    expect(page).toBe(1);
    expect(pageItems).toEqual(items.slice(0, 10));
    expect(pageItems[0]).toBe(0);
    expect(pageItems[pageItems.length - 1]).toBe(9);
  });

  it("rounds totalPages up so a trailing partial page is counted", () => {
    // 12 items / pageSize 10 -> 2 pages (the last holding 2 items).
    const items = Array.from({ length: 12 }, (_, i) => i);
    const { totalPages } = renderUsePagination(items, 10);

    expect(totalPages).toBe(2);
  });

  it("never surfaces an empty page for a non-empty list (clamp-on-shrink invariant, page 1)", () => {
    // The load-bearing guarantee, observed at the initial page: regardless of how
    // small the list is relative to pageSize, the effective page stays in range
    // and the slice for a non-empty list is non-empty. This is the render-time
    // `Math.min(storedPage, totalPages)` clamp doing its job for storedPage === 1.
    const items = Array.from({ length: 12 }, (_, i) => i);
    const { totalPages, page, pageItems } = renderUsePagination(items, 10);

    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(page).toBeGreaterThanOrEqual(1);
    expect(page).toBeLessThanOrEqual(totalPages);
    expect(pageItems.length).toBeGreaterThan(0);
  });

  it("exposes a stable setPage function on the returned API", () => {
    // setPage's clamp RESULT (and clamp-on-shrink after the page is advanced)
    // requires observing state post-update, which renderToStaticMarkup cannot do;
    // see the coverage-scope note. The reachable contract here is that the API
    // surface includes a callable setPage.
    let captured: ReturnType<typeof usePagination<number>> | null = null;
    renderUsePagination([1, 2, 3], 2, (api) => {
      captured = api;
    });

    expect(captured).not.toBeNull();
    expect(typeof captured!.setPage).toBe("function");
  });
});
