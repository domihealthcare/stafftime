-- The number the after-hours line rings for somebody when they are on call,
-- if not their Directory phone (7 November 2026, Dominguez: "providers should
-- be able to change the number they use for their on call ... this should be
-- in their profile"). Never shown in the Directory.
ALTER TABLE "employees" ADD COLUMN "onCallPhone" TEXT;
