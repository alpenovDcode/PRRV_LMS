export interface CertificateTextField {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
}

export function resolveFullNameField(fieldConfig: unknown): CertificateTextField {
  const config =
    fieldConfig && typeof fieldConfig === "object" ? (fieldConfig as Record<string, unknown>) : {};
  const raw = config.fullName;

  if (!raw || typeof raw !== "object") {
    throw new Error("В шаблоне сертификата не настроено поле ФИО студента");
  }

  const field = raw as Record<string, unknown>;
  const x = Number(field.x);
  const y = Number(field.y);
  const fontSize = Number(field.fontSize);
  const align = field.align;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("В шаблоне сертификата некорректно указаны координаты поля ФИО");
  }
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    throw new Error("В шаблоне сертификата некорректно указан размер ФИО");
  }
  if (align !== "left" && align !== "center" && align !== "right") {
    throw new Error("В шаблоне сертификата некорректно задано выравнивание ФИО");
  }

  return {
    x,
    y,
    fontSize,
    color: typeof field.color === "string" ? field.color : "#000000",
    align,
  };
}
