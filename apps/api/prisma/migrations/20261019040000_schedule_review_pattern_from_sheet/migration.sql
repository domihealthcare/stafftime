-- The usual who-reviews-which-provider pattern, worked out from the practice's
-- provider schedule (Domi Schedule NB & WNY 2026): on a weekday a provider
-- who is on telemedicine is reviewed by Kayla B, at North Bergen by Angelica
-- N, at West New York by Tatiyana R. Monday to Friday only: the Saturdays
-- change by the week of the month. Providers are matched by initials (JD, CI,
-- JB, DD, KH) among current providers, and people by name, each only when
-- exactly one fits; a provider who already has a pattern is left alone.
-- Check the Reviews screen on the live site.
CREATE FUNCTION pg_temp.one_person(first_name text, last_pattern text) RETURNS uuid AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg("id"))[1] END
  FROM "employees"
  WHERE "employmentStatus" <> 'TERMINATED'
    AND (lower("firstName") = first_name OR lower(coalesce("preferredName", '')) = first_name)
    AND lower("lastName") LIKE last_pattern
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.one_provider(initials text) RETURNS uuid AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(e."id"))[1] END
  FROM "employees" e
  WHERE e."employmentStatus" <> 'TERMINATED'
    AND lower(left(e."firstName", 1) || left(e."lastName", 1)) = lower(initials)
    AND EXISTS (
      SELECT 1 FROM "employee_job_roles" ejr
      JOIN "job_roles" jr ON jr."id" = ejr."jobRoleId"
      WHERE ejr."employeeId" = e."id" AND jr."usesClinicalForms"
    )
$$ LANGUAGE sql;

WITH sheet(initials, weekday, place) AS (VALUES
  ('JD', 1, 'NB'),   ('CI', 1, 'WNY'),  ('JB', 1, 'TELE'), ('DD', 1, 'TELE'), ('KH', 1, 'NB'),
  ('JD', 2, 'TELE'), ('CI', 2, 'NB'),   ('JB', 2, 'WNY'),  ('DD', 2, 'NB'),   ('KH', 2, 'TELE'),
  ('JD', 3, 'TELE'), ('CI', 3, 'TELE'), ('JB', 3, 'NB'),   ('DD', 3, 'NB'),   ('KH', 3, 'WNY'),
  ('JD', 4, 'NB'),   ('CI', 4, 'TELE'), ('JB', 4, 'WNY'),  ('DD', 4, 'TELE'), ('KH', 4, 'NB'),
  ('JD', 5, 'WNY'),  ('CI', 5, 'NB'),   ('JB', 5, 'TELE'), ('DD', 5, 'WNY'),  ('KH', 5, 'TELE')
), resolved AS (
  SELECT pg_temp.one_provider(initials) AS provider_id,
         weekday,
         CASE place
           WHEN 'TELE' THEN pg_temp.one_person('kayla', 'b%')
           WHEN 'NB' THEN pg_temp.one_person('angelica', 'notario')
           WHEN 'WNY' THEN pg_temp.one_person('tatiyana', 'r%')
         END AS reviewer_id
  FROM sheet
)
INSERT INTO "schedule_reviewers" ("providerId", "weekday", "reviewerId", "updatedAt")
SELECT provider_id, weekday, reviewer_id, now()
FROM resolved
WHERE provider_id IS NOT NULL
  AND reviewer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "schedule_reviewers" sr WHERE sr."providerId" = resolved.provider_id
  );

DROP FUNCTION pg_temp.one_provider(text);
DROP FUNCTION pg_temp.one_person(text, text);
