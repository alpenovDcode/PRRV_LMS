import sanitizeHtml from "sanitize-html";
import type {
  ButtonBlock,
  ColumnsBlock,
  DividerBlock,
  EmailBlock,
  EmailDocument,
  FooterBlock,
  HeadingBlock,
  ImageBlock,
  SpacerBlock,
  TextBlock,
} from "../editor/types";

/**
 * Каждый блок рендерится как отдельная `<table>` шириной 100% контейнера.
 * Это даёт надёжный layout даже в Outlook, который не понимает div+css.
 *
 * Inline-CSS обязателен: <style> в теле письма игнорируется Gmail (внешние
 * шрифты, классы — нет), всё пишем атрибутами style.
 *
 * sanitize-html — только для пользовательского HTML (text-block и footer).
 * Для каркаса (атрибуты блоков) экранируем сами через escapeHtml.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RICH_TEXT_ALLOWED_TAGS = [
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "a",
  "br",
  "p",
  "ul",
  "ol",
  "li",
  "span",
];

const RICH_TEXT_ALLOWED_ATTRS = {
  a: ["href", "target", "rel", "style"],
  span: ["style"],
  p: ["style"],
};

/** Sanitize HTML внутри text-block. Запрещаем всё кроме базового rich-text. */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: RICH_TEXT_ALLOWED_ATTRS,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // Внешние ссылки безопаснее открывать в новой вкладке.
          target: attribs.target || "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}

function alignmentStyle(align: string | undefined): string {
  switch (align) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
    default:
      return "center";
  }
}

function renderHeading(block: HeadingBlock, doc: EmailDocument): string {
  const color = block.color ?? "#1f2937";
  const size = block.level === 1 ? 28 : block.level === 2 ? 22 : 18;
  const align = alignmentStyle(block.align);
  const tag = `h${block.level}`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="${align}" style="padding: 12px 24px;">
        <${tag} style="margin: 0; font-family: ${escapeHtml(doc.settings.fontFamily)}; font-size: ${size}px; line-height: 1.3; color: ${escapeHtml(color)}; font-weight: 700; text-align: ${align};">
          ${escapeHtml(block.text)}
        </${tag}>
      </td></tr>
    </table>`;
}

function renderText(block: TextBlock, doc: EmailDocument): string {
  const fontSize = block.fontSize ?? 16;
  const color = block.color ?? "#374151";
  const align = alignmentStyle(block.align);
  const safe = sanitizeRichText(block.html ?? "");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="${align}" style="padding: 8px 24px; font-family: ${escapeHtml(doc.settings.fontFamily)}; font-size: ${fontSize}px; line-height: 1.55; color: ${escapeHtml(color)}; text-align: ${align};">
        ${safe}
      </td></tr>
    </table>`;
}

function renderButton(block: ButtonBlock, doc: EmailDocument): string {
  const bg = block.backgroundColor ?? "#2563eb";
  const fg = block.textColor ?? "#ffffff";
  const padY = block.paddingY ?? 14;
  const padX = block.paddingX ?? 28;
  const radius = block.borderRadius ?? 8;
  const align = alignmentStyle(block.align);

  // VML fallback для Outlook — иначе кнопка съезжает и теряет background.
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="${align}" style="padding: 16px 24px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(block.url)}" style="height:${padY * 2 + 16}px;v-text-anchor:middle;width:240px;" arcsize="${Math.round((radius / (padY * 2 + 16)) * 100)}%" stroke="f" fillcolor="${escapeHtml(bg)}">
        <w:anchorlock/>
        <center style="color:${escapeHtml(fg)};font-family:${escapeHtml(doc.settings.fontFamily)};font-size:16px;font-weight:bold;">${escapeHtml(block.text)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${escapeHtml(block.url)}" target="_blank" style="background-color: ${escapeHtml(bg)}; color: ${escapeHtml(fg)}; display: inline-block; font-family: ${escapeHtml(doc.settings.fontFamily)}; font-size: 16px; font-weight: bold; line-height: 1; padding: ${padY}px ${padX}px; text-decoration: none; border-radius: ${radius}px;">
          ${escapeHtml(block.text)}
        </a>
        <!--<![endif]-->
      </td></tr>
    </table>`;
}

function renderImage(block: ImageBlock, _doc: EmailDocument): string {
  const align = alignmentStyle(block.align);
  const widthAttr = block.width ? ` width="${block.width}"` : "";
  const widthStyle = block.width ? `width: ${block.width}px;` : "max-width: 100%;";

  const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" border="0"${widthAttr} style="display: block; ${widthStyle} height: auto; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic;" />`;

  const wrapped = block.href
    ? `<a href="${escapeHtml(block.href)}" target="_blank" style="text-decoration: none;">${img}</a>`
    : img;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="${align}" style="padding: 8px 24px;">
        ${wrapped}
      </td></tr>
    </table>`;
}

function renderDivider(block: DividerBlock, _doc: EmailDocument): string {
  const color = block.color ?? "#e5e7eb";
  const thickness = block.thickness ?? 1;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding: 12px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="border-top: ${thickness}px solid ${escapeHtml(color)}; font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
        </table>
      </td></tr>
    </table>`;
}

function renderSpacer(block: SpacerBlock, _doc: EmailDocument): string {
  const h = Math.max(1, block.height);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="height: ${h}px; font-size: 1px; line-height: ${h}px;">&nbsp;</td></tr>
    </table>`;
}

function renderFooter(block: FooterBlock, doc: EmailDocument): string {
  const text = sanitizeRichText(block.text);
  const unsubLink = block.showUnsubscribeLink
    ? `<p style="margin: 12px 0 0 0; font-size: 12px; color: #9ca3af;">
        <a href="{{unsubscribeUrl}}" style="color: #9ca3af; text-decoration: underline;">${escapeHtml(block.unsubscribeText || "Отписаться от рассылки")}</a>
      </p>`
    : "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding: 24px; font-family: ${escapeHtml(doc.settings.fontFamily)}; font-size: 12px; line-height: 1.5; color: #6b7280; text-align: center;">
        ${text}
        ${unsubLink}
      </td></tr>
    </table>`;
}

function renderColumns(block: ColumnsBlock, doc: EmailDocument): string {
  const colWidth = Math.floor(100 / block.columnCount);
  const columnsHtml = block.columns
    .map((col) => {
      const inner = col.blocks.map((b) => renderBlock(b, doc)).join("\n");
      return `
        <td valign="top" width="${colWidth}%" style="padding: 0 8px;">
          ${inner}
        </td>`;
    })
    .join("\n");

  return `
    <!--[if mso]>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
    <![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        ${columnsHtml}
      </tr>
    </table>
    <!--[if mso]>
      </tr>
    </table>
    <![endif]-->`;
}

/** Главный диспетчер: блок → HTML-фрагмент. */
export function renderBlock(block: EmailBlock, doc: EmailDocument): string {
  switch (block.type) {
    case "heading":
      return renderHeading(block, doc);
    case "text":
      return renderText(block, doc);
    case "button":
      return renderButton(block, doc);
    case "image":
      return renderImage(block, doc);
    case "divider":
      return renderDivider(block, doc);
    case "spacer":
      return renderSpacer(block, doc);
    case "footer":
      return renderFooter(block, doc);
    case "columns":
      return renderColumns(block, doc);
    default: {
      const exhaustive: never = block;
      throw new Error(`Unknown block type: ${(exhaustive as EmailBlock).type}`);
    }
  }
}
