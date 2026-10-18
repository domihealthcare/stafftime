-- The practice's referral phone book, loaded from the Word document as it
-- stood in October 2026 (Dominguez: "add a searchable phone book for referrals
-- for staff to use and edit"). Generated from PHONE_BOOK.docx: every line of
-- the document is here, the first phone, fax, address, email and website of
-- each entry in their own columns and the rest, as written, in the notes.
-- The browser suite re-runs this file to put the book back after a test.

INSERT INTO "referral_contacts" ("id", "category", "name", "phone", "fax", "address", "email", "website", "notes", "updatedAt") VALUES
  (gen_random_uuid(), 'Labs', 'BioReference Laboratories', '800-229-5227', NULL, NULL, NULL, NULL, 'Account Numbers: North Bergen- JN145, Hoboken- JN837, West New York- JN146', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'Exact Sciences Laboratories (Cologuard)', '1-844-870-8870', NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'OXFORD Laboratories', '201-553-0501/201-471-1539', NULL, NULL, 'unioncitypsc@gmail.com', NULL, 'For home services: 201-471-1539
For Lab Results: 201-553-0500 F: 201-553-0501
Patient Care Specialist: Alicia Marulanda', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'Medlife Diagnostic Laboratories', '855-515-5005', NULL, NULL, 'admin@medlifediagnostic.com', NULL, 'Does in house draws (Fee is approx. $25-50 depending on location)
Internal Account Manager is: Mitch Cernat
Cell Phone: 215-900-8768', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'Quest Diagnostic Lab', '1-866-697-8378', '862.703.7753', NULL, 'Laquine.J.Johnson@QuestDiagnostics.com', NULL, 'Specimen Pick-up 1-800-223-0570
Internal Account Manager is: Laquine Johnson
Cell Phone: 862.208.9994', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'LabCorp', '1-800-631-5250', NULL, NULL, NULL, NULL, 'Account # Account Name
29065290 JONATHAN M DOMINGUEZ MD NB
29092650 EXCELCARE HOBOKEN
29075240 JONATHAN DOMINGUEZ MD WNY
Fax for bw results: 1-855-227-4491', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'Myriad Genetic Counselor', '1-800-469-7423 Option #3', NULL, NULL, NULL, NULL, 'No Cost to the patient- Can call and speak with a Genetic Counselor that can explain or guide them through the process of a Genetic Risk Score.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'LabCorp patient site — Hoboken', '551-651-1883', '833-581-2542', '121 River Street, Hoboken, NJ 07030', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'LabCorp patient site — Union City', '201-330-3274', '201-330-8057', '3196 Kennedy Blvd, 2nd Floor, Union City, NJ 07087', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'LabCorp patient site — Jersey City — Journal Square', '201-656-9024', '201-656-9535', '26 Journal Square, Jersey City, NJ 07306', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'LabCorp patient site — Jersey City — Kennedy Blvd', '551-501-3040', '201-309-0780', '1561 John F. Kennedy Blvd., Jersey City, NJ 07305', NULL, NULL, 'Located in Walgreens', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Labs', 'LabCorp patient site — Bayonne', '201-471-2685', '201-471-2686', '988 Broadway, Suite 101, Bayonne, NJ 07002', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Holy Name Medical Center', '(201)-833-3000', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 'Phone Medical Records: (201) 833-7044
Fax Medical Records: (201) 833-7138', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Covid Swab', '201-833-3313', '201-833-3637', NULL, NULL, NULL, 'Call: 201-833-3313
Medical records dept: 201-833-3052
Medical records fax: 201-833-7138
PA Dept Fax: 201-541-6357 ( Demo, Clinicals, and Imaging order)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Radiology- ext. 3280 & 7625', '201-833-7268', '201-541-5910', NULL, NULL, NULL, 'Interventional Radiology- for Thyroid biopsy
(back up fax: 201-379-5601)
FAX OVER: Demographic, imaging order, US Thyroid results (Imaging), most recent clinical notes within 30 days.
MAIL OVER: US Thyroid w/ actual IMAGES.
Notify patient that the Hospital will contact the patient to schedule an appointment in 2-3 days.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Sleep Studies / Sleep Center', '201-833-7260', '201-833-7259', NULL, NULL, NULL, 'FAX OVER: Facesheet, referral, clinical notes. Dept will verify w ins and f/u with the patient.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Breast Center', '201-833-3700', NULL, NULL, NULL, NULL, 'Breast Center: (201) 833-7100
Breast Center Fax: (201) 833-7248/201-833-3714
Surgical Breast Center Fax: (201) 541-5972
Transportation Phone: (201)833-3636
Cardiology Department Phone:(201)833-3211
Barbara Carnival-Manager Phone: (201)530-7919
Home Care Phone: 201-833-3740', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Holy Name Institute for Wound Healing', '(201) 833-3202', '(201) 530-7399', '699 Teaneck Road, Teaneck, NJ 07666', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Holy Name services', 'Bergen Imaging Center, P.A. (English/Spanish/Korean)', '(201) 568-4242', '(201) 568-1298', '180 N Dean St, Englewood, NJ 07631', 'info@BergenImagingCenter.com', NULL, 'Mammography & 3D Mammography - Breast Ultrasound - Breast Biopsy - General Ultrasound
Sonohysterography (Saline Infusion Sonography) - DXA
Insurance information: Toni@BergenImagingCenter.com ; kristen@bergenimagingcenter.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Hudson Regional Hospital (Home Sleep Medicine / Pediatrics)', '201-392-3278', '201-392-3564', NULL, NULL, NULL, 'Central scheduling dept
Accepting all insurances - excepts OMNIA
Referral Email: scheduling@hudsonregionalhospital.com
Always cc’ed : nhaque@hudsonregionalhospitals.com
Radiology Email: radiology@hudsonregionalhospital.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Bayonne VNA- Occupational therapy. Home physical therapy, nursing services', '201-247-5670', '973-574-7924', NULL, NULL, NULL, 'Does not take Dual Complete Options', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Bayada Home Health Aide', '(888) 876-0111', '201-516-6033', NULL, NULL, NULL, 'Dan Personal Rep Phone: 201-630-2158 OR 201-241-0203', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Amedisys Home Health Care', '(201) 902-1490', '201-902-1495', NULL, NULL, NULL, 'Secauces
Hackensack
Phone: (201) 342-6311', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Always Home Care - only Medicaid', '(201) 869-0880', '201-869-0081', '5700 Bergenline Ave, West New York, NJ 07093', NULL, NULL, 'Att: Nicole
Demo, Clinicals, and Referral', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Carefinders', '(201) 854-5557', '(201) 854-7515', '443 60th Street, West New York,NJ 07093', NULL, NULL, 'Does not take Medicare
( Fax Demo, clinicals, and referral to initiate process)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Promise Care (Home Physical Therapy too)', '201-418-6800', '201-801-1021', 'Hudson County Location:2 Jefferson Avenue Jersey City, New Jersey 07306', NULL, NULL, 'Essex County:576 Central Avenue Suite 304 East Orange, NJ 07018
Phone: 973-378-1000 Fax 973-378-1111', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Confident Care', '(201) 271-1022', '(201) 271-1205', '3196 John F Kennedy Blvd Fl 1 Union City, NJ 07306', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Yanet''s Family Home Health (Main contact Yokasta)', '201-472-8124/ (973) 767-8266', '(201) 472-8125', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', 'Active Day Adult Daycare', '201-869-4443', '201-353-2568', '6201 Grand Ave, North Bergen, NJ 07047, United States', 'northbergen@activeday.com', NULL, 'Take Medicare, Medicaid & Self pay
(Fax Demo,Insurance, and ID)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Home health care', '2nd Home Adult Medical Day Care', '201-864-0400', NULL, '3610 Palisade Ave, Union City, NJ 07087', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'Ocean Home Health', '732-961-1301 / 888-294-3352', '732-961-9897', NULL, NULL, NULL, 'Incontinence Supplies Fax: 877-294-0989', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'Bergenline Medical Supply', '(201)866-0001', '(201) 319-9340', '2115 Bergenline Ave, Union City, NJ 07087', NULL, NULL, '(No longer participating with Medicaid Insurances)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'At Home Medical (Hospital Bed)', '1-800-287-0643', '1-973-538-2703', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'HomeCare Delivered', '866-333-0686/1800-565-5644', '800-716-9586', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'Home Care Delivered Physician Orders', '1 (866) 332-4193', NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'Family Medical & Surgical Supply', '(201) 433-5720', '201-433-7453', '671 Montgomery St, Jersey City, NJ 07306', NULL, NULL, '( No acepting comercial plans)
( Clinicals, Rx, Insurance)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'MedFirst Homecare (Electric Scooters)', '201-385-9700', '201-385-9701', NULL, NULL, NULL, 'Webside: https://medfirsthomecare.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DME (medical equipment)', 'Byram Incontinence Supplies', '1-877-902-9726', '866-811-4500', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Cristie Kerr Women''s Health Center', '(201) 309-2400', '201-395-7598', '377 Jersey Avenue Ground Floor, Medical Office Building, Jersey City, NJ 07302', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Bayonne Medical Center', '(201) 858-5000', NULL, '29 E 29th St, Bayonne, NJ 07002', NULL, NULL, 'PET SCANS ARE DONE HERE TAKE HNJH
Fax Medical Records: 201-858-6562
Ph (201) 436-6100
Fax ( 201) 436-6101 (Gina)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Clara Maass Medical Center', '(973) 450-2000', NULL, '1 Clara Maass Dr., Belleville, NJ 07109', NULL, NULL, 'Fax Medical Records: 973-450-2608', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Christ Hospital', '(201)795-8200 ext 5084', NULL, NULL, NULL, NULL, '(medical records dpt)
Fax Medical Records (201)-795-8424
Phone Cardiology (201) -795-8334', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Englewood Hospital', '(201) 894-3000', NULL, '350 Engle Street. Englewood, NJ 07631', NULL, NULL, 'NPI #: 1952681918
FAX MEDICAL RECORDS: 201-608-2477
Medical records (most recent): 201-894-3169', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Englewood Hospital — medical records radiology', '201-894-3397', '201-894-0787', '350 Engle Street. Englewood, NJ 07631 - 4TH Floor', NULL, NULL, 'Englewood Health Physician Network - Breast Surgery at Englewood (Open Saturdays from 8:30am to 3:30pm)
Phone: (201) 894-3000 Ext: 7203', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Hackensack University Medical center', '(551) 996-2000', NULL, '30 Prospect Ave, Hackensack, NJ 07601', NULL, NULL, 'Phone Medical Records: (551) 996-2075
Fax Medical Records: 551-996-5164
Support Team Phone: (732) 897-2500
Account Number: 3911473', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Hackensack Meridian Health (Palisades Medical Center)', '(201) 854-5000', NULL, '7600 River Rd, North Bergen, NJ 07047', NULL, NULL, 'Medical Records Fax: 201-854-8360 / 201-854-8546', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Hoboken University Medical Center', '(201) 418-1000', NULL, '308 Willow Ave, Hoboken, NJ 07030', NULL, NULL, 'Cardiology: 201-418-1850
Phone Medical Records: (201)-418-1458
Fax Medical Records (201)-418-1459', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Jersey City Medical Center', '(201) 915-2000', NULL, '355 Grand St, Jersey City, NJ 07302', NULL, NULL, 'Fax Medical Records: 201-915-2559', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Interventional Radiology - for Thyroid biopsy', '201-915-2465', '201-915-2204', NULL, NULL, NULL, 'FAX OVER: Demographic, referral, US Thyroid results (Imaging), most recent clinical notes within 30 days.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'JFK Medical Center', '(732) 321-7000', NULL, '65 James St, Edison, NJ 08820', NULL, NULL, 'Fax Medical Records: (732) 549-8569', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Palisade Medical Center', '(201) 854-5000', NULL, '7600 River Rd, North Bergen, NJ 07047', NULL, NULL, 'Ph Medical Records: 201-854-5081
Fax Medical Records (201) 854-8360/201-854-8546/ 201-489-0591
Ph OP Lab: 201-854-5046/5049
Fax OP Lab Fax: 201-854-3487
Group # HNJH 1165768', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Hudson Regional Hospital', '(201) 392-3100', NULL, '55 Meadowlands Pkwy, Secaucus, NJ 07094', NULL, NULL, 'Contact: scheduling@hudsonregionalhospital.com
and CC: nhaque@hudsonregionalhospital.com
Email for referrals: referral form, facesheet, clinical notes as appropriate
Ph Radiology (201) 392-3518 ph lab(201)-392-3150
Fax Medical Records: (201) 325-6745', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Mountainside Medical Center', '(973) 429-6000', NULL, '1 Bay Ave, Montclair, NJ 07042', NULL, NULL, 'Fax Medical Records: 973-429-6967', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Newark University Hospital', '(973) 972-4300', NULL, '150 Bergen St, Newark, NJ 07103', NULL, NULL, 'FAX NUMBER FOR MEDICAL RECORDS: 973-972-2976', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'Saint Barnabas Medical Center', '(973) 322-5000', NULL, '94 Old Short Hills Rd, Livingston, NJ 07039', NULL, NULL, 'Phone Medical Records: 973-322-5835 Fax Medical Records: 973-322-5693', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hospitals', 'St Michael''s Medical Center', '(973) 877-5000', NULL, '268 Dr Martin Luther King Jr Blvd, Newark, NJ 07102', NULL, NULL, 'Fax Medical Records (973)877-5112
Phone to set up appt. for Stress Test (973) 465-2792', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pharmacies', 'Pinto’s Pharmacy', '(201)241-3333', '(800)708-2543', '161 Palisade Ave, Jersey City, NJ 07306', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pharmacies', 'Middle Village Pharmacy', '(973)478-0600', '(973)478-0603', '393 Piaget Avenue, Clifton, NJ 07011', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pharmacies', 'Novecks Pharmacy', '(201) 869-1235', '(201) 215-9794', '7823 Bergenline Ave, North Bergen, NJ 07047', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Jersey Advanced MRI & Diagnostic Center', '(201) 552-9464', '(201) 552-9467', '2127 Kennedy Blvd North Bergen, NJ 07047', NULL, NULL, 'Open MRI - MRI - CT - US - XR - DEXA (NO CT w/ IV Contrast, Mammo, Breast US, or Echo)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Hudson MRI', '(201) 659-1177', '(201) 659-2262', '28-11 John F. Kennedy Blvd North Bergen, NJ 07047', NULL, NULL, 'No BCBS, No Open MRI, No CT Scan, No Mammograms, No Echo
**Does Offer Transportation** MRI - MRA - US - XR - DEXA -', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Bergen Imaging Center, P.A.', '(201) 568-4242', '(201) 568-1298', '180 N Dean St, Englewood, NJ 07631', NULL, NULL, 'Mammo & 3D Mammo - Breast US - Breast Biopsy - US - DEXA - Sonohysterography', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'ImageCare Radiology', '201-475- 1300', '201-475-1709', '0-100 28th Street Fair Lawn, NJ, 07410', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'American Radiology Group', '(201) 699-0929', '201-941-0175', '669 Broad Ave Suite 104, Ridgefield, NJ 07657', NULL, NULL, 'MRI w/wo contrast - XR - US (NO CT, Mammo, Breast US)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Englewood Hospital Imaging', '(201) 894-3622', NULL, '350 Engle Street Englewood, NJ 07631', NULL, NULL, '/ Fax: (201) 871-4995
2 Journal Square Plaza Jersey City, NJ 07306
Phone: (551) 220-5020
https://www.englewoodhealth.org/service/breast-care- to make an appointment online.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Hackensack Radiology - Hoboken', '(201) 488-2660', '(201) 488-6784', '5 Marine View Plaza, Ste 100, Hoboken, NJ 07030', NULL, NULL, 'Email: scheduling@hrgimaging.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Advanced Magnetic Imaging', '201-350-7120', '(201) 295-1035', '6416 Bergenline Ave. West New York, NJ 07093', NULL, NULL, 'Does everything EXCEPT Mammograms, PET CT Scan', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Holy Name Medical Center - Radiology', '(201) 833-7272', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 'MRI Ph: (201) 833-7272 / Fax: 201-541-5919
CT/Ultrasounds Ph: (201) 833-3280 / Fax:(201)541-5919/201-833-3071', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology', 'Specialty Portable X-Ray', '516-432-3800', NULL, NULL, 'SPXRequest@gmail.com', NULL, '(Must Email or Call for an appointment for the patient first. Then can email the patients demographics form from Elation (insurance, address so they know where to go, phone number, name, etc) and order.
Accepts All insurances - NO Medicaid
X-Rays (No Bone Density) Sonograms (No TVUS)
Hours Avail M-F until 7pm - Must Have Photo ID at appt', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — self-pay prices', 'American Radiology Group', NULL, NULL, NULL, NULL, NULL, 'MRI W/O Contrast ……..$350
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
X-ray …………………………………………………………………………………………………….$50', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'North Jersey Imaging Network (NJIN)', '(201) 854-1200', '201-854-3333/201-295-0307', '307 60th St, West New York, NJ 07093', NULL, NULL, 'Scheduling Line: 800-930-6759
NPI: 1558348029
3196 Kennedy Blvd, Union City NJ 07087
Phone: (201) 865-6100 Fax: (201) 865-6102
NPI: 1972689909 Group ID: 1149900
79 Hudson Street, Hoboken, NJ 07030
Phone: 973-661-4674 Fax: 973-661-5245
Jersey City at Summit (formerly Montclair)
550 Summit Ave, Jersey City, NJ 07306
Phone: 973-661-4674 Fax: 973-661-5245', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Jersey Advanced MRI & Diagnostic Center', '(201) 552-9464', '(201) 552-9467', '2127 Kennedy Blvd. North Bergen, NJ 07047', NULL, NULL, 'Open MRI - 3T MRI - CT - Ultrasound - X-Ray - DEXA', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Holy Name Medical Center - Radiology', '(201) 833-7272', NULL, '718 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 'MRI Ph: (201) 833-7272 / Fax: (201) 833-7201
CT/Ultrasounds Ph: (201) 833-3280 / Fax:(201)541-5919
Holy Name will take care of PAs on behalf of the office. When sending/ scheduling imaging please make sure to send the following: Prescription with Diagnosis and CPT codes, Patients insurance card(front and back), demo, clinical history such as encounters, prior treatments etc. Fax this information to the attention of “Radiology Verification Office” to (201)541-6357.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Lyndhurst Radiology Center', '(201) 729-1234', '(201) 729-1233 / 201-729-1150', NULL, NULL, NULL, 'Medical Records Fax: 1 (866) 721-8909 (Joe) Pre-authorizations', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Bergenline X-Ray Diagnostic Center', '(201) 766-9155, (201) 348-6060', '201-348-2064', '402 43rd St, Union City, NJ 07087', NULL, NULL, '(Does not do Tomosynthesis)
NPI: 1073787826', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Hackensack Radiology Group', '(201) 488-2660', '201-488-6784', '30 S Newman St, Hackensack, NJ 07601', 'monicareyestascon@gmail.com', NULL, 'Holy Name will take care of PAs on behalf of the office. When sending/ scheduling imaging please make sure to send the following: Prescription with Diagnosis and CPT codes, Patients insurance card(front and back), demo, clinical history such as encounters, prior treatments etc. Fax this information to the attention of “Radiology Verification Office” to (201)541-6357.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'EVACORE (PRIOR AUTHORIZATIONS- MEDS NOT COVERED THROUGH COVERMYMEDS)', '1-866-496-6200', '1-800-637-5204', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Evicore (PRIOR AUTHORIZATIONS-IMAGING)', '1(800) 918-8924', NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'Evicore (PRIOR AUTHORIZATIONS-IMAGING)', '1(800) 421-7592', NULL, NULL, NULL, NULL, 'Clover Healthcare, Aetna, Cigna, Oscar, Medicaid and Medicare, Excelus', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Imaging / Radiology — notes', 'AIM (PRIOR AUTHORIZATIONS-IMAGING) for Amerigroup', '1(833)419-1491', NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Acupuncture', 'Fort Lee Acupuncture and Physical Therapy', '(201) 502-9706', '(201) 346-9656', '360 Whiteman St Fort Lee , NJ 07024', 'rippleffect360@gmail.com', 'www.flap360.com', 'Accepts Medicare, Horizon BCBS, United Health, Cigna, Empire, AmeriHealth, and Aetna.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Acupuncture', 'Family Acupuncture Clinic', '201-868-4400', NULL, '437 69th Street Guttenberg NJ 07093', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Acupuncture', 'Dr. Brian Chang', '(201) 754 - 0104', NULL, '32 - 42 Newark St, #203, Hoboken NJ 07030', 'hoboken@drbrianchang.com', 'http://www.sportsacupunctureandfamilywellness.com', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Allergist', 'Mathew M Verghese, MD', '(201) 374-1718', NULL, '8901 Kennedy Blvd Ste 4SW, North Bergen, NJ 07047', NULL, NULL, 'Not accepting United Healthcare w/ Medicaid or Aetna Better Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Allergist', 'Dr. Thomas Selvaggi', '(201) 343-6673', NULL, '211 Essex Street, Suite 401, Hackensack, NJ 07601', 'frontdesk@hackensackallergy.com', NULL, 'Hackensack Allergy and Asthma Center
(NOSE) Fax: (201) 343-7555', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Alternative Medicine', 'Robin Ellen Leder, MD', '(201) 525-1155', '(201) 525-0915', '235 Prospect Avenue Suite LB, Hackensack, NJ 07601', 'a.better.alternative.medical@gmail.com', NULL, 'A Better Alternative Medical Center', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Alternative Medicine', 'Kristin Wright McKitish, MD', '(212) 873-3420', '(201) 525-0915', '477 Madison Ave., Suite 420, New York, NY 10022', 'INFO@ESHEALTH.COM', NULL, 'Evolved Science', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Alternative Medicine', 'Humaira Quraishi ND, MS', '(845) 415-6920', '(201) 302-9994', '1600 Parker Ave., Fort Lee, NJ 07024', 'drhquraishi@gmail.com', 'www.natureshum.net', 'Naturopathic Medicine', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Audiologist', 'Hear USA', '(201) 854-1800', NULL, '7401 Bergenline Ave Suite 3, North Bergen, NJ 07047', NULL, NULL, 'Not accepting United Healthcare w/ Medicaid or Aetna Better Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Angel Mulkay / Dr. Michael Cohen (Interventional Cardiology)', '201-601-0900', '201-766-2422', '529 39th Street, Union City, NJ 07087', NULL, NULL, 'Dr. Scott D. Ruffo / Dr. Joseph Yu, MD (Cardiac EPS)
Holy Name - Mulkay Cardiology Consultants
493 Essex Street, Hackensack, NJ 07601
15 VerValen Street, Closter, NJ 07624 Phone: 201-996-9244 Fax: 201-996-9243', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Raashan C. Williams (Interventional Cardiology)', '(201) 758-8000', '201-758-8003', '3196 Kennedy Blvd. Union City, NJ 07087', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Jose Santana / Dr. Umesh Katdare', '(551) 257-5999', '(201) 541-2249', '425 70th St Guttenberg, NJ 07093', NULL, NULL, 'Dr. Felix Dailey-Sterling (Interventional Cardiology)
Hudson Heart Group, PC (Englewood Health Physician Network)
467 Prospect Ave, Newark, NJ 07104
Phone # (973) 483-9944', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Fernando Segovia / Dr. Rick Pumil / Dr. Chris Pumil / Dr. Yaron Bareket / Dr. Irfan Admani', '551-357-0021 | 201-941-8100', '201-941-2899', '103 River Road, 2nd Fl, Edgewater, NJ 07020', NULL, NULL, 'Cross County Cardiology - Does not accept HNJH, UHC community plan
7322 Bergenline Ave, North Bergen, NJ', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Stephen Angeli / Dr. Tariqshah Syed (Interventional Cardiology)', '201-833-2300', '201-833-7600', '954 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 'Dr. David Wild / Dr. Shalin Desai / Dr. Gerard Eichman
Holy Name - Cardiovascular Specialists of North Jersey', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Hrach Kasaryan', '(201) 224-0050', '(201) 224-6061', '810 Abbott Blvd Suite 201, Fort Lee, NJ 07024', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Zankhana Raval', '(201) 660-9946', '(201) 801-9007', '381 Teaneck Road Suite 101 Teaneck, NJ 07666', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. David Fridman', '(201) 987-6090', '(551) 303-2033', '596 Anderson Ave. Ste 302 Cliffside Park, NJ 07010', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Haroon Faraz (Interventional Cardiology)', '(201)-928-2300', '201-692-3262', '400 Frank W Burr Blvd Fl 2 Suite 22 Teaneck,NJ 07666', NULL, NULL, 'BERGEN CARDIOLOGY ASSOCIATES', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Anuj R. Shah', '(973) 916-0002', '(973) 916-0027', '143 Palisade Ave, Jersey City, NJ 07306', NULL, NULL, 'Apex Heart and Vascular Care
643 Mt. Prospect Ave, Newark, NJ 07104
654 Mt. Prospect Ave, Newark, NJ 07104
606 Broadway, Paterson, NJ, 07514
91 Main St, Paterson, NJ 07501
2 Smalley Terrace, Irvington, NJ 07111
293 Passaic St, Passaic, NJ 07055
591 Franklin Ave, Nutley, NJ 07110', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Hector Rubinstein', '(201) 348-4442', '201-348-4475', '4512 John F. Kennedy Blvd, Union City, NJ 07087', NULL, NULL, 'TAKES HNNJ FOR STRESS TEST', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Luis Astudillo', '(201) 869-1313', '(201) 854-7945', '7650 River Road North Bergen, NJ 07047', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology', 'Dr. Francis Kim', '201-251-3243', '201-389-6777', '140 East Ridgewood Avenue, Floor 7, Paramus, NJ 07652', NULL, NULL, 'VMG Interventional and Structural Cardiology', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology (Peds)', 'Dr. Mohy Kotb, MD (Pediatric Cardiology)', '201-533-0222', '201-533-0223', '33-41 Newark St, Suite 4C Hoboken, NJ 07030', NULL, NULL, 'Hudson Pediatric Cardiology Center
$350.00 for consultation, ekg, and echocardiogram', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cardiology (Peds)', 'Dr. Courtney C. Peshkovsky, MD (Pediatric Cardiology)', '(973) 926-3500', NULL, '16 East 29th St Bayonne, NJ 07002', NULL, NULL, 'Speaks Spanish, can apply for Charity Care Newark Beth Israel
Medical Specialty Services at Bayonne Pediatric Specialty Services', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Chiropractor', 'Dr. Count Wiley', '201-583-1355', '201-583-1350', '4309 Liberty Ave, North Bergen, NJ 07047', 'Countchiro@aol.com', 'https://friendsandfamilynj.com/', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Chiropractor', 'Dr. Feodor A Sakatch', '201-941-8008', '201-941-3880', '596 Anderson Ave Suite 104 Cliffside Park, NJ 07010', NULL, 'www.mygenesishealthclinic.com/', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Chiropractor', 'Dr. Alex Hernandez (Chiropractor and Acupuncture)', '201-861-2025 , 201-241-4061', '201-861-2262', '8325 Kennedy Blvd. North Bergen NJ 07047', 'info@123yourhealth.com', 'www.123yourhealth.com', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dentist', 'Dr. Zenaida Mulkay / Dr. Guillermo Castillo (DMD)', '(201) 854-8100', '201 861 5636', '700 79th St, North Bergen, NJ 07047', 'northbergen@castillomulkay.com', 'https://www.castillomulkay.com/', 'Castillo & Mulkay Dental (NO Clover, Amerigroup, Medicaid. Will accept HNJH Total)
601 Main Ave., Passaic, NJ 07055
Phone: 973 473 8188 Fax: 973 458 1965
Email: passaic@castillomulkay.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dentist', 'Dr. Giancarlo Ghisalberti (DMD)', '201-854-1616', NULL, '7918 John F Kennedy Blvd. North Bergen, NJ 07047', NULL, NULL, 'Speaks Spanish and Italian', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dentist', 'Dr. Dennis Barbieri / Dr. Kenneth J Colameo / Dr. Nicholas Berardo (DMD)', '201-867-0404', '201-868-2499', '7322 Bergenline Avenue, North Bergen, NJ 07047', 'northbergen@njoralsurgery.com', 'https://www.njoralsurgery.com/', 'NJ Oral Surgery (NO UHC-Medicaid)
605 Broad Avenue, Ridgefield, NJ 07657
Phone: 201-941-9494 Fax:201-941-1246
Email: ridgefield@njoralsurgery.com
16 Johnson Avenue, Hackensack, NJ 07601
Phone: 201-342-7353 Fax:201-342-7982
Email: hackensack@njoralsurgery.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dentist', 'Dr. Louis R. Vita', '973.777.1933', '973.777.4727', '991 Van Houten Avenue Clifton, New Jersey 07013', NULL, NULL, 'Comprehensive Diagnosis and Therapy for TMJ Disorders in Adults and Children
Vita Head Neck and Facial Pain Center', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Dr. Adolfo Carlos Fernandez-Obregon', '(201) 795-3376', '201-795-5515', '10 Church Towers, Suite 1, Hoboken, NJ 07030', NULL, NULL, 'English/Spanish Speaking / No medicaid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Dr. Jason Chouake', '201-298-3650', NULL, '663 Palisade Ave #201, Cliffside Park, NJ 07010', NULL, NULL, 'Email: info@cliffsideskinandlaser.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Metropolitan Dermatology', '(201) 861-4226', '(201)861-7630', '5809 Madison St, West New York, NJ 07093', NULL, NULL, 'English/Spanish Speaking/ No medicaid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Dr. Gloria Lin', '201-861-4226', '201-861-7630', '5809 Madison ST ,West New York , 07093', NULL, NULL, 'No AmeriGroup/Wellpoint', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Dr. Adriana Ros', '(201) 255-4046', '201-793-7620', '1100 Clifton Ave, Suite F, Clifton, NJ 07013', NULL, NULL, 'Does not accept UHC Dual Complete and Community Plan
Website: https://drros.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Schweiger Dermatology', '201-795-0021', NULL, '2 Hudson Place, Hoboken NJ.', NULL, 'https://www.schweigerderm.com/locations/#new-jersey', 'Accepts most insurances including Horizon NJ Health
71 Union Ave, Ste 108, Rutherford, NJ 07070
23-00 State Rt 208, Fair Lawn, NJ 07410
Phone: 212-283-3000 Fax : 646-462-3018
NPI#: 1104229392', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'Herman Dermatology', '(201) 867-8550', NULL, '411 60th St, West New York, NJ 07093', NULL, NULL, 'Does not accept Medicaid Insurances, Amerihealth, Clover', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dermatology', 'MDCS Dermatology: Medical Dermatology and Cosmetic Surgery', '(973) 777-6444', '(973) 777-5277', '1033 Clifton Avenue, Suite 201 Clifton, NJ 07013', NULL, NULL, '401A South Van Brunt Street, Suite 403 Englewood, NJ 07631 Phone: (201) 431-9146', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Yudi Camacho', '201-520-1069', NULL, '435 57th St, West New York, NJ 07093 (Not available appt for new Pt until Dec/2026 @WNY)', NULL, NULL, 'Speaks English/Spanish, Accepts Medicaid as well- Does NOT take UHC
2 Journal Square Plaza, Jersey City, NJ 07306 (Diabetics Center)
(Wny), Phone: 551-325-2662(J.C) Fax: 201-520-1085', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Sonal Pathak, Dr. Yazan Vwich', '(201) 453-0322', '(201) 453-0325', '6045 Kennedy Boulevard, Ste B, North Bergen, NJ 07047', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Vanessa Barboza', '(201) 915-2380', '(201) 915-2381', '377 Jersey Ave Ste. 220 and 414 Grand Street Ste 14. Jersey City, NJ 07302', NULL, NULL, 'Speaks English/Spanish
59 Newark St. Hoboken, NJ 07030', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Merab Joseph', '(201) 941-5757', '(201) 941-5779', '596 Anderson Ave, Suite #208, Cliffside Park, NJ 07010', NULL, 'https://www.northjerseydiabetes.com/', '(Does not accept Aetna Comm, MagnaCare)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Ari Geliebter (Adult) / Dr. Rebecca Geliebter (Pediatric)', '201-903-0070', '201-322-0287', '240 West Passaic Street, Suite 14 Maywood NJ, 07607', NULL, 'https://comprehensiveendo.com/', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Ari Eckman, MD', '201-971-9001', '201-907-1190', '721 Teaneck Road Teaneck, NJ 07666', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Pediatric Endocrinology', '(551) 996-5329', NULL, '30 Prospect Ave # 251, Hackensack NJ', NULL, NULL, 'Dr. Steven Nigel Ghanny', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Endocrinology', 'Dr. Rebecca F. Geliebter', '(201) 903-0070', NULL, '240 W Passaic Street Maywood NJ.', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ENT', 'Dr. Jeffrey M. Shaari', '(201) 867-5557/ (201) 342-8060', '201-867-5566', '413 60th St. West New York, NJ 07093', NULL, NULL, 'Not in network with HNJH/ Fidelis/UHC Dual complete - NPI# 1891742342', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ENT', 'Dr. Evan Sarti', '201-935-5508', '201-465-6088', '47 Orient Way, 2nd Fl, Rutherford NJ 70702/ Not UHC', NULL, 'https://www.summithealth.com/doctors/evan-sarti-do', '6 Brighton Road, Suite 104, Clifton, NJ 07012', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ENT', 'Dr. Shari Reitzen', '201-293-4030 / (347) 557-8368', '201-293-4099', '324 Palisade Avenue, 2nd Fl, Jersey City, NJ 07307', NULL, NULL, 'Riverside Medical Group NPI # 1578665048
1425 Bloomfield Street, Hoboken NJ 07030
255 State Route 3 East, Suite 101, Secaucus, NJ 07094
Englewood Ear Nose & Throat
Not in Network with UHC
216 Engle Street, Suite 101 Englewood, NJ 07631
Phone: (201) 816-9800 Fax: 201-567-1569', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ENT', 'Dr. Babak Behin, MD', '201-453-1677', '201-659-4707', '400 38th Street, Suite 404, Union City, NJ 07087', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. John Sotiriadis, MD, PHD / Dr. Peter Caride MD / Dr. Smrita Sinha, MD', '(201) 869-9500', '201-869-9501', '9252 Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 'Not in Network with UHC Community Plan, Amerigroup, Wellcare Medicaid, Aetna Medicaid + Comm
NPI: 1659578664', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Mauricio Zapiach', '201.854.4646/201.854.4647/201-854-4740', '201-854-3203', '235 60th Street, West New York, NJ 07093', NULL, NULL, 'Not in Network w/ Medicaid(UHC dual complete/community plan, Wellcare Medicaid/HMO Medicare),Oscar
810 Main Street, Hackensack, NJ 07601
Phone: 201.488.0095', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Jose Churrango', '201-710-2715', NULL, '7650 River Road, Suite 300, North Bergen, NJ 07047', NULL, NULL, 'Languages Spoken ( English-Spanish) - Not in Network with UHC Dual complete', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Domenica Barritta / Dr. Gregory Lesser', '973-645-0000', '973-645-0001', '327 60th St, West New York, NJ 07093', NULL, NULL, '79 Hudson St, Suite 301, Hoboken, NJ 07030
24 Merchant St. Newark, NJ 07105', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Jeffrey M Raskin / Dr. Harold Tepler', '201-868-2849', '201-868-4190', '8901 Kennedy Blvd. Suite 5S North Bergen NJ 07047', NULL, NULL, 'Not in Network with Medicaid, Wellcare Medicare, Oscar
142 Palisade Ave. Suite 201, Jersey City, NJ 07306
Phone: 201- Fax: 201-792-7812', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Harry Snady', '(201) 902-9500', '(212) 410-6093', '5600 Kennedy Blvd W Suite 103, West New York, NJ 07093', NULL, NULL, 'Not in Network with Amerigroup Plan, Medicaid, Oscar
1 Bellevue Terrace, Weehawken, NJ 07086
Phone: (201) 348-9200', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Steven C Goldstein, Dr. Meron Debesai, MD', '(201) 325-9393', '201-865 4416', '3196 Kennedy Blvd Ste 2, Union City, NJ 07087', NULL, NULL, 'Accepts Wellcare Medicaid/ Not in network with any Aetna Commercial , Oscar
Group ID HNJH#: 60067523 NPI #: 1780740860', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Michael F. Demyen, MD', '(201)295-1456', '(201) 520-1085', '435-57th St, West New York, NJ 07093', NULL, NULL, 'Languages Spoken ( English-Spanish)-
Not in Network with UHC Community Plan- Dual complete and Aetna Better Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Dr. Haroon Shahid, Dr. Avik Sarkar, Dr. Jennifer Hsieh', '201-420-7903', '201-420-7586', '330 Grand St. Hoboken, NJ', NULL, NULL, 'Carepoint
142 Palisade Ave. Suite 108, Jersey City, NJ
Phone: 844-211-2273', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gastroenterology', 'Anil Agarwal, MD', '(973) 546-4242', '(973) 546-7639', '905 Allwood Rd, Clifton, NJ 07012', NULL, NULL, 'Languages Spoken ( English-Spanish)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hepatology', 'Dr. Andrew De La Torre', '551-350-6910', '201-253-0454', '59 Newark Street, Hoboken NJ 07030', NULL, NULL, '3196 Kennedy Blvd, Union City, 07087
169 York Street, Jersey City NJ 07302', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hepatology', 'Dr Maliha Ahmad', '973-754-2315', '973-754-2925', '225 Minnisink Road, Floor 3, Totowa, NJ 07512', NULL, NULL, '1135 Broad Street, Suite 1, Clifton, NJ 07013
Phone: 973-754-2315 Fax: 973-754-2925', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hepatology', 'Dr. George Abdelsayed', '201-392-3100', NULL, '55 Meadowlands Pkwy, Secaucus, NJ 07094', NULL, NULL, 'Head of the Hepatology Division at Hudson Regional Hospital', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hepatology', 'Dr. Charissa Chang', '212-241-0034', NULL, '2 Marine View Plaza Hoboken, NJ 07030', NULL, NULL, 'Mount Sinai', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hematology / Oncology', 'Dr. Bhavna Gupta', '(201) 751-4004', '201-455-6296', '2000 West St, Suite 205, Union City NJ, 07087', 'jerseyhemonc2018@gmail.com', 'https://www.jerseyhemonc.com/', 'Takes all insurances NPI #1801074455
1151A Main Ave Clifton NJ 07087', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hematology / Oncology', 'Dr. Simon Badin', '(201) 433-4848', '(201) 360- 0159', '1947 John F Kennedy Blvd, Jersey City, NJ, 07305', NULL, NULL, 'Not in Network with Fidelis
Languages Spoken ( English-Spanish)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hematology / Oncology', 'Dr. Amit Patel', '732-390-7750', '201-201-7234', '1829 Hudson Park, Edgewater, NJ 07020', NULL, NULL, 'Astera Cancer Care
1 Exchange Place, Jersey City NJ 07302', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hematology / Oncology', 'Dr. Yadyra Rivera, Dr. Jason Lee, Dr. Vikram Premkumar', '201-227-6008', '201-227-6002', '718 Teaneck Rd, Teaneck, NJ 07666', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Hematology / Oncology', 'Dr. Damanjit Ghuman, Dr. Jieqi Lio', '(201) 333-8248 , (201) 523-5459; (732)390-7750', '201-333-8469 or 609-642-1069', '377 Jersey Ave, Suite 160, Jersey City, NJ 07302', NULL, NULL, 'Hudson Hematology Oncology', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Radiation Oncology', 'Dr. Benjamin Rosenbluth (Radiation Oncology)', '201-541-5900', '201-541-6305', '718 Teaneck Rd. Teaneck, NJ 07666', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Infectious Disease', 'Dr. Benjamin De La Rosa (spanish speaking)', '201-591-9840', '201-591-9837', '197 Cedar Lane, Teaneck, NJ 07666', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Fertility', 'RMA Network', '201-621-0909', NULL, '100 Town square Place, 6th floor, Jersey City, New Jersey 07310', NULL, NULL, 'Jersey City', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Fertility', 'Englewood', '201-569-7773', NULL, NULL, NULL, NULL, '25 Rockwood Place, Suite 320 Englewood, New Jersey 07631 Phone: 201-569-7773
Website: rmanetwork.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Fertility', 'Dr. Eric Seaman (MALE FERTILITY)', '973-253-4256', NULL, '25 Millburn Avenue, Building C - Suite 304, Millburn, NJ 07041', NULL, NULL, 'Including Vasectomies
Phone (appointments): 973-253-4256 | Phone (general inquiries): (973) 218-9400
16 Pocono Rd, #114, Denville, NJ 07834
Phone (appointments): 973-327-7457 | Phone (general inquiries): (973) 586-3056', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Ashish Kapoor', '(201) 222-2693', '201-823-2880', '600 Pavonia Ave # 4, Jersey City, NJ 07306', NULL, NULL, 'Does not accept HNJH', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. James Charles, MD', '201-854-6614', '201-854-1380', '8841 Kennedy Blvd Blvd, North Bergen, NJ 07047', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Nagesh Krish (It does not have an interpreter for Spanish)', '(201)-864-5252', '(201)-864-9955', '727 10th St. Union City, NJ 07087', NULL, NULL, 'NPI #: 1710918115 - Does not accept HNJH, ONLY WELLCARE AND UNITED', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Farzana Nanavati', '(201)-855-8300', '(201)- 975-8028', '1 DeGraw Ave, Teaneck NJ 07666', NULL, NULL, 'Advanced Neuromed', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Nilay Shah', '(201) 880-8060', '(201) 880-8061', '255 W Spring Valley Ave # 102, Maywood, NJ 07607', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Marissa Oller-Cramsie / Dr. Thomas Kreibich / Dr. Joseph Petrsoric', '201-833-7208', '201-379-5708', '718 Teaneck Road, Teaneck, NJ 07666', NULL, NULL, 'Holy Name - DOES NOT ACCEPT MEDICAID', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Nalini Prasad', '201-758-0660', '201-758-0635', '8103 Bergenline Ave North Bergen NJ 07047', NULL, NULL, 'Does not accept HNJH, AmeriHealth', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. Ravinder Tikoo', '201-869-2707', '(201) 869-2717', '9225 Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 'DOES NOT ACCEPT AMERIHEALTH,
3196 KENNEDY BLVD STE 3 Union City, NJ 07087
Phone: 201-833-9500 Fax: (201) 862-0095', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Neurology', 'Dr. MaryAnn Picone (Multiple Sclerosis)', '201-837-0727', '201-837-8504', '718 Teaneck Road MS Center, Teaneck, NJ 07666', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nutritionist', 'Perla Nelson, MBA, RDN: (Dietitian-Nutritionist)', '(201) 758-8838', NULL, '8500 Kennedy Blvd, North Bergen, NJ 07047', NULL, 'www.medicalnutritionofnj.com', 'Accepts insurance, Speaks Spanish, Pediatrics & Adult (NPI: 1467712828)
500 Union Blvd Totowa, NJ 07512
& (862) 257-1297 Fax: 888-442-1408
Email: info@medicalnutritionofnj.com & mnnewjersey@yahoo.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nutritionist', 'Culina Health (Dietitian-Nutritionist)', '917-647-1665', '201-473-5812', '33-41 Newark Street, 5th Fl, Hoboken, NJ 07030', 'info@culinahealth.com', 'www.culinahealth.com', 'Accepts most major insurance plans (i.e. Aetna, Amerihealth, BCBS, Cigna, UHC, and Medicare)
Speaks Spanish, Pediatrics & Adult (Group NPI: 1700537883) Affordable self pay options available', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nutritionist', 'My Healthy Living- Medical Nutritionist (Peds/Adults)', '201-758-8838', NULL, '6809 Bergenline Avenue, West New York, NJ 07093', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nutritionist', 'Bessen, Debbie, RD', '201-227-6040', '201-808-8413', '718 Teaneck Road Teaneck, NJ 07666', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nutritionist', 'EverLong (Virtual Nutritionist)', '617-221-6494', '866-803-5661', NULL, NULL, 'https://geteverlong.com', 'No Medicaid plans at the moment', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nephrology', 'Dr. Clenton Coleman/ Dr. Diane Triolo / Dayra Soto, NP', '201-379-5650', NULL, '211 60th St. West New York, NJ 07093', NULL, 'https://clentoncolemanmd.com/', 'Holy Name
222 Cedar Lane, Suite 109, Teaneck, NJ 07666
// Fax: 201-868-7185 // Fax: 201-357-8206
NPI: 1730379025', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nephrology', 'Dr. Danny Haddad / Dr. Bassam Haddad / Dr. Narender Goel / Dr. Deepika Jain', '201.866.3322', '201.866.2289', '510 31st Street, Union City, New Jersey 07087', NULL, 'https://www.newjerseykidneycare.com/', 'Dr. Lochana Manandhar / Dr. Niveen Bebawy
New Jersey Kidney Care
26 Greenville Ave, Jersey City, NJ 07305
377 Jersey Ave., Suite 220, Jersey City, New Jersey 07302
1600 Willow Ave., Hoboken, New Jersey 07030
862 Broadway, Bayonne, New Jersey 07008
Phone: (201) 333-8222 Fax: 201-333-0095', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nephrology', 'Dr. Sanford Cooper', '201-963-1077', '(973) 325-2254', '142 Palisade Ave #202, Jersey City, NJ 07305', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nephrology', 'JK Nephrology & Hypertension - Dr. KwonSoo Kim MD (spanish speaking)', '201-491-0050', '201-491-0060', '1590 Lemoine Ave, Suite 102, Fort Lee NJ 07024', NULL, NULL, 'frontdesk@jknephrology.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Ruben Barrera Vera (Gynecology)', '201-943-4884', '201-943-4839', '576 Anderson Avenue Cliffside Park, NJ 07010', NULL, NULL, 'Spanish Speaking', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Payal Shah (Ob/Gyn)', '201-907-0900', NULL, '870 Palisade Ave., Suite 301, Teaneck, NJ 07666', NULL, NULL, 'Holy Name - Women''s Health Care Group
71 Union Ave., Suite 101, Rutherford, NJ 07070
Phone: 201-514-0300 Fax: 201-907-0229', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Darlene Clemente, APN', '(201) 342-1191', '(201) 342 1195', '160 Essex St, Lodi, NJ 07644', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Anita Chait', '201-575-1211', '201-934-8499', '50 South Franklin Turnpike, Suite 2B, Ramsey, NJ 07446', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Arthur Gross (Ob/Gyn)', '201-894-0003', '855-754-0591', '25 Rockwood Pl., Suite #305, Englewood, NJ 07631', NULL, NULL, 'Englewood Women’s Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Natasha Chinn / Dr. Samantha Lowe ( OBGYN )', '201-520-1069', '201-520-1085', '435 57th Street West New York, NJ 07093', NULL, NULL, 'Englewood Health Group - Brescia and Migliaccio Women''s Health - No aetna better health
609 Washington Street, Hoboken, NJ 07030
Phone: 201-659-7700 Fax: 201-526-9319
968 River Road, Suite 203, Edgewater, NJ 07020
Phone: 201-659-7700 Fax: 201-869-0094
542 Broadway, Bayonne, NJ 07002
Phone: (201) 659-7700 Fax: 201-858-1638', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Tamara Aviles, Henry Fernandez-Cos, MD (ObGyn)', '201-861-9229', '201-861-9272', '419 66th St, West New York, NJ 07093', NULL, NULL, 'Affiliated with Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Stefano Stella (Gynecology)', '201-330-0333', '201- 766-2939', '3196 Kennedy Blvd Ste 2, Union City, NJ 07087', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Bruce Bennett (ObGyn)', '(201) 866-9320', NULL, '5301 Broadway, West New York, NJ 07093', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Comprehensive Women''s Care', '(201) 871-4346', '201-871-5953', '401 S Van Brunt St Ste 405, Englewood, NJ 07631', NULL, NULL, 'Do not accept Medicaid Insurances', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Osbert Fernandez (OBGYN)', '(201) 706-4524', NULL, '5 Marine View Plz, Hoboken, NJ 07030', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. Potter McQuilkin (OBGYN)', NULL, NULL, NULL, NULL, 'https://www.lavishrejuvenation.com/', 'Lavish Rejuvenation- Private practice
Out of pocket cost- Does not take insurance.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'Dr. David Principe (MFM)', '973-532-2500', '973-532-2530', '2 Brighton Road, Suite 402, Clifton, NJ 07012', NULL, 'https://www.davidprincipemd.com/', '609 Washington Street, Hoboken, NJ 07030
Phone: 201-659-7700 Fax: 201-526-9319', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB/GYN', 'ENDOMETRIOSIS SPECIALIST', '516- 584-8710', NULL, '155 East 76st , Suite 1H, New York, NY 10021', 'Info@drvidali.com', NULL, 'Dr. Andrea Vidali
Website: Home - Endometriosis Treatment Center NYC', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Family Planning', 'Hoboken Family Planning Inc', '(201) 963-0300', NULL, '124 Grand Street Hoboken, NJ 07030', NULL, NULL, '*Does NOT perform Terminations*
1206 Summit Avenue Union City, NJ 07087
Phone: (201) 319-9200 Fax: 201-319-9121
5305 Hudson Avenue West New York, NJ 07093
Phone: (201) 866-8071', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Family Planning', 'Planned Parenthood', '(201) 489-1140', NULL, '575 Main Street Hackensack, NJ 07601', NULL, NULL, '29 N Fullerton Avenue Montclair, NJ 07042
Phone: (973) 746-7116
46 N Van Brunt Street Englewood, NJ 07631
Phone: (201) 894-0966', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Family Planning', 'Dr. Eric Seaman (MALE FERTILITY)', '973-253-4256', NULL, '25 Millburn Avenue, Building C - Suite 304, Millburn, NJ 07041', NULL, NULL, 'Including Vascetomies
Phone (appointments): 973-253-4256 | Phone (general inquiries): (973) 218-9400
16 Pocono Rd, #114, Denville, NJ 07834
Phone (appointments): 973-327-7457 | Phone (general inquiries): (973) 586-3056', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Optometry (OD)', 'Dr. Elizabeth Suarez-Garita (speaks spanish)', '201-868-1886', '201-868-7392', '7418 Bergenline Ave, North Bergen NJ 07047', NULL, NULL, 'No longer taking Amerihealth
Website: https://www.garitavisioncenter.com/ Email: garitavisioncenter@gmail.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Optometry (OD)', 'Dr. Anthony Gurdak (speaks spanish)', '201-868-3603', NULL, '6408 Bergenline Ave. West New York, NJ 07093', NULL, NULL, 'No longer taking Amerihealth', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Optometry (OD)', 'Dr. Rodolfo L Rodriguez (speaks spanish)', '201-295-2020', '201-295-0804', '7922 Kennedy Blvd. North Bergen, NJ 07047', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Optometry (OD)', 'Dr. Nieves Fernandez', '(201) 861-8813', '201-861-2695', '7225 Bergenline Ave 2nd Fl, North Bergen, NJ 07047', NULL, NULL, '(Not Accepting Medicaid Insurance)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Optometry (OD)', 'Smart Eye Care', '201-751-2388', NULL, '6000 Bergenline Ave. West New York, NJ 07093', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Dr. Luis Gonzalez (spanish speaking)', '(201) 867-2999', '(201) 867-4440', '3196 Kennedy Boulevard, Union City, NJ 07087', NULL, NULL, 'NJRetina
Website: https://www.njretina.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Fasano Armand MD', '(201) 869-0707', NULL, '229 60th St, West New York, NJ 07093', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Dr. Steven W. Braunstein, MD', '201-869-8235', NULL, '7316 Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 'Phone: 201-869-323 Fax: 201-869-8235', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Dr. Claudio D''Alberti', '201-659-2020', '201-659-8330', '1126 Washington Street Hoboken, NJ 07030', NULL, NULL, 'D’ Alberti Eye Center
Website: http://www.dalbertieye.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Hudson Eye Specialists', '(201) 601-2020', '201-601-9722', '2201 Bergenline Ave. Union City, NJ', NULL, NULL, 'NPI#: 1376593863', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Dr. Anthony Panariello', '(201) 653-5722', '201-792-9718', '203 Palisade Ave, Jersey City, NJ 07306', NULL, 'https://palisadeeye.com/staff/anthony-panariello-md/', 'Palisade Eye
594 Broadway Bayonne, NJ 07002
Phone: (201) 858-5722', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ophthalmology (MD)', 'Dr. Adnan Mallick, M.D', '(201) 766-5151', '201-766-5154', '6121 John F. Kennedy Blvd 1st Floor, North Bergen, NJ 07047', NULL, 'https://www.retinacenternj.com/', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Palliative Care', 'Dr. James Morgan / Dr. Richard Rosenbluth', '201-379-5610', '201-379-5611', '718 Teaneck Rd. Teaneck, NJ 07666', NULL, 'www.holyname.org/palliativecare', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr. Aditya Patel', '201-402-7802', '201-479-1175', '2 University Plaza Dr., Suite 500, Hackensack, NJ 07601', NULL, NULL, 'Does NOT accept UHC DUAL COMPLETE - Spanish translator readily available
Website: https://www.sprinstitute.com/ Email: office@sprimedical.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr. Felix E Roque (speaks spanish)', '201-662-5437, (201) 766-7471, (877) 746-3656', '201-662-7195', '543 45th St, Union City, NJ 07087', NULL, NULL, 'Does NOT accept Medicaid, Amerihealth, UHC DUAL COMPLETE
Website: https://www.drroque.net/ Email: info@drroque.net', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Redefine Healthcare (speaks spanish)', '732-838-5205', NULL, '3540 John F. Kennedy Blvd, Jersey City, NJ 07307', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr. Sumeet Arora / Dr. Rahul Sood Dr. Sachin K. Shah / Dr. Roy Liu', '(862) 238-8250', '862-238-8255', '115 Christopher Columbus Dr, Suite 301, Jersey City, NJ 07302', NULL, NULL, 'Does NOT accept Medicaid (nor medicaid-medicare type plans) - Spanish translator readily available
50 Mt. Prospect Ave, Suite 203, Clifton, NJ 07013
855 Broadway, Bayonne, NJ 07002
Website: https://www.metropaincenters.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr. Kevin Ko', '(732) 276-2494', NULL, '370 Grand Ave, Suite 202, Englewood, NJ 07631', NULL, NULL, 'SamWell Institute for Pain Management, Englewood, NJ', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr. Robert F. Strell', '(201) 222-0082', '201-222-6799', '317 Willow Ave, Hoboken, NJ 07030', NULL, NULL, 'NO WELLCARE / HNJH Physical Medicine & Rehabilitation
Website: https://drrobertstrell.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr Gregory Lawler', '(201) 758-7550', '201-758-7549', '6233 John F. Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 'No accept MEDICAID, Amerihealth, UHC
Website: https://northjerseyinterventionalpain.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pain Management', 'Dr. Edwin Constantino', '(201)-656-0440', '(201)-656-3444', '10 Huron Ave. Suite 1-L Jersey City, NJ 07306', NULL, NULL, 'TAKES UHC Community Plan - Physical Medicine & Rehabilitation', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pediatrician', 'Harry Banschick, MD', '(201) 592-9210', '(201) 592-6539', '222 Cedar Ln Ste 301, Teaneck, NJ 07666', NULL, NULL, '(Dr. Maria Dominguez available select days. Both providers speak Spanish)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Tru Physical Therapy', '(201) 725-3581', '(201) 744-7360', '7309 Broadway, North Bergen, NJ 07047', NULL, NULL, 'does not accept Medicaid
Website: www.truphysicalrehab.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Tawil Physical Therapy & Sports Performance, PA (Provide transportation w/Town WNY)', '(201) 552-9072', '(201) 552-9073', '8701 Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 'does not accept Medicaid
Website: www.Tawilpt.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Total Care Physical Therapy', '201-751-5000', '201-751-5010', '4801 Broadway, Union City, NJ 07087', NULL, NULL, 'Accepts Amerihealth, Aetna, Cigna, Clover, Fidelis, Humana, Horizon BCBS, UHC Dual Complete
Website: www.totalcare-pt.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Fort Lee Acupuncture and Physical Therapy', '(201) 502-9706', '(201) 346-9656', '360 Whiteman St Fort Lee , NJ 07024', NULL, NULL, 'Accepts Medicare, Horizon BCBS, United Health, Cigna, Empire, AmeriHealth, and Aetna.
Website: www.flap360.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Orlando Physical Therapy', '(201) 876-0001', '(815) 331-0905', '1321 Washington St, Hoboken, NJ 07030', NULL, NULL, 'Website: www.orlandopt.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Top Choice Physical Therapy and Wellness', '(201) 348-0200', '(201) 510-0442', '2014 Bergenline Ave, Union City, NJ 07087', NULL, NULL, 'DOES NOT ACCEPT AMERIGROUP NJ Community Plan
3363 John F. Kennedy Blvd, 1st Floor, Jersey City, NJ 07307
Website: https://topchoicept.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Hudson Premier Physical Therapy & Sports', '(877) 576-4681, 201-766-1728', '888-503-1237', '4800 Broadway Suite 212, Union City, NJ 07087', NULL, NULL, '(DOES NOT ACCEPT AMERIGROUP = does not accept HNJH-HorizonTotal Care) - Sandra Gail
26 Journal Square Suite 500, Jersey City, NJ 07306
Website: https://hudson-pt.com/', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Align Care Physical Therapy (Nicky Shah, PT)', '706-615-7539', '201-623-2933', NULL, NULL, NULL, '( All insurances, and only physical therapy at home)
E-mail: 1aligncarept@gmail.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Physical Therapy', 'Attain Physical Therapy', '(855) 428-8246', NULL, '1275 Bloomfield Avenue: Building 8 / Unit 60 - Fairfield, NJ 07004', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'PAX Health', '(800) 413-8020', '(732) 479-6751', '165 Passaic Ave. Suite 100, Fairfield NJ, 07004', NULL, 'www.Paxhealth.net', 'Takes all insurances - English and Spanish speaking - Telemedicine consults available', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Dr. Yissell Delvalle', '(201) 864-4897', '(201) 864-4871', '6000 Washington St. West New York, NJ 07093', NULL, NULL, 'Speaks spanish', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Dr. Aykut Ozden', '(201) 220-5866', '(646) 518-9294', '725 River Rd, #118, Edgewater, NJ 07020', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Hamilton Behavioral Health', '(201) 490-5158', '(201) 696-3955', '300 Forest Ave, Paramus, NJ 07653', 'Hamiltonbehavioralappointment@gmail.com', 'https://hamiltonbehavioralrtms.com', 'Telemedicine consults available', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Wellbrook Health', '(201) 822-1161', '(877) 485-8918', '550 Broad St, Ste 606. Newark NJ 07102', 'contact@mywellbrook.com', 'www.mywellbrook.com', 'Takes all insurances, English/Spanish, Telehealth or In-Person
Hours: Monday–Friday 9am–6pm (Weekend/evening appointments available by request)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Happier Living', '(856) 818-4020', NULL, NULL, 'contact@myreservoirhealth.com', 'https://myreservoirhealth.com', 'Telemedicine available- English and spanish
Aetna, BCBS, Cigna, Humana, Optum, United Healthcare PPO plans Cigna, Humana, Optum, United Healthcare HMO plans Medicare ( not accept Medicaid)
Dr. Cohen-Weisinger ( Spanish speaking)
The link for appointment request is: www.happierliving.com
Reservoir Behavioral Health
Telemedicine only – speaks English, Spanish, Chinese or Turkish. (Alexia Totoro Psychotherapist)
Horizon (including NJ Health), Amerigroup, Wellcare, Aetna, UHC, and Medicaid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Freeway Psychiatry', '(973) 559-2122', '973-327-7181', '9225 John F Kennedy Blvd, North Bergen NJ 07047', NULL, NULL, 'Takes all insurances', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Grace Medical Care', '201-253-0994, 201-253-0993', '201-253-0995', '422 Grand St (Unit 9-10) , Hoboken NJ 07030', NULL, 'https://gracemedicalhealth.com/appointment-request', 'Takes all insurances', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Dr. Mercedes Rudelli, MD', '(201) 453-8886', NULL, '230 60th St, West New York, NJ 07093', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Dr Oscar E Sandoval Castellanos', '201-866-6970', '201-866-7144', '569 35th St 1st Floor Union City NJ 07087', NULL, NULL, '(Not currently accepting new patients)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Dr. Miriam Levine (Child & Adolescent Psychiatry)', '201-792-8200', NULL, '122 Clinton St. Hoboken, NJ 07030', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Bridgeway Crisis intervention services (Same day evaluation)', '201-885-2539', NULL, '506 3rd St, Hoboken, NJ 07030', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Dr. Arturo Luis Marrero-Figarella', '(201) 210-8218', NULL, '810 Abbott Blvd Ste 204, Fort Lee, NJ 07024', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Everest Wellness & Behavioral Services', '(201) 374-7881', '(201) 502-9310', '111 Town Square Pl Ste 1238, Jersey City, NJ 07310', 'info@everestwellnessllc.com', NULL, 'Web: Everest Wellness (everestwellnessllc.com)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychiatry', 'Alma -Manita Shrestha', '201-848-5200', NULL, 'Primary Campus: 301 Sicomac Ave.Wyckoff, NJ 07481 (Multiple Locations)', NULL, 'https://www.christianhealthnj.org', 'Individual therapy Medication management
Manita Shrestha, NP - Alma (helloalma.com)
For Questions: info@helloalma.com
Christian Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'Caridad E Garciga , LPC', '(201) 943-2726', NULL, '605 Anderson Ave, Cliffside Park, NJ 07010', NULL, NULL, 'English and Spanish Speaking', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'D’Amor Mental Health Center - Anay Vazquez', '(201) 908-7700', NULL, '415 60th St, West New York, NJ 07093', NULL, NULL, 'English and Spanish Speaking', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'PAX Health', '1-800-413-8020', NULL, NULL, NULL, 'www.Paxhealth.net', 'Telemedicine available - Takes all insurances - English and Spanish speaking', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'Hamilton Behavioral Health', '(201) 490-5158', '(201) 696-3955', '300 Forest Ave, Paramus, NJ 07653', 'Hamiltonbehavioralappointment@gmail.com', 'https://hamiltonbehavioralrtms.com', 'Telemedicine available', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'Wellbrook Health', '(201) 822-1161', '(877) 485-8918', '550 Broad St, Ste 606. Newark NJ 07102', 'contact@mywellbrook.com', NULL, 'Takes all insurances, English/Spanish, Telehealth or In-Person', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'Happier Living', '(856) 818-4020', NULL, NULL, 'contact@myreservoirhealth.com', NULL, 'Telemedicine available - Not accept Medicaid - English and spanish
Dr. Cohen-Weisinger ( Spanish speaking)
The link for appointment request is: www.happierliving.com
Reservoir Behavioral Health
Telemedicine only – speaks English, Spanish, Chinese or Turkish. (Alexia Totoro Psychotherapist)
Horizon (including NJ Health), Amerigroup, Wellcare, Aetna, UHC, and Medicaid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Psychology (Therapy)', 'Freeway Psychiatry', '(973) 559-2122', '973-327-7181', '9225 John F Kennedy Blvd, North Bergen NJ 07047', NULL, NULL, 'Takes all insurances', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Podiatry', 'Dr. Jonathan Purisima', '(201) 766-6501', '(201) 863-0741', '1005 New York Ave, Union City, NJ 07087', NULL, NULL, 'NPIa #: 1508003534', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Podiatry', 'Dr. Sandy Amador, Jose Grullon Dpm', '(201) 662-8700', '(201) 453-8075', '6301 John F. Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Podiatry', 'Dr. Christopher Samaniego', '201-770-9995', '201-770-9996', '433 60th St. West New York, NJ 07093', NULL, 'www.advancedmedicalgroupnj.com', 'Also sees pediatric patients
550 Newark Ave. Ste 304 Jersey City, NJ 07306
Phone: 201-624-2111 Fax: 888-571-6091', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Podiatry', 'Dr. Lenny Ramirez', '201-864-6860', '201-869-2925', '540 37th St, Union City, NJ 07087', NULL, NULL, 'Does not take Aetna Medicaid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Podiatry', 'Dr. Demetrios Econopouly', '(201) 863-3055', '201-863-5744', '9226 John F. Kennedy Blvd, North Bergen, NJ 070477', NULL, 'https://www.palisadesfootandankle.com/', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pulmonology', 'Dr. Victor Gorloff / Dr. Richard May / Dr. Harris B. Tesher / Dr. Theophanis Pavlou (Sleep Med)', '(201) 854-7200', '201-854-0827', '8305A Bergenline Ave, North Bergen, NJ 07047', NULL, 'www.njlung.com', 'Not in Network with UHC- Community Plan and Dual Complete
Holy Name - Pulmonary Specialists of North Jersey
200 Grand Avenue Suite 102, Englewood, NJ 07631
Phone: 201-871-3636 Fax: 201-871-2286', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pulmonology', 'Dr. Jose Gomez Marquez / Dr. Brian A Benoff', '201-871-8366', '201-871-8356', '180 N Dean St, Englewood, NJ 07631', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pulmonology', 'Dr. Richard Periut', '(201) 440-2222', '201-440-2282', '5809 Kennedy Blvd. West New York, NJ 07093', NULL, NULL, 'Group ID HNJH# 60064461', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pulmonology', 'Dr. Jose Pinal', '(201) 325-9393', '201-821-8755', '526 42nd St, Union City, NJ 07087', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr. Alexandru F Kimel / Dr. Neil J. Gonter/ Dr. Dewan Fahima', '201-837-7788', '201-837-2077', '1415 Queen Anne Rd, Teaneck, NJ 07666', NULL, NULL, 'Not in network with HBCBS Direct Access, Aetna ( Medicaid),
Rheumatology Associates of North Jersey - (njarthritis.com)- njarthritis@yahoo.com
3196 John F. Kennedy Blvd Union City, NJ 07087', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr. Jessica Hoey', '201-567-2050', NULL, NULL, NULL, NULL, 'Englewood Hospital
180 Engle Street , Englewood NJ 07631 Phone: 201-567-2050 Fax 201-568-8936
1 North Washington Ave, Bergenfield, NJ 07621 Phone:201-501-0082 Fax 201-501-8859
695 Anderson Ave Suite 2012 Cliffside Park, NJ 07010 Phone: 551-234-3040 Fax: 551-234-3034', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr. Arsany Anis', '(732) 382-8000', '(732) 339-3047', '1 Exchange Place, Jersey City, NJ 07302', NULL, NULL, '201 Route 17 North, Floor 11, Rutherford, NJ 07070', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr. Dominic Maiello', '(201) 798-7200', '201-798-3582', '3 Webster Ave Jersey City, NJ 07307', NULL, NULL, '10 Huron Ave #1L, Jersey City, NJ 07306', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr. Richard Andron', '201-871-1515', '201-871-9683', '106 Grand Ave Suite 450, Englewood, NJ 07631', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr. Carl Restivo', '(201)798-2900', '(201) 798-3582', '3 Webster Ave. Jersey City, NJ 07307', NULL, NULL, 'Takes HNJH, WELLCARE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Rheumatology', 'Dr Sushama Mody / Dr Michael Guma', '201-988-2800', '201-988-0800', '1425 Bloomfield St., Hoboken, NJ 07030', NULL, NULL, 'Riverside Medical Group
432 Broadway, Bayonne, NJ 07002
312 Belleville Turnpike, North Arlington NJ, 07031
201 Route 17 North, Suite 1202 Rutherford, NJ 07070', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (General)', 'Dr. Igor Kofman / Dr. German Costa / Dr. Javier Gomez', '(201) 795-9080', '201-795-9434', '3196 Kennedy Blvd Ste 2, Union City, NJ 07087', NULL, 'https://www.surgicalspecialistsofnorthjersey.com/', 'Holy Name - Surgical Specialists of North Jersey
718 Teaneck Road, Teaneck, NJ 07666', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (General)', 'Dr. Ravikumar Brahmbhatt', '844-211-2273', NULL, '142 Palisade Ave. Suite 108, Jersey City, NJ', NULL, NULL, '1 Journal Square Plaza, Jersey City, NJ', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Breast)', 'Dr. Violet Merle McIntosh, Dr. Jennifer Marti, Dr. Jenna Gillen, Dr. Rachelle Leong', '(201) 894-3640; (201) 894-3893', NULL, '350 Engle St #4503, Englewood, NJ 07631', NULL, NULL, 'Englewood Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Breast)', 'Dr. Adriana Suarez-Ligon, Dr. Ann Chuang, Dr. Camille Swain', '(877) 245-1789', '(732) 201-5539', '7650 River Rd., Suite 240, North Bergen, NJ 07047', NULL, NULL, 'Premier Surgical Network
260 Old Hook Rd Suite 304, Westwood, NJ 07675
377 Jersey Ave, Ste 220, Jersey City, NJ 07302
(973) 547-1641 (201) 778-9181', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Breast)', 'Dr. Darren Sachs', '732-390-7750', '201-201-7234', '1829 Hudson Park, Edgewater NJ 07020', NULL, NULL, 'Astera Cancer Care
1 Exchange Place, Jersey City NJ 07302', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Bariatric)', 'Dr. Omar Bellorin Marin, MD (Bariatric/Gen Surgery)', '(201) 833-3444', '(201) 808-9430', '718 Teaneck Rd. Teaneck, NJ 07666', NULL, NULL, 'Holy Name, Speaks Spanish', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Bariatric)', 'Dr. Stefanie Vaimakis (Bariatric Surgery)', '(201) 530-1900', '(201) 530-9300', '222 Cedar Ln Teaneck, NJ 07666', NULL, 'www.stefanievaimakismd.com', 'NO Medicaid Insurances. Example: HNJH, Aetna Better Health, UHC Community Plan, Wellcare
55 Meadowlands Pkwy Secaucus, NJ 07094', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Bariatric)', 'Dr. Prakash Paragi (Bariatric Surgery)', '844-211-2273, (862) 520-5090', '(862) 520-5097', '393 Northfield Ave. West Orange, NJ', NULL, NULL, 'Takes HORIZON NJ HEALTH
142 Palisade Ave, Suite 202, Jersey City, NJ
330 Grand St. Hoboken, NJ
744 Broadway, Bayonne, NJ
38 Meadowlands Pkwy, Secaucus, NJ
NPI: 1891079893', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Bariatric)', 'Dr. Saniea F. Majid (Bariatric Surgery)', '973-888-1085', NULL, '6 Brighton Road, Suite 106 Clifton, NJ 07012', NULL, NULL, 'Takes ALL insurances
Weight Loss & Wellness Center', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Colorectal)', 'Dr. Anna Serur', '201-608-2800', '201-608-2478', '350 Engle Street 6th Floor, Suite 6501, Berrie Center, Englewood, NJ 07631', NULL, NULL, 'Englewood Health', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Colorectal)', 'Dr. Christina Seo', '201-567-7615', '201-567-8033', '216 Engle Street Suite 203, Englewood, NJ 07631', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Colorectal)', 'Dr. Marco Bertucci-Zocalli, Dr. Beatrice Dionigi, Dr. Ravi Pakala Kiran, Dr. Benjamin Kuritzkes', '844-211-2273', NULL, '330 Grand St. Suite 100, Hoboken, NJ', NULL, NULL, 'Columbia University Medical Center Colorectal Disease & Surgery', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Endocrine)', 'Dr. Anna Kundel (Endocrine Surgery)', '201-389-1285', '201-445-4195', '1200 East Ridgewood Ave. Ridgewood, NJ 07450', NULL, NULL, 'Valley Hospital', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Endocrine)', 'Dr. Rachel Liou (Endocrine Surgery)', '844-211-2273', NULL, '308 Willow Ave. Hoboken, NJ', NULL, NULL, 'Columbia UMC, Carepoint
142 Palisade Ave, Suite 115, Jersey City, NJ', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Endocrine)', 'Ki Won Kim, MD (Endocrine Surgery)', '201-608-2848', '201-894-0093', '25 Rockwood Place #200 Englewood, NJ 07631 | 910 Sylvan Ave #110 Englewood Cliffs NJ', NULL, NULL, 'Director of Endocrine Surgery at Englewood Hosp', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Neurosurgery)', 'North Jersey Brain & Spine Center (Neurosurgery)', '(201) 342-2550', '(201) 342-7171', '20 Prospect Ave, Ste. 907, Hackensack NJ 07601', NULL, NULL, 'ACCEPTS UHC COMMERCIAL PLAN W OUT NETWORK BENEFITS', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Neurosurgery)', 'Dr. Eleonora Spinazzi (Neurosurgery)', '(201) 833-7208', '(201) 379-5708', '718 Teaneck Road, Teaneck, NJ 07666', NULL, NULL, 'Columbia Neurosurgery – at Holy Name
Languages Spoken: English, Italian and Spanish', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Neurosurgery)', 'Dr. Michael Arginteanu (Neurosurgery)', '(201) 569-7737', '(201) 373-2041', '309 Engle Street, First Floor, Englewood, New Jersey 07631', 'info@mnamd.com', 'https://marcarginteanumd.com/', 'NO Medicare Advantage plans or any Medicaid plans.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Neurosurgery)', 'NEUROSURGERY FOR HNJH (REC TO RWJ UNIVERSITY HOSP NEWARK,NJ)', NULL, NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Oral)', 'Dr. Nathan A Wuebbels, DMD, MD', '201-867-0404', '201-868-2499', '7322 Bergenline Avenue, North Bergen, NJ 07047', 'northbergen@njoralsurgery.com', 'https://www.njoralsurgery.com/', 'NJ Oral Surgery
605 Broad Avenue, Ridgefield, NJ 07657
Phone: 201-941-9494 Fax:201-941-1246
Email: ridgefield@njoralsurgery.com
16 Johnson Avenue, Hackensack, NJ 07601
Phone: 201-342-7353 Fax:201-342-7982
Email: hackensack@njoralsurgery.com', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Oral)', 'Dr. Juan C Alonso', '201-854-7900', '201-854-7885', '8321 John F Kennedy Blvd, North Bergen, NJ 07047', NULL, 'https://www.northhudsonoralsurgery.com/', 'North Hudson Oral Surgery', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Dr. Victor Ortiz', '844-777-0910', '201-560-0712', '9226 John F. Kennedy Blvd, North Bergen, NJ 07047', NULL, NULL, 'Kayal Orthopedics —- Spanish Speaking
Takes ALL insurances except Medicaid
Karina (scheduling coordinator) Fax:(201)425-1657', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Dr. Howard M Baruch', '201-770-1600', '(201) 862-0095', '111 Galway Place, Suite 300, Teaneck, NJ 07666', NULL, NULL, 'TAKES HNJH
Premier Orthopaedics & Sports Medicine
403 Grand Avenue, Englewood, NJ 07631
663 Palisade Avenue, Suite 302, Cliffside Park, NJ 07010
3196 John F Kennedy Boulevard, 3rd Floor, Union City, NJ 07087
230 East Ridgewood Avenue, Bergen Regional Medical Center, Suite 127, Paramus, NJ 07652
1255 Broad Street, Bloomfield, NJ 07003
ALL LOCATIONS', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Hudson Pro Orthopedics & Sports Medicine', '(201) 308-6622/ 646-650-2229', '(201) 308-6623', '1320 Adams St. Suite D. Hoboken NJ 07030', 'frontdesk@hudsonproortho.com', NULL, 'Dr. Imran Ashraf (Orthopedic)
Dr. Roman Isaac (Hand/Upper Extremity Surgeon)
NO Wellcare, NO HORIZON NJ HEALTH, HBCB EPO NOT ACCEPTED
Office Contact: Camille, email facesheet, referral, imaging, clinical notes', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Grau Orthopedics - Dr. Luis Grau', '551-236-6867', '833-428-0623', NULL, NULL, 'www.grauortho.com', '12 Location - Bayonne, Jersey City, Edgewater, North Arlington, Hackensack etc.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Dr. James Hale / Dr. Jeffrey Steuer / Dr. Brian Bauer / Dr. John Katona', '201-836-5332', '201-836-4002', '222 Cedar Lane, Suite 120 Teaneck, NJ 07666', 'easternortho@easternorthopedics.com', 'https://www.easternorthopedics.com/', 'Holy Name - Eastern Orthopedic Associates - Phillip Rose PA', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Dr. Asit K Shah', '201-569-2770', '201-569-1774', '401 S Van Brunt St Englewood, NJ 07631', NULL, NULL, 'Englewood Orthopedic Associates', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Orthopedic)', 'Dr. Christine M Corradino', '1-844-300-4677', '(201) 392-3571', '55 Meadowlands Parkway, 3rd Floor, Secaucus, NJ 07094', 'billdeiasi13@gmail.com', 'https://www.hopsinstitute.com/', 'Hudson Orthopedic Pain & Spine (HOPS)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Plastic)', 'Dr. Brad M Gandolfi (Plastic Surgeon)', '212-287-7211', '212-287-7210', '1566 Lemoine Ave, Fort Lee, NJ 07024', 'info@drgandolfi.com', 'www.drgandolfi.com', '30 N Dean St. Englewood, NJ 07631
905 5th Ave, New York, NY 10021', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Plastic)', 'Dr. Suri Babu Ponamgi (Plastic Surgeon)', '(201) 224-8831', NULL, '7650 River Road, Ste 230, North Bergen, NJ 07047', NULL, NULL, 'Accepts Medicaid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Plastic)', 'Dr. Silvio Podda (Plastic Surgeon, Reconstructive, Craniofacial)', '(973) 754-2413', '(973) 754-2622', '703 Main St, Paterson, NJ 07503', NULL, NULL, 'Speaks English, French, Italian, Portuguese, Spanish', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Plastic)', 'Dr. Michael Baruch (Plastic Surgeon)', '(973) 773-1973', '(201) 862-0095', '1037 US-46 #103, Clifton, NJ 07013', NULL, NULL, '(Englewood Office) // (973) 773-4824', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Plastic)', 'Dr. Renata Weber (Plastic Surgeon Hand)', '(201) 549-8860', '(201) 549-8861', '777 Passaic Ave, Suite 575 (5th Floor), Clifton, NJ 07012', NULL, 'www.mdsnjny.com/renata-weber--md', 'Takes HNJH (Needs manually referral)
NPI: 1790855815', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Misc)', 'Dr. Andrew De La Torre (Hepatobiliary Surgery)', '844-211-2273, 201-420-7903', NULL, '330 Grand St. Hoboken, NJ', NULL, NULL, 'Carepoint
654 Broadway, Bayonne, NJ', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Misc)', 'Dr. Maria Schiavone (Gyn Oncology/Surgery)', '201-227-6200', '201-227-6209', '718 Teaneck Rd. Teaneck, NJ 07666', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Misc)', 'Dr. Erika Brinkmann (Breast Oncology/Surgery)', '201-833-3357', '201-541-5972', '718 Teaneck Rd. Teaneck, NJ 07666', NULL, NULL, 'Holy Name', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Surgery (Misc)', 'Dr. Andrea Vidali (Endometriosis/Infertility Surgeon)', '844-211-2273, 201-418-2693', NULL, '308 Willow Ave. Hoboken, NJ', NULL, NULL, 'Carepoint', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. Michael Nazmy / Dr. Chester Lee / Dr. Richard Lee', '201-569-7777', '201-569-6861', '177 North Dean St. South Tower, Suite 305, Englewood, NJ 07631', NULL, 'https://www.urologicspecialties.com/', 'Holy Name - Urologic Specialties - Does NOT accept Horizon NJ total care', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. Sergey Rome', '201-489-8900', '201-489-8900', '277 Forest Ave Suites 102 & 206, Paramus, NJ 07652', NULL, NULL, 'Languages: English, Russian, Spanish', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. Debra Fromer', '551-996-8090, 201-336-8090', '551-996-8221', '360 Essex St Suite 403 Hackensack, NJ 07601', NULL, NULL, 'HMH Medical Group | Urology', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. John Hosay', '(201) 433-9666', '(201) 433-3969', '2555 John F. Kennedy Blvd, Jersey City, NJ 07304', NULL, NULL, 'Sovereign Medical Group', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. Joel Abramowitz', '(201) 656-4104', '201-656-9178', '8100 John F. Kennedy Blvd, North Bergen, NJ 07047( Not appt available at this moment)', NULL, NULL, 'Sovereign Medical Group
142 Palisade Ave, #101, Jersey City, NJ 07306', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. Elliot Shulman', '201-433-1057', '(201) 435-2716', '2255 John F. Kennedy Blvd, Jersey City, NJ 07304', NULL, NULL, 'Sovereign Medical Group
807 John F. Kennedy Blvd., Bayonne, NJ 07002
Phone: 201-339-5799 - 201-339-5799', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Urology', 'Dr. Eric Seaman (MALE FERTILITY)', '973-253-4256', NULL, '25 Millburn Avenue, Building C - Suite 304, Millburn, NJ 07041', NULL, NULL, 'Including Vascetomies
Phone (appointments): 973-253-4256 | Phone (general inquiries): (973) 218-9400
16 Pocono Rd, #114, Denville, NJ 07834
Phone (appointments): 973-327-7457 | Phone (general inquiries): (973) 586-3056', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Uro-gynecology', 'Dr. Diana Hearn', '201-833-3360', '201-833-7123', '222 Cedar Lane Suite 103, Teaneck, NJ 07666', NULL, NULL, 'Holy Name Physicians', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Vascular', 'Dr. Gregory Ruth (VEIN CENTER)', '1-855-565-8346', '240-473-4322', NULL, NULL, 'https://www.centerforvein.com/our-clinics/doctors/shubha-varma-md', 'No longer taking HNJH Medicaid/ UHC Advatage
Center for Vein Restoration - Only lower extremity veins
8901 Kennedy Boulevard Ste 855-565-8346 3E, North Bergen, NJ 07047
NPI #1437220795', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Vascular', 'Dr Peter E Kagan (Vascular Surgery)', '201-227-6222', '201-227-6090', '101 Prospect Ave Hackensack, NJ 07601', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Vascular', 'THOMAS R. BERNIK, MD (Vascular Surgery)', '(201) 894-3689', '(201) 541-2965', '350 Engle St 2 East, Englewood, NJ 07631', NULL, NULL, 'NAKUL NIRANJAN RAO M.D (Vascular Surgery)
STEVEN ELIAS, MD (Venous and Lymphatic Medicine)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Vascular', 'Interventional Radiology', '201-227-6210', '201-541-5910', '718 Teaneck Road Interventional Institute', NULL, NULL, 'Kevin Herman, MD (Interventional oncology and venous disease)
Teaneck, NJ 07666', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Enoble Care - FOR HOME VISITS', '201-822-9549', NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Hudson County Chest Clinic (TB Clinc)', '(201) 915-1042', '(201) 915-1012', 'County Plaza – 257 Cornelison Avenue Jersey City, NJ 07302', NULL, NULL, '7AM to 4PM Adult Services – Monday, Tuesday, Wednesday & Friday', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'New Jersey State Department: Surveillance (HIV)', '609-610-9489', NULL, NULL, 'evelyn.jerez@don.nj.gov', NULL, 'Evelyn Jerez
609-530-7981', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'New Jersey State Department: Surveillance (Syphilis)', '609-433-8846', '609-826-4870', NULL, NULL, NULL, 'Emilia Hammerman', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Insurance Broker', '201-552-1579', NULL, NULL, NULL, NULL, 'Maria Guillen Hurtado
Office: 833-997-5267', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Domestic Violence Hotline', '201-944-9600 / 201-498-9247', NULL, '12 Overlook Ave, Rochelle Park, NJ 07662', NULL, NULL, 'Center for Hope & Safety', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Women Rising', '(201) 333-5700', NULL, '270 Fairmount Ave, Jersey City, NJ 07306', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Severe Behavior Program', '+1 973-436-4704', '+1 973-436-4714', 'Address: 66 Moore St Hackensack NJ 07601', 'intake@fourcorners.services', NULL, 'Four Corners Community Services
Address: 37B Wall St Oxford NJ 07863
Email: admin@fourcorners.services', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Self Pay Options', '(201) 867-9002', '(201) 867-2004', '415 43rd St.', NULL, NULL, 'Imaging Centers
Diagnostic Medical Imaging
Union City, NJ 07087
709 Newark Ave
Jersey City, NJ 07306', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous', 'Transportation', '(973) 491-4224', '(973) 863-4522', NULL, NULL, NULL, 'ACCESS LINK (973) 491-4224', CURRENT_TIMESTAMP);
