import prisma from "@/utils/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

// Require a super admin token for security
const SUPER_ADMIN_TOKEN = process.env.SUPER_ADMIN_TOKEN;
const ADMIN_TOKEN = process.env.TOKEN_HEADER;

export async function POST(req: NextRequest) {
  try {
    // Check for super admin token in header
    const token = req.headers.get(ADMIN_TOKEN!);
    if (!token || token !== SUPER_ADMIN_TOKEN) {
      return NextResponse.json(
        { error: "Forbidden: Invalid token" },
        { status: 403 },
      );
    }

    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    const existing = await prisma.user.findFirst({
      where: { username },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 },
      );
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, role: "admin" },
    });
    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to create admin user" },
      { status: 500 },
    );
  }
}
