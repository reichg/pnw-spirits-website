import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateSession, deleteSession } = vi.hoisted(() => ({
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
}));

// The service is mocked so no database is touched, but `requireAdmin` and the
// Zod contract are the real ones: this suite is about the trust boundary, and
// stubbing either of those would assert nothing.
vi.mock("@/services/classes/classService", () => ({
  updateSession,
  deleteSession,
}));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SESSION_TIME_RANGE_MESSAGE } from "../sessionRequestSchema";
import { DELETE, PUT } from "./route";

const TEST_JWT_SECRET = "test-jwt-secret";

const START = "2026-09-21T21:00:00.000Z";
const BEFORE_START = "2026-09-21T20:00:00.000Z";
const AFTER_START = "2026-09-21T22:00:00.000Z";

const SESSION_ROW = {
  id: 4,
  classId: 1,
  startTime: new Date(START),
  endTime: new Date(AFTER_START),
  location: "Tasting Room",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  updateSession.mockResolvedValue(SESSION_ROW);
  deleteSession.mockResolvedValue(SESSION_ROW);
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

describe("PUT /api/classes/sessions/[id] authorization", () => {
  it("rejects an anonymous caller with 401 and writes nothing", async () => {
    const res = await PUT(req({ startTime: START }), ctx("4"));
    expect(res.status).toBe(401);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and writes nothing", async () => {
    const res = await PUT(
      req({ startTime: START }, `Bearer ${userToken()}`),
      ctx("4"),
    );
    expect(res.status).toBe(403);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("still rejects a non-numeric path id before reading the body", async () => {
    const res = await PUT(asAdmin({ startTime: START }), ctx("4abc"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Invalid session id",
    });
    expect(updateSession).not.toHaveBeenCalled();
  });
});

/**
 * A behavioural sample, not the rule.
 *
 * The exhaustive table lives once, beside the parser this route imports:
 * src/utils/rowId.test.ts. `31.5` is the one confirmed against the running
 * server - `PUT /api/classes/sessions/31.5` answered 200 and edited session 31,
 * because `Number("31.5")` is 31.5 and Prisma truncates onto the neighbouring
 * row. `0x1f` is the spelling coercion alone still resolved onto a real row, and
 * the last is past the column's 32-bit range, which reached Prisma as a driver
 * error rather than a clean 400. What they prove here is that this route
 * actually calls the shared schema.
 */
const REJECTED_IDS: [string, string][] = [
  ["a fractional id", "31.5"],
  ["a hex id", "0x1f"],
  ["a value above the Int ceiling", "2147483648"],
];

describe("PUT /api/classes/sessions/[id] path id", () => {
  it.each(REJECTED_IDS)("rejects %s and writes nothing", async (_label, id) => {
    const res = await PUT(asAdmin({ startTime: START }), ctx(id));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid session id" });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("accepts a well-formed id and passes it through as a number", async () => {
    const res = await PUT(asAdmin({ startTime: START }), ctx("31"));
    expect(res.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(31, expect.anything());
  });

  // The message is the whole body now: a Zod issue list used to ride along as
  // `details`, and the admin UI reads `error` and nothing else.
  it("returns one short message and nothing else", async () => {
    const res = await PUT(asAdmin({ startTime: START }), ctx("31.5"));
    const body = (await res.json()) as { error: string };
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.length).toBeLessThanOrEqual(200);
    expect(body.error).not.toMatch(/[\r\n]/);
  });

  // Authorization stays in front of validation, so a caller who is not an admin
  // learns nothing about which ids are well formed.
  it("refuses an anonymous caller before parsing the id at all", async () => {
    const res = await PUT(req({ startTime: START }), ctx("31.5"));
    expect(res.status).toBe(401);
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/classes/sessions/[id] path id", () => {
  it.each(REJECTED_IDS)(
    "rejects %s and deletes nothing",
    async (_label, id) => {
      const res = await DELETE(adminNoBody(), ctx(id));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid session id",
      });
      expect(deleteSession).not.toHaveBeenCalled();
    },
  );

  it("accepts a well-formed id and passes it through as a number", async () => {
    const res = await DELETE(adminNoBody(), ctx("31"));
    expect(res.status).toBe(200);
    expect(deleteSession).toHaveBeenCalledWith(31);
  });

  it("refuses an anonymous caller before parsing the id at all", async () => {
    const res = await DELETE(req(), ctx("31.5"));
    expect(res.status).toBe(401);
    expect(deleteSession).not.toHaveBeenCalled();
  });
});

describe("PUT /api/classes/sessions/[id] time range", () => {
  // The reported defect arrived through this verb: the admin form saved
  // "9:00 PM - 8:00 PM" and the route persisted it.
  it("rejects an end time before the start time with 400 and writes nothing", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, endTime: BEFORE_START }),
      ctx("4"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: SESSION_TIME_RANGE_MESSAGE,
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  // A class that ends at the moment it begins is as meaningless as an inverted
  // one, so the rule is "strictly after", not "not before".
  it("rejects an end time equal to the start time with 400", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, endTime: START }),
      ctx("4"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: SESSION_TIME_RANGE_MESSAGE,
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("accepts an end time after the start time", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, endTime: AFTER_START }),
      ctx("4"),
    );
    expect(res.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        startTime: new Date(START),
        endTime: new Date(AFTER_START),
      }),
    );
  });

  it("accepts an omitted end time", async () => {
    const res = await PUT(asAdmin({ startTime: START }), ctx("4"));
    expect(res.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ startTime: new Date(START) }),
    );
  });

  it("accepts an explicitly null end time", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, endTime: null }),
      ctx("4"),
    );
    expect(res.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ endTime: null }),
    );
  });

  it("keeps the generic message for a plain shape failure", async () => {
    const res = await PUT(asAdmin({ startTime: "not-a-date" }), ctx("4"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" });
    expect(updateSession).not.toHaveBeenCalled();
  });

  // `readAdminError` swallows a multi-line or >200-character `{ error }` and
  // shows a generic fallback instead, which would hide the cause from the admin
  // who has to fix the range.
  it("returns a message the admin UI will surface", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, endTime: BEFORE_START }),
      ctx("4"),
    );
    const { error } = (await res.json()) as { error: string };
    expect(error.trim()).toBe(error);
    expect(error.length).toBeLessThanOrEqual(200);
    expect(error).not.toMatch(/[\r\n]/);
  });
});

describe("PUT /api/classes/sessions/[id] location bound", () => {
  // `location` renders on the public /classes page and was unbounded, so a
  // 100,000-character value was accepted and laid out.
  it("rejects an over-long location and writes nothing", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, location: "a".repeat(201) }),
      ctx("4"),
    );
    expect(res.status).toBe(400);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("accepts a location at the bound and trims it", async () => {
    const res = await PUT(
      asAdmin({ startTime: START, location: `  ${"a".repeat(200)}  ` }),
      ctx("4"),
    );
    expect(res.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ location: "a".repeat(200) }),
    );
  });
});
