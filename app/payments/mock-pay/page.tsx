import { notFound } from "next/navigation";
import { isMockProviderActive } from "@/lib/payments";
import MockPayClient from "./MockPayClient";

/**
 * Серверный guard: страница симуляции оплаты доступна ТОЛЬКО когда активен
 * mock-провайдер. В продакшене getProvider() бросит исключение для mock,
 * isMockProviderActive() вернёт false → notFound() = 404.
 */
export default function MockPayPage() {
  if (!isMockProviderActive()) {
    notFound();
  }
  return <MockPayClient />;
}
