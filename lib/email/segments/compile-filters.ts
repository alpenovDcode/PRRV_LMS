import { Prisma, UserRole, UserTariff } from "@prisma/client";
import { z } from "zod";

/**
 * Декларативная схема фильтров сегмента. Та же структура используется:
 *   1. в EmailSegment.filters — сохранённый сегмент в БД
 *   2. в /api/admin/marketing/segments/preview — для live preview размера
 *   3. в /api/admin/marketing/contacts list и export — для ad-hoc фильтрации
 *
 * Логика — AND по всем заданным полям. Если поле опущено или массив пуст,
 * условие не добавляется. Внутри одного поля-массива — OR (например roles).
 *
 * Расширения (Спринт 4+):
 *   - lessonProgressMin: % прохождения курса (требует aggregation, пока пропущено)
 *   - excludeReceivedCampaigns: исключить тех, кто уже получал данную кампанию
 *   - bouncedWithin: исключить тех, у кого был hard-bounce за N дней
 */
export const segmentFiltersSchema = z.object({
  // Поиск по email или fullName.
  search: z.string().trim().optional(),

  // Демография / роли в LMS.
  roles: z.array(z.enum(["student", "curator", "admin"])).optional(),
  tariffs: z.array(z.enum(["VR", "LR", "SR"])).optional(),
  tracks: z.array(z.string()).optional(),

  // Группы (по GroupMember).
  groupIds: z.array(z.string().uuid()).optional(),

  // Курсы — записан / не записан.
  enrolledInCourseIds: z.array(z.string().uuid()).optional(),
  notEnrolledInCourseIds: z.array(z.string().uuid()).optional(),

  // Активность.
  // lastActiveDays: User.lastActiveAt >= now - N дней (активен последние N)
  // inactiveDays:   User.lastActiveAt < now - N дней или null (НЕ активен N дней)
  lastActiveDays: z.number().int().min(1).max(3650).optional(),
  inactiveDays: z.number().int().min(1).max(3650).optional(),

  // Дата регистрации (ISO-строки).
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),

  // Маркетинговые поля.
  subscription: z.enum(["all", "subscribed", "unsubscribed"]).optional(),
  emailValidated: z.boolean().optional(),

  // Теги (AND — все теги должны быть в emailTags).
  tags: z.array(z.string()).optional(),

  // Ключевые слова (User.keywords array, OR — любое из).
  keywordsAny: z.array(z.string()).optional(),

  // --- Поведенческие фильтры (retention-маркетинг) ---
  // «Открыл хотя бы одно из этих писем» / «не открыл ни одного».
  // Принимает campaignId. EmailEvent.type='opened' уже дедуплицирован
  // в track/open (первое открытие = единственное), так что фильтр
  // отрабатывает корректно даже на больших объёмах.
  openedCampaignIds: z.array(z.string().uuid()).optional(),
  notOpenedCampaignIds: z.array(z.string().uuid()).optional(),

  // «Кликнул в одной из этих кампаний» / «не кликнул».
  clickedCampaignIds: z.array(z.string().uuid()).optional(),
  notClickedCampaignIds: z.array(z.string().uuid()).optional(),

  // Покупки.
  // purchasedAny: купил хотя бы один paid order
  // purchasedOfferIds: купил какой-то из перечисленных offer'ов
  // notPurchasedOfferIds: НЕ покупал ни одного из перечисленных
  // sinceDaysAgo: ограничение по времени для всех purchased-фильтров
  purchasedAny: z.boolean().optional(),
  purchasedOfferIds: z.array(z.string().uuid()).optional(),
  notPurchasedOfferIds: z.array(z.string().uuid()).optional(),
  purchasedSinceDaysAgo: z.number().int().min(1).max(3650).optional(),

  // Исключения.
  excludeBlocked: z.boolean().optional(), // default: true (не отправляем заблокированным)
});

export type SegmentFilters = z.infer<typeof segmentFiltersSchema>;

/**
 * Парсит произвольный JSON в SegmentFilters, отбрасывая пустые поля.
 * Безопасно для пользовательского ввода — Zod валидирует.
 */
export function parseSegmentFilters(raw: unknown): SegmentFilters {
  if (!raw || typeof raw !== "object") return {};
  return segmentFiltersSchema.parse(raw);
}

/**
 * Компилирует фильтры сегмента в Prisma.UserWhereInput.
 *
 * @param filters         Валидированные фильтры.
 * @param options.now     Текущее время для расчёта lastActive/inactive периодов.
 *                        В тестах удобно фиксировать.
 */
export function compileSegmentFilters(
  filters: SegmentFilters,
  options: { now?: Date } = {}
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  const now = options.now ?? new Date();
  const conditions: Prisma.UserWhereInput[] = [];

  if (filters.search) {
    conditions.push({
      OR: [
        { email: { contains: filters.search, mode: "insensitive" } },
        { fullName: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  if (filters.roles && filters.roles.length > 0) {
    conditions.push({ role: { in: filters.roles as UserRole[] } });
  }

  if (filters.tariffs && filters.tariffs.length > 0) {
    conditions.push({ tariff: { in: filters.tariffs as UserTariff[] } });
  }

  if (filters.tracks && filters.tracks.length > 0) {
    conditions.push({ track: { in: filters.tracks } });
  }

  if (filters.groupIds && filters.groupIds.length > 0) {
    conditions.push({
      groupMembers: { some: { groupId: { in: filters.groupIds } } },
    });
  }

  if (filters.enrolledInCourseIds && filters.enrolledInCourseIds.length > 0) {
    conditions.push({
      enrollments: { some: { courseId: { in: filters.enrolledInCourseIds } } },
    });
  }

  if (filters.notEnrolledInCourseIds && filters.notEnrolledInCourseIds.length > 0) {
    conditions.push({
      enrollments: { none: { courseId: { in: filters.notEnrolledInCourseIds } } },
    });
  }

  if (typeof filters.lastActiveDays === "number") {
    const threshold = new Date(now.getTime() - filters.lastActiveDays * 24 * 60 * 60 * 1000);
    conditions.push({ lastActiveAt: { gte: threshold } });
  }

  if (typeof filters.inactiveDays === "number") {
    const threshold = new Date(now.getTime() - filters.inactiveDays * 24 * 60 * 60 * 1000);
    // null lastActiveAt тоже считаем неактивным.
    conditions.push({
      OR: [{ lastActiveAt: { lt: threshold } }, { lastActiveAt: null }],
    });
  }

  if (filters.createdAfter) {
    conditions.push({ createdAt: { gte: new Date(filters.createdAfter) } });
  }
  if (filters.createdBefore) {
    conditions.push({ createdAt: { lte: new Date(filters.createdBefore) } });
  }

  if (filters.subscription === "subscribed") {
    conditions.push({ marketingOptOut: false });
  } else if (filters.subscription === "unsubscribed") {
    conditions.push({ marketingOptOut: true });
  }
  // "all" или undefined — условие не добавляется

  if (filters.emailValidated === true) {
    conditions.push({ emailValidated: true });
  } else if (filters.emailValidated === false) {
    conditions.push({ emailValidated: false });
  }

  if (filters.tags && filters.tags.length > 0) {
    // AND: каждый тег должен присутствовать в emailTags JSON-массиве.
    for (const tag of filters.tags) {
      conditions.push({ emailTags: { array_contains: [tag] } });
    }
  }

  if (filters.keywordsAny && filters.keywordsAny.length > 0) {
    // User.keywords это String[] — Prisma поддерживает hasSome для array fields.
    conditions.push({ keywords: { hasSome: filters.keywordsAny } });
  }

  // --- Поведенческие фильтры через relations ---

  if (filters.openedCampaignIds && filters.openedCampaignIds.length > 0) {
    conditions.push({
      emailEvents: {
        some: {
          type: "opened",
          campaignId: { in: filters.openedCampaignIds },
        },
      },
    });
  }
  if (filters.notOpenedCampaignIds && filters.notOpenedCampaignIds.length > 0) {
    conditions.push({
      emailEvents: {
        none: {
          type: "opened",
          campaignId: { in: filters.notOpenedCampaignIds },
        },
      },
    });
  }

  if (filters.clickedCampaignIds && filters.clickedCampaignIds.length > 0) {
    conditions.push({
      emailEvents: {
        some: {
          type: "clicked",
          campaignId: { in: filters.clickedCampaignIds },
        },
      },
    });
  }
  if (filters.notClickedCampaignIds && filters.notClickedCampaignIds.length > 0) {
    conditions.push({
      emailEvents: {
        none: {
          type: "clicked",
          campaignId: { in: filters.notClickedCampaignIds },
        },
      },
    });
  }

  // Покупки. Все покупочные фильтры разделяют purchasedSinceDaysAgo —
  // если задан, применяется ко всем (purchasedAny / purchasedOfferIds).
  const purchaseDateFilter: Prisma.OrderWhereInput = {};
  if (typeof filters.purchasedSinceDaysAgo === "number") {
    const sincDate = new Date(
      now.getTime() - filters.purchasedSinceDaysAgo * 24 * 60 * 60 * 1000
    );
    purchaseDateFilter.createdAt = { gte: sincDate };
  }

  if (filters.purchasedAny === true) {
    conditions.push({
      orders: { some: { status: "paid", ...purchaseDateFilter } },
    });
  } else if (filters.purchasedAny === false) {
    conditions.push({
      orders: { none: { status: "paid", ...purchaseDateFilter } },
    });
  }

  if (filters.purchasedOfferIds && filters.purchasedOfferIds.length > 0) {
    conditions.push({
      orders: {
        some: {
          status: "paid",
          offerId: { in: filters.purchasedOfferIds },
          ...purchaseDateFilter,
        },
      },
    });
  }
  if (filters.notPurchasedOfferIds && filters.notPurchasedOfferIds.length > 0) {
    conditions.push({
      orders: {
        none: {
          status: "paid",
          offerId: { in: filters.notPurchasedOfferIds },
          ...purchaseDateFilter,
        },
      },
    });
  }

  // По умолчанию из маркетинговых рассылок исключаем заблокированных,
  // если явно не указано иное.
  const excludeBlocked = filters.excludeBlocked !== false;
  if (excludeBlocked) {
    conditions.push({ isBlocked: false });
  }

  if (conditions.length === 0) return where;
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}
