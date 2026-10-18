-- The phone book gets several offices per entry and a star (October 2026,
-- Dominguez). Each entry's one address, phone and fax become its first office;
-- the entries loaded from the practice's document and not touched since
-- (nobody's name on them) are dropped here and read in again, richer, by the
-- next migration.

-- AlterTable
ALTER TABLE "referral_contacts" ADD COLUMN "preferred" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "referral_offices" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "label" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "referral_offices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_offices_contactId_sortOrder_idx" ON "referral_offices"("contactId", "sortOrder");

-- AddForeignKey
ALTER TABLE "referral_offices" ADD CONSTRAINT "referral_offices_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "referral_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The untouched entries from the document come out; staff's own stay.
DELETE FROM "referral_contacts" WHERE "updatedById" IS NULL;

-- What is left keeps its address, phone and fax as its first office.
INSERT INTO "referral_offices" ("id", "contactId", "address", "phone", "fax", "sortOrder")
SELECT gen_random_uuid(), "id", "address", "phone", "fax", 0
FROM "referral_contacts"
WHERE "address" IS NOT NULL OR "phone" IS NOT NULL OR "fax" IS NOT NULL;

-- AlterTable
ALTER TABLE "referral_contacts" DROP COLUMN "address", DROP COLUMN "phone", DROP COLUMN "fax";
