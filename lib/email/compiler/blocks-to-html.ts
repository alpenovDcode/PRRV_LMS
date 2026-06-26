import type { EmailDocument } from "../editor/types";
import { escapeHtml, renderBlock } from "./render-block";

/**
 * Компилирует EmailDocument в законченный HTML-документ письма.
 *
 * Структура:
 *   <html>
 *     <head> — meta viewport, max-width media query, MSO-комментарии
 *     <body bgcolor> — внешний фон
 *       <table width="100%"> — обёртка на всю ширину почтового клиента
 *         <table width="600"> — белая «карточка» письма
 *           ...rendered blocks...
 *         </table>
 *       </table>
 *
 * Переменные ({{firstName}}, {{unsubscribeUrl}}) подставляются ОТДЕЛЬНЫМ
 * шагом через variables.ts. На этапе compile они остаются как есть —
 * это позволяет хранить compiledHtml в БД и подставлять для каждого
 * получателя индивидуально.
 *
 * Trackin-пиксель и click-wrapper добавляются тоже отдельно (variables.ts),
 * чтобы compile был чистой функцией от документа.
 */

export interface CompileOptions {
  /** Заголовок страницы. По умолчанию — пустой. Используется в превью браузера. */
  documentTitle?: string;
  /** Прехедер (скрытый preview-текст под темой в инбоксе). */
  preheader?: string;
}

export function compileDocumentToHtml(
  doc: EmailDocument,
  options: CompileOptions = {}
): string {
  const { backgroundColor, contentWidth, fontFamily, linkColor } = doc.settings;
  const blocksHtml = doc.blocks.map((b) => renderBlock(b, doc)).join("\n");

  const preheader = options.preheader
    ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${backgroundColor};">${escapeHtml(options.preheader)}</div>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title>${escapeHtml(options.documentTitle ?? "")}</title>
  <!--[if mso]>
  <style type="text/css">
    table, td, th { border-collapse: collapse; }
  </style>
  <![endif]-->
  <style type="text/css">
    /* Эти стили работают в большинстве клиентов, в Gmail-вебе игнорируются —
       поэтому критичные стили мы дублируем inline. */
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { color: ${escapeHtml(linkColor)}; }
    a:hover { opacity: 0.85; }
    @media only screen and (max-width: ${contentWidth}px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .stack { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body bgcolor="${escapeHtml(backgroundColor)}" style="margin: 0; padding: 0; background-color: ${escapeHtml(backgroundColor)}; font-family: ${escapeHtml(fontFamily)};">
  ${preheader}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${escapeHtml(backgroundColor)}" style="background-color: ${escapeHtml(backgroundColor)};">
    <tr>
      <td align="center" style="padding: 24px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${contentWidth}" class="email-container" style="background-color: #ffffff; max-width: ${contentWidth}px; border-radius: 8px; overflow: hidden;">
          <tr><td>
            ${blocksHtml}
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
