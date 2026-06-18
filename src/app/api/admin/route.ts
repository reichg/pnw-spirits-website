// API route for /api/admin
import {
  authenticateAdmin,
  DEFAULT_ADMIN_ENABLED,
  ensureDefaultAdmin,
} from "@/services/admin/adminService";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Admin login
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 },
      );
    }
    // Feature-flag gated auto-provision (Standard D): guarantee the default
    // admin exists before authenticating so it works on a fresh database.
    if (DEFAULT_ADMIN_ENABLED) {
      await ensureDefaultAdmin();
    }
    const result = await authenticateAdmin(username, password);
    if (!result) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }
    return NextResponse.json({
      token: result.token,
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
      },
    });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
