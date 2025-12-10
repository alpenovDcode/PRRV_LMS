"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Bug, Info, AlertCircle, ArrowLeft, User } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ErrorDetails {
  id: string;
  title: string;
  message: string;
  stack?: string;
  count: number;
  severity: "critical" | "error" | "warning" | "info";
  status: "new" | "investigating" | "resolved" | "ignored";
  lastOccurred: string;
  firstOccurred: string;
  notes?: string;
  errors?: Array<{
    id: string;
    message: string;
    url?: string;
    userAgent?: string;
    createdAt: string;
    user?: {
      id: string;
      email: string;
      fullName?: string;
    };
    browserInfo?: any;
    metadata?: any;
  }>;
}

const severityIcons = {
  critical: <AlertCircle className="h-5 w-5" />,
  error: <AlertTriangle className="h-5 w-5" />,
  warning: <Bug className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
};

const severityColors = {
  critical: "destructive",
  error: "destructive",
  warning: "warning",
  info: "secondary",
} as const;

export default function ErrorDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchError();
  }, [params.id]);

  async function fetchError() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/errors/${params.id}`);
      const data = await response.json();

      if (data.success) {
        const errorData = data.type === "group" ? data.error : data.error;
        setError(errorData);
        setStatus(errorData.status);
        setNotes(errorData.notes || "");
      }
    } catch (error) {
      console.error("Failed to fetch error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus() {
    setUpdating(true);
    try {
      const response = await fetch(`/api/admin/errors/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });

      if (response.ok) {
        await fetchError();
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setUpdating(false);
    }
  }

  async function deleteError() {
    if (!confirm("Вы уверены, что хотите удалить эту ошибку?")) return;

    try {
      const response = await fetch(`/api/admin/errors/${params.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/admin/monitoring/errors");
      }
    } catch (error) {
      console.error("Failed to delete error:", error);
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Загрузка...</div>;
  }

  if (!error) {
    return <div className="p-8 text-center">Ошибка не найдена</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/monitoring/errors">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Детали ошибки</h1>
            <p className="text-sm text-muted-foreground">
              Первое: {format(new Date(error.firstOccurred), "PPp", { locale: ru })}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={deleteError}>
          Удалить
        </Button>
      </div>

      {/* Main Info */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <Badge variant={severityColors[error.severity]} className="mt-1">
              <span className="flex items-center gap-1">
                {severityIcons[error.severity]}
                {error.severity}
              </span>
            </Badge>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{error.title}</h2>
              <p className="mt-1 text-muted-foreground">{error.message}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Повторений</div>
              <div className="text-2xl font-bold">{error.count}</div>
            </div>
          </div>

          {error.stack && (
            <div>
              <h3 className="mb-2 font-medium">Stack Trace</h3>
              <pre className="overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
                {error.stack}
              </pre>
            </div>
          )}
        </div>
      </Card>

      {/* Status Management */}
      <Card className="p-6">
        <h3 className="mb-4 font-semibold">Управление статусом</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Статус</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Новая</SelectItem>
                <SelectItem value="investigating">В работе</SelectItem>
                <SelectItem value="resolved">Исправлено</SelectItem>
                <SelectItem value="ignored">Игнорируется</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Заметки</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Добавьте заметки о решении проблемы..."
              rows={4}
            />
          </div>

          <Button onClick={updateStatus} disabled={updating}>
            {updating ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </Card>

      {/* Recent Occurrences */}
      {error.errors && error.errors.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 font-semibold">
            Последние повторения ({error.errors.length})
          </h3>
          <div className="space-y-4">
            {error.errors.map((occurrence) => (
              <div
                key={occurrence.id}
                className="rounded-lg border p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{occurrence.message}</div>
                    {occurrence.url && (
                      <div className="text-sm text-muted-foreground">
                        URL: {occurrence.url}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(occurrence.createdAt), "PPp", { locale: ru })}
                  </div>
                </div>

                {occurrence.user && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4" />
                    <span>
                      {occurrence.user.fullName || occurrence.user.email}
                    </span>
                  </div>
                )}

                {occurrence.browserInfo && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">
                      Browser Info
                    </summary>
                    <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
                      {JSON.stringify(occurrence.browserInfo, null, 2)}
                    </pre>
                  </details>
                )}

                {occurrence.metadata && Object.keys(occurrence.metadata).length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">
                      Metadata
                    </summary>
                    <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
                      {JSON.stringify(occurrence.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
