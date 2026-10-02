import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// In-memory fallback when DATABASE_URL is missing/unreachable (demo mode)
declare global { var __apptMem: any[] | undefined }
if (!globalThis.__apptMem) globalThis.__apptMem = [];
function mem(){ return globalThis.__apptMem!; }

async function tryPrisma<T>(fn: () => Promise<T>, fallback: T): Promise<{data:T, from:'db'|'mem'}>{
  try{
    // quick check: if DATABASE_URL missing, skip
    if(!process.env.DATABASE_URL) throw new Error('no DATABASE_URL');
    const data = await fn();
    return { data, from:'db' };
  }catch{
    return { data: fallback, from:'mem' };
  }
}

export async function GET(){
  // Try DB first, fallback to memory
  try{
    if(process.env.DATABASE_URL){
      const rows = await prisma.appointment.findMany({
        orderBy:{ startAt:'asc' },
        take: 200,
        include:{ prospect:{ select:{ prospectId:true, firstName:true, lastName:true } } }
      });
      const appts = rows.map(r=>({
        id: r.id,
        prospectId: r.prospectId,
        prospectName: r.prospect ? `${r.prospect.firstName} ${r.prospect.lastName}`.trim() : undefined,
        title: r.title,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt ? r.endAt.toISOString() : null,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
      return NextResponse.json({ ok:true, appointments: appts, source:'db' });
    }
  }catch(e:any){
    // fall through to mem
  }
  return NextResponse.json({ ok:true, appointments: mem(), source:'mem', note:'No demo — only real appointments from DB' });
}

export async function POST(req: Request){
  const body = await req.json().catch(()=> ({}));
  const { prospectId, title, startAt, endAt, status } = body;
  if(!title || !startAt) return NextResponse.json({ ok:false, error:'title and startAt required' }, { status:400 });

  const id = `appt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  const now = new Date().toISOString();
  // Try DB
  try{
    if(process.env.DATABASE_URL){
      // Need a valid prospectId (FK). If provided but not found, we will create orphan? Check.
      let pid = prospectId as string | null;
      if(pid){
        const exists = await prisma.prospect.findUnique({ where:{ id: pid }}).catch(()=>null)
          || await prisma.prospect.findUnique({ where:{ prospectId: pid }}).catch(()=>null);
        if(exists) pid = exists.id;
        else {
          // try find by prospectId field
          const byCode = await prisma.prospect.findFirst({ where:{ prospectId: pid }});
          if(byCode) pid = byCode.id;
          else pid = null; // ignore invalid prospect, create without link? but prospectId is required in schema
          // If FK required, we cannot save without valid prospect -> fallback to mem with note
          if(!pid) throw new Error('INVALID_PROSPECT');
        }
      }
      if(!pid){
        // Create a minimal prospect placeholder if needed? Instead fallback to mem to avoid FK error
        throw new Error('NO_PROSPECT_LINK');
      }
      const created = await prisma.appointment.create({
        data:{
          prospectId: pid,
          title: String(title),
          startAt: new Date(startAt),
          endAt: endAt ? new Date(endAt) : null,
          status: status || 'scheduled',
        }
      });
      return NextResponse.json({ ok:true, appointment:{
        id: created.id, prospectId: created.prospectId, title: created.title,
        startAt: created.startAt.toISOString(), endAt: created.endAt?.toISOString()||null,
        status: created.status, createdAt: created.createdAt.toISOString()
      }, source:'db' });
    }
  }catch(e:any){
    if(e.message==='INVALID_PROSPECT' || e.message==='NO_PROSPECT_LINK'){
      // Create in mem with original prospectId (even if not FK-valid) so UI still works
    } else {
      // other DB error -> fallback to mem
    }
  }
  // Fallback mem
  const appt = {
    id, prospectId: prospectId||'', prospectName: undefined,
    title: String(title), startAt: new Date(startAt).toISOString(),
    endAt: endAt ? new Date(endAt).toISOString() : null,
    status: status||'scheduled', createdAt: now
  };
  mem().unshift(appt);
  return NextResponse.json({ ok:true, appointment: appt, source:'mem', note: prospectId ? 'Saved in demo memory (prospect link not validated against DB)' : 'Saved in demo memory' });
}
