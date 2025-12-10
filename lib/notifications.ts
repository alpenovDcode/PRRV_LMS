import { db } from "./db";
import { UserRole } from "@prisma/client";

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  try {
    await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        link,
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

export async function notifyHomeworkSubmitted(
  lessonTitle: string,
  studentName: string,
  submissionId: string
) {
  // Notify admins and curators
  // In a real app, you might want to filter by course assignment
  const curators = await db.user.findMany({
    where: {
      role: { in: [UserRole.admin, UserRole.curator] },
    },
  });

  for (const curator of curators) {
    await createNotification(
      curator.id,
      "homework_submission",
      "Новое домашнее задание",
      `Студент ${studentName} сдал задание к уроку "${lessonTitle}"`,
      `/curator/homework/${submissionId}`
    );
  }
}

export async function notifyHomeworkReviewed(
  userId: string,
  lessonTitle: string,
  status: "approved" | "rejected"
) {
  const title = status === "approved" ? "Задание принято" : "Задание возвращено";
  const message =
    status === "approved"
      ? `Ваше задание к уроку "${lessonTitle}" принято!`
      : `Ваше задание к уроку "${lessonTitle}" требует доработки.`;

  await createNotification(
    userId,
    "homework_review",
    title,
    message,
    // Link to the lesson page would be ideal, but we need slug and lessonId.
    // For now, we can link to the course list or dashboard.
    "/dashboard" 
  );
}
