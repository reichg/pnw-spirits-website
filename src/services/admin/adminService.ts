import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * Service layer for admin authentication.
 *
 * Centralizes admin credential logic shared by the login route and the Prisma
 * seed (Standard C: business logic lives in services/). Callers own their own
 * try/catch and HTTP/exit handling; this module returns plain values and lets
 * raw Prisma/bcrypt errors propagate so they are never leaked client-side here.
 */

const CONTEXT = "adminService";

/** Default credentials used only when seeding a fresh environment. */
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "adminpass";

/** bcrypt cost factor, matching the existing admin create route. */
const BCRYPT_ROUNDS = 10;

/** Admin role value, matching the User model default. */
const ADMIN_ROLE = "admin";

/** JWT settings, matching the existing /api/admin login route exactly. */
const JWT_FALLBACK_SECRET = "secret";
const JWT_EXPIRES_IN = "30m";

/**
 * Whether the default admin bootstrap is enabled. Enabled by default; set
 * ENABLE_DEFAULT_ADMIN="false" to opt out (e.g. in environments that provision
 * admins another way). This is a feature flag for the seed path (Standard D).
 */
export const DEFAULT_ADMIN_ENABLED: boolean =
  process.env.ENABLE_DEFAULT_ADMIN !== "false";

/**
 * Idempotently ensure a default admin user exists. Safe to call repeatedly
 * (e.g. from a seed): the empty `update: {}` is intentional NO-CLOBBER — if an
 * admin already exists we must never overwrite its (possibly rotated) password.
 */
export async function ensureDefaultAdmin(): Promise<void> {
  const username = process.env.DEFAULT_ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME;
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { username },
    // No-clobber: never overwrite an existing admin's stored password.
    update: {},
    create: { username, password: hashed, role: ADMIN_ROLE },
  });

  logger.info("Default admin ensured", {
    context: CONTEXT,
    data: { username },
  });
}

/**
 * Authenticate admin credentials and issue a JWT. Returns null on unknown
 * username or bad password so callers can map both to one generic response
 * (avoiding user enumeration). Token shape matches the existing login route.
 */
export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<{
  token: string;
  user: { id: number; username: string; role: string };
} | null> {
  const user = await prisma.user.findFirst({ where: { username } });
  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return null;
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET || JWT_FALLBACK_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role },
  };
}
