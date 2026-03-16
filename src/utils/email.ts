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
