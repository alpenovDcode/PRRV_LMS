/**
 * lib/payments/cloudpayments/settings.ts
 *
 * Возвращает эффективные настройки платежей. Приоритет:
 *   1. БД (PaymentSettings) — runtime-конфиг через админку
 *   2. env (CP_RECEIPT_*, CP_RESTRICTED_METHODS, CP_PAYMENT_SCHEMA)
 *   3. Дефолты
 *
 * Кэшируем результат на 30 секунд чтобы не бить в БД на каждом платеже.
 * Через UI «Сохранить» очищаем кэш.
 */

import { db } from "@/lib/db";
import {
  CP_RECEIPT_ENABLED,
  CP_RECEIPT_TAXATION_SYSTEM,
  CP_RECEIPT_VAT,
  CP_RECEIPT_METHOD,
  CP_RECEIPT_OBJECT,
  CP_PAYMENT_SCHEMA,
  getRestrictedMethods,
  type CpPaymentSchema,
} from "./config";

export interface EffectivePaymentSettings {
  receiptEnabled: boolean;
  taxationSystem: number;
  vat: number;
  method: number;
  object: number;
  restrictedMethods: string[];
  paymentSchema: CpPaymentSchema;
}

interface CacheEntry {
  value: EffectivePaymentSettings;
  expiresAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidateSettingsCache(): void {
  _cache = null;
}

export async function getEffectivePaymentSettings(): Promise<EffectivePaymentSettings> {
  // Быстрый путь — кэш
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.value;
  }

  // Дефолты из env (всегда есть)
  const fromEnv: EffectivePaymentSettings = {
    receiptEnabled: CP_RECEIPT_ENABLED,
    taxationSystem: CP_RECEIPT_TAXATION_SYSTEM,
    vat: CP_RECEIPT_VAT,
    method: CP_RECEIPT_METHOD,
    object: CP_RECEIPT_OBJECT,
    restrictedMethods: getRestrictedMethods(),
    paymentSchema: CP_PAYMENT_SCHEMA,
  };

  // Пробуем загрузить БД-настройки
  let value: EffectivePaymentSettings = fromEnv;
  try {
    const row = await db.paymentSettings.findUnique({ where: { id: "default" } });
    if (row) {
      value = {
        receiptEnabled: row.receiptEnabled,
        taxationSystem: row.taxationSystem,
        vat: row.vat,
        method: row.method,
        object: row.object,
        restrictedMethods: row.restrictedMethods,
        paymentSchema: (row.paymentSchema as CpPaymentSchema) ?? "Single",
      };
    }
  } catch (e) {
    // БД недоступна / миграция не применилась → fallback на env, не ломаем платежи
    console.warn("[payment-settings] DB load failed, using env defaults:", e);
  }

  _cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
