// Mirror Postgres -> Firestore (A. Mirror) — เขียน Firestore แบบ best-effort ไม่ให้ Postgres ล้มเหลวถ้า Firebase ดับ
// หมายเหตุประสิทธิภาพ: firebase-admin เป็นโมดูลหนัก (แรม) — โหลดแบบ lazy และข้ามได้ด้วย env
// DISABLE_FIRESTORE_MIRROR=1 สำหรับโฮสต์ที่แรมจำกัด (เช่น Hostinger shared) เพราะเป็นงานสำรอง ไม่ใช่ธุรกรรมหลัก
function mirrorDisabled(){ return process.env.DISABLE_FIRESTORE_MIRROR === '1'; }
async function db(){ const { getDb } = await import('@/lib/firebase-admin'); return getDb(); }

export async function mirrorToFirestore(collection: string, docId: string, data: any){
  if(mirrorDisabled()) return;
  try{
    const fdb = await db();
    // แปลง Decimal / Date ให้ Firestore รับได้
    const clean: any = JSON.parse(JSON.stringify(data, (_k,v)=> {
      if(v && typeof v === 'object' && v.d !== undefined) return String(v);
      return v;
    }));
    clean._mirroredAt = new Date().toISOString();
    clean._source = 'postgres-mirror';
    await fdb.collection(collection).doc(docId).set(clean, { merge:true });
  }catch(e:any){
    // เงียบ — อย่าให้ mirror พังธุรกรรมหลัก
    console.warn(`[mirror] ${collection}/${docId} failed:`, e?.message);
  }
}

export async function mirrorDelete(collection: string, docId: string){
  if(mirrorDisabled()) return;
  try{ const fdb = await db(); await fdb.collection(collection).doc(docId).delete(); }catch{}
}
