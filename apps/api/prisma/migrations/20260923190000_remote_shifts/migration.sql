-- AlterEnum
ALTER TYPE "VerificationMethod" ADD VALUE 'REMOTE';

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "isRemote" BOOLEAN NOT NULL DEFAULT false;

