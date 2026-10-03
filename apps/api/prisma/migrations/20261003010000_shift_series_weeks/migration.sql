-- Repeating shifts can be on certain weeks as well as certain days: every
-- other week, or the first Saturday of the month. Additive with defaults, so
-- every regular shift already running stays every week, as it was.
ALTER TABLE "shift_series" ADD COLUMN "everyWeeks" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "shift_series" ADD COLUMN "weeksOfMonth" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "shift_series" ADD COLUMN "cycleFrom" DATE;
