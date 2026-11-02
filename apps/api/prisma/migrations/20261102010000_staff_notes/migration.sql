-- Confidential notes on staff (2 November 2026): managers and admins only,
-- never the person they are about.
CREATE TYPE "StaffNoteKind" AS ENUM ('PRAISE', 'CONCERN', 'ATTENDANCE', 'CONDUCT', 'PERFORMANCE', 'MEETING', 'OTHER');

CREATE TABLE "staff_notes" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "authorId" UUID,
    "kind" "StaffNoteKind",
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "staff_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_notes_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000)
);

CREATE INDEX "staff_notes_employeeId_createdAt_idx" ON "staff_notes"("employeeId", "createdAt");
CREATE INDEX "staff_notes_createdAt_idx" ON "staff_notes"("createdAt");

ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
