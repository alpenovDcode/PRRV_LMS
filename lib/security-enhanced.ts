import { db } from "./db";
import { randomBytes } from "crypto";
import { authenticator } from "otplib";

/**
 * Расширенная безопасность: 2FA, управление сессиями, ограничение одновременных сессий
 */

const MAX_CONCURRENT_SESSIONS = 5; // Максимальное количество одновременных сессий

/**
 * Генерирует секрет для 2FA
 */
export function generate2FASecret(): string {
  return authenticator.generateSecret();
}

/**
 * Генерирует QR код URL для настройки 2FA
 */
export function generate2FAQRCode(email: string, secret: string, issuer: string = "LMS"): string {
  return authenticator.keyuri(email, issuer, secret);
}

/**
 * Генерирует резервные коды для 2FA
 */
export function generateBackupCodes(count: number = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(4).toString("hex").toUpperCase());
}

/**
 * Включает 2FA для пользователя
 */
export async function enable2FA(userId: string, secret: string, backupCodes: string[]) {
  return db.twoFactorAuth.upsert({
    where: { userId },
    update: {
      secret,
      backupCodes,
      isEnabled: false, // Пока не подтверждено
    },
    create: {
      userId,
      secret,
      backupCodes,
      isEnabled: false,
    },
  });
}

/**
 * Подтверждает и активирует 2FA
 */
export async function confirm2FA(userId: string, token: string): Promise<boolean> {
  const twoFA = await db.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (!twoFA) {
    throw new Error("2FA not set up");
  }

  const isValid = authenticator.verify({ token, secret: twoFA.secret });

  if (isValid) {
    await db.twoFactorAuth.update({
      where: { userId },
      data: { isEnabled: true },
    });
  }

  return isValid;
}

/**
 * Проверяет 2FA токен или резервный код
 */
export async function verify2FA(userId: string, code: string): Promise<boolean> {
  const twoFA = await db.twoFactorAuth.findUnique({
    where: { userId },
    select: {
      secret: true,
      backupCodes: true,
      isEnabled: true,
    },
  });

  if (!twoFA || !twoFA.isEnabled) {
    return false;
  }

  // Проверяем TOTP токен
  const isValidToken = authenticator.verify({ token: code, secret: twoFA.secret });

  if (isValidToken) {
    return true;
  }

  // Проверяем резервный код
  if (twoFA.backupCodes.includes(code.toUpperCase())) {
    // Удаляем использованный резервный код
    await db.twoFactorAuth.update({
      where: { userId },
      data: {
        backupCodes: twoFA.backupCodes.filter((c) => c !== code.toUpperCase()),
      },
    });
    return true;
  }

  return false;
}

/**
 * Создает или обновляет сессию пользователя
 */
export async function createUserSession(
  userId: string,
  sessionId: string,
  deviceName?: string,
  deviceType?: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Проверяем количество активных сессий
  const activeSessions = await db.userSession.count({
    where: {
      userId,
      isActive: true,
    },
  });

  // Если превышен лимит, деактивируем самые старые сессии
  if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
    const oldestSessions = await db.userSession.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: {
        lastActivityAt: "asc",
      },
      take: activeSessions - MAX_CONCURRENT_SESSIONS + 1,
    });

    await db.userSession.updateMany({
      where: {
        id: { in: oldestSessions.map((s) => s.id) },
      },
      data: {
        isActive: false,
      },
    });
  }

  // Создаем или обновляем сессию
  return db.userSession.upsert({
    where: {
      userId_sessionId: {
        userId,
        sessionId,
      },
    },
    update: {
      lastActivityAt: new Date(),
      isActive: true,
    },
    create: {
      userId,
      sessionId,
      deviceName,
      deviceType,
      ipAddress,
      userAgent,
      isActive: true,
    },
  });
}

/**
 * Получает все активные сессии пользователя
 */
export async function getUserSessions(userId: string) {
  return db.userSession.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      lastActivityAt: "desc",
    },
  });
}

/**
 * Деактивирует сессию
 */
export async function deactivateSession(userId: string, sessionId: string) {
  return db.userSession.updateMany({
    where: {
      userId,
      sessionId,
    },
    data: {
      isActive: false,
    },
  });
}

/**
 * Деактивирует все сессии пользователя кроме текущей
 */
export async function deactivateOtherSessions(userId: string, currentSessionId: string) {
  return db.userSession.updateMany({
    where: {
      userId,
      sessionId: { not: currentSessionId },
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });
}

/**
 * Обновляет активность сессии
 */
export async function updateSessionActivity(userId: string, sessionId: string) {
  return db.userSession.updateMany({
    where: {
      userId,
      sessionId,
      isActive: true,
    },
    data: {
      lastActivityAt: new Date(),
    },
  });
}

