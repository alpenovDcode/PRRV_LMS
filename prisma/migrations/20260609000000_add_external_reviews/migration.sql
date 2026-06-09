-- CreateTable
CREATE TABLE "external_reviews" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "author" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_reviews_source_idx" ON "external_reviews"("source");

-- CreateIndex
CREATE INDEX "external_reviews_published_at_idx" ON "external_reviews"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_reviews_source_external_id_key" ON "external_reviews"("source", "external_id");
