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
// Assert against the shared cap (single source of truth) rather than a literal,
// so the test tracks src/config/album.ts instead of duplicating its value.
import { MAX_ALBUM_PHOTOS } from "@/config/album";
import { GET, PUT } from "./route";

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

// GET is a read with no `requireAdmin` gate: anyone may call it, and the only
// thing admin status changes is HOW MUCH it returns. Both halves of that live in
// one expression (`isAdmin(req) ? null : MAX_ALBUM_PHOTOS`), so the options
// object this route builds is the whole of its behaviour - which is why every
// assertion below is on that object rather than on the response body.
const PAGE = {
  class: { id: 1, ...validBody },
  sessions: [],
  photos: [],
};

/** The options object GET handed the service on its single call. */
function getClassPageOptions(): Record<string, unknown> {
  expect(getClassPage).toHaveBeenCalledTimes(1);
  return getClassPage.mock.calls[0][0];
}

const nonAdminToken = (): string => jwt.sign({ role: "user" }, TEST_JWT_SECRET);

describe("GET /api/classes photo cap", () => {
  beforeEach(() => {
    getClassPage.mockResolvedValue(PAGE);
  });

  it.each([
    ["an anonymous caller", () => undefined],
    ["a valid non-admin token", () => `Bearer ${nonAdminToken()}`],
  ])("caps %s at the public album size", async (_label, authorization) => {
    await GET(req(undefined, authorization()));

    expect(getClassPage).toHaveBeenCalledWith({
      photoLimit: MAX_ALBUM_PHOTOS,
    });
  });

  it("lifts the cap for an admin so the manager can edit the full album", async () => {
    await GET(req(undefined, `Bearer ${adminToken()}`));

    // null is the documented "all photos" signal; a number here would silently
    // hide everything past the public cap from the admin UI.
    expect(getClassPage).toHaveBeenCalledWith({ photoLimit: null });
  });

  it("returns the service payload unchanged", async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAGE);
  });
});

describe("GET /api/classes session scope", () => {
  // THE REGRESSION THIS BLOCK EXISTS FOR, and it is a new one.
  // `upcomingSessionsOnly` belongs to the PUBLIC /classes page alone -
  // getClassPageView is the only caller that opts in. THIS route is the read
  // behind the admin manager, and the manager edits sessions that have already
  // happened. If the option were ever passed from here, every past session
  // would vanish from the admin UI, and nothing else in the suite would go red:
  // the service's own tests prove the option works when asked for, never that
  // this caller declines to ask.
  //
  // Asserted as the EXACT options object rather than with objectContaining,
  // because a partial match is precisely what would let the key slip through.

  beforeEach(() => {
    getClassPage.mockResolvedValue(PAGE);
  });

  it.each([
    ["an admin", () => `Bearer ${adminToken()}`],
    ["a non-admin", () => `Bearer ${nonAdminToken()}`],
    ["an anonymous caller", () => undefined],
  ])("never scopes sessions for %s", async (_label, authorization) => {
    await GET(req(undefined, authorization()));

    const options = getClassPageOptions();
    // Stated two ways on purpose: the key is absent...
    expect(options).not.toHaveProperty("upcomingSessionsOnly");
    // ...and the option is falsy however it arrived, so the service falls
    // through to its every-session default.
    expect(options.upcomingSessionsOnly).toBeFalsy();
    // photoLimit is the ONLY key this route sets.
    expect(Object.keys(options)).toEqual(["photoLimit"]);
  });
});

describe("GET /api/classes failure contract", () => {
  it("answers 500 with a generic message that never leaks the cause", async () => {
    // A read failure here is a database fault, and its message carries hosts,
    // ports and SQL. The admin UI renders `error` verbatim.
    getClassPage.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    );

    const res = await GET(req());
    const error = await errorOf(res);

    expect(res.status).toBe(500);
    expect(error).toBe("Failed to fetch class page");
    expect(error).not.toContain("ECONNREFUSED");
    expect(error).not.toContain("10.0.0.5");
  });
});
