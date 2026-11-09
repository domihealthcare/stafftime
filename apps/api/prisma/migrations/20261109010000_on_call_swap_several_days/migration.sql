-- A swap can give (and take back) several on-call days at once.
ALTER TABLE "on_call_swaps" ADD COLUMN "giveDates" DATE[] NOT NULL DEFAULT ARRAY[]::DATE[];
ALTER TABLE "on_call_swaps" ADD COLUMN "takeDates" DATE[] NOT NULL DEFAULT ARRAY[]::DATE[];

UPDATE "on_call_swaps" SET "giveDates" = ARRAY["giveDate"];
UPDATE "on_call_swaps" SET "takeDates" = ARRAY["takeDate"] WHERE "takeDate" IS NOT NULL;
