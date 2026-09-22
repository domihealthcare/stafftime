-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "calendarToken" TEXT,
ADD COLUMN     "calendarTokenSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "employees_calendarToken_key" ON "employees"("calendarToken");

