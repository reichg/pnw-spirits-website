import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { prismaMock, getS3ImageUrl, redisMock } = vi.hoisted(() => {
  // Set before the page module is imported: `@/utils/contentDetail` reads the
  // origin at module scope, and every canonical/Open Graph/JSON-LD URL below is
  // built from it.
  process.env.NEXT_PUBLIC_SITE_URL = "https://spirits.example";
  return {
    prismaMock: { blog: { findUnique: vi.fn() } },
    getS3ImageUrl: vi.fn(),
    redisMock: { get: vi.fn(), set: vi.fn() },
  };
});

// Mocked at the primitives — the database client, the S3 signer, Redis — rather
// than at the services between them, so `renderBlogMarkdown` (including its
// sanitizing renderer) and `getSignedImageUrl` run for real.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import BlogPostPage, { generateMetadata } from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// Vitest runs in the "node" environment here with no jsdom and no
// @testing-library/react (vitest.config.ts); adding either is a dependency
// change and out of scope. The page is an async server component, so it is
// awaited directly and the element it returns is rendered with
// renderToStaticMarkup — the same approach as recipes-landing/page.test.tsx.
// Nothing on this page resolves after hydration: the cover is signed on the
// server and the prose is a finished HTML string, so static render observes the
// whole shipped contract.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists anyway - see the canonical note in
// Pagination.test.tsx.
// Elements are identified by tag, text and attribute.

type BlogRow = {
  id: number;
  title: string;
  author: string;
  content: string;
  coverPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CREATED_AT = new Date("2026-07-06T05:36:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const BLOG: BlogRow = {
  id: 4,
  title: "Aging in Oregon Oak",
  author: "Ana Reyes",
  content: "## Barrels\n\nThe staves come from a mill outside Eugene.",
  coverPhoto: "blogs/4.jpg",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

/** Shaped like a real presigned URL, including the params the signer adds. */
function signedUrlFor(key: string): string {
  return `https://pnw-spirits.s3.us-west-1.amazonaws.com/${key}?X-Amz-Expires=3600&X-Amz-Signature=abc`;
}

function stubBlog(overrides: Partial<BlogRow> = {}): BlogRow {
  const blog = { ...BLOG, ...overrides };
  prismaMock.blog.findUnique.mockResolvedValue(blog);
  return blog;
}

async function renderPage(id = "4"): Promise<string> {
  return renderToStaticMarkup(
    await BlogPostPage({ params: Promise.resolve({ id }) }),
  );
}

function metadataFor(id = "4") {
  return generateMetadata({ params: Promise.resolve({ id }) });
}

/** The raw text inside the JSON-LD block, or null when the page emits none. */
function jsonLdSource(html: string): string | null {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  return match ? match[1] : null;
}

function jsonLd(html: string): Record<string, unknown> {
  const source = jsonLdSource(html);
  expect(source).not.toBeNull();
  return JSON.parse(source as string) as Record<string, unknown>;
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/**
 * The rendered markdown only. The prose block is the last thing inside
 * <article>, so everything up to the masthead's </header> is page chrome.
 */
function prose(html: string): string {
  return html.slice(html.indexOf("</header>"), html.indexOf("</article>"));
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedUrlFor(key));
});

describe("BlogPostPage routing", () => {
  it("404s on a non-numeric id without querying the database", async () => {
    // The guard runs before Prisma, so a crawler walking /blogs/<junk> costs no
    // query. Asserting the absent call is the half that would regress silently:
    // a page that 404s *after* the round trip still looks correct.
    await expect(renderPage("not-a-number")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
  });

  it.each(["0", "-3"])("404s on the non-positive id %s", async (id) => {
    await expect(renderPage(id)).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
  });

  // The guard here was `Number.parseInt` behind `isSafeInteger && > 0`, which is
  // the lenient shape the API routes were hardened away from: parseInt reads a
  // leading integer and discards the rest, so `/blogs/31.5` and `/blogs/1abc`
  // rendered post 31 and post 1 under a URL naming neither, and isSafeInteger
  // sits nine orders of magnitude above what the Int column holds. It is
  // `rowIdParamSchema` now - the sample is behavioural; the rule is asserted
  // exhaustively in src/utils/rowId.test.ts.
  it.each(["31.5", "1abc", "0x1f", "004", "3000000000"])(
    "404s on the non-canonical id %s without querying the database",
    async (id) => {
      await expect(renderPage(id)).rejects.toThrow(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );

      expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
    },
  );

  it("404s when the id parses but no row exists", async () => {
    prismaMock.blog.findUnique.mockResolvedValue(null);

    await expect(renderPage("999")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(prismaMock.blog.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
    });
  });

  it("builds canonical URLs from the row id, not from the request param", async () => {
    // Only one path reaches a row now that the parser is canonical — "/blogs/004"
    // and "/blogs/4abc" 404 rather than rendering row 4 — so this no longer
    // guards against duplicate URLs for one post. It still guards the half that
    // outlives the parser: the canonical link, og:url and the JSON-LD
    // mainEntityOfPage are each built from the row's own id and must agree.
    stubBlog();

    const html = await renderPage("4");
    const metadata = await metadataFor("4");

    expect(metadata.alternates?.canonical).toBe(
      "https://spirits.example/blogs/4",
    );
    expect(metadata.openGraph?.url).toBe("https://spirits.example/blogs/4");
    expect(jsonLd(html).mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://spirits.example/blogs/4",
    });
  });
});

describe("BlogPostPage metadata", () => {
  it("never emits a signed S3 URL as a social image", async () => {
    // Established by security review: a presigned URL expires in an hour, and a
    // crawler refetches an og:image days later. The image then 404s with no
    // error surfaced anywhere and the shared card renders blank. The stable
    // /api/media path re-signs per request, so it never goes stale.
    stubBlog();

    const metadata = await metadataFor();
    const serialized = JSON.stringify(metadata);

    expect(serialized).not.toContain("X-Amz-");
    expect(serialized).not.toContain("amazonaws.com");
    expect(metadata.openGraph?.images).toEqual([
      "https://spirits.example/api/media?key=blogs%2F4.jpg",
    ]);
    expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images);
    // Stronger than inspecting the output: metadata never reaches the signer at
    // all, so there is no signed URL available for a future edit to reach for.
    expect(getS3ImageUrl).not.toHaveBeenCalled();
  });

  it("omits images entirely when the post has no cover", async () => {
    // `undefined`, not an empty array: an empty og:image array still emits the
    // property and tells a crawler the article has imagery it cannot find.
    stubBlog({ coverPhoto: null });

    const metadata = await metadataFor();

    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter?.images).toBeUndefined();
  });

  it("derives the description from the post's own opening prose", async () => {
    stubBlog({
      content: "## Barrels\n\nThe staves come from [a mill](/mill) in Eugene.",
    });

    const metadata = await metadataFor();

    // Markdown syntax is stripped, a link keeps its text and loses its href.
    expect(metadata.description).toBe(
      "Barrels The staves come from a mill in Eugene.",
    );
  });

  it("clips a long description at a word boundary under the search budget", async () => {
    // 155 characters is a search-result budget, so the string must fit it and
    // must not end mid-word — an ellipsis after half a word reads as corruption
    // rather than as truncation.
    const sentence =
      "Oregon oak seasons for three winters before it is coopered. ";
    stubBlog({ content: sentence.repeat(6) });

    const description = (await metadataFor()).description as string;

    expect(description.length).toBeLessThanOrEqual(156);
    expect(description.endsWith("…")).toBe(true);
    expect(description.at(-2)).not.toBe(" ");
    expect(sentence.repeat(6)).toContain(description.slice(0, -1));
  });

  it("returns a not-found title instead of throwing when the row is gone", async () => {
    // generateMetadata runs before the page body, so a throw here is a 500 on
    // what must be a 404.
    prismaMock.blog.findUnique.mockResolvedValue(null);

    await expect(metadataFor("999")).resolves.toEqual({
      title: "Article not found | The PNW Spirits",
    });
  });
});

describe("BlogPostPage JSON-LD", () => {
  it("escapes < so a title cannot break out of the script block", async () => {
    // Verified by security review, and flagged there as the kind of defence a
    // refactor disables while looking identical: collapsing the replacement's
    // "\\u003c" to "<" makes it a literal "<" and turns the whole pass
    // into a no-op. The three assertions are what distinguish the two — no raw
    // "<" survives, the escape sequence is present, and the content still
    // round-trips through JSON.parse rather than being mangled.
    const blog = stubBlog({
      title: "Break</script><script>alert(1)</script> Out",
    });

    const html = await renderPage();
    const source = jsonLdSource(html) as string;

    expect(source).not.toContain("<");
    expect(source).toContain("\\u003c");
    expect(JSON.parse(source).headline).toBe(blog.title);
    // The same title in the visible heading is React's to escape, and it is.
    expect(html).toContain("Break&lt;/script&gt;");
  });

  it("emits the block even without a cover, minus the image property", async () => {
    // Unlike Recipe, BlogPosting has no required properties, so a coverless
    // post still gets a valid block rather than none.
    stubBlog({ coverPhoto: null });

    const block = jsonLd(await renderPage());

    expect(block["@type"]).toBe("BlogPosting");
    expect(block).not.toHaveProperty("image");
  });

  it("points image at the stable media URL, never at a signed one", async () => {
    stubBlog();

    const source = jsonLdSource(await renderPage()) as string;

    expect(JSON.parse(source).image).toEqual([
      "https://spirits.example/api/media?key=blogs%2F4.jpg",
    ]);
    expect(source).not.toContain("X-Amz-");
  });

  it("carries both timestamps as ISO instants", async () => {
    const updatedAt = new Date(CREATED_AT.getTime() + 3 * DAY_MS);
    stubBlog({ updatedAt });

    const block = jsonLd(await renderPage());

    expect(block.datePublished).toBe(CREATED_AT.toISOString());
    expect(block.dateModified).toBe(updatedAt.toISOString());
  });
});

describe("BlogPostPage cover photo", () => {
  it("renders a server-signed cover as a real <img> in the SSR HTML", async () => {
    stubBlog();

    const html = await renderPage();

    expect(getS3ImageUrl).toHaveBeenCalledWith("blogs/4.jpg");
    expect(countTags(html, "img")).toBe(1);
    expect(html).toContain(encodeURIComponent(signedUrlFor("blogs/4.jpg")));
    expect(html).toContain('alt="Cover image for Aging in Oregon Oak"');
    // The LCP preload only exists because the src was resolved before the HTML
    // was produced rather than after hydration.
    expect(html).toContain('rel="preload"');
  });

  it("renders no cover block at all when the post has none", async () => {
    // Rather than an empty plate: this one is a page-scale square and reserving
    // it for a photograph that never arrives is a hole in the composition.
    stubBlog({ coverPhoto: null });

    const html = await renderPage();

    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(countTags(html, "figure")).toBe(0);
    expect(countTags(html, "img")).toBe(0);
  });

  it("drops the cover block but keeps the social image when signing fails", async () => {
    // The signer echoes its input back when the AWS env vars are missing. That
    // raw key is not a URL: handing it to next/image throws "Failed to parse
    // src" and takes the whole page down. The two paths are deliberately
    // independent — the page needs a signed URL, the social image needs only
    // the stored key — so a signing outage costs the on-page photo and nothing
    // else.
    stubBlog();
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderPage();

    expect(countTags(html, "figure")).toBe(0);
    expect(countTags(html, "img")).toBe(0);
    expect(html).not.toContain("blogs/4.jpg");
    expect(html).toContain("Aging in Oregon Oak");
    expect(jsonLd(html).image).toEqual([
      "https://spirits.example/api/media?key=blogs%2F4.jpg",
    ]);
  });

  it("keeps rendering when the signer throws", async () => {
    stubBlog();
    getS3ImageUrl.mockRejectedValue(new Error("credential provider failed"));

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(0);
    expect(html).toContain("Aging in Oregon Oak");
  });
});

describe("BlogPostPage byline", () => {
  it("prints the same calendar day in the time element's text and attribute", async () => {
    // These two disagreed by a day on this page specifically: it shipped
    // without the UTC pin that /recipes/[id] already had, and 05:36Z is the
    // previous day in every US timezone. `contentDetail.test.ts` pins the
    // shared formatter — this pins that the page puts both halves on one
    // element.
    stubBlog();

    const html = await renderPage();

    expect(html).toContain(
      '<time dateTime="2026-07-06T05:36:00.000Z">July 6, 2026</time>',
    );
  });

  it("hides Updated on a post that was never revised", async () => {
    // `updatedAt` is touched by every write, so on an unrevised post it sits
    // seconds from `createdAt`. Printing both is noise, not information.
    stubBlog({ updatedAt: new Date(CREATED_AT.getTime() + 2000) });

    const html = await renderPage();

    expect(html).not.toContain("Updated");
    expect(countTags(html, "time")).toBe(1);
  });

  it("still hides Updated at exactly one day apart", async () => {
    // The comparison is strictly greater than a day; this is the boundary a
    // refactor to >= would move.
    stubBlog({ updatedAt: new Date(CREATED_AT.getTime() + DAY_MS) });

    expect(await renderPage()).not.toContain("Updated");
  });

  it("shows Updated once the post is more than a day old", async () => {
    const updatedAt = new Date(CREATED_AT.getTime() + DAY_MS + 1000);
    stubBlog({ updatedAt });

    const html = await renderPage();

    expect(countTags(html, "time")).toBe(2);
    expect(html).toContain(
      `<time dateTime="${updatedAt.toISOString()}">Updated July 7, 2026</time>`,
    );
  });

  it("renders the reading estimate for a post with prose", async () => {
    // 476 words at the stated 238 wpm is exactly two minutes, so the rendered
    // string is pinned rather than recomputed from the same constant.
    stubBlog({ content: Array.from({ length: 476 }, () => "word").join(" ") });

    expect(await renderPage()).toContain("<li>2 min read</li>");
  });

  it("omits the reading estimate for a post with no prose at all", async () => {
    // A photo-only post: "0 min read" is worse than no line.
    stubBlog({ content: "![](blog-media/a.jpg)" });

    expect(await renderPage()).not.toContain("min read");
  });
});

describe("BlogPostPage prose", () => {
  it("adds lazy-loading hints to every image in the rendered markdown", async () => {
    // Prose images arrive inside a finished HTML string, so next/image is not
    // available to them and they would otherwise be fetched eagerly even 3,000px
    // down the article.
    stubBlog({
      coverPhoto: null,
      content: "![one](blog-media/a.jpg)\n\n![two](blog-media/b.jpg)",
    });

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(2);
    expect(countOccurrences(html, 'loading="lazy"')).toBe(2);
    expect(countOccurrences(html, 'decoding="async"')).toBe(2);
  });

  it("resolves stored keys to signed URLs inside the prose", async () => {
    stubBlog({ coverPhoto: null, content: "![one](blog-media/a.jpg)" });

    const html = await renderPage();

    expect(html).toContain(`src="${signedUrlFor("blog-media/a.jpg")}"`);
  });

  it("never post-processes an image the author wrote as raw HTML", async () => {
    // A real cross-module coupling, and the reason this test exists: the lazy
    // pass is a blind string replace of "<img " in already-rendered HTML. It is
    // only safe because `renderBlogMarkdown`'s sanitizing renderer drops raw
    // HTML tokens outright (its html() returns ""), so every "<img" in the
    // string came from marked's own image renderer. Relax the sanitizer and
    // this pass silently starts decorating attacker-authored markup instead —
    // which is why the assertion counts <img> against the lazy attributes: a
    // stored raw tag surviving would show up as a third image here, not as a
    // missing attribute somewhere.
    stubBlog({
      coverPhoto: null,
      content: [
        "![real](blog-media/a.jpg)",
        "",
        '<img src="x" onerror="alert(1)">',
        "",
        '<div onclick="alert(2)">raw</div>',
      ].join("\n"),
    });

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(1);
    expect(countOccurrences(html, 'loading="lazy"')).toBe(1);
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
  });

  it("renders ordinary markdown structure into the prose block", async () => {
    stubBlog({ coverPhoto: null });

    const body = prose(await renderPage());

    expect(body).toContain("<h2>Barrels</h2>");
    expect(body).toContain("The staves come from a mill outside Eugene.");
  });
});
