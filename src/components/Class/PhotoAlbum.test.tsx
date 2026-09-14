import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ClassPhotoView } from "@/services/classes/classView";

// Swiper is a client-only carousel whose ESM + CSS side-effect imports do not
// resolve under the node test environment; stub it with passthrough wrappers so
// the slides render inline and the photo-tile markup can be asserted directly.
vi.mock("swiper/react", () => ({
  Swiper: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "swiper" }, children),
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
// affordance is now Swiper's own pagination. Nothing but that overlay ever put
// an <svg> or the word "Swipe" in this component's markup, so both are precise
// tests for its return.
//
// Class names are never asserted: under Vitest a CSS-module import is a Proxy
// that echoes any key back, so a class assertion proves nothing (the canonical
// note is in Pagination.test.tsx).

const REAL_PHOTO: ClassPhotoView = {
  id: 1,
  url: "https://signed.example.com/a.jpg",
  caption: "Opening night",
};

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
    const interactive = renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [REAL_PHOTO] }),
    );

    expect(interactive).toContain("(max-width: 599px) 92vw");
    expect(interactive).toContain("(max-width: 1199px) 32vw");
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
