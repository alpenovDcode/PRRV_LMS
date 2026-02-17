import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

// GET /api/certificates/verify/[number] - Public certificate verification
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params;

    const certificate = await db.certificate.findUnique({
      where: { certificateNumber: number },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
        course: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!certificate) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Сертификат не найден",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          certificateNumber: certificate.certificateNumber,
          studentName: certificate.user.fullName,
          courseName: certificate.course.title,
          issuedAt: certificate.issuedAt,
          pdfUrl: certificate.pdfUrl,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Verify certificate error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "VERIFICATION_ERROR",
          message: "Ошибка при проверке сертификата",
        },
      },
      { status: 500 }
    );
  }
}
