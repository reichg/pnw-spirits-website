import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updatePhoto, deletePhoto } = vi.hoisted(() => ({
  updatePhoto: vi.fn(),
  deletePhoto: vi.fn(),
}));

// The service is mocked so no database is touched, but `requireAdmin` and the
// Zod contract are the real ones: this suite is about the trust boundary, and
// stubbing either of those would assert nothing.
vi.mock("@/services/classes/classService", () => ({
  updatePhoto,
  deletePhoto,
}));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { CLASS_MEDIA_PREFIX } from "@/services/classes/classSchemas";
import { DELETE, PUT } from "./route";

const TEST_JWT_SECRET = "test-jwt-secret";

const VALID_KEY = `${CLASS_MEDIA_PREFIX}album/photo.jpg`;

const PHOTO_ROW = {
  id: 4,
  classId: 1,
  s3Key: VALID_KEY,
  caption: "Garnish prep",
  sortOrder: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const validBody = { s3Key: VALID_KEY, caption: "Garnish prep", sortOrder: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  updatePhoto.mockResolvedValue(PHOTO_ROW);
  deletePhoto.mockResolvedValue(PHOTO_ROW);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const adminToken = (): string => jwt.sign({ role: "admin" }, TEST_JWT_SECRET);
const userToken = (): string => jwt.sign({ role: "user" }, TEST_JWT_SECRET);

function req(body?: unknown, authorization?: string): NextRequest {
  return {
    headers: new Headers(
      authorization ? { authorization } : ({} as Record<string, string>),
    ),
    json: async () => body,
  } as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const asAdmin = (body: unknown) => req(body, `Bearer ${adminToken()}`);
const adminNoBody = () => req(undefined, `Bearer ${adminToken()}`);

/**
 * A behavioural sample, not the rule.
 *
 * The exhaustive table lives once, beside the parser this route imports:
 * src/utils/rowId.test.ts. `31.5` is the shape confirmed against the running
 * server on the sibling session route - `Number("31.5")` is 31.5 and Prisma
 * truncates onto the neighbouring row, so a request aimed at a row that does not
 * exist edited one that does. What these prove here is that this route actually
 * calls the shared schema.
 */
const REJECTED_IDS: [string, string][] = [
  ["a fractional id", "31.5"],
  ["a hex id", "0x1f"],
  ["a value above the Int ceiling", "2147483648"],
];

describe("PUT /api/classes/photos/[id] path id", () => {
  it.each(REJECTED_IDS)("rejects %s and writes nothing", async (_label, id) => {
    const res = await PUT(asAdmin(validBody), ctx(id));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid photo id" });
    expect(updatePhoto).not.toHaveBeenCalled();
  });

  it("accepts a well-formed id and passes it through as a number", async () => {
    const res = await PUT(asAdmin(validBody), ctx("31"));
    expect(res.status).toBe(200);
    expect(updatePhoto).toHaveBeenCalledWith(31, expect.anything());
  });

  // The message is the whole body now: a Zod issue list used to ride along as
  // `details`, and the admin UI reads `error` and nothing else.
  it("returns one short message and nothing else", async () => {
    const res = await PUT(asAdmin(validBody), ctx("31.5"));
    const body = (await res.json()) as { error: string };
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.length).toBeLessThanOrEqual(200);
    expect(body.error).not.toMatch(/[\r\n]/);
  });
});

describe("DELETE /api/classes/photos/[id] path id", () => {
  it.each(REJECTED_IDS)(
    "rejects %s and deletes nothing",
    async (_label, id) => {
      const res = await DELETE(adminNoBody(), ctx(id));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Invalid photo id" });
      expect(deletePhoto).not.toHaveBeenCalled();
    },
  );

  it("accepts a well-formed id and passes it through as a number", async () => {
    const res = await DELETE(adminNoBody(), ctx("31"));
    expect(res.status).toBe(200);
    expect(deletePhoto).toHaveBeenCalledWith(31);
  });
});

describe("/api/classes/photos/[id] authorization", () => {
  it("rejects an anonymous PUT with 401 and writes nothing", async () => {
    const res = await PUT(req(validBody), ctx("4"));
    expect(res.status).toBe(401);
    expect(updatePhoto).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin PUT with 403 and writes nothing", async () => {
    const res = await PUT(req(validBody, `Bearer ${userToken()}`), ctx("4"));
    expect(res.status).toBe(403);
    expect(updatePhoto).not.toHaveBeenCalled();
  });

  it("rejects an anonymous DELETE with 401 and deletes nothing", async () => {
    const res = await DELETE(req(), ctx("4"));
    expect(res.status).toBe(401);
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  // Authorization stays in front of validation, so a caller who is not an admin
  // learns nothing about which ids are well formed.
  it.each([
    ["PUT", () => PUT(req(validBody), ctx("31.5"))],
    ["DELETE", () => DELETE(req(), ctx("31.5"))],
  ])(
    "%s refuses an anonymous caller before parsing the id",
    async (_l, call) => {
      const res = await call();
      expect(res.status).toBe(401);
    },
  );
});

describe("PUT /api/classes/photos/[id] body bounds", () => {
  // `caption` renders on the public /classes page and was unbounded, so a
  // 100,000-character value was accepted and laid out.
  it("rejects an over-long caption and writes nothing", async () => {
    const res = await PUT(
      asAdmin({ ...validBody, caption: "a".repeat(201) }),
      ctx("4"),
    );
    expect(res.status).toBe(400);
    expect(updatePhoto).not.toHaveBeenCalled();
  });

  // The caps above are new and the form shows no limit anywhere, so a bare
  // "Invalid input" left an admin with nothing to act on. `readAdminError`
  // renders `error` and never `details`, so the field has to be in the message.
  it("names the failing field in the message the admin UI renders", async () => {
    const res = await PUT(
      asAdmin({ ...validBody, caption: "a".repeat(201) }),
      ctx("4"),
    );
    const body = (await res.json()) as { error: string };

    expect(body.error).toBe("Invalid input: caption");
    expect(body.error).not.toContain("aaa");
    expect(body.error.length).toBeLessThanOrEqual(200);
    expect(body.error).not.toMatch(/[\r\n]/);
  });

  it("accepts a caption at the bound and trims it", async () => {
    const res = await PUT(
      asAdmin({ ...validBody, caption: `  ${"a".repeat(200)}  ` }),
      ctx("4"),
    );
    expect(res.status).toBe(200);
    expect(updatePhoto).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ caption: "a".repeat(200) }),
    );
  });

  // `sortOrder` and the reorder endpoint write the same column. Reorder derives
  // it as an array index, so it is always a clean 0-based integer; this path
  // used to accept anything a `z.number()` accepts into the same place.
  it.each([
    ["a negative sortOrder", -5],
    ["a fractional sortOrder", 2.7],
    ["a sortOrder past the Int ceiling", 1e308],
  ])("rejects %s and writes nothing", async (_label, sortOrder) => {
    const res = await PUT(asAdmin({ ...validBody, sortOrder }), ctx("4"));
    expect(res.status).toBe(400);
    expect(updatePhoto).not.toHaveBeenCalled();
  });

  it("still accepts sortOrder 0, which is the first reorder index", async () => {
    const res = await PUT(asAdmin({ ...validBody, sortOrder: 0 }), ctx("4"));
    expect(res.status).toBe(200);
    expect(updatePhoto).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ sortOrder: 0 }),
    );
  });

  // `s3Key` is handed to deleteS3Objects on update, so the prefix allowlist is
  // load-bearing and must survive this change.
  it("still rejects an s3Key outside the class media prefix", async () => {
    const res = await PUT(
      asAdmin({ ...validBody, s3Key: "recipe-media/x.jpg" }),
      ctx("4"),
    );
    expect(res.status).toBe(400);
    expect(updatePhoto).not.toHaveBeenCalled();
  });
});
