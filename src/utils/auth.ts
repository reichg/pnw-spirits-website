import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Verification secret must match the admin login service's signing secret.
    // The "secret" fallback keeps local dev working when JWT_SECRET is unset;
    // production MUST set JWT_SECRET (a default secret is forgeable).
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    if (typeof decoded === "object" && decoded !== null && decoded.role === "admin") {
      return null; // Authorized
    }
    // Valid token but not an admin role -> 403 Forbidden.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
