# Бизнес-логика LMS системы

## Содержание
1. [Система авторизации и ролей](#1-система-авторизации-и-ролей)
2. [Управление курсами и контентом](#2-управление-курсами-и-контентом)
3. [Система Enrollment (зачислений)](#3-система-enrollment-зачислений)
4. [Drip Content (постепенное открытие контента)](#4-drip-content-постепенное-открытие-контента)
5. [Стоп-уроки (Prerequisites)](#5-стоп-уроки-prerequisites)
6. [Система домашних заданий](#6-система-домашних-заданий)
7. [Прогресс обучения](#7-прогресс-обучения)
8. [Группы пользователей](#8-группы-пользователей)
9. [Уведомления](#9-уведомления)
10. [Аудит и безопасность](#10-аудит-и-безопасность)

---

## 1. Система авторизации и ролей

### 1.1. Роли пользователей

Система поддерживает три роли:

- **`student`** (студент) — основной пользователь системы
  - Доступ к курсам, на которые зачислен
  - Просмотр уроков
  - Отправка домашних заданий
  - Просмотр своего прогресса

- **`curator`** (куратор) — проверяет домашние задания
  - Доступ к ленте входящих домашних заданий
  - Просмотр и проверка заданий студентов
  - Возможность одобрить или отклонить задание
  - Добавление комментариев к проверенным заданиям

- **`admin`** (администратор) — полный доступ
  - Управление пользователями (создание, редактирование, удаление)
  - Управление курсами, модулями и уроками
  - Зачисление пользователей на курсы
  - Управление группами
  - Просмотр аналитики
  - Режим "Login as User" (вход от имени другого пользователя)

### 1.2. Аутентификация

**Механизм:**
- JWT токены (Access Token + Refresh Token)
- Токены хранятся в **httpOnly cookies** (безопасность от XSS)
- Access Token: срок жизни 30 минут
- Refresh Token: срок жизни 7 дней
- Session ID: хранится в БД для валидации сессий

**Процесс входа:**
1. Пользователь отправляет email и пароль
2. Сервер проверяет учетные данные (с защитой от timing attacks)
3. Генерируется новый `sessionId` и сохраняется в БД
4. Создаются Access и Refresh токены
5. Токены устанавливаются в httpOnly cookies
6. Возвращается информация о пользователе (без токенов)

**Процесс обновления токена:**
1. При истечении Access Token клиент автоматически запрашивает новый
2. Refresh Token отправляется из httpOnly cookie
3. Сервер проверяет Refresh Token и валидность сессии
4. Генерируется новый Access Token
5. Устанавливается в httpOnly cookie

**Выход:**
- Инвалидация всех сессий пользователя (обновление `sessionId` в БД)
- Удаление всех auth cookies

### 1.3. Авторизация

**Middleware (`middleware.ts`):**
- Проверяет наличие Access Token в cookies
- Валидирует токен через `verifyAccessTokenEdge()`
- Проверяет соответствие `sessionId` в токене и БД
- Контролирует доступ к роутам по ролям:
  - `/admin` — только для `admin`
  - `/dashboard` — для `admin` и `student`
  - `/curator` — для `curator` и `admin`

**API Middleware (`lib/api-middleware.ts`):**
- Функция `withAuth()` для защиты API routes
- Поддерживает проверку ролей через параметр `options.roles`
- Возвращает `AuthenticatedRequest` с информацией о пользователе

---

## 2. Управление курсами и контентом

### 2.1. Структура контента

**Иерархия:**
```
Course (Курс)
  └── Module (Модуль)
      └── Lesson (Урок)
```

**Course (Курс):**
- `title` — название
- `slug` — уникальный URL-идентификатор
- `description` — описание
- `coverImage` — обложка
- `isPublished` — опубликован ли курс (только опубликованные доступны для enrollment)
- `authorId` — автор курса (admin)

**Module (Модуль):**
- `title` — название модуля
- `orderIndex` — порядок отображения (0, 1, 2...)
- `courseId` — принадлежность к курсу

**Lesson (Урок):**
- `title` — название урока
- `type` — тип: `video`, `text`, `quiz`
- `content` — JSON контент (Markdown для текста, вопросы для quiz)
- `videoId` — ID видео в Cloudflare Stream (для type="video")
- `videoDuration` — длительность видео в секундах
- `thumbnailUrl` — превью видео
- `isFree` — бесплатный урок (доступен без enrollment)
- `isStopLesson` — стоп-урок (блокирует доступ к следующим урокам)
- `dripRule` — правило drip content (JSON)
- `orderIndex` — порядок в модуле

### 2.2. Создание и редактирование контента

**Создание курса (Admin):**
1. Валидация данных через Zod (`courseSchema`)
2. Генерация уникального `slug` из названия
3. Создание записи в БД
4. Audit log: `CREATE_COURSE`

**Создание модуля (Admin):**
1. Валидация `courseId` (курс должен существовать)
2. **Транзакция:**
   - Поиск последнего модуля в курсе (`orderIndex DESC`)
   - Установка `orderIndex = lastIndex + 1`
   - Создание модуля
3. Audit log: `CREATE_MODULE`

**Создание урока (Admin):**
1. Валидация `moduleId` (модуль должен существовать)
2. **Транзакция:**
   - Поиск последнего урока в модуле (`orderIndex DESC`)
   - Установка `orderIndex = lastIndex + 1`
   - Создание урока
3. Audit log: `CREATE_LESSON`

**Изменение порядка (Reorder):**
- Для модулей: `POST /api/admin/modules/reorder` с массивом `moduleIds`
- Для уроков: `POST /api/admin/lessons/reorder` с массивом `lessonIds`
- **Транзакция** для атомарного обновления всех `orderIndex`
- Audit log: `REORDER_MODULES` / `REORDER_LESSONS`

---

## 3. Система Enrollment (зачислений)

### 3.1. Модель Enrollment

**Поля:**
- `userId` — пользователь
- `courseId` — курс
- `status` — статус: `active`, `expired`, `frozen`
- `startDate` — дата начала (anchor date для drip content)
- `expiresAt` — дата окончания (null = бессрочный доступ)
- **UNIQUE(userId, courseId)** — один пользователь может иметь только одну запись на курс

### 3.2. Бизнес-правила

**Функция `canUserAccessCourse()` (`lib/business-rules.ts`):**
1. Проверка наличия enrollment
2. Проверка статуса (`active`)
3. Проверка срока действия (`expiresAt`)

**Функция `validateEnrollmentCreation()`:**
1. Проверка существования пользователя
2. Проверка существования курса
3. Проверка публикации курса (`isPublished = true`)
4. Валидация дат:
   - `startDate < expiresAt` (если `expiresAt` указан)
   - `expiresAt` не может быть в прошлом

### 3.3. Создание Enrollment

**Через Admin API:**
- `POST /api/admin/users/[id]/enrollments`
- Параметры: `courseId`, `startDate`, `expiresAt`
- **Upsert логика:** если enrollment существует — обновляется, иначе создается
- Audit log: `CREATE_ENROLLMENT` / `UPDATE_ENROLLMENT`

**Массовое зачисление через группы:**
- `POST /api/admin/groups/[id]/enrollments`
- Зачисление всех участников группы на курс
- Использует те же бизнес-правила валидации

**Удаление Enrollment:**
- `DELETE /api/admin/users/[id]/enrollments?courseId=...`
- Audit log: `DELETE_ENROLLMENT`

---

## 4. Drip Content (постепенное открытие контента)

### 4.1. Правила Drip Content

**Типы правил (`DripRule`):**

1. **`after_start`** — через N дней после начала enrollment
   ```json
   {
     "type": "after_start",
     "days": 3
   }
   ```
   - Урок станет доступен через 3 дня после `enrollment.startDate`

2. **`on_date`** — в конкретную дату
   ```json
   {
     "type": "on_date",
     "date": "2024-12-25"
   }
   ```
   - Урок станет доступен 25 декабря 2024

### 4.2. Логика проверки доступности

**Функция `calculateDripAvailability()` (`lib/lms-logic.ts`):**
```typescript
calculateDripAvailability(dripRule, enrollmentStartDate)
  → { isAvailable: boolean, availableDate?: Date }
```

**Алгоритм:**
1. Если `dripRule === null` → урок доступен сразу
2. Если `type === "after_start"`:
   - `availableDate = startOfDay(enrollmentStartDate) + days`
   - Сравниваем с текущей датой
3. Если `type === "on_date"`:
   - `availableDate = startOfDay(dripRule.date)`
   - Сравниваем с текущей датой

**Интеграция в `checkLessonAvailability()`:**
1. Проверка enrollment (статус, срок действия)
2. Проверка drip rule
3. Если `isAvailable === false` → возвращается `reason: "drip_locked"` и `availableDate`

---

## 5. Стоп-уроки (Prerequisites)

### 5.1. Концепция

**Стоп-урок (`isStopLesson = true`):**
- Блокирует доступ к следующим урокам в модуле
- Следующий урок становится доступен только после **одобрения** домашнего задания по стоп-уроку

### 5.2. Логика проверки

**Функция `checkPrerequisites()` (`lib/lms-logic.ts`):**
```typescript
checkPrerequisites(userId, lessonId)
  → { isUnlocked: boolean, requiredLessonId?: string }
```

**Алгоритм:**
1. Находим предыдущий урок в том же модуле (`orderIndex < currentIndex`)
2. Если предыдущий урок — стоп-урок (`isStopLesson = true`):
   - Проверяем наличие одобренного ДЗ: `homeworkSubmission.status === "approved"`
   - Если ДЗ не одобрено → `isUnlocked = false`, возвращаем `requiredLessonId`
3. Если предыдущий урок не стоп-урок или ДЗ одобрено → `isUnlocked = true`

**Интеграция в `checkLessonAvailability()`:**
- После проверки drip content
- Если `isUnlocked === false` → возвращается `reason: "prerequisites_not_met"` и `requiredLessonId`

### 5.3. Ограничения

- Проверка работает только **внутри одного модуля**
- Не поддерживаются кросс-модульные prerequisites
- Проверяется только **предыдущий** урок (не все предыдущие)

---

## 6. Система домашних заданий

### 6.1. Модель HomeworkSubmission

**Поля:**
- `userId` — студент
- `lessonId` — урок
- `content` — текстовый ответ (санитизирован через DOMPurify)
- `files` — JSON массив файлов
- `status` — статус: `pending`, `approved`, `rejected`
- `curatorComment` — комментарий куратора (санитизирован)
- `curatorId` — куратор, проверивший задание
- `reviewedAt` — дата проверки

### 6.2. Отправка домашнего задания

**Endpoint:** `POST /api/lessons/[id]/homework`

**Бизнес-правила (`canUserSubmitHomework()`):**
1. Проверка наличия активной отправки:
   - Если есть `status: "pending"` или `"approved"` → нельзя отправить повторно
   - Возвращается `reason: "already_submitted"` или `"already_approved"`

**Процесс отправки:**
1. Валидация данных через Zod (`homeworkSubmitSchema`)
2. **Транзакция с уровнем изоляции `Serializable`:**
   - Проверка enrollment и доступности урока
   - Повторная проверка существующей отправки (защита от race conditions)
   - Санитизация контента через `sanitizeText()`
   - Создание записи `HomeworkSubmission` со статусом `pending`
3. Возврат созданной отправки

**Защита от race conditions:**
- Транзакция с `isolationLevel: "Serializable"`
- Проверка существующей отправки **внутри транзакции**
- Гарантирует атомарность операции

### 6.3. Проверка домашнего задания

**Endpoint:** `PATCH /api/curator/homework/[id]`

**Бизнес-правила (`canCuratorReviewHomework()`):**
1. Проверка существования отправки
2. Проверка статуса (`status === "pending"`)
3. Пока разрешено всем кураторам проверять любые задания (можно добавить проверку назначения на курс)

**Процесс проверки:**
1. Валидация данных (`curatorHomeworkReviewSchema`)
2. Санитизация комментария куратора
3. **Транзакция:**
   - Повторная проверка статуса внутри транзакции
   - Обновление: `status`, `curatorComment`, `curatorId`, `reviewedAt`
4. Создание уведомления для студента
5. Audit log: `REVIEW_HOMEWORK`

**Статусы:**
- `approved` — задание одобрено (разблокирует следующий урок, если текущий — стоп-урок)
- `rejected` — задание отклонено (студент может отправить заново)

### 6.4. Лента входящих заданий (Curator)

**Endpoint:** `GET /api/curator/homework`

**Фильтры:**
- `status` — фильтр по статусу (`pending`, `approved`, `rejected`)
- `courseId` — фильтр по курсу

**Сортировка:**
- По дате создания (`createdAt DESC`)
- Лимит: 100 записей

---

## 7. Прогресс обучения

### 7.1. Модель LessonProgress

**Поля:**
- `userId` + `lessonId` — составной первичный ключ
- `status` — статус: `not_started`, `in_progress`, `completed`
- `watchedTime` — время просмотра в секундах (для resume playback)
- `completedAt` — дата завершения урока
- `lastUpdated` — последнее обновление

### 7.2. Обновление прогресса

**Автоматическое обновление:**
- При просмотре видео: обновление `watchedTime` и `status`
- При завершении урока: `status = "completed"`, `completedAt = now()`

**Логика завершения:**
- Для видео: при достижении 90% просмотра
- Для текста: при прокрутке до конца
- Для quiz: при завершении теста

### 7.3. Расчет прогресса по курсу

**Функция `calculateCourseProgress()` (`lib/business-rules.ts`):**
```typescript
calculateCourseProgress(userId, courseId)
  → {
      progress: number, // 0-100
      completedLessons: number,
      totalLessons: number,
      lessons: Array<{ lessonId, status, watchedTime }>
    }
```

**Алгоритм:**
1. Получение всех уроков курса (через модули)
2. Получение всех записей `LessonProgress` для пользователя
3. Подсчет завершенных уроков (`status === "completed"`)
4. Расчет процента: `(completedLessons / totalLessons) * 100`

---

## 8. Группы пользователей

### 8.1. Модель Group

**Поля:**
- `name` — название группы
- `description` — описание

**Связи:**
- `GroupMember` — участники группы (many-to-many с User)

### 8.2. Управление группами

**Создание группы (Admin):**
- `POST /api/admin/groups`
- Audit log: `CREATE_GROUP`

**Добавление участников:**
- `POST /api/admin/groups/[id]/members`
- Параметры: `userId` (массив)
- **Upsert логика:** если участник уже в группе — обновляется, иначе создается

**Удаление участников:**
- `DELETE /api/admin/groups/[id]/members?userId=...`

### 8.3. Массовое зачисление через группы

**Endpoint:** `POST /api/admin/groups/[id]/enrollments`

**Процесс:**
1. Получение всех участников группы
2. Для каждого участника:
   - Валидация через `validateEnrollmentCreation()`
   - Создание/обновление enrollment
3. Audit log для каждого enrollment

---

## 9. Уведомления

### 9.1. Модель Notification

**Поля:**
- `userId` — получатель
- `type` — тип уведомления (например, `homework_reviewed`, `enrollment_created`)
- `title` — заголовок
- `message` — сообщение
- `link` — ссылка (опционально)
- `isRead` — прочитано ли

### 9.2. Создание уведомлений

**Автоматически создаются при:**
- Проверке домашнего задания (куратором)
- Зачислении на курс (администратором)
- Изменении статуса enrollment

**Endpoint:** `POST /api/notifications` (создание уведомления)

**Получение уведомлений:**
- `GET /api/notifications` — все уведомления пользователя
- `GET /api/notifications?unread=true` — только непрочитанные

**Отметка как прочитанное:**
- `PATCH /api/notifications/[id]` — обновление `isRead = true`

---

## 10. Аудит и безопасность

### 10.1. Audit Logging

**Модель AuditLog:**
- `userId` — пользователь, выполнивший действие
- `action` — тип действия (например, `CREATE_COURSE`, `UPDATE_LESSON`)
- `entity` — тип сущности (`course`, `user`, `lesson`)
- `entityId` — ID сущности
- `details` — JSON с дополнительной информацией
- `createdAt` — время действия

**Логируемые действия:**
- Создание/обновление/удаление курсов, модулей, уроков
- Создание/обновление/удаление enrollments
- Создание групп
- Impersonation (вход от имени другого пользователя)
- Проверка домашних заданий

**Функция `logAction()` (`lib/audit.ts`):**
```typescript
logAction(userId, action, entity, entityId?, details?)
```

### 10.2. Логирование подозрительной активности

**Модуль `lib/security-logging.ts`:**

**Функции:**
- `logSuspiciousActivity()` — логирование подозрительных действий
- `detectSuspiciousPatterns()` — обнаружение паттернов атак:
  - SQL injection попытки
  - XSS попытки
  - Подозрительные User-Agent
  - Path traversal попытки
- `getClientIp()` — получение IP адреса клиента
- `getUserAgent()` — получение User-Agent

**Логируется:**
- Неудачные попытки входа
- Подозрительные паттерны при регистрации
- Попытки восстановления/сброса пароля
- Невалидные токены восстановления
- Подозрительные имена файлов при загрузке
- Действия impersonation

### 10.3. Защита от атак

**CSRF защита:**
- Валидация `Origin` header через `validateOrigin()`
- `SameSite: "strict"` для cookies

**XSS защита:**
- Санитизация пользовательского контента через DOMPurify
- Применяется к: `homework.content`, `curatorComment`

**SQL Injection защита:**
- Использование Prisma ORM (параметризованные запросы)
- Валидация входных данных через Zod

**Timing Attacks защита:**
- При логине всегда выполняется хеширование пароля (даже если пользователь не найден)

**File Upload защита:**
- Whitelist разрешенных MIME типов
- Проверка расширения файла
- Проверка размера файла (максимум 10MB)
- Проверка соответствия MIME типа и расширения

**Rate Limiting:**
- Redis-based rate limiting для критичных endpoints (login, register, password recovery)

---

## Итоговая схема бизнес-логики

```
┌─────────────────────────────────────────────────────────────┐
│                    АВТОРИЗАЦИЯ И РОЛИ                        │
│  - JWT токены в httpOnly cookies                             │
│  - Session validation через sessionId                        │
│  - Role-based access control (student/curator/admin)         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              УПРАВЛЕНИЕ КОНТЕНТОМ (Admin)                   │
│  Course → Module → Lesson                                   │
│  - Создание/редактирование с транзакциями                   │
│  - Reorder с атомарными операциями                          │
│  - Audit logging всех действий                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ENROLLMENT (Зачисление)                       │
│  - Проверка: курс опубликован, даты валидны                │
│  - Статусы: active/expired/frozen                           │
│  - startDate как anchor для drip content                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         ПРОВЕРКА ДОСТУПНОСТИ УРОКА                          │
│  1. Enrollment check (статус, срок)                          │
│  2. Drip Content check (after_start / on_date)              │
│  3. Prerequisites check (стоп-уроки)                         │
│  → Результат: доступен / заблокирован + причина            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ДОМАШНИЕ ЗАДАНИЯ                               │
│  Student: отправка (с защитой от race conditions)          │
│  Curator: проверка (approve/reject)                         │
│  → Одобрение разблокирует следующий урок (если стоп-урок)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ПРОГРЕСС ОБУЧЕНИЯ                             │
│  - LessonProgress: status, watchedTime, completedAt         │
│  - Автоматический расчет прогресса по курсу                │
└─────────────────────────────────────────────────────────────┘
```

---

## Ключевые принципы реализации

1. **Централизация логики** — вся бизнес-логика в `lib/lms-logic.ts` и `lib/business-rules.ts`
2. **Транзакции** — атомарные операции для критичных действий (создание модулей/уроков, отправка ДЗ)
3. **Защита от race conditions** — уровень изоляции `Serializable` для конкурентных операций
4. **Валидация** — Zod схемы для всех входных данных
5. **Санитизация** — DOMPurify для пользовательского контента
6. **Audit logging** — логирование всех критичных действий
7. **Безопасность** — CSRF, XSS, SQL injection защита, rate limiting

