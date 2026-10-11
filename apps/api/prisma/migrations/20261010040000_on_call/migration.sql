-- The provider on-call schedule (October 2026): a usual pattern by weekday,
-- days changed or swapped, and swaps between providers.
-- CreateEnum
CREATE TYPE "OnCallSwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'ON_CALL';

-- CreateTable
CREATE TABLE "on_call_rotas" (
    "id" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "changesAt" TEXT NOT NULL DEFAULT '12:00',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "on_call_rotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_call_rota_entries" (
    "id" UUID NOT NULL,
    "rotaId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "weekOfMonth" INTEGER NOT NULL DEFAULT 0,
    "employeeId" UUID NOT NULL,

    CONSTRAINT "on_call_rota_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_call_days" (
    "date" DATE NOT NULL,
    "employeeId" UUID NOT NULL,
    "note" TEXT,
    "swapId" UUID,
    "setById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "on_call_days_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "on_call_swaps" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "giveDate" DATE NOT NULL,
    "takeDate" DATE,
    "note" TEXT,
    "status" "OnCallSwapStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "on_call_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "on_call_rotas_startsOn_key" ON "on_call_rotas"("startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "on_call_rota_entries_rotaId_weekday_weekOfMonth_key" ON "on_call_rota_entries"("rotaId", "weekday", "weekOfMonth");

-- CreateIndex
CREATE INDEX "on_call_swaps_partnerId_status_idx" ON "on_call_swaps"("partnerId", "status");

-- CreateIndex
CREATE INDEX "on_call_swaps_requesterId_status_idx" ON "on_call_swaps"("requesterId", "status");

-- AddForeignKey
ALTER TABLE "on_call_rotas" ADD CONSTRAINT "on_call_rotas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_rota_entries" ADD CONSTRAINT "on_call_rota_entries_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "on_call_rotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_rota_entries" ADD CONSTRAINT "on_call_rota_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_days" ADD CONSTRAINT "on_call_days_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_days" ADD CONSTRAINT "on_call_days_setById_fkey" FOREIGN KEY ("setById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_days" ADD CONSTRAINT "on_call_days_swapId_fkey" FOREIGN KEY ("swapId") REFERENCES "on_call_swaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_swaps" ADD CONSTRAINT "on_call_swaps_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_swaps" ADD CONSTRAINT "on_call_swaps_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The pattern as Dominguez described it (October 2026): Dr. Jonathan
-- Dominguez on call Monday, Tuesday, Wednesday and Friday and every weekend
-- except the 4th; Dr. Jose Badia on Thursdays and the 4th weekend. Loaded only
-- when both are found (Dr. Badia by name, only if exactly one current member
-- of staff has it), from 1 October 2026. Managers change it in the app.
WITH dominguez AS (
  SELECT "id" FROM "employees"
  WHERE lower("email") = 'dominguez@domihealthcare.com' AND "employmentStatus" <> 'TERMINATED'
),
badia AS (
  SELECT "id" FROM "employees"
  WHERE lower("lastName") = 'badia'
    AND (lower("firstName") = 'jose' OR lower("firstName") = 'josé' OR lower(coalesce("preferredName", '')) = 'jose')
    AND "employmentStatus" <> 'TERMINATED'
),
ready AS (
  SELECT (SELECT count(*) FROM dominguez) = 1 AND (SELECT count(*) FROM badia) = 1 AS ok
),
rota AS (
  INSERT INTO "on_call_rotas" ("id", "startsOn", "changesAt")
  SELECT gen_random_uuid(), DATE '2026-10-01', '12:00' FROM ready WHERE ok
  RETURNING "id"
)
INSERT INTO "on_call_rota_entries" ("id", "rotaId", "weekday", "weekOfMonth", "employeeId")
SELECT gen_random_uuid(), rota."id", entry.weekday, entry.week,
       CASE WHEN entry.who = 'D' THEN (SELECT "id" FROM dominguez) ELSE (SELECT "id" FROM badia) END
FROM rota,
     (VALUES (1, 0, 'D'), (2, 0, 'D'), (3, 0, 'D'), (4, 0, 'B'), (5, 0, 'D'),
             (6, 0, 'D'), (7, 0, 'D'), (6, 4, 'B'), (7, 4, 'B')) AS entry(weekday, week, who);
