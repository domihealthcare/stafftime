-- The last step in keeping calendar links only as a fingerprint (version
-- 1.31.2). 20261029010000_calendar_token_fingerprint fingerprinted every
-- link and emptied the plain "calendarToken" column but kept it, because the
-- code still live while Vercel builds read it; version 1.31.1 stopped the
-- app reading it. That code is the one live now, so the column can go.
--
-- First, any plain code left in it is fingerprinted, so that link keeps
-- working. Only the code the 1.30.0 server could have made in the few minutes
-- the 1.31.0 deploy took can be there, and only for somebody with no
-- fingerprint yet: where both are set, which of the two is newer cannot be
-- told, so the fingerprint (what the app has used since) stays, and the
-- person makes a new link if their old one stops updating.
UPDATE "employees"
SET "calendarTokenHash" = encode(sha256(convert_to("calendarToken", 'UTF8')), 'hex')
WHERE "calendarToken" IS NOT NULL AND "calendarTokenHash" IS NULL;

DROP INDEX IF EXISTS "employees_calendarToken_key";

ALTER TABLE "employees" DROP COLUMN IF EXISTS "calendarToken";
