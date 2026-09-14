import { describe, expect, it } from "vitest";

import { toContentLandingItem, type LandingBlog } from "./toContentLandingItem";

// The adapter is the seam between the blogs API shape and the domain-agnostic
// ContentLandingItem contract. It is pure and synchronous — the page signs cover
// photos and passes the result in — so it is tested directly rather than through
// the rendered page.

const BLOG: LandingBlog = {
  id: 12,
  title: "Spruce Tip Season",
  author: "Jane Doe",
  excerpt: "Foraging the first tips of the year, and what to pour with them.",
  coverPhoto: "blogs/12.jpg",
};

const SIGNED = "https://bucket.s3.amazonaws.com/blogs/12.jpg?X-Amz-Sig=abc";

describe("toContentLandingItem", () => {
  it("maps a blog onto the landing-item contract", () => {
    expect(toContentLandingItem(BLOG, SIGNED)).toEqual({
      // Stringified: the contract's id is a React key, and Blog.id is an Int in
      // the schema, so a number would otherwise leak into a string-typed field.
      id: "12",
      kicker: "Article",
      title: "Spruce Tip Season",
      meta: "By Jane Doe",
      excerpt:
        "Foraging the first tips of the year, and what to pour with them.",
      media: { kind: "url", src: SIGNED },
      link: { kind: "internal", href: "/blogs/12" },
      ariaLabel: "Read article: Spruce Tip Season",
    });
  });

  it("declares blog links internal so the card never opens a new tab", () => {
    // Guards the discriminant rather than the href: the card derives target/rel
    // from `kind`, so flipping this would change navigation behavior silently.
    expect(toContentLandingItem(BLOG, SIGNED).link).toEqual({
      kind: "internal",
      href: "/blogs/12",
    });
  });
});

describe("toContentLandingItem cover media", () => {
  it("declares a signed cover photo as direct-URL media", () => {
    // The whole point of signing on the server: `url` media is the branch the
    // card server-renders as a real <img>. Reverting this to `s3` would put the
    // page back on the post-hydration round-trip and blank its first paint.
    expect(toContentLandingItem(BLOG, SIGNED).media).toEqual({
      kind: "url",
      src: SIGNED,
    });
  });

  it("falls back to s3 media keyed by the stored key when signing yields nothing", () => {
    // Signing is unavailable (missing AWS env vars, or a signer fault). The key
    // must go back out as `s3` media for the client path to resolve — emitting
    // it as a `url` src would hand next/image an unparseable value and crash the
    // render.
    const media = toContentLandingItem(BLOG, null).media;

    expect(media).toEqual({ kind: "s3", key: "blogs/12.jpg" });
    expect(media.kind).not.toBe("url");
  });

  it("normalizes a null cover photo to a null key", () => {
    const item = toContentLandingItem({ ...BLOG, coverPhoto: null }, null);

    expect(item.media).toEqual({ kind: "s3", key: null });
  });

  it("normalizes a missing cover photo to a null key", () => {
    // `coverPhoto` is optional on the wire; the card's media contract is not, so
    // `undefined` must never reach it.
    const withoutCoverPhoto: LandingBlog = {
      id: BLOG.id,
      title: BLOG.title,
      author: BLOG.author,
    };
    const item = toContentLandingItem(withoutCoverPhoto, null);

    expect(item.media).toEqual({ kind: "s3", key: null });
  });
});

describe("toContentLandingItem text fields", () => {
  it("passes a supplied excerpt through untruncated", () => {
    // The card clamps the excerpt in CSS. Truncating here would permanently cost
    // the rest of the text, and is the regression this test exists to catch.
    const excerpt = `${"A long sentence about the season. ".repeat(30)}End.`;
    const item = toContentLandingItem({ ...BLOG, excerpt }, SIGNED);

    expect(item.excerpt).toBe(excerpt);
    expect(item.excerpt).not.toContain("…");
  });

  it("emits no excerpt when the blog has none", () => {
    // Blog has no `excerpt` column today, so this is the live case, not the edge
    // one. The card omits its summary paragraph entirely for an absent excerpt.
    //
    // The stronger guarantee is structural: `content` is not part of LandingBlog
    // at all, so the adapter cannot fabricate a summary by truncating the post
    // body even if someone later decides it should. Widening the type is the
    // change this test is meant to make visible.
    const withoutExcerpt: LandingBlog = {
      id: BLOG.id,
      title: BLOG.title,
      author: BLOG.author,
      coverPhoto: BLOG.coverPhoto,
    };

    expect(
      toContentLandingItem(withoutExcerpt, SIGNED).excerpt,
    ).toBeUndefined();
  });

  it("uses landing-page meta wording, not the /blogs detail wording", () => {
    // /blogs and the blog detail page render "by {author} | {date}". The landing
    // line is deliberately author-only, matching the recipes landing card, and
    // must not drift back toward the dated form.
    const meta = toContentLandingItem(BLOG, SIGNED).meta;

    expect(meta).toBe("By Jane Doe");
    expect(meta).not.toContain("|");
  });

  it("builds the detail href and accessible name from the blog itself", () => {
    const item = toContentLandingItem(
      { ...BLOG, id: 7, title: "Cellar Notes" },
      SIGNED,
    );

    expect(item.id).toBe("7");
    expect(item.link.href).toBe("/blogs/7");
    expect(item.ariaLabel).toBe("Read article: Cellar Notes");
  });
});
