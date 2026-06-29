import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminHeader from "./AdminHeader";
import { ADMIN_NAV_ITEMS } from "./adminNavItems";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts), so these tests assert against
// the string produced by renderToStaticMarkup. renderToStaticMarkup runs the
// initial server render only; effects do not run, so useState/useEffect-driven
// mobile behavior stays in its initial state. In a server render
// `typeof window === "undefined"` is true, so AdminHeader always emits the
// desktop links branch (every ADMIN_NAV_ITEMS link), which is exactly the
// markup these tests observe. The active-state assertion targets the
// `aria-current="page"` attribute rather than a CSS-module class name, because
// CSS module imports resolve to an empty object in this environment (so
// styles.linkActive would be undefined) while aria-current is set directly by
// the component and is therefore the stable, observable contract.

// usePathname is mocked with a mutable value so each test can drive a different
// active route without re-mocking the module.
let mockPathname = "/admin";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// next/link is reduced to a plain anchor so the rendered markup is deterministic
// and free of Next runtime concerns; href/aria-current/children pass through.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement("a", { href, ...rest }, children),
}));

describe("AdminHeader (node / server-render markup contract)", () => {
  beforeEach(() => {
    mockPathname = "/admin";
  });

  it("renders the Admin Portal home link and every ADMIN_NAV_ITEMS route", () => {
    const html = renderToStaticMarkup(React.createElement(AdminHeader));

    // Home link.
    expect(html).toContain("Admin Portal");
    expect(html).toContain('href="/admin"');

    // Every shared admin route appears, iterated from the source of truth so the
    // test stays in sync with adminNavItems.ts.
    for (const item of ADMIN_NAV_ITEMS) {
      expect(html).toContain(item.label);
      expect(html).toContain(`href="${item.href}"`);
    }
  });

  it("marks the active sub-section with aria-current='page' (prefix match)", () => {
    mockPathname = "/admin/classes";

    const html = renderToStaticMarkup(React.createElement(AdminHeader));
    const classesLink = sliceAnchor(html, "/admin/classes");

    expect(classesLink).toContain('aria-current="page"');

    // A sibling, non-active link does not carry the active marker.
    const blogsLink = sliceAnchor(html, "/admin/blogs");
    expect(blogsLink).not.toContain('aria-current="page"');
  });

  it("uses exact matching for the Admin Portal home link", () => {
    // On a sub-section the home link must NOT be marked active...
    mockPathname = "/admin/classes";
    const onSubSection = renderToStaticMarkup(React.createElement(AdminHeader));
    expect(sliceAnchor(onSubSection, "/admin").includes('aria-current="page"'))
      .toBe(false);

    // ...but on /admin exactly it is.
    mockPathname = "/admin";
    const onHome = renderToStaticMarkup(React.createElement(AdminHeader));
    expect(sliceAnchor(onHome, "/admin")).toContain('aria-current="page"');
  });

  it("renders nothing on the admin login page", () => {
    mockPathname = "/admin/login";

    const html = renderToStaticMarkup(React.createElement(AdminHeader));

    expect(html).toBe("");
  });
});

// Returns the substring of markup belonging to the first <a> whose href exactly
// equals the given value, bounded at the next "<a" or the closing tag, so a
// per-link attribute (aria-current) can be asserted without matching a sibling
// anchor whose href starts with the same prefix.
function sliceAnchor(html: string, href: string): string {
  const marker = `href="${href}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`anchor with href "${href}" not found`);
  }
  const start = html.lastIndexOf("<a", markerIndex);
  const closeIndex = html.indexOf("</a>", markerIndex);
  const nextAnchor = html.indexOf("<a", markerIndex);
  const end =
    closeIndex === -1
      ? nextAnchor === -1
        ? html.length
        : nextAnchor
      : closeIndex;
  return html.slice(start === -1 ? markerIndex : start, end);
}
