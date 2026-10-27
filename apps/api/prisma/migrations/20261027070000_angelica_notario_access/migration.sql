-- Angelica Notario still could not post News or see everybody's schedule
-- (staff feedback, 27 October 2026). 20261019020000_news_and_schedule_access
-- switched her on only when a current member of staff was named exactly
-- "Angelica" "Notario", so her record must be written another way (an accent,
-- a second surname, a space). This matches more loosely: a last name or work
-- email containing "notario" and a first or preferred name starting "ang",
-- or a work email starting "anotario". Still only when exactly one current
-- person fits; otherwise an admin ticks "Can post News" and "Can see
-- everyone's schedule" for her under Manage -> Staff -> Edit.
UPDATE "employees" SET "canPostNews" = true, "canSeeEveryonesSchedule" = true
WHERE "id" = (
  SELECT CASE WHEN count(*) = 1 THEN (array_agg("id"))[1] END
  FROM "employees"
  WHERE "employmentStatus" <> 'TERMINATED'
    AND (
      (
        (lower("lastName") LIKE '%notario%' OR lower("email") LIKE '%notario%')
        AND (lower(trim("firstName")) LIKE 'ang%' OR lower(trim(coalesce("preferredName", ''))) LIKE 'ang%')
      )
      OR lower("email") LIKE 'anotario%'
    )
);
