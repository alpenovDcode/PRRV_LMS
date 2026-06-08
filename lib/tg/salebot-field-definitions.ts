/**
 * lib/tg/salebot-field-definitions.ts
 *
 * Каталог типизированных custom-полей TgCustomField, которые
 * автоматически создаются при импорте CSV-выгрузки из SaleBot.
 *
 * Зачем нужно: SaleBot-адаптер раскладывает email, phone, UTM, ДР
 * и прочее в TgSubscriber.customFields (просто JSON). Без TgCustomField
 * definitions карточка подписчика покажет их как plain text парами
 * `field.email = ...`. С определениями — UI рендерит их типизированно:
 *   • email — кликабельный mailto:
 *   • phone — с маской
 *   • url — кликабельная ссылка
 *   • date — как дата
 *   • используются в фильтрах сегментов, узлах wait_reply, аналитике
 *
 * Что мы НЕ делаем:
 *   • НЕ обновляем существующие определения (если админ вручную задал
 *     `phone` как text — оставляем text, не меняем на phone, чтобы
 *     не сломать его кастомизацию). createMany(skipDuplicates).
 *   • НЕ ставим isRequired — это «приходящие» поля из CSV, требовать
 *     их нельзя.
 *
 * Безопасность типов:
 *   tg_birthdate в SaleBot часто содержит «Не указано» — поэтому
 *   text, не date. salebot_first_contact / salebot_last_contact в
 *   формате "2024-10-17 07:48:46 +0300" с TZ-суффиксом не парсится
 *   стандартными date-валидаторами — тоже text.
 */

import type { PrismaClient } from "@prisma/client";

/**
 * key должен соответствовать /^[a-z][a-z0-9_]*$/ (валидация в API).
 * type — один из text, number, date, email, phone, select, boolean, url.
 */
interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "email" | "phone" | "url" | "boolean";
  description?: string;
  sortOrder: number;
}

/** Полный каталог полей, которые SaleBot-адаптер кладёт в customFields. */
export const SALEBOT_FIELD_DEFINITIONS: FieldDef[] = [
  // Контакты — самое важное, наверху списка.
  {
    key: "email",
    label: "Email",
    type: "email",
    description: "Email пользователя (из выгрузки SaleBot)",
    sortOrder: 10,
  },
  {
    key: "phone",
    label: "Телефон",
    type: "phone",
    description: "Основной телефон (из выгрузки SaleBot)",
    sortOrder: 20,
  },
  {
    key: "workphone",
    label: "Рабочий телефон",
    type: "phone",
    sortOrder: 30,
  },
  // UTM — для маркетинговой аналитики.
  {
    key: "utm_source",
    label: "UTM source",
    type: "text",
    description: "Источник первой точки контакта (vk / inst / google / ...)",
    sortOrder: 40,
  },
  {
    key: "utm_medium",
    label: "UTM medium",
    type: "text",
    sortOrder: 50,
  },
  {
    key: "utm_campaign",
    label: "UTM campaign",
    type: "text",
    sortOrder: 60,
  },
  {
    key: "utm_content",
    label: "UTM content",
    type: "text",
    sortOrder: 70,
  },
  {
    key: "utm_term",
    label: "UTM term",
    type: "text",
    sortOrder: 80,
  },
  // Личное.
  {
    key: "tg_birthdate",
    label: "Дата рождения",
    // ВАЖНО: в SaleBot нередко "Не указано" — поэтому text, не date.
    type: "text",
    description: "В SaleBot часто пустое или «Не указано»",
    sortOrder: 90,
  },
  {
    key: "referrer",
    label: "Referrer URL",
    type: "url",
    description: "URL первой посадочной страницы",
    sortOrder: 100,
  },
  // Идентификаторы внешних систем — для синка с CRM.
  {
    key: "amo_client_id",
    label: "amoCRM client_id",
    type: "text",
    description: "Идентификатор контакта в amoCRM (если был)",
    sortOrder: 110,
  },
  {
    key: "getcourse_user_id",
    label: "GetCourse user_id",
    type: "text",
    sortOrder: 120,
  },
  {
    key: "getcourse_deal_id",
    label: "GetCourse deal_id",
    type: "text",
    sortOrder: 130,
  },
  {
    key: "form_id",
    label: "SaleBot form_id",
    type: "text",
    description: "Идентификатор формы SaleBot, через которую пришёл лид",
    sortOrder: 140,
  },
  // Служебные следы SaleBot — нужны для траблшутинга и обратной сверки.
  {
    key: "salebot_id",
    label: "SaleBot ID",
    type: "text",
    description: "Внутренний ID подписчика в SaleBot — для сверки выгрузок",
    sortOrder: 200,
  },
  {
    key: "salebot_bot",
    label: "SaleBot — имя бота",
    type: "text",
    description: "С каким ботом SaleBot шло общение",
    sortOrder: 210,
  },
  {
    key: "salebot_first_contact",
    label: "SaleBot — первый контакт",
    // Формат "2024-10-17 07:48:46 +0300" — text, не date.
    type: "text",
    sortOrder: 220,
  },
  {
    key: "salebot_last_contact",
    label: "SaleBot — последний контакт",
    type: "text",
    sortOrder: 230,
  },
  {
    key: "salebot_state",
    label: "SaleBot — состояние воронки",
    type: "text",
    sortOrder: 240,
  },
  {
    key: "salebot_lists",
    label: "SaleBot — списки (raw)",
    type: "text",
    description: "Списки SaleBot в исходном виде (JSON-подобный)",
    sortOrder: 250,
  },
  {
    key: "salebot_full_lists",
    label: "SaleBot — полные списки",
    type: "text",
    sortOrder: 260,
  },
];

/**
 * Создаёт TgCustomField definitions для всех ключей SaleBot-каталога,
 * которых ещё нет у этого бота. Уже существующие НЕ трогает (даже если
 * у админа там другой тип/label).
 *
 * Возвращает количество реально созданных полей (0 если все уже были).
 *
 * Идемпотентно: повторный вызов на том же боте ничего не делает
 * благодаря @@unique([botId, key]) + skipDuplicates.
 */
export async function ensureSalebotFieldDefinitions(
  db: PrismaClient,
  botId: string
): Promise<{ createdCount: number; createdKeys: string[] }> {
  const existing = await db.tgCustomField.findMany({
    where: {
      botId,
      key: { in: SALEBOT_FIELD_DEFINITIONS.map((d) => d.key) },
    },
    select: { key: true },
  });
  const have = new Set(existing.map((e) => e.key));
  const toCreate = SALEBOT_FIELD_DEFINITIONS.filter((d) => !have.has(d.key));
  if (toCreate.length === 0) {
    return { createdCount: 0, createdKeys: [] };
  }

  // createMany с skipDuplicates — защита от гонки, если параллельно
  // ещё один импорт уже создал часть полей.
  const result = await db.tgCustomField.createMany({
    data: toCreate.map((d) => ({
      botId,
      key: d.key,
      label: d.label,
      type: d.type,
      description: d.description ?? null,
      sortOrder: d.sortOrder,
      // options оставляем дефолтным "[]", isRequired=false,
      // validationRegex=null.
    })),
    skipDuplicates: true,
  });

  return {
    createdCount: result.count,
    createdKeys: toCreate.slice(0, result.count).map((d) => d.key),
  };
}
