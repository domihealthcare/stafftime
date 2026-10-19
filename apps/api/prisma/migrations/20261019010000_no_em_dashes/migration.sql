-- No em dashes in the portal (October 2026, Dominguez: "remove all em dashes
-- and replace with dashes regular. For all the portal and going forward don't
-- use em dashes"). The screens and messages were changed in the code; this does
-- the same for the lists the practice's own spreadsheets and documents were
-- loaded into by earlier migrations: the phone book, the closing checklists and
-- the diagnostics plans' notes. A spaced dash stays spaced. What staff have
-- typed elsewhere (News, notes, surveys) is theirs and is left as written.

UPDATE "referral_contacts" SET
  "category" = replace(replace("category", ' — ', ' - '), '—', '-'),
  "name"     = replace(replace("name", ' — ', ' - '), '—', '-'),
  "email"    = replace(replace("email", ' — ', ' - '), '—', '-'),
  "website"  = replace(replace("website", ' — ', ' - '), '—', '-'),
  "notes"    = replace(replace("notes", ' — ', ' - '), '—', '-')
WHERE "category" LIKE '%—%' OR "name" LIKE '%—%' OR "email" LIKE '%—%'
   OR "website" LIKE '%—%' OR "notes" LIKE '%—%';

UPDATE "referral_offices" SET
  "label"   = replace(replace("label", ' — ', ' - '), '—', '-'),
  "address" = replace(replace("address", ' — ', ' - '), '—', '-'),
  "phone"   = replace(replace("phone", ' — ', ' - '), '—', '-'),
  "fax"     = replace(replace("fax", ' — ', ' - '), '—', '-')
WHERE "label" LIKE '%—%' OR "address" LIKE '%—%' OR "phone" LIKE '%—%' OR "fax" LIKE '%—%';

UPDATE "closing_sections" SET "title" = replace(replace("title", ' — ', ' - '), '—', '-')
WHERE "title" LIKE '%—%';

UPDATE "closing_items" SET "text" = replace(replace("text", ' — ', ' - '), '—', '-')
WHERE "text" LIKE '%—%';

UPDATE "diagnostic_plans" SET "note" = replace(replace("note", ' — ', ' - '), '—', '-')
WHERE "note" LIKE '%—%';
