import { describe, expect, it } from "vitest";

import {
  toBlogItem,
  toRecipeItem,
  toVideoItem,
  type BlogRecord,
  type RecipeRecord,
  type VideoRecord,
} from "./contentItems";

// These adapters are the seam between the three API shapes and the
// domain-agnostic `ContentItem` contract. They are pure and synchronous — the
// pages sign cover photos and pass the result in — so they are tested directly
// rather than through a rendered page.
//
// One file for all three because they are meant to stay parallel: they were
// three separate copies under the landing routes, and the copies drifted. An
// assertion that only one of them makes is a difference worth seeing here.

const BLOG: BlogRecord = {
  id: 12,
  title: "Spruce Tip Season",
  author: "Jane Doe",
  excerpt: "Foraging the first tips of the year, and what to pour with them.",
  coverPhoto: "blogs/12.jpg",
  createdAt: "2026-01-02T12:00:00.000Z",
};

const RECIPE: RecipeRecord = {
  id: 12,
  title: "Old Fashioned",
  author: "Jane Doe",
  description: "Bourbon, demerara, and a wide strip of orange peel.",
  coverPhoto: "recipes/12.jpg",
  createdAt: "2026-01-02T12:00:00.000Z",
};

const VIDEO: VideoRecord = {
  id: "v1",
  url: "https://www.youtube.com/watch?v=v1",
  title: "Barrel Room Tour",
  thumbnail: "https://i.ytimg.com/vi/v1/hqdefault.jpg",
  publishedAt: "2026-01-02T12:00:00.000Z",
};

const SIGNED_BLOG =
  "https://bucket.s3.amazonaws.com/blogs/12.jpg?X-Amz-Sig=abc";
const SIGNED_RECIPE =
  "https://bucket.s3.amazonaws.com/recipes/12.jpg?X-Amz-Sig=abc";

const JAN_2 = { iso: "2026-01-02T12:00:00.000Z", label: "January 2, 2026" };

describe("toBlogItem", () => {
  it("maps a blog onto the item contract", () => {
    expect(toBlogItem(BLOG, SIGNED_BLOG)).toEqual({
      // Stringified: the contract's id is a React key, and Blog.id is an Int in
      // the schema, so a number would otherwise leak into a string-typed field.
      id: "12",
      kicker: "Article",
      title: "Spruce Tip Season",
      meta: "By Jane Doe",
      excerpt:
        "Foraging the first tips of the year, and what to pour with them.",
      timestamp: JAN_2,
      media: { kind: "url", src: SIGNED_BLOG },
      link: { kind: "internal", href: "/blogs/12" },
      ariaLabel: "Read article: Spruce Tip Season",
    });
  });

  it("declares blog links internal so the view never opens a new tab", () => {
    // Guards the discriminant rather than the href: the view derives target/rel
    // from `kind`, so flipping this would change navigation behavior silently.
    expect(toBlogItem(BLOG, SIGNED_BLOG).link).toEqual({
      kind: "internal",
      href: "/blogs/12",
    });
  });

  it("builds the detail href and accessible name from the blog itself", () => {
    const item = toBlogItem(
      { ...BLOG, id: 7, title: "Cellar Notes" },
      SIGNED_BLOG,
    );

    expect(item.id).toBe("7");
    expect(item.link.href).toBe("/blogs/7");
    expect(item.ariaLabel).toBe("Read article: Cellar Notes");
  });
});

describe("toBlogItem cover media", () => {
  it("declares a signed cover photo as direct-URL media", () => {
    // The whole point of signing on the server: `url` media is the branch the
    // view server-renders as a real <img>. Reverting this to `s3` would put the
    // page back on the post-hydration round-trip and blank its first paint.
    expect(toBlogItem(BLOG, SIGNED_BLOG).media).toEqual({
      kind: "url",
      src: SIGNED_BLOG,
    });
  });

  it("falls back to s3 media keyed by the stored key when signing yields nothing", () => {
    // Signing is unavailable (missing AWS env vars, or a signer fault). The key
    // must go back out as `s3` media for the client path to resolve — emitting
    // it as a `url` src would hand next/image an unparseable value and crash the
    // render.
    const media = toBlogItem(BLOG, null).media;

    expect(media).toEqual({ kind: "s3", key: "blogs/12.jpg" });
    expect(media.kind).not.toBe("url");
  });

  it("normalizes a null cover photo to a null key", () => {
    expect(toBlogItem({ ...BLOG, coverPhoto: null }, null).media).toEqual({
      kind: "s3",
      key: null,
    });
  });

  it("normalizes a missing cover photo to a null key", () => {
    // `coverPhoto` is optional on the wire; the media contract is not, so
    // `undefined` must never reach it.
    const withoutCoverPhoto: BlogRecord = {
      id: BLOG.id,
      title: BLOG.title,
      author: BLOG.author,
    };

    expect(toBlogItem(withoutCoverPhoto, null).media).toEqual({
      kind: "s3",
      key: null,
    });
  });
});

describe("toBlogItem text fields", () => {
  it("passes a supplied excerpt through untruncated", () => {
    // The view clamps the excerpt in CSS. Truncating here would permanently cost
    // the rest of the text, and is the regression this test exists to catch.
    const excerpt = `${"A long sentence about the season. ".repeat(30)}End.`;
    const item = toBlogItem({ ...BLOG, excerpt }, SIGNED_BLOG);

    expect(item.excerpt).toBe(excerpt);
    expect(item.excerpt).not.toContain("…");
  });

  it("emits no excerpt when the blog has none", () => {
    // Blog has no `excerpt` column today, so this is the live case, not the edge
    // one. The view omits its summary paragraph entirely for an absent excerpt.
    //
    // The stronger guarantee is structural: `content` is not part of BlogRecord
    // at all, so the adapter cannot fabricate a summary by truncating the post
    // body even if someone later decides it should. Widening the type is the
    // change this test is meant to make visible.
    const withoutExcerpt: BlogRecord = {
      id: BLOG.id,
      title: BLOG.title,
      author: BLOG.author,
      coverPhoto: BLOG.coverPhoto,
    };

    expect(toBlogItem(withoutExcerpt, SIGNED_BLOG).excerpt).toBeUndefined();
  });

  it("keeps the date out of the byline", () => {
    // The archive lists this replaced rendered "by {author} | {date}" as one
    // string. `meta` is the byline alone and the date is a structured
    // `timestamp`, which is what lets a row position the two independently and
    // what keeps one adapter serving both surfaces. Folding the date back in
    // would silently duplicate it on every row.
    const item = toBlogItem(BLOG, SIGNED_BLOG);

    expect(item.meta).toBe("By Jane Doe");
    expect(item.meta).not.toContain("|");
    expect(item.meta).not.toContain("2026");
  });
});

describe("toRecipeItem", () => {
  it("maps a recipe onto the item contract", () => {
    expect(toRecipeItem(RECIPE, SIGNED_RECIPE)).toEqual({
      id: "12",
      kicker: "Recipe",
      title: "Old Fashioned",
      meta: "By Jane Doe",
      excerpt: "Bourbon, demerara, and a wide strip of orange peel.",
      timestamp: JAN_2,
      media: { kind: "url", src: SIGNED_RECIPE },
      link: { kind: "internal", href: "/recipes/12" },
      ariaLabel: "View recipe: Old Fashioned",
    });
  });

  it("declares recipe links internal so the view never opens a new tab", () => {
    expect(toRecipeItem(RECIPE, SIGNED_RECIPE).link).toEqual({
      kind: "internal",
      href: "/recipes/12",
    });
  });

  it("builds the detail href and accessible name from the recipe itself", () => {
    const item = toRecipeItem(
      { ...RECIPE, id: 7, title: "Spruce Tip Gimlet" },
      SIGNED_RECIPE,
    );

    expect(item.id).toBe("7");
    expect(item.link.href).toBe("/recipes/7");
    expect(item.ariaLabel).toBe("View recipe: Spruce Tip Gimlet");
  });
});

describe("toRecipeItem cover media", () => {
  it("declares a signed cover photo as direct-URL media", () => {
    expect(toRecipeItem(RECIPE, SIGNED_RECIPE).media).toEqual({
      kind: "url",
      src: SIGNED_RECIPE,
    });
  });

  it("falls back to s3 media keyed by the stored key when signing yields nothing", () => {
    const media = toRecipeItem(RECIPE, null).media;

    expect(media).toEqual({ kind: "s3", key: "recipes/12.jpg" });
    expect(media.kind).not.toBe("url");
  });

  it("normalizes a null cover photo to a null key", () => {
    expect(toRecipeItem({ ...RECIPE, coverPhoto: null }, null).media).toEqual({
      kind: "s3",
      key: null,
    });
  });

  it("normalizes a missing cover photo to a null key", () => {
    const withoutCoverPhoto: RecipeRecord = {
      id: RECIPE.id,
      title: RECIPE.title,
      author: RECIPE.author,
      description: RECIPE.description,
    };

    expect(toRecipeItem(withoutCoverPhoto, null).media).toEqual({
      kind: "s3",
      key: null,
    });
  });
});

describe("toRecipeItem text fields", () => {
  it("passes the description through untruncated", () => {
    const description = `${"A long sentence about the drink. ".repeat(30)}End.`;
    const item = toRecipeItem({ ...RECIPE, description }, SIGNED_RECIPE);

    expect(item.excerpt).toBe(description);
    expect(item.excerpt).not.toContain("…");
  });

  it("keeps the date out of the byline", () => {
    const item = toRecipeItem(RECIPE, SIGNED_RECIPE);

    expect(item.meta).toBe("By Jane Doe");
    expect(item.meta).not.toContain("|");
  });
});

describe("toVideoItem", () => {
  it("maps a video onto the item contract", () => {
    expect(toVideoItem(VIDEO)).toEqual({
      // Not stringified, unlike the blog and recipe adapters: a YouTube video id
      // is already a string on the wire.
      id: "v1",
      kicker: "Video",
      title: "Barrel Room Tour",
      timestamp: JAN_2,
      media: { kind: "url", src: "https://i.ytimg.com/vi/v1/hqdefault.jpg" },
      link: { kind: "external", href: "https://www.youtube.com/watch?v=v1" },
      ariaLabel: "Watch video on YouTube: Barrel Room Tour",
    });
  });

  it("emits no excerpt, because the videos payload carries no description", () => {
    expect(toVideoItem(VIDEO).excerpt).toBeUndefined();
  });

  it("emits no byline, because a video has a published date and no author", () => {
    // Not an oversight and not an empty string: `meta` is the byline, and the
    // card falls back to the timestamp's label for its single secondary line, so
    // the rendered date is unchanged from when this adapter wrote it into `meta`.
    expect(toVideoItem(VIDEO).meta).toBeUndefined();
  });
});

describe("toVideoItem link", () => {
  it("declares video links external so the view opens YouTube in a new tab", () => {
    // Guards the discriminant, not just the href: the view derives target and
    // rel="noopener noreferrer" from `kind`, so an "internal" here would route
    // the click through next/link to a nonexistent internal path.
    expect(toVideoItem(VIDEO).link).toEqual({
      kind: "external",
      href: "https://www.youtube.com/watch?v=v1",
    });
  });

  it("names YouTube in the accessible name so the exit is known before activation", () => {
    // The link leaves the site. A screen-reader user must hear that from the
    // link's accessible name rather than discover it after following it.
    const ariaLabel = toVideoItem(VIDEO).ariaLabel;

    expect(ariaLabel).toBe("Watch video on YouTube: Barrel Room Tour");
    expect(ariaLabel).toContain("YouTube");
  });
});

describe("toVideoItem thumbnail media", () => {
  it("declares a snippet thumbnail as direct-URL media", () => {
    expect(toVideoItem(VIDEO).media).toEqual({
      kind: "url",
      src: "https://i.ytimg.com/vi/v1/hqdefault.jpg",
    });
  });

  it("falls back to s3 media when the thumbnail is empty", () => {
    // /api/videos substitutes "" when a snippet has no thumbnail of any size.
    // Passing that straight through as a `url` src is not a cosmetic problem:
    // next/image throws "Failed to parse src" on an empty string and fails the
    // whole server render. `s3` media with a null key renders nothing instead.
    const media = toVideoItem({ ...VIDEO, thumbnail: "" }).media;

    expect(media).toEqual({ kind: "s3", key: null });
    expect(media.kind).not.toBe("url");
  });

  it("falls back to s3 media when a payload omits the thumbnail entirely", () => {
    // /api/videos caches its mapped list in Redis as JSON and re-parses it, so a
    // stale or malformed entry can arrive without the field the type declares.
    // The guard is a truthiness check rather than `=== ""` precisely so this
    // takes the same branch — next/image throws on undefined too.
    const fromCache: VideoRecord = JSON.parse(
      JSON.stringify({ ...VIDEO, thumbnail: undefined }),
    );

    expect(toVideoItem(fromCache).media).toEqual({ kind: "s3", key: null });
  });
});

describe("content timestamps", () => {
  it("formats the date identically regardless of host timezone", () => {
    // The regression this block exists to prevent. 00:30 UTC on March 14 is
    // still March 13 in US Pacific, so a bare `toLocaleDateString()` — what the
    // deleted archive lists called — renders "3/13/2026" on a machine set to
    // that zone and "3/14/2026" on a UTC one. Pinning the formatter's locale and
    // timeZone (in contentDetail.formatDate, shared with the detail pages) is
    // what makes this exact string assertable at all.
    expect(
      toVideoItem({ ...VIDEO, publishedAt: "2026-03-14T00:30:00.000Z" })
        .timestamp,
    ).toEqual({ iso: "2026-03-14T00:30:00.000Z", label: "March 14, 2026" });
  });

  it("formats the last instant of a UTC day without rolling into the next", () => {
    expect(
      toVideoItem({ ...VIDEO, publishedAt: "2026-12-31T23:59:59.000Z" })
        .timestamp?.label,
    ).toBe("December 31, 2026");
  });

  it("pairs a machine-readable instant with every label", () => {
    // The two halves are rendered together as <time dateTime={iso}>{label}</time>
    // and have to describe the same instant; `iso` is re-serialized rather than
    // echoed so a looser-but-parseable wire spelling still yields a valid
    // `dateTime` attribute.
    expect(
      toBlogItem({ ...BLOG, createdAt: "2026-01-02" }, null).timestamp,
    ).toEqual({ iso: "2026-01-02T00:00:00.000Z", label: "January 2, 2026" });
  });

  it("omits the timestamp entirely on an unparseable or absent date", () => {
    // Intl.DateTimeFormat.format throws a RangeError on an invalid date, which
    // would fail the render the same way an empty image src does. The fallback is
    // an omitted field, not an empty label and not an invented date: a row drops
    // its <time> element rather than emitting one that says nothing.
    expect(
      toVideoItem({ ...VIDEO, publishedAt: "" }).timestamp,
    ).toBeUndefined();
    expect(
      toVideoItem({ ...VIDEO, publishedAt: "not a date" }).timestamp,
    ).toBeUndefined();
    expect(
      toBlogItem({ ...BLOG, createdAt: undefined }, null).timestamp,
    ).toBeUndefined();
    expect(
      toRecipeItem({ ...RECIPE, createdAt: "not a date" }, null).timestamp,
    ).toBeUndefined();
  });
});
