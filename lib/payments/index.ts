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

/**
 * Имена провайдеров, поддерживаемых в фабрике. Используется и getProvider()
 * (берёт дефолт из env), и getProviderByName() (явное имя, нужно для
 * мультиметодной оплаты — одна страница оплаты, CP + ОТП на выбор).
 */
export type ProviderName = "mock" | "cloudpayments" | "otp";

const _providerByName = new Map<ProviderName, PaymentProvider>();

function instantiate(name: ProviderName): PaymentProvider {
  switch (name) {
    case "mock": {
      const { MockPaymentProvider } = require("./mock-provider");
      return new MockPaymentProvider();
    }
    case "cloudpayments": {
      const { CloudPaymentsProvider } = require("./cloudpayments/provider");
      return new CloudPaymentsProvider();
    }
    case "otp": {
      const { OtpPaymentProvider } = require("./otp/provider");
      return new OtpPaymentProvider();
    }
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown payment provider: "${exhaustive}"`);
    }
  }
}

/**
 * Получить конкретного провайдера по имени. Кешируется per-name.
 * Mock запрещён в проде (защита от случайной активации заказов).
 */
export function getProviderByName(name: ProviderName): PaymentProvider {
  if (process.env.NODE_ENV === "production" && name === "mock") {
    throw new Error("Mock payment provider is forbidden in production");
  }
  const cached = _providerByName.get(name);
  if (cached) return cached;
  const fresh = instantiate(name);
  _providerByName.set(name, fresh);
  return fresh;
}

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
    case "cloudpayments": {
      const { CloudPaymentsProvider } = require("./cloudpayments/provider");
      _provider = new CloudPaymentsProvider();
      break;
    }
    case "otp": {
      const { OtpPaymentProvider } = require("./otp/provider");
      _provider = new OtpPaymentProvider();
      break;
    }
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
