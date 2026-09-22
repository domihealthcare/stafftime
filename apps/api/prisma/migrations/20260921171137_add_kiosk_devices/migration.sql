-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "pinUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" UUID NOT NULL,
    "tokenHash" TEXT,
    "pairingCodeHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_tokenHash_key" ON "kiosk_devices"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_pairingCodeHash_key" ON "kiosk_devices"("pairingCodeHash");

-- CreateIndex
CREATE INDEX "kiosk_devices_locationId_idx" ON "kiosk_devices"("locationId");

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
