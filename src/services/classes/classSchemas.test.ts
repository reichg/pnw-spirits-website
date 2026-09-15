import { MAX_INT4 } from "@/utils/rowId";
import { describe, expect, it } from "vitest";

import {
  CLASS_MEDIA_PREFIX,
  MAX_DESCRIPTION_LENGTH,
  MAX_REORDER_IDS,
  MAX_SINGLE_LINE_LENGTH,
  classBodyErrorMessage,
  classContentSchema,
  photoInputSchema,
  photoReorderSchema,
  photoUpdateSchema,
  sessionInputSchema,
  sessionUpdateSchema,
} from "./classSchemas";

const validPhotoKey = `${CLASS_MEDIA_PREFIX}album/photo.jpg`;

// The id rule itself is asserted once, exhaustively, beside the schema every
// route and page now imports: src/utils/rowId.test.ts. What is checked here is
// that these contracts embed it, not what it accepts.

describe("classBodyErrorMessage", () => {
  // Every class route answered a body failure with a bare "Invalid input". With
  // the length caps in place, an admin pasting an over-long caption was told
  // only that something was wrong with a form that shows no limit anywhere.
  it("names the failing field", () => {
    const parsed = photoInputSchema.safeParse({
      s3Key: validPhotoKey,
      caption: "x".repeat(MAX_SINGLE_LINE_LENGTH + 1),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(classBodyErrorMessage(parsed.error)).toBe("Invalid input: caption");
  });

  it("names an indexed field inside a list", () => {
    const parsed = photoReorderSchema.safeParse({ ids: [1, 0] });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(classBodyErrorMessage(parsed.error)).toBe("Invalid input: ids.1");
  });

  // `readAdminError` discards an `{ error }` that is multi-line or over 200
  // characters, which would put the admin back at the generic fallback. The
  // message must also never carry the submitted value or Zod's issue text.
  it("stays one short line and never echoes the submitted value", () => {
    const submitted = `SENTINEL${"x".repeat(MAX_SINGLE_LINE_LENGTH)}\nline two`;
    const parsed = classContentSchema.safeParse({
      title: submitted,
      description: "ok",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const message = classBodyErrorMessage(parsed.error);
    expect(message).toBe("Invalid input: title");
    expect(message).not.toContain("SENTINEL");
    expect(message.length).toBeLessThanOrEqual(200);
    expect(message).not.toMatch(/[\r\n]/);
  });

  it("falls back to the generic message when no field is named", () => {
    const parsed = classContentSchema.safeParse("not an object");
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(classBodyErrorMessage(parsed.error)).toBe("Invalid input");
  });
});

describe("classContentSchema", () => {
  it("accepts a valid title + description", () => {
    const parsed = classContentSchema.parse({
      title: "Cocktail Night",
      description: "An evening of mixing.",
    });
    expect(parsed).toEqual({
      title: "Cocktail Night",
      description: "An evening of mixing.",
    });
  });

  it("rejects an empty title", () => {
    expect(
      classContentSchema.safeParse({ title: "", description: "ok" }).success,
    ).toBe(false);
  });

  it("rejects an empty description", () => {
    expect(
      classContentSchema.safeParse({ title: "ok", description: "" }).success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(classContentSchema.safeParse({ title: "ok" }).success).toBe(false);
  });

  // Both render on the public /classes page and were unbounded, so a
  // 100,000-character value was accepted and laid out.
  it("rejects an over-long title", () => {
    expect(
      classContentSchema.safeParse({
        title: "a".repeat(MAX_SINGLE_LINE_LENGTH + 1),
        description: "ok",
      }).success,
    ).toBe(false);
  });

  it("rejects an over-long description", () => {
    expect(
      classContentSchema.safeParse({
        title: "ok",
        description: "a".repeat(MAX_DESCRIPTION_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  // Trimming happens before the length check, so a value is judged on what
  // would actually be stored and rendered.
  it("trims both fields and rejects a whitespace-only title", () => {
    expect(
      classContentSchema.parse({ title: "  ok  ", description: "  body  " }),
    ).toEqual({ title: "ok", description: "body" });
    expect(
      classContentSchema.safeParse({ title: "   ", description: "ok" }).success,
    ).toBe(false);
  });
});

describe("sessionInputSchema", () => {
  it("coerces an ISO datetime string to a Date", () => {
    const iso = "2026-07-01T18:30:00.000Z";
    const parsed = sessionInputSchema.parse({ startTime: iso });
    expect(parsed.startTime).toBeInstanceOf(Date);
    expect(parsed.startTime.toISOString()).toBe(iso);
  });

  it("rejects an invalid date string", () => {
    expect(
      sessionInputSchema.safeParse({ startTime: "not-a-date" }).success,
    ).toBe(false);
  });

  it("requires startTime", () => {
    expect(sessionInputSchema.safeParse({}).success).toBe(false);
  });

  it("allows endTime and location to be omitted", () => {
    const parsed = sessionInputSchema.parse({
      startTime: "2026-07-01T18:30:00.000Z",
    });
    expect(parsed.endTime).toBeUndefined();
    expect(parsed.location).toBeUndefined();
  });

  it("allows endTime and location to be explicitly null", () => {
    const parsed = sessionInputSchema.parse({
      startTime: "2026-07-01T18:30:00.000Z",
      endTime: null,
      location: null,
    });
    expect(parsed.endTime).toBeNull();
    expect(parsed.location).toBeNull();
  });

  it("coerces a valid endTime string to a Date", () => {
    const parsed = sessionInputSchema.parse({
      startTime: "2026-07-01T18:30:00.000Z",
      endTime: "2026-07-01T20:30:00.000Z",
    });
    expect(parsed.endTime).toBeInstanceOf(Date);
  });

  it("rejects an over-long location", () => {
    expect(
      sessionInputSchema.safeParse({
        startTime: "2026-07-01T18:30:00.000Z",
        location: "a".repeat(MAX_SINGLE_LINE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("trims a location before bounding it", () => {
    const parsed = sessionInputSchema.parse({
      startTime: "2026-07-01T18:30:00.000Z",
      location: `  ${"a".repeat(MAX_SINGLE_LINE_LENGTH)}  `,
    });
    expect(parsed.location).toBe("a".repeat(MAX_SINGLE_LINE_LENGTH));
  });
});

describe("sessionUpdateSchema", () => {
  it("requires a numeric id in addition to session fields", () => {
    const parsed = sessionUpdateSchema.parse({
      id: 7,
      startTime: "2026-07-01T18:30:00.000Z",
    });
    expect(parsed.id).toBe(7);
    expect(parsed.startTime).toBeInstanceOf(Date);
  });

  it("rejects a missing id", () => {
    expect(
      sessionUpdateSchema.safeParse({
        startTime: "2026-07-01T18:30:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects a fractional id", () => {
    expect(
      sessionUpdateSchema.safeParse({
        id: 7.5,
        startTime: "2026-07-01T18:30:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("photoInputSchema", () => {
  it("requires a non-empty s3Key", () => {
    expect(photoInputSchema.safeParse({ s3Key: "" }).success).toBe(false);
    expect(photoInputSchema.safeParse({}).success).toBe(false);
  });

  it("defaults sortOrder to 0 when omitted", () => {
    const parsed = photoInputSchema.parse({ s3Key: validPhotoKey });
    expect(parsed.sortOrder).toBe(0);
  });

  it("preserves an explicit sortOrder", () => {
    const parsed = photoInputSchema.parse({
      s3Key: validPhotoKey,
      sortOrder: 5,
    });
    expect(parsed.sortOrder).toBe(5);
  });

  it("allows caption to be omitted or null", () => {
    expect(
      photoInputSchema.parse({ s3Key: validPhotoKey }).caption,
    ).toBeUndefined();
    expect(
      photoInputSchema.parse({ s3Key: validPhotoKey, caption: null }).caption,
    ).toBeNull();
  });

  it("rejects a non-numeric sortOrder", () => {
    expect(
      photoInputSchema.safeParse({ s3Key: validPhotoKey, sortOrder: "1" })
        .success,
    ).toBe(false);
  });

  // This schema and photoReorderSchema write the same column. Reorder derives
  // sortOrder as an array index, so it is always a clean 0-based integer; this
  // path used to accept anything a bare z.number() accepts into the same place.
  it.each([
    ["a negative sortOrder", -5],
    ["a fractional sortOrder", 2.7],
    ["a sortOrder past the Int ceiling", 1e308],
  ])("rejects %s", (_label, sortOrder) => {
    expect(
      photoInputSchema.safeParse({ s3Key: validPhotoKey, sortOrder }).success,
    ).toBe(false);
  });

  it("rejects an over-long caption", () => {
    expect(
      photoInputSchema.safeParse({
        s3Key: validPhotoKey,
        caption: "a".repeat(MAX_SINGLE_LINE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("trims a caption before bounding it", () => {
    const parsed = photoInputSchema.parse({
      s3Key: validPhotoKey,
      caption: `  ${"a".repeat(MAX_SINGLE_LINE_LENGTH)}  `,
    });
    expect(parsed.caption).toBe("a".repeat(MAX_SINGLE_LINE_LENGTH));
  });

  it("accepts an s3Key under the class media prefix", () => {
    expect(photoInputSchema.safeParse({ s3Key: validPhotoKey }).success).toBe(
      true,
    );
  });

  it("rejects an s3Key outside the class media prefix", () => {
    expect(
      photoInputSchema.safeParse({ s3Key: "recipe-media/x.jpg" }).success,
    ).toBe(false);
    expect(photoInputSchema.safeParse({ s3Key: "uploads/a.jpg" }).success).toBe(
      false,
    );
  });
});

describe("photoUpdateSchema", () => {
  it("requires a numeric id and still defaults sortOrder", () => {
    const parsed = photoUpdateSchema.parse({ id: 3, s3Key: validPhotoKey });
    expect(parsed.id).toBe(3);
    expect(parsed.sortOrder).toBe(0);
  });

  it("rejects a missing id", () => {
    expect(photoUpdateSchema.safeParse({ s3Key: validPhotoKey }).success).toBe(
      false,
    );
  });

  it("rejects a fractional id", () => {
    expect(
      photoUpdateSchema.safeParse({ id: 3.5, s3Key: validPhotoKey }).success,
    ).toBe(false);
  });

  it("accepts an s3Key under the class media prefix", () => {
    expect(
      photoUpdateSchema.safeParse({ id: 3, s3Key: validPhotoKey }).success,
    ).toBe(true);
  });

  it("rejects an s3Key outside the class media prefix", () => {
    expect(
      photoUpdateSchema.safeParse({ id: 3, s3Key: "recipe-media/x.jpg" })
        .success,
    ).toBe(false);
  });
});

describe("photoReorderSchema", () => {
  it("accepts an ordered list of ids", () => {
    expect(photoReorderSchema.parse({ ids: [3, 1, 2] }).ids).toEqual([3, 1, 2]);
  });

  it("rejects an empty list", () => {
    expect(photoReorderSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["a negative id", -1],
    ["a fractional id", 1.5],
    ["a value above the Int ceiling", MAX_INT4 + 1],
  ])("rejects %s in the list", (_label, id) => {
    expect(photoReorderSchema.safeParse({ ids: [id] }).success).toBe(false);
  });

  // Each entry becomes one update statement inside a single transaction, and
  // the service filters by ownership rather than by uniqueness - so one owned
  // id repeated 100,000 times was 100,000 statements in one transaction.
  it("rejects a list longer than the reorder bound", () => {
    const ids = Array.from({ length: MAX_REORDER_IDS + 1 }, () => 1);
    expect(photoReorderSchema.safeParse({ ids }).success).toBe(false);
  });

  it("accepts a list at the reorder bound", () => {
    const ids = Array.from({ length: MAX_REORDER_IDS }, (_v, i) => i + 1);
    expect(photoReorderSchema.safeParse({ ids }).success).toBe(true);
  });
});
