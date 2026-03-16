import { requireAdmin } from "@/utils/auth";
import { sendNewsletterBatch } from "@/utils/email";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const NewsletterSchema = z
  .object({
    subject: z.string().trim().min(1).max(160),
    html: z.string().trim().optional(),
    text: z.string().trim().min(1).optional(),
    replyTo: z.string().email().optional(),
  })
  .refine((data) => Boolean(data.html || data.text), {
    message: "Provide HTML or plain text content",
    path: ["html"],
  });

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeNewsletterContent(html?: string, text?: string) {
  const normalizedHtml = html?.trim();
  const normalizedText = text?.trim();
  if (normalizedHtml && normalizedText) {
    return { html: normalizedHtml, text: normalizedText };
  }
  if (normalizedHtml) {
    const textFromHtml = normalizedHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { html: normalizedHtml, text: textFromHtml || undefined };
  }

  const escapedText = escapeHtml(normalizedText || "");
  return {
    html: `<p>${escapedText.replace(/\r?\n/g, "<br />")}</p>`,
    text: normalizedText,
  };
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

    const content = normalizeNewsletterContent(
      parsed.data.html,
      parsed.data.text,
    );

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
