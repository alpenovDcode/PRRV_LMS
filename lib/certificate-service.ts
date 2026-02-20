import { db } from "@/lib/db";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
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
): Promise<{ url: string, logs: string[] }> {
  const logs: string[] = [];
  const log = (msg: string, data?: any) => {
      const entry = `[${new Date().toISOString()}] ${msg} ${data ? JSON.stringify(data, null, 2) : ''}`;
      console.log(entry);
      logs.push(entry);
  };

  try {
    // Resolve template image path
    // Assuming template.imageUrl starts with /uploads/
    const publicDir = join(process.cwd(), "public");
    const safeImageUrl = decodeURIComponent(template.imageUrl);
    const imagePath = join(publicDir, safeImageUrl);
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
    
    log(`STARTED PDF GENERATION for ${data.studentName}`);

    // Load custom fonts (Roboto) for Cyrillic support
    const fontPath = join(publicDir, "fonts", "Roboto-Regular.ttf");
    const fontBoldPath = join(publicDir, "fonts", "Roboto-Bold.ttf");

    log(`Loading fonts from ${fontPath}`);

    let customFont, customFontBold;
    try {
        const fontBytes = await readFile(fontPath);
        const fontBoldBytes = await readFile(fontBoldPath);
        
        // Debug: Log first 16 bytes to check header
        log(`Font Header (Regular): ${fontBytes.subarray(0, 16).toString('hex')}`);

        customFont = await pdfDoc.embedFont(fontBytes);
        customFontBold = await pdfDoc.embedFont(fontBoldBytes);
    } catch (fontError: any) {
        log(`Font loading failed: ${fontError.message}. Falling back to Helvetica (No Cyrillic support)`);
        customFont = await pdfDoc.embedFont("Helvetica");
        customFontBold = await pdfDoc.embedFont("Helvetica-Bold");
    }

    // Draw fields
    // fieldConfig structure: { fullName: { x, y, fontSize, color, ... }, ... }
    const config = template.fieldConfig as any;
    
    log(`Config keys: ${Object.keys(config).join(", ")}`);

    const drawField = (key: string, text: string, isBold = false) => {
      const field = config[key];
      
      const debugInfo = {
        key,
        text,
        fieldExists: !!field,
        fieldHidden: field?.hidden,
        fieldConfig: field
      };
      
      log(`Processing field ${key}:`, debugInfo);

      if (!field || field.hidden) {
         return;
      }

      const size = Number(field.fontSize) || 24;
      // Convert hex color to RGB
      const hex = field.color?.replace("#", "") || "000000";
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const color = rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);

      const fontToUse = isBold ? customFontBold : customFont;
      const textToDraw = text?.trim() ? text.trim() : " ";
      const textWidth = fontToUse.widthOfTextAtSize(textToDraw, size);
      
      let x = Number(field.x);
      // Adjust X based on alignment
      if (field.align === "center") {
        x = x - textWidth / 2;
      } else if (field.align === "right") {
        x = x - textWidth;
      }
      
      const fieldY = Number(field.y);
      // More accurate vertical centering accounting for ascenders and descenders
      const textHeight = fontToUse.heightAtSize(size);
      const y = height - fieldY - (textHeight / 2);

      page.drawText(textToDraw, {
        x,
        y,
        size,
        font: fontToUse,
        color,
      });
    };

    let studentName = data.studentName?.trim();
    if (!studentName) studentName = "Студент";

    drawField("fullName", studentName, true);

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    const outputDir = join(publicDir, "uploads", "certificates", "generated");
    await mkdir(outputDir, { recursive: true });
    
    const filename = `${data.certificateNumber}.pdf`;
    const outputPath = join(outputDir, filename);
    await writeFile(outputPath, pdfBytes);

    return { 
        url: `/uploads/certificates/generated/${filename}`,
        logs
    };
  } catch (error: any) {
    console.error("PDF Generation error:", error);
    // DO NOT Fallback. Throw error to make it visible.
    const combinedLog = logs.join('\n');
    throw new Error(`PDF Gen Failed: ${error.message}\nLogs:\n${combinedLog}`);
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
    include: { // Include relations for consistency if we return existing
        user: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true, slug: true } },
        template: true
    }
  });

  if (existing) {
    return { certificate: existing, logs: ["Certificate already exists"] };
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
  const { url: pdfUrl, logs } = await generateCertificatePdf(template, {
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

  return { certificate, logs };
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
  const { certificate } = await generateCertificate({
    userId,
    courseId,
    templateId: course.certificateTemplateId,
  });
  
  return certificate;
}
