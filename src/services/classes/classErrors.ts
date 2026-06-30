/**
 * Centralized classification of class-service errors into safe HTTP responses.
 *
 * Routes must never branch on raw error text or leak provider internals. Every
 * class route funnels caught errors through {@link mapClassServiceError}, which
 * returns only a status code and a friendly, client-safe message (never the
 * underlying `err.message` or a stack).
 *
 * The service throws the named error classes below; the mapper also duck-types
 * the Prisma "record not found" code (`P2025`) so update/delete against a
 * missing row maps to 404 without importing generated-client internals.
 */

/**
 * Thrown by create paths when the singleton class page has not been saved yet.
 * Sessions and photos cannot be attached before class content exists.
 */
export class NoClassPageError extends Error {
  constructor(message = "No class page exists yet; save class content first") {
    super(message);
    this.name = "NoClassPageError";
  }
}

/** Thrown when a targeted class entity (session or photo) does not exist. */
export class ClassNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "ClassNotFoundError";
  }
}

/** Duck-type the Prisma "record not found" error without importing the client. */
function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
  );
}

/**
 * Map any class-service error to a safe HTTP status and message.
 *
 * - No class page saved yet -> 409
 * - Targeted entity missing (service error or Prisma P2025) -> 404
 * - Everything else -> 500 with a generic message
 *
 * Returned messages are always friendly and client-safe; raw error text and
 * stacks are never surfaced. Callers should still log the full error
 * server-side before responding.
 */
export function mapClassServiceError(err: unknown): {
  status: number;
  message: string;
} {
  if (err instanceof NoClassPageError) {
    return { status: 409, message: "Save class content before adding this." };
  }

  if (err instanceof ClassNotFoundError || isPrismaNotFound(err)) {
    return { status: 404, message: "Resource not found." };
  }

  return { status: 500, message: "Something went wrong. Please try again." };
}
