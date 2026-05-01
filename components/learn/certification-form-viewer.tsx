"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CircleCheck, CheckCircle2, XCircle, Trophy } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type QuestionType =
  | "text"
  | "textarea"
  | "number"
  | "scale_1_10"
  | "single_radio"
  | "multi_checkbox";

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  // Только для тестовых вопросов (часть 2):
  correct?: number; // index option-а — для single_radio
  correctAnswer?: string[]; // массив правильных option-строк — для multi_checkbox
}

const SCALE_1_10 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const MENTORS = [
  "Тим @timnz",
  "Артем @artyom_gordeev",
  "Анна @DanilkinaAn",
  "Анна @multilingual_mantra",
  "Анастасия @nastasiaurevnaa",
  "Анастасия @manokhinanastya",
  "Полина @polly_teachh",
  "Полина @pollyarteeva",
  "Элина @eli_klova",
  "Кристина @Chris_Lond",
  "Гаянэ @gbabadzhanyan",
  "Дарья @chursic_daria",
  "Анастасия @AnastasiaKhustochkina",
  "Anastasia @your_special_place",
  "Мария @mariyatsep",
  "Виктория @alieva_viktoriia",
  "Наталья @taha_snv",
  "Татьяна @miss_tanya_01",
  "Кристина @ry_kris",
  "Фаина @blin_fain",
  "Артём @rustik4real",
  "Анна @a_kryak",
  "Анна @an_kologer",
  "Анастасия @Anastasia_YourEnglishTutor",
  "Дарья @da_chem",
  "Дмитрий @dlit25",
  "Нет наставника",
];

// ===== Часть 1. Анкета сертификации =====
const PART1_QUESTIONS: Question[] = [
  { id: "telegram_nick", text: "Напишите свой ник в Telegram", type: "text", required: true },
  { id: "city", text: "В каком городе вы проживаете?", type: "textarea", required: true },
  { id: "age", text: "Сколько вам лет?", type: "number", required: true },
  { id: "subject", text: "Ваш предмет и специализация", type: "text", required: true },

  // Точка А
  {
    id: "income_point_a",
    text: 'Ваш доход в точке А? С каким уровнем дохода в месяц вы пришли на программу "Прорыв"? Укажите цифрой, без запятых, пробелов и прочего (Пример: 20000)',
    type: "number",
    required: true,
  },
  {
    id: "emotional_state_before",
    text: "Каково было ваше эмоциональное состояние до обучения на Прорыве?",
    type: "textarea",
    required: true,
  },
  { id: "hour_price_before", text: "Какова была средняя стоимость 1 часа вашего занятия?", type: "number", required: true },
  { id: "students_before", text: "Сколько у вас было учеников?", type: "number", required: true },
  { id: "hours_before", text: "Какое кол-во часов в неделю вы работали?", type: "number", required: true },

  // Проблемы и решение
  { id: "problems_to_solve", text: "Какие проблемы вы хотели решить с помощью Прорыва?", type: "textarea", required: true },
  {
    id: "problems_solved_self",
    text: "Как вы решали эту проблему до Прорыва самостоятельно? Если решали, какие были результаты?",
    type: "textarea",
    required: true,
  },
  {
    id: "problems_resolved",
    text: "Какие прорблемы удалось решить с помощью обучения на Прорыве?",
    type: "multi_checkbox",
    options: [
      "Увеличить доход",
      "Повысить чек",
      "Регулярный поток учеников",
      "Научиться набирать группы",
      "Уменьшить нагрузку без потери дохода",
      "Начать чувствовать себя более уверенно",
      "Освоить способы продвижения",
      "Другое",
    ],
    required: true,
  },
  {
    id: "problems_resolved_other",
    text: "Если в прошлом шаге выбрали «Другое», распишите тут ваш вариант или жмите «Далее»",
    type: "textarea",
  },
  {
    id: "what_helped_most",
    text: "Что больше всего помогло вам в решении ваших проблем в процессе обучения?",
    type: "textarea",
    required: true,
  },

  // Точка Б
  {
    id: "income_point_b",
    text: "Точка Б: Ваш доход за последний месяц в рублях? Укажите цифрой, без запятых, пробелов и прочего (Пример: 100000)",
    type: "number",
    required: true,
  },
  {
    id: "emotional_state_after",
    text: "Расскажите о своем эмоциональном состоянии сейчас, после обучения на Прорыве",
    type: "textarea",
    required: true,
  },
  { id: "life_changes", text: "Как изменилась ваша жизнь после прохождения программы?", type: "textarea", required: true },
  { id: "hour_price_after", text: "Какова сейчас средняя стоимость 1 часа вашего занятия?", type: "number", required: true },
  { id: "students_now", text: "Сколько у вас сейчас учеников?", type: "number", required: true },
  { id: "hours_now", text: "Сколько часов в неделю вы сейчас работаете?", type: "number", required: true },

  // Освоенные навыки (привлечение)
  {
    id: "profi_acquired",
    text: "Удалось ли вам освоить привлечение учеников с Профи на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "avito_acquired",
    text: "Удалось ли освоить привлечение учеников с Авито на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "telegram_acquired",
    text: "Удалось ли освоить привлечение учеников из Телеграм на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "main_channels",
    text: "Основные каналы привлечения учеников (можно выбрать несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "Telegram",
      "Avito",
      "Profi",
      "Instagram",
      "Facebook",
      "Вконтакте",
      "Сарафанное радио",
      "Личный сайт",
      "Биржи репетиторов",
      "Другое",
    ],
    required: true,
  },
  {
    id: "main_channels_other",
    text: "Если в прошлом шаге выбрали «Другое», то напишите здесь ваш вариант или жмите «Далее»",
    type: "textarea",
  },

  // Освоенные форматы
  {
    id: "pair_format",
    text: "Удалось ли освоить парный формат на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "group_format",
    text: "Удалось ли освоить групповой формат на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "parallel_format",
    text: "Удалось ли освоить параллельный формат занятий на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "subscription_system",
    text: "Удалось ли внедрить систему абонементов?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "trial_lesson",
    text: "Удалось ли осовить проведение пробного урока на Прорыве?",
    type: "multi_checkbox",
    options: ["Да", "Нет", "Это было освоено до обучения на Прорыве"],
    required: true,
  },
  {
    id: "satisfaction_active_part",
    text: 'Оцените, насколько вы удовлетворены активной частью программы "Прорыв" в целом?',
    type: "scale_1_10",
    required: true,
  },

  // Оценки уроков и материалов
  {
    id: "satisfaction_lessons",
    text: 'Оцените, насколько вы удовлетворены качеством и содержанием уроков программы "Прорыв"?',
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_strategy_session",
    text: 'Оцените, насколько вы удовлетворены личной стратегической сессией в начале обучения на программе "Прорыв"?',
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_homework",
    text: "Оцените, насколько вы удовлетворены содержанием домашних заданий программы Прорыв?",
    type: "scale_1_10",
    required: true,
  },

  // Наставник
  { id: "mentor", text: "Кто является вашим наставником?", type: "single_radio", options: MENTORS, required: true },
  {
    id: "hw_check_speed",
    text: "Скорость проверки ДЗ наставником",
    type: "single_radio",
    options: ["1-2 рабочих дня", "3 рабочих дня", "более 3х рабочих дней"],
    required: true,
  },
  {
    id: "satisfaction_mentor",
    text: 'Оцените, насколько вы удовлетворены работой вашего наставника на программе "Прорыв?"',
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_curator",
    text: 'Оцените, насколько вы удовлетворены работой вашего куратора на программе "Прорыв"?',
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_club_events",
    text: 'Оцените, насколько вы удовлетворены мероприятими клуба "Прорыв" (сессии "вопрос-ответ", мастер-классы?',
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_psychologist",
    text: 'Оцените, насколько вы удовлетворены сессиями с психологом на программе "Прорыв"?',
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_bot",
    text: "Оцените, насколько вы удовлетворены работой бота с заявками от учеников?",
    type: "scale_1_10",
    required: true,
  },
  {
    id: "satisfaction_results",
    text: 'Оцените, насколько вы удовлетворены своими результатами после 3 месяцев активного обучения на программе "Прорыв"?',
    type: "multi_checkbox",
    options: SCALE_1_10,
    required: true,
  },

  // Финальные вопросы
  { id: "mentor_improvements", text: "Что можно было бы улучшить в работе наставника?", type: "textarea", required: true },
  {
    id: "program_improvements",
    text: "Что бы вы посоветовали для Прорыва: что бы вы хотели изменить/улучшить/добавить на курсе?",
    type: "textarea",
    required: true,
  },
  {
    id: "recommend_to_tutor",
    text: "Насколько вероятно, что вы порекомендуете Прорыв репетитору?",
    type: "scale_1_10",
    required: true,
  },
];

// ===== Часть 2. Тестирование (с проверкой правильных ответов) =====
const PART2_QUESTIONS: Question[] = [
  {
    id: "test_otzyvy_optimal",
    text: "Какой вариант сбора отзывов наиболее оптимальный?",
    type: "single_radio",
    options: [
      "Мария, напоминаю вам об оплате за следующий месяц. И еще буду благодарна за отзыв",
      "Мария, оставьте, пожалуйста, отзыв о наших занятиях на Профи, это поможет мне в работе",
      "Мария, для меня очень важна обратная связь и повышение качества моей работы — оставьте, пожалуйста, отзыв",
    ],
    correct: 2,
    required: true,
  },
  {
    id: "test_keysy",
    text: "Зачем нужны кейсы?",
    type: "single_radio",
    options: [
      "Дать чёткое описание пути достижения результата со стороны ученика",
      "Замена отзыву (используем их, если не можем получить отзыв от человека)",
    ],
    correct: 0,
    required: true,
  },
  {
    id: "test_foto_anketa",
    text: "Какие фото подойдут для анкет и объявлений? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "Отражающие наши увлечения, нашу личность",
      "Где взгляд в камеру и хорошо видно лицо",
      "Содержащие яркие элементы",
      "Где у вас сдержанное выражение лица, не улыбаться (демонстрация серьёзности)",
      "Где вы за работой",
    ],
    correctAnswer: [
      "Где взгляд в камеру и хорошо видно лицо",
      "Содержащие яркие элементы",
      "Где вы за работой",
    ],
    required: true,
  },
  {
    id: "test_utp",
    text: "Что из перечисленного является УТП? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      '"Английский для релокации"',
      '"Подготовка к ЕГЭ на 90+ с экспертом"',
      '"Твой комфортный преподаватель"',
      '"Профессионально споёшь свою любимую песню уже на 3 занятии"',
      '"Учу чтению, письму и счёту детей 5–6 лет"',
    ],
    correctAnswer: [
      '"Подготовка к ЕГЭ на 90+ с экспертом"',
      '"Профессионально споёшь свою любимую песню уже на 3 занятии"',
    ],
    required: true,
  },
  {
    id: "test_samoprezentaciya",
    text: "Что должно быть в самопрезентации? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "Результаты учеников",
      "Небольшой рассказ, почему вы любите свой предмет",
      "Образование и опыт",
      "Перечень услуг",
      'Рассказать про сложность вашего предмета (например: "у меня учатся только избранные")',
    ],
    correctAnswer: ["Результаты учеников", "Образование и опыт"],
    required: true,
  },
  {
    id: "test_raskachat_profi",
    text: "Что поможет раскачать анкету на Профи? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "Откликаться даже на дешёвые заказы, получить любой заказ любой ценой",
      "Выбирать заказы с той ставкой, которую собираетесь предлагать",
      "Отодвинуть оплату комиссий, чтобы можно было оплатить позже",
      "Просить оставить отзыв за пробный урок",
      "Отправить лишние заказы в архив",
      "Закрыть все заказы в работе",
      "Оплатить комиссии",
      "Отказы от заказов (где ученик не согласился заниматься) вместо архива",
    ],
    correctAnswer: [
      "Откликаться даже на дешёвые заказы, получить любой заказ любой ценой",
      "Просить оставить отзыв за пробный урок",
      "Оплатить комиссии",
    ],
    required: true,
  },
  {
    id: "test_probnyy_urok",
    text: "Что обязательно должно быть на пробном уроке? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "Интерактивные задания",
      "Оффер (ограниченное предложение)",
      "Рассказ о результатах учеников",
      "Обратная связь для ученика о его уровне подготовки",
    ],
    correctAnswer: [
      "Оффер (ограниченное предложение)",
      "Рассказ о результатах учеников",
      "Обратная связь для ученика о его уровне подготовки",
    ],
    required: true,
  },
  {
    id: "test_podrostok_probnyy",
    text: "Если вы проводите пробный урок с подростком:",
    type: "single_radio",
    options: [
      "Сделать ему оффер и дать обсудить с родителями",
      "Не делать подростку оффер, а созвониться с родителем, дать обратную связь и сделать оффер ему",
      "Не делать подростку оффер, а обсудить условия с родителем в переписке",
    ],
    correct: 1,
    required: true,
  },
  {
    id: "test_vozrazhenie_podumat",
    text: 'Является ли эта фраза возражением? "Спасибо, мне всё очень понравилось, нужно подумать"',
    type: "single_radio",
    options: [
      "Да, это значит, что клиента не устроила цена, нужно отработать",
      "Нет, это значит, что этот человек не склонен к импульсивным покупкам и подумает сам",
      "Нет, нужно задать дополнительные вопросы, чтобы понять, что конкретно смущает",
    ],
    correct: 2,
    required: true,
  },
  {
    id: "test_vozrazhenie_gruppy",
    text: 'Какие варианты отработки возражения "Нет, нам не подходят группы, а индивидуально у вас очень дорого" подходят? (несколько вариантов)',
    type: "multi_checkbox",
    options: [
      '"А вам нужен результат или индивидуальные занятия?"',
      '"Да, я вас понимаю, но зато группы гораздо дешевле, может попробуете?"',
      '"Я понимаю ваше беспокойство, что в группе будет меньше внимания, но…"',
      '"Подскажите, а что конкретно смущает в группах? У вас уже был опыт?"',
    ],
    correctAnswer: [
      '"А вам нужен результат или индивидуальные занятия?"',
      '"Я понимаю ваше беспокойство, что в группе будет меньше внимания, но…"',
      '"Подскажите, а что конкретно смущает в группах? У вас уже был опыт?"',
    ],
    required: true,
  },
  {
    id: "test_avito_otzyvy",
    text: "Что нужно сделать, чтобы Авито пропустил ваши отзывы в объявлении? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "Указать ник человека в соц. сетях",
      "Публиковать то же фото, пока не пропустят",
      "Скрыть телефон человека",
      "Добавить рамки, смайлики, посторонние объекты на текст отзыва",
    ],
    correctAnswer: [
      "Скрыть телефон человека",
      "Добавить рамки, смайлики, посторонние объекты на текст отзыва",
    ],
    required: true,
  },
  {
    id: "test_avito_pervoe",
    text: "Куда лучше выложить первое объявление на Авито для теста?",
    type: "single_radio",
    options: ["Маленький город", "Москва или Питер"],
    correct: 1,
    required: true,
  },
  {
    id: "test_avito_test_srok",
    text: "Как долго нужно тестировать платные объявления на Авито?",
    type: "single_radio",
    options: ["1–2 дня", "От 7 дней"],
    correct: 1,
    required: true,
  },
  {
    id: "test_avito_gde_test",
    text: "Где лучше выкладывать тестовые объявления на Авито?",
    type: "single_radio",
    options: ["Только Мск и Спб", "Мск/Спб и регионы", "Только регионы"],
    correct: 1,
    required: true,
  },
  {
    id: "test_avito_prosmotry_bez_kontaktov",
    text: "В чём проблема, если на объявлении в Авито много просмотров, но нет контактов? (несколько вариантов)",
    type: "multi_checkbox",
    options: [
      "В фото и/или названии",
      "В городе",
      "В описании анкеты",
      "В стоимости занятий",
      "Нужно вложить больше денег в продвижение (взять больше делений)",
    ],
    correctAnswer: ["В фото и/или названии", "В описании анкеты"],
    required: true,
  },
  {
    id: "test_avito_prosmotr_def",
    text: "Что такое просмотр на Авито?",
    type: "single_radio",
    options: [
      "Сколько раз наше объявление показало в поиске",
      "Сколько раз наше объявление открыли и прочитали",
      "Сколько раз нам написали по объявлению",
    ],
    correct: 1,
    required: true,
  },
  {
    id: "test_avito_kontakt_def",
    text: "Что такое контакт на Авито?",
    type: "single_radio",
    options: [
      "Человек, который написал нам в сообщения или позвонил",
      "Человек, который добавил наше объявление в избранное",
      "Человек, который посмотрел наше объявление",
    ],
    correct: 0,
    required: true,
  },
];

interface CertificationFormViewerProps {
  lessonId: string;
  isCompleted?: boolean;
  isPreview?: boolean;
}

type AnswerValue = string | string[];
type Phase = "form" | "test" | "results";

export function CertificationFormViewer({ lessonId, isCompleted, isPreview = false }: CertificationFormViewerProps) {
  const [phase, setPhase] = useState<Phase>("form");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (payload: { content: string }) => {
      if (isPreview) {
        await new Promise((r) => setTimeout(r, 800));
        return { success: true };
      }
      const response = await apiClient.post(`/lessons/${lessonId}/homework`, payload);
      return response.data;
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
      toast.success("Сертификация отправлена");
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error?.message || "Ошибка при отправке";
      toast.error(msg);
    },
  });

  const setSingle = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMulti = (id: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[id] as string[] | undefined) ?? [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [id]: next };
    });
  };

  const isAnswered = (q: Question): boolean => {
    const v = answers[q.id];
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    return v.toString().trim() !== "";
  };

  const isOptionCorrect = (q: Question, option: string): boolean => {
    if (q.type === "single_radio" && q.options && q.correct !== undefined) {
      return q.options[q.correct] === option;
    }
    if (q.type === "multi_checkbox" && q.correctAnswer) {
      return q.correctAnswer.includes(option);
    }
    return false;
  };

  const isOptionSelected = (q: Question, option: string): boolean => {
    const v = answers[q.id];
    if (q.type === "single_radio") return v === option;
    if (q.type === "multi_checkbox") return Array.isArray(v) && v.includes(option);
    return false;
  };

  const isQuestionCorrect = (q: Question): boolean => {
    if (q.type === "single_radio") {
      if (q.correct === undefined || !q.options) return false;
      return answers[q.id] === q.options[q.correct];
    }
    if (q.type === "multi_checkbox") {
      if (!q.correctAnswer) return false;
      const selected = (answers[q.id] as string[] | undefined) ?? [];
      if (selected.length !== q.correctAnswer.length) return false;
      return q.correctAnswer.every((c) => selected.includes(c));
    }
    return false;
  };

  const handleNextToTest = () => {
    const missing = PART1_QUESTIONS.filter((q) => q.required && !isAnswered(q));
    if (missing.length > 0) {
      toast.error("Пожалуйста, ответьте на все обязательные вопросы со звёздочкой");
      return;
    }
    setPhase("test");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmitAll = () => {
    const missing = PART2_QUESTIONS.filter((q) => q.required && !isAnswered(q));
    if (missing.length > 0) {
      toast.error("Пожалуйста, ответьте на все вопросы тестирования");
      return;
    }

    const correctCount = PART2_QUESTIONS.filter((q) => isQuestionCorrect(q)).length;
    const total = PART2_QUESTIONS.length;
    setTestScore(correctCount);

    const formatted: Record<string, string> = {};
    [...PART1_QUESTIONS, ...PART2_QUESTIONS].forEach((q) => {
      const v = answers[q.id];
      if (v === undefined) return;
      formatted[q.text] = Array.isArray(v) ? v.join(", ") : String(v);
    });
    formatted["Тестирование: правильных ответов"] = `${correctCount} из ${total}`;

    submitMutation.mutate({
      content: JSON.stringify({
        _answers: formatted,
        _test_score: correctCount,
        _test_total: total,
      }),
    });

    setPhase("results");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Если урок уже пройден — показываем плашку
  if ((submitted || isCompleted) && phase !== "results") {
    return (
      <Card className="max-w-3xl mx-auto border-blue-100 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <CircleCheck className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Сертификация пройдена!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 pt-4 p-4 sm:p-6">
          <div className="bg-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200">
            <p className="text-gray-600">Спасибо за прохождение анкеты и тестирования.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ===== PHASE: RESULTS =====
  if (phase === "results") {
    const total = PART2_QUESTIONS.length;
    const score = testScore ?? 0;
    const percent = Math.round((score / total) * 100);
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-12 px-2 sm:px-0">
        <Card className="border-blue-100 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Сертификация завершена!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6 pt-4 p-4 sm:p-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
              <p className="text-gray-600 mb-2">Ваш результат тестирования</p>
              <p className="text-5xl font-bold text-blue-700">
                {score} <span className="text-2xl text-gray-500">из {total}</span>
              </p>
              <p className="text-lg text-gray-700 mt-2">{percent}% правильных ответов</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-left space-y-3">
              <p className="font-semibold text-gray-900 text-center">Разбор ответов:</p>
              {PART2_QUESTIONS.map((q, idx) => {
                const correct = isQuestionCorrect(q);
                return (
                  <div key={q.id} className="flex items-start gap-2">
                    {correct ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm text-gray-700">
                      <span className="font-medium">{idx + 1}.</span> {q.text}
                    </span>
                  </div>
                );
              })}
            </div>
            {submitMutation.isPending && (
              <p className="text-sm text-gray-500">Отправка результатов…</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestions = phase === "form" ? PART1_QUESTIONS : PART2_QUESTIONS;
  const isTestPhase = phase === "test";

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12 px-2 sm:px-0">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {isTestPhase ? "Часть 2. Тестирование" : "Анкета сертификации «Прорыв»"}
        </h2>
        <p className="text-gray-600">
          {isTestPhase
            ? "Ответьте на 17 вопросов. Правильные и неправильные ответы будут подсвечиваться сразу."
            : "Часть 1: Анкета. После заполнения откроется тестирование."}
        </p>
      </div>

      <div className="bg-gray-50/50 rounded-2xl p-6 sm:p-8 space-y-8 border border-gray-100 shadow-sm">
        {currentQuestions.map((q, idx) => {
          const answered = isAnswered(q);
          return (
            <div key={q.id} className="space-y-3">
              <Label className="text-base font-medium text-gray-900 leading-snug block">
                {isTestPhase && <span className="text-gray-500 mr-1">{idx + 1}.</span>}
                {q.text} {q.required && <span className="text-red-500">*</span>}
              </Label>

              {q.type === "text" && (
                <Input
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setSingle(q.id, e.target.value)}
                  placeholder={q.placeholder}
                  className="bg-white max-w-xl border-gray-300"
                />
              )}

              {q.type === "number" && (
                <Input
                  type="number"
                  inputMode="numeric"
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setSingle(q.id, e.target.value)}
                  placeholder={q.placeholder}
                  className="bg-white max-w-xs border-gray-300"
                />
              )}

              {q.type === "textarea" && (
                <Textarea
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setSingle(q.id, e.target.value)}
                  placeholder={q.placeholder}
                  rows={3}
                  className="bg-white border-gray-300"
                />
              )}

              {q.type === "scale_1_10" && (
                <RadioGroup
                  value={(answers[q.id] as string) || ""}
                  onValueChange={(val) => setSingle(q.id, val)}
                  className="flex flex-wrap gap-x-4 gap-y-3 pt-1"
                >
                  {SCALE_1_10.map((num) => (
                    <div key={num} className="flex flex-row items-center space-x-2">
                      <RadioGroupItem value={num} id={`q-${q.id}-${num}`} className="text-blue-600" />
                      <Label htmlFor={`q-${q.id}-${num}`} className="font-normal text-gray-700 cursor-pointer">
                        {num}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {q.type === "single_radio" && q.options && (
                <RadioGroup
                  value={(answers[q.id] as string) || ""}
                  onValueChange={(val) => setSingle(q.id, val)}
                  className="flex flex-col gap-2 pt-1"
                >
                  {q.options.map((option) => {
                    const showFeedback = isTestPhase && answered;
                    const correct = isOptionCorrect(q, option);
                    const selected = isOptionSelected(q, option);
                    const optionClass = cn(
                      "flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors",
                      !showFeedback && "border-transparent hover:bg-gray-100",
                      showFeedback && correct && "border-green-400 bg-green-50",
                      showFeedback && selected && !correct && "border-red-400 bg-red-50",
                      showFeedback && !correct && !selected && "border-transparent"
                    );
                    return (
                      <div key={option} className={optionClass}>
                        <RadioGroupItem value={option} id={`q-${q.id}-${option}`} className="text-blue-600" />
                        <Label htmlFor={`q-${q.id}-${option}`} className="font-normal text-gray-700 cursor-pointer flex-1">
                          {option}
                        </Label>
                        {showFeedback && correct && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                        {showFeedback && selected && !correct && (
                          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </RadioGroup>
              )}

              {q.type === "multi_checkbox" && q.options && (
                <div className="flex flex-col gap-2 pt-1">
                  {q.options.map((option) => {
                    const showFeedback = isTestPhase && answered;
                    const correct = isOptionCorrect(q, option);
                    const selected = isOptionSelected(q, option);
                    const optionClass = cn(
                      "flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors",
                      !showFeedback && "border-transparent hover:bg-gray-100",
                      showFeedback && correct && "border-green-400 bg-green-50",
                      showFeedback && selected && !correct && "border-red-400 bg-red-50",
                      showFeedback && !correct && !selected && "border-transparent"
                    );
                    return (
                      <div key={option} className={optionClass}>
                        <Checkbox
                          id={`q-${q.id}-${option}`}
                          checked={selected}
                          onCheckedChange={() => toggleMulti(q.id, option)}
                        />
                        <Label htmlFor={`q-${q.id}-${option}`} className="font-normal text-gray-700 cursor-pointer flex-1">
                          {option}
                        </Label>
                        {showFeedback && correct && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                        {showFeedback && selected && !correct && (
                          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex justify-center pt-8">
          {phase === "form" && (
            <Button
              size="lg"
              onClick={handleNextToTest}
              className="bg-[#f05a28] hover:bg-[#d94a1d] text-white min-w-[240px] h-12 text-base rounded-full"
            >
              Перейти к тестированию
            </Button>
          )}
          {phase === "test" && (
            <Button
              size="lg"
              onClick={handleSubmitAll}
              disabled={submitMutation.isPending}
              className="bg-[#f05a28] hover:bg-[#d94a1d] text-white min-w-[240px] h-12 text-base rounded-full"
            >
              {submitMutation.isPending ? "Отправка…" : "Завершить тестирование"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
