/**
 * lib/offers/form-config.ts
 *
 * Типы и хелперы конфига полей формы публичной страницы оффера
 * (/offer/<slug>). Хранится в Offer.formConfig (JSON).
 *
 * ФИО и email — всегда обязательны (нужны для создания юзера и письма),
 * не настраиваются. Конфиг управляет только телефоном и доп-полями.
 */

import { z } from "zod";

export const customFieldSchema = z.object({
  /** Машинное имя — уникально в пределах оффера, [a-z0-9_]. */
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Только латиница, цифры и подчёркивание"),
  /** Подпись поля для клиента. */
  label: z.string().min(1).max(120),
  type: z.enum(["text", "email", "tel", "number", "select", "textarea"]),
  required: z.boolean().default(false),
  /** Подсказка под полем. */
  hint: z.string().max(200).optional(),
  /** Для type=select — варианты. */
  options: z.array(z.string().min(1).max(120)).max(50).optional(),
});

export type CustomField = z.infer<typeof customFieldSchema>;

export const formConfigSchema = z.object({
  phone: z
    .object({
      show: z.boolean().default(true),
      required: z.boolean().default(false),
    })
    .default({ show: true, required: false }),
  customFields: z.array(customFieldSchema).max(20).default([]),
});

export type OfferFormConfig = z.infer<typeof formConfigSchema>;

/** Дефолт, если у оффера formConfig не задан. */
export const DEFAULT_FORM_CONFIG: OfferFormConfig = {
  phone: { show: true, required: false },
  customFields: [],
};

/**
 * Безопасно нормализует произвольный JSON из БД в OfferFormConfig.
 * Невалидный/пустой → дефолт. Используется и на сервере, и на клиенте.
 */
export function normalizeFormConfig(raw: unknown): OfferFormConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_FORM_CONFIG;
  const parsed = formConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_FORM_CONFIG;
}
