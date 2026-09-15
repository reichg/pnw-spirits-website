import { describe, expect, it } from "vitest";

import { draftText, formatRecordCount, formatRecordDate } from "./adminRecords";

// NOTE ON COVERAGE SCOPE
// ----------------------
// Nothing is out of reach here. These three helpers were pulled out of the two
// record screens precisely so the wording could be asserted without a renderer
// (adminRecords.ts says so in its header), so this file is the coverage that
// extraction was for, and it observes the complete contract of all three.
//
// The one thing deliberately NOT pinned is the exact rendered form of a valid
// date. `formatRecordDate` passes `undefined` as the locale on purpose - the
// reader's locale, since this renders only inside the authenticated client
// subtree - so a literal "Jun 18, 2026" would be asserting the machine the test
// happens to run on. The assertions below pin the PROPERTIES that survive a
// locale change: the placeholder branches, and that a clock never appears.

describe("formatRecordCount", () => {
  it("words an ordinary page as a range of the total", () => {
    expect(formatRecordCount(1, 10, 43, "blogs")).toBe("1–10 of 43 blogs");
    expect(formatRecordCount(2, 10, 43, "blogs")).toBe("11–20 of 43 blogs");
  });

  it("stops the range at the total on a partial last page", () => {
    expect(formatRecordCount(5, 10, 43, "blogs")).toBe("41–43 of 43 blogs");
  });

  it("carries the caller's noun rather than assuming one", () => {
    expect(formatRecordCount(1, 10, 20, "recipes")).toBe(
      "1–10 of 20 recipes",
    );
  });

  // THE EMPTY BRANCH. The header band stays mounted when the list is empty
  // because it holds the search field that caused the empty state, so this
  // string has to read as a sentence there and not as "0-0 of 0 blogs".
  it("reports an empty collection as a plain count, not a zero range", () => {
    expect(formatRecordCount(1, 10, 0, "blogs")).toBe("0 blogs");
    expect(formatRecordCount(4, 10, 0, "blogs")).toBe("0 blogs");
  });

  it("treats an unusable total as empty rather than rendering arithmetic on it", () => {
    // `total` arrives from a JSON body. NaN is what `Number(undefined)` gives a
    // caller that read a missing field, and the naive arithmetic would put
    // "NaN-NaN of NaN blogs" in the page header.
    for (const total of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(formatRecordCount(1, 10, total, "blogs")).toBe("0 blogs");
    }
  });

  // THE PAST-THE-END BRANCH. Transient - the list clamps the page and refetches
  // - but it renders for one frame after deleting the last record on the last
  // page, and "21-5 of 5" is the kind of thing that gets screenshotted.
  it("reports a page past the end as 0 of the total, never a reversed range", () => {
    expect(formatRecordCount(3, 10, 5, "blogs")).toBe("0 of 5 blogs");
    expect(formatRecordCount(2, 10, 10, "blogs")).toBe("0 of 10 blogs");
  });

  it("never produces a range whose first bound is above its last", () => {
    // The property the two special branches exist to guarantee, swept rather
    // than spot-checked: no page/total combination may word a backwards range.
    for (let page = 1; page <= 6; page += 1) {
      for (const total of [0, 1, 9, 10, 11, 43]) {
        const line = formatRecordCount(page, 10, total, "blogs");
        const range = /^(\d+)–(\d+) of/.exec(line);
        if (!range) continue;
        expect(Number(range[1])).toBeLessThanOrEqual(Number(range[2]));
      }
    }
  });
});

describe("formatRecordDate", () => {
  it("returns a pronounceable placeholder when there is no stored value", () => {
    // A word, not an em dash: a screen reader announces "Posted, unknown"
    // rather than pausing at a value it has no way to pronounce.
    for (const value of [null, undefined, ""]) {
      expect(formatRecordDate(value)).toBe("Unknown");
    }
  });

  it("returns the placeholder rather than the literal string 'Invalid Date'", () => {
    // `new Date("nonsense")` does not throw, and `toLocaleDateString` on the
    // Invalid Date it produces returns the words "Invalid Date" - which would
    // otherwise be rendered into a list row as if it were a date.
    for (const value of ["nonsense", "2026-13-45", "not-a-date"]) {
      expect(formatRecordDate(value)).toBe("Unknown");
    }
  });

  it("formats a stored ISO instant as a date", () => {
    const formatted = formatRecordDate("2026-06-18T18:20:18.000Z");

    expect(formatted).not.toBe("Unknown");
    expect(formatted).toContain("2026");
  });

  // DATE ONLY, NO CLOCK - the whole reason this helper replaced the lists'
  // `toLocaleString()`, which produced "6/18/2026, 6:20:18 PM": 22 characters of
  // which four matter, competing with the title for the one line of metadata an
  // 80px row has room for. Asserted as "no clock separator", which holds in
  // every locale; a literal expected string would only hold in this one.
  it("never includes a time of day", () => {
    expect(formatRecordDate("2026-06-18T18:20:18.000Z")).not.toContain(":");
  });
});

describe("draftText", () => {
  it("passes a stored string through unchanged", () => {
    expect(draftText("Old Fashioned")).toBe("Old Fashioned");
    expect(draftText("")).toBe("");
  });

  // Whatever is in localStorage was written by an earlier version of this app,
  // and both editors feed these values into `useState` and then into
  // String.prototype methods when inserting uploaded media at the cursor. A
  // stored number would survive as a rendered input value and then throw on the
  // first upload; `String(value)` would put "[object Object]" in the editor and
  // then POST it.
  it("discards a non-string rather than coercing it", () => {
    for (const value of [42, 0, null, undefined, true, {}, [], () => {}]) {
      expect(draftText(value)).toBe("");
    }
  });
});
