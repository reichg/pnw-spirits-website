import { afterEach, describe, expect, it, vi } from "vitest";

import { getJwtSecret } from "./jwtSecret";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getJwtSecret", () => {
  it("returns JWT_SECRET when it is set", () => {
    vi.stubEnv("JWT_SECRET", "configured-secret");
    vi.stubEnv("NODE_ENV", "production");
    expect(getJwtSecret()).toBe("configured-secret");
  });

  // The whole point of the assertion: without it, an unset JWT_SECRET in
  // production would silently sign and verify admin tokens with a literal
  // anyone can read in this repo, making every admin token forgeable.
  it("throws in production when JWT_SECRET is unset", () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("falls back outside production so local dev and tests need no setup", () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getJwtSecret()).toBe("secret");
  });
});
