import { z } from "zod";

// Допустимые типы файлов в брифе. Совпадают с категориями из бота
// upakovka_pod_kluch (portrait/selfie/context/review/education/materials/style_example).
export const BRIEF_FILE_TYPES = [
  "portrait",
  "selfie",
  "context",
  "review",
  "education",
  "materials",
  "style_example",
] as const;

export type BriefFileType = (typeof BRIEF_FILE_TYPES)[number];

export const BRIEF_FILE_TYPE_LABELS: Record<BriefFileType, string> = {
  portrait: "Портретные фото",
  selfie: "Селфи",
  context: "Фото в контексте преподавания",
  review: "Отзывы учеников",
  education: "Дипломы и сертификаты",
  materials: "Доп. материалы",
  style_example: "Примеры дизайна",
};

// Текстовые поля брифа — для PATCH /api/brief. Все необязательные,
// клиент шлёт diff.
export const briefUpdateSchema = z.object({
  // Блок 1
  fio: z.string().max(255).optional().nullable(),
  subject: z.string().max(500).optional().nullable(),
  targetAudience: z.string().max(5000).optional().nullable(),
  painsGoals: z.string().max(5000).optional().nullable(),
  // Блок 4
  utp: z.string().max(5000).optional().nullable(),
  educationText: z.string().max(5000).optional().nullable(),
  experience: z.string().max(5000).optional().nullable(),
  achievements: z.string().max(5000).optional().nullable(),
  methods: z.string().max(5000).optional().nullable(),
  formats: z.string().max(5000).optional().nullable(),
  // Блок 5
  adIntro: z.string().max(5000).optional().nullable(),
  adProcess: z.string().max(5000).optional().nullable(),
  adResult: z.string().max(5000).optional().nullable(),
  // Блок 6
  existingStyle: z.string().max(2000).optional().nullable(),
  preferredStyle: z.string().max(2000).optional().nullable(),
  characterImage: z.string().max(2000).optional().nullable(),
  cardImpression: z.string().max(2000).optional().nullable(),
  colorPreferences: z.string().max(2000).optional().nullable(),
  // Прогресс — какой блок сейчас открыт (1..7, 7 = финальный экран).
  currentStep: z.number().int().min(1).max(7).optional(),
});

export type BriefUpdateInput = z.infer<typeof briefUpdateSchema>;

export const briefCaseUpdateSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  age: z.string().max(255).optional().nullable(),
  goal: z.string().max(2000).optional().nullable(),
  beforeText: z.string().max(2000).optional().nullable(),
  duration: z.string().max(255).optional().nullable(),
  problems: z.string().max(2000).optional().nullable(),
  afterText: z.string().max(2000).optional().nullable(),
  reviewText: z.string().max(5000).optional().nullable(),
});

export type BriefCaseUpdateInput = z.infer<typeof briefCaseUpdateSchema>;
