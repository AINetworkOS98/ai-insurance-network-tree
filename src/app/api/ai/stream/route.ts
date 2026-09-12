import { NextRequest } from 'next/server';
import { type SearchMode } from '@/lib/ai/orchestrator';
import { hermesExecute } from '@/lib/ai/hermesOS';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sse(data: any){ return `data: ${JSON.stringify(data)}\n\n`; }

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=> ({}));
  const query: string = (body.query ?? '').toString().slice(0, 8000);
  const mode: SearchMode = ['FAST','SMART','DEEP'].includes(body.mode) ? body.mode : 'SMART';
  const hasDataset: boolean = !!body.hasDataset;
  const rows: number = Number(body.contextRows ?? body.rows ?? 0);
  const datasetRaw: string | undefined = typeof body.datasetRaw === 'string' ? body.datasetRaw.slice(0, 12000) : typeof body.raw === 'string' ? body.raw.slice(0, 12000) : undefined;
  const datasetType: string | undefined = body.contextType || body.datasetType;
  const userId = req.headers.get('x-user-id') || (body.userId as string) || 'guest';

  if (!query && !hasDataset) {
    return new Response(sse({type:'error', error:'กรุณาพิมพ์คำถามหรือวางข้อมูล'}), { status:400, headers:{'Content-Type':'text/event-stream'}});
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller){
      const send = (obj:any)=> controller.enqueue(encoder.encode(sse(obj)));
      try {
        // AI — plan + parallel tools + verify + synthesize with streaming trace
        const result = await hermesExecute({
          query: query || (hasDataset ? 'วิเคราะห์ข้อมูลที่วาง' : query),
          mode,
          hasDataset,
          datasetRaw,
          datasetType,
          rows,
          userId,
          onStep: (s)=> send({ type:'step', step: s.step, label: s.label, detail: s.detail, status: s.status }),
        });

        // Meta header for UI
        send({ type:'meta', intent: result.intent, tools: result.trace.tools, skills: result.trace.skills, mode, memoryUsed: result.trace.memoryUsed });

        // Tool results — show verification
        if (result.trace.toolResults.length){
          for(const r of result.trace.toolResults){
            send({ type:'tool_result', tool: r.tool, ok: r.ok, elapsedMs: r.elapsedMs, data: r.data });
          }
        }

        send({ type:'start', via: result.via, trace: result.trace });

        // Stream answer token-by-token for smooth UX (even when from LLM)
        const ans = result.answer;
        // Split by char but keep Thai graphemes safe via Array.from
        const chars = Array.from(ans);
        for(let i=0;i<chars.length;i++){
          send({ type:'token', text: chars[i] });
          if (i % 8 === 0) await new Promise(r=> setTimeout(r, 8));
        }
        send({ type:'done', via: result.via, answer: ans, trace: result.trace });
        controller.close();
      } catch (e:any){
        send({ type:'error', error: e?.message ?? 'stream failed' });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers:{
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no',
    }
  });
}
