import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

// Test only the pure `isTokenValid` helper. jsonwebtoken runs fine under the
// node test environment; no React rendering is required here.
import { isTokenValid } from "./AdminTokenContext";

describe("isTokenValid", () => {
  it("returns false for a null token", () => {
    expect(isTokenValid(null)).toBe(false);
  });

  it("returns false for a malformed / non-JWT string", () => {
    expect(isTokenValid("not-a-jwt")).toBe(false);
  });

  it("returns false for a payload without a numeric exp", () => {
    // Signed without expiresIn -> decoded object has no `exp`.
    const token = jwt.sign({ id: 1 }, "secret");
    expect(isTokenValid(token)).toBe(false);
  });

  it("returns false for an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = jwt.sign({ exp: past }, "secret");
    expect(isTokenValid(token)).toBe(false);
  });

  it("returns true for a token whose exp is in the future", () => {
    const token = jwt.sign({}, "secret", { expiresIn: "30m" });
    expect(isTokenValid(token)).toBe(true);
  });
});
