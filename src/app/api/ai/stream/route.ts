import { NextRequest } from 'next/server';
import { type SearchMode } from '@/lib/ai/orchestrator';
import { hermesStream } from '@/lib/ai/hermesOS';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sse(data: any) { return `data: ${JSON.stringify(data)}\n\n`; }

/**
 * POST /api/ai/stream — SSE
 * ส่งเหตุการณ์: step / meta / tool_result / token (สตรีมจริงจากโมเดล) / start / done / error
 * v2: ส่ง token ทันทีที่โมเดลผลิตออกมา (ไม่รอคำตอบครบ) + ยกเลิกงานเมื่อผู้ใช้ปิดคำขอ
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string = (body.query ?? '').toString().slice(0, 8000);
  const mode: SearchMode = ['FAST', 'SMART', 'DEEP'].includes(body.mode) ? body.mode : 'SMART';
  const hasDataset: boolean = !!body.hasDataset;
  const rows: number = Number(body.contextRows ?? body.rows ?? 0);
  const datasetRaw: string | undefined = typeof body.datasetRaw === 'string' ? body.datasetRaw.slice(0, 12000)
    : typeof body.raw === 'string' ? body.raw.slice(0, 12000) : undefined;
  const datasetType: string | undefined = body.contextType || body.datasetType;
  const userId = req.headers.get('x-user-id') || (body.userId as string) || 'guest';

  if (!query && !hasDataset) {
    return new Response(sse({ type: 'error', error: 'กรุณาพิมพ์คำถามหรือวางข้อมูล' }), { status: 400, headers: { 'Content-Type': 'text/event-stream' } });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => { try { controller.enqueue(encoder.encode(sse(obj))); } catch {} };
      try {
        for await (const ev of hermesStream({
          query: query || (hasDataset ? 'วิเคราะห์ข้อมูลที่วาง' : query),
          mode, hasDataset, datasetRaw, datasetType, rows, userId,
          signal: req.signal,
        })) {
          if (req.signal.aborted) break;
          send(ev as any);
        }
        controller.close();
      } catch (e: any) {
        send({ type: 'error', error: e?.message ?? 'stream failed' });
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
