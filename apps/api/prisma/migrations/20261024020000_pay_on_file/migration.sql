-- "Pay on file": what somebody was already paid when it was first entered in
-- the portal, not a raise (October 2026, Dominguez).
ALTER TYPE "EmploymentChangeKind" ADD VALUE 'PAY_ON_FILE';
