-- Pay is shown only once the person has entered their PIN on this session
-- (October 2026, Dominguez).
ALTER TABLE "sessions" ADD COLUMN "payUnlockedUntil" TIMESTAMP(3);
