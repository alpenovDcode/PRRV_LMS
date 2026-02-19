import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email-service";

/**
 * Отправляет письмо, используя шаблон из базы данных.
 * @param event Название события (например, 'USER_CREATED_BY_ADMIN')
 * @param to Email получателя
 * @param data Объект с данными для подстановки в шаблон (например, { fullName: 'Иван' })
 */
export async function sendTemplateEmail(
  event: string,
  to: string,
  data: Record<string, string>
) {
  try {
    const template = await db.emailTemplate.findUnique({
      where: { event },
    });

    if (!template) {
      console.warn(`Email template not found for event: ${event}`);
      return;
    }

    if (!template.isActive) {
      console.log(`Email template for event ${event} is disabled`);
      return;
    }

    let subject = template.subject;
    let body = template.body;

    // Замена переменных в теме и теле письма
    // Используем простой replace для {{variable}}
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });

    await sendEmail({
      to,
      subject,
      html: body,
    });

    console.log(`Template email sent: ${event} to ${to}`);
  } catch (error) {
    console.error(`Error sending template email (${event}):`, error);
    // Не выбрасываем ошибку, чтобы не ломать основной флоу (например, создание пользователя)
  }
}
