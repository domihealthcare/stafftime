-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "birthdayDay" INTEGER,
ADD COLUMN     "birthdayMonth" INTEGER;


-- Both or neither, and a real month and day. The year is never stored.
ALTER TABLE "employees" ADD CONSTRAINT "employees_birthday_check" CHECK (
  ("birthdayMonth" IS NULL AND "birthdayDay" IS NULL)
  OR ("birthdayMonth" BETWEEN 1 AND 12 AND "birthdayDay" BETWEEN 1 AND 31)
);
