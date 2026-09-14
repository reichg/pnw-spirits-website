import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ContentRow from "./ContentRow";
import type { ContentItem } from "./content.types";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json). That costs this
// component almost nothing: ContentRow is a pure server component — no state, no
// effects — so renderToStaticMarkup observes both link branches, both media
// branches, every optional field, and the `<time>` contract.
//
// The one thing static render cannot show is the resolved s3 image. That branch
// delegates to S3CardBackgroundImage, which is "use client" and returns null
// until a useEffect resolves a signed URL, so under renderToStaticMarkup the s3
// path emits an empty media box and no <img> — the same thing it does at first
// paint in production. It is asserted below as what actually happens rather than
// papered over; the post-effect swap is the environment-imposed gap. The archive
// pages sign on the server and therefore take the `url` branch, which is why the
// page tests see real imagery and this file mostly does not.
//
// No assertion depends on a CSS-module class name: they are hashed by the
// transform and are not a contract. Elements are identified by tag, attribute
// and text.
//
// Nor does any assertion depend on the emitted `q=` value. next/image resolves
// its allow-list from a build-time config injection that Vitest does not
// perform, so the rendered srcSet here reads q=75 and stderr warns about an
// unconfigured quality regardless of what the component passes. next.config.ts
// does declare [75, 85]; the quality prop is simply not observable in this
// environment, and asserting on it would pin the artifact rather than the code.

const ITEM: ContentItem = {
  id: "12",
  kicker: "Recipe",
  title: "Old Fashioned",
  meta: "By Jane Doe",
  excerpt: "Bourbon, demerara, and a wide strip of orange peel.",
  timestamp: { iso: "2026-01-02T12:00:00.000Z", label: "January 2, 2026" },
  media: { kind: "url", src: "https://img.example.com/12.jpg" },
  link: { kind: "internal", href: "/recipes/12" },
  ariaLabel: "View recipe: Old Fashioned",
};

// A video-shaped row: the external-link branch, and the only archive whose rows
// carry a date and no byline.
const EXTERNAL_ITEM: ContentItem = {
  id: "v1",
  kicker: "Video",
  title: "Shaking vs. Stirring",
  timestamp: { iso: "2026-03-04T09:30:00.000Z", label: "March 4, 2026" },
  media: { kind: "url", src: "https://img.example.com/thumb.jpg" },
  link: { kind: "external", href: "https://www.youtube.com/watch?v=v1" },
  ariaLabel: "Watch video on YouTube: Shaking vs. Stirring",
};

function render(item: ContentItem, priority?: boolean): string {
  return renderToStaticMarkup(
    React.createElement(ContentRow, { item, priority }),
  );
}

describe("ContentRow link intent", () => {
  it("is one link for the whole row, rule included", () => {
    // The metadata rule renders inside the anchor on purpose: a rule sitting
    // between two link targets would split the row into two tab stops and two
    // hit areas for what reads as a single entry.
    const html = render(ITEM);

    expect(countTags(html, "a")).toBe(1);
    expect(html).toMatch(/^<a /);
    // The date and the title are both inside that one anchor.
    expect(html.indexOf("</a>")).toBeGreaterThan(html.indexOf("January 2"));
    expect(html.indexOf("</a>")).toBeGreaterThan(html.indexOf("Old Fashioned"));
  });

  it("opens an external row in a new tab with an opener-safe rel", () => {
    const html = render(EXTERNAL_ITEM);

    expect(html).toContain('href="https://www.youtube.com/watch?v=v1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("navigates an internal row in place, with no target or rel", () => {
    const html = render(ITEM);

    expect(html).toContain('href="/recipes/12"');
    expect(html).not.toContain("target=");
    expect(html).not.toContain("rel=");
  });

  it("takes its accessible name from the item and stays keyboard-focusable", () => {
    for (const [item, label, href] of [
      [ITEM, "View recipe: Old Fashioned", "/recipes/12"],
      [
        EXTERNAL_ITEM,
        "Watch video on YouTube: Shaking vs. Stirring",
        "https://www.youtube.com/watch?v=v1",
      ],
    ] as const) {
      const html = render(item);

      // aria-label is what keeps a date tracked at 0.12em uppercase out of the
      // announced name; without it the row is read out through its own chrome.
      expect(html).toContain(`aria-label="${label}"`);
      // Focusability is structural: an anchor WITH an href is in the tab order.
      // The negative is the guard that matters — a tabindex="-1", or an <a> that
      // lost its href, drops the entire row out of it.
      expect(html).toMatch(/^<a /);
      expect(html).toContain(`href="${href}"`);
      expect(html).not.toContain("tabindex");
    }
  });
});

describe("ContentRow timestamp", () => {
  it("emits a machine-readable <time> whose text is the human form", () => {
    const html = render(ITEM);

    // Matched case-insensitively: React's server renderer emits the attribute
    // as `dateTime`, and HTML attribute names are case-insensitive, so the
    // casing is not the contract — the pairing of instant and label is.
    expect(html).toMatch(/<time[^>]*datetime="2026-01-02T12:00:00\.000Z"/i);
    expect(html).toContain(">January 2, 2026</time>");
  });

  it("omits the <time> element entirely when the source carried no date", () => {
    // Not an empty <time>: a dateTime attribute that says nothing is worse than
    // no element, because assistive technology announces it as a date anyway.
    const html = render({ ...ITEM, timestamp: undefined });

    expect(html).not.toContain("<time");
    expect(html).not.toMatch(/datetime=/i);
    // The rest of the row is unaffected.
    expect(html).toContain("Old Fashioned");
    expect(html).toContain(">Recipe<");
  });

  it("keeps the date on the rule and out of the byline slot", () => {
    // The row has a slot for each, so it never takes ContentCard's
    // meta ?? timestamp.label fallback; taking it would print the same date
    // twice on one row. A video row is the case that would show it.
    const html = render(EXTERNAL_ITEM);

    expect(countOccurrences(html, "March 4, 2026")).toBe(1);
    // And the date precedes the title, matching the visual order of the rule.
    // Compared against the <h2> rather than against the title text, which also
    // occurs earlier inside the anchor's aria-label.
    expect(html.indexOf("March 4, 2026")).toBeLessThan(html.indexOf("<h2"));
  });
});

describe("ContentRow optional fields", () => {
  // The row emits exactly one unconditional <span>: the inline wrapper inside
  // the <h2> that carries the per-line underline wipe. The kicker is the only
  // other one, so the span count makes its presence and absence observable with
  // no dependence on a hashed class name.
  const SPANS_WITHOUT_KICKER = 1;

  it("renders the kicker at the end of the rule when present", () => {
    const html = render(ITEM);

    expect(countTags(html, "span")).toBe(SPANS_WITHOUT_KICKER + 1);
    expect(html).toContain(">Recipe<");
  });

  it("renders no kicker element at all when it is absent", () => {
    const html = render({ ...ITEM, kicker: undefined });

    expect(countTags(html, "span")).toBe(SPANS_WITHOUT_KICKER);
    expect(html).not.toContain("<span></span>");
    expect(html).not.toContain(">Recipe<");
  });

  it("renders no excerpt element at all when the excerpt is absent", () => {
    const withExcerpt = render(ITEM);
    const withoutExcerpt = render({ ...ITEM, excerpt: undefined });

    // Excerpt and meta are the row's two paragraphs; dropping the excerpt must
    // remove the element rather than leave an empty <p> holding open its space.
    expect(countTags(withExcerpt, "p")).toBe(2);
    expect(countTags(withoutExcerpt, "p")).toBe(1);
    expect(withoutExcerpt).not.toContain("<p></p>");
    expect(withoutExcerpt).toContain("By Jane Doe");
  });

  it("renders no byline element at all when there is no byline", () => {
    // A video legitimately has no author and must reserve no space for one.
    const html = render(EXTERNAL_ITEM);

    expect(html).not.toContain("<p></p>");
    expect(html).not.toContain("By ");
  });

  it("survives a row carrying only the required fields", () => {
    // Every optional slot empty at once: the row must still be a titled link,
    // not a skeleton of empty elements.
    const html = render({
      id: "1",
      title: "Bare Minimum",
      media: { kind: "url", src: "https://img.example.com/1.jpg" },
      link: { kind: "internal", href: "/recipes/1" },
      ariaLabel: "View recipe: Bare Minimum",
    });

    expect(countTags(html, "h2")).toBe(1);
    expect(html).toContain("Bare Minimum");
    expect(html).toContain('href="/recipes/1"');
    expect(countTags(html, "p")).toBe(0);
    expect(countTags(html, "time")).toBe(0);
    expect(html).not.toContain("<p></p>");
    expect(html).not.toContain("<span></span>");
  });

  it("puts the title before the excerpt and the excerpt before the byline", () => {
    const html = render(ITEM);

    const title = html.indexOf("Old Fashioned");
    const excerpt = html.indexOf("Bourbon, demerara");
    const meta = html.indexOf("By Jane Doe");

    expect(title).toBeGreaterThan(-1);
    expect(title).toBeLessThan(excerpt);
    expect(excerpt).toBeLessThan(meta);
  });

  it("renders the excerpt in full rather than truncating it", () => {
    // The row clamps in CSS, so the whole string must survive into the DOM; a JS
    // truncation here would silently cost text to search and to SEO.
    const excerpt = `${"word ".repeat(120)}end.`;
    const html = render({ ...ITEM, excerpt });

    expect(html).toContain(excerpt.trim());
    expect(html).not.toContain("…");
  });
});

describe("ContentRow media transport", () => {
  it("renders a direct-URL image with a title-derived alt", () => {
    const html = render(EXTERNAL_ITEM);

    expect(countTags(html, "img")).toBe(1);
    expect(html).toContain('alt="Cover image for Shaking vs. Stirring"');
  });

  it("states a real sizes hint rather than falling back to the full viewport", () => {
    // The behavior under test is the difference from ContentCard, which states
    // 100vw. An archive renders twelve of these; 100vw would ask the optimizer
    // for a full-width source for a ~240px plate twelve times over. The literal
    // is pinned in this one place and tracks --row-media-col in
    // ContentRow.module.css, so a change to the grid has somewhere to fail.
    //
    // ALL-PX ON PURPOSE — do not "correct" the phone steps to vw. next/image
    // scans `sizes` for vw tokens and, on finding ANY, rebuilds the srcset from
    // deviceSizes filtered to >= 640 * smallestRatio. One vw figure therefore
    // sets the floor for every breakpoint, not just its own: writing the phone
    // case honestly as 150vw collapsed the srcset to 1080w/1200w/1920w/2048w/
    // 3840w, so a 148px desktop plate fetched w=1080. The px form keeps the
    // small candidates, letting the browser pick 256w for a 240px hint.
    const html = render(ITEM);

    expect(html).toContain(
      'sizes="(max-width: 400px) 640px, (max-width: 599px) 828px, 240px"',
    );
  });

  it("states one hint for every row, whatever the row holds", () => {
    // ContentRow was deliberately NOT taught about pages. /videos renders two
    // entries per line at >= 900px and /blogs and /recipes stay single-column,
    // but that two-up rides a --archive-columns custom property declared by the
    // page's own CSS module, so the component never branches on it. Its layout
    // hint is therefore one constant rather than a per-page or per-domain value,
    // and that is what this pins: a `columns` or `variant` prop added here later
    // would have to break it.
    const hints = [
      ITEM,
      EXTERNAL_ITEM,
      { ...ITEM, kicker: undefined, timestamp: undefined, excerpt: undefined },
    ].map((item) => /sizes="([^"]+)"/.exec(render(item))?.[1]);

    expect(hints[0]).toBeTruthy();
    expect(new Set(hints).size).toBe(1);
  });

  it("renders no image for s3 media until the signed URL resolves, but keeps the row", () => {
    // S3CardBackgroundImage returns null while its url is unresolved, so the
    // media box is empty on the server and at first paint. The point is the
    // second half: an unresolved image must never blank out the row's text or
    // drop its link. The archive pages sign server-side and so do not take this
    // branch; it is the fallback when signing is unavailable.
    const html = render({
      ...ITEM,
      media: { kind: "s3", key: "recipes/12.jpg" },
    });

    expect(html).not.toContain("<img");
    expect(html).toContain("Old Fashioned");
    expect(html).toContain("By Jane Doe");
    expect(html).toContain('href="/recipes/12"');
  });

  it("renders nothing rather than throwing for s3 media with no key", () => {
    // The branch toVideoItem routes an empty thumbnail into: an empty `src`
    // makes next/image throw "Failed to parse src" and takes the whole server
    // render down with it.
    const html = render({ ...ITEM, media: { kind: "s3", key: null } });

    expect(html).not.toContain("<img");
    expect(html).toContain("Old Fashioned");
  });

  it("marks a priority image as eager and lazy-loads the rest", () => {
    // Asserted on the direct-URL branch because it is the only branch that emits
    // an <img> under static render.
    expect(render(EXTERNAL_ITEM, true)).not.toContain('loading="lazy"');
    expect(render(EXTERNAL_ITEM, false)).toContain('loading="lazy"');
    // The default is the non-LCP behavior: a row is only the LCP if the layout
    // says so.
    expect(render(EXTERNAL_ITEM)).toContain('loading="lazy"');
  });
});

// Counts opening tags of the given name, e.g. countTags(html, "p") ignores the
// closing </p> and any tag that merely starts with the same letters.
function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}
