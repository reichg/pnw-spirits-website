import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { prismaMock, getS3ImageUrl, redisMock } = vi.hoisted(() => {
  // Set before the page module is imported: `@/utils/contentDetail` reads the
  // origin at module scope, and every canonical/Open Graph/JSON-LD URL below is
  // built from it.
  process.env.NEXT_PUBLIC_SITE_URL = "https://spirits.example";
  return {
    prismaMock: { cocktailRecipe: { findUnique: vi.fn() } },
    getS3ImageUrl: vi.fn(),
    redisMock: { get: vi.fn(), set: vi.fn() },
  };
});

// Mocked at the primitives — the database client, the S3 signer, Redis — rather
// than at the services between them, so `parseRecipeContent` and
// `getSignedImageUrl` run for real and this exercises the page's actual
// contract with them.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import RecipeDetailPage, { generateMetadata } from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// Vitest runs in the "node" environment here with no jsdom and no
// @testing-library/react (vitest.config.ts); adding either is a dependency
// change and out of scope. The page is an async server component, so it is
// awaited directly and the element it returns is rendered with
// renderToStaticMarkup — the same approach as recipes-landing/page.test.tsx.
// That observes the whole server-rendered contract: cover photos and step
// photos are signed on the server, so the imagery ships in this HTML.
//
// The one thing static render cannot show is the post-hydration state of the
// unsigned fallbacks (S3InstructionImage, S3CardBackgroundImage). Both are
// "use client" and return null until an effect resolves a signed URL, so under
// static render they emit nothing. That is asserted below as what actually
// happens — and it is production's first paint too — rather than papered over.
//
// Class names are hashed by the CSS-modules transform and are not a contract:
// elements are identified by tag, text and attribute.

type RecipeRow = {
  id: number;
  title: string;
  author: string;
  description: string;
  ingredients: string;
  instructions: string;
  coverPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CREATED_AT = new Date("2026-07-06T05:36:00.000Z");

const RECIPE: RecipeRow = {
  id: 7,
  title: "Spruce Tip Gimlet",
  author: "Jane Doe",
  description: "Gin, lime, and a spruce tip syrup cut with Douglas fir.",
  ingredients: "2 oz gin\n0.75 oz lime\nFir tip, for garnish",
  instructions: "Shake hard over ice.\nDouble strain into a coupe.",
  coverPhoto: "recipes/7.jpg",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

/** Shaped like a real presigned URL, including the params the signer adds. */
function signedUrlFor(key: string): string {
  return `https://pnw-spirits.s3.us-west-1.amazonaws.com/${key}?X-Amz-Expires=3600&X-Amz-Signature=abc`;
}

function stubRecipe(overrides: Partial<RecipeRow> = {}): RecipeRow {
  const recipe = { ...RECIPE, ...overrides };
  prismaMock.cocktailRecipe.findUnique.mockResolvedValue(recipe);
  return recipe;
}

async function renderPage(id = "7"): Promise<string> {
  return renderToStaticMarkup(
    await RecipeDetailPage({ params: Promise.resolve({ id }) }),
  );
}

function metadataFor(id = "7") {
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

/**
 * The <ol> carrying the numbered method, or "" when the page renders none.
 * Scoped deliberately: the byline and the ingredients are <li>s too, so a
 * whole-page count of them says nothing about the step list.
 */
function methodList(html: string): string {
  const start = html.indexOf("<ol");
  if (start === -1) return "";
  return html.slice(start, html.indexOf("</ol>"));
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedUrlFor(key));
});

describe("RecipeDetailPage routing", () => {
  it("404s on a non-numeric id without querying the database", async () => {
    // The guard runs before Prisma, so a crawler walking /recipes/<junk> costs
    // no query. Asserting the absent call is the half that would regress
    // silently: a page that 404s *after* the round trip still looks correct.
    await expect(renderPage("not-a-number")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(prismaMock.cocktailRecipe.findUnique).not.toHaveBeenCalled();
  });

  it.each(["0", "-3"])("404s on the non-positive id %s", async (id) => {
    await expect(renderPage(id)).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(prismaMock.cocktailRecipe.findUnique).not.toHaveBeenCalled();
  });

  it("404s when the id parses but no row exists", async () => {
    prismaMock.cocktailRecipe.findUnique.mockResolvedValue(null);

    await expect(renderPage("999")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(prismaMock.cocktailRecipe.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
    });
  });

  it("builds canonical URLs from the row id, not from the request param", async () => {
    // The id parse is lenient, so more than one path can reach the same row:
    // "/recipes/007", "/recipes/7.9" and "/recipes/7abc" all return 200
    // rendering row 7. Every self-referential URL the page emits — the
    // canonical link, og:url and the JSON-LD mainEntityOfPage — must name the
    // row's own id and must agree with each other, or each variant declares
    // itself a distinct page for the same recipe.
    stubRecipe();

    const html = await renderPage("007");
    const metadata = await metadataFor("007");

    expect(metadata.alternates?.canonical).toBe(
      "https://spirits.example/recipes/7",
    );
    expect(metadata.openGraph?.url).toBe("https://spirits.example/recipes/7");
    expect(jsonLd(html).mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://spirits.example/recipes/7",
    });
  });
});

describe("RecipeDetailPage metadata", () => {
  it("never emits a signed S3 URL as a social image", async () => {
    // Established by security review: a presigned URL expires in an hour, and a
    // crawler refetches an og:image days later. The image then 404s with no
    // error surfaced anywhere and the shared card renders blank. The stable
    // /api/media path re-signs per request, so it never goes stale.
    stubRecipe();

    const metadata = await metadataFor();
    const serialized = JSON.stringify(metadata);

    expect(serialized).not.toContain("X-Amz-");
    expect(serialized).not.toContain("amazonaws.com");
    expect(metadata.openGraph?.images).toEqual([
      "https://spirits.example/api/media?key=recipes%2F7.jpg",
    ]);
    expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images);
    // Stronger than inspecting the output: metadata never reaches the signer at
    // all, so there is no signed URL available for a future edit to reach for.
    expect(getS3ImageUrl).not.toHaveBeenCalled();
  });

  it("omits images entirely when the recipe has no cover", async () => {
    // `undefined`, not an empty array: an empty og:image array still emits the
    // property and tells a crawler the article has imagery it cannot find.
    stubRecipe({ coverPhoto: null });

    const metadata = await metadataFor();

    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter?.images).toBeUndefined();
  });

  it("passes the authored description through verbatim", async () => {
    // Deliberately unlike /blogs/[id], which derives and clips one from the
    // body. `description` here is an author-written short field, and clipping
    // an authored sentence to a character budget reads worse than the sentence.
    stubRecipe();

    const metadata = await metadataFor();

    expect(metadata.description).toBe(RECIPE.description);
    expect(metadata.description).not.toContain("…");
  });

  it("returns a not-found title instead of throwing when the row is gone", async () => {
    // generateMetadata runs before the page body, so a throw here is a 500 on
    // what must be a 404.
    prismaMock.cocktailRecipe.findUnique.mockResolvedValue(null);

    await expect(metadataFor("999")).resolves.toEqual({
      title: "Recipe not found | The PNW Spirits",
    });
  });
});

describe("RecipeDetailPage JSON-LD", () => {
  it("escapes < so a title cannot break out of the script block", async () => {
    // Verified by security review, and flagged there as the kind of defence a
    // refactor disables while looking identical: collapsing the replacement's
    // "\\u003c" to "<" makes it a literal "<" and turns the whole pass
    // into a no-op. The three assertions are what distinguish the two — no raw
    // "<" survives, the escape sequence is present, and the content still
    // round-trips through JSON.parse rather than being mangled.
    const recipe = stubRecipe({
      title: "Break</script><script>alert(1)</script> Out",
    });

    const html = await renderPage();
    const source = jsonLdSource(html) as string;

    expect(source).not.toContain("<");
    expect(source).toContain("\\u003c");
    expect(JSON.parse(source).name).toBe(recipe.title);
  });

  it("omits the block entirely when there is no cover photo", async () => {
    // schema.org Recipe requires `image`. Without a cover there is nothing
    // valid to emit, and an incomplete block is worse than none: Search Console
    // reports it as an error against the page.
    stubRecipe({ coverPhoto: null });

    const html = await renderPage();

    expect(jsonLdSource(html)).toBeNull();
    expect(html).not.toContain("application/ld+json");
  });

  it("points image at the stable media URL, never at a signed one", async () => {
    stubRecipe();

    const source = jsonLdSource(await renderPage()) as string;

    expect(JSON.parse(source).image).toEqual([
      "https://spirits.example/api/media?key=recipes%2F7.jpg",
    ]);
    expect(source).not.toContain("X-Amz-");
  });

  it("omits every property no column backs", async () => {
    // Publishing invented times, yields and ratings to win a rich-result
    // carousel was explicitly rejected. These must stay absent rather than
    // being emitted as "" or 0, which is what a well-meaning "fill in the
    // schema" change produces and which reads as real data to a consumer.
    stubRecipe();

    const block = jsonLd(await renderPage());

    for (const property of [
      "prepTime",
      "cookTime",
      "totalTime",
      "recipeYield",
      "recipeCategory",
      "nutrition",
      "aggregateRating",
    ]) {
      expect(block).not.toHaveProperty(property);
    }
  });

  it("carries the ingredients and the text steps, and only the text steps", async () => {
    stubRecipe({
      instructions:
        "Shake hard over ice.\n![image](recipes/step-1.jpg)\nDouble strain into a coupe.",
    });

    const block = jsonLd(await renderPage());

    expect(block.recipeIngredient).toEqual([
      "2 oz gin",
      "0.75 oz lime",
      "Fir tip, for garnish",
    ]);
    expect(block.recipeInstructions).toEqual([
      { "@type": "HowToStep", text: "Shake hard over ice." },
      { "@type": "HowToStep", text: "Double strain into a coupe." },
    ]);
  });

  it("omits the recipe arrays when the recipe has no body", async () => {
    stubRecipe({ ingredients: "", instructions: "" });

    const block = jsonLd(await renderPage());

    expect(block).not.toHaveProperty("recipeIngredient");
    expect(block).not.toHaveProperty("recipeInstructions");
  });
});

describe("RecipeDetailPage method grouping", () => {
  // The regrouping the page does over the service's flat step list. The method
  // is a real <ol>, so only text steps may be list items: a photo that consumed
  // an index would desynchronise the announced count from the numerals on
  // screen and from the number the service assigned.

  it("renders a photo placed before step 1 above the list, not inside it", async () => {
    // It has no step to attach to. Rendering it as the first <li> would make
    // the list announce one more step than the recipe has.
    stubRecipe({
      instructions: "![image](recipes/lead.jpg)\nShake hard over ice.",
    });

    const html = await renderPage();

    expect(countTags(methodList(html), "li")).toBe(1);
    expect(countTags(methodList(html), "img")).toBe(0);
    expect(html.indexOf("recipes%2Flead.jpg")).toBeLessThan(
      html.indexOf("<ol"),
    );
  });

  it("renders a photo placed after a step inside that step", async () => {
    stubRecipe({
      instructions:
        "Shake hard over ice.\n![image](recipes/step-1.jpg)\nDouble strain into a coupe.",
    });

    const items = methodList(await renderPage())
      .split("<li ")
      .slice(1);

    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Shake hard over ice.");
    expect(items[0]).toContain("recipes%2Fstep-1.jpg");
    expect(items[1]).toContain("Double strain into a coupe.");
    expect(items[1]).not.toContain("recipes%2Fstep-1.jpg");
  });

  it("numbers the text steps consecutively however many photos are interleaved", async () => {
    // The numeral is printed from the service's `number`, not from the list's
    // own counter, so this is the assertion that catches a photo being counted.
    stubRecipe({
      instructions: [
        "![image](recipes/lead.jpg)",
        "Muddle the fir tips.",
        "![image](recipes/a.jpg)",
        "![image](recipes/b.jpg)",
        "Shake hard over ice.",
        "Double strain into a coupe.",
      ].join("\n"),
    });

    const html = await renderPage();
    const numerals = [
      ...methodList(html).matchAll(/aria-hidden="true">(\d+)<\/span>/g),
    ].map((match) => match[1]);

    expect(countTags(methodList(html), "li")).toBe(3);
    expect(numerals).toEqual(["1", "2", "3"]);
    // Every photo still renders; they are placed, not dropped.
    expect(countTags(html, "img")).toBe(3 + 1); // three step photos + the cover
  });

  it("counts steps and ingredients in the byline without counting photos", async () => {
    stubRecipe({
      ingredients: "2 oz gin",
      instructions: "Stir.\n![image](recipes/a.jpg)",
    });

    const html = await renderPage();

    expect(html).toContain("<li>1 Ingredient</li>");
    expect(html).toContain("<li>1 Step</li>");
    expect(html).not.toContain("2 Steps");
  });
});

describe("RecipeDetailPage cover photo", () => {
  it("renders a server-signed cover as a real <img> in the SSR HTML", async () => {
    stubRecipe();

    const html = await renderPage();

    expect(getS3ImageUrl).toHaveBeenCalledWith("recipes/7.jpg");
    expect(countTags(html, "img")).toBe(1);
    expect(html).toContain(encodeURIComponent(signedUrlFor("recipes/7.jpg")));
    expect(html).toContain('alt="Cover image for Spruce Tip Gimlet"');
    // The LCP preload only exists because the src was resolved before the HTML
    // was produced rather than after hydration.
    expect(html).toContain('rel="preload"');
  });

  it("drops the media column entirely when there is no cover", async () => {
    // Rather than reserving an empty square: the lede then runs the full spine.
    stubRecipe({ coverPhoto: null });

    const html = await renderPage();

    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(countTags(html, "img")).toBe(0);
    expect(html).not.toContain('rel="preload"');
    expect(html).toContain(RECIPE.description);
  });

  it("degrades to the client fallback when the cover cannot be signed", async () => {
    // The signer echoes its input back when the AWS env vars are missing. That
    // raw key is not a URL: handing it to next/image throws "Failed to parse
    // src" and takes the whole page down, so the contract is that the page
    // still renders and the key never reaches the markup.
    stubRecipe();
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(0);
    expect(html).not.toContain("recipes/7.jpg");
    expect(html).toContain("<h1");
    expect(html).toContain("Spruce Tip Gimlet");
    // The social image is built from the stored key, not from the signer, so it
    // survives a signing outage.
    expect(jsonLd(html).image).toEqual([
      "https://spirits.example/api/media?key=recipes%2F7.jpg",
    ]);
  });

  it("keeps rendering when the signer throws", async () => {
    stubRecipe();
    getS3ImageUrl.mockRejectedValue(new Error("credential provider failed"));

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(0);
    expect(html).toContain("Spruce Tip Gimlet");
  });
});

describe("RecipeDetailPage step photo fallback", () => {
  // S3InstructionImage is "use client" and resolves its URL in an effect, so a
  // direct render of it observes only "returns null", which tests the stub
  // rather than the component. The behaviour worth pinning is the page's: an
  // unsignable step photo must route to the fallback, and the step it
  // illustrates must survive intact.

  it("renders the step without an image when its photo cannot be signed", async () => {
    stubRecipe({
      instructions: "Shake hard over ice.\n![image](recipes/step-1.jpg)",
    });
    // Only the step photo fails, so the cover proves the page is otherwise
    // rendering imagery normally.
    getS3ImageUrl.mockImplementation(async (key: string) =>
      key === "recipes/step-1.jpg" ? key : signedUrlFor(key),
    );

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(1); // the cover only
    expect(html).toContain("Shake hard over ice.");
    expect(countTags(methodList(html), "li")).toBe(1);
    // The raw key must not leak into an src: that is the crash this guards.
    expect(html).not.toContain("recipes/step-1.jpg");
    expect(html).not.toContain("recipes%2Fstep-1.jpg");
  });
});

describe("RecipeDetailPage empty body", () => {
  it("shows the empty message when there are no ingredients and no steps", async () => {
    stubRecipe({ ingredients: "", instructions: "" });

    const html = await renderPage();

    expect(html).toContain("written up yet");
    expect(countTags(html, "h2")).toBe(0);
    expect(countTags(html, "ol")).toBe(0);
    // The page keeps its identity and its way out even with no body.
    expect(html).toContain("<h1");
    expect(html).toContain("Spruce Tip Gimlet");
    expect(html).toContain('href="/recipes-landing"');
  });

  it("hides the empty message as soon as there is any body at all", async () => {
    stubRecipe({ ingredients: "2 oz gin", instructions: "" });

    expect(await renderPage()).not.toContain("written up yet");
  });
});

describe("RecipeDetailPage date", () => {
  it("prints the same calendar day in the time element's text and attribute", async () => {
    // The two disagreed by a day before the shared formatter pinned UTC; 05:36Z
    // is the previous day in every US timezone. `contentDetail.test.ts` pins
    // the formatter itself — this pins that the page puts both halves on the
    // same element.
    stubRecipe();

    const html = await renderPage();

    expect(html).toContain(
      '<time dateTime="2026-07-06T05:36:00.000Z">July 6, 2026</time>',
    );
  });
});
