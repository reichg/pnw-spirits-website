import { describe, expect, it } from "vitest";

import { MAX_INT4, rowIdParamSchema, rowIdSchema } from "./rowId";

/**
 * The one exhaustive statement of the id rule, for the whole app.
 *
 * This table previously existed six times over, once per route test, which is
 * the same copy-paste the parser itself carried. It lives here now, beside the
 * single parser every one of those routes imports, and each route keeps a short
 * behavioural sample proving it actually calls this schema. Nothing was dropped:
 * this list is the union of all six.
 *
 * Every entry is a spelling one of the two replaced parsers let through onto a
 * real row. `parseInt` reads a leading integer and discards the rest, so `1abc`
 * named row 1 and `31.5` named row 31 - `PUT /api/classes/sessions/31.5`
 * answered 200 and edited session 31 against the running server. `Number()` is
 * no better: it reads hex, exponent and whitespace-padded forms, and `""` and
 * `" "` both become 0. The last two entries are past the column's 32-bit range,
 * where Prisma raises a driver error rather than matching no rows.
 */
const REJECTED_ID_PARAMS: [string, string][] = [
  ["a fractional id", "31.5"],
  ["a hex id", "0x1f"],
  ["an exponent id", "1e3"],
  ["a negative id", "-1"],
  ["zero", "0"],
  ["an empty segment", ""],
  ["a whitespace segment", " "],
  ["trailing garbage", "1abc"],
  ["a non-numeric segment", "abc"],
  ["a leading-zero id", "031"],
  ["several leading zeros", "007"],
  ["a whitespace-padded id", " 31 "],
  ["an explicit plus sign", "+31"],
  ["an injection-shaped segment", "7 OR 1=1"],
  ["one past the Int ceiling", "2147483648"],
  ["well past the Int ceiling", "3000000000"],
];

describe("rowIdParamSchema", () => {
  it.each(REJECTED_ID_PARAMS)("rejects %s", (_label, raw) => {
    expect(rowIdParamSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts a canonical decimal id and yields a number", () => {
    expect(rowIdParamSchema.parse("31")).toBe(31);
  });

  it("accepts the largest id the Int column can hold", () => {
    expect(rowIdParamSchema.parse(String(MAX_INT4))).toBe(MAX_INT4);
  });

  // An absent `?key=` yields null from URLSearchParams. It must fail as a type
  // error rather than coercing to 0, which is what the two public list routes
  // relied on when they fed it straight in.
  it("rejects a null, as an absent query param arrives", () => {
    expect(rowIdParamSchema.safeParse(null).success).toBe(false);
  });

  // The raw value always arrives as a string; anything else is a caller
  // converting it first, which is the mistake this schema exists to remove.
  it("rejects a value that has already been converted to a number", () => {
    expect(rowIdParamSchema.safeParse(31).success).toBe(false);
  });
});

describe("rowIdSchema", () => {
  it.each([
    ["a fractional id", 31.5],
    ["a negative id", -1],
    ["zero", 0],
    ["a value above the Int ceiling", MAX_INT4 + 1],
    ["infinity", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("rejects %s", (_label, value) => {
    expect(rowIdSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a positive integer inside the Int range", () => {
    expect(rowIdSchema.parse(31)).toBe(31);
  });
});
