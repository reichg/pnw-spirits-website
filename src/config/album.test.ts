import { describe, expect, it } from "vitest";

import {
  ALBUM_BREAKPOINTS,
  MAX_ALBUM_PHOTOS,
  MAX_ALBUM_SLIDES_PER_VIEW,
} from "./album";

// The expected responsive tiers, pinned by value so a breakpoint edit is a
// visible, intentional diff. Kept minimal: just enough to lock the contract the
// server (query cap) and client (Swiper config) both depend on.
const EXPECTED_TIERS = [
  { minWidth: 0, slidesPerView: 1, slidesPerGroup: 1 },
  { minWidth: 600, slidesPerView: 2, slidesPerGroup: 2 },
  { minWidth: 900, slidesPerView: 3, slidesPerGroup: 3 },
  { minWidth: 1200, slidesPerView: 4, slidesPerGroup: 4 },
] as const;

describe("MAX_ALBUM_PHOTOS", () => {
  it("is the fixed album photo cap of 16", () => {
    // Pins the concrete backend query cap so any change to the fixed set size is
    // a visible, intentional diff rather than a silent drift.
    expect(MAX_ALBUM_PHOTOS).toBe(16);
  });
});

describe("MAX_ALBUM_SLIDES_PER_VIEW", () => {
  it("is the widest slidesPerView derived from ALBUM_BREAKPOINTS", () => {
    // Must be the derived max, not a stray literal: it tracks the breakpoints so
    // the loop-enable threshold can never drift out of sync with the tiers.
    const expected = Math.max(
      ...ALBUM_BREAKPOINTS.map((breakpoint) => breakpoint.slidesPerView),
    );
    expect(MAX_ALBUM_SLIDES_PER_VIEW).toBe(expected);
  });

  it("evaluates to 4 (the widest tier's slidesPerView)", () => {
    expect(MAX_ALBUM_SLIDES_PER_VIEW).toBe(4);
  });
});

describe("ALBUM_BREAKPOINTS", () => {
  it("contains exactly the four expected tiers with their values", () => {
    expect(ALBUM_BREAKPOINTS).toEqual(EXPECTED_TIERS);
  });

  it("starts at the base tier (minWidth 0) so Swiper always has a default", () => {
    expect(ALBUM_BREAKPOINTS[0]?.minWidth).toBe(0);
  });

  it("orders tiers strictly ascending by minWidth", () => {
    for (let i = 1; i < ALBUM_BREAKPOINTS.length; i += 1) {
      expect(ALBUM_BREAKPOINTS[i]!.minWidth).toBeGreaterThan(
        ALBUM_BREAKPOINTS[i - 1]!.minWidth,
      );
    }
  });

  it("gives every tier a positive slidesPerView", () => {
    for (const tier of ALBUM_BREAKPOINTS) {
      expect(tier.slidesPerView).toBeGreaterThan(0);
    }
  });

  it("gives every tier an integer slidesPerGroup of at least 1", () => {
    for (const tier of ALBUM_BREAKPOINTS) {
      expect(Number.isInteger(tier.slidesPerGroup)).toBe(true);
      expect(tier.slidesPerGroup).toBeGreaterThanOrEqual(1);
    }
  });
});
