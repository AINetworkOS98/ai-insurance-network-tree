import { getDb } from '@/lib/firebase-admin';

// Mirror Postgres -> Firestore (A. Mirror) — เขียน Firestore แบบ best-effort ไม่ให้ Postgres ล้มเหลวถ้า Firebase ดับ
export async function mirrorToFirestore(collection: string, docId: string, data: any){
  try{
    const db = getDb();
    // แปลง Decimal / Date ให้ Firestore รับได้
    const clean: any = JSON.parse(JSON.stringify(data, (_k,v)=> {
      if(v && typeof v === 'object' && v.d !== undefined) return String(v);
      return v;
    }));
    clean._mirroredAt = new Date().toISOString();
    clean._source = 'postgres-mirror';
    await db.collection(collection).doc(docId).set(clean, { merge:true });
  }catch(e:any){
    // เงียบ — อย่าให้ mirror พังธุรกรรมหลัก
    console.warn(`[mirror] ${collection}/${docId} failed:`, e?.message);
  }
}

export async function mirrorDelete(collection: string, docId: string){
  try{ await getDb().collection(collection).doc(docId).delete(); }catch{}
}
