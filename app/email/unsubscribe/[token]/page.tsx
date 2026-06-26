"use client";

import { use, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/**
 * Публичная страница отписки. Открывается по ссылке из футера письма:
 *   {{trackingBase}}/email/unsubscribe/{{unsubscribeToken}}
 *
 * UX:
 *   1. Загружаемся → проверяем токен через GET → показываем email + кнопку
 *   2. Клик «Отписаться» → POST → показываем подтверждение
 *   3. Если повторный визит уже отписанного — сразу показываем «вы отписаны»
 *   4. Если токен невалидный — «ссылка устарела»
 *
 * Дополнительно: страница рендерится в light-mode независимо от темы пользователя,
 * чтобы выглядеть как «отделённый официальный экран» — повышает доверие.
 */

interface InfoResponse {
  found: boolean;
  email?: string;
  fullName?: string | null;
  alreadyUnsubscribed?: boolean;
}

type State = { kind: "loading" } | { kind: "info"; data: InfoResponse } | { kind: "error" };

export default function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/email/unsubscribe/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setState({ kind: "info", data: json.data as InfoResponse });
        else setState({ kind: "error" });
      })
      .catch(() => setState({ kind: "error" }));
  }, [token]);

  async function handleUnsubscribe() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/email/unsubscribe/${token}`, { method: "POST" });
      const json = await r.json();
      if (json.success) {
        setDone(true);
      } else {
        setState({ kind: "error" });
      }
    } catch {
      setState({ kind: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center mb-2">
            <Mail className="h-7 w-7 text-blue-600" />
          </div>
          <CardTitle>Отписка от рассылки</CardTitle>
          <CardDescription>Прорыв — школа онлайн-репетиторов</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Проверяем ссылку…
            </div>
          )}

          {state.kind === "error" && (
            <div className="text-center py-4">
              <AlertCircle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
              <p className="text-sm text-gray-700">
                Не удалось обработать запрос. Возможно, ссылка устарела.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Если ошибка повторяется — напишите нам на info@prrv.tech.
              </p>
            </div>
          )}

          {state.kind === "info" && !state.data.found && (
            <div className="text-center py-4">
              <AlertCircle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
              <p className="text-sm text-gray-700">
                Ссылка не активна или истекла.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Если вы уже отписались — повторно делать ничего не нужно.
              </p>
            </div>
          )}

          {state.kind === "info" && state.data.found && (done || state.data.alreadyUnsubscribed) && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
              <p className="text-sm text-gray-900">
                Вы отписаны от маркетинговых писем.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {state.data.email}
              </p>
              <p className="text-xs text-gray-500 mt-3">
                Уведомления о покупках, ДЗ и сертификатах будут продолжать приходить —
                это технические сообщения, не маркетинг.
              </p>
            </div>
          )}

          {state.kind === "info" && state.data.found && !done && !state.data.alreadyUnsubscribed && (
            <div className="space-y-4">
              <div className="text-center text-sm text-gray-700">
                Подтвердите отписку email:
                <div className="font-semibold mt-1">{state.data.email}</div>
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={submitting}
                onClick={handleUnsubscribe}
              >
                {submitting ? "Отписываем…" : "Отписаться"}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Технические письма (оплата, доступ к курсу, проверка ДЗ) продолжат приходить.
                Отписка касается только маркетинговых рассылок.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
