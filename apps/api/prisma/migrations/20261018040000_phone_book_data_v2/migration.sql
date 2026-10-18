-- The referral phone book, version 2 (October 2026, Dominguez: "the
-- highlighted ones should be starred/preferred", "multiple addresses/phone and
-- fax numbers for the same person/group"). Re-read from PHONE_BOOK.docx: each
-- entry now has its offices (an address with its own phone and fax) and the
-- practice's yellow-highlighted entries are starred. Entries are only added
-- where no entry of that name is under that heading already, so anything staff
-- have added or corrected is left alone. The browser suite re-runs this file to
-- put the book back after a test.

WITH src("id", "category", "name", "preferred", "email", "website", "notes") AS (VALUES
  ('8e353311-7964-53e8-9f90-4dde1a12e97e', 'Labs', 'BioReference Laboratories', false, NULL, NULL, 'Account Numbers: North Bergen- JN145, Hoboken- JN837, West New York- JN146'),
  ('21176ce2-2777-55ea-952b-a85a9a28d4f0', 'Labs', 'Exact Sciences Laboratories (Cologuard)', false, NULL, NULL, NULL),
  ('be74e8f9-335e-5968-b7f4-0481436afc2f', 'Labs', 'OXFORD Laboratories', false, 'unioncitypsc@gmail.com', NULL, 'For home services: 201-471-1539
For Lab Results: 201-553-0500 F: 201-553-0501
Patient Care Specialist: Alicia Marulanda'),
  ('41c3a194-bd4d-5ba1-8041-fc9b932de35b', 'Labs', 'Medlife Diagnostic Laboratories', false, 'admin@medlifediagnostic.com', NULL, 'Does in house draws (Fee is approx. $25-50 depending on location)
Internal Account Manager is: Mitch Cernat
Cell Phone: 215-900-8768'),
  ('046d188b-d56f-5f65-a94d-03c2ce923f36', 'Labs', 'Quest Diagnostic Lab', false, 'Laquine.J.Johnson@QuestDiagnostics.com', NULL, 'Specimen Pick-up 1-800-223-0570
Internal Account Manager is: Laquine Johnson
Cell Phone: 862.208.9994'),
  ('88f2d7b6-6d81-5397-9c21-b24d6c88507d', 'Labs', 'LabCorp', false, NULL, NULL, 'Account # Account Name
29065290 JONATHAN M DOMINGUEZ MD NB
29092650 EXCELCARE HOBOKEN
29075240 JONATHAN DOMINGUEZ MD WNY
Fax for bw results: 1-855-227-4491'),
  ('7f3b1f46-ccc5-5c09-84e0-24b03877090e', 'Labs', 'Myriad Genetic Counselor', false, NULL, NULL, 'No Cost to the patient- Can call and speak with a Genetic Counselor that can explain or guide them through the process of a Genetic Risk Score.'),
  ('e5370975-0f7a-5b45-891b-279d96970d21', 'Labs', 'LabCorp patient service sites', false, NULL, NULL, NULL),
  ('ace7e823-c6e0-5c41-9d8f-ec0e7b5f87bc', 'Holy Name services', 'Holy Name Medical Center', false, NULL, NULL, 'Phone Medical Records: (201) 833-7044
Fax Medical Records: (201) 833-7138'),
  ('10df034d-8e5c-56e7-a852-d3b8b7c8093a', 'Holy Name services', 'Covid Swab', false, NULL, NULL, 'Call: 201-833-3313
Medical records dept: 201-833-3052
Medical records fax: 201-833-7138
Fax: 201-833-3637
PA Dept Fax: 201-541-6357 ( Demo, Clinicals, and Imaging order)'),
  ('594e935b-02fc-5570-9fbc-ec2987b63ee2', 'Holy Name services', 'Radiology- ext. 3280 & 7625', false, NULL, NULL, 'Interventional Radiology- for Thyroid biopsy
(back up fax: 201-379-5601)
FAX OVER: Demographic, imaging order, US Thyroid results (Imaging), most recent clinical notes within 30 days.
MAIL OVER: US Thyroid w/ actual IMAGES.
Notify patient that the Hospital will contact the patient to schedule an appointment in 2-3 days.'),
  ('8e351ebb-fc44-5434-a00c-433c45622c3f', 'Holy Name services', 'Sleep Studies / Sleep Center', false, NULL, NULL, 'FAX OVER: Facesheet, referral, clinical notes. Dept will verify w ins and f/u with the patient.'),
  ('a8633582-b847-5146-ab2b-c85d9ababfe8', 'Holy Name services', 'Breast Center', false, NULL, NULL, 'Breast Center: (201) 833-7100
Breast Center Fax: (201) 833-7248/201-833-3714
Surgical Breast Center Fax: (201) 541-5972
Transportation Phone: (201)833-3636
Cardiology Department Phone:(201)833-3211
Barbara Carnival-Manager Phone: (201)530-7919
Home Care Phone: 201-833-3740'),
  ('f405b50a-3b78-51e2-87d8-1abd554c08d2', 'Holy Name services', 'Holy Name Institute for Wound Healing', false, NULL, NULL, NULL),
  ('54d57673-46a2-5903-86ce-ebb3077f72c7', 'Holy Name services', 'Bergen Imaging Center, P.A. (English/Spanish/Korean)', false, 'info@BergenImagingCenter.com', NULL, 'Mammography & 3D Mammography - Breast Ultrasound - Breast Biopsy - General Ultrasound
Sonohysterography (Saline Infusion Sonography) - DXA
Insurance information: Toni@BergenImagingCenter.com ; kristen@bergenimagingcenter.com'),
  ('d0bab6ce-b222-52d0-8518-193b8dac7f4e', 'Hospitals', 'Hudson Regional Hospital (Home Sleep Medicine / Pediatrics)', false, NULL, NULL, 'Accepting all insurances - excepts OMNIA
Referral Email: scheduling@hudsonregionalhospital.com
Always cc’ed : nhaque@hudsonregionalhospitals.com
Radiology Email: radiology@hudsonregionalhospital.com'),
  ('0f9d03ce-efbe-5d29-a4c8-4b701aea06c5', 'Home health care', 'Bayonne VNA- Occupational therapy. Home physical therapy, nursing services', false, NULL, NULL, 'Does not take Dual Complete Options'),
  ('eb1d1534-aab2-5f44-8fec-3c97f5ee991c', 'Home health care', 'Bayada Home Health Aide', false, NULL, NULL, 'Dan Personal Rep Phone: 201-630-2158 OR 201-241-0203'),
  ('6fbe1756-a302-58d7-a4a9-226666c677aa', 'Home health care', 'Amedisys Home Health Care', true, NULL, NULL, NULL),
  ('7de1dc8a-6d41-5749-b58b-0aa341155782', 'Home health care', 'Always Home Care - only Medicaid', true, NULL, NULL, 'Att: Nicole
Demo, Clinicals, and Referral'),
  ('905aefba-68d6-57d8-852b-6868aadc8bde', 'Home health care', 'Carefinders', false, NULL, NULL, 'Does not take Medicare
( Fax Demo, clinicals, and referral to initiate process)'),
  ('3b14b36e-b593-56af-9648-0630e95b3c0e', 'Home health care', 'Promise Care (Home Physical Therapy too)', true, NULL, NULL, NULL),
  ('dbbd4fe0-c35b-5391-8564-5e7bbc70e10b', 'Home health care', 'Confident Care', false, NULL, NULL, NULL),
  ('41ab17e8-c465-530d-85a1-615adbcf4471', 'Home health care', 'Yanet''s Family Home Health (Main contact Yokasta)', true, NULL, NULL, NULL),
  ('82dabfb2-e324-53e5-8526-5e0392c6d45b', 'Home health care', 'Active Day Adult Daycare', false, 'northbergen@activeday.com', NULL, 'Take Medicare, Medicaid & Self pay
(Fax Demo,Insurance, and ID)'),
  ('d7d0a96e-4fa9-543a-8b0a-6564a39c3803', 'Home health care', '2nd Home Adult Medical Day Care', false, NULL, NULL, NULL),
  ('4bb10fff-faa9-52fc-8e1e-5482e12e6545', 'DME (medical equipment)', 'Ocean Home Health', false, NULL, NULL, 'Incontinence Supplies Fax: 877-294-0989'),
  ('d019cd9d-8d79-5bac-8df7-44c91d4cc418', 'DME (medical equipment)', 'Bergenline Medical Supply', false, NULL, NULL, '(No longer participating with Medicaid Insurances)'),
  ('a9964b9e-2367-5a5e-9eee-40eafddee7fa', 'DME (medical equipment)', 'At Home Medical (Hospital Bed)', false, NULL, NULL, NULL),
  ('f29d4531-6576-5def-a04c-4b37c8de3dbd', 'DME (medical equipment)', 'HomeCare Delivered', false, NULL, NULL, NULL),
  ('6672827c-03b8-516c-b19c-f31183e8da75', 'DME (medical equipment)', 'Home Care Delivered Physician Orders', false, NULL, NULL, NULL),
  ('cdf8466a-b339-5b11-9620-96c3f0d0639f', 'DME (medical equipment)', 'Family Medical & Surgical Supply', false, NULL, NULL, '( No acepting comercial plans)
( Clinicals, Rx, Insurance)'),
  ('77f81499-2dd4-503d-96ea-50c5783c55ed', 'DME (medical equipment)', 'MedFirst Homecare (Electric Scooters)', false, NULL, NULL, 'Webside: https://medfirsthomecare.com/'),
  ('655ed45b-2b42-599f-86d9-e2e5e6ed3679', 'DME (medical equipment)', 'Byram Incontinence Supplies', false, NULL, NULL, NULL),
  ('989a028f-9319-57cc-bf00-8d7bb61ee29d', 'Hospitals', 'Cristie Kerr Women''s Health Center', false, NULL, NULL, NULL),
  ('530189c9-9f65-5632-bc5d-dbfec46af1ec', 'Hospitals', 'Bayonne Medical Center', false, NULL, NULL, 'PET SCANS ARE DONE HERE TAKE HNJH
Fax Medical Records: 201-858-6562
Fax ( 201) 436-6101 (Gina)'),
  ('f2c2d6b4-c2aa-55bc-b33d-1c1b37a3d567', 'Hospitals', 'Clara Maass Medical Center', false, NULL, NULL, 'Fax Medical Records: 973-450-2608'),
  ('39ce85a4-2597-5d96-a0ea-f22f7c8ca2ef', 'Hospitals', 'Christ Hospital', false, NULL, NULL, '(medical records dpt)
Fax Medical Records (201)-795-8424
Phone Cardiology (201) -795-8334'),
  ('0d187c40-017e-5e68-a31a-d5ea8c80b942', 'Hospitals', 'Englewood Hospital', false, NULL, NULL, 'NPI #: 1952681918
FAX MEDICAL RECORDS: 201-608-2477
Medical records (most recent): 201-894-3169'),
  ('d567840d-a395-598d-a31f-1c756dd71308', 'Hospitals', 'Englewood Hospital — medical records radiology', false, NULL, NULL, 'Englewood Health Physician Network - Breast Surgery at Englewood (Open Saturdays from 8:30am to 3:30pm)
Ext: 7203'),
  ('0686054d-5bbc-5cf5-b06c-04317fd7d53b', 'Hospitals', 'Hackensack University Medical center', false, NULL, NULL, 'Phone Medical Records: (551) 996-2075
Fax Medical Records: 551-996-5164
Support Team Phone: (732) 897-2500
Account Number: 3911473'),
  ('c9aed6c9-5d75-5d53-beee-f98c6a9f7e6b', 'Hospitals', 'Hackensack Meridian Health (Palisades Medical Center)', false, NULL, NULL, 'Medical Records Fax: 201-854-8360 / 201-854-8546'),
  ('0d12480b-476a-513f-853f-623f42a06b02', 'Hospitals', 'Hoboken University Medical Center', false, NULL, NULL, 'Cardiology: 201-418-1850
Phone Medical Records: (201)-418-1458
Fax Medical Records (201)-418-1459'),
  ('1e9f6332-d958-5d13-9007-899cbec0c30a', 'Hospitals', 'Jersey City Medical Center', false, NULL, NULL, 'Fax Medical Records: 201-915-2559'),
  ('b1c48105-a1c9-5389-b60a-c9de230818c1', 'Hospitals', 'Interventional Radiology - for Thyroid biopsy', false, NULL, NULL, 'FAX OVER: Demographic, referral, US Thyroid results (Imaging), most recent clinical notes within 30 days.'),
  ('2685531a-19e2-5bd8-a3dd-8ad35f723bd1', 'Hospitals', 'JFK Medical Center', false, NULL, NULL, 'Fax Medical Records: (732) 549-8569'),
  ('c7617957-061b-5ea6-a7f1-2056b4856893', 'Hospitals', 'Palisade Medical Center', false, NULL, NULL, 'Ph Medical Records: 201-854-5081
Fax Medical Records (201) 854-8360/201-854-8546/ 201-489-0591
Ph OP Lab: 201-854-5046/5049
Fax OP Lab Fax: 201-854-3487
Group # HNJH 1165768'),
  ('c1f27c43-1313-58c4-806f-41126627e0ac', 'Hospitals', 'Hudson Regional Hospital', false, NULL, NULL, 'Contact: scheduling@hudsonregionalhospital.com
and CC: nhaque@hudsonregionalhospital.com
Email for referrals: referral form, facesheet, clinical notes as appropriate
Ph Radiology (201) 392-3518 ph lab(201)-392-3150
Fax Medical Records: (201) 325-6745'),
  ('e3b10734-9699-5f96-8165-b361b10356ba', 'Hospitals', 'Mountainside Medical Center', false, NULL, NULL, 'Fax Medical Records: 973-429-6967'),
  ('72ea4923-8e8b-5ec3-aae3-59c4c3a3544f', 'Hospitals', 'Newark University Hospital', false, NULL, NULL, 'FAX NUMBER FOR MEDICAL RECORDS: 973-972-2976'),
  ('c48785cd-508e-5d55-bc27-083d94376232', 'Hospitals', 'Saint Barnabas Medical Center', false, NULL, NULL, 'Phone Medical Records: 973-322-5835 Fax Medical Records: 973-322-5693'),
  ('adb97bf3-0b93-5f82-b73a-163b754f7da4', 'Hospitals', 'St Michael''s Medical Center', false, NULL, NULL, 'Fax Medical Records (973)877-5112
Phone to set up appt. for Stress Test (973) 465-2792'),
  ('0e07726e-f40b-5256-a416-2df740297cb7', 'Pharmacies', 'Pinto’s Pharmacy', false, NULL, NULL, NULL),
  ('e370edf4-b13e-5d3b-8199-1755fca809ad', 'Pharmacies', 'Middle Village Pharmacy', false, NULL, NULL, NULL),
  ('81852a8f-8266-5c10-8107-9d8f1d203cf8', 'Pharmacies', 'Novecks Pharmacy', false, NULL, NULL, NULL),
  ('297ccaa2-c758-5282-83bc-5d7f006ad6f6', 'Imaging / Radiology', 'Jersey Advanced MRI & Diagnostic Center', false, NULL, NULL, 'Open MRI - MRI - CT - US - XR - DEXA (NO CT w/ IV Contrast, Mammo, Breast US, or Echo)'),
  ('ea4e838e-605e-589f-99d6-97ff0f2aab2c', 'Imaging / Radiology', 'Hudson MRI', false, NULL, NULL, 'No BCBS, No Open MRI, No CT Scan, No Mammograms, No Echo
**Does Offer Transportation** MRI - MRA - US - XR - DEXA -'),
  ('437fab36-d2ae-5eb5-9ce0-d80cb71e6f85', 'Imaging / Radiology', 'Bergen Imaging Center, P.A.', false, NULL, NULL, 'Mammo & 3D Mammo - Breast US - Breast Biopsy - US - DEXA - Sonohysterography'),
  ('99b63229-e8a8-5ead-b8e7-8a6bd0ee79e9', 'Imaging / Radiology', 'ImageCare Radiology', false, NULL, NULL, NULL),
  ('d9a6c56c-c166-5637-89ab-f9f4f1b8fda9', 'Imaging / Radiology', 'American Radiology Group', false, NULL, NULL, 'MRI w/wo contrast - XR - US (NO CT, Mammo, Breast US)'),
  ('0496f77a-c64b-51f1-86e1-dfaeda033f18', 'Imaging / Radiology', 'Englewood Hospital Imaging', false, NULL, NULL, 'Fax: (201) 871-4995
https://www.englewoodhealth.org/service/breast-care- to make an appointment online.'),
  ('a1ba88f0-b542-5aac-97e2-3c87bdff62ec', 'Imaging / Radiology', 'Hackensack Radiology - Hoboken', false, NULL, NULL, 'Email: scheduling@hrgimaging.com'),
  ('9dcb3f14-a1da-505a-a9ed-a60946f79292', 'Imaging / Radiology', 'Advanced Magnetic Imaging', false, NULL, NULL, 'Does everything EXCEPT Mammograms, PET CT Scan'),
  ('f0eb50d4-e52c-5fee-aa04-9747a14a4627', 'Imaging / Radiology', 'Holy Name Medical Center - Radiology', false, NULL, NULL, 'MRI Ph: (201) 833-7272 / Fax: 201-541-5919
CT/Ultrasounds Ph: (201) 833-3280 / Fax:(201)541-5919/201-833-3071'),
  ('c04f3603-edf2-5231-a3a0-a59ff4f8970e', 'Imaging / Radiology', 'Specialty Portable X-Ray', false, 'SPXRequest@gmail.com', NULL, '(Must Email or Call for an appointment for the patient first. Then can email the patients demographics form from Elation (insurance, address so they know where to go, phone number, name, etc) and order.
Accepts All insurances - NO Medicaid
X-Rays (No Bone Density) Sonograms (No TVUS)
Hours Avail M-F until 7pm - Must Have Photo ID at appt'),
  ('5913c20f-2807-5378-9980-96dfe7d4bc09', 'Imaging / Radiology — self-pay prices', 'American Radiology Group', false, NULL, NULL, 'MRI W/O Contrast ……..$350
Abdomen W/O Contrast ….$400
MRA Brain W/O Contrast . $400
MRI W/WO Constrast ….....$500
Abdomen W/WO Contrast.. $500
MRA Carotid W/O Contrast.$450
X-Ray……………………......$40
X-Ray Flexion/Extension…..$75
X-Ray Bone Age…….$65
X-Ray..Scoliosis…...$120
General Ultrasound …………$120
Echocardiogram……………..$200
U/S Carotid…………..….……$150
U/S Arterial/Venous Doppler (unilateral).............................$175
U/S Anatomy………………...$175
U/S Growth & BBP…………….$100 each (individual)
U/S Non-Vascular Extremity …$150
U/S Arterial/Venous Doppler ( bilateral) ………………………$300
Jersey Advanced MRI
All body parts MRI''s Without contrast or with contrast if ordered.
CT scans for all body parts without IV contrast. We do CT scans of the abdomen and pelvis with oral contrast
We do all type of ultrasounds except breast ultrasound
We will start doing breast ultrasound once we get the approval for the mammogram machine from the state
We do all body parts for X-rays.
We are currently not doing Dexa scans , we will let you know once we have it.
MRI 3T …………………………………………………………………………………………………$400
MRI Open ……………………………………………………………………………………………...$350
CT ………………………………………………………………………………………………………$250
US ………………………………………………………………………………………………………$150
X-ray …………………………………………………………………………………………………….$50'),
  ('ead862fd-44e6-5329-ab0c-979591a4991b', 'Imaging / Radiology — notes', 'North Jersey Imaging Network (NJIN)', false, NULL, NULL, 'Scheduling Line: 800-930-6759
NPI: 1558348029
NPI: 1972689909 Group ID: 1149900
Jersey City at Summit (formerly Montclair)'),
  ('48983276-1374-53de-943f-7beff4d989ab', 'Imaging / Radiology — notes', 'Jersey Advanced MRI & Diagnostic Center', false, NULL, NULL, 'Open MRI - 3T MRI - CT - Ultrasound - X-Ray - DEXA'),
  ('2063c525-586e-54ce-af11-c189537d103a', 'Imaging / Radiology — notes', 'Holy Name Medical Center - Radiology', false, NULL, NULL, 'MRI Ph: (201) 833-7272 / Fax: (201) 833-7201
CT/Ultrasounds Ph: (201) 833-3280 / Fax:(201)541-5919
Holy Name will take care of PAs on behalf of the office. When sending/ scheduling imaging please make sure to send the following: Prescription with Diagnosis and CPT codes, Patients insurance card(front and back), demo, clinical history such as encounters, prior treatments etc. Fax this information to the attention of “Radiology Verification Office” to (201)541-6357.'),
  ('4cd936d8-3b5c-5e86-8070-d6517b56f0d7', 'Imaging / Radiology — notes', 'Lyndhurst Radiology Center', false, NULL, NULL, 'Medical Records Fax: 1 (866) 721-8909 (Joe) Pre-authorizations'),
  ('6f710c6d-1a1d-531c-b3a6-a5fba22abd6f', 'Imaging / Radiology — notes', 'Bergenline X-Ray Diagnostic Center', false, NULL, NULL, '(Does not do Tomosynthesis)
NPI: 1073787826'),
  ('c92df6e3-baf9-5ab7-9575-5cc780f7b14a', 'Imaging / Radiology — notes', 'Hackensack Radiology Group', false, 'monicareyestascon@gmail.com', NULL, 'Holy Name will take care of PAs on behalf of the office. When sending/ scheduling imaging please make sure to send the following: Prescription with Diagnosis and CPT codes, Patients insurance card(front and back), demo, clinical history such as encounters, prior treatments etc. Fax this information to the attention of “Radiology Verification Office” to (201)541-6357.'),
  ('d365d6d5-58ec-5369-9f3f-99ab855703b8', 'Imaging / Radiology — notes', 'EVACORE (PRIOR AUTHORIZATIONS- MEDS NOT COVERED THROUGH COVERMYMEDS)', false, NULL, NULL, NULL),
  ('55123309-988d-5a5e-924a-0f5e99f105ff', 'Imaging / Radiology — notes', 'Evicore (PRIOR AUTHORIZATIONS-IMAGING)', false, NULL, NULL, NULL),
  ('9167f989-2895-5f69-be58-7b170a219350', 'Imaging / Radiology — notes', 'Evicore (PRIOR AUTHORIZATIONS-IMAGING) — Clover, Aetna, Cigna, Oscar, Medicaid, Medicare', false, NULL, NULL, 'Clover Healthcare, Aetna, Cigna, Oscar, Medicaid and Medicare, Excelus'),
  ('006c49f3-f6b1-5170-b647-119e63d2239a', 'Imaging / Radiology — notes', 'AIM (PRIOR AUTHORIZATIONS-IMAGING) for Amerigroup', false, NULL, NULL, NULL),
  ('4a4418ab-863b-5176-b190-69d522e08cb0', 'Acupuncture', 'Fort Lee Acupuncture and Physical Therapy', false, 'rippleffect360@gmail.com', 'www.flap360.com', 'Accepts Medicare, Horizon BCBS, United Health, Cigna, Empire, AmeriHealth, and Aetna.'),
  ('9e236f9a-6d4c-5eb2-9127-fe4cb7e0bace', 'Acupuncture', 'Family Acupuncture Clinic', false, NULL, NULL, NULL),
  ('2ee6c987-16cf-5be8-b4c0-d6d514ac68c5', 'Acupuncture', 'Dr. Brian Chang', false, 'hoboken@drbrianchang.com', 'http://www.sportsacupunctureandfamilywellness.com', NULL),
  ('7e19ec72-9846-5d71-bdd5-712e10db4127', 'Allergist', 'Mathew M Verghese, MD', false, NULL, NULL, 'Not accepting United Healthcare w/ Medicaid or Aetna Better Health'),
  ('1ee51889-b982-54fd-b4c0-b13f46d1dc28', 'Allergist', 'Dr. Thomas Selvaggi', false, 'frontdesk@hackensackallergy.com', NULL, 'Hackensack Allergy and Asthma Center
(NOSE) Fax: (201) 343-7555'),
  ('9e907f03-5795-57ae-9b9d-4ff7ec5ff460', 'Alternative Medicine', 'Robin Ellen Leder, MD', false, 'a.better.alternative.medical@gmail.com', NULL, 'A Better Alternative Medical Center'),
  ('9a58872d-1b64-5367-9b1c-27ebdc11c7ed', 'Alternative Medicine', 'Kristin Wright McKitish, MD', false, 'INFO@ESHEALTH.COM', NULL, 'Evolved Science'),
  ('162a2893-db7b-5645-8365-f054897836b4', 'Alternative Medicine', 'Humaira Quraishi ND, MS', false, 'drhquraishi@gmail.com', 'www.natureshum.net', 'Naturopathic Medicine'),
  ('3d50e1d8-33e3-5bac-87a8-064ca664f4a6', 'Audiologist', 'Hear USA', false, NULL, NULL, 'Not accepting United Healthcare w/ Medicaid or Aetna Better Health'),
  ('3fb66a2f-21c9-5d65-a4af-29ae07e75c8d', 'Cardiology', 'Dr. Angel Mulkay / Dr. Michael Cohen (Interventional Cardiology)', false, NULL, NULL, 'Dr. Scott D. Ruffo / Dr. Joseph Yu, MD (Cardiac EPS)
Holy Name - Mulkay Cardiology Consultants
15 VerValen Street, Closter, NJ 07624 Phone: 201-996-9244 Fax: 201-996-9243'),
  ('9e441971-9d44-5428-ae00-4089290bec08', 'Cardiology', 'Dr. Raashan C. Williams (Interventional Cardiology)', false, NULL, NULL, NULL),
  ('ea6bbc20-8a40-51b6-93d0-8b488dacb699', 'Cardiology', 'Dr. Jose Santana / Dr. Umesh Katdare', false, NULL, NULL, 'Dr. Felix Dailey-Sterling (Interventional Cardiology)
Hudson Heart Group, PC (Englewood Health Physician Network)'),
  ('fb37e33a-edc1-50d5-b755-c04eba71a6fd', 'Cardiology', 'Dr. Fernando Segovia / Dr. Rick Pumil / Dr. Chris Pumil / Dr. Yaron Bareket / Dr. Irfan Admani', false, NULL, NULL, 'Cross County Cardiology - Does not accept HNJH, UHC community plan'),
  ('6c7738a9-c6c2-5c8b-99eb-57a9287bb1c1', 'Cardiology', 'Dr. Stephen Angeli / Dr. Tariqshah Syed (Interventional Cardiology)', false, NULL, NULL, 'Dr. David Wild / Dr. Shalin Desai / Dr. Gerard Eichman
Holy Name - Cardiovascular Specialists of North Jersey'),
  ('a5d0facf-309e-5f37-97ee-4691cd0b9a12', 'Cardiology', 'Dr. Hrach Kasaryan', false, NULL, NULL, NULL),
  ('41642506-40ef-51ad-91f7-a1561f6e8fbb', 'Cardiology', 'Dr. Zankhana Raval', false, NULL, NULL, NULL),
  ('03885766-395b-5be1-b947-2a358cc18dbb', 'Cardiology', 'Dr. David Fridman', false, NULL, NULL, NULL),
  ('306eaafd-56c6-5c6c-8439-41831176fc61', 'Cardiology', 'Dr. Haroon Faraz (Interventional Cardiology)', false, NULL, NULL, 'BERGEN CARDIOLOGY ASSOCIATES'),
  ('82e503b9-f63b-5169-ab2a-7f08f523663d', 'Cardiology', 'Dr. Anuj R. Shah', false, NULL, NULL, 'Apex Heart and Vascular Care'),
  ('afa8d400-4839-5a07-9044-7119d635634e', 'Cardiology', 'Dr. Hector Rubinstein', false, NULL, NULL, 'TAKES HNNJ FOR STRESS TEST'),
  ('1164894a-0e74-5e3c-8cc8-7de2792164ef', 'Cardiology', 'Dr. Luis Astudillo', false, NULL, NULL, NULL),
  ('b8531b03-ef3f-5f94-a36d-5e904be7a89f', 'Cardiology', 'Dr. Francis Kim', false, NULL, NULL, 'VMG Interventional and Structural Cardiology'),
  ('17aef8af-a496-5968-ab5a-50266395d2b1', 'Cardiology (Peds)', 'Dr. Mohy Kotb, MD (Pediatric Cardiology)', false, NULL, NULL, 'Hudson Pediatric Cardiology Center
$350.00 for consultation, ekg, and echocardiogram'),
  ('03eff78c-88aa-5815-9857-96abef0fc5df', 'Cardiology (Peds)', 'Dr. Courtney C. Peshkovsky, MD (Pediatric Cardiology)', false, NULL, NULL, 'Speaks Spanish, can apply for Charity Care Newark Beth Israel
Medical Specialty Services at Bayonne Pediatric Specialty Services'),
  ('5e3d3554-0a62-5b2b-820e-e07f8759901f', 'Chiropractor', 'Dr. Count Wiley', false, 'Countchiro@aol.com', 'https://friendsandfamilynj.com/', NULL),
  ('7996f0e8-ff7e-5cdd-be47-c70de8e26f3c', 'Chiropractor', 'Dr. Feodor A Sakatch', false, NULL, 'www.mygenesishealthclinic.com/', NULL),
  ('e53702e1-f13d-5342-808e-3783904e6243', 'Chiropractor', 'Dr. Alex Hernandez (Chiropractor and Acupuncture)', false, 'info@123yourhealth.com', 'www.123yourhealth.com', NULL),
  ('72ddb7da-60bc-5197-95e3-65f3897800b5', 'Dentist', 'Dr. Zenaida Mulkay / Dr. Guillermo Castillo (DMD)', true, 'northbergen@castillomulkay.com', 'https://www.castillomulkay.com/', 'Castillo & Mulkay Dental (NO Clover, Amerigroup, Medicaid. Will accept HNJH Total)
Email: passaic@castillomulkay.com'),
  ('ab42af2b-313b-5158-ab5e-cd29a490a5c7', 'Dentist', 'Dr. Giancarlo Ghisalberti (DMD)', false, NULL, NULL, 'Speaks Spanish and Italian'),
  ('29310b8a-f9c2-536a-b72d-b513d54b0b81', 'Dentist', 'Dr. Dennis Barbieri / Dr. Kenneth J Colameo / Dr. Nicholas Berardo (DMD)', false, 'northbergen@njoralsurgery.com', 'https://www.njoralsurgery.com/', 'NJ Oral Surgery (NO UHC-Medicaid)
Email: ridgefield@njoralsurgery.com
Email: hackensack@njoralsurgery.com'),
  ('0470d5d0-2147-5855-9cdf-8d33cd45e94f', 'Dentist', 'Dr. Louis R. Vita', false, NULL, NULL, 'Comprehensive Diagnosis and Therapy for TMJ Disorders in Adults and Children
Vita Head Neck and Facial Pain Center'),
  ('7b3d772a-6804-5df6-99c0-de7e8bbb06dc', 'Dermatology', 'Dr. Adolfo Carlos Fernandez-Obregon', false, NULL, NULL, 'English/Spanish Speaking / No medicaid'),
  ('1707a481-89cc-5ea3-b48b-4c5fd8e30a89', 'Dermatology', 'Dr. Jason Chouake', false, NULL, NULL, 'Email: info@cliffsideskinandlaser.com'),
  ('45c40137-9806-52fc-a182-1f3e5ad06455', 'Dermatology', 'Metropolitan Dermatology', false, NULL, NULL, 'English/Spanish Speaking/ No medicaid'),
  ('4bf41a5b-298a-54c1-b47a-96416519168e', 'Dermatology', 'Dr. Gloria Lin', false, NULL, NULL, 'No AmeriGroup/Wellpoint'),
  ('e3c5e5e3-6bcf-5acb-8537-f7a566d64e7e', 'Dermatology', 'Dr. Adriana Ros', false, NULL, NULL, 'Does not accept UHC Dual Complete and Community Plan
Website: https://drros.com/'),
  ('55164b2b-e28d-5ac2-bb89-81204e22716b', 'Dermatology', 'Schweiger Dermatology', false, NULL, 'https://www.schweigerderm.com/locations/#new-jersey', 'Accepts most insurances including Horizon NJ Health
NPI#: 1104229392'),
  ('5eece8da-b407-5f35-b3d7-e2297a475306', 'Dermatology', 'Herman Dermatology', false, NULL, NULL, 'Does not accept Medicaid Insurances, Amerihealth, Clover'),
  ('9f9081c5-af12-5b78-8224-ae137bb996cd', 'Dermatology', 'MDCS Dermatology: Medical Dermatology and Cosmetic Surgery', false, NULL, NULL, '401A South Van Brunt Street, Suite 403 Englewood, NJ 07631 Phone: (201) 431-9146'),
  ('04ecfbd5-5493-5e87-9b98-52da484a73c8', 'Endocrinology', 'Dr. Yudi Camacho', false, NULL, NULL, 'Speaks English/Spanish, Accepts Medicaid as well- Does NOT take UHC
(Wny), Phone: 551-325-2662(J.C) Fax: 201-520-1085'),
  ('e6c47783-a38a-57c3-bf03-923632d2958b', 'Endocrinology', 'Dr. Sonal Pathak, Dr. Yazan Vwich', false, NULL, NULL, NULL),
  ('1901085c-10ba-5d4f-88dc-e1df7d61adfc', 'Endocrinology', 'Dr. Vanessa Barboza', false, NULL, NULL, 'Speaks English/Spanish'),
  ('969f563d-302e-50d3-a5a2-7535fec49095', 'Endocrinology', 'Dr. Merab Joseph', false, NULL, 'https://www.northjerseydiabetes.com/', '(Does not accept Aetna Comm, MagnaCare)'),
  ('f4547d72-fcb2-57ee-977d-484b0aae41c1', 'Endocrinology', 'Dr. Ari Geliebter (Adult) / Dr. Rebecca Geliebter (Pediatric)', false, NULL, 'https://comprehensiveendo.com/', NULL),
  ('63078365-aea6-5c5b-92c4-846958c3b330', 'Endocrinology', 'Dr. Ari Eckman, MD', false, NULL, NULL, NULL),
  ('6db99c88-3b15-5acf-a24d-61ac57b67dbd', 'Endocrinology', 'Pediatric Endocrinology', false, NULL, NULL, 'Dr. Steven Nigel Ghanny'),
  ('d225962c-d044-546e-8035-61bb7235e169', 'Endocrinology', 'Dr. Rebecca F. Geliebter', false, NULL, NULL, NULL),
  ('7a878442-138e-5c66-8262-5d3ac8c30706', 'ENT', 'Dr. Jeffrey M. Shaari', true, NULL, NULL, 'Not in network with HNJH/ Fidelis/UHC Dual complete - NPI# 1891742342'),
  ('af08250e-f63e-5c93-8d3e-f4f86b0fe7e3', 'ENT', 'Dr. Evan Sarti', true, NULL, 'https://www.summithealth.com/doctors/evan-sarti-do', NULL),
  ('a2ca0186-d7c6-5bed-89ff-be3feb9a32bf', 'ENT', 'Dr. Shari Reitzen', true, NULL, NULL, 'Riverside Medical Group NPI # 1578665048'),
  ('a013397a-7417-5c0f-bf94-5adfc33ce35f', 'ENT', 'Englewood Ear Nose & Throat', true, NULL, NULL, 'Not in Network with UHC'),
  ('7fa41d42-0af0-514c-b4b5-008c835c993d', 'ENT', 'Dr. Babak Behin, MD', true, NULL, NULL, NULL),
  ('6ab042b1-ca26-5e41-9cb0-6b14391cbcc6', 'Gastroenterology', 'Dr. John Sotiriadis, MD, PHD / Dr. Peter Caride MD / Dr. Smrita Sinha, MD', false, NULL, NULL, 'Not in Network with UHC Community Plan, Amerigroup, Wellcare Medicaid, Aetna Medicaid + Comm
NPI: 1659578664'),
  ('00dc1310-f29b-5cf3-86e1-04833046624c', 'Gastroenterology', 'Dr. Mauricio Zapiach', false, NULL, NULL, 'Not in Network w/ Medicaid(UHC dual complete/community plan, Wellcare Medicaid/HMO Medicare),Oscar'),
  ('70724ae6-499b-5a7c-b7d0-1dca0f995ea6', 'Gastroenterology', 'Dr. Jose Churrango', false, NULL, NULL, 'Languages Spoken ( English-Spanish) - Not in Network with UHC Dual complete'),
  ('f264fc82-21e0-509b-b979-9a761cf6e70d', 'Gastroenterology', 'Dr. Domenica Barritta / Dr. Gregory Lesser', false, NULL, NULL, NULL),
  ('91698c8b-3e42-555f-98cd-ab37a29bdf24', 'Gastroenterology', 'Dr. Jeffrey M Raskin / Dr. Harold Tepler', false, NULL, NULL, 'Not in Network with Medicaid, Wellcare Medicare, Oscar
Phone: 201- Fax: 201-792-7812'),
  ('f879f6ce-3db4-5661-a064-9cedbbdb3284', 'Gastroenterology', 'Dr. Harry Snady', false, NULL, NULL, 'Not in Network with Amerigroup Plan, Medicaid, Oscar'),
  ('1dc1083e-86ec-5d71-a54b-6d2775087136', 'Gastroenterology', 'Dr. Steven C Goldstein, Dr. Meron Debesai, MD', false, NULL, NULL, 'Accepts Wellcare Medicaid/ Not in network with any Aetna Commercial , Oscar
Group ID HNJH#: 60067523 NPI #: 1780740860'),
  ('063ac86f-ad25-5056-a014-75533e4f515a', 'Gastroenterology', 'Michael F. Demyen, MD', false, NULL, NULL, 'Languages Spoken ( English-Spanish)-
Not in Network with UHC Community Plan- Dual complete and Aetna Better Health'),
  ('9e45c536-002b-592e-9883-ce008bd5cbd4', 'Gastroenterology', 'Dr. Haroon Shahid, Dr. Avik Sarkar, Dr. Jennifer Hsieh', false, NULL, NULL, 'Carepoint'),
  ('790329ba-0fbc-575d-9ead-c6935832f46e', 'Gastroenterology', 'Anil Agarwal, MD', false, NULL, NULL, 'Languages Spoken ( English-Spanish)'),
  ('399c2ed7-7359-59ff-b374-ac579a793119', 'Hepatology', 'Dr. Andrew De La Torre', false, NULL, NULL, NULL),
  ('93c0b1e2-366e-5bb0-8e5e-f6dda4544806', 'Hepatology', 'Dr Maliha Ahmad', false, NULL, NULL, NULL),
  ('e446e3c7-0b82-5b93-bf5d-57515268aa05', 'Hepatology', 'Dr. George Abdelsayed', false, NULL, NULL, 'Head of the Hepatology Division at Hudson Regional Hospital'),
  ('c6f4dee1-0896-5ce1-88b3-44860ba25848', 'Hepatology', 'Dr. Charissa Chang', false, NULL, NULL, 'Mount Sinai'),
  ('58915bca-1dea-5e30-b0f2-3ae06bc9faa6', 'Hematology / Oncology', 'Dr. Bhavna Gupta', true, 'jerseyhemonc2018@gmail.com', 'https://www.jerseyhemonc.com/', 'Takes all insurances NPI #1801074455'),
  ('02729813-0a7d-5bfc-8c01-db42f661801a', 'Hematology / Oncology', 'Dr. Simon Badin', true, NULL, NULL, 'Not in Network with Fidelis
Languages Spoken ( English-Spanish)'),
  ('f000131a-1019-54d9-9af3-e212fdf191e8', 'Hematology / Oncology', 'Dr. Amit Patel', false, NULL, NULL, 'Astera Cancer Care'),
  ('6746540a-1a75-5d0a-b4cb-77cce1b1d06a', 'Hematology / Oncology', 'Dr. Yadyra Rivera, Dr. Jason Lee, Dr. Vikram Premkumar', false, NULL, NULL, 'Holy Name'),
  ('c3f11295-72b9-5415-bb90-fcd7f05d9763', 'Hematology / Oncology', 'Dr. Damanjit Ghuman, Dr. Jieqi Lio', false, NULL, NULL, 'Hudson Hematology Oncology'),
  ('465601a2-8562-5a46-b5e0-95838524e2e1', 'Radiation Oncology', 'Dr. Benjamin Rosenbluth (Radiation Oncology)', false, NULL, NULL, 'Holy Name'),
  ('ab0440f3-d492-524c-a0fe-c65a72137f12', 'Infectious Disease', 'Dr. Benjamin De La Rosa (spanish speaking)', false, NULL, NULL, NULL),
  ('df848863-d288-5821-ac3b-eb49e0fdb7db', 'Fertility', 'RMA Network', false, NULL, NULL, 'Jersey City'),
  ('b31ad97a-cf39-5a88-afe2-a97248640b03', 'Fertility', 'Englewood', false, NULL, NULL, '25 Rockwood Place, Suite 320 Englewood, New Jersey 07631 Phone: 201-569-7773
Website: rmanetwork.com'),
  ('c271ab5d-880c-582d-99d9-5679dfb654aa', 'Fertility', 'Dr. Eric Seaman (MALE FERTILITY)', false, NULL, NULL, 'Including Vasectomies
Phone (appointments): 973-253-4256 | Phone (general inquiries): (973) 218-9400
Phone (appointments): 973-327-7457 | Phone (general inquiries): (973) 586-3056'),
  ('b50b4b62-630f-534d-9fd8-4fda0baf3a67', 'Neurology', 'Dr. Ashish Kapoor', false, NULL, NULL, 'Does not accept HNJH'),
  ('168a67d5-8e73-5827-8ec6-3ce1172ff1ff', 'Neurology', 'Dr. James Charles, MD', false, NULL, NULL, NULL),
  ('585810e5-83a3-50fa-9bbc-7325189def87', 'Neurology', 'Dr. Nagesh Krish (It does not have an interpreter for Spanish)', false, NULL, NULL, 'NPI #: 1710918115 - Does not accept HNJH, ONLY WELLCARE AND UNITED'),
  ('8f954502-4691-5287-947b-489ab2ed0d72', 'Neurology', 'Dr. Farzana Nanavati', false, NULL, NULL, 'Advanced Neuromed'),
  ('69dea27b-4d8e-5c86-adbe-832cb5a6a241', 'Neurology', 'Dr. Nilay Shah', false, NULL, NULL, NULL),
  ('53ee3c56-6aa5-5a9d-93b4-57f85daffc8f', 'Neurology', 'Dr. Marissa Oller-Cramsie / Dr. Thomas Kreibich / Dr. Joseph Petrsoric', false, NULL, NULL, 'Holy Name - DOES NOT ACCEPT MEDICAID'),
  ('0c0d4e7e-89e8-50e2-b9c2-9b457c4ce86a', 'Neurology', 'Dr. Nalini Prasad', false, NULL, NULL, 'Does not accept HNJH, AmeriHealth'),
  ('cc62dc3b-e0c7-5c84-8d2e-41cee699ad94', 'Neurology', 'Dr. Ravinder Tikoo', false, NULL, NULL, 'DOES NOT ACCEPT AMERIHEALTH,'),
  ('3ee97184-305b-54e4-aba8-2eadd10ea5f5', 'Neurology', 'Dr. MaryAnn Picone (Multiple Sclerosis)', false, NULL, NULL, 'Holy Name'),
  ('57b8cc74-efcb-5999-9be1-a27d1d6646d9', 'Nutritionist', 'Perla Nelson, MBA, RDN: (Dietitian-Nutritionist)', false, NULL, 'www.medicalnutritionofnj.com', 'Accepts insurance, Speaks Spanish, Pediatrics & Adult (NPI: 1467712828)
& (862) 257-1297 Fax: 888-442-1408
Email: info@medicalnutritionofnj.com & mnnewjersey@yahoo.com'),
  ('316c59ee-8d24-54e7-82c3-c93096dfff35', 'Nutritionist', 'Culina Health (Dietitian-Nutritionist)', false, 'info@culinahealth.com', 'www.culinahealth.com', 'Accepts most major insurance plans (i.e. Aetna, Amerihealth, BCBS, Cigna, UHC, and Medicare)
Speaks Spanish, Pediatrics & Adult (Group NPI: 1700537883) Affordable self pay options available'),
  ('90423dc1-917b-5b88-89ef-82e39c3491fe', 'Nutritionist', 'My Healthy Living- Medical Nutritionist (Peds/Adults)', false, NULL, NULL, NULL),
  ('1b68a7c2-1a26-5ab8-a118-0a14131e5504', 'Nutritionist', 'Bessen, Debbie, RD', false, NULL, NULL, NULL),
  ('e41f4014-ed8c-5e34-aeb2-93a4ff7cea98', 'Nutritionist', 'EverLong (Virtual Nutritionist)', false, NULL, 'https://geteverlong.com', 'No Medicaid plans at the moment'),
  ('cedafd7e-c1e8-5ca3-8f9a-aff59cf9a91d', 'Nephrology', 'Dr. Clenton Coleman / Dr. Diane Triolo / Dayra Soto, NP', true, NULL, 'https://clentoncolemanmd.com/', 'Holy Name
Fax: 201-868-7185 // Fax: 201-357-8206
NPI: 1730379025'),
  ('3a0661a6-db99-5cae-b2ed-644c86f0fca1', 'Nephrology', 'Dr. Danny Haddad / Dr. Bassam Haddad / Dr. Narender Goel / Dr. Deepika Jain', false, NULL, 'https://www.newjerseykidneycare.com/', 'Dr. Lochana Manandhar / Dr. Niveen Bebawy
New Jersey Kidney Care'),
  ('fdafe991-e0ea-5934-be3a-c8ec1581b67b', 'Nephrology', 'Dr. Sanford Cooper', false, NULL, NULL, NULL),
  ('d51c930e-3c07-505d-b565-2c6d3f974585', 'Nephrology', 'JK Nephrology & Hypertension - Dr. KwonSoo Kim MD (spanish speaking)', false, NULL, NULL, 'frontdesk@jknephrology.com'),
  ('62f8b50e-a711-52d5-ac4e-94cf3bda7c84', 'OB/GYN', 'Dr. Ruben Barrera Vera (Gynecology)', true, NULL, NULL, 'Spanish Speaking'),
  ('20d1e795-600c-5613-9e09-1fbc16e3289c', 'OB/GYN', 'Dr. Payal Shah (Ob/Gyn)', true, NULL, NULL, 'Holy Name - Women''s Health Care Group'),
  ('c6d03f7b-6052-52d6-b6c9-e8dfd19590e0', 'OB/GYN', 'Darlene Clemente, APN', true, NULL, NULL, NULL),
  ('8fa2278c-312c-5bae-9872-2b7a00c0943a', 'OB/GYN', 'Dr. Anita Chait', false, NULL, NULL, NULL),
  ('7f5d2321-a34f-5212-acb9-808eb7530a3c', 'OB/GYN', 'Dr. Arthur Gross (Ob/Gyn)', false, NULL, NULL, 'Englewood Women’s Health'),
  ('986f481a-c049-57c6-bdd8-ce34b5f41443', 'OB/GYN', 'Dr. Natasha Chinn / Dr. Samantha Lowe ( OBGYN )', false, NULL, NULL, 'Englewood Health Group - Brescia and Migliaccio Women''s Health - No aetna better health'),
  ('14f18e80-024d-5e70-8f6d-09e5658fe90e', 'OB/GYN', 'Dr. Tamara Aviles, Henry Fernandez-Cos, MD (ObGyn)', false, NULL, NULL, 'Affiliated with Holy Name'),
  ('dd8634c7-2a29-5b41-9294-811622f4e2b2', 'OB/GYN', 'Dr. Stefano Stella (Gynecology)', false, NULL, NULL, NULL),
  ('c198be68-b13b-524e-9a7a-f268e0f528ef', 'OB/GYN', 'Dr. Bruce Bennett (ObGyn)', false, NULL, NULL, NULL),
  ('34f0f26a-a9ef-5cc5-a89b-b7fa27cdeb27', 'OB/GYN', 'Comprehensive Women''s Care', false, NULL, NULL, 'Do not accept Medicaid Insurances'),
  ('6c700834-1e3e-5ec8-964e-3c110f1c2eb7', 'OB/GYN', 'Dr. Osbert Fernandez (OBGYN)', false, NULL, NULL, NULL),
  ('25df6260-8b8a-5abe-8431-8a03a1e4a4a9', 'OB/GYN', 'Dr. Potter McQuilkin (OBGYN)', false, NULL, 'https://www.lavishrejuvenation.com/', 'Lavish Rejuvenation- Private practice
Out of pocket cost- Does not take insurance.'),
  ('acd1de4c-e2cd-5c2e-a872-aaa751624979', 'OB/GYN', 'Dr. David Principe (MFM)', false, NULL, 'https://www.davidprincipemd.com/', NULL),
  ('5fadc06d-2c89-5ae2-b830-a0bfdcf293db', 'OB/GYN', 'ENDOMETRIOSIS SPECIALIST', false, 'Info@drvidali.com', NULL, 'Dr. Andrea Vidali
Website: Home - Endometriosis Treatment Center NYC'),
  ('49e105a8-026d-5477-b058-bb631ea4ae48', 'Family Planning', 'Hoboken Family Planning Inc', false, NULL, NULL, '*Does NOT perform Terminations*'),
  ('a0f069d4-a48c-5946-84f4-9133a941c13f', 'Family Planning', 'Planned Parenthood', false, NULL, NULL, NULL),
  ('e4671b6a-8f7a-592b-81fb-14c01ae76d6d', 'Family Planning', 'Dr. Eric Seaman (MALE FERTILITY)', false, NULL, NULL, 'Including Vascetomies
Phone (appointments): 973-253-4256 | Phone (general inquiries): (973) 218-9400
Phone (appointments): 973-327-7457 | Phone (general inquiries): (973) 586-3056'),
  ('63017536-7531-596d-b457-2ecd7d065818', 'Optometry (OD)', 'Dr. Elizabeth Suarez-Garita (speaks spanish)', false, NULL, NULL, 'No longer taking Amerihealth
Website: https://www.garitavisioncenter.com/ Email: garitavisioncenter@gmail.com'),
  ('46afea21-b0d4-5885-a691-31b49f7d50b7', 'Optometry (OD)', 'Dr. Anthony Gurdak (speaks spanish)', false, NULL, NULL, 'No longer taking Amerihealth'),
  ('fd5acecb-c5ae-5793-a3be-ec2249f105f8', 'Optometry (OD)', 'Dr. Rodolfo L Rodriguez (speaks spanish)', false, NULL, NULL, NULL),
  ('b4134a67-17a1-5dd9-b3d4-3348c04f9e35', 'Optometry (OD)', 'Dr. Nieves Fernandez', false, NULL, NULL, '(Not Accepting Medicaid Insurance)'),
  ('27bce84b-e15c-51a5-a042-37c5f3240421', 'Optometry (OD)', 'Smart Eye Care', false, NULL, NULL, NULL),
  ('dc3395c8-cb29-5799-80ff-53d4396034e8', 'Ophthalmology (MD)', 'Dr. Luis Gonzalez (spanish speaking)', false, NULL, NULL, 'NJRetina
Website: https://www.njretina.com/'),
  ('9c5a1e9b-c4ec-5a1f-b10e-5a655fdbf3f7', 'Ophthalmology (MD)', 'Fasano Armand MD', false, NULL, NULL, NULL),
  ('b2643ec8-77e2-51ab-b3c2-8794e5cf338a', 'Ophthalmology (MD)', 'Dr. Steven W. Braunstein, MD', false, NULL, NULL, 'Phone: 201-869-323 Fax: 201-869-8235'),
  ('dc30fa31-6e6d-52bb-8901-9b0f590645fa', 'Ophthalmology (MD)', 'Dr. Claudio D''Alberti', false, NULL, NULL, 'D’ Alberti Eye Center
Website: http://www.dalbertieye.com'),
  ('d4157ff5-3d21-5b8f-a3be-0c30a6fff296', 'Ophthalmology (MD)', 'Hudson Eye Specialists', false, NULL, NULL, 'NPI#: 1376593863'),
  ('4a136e02-eef1-5588-a5d3-ab43b564f724', 'Ophthalmology (MD)', 'Dr. Anthony Panariello', false, NULL, 'https://palisadeeye.com/staff/anthony-panariello-md/', 'Palisade Eye'),
  ('280b7838-fb09-514c-90e2-90c88d9c146d', 'Ophthalmology (MD)', 'Dr. Adnan Mallick, M.D', false, NULL, 'https://www.retinacenternj.com/', NULL),
  ('d94beb2c-5c16-5a44-8674-9d31a42aebf5', 'Palliative Care', 'Dr. James Morgan / Dr. Richard Rosenbluth', true, NULL, 'www.holyname.org/palliativecare', NULL),
  ('c6262c07-5120-5506-bcdd-23f5b2392462', 'Pain Management', 'Dr. Aditya Patel', true, NULL, NULL, 'Does NOT accept UHC DUAL COMPLETE - Spanish translator readily available
Website: https://www.sprinstitute.com/ Email: office@sprimedical.com'),
  ('9e1ae083-b4f7-54cf-ba9b-73f8ed1c1465', 'Pain Management', 'Dr. Felix E Roque (speaks spanish)', true, NULL, NULL, 'Does NOT accept Medicaid, Amerihealth, UHC DUAL COMPLETE
Website: https://www.drroque.net/ Email: info@drroque.net'),
  ('fca5ff6e-3504-5b63-a6dc-9c5035c79e8a', 'Pain Management', 'Redefine Healthcare (speaks spanish)', true, NULL, NULL, NULL),
  ('a3686f3f-00a7-53b8-8137-179ca538cd7b', 'Pain Management', 'Dr. Sumeet Arora / Dr. Rahul Sood Dr. Sachin K. Shah / Dr. Roy Liu', true, NULL, NULL, 'Does NOT accept Medicaid (nor medicaid-medicare type plans) - Spanish translator readily available
Website: https://www.metropaincenters.com'),
  ('fc232063-85ee-5d45-b5e1-98841a2835e8', 'Pain Management', 'Dr. Kevin Ko', false, NULL, NULL, 'SamWell Institute for Pain Management, Englewood, NJ'),
  ('a5f4bbe4-ba7a-54ae-9b3d-d774128fe2b8', 'Pain Management', 'Dr. Robert F. Strell', false, NULL, NULL, 'NO WELLCARE / HNJH Physical Medicine & Rehabilitation
Website: https://drrobertstrell.com/'),
  ('2b3d5b3e-7f78-5e68-8010-7bc906476231', 'Pain Management', 'Dr Gregory Lawler', false, NULL, NULL, 'No accept MEDICAID, Amerihealth, UHC
Website: https://northjerseyinterventionalpain.com/'),
  ('0313257b-b367-5456-8cf0-2e547f42706d', 'Pain Management', 'Dr. Edwin Constantino', false, NULL, NULL, 'TAKES UHC Community Plan - Physical Medicine & Rehabilitation'),
  ('b6c37c97-8858-58b2-9799-c3452cbf0e9a', 'Pediatrician', 'Harry Banschick, MD', false, NULL, NULL, '(Dr. Maria Dominguez available select days. Both providers speak Spanish)'),
  ('cd29e72d-68a1-5b33-9091-397a40f8d288', 'Physical Therapy', 'Tru Physical Therapy', false, NULL, NULL, 'does not accept Medicaid
Website: www.truphysicalrehab.com'),
  ('5d864754-d9b4-52d0-9ea2-d8da7cbdb9e3', 'Physical Therapy', 'Tawil Physical Therapy & Sports Performance, PA (Provide transportation w/Town WNY)', false, NULL, NULL, 'does not accept Medicaid
Website: www.Tawilpt.com'),
  ('ed137cc0-2460-5c26-9870-4f3cd607c117', 'Physical Therapy', 'Total Care Physical Therapy', false, NULL, NULL, 'Accepts Amerihealth, Aetna, Cigna, Clover, Fidelis, Humana, Horizon BCBS, UHC Dual Complete
Website: www.totalcare-pt.com'),
  ('38ca4a7f-fc3e-5933-b167-f2c5f014808f', 'Physical Therapy', 'Fort Lee Acupuncture and Physical Therapy', false, NULL, NULL, 'Accepts Medicare, Horizon BCBS, United Health, Cigna, Empire, AmeriHealth, and Aetna.
Website: www.flap360.com'),
  ('27384f45-0e4a-5fb7-b748-d52cbe7920b9', 'Physical Therapy', 'Orlando Physical Therapy', false, NULL, NULL, 'Website: www.orlandopt.com'),
  ('52c23f45-f321-5d8e-8afe-6e2410cb4d00', 'Physical Therapy', 'Top Choice Physical Therapy and Wellness', false, NULL, NULL, 'DOES NOT ACCEPT AMERIGROUP NJ Community Plan
Website: https://topchoicept.com/'),
  ('ded4c7f9-95a5-576c-b337-08ece3a27a3f', 'Physical Therapy', 'Hudson Premier Physical Therapy & Sports', false, NULL, NULL, '(DOES NOT ACCEPT AMERIGROUP = does not accept HNJH-HorizonTotal Care) - Sandra Gail
Website: https://hudson-pt.com/'),
  ('bb1834b6-14af-58a9-a06c-65e6b73dcb1a', 'Physical Therapy', 'Align Care Physical Therapy (Nicky Shah, PT)', false, NULL, NULL, '( All insurances, and only physical therapy at home)
E-mail: 1aligncarept@gmail.com'),
  ('910b769c-e20e-57ab-9f20-e584f037619a', 'Physical Therapy', 'Attain Physical Therapy', false, NULL, NULL, NULL),
  ('21875f5e-193e-55b6-adb1-2f34954a49b4', 'Psychiatry', 'PAX Health', false, NULL, 'www.Paxhealth.net', 'Takes all insurances - English and Spanish speaking - Telemedicine consults available'),
  ('34a137d4-4b95-546a-b8e9-5a831146173e', 'Psychiatry', 'Dr. Yissell Delvalle', false, NULL, NULL, 'Speaks spanish'),
  ('fdaaa377-59b0-52a6-825d-e88cab0dbf0d', 'Psychiatry', 'Dr. Aykut Ozden', false, NULL, NULL, NULL),
  ('eae069c7-e2db-5465-aa89-cd739e163aea', 'Psychiatry', 'Hamilton Behavioral Health', false, 'Hamiltonbehavioralappointment@gmail.com', 'https://hamiltonbehavioralrtms.com', 'Telemedicine consults available'),
  ('e19d3f14-e136-5de6-a7f9-e3d93f294adb', 'Psychiatry', 'Wellbrook Health', false, 'contact@mywellbrook.com', 'www.mywellbrook.com', 'Takes all insurances, English/Spanish, Telehealth or In-Person
Hours: Monday–Friday 9am–6pm (Weekend/evening appointments available by request)'),
  ('54f43669-603b-5613-8fdb-38a97259fa2d', 'Psychiatry', 'Happier Living', false, 'contact@myreservoirhealth.com', 'https://myreservoirhealth.com', 'Telemedicine available- English and spanish
Aetna, BCBS, Cigna, Humana, Optum, United Healthcare PPO plans Cigna, Humana, Optum, United Healthcare HMO plans Medicare ( not accept Medicaid)
Dr. Cohen-Weisinger ( Spanish speaking)
The link for appointment request is: www.happierliving.com
Reservoir Behavioral Health
Telemedicine only – speaks English, Spanish, Chinese or Turkish. (Alexia Totoro Psychotherapist)
Horizon (including NJ Health), Amerigroup, Wellcare, Aetna, UHC, and Medicaid'),
  ('274f5da9-e63f-5d61-b24b-a79c8f3f84a7', 'Psychiatry', 'Freeway Psychiatry', false, NULL, NULL, 'Takes all insurances'),
  ('d2cccb09-0cff-5ce7-9de5-727eb277b237', 'Psychiatry', 'Grace Medical Care', false, NULL, 'https://gracemedicalhealth.com/appointment-request', 'Takes all insurances'),
  ('0362bf97-facc-55d8-84d5-2c4ce1e2a151', 'Psychiatry', 'Dr. Mercedes Rudelli, MD', false, NULL, NULL, NULL),
  ('1233b524-cd45-506c-9078-f18d67632240', 'Psychiatry', 'Dr Oscar E Sandoval Castellanos', false, NULL, NULL, '(Not currently accepting new patients)'),
  ('6a38b6b1-0d74-54e1-a6cb-34c27f3978de', 'Psychiatry', 'Dr. Miriam Levine (Child & Adolescent Psychiatry)', false, NULL, NULL, NULL),
  ('e8f40046-db0d-589c-b5f5-c84f8bb69880', 'Psychiatry', 'Bridgeway Crisis intervention services (Same day evaluation)', false, NULL, NULL, NULL),
  ('037c77f2-0f61-558f-8f9e-10efe15edb75', 'Psychiatry', 'Dr. Arturo Luis Marrero-Figarella', false, NULL, NULL, NULL),
  ('b04261f2-c003-521e-bdd9-6181f6d8edf3', 'Psychiatry', 'Everest Wellness & Behavioral Services', false, 'info@everestwellnessllc.com', NULL, 'Web: Everest Wellness (everestwellnessllc.com)'),
  ('21f5f219-bad9-59a6-ad40-d2b51515b301', 'Psychiatry', 'Alma -Manita Shrestha', false, NULL, 'https://www.christianhealthnj.org', 'Individual therapy Medication management
Manita Shrestha, NP - Alma (helloalma.com)
For Questions: info@helloalma.com
Christian Health'),
  ('e058e2ee-ee8c-56da-87a0-b0540d6b4126', 'Psychology (Therapy)', 'Caridad E Garciga , LPC', true, NULL, NULL, 'English and Spanish Speaking'),
  ('08d2124c-d258-5513-8fb1-f8ed1e25f58b', 'Psychology (Therapy)', 'D’Amor Mental Health Center - Anay Vazquez', true, NULL, NULL, 'English and Spanish Speaking'),
  ('2dc6c239-bcf2-5108-ae81-654ea8c2b437', 'Psychology (Therapy)', 'PAX Health', false, NULL, 'www.Paxhealth.net', 'Telemedicine available - Takes all insurances - English and Spanish speaking'),
  ('c0dff40a-8468-5f35-a1f3-60b473d76b13', 'Psychology (Therapy)', 'Hamilton Behavioral Health', false, 'Hamiltonbehavioralappointment@gmail.com', 'https://hamiltonbehavioralrtms.com', 'Telemedicine available'),
  ('8f33a11d-2346-5996-8b3b-bb3cb55d73da', 'Psychology (Therapy)', 'Wellbrook Health', false, 'contact@mywellbrook.com', NULL, 'Takes all insurances, English/Spanish, Telehealth or In-Person'),
  ('ec1f3123-e21a-5fe6-bcde-fa28dca98f78', 'Psychology (Therapy)', 'Happier Living', false, 'contact@myreservoirhealth.com', NULL, 'Telemedicine available - Not accept Medicaid - English and spanish
Dr. Cohen-Weisinger ( Spanish speaking)
The link for appointment request is: www.happierliving.com
Reservoir Behavioral Health
Telemedicine only – speaks English, Spanish, Chinese or Turkish. (Alexia Totoro Psychotherapist)
Horizon (including NJ Health), Amerigroup, Wellcare, Aetna, UHC, and Medicaid'),
  ('0b64619f-d6e5-5639-aa83-372c3fcd21d7', 'Psychology (Therapy)', 'Freeway Psychiatry', false, NULL, NULL, 'Takes all insurances'),
  ('3431b5b8-867b-5b82-8eeb-e7a7114d5900', 'Podiatry', 'Dr. Jonathan Purisima', true, NULL, NULL, 'NPIa #: 1508003534'),
  ('420427ec-f01a-59d6-9809-c5fd220532b5', 'Podiatry', 'Dr. Sandy Amador, Jose Grullon Dpm', true, NULL, NULL, NULL),
  ('50997205-b688-52d7-8b1b-3653479046fb', 'Podiatry', 'Dr. Christopher Samaniego', false, NULL, 'www.advancedmedicalgroupnj.com', 'Also sees pediatric patients'),
  ('a57b8216-9c49-5180-8e5d-3c9558410c74', 'Podiatry', 'Dr. Lenny Ramirez', false, NULL, NULL, 'Does not take Aetna Medicaid'),
  ('77921466-53b3-544c-b008-bd061dc0c606', 'Podiatry', 'Dr. Demetrios Econopouly', false, NULL, 'https://www.palisadesfootandankle.com/', NULL),
  ('b2ebed1d-91bf-5ea8-9c8f-6d6582746d7d', 'Pulmonology', 'Dr. Victor Gorloff / Dr. Richard May / Dr. Harris B. Tesher / Dr. Theophanis Pavlou (Sleep Med)', true, NULL, 'www.njlung.com', 'Not in Network with UHC- Community Plan and Dual Complete
Holy Name - Pulmonary Specialists of North Jersey'),
  ('e8b0a608-69af-50f6-a3aa-025a30a2722e', 'Pulmonology', 'Dr. Jose Gomez Marquez / Dr. Brian A Benoff', true, NULL, NULL, 'Holy Name'),
  ('d6d4b079-1ecf-542a-9cc3-481d1962e4d8', 'Pulmonology', 'Dr. Richard Periut', false, NULL, NULL, 'Group ID HNJH# 60064461'),
  ('3a443b80-a055-5558-b10f-627476f20a08', 'Pulmonology', 'Dr. Jose Pinal', false, NULL, NULL, NULL),
  ('3f2ca381-6391-5fad-8105-f5bfef54fee8', 'Rheumatology', 'Dr. Alexandru F Kimel / Dr. Neil J. Gonter/ Dr. Dewan Fahima', true, NULL, NULL, 'Not in network with HBCBS Direct Access, Aetna ( Medicaid),
Rheumatology Associates of North Jersey - (njarthritis.com)- njarthritis@yahoo.com'),
  ('da68cc84-909b-5318-b9a8-e451507c097a', 'Rheumatology', 'Dr. Jessica Hoey', true, NULL, NULL, 'Englewood Hospital
180 Engle Street , Englewood NJ 07631 Phone: 201-567-2050 Fax 201-568-8936
1 North Washington Ave, Bergenfield, NJ 07621 Phone:201-501-0082 Fax 201-501-8859
695 Anderson Ave Suite 2012 Cliffside Park, NJ 07010 Phone: 551-234-3040 Fax: 551-234-3034'),
  ('0905a523-8da8-580e-9229-2f3dfe0034bb', 'Rheumatology', 'Dr. Arsany Anis', false, NULL, NULL, NULL),
  ('04ff9aa9-6728-5c53-8ec2-c648f4b6283f', 'Rheumatology', 'Dr. Dominic Maiello', false, NULL, NULL, NULL),
  ('efbcba10-d782-54eb-a6ac-bb164d358e40', 'Rheumatology', 'Dr. Richard Andron', false, NULL, NULL, NULL),
  ('16d85ec8-0fad-5152-99e8-1e3af33ed3b1', 'Rheumatology', 'Dr. Carl Restivo', false, NULL, NULL, 'Takes HNJH, WELLCARE'),
  ('d04789f3-fb32-57cc-a13b-678bbf28e37d', 'Rheumatology', 'Dr Sushama Mody / Dr Michael Guma', false, NULL, NULL, 'Riverside Medical Group'),
  ('a1212d26-4ebc-597c-96ac-e771aa8d4033', 'Surgery (General)', 'Dr. Igor Kofman / Dr. German Costa / Dr. Javier Gomez', true, NULL, 'https://www.surgicalspecialistsofnorthjersey.com/', 'Holy Name - Surgical Specialists of North Jersey'),
  ('5b1fd962-c5a8-56cb-b2b7-d75029512788', 'Surgery (General)', 'Dr. Ravikumar Brahmbhatt', false, NULL, NULL, NULL),
  ('489f149b-6890-5ade-9c90-bba58648a057', 'Surgery (Breast)', 'Dr. Violet Merle McIntosh, Dr. Jennifer Marti, Dr. Jenna Gillen, Dr. Rachelle Leong', false, NULL, NULL, 'Englewood Health'),
  ('47f28ecc-2d09-51d5-981d-aa1849a6c31c', 'Surgery (Breast)', 'Dr. Adriana Suarez-Ligon, Dr. Ann Chuang, Dr. Camille Swain', false, NULL, NULL, 'Premier Surgical Network
(973) 547-1641 (201) 778-9181'),
  ('37f58c3d-b807-5e4e-ad38-7c04d10bf1e7', 'Surgery (Breast)', 'Dr. Darren Sachs', false, NULL, NULL, 'Astera Cancer Care'),
  ('c3375056-09f7-5352-afa9-fcd08daaa3ff', 'Surgery (Bariatric)', 'Dr. Omar Bellorin Marin, MD (Bariatric/Gen Surgery)', true, NULL, NULL, 'Holy Name, Speaks Spanish'),
  ('6971771f-3ed2-57a7-a106-53929a6d1664', 'Surgery (Bariatric)', 'Dr. Stefanie Vaimakis (Bariatric Surgery)', false, NULL, 'www.stefanievaimakismd.com', 'NO Medicaid Insurances. Example: HNJH, Aetna Better Health, UHC Community Plan, Wellcare'),
  ('1961ce7f-fc2f-55cd-abba-1a5bd76f63d3', 'Surgery (Bariatric)', 'Dr. Prakash Paragi (Bariatric Surgery)', false, NULL, NULL, 'Takes HORIZON NJ HEALTH
NPI: 1891079893'),
  ('21d101d3-66c5-57e2-8ca0-9870d64290af', 'Surgery (Bariatric)', 'Dr. Saniea F. Majid (Bariatric Surgery)', false, NULL, NULL, 'Takes ALL insurances
Weight Loss & Wellness Center'),
  ('dc0c193c-f8e2-5fa9-994f-1f7ba809b624', 'Surgery (Colorectal)', 'Dr. Anna Serur', true, NULL, NULL, 'Englewood Health'),
  ('f649c6a0-bcef-59f7-b438-2f164285a14a', 'Surgery (Colorectal)', 'Dr. Christina Seo', false, NULL, NULL, 'Holy Name'),
  ('6c6eab08-7d27-5369-ad06-bf2b3deceba8', 'Surgery (Colorectal)', 'Dr. Marco Bertucci-Zocalli, Dr. Beatrice Dionigi, Dr. Ravi Pakala Kiran, Dr. Benjamin Kuritzkes', false, NULL, NULL, 'Columbia University Medical Center Colorectal Disease & Surgery'),
  ('1e6f78b5-2e08-5be7-845f-60338aede311', 'Surgery (Endocrine)', 'Dr. Anna Kundel (Endocrine Surgery)', true, NULL, NULL, 'Valley Hospital'),
  ('31c6f738-729c-58a1-b66c-a0d3b4c9b948', 'Surgery (Endocrine)', 'Dr. Rachel Liou (Endocrine Surgery)', false, NULL, NULL, 'Columbia UMC, Carepoint'),
  ('2ae6c1e0-4488-55ff-a9b3-49bca01f72eb', 'Surgery (Endocrine)', 'Ki Won Kim, MD (Endocrine Surgery)', false, NULL, NULL, 'Director of Endocrine Surgery at Englewood Hosp'),
  ('16bc29b2-e512-574b-a2b9-ef8ff5776ce6', 'Surgery (Neurosurgery)', 'North Jersey Brain & Spine Center (Neurosurgery)', false, NULL, NULL, 'ACCEPTS UHC COMMERCIAL PLAN W OUT NETWORK BENEFITS'),
  ('e26c6c45-e2a6-5de6-8a83-82fef18c8451', 'Surgery (Neurosurgery)', 'Dr. Eleonora Spinazzi (Neurosurgery)', false, NULL, NULL, 'Columbia Neurosurgery – at Holy Name
Languages Spoken: English, Italian and Spanish'),
  ('02bcb2cf-46b6-5f69-9934-12cf9233b6b2', 'Surgery (Neurosurgery)', 'Dr. Michael Arginteanu (Neurosurgery)', false, 'info@mnamd.com', 'https://marcarginteanumd.com/', 'NO Medicare Advantage plans or any Medicaid plans.'),
  ('5a1bb57b-082c-5238-854e-4b4a790d5e6f', 'Surgery (Neurosurgery)', 'NEUROSURGERY FOR HNJH (REC TO RWJ UNIVERSITY HOSP NEWARK,NJ)', false, NULL, NULL, NULL),
  ('74286fa4-0dec-5529-8749-37c0c80fd272', 'Surgery (Oral)', 'Dr. Nathan A Wuebbels, DMD, MD', false, 'northbergen@njoralsurgery.com', 'https://www.njoralsurgery.com/', 'NJ Oral Surgery
Email: ridgefield@njoralsurgery.com
Email: hackensack@njoralsurgery.com'),
  ('7162e221-941a-5e27-9ffa-3abf12a38262', 'Surgery (Oral)', 'Dr. Juan C Alonso', false, NULL, 'https://www.northhudsonoralsurgery.com/', 'North Hudson Oral Surgery'),
  ('c0b030be-f55a-5542-9e01-48bf4877d4a0', 'Surgery (Orthopedic)', 'Dr. Victor Ortiz', true, NULL, NULL, 'Kayal Orthopedics —- Spanish Speaking
Takes ALL insurances except Medicaid
Karina (scheduling coordinator) Fax:(201)425-1657'),
  ('93e80658-646e-5693-a42d-65f390d02da5', 'Surgery (Orthopedic)', 'Dr. Howard M Baruch', false, NULL, NULL, 'TAKES HNJH
Premier Orthopaedics & Sports Medicine
ALL LOCATIONS'),
  ('dff62a3a-5b42-5052-b28a-3a63872d7855', 'Surgery (Orthopedic)', 'Hudson Pro Orthopedics & Sports Medicine', true, 'frontdesk@hudsonproortho.com', NULL, 'Dr. Imran Ashraf (Orthopedic)
Dr. Roman Isaac (Hand/Upper Extremity Surgeon)
NO Wellcare, NO HORIZON NJ HEALTH, HBCB EPO NOT ACCEPTED
Office Contact: Camille, email facesheet, referral, imaging, clinical notes'),
  ('f992d7da-e124-5786-9d1e-ccfdcd8e8359', 'Surgery (Orthopedic)', 'Grau Orthopedics - Dr. Luis Grau', false, NULL, 'www.grauortho.com', '12 Location - Bayonne, Jersey City, Edgewater, North Arlington, Hackensack etc.'),
  ('854fa10c-b54e-595c-b47d-38baa2bd5e26', 'Surgery (Orthopedic)', 'Dr. James Hale / Dr. Jeffrey Steuer / Dr. Brian Bauer / Dr. John Katona', false, 'easternortho@easternorthopedics.com', 'https://www.easternorthopedics.com/', 'Holy Name - Eastern Orthopedic Associates - Phillip Rose PA'),
  ('01b5502b-784e-5f45-8d34-cfa46d955e43', 'Surgery (Orthopedic)', 'Dr. Asit K Shah', false, NULL, NULL, 'Englewood Orthopedic Associates'),
  ('f53acd12-a087-594b-90d5-84453da12a84', 'Surgery (Orthopedic)', 'Dr. Christine M Corradino', false, 'billdeiasi13@gmail.com', 'https://www.hopsinstitute.com/', 'Hudson Orthopedic Pain & Spine (HOPS)'),
  ('2251e1d7-1027-5400-a3bc-f6bedfde033c', 'Surgery (Plastic)', 'Dr. Brad M Gandolfi (Plastic Surgeon)', false, 'info@drgandolfi.com', 'www.drgandolfi.com', NULL),
  ('204f2c54-3c1e-5ad4-afdf-fdc2949ef34d', 'Surgery (Plastic)', 'Dr. Suri Babu Ponamgi (Plastic Surgeon)', false, NULL, NULL, 'Accepts Medicaid'),
  ('a795dfb7-476d-5e85-b27c-1e72c5ee4e14', 'Surgery (Plastic)', 'Dr. Silvio Podda (Plastic Surgeon, Reconstructive, Craniofacial)', false, NULL, NULL, 'Speaks English, French, Italian, Portuguese, Spanish'),
  ('3c2517cf-c77f-593a-b264-4ec3608ea1e2', 'Surgery (Plastic)', 'Dr. Michael Baruch (Plastic Surgeon)', false, NULL, NULL, '(Englewood Office) // (973) 773-4824'),
  ('8905e054-fb4f-511a-8fb4-fe98ae115904', 'Surgery (Plastic)', 'Dr. Renata Weber (Plastic Surgeon Hand)', false, NULL, 'www.mdsnjny.com/renata-weber--md', 'Takes HNJH (Needs manually referral)
NPI: 1790855815'),
  ('909b4a05-298d-5730-9277-405dead4941a', 'Surgery (Misc)', 'Dr. Andrew De La Torre (Hepatobiliary Surgery)', true, NULL, NULL, 'Carepoint'),
  ('fbfcf4b8-af60-5777-9478-9d222ed0049d', 'Surgery (Misc)', 'Dr. Maria Schiavone (Gyn Oncology/Surgery)', true, NULL, NULL, 'Holy Name'),
  ('c80ec4fe-7c5f-5970-a339-f093aa6d9f4d', 'Surgery (Misc)', 'Dr. Erika Brinkmann (Breast Oncology/Surgery)', true, NULL, NULL, 'Holy Name'),
  ('8ffe9fb5-ae69-570d-94b7-1fabc08d5dbf', 'Surgery (Misc)', 'Dr. Andrea Vidali (Endometriosis/Infertility Surgeon)', false, NULL, NULL, 'Carepoint'),
  ('e7f72dec-2ac3-5b41-ac54-386510862eb0', 'Urology', 'Dr. Michael Nazmy / Dr. Chester Lee / Dr. Richard Lee', false, NULL, 'https://www.urologicspecialties.com/', 'Holy Name - Urologic Specialties - Does NOT accept Horizon NJ total care'),
  ('547fd2fa-543f-5613-bf36-f9c5bc8e18ab', 'Urology', 'Dr. Sergey Rome', false, NULL, NULL, 'Languages: English, Russian, Spanish'),
  ('b284bdf8-3f51-5465-9dc7-8bac4a05dcb2', 'Urology', 'Dr. Debra Fromer', false, NULL, NULL, 'HMH Medical Group | Urology'),
  ('b0d23a82-295f-51f3-b322-8419117db9a5', 'Urology', 'Dr. John Hosay', false, NULL, NULL, 'Sovereign Medical Group'),
  ('2bcd1ec2-bf2c-58d9-a6d8-fab495bd8c06', 'Urology', 'Dr. Joel Abramowitz', false, NULL, NULL, 'Sovereign Medical Group'),
  ('c0d3a30a-e3eb-5066-90f3-cdd1a5b10097', 'Urology', 'Dr. Elliot Shulman', false, NULL, NULL, 'Sovereign Medical Group
201-339-5799'),
  ('a5a8c6b4-0139-52f8-a0fd-d27b3a97efed', 'Urology', 'Dr. Eric Seaman (MALE FERTILITY)', false, NULL, NULL, 'Including Vascetomies
Phone (appointments): 973-253-4256 | Phone (general inquiries): (973) 218-9400
Phone (appointments): 973-327-7457 | Phone (general inquiries): (973) 586-3056'),
  ('17bb668c-e053-546b-a29a-8bda299a5bc0', 'Uro-gynecology', 'Dr. Diana Hearn', false, NULL, NULL, 'Holy Name Physicians'),
  ('87c52616-312f-5eaf-9f65-7b4521ef6f8c', 'Vascular', 'Dr. Gregory Ruth (VEIN CENTER)', true, NULL, 'https://www.centerforvein.com/our-clinics/doctors/shubha-varma-md', 'No longer taking HNJH Medicaid/ UHC Advatage
Center for Vein Restoration - Only lower extremity veins
8901 Kennedy Boulevard Ste 855-565-8346 3E, North Bergen, NJ 07047
NPI #1437220795'),
  ('490f9533-190e-50ca-af4c-c69dfd10e2a0', 'Vascular', 'Dr Peter E Kagan (Vascular Surgery)', false, NULL, NULL, NULL),
  ('59d63784-5999-59ee-83be-88ed66e2072d', 'Vascular', 'THOMAS R. BERNIK, MD (Vascular Surgery)', false, NULL, NULL, 'NAKUL NIRANJAN RAO M.D (Vascular Surgery)
STEVEN ELIAS, MD (Venous and Lymphatic Medicine)'),
  ('f7350a94-e9c9-5586-bbee-d75de3ba304c', 'Vascular', 'Interventional Radiology', false, NULL, NULL, 'Kevin Herman, MD (Interventional oncology and venous disease)'),
  ('19c8d279-f863-5bff-8f00-15328b1e17e6', 'Miscellaneous', 'Enoble Care - FOR HOME VISITS', false, NULL, NULL, NULL),
  ('2f771ee6-4f00-52f4-8a35-f83d8e06f547', 'Miscellaneous', 'Hudson County Chest Clinic (TB Clinc)', false, NULL, NULL, '7AM to 4PM Adult Services – Monday, Tuesday, Wednesday & Friday'),
  ('c19d7338-fa2f-575c-893b-9036334bf0f4', 'Miscellaneous', 'New Jersey State Department: Surveillance (HIV)', false, 'evelyn.jerez@don.nj.gov', NULL, 'Evelyn Jerez
609-530-7981'),
  ('b8fa9828-0fd1-5c2b-b396-d738793769d4', 'Miscellaneous', 'New Jersey State Department: Surveillance (Syphilis)', false, NULL, NULL, NULL),
  ('0f7e6644-1925-5987-8006-8a8f9389ebbf', 'Miscellaneous', 'Insurance Broker', false, NULL, NULL, NULL),
  ('fe9b4485-ba93-5039-b891-e41f9203640e', 'Miscellaneous', 'Domestic Violence Hotline', false, NULL, NULL, 'Center for Hope & Safety'),
  ('9c842f51-91ad-5cb2-b36e-86b665685cd4', 'Miscellaneous', 'Women Rising', false, NULL, NULL, NULL),
  ('353e7325-d9a2-5969-b846-b63baf8c2d50', 'Miscellaneous', 'Severe Behavior Program', false, 'intake@fourcorners.services', NULL, 'Email: admin@fourcorners.services'),
  ('586c88ad-0138-5a6b-a1bb-b47063670219', 'Miscellaneous', 'Self Pay Options', false, NULL, NULL, 'Imaging Centers
Diagnostic Medical Imaging'),
  ('51974194-177a-5b22-9669-c32c4a4b8188', 'Miscellaneous', 'Transportation', false, NULL, NULL, 'ACCESS LINK (973) 491-4224')
)
INSERT INTO "referral_contacts" ("id", "category", "name", "preferred", "email", "website", "notes", "updatedAt")
SELECT s."id"::uuid, s."category", s."name", s."preferred", s."email", s."website", s."notes", CURRENT_TIMESTAMP
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM "referral_contacts" c WHERE c."category" = s."category" AND c."name" = s."name"
);

WITH src("id", "contactId", "label", "address", "phone", "fax", "sortOrder") AS (VALUES
  ('1b67679d-0ea9-5d4b-a999-bea3f3bc7f0a', '8e353311-7964-53e8-9f90-4dde1a12e97e', NULL, NULL, '800-229-5227', NULL, 0),
  ('7edcbb75-ebb4-56d7-a6c9-1be49d994f76', '21176ce2-2777-55ea-952b-a85a9a28d4f0', NULL, NULL, '1-844-870-8870', NULL, 0),
  ('4d626d06-5abb-5a0f-b967-c57ad13c6a25', 'be74e8f9-335e-5968-b7f4-0481436afc2f', NULL, NULL, '201-553-0501/201-471-1539', NULL, 0),
  ('c12eaf4f-795e-53d6-b488-75c0af8eadd2', '41c3a194-bd4d-5ba1-8041-fc9b932de35b', NULL, NULL, '855-515-5005', NULL, 0),
  ('845d073e-b578-5328-b62a-2de62a706d71', '046d188b-d56f-5f65-a94d-03c2ce923f36', NULL, NULL, '1-866-697-8378', '862.703.7753', 0),
  ('3a2c683a-54fa-54cb-a5b3-74c85fb2d00a', '88f2d7b6-6d81-5397-9c21-b24d6c88507d', NULL, NULL, '1-800-631-5250', NULL, 0),
  ('f0703231-9dca-5321-85eb-b956a0faf7d3', '7f3b1f46-ccc5-5c09-84e0-24b03877090e', NULL, NULL, '1-800-469-7423 Option #3', NULL, 0),
  ('84508679-549c-518e-a316-28d4eaac46f6', 'e5370975-0f7a-5b45-891b-279d96970d21', 'Hoboken', '121 River Street, Hoboken, NJ 07030', '551-651-1883', '833-581-2542', 0),
  ('223fe3fd-c257-54cf-80f8-023cd7e281ce', 'e5370975-0f7a-5b45-891b-279d96970d21', 'Union City', '3196 Kennedy Blvd, 2nd Floor, Union City, NJ 07087', '201-330-3274', '201-330-8057', 1),
  ('9e9ac96c-f3c9-5390-b5a9-160b6400c69b', 'e5370975-0f7a-5b45-891b-279d96970d21', 'Jersey City — Journal Square', '26 Journal Square, Jersey City, NJ 07306', '201-656-9024', '201-656-9535', 2),
  ('8010b723-1c01-5a8d-8a53-7c8f9753984e', 'e5370975-0f7a-5b45-891b-279d96970d21', 'Jersey City — in Walgreens', '1561 John F. Kennedy Blvd., Jersey City, NJ 07305', '551-501-3040', '201-309-0780', 3),
  ('646e81c6-c551-50f4-9c26-e1ecdfc19dbb', 'e5370975-0f7a-5b45-891b-279d96970d21', 'Bayonne', '988 Broadway, Suite 101, Bayonne, NJ 07002', '201-471-2685', '201-471-2686', 4),
  ('938e723d-2eaa-5fb3-aa52-8a048b366dac', 'ace7e823-c6e0-5c41-9d8f-ec0e7b5f87bc', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', '(201)-833-3000', NULL, 0),
  ('22102e0b-b63b-576d-9695-195edd79d3da', '10df034d-8e5c-56e7-a852-d3b8b7c8093a', NULL, NULL, '201-833-3313', NULL, 0),
  ('8f05db22-b63d-58cd-887e-be2e75a9b0f1', '594e935b-02fc-5570-9fbc-ec2987b63ee2', NULL, NULL, '201-833-7268', '201-541-5910', 0),
  ('2f748861-fcbf-5dae-9728-1ee87b6c01cd', '8e351ebb-fc44-5434-a00c-433c45622c3f', NULL, NULL, '201-833-7260', '201-833-7259', 0),
  ('7a72097d-6740-5db2-b59b-7ae10f865994', 'a8633582-b847-5146-ab2b-c85d9ababfe8', NULL, NULL, '201-833-3700', NULL, 0),
  ('f6a25739-7018-5280-9800-147e4a734611', 'f405b50a-3b78-51e2-87d8-1abd554c08d2', NULL, '699 Teaneck Road, Teaneck, NJ 07666', '(201) 833-3202', '(201) 530-7399', 0),
  ('085f4a54-913e-5861-9365-a8613fc7a073', '54d57673-46a2-5903-86ce-ebb3077f72c7', NULL, '180 N Dean St, Englewood, NJ 07631', '(201) 568-4242', '(201) 568-1298', 0),
  ('973e32ac-8630-5465-9684-a27b9522d846', 'd0bab6ce-b222-52d0-8518-193b8dac7f4e', 'Central scheduling dept', NULL, '201-392-3278', '201-392-3564', 0),
  ('8b0364ca-17f7-5023-9c7e-79b92e13bed7', '0f9d03ce-efbe-5d29-a4c8-4b701aea06c5', NULL, NULL, '201-247-5670', '973-574-7924', 0),
  ('50425b0f-9a2e-55b6-b9f6-fbd51080a889', 'eb1d1534-aab2-5f44-8fec-3c97f5ee991c', NULL, NULL, '(888) 876-0111', '201-516-6033', 0),
  ('a62e56d4-9b78-5058-8b07-2768bfbfed7e', '6fbe1756-a302-58d7-a4a9-226666c677aa', 'Secauces', NULL, '(201) 902-1490', '201-902-1495', 0),
  ('6cbd97a1-57a1-5a10-a7a7-a0d7301b5561', '6fbe1756-a302-58d7-a4a9-226666c677aa', 'Hackensack', NULL, '(201) 342-6311', NULL, 1),
  ('cdbc7e87-2191-59ac-9904-ed2f3b75d495', '7de1dc8a-6d41-5749-b58b-0aa341155782', NULL, '5700 Bergenline Ave, West New York, NJ 07093', '(201) 869-0880', '201-869-0081', 0),
  ('1e9cccd8-7173-545a-8e0c-ab203c7badbb', '905aefba-68d6-57d8-852b-6868aadc8bde', NULL, '443 60th Street, West New York,NJ 07093', '(201) 854-5557', '(201) 854-7515', 0),
  ('53c45967-ba2b-5555-be06-710ea6dfaa9c', '3b14b36e-b593-56af-9648-0630e95b3c0e', NULL, 'Hudson County Location:2 Jefferson Avenue Jersey City, New Jersey 07306', '201-418-6800', '201-801-1021', 0),
  ('36ee5c3d-4fa9-55b5-9e07-f32076f1bbb7', '3b14b36e-b593-56af-9648-0630e95b3c0e', NULL, 'Essex County:576 Central Avenue Suite 304 East Orange, NJ 07018', '973-378-1000', '973-378-1111', 1),
  ('03a59742-5129-5236-b598-0909e3eb8266', 'dbbd4fe0-c35b-5391-8564-5e7bbc70e10b', NULL, '3196 John F Kennedy Blvd Fl 1 Union City, NJ 07306', '(201) 271-1022', '(201) 271-1205', 0),
  ('78f252b4-2851-55a2-bbe8-e630ba83a710', '41ab17e8-c465-530d-85a1-615adbcf4471', NULL, NULL, '201-472-8124/ (973) 767-8266', '(201) 472-8125', 0),
  ('252ea174-e1c7-5a7e-8eb4-a8dd77140499', '82dabfb2-e324-53e5-8526-5e0392c6d45b', NULL, '6201 Grand Ave, North Bergen, NJ 07047, United States', '201-869-4443', '201-353-2568', 0),
  ('fe1ffaa8-71bb-510c-96f8-ca1da8164596', 'd7d0a96e-4fa9-543a-8b0a-6564a39c3803', NULL, '3610 Palisade Ave, Union City, NJ 07087', '201-864-0400', NULL, 0),
  ('d5d14f9a-3d95-5a59-ae97-4d6b91dd5864', '4bb10fff-faa9-52fc-8e1e-5482e12e6545', NULL, NULL, '732-961-1301 / 888-294-3352', '732-961-9897', 0),
  ('1d2350cd-6be6-57d0-96de-d9163af5943f', 'd019cd9d-8d79-5bac-8df7-44c91d4cc418', NULL, '2115 Bergenline Ave, Union City, NJ 07087', '(201)866-0001', '(201) 319-9340', 0),
  ('f6e20c66-881b-5dd6-96ae-c602acb5717c', 'a9964b9e-2367-5a5e-9eee-40eafddee7fa', NULL, NULL, '1-800-287-0643', '1-973-538-2703', 0),
  ('c830c2cf-2947-5b5b-8e1a-5a6c4991a96f', 'f29d4531-6576-5def-a04c-4b37c8de3dbd', NULL, NULL, '866-333-0686/1800-565-5644', '800-716-9586', 0),
  ('eb9e3f9f-89b3-52a1-aa46-a19a0d349636', '6672827c-03b8-516c-b19c-f31183e8da75', NULL, NULL, '1 (866) 332-4193', NULL, 0),
  ('ae465238-6a60-5d80-99a4-f3b3ebe578e3', 'cdf8466a-b339-5b11-9620-96c3f0d0639f', NULL, '671 Montgomery St, Jersey City, NJ 07306', '(201) 433-5720', '201-433-7453', 0),
  ('8588b160-b86c-57dd-b637-09a1f66b3c65', '77f81499-2dd4-503d-96ea-50c5783c55ed', NULL, NULL, '201-385-9700', '201-385-9701', 0),
  ('2f482753-b177-5f5c-85ef-63ec79108cec', '655ed45b-2b42-599f-86d9-e2e5e6ed3679', NULL, NULL, '1-877-902-9726', '866-811-4500', 0),
  ('ca7be3d5-d020-514d-adde-e1f67468a3ca', '989a028f-9319-57cc-bf00-8d7bb61ee29d', NULL, '377 Jersey Avenue Ground Floor, Medical Office Building, Jersey City, NJ 07302', '(201) 309-2400', '201-395-7598', 0),
  ('8b724f20-91d2-5c3f-a6ad-3971d20b7e75', '530189c9-9f65-5632-bc5d-dbfec46af1ec', NULL, '29 E 29th St, Bayonne, NJ 07002', '(201) 858-5000', NULL, 0),
  ('867c805f-fa71-537b-9e57-aadaa1a5be93', '530189c9-9f65-5632-bc5d-dbfec46af1ec', NULL, NULL, '(201) 436-6100', NULL, 1),
  ('027ea1ab-5af9-51ce-b5c8-62f711a84f23', 'f2c2d6b4-c2aa-55bc-b33d-1c1b37a3d567', NULL, '1 Clara Maass Dr., Belleville, NJ 07109', '(973) 450-2000', NULL, 0),
  ('7e73d9e6-9483-53b3-90b2-a84dcdeed41e', '39ce85a4-2597-5d96-a0ea-f22f7c8ca2ef', NULL, NULL, '(201)795-8200 ext 5084', NULL, 0),
  ('c3499924-62f7-539f-ada0-bfeaae678eb0', '0d187c40-017e-5e68-a31a-d5ea8c80b942', NULL, '350 Engle Street. Englewood, NJ 07631', '(201) 894-3000', NULL, 0),
  ('e17cd33c-386b-5578-b438-e8f979cfeb9c', 'd567840d-a395-598d-a31f-1c756dd71308', NULL, NULL, '201-894-3397', '201-894-0787', 0),
  ('5578a550-fadd-54c5-ae70-633b1d46f4dc', 'd567840d-a395-598d-a31f-1c756dd71308', NULL, '350 Engle Street. Englewood, NJ 07631 - 4TH Floor', '(201) 894-3000', NULL, 1),
  ('10206b05-3f30-54a1-9794-dfb920e68f2e', '0686054d-5bbc-5cf5-b06c-04317fd7d53b', NULL, '30 Prospect Ave, Hackensack, NJ 07601', '(551) 996-2000', NULL, 0),
  ('4d4d8a5a-fedd-5d2c-9647-7d240c348f5a', 'c9aed6c9-5d75-5d53-beee-f98c6a9f7e6b', NULL, '7600 River Rd, North Bergen, NJ 07047', '(201) 854-5000', NULL, 0),
  ('ddcac5b9-a281-5f91-a2ed-2dda18896a08', '0d12480b-476a-513f-853f-623f42a06b02', NULL, '308 Willow Ave, Hoboken, NJ 07030', '(201) 418-1000', NULL, 0),
  ('c649b569-6d02-5da6-a0a8-755f1658864c', '1e9f6332-d958-5d13-9007-899cbec0c30a', NULL, '355 Grand St, Jersey City, NJ 07302', '(201) 915-2000', NULL, 0),
  ('a7eb8e41-7a4d-5c3e-8ef6-2be6e9e24799', 'b1c48105-a1c9-5389-b60a-c9de230818c1', NULL, NULL, '201-915-2465', '201-915-2204', 0),
  ('ef54a291-46ce-54c7-aa35-f9e30832c0d9', '2685531a-19e2-5bd8-a3dd-8ad35f723bd1', NULL, '65 James St, Edison, NJ 08820', '(732) 321-7000', NULL, 0),
  ('948e282d-dcb7-5804-9bfb-febcc3309451', 'c7617957-061b-5ea6-a7f1-2056b4856893', NULL, '7600 River Rd, North Bergen, NJ 07047', '(201) 854-5000', NULL, 0),
  ('9cc1a827-eaec-5528-8e5a-af85c3ba0691', 'c1f27c43-1313-58c4-806f-41126627e0ac', NULL, '55 Meadowlands Pkwy, Secaucus, NJ 07094', '(201) 392-3100', NULL, 0),
  ('88d6ff28-df14-5bdb-999a-4c1ace34d4c6', 'e3b10734-9699-5f96-8165-b361b10356ba', NULL, '1 Bay Ave, Montclair, NJ 07042', '(973) 429-6000', NULL, 0),
  ('42aaa053-7695-5169-938c-61ca0e321835', '72ea4923-8e8b-5ec3-aae3-59c4c3a3544f', NULL, '150 Bergen St, Newark, NJ 07103', '(973) 972-4300', NULL, 0),
  ('80eb8403-da0b-516e-89e6-7af1c8f0ff62', 'c48785cd-508e-5d55-bc27-083d94376232', NULL, '94 Old Short Hills Rd, Livingston, NJ 07039', '(973) 322-5000', NULL, 0),
  ('0fc23a67-e0a6-5f36-aa3a-4d564fd1686b', 'adb97bf3-0b93-5f82-b73a-163b754f7da4', NULL, '268 Dr Martin Luther King Jr Blvd, Newark, NJ 07102', '(973) 877-5000', NULL, 0),
  ('b6d40544-d255-57d9-982c-558f043cdd7c', '0e07726e-f40b-5256-a416-2df740297cb7', NULL, '161 Palisade Ave, Jersey City, NJ 07306', '(201)241-3333', '(800)708-2543', 0),
  ('7b2499d1-6883-5b3c-83f9-c80361061899', 'e370edf4-b13e-5d3b-8199-1755fca809ad', NULL, '393 Piaget Avenue, Clifton, NJ 07011', '(973)478-0600', '(973)478-0603', 0),
  ('34f3c698-bff3-525e-839d-1404a2c7493c', '81852a8f-8266-5c10-8107-9d8f1d203cf8', NULL, '7823 Bergenline Ave, North Bergen, NJ 07047', '(201) 869-1235', '(201) 215-9794', 0),
  ('e5a955f5-cd0b-5919-93a2-740d92dd4654', '297ccaa2-c758-5282-83bc-5d7f006ad6f6', NULL, '2127 Kennedy Blvd North Bergen, NJ 07047', '(201) 552-9464', '(201) 552-9467', 0),
  ('6890d471-d183-59fe-932c-1c137b2a8012', 'ea4e838e-605e-589f-99d6-97ff0f2aab2c', NULL, '28-11 John F. Kennedy Blvd North Bergen, NJ 07047', '(201) 659-1177', '(201) 659-2262', 0),
  ('c1b57e6b-2b70-5cd3-9f45-81d9c20b9b51', '437fab36-d2ae-5eb5-9ce0-d80cb71e6f85', NULL, '180 N Dean St, Englewood, NJ 07631', '(201) 568-4242', '(201) 568-1298', 0),
  ('819922cb-c9a2-5bcf-9709-2233ca3bf50f', '99b63229-e8a8-5ead-b8e7-8a6bd0ee79e9', NULL, '0-100 28th Street Fair Lawn, NJ, 07410', '201-475- 1300', '201-475-1709', 0),
  ('b4925e89-aba0-5f7b-949e-254036bace83', 'd9a6c56c-c166-5637-89ab-f9f4f1b8fda9', NULL, '669 Broad Ave Suite 104, Ridgefield, NJ 07657', '(201) 699-0929', '201-941-0175', 0),
  ('44d597e1-ca82-5d9a-881f-010dbea2fe09', '0496f77a-c64b-51f1-86e1-dfaeda033f18', NULL, '350 Engle Street Englewood, NJ 07631', '(201) 894-3622', NULL, 0),
  ('712176b8-6ee7-56dc-8331-1f993718ea99', '0496f77a-c64b-51f1-86e1-dfaeda033f18', NULL, '2 Journal Square Plaza Jersey City, NJ 07306', '(551) 220-5020', NULL, 1),
  ('3821e829-1fed-5a95-bd4c-c9890d46d0fd', 'a1ba88f0-b542-5aac-97e2-3c87bdff62ec', NULL, '5 Marine View Plaza, Ste 100, Hoboken, NJ 07030', '(201) 488-2660', '(201) 488-6784', 0),
  ('3a16a990-6d00-589e-8895-b9313f3124c2', '9dcb3f14-a1da-505a-a9ed-a60946f79292', NULL, '6416 Bergenline Ave. West New York, NJ 07093', '201-350-7120', '(201) 295-1035', 0),
  ('6aedd291-6301-5cf2-9a6f-cdce7a3ffa75', 'f0eb50d4-e52c-5fee-aa04-9747a14a4627', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 0),
  ('ffc6da50-00ac-5ceb-ba61-c77022508d26', 'c04f3603-edf2-5231-a3a0-a59ff4f8970e', NULL, NULL, '516-432-3800', NULL, 0),
  ('3543d5b6-1014-5a6e-930a-0bafb5b9de2e', 'ead862fd-44e6-5329-ab0c-979591a4991b', NULL, '307 60th St, West New York, NJ 07093', '(201) 854-1200', '201-854-3333/201-295-0307', 0),
  ('3174fb02-4280-56fe-b2c9-54e3f1c36dd0', 'ead862fd-44e6-5329-ab0c-979591a4991b', NULL, '3196 Kennedy Blvd, Union City NJ 07087', '(201) 865-6100', '(201) 865-6102', 1),
  ('db3ac0fe-e64a-5a6b-8711-3fca823ab2f7', 'ead862fd-44e6-5329-ab0c-979591a4991b', NULL, '79 Hudson Street, Hoboken, NJ 07030', '973-661-4674', '973-661-5245', 2),
  ('68cfcaa1-c627-51ea-9ffa-e9e33bae740d', 'ead862fd-44e6-5329-ab0c-979591a4991b', NULL, '550 Summit Ave, Jersey City, NJ 07306', '973-661-4674', '973-661-5245', 3),
  ('b1d32b60-8b59-5741-97c2-40f1c23de6d7', '48983276-1374-53de-943f-7beff4d989ab', NULL, '2127 Kennedy Blvd. North Bergen, NJ 07047', '(201) 552-9464', '(201) 552-9467', 0),
  ('28410b25-abe8-5b75-8880-0cd0cc8df0c1', '2063c525-586e-54ce-af11-c189537d103a', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 0),
  ('54070674-48f8-5edf-ab50-63de9d8357dd', '4cd936d8-3b5c-5e86-8070-d6517b56f0d7', NULL, NULL, '(201) 729-1234', '(201) 729-1233 / 201-729-1150', 0),
  ('ef0d31fc-8c34-5b88-a23c-9918e0dbb3ef', '6f710c6d-1a1d-531c-b3a6-a5fba22abd6f', NULL, '402 43rd St, Union City, NJ 07087', '(201) 766-9155, (201) 348-6060', '201-348-2064', 0),
  ('35e9bcf4-273c-5796-9a03-78479338dad6', 'c92df6e3-baf9-5ab7-9575-5cc780f7b14a', NULL, '30 S Newman St, Hackensack, NJ 07601', '(201) 488-2660', '201-488-6784', 0),
  ('1bb80b13-6e4d-5662-aa67-ba03b3d4d9fe', 'd365d6d5-58ec-5369-9f3f-99ab855703b8', NULL, NULL, '1-866-496-6200', '1-800-637-5204', 0),
  ('42179c46-19d6-5808-9815-403990fda593', '55123309-988d-5a5e-924a-0f5e99f105ff', NULL, NULL, '1(800) 918-8924', NULL, 0),
  ('e98f4b8c-49c8-5d26-a7e4-47f73bc6bdee', '9167f989-2895-5f69-be58-7b170a219350', NULL, NULL, '1(800) 421-7592', NULL, 0),
  ('eb2514ef-4fce-5646-ad61-44105b28efe5', '006c49f3-f6b1-5170-b647-119e63d2239a', NULL, NULL, '1(833)419-1491', NULL, 0),
  ('65d9ae9d-988a-5aee-afca-058faac8c0f1', '4a4418ab-863b-5176-b190-69d522e08cb0', NULL, '360 Whiteman St Fort Lee , NJ 07024', '(201) 502-9706', '(201) 346-9656', 0),
  ('e1946f7c-d511-5850-bbcb-f6e450216f48', '9e236f9a-6d4c-5eb2-9127-fe4cb7e0bace', NULL, '437 69th Street Guttenberg NJ 07093', '201-868-4400', NULL, 0),
  ('acd82eba-6009-5993-9fbf-80295008984b', '2ee6c987-16cf-5be8-b4c0-d6d514ac68c5', NULL, '32 - 42 Newark St, #203, Hoboken NJ 07030', '(201) 754 - 0104', NULL, 0),
  ('a72dc3d8-e7d8-51e2-b8a6-e40ad6939ff2', '7e19ec72-9846-5d71-bdd5-712e10db4127', NULL, '8901 Kennedy Blvd Ste 4SW, North Bergen, NJ 07047', '(201) 374-1718', NULL, 0),
  ('0e55f2a2-d4fb-54e8-ac18-b04b5d2f4974', '1ee51889-b982-54fd-b4c0-b13f46d1dc28', NULL, '211 Essex Street, Suite 401, Hackensack, NJ 07601', '(201) 343-6673', NULL, 0),
  ('c068b1b3-fb7b-5f6a-bc1c-4c1f08cb994c', '9e907f03-5795-57ae-9b9d-4ff7ec5ff460', NULL, '235 Prospect Avenue Suite LB, Hackensack, NJ 07601', '(201) 525-1155', '(201) 525-0915', 0),
  ('1ce6bb6f-ba45-5985-bf9e-2dc5d32859bf', '9a58872d-1b64-5367-9b1c-27ebdc11c7ed', NULL, '477 Madison Ave., Suite 420, New York, NY 10022', '(212) 873-3420', '(201) 525-0915', 0),
  ('6d7ac0db-7169-5e00-8ad6-f8c88365a246', '162a2893-db7b-5645-8365-f054897836b4', NULL, '1600 Parker Ave., Fort Lee, NJ 07024', '(845) 415-6920', '(201) 302-9994', 0),
  ('6ca02c0f-8d43-58c7-93cc-5a393eb7acb0', '3d50e1d8-33e3-5bac-87a8-064ca664f4a6', NULL, '7401 Bergenline Ave Suite 3, North Bergen, NJ 07047', '(201) 854-1800', NULL, 0),
  ('09f1e594-1f58-542a-9cab-241ab1ac3639', '3fb66a2f-21c9-5d65-a4af-29ae07e75c8d', NULL, '529 39th Street, Union City, NJ 07087', '201-601-0900', '201-766-2422', 0),
  ('f9b7f66c-50cf-54b3-8e74-69e29b8af68c', '3fb66a2f-21c9-5d65-a4af-29ae07e75c8d', NULL, '493 Essex Street, Hackensack, NJ 07601', NULL, NULL, 1),
  ('ae0d1733-58d1-5af7-a3b9-d217da9d085f', '9e441971-9d44-5428-ae00-4089290bec08', NULL, '3196 Kennedy Blvd. Union City, NJ 07087', '(201) 758-8000', '201-758-8003', 0),
  ('cade7499-f5a9-5bd3-bd02-869295a45df6', 'ea6bbc20-8a40-51b6-93d0-8b488dacb699', NULL, '425 70th St Guttenberg, NJ 07093', '(551) 257-5999', '(201) 541-2249', 0),
  ('ee75919b-9a69-5523-b1ce-e36e470aefe6', 'ea6bbc20-8a40-51b6-93d0-8b488dacb699', NULL, '467 Prospect Ave, Newark, NJ 07104', '(973) 483-9944', NULL, 1),
  ('ea0447d8-e02a-5ef6-b8a1-2f5665699c20', 'fb37e33a-edc1-50d5-b755-c04eba71a6fd', NULL, '103 River Road, 2nd Fl, Edgewater, NJ 07020', '551-357-0021 | 201-941-8100', '201-941-2899', 0),
  ('f8afc8f4-636e-59b3-af4c-5f304be932b4', 'fb37e33a-edc1-50d5-b755-c04eba71a6fd', NULL, '7322 Bergenline Ave, North Bergen, NJ', '551-357-0021 | 201-941-8100', '201-941-2899', 1),
  ('bedb732b-9004-528c-9652-50c1cfae0a2a', '6c7738a9-c6c2-5c8b-99eb-57a9287bb1c1', NULL, '954 Teaneck Rd, Teaneck, NJ 07666', '201-833-2300', '201-833-7600', 0),
  ('ec5d8f1a-7404-5328-89b0-cfce94dbc6d4', 'a5d0facf-309e-5f37-97ee-4691cd0b9a12', NULL, '810 Abbott Blvd Suite 201, Fort Lee, NJ 07024', '(201) 224-0050', '(201) 224-6061', 0),
  ('c5cc30c3-0dd7-5832-a10e-9260ab5d791e', '41642506-40ef-51ad-91f7-a1561f6e8fbb', NULL, '381 Teaneck Road Suite 101 Teaneck, NJ 07666', '(201) 660-9946', '(201) 801-9007', 0),
  ('a94a06f1-f82d-5b14-b342-d6787ccb79e0', '03885766-395b-5be1-b947-2a358cc18dbb', NULL, '596 Anderson Ave. Ste 302 Cliffside Park, NJ 07010', '(201) 987-6090', '(551) 303-2033', 0),
  ('aa422580-7f78-5cad-b185-e57b9ddabe0b', '306eaafd-56c6-5c6c-8439-41831176fc61', NULL, '400 Frank W Burr Blvd Fl 2 Suite 22 Teaneck,NJ 07666', '(201)-928-2300', '201-692-3262', 0),
  ('b1d57cc5-4b0b-57b4-b4b7-09dcec6ec012', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '143 Palisade Ave, Jersey City, NJ 07306', '(973) 916-0002', '(973) 916-0027', 0),
  ('7e2d3fda-c459-5c99-a7b9-ac4bf93c32d2', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '643 Mt. Prospect Ave, Newark, NJ 07104', '(973) 916-0002', '(973) 916-0027', 1),
  ('f35042e7-6333-54b4-9bb7-50b0f621cf33', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '654 Mt. Prospect Ave, Newark, NJ 07104', '(973) 916-0002', '(973) 916-0027', 2),
  ('357ba5c8-101e-5f90-bddb-ecbecc5f7821', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '606 Broadway, Paterson, NJ, 07514', '(973) 916-0002', '(973) 916-0027', 3),
  ('b0f4cc58-66e3-55da-832c-028eb029267a', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '91 Main St, Paterson, NJ 07501', '(973) 916-0002', '(973) 916-0027', 4),
  ('bb7345f9-6eae-50c7-8209-4c609f5da3c8', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '2 Smalley Terrace, Irvington, NJ 07111', '(973) 916-0002', '(973) 916-0027', 5),
  ('d59db25b-8451-5f3a-82b9-7334f53a9a4f', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '293 Passaic St, Passaic, NJ 07055', '(973) 916-0002', '(973) 916-0027', 6),
  ('c25c67b6-03cf-5b43-bb43-619085d4c7a3', '82e503b9-f63b-5169-ab2a-7f08f523663d', NULL, '591 Franklin Ave, Nutley, NJ 07110', '(973) 916-0002', '(973) 916-0027', 7),
  ('36040490-a8c8-57f5-91bc-4ed2d05ec352', 'afa8d400-4839-5a07-9044-7119d635634e', NULL, '4512 John F. Kennedy Blvd, Union City, NJ 07087', '(201) 348-4442', '201-348-4475', 0),
  ('6c5dc892-a20b-5930-a5a2-4b283c67b77c', '1164894a-0e74-5e3c-8cc8-7de2792164ef', NULL, '7650 River Road North Bergen, NJ 07047', '(201) 869-1313', '(201) 854-7945', 0),
  ('3dd3538f-71e5-5810-9cd4-722ffc335f18', 'b8531b03-ef3f-5f94-a36d-5e904be7a89f', NULL, '140 East Ridgewood Avenue, Floor 7, Paramus, NJ 07652', '201-251-3243', '201-389-6777', 0),
  ('388f91a8-0ac0-54b3-9113-93e28c906947', '17aef8af-a496-5968-ab5a-50266395d2b1', NULL, '33-41 Newark St, Suite 4C Hoboken, NJ 07030', '201-533-0222', '201-533-0223', 0),
  ('38cf8009-b34f-5a40-94b7-1c46083ca2e1', '03eff78c-88aa-5815-9857-96abef0fc5df', NULL, '16 East 29th St Bayonne, NJ 07002', '(973) 926-3500', NULL, 0),
  ('9ce3486b-f2f9-5411-9542-a1305776d9ae', '5e3d3554-0a62-5b2b-820e-e07f8759901f', NULL, '4309 Liberty Ave, North Bergen, NJ 07047', '201-583-1355', '201-583-1350', 0),
  ('86f3d3a5-4f50-5ddf-8fbe-dccba24156d7', '7996f0e8-ff7e-5cdd-be47-c70de8e26f3c', NULL, '596 Anderson Ave Suite 104 Cliffside Park, NJ 07010', '201-941-8008', '201-941-3880', 0),
  ('d3fba528-f7ba-5789-a42e-b5b2fd056a85', 'e53702e1-f13d-5342-808e-3783904e6243', NULL, '8325 Kennedy Blvd. North Bergen NJ 07047', '201-861-2025 , 201-241-4061', '201-861-2262', 0),
  ('fec0d3dd-9006-5e32-a2a1-907880da965e', '72ddb7da-60bc-5197-95e3-65f3897800b5', NULL, '700 79th St, North Bergen, NJ 07047', '(201) 854-8100', '201 861 5636', 0),
  ('5ef8d471-e9ed-5ca8-a5bf-1182cb40faac', '72ddb7da-60bc-5197-95e3-65f3897800b5', NULL, '601 Main Ave., Passaic, NJ 07055', '973 473 8188', '973 458 1965', 1),
  ('fd2ed695-9001-5e41-8cbc-0a3100bb04ef', 'ab42af2b-313b-5158-ab5e-cd29a490a5c7', NULL, '7918 John F Kennedy Blvd. North Bergen, NJ 07047', '201-854-1616', NULL, 0),
  ('62e5903d-b3e1-5e2f-ab3e-c2783e3580a7', '29310b8a-f9c2-536a-b72d-b513d54b0b81', NULL, '7322 Bergenline Avenue, North Bergen, NJ 07047', '201-867-0404', '201-868-2499', 0),
  ('ec0e7d0a-34ca-5c50-9d91-9c0dd76c0b7a', '29310b8a-f9c2-536a-b72d-b513d54b0b81', NULL, '605 Broad Avenue, Ridgefield, NJ 07657', '201-941-9494', '201-941-1246', 1),
  ('f04982f8-5513-57c8-aee2-8487cfb8d329', '29310b8a-f9c2-536a-b72d-b513d54b0b81', NULL, '16 Johnson Avenue, Hackensack, NJ 07601', '201-342-7353', '201-342-7982', 2),
  ('ca13d73b-caa2-54b4-9da4-571ee733c98e', '0470d5d0-2147-5855-9cdf-8d33cd45e94f', NULL, '991 Van Houten Avenue Clifton, New Jersey 07013', '973.777.1933', '973.777.4727', 0),
  ('d32e0f96-d208-5287-bc73-460ce68cf7c5', '7b3d772a-6804-5df6-99c0-de7e8bbb06dc', NULL, '10 Church Towers, Suite 1, Hoboken, NJ 07030', '(201) 795-3376', '201-795-5515', 0),
  ('4b92e95a-1910-5dc5-aad4-0d11dcccf0aa', '1707a481-89cc-5ea3-b48b-4c5fd8e30a89', NULL, '663 Palisade Ave #201, Cliffside Park, NJ 07010', '201-298-3650', NULL, 0),
  ('d0fbd39c-be8d-5181-8026-61458def3f6a', '45c40137-9806-52fc-a182-1f3e5ad06455', NULL, '5809 Madison St, West New York, NJ 07093', '(201) 861-4226', '(201)861-7630', 0),
  ('04d705d6-5589-58b3-8ccc-11dfaa54ae4a', '4bf41a5b-298a-54c1-b47a-96416519168e', NULL, '5809 Madison ST ,West New York , 07093', '201-861-4226', '201-861-7630', 0),
  ('fa2cf334-93e9-5c0a-8891-e9fe21f51f96', 'e3c5e5e3-6bcf-5acb-8537-f7a566d64e7e', NULL, '1100 Clifton Ave, Suite F, Clifton, NJ 07013', '(201) 255-4046', '201-793-7620', 0),
  ('39b5c1dd-5d48-54ee-9156-3f5aa9ddc927', '55164b2b-e28d-5ac2-bb89-81204e22716b', NULL, '2 Hudson Place, Hoboken NJ.', '201-795-0021', NULL, 0),
  ('e991e84d-b387-50a3-bdf5-72e7d9dfa9d5', '55164b2b-e28d-5ac2-bb89-81204e22716b', NULL, '71 Union Ave, Ste 108, Rutherford, NJ 07070', '212-283-3000', '646-462-3018', 1),
  ('d0b9fea2-b25a-526f-806d-50641cd1bd11', '55164b2b-e28d-5ac2-bb89-81204e22716b', NULL, '23-00 State Rt 208, Fair Lawn, NJ 07410', '212-283-3000', '646-462-3018', 2),
  ('d43d2e7b-9c28-509f-8258-bfd8acff116b', '5eece8da-b407-5f35-b3d7-e2297a475306', NULL, '411 60th St, West New York, NJ 07093', '(201) 867-8550', NULL, 0),
  ('5c7253a9-ea80-5cb0-9dbd-d40be287ea73', '9f9081c5-af12-5b78-8224-ae137bb996cd', NULL, '1033 Clifton Avenue, Suite 201 Clifton, NJ 07013', '(973) 777-6444', '(973) 777-5277', 0),
  ('04402aba-ad07-59d1-8f3a-77c1f7ed7b06', '04ecfbd5-5493-5e87-9b98-52da484a73c8', NULL, '435 57th St, West New York, NJ 07093 (Not available appt for new Pt until Dec/2026 @WNY)', '201-520-1069', NULL, 0),
  ('c6317d07-a15b-513f-9631-58673937029e', '04ecfbd5-5493-5e87-9b98-52da484a73c8', NULL, '2 Journal Square Plaza, Jersey City, NJ 07306 (Diabetics Center)', '201-520-1069', NULL, 1),
  ('57d9800e-c253-59ea-b2a6-aa25ed80f78d', 'e6c47783-a38a-57c3-bf03-923632d2958b', NULL, '6045 Kennedy Boulevard, Ste B, North Bergen, NJ 07047', '(201) 453-0322', '(201) 453-0325', 0),
  ('8591aaf2-05bc-5774-aa2e-b6197ad3b6f0', '1901085c-10ba-5d4f-88dc-e1df7d61adfc', NULL, '377 Jersey Ave Ste. 220 and 414 Grand Street Ste 14. Jersey City, NJ 07302', '(201) 915-2380', '(201) 915-2381', 0),
  ('dfe35f9d-0a50-518e-9faa-4a539d6da422', '1901085c-10ba-5d4f-88dc-e1df7d61adfc', NULL, '59 Newark St. Hoboken, NJ 07030', '(201) 915-2380', '(201) 915-2381', 1),
  ('5760c71f-604c-5107-a069-f4794a422fe8', '969f563d-302e-50d3-a5a2-7535fec49095', NULL, '596 Anderson Ave, Suite #208, Cliffside Park, NJ 07010', '(201) 941-5757', '(201) 941-5779', 0),
  ('74d0d925-aefc-5efa-b1e5-a4e2db266ed9', 'f4547d72-fcb2-57ee-977d-484b0aae41c1', NULL, '240 West Passaic Street, Suite 14 Maywood NJ, 07607', '201-903-0070', '201-322-0287', 0),
  ('5f0300bd-6afd-5180-ac92-cf460347b1e1', '63078365-aea6-5c5b-92c4-846958c3b330', NULL, '721 Teaneck Road Teaneck, NJ 07666', '201-971-9001', '201-907-1190', 0),
  ('d1c20a80-e4ce-524e-a304-45a4485e22ca', '6db99c88-3b15-5acf-a24d-61ac57b67dbd', NULL, '30 Prospect Ave # 251, Hackensack NJ', '(551) 996-5329', NULL, 0),
  ('5e66d0a1-a8ef-5756-92cb-947232fb2f42', 'd225962c-d044-546e-8035-61bb7235e169', NULL, '240 W Passaic Street Maywood NJ.', '(201) 903-0070', NULL, 0),
  ('3f4be022-b416-5add-a1ce-89cf7fc347b7', '7a878442-138e-5c66-8262-5d3ac8c30706', NULL, '413 60th St. West New York, NJ 07093', '(201) 867-5557/ (201) 342-8060', '201-867-5566', 0),
  ('fd244882-434e-5a1c-ba3f-85c7f7e62829', 'af08250e-f63e-5c93-8d3e-f4f86b0fe7e3', NULL, '47 Orient Way, 2nd Fl, Rutherford NJ 70702/ Not UHC', '201-935-5508', '201-465-6088', 0),
  ('13f23116-738b-56c0-be25-b9b64448261f', 'af08250e-f63e-5c93-8d3e-f4f86b0fe7e3', NULL, '6 Brighton Road, Suite 104, Clifton, NJ 07012', '201-935-5508', '201-465-6088', 1),
  ('6e19eee9-2ed9-523a-b799-8c1aea373e57', 'a2ca0186-d7c6-5bed-89ff-be3feb9a32bf', NULL, '324 Palisade Avenue, 2nd Fl, Jersey City, NJ 07307', '201-293-4030 / (347) 557-8368', '201-293-4099', 0),
  ('a6e8d1ae-c090-5c7b-b9aa-b259fbf4e8d6', 'a2ca0186-d7c6-5bed-89ff-be3feb9a32bf', NULL, '1425 Bloomfield Street, Hoboken NJ 07030', '201-293-4030 / (347) 557-8368', '201-293-4099', 1),
  ('f15d1856-2216-57c3-8371-1c2e20d5b801', 'a2ca0186-d7c6-5bed-89ff-be3feb9a32bf', NULL, '255 State Route 3 East, Suite 101, Secaucus, NJ 07094', '201-293-4030 / (347) 557-8368', '201-293-4099', 2),
  ('a300a1f8-be99-5ad8-9b0f-825511ca1bb0', 'a013397a-7417-5c0f-bf94-5adfc33ce35f', NULL, '216 Engle Street, Suite 101 Englewood, NJ 07631', '(201) 816-9800', '201-567-1569', 0),
  ('8ff56723-9fec-5b48-983f-5db9403e0002', '7fa41d42-0af0-514c-b4b5-008c835c993d', NULL, '400 38th Street, Suite 404, Union City, NJ 07087', '201-453-1677', '201-659-4707', 0),
  ('0c602532-fbd9-50a5-a11f-b1978a070ce4', '6ab042b1-ca26-5e41-9cb0-6b14391cbcc6', NULL, '9252 Kennedy Blvd, North Bergen, NJ 07047', '(201) 869-9500', '201-869-9501', 0),
  ('13b4ff61-ecb8-5845-a058-83d5c4204754', '00dc1310-f29b-5cf3-86e1-04833046624c', NULL, '235 60th Street, West New York, NJ 07093', '201.854.4646/201.854.4647/201-854-4740', '201-854-3203', 0),
  ('38af2639-dc2b-5896-896a-923b2df54bd7', '00dc1310-f29b-5cf3-86e1-04833046624c', NULL, '810 Main Street, Hackensack, NJ 07601', '201.488.0095', NULL, 1),
  ('a7afb9fc-cfbc-5468-9f59-21bfff31b139', '70724ae6-499b-5a7c-b7d0-1dca0f995ea6', NULL, '7650 River Road, Suite 300, North Bergen, NJ 07047', '201-710-2715', NULL, 0),
  ('a77ea6b8-3b33-51e3-b117-0666976f7423', 'f264fc82-21e0-509b-b979-9a761cf6e70d', NULL, '327 60th St, West New York, NJ 07093', '973-645-0000', '973-645-0001', 0),
  ('9f5bb4a3-1269-519e-9bdb-91fdfc151b34', 'f264fc82-21e0-509b-b979-9a761cf6e70d', NULL, '79 Hudson St, Suite 301, Hoboken, NJ 07030', '973-645-0000', '973-645-0001', 1),
  ('f79db7c0-1ba0-580d-a996-dfe9bf0bf9dc', 'f264fc82-21e0-509b-b979-9a761cf6e70d', NULL, '24 Merchant St. Newark, NJ 07105', '973-645-0000', '973-645-0001', 2),
  ('b514bc2f-9334-50a2-a7f8-f4bb620ed72a', '91698c8b-3e42-555f-98cd-ab37a29bdf24', NULL, '8901 Kennedy Blvd. Suite 5S North Bergen NJ 07047', '201-868-2849', '201-868-4190', 0),
  ('a12912d4-f0ab-5561-94d5-65d31cb2e219', '91698c8b-3e42-555f-98cd-ab37a29bdf24', NULL, '142 Palisade Ave. Suite 201, Jersey City, NJ 07306', NULL, NULL, 1),
  ('9ffc4d98-47c4-512b-af42-8f4cedc32a54', 'f879f6ce-3db4-5661-a064-9cedbbdb3284', NULL, '5600 Kennedy Blvd W Suite 103, West New York, NJ 07093', '(201) 902-9500', NULL, 0),
  ('030c057e-2a23-53f4-8ff5-4312c7fb3f32', 'f879f6ce-3db4-5661-a064-9cedbbdb3284', NULL, '1 Bellevue Terrace, Weehawken, NJ 07086', '(201) 348-9200', '(212) 410-6093', 1),
  ('c0890a8d-315e-50a8-b02f-74aa26aedf24', '1dc1083e-86ec-5d71-a54b-6d2775087136', NULL, '3196 Kennedy Blvd Ste 2, Union City, NJ 07087', '(201) 325-9393', '201-865 4416', 0),
  ('63edb3a0-51ce-524a-96ed-8655439c5570', '063ac86f-ad25-5056-a014-75533e4f515a', NULL, '435-57th St, West New York, NJ 07093', '(201)295-1456', '(201) 520-1085', 0),
  ('0524030e-e980-5982-9f4f-63ea1a458881', '9e45c536-002b-592e-9883-ce008bd5cbd4', NULL, '330 Grand St. Hoboken, NJ', '201-420-7903', '201-420-7586', 0),
  ('3a220eeb-41c9-59a2-a633-296596323ac2', '9e45c536-002b-592e-9883-ce008bd5cbd4', NULL, '142 Palisade Ave. Suite 108, Jersey City, NJ', '844-211-2273', NULL, 1),
  ('6688f3ce-29e8-5892-96c2-310f7d43a0b2', '790329ba-0fbc-575d-9ead-c6935832f46e', NULL, '905 Allwood Rd, Clifton, NJ 07012', '(973) 546-4242', '(973) 546-7639', 0),
  ('e34862bb-98be-57b1-ad95-59a960c7b428', '399c2ed7-7359-59ff-b374-ac579a793119', NULL, '59 Newark Street, Hoboken NJ 07030', '551-350-6910', '201-253-0454', 0),
  ('7158d61d-14a9-5ffd-b9e4-1b7e9ed44c94', '399c2ed7-7359-59ff-b374-ac579a793119', NULL, '3196 Kennedy Blvd, Union City, 07087', '551-350-6910', '201-253-0454', 1),
  ('9ab90ed5-d1fb-5f0d-95cc-fbae4f96f5d2', '399c2ed7-7359-59ff-b374-ac579a793119', NULL, '169 York Street, Jersey City NJ 07302', '551-350-6910', '201-253-0454', 2),
  ('ade50f14-8b9c-5391-a8bf-2504acd642b1', '93c0b1e2-366e-5bb0-8e5e-f6dda4544806', NULL, '225 Minnisink Road, Floor 3, Totowa, NJ 07512', '973-754-2315', '973-754-2925', 0),
  ('eecd5bf5-1964-54d2-9150-cbdcf53309da', '93c0b1e2-366e-5bb0-8e5e-f6dda4544806', NULL, '1135 Broad Street, Suite 1, Clifton, NJ 07013', '973-754-2315', '973-754-2925', 1),
  ('3b7584b0-32ee-53dc-9a7c-099d921445f6', 'e446e3c7-0b82-5b93-bf5d-57515268aa05', NULL, '55 Meadowlands Pkwy, Secaucus, NJ 07094', '201-392-3100', NULL, 0),
  ('e99f9e3a-3e3d-51ff-a499-7e7e00b3f13b', 'c6f4dee1-0896-5ce1-88b3-44860ba25848', NULL, '2 Marine View Plaza Hoboken, NJ 07030', '212-241-0034', NULL, 0),
  ('6e0fe857-a343-5627-8ece-310d690f4403', '58915bca-1dea-5e30-b0f2-3ae06bc9faa6', NULL, '2000 West St, Suite 205, Union City NJ, 07087', '(201) 751-4004', '201-455-6296', 0),
  ('b1f63145-fb05-5aeb-986c-180a492daea4', '58915bca-1dea-5e30-b0f2-3ae06bc9faa6', NULL, '1151A Main Ave Clifton NJ 07087', '(201) 751-4004', '201-455-6296', 1),
  ('62640676-3de1-592f-a33b-fef16c0cdfac', '02729813-0a7d-5bfc-8c01-db42f661801a', NULL, '1947 John F Kennedy Blvd, Jersey City, NJ, 07305', '(201) 433-4848', '(201) 360- 0159', 0),
  ('c9043898-7a48-52d2-97aa-eedb38288647', 'f000131a-1019-54d9-9af3-e212fdf191e8', NULL, '1829 Hudson Park, Edgewater, NJ 07020', '732-390-7750', '201-201-7234', 0),
  ('58f2a58e-cd55-54cf-8201-e09ef94a8ff5', 'f000131a-1019-54d9-9af3-e212fdf191e8', NULL, '1 Exchange Place, Jersey City NJ 07302', '732-390-7750', '201-201-7234', 1),
  ('dc935234-0ff4-50c3-b101-1b1b1c4357b0', '6746540a-1a75-5d0a-b4cb-77cce1b1d06a', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', '201-227-6008', '201-227-6002', 0),
  ('62bb47c6-a141-5704-95cb-f15009debce2', 'c3f11295-72b9-5415-bb90-fcd7f05d9763', NULL, '377 Jersey Ave, Suite 160, Jersey City, NJ 07302', '(201) 333-8248 , (201) 523-5459; (732)390-7750', '201-333-8469 or 609-642-1069', 0),
  ('9c7e8e9c-f499-5187-9f37-342c3478647f', '465601a2-8562-5a46-b5e0-95838524e2e1', NULL, '718 Teaneck Rd. Teaneck, NJ 07666', '201-541-5900', '201-541-6305', 0),
  ('49a22f41-a821-5706-92d9-f9a79857c982', 'ab0440f3-d492-524c-a0fe-c65a72137f12', NULL, '197 Cedar Lane, Teaneck, NJ 07666', '201-591-9840', '201-591-9837', 0),
  ('6f65bac8-dc18-5dd6-a179-6398652698d0', 'df848863-d288-5821-ac3b-eb49e0fdb7db', NULL, '100 Town square Place, 6th floor, Jersey City, New Jersey 07310', '201-621-0909', NULL, 0),
  ('19f46a12-529a-527f-b4eb-fac5792c9079', 'b31ad97a-cf39-5a88-afe2-a97248640b03', NULL, NULL, '201-569-7773', NULL, 0),
  ('add37c9a-83d0-5a8f-ba6b-ea2ca02264f3', 'c271ab5d-880c-582d-99d9-5679dfb654aa', NULL, '25 Millburn Avenue, Building C - Suite 304, Millburn, NJ 07041', NULL, NULL, 0),
  ('1edba663-4e29-5895-b350-3d8ad38272ad', 'c271ab5d-880c-582d-99d9-5679dfb654aa', NULL, '16 Pocono Rd, #114, Denville, NJ 07834', NULL, NULL, 1),
  ('e273184f-e3c3-575b-aca5-d6fda49ef926', 'b50b4b62-630f-534d-9fd8-4fda0baf3a67', NULL, '600 Pavonia Ave # 4, Jersey City, NJ 07306', '(201) 222-2693', '201-823-2880', 0),
  ('877eaf3f-4c0d-543a-93ca-ec77dcd04801', '168a67d5-8e73-5827-8ec6-3ce1172ff1ff', NULL, '8841 Kennedy Blvd Blvd, North Bergen, NJ 07047', '201-854-6614', '201-854-1380', 0),
  ('b4dd170d-83ee-5faa-85d3-3702277b12b4', '585810e5-83a3-50fa-9bbc-7325189def87', NULL, '727 10th St. Union City, NJ 07087', '(201)-864-5252', '(201)-864-9955', 0),
  ('91073726-8116-5617-bcd3-ca247fdec302', '8f954502-4691-5287-947b-489ab2ed0d72', NULL, '1 DeGraw Ave, Teaneck NJ 07666', '(201)-855-8300', '(201)- 975-8028', 0),
  ('8de8eeca-9ac9-5e2d-8b0c-170c263eb6d0', '69dea27b-4d8e-5c86-adbe-832cb5a6a241', NULL, '255 W Spring Valley Ave # 102, Maywood, NJ 07607', '(201) 880-8060', '(201) 880-8061', 0),
  ('8169dcb1-ee4b-59a1-bd2a-06b2693d6727', '53ee3c56-6aa5-5a9d-93b4-57f85daffc8f', NULL, '718 Teaneck Road, Teaneck, NJ 07666', '201-833-7208', '201-379-5708', 0),
  ('1c296083-7637-5459-8f32-d61b13c745b6', '0c0d4e7e-89e8-50e2-b9c2-9b457c4ce86a', NULL, '8103 Bergenline Ave North Bergen NJ 07047', '201-758-0660', '201-758-0635', 0),
  ('517766ed-c823-5c5a-89b2-597cea194c52', 'cc62dc3b-e0c7-5c84-8d2e-41cee699ad94', NULL, '9225 Kennedy Blvd, North Bergen, NJ 07047', '201-869-2707', '(201) 869-2717', 0),
  ('373627a4-cbe9-5c76-8ae4-27043b181e2f', 'cc62dc3b-e0c7-5c84-8d2e-41cee699ad94', NULL, '3196 KENNEDY BLVD STE 3 Union City, NJ 07087', '201-833-9500', '(201) 862-0095', 1),
  ('6014b53b-fa76-52fd-b863-040697d7538d', '3ee97184-305b-54e4-aba8-2eadd10ea5f5', NULL, '718 Teaneck Road MS Center, Teaneck, NJ 07666', '201-837-0727', '201-837-8504', 0),
  ('d9bb6ddf-3dc9-557d-b05a-7bc59f6d0cc9', '57b8cc74-efcb-5999-9be1-a27d1d6646d9', NULL, '8500 Kennedy Blvd, North Bergen, NJ 07047', '(201) 758-8838', NULL, 0),
  ('f431e8b2-b18b-50f0-b76b-1d6267f9f53a', '57b8cc74-efcb-5999-9be1-a27d1d6646d9', NULL, '500 Union Blvd Totowa, NJ 07512', '(201) 758-8838', NULL, 1),
  ('076f527c-f6d7-55f7-a2c1-483310c67053', '316c59ee-8d24-54e7-82c3-c93096dfff35', NULL, '33-41 Newark Street, 5th Fl, Hoboken, NJ 07030', '917-647-1665', '201-473-5812', 0),
  ('4b0f7355-ffdd-595b-8aff-2011d57a6f40', '90423dc1-917b-5b88-89ef-82e39c3491fe', NULL, '6809 Bergenline Avenue, West New York, NJ 07093', '201-758-8838', NULL, 0),
  ('9e6fdac8-0bfc-5fce-ada5-b8ee26c259e4', '1b68a7c2-1a26-5ab8-a118-0a14131e5504', NULL, '718 Teaneck Road Teaneck, NJ 07666', '201-227-6040', '201-808-8413', 0),
  ('db6fdefc-24fe-5762-8bc8-d21715429edf', 'e41f4014-ed8c-5e34-aeb2-93a4ff7cea98', NULL, NULL, '617-221-6494', '866-803-5661', 0),
  ('99e2bf86-3e1d-5476-b4cf-166d1b5c61f8', 'cedafd7e-c1e8-5ca3-8f9a-aff59cf9a91d', NULL, '211 60th St. West New York, NJ 07093', '201-379-5650', NULL, 0),
  ('907625ee-2935-5f7c-a880-3d1bc6ea2d8c', 'cedafd7e-c1e8-5ca3-8f9a-aff59cf9a91d', NULL, '222 Cedar Lane, Suite 109, Teaneck, NJ 07666', '201-379-5650', NULL, 1),
  ('f78014eb-47da-5694-8314-a9e280b100ad', '3a0661a6-db99-5cae-b2ed-644c86f0fca1', NULL, '510 31st Street, Union City, New Jersey 07087', '201.866.3322', '201.866.2289', 0),
  ('269ecfce-e0f4-57fc-a32f-d4f7d281c13c', '3a0661a6-db99-5cae-b2ed-644c86f0fca1', NULL, '26 Greenville Ave, Jersey City, NJ 07305', '(201) 333-8222', '201-333-0095', 1),
  ('6047a2c1-00b7-5d48-9674-82180a4920ed', '3a0661a6-db99-5cae-b2ed-644c86f0fca1', NULL, '377 Jersey Ave., Suite 220, Jersey City, New Jersey 07302', '(201) 333-8222', '201-333-0095', 2),
  ('623bafd8-43a3-56ba-bfa0-2ee0fd282dae', '3a0661a6-db99-5cae-b2ed-644c86f0fca1', NULL, '1600 Willow Ave., Hoboken, New Jersey 07030', '(201) 333-8222', '201-333-0095', 3),
  ('1d4d5588-327e-52d9-b7eb-935029794949', '3a0661a6-db99-5cae-b2ed-644c86f0fca1', NULL, '862 Broadway, Bayonne, New Jersey 07008', '(201) 333-8222', '201-333-0095', 4),
  ('2ead8a38-1bf6-50ed-af58-4ca12bcd4e3d', 'fdafe991-e0ea-5934-be3a-c8ec1581b67b', NULL, '142 Palisade Ave #202, Jersey City, NJ 07305', '201-963-1077', '(973) 325-2254', 0),
  ('0cf8a67c-2f0d-5a97-b185-22fd4373fa69', 'd51c930e-3c07-505d-b565-2c6d3f974585', NULL, '1590 Lemoine Ave, Suite 102, Fort Lee NJ 07024', '201-491-0050', '201-491-0060', 0),
  ('37eecf3c-27ad-591f-9098-ff83f601c738', '62f8b50e-a711-52d5-ac4e-94cf3bda7c84', NULL, '576 Anderson Avenue Cliffside Park, NJ 07010', '201-943-4884', '201-943-4839', 0),
  ('ccf55599-a4d2-5b69-a856-198c69e14757', '20d1e795-600c-5613-9e09-1fbc16e3289c', NULL, '870 Palisade Ave., Suite 301, Teaneck, NJ 07666', '201-907-0900', NULL, 0),
  ('f193714f-ad98-535b-9dc0-9c2adcffd197', '20d1e795-600c-5613-9e09-1fbc16e3289c', NULL, '71 Union Ave., Suite 101, Rutherford, NJ 07070', '201-514-0300', '201-907-0229', 1),
  ('f057827f-7d40-5cb9-b1a4-ae9d940727f6', 'c6d03f7b-6052-52d6-b6c9-e8dfd19590e0', NULL, '160 Essex St, Lodi, NJ 07644', '(201) 342-1191', '(201) 342 1195', 0),
  ('d5f76070-7b0e-5065-a334-45f700df6587', '8fa2278c-312c-5bae-9872-2b7a00c0943a', NULL, '50 South Franklin Turnpike, Suite 2B, Ramsey, NJ 07446', '201-575-1211', '201-934-8499', 0),
  ('cfe09a08-7f73-5300-afdc-8e056be9e461', '7f5d2321-a34f-5212-acb9-808eb7530a3c', NULL, '25 Rockwood Pl., Suite #305, Englewood, NJ 07631', '201-894-0003', '855-754-0591', 0),
  ('edff9f33-90f6-5938-bb75-c1e138fd4ec8', '986f481a-c049-57c6-bdd8-ce34b5f41443', NULL, '435 57th Street West New York, NJ 07093', '201-520-1069', '201-520-1085', 0),
  ('a77c8139-e799-5a28-a97e-28a271c7caa1', '986f481a-c049-57c6-bdd8-ce34b5f41443', NULL, '609 Washington Street, Hoboken, NJ 07030', '201-659-7700', '201-526-9319', 1),
  ('3256de22-5a81-5d7f-9eda-f91249150acd', '986f481a-c049-57c6-bdd8-ce34b5f41443', NULL, '968 River Road, Suite 203, Edgewater, NJ 07020', '201-659-7700', '201-869-0094', 2),
  ('bca2442f-20de-577d-afb5-bf237aec343f', '986f481a-c049-57c6-bdd8-ce34b5f41443', NULL, '542 Broadway, Bayonne, NJ 07002', '(201) 659-7700', '201-858-1638', 3),
  ('3aedb881-d470-5f0d-962e-5dd36dae32d9', '14f18e80-024d-5e70-8f6d-09e5658fe90e', NULL, '419 66th St, West New York, NJ 07093', '201-861-9229', '201-861-9272', 0),
  ('9910be77-8df0-5149-bbc1-8e5ddce103e4', 'dd8634c7-2a29-5b41-9294-811622f4e2b2', NULL, '3196 Kennedy Blvd Ste 2, Union City, NJ 07087', '201-330-0333', '201- 766-2939', 0),
  ('19cd3a91-75a7-5c7c-ad13-f3af67e64705', 'c198be68-b13b-524e-9a7a-f268e0f528ef', NULL, '5301 Broadway, West New York, NJ 07093', '(201) 866-9320', NULL, 0),
  ('2bf1433d-e9b3-5991-a00e-171dc6ad5041', '34f0f26a-a9ef-5cc5-a89b-b7fa27cdeb27', NULL, '401 S Van Brunt St Ste 405, Englewood, NJ 07631', '(201) 871-4346', '201-871-5953', 0),
  ('65c0e9d8-5409-5855-a077-6c341b39bf9c', '6c700834-1e3e-5ec8-964e-3c110f1c2eb7', NULL, '5 Marine View Plz, Hoboken, NJ 07030', '(201) 706-4524', NULL, 0),
  ('2cb9ca48-e5b9-50a8-bda3-1baaf2539557', 'acd1de4c-e2cd-5c2e-a872-aaa751624979', NULL, '2 Brighton Road, Suite 402, Clifton, NJ 07012', '973-532-2500', '973-532-2530', 0),
  ('a88ac62b-2f33-502f-8ef8-2a3a40dcf64d', 'acd1de4c-e2cd-5c2e-a872-aaa751624979', NULL, '609 Washington Street, Hoboken, NJ 07030', '201-659-7700', '201-526-9319', 1),
  ('3f15abf0-504c-5799-ba68-598856c93d7b', '5fadc06d-2c89-5ae2-b830-a0bfdcf293db', NULL, '155 East 76st , Suite 1H, New York, NY 10021', '516- 584-8710', NULL, 0),
  ('40f09352-8df7-51d0-ac8f-ae49aeffdf63', '49e105a8-026d-5477-b058-bb631ea4ae48', NULL, '124 Grand Street Hoboken, NJ 07030', '(201) 963-0300', NULL, 0),
  ('5957d47a-908b-50b5-8a89-557932fb6518', '49e105a8-026d-5477-b058-bb631ea4ae48', NULL, '1206 Summit Avenue Union City, NJ 07087', '(201) 319-9200', '201-319-9121', 1),
  ('43b7113f-ac26-5bc2-a4c7-d07f541faae0', '49e105a8-026d-5477-b058-bb631ea4ae48', NULL, '5305 Hudson Avenue West New York, NJ 07093', '(201) 866-8071', NULL, 2),
  ('662651d0-cc90-599f-96e6-086d6affbe51', 'a0f069d4-a48c-5946-84f4-9133a941c13f', NULL, '575 Main Street Hackensack, NJ 07601', '(201) 489-1140', NULL, 0),
  ('aa3c96a0-c769-5625-8950-90fce4b5edb2', 'a0f069d4-a48c-5946-84f4-9133a941c13f', NULL, '29 N Fullerton Avenue Montclair, NJ 07042', '(973) 746-7116', NULL, 1),
  ('88e4ac54-46b1-516c-a83f-ef80de23a6f4', 'a0f069d4-a48c-5946-84f4-9133a941c13f', NULL, '46 N Van Brunt Street Englewood, NJ 07631', '(201) 894-0966', NULL, 2),
  ('98686cd0-e9ee-5822-9526-0334abc59d30', 'e4671b6a-8f7a-592b-81fb-14c01ae76d6d', NULL, '25 Millburn Avenue, Building C - Suite 304, Millburn, NJ 07041', NULL, NULL, 0),
  ('ac52e2cb-dec3-5100-b2fa-3e25000a7172', 'e4671b6a-8f7a-592b-81fb-14c01ae76d6d', NULL, '16 Pocono Rd, #114, Denville, NJ 07834', NULL, NULL, 1),
  ('523b0682-47c2-5d2d-8145-b02e1845fe0f', '63017536-7531-596d-b457-2ecd7d065818', NULL, '7418 Bergenline Ave, North Bergen NJ 07047', '201-868-1886', '201-868-7392', 0),
  ('df7fa272-2d4e-5bbd-a7d7-1bd6e34cbee6', '46afea21-b0d4-5885-a691-31b49f7d50b7', NULL, '6408 Bergenline Ave. West New York, NJ 07093', '201-868-3603', NULL, 0),
  ('494be1f8-b934-5e63-9103-70f11825eb00', 'fd5acecb-c5ae-5793-a3be-ec2249f105f8', NULL, '7922 Kennedy Blvd. North Bergen, NJ 07047', '201-295-2020', '201-295-0804', 0),
  ('09302ebe-a879-5090-84d1-638c2ae3057e', 'b4134a67-17a1-5dd9-b3d4-3348c04f9e35', NULL, '7225 Bergenline Ave 2nd Fl, North Bergen, NJ 07047', '(201) 861-8813', '201-861-2695', 0),
  ('de3ee749-8714-5fac-a2bd-4a3024da84f7', '27bce84b-e15c-51a5-a042-37c5f3240421', NULL, '6000 Bergenline Ave. West New York, NJ 07093', '201-751-2388', NULL, 0),
  ('803d0e19-f0b2-5a1f-bb09-d912f03f1cd1', 'dc3395c8-cb29-5799-80ff-53d4396034e8', NULL, '3196 Kennedy Boulevard, Union City, NJ 07087', '(201) 867-2999', '(201) 867-4440', 0),
  ('020afa9b-5425-5f1c-b92b-64dc457ec045', '9c5a1e9b-c4ec-5a1f-b10e-5a655fdbf3f7', NULL, '229 60th St, West New York, NJ 07093', '(201) 869-0707', NULL, 0),
  ('43304af4-248b-5fa9-ba58-d57a09db672e', 'b2643ec8-77e2-51ab-b3c2-8794e5cf338a', NULL, '7316 Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 0),
  ('48bf5a13-3242-5743-afac-8145e247bc5f', 'dc30fa31-6e6d-52bb-8901-9b0f590645fa', NULL, '1126 Washington Street Hoboken, NJ 07030', '201-659-2020', '201-659-8330', 0),
  ('a0815c65-9bff-5f5f-a02f-3273ed775e14', 'd4157ff5-3d21-5b8f-a3be-0c30a6fff296', NULL, '2201 Bergenline Ave. Union City, NJ', '(201) 601-2020', '201-601-9722', 0),
  ('e3409d65-9da5-5ae0-88e0-26aea1b19c47', '4a136e02-eef1-5588-a5d3-ab43b564f724', NULL, '203 Palisade Ave, Jersey City, NJ 07306', '(201) 653-5722', '201-792-9718', 0),
  ('a0539e20-978d-54a8-9fcc-a77db0915c39', '4a136e02-eef1-5588-a5d3-ab43b564f724', NULL, '594 Broadway Bayonne, NJ 07002', '(201) 858-5722', NULL, 1),
  ('252bb624-e9bc-5886-a232-ee218e88a682', '280b7838-fb09-514c-90e2-90c88d9c146d', NULL, '6121 John F. Kennedy Blvd 1st Floor, North Bergen, NJ 07047', '(201) 766-5151', '201-766-5154', 0),
  ('6c9bcf9b-7c8b-5d1b-bc2b-cce198fb6d99', 'd94beb2c-5c16-5a44-8674-9d31a42aebf5', NULL, '718 Teaneck Rd. Teaneck, NJ 07666', '201-379-5610', '201-379-5611', 0),
  ('d5c3aaf1-1eda-577d-9e41-64646373db28', 'c6262c07-5120-5506-bcdd-23f5b2392462', NULL, '2 University Plaza Dr., Suite 500, Hackensack, NJ 07601', '201-402-7802', '201-479-1175', 0),
  ('ffa4461e-073c-5b76-bb02-59fa43530bf4', '9e1ae083-b4f7-54cf-ba9b-73f8ed1c1465', NULL, '543 45th St, Union City, NJ 07087', '201-662-5437, (201) 766-7471, (877) 746-3656', '201-662-7195', 0),
  ('6accc1cc-dbb3-5f2b-91d8-47599d2bbda5', 'fca5ff6e-3504-5b63-a6dc-9c5035c79e8a', NULL, '3540 John F. Kennedy Blvd, Jersey City, NJ 07307', '732-838-5205', NULL, 0),
  ('70c41aaf-7d8b-58ba-b805-382eb37f166c', 'a3686f3f-00a7-53b8-8137-179ca538cd7b', NULL, '115 Christopher Columbus Dr, Suite 301, Jersey City, NJ 07302', '(862) 238-8250', '862-238-8255', 0),
  ('18fbffb6-0d08-5dad-ae90-811a4af2fb54', 'a3686f3f-00a7-53b8-8137-179ca538cd7b', NULL, '50 Mt. Prospect Ave, Suite 203, Clifton, NJ 07013', '(862) 238-8250', '862-238-8255', 1),
  ('7fd938cb-852e-5596-9f6b-8dad802adc21', 'a3686f3f-00a7-53b8-8137-179ca538cd7b', NULL, '855 Broadway, Bayonne, NJ 07002', '(862) 238-8250', '862-238-8255', 2),
  ('db9bc241-7515-5a8a-8055-fe92981b7cd2', 'fc232063-85ee-5d45-b5e1-98841a2835e8', NULL, '370 Grand Ave, Suite 202, Englewood, NJ 07631', '(732) 276-2494', NULL, 0),
  ('2452a976-b0b3-511e-8f0f-11b1f8cd3aaa', 'a5f4bbe4-ba7a-54ae-9b3d-d774128fe2b8', NULL, '317 Willow Ave, Hoboken, NJ 07030', '(201) 222-0082', '201-222-6799', 0),
  ('b16843cb-5707-5ba5-9b53-3e03479aad7f', '2b3d5b3e-7f78-5e68-8010-7bc906476231', NULL, '6233 John F. Kennedy Blvd, North Bergen, NJ 07047', '(201) 758-7550', '201-758-7549', 0),
  ('3d3787e4-0676-5305-a840-95fe0ad94eb9', '0313257b-b367-5456-8cf0-2e547f42706d', NULL, '10 Huron Ave. Suite 1-L Jersey City, NJ 07306', '(201)-656-0440', '(201)-656-3444', 0),
  ('e3b7f9e2-16df-5176-95c1-543a0a5f6689', 'b6c37c97-8858-58b2-9799-c3452cbf0e9a', NULL, '222 Cedar Ln Ste 301, Teaneck, NJ 07666', '(201) 592-9210', '(201) 592-6539', 0),
  ('91b7fe62-be64-5c99-932e-efc95e30806d', 'cd29e72d-68a1-5b33-9091-397a40f8d288', NULL, '7309 Broadway, North Bergen, NJ 07047', '(201) 725-3581', '(201) 744-7360', 0),
  ('a62fc250-9c74-5496-83c6-da9fb3b139fb', '5d864754-d9b4-52d0-9ea2-d8da7cbdb9e3', NULL, '8701 Kennedy Blvd, North Bergen, NJ 07047', '(201) 552-9072', '(201) 552-9073', 0),
  ('dcd589a4-b5a5-525e-922f-22a515e3bd89', 'ed137cc0-2460-5c26-9870-4f3cd607c117', NULL, '4801 Broadway, Union City, NJ 07087', '201-751-5000', '201-751-5010', 0),
  ('9ed716e1-0c38-5d70-83f7-f318b686ec56', '38ca4a7f-fc3e-5933-b167-f2c5f014808f', NULL, '360 Whiteman St Fort Lee , NJ 07024', '(201) 502-9706', '(201) 346-9656', 0),
  ('8b27d0e7-83c2-550a-9c14-fed698680593', '27384f45-0e4a-5fb7-b748-d52cbe7920b9', NULL, '1321 Washington St, Hoboken, NJ 07030', '(201) 876-0001', '(815) 331-0905', 0),
  ('b913e6e7-01fb-524a-a929-e9b9e559b0a8', '52c23f45-f321-5d8e-8afe-6e2410cb4d00', NULL, '2014 Bergenline Ave, Union City, NJ 07087', '(201) 348-0200', '(201) 510-0442', 0),
  ('c38541c2-a803-5cbe-9a58-f14486942824', '52c23f45-f321-5d8e-8afe-6e2410cb4d00', NULL, '3363 John F. Kennedy Blvd, 1st Floor, Jersey City, NJ 07307', '(201) 348-0200', '(201) 510-0442', 1),
  ('afd3c27c-d080-5070-b4b8-60e4bf806cdf', 'ded4c7f9-95a5-576c-b337-08ece3a27a3f', NULL, '4800 Broadway Suite 212, Union City, NJ 07087', '(877) 576-4681, 201-766-1728', '888-503-1237', 0),
  ('a99db71d-5e17-560c-8700-a5120c0be93c', 'ded4c7f9-95a5-576c-b337-08ece3a27a3f', NULL, '26 Journal Square Suite 500, Jersey City, NJ 07306', '(877) 576-4681, 201-766-1728', '888-503-1237', 1),
  ('eaf1bf7a-7ba3-54d4-a71d-06954817395b', 'bb1834b6-14af-58a9-a06c-65e6b73dcb1a', NULL, NULL, '706-615-7539', '201-623-2933', 0),
  ('c0532aab-e60c-567e-a006-c98cd75ab914', '910b769c-e20e-57ab-9f20-e584f037619a', NULL, '1275 Bloomfield Avenue: Building 8 / Unit 60 - Fairfield, NJ 07004', '(855) 428-8246', NULL, 0),
  ('dc217887-b1db-530f-8792-17a846e54399', '21875f5e-193e-55b6-adb1-2f34954a49b4', NULL, '165 Passaic Ave. Suite 100, Fairfield NJ, 07004', '(800) 413-8020', '(732) 479-6751', 0),
  ('fd9e8b4f-25bd-572a-82ba-63199295d766', '34a137d4-4b95-546a-b8e9-5a831146173e', NULL, '6000 Washington St. West New York, NJ 07093', '(201) 864-4897', '(201) 864-4871', 0),
  ('17e89e4d-17e6-5506-abc9-136c10d4328a', 'fdaaa377-59b0-52a6-825d-e88cab0dbf0d', NULL, '725 River Rd, #118, Edgewater, NJ 07020', '(201) 220-5866', '(646) 518-9294', 0),
  ('1fdb6925-63d4-5288-94ee-3751222db29d', 'eae069c7-e2db-5465-aa89-cd739e163aea', NULL, '300 Forest Ave, Paramus, NJ 07653', '(201) 490-5158', '(201) 696-3955', 0),
  ('f0b4ea4c-9961-593c-b889-4d95114cbcad', 'e19d3f14-e136-5de6-a7f9-e3d93f294adb', NULL, '550 Broad St, Ste 606. Newark NJ 07102', '(201) 822-1161', '(877) 485-8918', 0),
  ('af0569fd-2f22-5eea-a53d-899127c23380', '54f43669-603b-5613-8fdb-38a97259fa2d', NULL, NULL, '(856) 818-4020', NULL, 0),
  ('275fb963-9785-5d0f-89d3-e4ebe704ad07', '274f5da9-e63f-5d61-b24b-a79c8f3f84a7', NULL, '9225 John F Kennedy Blvd, North Bergen NJ 07047', '(973) 559-2122', '973-327-7181', 0),
  ('412e22e1-5312-5026-a22b-7877167b47c9', 'd2cccb09-0cff-5ce7-9de5-727eb277b237', NULL, '422 Grand St (Unit 9-10) , Hoboken NJ 07030', '201-253-0994, 201-253-0993', '201-253-0995', 0),
  ('fd2b62e9-a060-5098-8035-cd4041ac69a6', '0362bf97-facc-55d8-84d5-2c4ce1e2a151', NULL, '230 60th St, West New York, NJ 07093', '(201) 453-8886', NULL, 0),
  ('fbb8563e-4cd3-536c-90e0-8a6504215f64', '1233b524-cd45-506c-9078-f18d67632240', NULL, '569 35th St 1st Floor Union City NJ 07087', '201-866-6970', '201-866-7144', 0),
  ('311e4b1c-7a04-56bc-9960-257c8f05a227', '6a38b6b1-0d74-54e1-a6cb-34c27f3978de', NULL, '122 Clinton St. Hoboken, NJ 07030', '201-792-8200', NULL, 0),
  ('2a19a15f-f671-5265-b220-761147718957', 'e8f40046-db0d-589c-b5f5-c84f8bb69880', NULL, '506 3rd St, Hoboken, NJ 07030', '201-885-2539', NULL, 0),
  ('a9e17bec-2fd3-53be-986d-d81feee3a6ca', '037c77f2-0f61-558f-8f9e-10efe15edb75', NULL, '810 Abbott Blvd Ste 204, Fort Lee, NJ 07024', '(201) 210-8218', NULL, 0),
  ('5a5c91e0-2d7e-5f30-847f-09b962d3ea5b', 'b04261f2-c003-521e-bdd9-6181f6d8edf3', NULL, '111 Town Square Pl Ste 1238, Jersey City, NJ 07310', '(201) 374-7881', '(201) 502-9310', 0),
  ('639137c9-c0aa-587a-af93-4cf3a3545084', '21f5f219-bad9-59a6-ad40-d2b51515b301', NULL, 'Primary Campus: 301 Sicomac Ave.Wyckoff, NJ 07481 (Multiple Locations)', '201-848-5200', NULL, 0),
  ('6260feca-015b-5486-a802-1330b1f0c26c', 'e058e2ee-ee8c-56da-87a0-b0540d6b4126', NULL, '605 Anderson Ave, Cliffside Park, NJ 07010', '(201) 943-2726', NULL, 0),
  ('fceecaef-e664-5de4-bac9-4eeec4f3297d', '08d2124c-d258-5513-8fb1-f8ed1e25f58b', NULL, '415 60th St, West New York, NJ 07093', '(201) 908-7700', NULL, 0),
  ('006502bd-cfd5-5ded-a366-b49fe9b98a95', '2dc6c239-bcf2-5108-ae81-654ea8c2b437', NULL, NULL, '1-800-413-8020', NULL, 0),
  ('c995488d-6afe-5c2d-9203-9ac9b9f1d2fe', 'c0dff40a-8468-5f35-a1f3-60b473d76b13', NULL, '300 Forest Ave, Paramus, NJ 07653', '(201) 490-5158', '(201) 696-3955', 0),
  ('d4d627e6-3d0b-50a8-a340-93ba92f49ca3', '8f33a11d-2346-5996-8b3b-bb3cb55d73da', NULL, '550 Broad St, Ste 606. Newark NJ 07102', '(201) 822-1161', '(877) 485-8918', 0),
  ('fddbcdb7-a3b0-534b-8905-57bdcf5403db', 'ec1f3123-e21a-5fe6-bcde-fa28dca98f78', NULL, NULL, '(856) 818-4020', NULL, 0),
  ('b90ca600-caaa-5922-a32f-59e4e6e5655a', '0b64619f-d6e5-5639-aa83-372c3fcd21d7', NULL, '9225 John F Kennedy Blvd, North Bergen NJ 07047', '(973) 559-2122', '973-327-7181', 0),
  ('ee32b511-fe6e-58a2-a51b-d7dc02ac1570', '3431b5b8-867b-5b82-8eeb-e7a7114d5900', NULL, '1005 New York Ave, Union City, NJ 07087', '(201) 766-6501', '(201) 863-0741', 0),
  ('c3e61e18-a914-561b-8f43-72725a207a82', '420427ec-f01a-59d6-9809-c5fd220532b5', NULL, '6301 John F. Kennedy Blvd, North Bergen, NJ 07047', '(201) 662-8700', '(201) 453-8075', 0),
  ('0df1da1d-94a4-5216-9175-0c1bec8e75e4', '50997205-b688-52d7-8b1b-3653479046fb', NULL, '433 60th St. West New York, NJ 07093', '201-770-9995', '201-770-9996', 0),
  ('2a9d0cd4-24d4-5d50-afce-1d890a473a6e', '50997205-b688-52d7-8b1b-3653479046fb', NULL, '550 Newark Ave. Ste 304 Jersey City, NJ 07306', '201-624-2111', '888-571-6091', 1),
  ('eb8c68a4-a8af-5c3b-acc7-6e392dc29655', 'a57b8216-9c49-5180-8e5d-3c9558410c74', NULL, '540 37th St, Union City, NJ 07087', '201-864-6860', '201-869-2925', 0),
  ('fac5669c-8e29-595e-9cb5-49b60b456326', '77921466-53b3-544c-b008-bd061dc0c606', NULL, '9226 John F. Kennedy Blvd, North Bergen, NJ 070477', '(201) 863-3055', '201-863-5744', 0),
  ('62e022df-5750-59b6-bad4-7bc9acc10cf0', 'b2ebed1d-91bf-5ea8-9c8f-6d6582746d7d', NULL, '8305A Bergenline Ave, North Bergen, NJ 07047', '(201) 854-7200', '201-854-0827', 0),
  ('09751c65-fe8a-5f94-b72b-f783fade117a', 'b2ebed1d-91bf-5ea8-9c8f-6d6582746d7d', NULL, '200 Grand Avenue Suite 102, Englewood, NJ 07631', '201-871-3636', '201-871-2286', 1),
  ('6e62a8e5-e889-57fb-80f5-d69a851c912c', 'e8b0a608-69af-50f6-a3aa-025a30a2722e', NULL, '180 N Dean St, Englewood, NJ 07631', '201-871-8366', '201-871-8356', 0),
  ('882d89ca-b9c8-530e-8224-0a613fc27e76', 'd6d4b079-1ecf-542a-9cc3-481d1962e4d8', NULL, '5809 Kennedy Blvd. West New York, NJ 07093', '(201) 440-2222', '201-440-2282', 0),
  ('99e2c605-bd14-5085-87a0-0b3cb9ac03af', '3a443b80-a055-5558-b10f-627476f20a08', NULL, '526 42nd St, Union City, NJ 07087', '(201) 325-9393', '201-821-8755', 0),
  ('f76a9a4a-50d4-599e-a851-9162815f52e1', '3f2ca381-6391-5fad-8105-f5bfef54fee8', NULL, '1415 Queen Anne Rd, Teaneck, NJ 07666', '201-837-7788', '201-837-2077', 0),
  ('f09ab174-7d8c-51a7-b5e0-bdf8edc66d06', '3f2ca381-6391-5fad-8105-f5bfef54fee8', NULL, '3196 John F. Kennedy Blvd Union City, NJ 07087', '201-837-7788', '201-837-2077', 1),
  ('eaf7c86d-15d0-58d2-9f6d-4a5c42a6be2f', 'da68cc84-909b-5318-b9a8-e451507c097a', NULL, NULL, '201-567-2050', NULL, 0),
  ('11bb7029-1ec6-5ae3-a67e-7d11f25ba0d9', '0905a523-8da8-580e-9229-2f3dfe0034bb', NULL, '1 Exchange Place, Jersey City, NJ 07302', '(732) 382-8000', '(732) 339-3047', 0),
  ('582d4ace-6758-5630-884c-7a5067fdfdb5', '0905a523-8da8-580e-9229-2f3dfe0034bb', NULL, '201 Route 17 North, Floor 11, Rutherford, NJ 07070', '(732) 382-8000', '(732) 339-3047', 1),
  ('dd0b4b4a-655c-5126-9ac5-531350f32f6d', '04ff9aa9-6728-5c53-8ec2-c648f4b6283f', NULL, '3 Webster Ave Jersey City, NJ 07307', '(201) 798-7200', '201-798-3582', 0),
  ('5b76addd-80aa-5a3f-b028-877f6e77a586', '04ff9aa9-6728-5c53-8ec2-c648f4b6283f', NULL, '10 Huron Ave #1L, Jersey City, NJ 07306', '(201) 798-7200', '201-798-3582', 1),
  ('277e2725-17b2-5a07-9d15-b324fa816212', 'efbcba10-d782-54eb-a6ac-bb164d358e40', NULL, '106 Grand Ave Suite 450, Englewood, NJ 07631', '201-871-1515', '201-871-9683', 0),
  ('cd61c641-746d-5cdf-9498-bfb11363480a', '16d85ec8-0fad-5152-99e8-1e3af33ed3b1', NULL, '3 Webster Ave. Jersey City, NJ 07307', '(201)798-2900', '(201) 798-3582', 0),
  ('7150d4fd-0dc9-52f6-9284-6bcfbfd09574', 'd04789f3-fb32-57cc-a13b-678bbf28e37d', NULL, '1425 Bloomfield St., Hoboken, NJ 07030', '201-988-2800', '201-988-0800', 0),
  ('f302f284-b310-5bb5-9d35-bc72882d55ef', 'd04789f3-fb32-57cc-a13b-678bbf28e37d', NULL, '432 Broadway, Bayonne, NJ 07002', '201-988-2800', '201-988-0800', 1),
  ('8855ca33-7830-58d1-90ec-7756f236cae7', 'd04789f3-fb32-57cc-a13b-678bbf28e37d', NULL, '312 Belleville Turnpike, North Arlington NJ, 07031', '201-988-2800', '201-988-0800', 2),
  ('7f8b4fcd-8a30-538b-8b33-cded388c5b8b', 'd04789f3-fb32-57cc-a13b-678bbf28e37d', NULL, '201 Route 17 North, Suite 1202 Rutherford, NJ 07070', '201-988-2800', '201-988-0800', 3),
  ('be199d94-ee78-5c0a-b4ec-a860dda2f911', 'a1212d26-4ebc-597c-96ac-e771aa8d4033', NULL, '3196 Kennedy Blvd Ste 2, Union City, NJ 07087', '(201) 795-9080', '201-795-9434', 0),
  ('5b17d35a-492b-558f-a2f1-be542e58ac91', 'a1212d26-4ebc-597c-96ac-e771aa8d4033', NULL, '718 Teaneck Road, Teaneck, NJ 07666', '(201) 795-9080', '201-795-9434', 1),
  ('18c965c0-fd6e-590b-9e77-1867c3b808be', '5b1fd962-c5a8-56cb-b2b7-d75029512788', NULL, '142 Palisade Ave. Suite 108, Jersey City, NJ', '844-211-2273', NULL, 0),
  ('1a496917-c319-5576-bfc2-a2c6f3376b92', '5b1fd962-c5a8-56cb-b2b7-d75029512788', NULL, '1 Journal Square Plaza, Jersey City, NJ', '844-211-2273', NULL, 1),
  ('68ee7f2d-8ae4-51ab-962b-6bde7089bf38', '489f149b-6890-5ade-9c90-bba58648a057', NULL, '350 Engle St #4503, Englewood, NJ 07631', '(201) 894-3640; (201) 894-3893', NULL, 0),
  ('8f3191c5-d5d3-5fe8-b71f-f5036189d33c', '47f28ecc-2d09-51d5-981d-aa1849a6c31c', NULL, '7650 River Rd., Suite 240, North Bergen, NJ 07047', '(877) 245-1789', '(732) 201-5539', 0),
  ('25642453-8843-54df-9cf4-5300671d952d', '47f28ecc-2d09-51d5-981d-aa1849a6c31c', NULL, '260 Old Hook Rd Suite 304, Westwood, NJ 07675', '(877) 245-1789', '(732) 201-5539', 1),
  ('216d7c58-966a-5bee-a985-75618772f2d2', '47f28ecc-2d09-51d5-981d-aa1849a6c31c', NULL, '377 Jersey Ave, Ste 220, Jersey City, NJ 07302', '(877) 245-1789', '(732) 201-5539', 2),
  ('915d4a27-93cd-5dee-ba5e-34bfbfe4262f', '37f58c3d-b807-5e4e-ad38-7c04d10bf1e7', NULL, '1829 Hudson Park, Edgewater NJ 07020', '732-390-7750', '201-201-7234', 0),
  ('3ebf1a41-3e9f-5191-9b82-1f7184ef9e62', '37f58c3d-b807-5e4e-ad38-7c04d10bf1e7', NULL, '1 Exchange Place, Jersey City NJ 07302', '732-390-7750', '201-201-7234', 1),
  ('cb4e2fac-6a27-5a38-9b7e-0e09952e1a1e', 'c3375056-09f7-5352-afa9-fcd08daaa3ff', NULL, '718 Teaneck Rd. Teaneck, NJ 07666', '(201) 833-3444', '(201) 808-9430', 0),
  ('8e8b78a6-646e-53fc-aeef-6385c2b31f73', '6971771f-3ed2-57a7-a106-53929a6d1664', NULL, '222 Cedar Ln Teaneck, NJ 07666', '(201) 530-1900', '(201) 530-9300', 0),
  ('41ec1b50-e174-542a-b157-b65000151f44', '6971771f-3ed2-57a7-a106-53929a6d1664', NULL, '55 Meadowlands Pkwy Secaucus, NJ 07094', '(201) 530-1900', '(201) 530-9300', 1),
  ('430be9f2-3ec7-5441-8965-09ebf10af442', '1961ce7f-fc2f-55cd-abba-1a5bd76f63d3', NULL, '393 Northfield Ave. West Orange, NJ', '844-211-2273, (862) 520-5090', '(862) 520-5097', 0),
  ('d6e71136-ed37-5b56-875c-6e317d9cdf6b', '1961ce7f-fc2f-55cd-abba-1a5bd76f63d3', NULL, '142 Palisade Ave, Suite 202, Jersey City, NJ', '844-211-2273, (862) 520-5090', '(862) 520-5097', 1),
  ('cf484369-f20b-50bc-8377-54e554959eb9', '1961ce7f-fc2f-55cd-abba-1a5bd76f63d3', NULL, '330 Grand St. Hoboken, NJ', '844-211-2273, (862) 520-5090', '(862) 520-5097', 2),
  ('1e4d0347-7f92-5ade-b4a1-edf52c5306da', '1961ce7f-fc2f-55cd-abba-1a5bd76f63d3', NULL, '744 Broadway, Bayonne, NJ', '844-211-2273, (862) 520-5090', '(862) 520-5097', 3),
  ('a39a7240-93c9-5c5a-a1d5-ef7cfd21b9c9', '1961ce7f-fc2f-55cd-abba-1a5bd76f63d3', NULL, '38 Meadowlands Pkwy, Secaucus, NJ', '844-211-2273, (862) 520-5090', '(862) 520-5097', 4),
  ('3395c74c-6575-5406-b216-05138779a1c2', '21d101d3-66c5-57e2-8ca0-9870d64290af', NULL, '6 Brighton Road, Suite 106 Clifton, NJ 07012', '973-888-1085', NULL, 0),
  ('1036c33b-fa46-5d91-ac4b-f5f15cdae01b', 'dc0c193c-f8e2-5fa9-994f-1f7ba809b624', NULL, '350 Engle Street 6th Floor, Suite 6501, Berrie Center, Englewood, NJ 07631', '201-608-2800', '201-608-2478', 0),
  ('7b35c7ea-ca86-5b43-b8d4-490f52d90f4d', 'f649c6a0-bcef-59f7-b438-2f164285a14a', NULL, '216 Engle Street Suite 203, Englewood, NJ 07631', '201-567-7615', '201-567-8033', 0),
  ('1fdfa28b-57aa-5d23-aa72-378ced5db9f2', '6c6eab08-7d27-5369-ad06-bf2b3deceba8', NULL, '330 Grand St. Suite 100, Hoboken, NJ', '844-211-2273', NULL, 0),
  ('b7d5f2ea-7ed0-572a-b366-553eaf1d73a1', '1e6f78b5-2e08-5be7-845f-60338aede311', NULL, '1200 East Ridgewood Ave. Ridgewood, NJ 07450', '201-389-1285', '201-445-4195', 0),
  ('6b7098f2-72ec-56cd-9a7e-8bc855be9253', '31c6f738-729c-58a1-b66c-a0d3b4c9b948', NULL, '308 Willow Ave. Hoboken, NJ', '844-211-2273', NULL, 0),
  ('7b11a3ba-0c63-523e-af03-1a9c0c2163f4', '31c6f738-729c-58a1-b66c-a0d3b4c9b948', NULL, '142 Palisade Ave, Suite 115, Jersey City, NJ', '844-211-2273', NULL, 1),
  ('426a2386-8773-5dab-99b4-1cd5796b300c', '2ae6c1e0-4488-55ff-a9b3-49bca01f72eb', NULL, '25 Rockwood Place #200 Englewood, NJ 07631 | 910 Sylvan Ave #110 Englewood Cliffs NJ', '201-608-2848', '201-894-0093', 0),
  ('9c08d4c9-2fdb-5593-9d31-80d37eeb96b3', '16bc29b2-e512-574b-a2b9-ef8ff5776ce6', NULL, '20 Prospect Ave, Ste. 907, Hackensack NJ 07601', '(201) 342-2550', '(201) 342-7171', 0),
  ('ec56df05-d087-54b8-b572-477c253b5534', 'e26c6c45-e2a6-5de6-8a83-82fef18c8451', NULL, '718 Teaneck Road, Teaneck, NJ 07666', '(201) 833-7208', '(201) 379-5708', 0),
  ('15b92d85-7f4d-53d9-8ad5-bff74e384ae8', '02bcb2cf-46b6-5f69-9934-12cf9233b6b2', NULL, '309 Engle Street, First Floor, Englewood, New Jersey 07631', '(201) 569-7737', '(201) 373-2041', 0),
  ('e1dd20f8-6f1e-52b5-8362-978f4b69c694', '74286fa4-0dec-5529-8749-37c0c80fd272', NULL, '7322 Bergenline Avenue, North Bergen, NJ 07047', '201-867-0404', '201-868-2499', 0),
  ('5e0d6311-f78c-577e-a0da-8c731af6c299', '74286fa4-0dec-5529-8749-37c0c80fd272', NULL, '605 Broad Avenue, Ridgefield, NJ 07657', '201-941-9494', '201-941-1246', 1),
  ('0ccba0ee-1ef2-5d60-aacc-b27cf3a94a9f', '74286fa4-0dec-5529-8749-37c0c80fd272', NULL, '16 Johnson Avenue, Hackensack, NJ 07601', '201-342-7353', '201-342-7982', 2),
  ('2ab93579-617b-5507-bccc-9c47d71bdfca', '7162e221-941a-5e27-9ffa-3abf12a38262', NULL, '8321 John F Kennedy Blvd, North Bergen, NJ 07047', '201-854-7900', '201-854-7885', 0),
  ('bdce95d0-cb83-5527-a60c-7931c2f23983', 'c0b030be-f55a-5542-9e01-48bf4877d4a0', NULL, '9226 John F. Kennedy Blvd, North Bergen, NJ 07047', '844-777-0910', '201-560-0712', 0),
  ('2f58d24b-073b-5aad-a9f1-e7a6c2dddcb5', '93e80658-646e-5693-a42d-65f390d02da5', NULL, '111 Galway Place, Suite 300, Teaneck, NJ 07666', '201-770-1600', '(201) 862-0095', 0),
  ('6ccdcf5b-fc1c-5b01-9af9-2cea3d1ea855', '93e80658-646e-5693-a42d-65f390d02da5', NULL, '403 Grand Avenue, Englewood, NJ 07631', '201-770-1600', '(201) 862-0095', 1),
  ('f5952735-c9ee-54d7-89af-0b2219f37855', '93e80658-646e-5693-a42d-65f390d02da5', NULL, '663 Palisade Avenue, Suite 302, Cliffside Park, NJ 07010', '201-770-1600', '(201) 862-0095', 2),
  ('8d9ae6a3-791b-5d38-91d4-848a0aa844be', '93e80658-646e-5693-a42d-65f390d02da5', NULL, '3196 John F Kennedy Boulevard, 3rd Floor, Union City, NJ 07087', '201-770-1600', '(201) 862-0095', 3),
  ('3bc23804-09da-521b-9ad3-bb5b0b91b23e', '93e80658-646e-5693-a42d-65f390d02da5', NULL, '230 East Ridgewood Avenue, Bergen Regional Medical Center, Suite 127, Paramus, NJ 07652', '201-770-1600', '(201) 862-0095', 4),
  ('685eee97-f3d7-529f-ac02-f143ec4bea7f', '93e80658-646e-5693-a42d-65f390d02da5', NULL, '1255 Broad Street, Bloomfield, NJ 07003', '201-770-1600', '(201) 862-0095', 5),
  ('6b90a88c-4003-5e28-b2a2-1bb951d6629a', 'dff62a3a-5b42-5052-b28a-3a63872d7855', NULL, '1320 Adams St. Suite D. Hoboken NJ 07030', '(201) 308-6622/ 646-650-2229', '(201) 308-6623', 0),
  ('25fc33a6-a184-5181-89ce-2a7353e74794', 'f992d7da-e124-5786-9d1e-ccfdcd8e8359', NULL, NULL, '551-236-6867', '833-428-0623', 0),
  ('c7c9631c-b662-5605-a7a7-9449cb737b24', '854fa10c-b54e-595c-b47d-38baa2bd5e26', NULL, '222 Cedar Lane, Suite 120 Teaneck, NJ 07666', '201-836-5332', '201-836-4002', 0),
  ('80a5eb93-6178-551c-9d3d-b4986889a779', '01b5502b-784e-5f45-8d34-cfa46d955e43', NULL, '401 S Van Brunt St Englewood, NJ 07631', '201-569-2770', '201-569-1774', 0),
  ('1fbc4596-4f6a-53be-836e-6b7f44e4b5a6', 'f53acd12-a087-594b-90d5-84453da12a84', NULL, '55 Meadowlands Parkway, 3rd Floor, Secaucus, NJ 07094', '1-844-300-4677', '(201) 392-3571', 0),
  ('f3de635f-b8e0-5710-954e-1187401ba4f4', '2251e1d7-1027-5400-a3bc-f6bedfde033c', NULL, '1566 Lemoine Ave, Fort Lee, NJ 07024', '212-287-7211', '212-287-7210', 0),
  ('371d1503-aaae-5e87-a89f-4f5422d92ea5', '2251e1d7-1027-5400-a3bc-f6bedfde033c', NULL, '30 N Dean St. Englewood, NJ 07631', '212-287-7211', '212-287-7210', 1),
  ('e1570469-2705-512d-ba55-48374dc4765c', '2251e1d7-1027-5400-a3bc-f6bedfde033c', NULL, '905 5th Ave, New York, NY 10021', '212-287-7211', '212-287-7210', 2),
  ('d5b13d3b-a5ef-5ea9-a6fc-04d104e74d6c', '204f2c54-3c1e-5ad4-afdf-fdc2949ef34d', NULL, '7650 River Road, Ste 230, North Bergen, NJ 07047', '(201) 224-8831', NULL, 0),
  ('4f9eb543-2411-57b9-bedd-428169b3ce3c', 'a795dfb7-476d-5e85-b27c-1e72c5ee4e14', NULL, '703 Main St, Paterson, NJ 07503', '(973) 754-2413', '(973) 754-2622', 0),
  ('8d8881d0-f9c2-52fc-8a8b-9a9f96f56d96', '3c2517cf-c77f-593a-b264-4ec3608ea1e2', NULL, '1037 US-46 #103, Clifton, NJ 07013', '(973) 773-1973', '(201) 862-0095', 0),
  ('b4296194-ef26-5309-a231-653545a5bf7a', '8905e054-fb4f-511a-8fb4-fe98ae115904', NULL, '777 Passaic Ave, Suite 575 (5th Floor), Clifton, NJ 07012', '(201) 549-8860', '(201) 549-8861', 0),
  ('2311df3b-d0f5-56a6-9d11-a01fc7ed1b67', '909b4a05-298d-5730-9277-405dead4941a', NULL, '330 Grand St. Hoboken, NJ', '844-211-2273, 201-420-7903', NULL, 0),
  ('3b7ef60b-1564-5182-8a7a-38701caeddbf', '909b4a05-298d-5730-9277-405dead4941a', NULL, '654 Broadway, Bayonne, NJ', '844-211-2273, 201-420-7903', NULL, 1),
  ('1f7b062d-1fed-5d32-b6d0-3498f220f55c', 'fbfcf4b8-af60-5777-9478-9d222ed0049d', NULL, '718 Teaneck Rd. Teaneck, NJ 07666', '201-227-6200', '201-227-6209', 0),
  ('c6363a81-31c6-5543-ac43-295cfd4d6b40', 'c80ec4fe-7c5f-5970-a339-f093aa6d9f4d', NULL, '718 Teaneck Rd. Teaneck, NJ 07666', '201-833-3357', '201-541-5972', 0),
  ('7adf6dee-b852-5f45-857d-d6dc96532576', '8ffe9fb5-ae69-570d-94b7-1fabc08d5dbf', NULL, '308 Willow Ave. Hoboken, NJ', '844-211-2273, 201-418-2693', NULL, 0),
  ('a46133af-83e2-5378-a477-25e08f523ab2', 'e7f72dec-2ac3-5b41-ac54-386510862eb0', NULL, '177 North Dean St. South Tower, Suite 305, Englewood, NJ 07631', '201-569-7777', '201-569-6861', 0),
  ('2b950bf6-7b1c-50fe-9e36-9d4601e0d8fc', '547fd2fa-543f-5613-bf36-f9c5bc8e18ab', NULL, '277 Forest Ave Suites 102 & 206, Paramus, NJ 07652', '201-489-8900', '201-489-8900', 0),
  ('bcf87657-6db7-5411-96a2-8aa6adc3cd8f', 'b284bdf8-3f51-5465-9dc7-8bac4a05dcb2', NULL, '360 Essex St Suite 403 Hackensack, NJ 07601', '551-996-8090, 201-336-8090', '551-996-8221', 0),
  ('7520a79d-735b-5aa4-8b38-08fc8c8e238d', 'b0d23a82-295f-51f3-b322-8419117db9a5', NULL, '2555 John F. Kennedy Blvd, Jersey City, NJ 07304', '(201) 433-9666', '(201) 433-3969', 0),
  ('105c61ec-9213-55d5-992c-58fc3ad89298', '2bcd1ec2-bf2c-58d9-a6d8-fab495bd8c06', NULL, '8100 John F. Kennedy Blvd, North Bergen, NJ 07047( Not appt available at this moment)', '(201) 656-4104', '201-656-9178', 0),
  ('769d2ec1-8e5a-5b7f-921d-c8061c397565', '2bcd1ec2-bf2c-58d9-a6d8-fab495bd8c06', NULL, '142 Palisade Ave, #101, Jersey City, NJ 07306', '(201) 656-4104', '201-656-9178', 1),
  ('9463289e-2eaa-5511-9554-c817c58e2341', 'c0d3a30a-e3eb-5066-90f3-cdd1a5b10097', NULL, '2255 John F. Kennedy Blvd, Jersey City, NJ 07304', '201-433-1057', NULL, 0),
  ('8d1854be-10cf-5715-8d02-da6cb119c661', 'c0d3a30a-e3eb-5066-90f3-cdd1a5b10097', NULL, '807 John F. Kennedy Blvd., Bayonne, NJ 07002', '201-339-5799', '(201) 435-2716', 1),
  ('3ba5736c-e739-5036-81ed-047ff96bf045', 'a5a8c6b4-0139-52f8-a0fd-d27b3a97efed', NULL, '25 Millburn Avenue, Building C - Suite 304, Millburn, NJ 07041', NULL, NULL, 0),
  ('90fbd583-3e6f-52a5-8cd9-458eb93bb98a', 'a5a8c6b4-0139-52f8-a0fd-d27b3a97efed', NULL, '16 Pocono Rd, #114, Denville, NJ 07834', NULL, NULL, 1),
  ('2c4d2bc4-76ad-5a1a-b426-f977933595cd', '17bb668c-e053-546b-a29a-8bda299a5bc0', NULL, '222 Cedar Lane Suite 103, Teaneck, NJ 07666', '201-833-3360', '201-833-7123', 0),
  ('ce0d79a5-585d-569f-bd43-69d8d00e597d', '87c52616-312f-5eaf-9f65-7b4521ef6f8c', NULL, NULL, '1-855-565-8346', '240-473-4322', 0),
  ('74377f57-b247-5811-b061-20f8ba3197ee', '490f9533-190e-50ca-af4c-c69dfd10e2a0', NULL, '101 Prospect Ave Hackensack, NJ 07601', '201-227-6222', '201-227-6090', 0),
  ('39b43194-318c-5892-8363-f82dd08a5f92', '59d63784-5999-59ee-83be-88ed66e2072d', NULL, '350 Engle St 2 East, Englewood, NJ 07631', '(201) 894-3689', '(201) 541-2965', 0),
  ('44853d4c-88b1-5662-bf0a-7322736607b7', 'f7350a94-e9c9-5586-bbee-d75de3ba304c', NULL, '718 Teaneck Road Interventional Institute', '201-227-6210', '201-541-5910', 0),
  ('19927510-f3f1-5c04-b208-01325e3c2d98', 'f7350a94-e9c9-5586-bbee-d75de3ba304c', NULL, 'Teaneck, NJ 07666', '201-227-6210', '201-541-5910', 1),
  ('fd7dc44f-c919-51f0-87c6-ceeda43ad465', '19c8d279-f863-5bff-8f00-15328b1e17e6', NULL, NULL, '201-822-9549', NULL, 0),
  ('35dc6972-46d3-5a2b-b31a-7c06e2943b9f', '2f771ee6-4f00-52f4-8a35-f83d8e06f547', NULL, 'County Plaza – 257 Cornelison Avenue Jersey City, NJ 07302', '(201) 915-1042', '(201) 915-1012', 0),
  ('17ecee45-73fe-53fa-a95e-f8f7ff2719a6', 'c19d7338-fa2f-575c-893b-9036334bf0f4', NULL, NULL, '609-610-9489', NULL, 0),
  ('7ee02365-ebfe-57ee-8421-a6dbbd112924', 'b8fa9828-0fd1-5c2b-b396-d738793769d4', 'Emilia Hammerman', NULL, '609-433-8846', '609-826-4870', 0),
  ('0bf6ffc6-10fa-56c1-9d09-6bd5e7307b6b', '0f7e6644-1925-5987-8006-8a8f9389ebbf', 'Maria Guillen Hurtado', NULL, '201-552-1579', NULL, 0),
  ('9a732504-035b-5517-9594-61065c6d7b61', '0f7e6644-1925-5987-8006-8a8f9389ebbf', NULL, NULL, '833-997-5267', NULL, 1),
  ('228d7fbd-ce64-579d-9a93-f6ac12033246', 'fe9b4485-ba93-5039-b891-e41f9203640e', NULL, '12 Overlook Ave, Rochelle Park, NJ 07662', '201-944-9600 / 201-498-9247', NULL, 0),
  ('812ee143-0cfe-5aa8-93c8-e20b900ff2f0', '9c842f51-91ad-5cb2-b36e-86b665685cd4', NULL, '270 Fairmount Ave, Jersey City, NJ 07306', '(201) 333-5700', NULL, 0),
  ('0dcc219a-232f-5e6b-aadf-09af4028e56c', '353e7325-d9a2-5969-b846-b63baf8c2d50', 'Four Corners Community Services', NULL, '+1 973-436-4704', '+1 973-436-4714', 0),
  ('8e7bb487-7683-5441-b47a-a44a6c79a1e9', '353e7325-d9a2-5969-b846-b63baf8c2d50', NULL, 'Address: 66 Moore St Hackensack NJ 07601', NULL, NULL, 1),
  ('cc782c7b-c304-5702-b1ed-d5807dd29bf2', '353e7325-d9a2-5969-b846-b63baf8c2d50', NULL, 'Address: 37B Wall St Oxford NJ 07863', NULL, NULL, 2),
  ('093dcdde-c20b-58ba-9bd7-14aed2407a08', '586c88ad-0138-5a6b-a1bb-b47063670219', NULL, '415 43rd St.', '(201) 867-9002', '(201) 867-2004', 0),
  ('91b73f3d-e17f-5a06-adbb-72f141a27eaa', '586c88ad-0138-5a6b-a1bb-b47063670219', NULL, 'Union City, NJ 07087', '(201) 867-9002', '(201) 867-2004', 1),
  ('ed656d71-f251-5e77-b083-3406a49d01df', '586c88ad-0138-5a6b-a1bb-b47063670219', NULL, '709 Newark Ave', '(201) 867-9002', '(201) 867-2004', 2),
  ('758391c2-924d-51de-adcd-197b7508b581', '586c88ad-0138-5a6b-a1bb-b47063670219', NULL, 'Jersey City, NJ 07306', '(201) 867-9002', '(201) 867-2004', 3),
  ('fd0877dc-7a12-5e19-973a-c98567886d0d', '51974194-177a-5b22-9669-c32c4a4b8188', NULL, NULL, '(973) 491-4224', '(973) 863-4522', 0)
)
INSERT INTO "referral_offices" ("id", "contactId", "label", "address", "phone", "fax", "sortOrder")
SELECT s."id"::uuid, s."contactId"::uuid, s."label", s."address", s."phone", s."fax", s."sortOrder"
FROM src s
WHERE EXISTS (SELECT 1 FROM "referral_contacts" c WHERE c."id" = s."contactId"::uuid);
