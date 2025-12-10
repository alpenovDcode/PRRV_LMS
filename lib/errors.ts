export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Не авторизован") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Доступ запрещен") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Ресурс не найден") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

