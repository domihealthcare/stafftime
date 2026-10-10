-- Rota cost (October 2026, Dominguez: "only for certain individuals (i.e.
-- kayla, angelica, and myself jonathan dominguez)"). Chosen by an admin in
-- Practice settings; these three are put on the list to start with — Kayla
-- and Angelica by name, only when exactly one current member of staff has
-- that name, so check the list on the live site.
ALTER TABLE "employees" ADD COLUMN "canSeeRotaCost" BOOLEAN NOT NULL DEFAULT false;

UPDATE "employees" SET "canSeeRotaCost" = true
WHERE lower("email") = 'dominguez@domihealthcare.com';

UPDATE "employees" SET "canSeeRotaCost" = true
WHERE "employmentStatus" <> 'TERMINATED'
  AND (lower("firstName") = 'kayla' OR lower(coalesce("preferredName", '')) = 'kayla')
  AND (
    SELECT count(*) FROM "employees"
    WHERE "employmentStatus" <> 'TERMINATED'
      AND (lower("firstName") = 'kayla' OR lower(coalesce("preferredName", '')) = 'kayla')
  ) = 1;

UPDATE "employees" SET "canSeeRotaCost" = true
WHERE "employmentStatus" <> 'TERMINATED'
  AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
  AND lower("lastName") = 'dominguez'
  AND (
    SELECT count(*) FROM "employees"
    WHERE "employmentStatus" <> 'TERMINATED'
      AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
      AND lower("lastName") = 'dominguez'
  ) = 1;
