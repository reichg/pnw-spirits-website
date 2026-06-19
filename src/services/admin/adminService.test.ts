import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Mock the Prisma singleton so the service never touches a real client/DB.
// The default export is the prisma instance; the user model gets vi.fn() methods.
// vi.hoisted lets these mocks exist before the hoisted vi.mock factories run.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: prismaMock,
}));

// Silence structured logging during tests.
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { authenticateAdmin, ensureDefaultAdmin } from "./adminService";

// Deterministic admin credentials, injected directly into the service so the
// suite never reads (or leaks) the real .env. JWT_SECRET is stubbed because
// authenticateAdmin signs with process.env.JWT_SECRET internally.
const TEST_ADMIN_USERNAME = "test-admin";
const TEST_ADMIN_PASSWORD = "test-admin-pass";
const TEST_JWT_SECRET = "test-jwt-secret";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ensureDefaultAdmin", () => {
  it("upserts the default admin with a NO-CLOBBER empty update and a hashed password", async () => {
    prismaMock.user.upsert.mockResolvedValue({ id: 1 });

    await ensureDefaultAdmin({
      username: TEST_ADMIN_USERNAME,
      password: TEST_ADMIN_PASSWORD,
    });

    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.user.upsert.mock.calls[0][0];

    // Targets the default admin by the configured username.
    expect(arg.where).toEqual({ username: TEST_ADMIN_USERNAME });
    // The key guarantee: never overwrite an existing admin's stored password.
    expect(arg.update).toEqual({});
    // Created with the configured username and the admin role.
    expect(arg.create.username).toBe(TEST_ADMIN_USERNAME);
    expect(arg.create.role).toBe("admin");
    // Password is stored hashed, never as the plaintext default.
    expect(arg.create.password).not.toBe(TEST_ADMIN_PASSWORD);
    expect(bcrypt.compareSync(TEST_ADMIN_PASSWORD, arg.create.password)).toBe(
      true,
    );
  });
});

describe("authenticateAdmin", () => {
  it("returns null when the user is not found", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await authenticateAdmin(
      TEST_ADMIN_USERNAME,
      TEST_ADMIN_PASSWORD,
    );

    expect(result).toBeNull();
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { username: TEST_ADMIN_USERNAME },
    });
  });

  it("returns null when the password does not match the stored hash", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 1,
      username: TEST_ADMIN_USERNAME,
      role: "admin",
      password: bcrypt.hashSync("the-real-password", 10),
    });

    const result = await authenticateAdmin(TEST_ADMIN_USERNAME, "wrong-password");

    expect(result).toBeNull();
  });

  it("returns a token and user shape on a successful authentication", async () => {
    const password = "correct-horse";
    prismaMock.user.findFirst.mockResolvedValue({
      id: 42,
      username: TEST_ADMIN_USERNAME,
      role: "admin",
      password: bcrypt.hashSync(password, 10),
    });

    const result = await authenticateAdmin(TEST_ADMIN_USERNAME, password);

    expect(result).not.toBeNull();
    expect(result?.user).toEqual({
      id: 42,
      username: TEST_ADMIN_USERNAME,
      role: "admin",
    });

    // Signed with the stubbed secret, so verification uses the same value.
    const decoded = jwt.verify(result!.token, TEST_JWT_SECRET) as {
      id: number;
      role: string;
    };
    expect(decoded.id).toBe(42);
    expect(decoded.role).toBe("admin");
  });
});

describe("DEFAULT_ADMIN_ENABLED", () => {
  afterEach(() => {
    // The constant is captured at import time, so drop the re-imported module.
    vi.resetModules();
  });

  it('is true unless ENABLE_DEFAULT_ADMIN === "false"', async () => {
    // The constant is evaluated at import time, so re-import per env value.
    vi.stubEnv("ENABLE_DEFAULT_ADMIN", undefined);
    vi.resetModules();
    let mod = await import("./adminService");
    expect(mod.DEFAULT_ADMIN_ENABLED).toBe(true);

    vi.stubEnv("ENABLE_DEFAULT_ADMIN", "false");
    vi.resetModules();
    mod = await import("./adminService");
    expect(mod.DEFAULT_ADMIN_ENABLED).toBe(false);
  });
});
