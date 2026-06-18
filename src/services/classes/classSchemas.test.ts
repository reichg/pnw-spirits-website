import { describe, expect, it } from "vitest";

import {
  CLASS_MEDIA_PREFIX,
  classContentSchema,
  photoInputSchema,
  photoUpdateSchema,
  sessionInputSchema,
  sessionUpdateSchema,
} from "./classSchemas";

const validPhotoKey = `${CLASS_MEDIA_PREFIX}album/photo.jpg`;

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

  it("accepts an s3Key under the class media prefix", () => {
    expect(photoInputSchema.safeParse({ s3Key: validPhotoKey }).success).toBe(
      true,
    );
  });

  it("rejects an s3Key outside the class media prefix", () => {
    expect(
      photoInputSchema.safeParse({ s3Key: "recipe-media/x.jpg" }).success,
    ).toBe(false);
    expect(
      photoInputSchema.safeParse({ s3Key: "uploads/a.jpg" }).success,
    ).toBe(false);
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
