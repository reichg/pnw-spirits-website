import { requireAdmin } from "@/utils/auth";
import { sendNewsletterBatch, sendNewsletterEmail } from "@/utils/email";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const NewsletterSchema = z
  .object({
    mode: z.enum(["all", "test"]).default("all"),
    subject: z.string().trim().min(1).max(160),
    html: z.string().trim().min(1),
    replyTo: z.string().email().optional(),
  })
  .strict();

function normalizeNewsletterContent(html: string) {
  const normalizedHtml = html.trim();
  const textFromHtml = normalizedHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { html: normalizedHtml, text: textFromHtml || undefined };
}

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  try {
    const body = await req.json();
    const parsed = NewsletterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const content = normalizeNewsletterContent(parsed.data.html);

    if (parsed.data.mode === "test") {
      const testRecipient = process.env.NEWSLETTER_TEST_EMAIL?.trim();

      if (!testRecipient) {
        return NextResponse.json(
          {
            error: "Missing test recipient. Set NEWSLETTER_TEST_EMAIL.",
          },
          { status: 500 },
        );
      }

      await sendNewsletterEmail({
        to: testRecipient,
        subject: parsed.data.subject,
        html: content.html,
        text: content.text,
        replyTo: parsed.data.replyTo,
      });

      logger.info("Newsletter test email sent", {
        context: "api/admin/newsletter",
        data: {
          subject: parsed.data.subject,
          recipient: testRecipient,
        },
      });

      return NextResponse.json({
        status: "test_sent",
        message: "Test email sent successfully",
        testRecipient,
        totalSubscribers: 1,
        attempted: 1,
        sent: 1,
        failed: 0,
        failures: [],
      });
    }

    const subscribers = await prisma.subscriber.findMany({
      select: {
        id: true,
        email: true,
      },
      orderBy: { subscribedAt: "desc" },
    });

    if (subscribers.length === 0) {
      return NextResponse.json({
        status: "no_subscribers",
        totalSubscribers: 0,
        attempted: 0,
        sent: 0,
        failed: 0,
        failures: [],
      });
    }

    logger.info("Newsletter blast started", {
      context: "api/admin/newsletter",
      data: {
        subject: parsed.data.subject,
        totalSubscribers: subscribers.length,
      },
    });

    const failures = await sendNewsletterBatch({
      recipients: subscribers,
      subject: parsed.data.subject,
      html: content.html,
      text: content.text,
      replyTo: parsed.data.replyTo,
      batchSize: 20,
    });

    const attempted = subscribers.length;
    const failed = failures.length;
    const sent = attempted - failed;

    if (failed > 0) {
      logger.warn("Newsletter blast completed with failures", {
        context: "api/admin/newsletter",
        data: { attempted, sent, failed },
      });
    } else {
      logger.info("Newsletter blast completed", {
        context: "api/admin/newsletter",
        data: { attempted, sent, failed },
      });
    }

    return NextResponse.json({
      status: failed > 0 ? "partial_success" : "success",
      totalSubscribers: attempted,
      attempted,
      sent,
      failed,
      failures,
    });
  } catch (error) {
    logger.error("Newsletter blast failed", {
      context: "api/admin/newsletter",
      data: error,
    });
    return NextResponse.json(
      { error: "Failed to send newsletter" },
      { status: 500 },
    );
  }
}
