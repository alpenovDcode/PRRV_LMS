import { subDays } from "date-fns";

export function rangeToFromDate(range: string | null | undefined): Date | undefined {
  if (range === "7d") return subDays(new Date(), 7);
  if (range === "30d") return subDays(new Date(), 30);
  if (range === "90d") return subDays(new Date(), 90);
  return undefined; // "all"
}

export function rangeLabel(range: string | null | undefined): string {
  if (range === "7d") return "7 дней";
  if (range === "30d") return "30 дней";
  if (range === "90d") return "3 месяца";
  return "всё время";
}
