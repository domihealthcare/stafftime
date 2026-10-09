-- News in Spanish (October 2026): a post's title and words in Spanish, and
-- whether the AI service made them rather than an admin.
ALTER TABLE "announcements" ADD COLUMN "titleEs" TEXT;
ALTER TABLE "announcements" ADD COLUMN "bodyEs" TEXT;
ALTER TABLE "announcements" ADD COLUMN "spanishByAi" BOOLEAN NOT NULL DEFAULT false;
