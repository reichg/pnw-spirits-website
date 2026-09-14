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

import type { RecipeInstructionStep } from "./recipeContent.types";
import { parseRecipeContent } from "./recipeContentService";

const PHOTO_KEY = "recipe-media/recipe-content-media/IMG_4821.jpg";
const signedFor = (key: string) =>
  `https://pnw-bucket.s3.us-west-2.amazonaws.com/${key}?X-Amz-Signature=abc`;

/** Parse instructions alone; ingredients are exercised separately. */
const steps = async (instructions: string): Promise<RecipeInstructionStep[]> =>
  (await parseRecipeContent({ ingredients: "", instructions })).steps;

const ingredientsOf = async (ingredients: string): Promise<string[]> =>
  (await parseRecipeContent({ ingredients, instructions: "" })).ingredients;

const textOf = (parsed: RecipeInstructionStep[]): string[] =>
  parsed.filter((step) => step.kind === "text").map((step) => step.text);

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedFor(key));
});

describe("ingredient parsing", () => {
  it("splits on newlines", async () => {
    await expect(ingredientsOf("2 oz rye\n0.75 oz vermouth")).resolves.toEqual([
      "2 oz rye",
      "0.75 oz vermouth",
    ]);
  });

  it("keeps a comma inside a newline-delimited line as content", async () => {
    // The live bug. Comma-qualified ingredients are ordinary cocktail phrasing,
    // and the old `\r?\n|,` rule split inside the line.
    await expect(
      ingredientsOf("2 oz gin\n1 egg white\nFir tip, for garnish"),
    ).resolves.toEqual(["2 oz gin", "1 egg white", "Fir tip, for garnish"]);
  });

  it("documents the behaviour that replaced: the old rule split here", async () => {
    // Pinned so the regression is visible if the line-count guard is removed.
    const value = "2 oz gin\nFir tip, for garnish";
    const old = value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    expect(old).toEqual(["2 oz gin", "Fir tip", "for garnish"]);
    await expect(ingredientsOf(value)).resolves.not.toEqual(old);
  });

  it("still splits a single-line legacy value on commas", async () => {
    // The only delimiter such a value has; nothing else can turn it into a list.
    await expect(
      ingredientsOf("2 oz rye, 0.75 oz vermouth, 2 dashes bitters"),
    ).resolves.toEqual(["2 oz rye", "0.75 oz vermouth", "2 dashes bitters"]);
  });

  it("comma-splits a single-line value that ends in a trailing newline", async () => {
    // A textarea routinely leaves one behind. Testing for the mere presence of
    // a newline would read this as a multi-line list and stop splitting it.
    await expect(ingredientsOf("2 oz rye, ice\n\n")).resolves.toEqual([
      "2 oz rye",
      "ice",
    ]);
  });

  it("keeps a comma-free single line as one ingredient", async () => {
    await expect(ingredientsOf("2 oz rye")).resolves.toEqual(["2 oz rye"]);
  });

  it("handles CRLF line endings", async () => {
    await expect(ingredientsOf("2 oz rye\r\nice")).resolves.toEqual([
      "2 oz rye",
      "ice",
    ]);
  });

  it("drops empty and whitespace-only lines", async () => {
    await expect(ingredientsOf("a\n\n   \nb\n")).resolves.toEqual(["a", "b"]);
  });

  it("drops empty entries inside a single-line comma list", async () => {
    await expect(ingredientsOf(",,a,  ,b,")).resolves.toEqual(["a", "b"]);
  });

  it("returns an empty list for empty content", async () => {
    await expect(ingredientsOf("")).resolves.toEqual([]);
  });
});

describe("instruction text parsing", () => {
  it("splits on newlines and numbers the steps in reading order", async () => {
    await expect(steps("Stir\nStrain\nGarnish")).resolves.toEqual([
      { kind: "text", number: 1, text: "Stir" },
      { kind: "text", number: 2, text: "Strain" },
      { kind: "text", number: 3, text: "Garnish" },
    ]);
  });

  it("splits a single line written as a numbered list", async () => {
    expect(textOf(await steps("1. Stir 2. Strain 3. Garnish"))).toEqual([
      "Stir",
      "Strain",
      "Garnish",
    ]);
  });

  it("still splits a 'Step 1.' style marker, as before", async () => {
    // Preserved quirk: the word before the marker becomes its own fragment.
    // Real stored data is written this way, so changing it would resegment
    // existing recipes.
    expect(textOf(await steps("Step 1. Stir Step 2. Strain"))).toEqual([
      "Step",
      "Stir Step",
      "Strain",
    ]);
  });

  it("drops empty and whitespace-only steps", async () => {
    expect(textOf(await steps("Stir\n\n   \n\nStrain"))).toEqual([
      "Stir",
      "Strain",
    ]);
  });

  it("handles CRLF line endings", async () => {
    expect(textOf(await steps("Stir\r\nStrain"))).toEqual(["Stir", "Strain"]);
  });

  it("returns no steps for empty content", async () => {
    await expect(steps("")).resolves.toEqual([]);
  });
});

describe("numeric markers inside instruction text", () => {
  it("no longer splits a decimal measurement mid-number", async () => {
    // Previously `\d+\.` matched inside "1.5", turning one instruction into
    // "Add" and "5 oz rye to the mixing glass" — two broken steps on a page
    // full of measurements.
    expect(textOf(await steps("Add 1.5 oz rye to the mixing glass"))).toEqual([
      "Add 1.5 oz rye to the mixing glass",
    ]);
  });

  it("documents the behaviour that replaced: the old rule split here", async () => {
    // Pinned so the regression is visible if the guards are ever removed.
    const old = "Add 1.5 oz rye to the mixing glass"
      .split(/\r?\n|\d+\./)
      .map((part) => part.trim())
      .filter(Boolean);

    expect(old).toEqual(["Add", "5 oz rye to the mixing glass"]);
    expect(
      textOf(await steps("Add 1.5 oz rye to the mixing glass")),
    ).not.toEqual(old);
  });

  it("does not split a version or model number glued to a word", async () => {
    expect(textOf(await steps("Use the v2.0 jigger"))).toEqual([
      "Use the v2.0 jigger",
    ]);
  });

  it("still splits a standalone marker at the end of the text", async () => {
    expect(textOf(await steps("Stir well 2."))).toEqual(["Stir well"]);
  });
});

describe("instruction photos", () => {
  it("returns a photo as an image step carrying its key, alt and signed URL", async () => {
    await expect(steps(`![Straining](${PHOTO_KEY})`)).resolves.toEqual([
      {
        kind: "image",
        s3Key: PHOTO_KEY,
        alt: "Straining",
        signedUrl: signedFor(PHOTO_KEY),
      },
    ]);
  });

  it("keys whose filename contains digits survive segmentation intact", async () => {
    // The bug this guards: "IMG_4821.jpg" matched the old numeric-marker split,
    // tearing the token into "![image](.../IMG_4821" and "jpg)" — so the photo
    // rendered as literal markdown text instead of an image.
    const parsed = await steps(`Stir\n![image](${PHOTO_KEY})\nStrain`);

    expect(parsed).toEqual([
      { kind: "text", number: 1, text: "Stir" },
      {
        kind: "image",
        s3Key: PHOTO_KEY,
        alt: "Instruction image",
        signedUrl: signedFor(PHOTO_KEY),
      },
      { kind: "text", number: 2, text: "Strain" },
    ]);
  });

  it("keys whose filename contains parentheses survive intact", async () => {
    // "IMG(1).jpg" is what Windows and most browsers name a duplicate
    // download, so it reaches the editor verbatim and is spliced in as-is. A
    // flat `[^)]*` destination cut the key at that first `)`, leaving an image
    // that could never resolve.
    const key = "recipe-media/recipe-content-media/IMG(1).jpg";

    await expect(steps(`![image](${key})`)).resolves.toEqual([
      {
        kind: "image",
        s3Key: key,
        alt: "Instruction image",
        signedUrl: signedFor(key),
      },
    ]);
  });

  it("strands no tail text beside a parenthesised photo", async () => {
    // The other half of the same truncation: everything past the cut — ".jpg)"
    // — stayed in the surrounding prose and rendered as its own step.
    const key = "recipe-media/recipe-content-media/IMG(1).jpg";

    const parsed = await steps(`Stir\n![image](${key})\nStrain`);

    expect(textOf(parsed)).toEqual(["Stir", "Strain"]);
  });

  it("does not let a photo consume a step number", async () => {
    const parsed = await steps(`Stir\n![a](${PHOTO_KEY})\nStrain\nGarnish`);

    expect(
      parsed.filter((step) => step.kind === "text").map((step) => step.number),
    ).toEqual([1, 2, 3]);
  });

  it("falls back to a default alt when the token has none", async () => {
    const parsed = await steps(`![](${PHOTO_KEY})`);

    expect(parsed[0]).toMatchObject({
      kind: "image",
      alt: "Instruction image",
    });
  });

  it.each(["image", "Image", "  IMAGE  "])(
    "treats the editor's hardcoded %o placeholder as no alt at all",
    async (alt) => {
      // AdminRecipeEditor splices in `![image](key)` verbatim, so every stored
      // photo carries a non-empty alt that says nothing. Repaired on read
      // because the stored rows cannot be repaired by fixing the editor.
      const parsed = await steps(`![${alt}](${PHOTO_KEY})`);

      expect(parsed[0]).toMatchObject({
        kind: "image",
        alt: "Instruction image",
      });
    },
  );

  it("keeps authored alt text that merely contains the word image", async () => {
    const parsed = await steps(`![Straining image](${PHOTO_KEY})`);

    expect(parsed[0]).toMatchObject({ alt: "Straining image" });
  });

  it("lifts a photo spliced into the middle of a line out of the text", async () => {
    // The editor inserts at the cursor, so a photo need not be on its own line.
    const parsed = await steps(`Stir gently ![a](${PHOTO_KEY}) until chilled`);

    expect(parsed).toEqual([
      { kind: "text", number: 1, text: "Stir gently" },
      {
        kind: "image",
        s3Key: PHOTO_KEY,
        alt: "a",
        signedUrl: signedFor(PHOTO_KEY),
      },
      { kind: "text", number: 2, text: "until chilled" },
    ]);
  });

  it("drops a token with no key, which could never resolve to an image", async () => {
    await expect(steps("![alt]()")).resolves.toEqual([]);
  });

  it("resolves several photos concurrently", async () => {
    const resolvers = new Map<string, (url: string) => void>();
    getS3ImageUrl.mockImplementation(
      (key: string) =>
        new Promise<string>((resolve) => resolvers.set(key, resolve)),
    );
    const keys = ["recipe-media/a.jpg", "recipe-media/b.jpg"];

    const parsed = steps(keys.map((key) => `![x](${key})`).join("\n"));
    await vi.waitFor(() =>
      expect(getS3ImageUrl).toHaveBeenCalledTimes(keys.length),
    );
    for (const key of keys) resolvers.get(key)?.(signedFor(key));

    expect(
      (await parsed).map((step) => step.kind === "image" && step.signedUrl),
    ).toEqual(keys.map(signedFor));
  });

  it("numbers text steps in reading order even when signing resolves out of order", async () => {
    const resolvers = new Map<string, (url: string) => void>();
    getS3ImageUrl.mockImplementation(
      (key: string) =>
        new Promise<string>((resolve) => resolvers.set(key, resolve)),
    );

    const parsed = steps(
      "Stir\n![a](recipe-media/a.jpg)\nStrain\n![b](recipe-media/b.jpg)\nGarnish",
    );
    await vi.waitFor(() => expect(getS3ImageUrl).toHaveBeenCalledTimes(2));
    resolvers.get("recipe-media/b.jpg")?.(signedFor("recipe-media/b.jpg"));
    resolvers.get("recipe-media/a.jpg")?.(signedFor("recipe-media/a.jpg"));

    expect(await parsed).toEqual([
      { kind: "text", number: 1, text: "Stir" },
      {
        kind: "image",
        s3Key: "recipe-media/a.jpg",
        alt: "a",
        signedUrl: signedFor("recipe-media/a.jpg"),
      },
      { kind: "text", number: 2, text: "Strain" },
      {
        kind: "image",
        s3Key: "recipe-media/b.jpg",
        alt: "b",
        signedUrl: signedFor("recipe-media/b.jpg"),
      },
      { kind: "text", number: 3, text: "Garnish" },
    ]);
  });
});

describe("instruction photo signing failures", () => {
  it.each([
    ["the signer echoes the raw key back", (key: string) => key],
    ["the signer resolves nothing", () => undefined],
  ])("keeps the raw key with a null URL when %s", async (_label, signer) => {
    getS3ImageUrl.mockImplementation(async (key: string) => signer(key));

    await expect(steps(`![a](${PHOTO_KEY})`)).resolves.toEqual([
      { kind: "image", s3Key: PHOTO_KEY, alt: "a", signedUrl: null },
    ]);
  });

  it("keeps the raw key with a null URL when the signer throws", async () => {
    // The page falls back to the client-side resolver; a signer fault must not
    // become a 500.
    getS3ImageUrl.mockRejectedValue(new Error("credential provider failed"));

    await expect(steps(`![a](${PHOTO_KEY})`)).resolves.toEqual([
      { kind: "image", s3Key: PHOTO_KEY, alt: "a", signedUrl: null },
    ]);
  });

  it("still signs when the cache read faults", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));

    await expect(steps(`![a](${PHOTO_KEY})`)).resolves.toEqual([
      {
        kind: "image",
        s3Key: PHOTO_KEY,
        alt: "a",
        signedUrl: signedFor(PHOTO_KEY),
      },
    ]);
  });

  it("degrades one unsignable photo without affecting its sibling", async () => {
    getS3ImageUrl.mockImplementation(async (key: string) =>
      key === "recipe-media/b.jpg" ? key : signedFor(key),
    );

    const parsed = await steps(
      "![a](recipe-media/a.jpg)\n![b](recipe-media/b.jpg)",
    );

    expect(
      parsed.map((step) => step.kind === "image" && step.signedUrl),
    ).toEqual([signedFor("recipe-media/a.jpg"), null]);
  });

  it("never signs anything for a recipe with no photos", async () => {
    await steps("Stir\nStrain");

    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});

describe("derived stats", () => {
  it("counts ingredients and text steps, excluding photos", async () => {
    const { stats } = await parseRecipeContent({
      ingredients: "2 oz rye\n0.75 oz vermouth\n2 dashes bitters",
      instructions: `Stir\n![a](${PHOTO_KEY})\nStrain`,
    });

    expect(stats).toEqual({ ingredientCount: 3, stepCount: 2 });
  });

  it("does not let a comma-qualified ingredient inflate the count", async () => {
    // The seeded Douglas-Fir Gin Fizz, verbatim: six ingredients, the last one
    // comma-qualified. It reported seven.
    const { ingredients, stats } = await parseRecipeContent({
      ingredients: [
        "2 oz Douglas-fir gin",
        "0.75 oz fresh lemon juice",
        "0.5 oz simple syrup",
        "1 egg white",
        "2 oz chilled soda water",
        "Fir tip, for garnish",
      ].join("\n"),
      instructions: "",
    });

    expect(ingredients).toHaveLength(6);
    expect(stats.ingredientCount).toBe(6);
  });

  it("reports zeroes for empty content", async () => {
    const {
      stats,
      ingredients,
      steps: parsed,
    } = await parseRecipeContent({
      ingredients: "   ",
      instructions: "\n\n",
    });

    expect(stats).toEqual({ ingredientCount: 0, stepCount: 0 });
    expect(ingredients).toEqual([]);
    expect(parsed).toEqual([]);
  });

  it("counts no steps for a recipe that is only photos", async () => {
    const { stats } = await parseRecipeContent({
      ingredients: "rye",
      instructions: `![a](${PHOTO_KEY})`,
    });

    expect(stats).toEqual({ ingredientCount: 1, stepCount: 0 });
  });
});
