import { z } from "zod";

import { sendContactEmail } from "@/utils/email";
import { logger } from "@/utils/logger";

import { CONTACT_CATEGORY_LABELS, contactMessageSchema } from "./contactSchemas";

const LOG_CONTEXT = "services/contact";

/** Result of attempting to process a contact submission. */
export type SubmitContactMessageResult =
  | { status: "sent" }
  | { status: "invalid"; issues: z.core.$ZodIssue[] };

/**
 * Single business-logic entry point for contact form submissions.
 *
 * Validates untrusted input against the shared contact schema, then delivers
 * the message via email. Validation failures are returned so the API route can
 * map them to a 400; delivery failures are re-thrown so the route maps them to
 * a safe 500. PII (name, email, phone, message) is never logged.
 */
export async function submitContactMessage(
  raw: unknown,
): Promise<SubmitContactMessageResult> {
  const parsed = contactMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues };
  }

  const { name, email, phone, category, message } = parsed.data;
  const categoryLabel = CONTACT_CATEGORY_LABELS[category];

  try {
    await sendContactEmail({ name, email, phone, categoryLabel, message });
  } catch (error) {
    logger.error("Contact message delivery failed", {
      context: LOG_CONTEXT,
      data: error,
    });
    throw error;
  }

  logger.info("Contact message sent", {
    context: LOG_CONTEXT,
    data: { category },
  });

  return { status: "sent" };
}
