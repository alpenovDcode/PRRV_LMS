import { describe, it, expect } from "vitest";

// ─── Логика из chat-thread.tsx ────────────────────────────────────────────────

const isAudioAttachment = (type: unknown) =>
  String(type).startsWith("audio/");

const isImageAttachment = (type: unknown, url: string) => {
  if (isAudioAttachment(type)) return false;
  return !type || String(type).startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url);
};

const isIncludedInLightbox = (a: { type?: unknown; url?: string }) =>
  a?.url &&
  (!a.type || String(a.type).startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.url ?? ""));

// ImageUploader onChange — сохраняет аудио, заменяет картинки
const mergeImagesKeepAudio = (
  prev: Array<{ url: string; name: string; type: string; size?: number | null }>,
  imgs: Array<{ url: string; name: string; type: string; size?: number | null }>
) => [...prev.filter((a) => isAudioAttachment(a.type)), ...imgs];

// Определение расширения из blob.type
const audioExt = (mimeType: string) =>
  mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : "webm";

// ─── isAudioAttachment ────────────────────────────────────────────────────────

describe("isAudioAttachment", () => {
  it("определяет стандартные аудио MIME", () => {
    expect(isAudioAttachment("audio/webm")).toBe(true);
    expect(isAudioAttachment("audio/ogg")).toBe(true);
    expect(isAudioAttachment("audio/mpeg")).toBe(true);
    expect(isAudioAttachment("audio/mp4")).toBe(true);
    expect(isAudioAttachment("audio/wav")).toBe(true);
  });

  it("определяет audio/webm с кодеком (Chrome/Firefox)", () => {
    expect(isAudioAttachment("audio/webm;codecs=opus")).toBe(true);
    expect(isAudioAttachment("audio/ogg;codecs=opus")).toBe(true);
  });

  it("не считает картинки аудио", () => {
    expect(isAudioAttachment("image/png")).toBe(false);
    expect(isAudioAttachment("image/jpeg")).toBe(false);
  });

  it("не ломается на null и undefined (старые сообщения без type)", () => {
    expect(isAudioAttachment(null)).toBe(false);
    expect(isAudioAttachment(undefined)).toBe(false);
    expect(isAudioAttachment("")).toBe(false);
  });
});

// ─── isImageAttachment ────────────────────────────────────────────────────────

describe("isImageAttachment", () => {
  it("определяет картинки по MIME", () => {
    expect(isImageAttachment("image/png", "photo.png")).toBe(true);
    expect(isImageAttachment("image/jpeg", "photo.jpg")).toBe(true);
  });

  it("определяет картинки по расширению URL (старые записи без type)", () => {
    expect(isImageAttachment(null, "https://cdn.example.com/file.jpg")).toBe(true);
    expect(isImageAttachment(undefined, "https://cdn.example.com/file.png")).toBe(true);
    expect(isImageAttachment("", "https://cdn.example.com/file.webp")).toBe(true);
  });

  it("аудио никогда не становится картинкой", () => {
    expect(isImageAttachment("audio/webm", "voice.webm")).toBe(false);
    expect(isImageAttachment("audio/webm;codecs=opus", "voice.webm")).toBe(false);
  });

  it("документы не считаются картинками", () => {
    expect(isImageAttachment("application/pdf", "doc.pdf")).toBe(false);
    expect(isImageAttachment("text/plain", "doc.txt")).toBe(false);
  });
});

// ─── Lightbox — аудио не попадает в список картинок ──────────────────────────

describe("isIncludedInLightbox", () => {
  it("картинки включаются в lightbox", () => {
    expect(isIncludedInLightbox({ type: "image/png", url: "https://cdn/photo.png" })).toBeTruthy();
    expect(isIncludedInLightbox({ type: undefined, url: "https://cdn/photo.jpg" })).toBeTruthy();
  });

  it("аудио НЕ включается в lightbox", () => {
    expect(isIncludedInLightbox({ type: "audio/webm", url: "https://cdn/voice.webm" })).toBeFalsy();
    expect(isIncludedInLightbox({ type: "audio/webm;codecs=opus", url: "https://cdn/voice.webm" })).toBeFalsy();
  });

  it("аттачмент без url не включается", () => {
    expect(isIncludedInLightbox({ type: "image/png", url: undefined })).toBeFalsy();
  });
});

// ─── mergeImagesKeepAudio ─────────────────────────────────────────────────────

describe("mergeImagesKeepAudio (ImageUploader onChange)", () => {
  const audio = { url: "https://cdn/voice.webm", name: "voice.webm", type: "audio/webm", size: 12000 };
  const img1 = { url: "https://cdn/photo1.jpg", name: "photo1.jpg", type: "image/jpeg", size: 5000 };
  const img2 = { url: "https://cdn/photo2.png", name: "photo2.png", type: "image/png", size: 8000 };

  it("при замене картинок аудио сохраняется", () => {
    const result = mergeImagesKeepAudio([audio, img1], [img2]);
    expect(result).toContainEqual(audio);
    expect(result).toContainEqual(img2);
    expect(result).not.toContainEqual(img1);
  });

  it("без аудио работает как простая замена (обратная совместимость)", () => {
    const result = mergeImagesKeepAudio([img1], [img2]);
    expect(result).toEqual([img2]);
  });

  it("несколько аудио все сохраняются", () => {
    const audio2 = { url: "https://cdn/voice2.webm", name: "voice2.webm", type: "audio/ogg", size: 9000 };
    const result = mergeImagesKeepAudio([audio, audio2, img1], [img2]);
    expect(result).toContainEqual(audio);
    expect(result).toContainEqual(audio2);
    expect(result).toContainEqual(img2);
    expect(result).not.toContainEqual(img1);
  });

  it("пустые списки не ломают функцию", () => {
    expect(mergeImagesKeepAudio([], [])).toEqual([]);
    expect(mergeImagesKeepAudio([audio], [])).toEqual([audio]);
    expect(mergeImagesKeepAudio([], [img1])).toEqual([img1]);
  });
});

// ─── audioExt ─────────────────────────────────────────────────────────────────

describe("audioExt (определение расширения файла из MIME)", () => {
  it("Chrome/Firefox — audio/webm → webm", () => {
    expect(audioExt("audio/webm")).toBe("webm");
    expect(audioExt("audio/webm;codecs=opus")).toBe("webm");
  });

  it("Firefox — audio/ogg → ogg", () => {
    expect(audioExt("audio/ogg")).toBe("ogg");
    expect(audioExt("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("Safari — audio/mp4 → m4a", () => {
    expect(audioExt("audio/mp4")).toBe("m4a");
  });

  it("неизвестный тип → webm (безопасный fallback)", () => {
    expect(audioExt("audio/wav")).toBe("webm");
    expect(audioExt("")).toBe("webm");
  });
});
