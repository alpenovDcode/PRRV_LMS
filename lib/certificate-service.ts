import { db } from "@/lib/db";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "fontkit";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

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

async function generateCertificatePdf(
  template: any,
  data: {
    studentName: string;
    courseName: string;
    date: Date;
    certificateNumber: string;
  }
): Promise<string> {
  try {
    // Resolve template image path
    // Assuming template.imageUrl starts with /uploads/
    const publicDir = join(process.cwd(), "public");
    const imagePath = join(publicDir, template.imageUrl);
    const imageBytes = await readFile(imagePath);

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    
    // Register fontkit
    pdfDoc.registerFontkit(fontkit);
    
    // Embed image
    let image;
    if (template.imageUrl.toLowerCase().endsWith(".png")) {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      image = await pdfDoc.embedJpg(imageBytes);
    }

    const { width, height } = image.scale(1);
    const page = pdfDoc.addPage([width, height]);
    
    // Draw background
    page.drawImage(image, {
      x: 0,
      y: 0,
      width,
      height,
    });

    // Load custom fonts (Roboto) for Cyrillic support
    const fontPath = join(publicDir, "fonts", "Roboto-Regular.ttf");
    const fontBoldPath = join(publicDir, "fonts", "Roboto-Bold.ttf");
    
    const fontBytes = await readFile(fontPath);
    const fontBoldBytes = await readFile(fontBoldPath);

    const customFont = await pdfDoc.embedFont(fontBytes);
    const customFontBold = await pdfDoc.embedFont(fontBoldBytes);

    // Draw fields
    // fieldConfig structure: { fullName: { x, y, fontSize, color, ... }, ... }
    const config = template.fieldConfig as any;

    const drawField = (key: string, text: string, isBold = false) => {
      const field = config[key];
      if (!field || field.hidden) return;

      const size = field.fontSize || 24;
      // Convert hex color to RGB
      const hex = field.color.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const color = rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);

      const fontToUse = isBold ? customFontBold : customFont;
      const textWidth = fontToUse.widthOfTextAtSize(text, size);
      
      let x = field.x;
      // Adjust X based on alignment
      if (field.align === "center") {
        x = field.x - textWidth / 2;
      } else if (field.align === "right") {
        x = field.x - textWidth;
      }
      
      const y = height - field.y - (size / 2); // Approximating vertical center

      page.drawText(text, {
        x,
        y,
        size,
        font: fontToUse,
        color,
      });
    };

    drawField("fullName", data.studentName, true);
    drawField("courseName", data.courseName);
    
    const dateStr = format(data.date, (config.date?.format || "dd.MM.yyyy"), { locale: ru });
    drawField("date", dateStr);
    
    drawField("certificateNumber", data.certificateNumber);

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    const outputDir = join(publicDir, "uploads", "certificates", "generated");
    await mkdir(outputDir, { recursive: true });
    
    const filename = `${data.certificateNumber}.pdf`;
    const outputPath = join(outputDir, filename);
    await writeFile(outputPath, pdfBytes);

    return `/uploads/certificates/generated/${filename}`;
  } catch (error) {
    console.error("PDF Generation error:", error);
    // Fallback to template image if generation fails
    return template.imageUrl;
  }
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

  // Generate PDF
  const pdfUrl = await generateCertificatePdf(template, {
    studentName: user.fullName || "Студент",
    courseName: course.title,
    date: new Date(),
    certificateNumber,
  });

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
      title: true,
      autoIssueCertificate: true,
      certificateTemplateId: true,
    },
  });

  if (!course || !course.autoIssueCertificate || !course.certificateTemplateId) {
    return null; // Certificate auto-issuance not enabled
  }

  // Check if enrollment exists
  const enrollment = await db.enrollment.findFirst({
    where: {
      userId,
      courseId,
      status: "active",
    },
  });

  if (!enrollment) {
    return null; // User not enrolled
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

  // Check progress
  // 1. Get total published lessons
  const totalLessons = await db.lesson.count({
    where: {
      module: {
        courseId,
      },
    },
  });

  if (totalLessons === 0) {
    return null;
  }

  // 2. Get completed lessons for user
  const completedLessons = await db.lessonProgress.count({
    where: {
      userId,
      lesson: {
        module: {
          courseId,
        },
      },
      status: "completed",
    },
  });

  if (completedLessons < totalLessons) {
    return null; // Not all lessons completed
  }

  // Generate and issue certificate
  return await generateCertificate({
    userId,
    courseId,
    templateId: course.certificateTemplateId,
  });
}
