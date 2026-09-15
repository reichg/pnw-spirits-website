import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ClassPhotoView } from "@/services/classes/classView";

// Swiper is a client-only carousel whose ESM + CSS side-effect imports do not
// resolve under the node test environment; stub it with passthrough wrappers so
// the slides render inline and the photo-tile markup can be asserted directly.
//
// The stub also RECORDS the props it was handed. The carousel's affordances are
// Swiper configuration rather than markup, so without this they are invisible
// to every assertion in this file - which is how the next-slide peek came to be
// specified, agreed, and then simply not built, with a green suite throughout.
// vi.hoisted is required because vi.mock is hoisted above const declarations.
const { swiperProps } = vi.hoisted(() => ({
  swiperProps: [] as Record<string, unknown>[],
}));

vi.mock("swiper/react", () => ({
  Swiper: (props: { children: React.ReactNode }) => {
    swiperProps.push(props);
    return React.createElement(
      "div",
      { "data-testid": "swiper" },
      props.children,
    );
  },
  SwiperSlide: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "slide" }, children),
}));
vi.mock("swiper/modules", () => ({ A11y: {}, Keyboard: {}, Pagination: {} }));
vi.mock("swiper/css", () => ({}));
vi.mock("swiper/css/pagination", () => ({}));

import PhotoAlbum from "./PhotoAlbum";

// NOTE ON COVERAGE SCOPE
// ----------------------
// Actually opening the lightbox (clicking a real photo) needs a renderer with
// effects/state and a DOM, neither of which exists in this repo's "node" Vitest
// setup (no jsdom/happy-dom, no @testing-library/react), and the work order
// forbids new dependencies. What IS deterministically assertable from the
// initial server render is which tiles are interactive: a photo with a signed
// url renders an enlarge <button> (the lightbox trigger), while a photo missing
// its url renders no such button, so a broken tile can never open the lightbox.
//
// The decorative swipe overlay is asserted ABSENT below, as a regression marker.
// It was ~120 lines of inline SVG and six keyframe animations painting a scrim
// and a blur over the photographs at every breakpoint; the carousel's
// affordance is now Swiper's own pagination plus the next-slide peek, both
// asserted below. Nothing but that overlay ever put an <svg> or the word
// "Swipe" in this component's markup, so both are precise tests for its return.
//
// Class names are never asserted: under Vitest a CSS-module import is a Proxy
// that echoes any key back, so a class assertion proves nothing (the canonical
// note is in Pagination.test.tsx).
//
// The reserved caption box is deliberately NOT covered here for that same
// reason: it is entirely a CSS-module rule (a 2.8em min-height plus a two-line
// clamp, and an ::after supplying the same box to a caption-less plate), and
// nothing about it reaches the server-rendered markup this suite can read. It
// is a rendered-geometry claim - equal slide heights across a row - and it was
// verified by measuring the live page at 1440 / 1024 / 390, including the
// no-captions-at-all and over-long-caption cases.

const REAL_PHOTO: ClassPhotoView = {
  id: 1,
  url: "https://signed.example.com/a.jpg",
  caption: "Opening night",
};

/**
 * Render an album of `count` photos and return every responsive tier it handed
 * Swiper, base tier first. The tiers are the carousel's sizing contract and they
 * depend on the photo count, so the count is the only knob these tests turn.
 */
function tiersFor(
  count: number,
): { slidesPerView: number; slidesPerGroup: number }[] {
  swiperProps.length = 0;
  renderToStaticMarkup(
    React.createElement(PhotoAlbum, {
      photos: Array.from({ length: count }, (_, i) => ({
        ...REAL_PHOTO,
        id: i + 1,
      })),
    }),
  );

  const props = swiperProps[0]!;
  return [
    {
      slidesPerView: props.slidesPerView as number,
      slidesPerGroup: props.slidesPerGroup as number,
    },
    ...Object.values(
      props.breakpoints as Record<
        string,
        { slidesPerView: number; slidesPerGroup: number }
      >,
    ),
  ];
}

describe("PhotoAlbum", () => {
  it("renders the empty-state copy when there are no photos", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [] }),
    );

    expect(html).toContain(
      "Photos from past classes will appear here after our next session.",
    );
    // The composed empty-state treatment caps its measure on a child <span>.
    expect(html).toContain("<span>");
  });

  it("real photos render an interactive enlarge button (the lightbox trigger)", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [REAL_PHOTO] }),
    );

    expect(html).toContain("<button");
    // Accessible name comes from the caption per AlbumPhoto.
    expect(html).toContain('aria-label="Enlarge photo: Opening night"');
    // The thumbnail image is rendered inside the trigger.
    expect(html).toContain("Opening night");
  });

  it("a real photo without a caption still gets an enlarge button with a generic label", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, {
        photos: [{ ...REAL_PHOTO, caption: null }],
      }),
    );

    expect(html).toContain(
      'aria-label="Enlarge photo from a previous cocktail class"',
    );
  });

  it("a photo missing a url is shown, announced, and not interactive", () => {
    // Guards the AlbumPhoto branch: url must be present for the button to render,
    // so a signing failure (url === null) never produces a lightbox trigger.
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, {
        photos: [{ id: 1, url: null, caption: "Unavailable" }],
      }),
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("Enlarge");
    // role="img" is what makes the label announce; as a bare <div> the
    // aria-label was dropped by assistive tech.
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Photo unavailable"');
  });

  it("serves one sizes contract to both thumbnail branches", () => {
    // The two branches of AlbumPhoto used to spell the same `sizes` string
    // twice. One constant, so a retune cannot reach only one of them.
    //
    // The figures track the peeked plate (77 / 41 / 28vw, 280px), not the
    // peekless one they replaced (92 / 47 / 32vw, 300px) - a slide carrying
    // ALBUM_PEEK is narrower than its tier's even share, so the old widths
    // over-fetched at every tier.
    const interactive = renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [REAL_PHOTO] }),
    );

    expect(interactive).toContain("(max-width: 599px) 77vw");
    expect(interactive).toContain("(max-width: 1199px) 28vw");
  });

  it("hands Swiper a peeked slidesPerView at every tier, paged by whole plates", () => {
    // THE REGRESSION THIS EXISTS FOR. The animated swipe overlay was deleted on
    // the record that "the gold pagination bullets and a partial next-slide
    // peek carry the affordance"; only the bullets shipped, and every tier sat
    // flush against the spine with nothing to say more photographs existed.
    //
    // Asserted as a property rather than against the literal values, so this
    // tracks the design contract (there IS a peek, and paging is still by whole
    // plates) rather than duplicating src/config/album.ts. Exact tier values are
    // pinned in src/config/album.test.ts.
    // Nine photos overflow every tier (the widest is four plates), so every tier
    // is entitled to a peek.
    const tiers = tiersFor(9);

    expect(tiers.length).toBeGreaterThan(1);
    for (const tier of tiers) {
      // A fractional slidesPerView IS the peek: the next plate is left part-
      // visible at the clip edge.
      expect(Number.isInteger(tier.slidesPerView)).toBe(false);
      // A swipe still advances by whole plates, so the sliver stays a signal at
      // the edge rather than a partial page the reader has to chase.
      expect(Number.isInteger(tier.slidesPerGroup)).toBe(true);
    }
  });

  it("withdraws the peek from tiers the album cannot overflow", () => {
    // A peek with nothing behind it is a hole, not an affordance: Swiper sizes
    // slides from slidesPerView whether or not the strip can scroll, so a tier
    // the album exactly fills would render shrunken plates and leave the room
    // for the sliver permanently empty - measured at ~50px of dead spine.
    //
    // The withdrawal is per TIER, not per album, and that is the point: one
    // photo fills the phone's one-up but a three-photo album does not, so the
    // same album must peek on a phone and sit flush on a desktop.
    const [phone, twoUp, threeUp, fourUp] = tiersFor(3);

    expect(Number.isInteger(phone!.slidesPerView)).toBe(false); // 3 > 1, peeks
    expect(Number.isInteger(twoUp!.slidesPerView)).toBe(false); // 3 > 2, peeks
    expect(threeUp!.slidesPerView).toBe(3); // 3 photos, 3 plates: flush
    expect(fourUp!.slidesPerView).toBe(4); // underfilled: flush

    // A single-photo album can never overflow anything, so nothing peeks and the
    // strip renders exactly the geometry it had before the peek existed.
    for (const tier of tiersFor(1)) {
      expect(Number.isInteger(tier.slidesPerView)).toBe(true);
    }
  });

  it("uses static pagination bullets, not the dynamic sliding window", () => {
    // dynamicBullets scales non-adjacent dots to 33% (measured 7/5/3/3/3px at
    // 390) and positions the row with inline JS that no CSS can left-align, so
    // the album's one remaining affordance was both faint and the only centred
    // element on the page. PhotoAlbum.module.css carries the full derivation.
    swiperProps.length = 0;
    renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [REAL_PHOTO] }),
    );

    const pagination = swiperProps[0]!.pagination as Record<string, unknown>;
    expect(pagination.clickable).toBe(true);
    expect(pagination.dynamicBullets).toBeUndefined();
  });

  it("emits no decorative swipe overlay", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, {
        photos: [REAL_PHOTO, { ...REAL_PHOTO, id: 2 }],
      }),
    );

    expect(html).not.toContain("Swipe");
    expect(html).not.toContain("<svg");
  });

  it("starts with the lightbox closed (no dialog in the initial markup)", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [REAL_PHOTO] }),
    );

    expect(html).not.toContain('role="dialog"');
  });
});
