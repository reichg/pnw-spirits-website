import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getClassPage, upsertClassContent } = vi.hoisted(() => ({
  getClassPage: vi.fn(),
  upsertClassContent: vi.fn(),
}));

// The service is mocked so no database is touched, but `requireAdmin` and the
// Zod contract are the real ones: this suite is about the trust boundary, and
// stubbing either of those would assert nothing.
vi.mock("@/services/classes/classService", () => ({
  getClassPage,
  upsertClassContent,
}));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SINGLE_LINE_LENGTH,
} from "@/services/classes/classSchemas";
import { PUT } from "./route";

const TEST_JWT_SECRET = "test-jwt-secret";

const validBody = { title: "Cocktail Night", description: "An evening." };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  upsertClassContent.mockResolvedValue({ id: 1, ...validBody });
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

describe("PUT /api/classes rejected body", () => {
  // Both fields are capped and the form shows no limit anywhere, so a bare
  // "Invalid input" left an admin who pasted an over-long value with nothing to
  // act on. `readAdminError` renders `error` and never `details`.
  it.each([
    ["title", { ...validBody, title: "a".repeat(MAX_SINGLE_LINE_LENGTH + 1) }],
    [
      "description",
      { ...validBody, description: "a".repeat(MAX_DESCRIPTION_LENGTH + 1) },
    ],
  ])("names %s and writes nothing", async (field, body) => {
    const res = await PUT(asAdmin(body));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(`Invalid input: ${field}`);
    expect(upsertClassContent).not.toHaveBeenCalled();
  });

  // The field name is our own schema key; the submitted value is not ours to
  // echo, and would push the line past what the admin UI will surface.
  it("returns one short line that never echoes the submitted value", async () => {
    const res = await PUT(
      asAdmin({
        ...validBody,
        title: `SENTINEL${"a".repeat(MAX_SINGLE_LINE_LENGTH)}`,
      }),
    );
    const error = await errorOf(res);

    expect(error).not.toContain("SENTINEL");
    expect(error.length).toBeLessThanOrEqual(200);
    expect(error).not.toMatch(/[\r\n]/);
  });

  it("falls back to the generic message when no field is named", async () => {
    const res = await PUT(asAdmin("not an object"));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Invalid input");
  });

  it("still saves a valid body", async () => {
    const res = await PUT(asAdmin(validBody));

    expect(res.status).toBe(200);
    expect(upsertClassContent).toHaveBeenCalledWith(validBody);
  });
});

describe("PUT /api/classes authorization", () => {
  // Authorization stays in front of parsing, so a caller who is not an admin
  // learns nothing about which fields exist.
  it("rejects an anonymous caller with 401 before naming any field", async () => {
    const res = await PUT(
      req({ ...validBody, title: "a".repeat(MAX_SINGLE_LINE_LENGTH + 1) }),
    );

    expect(res.status).toBe(401);
    expect(await errorOf(res)).not.toContain("title");
    expect(upsertClassContent).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and writes nothing", async () => {
    const res = await PUT(
      req(validBody, `Bearer ${jwt.sign({ role: "user" }, TEST_JWT_SECRET)}`),
    );

    expect(res.status).toBe(403);
    expect(upsertClassContent).not.toHaveBeenCalled();
  });
});
