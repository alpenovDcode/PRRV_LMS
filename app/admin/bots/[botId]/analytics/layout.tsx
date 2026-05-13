"use client";

import Link from "next/link";
import { usePathname, useParams, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PeriodSelector } from "@/components/admin/tg/analytics/period-selector";

export default function AnalyticsSubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ botId: string }>();
  const pathname = usePathname();
  const sp = useSearchParams();
  const botId = params.botId;

  // Preserve period across tab navigation.
  const qs = sp?.toString() ? `?${sp.toString()}` : "";

  const tabs = [
    { href: `/admin/bots/${botId}/analytics`, label: "Обзор" },
    { href: `/admin/bots/${botId}/analytics/funnels`, label: "Воронки" },
    { href: `/admin/bots/${botId}/analytics/utm`, label: "UTM" },
    { href: `/admin/bots/${botId}/analytics/cohorts`, label: "Когорты" },
    { href: `/admin/bots/${botId}/analytics/broadcasts`, label: "Рассылки" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => {
            const isActive =
              pathname === t.href ||
              (t.href !== `/admin/bots/${botId}/analytics` && pathname.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={`${t.href}${qs}`}
                className={cn(
                  "rounded px-3 py-1.5 text-sm",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <PeriodSelector />
      </div>
      <div>{children}</div>
    </div>
  );
}
