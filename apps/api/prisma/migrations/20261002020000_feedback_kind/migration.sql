-- The suggestion box pop-up lets the sender say what sort of note it is.
-- Additive and nullable: everything already in the box stays as it was.
CREATE TYPE "FeedbackKind" AS ENUM ('IDEA', 'PROBLEM', 'SHOUT_OUT', 'QUESTION');

ALTER TABLE "feedback" ADD COLUMN "kind" "FeedbackKind";
