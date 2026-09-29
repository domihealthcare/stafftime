-- Hours entered by hand (September 2026, Dominguez): a manager adds a day
-- that has no punch at all, with a reason, and every one is listed until
-- somebody has looked into why it was needed. Additive: new nullable columns
-- and a new type, which the version live before this never reads.

-- CreateEnum
CREATE TYPE "HandEntryReason" AS ENUM ('FORGOT', 'APP_REFUSED', 'NO_LOCATION_SHARING', 'NO_PHONE', 'OTHER');

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "enteredByHandAt" TIMESTAMP(3),
ADD COLUMN     "enteredById" UUID,
ADD COLUMN     "handEntryCheckedAt" TIMESTAMP(3),
ADD COLUMN     "handEntryCheckedById" UUID,
ADD COLUMN     "handEntryFinding" TEXT,
ADD COLUMN     "handEntryNote" TEXT,
ADD COLUMN     "handEntryReason" "HandEntryReason";

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_handEntryCheckedById_fkey" FOREIGN KEY ("handEntryCheckedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A hand entry always says why; nothing else ever has a reason.
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_hand_entry_reason_check"
  CHECK (("enteredByHandAt" IS NULL) = ("handEntryReason" IS NULL));
