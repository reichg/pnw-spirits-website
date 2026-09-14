import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reorderPhotos } = vi.hoisted(() => ({ reorderPhotos: vi.fn() }));

// The service is mocked so no database is touched, but `requireAdmin` and the
// Zod contract are the real ones: this suite is about the trust boundary, and
// stubbing either of those would assert nothing.
vi.mock("@/services/classes/classService", () => ({ reorderPhotos }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { MAX_REORDER_IDS } from "@/services/classes/classSchemas";
import { MAX_INT4 } from "@/utils/rowId";
import { POST } from "./route";

const TEST_JWT_SECRET = "test-jwt-secret";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  reorderPhotos.mockResolvedValue(undefined);
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

describe("POST /api/classes/photos/reorder rejected body", () => {
  // The body is machine-built by the drag handler rather than typed, so the
  // value of naming the failure is telling a whole-list problem apart from one
  // bad entry: `ids` means the list never arrived, `ids.1` points at which
  // element of the order the client sent is wrong.
  it.each([
    ["ids", { ids: [] }],
    ["ids", {}],
    ["ids", { ids: "3,1,2" }],
    ["ids", { ids: Array.from({ length: MAX_REORDER_IDS + 1 }, () => 1) }],
    ["ids.1", { ids: [3, 1.5] }],
    ["ids.1", { ids: [3, 0] }],
    ["ids.1", { ids: [3, MAX_INT4 + 1] }],
    ["ids.1", { ids: [3, "2"] }],
  ])("names %s and reorders nothing", async (field, body) => {
    const res = await POST(asAdmin(body));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(`Invalid input: ${field}`);
    expect(reorderPhotos).not.toHaveBeenCalled();
  });

  it("returns one short line the admin UI will surface", async () => {
    const error = await errorOf(await POST(asAdmin({ ids: [3, 1.5] })));

    expect(error.length).toBeLessThanOrEqual(200);
    expect(error).not.toMatch(/[\r\n]/);
  });

  it("falls back to the generic message when no field is named", async () => {
    const res = await POST(asAdmin("not an object"));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Invalid input");
  });

  it("still reorders a valid list", async () => {
    const res = await POST(asAdmin({ ids: [3, 1, 2] }));

    expect(res.status).toBe(200);
    expect(reorderPhotos).toHaveBeenCalledWith([3, 1, 2]);
  });
});

describe("POST /api/classes/photos/reorder authorization", () => {
  // Authorization stays in front of parsing, so a caller who is not an admin
  // learns nothing about the request shape.
  it("rejects an anonymous caller with 401 before naming any field", async () => {
    const res = await POST(req({ ids: [3, 1.5] }));

    expect(res.status).toBe(401);
    expect(await errorOf(res)).not.toContain("ids");
    expect(reorderPhotos).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and reorders nothing", async () => {
    const res = await POST(
      req(
        { ids: [3, 1, 2] },
        `Bearer ${jwt.sign({ role: "user" }, TEST_JWT_SECRET)}`,
      ),
    );

    expect(res.status).toBe(403);
    expect(reorderPhotos).not.toHaveBeenCalled();
  });
});
