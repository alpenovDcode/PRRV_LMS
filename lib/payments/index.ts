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

  const name = process.env.PAYMENT_PROVIDER ?? "mock";

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

export type { PaymentProvider, CreatePaymentInput, CreatedPayment, PaymentStatusResult, PaymentStatus } from "./types";
