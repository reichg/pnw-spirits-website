import { describe, expect, it } from "vitest";

import {
  ARCHIVE_PAGE_PARAM,
  ARCHIVE_QUERY_PARAM,
  archiveEmptyState,
  archiveResultCount,
  buildArchiveHref,
  parseArchivePage,
  parseArchiveQuery,
  type ArchiveNoun,
} from "./contentArchive";
import { MAX_SEARCH_LENGTH } from "./pagination";

/** Both forms supplied, so "1 recipes" cannot pass by appending an "s". */
const NOUN: ArchiveNoun = { singular: "recipe", plural: "recipes" };

// The archives' whole URL contract lives in this module, which is why it is pure:
// these assertions need no DOM, no router and no fetch, and the repo runs Vitest
// in the node environment with neither jsdom nor @testing-library available.

describe("parseArchivePage", () => {
  it("reads a whole page number", () => {
    expect(parseArchivePage("3")).toBe(3);
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["zero", "0"],
    ["negative", "-3"],
    ["fractional", "2.5"],
    ["unparseable", "abc"],
    ["infinite", "Infinity"],
    ["beyond safe integer range", "9007199254740993"],
  ])("falls back to page 1 when the value is %s", (_label, value) => {
    expect(parseArchivePage(value)).toBe(1);
  });

  it("falls back to page 1 for a repeated param, which arrives as an array", () => {
    // ?page=2&page=5 - there is no defensible way to pick one of the two.
    expect(parseArchivePage(["2", "5"])).toBe(1);
  });
});

describe("parseArchiveQuery", () => {
  it("trims the term", () => {
    expect(parseArchiveQuery("  gin  ")).toBe("gin");
  });

  it("returns an empty string when the param is absent", () => {
    expect(parseArchiveQuery(undefined)).toBe("");
  });

  it("returns an empty string for a whitespace-only term", () => {
    expect(parseArchiveQuery("   ")).toBe("");
  });

  it("returns an empty string for a repeated param, which arrives as an array", () => {
    expect(parseArchiveQuery(["gin", "rye"])).toBe("");
  });

  it("bounds an over-long term to the length the list routes also apply", () => {
    // Truncates rather than falling back to "": falling back would turn a long
    // search into "return everything", which reads as a query that matched the
    // whole collection. `searchParam` in @/utils/pagination makes the same
    // choice, and this is the door that has to agree with it.
    const bounded = parseArchiveQuery("g".repeat(MAX_SEARCH_LENGTH + 50));

    expect(bounded).toHaveLength(MAX_SEARCH_LENGTH);
    expect(bounded).toBe("g".repeat(MAX_SEARCH_LENGTH));
  });

  it("leaves a term at exactly the bound untouched", () => {
    const exact = "g".repeat(MAX_SEARCH_LENGTH);

    expect(parseArchiveQuery(exact)).toBe(exact);
  });

  it("trims before it bounds, so padding does not eat into the allowance", () => {
    // The order is observable: slicing first would spend two of the hundred
    // characters on the leading spaces and hand back 98 real ones.
    const padded = `  ${"g".repeat(MAX_SEARCH_LENGTH)}  `;

    expect(parseArchiveQuery(padded)).toHaveLength(MAX_SEARCH_LENGTH);
  });
});

describe("buildArchiveHref", () => {
  it("omits page 1 and an empty query, so page one has one canonical URL", () => {
    expect(buildArchiveHref("/recipes", {})).toBe("/recipes");
    expect(buildArchiveHref("/recipes", { page: 1, query: "" })).toBe(
      "/recipes",
    );
    expect(buildArchiveHref("/recipes", { page: 1, query: "   " })).toBe(
      "/recipes",
    );
  });

  it("emits the page param beyond page one", () => {
    expect(buildArchiveHref("/blogs", { page: 4 })).toBe(
      `/blogs?${ARCHIVE_PAGE_PARAM}=4`,
    );
  });

  it("carries the search term across a page change", () => {
    expect(buildArchiveHref("/recipes", { page: 2, query: "gin" })).toBe(
      `/recipes?${ARCHIVE_QUERY_PARAM}=gin&${ARCHIVE_PAGE_PARAM}=2`,
    );
  });

  it("percent-encodes a term that would otherwise break out of its slot", () => {
    const href = buildArchiveHref("/recipes", { query: "gin & tonic #2" });

    expect(href).toBe("/recipes?q=gin+%26+tonic+%232");
    // Round-trips back to the term the user typed.
    expect(new URL(href, "https://example.test").searchParams.get("q")).toBe(
      "gin & tonic #2",
    );
  });

  it("trims the term it encodes", () => {
    expect(buildArchiveHref("/blogs", { query: "  rye  " })).toBe(
      "/blogs?q=rye",
    );
  });

  it("ignores a page number that is not a whole page", () => {
    expect(buildArchiveHref("/blogs", { page: 0 })).toBe("/blogs");
    expect(buildArchiveHref("/blogs", { page: -2 })).toBe("/blogs");
    expect(buildArchiveHref("/blogs", { page: 1.5 })).toBe("/blogs");
    expect(buildArchiveHref("/blogs", { page: Number.NaN })).toBe("/blogs");
  });

  it("round-trips through the parsers", () => {
    const href = buildArchiveHref("/recipes", {
      page: 3,
      query: "old fashioned",
    });
    const params = new URL(href, "https://example.test").searchParams;

    expect(parseArchivePage(params.get(ARCHIVE_PAGE_PARAM) ?? undefined)).toBe(
      3,
    );
    expect(
      parseArchiveQuery(params.get(ARCHIVE_QUERY_PARAM) ?? undefined),
    ).toBe("old fashioned");
  });
});

// `totalPagesFor` is re-exported from here but defined in `@/utils/pagination`,
// where it is shared with the admin lists and the client paging hook; its cases
// live in pagination.test.ts.

describe("archiveEmptyState", () => {
  it("reports an empty archive", () => {
    expect(
      archiveEmptyState({ query: "", requestedPage: 1, totalPages: 1 }),
    ).toBe("no-content");
  });

  it("reports a search that matched nothing", () => {
    expect(
      archiveEmptyState({ query: "gin", requestedPage: 1, totalPages: 1 }),
    ).toBe("no-results");
  });

  it("prefers the search case, so a filtered archive is never called empty", () => {
    expect(
      archiveEmptyState({ query: "gin", requestedPage: 9, totalPages: 1 }),
    ).toBe("no-results");
  });

  it("reports a page past the last one", () => {
    expect(
      archiveEmptyState({ query: "", requestedPage: 999, totalPages: 4 }),
    ).toBe("page-out-of-range");
  });

  it("does not call page 1 of an empty archive out of range", () => {
    expect(
      archiveEmptyState({ query: "", requestedPage: 1, totalPages: 1 }),
    ).toBe("no-content");
  });
});

describe("archiveResultCount", () => {
  it("counts the whole filtered archive, in the plural", () => {
    // The number is the API's `total`, never items.length: a page of twelve
    // under a five-page pager headlined "12 recipes" is simply false.
    expect(archiveResultCount({ total: 47, noun: NOUN, query: "" })).toBe(
      "47 recipes",
    );
  });

  it("uses the singular for exactly one", () => {
    // "1 recipes" is the failure this function exists to prevent, and the reason
    // both forms of the noun are supplied rather than an "s" appended here.
    expect(archiveResultCount({ total: 1, noun: NOUN, query: "" })).toBe(
      "1 recipe",
    );
  });

  it("names the search term when the archive is filtered", () => {
    expect(archiveResultCount({ total: 3, noun: NOUN, query: "gin" })).toBe(
      "3 recipes matching “gin”",
    );
  });

  it("keeps the singular under a filter too", () => {
    expect(archiveResultCount({ total: 1, noun: NOUN, query: "gin" })).toBe(
      "1 recipe matching “gin”",
    );
  });

  // Zero is deliberately absent from this list: it is a readable count and now
  // renders. It has its own case below, beside the NaN case it must not be
  // confused with.
  it.each([
    ["negative", -4],
    ["fractional", 2.5],
    ["infinite", Number.POSITIVE_INFINITY],
    ["beyond safe integer range", 2 ** 53],
  ])(
    "states no count at all when the total is %s, because it is unreadable",
    (_label, total) => {
      // Undefined here means "the count is unknown", which is different from
      // knowing the count is zero — see the zero case below, which now renders.
      expect(
        archiveResultCount({ total, noun: NOUN, query: "" }),
      ).toBeUndefined();
      expect(
        archiveResultCount({ total, noun: NOUN, query: "gin" }),
      ).toBeUndefined();
    },
  );

  it("states a count of zero rather than falling silent", () => {
    // Reversed from the original behaviour, and the reason is layout rather than
    // wording: the count is a stacked sibling at <=599px, so omitting it
    // shortened the header by 34px and shifted the search field, the copper rule
    // and every row underneath it — mid-keystroke, each time a search returned
    // nothing. A line that is always present cannot do that.
    expect(archiveResultCount({ total: 0, noun: NOUN, query: "" })).toBe(
      "0 recipes",
    );
    expect(archiveResultCount({ total: 0, noun: NOUN, query: "gin" })).toBe(
      "0 recipes matching “gin”",
    );
  });

  it("stays silent for a NaN total, which is how a failed fetch reports itself", () => {
    // LOAD-BEARING, and the counterpart to the zero case above. A failed fetch
    // does not know the count, so the pages send NaN rather than 0: rendering
    // "0 videos" there would state an empty channel as fact, which a reader
    // cannot tell apart from a genuinely empty one.
    //
    // THE TRAP: `NaN < 0` is false, so the `total < 0` half of the guard does
    // nothing here — `Number.isSafeInteger` is what rejects NaN, and it is the
    // only thing that does. A "simplification" to a plain numeric comparison
    // (`total < 0`, or `total <= 0` restored) would pass every other assertion
    // in this file and silently put "0 videos" back on a failed fetch.
    expect(Number.NaN < 0).toBe(false);

    expect(
      archiveResultCount({ total: Number.NaN, noun: NOUN, query: "" }),
    ).toBeUndefined();
    expect(
      archiveResultCount({ total: Number.NaN, noun: NOUN, query: "gin" }),
    ).toBeUndefined();
  });

  it("shows the term that was actually searched, bounded once by the parser", () => {
    // The load-bearing agreement in this module. `parseArchiveQuery` is the only
    // door `?q=` comes through, so the term rendered into the header is
    // character-for-character the term the API was asked to filter on. Were
    // either side to bound separately, a 150-character `?q=` would be searched
    // as 100 characters and displayed as 150 — or the reverse.
    const raw = "g".repeat(MAX_SEARCH_LENGTH + 50);
    const query = parseArchiveQuery(raw);

    const count = archiveResultCount({ total: 3, noun: NOUN, query });

    expect(query).toHaveLength(MAX_SEARCH_LENGTH);
    expect(count).toBe(`3 recipes matching “${query}”`);
    // The unbounded original never reaches the header.
    expect(count).not.toContain(raw);
    expect(count?.length).toBeLessThan(raw.length);
  });

  it("returns the term as plain text, leaving escaping to the view", () => {
    // A contract note rather than a nicety: the layout renders this as an
    // ordinary React text child and React escapes it there. It must never reach
    // dangerouslySetInnerHTML, and it must not be pre-escaped here either —
    // that would render the entities literally. The page tests assert the
    // escaping actually happens on the way out.
    expect(
      archiveResultCount({ total: 2, noun: NOUN, query: "<b>gin</b>" }),
    ).toBe("2 recipes matching “<b>gin</b>”");
  });
});
