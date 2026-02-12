import { db } from "./db";
import { sanitizeText } from "./sanitize";

/**
 * Логика работы с комментариями к урокам
 */

/**
 * Создает комментарий к уроку
 */
export async function createLessonComment(
  lessonId: string,
  userId: string,
  content: string,
  parentId?: string
) {
  // Проверяем, разрешены ли комментарии для урока
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      settings: true,
    },
  });

  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const settings = lesson.settings as { commentsEnabled?: boolean } | null;
  if (settings?.commentsEnabled === false) {
    throw new Error("Comments are disabled for this lesson");
  }

  // Санитизируем контент
  const sanitizedContent = await sanitizeText(content);

  return db.lessonComment.create({
    data: {
      lessonId,
      userId,
      content: sanitizedContent,
      parentId: parentId || null,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  });
}

/**
 * Получает комментарии к уроку (с иерархией)
 */
export async function getLessonComments(lessonId: string) {
  const comments = await db.lessonComment.findMany({
    where: {
      lessonId,
      isDeleted: false,
      parentId: null, // Только корневые комментарии
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
        },
      },
      replies: {
        where: {
          isDeleted: false,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return comments;
}

/**
 * Удаляет комментарий (мягкое удаление)
 */
export async function deleteLessonComment(commentId: string, userId: string) {
  const comment = await db.lessonComment.findUnique({
    where: { id: commentId },
    select: {
      userId: true,
    },
  });

  if (!comment) {
    throw new Error("Comment not found");
  }

  // Только автор или админ может удалить
  if (comment.userId !== userId) {
    // Проверяем роль пользователя
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "admin") {
      throw new Error("Forbidden");
    }
  }

  return db.lessonComment.update({
    where: { id: commentId },
    data: {
      isDeleted: true,
    },
  });
}

/**
 * Получает все комментарии (для админки) с пагинацией
 */
export async function getAllComments(
  page: number = 1,
  limit: number = 20,
  lessonId?: string
) {
  const skip = (page - 1) * limit;
  const where: any = {
    isDeleted: false,
    parentId: null,
  };

  if (lessonId) {
    where.lessonId = lessonId;
  }

  const [comments, total] = await Promise.all([
    db.lessonComment.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            module: {
              select: {
                course: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        },
        replies: {
          where: {
            isDeleted: false,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    db.lessonComment.count({ where }),
  ]);

  return {
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

