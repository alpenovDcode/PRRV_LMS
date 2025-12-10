import { db } from "./db";
import { randomBytes } from "crypto";
import { addHours } from "date-fns";

/**
 * Логика работы с медиа-библиотекой
 */

/**
 * Генерирует signed URL для доступа к файлу
 */
export function generateSignedUrl(fileUrl: string, expiresInHours: number = 24): {
  signedUrl: string;
  expiresAt: Date;
} {
  // В реальном приложении здесь должна быть интеграция с S3/Cloudflare R2
  // и генерация настоящего signed URL
  const token = randomBytes(32).toString("hex");
  const expiresAt = addHours(new Date(), expiresInHours);
  
  // Заглушка: в реальности это должен быть настоящий signed URL от провайдера
  const signedUrl = `${fileUrl}?token=${token}&expires=${expiresAt.getTime()}`;
  
  return { signedUrl, expiresAt };
}

/**
 * Создает запись о медиа-файле
 */
export async function createMediaFile(
  uploadedById: string,
  name: string,
  originalName: string,
  mimeType: string,
  size: number,
  url: string
) {
  const { signedUrl, expiresAt } = generateSignedUrl(url);

  const mediaFile = await db.mediaFile.create({
    data: {
      name,
      originalName,
      mimeType,
      size,
      url,
      signedUrl,
      signedUrlExpires: expiresAt,
      uploadedById,
    },
  });

  return mediaFile;
}

/**
 * Получает signed URL для доступа к файлу (обновляет если истек)
 */
export async function getMediaFileSignedUrl(mediaId: string): Promise<string | null> {
  const media = await db.mediaFile.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      url: true,
      signedUrl: true,
      signedUrlExpires: true,
    },
  });

  if (!media) {
    return null;
  }

  // Если signed URL истек или отсутствует, генерируем новый
  if (!media.signedUrl || !media.signedUrlExpires || media.signedUrlExpires < new Date()) {
    const { signedUrl, expiresAt } = generateSignedUrl(media.url);
    
    await db.mediaFile.update({
      where: { id: mediaId },
      data: {
        signedUrl,
        signedUrlExpires: expiresAt,
      },
    });

    return signedUrl;
  }

  return media.signedUrl;
}

/**
 * Прикрепляет медиа-файл к уроку
 */
export async function attachMediaToLesson(
  lessonId: string,
  mediaId: string,
  orderIndex?: number
) {
  // Получаем текущий максимальный orderIndex
  const lastMedia = await db.lessonMedia.findFirst({
    where: { lessonId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });

  const newOrderIndex = orderIndex !== undefined ? orderIndex : (lastMedia?.orderIndex || 0) + 1;

  return db.lessonMedia.create({
    data: {
      lessonId,
      mediaId,
      orderIndex: newOrderIndex,
    },
  });
}

/**
 * Проверяет доступ пользователя к медиа-файлу
 */
export async function canUserAccessMedia(
  userId: string,
  mediaId: string
): Promise<boolean> {
  // Проверяем, прикреплен ли файл к уроку, к которому у пользователя есть доступ
  const media = await db.mediaFile.findUnique({
    where: { id: mediaId },
    include: {
      lessonMedia: {
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: {
                    include: {
                      enrollments: {
                        where: {
                          userId,
                          status: "active",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!media) {
    return false;
  }

  // Если файл прикреплен к уроку, проверяем enrollment
  if (media.lessonMedia.length > 0) {
    return media.lessonMedia.some(
      (lm) => lm.lesson.module.course.enrollments.length > 0
    );
  }

  // Если файл не прикреплен ни к одному уроку, доступ только для админов
  // (можно расширить логику)
  return false;
}

