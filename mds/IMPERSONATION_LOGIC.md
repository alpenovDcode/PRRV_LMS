# Логика Impersonation (Вход от имени пользователя)

## Проблема

Когда администратор входит под другим пользователем (impersonation), система создает токены для целевого пользователя. При попытке вернуться в админ-панель администратор все еще имеет токены целевого пользователя, что блокирует доступ к `/admin`.

## Решение

Реализован механизм сохранения и восстановления оригинального аккаунта администратора.

### 1. Сохранение оригинального токена

При impersonation (`POST /api/admin/users/[id]/impersonate`):
- Оригинальный токен администратора сохраняется в специальной cookie `originalAdminToken`
- Устанавливаются токены целевого пользователя в `accessToken` и `refreshToken`
- Cookie `originalAdminToken` имеет срок жизни 24 часа

### 2. Восстановление аккаунта

**API Endpoint:** `POST /api/auth/impersonate/restore`

**Процесс:**
1. Проверка наличия `originalAdminToken`
2. Валидация токена администратора
3. Проверка сессии администратора в БД
4. Генерация новых токенов для администратора
5. Установка токенов администратора в cookies
6. Удаление `originalAdminToken`
7. Audit log: `RESTORE_FROM_IMPERSONATION`

### 3. Автоматическое восстановление

**При прямом переходе на `/admin`:**
- Middleware проверяет роль текущего пользователя
- Если роль не `admin`, но есть `originalAdminToken` → редирект на `/admin/restore`
- Страница `/admin/restore` автоматически вызывает API восстановления
- После восстановления → редирект на `/admin`

**При клике на "Вернуться в админ-панель":**
- Кнопка в `StudentLayout` проверяет наличие `originalAdminToken` через API
- При клике вызывает `POST /api/auth/impersonate/restore`
- После успешного восстановления → редирект на `/admin`

### 4. UI изменения

**В `StudentLayout`:**
- Если активна сессия impersonation (`hasImpersonation === true`):
  - Показывается кнопка "Вернуться в админ-панель" (вместо обычной ссылки)
  - Кнопка вызывает API восстановления перед редиректом
- Если нет impersonation, но пользователь - админ:
  - Показывается обычная ссылка "Админ-панель"

## Безопасность

1. **HttpOnly cookies** - `originalAdminToken` недоступен из JavaScript
2. **Валидация сессии** - проверка `sessionId` в БД перед восстановлением
3. **Audit logging** - все действия impersonation логируются
4. **Срок жизни** - `originalAdminToken` действителен 24 часа
5. **Автоматическая очистка** - токен удаляется после восстановления

## Поток работы

```
1. Админ входит под пользователем
   → Сохраняется originalAdminToken
   → Устанавливаются токены пользователя

2. Админ нажимает "Вернуться в админ-панель"
   → POST /api/auth/impersonate/restore
   → Восстанавливаются токены администратора
   → Удаляется originalAdminToken
   → Редирект на /admin

3. Админ напрямую переходит на /admin
   → Middleware видит, что роль не admin
   → Middleware видит originalAdminToken
   → Редирект на /admin/restore
   → Автоматическое восстановление
   → Редирект на /admin
```

## Файлы

- `app/api/admin/users/[id]/impersonate/route.ts` - сохранение originalAdminToken
- `app/api/auth/impersonate/restore/route.ts` - восстановление аккаунта
- `app/api/auth/impersonate/check/route.ts` - проверка активной сессии impersonation
- `app/admin/restore/page.tsx` - страница автоматического восстановления
- `middleware.ts` - обработка прямого перехода на /admin
- `components/layouts/student-layout.tsx` - кнопка возврата в админ-панель

