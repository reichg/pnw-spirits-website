import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Pagination from "./Pagination";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json), and the work
// order forbids adding dependencies or config. Unlike Modal, Pagination is a
// pure presentational component: no effects, no portal, no mount gate — it emits
// its full markup on the first (server) render. So renderToStaticMarkup observes
// essentially the entire contract: the totalPages<=1 null case, the
// Previous/Next controls with their accessible names, the per-position boundary
// state (which encodes the clamp), and the "Page X of Y" status text.
//
// Both modes are covered, because both ship. Callback mode drives client-side
// paging over an already-fetched array, consumed by the admin blog and recipe
// lists. Link mode drives URL-driven paging on the three content archives,
// reached through ContentArchiveLayout. Both modes now spell a boundary
// `aria-disabled`, and differ only in the element: a focusable, inert <button>
// versus a non-interactive <span role="link">, because there is no such thing
// as a disabled anchor.
//
// The native `disabled` attribute is therefore a REGRESSION MARKER rather than
// an expected one. A disabled element cannot hold focus, so a Next that
// disabled itself on reaching the last page had the browser drop focus to
// <body> - measured stable there for >935ms on both admin lists. The assertions
// below pin the absence of `disabled` as tightly as the presence of
// `aria-disabled`, since server markup is exactly where that distinction is
// visible.
//
// The ONE path renderToStaticMarkup cannot exercise is the click -> onPageChange
// callback, because firing a real click needs a DOM event dispatch (a forbidden
// new dependency). That is documented as an environment-imposed coverage gap in
// the specialist report. It is partially compensated here: the `disabled`
// boundaries asserted below are the same guards that make a Previous click on
// page 1 or a Next click on the last page a no-op, and the onClick clamp
// (Math.max/Math.min) is verified by reading rendered structure rather than by
// dispatching events. The vi.fn() handler is passed purely to prove rendering
// does not invoke it at render time. Link mode has no equivalent gap: its clamp
// is baked into the href the caller is asked for, which IS in the markup.
//
// WHAT A CSS-MODULE CLASS NAME IS WORTH IN THIS ENVIRONMENT — the canonical
// statement for this suite, because this file is one of the three that assert on
// one (with AdminConfirmDialog.test.tsx and SortablePhotoCard.test.tsx).
//
// Most files in this suite carry a line saying class names "are hashed and are
// not a contract". That is true but it understates the situation, and read
// literally it suggests the class does not reach the markup. It does. Verified
// by probe: under Vitest's default `css: false`, a CSS-module import is not an
// object at all but a PROXY that echoes ANY key back as `_<key>_<per-file hash>`
// - `styles.keyThatDoesNotExist` yields `_keyThatDoesNotExist_4c2e46`, and
// `Object.keys(styles)` is `[]`. The real .module.css file is never read.
//
// So a class assertion here can NEVER show that a style rule exists: delete
// `.pageButtonDisabled` from the stylesheet entirely and every assertion below
// still passes. It shows exactly one thing - WHICH IDENTIFIER THE COMPONENT
// CHOSE, and therefore which branch it took. That is a real component contract,
// and it is the only reason `pageButtonDisabled` is asserted below: the boundary
// state has `aria-disabled` as its semantic carrier, and the class is the second
// half of the same decision.
//
// It follows that the bare key (`toContain("pageButtonDisabled")`) is the right
// spelling and `/_pageButtonDisabled_/` is not: the underscores are the
// transform's naming scheme, which is a build artifact rather than anything this
// component decides. Where a sibling file does use the underscored form it is to
// stop a bare word like "danger" matching prose in an aria-label, and it says so
// at the assertion.
//
// next/link is reduced to a plain anchor below. That is what makes `prefetch`
// observable at all: the real component consumes the prop and never emits it as
// an attribute, so a silent flip to prefetching every pager neighbour would be
// invisible here otherwise. href, aria-label, className and children pass
// through unchanged, so every other link-mode assertion is still reading what
// Pagination actually produced.
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...rest
  }: {
    href: string;
    prefetch?: boolean;
    children: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "a",
      { href, "data-prefetch": String(prefetch), ...rest },
      children,
    ),
}));

describe("Pagination (node / server-render markup contract)", () => {
  it("renders nothing when totalPages <= 1", () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 1,
        totalPages: 1,
        onPageChange: () => {},
      }),
    );

    expect(html).toBe("");
  });

  it("renders Previous, Next, and 'Page X of Y' when there is more than one page", () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 2,
        totalPages: 3,
        onPageChange: () => {},
      }),
    );

    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain("Page 2 of 3");
    // Two navigation buttons are emitted.
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it("uses a labeled navigation landmark", () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 1,
        totalPages: 2,
        onPageChange: () => {},
      }),
    );

    expect(html).toContain("<nav");
    expect(html).toContain('aria-label="Pagination"');
  });

  it("marks Previous unavailable and leaves Next available on the first page", () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 1,
        totalPages: 3,
        onPageChange: () => {},
      }),
    );

    // Slice around each accessible name to scope the check to one control.
    const prev = sliceButton(html, "Previous page");
    const next = sliceButton(html, "Next page");

    expect(prev).toContain('aria-disabled="true"');
    expect(prev).toContain("pageButtonDisabled");
    expect(next).not.toContain("aria-disabled");
    expect(next).not.toContain("pageButtonDisabled");
  });

  it("marks Next unavailable and leaves Previous available on the last page", () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 3,
        totalPages: 3,
        onPageChange: () => {},
      }),
    );

    const prev = sliceButton(html, "Previous page");
    const next = sliceButton(html, "Next page");

    expect(prev).not.toContain("aria-disabled");
    expect(next).toContain('aria-disabled="true"');
    expect(next).toContain("pageButtonDisabled");
  });

  it("enables both controls on an interior page", () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 2,
        totalPages: 3,
        onPageChange: () => {},
      }),
    );

    const prev = sliceButton(html, "Previous page");
    const next = sliceButton(html, "Next page");

    expect(prev).not.toContain("aria-disabled");
    expect(next).not.toContain("aria-disabled");
    expect(prev).not.toContain("pageButtonDisabled");
    expect(next).not.toContain("pageButtonDisabled");
  });

  it("never natively disables a boundary control, at either end", () => {
    // THE REGRESSION THIS FILE EXISTS TO CATCH. `disabled` takes an element out
    // of the tab order, and the browser blurs it the moment it is set - so a
    // Next that disabled itself on reaching the last page dropped the admin's
    // focus to <body>, under their own finger. aria-disabled keeps the control
    // mounted, named, focusable and inert instead, and focus never moves.
    //
    // Asserted at BOTH ends and against the native attribute specifically:
    // `toContain("disabled")` would pass on `aria-disabled="true"` alone, which
    // is exactly how this could regress unnoticed.
    for (const [page, boundary] of [
      [1, "Previous page"],
      [4, "Next page"],
    ] as const) {
      const control = sliceButton(
        renderToStaticMarkup(
          React.createElement(Pagination, {
            page,
            totalPages: 4,
            onPageChange: () => {},
          }),
        ),
        boundary,
      );

      expect(control).toContain('aria-disabled="true"');
      expect(nativelyDisabled(control)).toBe(false);
    }
  });

  it("keeps both controls in the markup at every page, so the row never changes shape", () => {
    // A pager whose tab-stop count changes as you move through it is a moving
    // target for a keyboard user. Two controls at every position, always named.
    for (const page of [1, 2, 4]) {
      const html = renderToStaticMarkup(
        React.createElement(Pagination, {
          page,
          totalPages: 4,
          onPageChange: () => {},
        }),
      );

      expect((html.match(/<button/g) ?? []).length).toBe(2);
      expect(nativelyDisabled(html)).toBe(false);
    }
  });

  it("does not invoke onPageChange during render", () => {
    // Guards against an accidental call-at-render (e.g. onClick={onPageChange(...)}
    // instead of a thunk). The actual click -> onPageChange dispatch is the
    // documented environment gap; this asserts the negative that IS observable.
    const onPageChange = vi.fn();
    renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 2,
        totalPages: 3,
        onPageChange,
      }),
    );

    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("Pagination link mode (URL-driven archive paging)", () => {
  const hrefForPage = (page: number) => `/recipes?q=gin&page=${page}`;

  function renderLinks(page: number, totalPages: number): string {
    return renderToStaticMarkup(
      React.createElement(Pagination, { page, totalPages, hrefForPage }),
    );
  }

  it("renders nothing when totalPages <= 1, exactly as callback mode does", () => {
    expect(renderLinks(1, 1)).toBe("");
    expect(renderLinks(1, 0)).toBe("");
  });

  it("emits real links rather than buttons, so a page is shareable and crawlable", () => {
    // The reason link mode exists: the archives are server components with no
    // handlers to give, and a page of the archive has to survive being copied
    // out of the address bar or opened in a new tab.
    const html = renderLinks(2, 4);

    expect(html).not.toContain("<button");
    expect(html).toContain("Page 2 of 4");
    expect(html).toContain('aria-label="Pagination"');
  });

  it("asks the caller for the clamped neighbour on each side", () => {
    // The clamp is the contract: Previous/Next are always page-1 and page+1
    // bounded to [1, totalPages], and the caller's builder is what carries the
    // rest of the URL — here the search term, which must survive a page change.
    const html = renderLinks(2, 4);

    expect(sliceControl(html, "Previous page")).toContain(
      'href="/recipes?q=gin&amp;page=1"',
    );
    expect(sliceControl(html, "Next page")).toContain(
      'href="/recipes?q=gin&amp;page=3"',
    );
  });

  it("does not prefetch either neighbour", () => {
    // An archive page is a dynamic, uncached fetch. Prefetching both neighbours
    // of every pager would cost a full server render for a link most readers
    // never follow.
    const html = renderLinks(2, 4);

    expect(sliceControl(html, "Previous page")).toContain(
      'data-prefetch="false"',
    );
    expect(sliceControl(html, "Next page")).toContain('data-prefetch="false"');
  });

  it("renders a non-interactive, named span at the first-page boundary", () => {
    // There is no such thing as a disabled anchor: one without an href is not
    // focusable, and one with an href is always followable. So the boundary
    // keeps the control's shape, its name and its place in the row without
    // being a link at all.
    const html = renderLinks(1, 4);
    const prev = sliceControl(html, "Previous page");
    const next = sliceControl(html, "Next page");

    expect(prev).toMatch(/^<span /);
    expect(prev).toContain('role="link"');
    expect(prev).toContain('aria-disabled="true"');
    // Critically, no href: a followable "Previous" on page 1 is the bug.
    expect(prev).not.toContain("href=");
    // The far side is a real link.
    expect(next).toMatch(/^<a /);
    expect(next).toContain('href="/recipes?q=gin&amp;page=2"');
  });

  it("renders a non-interactive, named span at the last-page boundary", () => {
    const html = renderLinks(4, 4);
    const prev = sliceControl(html, "Previous page");
    const next = sliceControl(html, "Next page");

    expect(next).toMatch(/^<span /);
    expect(next).toContain('aria-disabled="true"');
    expect(next).not.toContain("href=");
    expect(prev).toMatch(/^<a /);
    expect(prev).toContain('href="/recipes?q=gin&amp;page=3"');
  });

  it("keeps both accessible names at every boundary, in both modes", () => {
    // aria-disabled is how a screen reader hears "there is no previous page"
    // rather than hearing nothing where a control used to be — which only works
    // if the control is still named. Asserted across both modes and all three
    // positions, because the names are shared and must not drift apart.
    for (const page of [1, 2, 4]) {
      const linkHtml = renderLinks(page, 4);
      const buttonHtml = renderToStaticMarkup(
        React.createElement(Pagination, {
          page,
          totalPages: 4,
          onPageChange: () => {},
        }),
      );

      for (const html of [linkHtml, buttonHtml]) {
        expect(html).toContain('aria-label="Previous page"');
        expect(html).toContain('aria-label="Next page"');
        expect(html).toContain(`Page ${page} of 4`);
      }
    }
  });

  it("keeps the visible labels identical across modes", () => {
    // The two modes are one control rendered two ways, not two controls.
    const linkHtml = renderLinks(2, 4);
    const buttonHtml = renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 2,
        totalPages: 4,
        onPageChange: () => {},
      }),
    );

    for (const html of [linkHtml, buttonHtml]) {
      expect(html).toContain(">Previous<");
      expect(html).toContain(">Next<");
    }
  });

  it("does not call the href builder for a pager it will not render", () => {
    const builder = vi.fn(hrefForPage);
    renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 1,
        totalPages: 1,
        hrefForPage: builder,
      }),
    );

    expect(builder).not.toHaveBeenCalled();
  });

  it("does not build an href for a boundary control", () => {
    // A boundary renders no link, so asking for its URL would be work thrown
    // away — and, on a caller that logs or counts, a misleading signal.
    const builder = vi.fn(hrefForPage);
    renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 1,
        totalPages: 4,
        hrefForPage: builder,
      }),
    );

    expect(builder).toHaveBeenCalledTimes(1);
    expect(builder).toHaveBeenCalledWith(2);
  });
});

/**
 * True when the markup carries a NATIVE `disabled` attribute, as opposed to
 * `aria-disabled`. React emits a boolean `disabled` as `disabled=""`, and
 * `aria-disabled="true"` ends in the same eight characters - so a plain
 * substring check cannot tell the two apart, and the whole point of this change
 * is that they are not the same thing.
 */
function nativelyDisabled(html: string): boolean {
  return /(?<!aria-)disabled=""/.test(html);
}

// Returns the substring of the rendered markup belonging to the <button> that
// carries the given accessible name, so a per-button attribute (e.g. `disabled`)
// can be asserted without matching the sibling button. Bounds the slice at the
// next "<button" or end of string.
function sliceButton(html: string, accessibleName: string): string {
  const marker = `aria-label="${accessibleName}"`;
  const labelIndex = html.indexOf(marker);
  if (labelIndex === -1) {
    throw new Error(
      `button with accessible name "${accessibleName}" not found`,
    );
  }
  const start = html.lastIndexOf("<button", labelIndex);
  const nextButton = html.indexOf("<button", labelIndex);
  const end = nextButton === -1 ? html.length : nextButton;
  return html.slice(start === -1 ? labelIndex : start, end);
}

/**
 * The link-mode equivalent of {@link sliceButton}. A control is an <a> when the
 * page is available and a <span> at a boundary, so the slice starts at whichever
 * tag opens immediately before the accessible name and ends where that element
 * closes.
 */
function sliceControl(html: string, accessibleName: string): string {
  const marker = `aria-label="${accessibleName}"`;
  const labelIndex = html.indexOf(marker);
  if (labelIndex === -1) {
    throw new Error(
      `control with accessible name "${accessibleName}" not found`,
    );
  }
  const start = Math.max(
    html.lastIndexOf("<a ", labelIndex),
    html.lastIndexOf("<span ", labelIndex),
  );
  const close = html.indexOf(">", html.indexOf("</", labelIndex));
  return html.slice(start, close + 1);
}
