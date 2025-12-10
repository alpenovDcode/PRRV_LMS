import { db } from "./db";
import { randomBytes } from "crypto";
import { addHours } from "date-fns";

/**
 * Генерирует токен для восстановления пароля
 */
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Создает токен восстановления пароля для пользователя
 * @param email Email пользователя
 * @returns Токен или null если пользователь не найден
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Не раскрываем существование email для безопасности
    return null;
  }

  const token = generatePasswordResetToken();
  const expiresAt = addHours(new Date(), 1); // Токен действителен 1 час

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpires: expiresAt,
    },
  });

  return token;
}

/**
 * Проверяет валидность токена восстановления пароля
 */
export async function validatePasswordResetToken(token: string): Promise<{
  isValid: boolean;
  userId?: string;
}> {
  const user = await db.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: {
        gt: new Date(), // Токен еще не истек
      },
    },
    select: { id: true },
  });

  if (!user) {
    return { isValid: false };
  }

  return { isValid: true, userId: user.id };
}

/**
 * Сбрасывает токен восстановления пароля после использования
 */
export async function clearPasswordResetToken(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
}

/**
 * Отправка email с токеном восстановления (заглушка)
 * В реальном приложении здесь должна быть интеграция с email сервисом
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // В реальном приложении здесь должна быть отправка email
  // Например, через SendGrid, AWS SES, Resend и т.д.
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/recover-password?token=${token}`;
  
  console.log(`Password reset email for ${email}: ${resetUrl}`);
  
  // TODO: Интегрировать реальный email сервис
  // await emailService.send({
  //   to: email,
  //   subject: "Восстановление пароля",
  //   html: `Перейдите по ссылке для восстановления пароля: ${resetUrl}`,
  // });
}

