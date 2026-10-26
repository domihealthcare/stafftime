-- A requirement confirmed by passing a quiz (October 2026). On its own, as a
-- new enum value cannot be used in the transaction that adds it.
ALTER TYPE "RequirementKind" ADD VALUE IF NOT EXISTS 'QUIZ';
