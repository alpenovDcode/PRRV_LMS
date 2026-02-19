import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email-service";
import { logAction } from "@/lib/audit";

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
  // Find user to associate log with
  const user = await db.user.findUnique({
    where: { email: to },
    select: { id: true },
  });

  try {
    const template = await db.emailTemplate.findFirst({
      where: { event, isActive: true },
        // If multiple active templates exist (shouldn't happen with our logic), take the latest one
        orderBy: { createdAt: "desc" },
    });

    if (!template) {
      console.warn(`Email template not found for event: ${event}`);
      if (user) {
         await logAction(user.id, "EMAIL_ERROR", "EmailTemplate", undefined, {
            event,
            to,
            error: "Template not found or inactive",
            status: "failed"
         });
      }
      return;
    }

    if (!template.isActive) {
      console.log(`Email template for event ${event} is disabled`);
       if (user) {
         await logAction(user.id, "EMAIL_ERROR", "EmailTemplate", template.id, {
            event,
            to,
            error: "Template is disabled",
            status: "failed"
         });
      }
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
    
    if (user) {
      await logAction(
        user.id,
        "EMAIL_SENT",
        "EmailTemplate",
        template.id,
        { event, to, subject, status: "success" }
      );
    }
  } catch (error) {
    console.error(`Error sending template email (${event}):`, error);
    
    if (user) {
       await logAction(
        user.id,
        "EMAIL_ERROR",
        "EmailTemplate",
        undefined, 
        { 
            event, 
            to, 
            error: error instanceof Error ? error.message : String(error), 
            status: "failed" 
        }
      );
    }
  }
}
