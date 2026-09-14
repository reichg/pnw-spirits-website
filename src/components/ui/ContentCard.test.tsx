import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ContentCard from "./ContentCard";
import type { ContentLandingItem } from "./ContentLanding.types";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json); adding one is a
// dependency change and out of scope here. ContentCard is a pure server
// component — no state, no effects — so renderToStaticMarkup observes almost its
// entire contract: both link branches, both media branches, and every optional
// field.
//
// The one thing static render cannot show is the resolved s3 image. The "s3"
// branch delegates to S3CardBackgroundImage, which is "use client" and returns
// null until a useEffect resolves a signed URL, so under renderToStaticMarkup
// the s3 path emits an empty media box and no <img>. That is asserted below as
// what actually happens (and is the production first-paint state too), not
// papered over; the post-effect swap to a real <img> is the environment-imposed
// gap.
//
// Class names are hashed by the CSS-modules transform and are not a contract, so
// elements are identified by tag and text content rather than by class.

const ITEM: ContentLandingItem = {
  id: "12",
  kicker: "Recipe",
  title: "Old Fashioned",
  meta: "By Jane Doe",
  excerpt: "Bourbon, demerara, and a wide strip of orange peel.",
  media: { kind: "s3", key: "recipes/12.jpg" },
  link: { kind: "internal", href: "/recipes/12" },
  ariaLabel: "View recipe: Old Fashioned",
};

// A video-shaped item: the external-link + direct-URL media combination that has
// no consumer in the app yet and exists for the /videos-landing migration.
const EXTERNAL_ITEM: ContentLandingItem = {
  ...ITEM,
  id: "v1",
  kicker: "Video",
  title: "Shaking vs. Stirring",
  media: { kind: "url", src: "https://img.example.com/thumb.jpg" },
  link: { kind: "external", href: "https://videos.example.com/watch/v1" },
  ariaLabel: "Watch video: Shaking vs. Stirring",
};

function render(item: ContentLandingItem, priority?: boolean): string {
  return renderToStaticMarkup(
    React.createElement(ContentCard, { item, priority }),
  );
}

describe("ContentCard link intent", () => {
  it("opens an external link in a new tab with an opener-safe rel", () => {
    // Highest-value regression guard in this file: nothing in the app renders an
    // external card today, so only this test keeps target/rel from being dropped
    // before /videos-landing lands.
    const html = render(EXTERNAL_ITEM);

    expect(html).toContain('href="https://videos.example.com/watch/v1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("navigates an internal link in place, with no target or rel", () => {
    const html = render(ITEM);

    expect(html).toContain('href="/recipes/12"');
    expect(html).not.toContain("target=");
    expect(html).not.toContain("rel=");
  });

  it("gives both link kinds the caller's accessible name and keeps them keyboard-focusable", () => {
    for (const [item, label, href] of [
      [ITEM, "View recipe: Old Fashioned", "/recipes/12"],
      [
        EXTERNAL_ITEM,
        "Watch video: Shaking vs. Stirring",
        "https://videos.example.com/watch/v1",
      ],
    ] as const) {
      const html = render(item);

      expect(html).toContain(`aria-label="${label}"`);

      // Focusability is structural, not an attribute: the card's root element is
      // an anchor WITH an href, which is what puts it in the tab order. The
      // negative assertion is the guard that matters - a tabindex="-1", or an
      // <a> that lost its href, would drop the entire card out of it.
      expect(html).toMatch(/^<a /);
      expect(html).toContain(`href="${href}"`);
      expect(html).not.toContain("tabindex");
    }
  });
});

describe("ContentCard media transport", () => {
  it("renders a direct-URL image with a title-derived alt and an explicit sizes hint", () => {
    // The card states 100vw rather than deriving per-breakpoint widths. That is
    // what `fill` already falls back to, so this only silences next/image's
    // missing-`sizes` warning; the assertion guards against the attribute being
    // dropped, not against the value being tuned. This is the one place the
    // literal is pinned - the layout test asserts only that one is present.
    const html = render(EXTERNAL_ITEM);

    expect(html).toContain("<img");
    expect(html).toContain('alt="Cover image for Shaking vs. Stirring"');
    expect(html).toContain('sizes="100vw"');
  });

  it("renders no image for s3 media until the signed URL resolves, but still renders the card text", () => {
    // S3CardBackgroundImage returns null while its url is unresolved, so the
    // media box is empty on the server and at first paint. The point of the
    // assertion is the second half: an unresolved image must never blank out the
    // card's title/meta or drop its link.
    const html = render(ITEM);

    expect(html).not.toContain("<img");
    expect(html).toContain("Old Fashioned");
    expect(html).toContain("By Jane Doe");
    expect(html).toContain('href="/recipes/12"');
  });

  it("marks a priority image as eager and lazy-loads the rest", () => {
    // Asserted on the direct-URL branch because it is the only branch that emits
    // an <img> under static render.
    expect(render(EXTERNAL_ITEM, true)).not.toContain('loading="lazy"');
    expect(render(EXTERNAL_ITEM, false)).toContain('loading="lazy"');
    // Default is the non-LCP behavior.
    expect(render(EXTERNAL_ITEM)).toContain('loading="lazy"');
  });
});

describe("ContentCard optional fields", () => {
  // The card emits exactly one unconditional <span>: the inline wrapper inside
  // the <h2> that carries the per-line hover underline. The kicker badge is the
  // only other one, so the span count still makes the badge's presence and
  // absence observable without depending on a hashed class name.
  const SPANS_WITHOUT_KICKER = 1;

  it("renders the kicker badge when present", () => {
    const html = render(ITEM);

    expect(countTags(html, "span")).toBe(SPANS_WITHOUT_KICKER + 1);
    expect(html).toContain(">Recipe<");
  });

  it("renders no badge element at all when the kicker is absent", () => {
    const html = render({ ...ITEM, kicker: undefined });

    // No badge, and no empty placeholder left where it would be.
    expect(countTags(html, "span")).toBe(SPANS_WITHOUT_KICKER);
    expect(html).not.toContain("<span></span>");
    expect(html).not.toContain("Recipe");
  });

  it("renders no excerpt element at all when the excerpt is absent", () => {
    const withExcerpt = render(ITEM);
    const withoutExcerpt = render({ ...ITEM, excerpt: undefined });

    // Excerpt and meta are the card's two paragraphs; dropping the excerpt must
    // remove the element rather than leave an empty <p>.
    expect(countTags(withExcerpt, "p")).toBe(2);
    expect(countTags(withoutExcerpt, "p")).toBe(1);
    expect(withoutExcerpt).not.toContain("<p></p>");
    expect(withoutExcerpt).toContain("By Jane Doe");
  });

  it("puts the title before the excerpt and the excerpt before the meta", () => {
    // Reading order is a deliberate decision (it matches the visual order, where
    // the meta is pinned to the foot of the card body), not incidental markup.
    const html = render(ITEM);

    const title = html.indexOf("Old Fashioned");
    const excerpt = html.indexOf("Bourbon, demerara");
    const meta = html.indexOf("By Jane Doe");

    expect(title).toBeGreaterThan(-1);
    expect(title).toBeLessThan(excerpt);
    expect(excerpt).toBeLessThan(meta);
  });

  it("renders the excerpt in full rather than truncating it", () => {
    // The card clamps the excerpt in CSS, so the whole string must survive into
    // the DOM; a JS truncation here would silently cost text to search/SEO.
    const excerpt = `${"word ".repeat(120)}end.`;
    const html = render({ ...ITEM, excerpt });

    expect(html).toContain(excerpt.trim());
    expect(html).not.toContain("…");
  });
});

// Counts opening tags of the given name, e.g. countTags(html, "p") ignores the
// closing </p> and any tag that merely starts with the same letters.
function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}
