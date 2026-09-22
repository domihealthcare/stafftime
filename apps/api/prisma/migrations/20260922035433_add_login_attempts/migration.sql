-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_at_idx" ON "login_attempts"("ipAddress", "at");

-- CreateIndex
CREATE INDEX "login_attempts_at_idx" ON "login_attempts"("at");

