import nodemailer from "nodemailer";

type SendNewsletterEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type NewsletterRecipient = {
  id: number;
  email: string;
};

type SendNewsletterBatchInput = {
  recipients: NewsletterRecipient[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  batchSize?: number;
};

type NewsletterFailure = {
  subscriberId: number;
  email: string;
  error: string;
};

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: process.env.EMAIL_SMTP_SECURE === "true", // expects string 'true' or 'false'
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    },
  });
}

export async function sendSubscribeEmail(to: string, firstName: string) {
  const transporter = createTransporter();

  // Send welcome email to the new subscriber
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
    to,
    subject: "Welcome to The PNW Spirits Community!",
    text: `Hi ${firstName},

Thanks for joining The PNW Spirits community. We’re excited to have you with us.
You’ve just subscribed to a corner of the Pacific Northwest where craft cocktails, delicious spirits, and creative recipes come together. Whether you’re here to sharpen your mixology skills, discover new bottles, or simply enjoy a good drink story, you’re in the right place.

Here’s what you can expect:
- New & classic cocktail recipes
- Spotlights on spirits that have caught my attention
- Tips & techniques
- Occasional behind‑the‑bar insights and experiments

If you want more entertainment? Follow us on Facebook & Instagram

I’m glad you’re here and cheers to great drinks ahead.
Welcome to the community,
The PNW Spirits`,
    html: `<p>Hi ${firstName},</p>
<p>Thanks for joining <b>The PNW Spirits</b> community. We’re excited to have you with us.<br>
You’ve just subscribed to a corner of the Pacific Northwest where craft cocktails, delicious spirits, and creative recipes come together. Whether you’re here to sharpen your mixology skills, discover new bottles, or simply enjoy a good drink story, you’re in the right place.</p>
<p><b>Here’s what you can expect:</b></p>
<ul>
  <li>New & classic cocktail recipes</li>
  <li>Spotlights on spirits that have caught my attention</li>
  <li>Tips & techniques</li>
  <li>Occasional behind‑the‑bar insights and experiments</li>
</ul>
<p>If you want more entertainment? Follow us on Facebook & Instagram</p>
<p>I’m glad you’re here and cheers to great drinks ahead.<br>
<br>
Welcome to the community,<br>
The PNW Spirits</p>`,
  });

  // Send notification email to EMAIL_SUBSCRIBER
  if (process.env.EMAIL_SUBSCRIBER) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
      to: process.env.EMAIL_SUBSCRIBER,
      subject: "New Newsletter Subscriber",
      text: `A new user has subscribed to the newsletter.\n\nEmail: ${to}\nFirst Name: ${firstName}`,
      html: `<p>A new user has subscribed to the newsletter.</p><ul><li><b>Email:</b> ${to}</li><li><b>First Name:</b> ${firstName}</li></ul>`,
    });
  }
}

export async function sendNewsletterEmail(input: SendNewsletterEmailInput) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return "Failed to send";
}

export async function sendNewsletterBatch(input: SendNewsletterBatchInput) {
  const transporter = createTransporter();
  const failures: NewsletterFailure[] = [];
  const batchSize = Math.max(1, input.batchSize ?? 20);

  for (let index = 0; index < input.recipients.length; index += batchSize) {
    const batch = input.recipients.slice(index, index + batchSize);
    const results = await Promise.allSettled(
      batch.map((recipient) =>
        transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
          to: recipient.email,
          replyTo: input.replyTo,
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      ),
    );

    results.forEach((result, batchIndex) => {
      if (result.status === "rejected") {
        failures.push({
          subscriberId: batch[batchIndex].id,
          email: batch[batchIndex].email,
          error: getErrorMessage(result.reason),
        });
      }
    });
  }

  return failures;
}

type SendContactEmailInput = {
  name: string;
  email: string;
  phone?: string | null;
  categoryLabel: string;
  message: string;
};

// Collapse CR/LF/tab control characters so untrusted values cannot inject
// additional email headers (subject, replyTo) via header injection.
function sanitizeHeader(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

// Escape HTML-significant characters before interpolating untrusted values
// into the HTML body to prevent markup/script injection.
function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendContactEmail(input: SendContactEmailInput): Promise<void> {
  const to =
    process.env.CONTACT_RECIPIENT_EMAIL ||
    process.env.EMAIL_SUBSCRIBER ||
    process.env.EMAIL_FROM;

  if (!to) {
    throw new Error("Contact recipient email is not configured");
  }

  const transporter = createTransporter();

  const safeEmail = sanitizeHeader(input.email);
  const safeCategory = sanitizeHeader(input.categoryLabel);
  const phoneText = input.phone && input.phone.trim() ? input.phone : "Not provided";

  const text = `New contact message
========================================

Name:      ${input.name}
Email:     ${input.email}
Phone:     ${phoneText}
Category:  ${input.categoryLabel}

----------------------------------------
Message
----------------------------------------
${input.message}

========================================
Reply directly to this email to reach ${input.name}.`;

  // Renders a single labeled field row for the HTML email body. The value is
  // pre-escaped by the caller so this helper never receives raw untrusted input.
  const fieldRow = (label: string, escapedValue: string) => `
      <tr>
        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;width:110px;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;vertical-align:top;">${escapedValue}</td>
      </tr>`;

  const html = `<div style="margin:0;padding:24px 0;background-color:#f3f4f6;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background-color:#ffffff;">
          <tr>
            <td style="padding:20px 28px;background-color:#111827;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;">New contact message</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9ca3af;padding-top:4px;">PNW Spirits &mdash; website contact form</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${fieldRow("Name", htmlEscape(input.name))}${fieldRow("Email", htmlEscape(input.email))}${fieldRow("Phone", htmlEscape(phoneText))}${fieldRow("Category", htmlEscape(input.categoryLabel))}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;padding-bottom:8px;">Message</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;padding:16px;border:1px solid #e5e7eb;border-left:3px solid #4f46e5;border-radius:6px;background-color:#f9fafb;">${htmlEscape(input.message).replace(/\n/g, "<br>")}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
              Reply directly to this email to reach ${htmlEscape(input.name)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;

  const from =
    process.env.CONTACT_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    process.env.EMAIL_SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    replyTo: safeEmail,
    subject: `New contact message: ${safeCategory}`,
    text,
    html,
  });
}
