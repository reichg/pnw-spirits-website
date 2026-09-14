import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { replace, push } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));

// The component calls useRouter, which throws "invariant expected app router to
// be mounted" outside a real App Router tree. Mocked at the router rather than
// at the component so the component itself — its form, its label wiring and its
// field state — is the thing under test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

import ContentArchiveSearch from "./ContentArchiveSearch";
import type { ContentArchiveSearchProps } from "./content.types";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This is the one client component in the archive, and this repo runs Vitest in
// the "node" environment with no jsdom/happy-dom and no @testing-library/react
// (see vitest.config.ts / package.json). Adding a DOM environment or a testing
// library is a dependency change and is out of scope.
//
// WHAT IS THEREFORE NOT COVERED HERE, STATED PLAINLY: the component's
// interactive behavior. Typing into the field, the 300ms debounce, the
// router.replace navigation it settles on, the Enter-to-commit submit handler,
// and the effect that adopts a term arriving from outside the field (the page's
// "Clear search" link, a back navigation, a shared URL) all require a real DOM,
// real events and real timers. None of them run under renderToStaticMarkup,
// which performs an initial server render and never runs effects. Closing that
// gap needs jsdom plus @testing-library/react plus vi.useFakeTimers; until those
// exist in this repo, that behavior is verified only by hand.
//
// What IS covered is everything the server render decides, and it is not
// nothing: this component's no-JavaScript path is a real GET form, and that path
// is fully observable here. The form's action, method and field name are what a
// browser submits with scripting disabled, and they must produce the same URL
// the scripted path builds — including dropping `page`, which is what resets a
// new search to the first page. The label/input id wiring is also fully
// observable, and it is the accessibility contract the placeholder cannot serve.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists anyway - see the canonical note in
// Pagination.test.tsx.

const BASE: ContentArchiveSearchProps = {
  basePath: "/recipes",
  query: "",
  label: "Search recipes",
  placeholder: "Search recipes",
};

function render(overrides: Partial<ContentArchiveSearchProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(ContentArchiveSearch, { ...BASE, ...overrides }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ContentArchiveSearch no-JavaScript form contract", () => {
  it("is a real GET form targeting the archive it searches", () => {
    // Not a div with an input in it. With scripting disabled the browser
    // submits this and produces the same URL the scripted path would have built.
    const html = render();

    expect(html).toMatch(/^<form /);
    expect(html).toContain('action="/recipes"');
    expect(html).toContain('method="get"');
  });

  it("names the field with the shared query param, so the submitted URL matches", () => {
    // The name is ARCHIVE_QUERY_PARAM, the same constant parseArchiveQuery reads
    // and buildArchiveHref writes. A literal here would be a fourth spelling of
    // `q` free to drift from the other three.
    const html = render();

    expect(html).toContain('name="q"');
    // `page` is deliberately absent: a submitted search must land on page 1, not
    // on page 7 of a different result set.
    expect(html).not.toContain('name="page"');
    expect(html).not.toContain("page=");
  });

  it("exposes itself as a search landmark", () => {
    expect(render()).toContain('role="search"');
  });

  it("renders a type=search field with autocomplete off", () => {
    const html = render();

    expect(html).toContain('type="search"');
    // Matched case-insensitively: React's server renderer emits `autoComplete`,
    // and HTML attribute names are case-insensitive, so the casing is not the
    // contract.
    expect(html).toMatch(/autocomplete="off"/i);
    expect(html).toContain('placeholder="Search recipes"');
  });

  it("renders no placeholder attribute when none was given", () => {
    const html = render({ placeholder: undefined });

    expect(html).not.toContain("placeholder=");
    // The accessible name does not depend on it.
    expect(html).toContain("Search recipes");
  });
});

describe("ContentArchiveSearch accessible name", () => {
  it("ties a real label to the field by id", () => {
    // Visually hidden rather than absent: the field's visible affordance is its
    // placeholder, and a placeholder is not an accessible name — it is erased
    // the moment the user types.
    const html = render();

    const forId = /<label[^>]*for="([^"]+)"/.exec(html)?.[1];
    const inputId = /<input[^>]*id="([^"]+)"/.exec(html)?.[1];

    expect(forId).toBeTruthy();
    expect(inputId).toBe(forId);
    expect(html).toContain(">Search recipes</label>");
  });

  it("generates a distinct id per instance, so two controls cannot collide", () => {
    // A hardcoded id would silently repoint the second label at the first input
    // the moment a page rendered two archive controls. useId is what prevents it,
    // and only a render of two together can show that it does.
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(ContentArchiveSearch, { ...BASE, key: "a" }),
        React.createElement(ContentArchiveSearch, {
          ...BASE,
          key: "b",
          basePath: "/blogs",
          label: "Search articles",
        }),
      ),
    );

    const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    // And each label points at its own field.
    const forIds = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(forIds).toEqual(ids);
  });
});

describe("ContentArchiveSearch initial value", () => {
  it("shows the term the server parsed out of the URL", () => {
    // The field reads no state of its own from the URL: `query` is passed down
    // already parsed, trimmed and bounded, which is what keeps the term shown
    // identical to the term the API was asked to filter on.
    expect(render({ query: "gin" })).toContain('value="gin"');
  });

  it("renders an empty field for an unfiltered archive", () => {
    expect(render({ query: "" })).toContain('value=""');
  });

  it("escapes a term rather than letting it break out of the attribute", () => {
    // The term is user input arriving straight from `?q=`. A double quote in it
    // must not end the value attribute and start a new one.
    const html = render({ query: '"><script>alert(1)</script>' });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("ContentArchiveSearch render purity", () => {
  it("navigates nothing while rendering", () => {
    // Guards against a navigation escaping the debounce effect into render — on
    // a server render that would be a redirect loop rather than a search.
    render({ query: "gin" });

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("never pushes, so Back does not walk through the reader's own typing", () => {
    // The mode matters as much as the target: one history entry per keystroke
    // would make Back out of a recipe replay the search letter by letter. Only
    // the negative is observable here; the replace call itself is in the
    // documented interactive gap.
    render({ query: "gin" });

    expect(push).not.toHaveBeenCalled();
  });
});
