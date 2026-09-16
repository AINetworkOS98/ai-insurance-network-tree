-- เกณฑ์มาตรฐานฝ่าย 19 ไทยประกันชีวิต ไตรมาส 2569 (COM + COM PLUS, รายไตรมาส)
-- ตัวแทน 3,000 / ผบ.หน่วย 7,500 (แก้สตาร์ 10,000) / ผบ.ศูนย์ 30,000 + เงื่อนไข 3 หน่วย
-- เตือน 1 รอบก่อน (allowedFailCycles=2), ผ่อนผันสมาชิกใหม่ 3 เดือน, ไม่ผ่านซ้ำ = removed (ดีดออกอัตโนมัติ)
-- Active เฉพาะเมื่อยังไม่มีแผน Active อื่น (กันชนเกณฑ์)

-- แผนหลัก (id คงที่เพื่อให้รันซ้ำได้)
INSERT INTO "MaintenancePlan" ("id","name","kind","metric","status","cycle","graceMonths","allowedFailCycles","warnDaysBefore","isLegacyRef","createdAt","updatedAt")
VALUES ('11111111-1111-4111-8111-111111111111','เกณฑ์มาตรฐานฝ่าย 19 ไทยประกันชีวิต ไตรมาส 2569','quarterly','commission','Draft','quarterly',3,2,ARRAY[7,3,1],false,NOW(),NOW())
ON CONFLICT ("id") DO UPDATE SET "updatedAt"=NOW();

-- กฎรายตำแหน่ง (id คงที่)
INSERT INTO "MaintenanceRule" ("id","planId","targetRank","minAmount","resultType","label","createdAt")
VALUES
('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',1,3000,'removed','ตัวแทน — ป้องกันสตาร์ 3,000 / แก้สตาร์ 3,000 (COM+COM PLUS)',NOW()),
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',2,7500,'removed','ผบ.หน่วย — ป้องกันสตาร์ 7,500 / แก้สตาร์ 10,000 (COM+COM PLUS)',NOW()),
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',3,30000,'removed','ผบ.ศูนย์ — ป้องกัน/แก้สตาร์ 30,000 + บุคลากรในสังกัด 3 หน่วย (COM+COM PLUS)',NOW())
ON CONFLICT ("id") DO NOTHING;

-- เปิด Active อัตโนมัติเฉพาะเมื่อยังไม่มีแผน Active (เกณฑ์มาตรฐานมีผลทันทีหลัง migrate)
UPDATE "MaintenancePlan"
SET "status"='Active', "updatedAt"=NOW()
WHERE "id"='11111111-1111-4111-8111-111111111111'
AND NOT EXISTS (SELECT 1 FROM "MaintenancePlan" WHERE "status"='Active' AND "id"<>'11111111-1111-4111-8111-111111111111');
