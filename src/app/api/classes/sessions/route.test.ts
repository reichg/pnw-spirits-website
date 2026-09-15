import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSession } = vi.hoisted(() => ({ createSession: vi.fn() }));

// The service is mocked so no database is touched, but `requireAdmin` and the
// Zod contract are the real ones: this suite is about the trust boundary, and
// stubbing either of those would assert nothing.
vi.mock("@/services/classes/classService", () => ({ createSession }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SESSION_TIME_RANGE_MESSAGE } from "./sessionRequestSchema";
import { POST } from "./route";

const TEST_JWT_SECRET = "test-jwt-secret";

const START = "2026-09-21T21:00:00.000Z";
const BEFORE_START = "2026-09-21T20:00:00.000Z";
const AFTER_START = "2026-09-21T22:00:00.000Z";

const SESSION_ROW = {
  id: 1,
  classId: 1,
  startTime: new Date(START),
  endTime: new Date(AFTER_START),
  location: "Tasting Room",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  createSession.mockResolvedValue(SESSION_ROW);
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

const asAdmin = (body: unknown) => req(body, `Bearer ${adminToken()}`);

describe("POST /api/classes/sessions authorization", () => {
  it("rejects an anonymous caller with 401 and writes nothing", async () => {
    const res = await POST(req({ startTime: START }));
    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and writes nothing", async () => {
    const res = await POST(req({ startTime: START }, `Bearer ${userToken()}`));
    expect(res.status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/classes/sessions time range", () => {
  // The defect: both timestamps parse individually, so the inverted range
  // persisted and rendered as "9:00 PM - 8:00 PM" on the public /classes page.
  it("rejects an end time before the start time with 400 and writes nothing", async () => {
    const res = await POST(
      asAdmin({ startTime: START, endTime: BEFORE_START }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: SESSION_TIME_RANGE_MESSAGE,
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  // A class that ends at the moment it begins is as meaningless as an inverted
  // one, so the rule is "strictly after", not "not before".
  it("rejects an end time equal to the start time with 400", async () => {
    const res = await POST(asAdmin({ startTime: START, endTime: START }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: SESSION_TIME_RANGE_MESSAGE,
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("accepts an end time after the start time", async () => {
    const res = await POST(asAdmin({ startTime: START, endTime: AFTER_START }));
    expect(res.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: new Date(START),
        endTime: new Date(AFTER_START),
      }),
    );
  });

  it("accepts an omitted end time", async () => {
    const res = await POST(asAdmin({ startTime: START }));
    expect(res.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: new Date(START) }),
    );
  });

  it("accepts an explicitly null end time", async () => {
    const res = await POST(asAdmin({ startTime: START, endTime: null }));
    expect(res.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ endTime: null }),
    );
  });

  it("keeps the generic message for a plain shape failure", async () => {
    const res = await POST(asAdmin({ startTime: "not-a-date" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" });
    expect(createSession).not.toHaveBeenCalled();
  });

  // `readAdminError` swallows a multi-line or >200-character `{ error }` and
  // shows a generic fallback instead, which would hide the cause from the admin
  // who has to fix the range.
  it("returns a message the admin UI will surface", async () => {
    const res = await POST(
      asAdmin({ startTime: START, endTime: BEFORE_START }),
    );
    const { error } = (await res.json()) as { error: string };
    expect(error.trim()).toBe(error);
    expect(error.length).toBeLessThanOrEqual(200);
    expect(error).not.toMatch(/[\r\n]/);
  });
});
