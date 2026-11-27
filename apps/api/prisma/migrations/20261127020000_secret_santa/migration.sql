-- Secret Santa (27 November 2026, Dominguez: "Admin/managers should be able
-- to set it up (date, budget, location, members participating - but also can
-- provide opportunity to allow staff to sign up them selves) once its
-- 'closed' staff are told anonymously who they drew (can be via email)").
-- Each member's row holds who they drew; nothing shows anybody who drew them.

-- CreateEnum
CREATE TYPE "SecretSantaStatus" AS ENUM ('OPEN', 'DRAWN');

-- CreateTable
CREATE TABLE "secret_santas" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "exchangeOn" DATE NOT NULL,
    "budgetDollars" INTEGER NOT NULL,
    "locationId" UUID,
    "place" TEXT,
    "notes" TEXT,
    "selfSignUp" BOOLEAN NOT NULL DEFAULT false,
    "signUpUntil" DATE,
    "status" "SecretSantaStatus" NOT NULL DEFAULT 'OPEN',
    "drawnAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_santas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_santa_members" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "signedUpSelf" BOOLEAN NOT NULL DEFAULT false,
    "wishes" TEXT,
    "recipientId" UUID,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_santa_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "secret_santa_members_exchangeId_employeeId_key" ON "secret_santa_members"("exchangeId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "secret_santa_members_exchangeId_recipientId_key" ON "secret_santa_members"("exchangeId", "recipientId");

-- AddForeignKey
ALTER TABLE "secret_santas" ADD CONSTRAINT "secret_santas_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santas" ADD CONSTRAINT "secret_santas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santa_members" ADD CONSTRAINT "secret_santa_members_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "secret_santas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santa_members" ADD CONSTRAINT "secret_santa_members_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_santa_members" ADD CONSTRAINT "secret_santa_members_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Nobody draws themselves, and a budget is a real amount.
ALTER TABLE "secret_santa_members" ADD CONSTRAINT "secret_santa_members_not_self" CHECK ("recipientId" IS NULL OR "recipientId" <> "employeeId");
ALTER TABLE "secret_santas" ADD CONSTRAINT "secret_santas_budget_positive" CHECK ("budgetDollars" > 0);
