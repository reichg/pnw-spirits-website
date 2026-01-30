import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    if (typeof decoded === "object" && decoded.role === "admin") {
      return null; // Authorized
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
