-- Diagnostics: each test's CPT code(s), so staff can look a test up by its
-- code (October 2026, staff feedback via Dominguez: "Insurance / Test / CPT
-- code"). Free text, "76700" or "95816, 95813"; managers change it on the
-- board. The codes themselves are loaded by the next migration.
ALTER TABLE "diagnostic_tests" ADD COLUMN "cptCodes" TEXT;
