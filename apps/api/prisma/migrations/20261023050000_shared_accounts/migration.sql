-- A shared account, not a person (23 October 2026, Dominguez: a general
-- office@ account with front desk access). Off for everybody already here.
ALTER TABLE "employees" ADD COLUMN "isSharedAccount" BOOLEAN NOT NULL DEFAULT false;
