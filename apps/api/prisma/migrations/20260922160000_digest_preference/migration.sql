-- Whether a manager wants the nightly round-up. On by default, so existing
-- managers keep getting it and nothing changes until somebody opts out.
ALTER TABLE "employees" ADD COLUMN "wantsDailyDigest" BOOLEAN NOT NULL DEFAULT true;
