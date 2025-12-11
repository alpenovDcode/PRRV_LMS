import { db } from "@/lib/db";
import crypto from "crypto";

export type ErrorSeverity = "critical" | "error" | "warning" | "info";
export type ErrorStatus = "new" | "investigating" | "resolved" | "ignored";

export interface ErrorLogData {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  severity?: ErrorSeverity;
  metadata?: Record<string, any>;
  browserInfo?: Record<string, any>;
}

/**
 * Создает fingerprint для группировки похожих ошибок
 */
export function createErrorFingerprint(message: string, stack?: string): string {
  // Нормализуем сообщение (убираем числа, пути файлов)
  const normalizedMessage = message
    .replace(/\d+/g, "N")
    .replace(/\/[^\s]+/g, "/PATH")
    .replace(/https?:\/\/[^\s]+/g, "URL");

  // Берем первые 3 строки стека (обычно самые важные)
  const normalizedStack = stack
    ? stack
        .split("\n")
        .slice(0, 3)
        .map((line) =>
          line
            .replace(/\d+/g, "N")
            .replace(/\/[^\s]+/g, "/PATH")
            .trim()
        )
        .join("\n")
    : "";

  const combined = `${normalizedMessage}|${normalizedStack}`;
  return crypto.createHash("sha256").update(combined).digest("hex");
}

/**
 * Логирует ошибку в базу данных
 */
export async function logError(data: ErrorLogData): Promise<string> {
  try {
    const fingerprint = createErrorFingerprint(data.message, data.stack);

    // Находим или создаем группу ошибок
    let group = await db.errorGroup.findUnique({
      where: { fingerprint },
    });

    if (group) {
      // Обновляем существующую группу
      group = await db.errorGroup.update({
        where: { id: group.id },
        data: {
          count: { increment: 1 },
          lastOccurred: new Date(),
          severity: data.severity || group.severity,
        },
      });
    } else {
      // Создаем новую группу
      group = await db.errorGroup.create({
        data: {
          fingerprint,
          title: data.message.substring(0, 200),
          message: data.message,
          severity: data.severity || "error",
          status: "new",
        },
      });
    }

    // Создаем запись об ошибке
    const errorLog = await db.errorLog.create({
      data: {
        groupId: group.id,
        message: data.message,
        stack: data.stack,
        url: data.url,
        userAgent: data.userAgent,
        userId: data.userId,
        sessionId: data.sessionId,
        severity: data.severity || "error",
        status: "new",
        metadata: data.metadata || {},
        browserInfo: data.browserInfo || {},
      },
    });

    return errorLog.id;
  } catch (error) {
    // Если не можем залогировать в БД, логируем в консоль


    throw error;
  }
}

/**
 * Получает список ошибок с фильтрацией
 */
export async function getErrors(params: {
  severity?: ErrorSeverity;
  status?: ErrorStatus;
  userId?: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    severity,
    status,
    userId,
    limit = 50,
    offset = 0,
    startDate,
    endDate,
  } = params;

  const where: any = {};

  if (severity) where.severity = severity;
  if (status) where.status = status;
  if (userId) where.userId = userId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const [errors, total] = await Promise.all([
    db.errorLog.findMany({
      where,
      include: {
        group: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.errorLog.count({ where }),
  ]);

  return { errors, total };
}

/**
 * Получает группы ошибок
 */
export async function getErrorGroups(params: {
  status?: ErrorStatus;
  severity?: ErrorSeverity;
  limit?: number;
  offset?: number;
}) {
  const { status, severity, limit = 50, offset = 0 } = params;

  const where: any = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const [groups, total] = await Promise.all([
    db.errorGroup.findMany({
      where,
      include: {
        _count: {
          select: { errors: true },
        },
      },
      orderBy: { lastOccurred: "desc" },
      take: limit,
      skip: offset,
    }),
    db.errorGroup.count({ where }),
  ]);

  return { groups, total };
}

/**
 * Обновляет статус ошибки или группы
 */
export async function updateErrorStatus(
  id: string,
  status: ErrorStatus,
  resolvedBy?: string,
  notes?: string
) {
  // Пробуем обновить как группу
  try {
    const group = await db.errorGroup.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === "resolved" ? new Date() : null,
        resolvedBy: status === "resolved" ? resolvedBy : null,
        notes,
      },
    });

    // Обновляем все ошибки в группе
    await db.errorLog.updateMany({
      where: { groupId: id },
      data: { status },
    });

    return group;
  } catch {
    // Если не группа, обновляем как отдельную ошибку
    return await db.errorLog.update({
      where: { id },
      data: { status },
    });
  }
}

/**
 * Получает статистику ошибок
 */
export async function getErrorStats(days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalErrors,
    newErrors,
    resolvedErrors,
    bySeverity,
    byDay,
    topGroups,
  ] = await Promise.all([
    // Всего ошибок
    db.errorLog.count({
      where: { createdAt: { gte: startDate } },
    }),

    // Новые ошибки
    db.errorLog.count({
      where: {
        status: "new",
        createdAt: { gte: startDate },
      },
    }),

    // Исправленные ошибки
    db.errorLog.count({
      where: {
        status: "resolved",
        createdAt: { gte: startDate },
      },
    }),

    // По severity
    db.errorLog.groupBy({
      by: ["severity"],
      _count: true,
      where: { createdAt: { gte: startDate } },
    }),

    // По дням
    db.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM error_logs
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `,

    // Топ групп ошибок
    db.errorGroup.findMany({
      where: { lastOccurred: { gte: startDate } },
      orderBy: { count: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        count: true,
        severity: true,
        status: true,
      },
    }),
  ]);

  return {
    totalErrors,
    newErrors,
    resolvedErrors,
    bySeverity,
    byDay,
    topGroups,
  };
}

/**
 * Удаляет старые ошибки (для очистки)
 */
export async function cleanupOldErrors(daysToKeep: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  // Удаляем старые resolved ошибки
  const deleted = await db.errorLog.deleteMany({
    where: {
      status: "resolved",
      createdAt: { lt: cutoffDate },
    },
  });

  // Удаляем пустые группы
  await db.errorGroup.deleteMany({
    where: {
      errors: { none: {} },
    },
  });

  return deleted.count;
}
