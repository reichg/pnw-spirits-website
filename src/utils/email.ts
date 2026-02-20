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
    subject: "Welcome to The PNW Spirits Newsletter!",
    text: `Hi ${firstName},\n\nThank you for subscribing to The PNW Spirits newsletter!\n\nCheers!`,
    html: `<p>Hi ${firstName},</p><p>Thank you for subscribing to <b>The PNW Spirits</b> newsletter!</p><p>Cheers!</p>`,
  });

  // Send notification email to EMAIL_SUBSCRIBER
  if (process.env.EMAIL_SUBSCRIBER) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
      to: "gabe.reichenberger@gmail.com",
      // to: process.env.EMAIL_SUBSCRIBER,
      subject: "New Newsletter Subscriber",
      text: `A new user has subscribed to the newsletter.\n\nEmail: ${to}\nFirst Name: ${firstName}`,
      html: `<p>A new user has subscribed to the newsletter.</p><ul><li><b>Email:</b> ${to}</li><li><b>First Name:</b> ${firstName}</li></ul>`,
    });
  }
}
