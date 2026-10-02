import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

declare global { var __apptMem: any[] | undefined }

function mem(){ if(!globalThis.__apptMem) globalThis.__apptMem=[]; return globalThis.__apptMem!; }

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }){
  const { id } = await params;
  const body = await req.json().catch(()=> ({}));
  const { status, title, startAt, endAt } = body;

  // Try DB
  try{
    if(process.env.DATABASE_URL){
      const existing = await prisma.appointment.findUnique({ where:{ id }});
      if(existing){
        const updated = await prisma.appointment.update({
          where:{ id },
          data:{
            ...(status ? { status } : {}),
            ...(title ? { title } : {}),
            ...(startAt ? { startAt: new Date(startAt) } : {}),
            ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
          }
        });
        return NextResponse.json({ ok:true, appointment:{
          id: updated.id, prospectId: updated.prospectId, title: updated.title,
          startAt: updated.startAt.toISOString(), endAt: updated.endAt?.toISOString()||null,
          status: updated.status, createdAt: updated.createdAt.toISOString()
        }, source:'db' });
      }
    }
  }catch(e:any){
    // fall through to mem
  }
  // mem fallback
  const list = mem();
  const idx = list.findIndex((x:any)=> x.id===id);
  if(idx===-1) return NextResponse.json({ ok:false, error:'not found' }, { status:404 });
  if(status) list[idx].status = status;
  if(title) list[idx].title = title;
  if(startAt) list[idx].startAt = new Date(startAt).toISOString();
  if(endAt !== undefined) list[idx].endAt = endAt ? new Date(endAt).toISOString() : null;
  return NextResponse.json({ ok:true, appointment: list[idx], source:'mem' });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }){
  const { id } = await params;
  try{
    if(process.env.DATABASE_URL){
      const existing = await prisma.appointment.findUnique({ where:{ id }});
      if(existing){
        await prisma.appointment.delete({ where:{ id }});
        return NextResponse.json({ ok:true, source:'db' });
      }
    }
  }catch{}
  const list = mem();
  const idx = list.findIndex((x:any)=> x.id===id);
  if(idx===-1) return NextResponse.json({ ok:false, error:'not found' }, { status:404 });
  list.splice(idx,1);
  return NextResponse.json({ ok:true, source:'mem' });
}
