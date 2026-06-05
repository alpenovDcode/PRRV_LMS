"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Database,
  User,
  MessageSquare,
  BarChart3,
  Link2,
  Users,
} from "lucide-react";

type GcData = Record<string, string | null | undefined>;

interface FieldDef {
  key: string;
  label: string;
}

interface FieldGroup {
  title: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  collapsible?: boolean;
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: "Основное",
    icon: <Database className="h-4 w-4" />,
    fields: [
      { key: "id", label: "ID GetCourse" },
      { key: "Email", label: "Email" },
      { key: "Тип регистрации", label: "Тип регистрации" },
      { key: "Создан", label: "Дата регистрации" },
      { key: "Последняя активность", label: "Последняя активность" },
    ],
  },
  {
    title: "Личные данные",
    icon: <User className="h-4 w-4" />,
    fields: [
      { key: "Имя", label: "Имя" },
      { key: "Фамилия", label: "Фамилия" },
      { key: "Телефон", label: "Телефон" },
      { key: "Дата рождения", label: "Дата рождения" },
      { key: "Дата рождения_2", label: "Дата рождения (2)" },
      { key: "Возраст", label: "Возраст" },
      { key: "Страна", label: "Страна" },
      { key: "Город", label: "Город" },
      { key: "документ", label: "Документ" },
      {
        key: "Оставь, пожалуйста, контакты своих родителей, чтобы у нас была возможность с ними связаться при необходимости. Ответь на вопрос в формате: имя и отчество и контактный телефон:",
        label: "Контакты родителей",
      },
    ],
  },
  {
    title: "Соцсети и мессенджеры",
    icon: <MessageSquare className="h-4 w-4" />,
    fields: [
      { key: "Ник в TG", label: "Ник в Telegram" },
      { key: "UserID_Telegram", label: "Telegram User ID" },
      { key: "Username_Telegram", label: "Telegram Username" },
      { key: "Ссылка на профиль в Instagram", label: "Instagram" },
      { key: "Ссылка на страницу ВКонтакте", label: "ВКонтакте" },
      { key: "VK-ID", label: "VK ID" },
      { key: "sb_id", label: "SaleBot ID" },
      { key: "UserID_Max", label: "UserID Max" },
    ],
  },
  {
    title: "Квиз / Онбординг",
    icon: <BarChart3 className="h-4 w-4" />,
    collapsible: true,
    fields: [
      { key: "Какой предмет преподаете", label: "Предмет" },
      { key: "Сколько часов в неделю работаете", label: "Часов в неделю" },
      { key: "Сегмент А/Б теста", label: "Сегмент А/Б" },
      { key: "trek1", label: "Трек 1" },
      { key: "trek2", label: "Трек 2" },
      { key: "trek3", label: "Трек 3" },
      { key: "trek4", label: "Трек 4" },
      { key: "trek5", label: "Трек 5" },
      { key: "quiz_subject", label: "Quiz: Предмет" },
      { key: "quiz_weekly_hours", label: "Quiz: Часов в неделю" },
      { key: "quiz_current_income", label: "Quiz: Текущий доход" },
      { key: "quiz_target_income", label: "Quiz: Целевой доход" },
      { key: "quiz_goals", label: "Quiz: Цели" },
      { key: "quiz_telegram", label: "Quiz: Telegram" },
      { key: "Тест для урока", label: "Тест для урока" },
      { key: "Урок", label: "Урок" },
      { key: "Согласен на получение рекламной рассылки", label: "Согласие на рассылку" },
      {
        key: "1. Как лучше всего описать ваш текущий опыт преподавания?",
        label: "1. Опыт преподавания",
      },
      {
        key: "2. Какая задача для вас сейчас наиболее актуальна?",
        label: "2. Актуальная задача",
      },
      {
        key: "3. Как вы оцениваете свои навыки работы с онлайн-инструментами?",
        label: "3. Навыки онлайн-инструментов",
      },
      {
        key: "4. Как выглядит ваше текущее расписание?",
        label: "4. Текущее расписание",
      },
      {
        key: "5. Какой результат для вас сейчас в приоритете? Выберите тот вариант, который для вас важнее всего сейчас. Даже если хочется всё сразу — отметьте главный приоритет",
        label: "5. Приоритетный результат",
      },
    ],
  },
  {
    title: "UTM / Источник",
    icon: <Link2 className="h-4 w-4" />,
    collapsible: true,
    fields: [
      { key: "Откуда пришел", label: "Откуда пришёл" },
      { key: "utm_source", label: "utm_source" },
      { key: "utm_medium", label: "utm_medium" },
      { key: "utm_campaign", label: "utm_campaign" },
      { key: "utm_content", label: "utm_content" },
      { key: "utm_term", label: "utm_term" },
      { key: "utm_group", label: "utm_group" },
      { key: "utm_source_2", label: "utm_source (2)" },
      { key: "utm_medium_2", label: "utm_medium (2)" },
      { key: "utm_campaign_2", label: "utm_campaign (2)" },
      { key: "utm_term_2", label: "utm_term (2)" },
      { key: "utm_content_2", label: "utm_content (2)" },
      { key: "gc_system_user_utm_source", label: "GC System utm_source" },
      { key: "gc_system_user_utm_medium", label: "GC System utm_medium" },
      { key: "gc_system_user_utm_campaign", label: "GC System utm_campaign" },
      { key: "gc_system_user_utm_term", label: "GC System utm_term" },
      { key: "gc_system_user_utm_content", label: "GC System utm_content" },
    ],
  },
  {
    title: "Партнёр / Менеджер",
    icon: <Users className="h-4 w-4" />,
    fields: [
      { key: "От партнера", label: "От партнёра" },
      { key: "ID партнера", label: "ID партнёра" },
      { key: "Email партнера", label: "Email партнёра" },
      { key: "ФИО партнера", label: "ФИО партнёра" },
      { key: "ФИО менеджера", label: "ФИО менеджера" },
    ],
  },
];

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 min-w-[180px] shrink-0">{label}</span>
      <span className="text-sm text-gray-900 break-all">
        {value ? value : <span className="text-gray-300">—</span>}
      </span>
    </div>
  );
}

function GroupCard({
  group,
  data,
}: {
  group: FieldGroup;
  data: GcData | null;
}) {
  const [expanded, setExpanded] = useState(!group.collapsible);

  return (
    <Card className="border-none shadow-sm bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
            <span className="text-gray-400">{group.icon}</span>
            {group.title}
          </CardTitle>
          {group.collapsible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 text-xs text-gray-500 gap-1"
            >
              {expanded ? (
                <>
                  Свернуть <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  {group.fields.length} полей <ChevronDown className="h-3 w-3" />
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {group.fields.map((field) => (
            <FieldRow key={field.key} label={field.label} value={data?.[field.key]} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function GetcourseTab({ userId }: { userId: string }) {
  const { data: response, isLoading } = useQuery<{
    data: GcData | null;
    importedAt: string | null;
  }>({
    queryKey: ["admin", "users", userId, "getcourse"],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/users/${userId}/getcourse-data`);
      return res.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-32" />
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-3 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const gcData = response?.data ?? null;
  const importedAt = response?.importedAt ?? null;

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-400">
        {importedAt
          ? `Импортировано: ${new Date(importedAt).toLocaleString("ru-RU")}`
          : "Данные ещё не импортированы из GetCourse"}
      </div>

      {!gcData && (
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Database className="h-12 w-12 text-gray-200" />
            <p className="text-gray-500 font-medium">Нет данных GetCourse</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Данные появятся после импорта CSV-файла из GetCourse в раздел администрирования
            </p>
          </CardContent>
        </Card>
      )}

      {FIELD_GROUPS.map((group) => (
        <GroupCard key={group.title} group={group} data={gcData} />
      ))}
    </div>
  );
}
