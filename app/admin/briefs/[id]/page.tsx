"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Download, Trash2, FileText, Music, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import type { BriefFileType } from "@/lib/brief";

interface BriefFile {
  id: string;
  fileType: BriefFileType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  caseId: string | null;
}

interface BriefCase {
  id: string;
  orderIndex: number;
  name: string | null;
  age: string | null;
  goal: string | null;
  beforeText: string | null;
  duration: string | null;
  problems: string | null;
  afterText: string | null;
  reviewText: string | null;
  files: BriefFile[];
}

interface BriefDetail {
  id: string;
  status: string;
  completedAt: string | null;
  updatedAt: string;
  createdAt: string;

  fio: string | null;
  subject: string | null;
  targetAudience: string | null;
  painsGoals: string | null;

  utp: string | null;
  educationText: string | null;
  experience: string | null;
  achievements: string | null;
  methods: string | null;
  formats: string | null;

  adIntro: string | null;
  adProcess: string | null;
  adResult: string | null;

  existingStyle: string | null;
  preferredStyle: string | null;
  characterImage: string | null;
  cardImpression: string | null;
  colorPreferences: string | null;

  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    phone: string | null;
    telegram: string | null;
  };
  cases: BriefCase[];
  files: BriefFile[];
}

export default function AdminBriefDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: brief, isLoading } = useQuery<BriefDetail>({
    queryKey: ["admin", "brief", id],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/briefs/${id}`);
      return r.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/briefs/${id}`),
    onSuccess: () => {
      toast.success("Бриф удалён");
      qc.invalidateQueries({ queryKey: ["admin", "briefs"] });
      router.push("/admin/briefs");
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || "Не удалось удалить"),
  });

  if (isLoading || !brief) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const filesByType = (type: BriefFileType) =>
    brief.files.filter((f) => f.fileType === type);

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/admin/briefs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К списку
          </Link>
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("Удалить этот бриф? Действие необратимо.")) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Удалить
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              {brief.fio || brief.user.fullName || brief.user.email}
            </CardTitle>
            <Badge variant={brief.status === "completed" ? "default" : "secondary"}>
              {brief.status === "completed" ? "Завершён" : "В работе"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Email" value={brief.user.email} />
          {brief.user.fullName && <Row label="Имя в LMS" value={brief.user.fullName} />}
          {brief.user.phone && <Row label="Телефон" value={brief.user.phone} />}
          {brief.user.telegram && <Row label="Telegram" value={brief.user.telegram} />}
          <Row
            label="Заполнено"
            value={format(
              new Date(brief.completedAt || brief.updatedAt),
              "d MMMM yyyy, HH:mm",
              { locale: ru }
            )}
          />
        </CardContent>
      </Card>

      <Section title="Блок 1. Основная информация" color="bg-yellow-100 text-yellow-900">
        <TextRow label="ФИО" value={brief.fio} />
        <TextRow label="Предмет / специализация" value={brief.subject} />
        <TextRow label="Целевая аудитория" value={brief.targetAudience} />
        <TextRow label="Боли / цели учеников" value={brief.painsGoals} />
      </Section>

      <Section title="Блок 2. Фото" color="bg-orange-100 text-orange-900">
        <FileGallery title="Портретные фото" files={filesByType("portrait")} />
        <FileGallery title="Селфи" files={filesByType("selfie")} />
        <FileGallery title="Фото в контексте" files={filesByType("context")} />
      </Section>

      <Section title="Блок 3. Кейсы и отзывы" color="bg-blue-100 text-blue-900">
        {brief.cases.length === 0 && (
          <p className="text-sm text-muted-foreground">Кейсы не добавлены.</p>
        )}
        {brief.cases.map((c, idx) => (
          <div key={c.id} className="space-y-2 rounded-lg border p-4">
            <div className="font-semibold">Кейс №{idx + 1}</div>
            <TextRow label="Имя ученика" value={c.name} />
            <TextRow label="Класс / возраст" value={c.age} />
            <TextRow label="Цель занятий" value={c.goal} />
            <TextRow label="Что было до" value={c.beforeText} />
            <TextRow label="Длительность обучения" value={c.duration} />
            <TextRow label="Проблемы / сложности" value={c.problems} />
            <TextRow label="Что стало после" value={c.afterText} />
            <TextRow label="Доп. информация / отзыв" value={c.reviewText} />
            {c.files.length > 0 && (
              <FileGallery title="Файлы отзыва" files={c.files} />
            )}
          </div>
        ))}
        {filesByType("review").filter((f) => !f.caseId).length > 0 && (
          <FileGallery
            title="Файлы отзывов (без привязки к кейсу)"
            files={filesByType("review").filter((f) => !f.caseId)}
          />
        )}
      </Section>

      <Section title="Блок 4. Инфографика" color="bg-green-100 text-green-900">
        <TextRow label="УТП" value={brief.utp} />
        <TextRow label="Образование" value={brief.educationText} />
        <FileGallery title="Дипломы и сертификаты" files={filesByType("education")} />
        <TextRow label="Опыт преподавания" value={brief.experience} />
        <TextRow label="Достижения учеников" value={brief.achievements} />
        <TextRow label="Методики и подход" value={brief.methods} />
        <TextRow label="Форматы занятий" value={brief.formats} />
        <FileGallery title="Дополнительные материалы" files={filesByType("materials")} />
      </Section>

      <Section title="Блок 5. Как проходит обучение" color="bg-red-100 text-red-900">
        <TextRow label="Как проходят уроки" value={brief.adIntro} />
        <TextRow label="Что используется при работе" value={brief.adProcess} />
        <TextRow label="Какой результат получит ученик" value={brief.adResult} />
      </Section>

      <Section title="Блок 6. Визуальные предпочтения" color="bg-purple-100 text-purple-900">
        <TextRow label="Существующий стиль" value={brief.existingStyle} />
        <FileGallery title="Примеры дизайна" files={filesByType("style_example")} />
        <TextRow label="Предпочитаемый стиль" value={brief.preferredStyle} />
        <TextRow label="Образ / персонаж" value={brief.characterImage} />
        <TextRow label="Впечатление от карточки" value={brief.cardImpression} />
        <TextRow
          label="Цвета / элементы, которые НЕ использовать"
          value={brief.colorPreferences}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge className={color}>{title}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function TextRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="whitespace-pre-wrap text-sm">{value}</div>
    </div>
  );
}

function FileGallery({
  title,
  files,
}: {
  title: string;
  files: { id: string; fileUrl: string; fileName: string | null; mimeType: string | null }[];
}) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({files.length})
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {files.map((f) => (
          <a
            key={f.id}
            href={f.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
          >
            {f.mimeType?.startsWith("image/") ? (
              <Image
                src={f.fileUrl}
                alt={f.fileName || ""}
                fill
                className="object-cover transition-transform group-hover:scale-105"
                sizes="200px"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-xs">
                {f.mimeType?.startsWith("audio/") ? (
                  <Music className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <FileText className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="line-clamp-2 break-all">
                  {f.fileName || "Файл"}
                </span>
              </div>
            )}
            <div className="absolute bottom-1 right-1 rounded-full bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Download className="h-3.5 w-3.5" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
