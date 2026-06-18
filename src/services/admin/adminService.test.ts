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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureDefaultAdmin", () => {
  it("upserts the default admin with a NO-CLOBBER empty update and a hashed password", async () => {
    prismaMock.user.upsert.mockResolvedValue({ id: 1 });

    await ensureDefaultAdmin();

    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.user.upsert.mock.calls[0][0];

    // Targets the default admin by username.
    expect(arg.where).toEqual({ username: "admin" });
    // The key guarantee: never overwrite an existing admin's stored password.
    expect(arg.update).toEqual({});
    // Created with the admin role.
    expect(arg.create.role).toBe("admin");
    // Password is stored hashed, never as the plaintext default.
    expect(arg.create.password).not.toBe("adminpass");
    expect(bcrypt.compareSync("adminpass", arg.create.password)).toBe(true);
  });
});

describe("authenticateAdmin", () => {
  it("returns null when the user is not found", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await authenticateAdmin("admin", "adminpass");

    expect(result).toBeNull();
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { username: "admin" },
    });
  });

  it("returns null when the password does not match the stored hash", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 1,
      username: "admin",
      role: "admin",
      password: bcrypt.hashSync("the-real-password", 10),
    });

    const result = await authenticateAdmin("admin", "wrong-password");

    expect(result).toBeNull();
  });

  it("returns a token and user shape on a successful authentication", async () => {
    const password = "correct-horse";
    prismaMock.user.findFirst.mockResolvedValue({
      id: 42,
      username: "admin",
      role: "admin",
      password: bcrypt.hashSync(password, 10),
    });

    const result = await authenticateAdmin("admin", password);

    expect(result).not.toBeNull();
    expect(result?.user).toEqual({ id: 42, username: "admin", role: "admin" });

    const decoded = jwt.verify(result!.token, "secret") as {
      id: number;
      role: string;
    };
    expect(decoded.id).toBe(42);
    expect(decoded.role).toBe("admin");
  });
});

describe("DEFAULT_ADMIN_ENABLED", () => {
  const ORIGINAL = process.env.ENABLE_DEFAULT_ADMIN;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.ENABLE_DEFAULT_ADMIN;
    } else {
      process.env.ENABLE_DEFAULT_ADMIN = ORIGINAL;
    }
    vi.resetModules();
  });

  it('is true unless ENABLE_DEFAULT_ADMIN === "false"', async () => {
    // The constant is evaluated at import time, so re-import per env value.
    delete process.env.ENABLE_DEFAULT_ADMIN;
    vi.resetModules();
    let mod = await import("./adminService");
    expect(mod.DEFAULT_ADMIN_ENABLED).toBe(true);

    process.env.ENABLE_DEFAULT_ADMIN = "false";
    vi.resetModules();
    mod = await import("./adminService");
    expect(mod.DEFAULT_ADMIN_ENABLED).toBe(false);
  });
});
