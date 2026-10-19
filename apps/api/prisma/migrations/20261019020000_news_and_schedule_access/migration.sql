-- Administrative staff who are not admins (October 2026, Dominguez): post News
-- (pay period and schedule notices) and read everybody's published rota.
-- Two per-person switches an admin sets on the Staff editor. Angelica Notario
-- is switched on to start with, only when exactly one current member of staff
-- has that name, so check the Staff screen on the live site.
ALTER TABLE "employees" ADD COLUMN "canPostNews" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN "canSeeEveryonesSchedule" BOOLEAN NOT NULL DEFAULT false;

UPDATE "employees" SET "canPostNews" = true, "canSeeEveryonesSchedule" = true
WHERE "employmentStatus" <> 'TERMINATED'
  AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
  AND lower("lastName") = 'notario'
  AND (
    SELECT count(*) FROM "employees"
    WHERE "employmentStatus" <> 'TERMINATED'
      AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
      AND lower("lastName") = 'notario'
  ) = 1;
