-- The referral phone book (October 2026): where patients are sent and the
-- numbers to do it with. Places only, never a patient.
-- CreateTable
CREATE TABLE "referral_contacts" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "fax" TEXT,
    "address" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_contacts_category_name_idx" ON "referral_contacts"("category", "name");
