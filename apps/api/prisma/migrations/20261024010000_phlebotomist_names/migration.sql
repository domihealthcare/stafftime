-- The phlebotomists' names, to pick from when a phlebotomist date goes on the
-- calendar (October 2026, Dominguez).
CREATE TABLE "phlebotomists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phlebotomists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "phlebotomists_name_key" ON "phlebotomists"("name");

-- The names already on the calendar start the list, one per name however it
-- was capitalised (the newest spelling), leaving out the plain "Phlebotomist".
INSERT INTO "phlebotomists" ("id", "name")
SELECT gen_random_uuid(), "name"
FROM (
    SELECT DISTINCT ON (lower(btrim("title"))) btrim("title") AS "name"
    FROM "practice_events"
    WHERE "kind" = 'PHLEBOTOMY'
      AND length(btrim("title")) >= 2
      AND lower(btrim("title")) <> 'phlebotomist'
    ORDER BY lower(btrim("title")), "createdAt" DESC
) AS "used"
ON CONFLICT ("name") DO NOTHING;
