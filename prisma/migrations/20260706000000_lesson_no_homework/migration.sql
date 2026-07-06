-- Флаг «в уроке нет ДЗ». Если true, студент не может прикреплять
-- домашнее задание, а форма отправки скрыта. Существующие уроки
-- остаются с ДЗ (default false), поведение не меняется.

ALTER TABLE "lessons"
  ADD COLUMN "no_homework" BOOLEAN NOT NULL DEFAULT false;
