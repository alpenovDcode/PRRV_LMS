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
import {
  CERTIFICATION_LIMITS,
  shouldShowCharacterCount,
  type NumericAnswerRule,
  validateCertificationAnswer,
} from "@/lib/certification-form-validation";

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
  numericRule?: NumericAnswerRule;
  helper?: string;
  // Только для тестовых вопросов (часть 2):
  correct?: number; // index option-а — для single_radio
  correctAnswer?: string[]; // массив правильных option-строк — для multi_checkbox
}

const SCALE_1_10 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const SINGLE_NUMBER_HELPER =
  "Укажите одно целое число. Можно использовать пробелы или запятые для разделения тысяч.";
const RANGE_NUMBER_HELPER =
  "Можно указать одно целое число или диапазон через тире, например 1000–1300.";

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
  "Анастасия @RomanAnasta",
  "Нет наставника",
];

// ===== Часть 1. Анкета сертификации =====
const PART1_QUESTIONS: Question[] = [
  { id: "telegram_nick", text: "Напишите свой ник в Telegram", type: "text", required: true },
  { id: "city", text: "В каком городе вы проживаете?", type: "textarea", required: true },
  {
    id: "age",
    text: "Сколько вам лет?",
    type: "number",
    required: true,
    numericRule: "single_integer",
    helper: SINGLE_NUMBER_HELPER,
  },
  { id: "subject", text: "Ваш предмет и специализация", type: "text", required: true },

  // Точка А
  {
    id: "income_point_a",
    text: 'Ваш доход в точке А? С каким уровнем дохода в месяц вы пришли на программу "Прорыв"?',
    type: "number",
    required: true,
    numericRule: "single_integer",
    helper: `${SINGLE_NUMBER_HELPER} Например: 20000.`,
  },
  {
    id: "emotional_state_before",
    text: "Каково было ваше эмоциональное состояние до обучения на Прорыве?",
    type: "textarea",
    required: true,
  },
  {
    id: "hour_price_before",
    text: "Какова была средняя стоимость 1 часа вашего занятия?",
    type: "number",
    required: true,
    numericRule: "integer_or_range",
    helper: RANGE_NUMBER_HELPER,
  },
  {
    id: "students_before",
    text: "Сколько у вас было учеников?",
    type: "number",
    required: true,
    numericRule: "integer_or_range",
    helper: RANGE_NUMBER_HELPER,
  },
  {
    id: "hours_before",
    text: "Какое кол-во часов в неделю вы работали?",
    type: "number",
    required: true,
    numericRule: "integer_or_range",
    helper: RANGE_NUMBER_HELPER,
  },

  // Проблемы и решение
  {
    id: "problems_to_solve",
    text: "Какие проблемы вы хотели решить с помощью Прорыва?",
    type: "textarea",
    required: true,
  },
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
    text: "Точка Б: Ваш доход за последний месяц в рублях?",
    type: "number",
    required: true,
    numericRule: "single_integer",
    helper: `${SINGLE_NUMBER_HELPER} Например: 100000.`,
  },
  {
    id: "emotional_state_after",
    text: "Расскажите о своем эмоциональном состоянии сейчас, после обучения на Прорыве",
    type: "textarea",
    required: true,
  },
  {
    id: "life_changes",
    text: "Как изменилась ваша жизнь после прохождения программы?",
    type: "textarea",
    required: true,
  },
  {
    id: "hour_price_after",
    text: "Какова сейчас средняя стоимость 1 часа вашего занятия?",
    type: "number",
    required: true,
    numericRule: "integer_or_range",
    helper: RANGE_NUMBER_HELPER,
  },
  {
    id: "students_now",
    text: "Сколько у вас сейчас учеников?",
    type: "number",
    required: true,
    numericRule: "integer_or_range",
    helper: RANGE_NUMBER_HELPER,
  },
  {
    id: "hours_now",
    text: "Сколько часов в неделю вы сейчас работаете?",
    type: "number",
    required: true,
    numericRule: "integer_or_range",
    helper: RANGE_NUMBER_HELPER,
  },

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
  {
    id: "mentor",
    text: "Кто является вашим наставником?",
    type: "single_radio",
    options: MENTORS,
    required: true,
  },
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
  {
    id: "mentor_improvements",
    text: "Что можно было бы улучшить в работе наставника?",
    type: "textarea",
    required: true,
  },
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

export function CertificationFormViewer({
  lessonId,
  isCompleted,
  isPreview = false,
}: CertificationFormViewerProps) {
  const [phase, setPhase] = useState<Phase>("form");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<number | null>(null);
  const [revealAnswers, setRevealAnswers] = useState(false);
  const [touchedQuestions, setTouchedQuestions] = useState<Record<string, boolean>>({});
  const [hasAttemptedContinue, setHasAttemptedContinue] = useState(false);
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

  const markTouched = (id: string) => {
    setTouchedQuestions((prev) => ({ ...prev, [id]: true }));
  };

  const toggleMulti = (id: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[id] as string[] | undefined) ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  };

  const isAnswered = (q: Question): boolean => {
    const v = answers[q.id];
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    return v.toString().trim() !== "";
  };

  const getQuestionError = (q: Question): string | undefined => {
    const kind =
      q.type === "number"
        ? "numeric"
        : q.type === "textarea"
          ? "textarea"
          : q.type === "text"
            ? "text"
            : "selection";

    return validateCertificationAnswer({
      value: answers[q.id],
      required: q.required,
      kind,
      numericRule: q.numericRule,
    });
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
    const invalidQuestions = PART1_QUESTIONS.filter((q) => getQuestionError(q));
    setHasAttemptedContinue(true);

    if (invalidQuestions.length > 0) {
      const firstInvalid = invalidQuestions[0];
      toast.error(
        invalidQuestions.length === 1
          ? "Исправьте ответ в подсвеченном поле"
          : `Исправьте ответы в ${invalidQuestions.length} подсвеченных полях`
      );

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const question = document.getElementById(`question-${firstInvalid.id}`);
          question?.scrollIntoView({ behavior: "smooth", block: "center" });
          question
            ?.querySelector<HTMLElement>(
              'input, textarea, button[role="radio"], button[role="checkbox"]'
            )
            ?.focus({ preventScroll: true });
        });
      }
      return;
    }

    setHasAttemptedContinue(false);
    setPhase("test");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinishTest = () => {
    const missing = PART2_QUESTIONS.filter((q) => q.required && !isAnswered(q));
    if (missing.length > 0) {
      toast.error("Пожалуйста, ответьте на все вопросы тестирования");
      return;
    }
    const correctCount = PART2_QUESTIONS.filter((q) => isQuestionCorrect(q)).length;
    setTestScore(correctCount);
    setRevealAnswers(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleViewResults = () => {
    const correctCount = testScore ?? PART2_QUESTIONS.filter((q) => isQuestionCorrect(q)).length;
    const total = PART2_QUESTIONS.length;

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
      <Card className="mx-auto max-w-3xl border-blue-100 shadow-lg">
        <CardHeader className="pb-2 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <CircleCheck className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Сертификация пройдена!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-4 pt-4 text-center sm:p-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-6">
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
      <div className="mx-auto max-w-3xl space-y-6 px-2 pb-12 sm:px-0">
        <Card className="border-blue-100 shadow-lg">
          <CardHeader className="pb-2 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Trophy className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Сертификация завершена!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-4 pt-4 text-center sm:p-6">
            <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6">
              <p className="mb-2 text-gray-600">Ваш результат тестирования</p>
              <p className="text-5xl font-bold text-blue-700">
                {score} <span className="text-2xl text-gray-500">из {total}</span>
              </p>
              <p className="mt-2 text-lg text-gray-700">{percent}% правильных ответов</p>
            </div>
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
              <p className="text-center font-semibold text-gray-900">Разбор ответов:</p>
              {PART2_QUESTIONS.map((q, idx) => {
                const correct = isQuestionCorrect(q);
                return (
                  <div key={q.id} className="flex items-start gap-2">
                    {correct ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
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
    <div className="mx-auto max-w-3xl space-y-8 px-2 pb-12 sm:px-0">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {isTestPhase ? "Часть 2. Тестирование" : "Анкета сертификации «Прорыв»"}
        </h2>
        <p className="text-gray-600">
          {isTestPhase
            ? "Ответьте на 17 вопросов. Правильные и неправильные ответы будут подсвечиваться сразу."
            : "Часть 1: Анкета. После заполнения откроется тестирование."}
        </p>
      </div>

      {isTestPhase && revealAnswers && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Тестирование завершено. Правильные ответы подсвечены зелёным, неправильные — красным.
          Ответы заблокированы. Нажмите «Посмотреть итоги», чтобы отправить результат.
        </div>
      )}

      <div className="space-y-8 rounded-2xl border border-gray-100 bg-gray-50/50 p-6 shadow-sm sm:p-8">
        {currentQuestions.map((q, idx) => {
          const locked = isTestPhase && revealAnswers;
          const error = getQuestionError(q);
          const showError =
            !isTestPhase && Boolean(error) && (hasAttemptedContinue || touchedQuestions[q.id]);
          const controlId = `question-${q.id}-input`;
          const helpId = `question-${q.id}-help`;
          const errorId = `question-${q.id}-error`;
          const describedBy =
            [q.helper ? helpId : undefined, showError ? errorId : undefined]
              .filter(Boolean)
              .join(" ") || undefined;
          const answer = answers[q.id];
          const answerLength = typeof answer === "string" ? answer.length : 0;
          const limit =
            q.type === "number"
              ? CERTIFICATION_LIMITS.numeric
              : q.type === "text"
                ? CERTIFICATION_LIMITS.text
                : q.type === "textarea"
                  ? CERTIFICATION_LIMITS.textarea
                  : undefined;
          const showCounter =
            !isTestPhase && limit !== undefined && shouldShowCharacterCount(answerLength, limit);

          return (
            <div
              key={q.id}
              id={`question-${q.id}`}
              className={cn(
                "-m-4 scroll-mt-24 space-y-3 rounded-xl border border-transparent p-4 transition-colors",
                showError && "border-red-300 bg-red-50/70"
              )}
            >
              <Label
                htmlFor={
                  q.type === "text" || q.type === "number" || q.type === "textarea"
                    ? controlId
                    : undefined
                }
                className="block text-base font-medium leading-snug text-gray-900"
              >
                {isTestPhase && <span className="mr-1 text-gray-500">{idx + 1}.</span>}
                {q.text} {q.required && <span className="text-red-500">*</span>}
              </Label>

              {q.type === "text" && (
                <Input
                  id={controlId}
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setSingle(q.id, e.target.value)}
                  onBlur={() => markTouched(q.id)}
                  placeholder={q.placeholder}
                  aria-invalid={showError || undefined}
                  aria-describedby={describedBy}
                  className={cn(
                    "max-w-xl border-gray-300 bg-white",
                    showError && "border-red-500 focus-visible:border-red-500"
                  )}
                />
              )}

              {q.type === "number" && (
                <Input
                  id={controlId}
                  type="text"
                  inputMode={q.numericRule === "integer_or_range" ? "text" : "numeric"}
                  autoComplete="off"
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setSingle(q.id, e.target.value)}
                  onBlur={() => markTouched(q.id)}
                  placeholder={q.placeholder}
                  aria-invalid={showError || undefined}
                  aria-describedby={describedBy}
                  className={cn(
                    "max-w-xs border-gray-300 bg-white",
                    showError && "border-red-500 focus-visible:border-red-500"
                  )}
                />
              )}

              {q.type === "textarea" && (
                <Textarea
                  id={controlId}
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setSingle(q.id, e.target.value)}
                  onBlur={() => markTouched(q.id)}
                  placeholder={q.placeholder}
                  rows={3}
                  aria-invalid={showError || undefined}
                  aria-describedby={describedBy}
                  className={cn(
                    "border-gray-300 bg-white",
                    showError && "border-red-500 focus-visible:border-red-500"
                  )}
                />
              )}

              {q.type === "scale_1_10" && (
                <RadioGroup
                  value={(answers[q.id] as string) || ""}
                  onValueChange={(val) => setSingle(q.id, val)}
                  aria-invalid={showError || undefined}
                  aria-describedby={describedBy}
                  className="flex flex-wrap gap-x-4 gap-y-3 pt-1"
                >
                  {SCALE_1_10.map((num) => (
                    <div key={num} className="flex flex-row items-center space-x-2">
                      <RadioGroupItem
                        value={num}
                        id={`q-${q.id}-${num}`}
                        className="text-blue-600"
                      />
                      <Label
                        htmlFor={`q-${q.id}-${num}`}
                        className="cursor-pointer font-normal text-gray-700"
                      >
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
                  aria-invalid={showError || undefined}
                  aria-describedby={describedBy}
                  className="flex flex-col gap-2 pt-1"
                >
                  {q.options.map((option) => {
                    const showFeedback = isTestPhase && revealAnswers;
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
                        <RadioGroupItem
                          value={option}
                          id={`q-${q.id}-${option}`}
                          className="text-blue-600"
                          disabled={locked}
                        />
                        <Label
                          htmlFor={`q-${q.id}-${option}`}
                          className="flex-1 cursor-pointer font-normal text-gray-700"
                        >
                          {option}
                        </Label>
                        {showFeedback && correct && (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
                        )}
                        {showFeedback && selected && !correct && (
                          <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
                        )}
                      </div>
                    );
                  })}
                </RadioGroup>
              )}

              {q.type === "multi_checkbox" && q.options && (
                <div
                  className="flex flex-col gap-2 pt-1"
                  role="group"
                  aria-invalid={showError || undefined}
                  aria-describedby={describedBy}
                >
                  {q.options.map((option) => {
                    const showFeedback = isTestPhase && revealAnswers;
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
                          disabled={locked}
                          onCheckedChange={() => toggleMulti(q.id, option)}
                        />
                        <Label
                          htmlFor={`q-${q.id}-${option}`}
                          className="flex-1 cursor-pointer font-normal text-gray-700"
                        >
                          {option}
                        </Label>
                        {showFeedback && correct && (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
                        )}
                        {showFeedback && selected && !correct && (
                          <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(q.helper || showCounter) && (
                <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  {q.helper ? (
                    <p id={helpId} className="text-gray-500">
                      {q.helper}
                    </p>
                  ) : (
                    <span />
                  )}
                  {showCounter && limit !== undefined && (
                    <span
                      className={cn(
                        "ml-auto tabular-nums text-gray-500",
                        answerLength > limit && "font-medium text-red-600"
                      )}
                    >
                      {answerLength}/{limit}
                    </span>
                  )}
                </div>
              )}

              {showError && (
                <p id={errorId} role="alert" className="text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex justify-center pt-8">
          {phase === "form" && (
            <Button
              size="lg"
              onClick={handleNextToTest}
              className="h-12 min-w-[240px] rounded-full bg-[#f05a28] text-base text-white hover:bg-[#d94a1d]"
            >
              Перейти к тестированию
            </Button>
          )}
          {phase === "test" && !revealAnswers && (
            <Button
              size="lg"
              onClick={handleFinishTest}
              className="h-12 min-w-[240px] rounded-full bg-[#f05a28] text-base text-white hover:bg-[#d94a1d]"
            >
              Завершить тестирование
            </Button>
          )}
          {phase === "test" && revealAnswers && (
            <Button
              size="lg"
              onClick={handleViewResults}
              disabled={submitMutation.isPending}
              className="h-12 min-w-[240px] rounded-full bg-[#f05a28] text-base text-white hover:bg-[#d94a1d]"
            >
              {submitMutation.isPending ? "Отправка…" : "Посмотреть итоги"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
