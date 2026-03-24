export const errorTranslations: Record<string, string> = {
  "Script error.": "Ошибка в скрипте.",
  "Failed to load resource: VIDEO": "Не удалось загрузить ресурс: ВИДЕО",
  "Failed to load resource: SCRIPT": "Не удалось загрузить ресурс: СКРИПТ",
  "Failed to load resource: IMG": "Не удалось загрузить ресурс: ИЗОБРАЖЕНИЕ",
  "Failed to load resource: LINK": "Не удалось загрузить ресурс: СТИЛИ",
  "The fetching process for the media resource was aborted by the user agent at the user's request.": "Загрузка медиа-ресурса была прервана пользователем.",
  "The operation was aborted.": "Операция была прервана.",
  "Request failed with status code 500": "Сбой запроса с кодом 500 (Ошибка сервера)",
  "Request failed with status code 403": "Сбой запроса с кодом 403 (Доступ запрещен)",
  "Request failed with status code 404": "Сбой запроса с кодом 404 (Ресурс не найден)",
  "Request failed with status code 400": "Сбой запроса с кодом 400 (Неверный запрос)",
  "Network Error": "Ошибка сети",
};

export function translateErrorMessage(message: string): string {
  if (!message) return message;
  
  // Прямое совпадение
  if (errorTranslations[message]) {
    return errorTranslations[message];
  }

  // Поиск по ключевым словам для более сложных сообщений
  if (message.includes("Failed to load resource: net::ERR_NAME_NOT_RESOLVED")) {
    return "Не удалось загрузить ресурс: DNS сервер не найден (ERR_NAME_NOT_RESOLVED)";
  }
  if (message.includes("Failed to load resource: net::ERR_CONNECTION_REFUSED")) {
    return "Не удалось загрузить ресурс: Соединение отклонено (ERR_CONNECTION_REFUSED)";
  }

  return message;
}
