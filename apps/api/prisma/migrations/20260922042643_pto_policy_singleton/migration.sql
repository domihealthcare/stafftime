-- Make the PTO policy a real singleton.
--
-- `PtoPolicyService.get()` used to read-then-create, so two requests arriving
-- together (the Time off screen asks for the policy and for a balance at the
-- same moment) could both find nothing and both insert. A deployment can
-- therefore already hold more than one policy row, with the admin's edits
-- landing on one of them and reads coming back from the other.
--
-- Collapse them before adding the constraint. The row kept is the most
-- recently updated one, which is the practice's latest intent; the others are
-- rows nobody has deliberately edited since.
DELETE FROM "pto_policy"
WHERE "id" NOT IN (
  SELECT "id" FROM "pto_policy" ORDER BY "updatedAt" DESC, "createdAt" ASC LIMIT 1
);

-- AlterTable
ALTER TABLE "pto_policy" ADD COLUMN     "singleton" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "pto_policy_singleton_key" ON "pto_policy"("singleton");
