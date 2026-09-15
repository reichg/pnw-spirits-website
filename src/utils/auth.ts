import { getJwtSecret } from "@/utils/jwtSecret";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

/**
 * Outcome of inspecting the request's Bearer token, shared by every admin check:
 * - "admin"      -> valid token whose role is "admin"
 * - "non-admin"  -> valid token, but role is not "admin"
 * - "missing"    -> absent/empty/malformed Authorization header
 * - "unverified" -> token present but failed signature verification
 *
 * "missing" and "unverified" are split only so requireAdmin can preserve its
 * historical 401 response bodies; isAdmin treats both as "not an admin".
 */
type AdminTokenStatus = "admin" | "non-admin" | "missing" | "unverified";

/** Single source of truth for admin token verification. Never throws. */
function checkAdminToken(req: NextRequest): AdminTokenStatus {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return "missing";
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return "missing";
  }
  try {
    // Shared with the admin login service's signing secret. getJwtSecret throws
    // in production when JWT_SECRET is unset; that lands in the catch below and
    // fails closed, so a misconfigured deployment denies rather than accepting
    // tokens signed with a publicly-known fallback. Anonymous callers never
    // reach here (they return "missing" above), so a public endpoint consuming
    // isAdmin still serves them normally.
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === "object" && decoded !== null && decoded.role === "admin") {
      return "admin";
    }
    return "non-admin";
  } catch {
    return "unverified";
  }
}

/**
 * Non-blocking soft check: returns true IFF a valid Bearer JWT with role "admin"
 * is present. Fails closed (false) for any other case and never throws or returns
 * a response. Suitable for endpoints that serve both anonymous and admin callers.
 */
export function isAdmin(req: NextRequest): boolean {
  return checkAdminToken(req) === "admin";
}

export function requireAdmin(req: NextRequest) {
  switch (checkAdminToken(req)) {
    case "admin":
      return null; // Authorized
    case "non-admin":
      // Valid token but not an admin role -> 403 Forbidden.
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    case "missing":
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    default:
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
