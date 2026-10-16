// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/ai — ตั้งค่าและทดสอบ "AI ตอบกลับอัตโนมัติ" (Hermes + DeepSeek)
//   GET  → ค่าย/รุ่นที่ใช้จริง + สถานะ key + สถิติการใช้งาน 24 ชม.
//   POST { action:'test', text, draft? } → ให้ AI ตอบจริง (ไม่ส่งออก LINE)
//          draft = ค่าที่แก้ค้างในหน้าเว็บ (ใช้ทดลองก่อนบันทึก)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import { loadConfig, previewText } from '@/lib/lineOa';
import { aiSettings, aiProviderInfo, aiUsageStats, generateAiReply, isHandoff, DEFAULT_AI_KNOWLEDGE, DEFAULT_AI_PROMPT } from '@/lib/lineOaAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDERS = ['deepseek', 'gemini', 'openrouter', 'openai'];

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const cfg: any = await loadConfig();
    const s = aiSettings(cfg);
    const info = aiProviderInfo({ provider: s.provider, model: s.model });
    const usage = await aiUsageStats();
    return NextResponse.json({
      ok: true,
      settings: s,
      saved: {
        aiEnabled: !!cfg.aiEnabled, aiMode: cfg.aiMode || 'fallback', aiSystemPrompt: cfg.aiSystemPrompt || '',
        aiKnowledge: cfg.aiKnowledge || '', aiProvider: cfg.aiProvider || '', aiModel: cfg.aiModel || '',
        aiMaxChars: cfg.aiMaxChars ?? 900, aiTemperature: cfg.aiTemperature ?? 0.3, aiPerHour: cfg.aiPerHour ?? 20,
        aiHandoffKeywords: cfg.aiHandoffKeywords || [], aiHandoffMessage: cfg.aiHandoffMessage || [], aiFailMessage: cfg.aiFailMessage || [],
      },
      provider: info,
      keyAvailable: info.configured,
      providers: PROVIDERS,
      usage,
      defaults: { prompt: DEFAULT_AI_PROMPT, knowledge: DEFAULT_AI_KNOWLEDGE },
    });
  } catch (e: any) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const cfg: any = await loadConfig();
    const text = String(body.text || '').trim();
    if (!text) return NextResponse.json({ ok: false, error: 'ต้องพิมพ์ข้อความที่จะทดสอบ' }, { status: 400 });

    const draft = body.draft && typeof body.draft === 'object' ? {
      enabled: body.draft.aiEnabled !== undefined ? !!body.draft.aiEnabled : true,
      mode: body.draft.aiMode === 'all' ? 'all' as const : 'fallback' as const,
      systemPrompt: body.draft.aiSystemPrompt || DEFAULT_AI_PROMPT,
      knowledge: body.draft.aiKnowledge ?? DEFAULT_AI_KNOWLEDGE,
      provider: body.draft.aiProvider || undefined,
      model: body.draft.aiModel || undefined,
      maxChars: Number(body.draft.aiMaxChars) || 900,
      temperature: body.draft.aiTemperature !== undefined ? Number(body.draft.aiTemperature) : 0.3,
      perHour: Number(body.draft.aiPerHour) || 20,
      handoffKeywords: Array.isArray(body.draft.aiHandoffKeywords) ? body.draft.aiHandoffKeywords : aiSettings(cfg).handoffKeywords,
      handoffMessages: aiSettings(cfg).handoffMessages,
      failMessages: aiSettings(cfg).failMessages,
    } : undefined;

    // ตรวจเส้นทางก่อน: ถ้าเป็นคำขอคุยกับเจ้าหน้าที่ → ไม่ต้องเรียกโมเดล
    const eff = draft || aiSettings(cfg);
    if (isHandoff(text, eff.handoffKeywords)) {
      return NextResponse.json({ ok: true, route: 'handoff', provider: aiProviderInfo({ provider: eff.provider, model: eff.model }), messages: eff.handoffMessages, text: previewText(eff.handoffMessages) });
    }

    const r = await generateAiReply({ text, cfg, draft, skipLimit: true });
    return NextResponse.json({
      ok: r.ok,
      route: 'ai',
      provider: r.provider,
      model: r.model,
      ms: r.ms,
      error: r.error || null,
      messages: r.messages,
      text: r.ok ? r.text : previewText(r.messages || []),
    });
  } catch (e: any) { return fail(e, 'ทดสอบ AI ไม่สำเร็จ'); }
}
