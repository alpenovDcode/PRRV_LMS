"use client";

export interface ErrorInfo {
  message: string;
  stack?: string;
  url?: string;
  severity?: "critical" | "error" | "warning" | "info";
  metadata?: Record<string, any>;
}

/**
 * Отправляет ошибку на сервер для логирования
 */
export async function trackError(error: ErrorInfo): Promise<void> {
  try {
    const browserInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };

    await fetch("/api/errors/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...error,
        url: error.url || window.location.href,
        browserInfo,
      }),
    });
  } catch (err) {
    // Если не можем отправить на сервер, логируем в консоль

  }
}

/**
 * Инициализирует глобальные обработчики ошибок
 */
export function initErrorTracking(): void {
  // Обработка необработанных JS ошибок
  window.onerror = (message, source, lineno, colno, error) => {
    trackError({
      message: typeof message === "string" ? message : "Unknown error",
      stack: error?.stack,
      url: source || window.location.href,
      severity: "error",
      metadata: {
        lineno,
        colno,
      },
    });
  };

  // Обработка необработанных Promise rejections
  window.onunhandledrejection = (event) => {
    trackError({
      message: event.reason?.message || "Unhandled Promise Rejection",
      stack: event.reason?.stack,
      severity: "error",
      metadata: {
        reason: String(event.reason),
      },
    });
  };

  // Обработка ошибок загрузки ресурсов
  window.addEventListener(
    "error",
    (event) => {
      if (event.target !== window) {
        const target = event.target as HTMLElement;
        trackError({
          message: `Failed to load resource: ${target.tagName}`,
          url: (target as any).src || (target as any).href,
          severity: "warning",
          metadata: {
            tagName: target.tagName,
            outerHTML: target.outerHTML.substring(0, 200),
          },
        });
      }
    },
    true
  );
}

/**
 * Wrapper для API вызовов с автоматическим логированием ошибок
 */
export async function trackApiCall<T>(
  apiCall: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    trackError({
      message: `API Error: ${context || "Unknown"}`,
      stack: error instanceof Error ? error.stack : undefined,
      severity: "error",
      metadata: {
        context,
        error: String(error),
      },
    });
    throw error;
  }
}
