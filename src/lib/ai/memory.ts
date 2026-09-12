// src/lib/ai/memory.ts — Persistent Memory แบบ Hermes
// per-user memory ที่อยู่ข้าม session, โหลดเฉพาะเมื่อเกี่ยวข้อง
export type MemoryEntry = {
  id: string;
  userId: string;
  kind: "preference" | "fact" | "skill" | "summary";
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

const memStore = new Map<string, MemoryEntry[]>();
function memKey(userId: string){ return userId || "guest"; }

export async function getMemories(userId: string): Promise<MemoryEntry[]> {
  const key = memKey(userId);
  try {
    const { prisma } = await import("@/lib/prisma");
    // @ts-ignore optional AIMemory
    if ((prisma as any).aIMemory) {
      const rows: any[] = await (prisma as any).aIMemory.findMany({ where:{ userId:key }, orderBy:{ updatedAt:"desc" }, take:50 });
      if (rows?.length) return rows.map((r:any)=> ({ id:r.id, userId:r.userId, kind:r.kind, key:r.key, value:r.value, createdAt:r.createdAt?.toISOString?.()??new Date().toISOString(), updatedAt:r.updatedAt?.toISOString?.()??new Date().toISOString() }));
    }
  } catch {}
  return memStore.get(key) ?? [];
}

export async function saveMemory(userId: string, kind: MemoryEntry["kind"], key: string, value: string): Promise<MemoryEntry> {
  const uid = memKey(userId);
  const now = new Date().toISOString();
  const entry: MemoryEntry = { id: `${uid}-${key}-${Date.now()}`, userId:uid, kind, key, value:value.slice(0,4000), createdAt:now, updatedAt:now };
  try {
    const { prisma } = await import("@/lib/prisma");
    // @ts-ignore
    if ((prisma as any).aIMemory) {
      const r:any = await (prisma as any).aIMemory.upsert({
        where:{ userId_key:{ userId:uid, key } } as any,
        create:{ userId:uid, kind, key, value:entry.value },
        update:{ kind, value:entry.value },
      }).catch(async ()=> await (prisma as any).aIMemory.create({ data:{ userId:uid, kind, key, value:entry.value }}));
      return { id:r.id, userId:r.userId, kind:r.kind, key:r.key, value:r.value, createdAt:r.createdAt?.toISOString?.()??now, updatedAt:r.updatedAt?.toISOString?.()??now };
    }
  } catch {}
  const arr = memStore.get(uid) ?? [];
  const idx = arr.findIndex(m=> m.key===key);
  if (idx>=0) arr[idx]={ ...arr[idx], value:entry.value, kind, updatedAt:now };
  else arr.unshift(entry);
  if (arr.length>50) arr.length=50;
  memStore.set(uid, arr);
  return entry;
}

export async function deleteMemory(userId: string, key: string): Promise<boolean> {
  const uid = memKey(userId);
  try { const { prisma } = await import("@/lib/prisma"); if((prisma as any).aIMemory) await (prisma as any).aIMemory.deleteMany({ where:{ userId:uid, key }}); } catch {}
  const arr = memStore.get(uid) ?? [];
  const next = arr.filter(m=> m.key!==key);
  memStore.set(uid, next);
  return next.length !== arr.length;
}

export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (!memories.length) return "";
  return memories.slice(0,8).map(m=> `- [${m.kind}] ${m.key}: ${m.value}`).join("\n");
}
