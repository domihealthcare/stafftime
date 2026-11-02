-- Face ID sign-in (November 2026, Dominguez: "staff can use face id through
-- their phone to login to portal"): passkeys, the one-time challenges they
-- answer, and whether a session was opened with one. Only the public half of
-- a passkey is kept; the face or fingerprint never leaves the phone.

CREATE TYPE "PasskeyPurpose" AS ENUM ('REGISTER', 'SIGN_IN', 'PAY');

ALTER TABLE "sessions" ADD COLUMN "viaPasskey" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "passkeys" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "passkey_challenges" (
    "id" UUID NOT NULL,
    "challenge" TEXT NOT NULL,
    "purpose" "PasskeyPurpose" NOT NULL,
    "employeeId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkey_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkeys_credentialId_key" ON "passkeys"("credentialId");
CREATE INDEX "passkeys_employeeId_idx" ON "passkeys"("employeeId");
CREATE UNIQUE INDEX "passkey_challenges_challenge_key" ON "passkey_challenges"("challenge");
CREATE INDEX "passkey_challenges_expiresAt_idx" ON "passkey_challenges"("expiresAt");

ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
