import { describe, expect, it } from "vitest";

import {
  ALBUM_BREAKPOINTS,
  albumBreakpointsFor,
  MAX_ALBUM_PHOTOS,
  MAX_ALBUM_SLIDES_PER_VIEW,
} from "./album";

// The expected responsive tiers, pinned by value so a breakpoint edit is a
// visible, intentional diff. Kept minimal: just enough to lock the contract the
// server (query cap) and client (Swiper config) both depend on.
//
// The fractional slidesPerView IS ALBUM_PEEK (0.16), and pinning it here is the
// only place its value is stated outside album.ts itself: PhotoAlbum.test.tsx
// deliberately asserts the peek as a property ("slidesPerView is fractional")
// rather than by value, and defers the exact figures to this file.
const EXPECTED_TIERS = [
  { minWidth: 0, slidesPerView: 1.16, slidesPerGroup: 1 },
  { minWidth: 600, slidesPerView: 2.16, slidesPerGroup: 2 },
  { minWidth: 900, slidesPerView: 3.16, slidesPerGroup: 3 },
  { minWidth: 1200, slidesPerView: 4.16, slidesPerGroup: 4 },
] as const;

/** The whole-plate count of each tier: the geometry before the peek existed. */
const WHOLE_PLATES = [1, 2, 3, 4] as const;

describe("MAX_ALBUM_PHOTOS", () => {
  it("is the fixed album photo cap of 16", () => {
    // Pins the concrete backend query cap so any change to the fixed set size is
    // a visible, intentional diff rather than a silent drift. This constant is
    // consumed by the SERVER as well as the carousel: classService caps the
    // public photo query with it and /api/classes passes it as the non-admin
    // photoLimit, so it is a data-contract value, not a styling one.
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

  it("evaluates to 4.16 (the widest tier's peeked slidesPerView)", () => {
    expect(MAX_ALBUM_SLIDES_PER_VIEW).toBe(4.16);
  });

  it("answers the loop threshold identically to the whole-plate count", () => {
    // album.ts records that carrying the peek here "changes no outcome": photo
    // counts are integers and PhotoAlbum's check is a strict `>`, so n > 4.16
    // and n > 4 agree for every n. That claim is what makes the fractional
    // threshold safe, and it stops holding the moment the peek reaches a whole
    // plate - which is the regression this pins.
    const widestWholePlates = Math.max(...WHOLE_PLATES);
    for (let photos = 0; photos <= MAX_ALBUM_PHOTOS; photos += 1) {
      expect(photos > MAX_ALBUM_SLIDES_PER_VIEW).toBe(
        photos > widestWholePlates,
      );
    }
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

describe("albumBreakpointsFor", () => {
  /** Just the slidesPerView of each tier, base first - the only value that moves. */
  function viewsFor(photoCount: number): number[] {
    return albumBreakpointsFor(photoCount).map((tier) => tier.slidesPerView);
  }

  it("withdraws the peek per tier, not per album", () => {
    // THE ASSERTION THIS BLOCK EXISTS FOR, and the subtle half of the function.
    // A peek with nothing behind it is a hole: Swiper sizes slides from
    // slidesPerView whether or not the strip can scroll, so a tier the album
    // exactly fills renders shrunken plates with the sliver's room permanently
    // empty (measured ~50px of dead spine at 1440 with four photos).
    //
    // Three photos overflow the phone's one-up and the tablet's two-up, so those
    // tiers keep the peek, and underfill the three-up and four-up, which must
    // not pay for it. One album, two different answers, in one call.
    expect(viewsFor(3)).toEqual([1.16, 2.16, 3, 4]);
  });

  it("returns the exact tier table for every small-album size", () => {
    // Pinned by value across the whole range where the withdrawal is live, so
    // an off-by-one in the threshold shows up as a diff rather than as a
    // still-plausible table.
    expect(viewsFor(0)).toEqual([1, 2, 3, 4]);
    expect(viewsFor(1)).toEqual([1, 2, 3, 4]);
    expect(viewsFor(2)).toEqual([1.16, 2, 3, 4]);
    expect(viewsFor(4)).toEqual([1.16, 2.16, 3.16, 4]);
    expect(viewsFor(5)).toEqual([1.16, 2.16, 3.16, 4.16]);
  });

  it("hands back the tier table unchanged once the album overflows every tier", () => {
    // Five photos overflow the widest four-up, so nothing is withdrawn and the
    // result is ALBUM_BREAKPOINTS itself - including at the album cap.
    expect(albumBreakpointsFor(5)).toEqual(ALBUM_BREAKPOINTS);
    expect(albumBreakpointsFor(MAX_ALBUM_PHOTOS)).toEqual(ALBUM_BREAKPOINTS);
  });

  it("withdraws to the whole-plate count, the pre-peek geometry", () => {
    // An underfilled album must render precisely what it rendered before the
    // peek existed - not a smaller fraction, and not a rounded-up plate.
    expect(viewsFor(0)).toEqual([...WHOLE_PLATES]);
    for (const view of viewsFor(0)) {
      expect(Number.isInteger(view)).toBe(true);
    }
  });

  it("agrees with Swiper's own overflow lock at every tier and size", () => {
    // Derived rather than tabulated: a tier keeps the peek exactly when the
    // album can scroll it (photoCount > whole plates), which is the same
    // question Swiper's watchOverflow asks. Stated this way the two cannot
    // disagree, and the property holds across the full album range instead of
    // only at the sizes spelled out above.
    for (let photos = 0; photos <= MAX_ALBUM_PHOTOS; photos += 1) {
      const tiers = albumBreakpointsFor(photos);
      expect(tiers).toHaveLength(ALBUM_BREAKPOINTS.length);
      tiers.forEach((tier, index) => {
        const source = ALBUM_BREAKPOINTS[index]!;
        const wholePlates = Math.floor(source.slidesPerView);
        expect(tier.slidesPerView).toBe(
          photos > wholePlates ? source.slidesPerView : wholePlates,
        );
      });
    }
  });

  it("never alters minWidth or slidesPerGroup", () => {
    // Only the peek is negotiable. Paging by whole plates and the breakpoint
    // boundaries themselves are fixed, so a withdrawal that also moved
    // slidesPerGroup would silently change how far a swipe travels.
    for (const photos of [0, 1, 3, 5, MAX_ALBUM_PHOTOS]) {
      albumBreakpointsFor(photos).forEach((tier, index) => {
        const source = ALBUM_BREAKPOINTS[index]!;
        expect(tier.minWidth).toBe(source.minWidth);
        expect(tier.slidesPerGroup).toBe(source.slidesPerGroup);
      });
    }
  });

  it("leaves ALBUM_BREAKPOINTS untouched", () => {
    // The shared tier table is module state read by every album on the page
    // across a session; withdrawing in place would leak one album's photo count
    // into the next render's geometry.
    albumBreakpointsFor(1);
    albumBreakpointsFor(0);

    expect(ALBUM_BREAKPOINTS).toEqual(EXPECTED_TIERS);
  });
});
