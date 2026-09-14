import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ContentArchiveLayout from "./ContentArchiveLayout";
import type { ContentArchiveLayoutProps, ContentItem } from "./content.types";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json). That is not a
// real limitation here: the layout is presentational and server-only — it
// fetches nothing and holds no state — so renderToStaticMarkup observes its
// whole contract.
//
// Items use `kind: "url"` media rather than `kind: "s3"` because the s3 branch
// renders no <img> until a client effect resolves a signed URL (see
// ContentRow.test.tsx). The one per-row image attribute the layout owns — the
// index-0-only `priority` — is only observable on the direct-URL branch. The
// archive pages sign server-side and take that same branch in production.
//
// `controls` is exercised with an inert node rather than the real
// ContentArchiveSearch: the layout's contract is that it renders whatever it is
// handed into that slot, and the search component is a client component needing
// a mounted app router (its own coverage is in ContentArchiveSearch.test.tsx).
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists anyway - see the canonical note in
// Pagination.test.tsx.
// Rows are counted by their <h2> titles, which only ContentRow emits.

function item(id: string, title: string): ContentItem {
  return {
    id,
    kicker: "Recipe",
    title,
    meta: `By Author ${id}`,
    excerpt: `Summary ${id}`,
    timestamp: { iso: "2026-01-02T12:00:00.000Z", label: "January 2, 2026" },
    media: { kind: "url", src: `https://img.example.com/${id}.jpg` },
    link: { kind: "internal", href: `/recipes/${id}` },
    ariaLabel: `View recipe: ${title}`,
  };
}

const ITEMS = [item("1", "First"), item("2", "Second"), item("3", "Third")];

const BASE: ContentArchiveLayoutProps = {
  backLink: { href: "/recipes-landing", label: "Recipes" },
  heading: "All Recipes",
  resultCount: "47 recipes",
  items: ITEMS,
  // No apostrophe: React escapes one to &#x27; in static markup, which would
  // make assertions about this copy misleading rather than wrong.
  emptyMessage: "No recipes have been published yet.",
  page: 1,
  totalPages: 4,
  hrefForPage: (page: number) => `/recipes?page=${page}`,
};

function render(overrides: Partial<ContentArchiveLayoutProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(ContentArchiveLayout, { ...BASE, ...overrides }),
  );
}

describe("ContentArchiveLayout header", () => {
  it("renders the heading as the page's h1", () => {
    const html = render();

    expect(countTags(html, "h1")).toBe(1);
    expect(html).toContain(">All Recipes<");
  });

  it("merges a page-specific root class onto the main landmark", () => {
    // Counted rather than anchored to the start of the string: next/image
    // hoists a <link rel="preload"> for the first row's image ahead of the tree.
    const html = render({ className: "page-specific" });

    expect(countTags(html, "main")).toBe(1);
    // The layout's own root class survives beside the caller's rather than
    // being replaced by it. The hashed value itself is not a contract.
    expect(html).toMatch(/<main class="\S+ page-specific"/);
  });
});

describe("ContentArchiveLayout back link", () => {
  it("announces the bare section name, with the arrow hidden from assistive tech", () => {
    // The regression this guards: an arrow that is not aria-hidden makes the
    // link announce as "left arrow Recipes". The arrow is decoration; the
    // accessible name is the destination.
    const html = render();
    const back = sliceElement(html, "<a", "/recipes-landing");

    expect(back).toContain('href="/recipes-landing"');
    expect(back).toContain('aria-hidden="true"');
    // The arrow character sits inside the hidden span, and the label outside it.
    expect(back).toMatch(/aria-hidden="true">←<\/span>Recipes/);
    // No aria-label overriding the contents, which would be a second place for
    // the name to drift from what is on screen.
    expect(back).not.toContain("aria-label=");
  });

  it("renders no back row at all when the archive has no landing page", () => {
    const html = render({ backLink: undefined });

    expect(html).not.toContain("/recipes-landing");
    expect(html).not.toContain("←");
    expect(html).not.toContain("aria-hidden");
  });
});

describe("ContentArchiveLayout result count", () => {
  it("renders the already-worded count when the page supplies one", () => {
    // Passed through verbatim: pluralisation and the word for the thing being
    // counted are domain knowledge, and this layout must not know what a recipe
    // is.
    expect(render()).toContain(">47 recipes<");
  });

  it("renders no count element when the count is unknown", () => {
    // Undefined is what archiveResultCount returns for an empty or unreadable
    // total, so this is the path an empty archive takes: no "0 recipes" line
    // stacked above the empty message.
    const html = render({ resultCount: undefined, controls: undefined });

    expect(html).not.toContain("47 recipes");
    expect(html).not.toContain("<p></p>");
  });

  it("escapes a count carrying a search term, rather than trusting it as markup", () => {
    // archiveResultCount interpolates the term as plain text and leaves escaping
    // to the view. This is the view. `?q=<img src=x onerror=...>` reaching the
    // header as live markup is the failure being pinned.
    const html = render({
      resultCount: '3 recipes matching “<img src=x onerror="alert(1)">”',
    });

    // Present as text, absent as markup: the angle brackets and the quotes are
    // entities, so nothing in the term can open an element or an attribute.
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img src=x");
    // The only <img> elements in the document are the three real rows; the term
    // did not become a fourth.
    expect(countTags(html, "img")).toBe(ITEMS.length);
  });
});

describe("ContentArchiveLayout controls slot", () => {
  it("renders whatever the page puts in the controls slot", () => {
    const html = render({
      controls: React.createElement("button", { type: "button" }, "Control"),
    });

    expect(html).toContain(">Control</button>");
  });

  it("renders the header foot when only controls are present", () => {
    // The /videos archive has a count and no controls; a failed fetch on
    // /blogs has controls and no count. Both halves must stand alone.
    const html = render({
      resultCount: undefined,
      controls: React.createElement("span", null, "Control"),
    });

    expect(html).toContain(">Control</span>");
  });

  it("renders no header foot at all when there is neither a count nor controls", () => {
    // An empty ruled band under the title reads as a broken header.
    const withNeither = render({ resultCount: undefined, controls: undefined });
    const withBoth = render({
      controls: React.createElement("span", null, "Control"),
    });

    // The foot is the only <div> in the header; its absence is observable as one
    // fewer div in the markup than the both-present case.
    expect(countTags(withNeither, "div")).toBeLessThan(
      countTags(withBoth, "div"),
    );
    expect(withNeither).not.toContain("<div></div>");
  });
});

describe("ContentArchiveLayout list and empty state", () => {
  it("renders one row per item and no empty message", () => {
    const html = render();

    expect(countTags(html, "h2")).toBe(3);
    expect(html).toContain("First");
    expect(html).toContain("Third");
    expect(html).not.toContain("No recipes have been published yet.");
  });

  it("renders the page's empty message, and no rows, when there are no items", () => {
    const html = render({ items: [] });

    expect(countTags(html, "h2")).toBe(0);
    expect(html).toContain("No recipes have been published yet.");
    // The header still renders: an empty archive is still a page, not a blank.
    expect(html).toContain(">All Recipes<");
  });

  it("shows the page's wording verbatim, whatever the reason for the emptiness", () => {
    // The layout owns no copy. "nothing published", "nothing matched" and "past
    // the last page" are all the same branch here, which is what lets the three
    // archives word their own states without a variant prop.
    const message = "No recipes match that search.";
    const html = render({ items: [], emptyMessage: message });

    expect(html).toContain(message);
  });

  it("preloads the first row's image only and lazy-loads the rest", () => {
    // The page does not know render order; the layout does. Twelve preloads
    // would compete with the LCP element for the same bandwidth.
    const html = render();

    expect(countOccurrences(html, 'rel="preload"')).toBe(1);
    const preload = html.slice(0, html.indexOf("<img"));
    expect(preload).toContain(
      encodeURIComponent("https://img.example.com/1.jpg"),
    );
    expect(preload).not.toContain(
      encodeURIComponent("https://img.example.com/2.jpg"),
    );
    expect(countOccurrences(html, 'loading="lazy"')).toBe(ITEMS.length - 1);
  });

  it("preloads the whole first line when the archive is two-up", () => {
    // The contract WIDENED here, from "priority on index 0" to "priority on the
    // first line", and this is the case that tells the two apart. At the default
    // columns={1} the layout's `index < columns` is indistinguishable from
    // `index === 0`, so every other assertion in this file would keep passing
    // against the narrow rule purely by coincidence of the default.
    const html = render({ columns: 2 });

    expect(countOccurrences(html, 'rel="preload"')).toBe(2);
    expect(countOccurrences(html, 'loading="lazy"')).toBe(ITEMS.length - 2);
    // The first two specifically, not any two: a count alone would pass if
    // priority landed on the wrong pair.
    const preloads = html.slice(0, html.indexOf("<main"));
    expect(preloads).toContain(imageSrc("1"));
    expect(preloads).toContain(imageSrc("2"));
    expect(preloads).not.toContain(imageSrc("3"));
  });

  it("preloads index 0 alone at the default single column", () => {
    // The other half of the same rule, asserted explicitly rather than left to
    // the default. ContentArchiveColumns is typed 1 | 2, so these two cases are
    // the whole domain.
    for (const props of [{}, { columns: 1 as const }]) {
      const html = render(props);

      expect(countOccurrences(html, 'rel="preload"')).toBe(1);
      expect(countOccurrences(html, 'loading="lazy"')).toBe(ITEMS.length - 1);
    }
  });

  it("writes the column count into an inline custom property", () => {
    // The count has to reach CSS somehow, and it cannot go the other way: a
    // server render cannot read a custom property, and `priority` is decided
    // during that render. So the prop is the source of truth and the layout
    // publishes it downward.
    //
    // WHERE THIS COVERAGE STOPS: Vitest does not process CSS, so what is
    // asserted is the style attribute the server emits — NOT the
    // grid-template-columns it resolves to. That half has no unit coverage by
    // construction; see docs/testing.md.
    expect(render({ columns: 2 })).toContain("--archive-columns:2");
    expect(render({ columns: 1 })).toContain("--archive-columns:1");
    expect(render()).toContain("--archive-columns:1");
  });

  it("marks the first row priority even when the archive holds a single row", () => {
    const html = render({ items: [item("1", "Only")] });

    expect(countOccurrences(html, 'rel="preload"')).toBe(1);
    expect(html).not.toContain('loading="lazy"');
  });
});

describe("ContentArchiveLayout pager", () => {
  it("renders no pager, and no band to hold it, at a single page", () => {
    // An empty ruled band under a short archive reads as a broken footer, which
    // is why the row brackets the pager rather than always rendering.
    const html = render({ totalPages: 1 });

    expect(html).not.toContain("<nav");
    expect(html).not.toContain("Pagination");
    expect(html).not.toContain("Page 1 of");
  });

  it("renders the pager beyond a single page", () => {
    const html = render({ page: 2, totalPages: 4 });

    expect(html).toContain("<nav");
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain("Page 2 of 4");
  });

  it("drives the pager in link mode, using the caller's href builder", () => {
    // Server components have no handlers to give, and a real link is what makes
    // a page of the archive shareable, crawlable and openable in a new tab.
    const html = render({ page: 2, totalPages: 4 });

    expect(html).not.toContain("<button");
    expect(html).toContain('href="/recipes?page=1"');
    expect(html).toContain('href="/recipes?page=3"');
  });

  it("still renders the pager when the page is empty but the archive is not", () => {
    // ?page=999 on a four-page archive: no rows, but the pager is the reader's
    // way back into range and must survive the empty branch.
    const html = render({ items: [], page: 4, totalPages: 4 });

    expect(countTags(html, "h2")).toBe(0);
    expect(html).toContain("Page 4 of 4");
    expect(html).toContain('href="/recipes?page=3"');
  });
});

// Counts opening tags of the given name, e.g. countTags(html, "p") ignores the
// closing </p> and any tag that merely starts with the same letters.
function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** The encoded src next/image emits for the test item with the given id. */
function imageSrc(id: string): string {
  return encodeURIComponent(`https://img.example.com/${id}.jpg`);
}

/**
 * Returns the markup of the element that opens with `openTag` and contains
 * `marker`, bounded at the next occurrence of `openTag`, so a per-element
 * attribute can be asserted without matching a sibling.
 */
function sliceElement(html: string, openTag: string, marker: string): string {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error(`"${marker}" not found in markup`);
  const start = html.lastIndexOf(openTag, markerIndex);
  const next = html.indexOf(openTag, markerIndex);
  return html.slice(
    start === -1 ? markerIndex : start,
    next === -1 ? html.length : next,
  );
}
