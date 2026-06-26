"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Filter,
  FileText,
  Users,
  Workflow,
  Settings,
  ShieldOff,
} from "lucide-react";

const TABS = [
  { href: "/admin/marketing", label: "Обзор", icon: LayoutDashboard, exact: true },
  { href: "/admin/marketing/campaigns", label: "Кампании", icon: Send, exact: false },
  { href: "/admin/marketing/segments", label: "Сегменты", icon: Filter, exact: false },
  { href: "/admin/marketing/templates", label: "Шаблоны", icon: FileText, exact: false },
  { href: "/admin/marketing/contacts", label: "Контакты", icon: Users, exact: false },
  { href: "/admin/marketing/automations", label: "Автоматизации", icon: Workflow, exact: false },
  { href: "/admin/marketing/suppression", label: "Suppression", icon: ShieldOff, exact: false },
  { href: "/admin/marketing/settings", label: "Настройки", icon: Settings, exact: false },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.exact
              ? pathname === tab.href
              : pathname?.startsWith(tab.href);
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
