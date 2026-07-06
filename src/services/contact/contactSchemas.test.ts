import { describe, expect, it } from "vitest";

import { contactMessageSchema } from "./contactSchemas";

// A fully valid submission reused across cases; individual tests override the
// single field under test so failures point at one rule at a time.
const validInput = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  category: "hire_event" as const,
  message: "I would like to book an event.",
};

describe("contactMessageSchema", () => {
  it("accepts a fully valid input and returns typed data", () => {
    const parsed = contactMessageSchema.parse(validInput);
    expect(parsed).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      category: "hire_event",
      message: "I would like to book an event.",
    });
  });

  it("trims name, email, and message", () => {
    const parsed = contactMessageSchema.parse({
      ...validInput,
      name: "  Jane Doe  ",
      email: "  jane@example.com  ",
      message: "  hello there  ",
    });
    expect(parsed.name).toBe("Jane Doe");
    expect(parsed.email).toBe("jane@example.com");
    expect(parsed.message).toBe("hello there");
  });

  describe("phone normalization", () => {
    it("normalizes an empty-string phone to undefined", () => {
      const parsed = contactMessageSchema.parse({ ...validInput, phone: "" });
      expect(parsed.phone).toBeUndefined();
    });

    it("normalizes a whitespace-only phone to undefined", () => {
      const parsed = contactMessageSchema.parse({
        ...validInput,
        phone: "   ",
      });
      expect(parsed.phone).toBeUndefined();
    });

    it("treats an omitted phone as undefined", () => {
      const parsed = contactMessageSchema.parse({
        name: validInput.name,
        email: validInput.email,
        category: validInput.category,
        message: validInput.message,
      });
      expect(parsed.phone).toBeUndefined();
    });

    it("preserves a provided phone (trimmed)", () => {
      const parsed = contactMessageSchema.parse({
        ...validInput,
        phone: "  555-1234  ",
      });
      expect(parsed.phone).toBe("555-1234");
    });
  });

  describe("rejections", () => {
    it("rejects a missing name", () => {
      expect(
        contactMessageSchema.safeParse({
          email: validInput.email,
          phone: validInput.phone,
          category: validInput.category,
          message: validInput.message,
        }).success,
      ).toBe(false);
    });

    it("rejects an empty name", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, name: "" }).success,
      ).toBe(false);
    });

    it("rejects a blank (whitespace-only) name", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, name: "   " }).success,
      ).toBe(false);
    });

    it("rejects a name longer than 120 chars", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, name: "a".repeat(121) })
          .success,
      ).toBe(false);
    });

    it("rejects an invalid email", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, email: "not-an-email" })
          .success,
      ).toBe(false);
    });

    it("rejects an email longer than 200 chars", () => {
      const longEmail = `${"a".repeat(200)}@example.com`;
      expect(
        contactMessageSchema.safeParse({ ...validInput, email: longEmail })
          .success,
      ).toBe(false);
    });

    it("rejects an empty message", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, message: "" }).success,
      ).toBe(false);
    });

    it("rejects a message longer than 5000 chars", () => {
      expect(
        contactMessageSchema.safeParse({
          ...validInput,
          message: "a".repeat(5001),
        }).success,
      ).toBe(false);
    });

    it("rejects an invalid category", () => {
      expect(
        contactMessageSchema.safeParse({
          ...validInput,
          category: "not_a_category",
        }).success,
      ).toBe(false);
    });

    it("rejects a phone longer than 40 chars", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, phone: "1".repeat(41) })
          .success,
      ).toBe(false);
    });

    it("rejects unknown/extra keys (.strict())", () => {
      expect(
        contactMessageSchema.safeParse({ ...validInput, nickname: "JD" })
          .success,
      ).toBe(false);
    });
  });
});
