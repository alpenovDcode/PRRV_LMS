"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Hammer } from "lucide-react";

interface ComingSoonProps {
  title: string;
  sprint: string;
  description: string;
  checklist?: string[];
}

/**
 * Заглушка для разделов /admin/marketing/*, которые делаются в последующих
 * спринтах. Нужна, чтобы внутренние табы layout.tsx не упирались в 404.
 *
 * После реализации соответствующего спринта заглушка заменяется на
 * нормальную страницу. См. docs/MARKETING_EMAIL_SYSTEM.md §7 — план.
 */
export function ComingSoon({ title, sprint, description, checklist }: ComingSoonProps) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Hammer className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="mt-1">{sprint}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-700">{description}</p>
          {checklist && checklist.length > 0 && (
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500 pt-2 border-t">
            См. план спринтов в <code className="rounded bg-gray-100 px-1">docs/MARKETING_EMAIL_SYSTEM.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
