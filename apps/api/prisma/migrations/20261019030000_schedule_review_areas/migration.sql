-- Groups of schedules with one reviewer (October 2026, Dominguez, from the
-- practice's Schedule Review sheet): Telemedicine, NB Providers, NB Bloodwork
-- and Nursing, WNY All. Reviewers are matched by name (Kayla B, Angelica N,
-- Tatiyana R) only when exactly one current person fits, else left empty:
-- check the Reviews screen on the live site.
CREATE TABLE "schedule_review_areas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reviewerId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_review_areas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "schedule_review_areas_reviewerId_idx" ON "schedule_review_areas"("reviewerId");

ALTER TABLE "schedule_review_areas" ADD CONSTRAINT "schedule_review_areas_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION pg_temp.one_person(first_name text, last_pattern text) RETURNS uuid AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg("id"))[1] END
  FROM "employees"
  WHERE "employmentStatus" <> 'TERMINATED'
    AND (lower("firstName") = first_name OR lower(coalesce("preferredName", '')) = first_name)
    AND lower("lastName") LIKE last_pattern
$$ LANGUAGE sql;

INSERT INTO "schedule_review_areas" ("id", "name", "sortOrder", "reviewerId", "updatedAt") VALUES
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1001', 'Telemedicine', 1, pg_temp.one_person('kayla', 'b%'), now()),
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1002', 'NB Providers', 2, pg_temp.one_person('angelica', 'notario'), now()),
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1003', 'NB Bloodwork & Nursing', 3, pg_temp.one_person('kayla', 'b%'), now()),
  ('5c1d0a52-3f0e-5c3a-9a61-0b6f4b0d1004', 'WNY ALL', 4, pg_temp.one_person('tatiyana', 'r%'), now());
DROP FUNCTION pg_temp.one_person(text, text);
