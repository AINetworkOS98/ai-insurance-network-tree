/**
 * ชั้นเชื่อม Postgres แบบเบา (ใช้ไดรเวอร์ pg ตรง ๆ)
 *
 * ทำไมต้องมี: @prisma/client พ่วง query engine ที่กินแรมมาก เมื่อ route bundle โหลด Prisma
 * บนโฮสต์แรมจำกัด (Hostinger Cloud Startup) ทำให้ worker ถูก kill กลางคำขอ → proxy ตอบ 504
 * (เจอจริงกับ /auth/callback) — เส้นทางล็อกอินจึงใช้ตัวนี้แทน เพื่อให้ bundle ไม่มี Prisma เลย
 *
 * ใช้เฉพาะที่จำเป็น (เส้นทาง auth) — ส่วนอื่นของแอปยังใช้ Prisma ตามเดิม
 * รายชื่อคอลัมน์อ้างจาก prisma/schema.prisma (ชื่อตารางเป็น PascalCase, คอลัมน์ camelCase → ต้อง quote)
 */
type Pool = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

let pool: Pool | null = null;

function connectionString() {
  const raw = process.env.DATABASE_URL || '';
  // ตัด sslmode ออกแล้วคุมด้วย ssl option เอง (Supavisor ใช้ cert ที่ Node ไม่รู้จัก)
  return raw.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');
}

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const mod: any = await import('pg');
  const Pool = mod.Pool || mod.default?.Pool;
  pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 }) as Pool;
  return pool;
}

/** query  → คืน rows */
export async function sql<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const p = await getPool();
  const r = await p.query(text, params);
  return (r.rows || []) as T[];
}

/** query แถวเดียว (หรือ null) */
export async function sqlOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows.length ? rows[0] : null;
}

/** insert/update/delete → คืนจำนวนแถวที่ถูกกระทำ */
export async function sqlRun(text: string, params: any[] = []): Promise<number> {
  const p = await getPool();
  const r: any = await p.query(text, params);
  return r.rowCount ?? 0;
}
