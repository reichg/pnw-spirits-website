import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";

import { isAdmin, requireAdmin } from "./auth";

// Both checks verify with process.env.JWT_SECRET || "secret"; pin the secret so
// the suite never depends on (or leaks) the real .env value.
const TEST_JWT_SECRET = "test-jwt-secret";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Build a minimal request whose only behavior the checks rely on is
 * headers.get("authorization"). Cast to NextRequest because the verifier reads
 * just that one method — no Next runtime is needed for these pure checks.
 */
function reqWithAuth(authorization?: string): NextRequest {
  return {
    headers: { get: (name: string) => (name === "authorization" ? authorization ?? null : null) },
  } as unknown as NextRequest;
}

function bearer(token: string): NextRequest {
  return reqWithAuth(`Bearer ${token}`);
}

const adminToken = (): string => jwt.sign({ role: "admin" }, TEST_JWT_SECRET);
const userToken = (): string => jwt.sign({ role: "user" }, TEST_JWT_SECRET);

describe("isAdmin", () => {
  it("returns true for a valid Bearer JWT whose role is admin", () => {
    expect(isAdmin(bearer(adminToken()))).toBe(true);
  });

  // Everything below is the fail-closed contract: only a verified admin token
  // unlocks the uncapped read; every other case must return false.
  it("returns false when the Authorization header is missing", () => {
    expect(isAdmin(reqWithAuth(undefined))).toBe(false);
  });

  it("returns false for a non-Bearer / malformed Authorization header", () => {
    expect(isAdmin(reqWithAuth(adminToken()))).toBe(false); // no "Bearer " prefix
    expect(isAdmin(reqWithAuth("Bearer "))).toBe(false); // empty token
  });

  it("returns false for a token that fails signature verification", () => {
    const forged = jwt.sign({ role: "admin" }, "wrong-secret");
    expect(isAdmin(bearer(forged))).toBe(false);
  });

  it("returns false for a valid token whose role is not admin", () => {
    expect(isAdmin(bearer(userToken()))).toBe(false);
  });
});

describe("requireAdmin", () => {
  // Lock the external contract byte-for-byte so the shared-verifier refactor
  // cannot silently change response bodies or statuses.
  it("returns null (authorized) for a valid admin token", () => {
    expect(requireAdmin(bearer(adminToken()))).toBeNull();
  });

  it("returns 401 Unauthorized for a missing/empty/malformed header", async () => {
    for (const req of [reqWithAuth(undefined), reqWithAuth("Bearer "), reqWithAuth(adminToken())]) {
      const res = requireAdmin(req);
      expect(res?.status).toBe(401);
      await expect(res?.json()).resolves.toEqual({ error: "Unauthorized" });
    }
  });

  it("returns 401 Invalid token when verification fails", async () => {
    const forged = jwt.sign({ role: "admin" }, "wrong-secret");
    const res = requireAdmin(bearer(forged));
    expect(res?.status).toBe(401);
    await expect(res?.json()).resolves.toEqual({ error: "Invalid token" });
  });

  it("returns 403 Forbidden for a valid non-admin token", async () => {
    const res = requireAdmin(bearer(userToken()));
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
