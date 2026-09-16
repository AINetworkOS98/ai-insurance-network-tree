-- ที่เก็บค่าตั้งค่าใบเสร็จ (admin เท่านั้นที่เปลี่ยนผ่านเมนู)
CREATE TABLE IF NOT EXISTS "ReceiptSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "settings" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "ReceiptSettings" ("id","settings")
VALUES ('default','{"maxAmount":500000,"autoVerifyLimit":0,"requirePolicyNo":false,"defaultLedgerType":"premium","allowedTypes":["premium","commission"]}')
ON CONFLICT ("id") DO NOTHING;
