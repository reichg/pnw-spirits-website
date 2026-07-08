import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock nodemailer so no real SMTP connection or send occurs. vi.hoisted exposes
// the sendMail spy before the hoisted vi.mock factory runs, matching the style
// used in contactService.test.ts. createTransport returns a transporter whose
// sendMail we can inspect to capture the exact payload sendContactEmail builds.
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

import { sendContactEmail } from "./email";

type SendMailPayload = {
  from?: string;
  to?: string;
  replyTo?: string;
  subject?: string;
  text?: string;
  html?: string;
};

const RECIPIENT = "owner@pnwspirits.test";

const validInput = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  categoryLabel: "Hire for an event",
  message: "I would like to book an event.\nSecond line.",
};

// Snapshot and restore the env keys this function reads so tests stay isolated.
const ENV_KEYS = [
  "CONTACT_RECIPIENT_EMAIL",
  "EMAIL_SUBSCRIBER",
  "EMAIL_FROM",
  "CONTACT_FROM_EMAIL",
  "EMAIL_SMTP_USER",
] as const;

let savedEnv: Record<string, string | undefined>;

function lastPayload(): SendMailPayload {
  const calls = sendMail.mock.calls;
  return calls[calls.length - 1][0] as SendMailPayload;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.CONTACT_RECIPIENT_EMAIL = RECIPIENT;
  vi.clearAllMocks();
  sendMail.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("sendContactEmail", () => {
  it("sends once and delivers to the configured recipient", async () => {
    await expect(sendContactEmail(validInput)).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(lastPayload().to).toBe(RECIPIENT);
  });

  it("sets subject from the category label and replyTo to the sender email", async () => {
    await sendContactEmail(validInput);

    const payload = lastPayload();
    expect(payload.subject).toBe(`New contact message: ${validInput.categoryLabel}`);
    expect(payload.replyTo).toBe(validInput.email);
  });

  it("includes all fields and the message in both text and html bodies", async () => {
    await sendContactEmail(validInput);

    const { text, html } = lastPayload();
    for (const body of [text ?? "", html ?? ""]) {
      expect(body).toContain(validInput.name);
      expect(body).toContain(validInput.email);
      expect(body).toContain(validInput.phone);
      expect(body).toContain(validInput.categoryLabel);
      // The message content survives into both bodies (html turns \n into <br>).
      expect(body).toContain("I would like to book an event.");
      expect(body).toContain("Second line.");
    }
  });

  it('shows "Not provided" for a missing phone in both bodies', async () => {
    await sendContactEmail({ ...validInput, phone: null });

    const { text, html } = lastPayload();
    expect(text).toContain("Not provided");
    expect(html).toContain("Not provided");
  });

  it('shows "Not provided" for a blank/whitespace phone', async () => {
    await sendContactEmail({ ...validInput, phone: "   " });

    const { text, html } = lastPayload();
    expect(text).toContain("Not provided");
    expect(html).toContain("Not provided");
  });

  it("escapes HTML-significant characters in untrusted values (no raw injection)", async () => {
    const payload = `<script>alert(1)</script>&"'`;
    await sendContactEmail({ ...validInput, name: payload, message: payload });

    const { html } = lastPayload();
    expect(html).toBeDefined();
    const body = html ?? "";

    // Raw dangerous markup must never reach the HTML body.
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("</script>");

    // Each HTML-significant character is present in escaped form.
    expect(body).toContain("&lt;");
    expect(body).toContain("&gt;");
    expect(body).toContain("&amp;");
    expect(body).toContain("&quot;");
    expect(body).toContain("&#39;");
  });

  it("strips CR/LF from header fields to prevent header injection", async () => {
    await sendContactEmail({
      ...validInput,
      email: "jane@example.com\r\nBcc: attacker@evil.test",
      categoryLabel: "Hire\r\nX-Injected: yes",
    });

    const { subject, replyTo } = lastPayload();
    expect(subject).not.toMatch(/[\r\n]/);
    expect(replyTo).not.toMatch(/[\r\n]/);
    // Sanitizer collapses the control chars to spaces rather than dropping text.
    expect(replyTo).toContain("jane@example.com");
    expect(subject).toContain("Hire");
  });

  it("throws when no recipient env var is configured", async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    await expect(sendContactEmail(validInput)).rejects.toThrow(
      "Contact recipient email is not configured",
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
