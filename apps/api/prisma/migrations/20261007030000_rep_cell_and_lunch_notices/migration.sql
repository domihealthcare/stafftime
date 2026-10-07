-- Rep lunches, follow-up (October 2026, Dominguez): "front desk can see the
-- cell", and every office is told the night before whether there is a rep
-- lunch — "so staff knows to bring their own lunch".

ALTER TABLE "job_roles" ADD COLUMN "seesRepCell" BOOLEAN NOT NULL DEFAULT false;

UPDATE "job_roles" SET "seesRepCell" = true WHERE "name" = 'Front Desk';

-- One notice per office per day, claimed before it is sent.
CREATE TABLE "lunch_notices" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lunch_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lunch_notices_locationId_day_key" ON "lunch_notices"("locationId", "day");

ALTER TABLE "lunch_notices" ADD CONSTRAINT "lunch_notices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
