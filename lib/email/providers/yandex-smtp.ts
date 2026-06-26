import nodemailer, { type Transporter } from "nodemailer";
import type { EmailProvider, SendOneParams, SendOneResult } from "./types";

/**
 * Yandex 360 SMTP провайдер для маркетинговых рассылок.
 *
 * Используется как стартовая реализация: на нём можно тестировать UI и
 * отправлять письма узким сегментам (сотрудники, пилотная группа), пока
 * Unisender-домен mail.prrv.tech не прогрет.
 *
 * НЕ путать с lib/email-service.ts — тот шлёт транзакционку через kpc@,
 * этот провайдер работает с тем же SMTP, но используется в очереди
 * маркетинговых кампаний (EmailDeliveryJob -> /api/email-cron/tick).
 *
 * Поддерживает только sendOne. Webhook/валидация/синхронизация контактов
 * не реализованы — Yandex SMTP это просто транспорт, не CRM.
 */
export class YandexSmtpProvider implements EmailProvider {
  readonly name = "yandex" as const;

  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.yandex.ru",
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    return this.transporter;
  }

  async sendOne(params: SendOneParams): Promise<SendOneResult> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      throw new Error("YandexSmtpProvider: SMTP_USER/SMTP_PASSWORD не заданы");
    }

    const info = await this.getTransporter().sendMail({
      from: `"${params.fromName}" <${params.fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      headers: params.headers,
    });

    return { providerMessageId: info.messageId };
  }
}
