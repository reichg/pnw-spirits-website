import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, authMock, s3Mock, cacheMock } = vi.hoisted(() => ({
  prismaMock: {
    cocktailRecipe: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  authMock: { requireAdmin: vi.fn() },
  s3Mock: { getS3ImageUrl: vi.fn(), deleteS3Objects: vi.fn() },
  cacheMock: { invalidateRecipeCache: vi.fn() },
}));

// Mocked at the primitives, not at the handlers, so every assertion runs
// through the route's real id parsing and authorization order.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/auth", () => authMock);
vi.mock("@/utils/s3", () => s3Mock);
vi.mock("@/utils/redisClient", () => cacheMock);
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextResponse, type NextRequest } from "next/server";
import { DELETE, GET, PUT } from "./route";

const recipeRow = {
  id: 31,
  title: "Old Fashioned",
  description: "A classic.",
  author: "PNW Spirits",
  ingredients: "Whiskey",
  instructions: "Stir",
  coverPhoto: "recipe-media/cover.jpg",
};

const validBody = {
  title: "Old Fashioned",
  description: "A classic.",
  author: "PNW Spirits",
  ingredients: "Whiskey",
  instructions: "Stir",
};

function request(body?: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  // Authorized by default; the auth test overrides this.
  authMock.requireAdmin.mockReturnValue(null);
  prismaMock.cocktailRecipe.findUnique.mockResolvedValue(recipeRow);
  prismaMock.cocktailRecipe.findMany.mockResolvedValue([]);
  prismaMock.cocktailRecipe.update.mockResolvedValue(recipeRow);
  prismaMock.cocktailRecipe.delete.mockResolvedValue(recipeRow);
  s3Mock.getS3ImageUrl.mockResolvedValue("https://signed.example/cover.jpg");
  s3Mock.deleteS3Objects.mockResolvedValue(undefined);
  cacheMock.invalidateRecipeCache.mockResolvedValue(undefined);
});

/**
 * A behavioural sample, not the rule.
 *
 * The exhaustive table lives once, beside the parser this route imports:
 * src/utils/rowId.test.ts. These three are the distinct failure modes it closes
 * - `31.5` reaching Prisma and being truncated onto recipe 31, `0x1f` resolving
 * onto the same row by another spelling, and a value past the column's 32-bit
 * range coming back as a driver error rather than a 400 - and what they prove
 * here is that this route actually calls the shared schema.
 */
const REJECTED_IDS: [string, string][] = [
  ["a fractional id", "31.5"],
  ["a hex id", "0x1f"],
  ["a value above the Int ceiling", "2147483648"],
];

describe("[id] path param validation", () => {
  it.each(REJECTED_IDS)("GET rejects %s without querying", async (_l, id) => {
    const res = await GET(request(), ctx(id));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid recipe id" });
    expect(prismaMock.cocktailRecipe.findUnique).not.toHaveBeenCalled();
  });

  it.each(REJECTED_IDS)("PUT rejects %s without writing", async (_l, id) => {
    const res = await PUT(request(validBody), ctx(id));

    expect(res.status).toBe(400);
    expect(prismaMock.cocktailRecipe.update).not.toHaveBeenCalled();
  });

  it.each(REJECTED_IDS)("DELETE rejects %s without writing", async (_l, id) => {
    const res = await DELETE(request(), ctx(id));

    expect(res.status).toBe(400);
    expect(prismaMock.cocktailRecipe.delete).not.toHaveBeenCalled();
  });

  it("accepts a canonical id and passes it through as a number", async () => {
    await GET(request(), ctx("31"));

    expect(prismaMock.cocktailRecipe.findUnique).toHaveBeenCalledWith({
      where: { id: 31 },
    });
  });
});

describe("[id] rejection body", () => {
  // The rejection used to echo the raw segment back as `idRaw`, alongside the
  // `typeof` of an internal variable. Neither tells a legitimate client
  // anything, and reflecting untrusted input is never the cheaper option.
  it("does not echo the submitted segment back to the caller", async () => {
    const text = await (await GET(request(), ctx("31.5abc"))).text();

    expect(JSON.parse(text)).toEqual({ error: "Invalid recipe id" });
    expect(text).not.toContain("31.5abc");
    expect(text).not.toContain("idType");
  });
});

describe("authorization order", () => {
  // Authorization stays in front of validation on the mutating verbs, so a
  // caller who is not an admin learns nothing about which ids are well formed.
  it.each([
    ["PUT", () => PUT(request(validBody), ctx("31.5"))],
    ["DELETE", () => DELETE(request(), ctx("31.5"))],
  ])("%s refuses a non-admin before parsing the id", async (_l, call) => {
    authMock.requireAdmin.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await call();

    expect(res.status).toBe(401);
    expect(prismaMock.cocktailRecipe.update).not.toHaveBeenCalled();
    expect(prismaMock.cocktailRecipe.delete).not.toHaveBeenCalled();
  });

  // GET is a public read and must stay one: recipe content is public.
  it("GET serves an anonymous caller", async () => {
    const res = await GET(request(), ctx("31"));

    expect(res.status).toBe(200);
    expect(authMock.requireAdmin).not.toHaveBeenCalled();
  });
});
