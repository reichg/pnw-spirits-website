import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SortablePhotoCard, { photoGripLabel } from "./SortablePhotoCard";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo's Vitest setup is the "node" environment with no jsdom/happy-dom and
// no @testing-library/react, so the asserted contract is the initial server
// render via renderToStaticMarkup (mirrors PhotoAlbum.test.tsx /
// ClassSessions.test.tsx). AdminCard's image resolves its signed URL in a
// useEffect that does not run under static render, so the tile always shows its
// empty plate here and never fires a network fetch. useSortable renders without
// a surrounding DndContext (dnd-kit supplies safe defaults), so no provider
// wrapper is needed.
//
// WHY THE aria-describedby ASSERTIONS ARE GONE. The previous version of this
// file asserted `id="photo-7-limit-note"` and a card root whose
// aria-describedby pointed at it. That wiring existed only because the card root
// was dnd-kit's `role="button"` element, which collapses everything inside it
// into one accessible name, so the badge had to be re-attached by id to be heard
// at all. The card root is now a plain container: its content is read in
// document order and the badge is simply part of it, so the id tether is not
// weakened here - it is obsolete. What replaces it is the assertion that the
// root is NOT a button, which is the property that made the tether unnecessary.

const PHOTO = {
  id: 7,
  s3Key: "classes/7.jpg",
  caption: "Garnish prep",
  sortOrder: 6,
};

const NOOP = () => {};

function render(beyondPublicLimit?: boolean) {
  return renderToStaticMarkup(
    React.createElement(SortablePhotoCard, {
      photo: PHOTO,
      position: 3,
      total: 12,
      disabled: false,
      beyondPublicLimit,
      onSaveCaption: NOOP,
      onDelete: NOOP,
    }),
  );
}

// Any <div> carrying role="button" would mean an interactive ancestor wrapping
// this tile's input and two buttons - the nested-interactive shape the admin
// design layer was built to remove. The grip is a real <button>, so it cannot
// match this.
const DIV_AS_BUTTON = /<div[^>]*role="button"/;

describe("SortablePhotoCard", () => {
  it("renders the over-limit badge when beyondPublicLimit is true", () => {
    const html = render(true);

    expect(html).toContain("Not shown publicly");
  });

  it("renders no over-limit badge when beyondPublicLimit is false", () => {
    const html = render(false);

    expect(html).not.toContain("Not shown publicly");
  });

  it("defaults to the normal (within-limit) state when beyondPublicLimit is omitted", () => {
    const html = render(undefined);

    expect(html).not.toContain("Not shown publicly");
  });

  it("never makes a container element the drag source", () => {
    // Both states, because the badge branch adds an element to the root's
    // subtree and is the one most likely to grow a wrapper later.
    expect(render(false)).not.toMatch(DIV_AS_BUTTON);
    expect(render(true)).not.toMatch(DIV_AS_BUTTON);
  });

  it("exposes the drag handle as a real, named button", () => {
    const html = render(false);

    // The reorder control is the single most important affordance on this tile
    // and the one with no alternative route to the same result: it must be a
    // focusable element with an accessible name that says which photo it moves.
    expect(html).toMatch(
      /<button[^>]*aria-label="Reorder Photo 3 of 12"[^>]*>/,
    );
    // Permanently visible, never hover-revealed: no `hidden` attribute and no
    // aria-hidden on the control itself.
    expect(html).not.toMatch(/<button[^>]*aria-hidden="true"/);
  });

  it("keeps the caption controls present regardless of the limit state", () => {
    const html = render(true);

    expect(html).toContain(">Save<");
    expect(html).toContain(">Delete<");
    expect(html).toContain('placeholder="Caption"');
    // The tile's own controls name the tile, so a keyboard user tabbing an
    // album of twelve does not hear "Save, Delete" twelve times over.
    expect(html).toContain('aria-label="Save caption for Photo 3"');
    expect(html).toContain('aria-label="Delete Photo 3"');
  });

  it("ranks the tile's Save above its Delete rather than painting them alike", () => {
    // THE DEFECT THIS LOCKS OUT, measured on /admin/classes before the fix:
    // Save and Delete rendered `rgba(242,235,227,0.66)` ink over a
    // `rgba(242,235,227,0.38)` rule at 180x40, 48px apart at 1440 and 8px apart
    // SIDE BY SIDE at 390 - a constructive control and a destructive one as the
    // same object under a thumb. Save took AdminButton's `secondary` default
    // (--ink-2) and AdminCardGrid correctly neutralises a repeated `danger` to
    // --ink-2 as well, so the portal's one ranking mechanism had nothing to
    // work with.
    //
    // Asserted as "the two tone classes are not the same class" rather than as
    // a colour, because the colours belong to the shared design layer and this
    // file's contract is only that the tile asks for two different ranks. A
    // future retoning of `primary` keeps this test honest; dropping the tone
    // and letting both fall back to the `secondary` default does not.
    const html = render(false);
    const classOf = (ariaLabel: string) =>
      new RegExp(`<button[^>]*class="([^"]+)"[^>]*aria-label="${ariaLabel}"`)
        .exec(html)?.[1];

    const save = classOf("Save caption for Photo 3");
    const remove = classOf("Delete Photo 3");

    expect(save).toBeDefined();
    expect(remove).toBeDefined();
    expect(save).not.toEqual(remove);
    // The tone each one actually asks for. `primary` is what admin.types.ts
    // defines as "the card's main action", which a tile's Save is. This can only
    // ever show which identifier the component chose - under Vitest a CSS-module
    // import is a Proxy that echoes any key back, so it is no evidence that
    // either rule exists. See the canonical note in Pagination.test.tsx.
    //
    // Underscored rather than the bare words, which would both match prose in a
    // photo caption or an aria-label.
    expect(save).toMatch(/_primary_/);
    expect(remove).toMatch(/_danger_/);
  });

  it("labels the caption field and binds the label to the control", () => {
    const html = render(false);

    const forMatch = /<label[^>]*for="([^"]+)"[^>]*>/.exec(html);
    expect(forMatch).not.toBeNull();
    // AdminField generates the id with useId and hands it to the control; a
    // label pointing at an id nothing carries is the silent failure mode the
    // render-prop contract exists to make impossible.
    expect(html).toContain(`id="${forMatch?.[1]}"`);
  });

  // NOTE: the pointer-drag and keyboard-reorder behaviour of this tile needs
  // real DOM events and a mounted DndContext, neither of which exists under
  // renderToStaticMarkup in the node environment. Deferred consistent with prior
  // precedent (see PhotoAlbum/ClassSessions tests); the structural contract is
  // covered above plus by typecheck, and the live path was exercised in a
  // browser.
});

describe("photoGripLabel — the name AdminClassManager searches for", () => {
  // WHY THIS IS A CONTRACT AND NOT AN IMPLEMENTATION DETAIL. After a confirmed
  // delete renumbers the album, AdminClassManager restores focus to the
  // successor tile's grip, and the only route it has to that button is
  // `findByAccessibleName(albumRef.current, photoGripLabel(position, total))` -
  // an exact string comparison against the rendered `aria-label`. AdminCard
  // exposes no id and no ref by design, so there is no other handle.
  //
  // Two spellings of this name would therefore be a focus restore that silently
  // stops working - silently being the operative word, because nothing on
  // screen looks broken when focus is merely dropped to <body>.

  it("is the exact string the tile renders, not merely a similar one", () => {
    // The assertion that ties the two modules together: built by the function
    // the manager calls, compared against the attribute the manager queries.
    // A tile that stopped calling photoGripLabel - or a label reworded in only
    // one of the two places - fails here.
    const html = render(false);

    expect(html).toContain(`aria-label="${photoGripLabel(3, 12)}"`);
  });

  it("states both halves of the renumbering a delete just caused", () => {
    // The total is part of the name because the count is exactly what a delete
    // changed, and the position is the only thing identifying a photograph -
    // it has no name, and its caption is the field being edited below it.
    expect(photoGripLabel(3, 11)).toBe("Reorder Photo 3 of 11");
    expect(photoGripLabel(1, 1)).toBe("Reorder Photo 1 of 1");
  });
});
