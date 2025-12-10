"use client";

import React, { Component, ReactNode } from "react";
import { trackError } from "@/lib/client-error-tracker";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * React Error Boundary для перехвата ошибок рендеринга
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Логируем ошибку на сервер
    trackError({
      message: error.message,
      stack: error.stack,
      severity: "critical",
      metadata: {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      // Если передан кастомный fallback, используем его
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Дефолтный fallback UI
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Произошла ошибка при загрузке страницы. Мы уже получили уведомление
              и работаем над исправлением.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  Детали ошибки (только в dev режиме)
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-800">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Перезагрузить страницу
              </button>
              <button
                onClick={() => (window.location.href = "/")}
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                На главную
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
