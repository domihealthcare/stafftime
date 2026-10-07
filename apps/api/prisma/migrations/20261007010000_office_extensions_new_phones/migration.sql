-- The office extensions from the new phone system (7 October 2026, Dominguez),
-- replacing the list loaded from the old sheet. The doctors' desk phones are
-- now by room (Dr N 1, Dr W 1 ...), not by provider; each provider has a
-- softphone of their own, listed in its own section because providers rarely
-- use them. The admin team's 52x softphones stay their "from home" numbers on
-- their own lines; the shared softphones (Office, Admin, CCM, IT) are listed.
--
-- A person's line keeps what a manager may have set in the app since — who it
-- is matched to and their home days — taken from the old line with the same
-- extension. Otherwise it is matched by work email (the phone system's user),
-- or failing that when exactly one current member of staff has that first and
-- last name. Provider softphones are not matched to anybody, so a provider's
-- card does not offer a number they rarely answer.
WITH old AS (
    DELETE FROM "office_extensions"
    RETURNING "extension", "homeDays", "employeeId"
),
sheet ("sortOrder", "section", "label", "extension", "homeExtension", "homeDays", "email", "first", "last") AS (
    VALUES
        (10,  'Providers',                        'Dr N 1',             '201', NULL,  NULL,        NULL,                            NULL,       NULL),
        (20,  'Providers',                        'Dr N 2',             '202', NULL,  NULL,        NULL,                            NULL,       NULL),
        (30,  'Providers',                        'Dr W 1',             '204', NULL,  NULL,        NULL,                            NULL,       NULL),
        (40,  'Providers',                        'Dr W 2',             '205', NULL,  NULL,        NULL,                            NULL,       NULL),
        (50,  'Admin Team',                       'Kayla Bermeo',       '121', '521', 'Thursday',  'kbermeo@domihealthcare.com',    'kayla',    'bermeo'),
        (60,  'Admin Team',                       'Tatiyana Rosales',   '122', '522', 'Tuesday',   'trosales@domihealthcare.com',   'tatiyana', 'rosales'),
        (70,  'Admin Team',                       'Angelica Dominguez', '123', '523', 'Friday',    'angelica@domihealthcare.com',   'angelica', 'dominguez'),
        (80,  'Admin Team',                       'Selena Verdezoto',   '124', '524', 'Wednesday', 'sverdezoto@domihealthcare.com', 'selena',   'verdezoto'),
        (90,  'Admin Team',                       'Celeste Alifonso',   '125', '525', 'Monday',    'califonso@domihealthcare.com',  'celeste',  'alifonso'),
        (100, 'Admin Team',                       'Angelica Notario',   '126', NULL,  NULL,        NULL,                            'angelica', 'notario'),
        (110, 'Front Desk',                       'FD N 1',             '101', NULL,  NULL,        NULL,                            NULL,       NULL),
        (120, 'Front Desk',                       'FD N 2',             '102', NULL,  NULL,        NULL,                            NULL,       NULL),
        (130, 'Front Desk',                       'FD W 1',             '103', NULL,  NULL,        NULL,                            NULL,       NULL),
        (140, 'Front Desk',                       'FD W 2',             '104', NULL,  NULL,        NULL,                            NULL,       NULL),
        (150, 'Front Desk',                       'FD W 3',             '105', NULL,  NULL,        NULL,                            NULL,       NULL),
        (160, 'Front Desk',                       'FD 6',               '106', NULL,  NULL,        NULL,                            NULL,       NULL),
        (170, 'Front Desk',                       'FD 7',               '107', NULL,  NULL,        NULL,                            NULL,       NULL),
        (180, 'Front Desk',                       'FD 8',               '108', NULL,  NULL,        NULL,                            NULL,       NULL),
        (190, 'Front Desk',                       'FD 9',               '109', NULL,  NULL,        NULL,                            NULL,       NULL),
        (200, 'Front Desk',                       'FD 10',              '110', NULL,  NULL,        NULL,                            NULL,       NULL),
        (210, 'MA & Lab',                         'Lab N',              '111', NULL,  NULL,        NULL,                            NULL,       NULL),
        (220, 'MA & Lab',                         'MA N',               '112', NULL,  NULL,        NULL,                            NULL,       NULL),
        (230, 'MA & Lab',                         'MA W',               '113', NULL,  NULL,        NULL,                            NULL,       NULL),
        (240, 'Shared lines',                     'Office',             '100', NULL,  NULL,        NULL,                            NULL,       NULL),
        (250, 'Shared lines',                     'Admin',              '120', NULL,  NULL,        NULL,                            NULL,       NULL),
        (260, 'Shared lines',                     'CCM',                '130', NULL,  NULL,        NULL,                            NULL,       NULL),
        (270, 'Shared lines',                     'IT',                 '777', NULL,  NULL,        NULL,                            NULL,       NULL),
        (280, 'Provider softphones (rarely used)', 'Dr. D',             '501', NULL,  NULL,        NULL,                            NULL,       NULL),
        (290, 'Provider softphones (rarely used)', 'Dr. Ip',            '502', NULL,  NULL,        NULL,                            NULL,       NULL),
        (300, 'Provider softphones (rarely used)', 'Badia',             '503', NULL,  NULL,        NULL,                            NULL,       NULL),
        (310, 'Provider softphones (rarely used)', 'D Dominguez',       '504', NULL,  NULL,        NULL,                            NULL,       NULL)
)
INSERT INTO "office_extensions" ("id", "section", "label", "extension", "homeExtension", "homeDays", "employeeId", "sortOrder", "updatedAt")
SELECT
    gen_random_uuid(),
    sheet."section",
    sheet."label",
    sheet."extension",
    sheet."homeExtension",
    CASE WHEN sheet."last" IS NULL THEN NULL ELSE COALESCE(
        (SELECT MIN(old."homeDays") FROM old WHERE old."extension" = sheet."extension"),
        sheet."homeDays"
    ) END,
    CASE WHEN sheet."last" IS NULL THEN NULL ELSE COALESCE(
        (SELECT MIN(old."employeeId"::text)::uuid FROM old WHERE old."extension" = sheet."extension"),
        (
            SELECT MIN(e."id"::text)::uuid
            FROM "employees" e
            WHERE lower(e."email") = sheet."email"
              AND e."employmentStatus" <> 'TERMINATED'
        ),
        (
            SELECT MIN(e."id"::text)::uuid
            FROM "employees" e
            WHERE lower(trim(e."firstName")) = sheet."first"
              AND lower(trim(e."lastName")) = sheet."last"
              AND e."employmentStatus" <> 'TERMINATED'
            HAVING COUNT(*) = 1
        )
    ) END,
    sheet."sortOrder",
    CURRENT_TIMESTAMP
FROM sheet;
