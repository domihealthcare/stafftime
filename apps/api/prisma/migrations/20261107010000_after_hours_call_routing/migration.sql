-- After-hours call routing (November 2026, Dominguez: replaces Talkroute).
-- Weave's "Closed" routing forwards calls to one Twilio number; the app picks
-- who is on call and rings their cell. Backups on the pattern and on a changed
-- day, time-range covers, the line's settings and words, and a short call log.
-- Nothing recorded, transcribed or kept as voicemail.
-- CreateEnum
CREATE TYPE "CallMessageKey" AS ENUM ('OPENING_EN', 'OPENING_ES', 'GREETING_EN', 'GREETING_ES', 'HOLD_EN', 'HOLD_ES', 'CLOSING_EN', 'CLOSING_ES');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('IN_PROGRESS', 'ACCEPTED', 'RANG_THROUGH', 'NOT_REACHED', 'CALLER_HUNG_UP');

-- AlterTable
ALTER TABLE "on_call_rota_entries" ADD COLUMN     "backupEmployeeId" UUID;

-- AlterTable
ALTER TABLE "on_call_days" ADD COLUMN     "backupEmployeeId" UUID;

-- CreateTable
CREATE TABLE "on_call_covers" (
    "id" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "employeeId" UUID NOT NULL,
    "backupEmployeeId" UUID,
    "note" TEXT,
    "setById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "on_call_covers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_routing_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultProviderId" UUID,
    "voiceEn" TEXT NOT NULL DEFAULT 'Polly.Joanna-Neural',
    "voiceEs" TEXT NOT NULL DEFAULT 'Polly.Lupe-Neural',
    "ringSeconds" INTEGER NOT NULL DEFAULT 20,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_routing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_messages" (
    "key" "CallMessageKey" NOT NULL,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_messages_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL,
    "callSid" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "language" TEXT,
    "callerNumber" TEXT,
    "attempts" JSONB NOT NULL DEFAULT '[]',
    "acceptedById" UUID,
    "outcome" "CallOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "alertSentAt" TIMESTAMP(3),

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "on_call_covers_startsAt_endsAt_idx" ON "on_call_covers"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_callSid_key" ON "call_logs"("callSid");

-- CreateIndex
CREATE INDEX "call_logs_startedAt_idx" ON "call_logs"("startedAt");

-- AddForeignKey
ALTER TABLE "on_call_rota_entries" ADD CONSTRAINT "on_call_rota_entries_backupEmployeeId_fkey" FOREIGN KEY ("backupEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_days" ADD CONSTRAINT "on_call_days_backupEmployeeId_fkey" FOREIGN KEY ("backupEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_covers" ADD CONSTRAINT "on_call_covers_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_covers" ADD CONSTRAINT "on_call_covers_backupEmployeeId_fkey" FOREIGN KEY ("backupEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_covers" ADD CONSTRAINT "on_call_covers_setById_fkey" FOREIGN KEY ("setById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_routing_settings" ADD CONSTRAINT "call_routing_settings_defaultProviderId_fkey" FOREIGN KEY ("defaultProviderId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A cover ends after it starts; a provider's cell rings a sensible while.
ALTER TABLE "on_call_covers" ADD CONSTRAINT "on_call_covers_ends_after_starts" CHECK ("endsAt" > "startsAt");
ALTER TABLE "call_routing_settings" ADD CONSTRAINT "call_routing_settings_one_row" CHECK ("id" = 1);
ALTER TABLE "call_routing_settings" ADD CONSTRAINT "call_routing_settings_ring_seconds" CHECK ("ringSeconds" BETWEEN 10 AND 60);

-- The one settings row, with Dr. Jonathan Dominguez as the default provider
-- when his account is found by email (else an admin chooses on the screen).
INSERT INTO "call_routing_settings" ("id", "defaultProviderId", "updatedAt")
SELECT 1, (SELECT "id" FROM "employees" WHERE lower("email") = 'dominguez@domihealthcare.com' LIMIT 1), CURRENT_TIMESTAMP
ON CONFLICT ("id") DO NOTHING;

-- What the caller hears, as Dominguez wrote it. The hold and closing words,
-- and their Spanish, are Claude's and need a native speaker's read.
INSERT INTO "call_messages" ("key", "text", "updatedAt") VALUES
('OPENING_EN', 'Thank you for calling Domi Healthcare. For English, press 1.', CURRENT_TIMESTAMP),
('OPENING_ES', 'Para español, oprima 2.', CURRENT_TIMESTAMP),
('GREETING_EN', 'You have reached the urgent on-call provider. If this is a medical emergency, hang up and dial nine, one, one. For appointments, billing, or other routine patient matters, please hang up and call our main office at two, zero, one, five, two, eight, three, six, six, four. For urgent medical concerns, including matters regarding a patient currently admitted to the hospital, please hold to connect. If your call is not answered, please leave one voicemail with the patient''s name, date of birth, reason for the call, and the best callback number, and the urgent provider will reach back out as soon as they can.', CURRENT_TIMESTAMP),
('GREETING_ES', 'Ha comunicado con el proveedor de guardia para casos urgentes. Si es una emergencia médica, cuelgue y marque al nueve, uno, uno. Para citas, facturación u otros asuntos de rutina, por favor cuelgue y llame a nuestra oficina principal al dos, cero, uno, cinco, dos, ocho, tres, seis, seis, cuatro. Para casos médicos urgentes, incluyendo asuntos de un paciente internado en el hospital, espere en la línea. Si no respondemos a su llamada, por favor deje un mensaje de voz con el nombre del paciente, su fecha de nacimiento, el motivo de la llamada y el mejor número de teléfono para llamarle de vuelta, y el proveedor de guardia se comunicará con usted lo antes posible.', CURRENT_TIMESTAMP),
('HOLD_EN', 'Please continue to hold while we connect you.', CURRENT_TIMESTAMP),
('HOLD_ES', 'Por favor, permanezca en la línea mientras le comunicamos.', CURRENT_TIMESTAMP),
('CLOSING_EN', 'We could not reach the on-call provider. They have been told about your call. Please call back in a few minutes. If this is a medical emergency, hang up and dial nine, one, one.', CURRENT_TIMESTAMP),
('CLOSING_ES', 'No pudimos comunicarnos con el proveedor de guardia. Ya se le avisó de su llamada. Por favor, vuelva a llamar en unos minutos. Si es una emergencia médica, cuelgue y marque al nueve, uno, uno.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
