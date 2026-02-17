-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "auto_issue_certificate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificate_template_id" TEXT;

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" TEXT NOT NULL,
    "course_id" TEXT,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "field_config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "pdf_url" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_templates_course_id_idx" ON "certificate_templates"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_number_key" ON "certificates"("certificate_number");

-- CreateIndex
CREATE INDEX "certificates_user_id_idx" ON "certificates"("user_id");

-- CreateIndex
CREATE INDEX "certificates_course_id_idx" ON "certificates"("course_id");

-- CreateIndex
CREATE INDEX "certificates_certificate_number_idx" ON "certificates"("certificate_number");

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
