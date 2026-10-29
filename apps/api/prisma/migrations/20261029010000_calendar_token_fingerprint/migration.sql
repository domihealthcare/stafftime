-- Calendar links are kept as a one-way fingerprint, like sessions, reset
-- links and PINs, so a copy of the database cannot be used to read anybody's
-- schedule. The fingerprint is the SHA-256 of the token as hex, exactly what
-- the API's `hashToken` makes, so every phone already subscribed keeps
-- working: the feed now looks the incoming token up by its fingerprint.
--
-- Filled from the existing tokens here, in SQL, and the plain column dropped
-- in the same migration, so no plain token is left behind.
ALTER TABLE "employees" ADD COLUMN "calendarTokenHash" TEXT;

UPDATE "employees"
SET "calendarTokenHash" = encode(sha256(convert_to("calendarToken", 'UTF8')), 'hex')
WHERE "calendarToken" IS NOT NULL;

DROP INDEX "employees_calendarToken_key";

ALTER TABLE "employees" DROP COLUMN "calendarToken";

CREATE UNIQUE INDEX "employees_calendarTokenHash_key" ON "employees"("calendarTokenHash");
