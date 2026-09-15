/**
 * Single source of truth for the admin JWT secret, shared by the signer
 * (`services/admin/adminService`) and the verifier (`utils/auth`) so the two can
 * never drift apart.
 *
 * Deliberately free of `next/server` imports: `adminService` is also imported by
 * `prisma/seed.ts`, which runs outside the Next runtime.
 */

/**
 * Non-production fallback. Publicly known by definition, which is exactly why
 * production must never reach it.
 */
const DEV_FALLBACK_SECRET = "secret";

/**
 * Resolve the secret used to sign and verify admin tokens.
 *
 * Production fails closed: falling back to a known literal there would make
 * every admin token forgeable by anyone, turning admin-only endpoints into
 * unauthenticated ones. Outside production the fallback is kept so local dev,
 * the seed, and the test suite work with no setup.
 *
 * @throws Error when `JWT_SECRET` is unset and `NODE_ENV` is "production".
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return DEV_FALLBACK_SECRET;
}
