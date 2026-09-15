import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: { comment: { delete: vi.fn() } },
  authMock: { requireAdmin: vi.fn() },
}));

// Mocked at the primitives, not at the handler, so every assertion runs through
// the route's real id parsing and authorization order.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/auth", () => authMock);

import { NextResponse, type NextRequest } from "next/server";
import { DELETE } from "./route";

const request = () => ({ headers: new Headers() }) as unknown as NextRequest;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  // Authorized by default; the auth test overrides this.
  authMock.requireAdmin.mockReturnValue(null);
  prismaMock.comment.delete.mockResolvedValue({ id: 7 });
});

/**
 * A behavioural sample, not the rule.
 *
 * The exhaustive table lives once, beside the parser this route imports:
 * src/utils/rowId.test.ts. These three are the distinct failure modes it closes
 * - `parseInt` truncating `1abc` onto comment 1, `Number()` resolving `0x1f`
 * onto comment 31, and a value past the column's 32-bit range where Prisma
 * throws out of a handler that has no catch - and what they prove here is that
 * this route actually calls the shared schema.
 */
const REJECTED_IDS: [string, string][] = [
  ["trailing garbage", "1abc"],
  ["a hex id", "0x1f"],
  ["a value above the Int ceiling", "2147483648"],
];

describe("DELETE /api/comments/[id] path id", () => {
  it.each(REJECTED_IDS)(
    "rejects %s without touching the database",
    async (_label, id) => {
      const res = await DELETE(request(), ctx(id));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid comment id",
      });
      expect(prismaMock.comment.delete).not.toHaveBeenCalled();
    },
  );

  it("accepts a canonical id and passes it through as a number", async () => {
    const res = await DELETE(request(), ctx("31"));
    expect(res.status).toBe(200);
    expect(prismaMock.comment.delete).toHaveBeenCalledWith({
      where: { id: 31 },
    });
  });

  // Authorization stays in front of validation, so a caller who is not an admin
  // learns nothing about which ids are well formed.
  it("refuses a non-admin before parsing the id at all", async () => {
    authMock.requireAdmin.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await DELETE(request(), ctx("31.5"));

    expect(res.status).toBe(401);
    expect(prismaMock.comment.delete).not.toHaveBeenCalled();
  });
});
