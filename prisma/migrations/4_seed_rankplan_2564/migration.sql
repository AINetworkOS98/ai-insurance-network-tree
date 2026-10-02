-- เกณฑ์เลื่อนตำแหน่ง ไทยประกันชีวิต (อ้างอิงโครงสร้างรายได้ update 15 Jan 64)
-- ตัวแทน: ขอ code + สอบใบอนุญาต / ผบ.หน่วย: บำเหน็จ 20,000 เวลา 1-6 เดือน
-- ผบ.ศูนย์: 75,000 เวลา 3-6 เดือน แยกหน่วย 2 / ผบ.ภาค: 1,200,000 เวลา 12-24 เดือน แยกศูนย์ 4
-- metric commission (COM+COM PLUS), หน่วยนับจากผัง 1 แตก 5 จริง
-- Active เฉพาะเมื่อยังไม่มีแผน Active อื่น

INSERT INTO "RankPlan" ("id","name","version","status","sourceRef","isLegacyRef","createdAt","updatedAt")
VALUES ('55555555-5555-4555-8555-555555555555','เกณฑ์เลื่อนตำแหน่ง ไทยประกันชีวิต (โครงสร้างรายได้ 15 Jan 64)','comp-15jan64-thailife','Draft','โครงสร้างรายได้ ไทยประกันชีวิต update 15 Jan 64',true,NOW(),NOW())
ON CONFLICT ("id") DO UPDATE SET "updatedAt"=NOW();

INSERT INTO "RankRule" ("id","planId","targetRank","metric","personalMin","teamMin","qualifiedUnits","qualifiedCenters","durationMinMonths","durationMaxMonths","licenseRequired","evalType","description","createdAt")
VALUES
('66666666-6666-4666-8666-666666666661','55555555-5555-4555-8555-555555555555',1,'commission',NULL,NULL,NULL,NULL,NULL,NULL,true,'approval','ตัวแทน: ขอ code + สอบใบอนุญาตตัวแทนประกันชีวิต — รายได้ค่าบำเหน็จ+ค่าพาหนะตามตารางผลิตภัณฑ์',NOW()),
('66666666-6666-4666-8666-666666666662','55555555-5555-4555-8555-555555555555',2,'commission',20000,NULL,NULL,NULL,1,6,false,'auto','ผบ.หน่วย: บำเหน็จ 20,000 บาท เวลา 1-6 เดือน',NOW()),
('66666666-6666-4666-8666-666666666663','55555555-5555-4555-8555-555555555555',3,'commission',75000,NULL,2,NULL,3,6,false,'auto','ผบ.ศูนย์: บำเหน็จ 75,000 บาท เวลา 3-6 เดือน แยกหน่วย 2 หน่วย',NOW()),
('66666666-6666-4666-8666-666666666664','55555555-5555-4555-8555-555555555555',4,'commission',1200000,NULL,NULL,4,12,24,false,'auto','ผบ.ภาค: บำเหน็จ 1,200,000 บาท เวลา 12-24 เดือน แยกศูนย์ 4 ศูนย์',NOW())
ON CONFLICT ("planId","targetRank","metric") DO UPDATE SET
  "personalMin"=EXCLUDED."personalMin", "qualifiedUnits"=EXCLUDED."qualifiedUnits",
  "qualifiedCenters"=EXCLUDED."qualifiedCenters", "durationMinMonths"=EXCLUDED."durationMinMonths",
  "durationMaxMonths"=EXCLUDED."durationMaxMonths", "licenseRequired"=EXCLUDED."licenseRequired",
  "evalType"=EXCLUDED."evalType", "description"=EXCLUDED."description";

UPDATE "RankPlan"
SET "status"='Active', "updatedAt"=NOW()
WHERE "id"='55555555-5555-4555-8555-555555555555'
AND NOT EXISTS (SELECT 1 FROM "RankPlan" WHERE "status"='Active' AND "id"<>'55555555-5555-4555-8555-555555555555');
