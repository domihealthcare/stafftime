-- Looking up who one person drew in a Secret Santa, in an emergency (27
-- November 2026, Dominguez). Who looked, whose, when; never the answer.

-- CreateTable
CREATE TABLE "secret_santa_lookups" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "lookedUpById" UUID,
    "employeeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_santa_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "secret_santa_lookups_exchangeId_createdAt_idx" ON "secret_santa_lookups"("exchangeId", "createdAt");

-- AddForeignKey
ALTER TABLE "secret_santa_lookups" ADD CONSTRAINT "secret_santa_lookups_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "secret_santas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santa_lookups" ADD CONSTRAINT "secret_santa_lookups_lookedUpById_fkey" FOREIGN KEY ("lookedUpById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santa_lookups" ADD CONSTRAINT "secret_santa_lookups_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

