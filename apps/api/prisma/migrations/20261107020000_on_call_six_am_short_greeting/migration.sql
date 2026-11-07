-- The on-call turn hands over at 6 AM, not noon, and the after-hours
-- greeting is shorter (7 November 2026, Dominguez, after the first test
-- call). Noon was only for the old answering service.

ALTER TABLE "on_call_rotas" ALTER COLUMN "changesAt" SET DEFAULT '06:00';

-- From tomorrow in New Jersey, a copy of the pattern in force then, handing
-- over at 6 AM, so every day before keeps the hand-over it had. Nothing is
-- done when no pattern is in force, when it already hands over at 6 AM, or
-- when a manager has already saved one starting tomorrow or later.
WITH tomorrow AS (
  SELECT ((now() AT TIME ZONE 'America/New_York')::date + 1) AS d
),
current_rota AS (
  SELECT r."id", r."changesAt"
  FROM "on_call_rotas" r, tomorrow t
  WHERE r."startsOn" <= t.d
  ORDER BY r."startsOn" DESC
  LIMIT 1
),
new_rota AS (
  INSERT INTO "on_call_rotas" ("id", "startsOn", "changesAt", "createdAt")
  SELECT gen_random_uuid(), t.d, '06:00', CURRENT_TIMESTAMP
  FROM current_rota c, tomorrow t
  WHERE c."changesAt" <> '06:00'
    AND NOT EXISTS (SELECT 1 FROM "on_call_rotas" x WHERE x."startsOn" >= t.d)
  RETURNING "id"
)
INSERT INTO "on_call_rota_entries" ("id", "rotaId", "weekday", "weekOfMonth", "employeeId", "backupEmployeeId")
SELECT gen_random_uuid(), n."id", e."weekday", e."weekOfMonth", e."employeeId", e."backupEmployeeId"
FROM new_rota n
CROSS JOIN current_rota c
JOIN "on_call_rota_entries" e ON e."rotaId" = c."id";

-- The shorter greetings, only where nobody has changed the first ones. The
-- office number is no longer read out: after hours callers have just dialled
-- it. The Spanish needs a native speaker's read.
UPDATE "call_messages" SET "text" = $greeting$You have reached the Domi Healthcare on-call provider. If this is an emergency, hang up and dial nine, one, one. For appointments, billing or other routine questions, please call our office during business hours. For urgent concerns, including a patient in the hospital, please stay on the line. If no one answers, leave a message with the patient's name, date of birth, the reason for your call and your callback number.$greeting$, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'GREETING_EN' AND "text" = $greeting$You have reached the urgent on-call provider. If this is a medical emergency, hang up and dial nine, one, one. For appointments, billing, or other routine patient matters, please hang up and call our main office at two, zero, one, five, two, eight, three, six, six, four. For urgent medical concerns, including matters regarding a patient currently admitted to the hospital, please hold to connect. If your call is not answered, please leave one voicemail with the patient's name, date of birth, reason for the call, and the best callback number, and the urgent provider will reach back out as soon as they can.$greeting$;

UPDATE "call_messages" SET "text" = $greeting$Ha llamado al proveedor de guardia de Domi Healthcare. Si es una emergencia, cuelgue y marque al nueve, uno, uno. Para citas, facturación u otras preguntas de rutina, llame a nuestra oficina en horario de atención. Para asuntos urgentes, incluyendo un paciente en el hospital, permanezca en la línea. Si nadie contesta, deje un mensaje con el nombre del paciente, su fecha de nacimiento, el motivo de su llamada y su número de teléfono.$greeting$, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'GREETING_ES' AND "text" = $greeting$Ha comunicado con el proveedor de guardia para casos urgentes. Si es una emergencia médica, cuelgue y marque al nueve, uno, uno. Para citas, facturación u otros asuntos de rutina, por favor cuelgue y llame a nuestra oficina principal al dos, cero, uno, cinco, dos, ocho, tres, seis, seis, cuatro. Para casos médicos urgentes, incluyendo asuntos de un paciente internado en el hospital, espere en la línea. Si no respondemos a su llamada, por favor deje un mensaje de voz con el nombre del paciente, su fecha de nacimiento, el motivo de la llamada y el mejor número de teléfono para llamarle de vuelta, y el proveedor de guardia se comunicará con usted lo antes posible.$greeting$;
