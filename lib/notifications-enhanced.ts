import { db } from "./db";

/**
 * Расширенная система уведомлений с каналами и настройками
 */

export type NotificationChannel = "email" | "telegram" | "inApp";

export interface NotificationPreferences {
  homeworkReviewed: boolean;
  newComment: boolean;
  lessonAvailable: boolean;
  deadlineReminder: boolean;
  quizResult: boolean;
}

/**
 * Получает или создает настройки уведомлений для пользователя
 */
export async function getNotificationPreferences(userId: string) {
  let preferences = await db.notificationPreference.findUnique({
    where: { userId },
  });

  if (!preferences) {
    // Создаем дефолтные настройки
    preferences = await db.notificationPreference.create({
      data: {
        userId,
        channels: {
          email: true,
          telegram: false,
          inApp: true,
        },
        preferences: {
          homeworkReviewed: true,
          newComment: true,
          lessonAvailable: true,
          deadlineReminder: true,
          quizResult: true,
        },
      },
    });
  }

  return preferences;
}

/**
 * Обновляет настройки уведомлений
 */
export async function updateNotificationPreferences(
  userId: string,
  channels?: Partial<Record<NotificationChannel, boolean>>,
  preferences?: Partial<NotificationPreferences>
) {
  const current = await getNotificationPreferences(userId);

  return db.notificationPreference.update({
    where: { userId },
    data: {
      channels: channels
        ? { ...(current.channels as unknown as Record<NotificationChannel, boolean>), ...channels }
        : undefined,
      preferences: preferences
        ? { ...(current.preferences as unknown as NotificationPreferences), ...preferences }
        : undefined,
    },
  });
}

/**
 * Создает уведомление с учетом настроек пользователя
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  const preferences = await getNotificationPreferences(userId);
  const prefs = preferences.preferences as unknown as NotificationPreferences;

  // Проверяем, включено ли уведомление этого типа
  const typeMap: Record<string, keyof NotificationPreferences> = {
    homework_reviewed: "homeworkReviewed",
    new_comment: "newComment",
    lesson_available: "lessonAvailable",
    deadline_reminder: "deadlineReminder",
    quiz_result: "quizResult",
  };

  const prefKey = typeMap[type];
  if (prefKey && !prefs[prefKey]) {
    // Уведомление отключено пользователем
    return null;
  }

  const channels = preferences.channels as unknown as Record<NotificationChannel, boolean>;

  // Создаем внутреннее уведомление, если включено
  if (channels.inApp) {
    await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        link,
      },
    });
  }

  // Отправляем email, если включено
  if (channels.email) {
    // TODO: Интеграция с email сервисом (Resend/SendGrid)
    console.log(`Email notification to ${userId}: ${title} - ${message}`);
  }

  // Отправляем Telegram, если включено
  if (channels.telegram) {
    // TODO: Интеграция с Telegram Bot API
    console.log(`Telegram notification to ${userId}: ${title} - ${message}`);
  }

  return true;
}

/**
 * Отправляет email через провайдера (заглушка для интеграции)
 */
export async function sendEmailNotification(
  email: string,
  subject: string,
  _html: string
): Promise<void> {
  // TODO: Интеграция с Resend/SendGrid
  // Пример:
  // await resend.emails.send({
  //   from: 'noreply@example.com',
  //   to: email,
  //   subject,
  //   html,
  // });
  
  console.log(`Email to ${email}: ${subject}`);
}

