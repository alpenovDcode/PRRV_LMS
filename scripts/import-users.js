/**
 * Скрипт импорта пользователей с открытием доступа к курсу и рассылкой писем
 *
 * Использование:
 *   node scripts/import-users.js
 *
 * Перед запуском:
 *   1. Укажите COURSE_ID и список EMAILS ниже
 *   2. Убедитесь, что в .env заданы SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
 *
 * Результат (email + пароль + статус) сохраняется в scripts/import-users-result.csv
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────────

// ID курса, к которому нужно открыть доступ.
// Найти можно в адресной строке браузера при редактировании курса в админке.
const COURSE_ID = 'ВСТАВЬТЕ_ID_КУРСА_СЮДА';

// Список email-адресов для импорта
const EMAILS = [
  'user1@example.com',
  'user2@example.com',
  'user3@example.com',
];

// Тариф пользователей (VR | LR | SR | null)
const TARIFF = null;

// Трек пользователей (или null)
const TRACK = null;

// ──────────────────────────────────────────────────────────────────────────────

const LOGIN_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'https://prrv.tech'}/login`;

// SMTP транспорт (берёт настройки из .env)
const smtpPort = parseInt(process.env.SMTP_PORT || '465');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.yandex.ru',
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

function buildEmailHtml({ fullName, email, password, loginUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Добро пожаловать!</title>
<style>
    body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        background-color: #f4f5f7;
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
    }
    .container {
        max-width: 600px;
        margin: 40px auto;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        overflow: hidden;
    }
    .header {
        background-color: #4562F3;
        padding: 30px 20px;
        text-align: center;
        color: #ffffff;
    }
    .header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        line-height: normal;
    }
    .content {
        padding: 30px;
        color: #333333;
        line-height: 1.6;
    }
    .content h2 {
        font-size: 20px;
        color: #1a1a1a;
        margin-top: 0;
    }
    .credentials {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 20px;
        margin: 20px 0;
    }
    .credentials p {
        margin: 8px 0;
        font-size: 16px;
    }
    .credentials strong {
        color: #1a1a1a;
    }
    .button-container {
        text-align: center;
        margin: 30px 0;
    }
    .button {
        display: inline-block;
        background-color: #4562F3;
        color: #ffffff !important;
        text-decoration: none;
        padding: 14px 28px;
        border-radius: 6px;
        font-weight: bold;
        font-size: 16px;
    }
    .footer {
        background-color: #f8fafc;
        padding: 20px;
        text-align: center;
        color: #64748b;
        font-size: 14px;
        border-top: 1px solid #e2e8f0;
    }
</style>
</head>
<body>

<div class="container">
    <div class="header">
        <h1>Доступ к платформе</h1>
    </div>

    <div class="content">
        <h2>Здравствуйте, ${fullName}!</h2>

        <p>Администратор создал для вас аккаунт на образовательной платформе. Теперь у вас есть доступ к личному кабинету и учебным материалам.</p>

        <p>Ваши данные для входа в систему:</p>

        <div class="credentials">
            <p><strong>Email (Логин):</strong> ${email}</p>
            <p><strong>Пароль:</strong> ${password}</p>
        </div>

        <div class="button-container">
            <a href="${loginUrl}" class="button">Войти на платформу</a>
        </div>

        <p>В целях безопасности мы рекомендуем сменить пароль сразу после первого входа в настройках вашего профиля.</p>

        <p>Если у вас возникнут вопросы или проблемы со входом, пожалуйста, свяжитесь с куратором.</p>
    </div>

    <div class="footer">
        <p>С уважением,<br>Команда LMS Прорыв</p>
    </div>
</div>

</body>
</html>`;
}

async function sendWelcomeEmail({ email, fullName, password }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('   ⚠️  SMTP не настроен — письмо не отправлено');
    return false;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Прорыв LMS" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Ваш доступ к образовательной платформе Прорыв',
    html: buildEmailHtml({ fullName, email, password, loginUrl: LOGIN_URL }),
  });

  return true;
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(length))
    .map(b => chars[b % chars.length])
    .join('');
}

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

async function main() {
  console.log('=== Импорт пользователей ===\n');

  if (COURSE_ID === 'ВСТАВЬТЕ_ID_КУРСА_СЮДА') {
    console.error('❌ Укажите COURSE_ID в скрипте перед запуском');
    process.exit(1);
  }

  // Проверяем курс
  const course = await prisma.course.findUnique({
    where: { id: COURSE_ID },
    select: { id: true, title: true },
  });

  if (!course) {
    console.error(`❌ Курс с ID "${COURSE_ID}" не найден`);
    process.exit(1);
  }

  const smtpReady = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

  console.log(`Курс: ${course.title}`);
  console.log(`Пользователей к обработке: ${EMAILS.length}`);
  console.log(`Рассылка писем: ${smtpReady ? 'включена' : 'SMTP не настроен — письма отправляться не будут'}\n`);

  const results = [];

  for (const rawEmail of EMAILS) {
    const email = rawEmail.trim().toLowerCase();
    if (!email) continue;

    try {
      const existing = await prisma.user.findUnique({ where: { email } });

      let userId;
      let password = null;
      let status;
      let emailSent = false;

      if (existing) {
        userId = existing.id;
        status = 'существовал';
        console.log(`⚠️  ${email} — уже существует, пропускаем создание и письмо`);
      } else {
        // Создаём пользователя
        password = generatePassword();
        const passwordHash = await bcrypt.hash(password, 12);
        const sessionId = generateSessionId();

        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            sessionId,
            role: 'student',
            tariff: TARIFF,
            track: TRACK,
          },
        });

        userId = user.id;
        status = 'создан';
        console.log(`✅ ${email} — создан`);

        // Отправляем письмо только новым пользователям
        try {
          emailSent = await sendWelcomeEmail({
            email,
            fullName: 'Студент', // fullName нет в заказах Геткурса — можно расширить позже
            password,
          });
          if (emailSent) console.log('   └─ письмо отправлено');
        } catch (emailErr) {
          console.error(`   └─ ❌ ошибка отправки письма: ${emailErr.message}`);
          status = 'создан (письмо не отправлено)';
        }
      }

      // Открываем доступ к курсу
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: COURSE_ID } },
        update: { status: 'active' },
        create: {
          userId,
          courseId: COURSE_ID,
          status: 'active',
          startDate: new Date(),
        },
      });

      console.log(`   └─ доступ к курсу "${course.title}" открыт`);

      results.push({
        email,
        password: password || '(уже существовал)',
        status,
        emailSent: existing ? 'нет (уже существовал)' : emailSent ? 'да' : 'ошибка',
      });
    } catch (err) {
      console.error(`❌ Ошибка для ${email}:`, err.message);
      results.push({ email, password: 'ОШИБКА', status: err.message, emailSent: 'нет' });
    }
  }

  // CSV с результатами
  const csvPath = path.join(__dirname, 'import-users-result.csv');
  const csvLines = [
    'email,password,status,email_sent',
    ...results.map(r =>
      `"${r.email}","${r.password}","${r.status}","${r.emailSent}"`
    ),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

  const created = results.filter(r => r.status.startsWith('создан')).length;
  const existed = results.filter(r => r.status === 'существовал').length;
  const errors  = results.length - created - existed;

  console.log(`\n=== Готово ===`);
  console.log(`Обработано:       ${results.length}`);
  console.log(`Создано:          ${created}`);
  console.log(`Уже существовали: ${existed}`);
  console.log(`Ошибок:           ${errors}`);
  console.log(`\nРезультат сохранён: ${csvPath}`);
}

main()
  .catch(e => {
    console.error('Критическая ошибка:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
