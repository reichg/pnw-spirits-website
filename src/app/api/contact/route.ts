// API route for /api/contact (public, unauthenticated visitor contact form)

import { submitContactMessage } from "@/services/contact/contactService";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await submitContactMessage(body);

    if (result.status === "invalid") {
      return NextResponse.json(
        { error: "Invalid input", details: result.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ status: "sent" }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
