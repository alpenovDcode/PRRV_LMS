import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  rememberMe: z.boolean().optional(),
  consent: z.boolean().refine(val => val === true, {
    message: "Необходимо согласиться с политикой конфиденциальности",
  }),
});

export const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа").optional(),
});

export const courseSchema = z.object({
  title: z.string().min(1, "Название курса обязательно"),
  slug: z.string().min(1, "Slug обязателен"),
  description: z.string().optional(),
  // Принимаем как полный URL, так и Cloudflare Image ID (UUID или любую строку)
  coverImage: z.string().min(1).optional(),
  isPublished: z.boolean().default(false),
});

export const lessonSchema = z.object({
  title: z.string().min(1, "Название урока обязательно"),
  type: z.enum(["video", "text", "quiz", "track_definition"]),
  content: z.any().optional(),
  videoId: z.string().optional(),
  isFree: z.boolean().default(false),
  isStopLesson: z.boolean().default(false),
  dripRule: z
    .object({
      type: z.enum(["after_start", "on_date"]),
      days: z.number().optional(),
      date: z.string().optional(),
    })
    .optional(),
  orderIndex: z.number().int().min(0),
});

export const homeworkSchema = z.object({
  content: z.string().min(10, "Минимум 10 символов").optional(),
  files: z.array(z.string()).optional(),
});

export const adminGroupCreateSchema = z.object({
  name: z.string().min(1, "Название группы обязательно"),
  description: z.string().max(500).optional(),
  courseId: z.string().optional(),
  startDate: z.string().datetime().optional(),
});

export const adminGroupMemberSchema = z.object({
  userId: z.string().min(1, "userId обязателен"),
});

export const adminEnrollmentSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  startDate: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const adminModuleCreateSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  title: z.string().min(1, "Название модуля обязательно"),
  parentId: z.string().optional(),
  allowedTariffs: z.array(z.enum(["VR", "LR", "SR"])).optional(),
  allowedTracks: z.array(z.string()).optional(),
  allowedGroups: z.array(z.string()).optional(),
});

export const adminModuleUpdateSchema = z.object({
  title: z.string().min(1, "Название модуля обязательно").optional(),
  parentId: z.string().optional(),
  allowedTariffs: z.array(z.enum(["VR", "LR", "SR"])).optional(),
  allowedTracks: z.array(z.string()).optional(),
  allowedGroups: z.array(z.string()).optional(),
});

export const adminLessonCreateSchema = z.object({
  moduleId: z.string().min(1, "moduleId обязателен"),
  title: z.string().min(1, "Название урока обязательно"),
  type: z.enum(["video", "text", "quiz", "track_definition"]).optional(),
});

export const curatorHomeworkReviewSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  curatorComment: z.string().max(2000).optional(),
});

export const adminUserCreateSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа").optional(),
  role: z.enum(["student", "curator", "admin"]).default("student"),
  tariff: z.enum(["VR", "LR", "SR"]).optional(),
  track: z.string().optional(),
});
