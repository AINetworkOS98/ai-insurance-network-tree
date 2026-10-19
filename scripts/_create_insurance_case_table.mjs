// สร้างตาราง insurance_cases (ถ้ายังไม่มี) — idempotent, ปลอดภัยต่อการรันซ้ำ
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('NO DATABASE_URL'); process.exit(1); }

const sql = `
CREATE TABLE IF NOT EXISTS "insurance_cases" (
    "id" UUID NOT NULL,
    "caseNo" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "agentUserId" UUID,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCat" TEXT NOT NULL,
    "riders" JSONB,
    "gender" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "cover" INTEGER NOT NULL,
    "payYears" INTEGER NOT NULL,
    "nameMasked" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    CONSTRAINT "insurance_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_cases_caseNo_key" ON "insurance_cases"("caseNo");
CREATE INDEX IF NOT EXISTS "insurance_cases_agentCode_idx" ON "insurance_cases"("agentCode");
CREATE INDEX IF NOT EXISTS "insurance_cases_createdAt_idx" ON "insurance_cases"("createdAt");
`;

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(sql);
const r = await c.query(`select count(*)::int as n from information_schema.columns where table_name='insurance_cases'`);
console.log('insurance_cases columns =', r.rows[0].n);
await c.end();
