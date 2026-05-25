/**
 * lib/payments/index.ts
 *
 * Фабрика провайдера. Выбирает реализацию по PAYMENT_PROVIDER env.
 *
 * Чтобы добавить новый провайдер:
 *   1. Создать класс, реализующий PaymentProvider (lib/payments/yookassa.ts и т.д.)
 *   2. Добавить ветку в getProvider()
 *   3. Прописать PAYMENT_PROVIDER=yookassa в .env
 */

import type { PaymentProvider } from "./types";

let _provider: PaymentProvider | null = null;

export function getProvider(): PaymentProvider {
  if (_provider) return _provider;

  const isProd = process.env.NODE_ENV === "production";
  const explicit = process.env.PAYMENT_PROVIDER;

  // В продакшене НЕЛЬЗЯ запускаться без явно заданного провайдера и нельзя
  // использовать mock — иначе любой может активировать заказ через вебхук.
  if (isProd) {
    if (!explicit) {
      throw new Error("PAYMENT_PROVIDER env is required in production");
    }
    if (explicit === "mock") {
      throw new Error("Mock payment provider is forbidden in production");
    }
  }

  const name = explicit ?? "mock";

  switch (name) {
    case "mock": {
      const { MockPaymentProvider } = require("./mock-provider");
      _provider = new MockPaymentProvider();
      break;
    }
    // case "yookassa": {
    //   const { YooKassaProvider } = require("./yookassa");
    //   _provider = new YooKassaProvider();
    //   break;
    // }
    default:
      throw new Error(`Unknown payment provider: "${name}"`);
  }

  return _provider!;
}

/** Текущее имя провайдера — нужно для guard-проверок (например, скрыть mock-pay). */
export function isMockProviderActive(): boolean {
  try {
    return getProvider().name === "mock";
  } catch {
    return false;
  }
}

export type { PaymentProvider, CreatePaymentInput, CreatedPayment, PaymentStatusResult, PaymentStatus } from "./types";
