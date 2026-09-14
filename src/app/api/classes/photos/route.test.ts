import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createPhoto } = vi.hoisted(() => ({ createPhoto: vi.fn() }));

// The service is mocked so no database is touched, but `requireAdmin` and the
// Zod contract are the real ones: this suite is about the trust boundary, and
// stubbing either of those would assert nothing.
vi.mock("@/services/classes/classService", () => ({ createPhoto }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  CLASS_MEDIA_PREFIX,
  MAX_SINGLE_LINE_LENGTH,
} from "@/services/classes/classSchemas";
import { POST } from "./route";

const TEST_JWT_SECRET = "test-jwt-secret";

const VALID_KEY = `${CLASS_MEDIA_PREFIX}album/photo.jpg`;
const validBody = { s3Key: VALID_KEY, caption: "Garnish prep", sortOrder: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  createPhoto.mockResolvedValue({ id: 4, classId: 1, ...validBody });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const adminToken = (): string => jwt.sign({ role: "admin" }, TEST_JWT_SECRET);

function req(body?: unknown, authorization?: string): NextRequest {
  return {
    headers: new Headers(
      authorization ? { authorization } : ({} as Record<string, string>),
    ),
    json: async () => body,
  } as unknown as NextRequest;
}

const asAdmin = (body: unknown) => req(body, `Bearer ${adminToken()}`);

/** The `{ error }` string, which is the only part the admin UI renders. */
async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

describe("POST /api/classes/photos rejected body", () => {
  // `caption` is the field an admin actually types, and the cap on it is new:
  // a bare "Invalid input" named nothing on a form that shows no limit.
  it.each([
    [
      "caption",
      { ...validBody, caption: "a".repeat(MAX_SINGLE_LINE_LENGTH + 1) },
    ],
    ["s3Key", { ...validBody, s3Key: "recipe-media/x.jpg" }],
    ["sortOrder", { ...validBody, sortOrder: 2.7 }],
  ])("names %s and writes nothing", async (field, body) => {
    const res = await POST(asAdmin(body));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(`Invalid input: ${field}`);
    expect(createPhoto).not.toHaveBeenCalled();
  });

  it("returns one short line that never echoes the submitted value", async () => {
    const res = await POST(
      asAdmin({
        ...validBody,
        caption: `SENTINEL${"a".repeat(MAX_SINGLE_LINE_LENGTH)}`,
      }),
    );
    const error = await errorOf(res);

    expect(error).not.toContain("SENTINEL");
    expect(error.length).toBeLessThanOrEqual(200);
    expect(error).not.toMatch(/[\r\n]/);
  });

  it("falls back to the generic message when no field is named", async () => {
    const res = await POST(asAdmin("not an object"));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Invalid input");
  });

  it("still creates a photo from a valid body", async () => {
    const res = await POST(asAdmin(validBody));

    expect(res.status).toBe(201);
    expect(createPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ s3Key: VALID_KEY }),
    );
  });
});

describe("POST /api/classes/photos authorization", () => {
  // Authorization stays in front of parsing, so a caller who is not an admin
  // learns nothing about which fields exist.
  it("rejects an anonymous caller with 401 before naming any field", async () => {
    const res = await POST(req({ ...validBody, s3Key: "recipe-media/x.jpg" }));

    expect(res.status).toBe(401);
    expect(await errorOf(res)).not.toContain("s3Key");
    expect(createPhoto).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and writes nothing", async () => {
    const res = await POST(
      req(validBody, `Bearer ${jwt.sign({ role: "user" }, TEST_JWT_SECRET)}`),
    );

    expect(res.status).toBe(403);
    expect(createPhoto).not.toHaveBeenCalled();
  });
});
