-- The diagnostics tests' CPT codes, taken from the practice's own
-- reimbursements sheet (already on the Reimbursements board), which names
-- each of these tests beside its code. Matched by the test's id from
-- 20261016020000_diagnostics_reimbursements_data, and only where no code is
-- set yet, so nothing a manager typed is changed. "Renal" and "BrainCheck"
-- have no line of their own on the sheet and are left for a manager to fill.
UPDATE "diagnostic_tests" t SET "cptCodes" = c.codes
FROM (VALUES
  -- Ultrasounds
  ('3753be70-24cf-57ec-882c-c0d4863d0bcc'::uuid, '76700'),               -- Abdomen
  ('99062419-0e76-5b93-b6fc-1dd20d0a5215'::uuid, '93975'),               -- Renal Artery
  ('218e6860-5577-5f21-ac4d-a650b1e66df0'::uuid, '93306'),               -- ECHO
  ('1743673b-5f09-58a8-97b9-b81b857e0423'::uuid, '76706'),               -- AAA
  ('45944e81-f6bd-59bf-bfd5-9533ff9991f3'::uuid, '93978'),               -- Aorta
  ('4f752713-f6e7-5181-bc64-1d507ac6ed4a'::uuid, '93970'),               -- BL LE VENOUS
  ('503e050e-6349-53c6-a321-7578b56bdcad'::uuid, '93930'),               -- BL UE ART
  ('ee98796d-0264-568a-bbc0-781c44a0b2cb'::uuid, '93925'),               -- BL LE ART
  ('57d41ee2-acba-5ea1-a29d-9add159f58fc'::uuid, '93880'),               -- CAROTID
  ('e6af6eb9-06ba-5b96-bf1b-8b53a803b998'::uuid, '76536'),               -- THYROID
  ('c3213f77-a929-580c-9c87-736c8fb64105'::uuid, '76770'),               -- Renal Bladder (KUB)
  ('94e3b403-c620-52f0-b3ae-3561087c7b3b'::uuid, '76856'),               -- Pelvic US
  ('07624eda-2798-541c-99ba-13e5f52df3fe'::uuid, '76882'),               -- Soft Tissue (UE, LE, Axilla)
  ('7492944c-47a1-5252-bb15-9b02f700f3a3'::uuid, '76857'),               -- Soft Tissue (Buttock/Pelvis)
  ('a5a9df98-b654-5256-a4fb-7b25ab446068'::uuid, '76604'),               -- Soft Tissue (Chest/Upper Back)
  ('913703e6-7ef6-51e3-96d8-1fda86736d82'::uuid, '76705'),               -- Soft Tissue (Abd/Lower Back)
  ('79f19f4f-9ecf-5d44-a69b-5eabac6d53eb'::uuid, '76870'),               -- Soft Tissue (Groin/Scrotum)
  -- Testing
  ('eb37440c-dc14-5af7-8ec4-9ef469926b2c'::uuid, '95816, 95813, 95957'), -- EEG
  ('9980d222-e660-52e3-9fb6-ab340ee51f2a'::uuid, '95921, 95923, 95924'), -- AUTONOMIC TESTING (ANS)
  ('6db63c87-24c5-5c6a-bda6-8cb726a5874f'::uuid, '92540, 92537, 92546'), -- VNG
  ('9e2a7950-241c-5520-8c57-7167e2832cbc'::uuid, '93886, 93890, 93892'), -- TCD
  ('ecd7acb8-2fa1-5d18-860a-1bcff6ba5d81'::uuid, '95913, 95886'),        -- NERVE CONDUCTION
  ('5eaaaf11-89d7-5214-a692-92178503b54e'::uuid, '95800, G0398'),        -- SLEEP STUDIES
  ('2aa18148-a789-575b-b429-7743a1d976a9'::uuid, '76981'),               -- FIBROSCAN
  ('610f3da9-00e4-5c1e-837b-f5d46bf013bb'::uuid, '93224'),               -- HOLTER
  ('8fc11deb-6971-5db4-894f-00abbdcf3395'::uuid, '94010'),               -- PFT
  ('a5926557-e7b3-5eeb-8170-d2653813789d'::uuid, '17110'),               -- Cyro
  ('64ccaa46-2000-57ee-9d8b-323d4244e7ee'::uuid, '93922'),               -- ABI
  ('661d7a1b-8a71-501a-b513-65c66a73ca10'::uuid, '92229')                -- AEYE
) AS c(id, codes)
WHERE t."id" = c.id AND t."cptCodes" IS NULL;
