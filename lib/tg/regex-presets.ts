// Library of regex presets exposed in the editor UI. When the user
// configures a wait_reply validation or a regex trigger, they can pick
// one of these instead of writing the pattern by hand. Patterns are
// from SaleBot's "Список полезных регулярных выражений" doc page,
// chosen for "the 80% of survey/booking funnel cases".
//
// Each preset is independent of flags — the engine adds `i` by default.

export interface RegexPreset {
  key: string;
  // Human-readable label shown in the picker.
  label: string;
  // ECMAScript regex source.
  pattern: string;
  // Short example of valid input — drives placeholder text in the
  // validation error message editor.
  example: string;
  // Category drives grouping in the picker.
  category: "contact" | "date" | "format" | "geo" | "id";
}

export const REGEX_PRESETS: RegexPreset[] = [
  // ---- Contact ----------------------------------------------------
  {
    key: "phone_ru",
    label: "Телефон РФ",
    pattern: "^((\\+7|7|8)+([0-9]){10})$",
    example: "+79991234567",
    category: "contact",
  },
  {
    key: "phone_any",
    label: "Телефон (любой)",
    pattern: "^(\\+)?((\\d{2,3}) ?\\d|\\d)(([ -]?\\d)|( ?(\\d{2,3}) ?)){5,12}\\d$",
    example: "+1 (555) 123-4567",
    category: "contact",
  },
  {
    key: "email",
    label: "Email",
    pattern: "^[-\\w.]+@([A-Za-z0-9][-A-Za-z0-9]+\\.)+[A-Za-z]{2,10}$",
    example: "user@example.com",
    category: "contact",
  },
  {
    key: "full_name_ru",
    label: "ФИО (Иванов Иван Иванович)",
    pattern: "^[а-яА-ЯёЁa-zA-Z]+ [а-яА-ЯёЁa-zA-Z]+ ?[а-яА-ЯёЁa-zA-Z]*$",
    example: "Петров Иван",
    category: "contact",
  },
  // ---- Date -------------------------------------------------------
  {
    key: "date_dot",
    label: "Дата дд.мм.гггг",
    pattern: "(0[1-9]|[12][0-9]|3[01])[.](0[1-9]|1[012])[.](19|20)\\d\\d",
    example: "13.05.2026",
    category: "date",
  },
  {
    key: "date_slash",
    label: "Дата дд/мм/гггг",
    pattern: "(0[1-9]|[12][0-9]|3[01])[/](0[1-9]|1[012])[/](19|20)\\d\\d",
    example: "13/05/2026",
    category: "date",
  },
  {
    key: "date_iso",
    label: "Дата гггг-мм-дд (ISO)",
    pattern: "(19|20)\\d\\d-(0[1-9]|1[012])-(0[1-9]|[12]\\d|3[01])",
    example: "2026-05-13",
    category: "date",
  },
  {
    key: "time_hhmm",
    label: "Время ЧЧ:ММ",
    pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    example: "14:30",
    category: "date",
  },
  // ---- Number formats --------------------------------------------
  {
    key: "int_positive",
    label: "Целое число (>0)",
    pattern: "^[1-9]\\d*$",
    example: "42",
    category: "format",
  },
  {
    key: "int_or_zero",
    label: "Целое число (≥0)",
    pattern: "^\\d+$",
    example: "0",
    category: "format",
  },
  {
    key: "float",
    label: "Число с дробной частью",
    pattern: "^-?\\d+(\\.\\d+)?$",
    example: "12.5",
    category: "format",
  },
  // ---- IDs and URLs ----------------------------------------------
  {
    key: "url",
    label: "URL (http/https)",
    pattern: "^https?://[\\w\\-.]+(:[0-9]+)?(/[^\\s]*)?$",
    example: "https://example.com/page",
    category: "id",
  },
  {
    key: "uuid",
    label: "UUID",
    pattern: "^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$",
    example: "550e8400-e29b-41d4-a716-446655440000",
    category: "id",
  },
  {
    key: "username_lat",
    label: "Логин (латиница+цифры, 2–20)",
    pattern: "^[a-zA-Z][a-zA-Z0-9_\\.-]{1,19}$",
    example: "ivan_petrov",
    category: "id",
  },
  // ---- Geo --------------------------------------------------------
  {
    key: "lat_lon",
    label: "Координата (-90…90 / -180…180)",
    pattern: "^-?\\d{1,3}\\.\\d+$",
    example: "55.7558",
    category: "geo",
  },
];

export const PRESET_BY_KEY = Object.fromEntries(
  REGEX_PRESETS.map((p) => [p.key, p]),
);
