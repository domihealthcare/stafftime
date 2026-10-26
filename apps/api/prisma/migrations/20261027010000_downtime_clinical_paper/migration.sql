-- The BrainCheck Care Plan and the Annual Wellness Visit on paper (October
-- 2026, Dominguez: "in case of no internet and unable to access staff
-- portal"): they print from Downtime, Forms. Added to the stack each front
-- desk keeps, and to the providers' and MAs' steps, without touching anything
-- a manager has already changed.

INSERT INTO "downtime_kit_items" ("id", "label", "quantity", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), v.label, v.quantity, v.sort, now()
FROM (VALUES
  ('BrainCheck Care Plan (paper)', 5, 35),
  ('Annual Wellness Visit (paper, English and Spanish)', 10, 36)
) AS v(label, quantity, sort)
WHERE NOT EXISTS (SELECT 1 FROM "downtime_kit_items" k WHERE k."label" = v.label);

-- Straight after "eCW is down" in each group, where it applies.
INSERT INTO "guide_sections" ("id", "guide", "group", "title", "body", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), 'DOWNTIME', v."group", 'The clinical forms on paper', v.body,
       COALESCE((SELECT g."sortOrder" FROM "guide_sections" g
                 WHERE g.guide = 'DOWNTIME' AND g."group" = v."group" AND g.title = 'eCW is down'
                 LIMIT 1), 900) + 1,
       now()
FROM (VALUES
  ('Provider', $d$If Domi Staff cannot be reached either, use the paper **BrainCheck Care Plan** and **Annual Wellness Visit** (page 1) from the downtime stack.
- Fill them in by hand, as on screen.
- Once Domi Staff is back, enter them in the forms there to make the note for eCW and the patient's handout, then scan the paper into eCW Documents.$d$),
  ('Medical assistant', $d$If Domi Staff cannot be reached either, use the paper **Annual Wellness Visit** (page 2, preventive services) from the downtime stack.
- Once Domi Staff is back, enter it in the Annual Wellness Visit there, then scan the paper into eCW Documents.$d$)
) AS v("group", body)
WHERE NOT EXISTS (
  SELECT 1 FROM "guide_sections" s
  WHERE s.guide = 'DOWNTIME' AND s."group" = v."group" AND s.title = 'The clinical forms on paper'
);
