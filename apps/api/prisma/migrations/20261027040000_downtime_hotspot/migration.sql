-- What to buy for the offices, settled with Dominguez on 26 October 2026:
-- no backup internet ("it doesn't happen enough to have that cost"), so the
-- stopgap becomes the rule: one front desk computer on a phone's hotspot.
-- Battery backups: already there. A lockable downtime box per front desk,
-- with clipboards, pens and specimen labels, and the NJ prescription blanks
-- in a separate locked box. Card payments stay on Weave's machine.
--
-- Each change is made only where the text it adds to is still there and the
-- change is not already in, so nothing a manager wrote is lost.

-- The hotspot, for the front desk.
UPDATE "guide_sections"
SET "body" = replace("body", $d$- Keep seeing patients.$d$, $d$- Keep seeing patients.
- To see eCW at the desk (today's schedule, a chart), a manager can put **one front desk computer** on a phone's **hotspot**. eCW only on it, and turn the hotspot off once the internet is back. The phone only shares its connection: nothing about a patient goes on it.$d$),
    "updatedAt" = now()
WHERE "guide" = 'DOWNTIME' AND "group" = 'Front desk' AND "title" = 'Internet is down'
  AND "body" LIKE '%- Keep seeing patients.%' AND "body" NOT LIKE '%hotspot%';

-- For medical assistants and providers: where to look something up.
UPDATE "guide_sections"
SET "body" = replace("body", $d$- Keep seeing patients.$d$, $d$- Keep seeing patients.
- If something has to be looked up in eCW, ask the front desk: one computer there may be on a phone's hotspot.$d$),
    "updatedAt" = now()
WHERE "guide" = 'DOWNTIME' AND "group" IN ('Medical assistant', 'Provider') AND "title" = 'Internet is down'
  AND "body" LIKE '%- Keep seeing patients.%' AND "body" NOT LIKE '%hotspot%';

-- For managers and admins: the rule itself.
INSERT INTO "guide_sections" ("id", "guide", "group", "title", "body", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), 'DOWNTIME', 'Managers and admins', 'Internet is down',
$d$- Keep seeing patients, on paper. The other office may be working normally and can help.
- **The stopgap: a phone's hotspot.** Connect **one front desk computer** to your phone's hotspot, or the phone of somebody who offers (nobody has to), so the desk can see eCW.
- eCW only on that computer: no updates, video or downloads, so the data lasts.
- The phone only shares its connection: nothing about a patient goes on it.
- Turn the hotspot off once the internet is back.$d$,
  205, now()
WHERE NOT EXISTS (
  SELECT 1 FROM "guide_sections"
  WHERE "guide" = 'DOWNTIME' AND "group" = 'Managers and admins' AND "title" = 'Internet is down'
);

-- The prescription blanks live apart, in their own locked box.
UPDATE "guide_sections"
SET "body" = replace("body", $d$(NJ blanks for controlled substances).$d$, $d$(NJ blanks for controlled substances), kept in their own locked box, not in the downtime box.$d$),
    "updatedAt" = now()
WHERE "guide" = 'DOWNTIME' AND "group" = 'Provider' AND "title" = 'eCW is down'
  AND "body" LIKE '%(NJ blanks for controlled substances).%' AND "body" NOT LIKE '%own locked box%';

UPDATE "downtime_kit_items"
SET "label" = 'Paper prescription pads (NJ blanks, in their own locked box)', "updatedAt" = now()
WHERE "label" = 'Paper prescription pads (NJ blanks)';

-- What goes in the downtime box, for the monthly check.
INSERT INTO "downtime_kit_items" ("id", "label", "quantity", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), v.label, v.quantity, v.sort, now()
FROM (VALUES
  ('Clipboards', 3, 110),
  ('Pens', 10, 120),
  ('Blank specimen labels (a roll)', 1, 130)
) AS v(label, quantity, sort)
WHERE NOT EXISTS (SELECT 1 FROM "downtime_kit_items" k WHERE k."label" = v.label);

-- The downtime quiz asks about it too, if the quiz is still there.
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$The internet is down at your office and the desk needs to see eCW. What is the stopgap?$q$,
  ARRAY[$q$A manager puts one front desk computer on a phone's hotspot, for eCW only$q$, $q$Everybody opens eCW on their own phone$q$, $q$Borrow a login from the other office$q$, $q$There is none: wait until the internet is back$q$]::text[],
  0,
  $q$One front desk computer on a phone's hotspot, eCW only, turned off once the internet is back. Never eCW on your own phone: nothing about a patient goes on it.$q$,
  ARRAY[]::uuid[], false, 85
FROM "quizzes" q
WHERE q.title = 'Downtime procedures'
  AND NOT EXISTS (
    SELECT 1 FROM "quiz_questions" x
    WHERE x."quizId" = q.id AND x.prompt LIKE 'The internet is down at your office and the desk needs to see eCW%'
  );
