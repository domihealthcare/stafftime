-- The providers' softphones (501–504) move into the Providers section, after
-- the room phones, instead of a section of their own (7 October 2026,
-- Dominguez), so the extensions fit on one row. Each keeps "(softphone)" on
-- its name, so it is not mistaken for a room phone. The whole list is
-- renumbered in its new order, the way a save from the app numbers it.
WITH ordered AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            ORDER BY
                CASE WHEN "section" = 'Provider softphones (rarely used)'
                     THEN (SELECT MAX("sortOrder") FROM "office_extensions" WHERE "section" = 'Providers')
                     ELSE "sortOrder" END,
                CASE WHEN "section" = 'Provider softphones (rarely used)' THEN 1 ELSE 0 END,
                "sortOrder"
        ) AS "position"
    FROM "office_extensions"
)
UPDATE "office_extensions" e
SET "sortOrder" = ordered."position" * 10,
    "section" = CASE WHEN e."section" = 'Provider softphones (rarely used)' THEN 'Providers' ELSE e."section" END,
    "label" = CASE
        WHEN e."section" = 'Provider softphones (rarely used)' AND e."label" NOT ILIKE '%softphone%'
        THEN e."label" || ' (softphone)'
        ELSE e."label" END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM ordered
WHERE e."id" = ordered."id";
