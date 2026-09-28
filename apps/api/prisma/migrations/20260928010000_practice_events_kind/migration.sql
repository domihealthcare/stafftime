-- Repair: the closure "kind" for practice events.
--
-- 20260927120000_practice_events reached the live database from a preview
-- build before closures were folded into it, so the database recorded it as
-- applied without the kind column, its enum, its index or its check — and
-- `migrate deploy` never runs an applied migration twice. Every read of an
-- event asked for the missing column and failed.
--
-- Each step checks first, so on a database that already has them (any set
-- up from scratch, CI included) this changes nothing. An applied migration
-- is never edited again; a change is always a new migration.

DO $$ BEGIN
  CREATE TYPE "PracticeEventKind" AS ENUM ('EVENT', 'CLOSURE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "practice_events" ADD COLUMN IF NOT EXISTS "kind" "PracticeEventKind" NOT NULL DEFAULT 'EVENT';

CREATE INDEX IF NOT EXISTS "practice_events_kind_startsAt_idx" ON "practice_events"("kind", "startsAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practice_events_closure_check'
  ) THEN
    ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_closure_check" CHECK (
      "kind" = 'EVENT' OR "audience" IN ('EVERYONE', 'LOCATION')
    );
  END IF;
END $$;
