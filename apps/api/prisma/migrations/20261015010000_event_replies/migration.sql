-- Replies to meetings (October 2026, Dominguez): going, can't go or maybe,
-- one answer per person per date, seen by everybody the meeting is for.

-- CreateEnum
CREATE TYPE "EventReplyAnswer" AS ENUM ('GOING', 'NOT_GOING', 'MAYBE');

-- CreateTable
CREATE TABLE "practice_event_replies" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "answer" "EventReplyAnswer" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_event_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_event_replies_employeeId_idx" ON "practice_event_replies"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "practice_event_replies_eventId_employeeId_key" ON "practice_event_replies"("eventId", "employeeId");

-- AddForeignKey
ALTER TABLE "practice_event_replies" ADD CONSTRAINT "practice_event_replies_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "practice_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_event_replies" ADD CONSTRAINT "practice_event_replies_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
