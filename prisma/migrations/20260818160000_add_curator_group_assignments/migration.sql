CREATE TABLE "curator_group_assignments" (
    "id" TEXT NOT NULL,
    "curator_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "curator_group_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "curator_group_assignments_curator_id_group_id_key"
ON "curator_group_assignments"("curator_id", "group_id");
CREATE INDEX "curator_group_assignments_curator_id_is_active_idx"
ON "curator_group_assignments"("curator_id", "is_active");
CREATE INDEX "curator_group_assignments_group_id_is_active_idx"
ON "curator_group_assignments"("group_id", "is_active");

ALTER TABLE "curator_group_assignments"
ADD CONSTRAINT "curator_group_assignments_curator_id_fkey"
FOREIGN KEY ("curator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curator_group_assignments"
ADD CONSTRAINT "curator_group_assignments_assigned_by_id_fkey"
FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curator_group_assignments"
ADD CONSTRAINT "curator_group_assignments_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
