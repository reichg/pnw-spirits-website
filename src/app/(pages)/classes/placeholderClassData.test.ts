import { describe, expect, it } from "vitest";

import {
  classContentSchema,
  sessionInputSchema,
} from "@/services/classes/classSchemas";

import {
  placeholderClass,
  placeholderPhotos,
  placeholderSessions,
} from "./placeholderClassData";

describe("placeholderClass", () => {
  it("parses against the class content contract", () => {
    expect(classContentSchema.safeParse(placeholderClass).success).toBe(true);
  });
});

describe("placeholderSessions", () => {
  it("is non-empty", () => {
    expect(placeholderSessions.length).toBeGreaterThan(0);
  });

  it("every entry parses against the session input contract", () => {
    for (const session of placeholderSessions) {
      const result = sessionInputSchema.safeParse({
        startTime: session.startTime,
        endTime: session.endTime,
        location: session.location,
      });
      expect(result.success).toBe(true);
    }
  });

  it("has a numeric, unique id on every entry", () => {
    const ids = placeholderSessions.map((session) => session.id);
    for (const id of ids) {
      expect(typeof id).toBe("number");
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("placeholderPhotos", () => {
  it("is non-empty", () => {
    expect(placeholderPhotos.length).toBeGreaterThan(0);
  });

  it("has a numeric, unique id on every entry", () => {
    const ids = placeholderPhotos.map((photo) => photo.id);
    for (const id of ids) {
      expect(typeof id).toBe("number");
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a non-empty s3Key on every entry", () => {
    for (const photo of placeholderPhotos) {
      expect(typeof photo.s3Key).toBe("string");
      expect(photo.s3Key.length).toBeGreaterThan(0);
    }
  });

  it("has a caption that is a string or null on every entry", () => {
    for (const photo of placeholderPhotos) {
      const caption = photo.caption;
      expect(caption === null || typeof caption === "string").toBe(true);
    }
  });
});
