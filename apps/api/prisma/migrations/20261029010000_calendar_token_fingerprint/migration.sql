-- Calendar links are kept as a one-way fingerprint, like sessions, reset
-- links and PINs, so a copy of the database cannot be used to read anybody's
-- schedule. The fingerprint is the SHA-256 of the token as hex, exactly what
-- the API's `hashToken` makes, so every phone already subscribed keeps
-- working: the feed now looks the incoming token up by its fingerprint.
--
-- Filled from the existing tokens here, in SQL, and the plain tokens emptied
-- in the same statement, so no plain token is left behind.
--
-- The emptied "calendarToken" column itself stays for now. Vercel runs this
-- migration while it builds, a few minutes before the new code goes live, and
-- the code still live meanwhile reads every employee with that column in it:
-- dropping it here would break sign-in and most screens until the new code
-- took over. A later release drops it (and fingerprints any token the old
-- code made in those few minutes first).
ALTER TABLE "employees" ADD COLUMN "calendarTokenHash" TEXT;

UPDATE "employees"
SET "calendarTokenHash" = encode(sha256(convert_to("calendarToken", 'UTF8')), 'hex'),
    "calendarToken" = NULL
WHERE "calendarToken" IS NOT NULL;

CREATE UNIQUE INDEX "employees_calendarTokenHash_key" ON "employees"("calendarTokenHash");
