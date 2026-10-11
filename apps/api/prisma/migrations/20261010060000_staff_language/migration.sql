-- Spanish for the staff screens (October 2026): the language each person
-- chose. English unless they pick Español.
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';
