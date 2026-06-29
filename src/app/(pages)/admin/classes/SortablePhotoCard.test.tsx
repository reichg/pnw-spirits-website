import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SortablePhotoCard from "./SortablePhotoCard";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo's Vitest setup is the "node" environment with no jsdom/happy-dom and
// no @testing-library/react, so the asserted contract is the initial server
// render via renderToStaticMarkup (mirrors PhotoAlbum.test.tsx /
// ClassSessions.test.tsx). useS3ImageUrl resolves its URL in a useEffect that
// does not run under static render, so the card always shows its placeholder
// thumb here and never fires a network fetch; that is fine because the behavior
// under test is the public-limit badge + over-limit affordance, which depend
// only on the `beyondPublicLimit` prop. useSortable renders without a surrounding
// DndContext (dnd-kit supplies safe defaults), so no provider wrapper is needed.

const PHOTO = { id: 7, s3Key: "classes/7.jpg", caption: "Garnish prep", sortOrder: 6 };

const NOOP = () => {};

function render(beyondPublicLimit?: boolean) {
  return renderToStaticMarkup(
    React.createElement(SortablePhotoCard, {
      photo: PHOTO,
      disabled: false,
      beyondPublicLimit,
      onSaveCaption: NOOP,
      onDelete: NOOP,
    }),
  );
}

// The badge is tied to the card via aria-describedby using this id pattern.
const LIMIT_NOTE_ID = `photo-${PHOTO.id}-limit-note`;

describe("SortablePhotoCard", () => {
  it("renders the over-limit badge and wires aria-describedby when beyondPublicLimit is true", () => {
    const html = render(true);

    expect(html).toContain("Not shown publicly");
    expect(html).toContain(`id="${LIMIT_NOTE_ID}"`);
    expect(html).toContain(`aria-describedby="${LIMIT_NOTE_ID}"`);
  });

  it("renders no over-limit badge or aria-describedby when beyondPublicLimit is false", () => {
    const html = render(false);

    expect(html).not.toContain("Not shown publicly");
    expect(html).not.toContain(LIMIT_NOTE_ID);
  });

  it("defaults to the normal (within-limit) state when beyondPublicLimit is omitted", () => {
    const html = render(undefined);

    expect(html).not.toContain("Not shown publicly");
    expect(html).not.toContain(LIMIT_NOTE_ID);
  });

  it("keeps the caption controls present regardless of the limit state", () => {
    const html = render(true);

    // The Save/Delete affordances and caption input stay interactive even when
    // the photo is beyond the public limit.
    expect(html).toContain(">Save<");
    expect(html).toContain(">Delete<");
    expect(html).toContain('placeholder="Caption"');
  });

  it("renders the grip as a decorative, non-focusable cue (whole card is the drag source)", () => {
    const html = render(false);

    // The grip is now an aria-hidden span, not a focusable button: the entire
    // card carries dnd-kit's listeners, so the grip exposes no drag-reorder
    // control to assistive tech or the tab order.
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label="Drag to reorder"');
    // The only role=button in this card is dnd-kit's on the card root; the grip
    // itself must not be a button-roled affordance.
    expect(html).not.toContain('<button aria-label');
    // NOTE: the pointer-drag behavior of this change (PointerSensor activation
    // distance + stopPropagation on the caption/Save/Delete controls) needs real
    // DOM pointer events and cannot run under renderToStaticMarkup. Deferred
    // consistent with prior precedent (see PhotoAlbum/ClassSessions tests); the
    // structural change is covered here plus by typecheck.
  });
});
