import { redirect } from "next/navigation";

/**
 * Старый список «Каналы общения» (Instagram + MAX). Сейчас MAX живёт
 * в едином списке /admin/bots рядом с Telegram, а Instagram-UI скрыт.
 *
 * Эта страница оставлена как редирект, чтобы старые ссылки/закладки
 * («Каналы» в боковом меню до обновления, прямые URL в чате с командой,
 * ссылки из старых писем) не вели в 404. Подстраницы вида
 *   /admin/messaging/[botId]/{flows,inbox,broadcasts,...}
 * продолжают работать как раньше — карточка MAX-бота на /admin/bots
 * ведёт прямо на /admin/messaging/[botId]/flows.
 */
export default function MessagingIndexRedirect() {
  redirect("/admin/bots");
}
