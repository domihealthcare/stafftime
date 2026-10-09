-- "Ask Domi Staff" (October 2026, Dominguez): how many questions somebody
-- asked on a day, to keep the cost in hand. Counts only; no question or answer
-- is ever stored. Additive only: one new table the live version never reads.

-- CreateTable
CREATE TABLE "assistant_usage" (
    "employeeId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "questions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("employeeId","day")
);

-- AddForeignKey
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

