
import nodemailer from "nodemailer";

async function main() {
  console.log("Checking SMTP config...");
  console.log("HOST:", process.env.SMTP_HOST);
  console.log("PORT:", process.env.SMTP_PORT);
  console.log("USER:", process.env.SMTP_USER);
  console.log("PASS:", process.env.SMTP_PASSWORD ? "******" : "MISSING");

  const port = parseInt(process.env.SMTP_PORT || "465");
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.yandex.ru",
    port: port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // Debug options for verbose logs
    logger: true,
    debug: true,
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  try {
    console.log("Attempting to send email...");
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: "alpewagaming@gmail.com", // Sending to your email
      subject: "Test Email from Debug Script",
      text: "If you see this, email sending works!",
    });
    console.log("Success! Message ID:", info.messageId);
  } catch (e) {
    console.error("Email failed:", e);
  }
}

main();
