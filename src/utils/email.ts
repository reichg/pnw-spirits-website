import nodemailer from "nodemailer";

export async function sendSubscribeEmail(to: string, firstName: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Welcome to The PNW Spirits Newsletter!",
    text: `Hi ${firstName},\n\nThank you for subscribing to The PNW Spirits newsletter!\n\nCheers!`,
    html: `<p>Hi ${firstName},</p><p>Thank you for subscribing to <b>The PNW Spirits</b> newsletter!</p><p>Cheers!</p>`,
  });
}
