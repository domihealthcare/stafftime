-- AlterTable
ALTER TABLE "kiosk_devices" ADD COLUMN     "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinFailuresSince" TIMESTAMP(3),
ADD COLUMN     "pinPausedUntil" TIMESTAMP(3);

