import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ContentLandingLayout from "./ContentLandingLayout";
import type {
  ContentItem,
  ContentLandingLayoutProps,
} from "./content.types";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json). That is not a
// real limitation for this component: the layout is presentational and
// server-only — it fetches nothing and holds no state — so renderToStaticMarkup
// observes its whole contract.
//
// Items here use `kind: "url"` media rather than the recipes page's `kind: "s3"`
// because the s3 branch renders no <img> until a client effect resolves a signed
// URL (see ContentCard.test.tsx). The one per-card image attribute the layout
// owns - the index-0-only `priority` - is only observable on the direct-URL
// branch.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists anyway - see the canonical note in
// Pagination.test.tsx.
// Cards are counted by their <h2> titles, which only ContentCard emits.

function item(id: string, title: string): ContentItem {
  return {
    id,
    kicker: "Recipe",
    title,
    meta: `By Author ${id}`,
    excerpt: `Summary ${id}`,
    media: { kind: "url", src: `https://img.example.com/${id}.jpg` },
    link: { kind: "internal", href: `/recipes/${id}` },
    ariaLabel: `View recipe: ${title}`,
  };
}

const ITEMS = [item("1", "First"), item("2", "Second"), item("3", "Third")];

const BASE: ContentLandingLayoutProps = {
  eyebrow: "Craft Cocktails",
  heading: "Recipes",
  intro: "Small-batch drinks built on Pacific Northwest ingredients.",
  items: ITEMS,
  // No apostrophe: React escapes one to &#x27; in static markup, which would
  // make the assertions below about the copy misleading rather than wrong.
  emptyMessage: "No recipes have been published yet.",
  viewAllHref: "/recipes",
  viewAllLabel: "View All Recipes",
};

function render(overrides: Partial<ContentLandingLayoutProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(ContentLandingLayout, { ...BASE, ...overrides }),
  );
}

describe("ContentLandingLayout header", () => {
  it("renders the eyebrow, then the h1 heading, then the intro", () => {
    const html = render();

    const eyebrow = html.indexOf("Craft Cocktails");
    const heading = html.indexOf("<h1");
    const intro = html.indexOf("Small-batch drinks");

    expect(eyebrow).toBeGreaterThan(-1);
    expect(eyebrow).toBeLessThan(heading);
    expect(heading).toBeLessThan(intro);
    expect(html).toContain(">Recipes<");
  });

  it("renders no empty elements when the eyebrow and intro are absent", () => {
    // Rendered with no items so the only paragraphs that could appear are the
    // header's optional ones; both must be omitted outright, not left empty.
    const html = render({ eyebrow: undefined, intro: undefined, items: [] });

    expect(html).toContain("<h1");
    expect(html).not.toContain("<p");
  });

  it("wraps the page in exactly one <main> landmark", () => {
    // next/image hoists a <link rel="preload"> for the LCP image ahead of the
    // element in static markup, so <main> is not necessarily the first token;
    // what matters is that there is exactly one and the heading lives inside it.
    const html = render();
    const main = html.slice(html.indexOf("<main"));

    expect(countTags(html, "main")).toBe(1);
    expect(main).toContain("<h1");
  });
});

describe("ContentLandingLayout items", () => {
  it("renders one card per item", () => {
    const html = render();

    expect(countTags(html, "h2")).toBe(ITEMS.length);
    expect(html).toContain("First");
    expect(html).toContain("Second");
    expect(html).toContain("Third");
    expect(html).not.toContain("No recipes have been published yet.");
  });

  it("keeps the markup well-formed when only some items carry a kicker", () => {
    // The mixed case is the one the card layout is measured against: a card with
    // no badge must keep its dimensions and emit no placeholder element.
    const html = render({
      items: [ITEMS[0], { ...ITEMS[1], kicker: undefined }, ITEMS[2]],
    });

    expect(countTags(html, "h2")).toBe(3);
    // Every card emits one <span> inside its <h2> (the inline box that carries
    // the per-line hover underline); the kicker badge is the only other one. So
    // spans = one per card + one per kicker, and the two cards that carry a
    // badge are observable without depending on a hashed class name.
    expect(countTags(html, "span")).toBe(3 + 2);
    expect(html).not.toContain("<span></span>");
  });

  it("marks only the first card's image as the LCP candidate", () => {
    // The page does not know render order, so the layout owns this. Extra eager
    // images would compete with the real LCP element for bandwidth.
    const html = render();
    const images = html.match(/<img[^>]*>/g) ?? [];

    expect(images).toHaveLength(ITEMS.length);
    expect(images[0]).not.toContain('loading="lazy"');
    for (const image of images.slice(1)) {
      expect(image).toContain('loading="lazy"');
    }
  });

  it("gives every card image a sizes hint, not just the first", () => {
    // The value is ContentCard's to choose and is pinned there, once. What this
    // guards is that it reaches EVERY card rather than only the priority one:
    // a `fill` image with no `sizes` warns on every render in dev.
    const html = render();
    const images = html.match(/<img[^>]*>/g) ?? [];

    expect(images).toHaveLength(ITEMS.length);
    for (const image of images) {
      expect(image).toMatch(/sizes="[^"]+"/);
    }
  });
});

describe("ContentLandingLayout empty state", () => {
  it("renders the empty message and no cards when there are no items", () => {
    const html = render({ items: [] });

    expect(html).toContain("No recipes have been published yet.");
    expect(countTags(html, "h2")).toBe(0);
    expect(html).not.toContain("<img");
  });

  it("still renders the page header when there are no items", () => {
    // Deliberate: the landing page keeps its identity (eyebrow, title, lede)
    // whether or not it has content to show, so an empty fetch never yields a
    // bare message on a blank page.
    const html = render({ items: [] });

    expect(html).toContain("Craft Cocktails");
    expect(html).toContain("<h1");
    expect(html).toContain(">Recipes<");
    expect(html).toContain("Small-batch drinks");
  });

  it("still offers the View All action when there are no items", () => {
    const html = render({ items: [] });

    expect(html).toContain('href="/recipes"');
    expect(html).toContain("View All Recipes");
  });
});

describe("ContentLandingLayout view-all action", () => {
  it("renders the action as one anchor, not a button nested in a link", () => {
    // Interactive content is not permitted inside an anchor. The nested
    // <Link><button/></Link> this replaced left the control's role and
    // accessible name to each browser's error recovery, and announced two
    // nested interactive elements where there is one control.
    // Matching through to </a> is the assertion: it proves nothing at all sits
    // between the anchor's open tag and its label.
    const html = render();

    expect(html).toMatch(/<a [^>]*href="\/recipes"[^>]*>View All Recipes<\/a>/);
  });
});

describe("ContentLandingLayout root class", () => {
  it("merges a page-specific class onto the root alongside its own", () => {
    const html = render({ className: "page-specific-root" });

    expect(html).toMatch(/<main class="[^"]*page-specific-root[^"]*"/);
  });

  it("emits no stray class token when no page class is supplied", () => {
    const html = render({ className: undefined });
    const rootClass = /<main class="([^"]*)"/.exec(html)?.[1] ?? "";

    expect(rootClass).not.toContain("undefined");
    expect(rootClass.trim()).toBe(rootClass);
    // Deliberately not a token count. `.root` composes editorialSurface from
    // editorialTokens.module.css, so the shipped attribute carries two class
    // names; it reads as one here only because Vitest stubs CSS Modules with a
    // per-key proxy that cannot resolve `composes`. What the layout actually
    // guarantees is what `[styles.root, className].filter(Boolean).join(" ")`
    // is for: no empty token, whatever the build resolves the names to.
    expect(rootClass.split(" ").every(Boolean)).toBe(true);
  });
});

// Counts opening tags of the given name, ignoring closing tags and longer tag
// names that share a prefix.
function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}
