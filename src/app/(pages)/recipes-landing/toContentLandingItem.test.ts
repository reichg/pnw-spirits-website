import { describe, expect, it } from "vitest";

import {
  toContentLandingItem,
  type LandingRecipe,
} from "./toContentLandingItem";

// The adapter is the seam between the recipes API shape and the domain-agnostic
// ContentLandingItem contract. It is pure and synchronous — the page signs cover
// photos and passes the result in — so it is tested directly rather than through
// the rendered page.

const RECIPE: LandingRecipe = {
  id: 12,
  title: "Old Fashioned",
  author: "Jane Doe",
  description: "Bourbon, demerara, and a wide strip of orange peel.",
  coverPhoto: "recipes/12.jpg",
};

const SIGNED = "https://bucket.s3.amazonaws.com/recipes/12.jpg?X-Amz-Sig=abc";

describe("toContentLandingItem", () => {
  it("maps a recipe onto the landing-item contract", () => {
    expect(toContentLandingItem(RECIPE, SIGNED)).toEqual({
      // Stringified: the contract's id is a React key, and numeric ids from the
      // API must not leak a number into a field typed as a string.
      id: "12",
      kicker: "Recipe",
      title: "Old Fashioned",
      meta: "By Jane Doe",
      excerpt: "Bourbon, demerara, and a wide strip of orange peel.",
      media: { kind: "url", src: SIGNED },
      link: { kind: "internal", href: "/recipes/12" },
      ariaLabel: "View recipe: Old Fashioned",
    });
  });

  it("declares recipe links internal so the card never opens a new tab", () => {
    // Guards the discriminant rather than the href: the card derives target/rel
    // from `kind`, so flipping this would change navigation behavior silently.
    expect(toContentLandingItem(RECIPE, SIGNED).link).toEqual({
      kind: "internal",
      href: "/recipes/12",
    });
  });
});

describe("toContentLandingItem cover media", () => {
  it("declares a signed cover photo as direct-URL media", () => {
    // The whole point of signing on the server: `url` media is the branch the
    // card server-renders as a real <img>. Reverting this to `s3` would put the
    // page back on the post-hydration round-trip and blank its first paint.
    expect(toContentLandingItem(RECIPE, SIGNED).media).toEqual({
      kind: "url",
      src: SIGNED,
    });
  });

  it("falls back to s3 media keyed by the stored key when signing yields nothing", () => {
    // Signing is unavailable (missing AWS env vars, or a signer fault). The key
    // must go back out as `s3` media for the client path to resolve — emitting
    // it as a `url` src would hand next/image an unparseable value and crash the
    // render.
    const media = toContentLandingItem(RECIPE, null).media;

    expect(media).toEqual({ kind: "s3", key: "recipes/12.jpg" });
    expect(media.kind).not.toBe("url");
  });

  it("normalizes a null cover photo to a null key", () => {
    const item = toContentLandingItem({ ...RECIPE, coverPhoto: null }, null);

    expect(item.media).toEqual({ kind: "s3", key: null });
  });

  it("normalizes a missing cover photo to a null key", () => {
    // `coverPhoto` is optional on the wire; the card's media contract is not, so
    // `undefined` must never reach it.
    const withoutCoverPhoto: LandingRecipe = {
      id: RECIPE.id,
      title: RECIPE.title,
      author: RECIPE.author,
      description: RECIPE.description,
    };
    const item = toContentLandingItem(withoutCoverPhoto, null);

    expect(item.media).toEqual({ kind: "s3", key: null });
  });
});

describe("toContentLandingItem text fields", () => {
  it("passes the description through untruncated", () => {
    // The card clamps the excerpt in CSS. Truncating here would permanently cost
    // the rest of the text, and is the regression this test exists to catch.
    const description = `${"A long sentence about the drink. ".repeat(30)}End.`;
    const item = toContentLandingItem({ ...RECIPE, description }, SIGNED);

    expect(item.excerpt).toBe(description);
    expect(item.excerpt).not.toContain("…");
  });

  it("uses landing-page meta wording, not the /recipes detail wording", () => {
    // /recipes renders "by {author} | {date}". The landing line is deliberately
    // different and must not drift back toward it.
    expect(toContentLandingItem(RECIPE, SIGNED).meta).toBe("By Jane Doe");
  });

  it("builds the detail href and accessible name from the recipe itself", () => {
    const item = toContentLandingItem(
      { ...RECIPE, id: 7, title: "Spruce Tip Gimlet" },
      SIGNED,
    );

    expect(item.id).toBe("7");
    expect(item.link.href).toBe("/recipes/7");
    expect(item.ariaLabel).toBe("View recipe: Spruce Tip Gimlet");
  });
});
