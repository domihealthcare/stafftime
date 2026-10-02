-- Clocking in somewhere other than the shift (October 2026, Dominguez): any of
-- your offices, or from home with no work-from-home shift, after a warning and
-- with an optional reason. Additive: two columns the version live before this
-- never reads; every existing punch is "where scheduled".

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "isOtherPlace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otherPlaceReason" TEXT;
