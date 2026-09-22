-- The geofence radius is now stored in feet, because the people who set it are
-- in New Jersey and think in feet.
--
-- The values must be CONVERTED, not just relabelled: a plain rename would
-- reinterpret "150 metres" as "150 feet" and shrink every geofence to under a
-- third of its size, which would refuse staff standing at their own front desk.
-- 150 m is 492 ft.
ALTER TABLE "locations" ADD COLUMN "geofenceRadiusFeet" INTEGER NOT NULL DEFAULT 500;

UPDATE "locations"
SET "geofenceRadiusFeet" = ROUND("geofenceRadiusMeters" * 3.28084);

ALTER TABLE "locations" DROP COLUMN "geofenceRadiusMeters";
