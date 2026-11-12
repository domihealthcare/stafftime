-- Notes on somebody's pay (November 2026): on Pay & raises, for the
-- rota-cost people only, behind the PIN.
CREATE TABLE "pay_notes" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "authorId" UUID,
    "notedOn" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "pay_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_notes_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000)
);

CREATE INDEX "pay_notes_employeeId_notedOn_idx" ON "pay_notes"("employeeId", "notedOn");

ALTER TABLE "pay_notes" ADD CONSTRAINT "pay_notes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_notes" ADD CONSTRAINT "pay_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
