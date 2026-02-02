// API route for /api/subscribers

import { sendSubscribeEmail } from "@/utils/email";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // List subscribers (admin)
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { subscribedAt: "desc" },
  });
  return NextResponse.json({ subscribers });
}

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
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add subscriber" },
      { status: 500 },
    );
  }
}
