import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

const isClient = typeof window !== "undefined";
const API_URL = isClient 
  ? "" 
  : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api`,
      headers: {
        "Content-Type": "application/json",
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - токены теперь в httpOnly cookies, автоматически отправляются
    // Не нужно добавлять Authorization header вручную, так как токены в cookies
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Session-based authentication is handled via cookies (withCredentials: true)
        // No need for manual Authorization header or apiKey parameter for browser requests
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - обработка ошибок и refresh token
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        // Не обрабатываем 401 на публичных роутах
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        const publicRoutes = ["/login", "/register", "/recover-password", "/l/", "/legal", "/maintenance", "/no-access"];
        const isPublicRoute = currentPath === "/" || publicRoutes.some(route => currentPath.startsWith(route));
        
        if (error.response?.status === 401 && !originalRequest._retry && !isPublicRoute) {
          originalRequest._retry = true;

          try {
            // Refresh token в httpOnly cookie, автоматически отправляется
            await axios.post(`${API_URL}/api/auth/refresh`, {}, {
              withCredentials: true,
            });
            // Повторяем оригинальный запрос
            return this.client(originalRequest);
          } catch (refreshError) {
            // На 5xx (БД лежит, сеть упала) НЕ выкидываем — это транзиентная ошибка,
            // пользователь должен иметь возможность повторить. Кикаем только если
            // refresh-токен действительно невалиден / истёк (4xx).
            const status = (refreshError as AxiosError)?.response?.status;
            const isAuthFailure = typeof status === "number" && status >= 400 && status < 500;

            if (!isAuthFailure) {
              return Promise.reject(refreshError);
            }

            try {
              await axios.post(`${API_URL}/api/auth/logout`, {}, {
                withCredentials: true,
              });
            } catch {
              // Игнорируем ошибки при logout
            }

            if (!isPublicRoute && typeof window !== "undefined") {
              window.location.href = "/login";
            }
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  get instance() {
    return this.client;
  }
}

export const apiClient = new ApiClient().instance;

