-- The practice's phone extensions, from its "Office Extensions" sheet
-- (October 2026, Dominguez), for the Directory. Managers keep them in the app
-- from here on; this is only the starting list.
CREATE TABLE "office_extensions" (
    "id" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "homeExtension" TEXT,
    "homeDays" TEXT,
    "employeeId" UUID,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_extensions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "office_extensions_sortOrder_idx" ON "office_extensions"("sortOrder");

ALTER TABLE "office_extensions" ADD CONSTRAINT "office_extensions_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The sheet as given. A person's line is matched to their account only when
-- exactly one active member of staff has that first and last name; otherwise
-- it is left for a manager to match in the app.
WITH sheet ("sortOrder", "section", "label", "extension", "homeExtension", "homeDays", "first", "last") AS (
    VALUES
        (10,  'Providers',            'Dr. Jonathan Dominguez',   '201', '504', NULL,        'jonathan', 'dominguez'),
        (20,  'Providers',            'Dr. Caridad Iparraguirre', '202', '502', NULL,        'caridad',  'iparraguirre'),
        (30,  'Providers',            'Jose Badia',               '203', '503', NULL,        'jose',     'badia'),
        (40,  'Providers',            'WNY Dr',                   '204', NULL,  NULL,        NULL,       NULL),
        (50,  'Providers',            'WNY Dr 2',                 '205', NULL,  NULL,        NULL,       NULL),
        (60,  'Admin Team',           'Kayla Bermeo',             '121', '521', 'Thursday',  'kayla',    'bermeo'),
        (70,  'Admin Team',           'Tatiyana Rosales',         '122', '522', 'Tuesday',   'tatiyana', 'rosales'),
        (80,  'Admin Team',           'Angelica Dominguez',       '123', '523', 'Friday',    'angelica', 'dominguez'),
        (90,  'Admin Team',           'Selena Verdezoto',         '124', '524', 'Wednesday', 'selena',   'verdezoto'),
        (100, 'Admin Team',           'Celeste Alifonso',         '125', '525', 'Monday',    'celeste',  'alifonso'),
        (110, 'Admin Team',           'Angelica Notario',         '126', NULL,  NULL,        'angelica', 'notario'),
        (120, 'Front Desk & Outdesk', 'NB Front Desk',            '101', NULL,  NULL,        NULL,       NULL),
        (130, 'Front Desk & Outdesk', 'NB Out Desk',              '102', NULL,  NULL,        NULL,       NULL),
        (140, 'Front Desk & Outdesk', 'NB MA',                    '112', NULL,  NULL,        NULL,       NULL),
        (150, 'Front Desk & Outdesk', 'WNY Front Desk',           '103', NULL,  NULL,        NULL,       NULL),
        (160, 'Front Desk & Outdesk', 'WNY Out Desk',             '104', NULL,  NULL,        NULL,       NULL),
        (170, 'Front Desk & Outdesk', 'WNY MA',                   '105', NULL,  NULL,        NULL,       NULL),
        (180, 'Front Desk & Outdesk', 'Fanny Remote',             '100', NULL,  NULL,        NULL,       NULL),
        (190, 'Front Desk & Outdesk', 'Paola Remote',             '120', NULL,  NULL,        NULL,       NULL),
        (200, 'Front Desk & Outdesk', 'Laura CCM Remote',         '130', NULL,  NULL,        NULL,       NULL),
        (210, 'Misc',                 'NB Phleb',                 '111', NULL,  NULL,        NULL,       NULL),
        (220, 'Misc',                 'Extra Phone NB',           '109', NULL,  NULL,        NULL,       NULL)
)
INSERT INTO "office_extensions" ("id", "section", "label", "extension", "homeExtension", "homeDays", "employeeId", "sortOrder", "updatedAt")
SELECT
    gen_random_uuid(),
    sheet."section",
    sheet."label",
    sheet."extension",
    sheet."homeExtension",
    sheet."homeDays",
    (
        SELECT MIN(e."id"::text)::uuid
        FROM "employees" e
        WHERE lower(trim(e."firstName")) = sheet."first"
          AND lower(trim(e."lastName")) = sheet."last"
          AND e."employmentStatus" <> 'TERMINATED'
        HAVING COUNT(*) = 1
    ),
    sheet."sortOrder",
    CURRENT_TIMESTAMP
FROM sheet;
