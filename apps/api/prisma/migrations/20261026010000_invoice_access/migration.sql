-- Invoices for three people only (26 October 2026, Dominguez: "the only
-- people who should be able to see these invoices should be me (Jonathan
-- Dominguez, Angelica Dominguez, and Kayla Bermeo)"). Until now it was
-- everybody with Manager access. The list is kept on the Invoices screen by
-- the people on it. Angelica and Kayla are matched by name, only when exactly
-- one current member of staff fits, so check the list on the live site.
ALTER TABLE "employees" ADD COLUMN "canSeeInvoices" BOOLEAN NOT NULL DEFAULT false;

UPDATE "employees" SET "canSeeInvoices" = true
WHERE lower("email") = 'dominguez@domihealthcare.com';

UPDATE "employees" SET "canSeeInvoices" = true
WHERE "employmentStatus" <> 'TERMINATED'
  AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
  AND lower("lastName") = 'dominguez'
  AND (
    SELECT count(*) FROM "employees"
    WHERE "employmentStatus" <> 'TERMINATED'
      AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
      AND lower("lastName") = 'dominguez'
  ) = 1;

UPDATE "employees" SET "canSeeInvoices" = true
WHERE "employmentStatus" <> 'TERMINATED'
  AND (lower("firstName") = 'kayla' OR lower(coalesce("preferredName", '')) = 'kayla')
  AND lower("lastName") = 'bermeo'
  AND (
    SELECT count(*) FROM "employees"
    WHERE "employmentStatus" <> 'TERMINATED'
      AND (lower("firstName") = 'kayla' OR lower(coalesce("preferredName", '')) = 'kayla')
      AND lower("lastName") = 'bermeo'
  ) = 1;
