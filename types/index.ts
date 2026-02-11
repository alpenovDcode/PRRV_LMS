import { UserRole, LessonType, EnrollmentStatus, ProgressStatus, HomeworkStatus } from "@prisma/client";

export type { UserRole, LessonType, EnrollmentStatus, ProgressStatus, HomeworkStatus };

export interface DripRule {
  type: "after_start" | "on_date";
  days?: number;
  date?: string;
}

export interface LessonContent {
  markdown?: string;
  quiz?: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: "single" | "multiple" | "text";
  options?: string[];
  correctAnswer?: string | string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

