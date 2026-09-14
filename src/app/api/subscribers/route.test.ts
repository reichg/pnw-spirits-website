import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, sendSubscribeEmail } = vi.hoisted(() => ({
  prismaMock: {
    subscriber: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  sendSubscribeEmail: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/email", () => ({ sendSubscribeEmail }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "./route";

// requireAdmin verifies against process.env.JWT_SECRET; pin it so the suite
// never depends on (or leaks) the real .env value.
const TEST_JWT_SECRET = "test-jwt-secret";

const SUBSCRIBER = {
  id: 1,
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  prismaMock.subscriber.findMany.mockResolvedValue([SUBSCRIBER]);
  prismaMock.subscriber.findUnique.mockResolvedValue(null);
  prismaMock.subscriber.create.mockResolvedValue(SUBSCRIBER);
  sendSubscribeEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const adminToken = (): string => jwt.sign({ role: "admin" }, TEST_JWT_SECRET);
const userToken = (): string => jwt.sign({ role: "user" }, TEST_JWT_SECRET);

function req(body?: unknown, authorization?: string): NextRequest {
  return {
    headers: {
      get: (name: string) =>
        name === "authorization" ? (authorization ?? null) : null,
    },
    json: async () => body,
  } as unknown as NextRequest;
}

describe("GET /api/subscribers", () => {
  // Every row carries a name and an email address, so an ungated read here is a
  // bulk export of personal data. The query must not run at all for a caller
  // that is not a verified admin.
  it("rejects an anonymous caller with 401 and reads nothing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(prismaMock.subscriber.findMany).not.toHaveBeenCalled();
  });

  it("rejects a forged token with 401 and reads nothing", async () => {
    const forged = jwt.sign({ role: "admin" }, "wrong-secret");
    const res = await GET(req(undefined, `Bearer ${forged}`));
    expect(res.status).toBe(401);
    expect(prismaMock.subscriber.findMany).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and reads nothing", async () => {
    const res = await GET(req(undefined, `Bearer ${userToken()}`));
    expect(res.status).toBe(403);
    expect(prismaMock.subscriber.findMany).not.toHaveBeenCalled();
  });

  it("returns the subscriber list for an authenticated admin", async () => {
    const res = await GET(req(undefined, `Bearer ${adminToken()}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscribers).toHaveLength(1);
    expect(body.subscribers[0].email).toBe(SUBSCRIBER.email);
  });

  it("returns a generic 500 without leaking the underlying error", async () => {
    prismaMock.subscriber.findMany.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    );
    const res = await GET(req(undefined, `Bearer ${adminToken()}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to list subscribers" });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});

describe("POST /api/subscribers", () => {
  // The public subscribe form is the only caller and sends no credentials.
  // Gating this would break the site's subscribe box, so it must stay open.
  it("accepts an anonymous subscribe", async () => {
    const res = await POST(
      req({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.subscriber.create).toHaveBeenCalled();
  });

  it("rejects a subscribe that is missing fields", async () => {
    const res = await POST(req({ email: "ada@example.test" }));
    expect(res.status).toBe(400);
    expect(prismaMock.subscriber.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email with 409", async () => {
    prismaMock.subscriber.findUnique.mockResolvedValue(SUBSCRIBER);
    const res = await POST(
      req({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
      }),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.subscriber.create).not.toHaveBeenCalled();
  });
});
