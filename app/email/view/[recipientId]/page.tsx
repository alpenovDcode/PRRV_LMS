import { db } from "@/lib/db";
import { applyVariablesAndTracking, extractFirstName } from "@/lib/email/compiler/variables";
import { notFound } from "next/navigation";

/**
 * Публичная страница "Посмотреть письмо в браузере".
 *
 * Ссылка генерируется в каждом письме через {{viewInBrowserUrl}} — для тех
 * получателей, у кого почтовый клиент не отрисовал графику корректно (старые
 * Outlook'и, мобильные с заблокированными картинками). Без этой страницы
 * ссылка в письме вела бы в 404.
 *
 * recipientId формат — тот же что в track-эндпоинтах:
 *   - UUID EmailDeliveryJob (маркетинговая кампания)
 *   - UUID BroadcastRecipient (LMS-рассылка)
 *   - "auto:<runId>:<step>" — EmailAutomationRun (welcome-цепочки)
 *
 * Безопасность: содержимое — это HTML, который УЖЕ был отправлен получателю.
 * Никакой эскалации привилегий нет, юзер просто видит у нас то же самое что
 * пришло ему на почту. Whitelist в middleware.ts.
 *
 * UX: показываем письмо без click-tracking и без open-pixel (это уже view, не
 * отправка — лишний open мусорит метрики). Если recipient не найден или
 * данные устарели (шаблон удалён) — 404.
 */

interface PageProps {
  params: Promise<{ recipientId: string }>;
}

interface ResolvedEmail {
  html: string;
  subject: string;
  variables: Record<string, string | null>;
  unsubscribeToken: string | null;
}

async function resolveEmail(recipientId: string): Promise<ResolvedEmail | null> {
  // 1. Маркетинговая кампания.
  const job = await db.emailDeliveryJob.findUnique({
    where: { id: recipientId },
    select: {
      email: true,
      variables: true,
      campaign: {
        select: { subject: true, template: { select: { compiledHtml: true } } },
      },
      user: {
        select: { fullName: true, unsubscribeToken: true },
      },
    },
  });
  if (job?.campaign?.template) {
    return {
      html: job.campaign.template.compiledHtml,
      subject: job.campaign.subject,
      variables: {
        firstName: extractFirstName(job.user?.fullName) || null,
        fullName: job.user?.fullName ?? null,
        email: job.email,
        ...((job.variables as Record<string, string> | null) ?? {}),
      },
      unsubscribeToken: job.user?.unsubscribeToken ?? null,
    };
  }

  // 2. Автоматизация: auto:<runId>:<step>.
  if (recipientId.startsWith("auto:")) {
    const [, runId, stepStr] = recipientId.split(":");
    if (!runId) return null;
    const stepIdx = Number(stepStr) || 0;
    const run = await db.emailAutomationRun.findUnique({
      where: { id: runId },
      select: {
        automation: { select: { steps: true, name: true } },
        user: { select: { email: true, fullName: true, unsubscribeToken: true } },
      },
    });
    if (!run) return null;
    const steps = (run.automation.steps as Array<{ templateId?: string }> | null) ?? [];
    const tplId = steps[stepIdx]?.templateId;
    if (!tplId) return null;
    const tpl = await db.emailVisualTemplate.findUnique({
      where: { id: tplId },
      select: { compiledHtml: true, subject: true },
    });
    if (!tpl) return null;
    return {
      html: tpl.compiledHtml,
      subject: tpl.subject,
      variables: {
        firstName: extractFirstName(run.user.fullName) || null,
        fullName: run.user.fullName ?? null,
        email: run.user.email,
        automationName: run.automation.name,
      },
      unsubscribeToken: run.user.unsubscribeToken ?? null,
    };
  }

  // LMS-рассылки (Broadcast) — у них в БД хранится только plaintext message,
  // не compiledHtml. View-in-browser для них не поддерживаем — это были
  // системные нотификации, не маркетинг. Если recipientId — broadcast, 404.
  return null;
}

export default async function ViewInBrowserPage({ params }: PageProps) {
  const { recipientId } = await params;
  const resolved = await resolveEmail(recipientId);
  if (!resolved) {
    notFound();
  }

  const html = applyVariablesAndTracking({
    html: resolved.html,
    variables: resolved.variables,
    recipientId,
    unsubscribeToken: resolved.unsubscribeToken ?? undefined,
    enableClickTracking: false,
    enableOpenTracking: false,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f5", padding: "16px 0" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
        <div
          style={{
            fontSize: 13,
            color: "#71717a",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Это веб-версия письма «{resolved.subject}»
        </div>
        <iframe
          srcDoc={html}
          title={resolved.subject}
          sandbox="allow-same-origin"
          style={{
            width: "100%",
            minHeight: "80vh",
            border: 0,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        />
      </div>
    </div>
  );
}
