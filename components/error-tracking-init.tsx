"use client";

import { useEffect } from "react";
import { initErrorTracking } from "@/lib/client-error-tracker";

/**
 * Компонент для инициализации error tracking на клиенте
 */
export function ErrorTrackingInit() {
  useEffect(() => {
    // Инициализируем глобальные обработчики ошибок
    initErrorTracking();
  }, []);

  return null;
}
