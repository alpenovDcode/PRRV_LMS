import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { generateCertificate, sendCertificateEmail } from "@/lib/certificate-service";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const PROCESSING_TIMEOUT_MS = 15 * 60_000;
let lastReconciliationAt = 0;

type CertificationResult = {
  passed: boolean;
  score: number | null;
  total: number | null;
  percentage: number | null;
  passingScore: number | null;
};

export function evaluateCertificationResult(
  rawContent: string | null,
  passingScore: number | null
): CertificationResult {
  let score: number | null = null;
  let total: number | null = null;
  try {
    const parsed = rawContent ? JSON.parse(rawContent) : null;
    score = Number.isFinite(Number(parsed?._test_score)) ? Number(parsed._test_score) : null;
    total = Number.isFinite(Number(parsed?._test_total)) ? Number(parsed._test_total) : null;
  } catch {
    // Old certification submissions may contain plain text. They remain
    // eligible only when the lesson has no explicit passing score.
  }

  const percentage = score !== null && total !== null && total > 0 ? (score / total) * 100 : null;
  return {
    passed: passingScore === null ? true : percentage !== null && percentage >= passingScore,
    score,
    total,
    percentage,
    passingScore,
  };
}

export async function enqueueCertificateAfterCertification(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      type: true,
      quizPassingScore: true,
      module: {
        select: {
          course: {
            select: {
              id: true,
              autoIssueCertificate: true,
              certificateTemplateId: true,
            },
          },
        },
      },
    },
  });
  if (!lesson || lesson.type !== "certification_form")
    return { queued: false, reason: "not_certification" };

  const course = lesson.module.course;
  if (!course.autoIssueCertificate || !course.certificateTemplateId) {
    return { queued: false, reason: "auto_issue_disabled" };
  }

  const [progress, submission] = await Promise.all([
    db.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { status: true },
    }),
    db.homeworkSubmission.findFirst({
      where: { userId, lessonId },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    }),
  ]);
  if (progress?.status !== "completed" || !submission) {
    return { queued: false, reason: "certification_not_completed" };
  }

  const result = evaluateCertificationResult(submission.content, lesson.quizPassingScore);
  if (!result.passed) return { queued: false, reason: "passing_score_not_reached", result };

  const job = await db.certificateIssuanceJob.upsert({
    where: { userId_courseId: { userId, courseId: course.id } },
    create: {
      userId,
      courseId: course.id,
      certificationLessonId: lesson.id,
    },
    update: {},
  });

  if (job.status === "failed") {
    await db.certificateIssuanceJob.update({
      where: { id: job.id },
      data: {
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  return { queued: true, jobId: job.id, result };
}

async function reconcileMissingJobs() {
  const now = Date.now();
  if (now - lastReconciliationAt < 5 * 60_000) return 0;
  lastReconciliationAt = now;

  const completions = await db.$queryRaw<
    Array<{ userId: string; lessonId: string; courseId: string }>
  >(Prisma.sql`
    SELECT
      lp.user_id AS "userId",
      lp.lesson_id AS "lessonId",
      m.course_id AS "courseId"
    FROM lesson_progress lp
    JOIN lessons l ON l.id = lp.lesson_id
    JOIN modules m ON m.id = l.module_id
    JOIN courses c ON c.id = m.course_id
    LEFT JOIN certificate_issuance_jobs j
      ON j.user_id = lp.user_id AND j.course_id = m.course_id
    LEFT JOIN certificates cert
      ON cert.user_id = lp.user_id AND cert.course_id = m.course_id
    WHERE lp.status::text = 'completed'
      AND l.type::text = 'certification_form'
      AND c.auto_issue_certificate = true
      AND c.certificate_template_id IS NOT NULL
      AND j.id IS NULL
      AND cert.id IS NULL
    ORDER BY lp.completed_at DESC NULLS LAST
    LIMIT 200
  `);
  if (completions.length === 0) return 0;

  let enqueued = 0;
  const existing = new Set<string>();
  for (const completion of completions) {
    const key = `${completion.userId}:${completion.courseId}`;
    if (existing.has(key)) continue;
    const result = await enqueueCertificateAfterCertification(
      completion.userId,
      completion.lessonId
    );
    if (result.queued) {
      existing.add(key);
      enqueued += 1;
    }
  }
  return enqueued;
}

async function processJob(jobId: string) {
  const job = await db.certificateIssuanceJob.findUnique({ where: { id: jobId } });
  if (!job) return "missing" as const;

  try {
    const course = await db.course.findUnique({
      where: { id: job.courseId },
      select: { slug: true, autoIssueCertificate: true, certificateTemplateId: true },
    });
    if (!course?.autoIssueCertificate || !course.certificateTemplateId) {
      await db.certificateIssuanceJob.update({
        where: { id: job.id },
        data: { status: "cancelled", lockedAt: null, lastError: "Auto issuance is disabled" },
      });
      return "cancelled" as const;
    }

    const enrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: job.userId, courseId: job.courseId } },
      select: { status: true, expiresAt: true },
    });
    if (
      !enrollment ||
      enrollment.status !== "active" ||
      (enrollment.expiresAt && enrollment.expiresAt <= new Date())
    ) {
      throw new Error("Student does not have an active course enrollment");
    }

    const [certificationLesson, certificationProgress, certificationSubmission] = await Promise.all(
      [
        db.lesson.findUnique({
          where: { id: job.certificationLessonId },
          select: { type: true, quizPassingScore: true },
        }),
        db.lessonProgress.findUnique({
          where: {
            userId_lessonId: {
              userId: job.userId,
              lessonId: job.certificationLessonId,
            },
          },
          select: { status: true },
        }),
        db.homeworkSubmission.findFirst({
          where: { userId: job.userId, lessonId: job.certificationLessonId },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        }),
      ]
    );
    const certificationResult = evaluateCertificationResult(
      certificationSubmission?.content ?? null,
      certificationLesson?.quizPassingScore ?? null
    );
    if (
      certificationLesson?.type !== "certification_form" ||
      certificationProgress?.status !== "completed" ||
      !certificationSubmission ||
      !certificationResult.passed
    ) {
      await db.certificateIssuanceJob.update({
        where: { id: job.id },
        data: {
          status: "cancelled",
          lockedAt: null,
          lastError: "Certification is incomplete or does not meet the passing score",
        },
      });
      return "cancelled" as const;
    }

    const { certificate } = await generateCertificate({
      userId: job.userId,
      courseId: job.courseId,
      templateId: course.certificateTemplateId,
      emailDelivery: "skip",
    });
    if (!job.emailSentAt) {
      await sendCertificateEmail(certificate);
      await db.certificateIssuanceJob.update({
        where: { id: job.id },
        data: { emailSentAt: new Date() },
      });
    }

    await db.$transaction([
      db.certificateIssuanceJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          certificateId: certificate.id,
          lockedAt: null,
          lastError: null,
        },
      }),
      db.notification.upsert({
        where: {
          userId_eventKey: {
            userId: job.userId,
            eventKey: `certificate-issued:${job.courseId}`,
          },
        },
        create: {
          userId: job.userId,
          eventKey: `certificate-issued:${job.courseId}`,
          type: "certificate_issued",
          title: "Сертификат готов",
          message: "Ваш сертификат сформирован и доступен для скачивания.",
          link: "/certificates",
        },
        update: {},
      }),
    ]);
    return "completed" as const;
  } catch (error) {
    const attempts = job.attempts + 1;
    const permanentlyFailed = attempts >= MAX_ATTEMPTS;
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    await db.certificateIssuanceJob.update({
      where: { id: job.id },
      data: {
        status: permanentlyFailed ? "failed" : "retrying",
        attempts,
        nextAttemptAt: new Date(Date.now() + delay),
        lockedAt: null,
        lastError:
          error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000),
      },
    });
    console.error(`[certificate-queue] Job ${job.id} failed`, error);
    return permanentlyFailed ? ("failed" as const) : ("retrying" as const);
  }
}

export async function processCertificateIssuanceJobs(limit = 2) {
  const reconciled = await reconcileMissingJobs();
  const now = new Date();
  await db.certificateIssuanceJob.updateMany({
    where: {
      status: "processing",
      lockedAt: { lt: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) },
    },
    data: { status: "retrying", lockedAt: null, nextAttemptAt: now },
  });

  const dueJobs = await db.certificateIssuanceJob.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit * 3,
  });

  const result = {
    reconciled,
    claimed: 0,
    completed: 0,
    retrying: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const candidate of dueJobs) {
    if (result.claimed >= limit) break;
    const claim = await db.certificateIssuanceJob.updateMany({
      where: {
        id: candidate.id,
        status: { in: ["pending", "retrying"] },
        nextAttemptAt: { lte: now },
      },
      data: { status: "processing", lockedAt: new Date() },
    });
    if (claim.count !== 1) continue;
    result.claimed += 1;
    const status = await processJob(candidate.id);
    if (status === "completed") result.completed += 1;
    if (status === "retrying") result.retrying += 1;
    if (status === "failed") result.failed += 1;
    if (status === "cancelled") result.cancelled += 1;
  }
  return result;
}
