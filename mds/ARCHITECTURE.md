# Архитектура проекта Proryv.ru LMS

## 📁 Структура проекта

```
Proryv_ru_LMS/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   └── auth/                 # Auth endpoints
│   │       ├── login/
│   │       ├── register/
│   │       ├── logout/
│   │       ├── refresh/
│   │       └── me/
│   ├── (auth)/                   # Auth pages (group)
│   ├── admin/                    # Admin pages
│   ├── dashboard/                # Dashboard
│   ├── courses/                  # Course pages
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
│
├── components/                   # React компоненты
│   ├── ui/                       # Shadcn/UI компоненты
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── label.tsx
│   ├── providers.tsx             # App providers
│   └── ...
│
├── lib/                          # Утилиты и хелперы
│   ├── db.ts                     # Prisma client
│   ├── auth.ts                   # Auth утилиты (JWT, bcrypt)
│   ├── api-client.ts             # Axios client с interceptors
│   ├── api-middleware.ts         # Auth middleware для API routes
│   ├── cloudflare-stream.ts      # Cloudflare Stream client
│   ├── redis.ts                  # Redis client
│   ├── utils.ts                  # Общие утилиты
│   ├── errors.ts                 # Error classes
│   └── validations.ts            # Zod схемы
│
├── hooks/                        # React hooks
│   └── use-auth.ts               # Auth hook
│
├── store/                        # Zustand stores
│   └── use-theme-store.ts       # Theme store
│
├── types/                        # TypeScript типы
│   └── index.ts                  # Общие типы
│
├── prisma/                       # Prisma
│   ├── schema.prisma             # Database schema
│   └── seed.ts                   # Database seed
│
├── nginx/                        # Nginx конфигурация
│   ├── nginx.conf
│   └── conf.d/
│       └── default.conf
│
├── middleware.ts                 # Next.js middleware
├── docker-compose.yml            # Docker Compose
├── Dockerfile                    # Docker image
├── next.config.js                # Next.js config
├── tailwind.config.ts            # Tailwind config
├── tsconfig.json                 # TypeScript config
└── package.json                  # Dependencies
```

## 🔐 Система авторизации

### JWT токены
- **Access Token**: Короткоживущий (30 минут), хранится в localStorage
- **Refresh Token**: Долгоживущий (7 дней), хранится в httpOnly cookie

### Сессии
- Каждый пользователь имеет `sessionId` в БД
- При логине генерируется новый `sessionId`
- Middleware проверяет соответствие `sessionId` в токене и БД
- При смене пароля или "Выйти везде" все сессии инвалидируются

### API Middleware
Используется `withAuth` для защиты API routes:
```typescript
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    // req.user содержит данные пользователя
    // ...
  }, {
    roles: ['admin'] // опционально
  });
}
```

## 🗄 База данных

### Prisma ORM
- Схема в `prisma/schema.prisma`
- Миграции через `prisma migrate`
- Client в `lib/db.ts` (singleton pattern)

### Основные таблицы
- `users` - Пользователи
- `courses` - Курсы
- `modules` - Модули курсов
- `lessons` - Уроки
- `enrollments` - Доступы к курсам
- `lesson_progress` - Прогресс по урокам
- `homework_submissions` - Домашние задания
- `notifications` - Уведомления

## 🎥 Cloudflare Stream

### Интеграция
- Client в `lib/cloudflare-stream.ts`
- Загрузка видео через Cloudflare Stream API
- Генерация signed URLs для просмотра
- Поддержка watermark через API

### Процесс загрузки
1. Backend создает видео в Cloudflare Stream → получает upload URL
2. Frontend загружает файл напрямую в Cloudflare Stream
3. Cloudflare обрабатывает видео (конвертация, превью)
4. Webhook уведомляет backend о готовности
5. Backend сохраняет `video_id` в БД

## 🎨 UI Компоненты

### Shadcn/UI
- Используется как базовая библиотека компонентов
- Компоненты в `components/ui/`
- Кастомизация через Tailwind CSS

### Темная тема
- `next-themes` для переключения темы
- Zustand store для состояния темы
- CSS переменные для цветов

## 🚀 Развертывание

### Development
```bash
npm install
npm run docker:up      # Запуск PostgreSQL и Redis
npm run db:migrate     # Применение миграций
npm run db:seed        # Заполнение тестовыми данными
npm run dev            # Запуск dev сервера
```

### Production
- Docker Compose для инфраструктуры
- Next.js standalone build
- Nginx как reverse proxy
- PostgreSQL и Redis в контейнерах

## 📦 Зависимости

### Основные
- **Next.js 14+** - Framework
- **TypeScript** - Типизация
- **Prisma** - ORM
- **Tailwind CSS** - Стилизация
- **React Query** - Серверное состояние
- **Zustand** - Клиентское состояние
- **Zod** - Валидация
- **Axios** - HTTP client

### UI
- **Shadcn/UI** - Компоненты
- **Radix UI** - Примитивы
- **Sonner** - Toast notifications

## 🔒 Безопасность

1. **JWT токены** с коротким временем жизни
2. **Bcrypt** для хеширования паролей
3. **Row Level Security** на уровне приложения
4. **Zod валидация** всех входных данных
5. **Middleware** для проверки авторизации
6. **Rate limiting** (планируется)

## 📝 Следующие шаги

1. Реализация страниц авторизации
2. Dashboard для студентов
3. Админ-панель для управления курсами
4. Видеоплеер с Cloudflare Stream
5. Система домашних заданий
6. Уведомления
7. Дрип-контент
8. Защита контента (watermark)

