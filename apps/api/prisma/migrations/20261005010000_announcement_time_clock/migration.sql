-- News posts an admin has chosen to show on the front-desk time clock.
ALTER TABLE "announcements" ADD COLUMN "showOnTimeClock" BOOLEAN NOT NULL DEFAULT false;
