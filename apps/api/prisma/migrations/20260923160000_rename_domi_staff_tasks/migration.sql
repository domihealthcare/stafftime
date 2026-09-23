-- The app is now called Domi Staff. Rename the two starting checklist tasks
-- that named it, on the templates and on checklists already under way. Only
-- the exact starting wording is touched: a task an admin has reworded is left
-- as they wrote it.
UPDATE "checklist_template_tasks"
SET "title" = 'Domi Staff account created, with locations assigned'
WHERE "title" = 'Time & Scheduling account created, with locations assigned';

UPDATE "checklist_template_tasks"
SET "title" = 'Domi Staff access revoked'
WHERE "title" = 'Time & Scheduling access revoked';

UPDATE "employee_checklist_tasks"
SET "title" = 'Domi Staff account created, with locations assigned'
WHERE "title" = 'Time & Scheduling account created, with locations assigned';

UPDATE "employee_checklist_tasks"
SET "title" = 'Domi Staff access revoked'
WHERE "title" = 'Time & Scheduling access revoked';
