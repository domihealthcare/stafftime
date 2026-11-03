-- Students and residents on rotation with a provider (3 November 2026,
-- Dominguez: "we have students/residents who do rotations at our office(s)
-- with specific providers"). Names only: no account, no contact details, no
-- date of birth, no paperwork.
CREATE TYPE "StudentKind" AS ENUM ('MEDICAL_STUDENT', 'RESIDENT', 'NP_STUDENT', 'PA_STUDENT', 'NURSING_STUDENT', 'OTHER');

CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StudentKind" NOT NULL DEFAULT 'MEDICAL_STUDENT',
    "school" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- A rotation date names the student and the provider they are with.
ALTER TABLE "practice_events" ADD COLUMN "studentId" UUID;
ALTER TABLE "practice_events" ADD COLUMN "providerId" UUID;

ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
