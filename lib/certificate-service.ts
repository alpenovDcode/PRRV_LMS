import { db } from "@/lib/db";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface GenerateCertificateParams {
  userId: string;
  courseId: string;
  templateId: string;
}

export async function generateCertificateNumber(courseSlug: string): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CERT-${courseSlug.toUpperCase()}-${timestamp}-${random}`;
}

export async function generateCertificate(params: GenerateCertificateParams) {
  const { userId, courseId, templateId } = params;

  // Check if certificate already exists
  const existing = await db.certificate.findFirst({
    where: {
      userId,
      courseId,
    },
  });

  if (existing) {
    return existing;
  }

  // Fetch user, course, and template
  const [user, course, template] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.course.findUnique({ where: { id: courseId } }),
    db.certificateTemplate.findUnique({ where: { id: templateId } }),
  ]);

  if (!user || !course || !template) {
    throw new Error("User, course, or template not found");
  }

  // Generate certificate number
  const certificateNumber = await generateCertificateNumber(course.slug);

  // For now, we'll use the template image as the PDF URL
  // In a full implementation, you would generate a PDF with overlaid text
  // using libraries like pdfkit or canvas
  const pdfUrl = template.imageUrl; // Temporary: use template image

  // Create certificate record
  const certificate = await db.certificate.create({
    data: {
      userId,
      courseId,
      templateId,
      certificateNumber,
      pdfUrl,
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
      template: true,
    },
  });

  return certificate;
}

export async function checkAndIssueCertificate(userId: string, courseId: string) {
  // Get course settings
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      autoIssueCertificate: true,
      certificateTemplateId: true,
    },
  });

  if (!course || !course.autoIssueCertificate || !course.certificateTemplateId) {
    return null; // Certificate auto-issuance not enabled
  }

  // Check if user has 100% progress
  const enrollment = await db.enrollment.findFirst({
    where: {
      userId,
      courseId,
    },
    select: {
      progress: true,
    },
  });

  if (!enrollment || enrollment.progress < 100) {
    return null; // User hasn't completed the course
  }

  // Check if certificate already issued
  const existing = await db.certificate.findFirst({
    where: {
      userId,
      courseId,
    },
  });

  if (existing) {
    return existing; // Already issued
  }

  // Generate and issue certificate
  return await generateCertificate({
    userId,
    courseId,
    templateId: course.certificateTemplateId,
  });
}
