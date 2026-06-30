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

  it("a photo missing a url is shown but not interactive", () => {
    // Guards the AlbumPhoto branch: url must be present for the button to render,
    // so a signing failure (url === null) never produces a lightbox trigger.
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, {
        photos: [{ id: 1, url: null, caption: "Unavailable" }],
      }),
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("Enlarge");
  });

  it("starts with the lightbox closed (no dialog in the initial markup)", () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoAlbum, { photos: [REAL_PHOTO] }),
    );

    expect(html).not.toContain('role="dialog"');
  });
});
