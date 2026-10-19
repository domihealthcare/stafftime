-- Resources beside providers in Schedule Reviews (October 2026, Dominguez:
-- "include the resources, i.e. NB BW, NB Nurse, WNY BW, WNY Nurse"). A group
-- can be marked as a resource, which puts it on each day of the Reviews week.
-- The bloodwork-and-nursing group is split in two and WNY ALL into its
-- providers, bloodwork and nursing, each with the reviewer the group had.
-- Only groups still under their starting names are touched.
ALTER TABLE "schedule_review_areas" ADD COLUMN "forResources" BOOLEAN NOT NULL DEFAULT false;

UPDATE "schedule_review_areas" SET "name" = 'NB BW', "forResources" = true, "sortOrder" = 4, "updatedAt" = now()
WHERE "name" = 'NB Bloodwork & Nursing';
UPDATE "schedule_review_areas" SET "name" = 'WNY Providers', "sortOrder" = 3, "updatedAt" = now()
WHERE "name" = 'WNY ALL';
UPDATE "schedule_review_areas" SET "sortOrder" = 2 WHERE "name" = 'NB Providers';

INSERT INTO "schedule_review_areas" ("id", "name", "sortOrder", "forResources", "reviewerId", "updatedAt")
SELECT v.id::uuid, v.name, v.sort_order, true,
       (SELECT "reviewerId" FROM "schedule_review_areas" WHERE "name" = v.copy_from LIMIT 1), now()
FROM (VALUES
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1005', 'NB Nurse', 5, 'NB BW'),
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1006', 'WNY BW', 6, 'WNY Providers'),
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1007', 'WNY Nurse', 7, 'WNY Providers')
) AS v(id, name, sort_order, copy_from)
WHERE EXISTS (SELECT 1 FROM "schedule_review_areas" WHERE "name" = v.copy_from)
  AND NOT EXISTS (SELECT 1 FROM "schedule_review_areas" WHERE "name" = v.name);
