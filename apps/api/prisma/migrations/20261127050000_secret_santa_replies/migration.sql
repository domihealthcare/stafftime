-- Answers to the Secret Santa invitation shown on signing in (27 November
-- 2026, Dominguez): join or not, and why, if they say.

-- CreateEnum
CREATE TYPE "SecretSantaAnswer" AS ENUM ('JOIN', 'DECLINE');

-- CreateTable
CREATE TABLE "secret_santa_replies" (
    "exchangeId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "answer" "SecretSantaAnswer" NOT NULL,
    "reason" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_santa_replies_pkey" PRIMARY KEY ("exchangeId","employeeId")
);

-- AddForeignKey
ALTER TABLE "secret_santa_replies" ADD CONSTRAINT "secret_santa_replies_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "secret_santas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santa_replies" ADD CONSTRAINT "secret_santa_replies_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

