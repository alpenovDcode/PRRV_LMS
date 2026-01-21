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
        // Appending URL-based API Key security check
        if (process.env.NEXT_PUBLIC_API_SECRET_KEY) {
          config.params = {
            ...config.params,
            apiKey: process.env.NEXT_PUBLIC_API_SECRET_KEY,
          };
        }
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
        const publicRoutes = ["/login", "/register", "/recover-password"];
        const isPublicRoute = publicRoutes.some(route => currentPath.startsWith(route));
        
        if (error.response?.status === 401 && !originalRequest._retry && !isPublicRoute) {
          originalRequest._retry = true;

          try {
            // Refresh token теперь в httpOnly cookie, автоматически отправляется
            await axios.post(`${API_URL}/api/auth/refresh`, {}, {
              withCredentials: true, // Важно для отправки cookies
            });

            // AccessToken теперь устанавливается в httpOnly cookie автоматически
            // Не нужно сохранять в localStorage

            // Повторяем оригинальный запрос (cookies автоматически отправятся)
            return this.client(originalRequest);
          } catch (refreshError) {
            // Очищаем cookies через logout endpoint
            try {
              await axios.post(`${API_URL}/api/auth/logout`, {}, {
                withCredentials: true,
              });
            } catch {
              // Игнорируем ошибки при logout
            }

            // Не делаем редирект, если уже на публичной странице
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

