-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "about" TEXT,
ADD COLUMN     "photoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "pronouns" TEXT;

-- CreateTable
CREATE TABLE "employee_photos" (
    "employeeId" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_photos_pkey" PRIMARY KEY ("employeeId")
);

-- AddForeignKey
ALTER TABLE "employee_photos" ADD CONSTRAINT "employee_photos_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

