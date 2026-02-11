
import nodemailer from "nodemailer";

const port = parseInt(process.env.SMTP_PORT || "465");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.yandex.ru",
  port: port,
  secure: port === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn("SMTP credentials not provided. Email not sent:", { to, subject });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Proryv LMS" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log("Message sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

import sanitizeHtml from 'sanitize-html';

export const emailTemplates = {
  welcome: (email: string, password?: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Добро пожаловать в Прорыв!</h2>
      <p>Ваш аккаунт создан.</p>
      ${password ? `
      <p>Ваши данные для входа:</p>
      <ul>
        <li>Email: <strong>${sanitizeHtml(email)}</strong></li>
        <li>Пароль: <strong>${sanitizeHtml(password)}</strong></li>
      </ul>
      ` : `
      <p>Вы можете войти, используя свой email: <strong>${sanitizeHtml(email)}</strong></p>
      `}
      <p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://prrv.tech'}/login" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Войти в кабинет
        </a>
      </p>
    </div>
  `,
  
  homeworkGraded: (lessonTitle: string, status: 'approved' | 'rejected', comment: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Результат проверки домашнего задания</h2>
      <p>Ваше задание к уроку <strong>"${sanitizeHtml(lessonTitle)}"</strong> проверено.</p>
      <div style="padding: 15px; border-radius: 5px; background-color: ${status === 'approved' ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${status === 'approved' ? '#86efac' : '#fecaca'};">
        <h3 style="margin-top: 0; color: ${status === 'approved' ? '#166534' : '#991b1b'};">
          ${status === 'approved' ? 'ЗАЧЕТ! 🎉' : 'ТРЕБУЕТСЯ ДОРАБОТКА ⚠️'}
        </h3>
        <p style="white-space: pre-wrap;">${sanitizeHtml(comment, { allowedTags: [], allowedAttributes: {} })}</p>
      </div>
      <p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://prrv.tech'}/dashboard" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Перейти к уроку
        </a>
      </p>
    </div>
  `,

  homeworkAccepted: (lessonTitle: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Ответ принят!</h2>
      <p>Спасибо за ваш ответ к уроку <strong>"${sanitizeHtml(lessonTitle)}"</strong>!</p>
      <div style="padding: 15px; border-radius: 5px; background-color: #f0fdf4; border: 1px solid #86efac;">
        <h3 style="margin-top: 0; color: #166534;">
          Ответ получен! ✅
        </h3>
        <p>Спасибо за заполненную форму! Хорошего дня!</p>
      </div>
      <p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://prrv.tech'}/dashboard" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Вернуться к обучению
        </a>
      </p>
    </div>
  `
};
