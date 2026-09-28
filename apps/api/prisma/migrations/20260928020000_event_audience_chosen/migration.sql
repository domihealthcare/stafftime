-- "Chosen people": an event for any mix of job roles, offices and people.
--
-- On its own, before anything uses it: Postgres will not let a new enum value
-- be used in the transaction that adds it, and the next migration's check
-- constraint names it.
ALTER TYPE "EventAudience" ADD VALUE 'CHOSEN';
