import { db } from "./db";
import { logAction } from "./audit";

/**
 * Логирует подозрительную активность для мониторинга безопасности
 */
export async function logSuspiciousActivity(
  userId: string | null,
  activityType: string,
  details: {
    ip?: string;
    userAgent?: string;
    path?: string;
    reason: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    // Логируем в audit log
    if (userId) {
      await logAction(userId, `SUSPICIOUS_${activityType}`, "security", undefined, {
        ...details,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Для анонимных действий просто логируем в консоль
      console.warn(`[Security] Anonymous suspicious activity: ${activityType}`, {
        ...details,
        timestamp: new Date().toISOString(),
      });
    }

    // Дополнительное логирование в консоль для мониторинга

  } catch (error) {
    // Не блокируем основную логику при ошибках логирования

  }
}

/**
 * Проверяет подозрительные паттерны в запросах
 */
export function detectSuspiciousPatterns(request: {
  ip?: string | null;
  userAgent?: string | null;
  path?: string;
  method?: string;
  body?: any;
}): string[] {
  const warnings: string[] = [];

  // Проверка на SQL injection попытки
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /('|(\\')|(;)|(--)|(\/\*)|(\*\/))/,
  ];
  if (request.body && typeof request.body === "string") {
    if (sqlPatterns.some((pattern) => pattern.test(request.body))) {
      warnings.push("potential_sql_injection");
    }
  }

  // Проверка на XSS попытки
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
  ];
  if (request.body && typeof request.body === "string") {
    if (xssPatterns.some((pattern) => pattern.test(request.body))) {
      warnings.push("potential_xss");
    }
  }

  // Проверка на подозрительный User-Agent
  if (request.userAgent) {
    const suspiciousAgents = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /^$/,
    ];
    if (suspiciousAgents.some((pattern) => pattern.test(request.userAgent!))) {
      warnings.push("suspicious_user_agent");
    }
  }

  // Проверка на path traversal
  if (request.path) {
    if (request.path.includes("..") || request.path.includes("//")) {
      warnings.push("potential_path_traversal");
    }
  }

  return warnings;
}

/**
 * Получает IP адрес из запроса
 */
export function getClientIp(request: {
  headers: Headers;
}): string | null {
  // Проверяем заголовки в порядке приоритета
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Берем первый IP из списка
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return null;
}

/**
 * Получает User-Agent из запроса
 */
export function getUserAgent(request: { headers: Headers }): string | null {
  return request.headers.get("user-agent");
}

