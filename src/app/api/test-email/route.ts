import { sendSubscribeEmail } from "@/utils/email";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { to, firstName } = await req.json();
    if (!to || !firstName) {
      return NextResponse.json(
        { error: "Missing to or firstName" },
        { status: 400 },
      );
    }
    await sendSubscribeEmail(to, firstName);
    return NextResponse.json({ message: "Test email sent" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send test email", details: String(error) },
      { status: 500 },
    );
  }
}
