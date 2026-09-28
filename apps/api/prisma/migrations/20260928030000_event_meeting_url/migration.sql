-- A video call link on an event (September 2026): pasted from Google Meet, Zoom
-- or Teams. Nullable and additive: the version live before this never reads it.

-- AlterTable
ALTER TABLE "practice_events" ADD COLUMN     "meetingUrl" TEXT;

-- Only a web address that opens a page — never javascript: or the like.
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_meeting_url_check" CHECK (
  "meetingUrl" IS NULL OR "meetingUrl" ~ '^https://[^[:space:]]+$'
);
