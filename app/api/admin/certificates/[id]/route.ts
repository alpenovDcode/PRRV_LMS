import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id } = await params;

        const certificate = await db.certificate.findUnique({
          where: { id },
        });

        if (!certificate) {
          return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
        }

        if (certificate.pdfUrl) {
          await deleteFile(certificate.pdfUrl);
        }

        await db.certificate.delete({
          where: { id },
        });

        return NextResponse.json({ success: true });
      } catch (error) {
        console.error("Error deleting certificate:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
