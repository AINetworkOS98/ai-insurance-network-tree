import { NextRequest, NextResponse } from 'next/server';
import { type SearchMode } from '@/lib/ai/orchestrator';
import { hermesExecute } from '@/lib/ai/hermesOS';

export async function POST(req: NextRequest){
  try{
    const body = await req.json().catch(()=> ({}));
    const query: string = (body.query ?? '').toString().slice(0, 8000);
    const mode: SearchMode = ['FAST','SMART','DEEP'].includes(body.mode) ? body.mode : 'SMART';
    const hasDataset: boolean = !!body.hasDataset;
    const rows: number = Number(body.contextRows ?? body.rows ?? 0);
    const datasetRaw: string | undefined = typeof body.datasetRaw === 'string' ? body.datasetRaw.slice(0, 12000) : typeof body.raw === 'string' ? body.raw.slice(0, 12000) : undefined;
    const datasetType: string | undefined = body.contextType || body.datasetType;
    const userId = req.headers.get('x-user-id') || (body.userId as string) || 'guest';

    if (!query && !hasDataset) {
      return NextResponse.json({ error: 'กรุณาพิมพ์คำถามหรือวางข้อมูล' }, { status: 400 });
    }

    const result = await hermesExecute({
      query: query || (hasDataset ? 'วิเคราะห์ข้อมูลที่วางไป' : query),
      mode,
      hasDataset,
      datasetRaw,
      datasetType,
      rows,
      userId,
    });

    return NextResponse.json({
      ok: true,
      intent: result.intent,
      mode,
      via: result.via,
      answer: result.answer,
      trace: result.trace,
      suggestedActions: hasDataset
        ? ['ดูรายละเอียด','แก้ข้อมูลผิด','ดูกราฟ','Export','บันทึก']
        : ['ค้นหาสมาชิก','เปิดผัง 1 แตก 5','ตรวจยอดเดือนนี้'],
    });
  } catch (e: any){
    return NextResponse.json({ error: e?.message ?? 'ไม่พบข้อมูลที่เกี่ยวข้อง' }, { status: 500 });
  }
}

export async function GET(){
  try{
    const { getHermesProvider } = await import('@/lib/ai/hermesProvider');
    const p = getHermesProvider();
    const info = p.getInfo();
    // Also report skills + tools (Hermes OS inventory)
    const { skills } = await import('@/lib/ai/skills');
    const { allTools } = await import('@/lib/ai/tools');
    return NextResponse.json({
      ok: true,
      os: 'Hermes OS',
      version: '1.0',
      ai: { configured: info.configured, provider: info.configured ? 'ระบบค้นหาด้วย AI อัจฉริยะ' : 'fallback', mode: 'SMART' },
      skills: skills.map(s=> ({ name:s.name, description:s.description })),
      tools: Object.keys(allTools()),
      modes: ['เร็ว','อัจฉริยะ','วิเคราะห์เชิงลึก'],
    });
  } catch { return NextResponse.json({ ok: true, ai: { configured: false } }); }
}
