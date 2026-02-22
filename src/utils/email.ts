import nodemailer from "nodemailer";

export async function sendSubscribeEmail(to: string, firstName: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: process.env.EMAIL_SMTP_SECURE === "true", // expects string 'true' or 'false'
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    },
  });

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
