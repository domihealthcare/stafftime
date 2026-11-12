-- Who the writer of a pay note asked to read it, and when they did
-- (November 2026).
CREATE TABLE "pay_note_recipients" (
    "noteId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "toldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "pay_note_recipients_pkey" PRIMARY KEY ("noteId", "employeeId")
);

CREATE INDEX "pay_note_recipients_employeeId_readAt_idx" ON "pay_note_recipients"("employeeId", "readAt");

ALTER TABLE "pay_note_recipients" ADD CONSTRAINT "pay_note_recipients_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "pay_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_note_recipients" ADD CONSTRAINT "pay_note_recipients_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
