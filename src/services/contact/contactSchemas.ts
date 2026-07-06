import { z } from "zod";

/**
 * Shared Zod contracts for the Contact Form feature.
 *
 * Single source of truth imported by the service layer, the API route, and the
 * frontend so all three reuse ONE contract. Keeping the schema, category values,
 * and display labels here prevents drift between validation and the UI options.
 */

/** Reason a visitor is reaching out; also the allowed `category` values. */
export const CONTACT_CATEGORIES = [
  "hire_event",
  "feedback",
  "general",
  "other",
] as const;

/** Human-readable label for each contact category, for use in the UI. */
export const CONTACT_CATEGORY_LABELS: Record<
  (typeof CONTACT_CATEGORIES)[number],
  string
> = {
  hire_event: "Hire for an event",
  feedback: "Feedback",
  general: "General inquiry",
  other: "Other",
};

/**
 * A submitted contact message. `.strict()` rejects unknown keys at the trust
 * boundary. `phone` is optional and an empty string is normalized to
 * `undefined` so blank input is treated as absent rather than a "" value.
 */
export const contactMessageSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v ? v : undefined)),
    category: z.enum(CONTACT_CATEGORIES),
    message: z.string().trim().min(1).max(5000),
  })
  .strict();

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
