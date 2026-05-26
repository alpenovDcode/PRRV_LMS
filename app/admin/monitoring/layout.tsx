"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, History, Calendar, Brain } from "lucide-react";

const TABS = [
  { href: "/admin/monitoring/errors", label: "Ошибки", icon: AlertTriangle },
  { href: "/admin/monitoring/audit", label: "Аудит", icon: History },
  { href: "/admin/monitoring/schedule", label: "Расписание", icon: Calendar },
  { href: "/admin/monitoring/ai-homework", label: "AI-проверки ДЗ", icon: Brain },
];

export default function MonitoringLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
