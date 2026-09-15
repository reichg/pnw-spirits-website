// API route for /api/subscribers

import { requireAdmin } from "@/utils/auth";
import { sendSubscribeEmail } from "@/utils/email";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * List every subscriber. Admin-only: the rows carry subscribers' names and
 * email addresses, so this is a bulk read of personal data and must never be
 * reachable anonymously.
 */
export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  try {
    const subscribers = await prisma.subscriber.findMany({
      orderBy: { subscribedAt: "desc" },
    });
    return NextResponse.json({ subscribers });
  } catch (error) {
    logger.error("Failed to list subscribers", {
      context: "api/subscribers",
      data: error,
    });
    return NextResponse.json(
      { error: "Failed to list subscribers" },
      { status: 500 },
    );
  }
}

/**
 * Public subscribe endpoint, backing the site's subscribe form. Intentionally
 * ungated: anonymous visitors are the only callers.
 */
export async function POST(req: NextRequest) {
  // Add subscriber
  try {
    const data = await req.json();
    const { firstName, lastName, email } = data;
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already subscribed" },
        { status: 409 },
      );
    }
    const subscriber = await prisma.subscriber.create({
      data: { firstName, lastName, email },
    });
    try {
      await sendSubscribeEmail(email, firstName);
    } catch (e) {
      // Log but don't fail the request if email sending fails
      console.error("Failed to send welcome email:", e);
    }
    return NextResponse.json(subscriber, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add subscriber" },
      { status: 500 },
    );
  }
}
