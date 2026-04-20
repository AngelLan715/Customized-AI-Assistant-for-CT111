const nodemailer = require("nodemailer");

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransport();
  const from = process.env.SMTP_FROM || "Core9 AI <noreply@localhost>";

  if (!transport) {
    console.log("[email] SMTP not configured — message would send to:", to);
    console.log("[email] Subject:", subject);
    console.log(text);
    return { skipped: true };
  }

  await transport.sendMail({ from, to, subject, text, html });
  return { sent: true };
}

module.exports = { sendMail, getTransport };
