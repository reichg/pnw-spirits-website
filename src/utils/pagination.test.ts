import { describe, expect, it } from "vitest";

import {
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  paginationParams,
  searchParam,
  totalPagesFor,
} from "./pagination";

// Moved here with the function itself, from contentArchive.test.ts. The cases
// are unchanged: this is the same formula, now asserted where it lives rather
// than through the archive module that re-exports it.

describe("totalPagesFor", () => {
  it("reports a single page for an empty collection", () => {
    expect(totalPagesFor(0, 12)).toBe(1);
  });

  it("rounds a partial last page up", () => {
    expect(totalPagesFor(12, 12)).toBe(1);
    expect(totalPagesFor(13, 12)).toBe(2);
    expect(totalPagesFor(25, 12)).toBe(3);
  });

  it("reports a single page for a total the API did not send as a number", () => {
    expect(totalPagesFor(Number.NaN, 12)).toBe(1);
    expect(totalPagesFor(-5, 12)).toBe(1);
  });

  it("reports a single page rather than Infinity for a zero page size", () => {
    expect(totalPagesFor(40, 0)).toBe(1);
  });
});

describe("paginationParams", () => {
  const params = paginationParams(10);
  /** What a route passes: `searchParams.get` yields `null` when absent. */
  const parse = (page: string | null, pageSize: string | null = null) =>
    params.parse({ page, pageSize });

  it("keeps each route's own default rather than standardising one", () => {
    expect(paginationParams(9).parse({ page: null, pageSize: null })).toEqual({
      page: 1,
      pageSize: 9,
    });
    expect(paginationParams(10).parse({ page: null, pageSize: null })).toEqual({
      page: 1,
      pageSize: 10,
    });
  });

  it.each([
    ["absent", null],
    ["non-numeric", "abc"],
    ["empty", ""],
    ["fractional", "1.5"],
    ["zero", "0"],
    ["negative", "-1"],
    ["infinite", "1e999"],
    ["beyond the safe-integer range", "99999999999999999999"],
  ])("falls back to page one for a %s page", (_label, value) => {
    expect(parse(value).page).toBe(1);
  });

  // The `.max()` trap: `.max()` is a validation failure, so `.catch()` would
  // turn "give me 200" into the default page size rather than the ceiling.
  it("clamps an over-large pageSize to the ceiling instead of the default", () => {
    expect(parse(null, String(MAX_PAGE_SIZE + 1)).pageSize).toBe(MAX_PAGE_SIZE);
    expect(parse(null, "100000").pageSize).toBe(MAX_PAGE_SIZE);
    expect(parse(null, "200").pageSize).not.toBe(10);
  });

  it("clamps an over-large page to the ceiling instead of the default", () => {
    expect(parse(String(MAX_PAGE + 1)).page).toBe(MAX_PAGE);
    expect(parse("9007199254740991").page).toBe(MAX_PAGE);
  });

  it("leaves a legitimate request untouched", () => {
    expect(parse("3", "25")).toEqual({ page: 3, pageSize: 25 });
    expect(parse(String(MAX_PAGE), String(MAX_PAGE_SIZE))).toEqual({
      page: MAX_PAGE,
      pageSize: MAX_PAGE_SIZE,
    });
  });

  // The whole point of the two ceilings: `skip` is a product of both, and with
  // either factor free to approach MAX_SAFE_INTEGER the product leaves the safe
  // range and Prisma rejects it — a public 500 reachable from a query param.
  it("bounds skip to a safe integer for every hostile input pair", () => {
    const hostile = [
      null,
      "abc",
      "",
      "-1",
      "0",
      "1.5",
      "1e999",
      "NaN",
      "Infinity",
      "-Infinity",
      "9007199254740991",
      "99999999999999999999",
      "0x10",
      "1e3",
      " 2 ",
      "2abc",
      "true",
      "null",
    ];

    for (const a of hostile) {
      for (const b of hostile) {
        const { page, pageSize } = parse(a, b);
        const skip = (page - 1) * pageSize;

        expect(Number.isSafeInteger(skip)).toBe(true);
        expect(skip).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(pageSize)).toBe(true);
        expect(pageSize).toBeGreaterThanOrEqual(1);
        expect(pageSize).toBeLessThanOrEqual(MAX_PAGE_SIZE);
      }
    }
  });
});

describe("searchParam", () => {
  it("passes an ordinary term through", () => {
    expect(searchParam.parse("gin")).toBe("gin");
  });

  it("treats an absent term as no filter", () => {
    expect(searchParam.parse(null)).toBe("");
  });

  // Whitespace-only used to survive as a truthy term, filtering on spaces and
  // keying the cache on them.
  it("trims, so a whitespace-only term disables the filter", () => {
    expect(searchParam.parse("  gin  ")).toBe("gin");
    expect(searchParam.parse("   ")).toBe("");
  });

  // Truncating rather than falling back to "": a term over the bound searches a
  // prefix, and since `contains` on a prefix matches a superset, the intended
  // results are still among the returned ones. `.catch("")` would instead read
  // as a search that matched the entire collection.
  it("truncates an over-length term rather than returning everything", () => {
    const term = "a".repeat(MAX_SEARCH_LENGTH + 50);
    const parsed = searchParam.parse(term);

    expect(parsed).toBe("a".repeat(MAX_SEARCH_LENGTH));
    expect(parsed).not.toBe("");
  });

  it("bounds the key space for any input length", () => {
    for (const length of [0, 1, 99, 100, 101, 10_000]) {
      expect(searchParam.parse("x".repeat(length)).length).toBeLessThanOrEqual(
        MAX_SEARCH_LENGTH,
      );
    }
  });
});
