import { sessionInputSchema } from "@/services/classes/classSchemas";
import type { ZodError } from "zod";

/**
 * Request contract for the two session write routes: the shared
 * `sessionInputSchema` plus the cross-field rule its per-field checks cannot
 * express.
 *
 * `startTime` and `endTime` are each individually valid in an inverted range,
 * so nothing rejected `9:00 PM - 8:00 PM`: the row persisted and rendered on the
 * public /classes page. The rule belongs on the contract rather than in a
 * handler branch so `parsed.data` is *proven* to carry a sane range before it
 * reaches the service, on both verbs, by construction.
 *
 * It lives beside the routes rather than in `classSchemas.ts` because that
 * module is the service layer's shared contract. Promoting the rule to a
 * service-enforced domain invariant would also cover the seed and any future
 * non-HTTP caller and is the better long-term home; until then this closes the
 * HTTP trust boundary, which is where untrusted input actually arrives.
 */

/**
 * Rendered verbatim in the admin UI, so it must stay one short line:
 * `readAdminError` discards an `{ error }` string that is multi-line or over 200
 * characters and substitutes a generic fallback, which would hide the cause.
 */
export const SESSION_TIME_RANGE_MESSAGE = "End time must be after start time.";

/** Shape-failure message used by every sibling class route. */
const INVALID_INPUT_MESSAGE = "Invalid input";

export const sessionRequestSchema = sessionInputSchema.refine(
  // A zero-length session is rejected alongside the inverted one: a class that
  // ends at the moment it begins is as meaningless on the public page as one
  // that ends before it. An absent or null `endTime` stays legal - an
  // open-ended session is a real thing the admin can publish.
  ({ startTime, endTime }) => endTime == null || endTime > startTime,
  { message: SESSION_TIME_RANGE_MESSAGE, path: ["endTime"] },
);

/**
 * Top-level `{ error }` message for a rejected session body.
 *
 * Zod skips a schema-level refinement when the object's own field checks
 * failed, so a `custom` issue here can only be the time-range rule. That is the
 * one failure whose cause is invisible in the admin UI, which renders `error`
 * and never `details`; shape failures keep the generic message so the response
 * shape stays identical to the sibling class routes.
 */
export function sessionBodyErrorMessage(error: ZodError): string {
  const crossField = error.issues.find((issue) => issue.code === "custom");
  return crossField?.message ?? INVALID_INPUT_MESSAGE;
}
