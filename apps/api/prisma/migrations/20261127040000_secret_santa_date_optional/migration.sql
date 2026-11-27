-- The day of a Secret Santa can be left to decide while people sign up
-- (27 November 2026, Dominguez: "the date should be left optional initially
-- but has to be put to close the drawing"). The draw refuses without it.

-- AlterTable
ALTER TABLE "secret_santas" ALTER COLUMN "exchangeOn" DROP NOT NULL;

