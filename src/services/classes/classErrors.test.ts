import { describe, expect, it } from "vitest";

import {
  ClassNotFoundError,
  NoClassPageError,
  mapClassServiceError,
} from "./classErrors";

describe("mapClassServiceError", () => {
  it("maps NoClassPageError to 409 with a safe message", () => {
    const result = mapClassServiceError(new NoClassPageError());
    expect(result.status).toBe(409);
    expect(result.message).toBe("Save class content before adding this.");
  });

  it("maps ClassNotFoundError to 404 with a safe message", () => {
    const result = mapClassServiceError(new ClassNotFoundError());
    expect(result.status).toBe(404);
    expect(result.message).toBe("Resource not found.");
  });

  it("maps a duck-typed Prisma P2025 error to 404", () => {
    const result = mapClassServiceError({ code: "P2025" });
    expect(result.status).toBe(404);
    expect(result.message).toBe("Resource not found.");
  });

  it("maps an unknown Error to 500 with a generic message", () => {
    const result = mapClassServiceError(new Error("boom"));
    expect(result.status).toBe(500);
    expect(result.message).toBe("Something went wrong. Please try again.");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "some error string"],
    ["plain object without code", { foo: "bar" }],
    ["object with non-P2025 code", { code: "P2002" }],
  ])("maps %s to 500", (_label, input) => {
    const result = mapClassServiceError(input);
    expect(result.status).toBe(500);
    expect(result.message).toBe("Something went wrong. Please try again.");
  });

  it("never surfaces the raw error message or stack", () => {
    const secret = "DATABASE_URL=postgres://user:p@ss@host/db leaked";
    const err = new Error(secret);
    const result = mapClassServiceError(err);
    expect(result.message).not.toContain(secret);
    expect(result.message).not.toContain("Error");
    expect(result.message).not.toContain("postgres://");
  });

  it("never surfaces raw text even for the named NoClassPage error", () => {
    const err = new NoClassPageError("internal: row 42 missing in shard 3");
    const result = mapClassServiceError(err);
    expect(result.message).not.toContain("shard");
    expect(result.message).not.toContain("42");
  });
});
