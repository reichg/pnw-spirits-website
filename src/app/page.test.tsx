import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import Home from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `Home` is a synchronous server component taking no props, so — unlike the
// three async landing pages — it renders straight through
// renderToStaticMarkup with nothing to await and nothing to stub. No production
// code was changed or exported to make this testable.
//
// It embeds SubscribeForm, a client component, and that turns out to cost
// nothing here: under Vitest the "use client" directive is an inert string, the
// module imports like any other, and the form emits its full idle-state markup
// on the server render. So the real component renders below rather than a
// vi.mock stand-in. Its own behaviour is not this file's subject and is not
// asserted.
//
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and
// no @testing-library/react (see vitest.config.ts). The four-column card set is
// fully observable anyway, because it is plain server-rendered markup: six
// anchors carrying their route, their accessible name and their photograph as
// an inline background-image. What is NOT observable is the CSS that arranges
// them — the 3-column grid, the 901-1024px two-column step and the <=900px
// stack live in LandingPage.module.css, which Vitest never reads. Breakpoints
// are therefore deliberately untested here rather than faked; see the
// specialist report's remaining risks.
//
// No assertion keys off a CSS-module class name, and nothing here is even
// SCOPED by one. Under Vitest the import is a Proxy that echoes ANY key back as
// `_<key>_<hash>`, so a class assertion could never prove a rule exists anyway
// — see the canonical note in Pagination.test.tsx. Cards are located instead by
// the structural property that defines them: an anchor whose inline style sets
// a background image. Nothing else on this page is one.
//
// THE ASSERTION THAT CARRIES THIS FILE is the preload/background agreement in
// the second describe. The hidden <Image> block exists only to preload the
// cards' CSS background images, which Next cannot discover on its own, and the
// two lists are maintained by hand in separate halves of the file. They had
// already drifted once — the block preloaded a Bottles.jpg no card used and
// omitted the AmaronFloat.jpg the Classes card did use — with nothing to catch
// it. So both lists are DERIVED from the rendered markup and compared to each
// other. Hardcoding the two expected lists would reproduce exactly the bug it
// is supposed to catch: the test would keep passing while the page drifted.

/** Card order, which tracks the public header's nav order. */
const NAV_ORDER = [
  "/blogs-landing",
  "/recipes-landing",
  "/classes",
  "/videos-landing",
  "/about",
  "/contact",
];

type Anchor = {
  href?: string;
  /** The link's accessible name, which every card supplies via aria-label. */
  name?: string;
  /** The card photograph, from the inline background-image, if it has one. */
  background?: string;
};

function render(): string {
  return renderToStaticMarkup(<Home />);
}

/** Reads one attribute off a serialized start tag, order-independently. */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

/** React escapes quotes and ampersands inside attribute values. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function parseAnchors(html: string): Anchor[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const style = decodeEntities(attr(tag, "style") ?? "");
    return {
      href: attr(tag, "href"),
      name: attr(tag, "aria-label"),
      background: style.match(/background-image:\s*url\(['"]?([^'")]+)/)?.[1],
    };
  });
}

/** The four-column cards: the only anchors on the page wearing a photograph. */
function parseCards(html: string): Required<Anchor>[] {
  return parseAnchors(html).filter(
    (anchor): anchor is Required<Anchor> => anchor.background !== undefined,
  );
}

/**
 * The hidden preload block's inner markup.
 *
 * Locating it by `display:none` rather than by position is itself part of the
 * contract: six 10px images that lost their wrapper would render on the page.
 */
function preloadBlock(html: string): string {
  const block = html.match(/<div style="display:none">([\s\S]*?)<\/div>/);
  if (!block) {
    throw new Error(
      "No hidden preload block found: the card preloads are either gone or no longer hidden.",
    );
  }
  return block[1];
}

/** The original image paths behind next/image's optimizer URLs, in order. */
function optimizedSources(markup: string): string[] {
  return [
    ...markup.matchAll(/<img\b[^>]*\ssrc="\/_next\/image\?url=([^&"]+)/g),
  ].map((match) => decodeURIComponent(match[1]));
}

/** Images the browser is actually told to preload, via next/image `priority`. */
function preloadLinkSources(html: string): string[] {
  return [
    ...html.matchAll(
      /<link rel="preload" as="image" imageSrcSet="\/_next\/image\?url=([^&"]+)/g,
    ),
  ].map((match) => decodeURIComponent(match[1]));
}

describe("Home four-column card set", () => {
  it("renders the six nav destinations as cards, in nav order", () => {
    const cards = parseCards(render());

    // Six, not five: the Recipes card was missing outright while /recipes-landing
    // shipped in the header, so the landing page pointed at four of the five
    // Concoctions/Resources destinations.
    expect(cards).toHaveLength(6);
    // Order matches NAV_ITEMS in src/components/Layout/Header.tsx — Concoctions
    // (Blogs, Recipes, Classes, Videos) then Resources (About, Contact) — so a
    // visitor reads the same sequence in the nav and on the page.
    expect(cards.map((card) => card.href)).toEqual(NAV_ORDER);
    // Every card wears a different photograph. A card added by copying its
    // neighbour and forgetting the background would otherwise look plausible.
    expect(new Set(cards.map((card) => card.background)).size).toBe(6);
  });

  it("gives the Recipes card its route, name and photograph", () => {
    const html = render();

    const recipes = parseCards(html).find(
      (card) => card.href === "/recipes-landing",
    );

    expect(recipes).toBeDefined();
    expect(recipes?.name).toBe("Recipes");
    expect(recipes?.background).toBe("/images/Bottles.jpg");
    // The label is also the visible text, not the accessible name alone.
    expect(html).toContain(">Recipes<");
  });

  it("names every link on the page", () => {
    const anchors = parseAnchors(render());

    // A card is a photograph with no text alternative of its own, so its
    // aria-label is the only accessible name it has; an unnamed one reaches a
    // screen reader as "link" and nothing more.
    for (const anchor of anchors) {
      expect(anchor.name, `unnamed link to ${anchor.href}`).toBeTruthy();
    }
    // And no anchor on the page is anything other than a card, so the loop
    // above cannot pass by covering fewer links than exist.
    expect(anchors).toHaveLength(6);
  });
});

describe("Home card background preloads", () => {
  it("preloads exactly the images the cards use", () => {
    const html = render();

    const backgrounds = parseCards(html).map((card) => card.background);
    const preloaded = optimizedSources(preloadBlock(html));

    // Guards against a vacuous pass: two broken extractors would otherwise
    // agree perfectly on a pair of empty lists.
    expect(backgrounds).toHaveLength(6);
    expect(preloaded).toHaveLength(6);
    // Stated as two set differences rather than one equality so a failure names
    // the file that drifted instead of printing two six-item lists to diff by
    // eye. Left: an image preloaded for a card that no longer uses it, costing
    // the visitor a download for nothing. Right: a card photograph nobody
    // preloads, which is the whole point of the block.
    expect(preloaded.filter((src) => !backgrounds.includes(src))).toEqual([]);
    expect(backgrounds.filter((src) => !preloaded.includes(src))).toEqual([]);
  });

  it("keeps the preload block in card order", () => {
    const html = render();

    // The block's comment promises "one entry per card, in card order". Order
    // is what makes the two lists auditable side by side, and it is also the
    // order the browser is handed the fetches in.
    expect(optimizedSources(preloadBlock(html))).toEqual(
      parseCards(html).map((card) => card.background),
    );
  });

  it("emits a real preload link for every card background", () => {
    const html = render();

    const links = preloadLinkSources(html);

    // The functional outcome, one step past the markup: a hidden <Image> that
    // lost its `priority` flag stays in the block and still looks correct
    // above, but next/image stops emitting its <link rel="preload"> and the
    // card photograph goes back to being discovered late.
    for (const background of parseCards(html).map((card) => card.background)) {
      expect(links).toContain(background);
    }
    // Containment, not equality: the visible two-column photo is preloaded too,
    // legitimately, and is not part of the card set.
    expect(links).toContain("/images/Improved.jpg");
  });
});
