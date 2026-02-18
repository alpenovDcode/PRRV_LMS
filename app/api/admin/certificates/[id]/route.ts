import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { unlink } from "fs/promises";
import { join } from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = params;

        const certificate = await db.certificate.findUnique({
          where: { id },
        });

        if (!certificate) {
          return NextResponse.json(
            { error: "Certificate not found" },
            { status: 404 }
          );
        }

        // Try to delete the file
        if (certificate.pdfUrl) {
           // pdfUrl usually starts with "/uploads/..."
           const relativePath = certificate.pdfUrl.startsWith("/")
             ? certificate.pdfUrl.slice(1)
             : certificate.pdfUrl;
             
           const filePath = join(process.cwd(), "public", relativePath);
           try {
             await unlink(filePath);
             console.log(`Deleted certificate file: ${filePath}`);
           } catch (e) {
             console.error("Failed to delete certificate file:", e);
             // Continue deleting the record even if file deletion fails
           }
        }

        await db.certificate.delete({
          where: { id },
        });

        return NextResponse.json({ success: true });
      } catch (error) {
        console.error("Error deleting certificate:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
