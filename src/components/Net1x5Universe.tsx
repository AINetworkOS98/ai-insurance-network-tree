'use client';

/**
 * Net1x5Universe — “จักรวาลการสร้างเครือข่าย 1 แตก 5” (ข้อมูลจริงเท่านั้น)
 *
 * ● ใช้ฉากจักรวาล 3 มิติตัวเดียวกับหน้า /financial-freedom (คอมโพเนนต์ CosmicNetwork)
 *   แต่ป้อน “สมาชิกจริงในผัง 1:5” จาก /api/net/1x5/state — ไม่มีข้อมูลจำลองในส่วนนี้
 * ● ดาวทอง = ผ่านเงื่อนไขรอบนี้ · ดาวหม่น = ยังไม่ยืนยันผลงาน/ปิดจุดในผัง · สีตามชั้นคือความลึกจริงในสายงาน
 * ● ตัวเลขทุกตัวประเมินสดจากฐานข้อมูล · อัปเดตเองทุก 8 วินาที (ปรับได้)
 * ● ชื่อสมาชิกเป็นค่าที่เซิร์ฟเวอร์ส่งมา (ผู้ที่ไม่ใช่ผู้ดูแลจะถูกปกปิดชื่อแล้ว) — ไม่มีอีเมล/เบอร์โทร
 * ● คอมโพเนนต์นี้ “อ่านเท่านั้น” ไม่เรียกคำสั่งที่เขียนข้อมูล และไม่สั่งรันวงจรเอง
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import CosmicNetwork, { Chip } from './CosmicNetwork';
import { buildNetworkFromMembers, type CosmicNetworkModel, type RealMemberInput } from '@/lib/cosmicNetwork';

const REFRESH_MS = 8000;

type Check = {
  userId: string;
  code: string;
  name: string;
  pass: boolean;
  reasons?: string[];
  pendingReview?: boolean;
};

type Member = {
  userId: string;
  code: string;
  name: string;
  status: string;
  isActive: boolean;
  inTree: boolean;
  nodeLevel?: number | null;
  level?: number;
  slot?: number | null;
  parentUserId?: string | null;
  joinDate?: string | null;
  positionName?: string;
  childrenCount?: number;
  emptySlots?: number[];
  verifiedAmount?: number;
  receiptCount?: number;
  pendingReceipts?: number;
  isTest?: boolean;
};

type Level = { level: number; count: number; capacity: number };

type State = {
  ok: boolean;
  canAdmin: boolean;
  period: string;
  now: string;
  summary: any;
  tree: { perLevel: Level[]; branchLimit: number; roots: any[] };
  members: Member[];
  checks: Check[];
  steps?: any[];
  lastRun: any | null;
  logs: any[];
  testAccounts?: number;
  disclaimer?: string;
  error?: string;
  message?: string;
};

const STEP_META: Record<string, { icon: string; label: string }> = {
  verify: { icon: '🔎', label: 'ตรวจสอบเงื่อนไขสมาชิก' },
  identify: { icon: '⚠️', label: 'ระบุผู้ไม่ผ่านเงื่อนไข' },
  cut: { icon: '⛔', label: 'นำออกจากตำแหน่ง' },
  search: { icon: '🎯', label: 'หาผู้มีคุณสมบัติครบ' },
  promote: { icon: '⬆️', label: 'เลื่อนขึ้นแทนตำแหน่งว่าง' },
  relink: { icon: '🧩', label: 'จัดสายงาน 1:5' },
  recalc: { icon: '🔄', label: 'อัปเดตโครงสร้างทุกระดับ' },
};

const DOT: Record<string, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  skipped: 'bg-slate-400',
  error: 'bg-rose-400',
};

function th(n: any) {
  return Number(n || 0).toLocaleString('th-TH');
}

function relTime(iso?: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

function Tile({ label, value, sub, tone }: { label: string; value: any; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border px-3 py-2.5 backdrop-blur-sm ${tone || 'bg-white/5 border-sky-400/20'}`}>
      <div className="text-[11px] text-sky-200/70">{label}</div>
      <div className="text-lg font-bold text-sky-50 leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-sky-200/60 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

/** การ์ดรายละเอียดสมาชิกที่ถูกคลิก (ค่าจริงจาก /api/net/1x5/state) */
function MemberPanel({ member, check, onClose }: { member: Member; check: Check | null; onClose: () => void }) {
  return (
    <div className="text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">Member</div>
          <div className="font-mono text-sky-100 truncate">{member.code}</div>
          <div className="text-sky-200/80 truncate">{member.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดรายละเอียดสมาชิก"
          className="shrink-0 rounded-md border border-slate-600/40 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          <div className="text-[10px] text-sky-200/60">ชั้นในผัง</div>
          <div className="font-semibold tabular-nums">{th(member.nodeLevel ?? member.level)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          <div className="text-[10px] text-sky-200/60">ตำแหน่ง</div>
          <div className="font-semibold truncate">{member.positionName || '—'}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          <div className="text-[10px] text-sky-200/60">สายตรง</div>
          <div className="font-semibold tabular-nums">{th(member.childrenCount)} / 5</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          <div className="text-[10px] text-sky-200/60">ยอดรับรองรอบนี้</div>
          <div className="font-semibold tabular-nums">฿{th(member.verifiedAmount)}</div>
        </div>
      </div>
      <div className={check?.pass ? 'mt-2 text-emerald-300' : 'mt-2 text-amber-300'}>
        {check
          ? check.pass
            ? '✅ ผ่านเงื่อนไขรอบนี้ (พร้อมขึ้นตำแหน่ง)'
            : `⚠️ ยังไม่ผ่าน: ${(check.reasons || []).join(' · ')}`
          : 'ยังไม่ถูกประเมินในรอบนี้'}
      </div>
      {check?.pendingReview && <div className="text-sky-300">🕒 มีใบเสร็จรอตรวจ — ยังไม่ถูกนำออกจากตำแหน่งระหว่างรอผล</div>}
      <div className="mt-1 text-sky-200/70">
        สถานะบัญชี: {member.status === 'ACTIVE' && member.isActive ? 'ใช้งานอยู่' : `${member.status}${member.isActive ? '' : ' · ปิดจุดในผัง'}`}
      </div>
      <div className="text-sky-200/60">เข้าร่วมเมื่อ {relTime(member.joinDate)}</div>
    </div>
  );
}

export default function Net1x5Universe() {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [, setTick] = useState(0); // อัปเดตข้อความ “กี่นาทีที่แล้ว” ให้เดินเอง

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/net/1x5/state', { credentials: 'include', cache: 'no-store' });
      const j = (await r.json()) as State;
      if (!j?.ok) {
        setErr(j?.message || j?.error || 'อ่านสถานะเครือข่ายไม่สำเร็จ');
        return;
      }
      setState(j);
      setErr('');
    } catch {
      setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — กำลังลองใหม่');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [auto, load]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 20000);
    return () => clearInterval(t);
  }, []);

  const members = useMemo(() => state?.members || [], [state]);
  const checks = useMemo(() => state?.checks || [], [state]);
  const perLevel = useMemo<Level[]>(() => state?.tree?.perLevel || [], [state]);
  const logs = state?.logs || [];
  const summary = state?.summary || {};
  const steps = state?.steps || [];

  const checkByUser = useMemo(() => {
    const m = new Map<string, Check>();
    for (const c of checks) m.set(String(c.userId), c);
    return m;
  }, [checks]);

  const inTree = useMemo(() => members.filter((m) => m.inTree), [members]);

  /** สมาชิกในผัง → ข้อมูลที่ฉากจักรวาลใช้ (เฉพาะค่าที่เซิร์ฟเวอร์ปกปิดชื่อแล้ว) */
  const realMembers = useMemo<RealMemberInput[]>(() => {
    const codeByUser = new Map<string, string>();
    for (const m of members) codeByUser.set(String(m.userId), m.code);
    return inTree.map((m) => {
      const c = checkByUser.get(String(m.userId));
      return {
        code: m.code,
        name: m.name,
        parentCode: m.parentUserId ? codeByUser.get(String(m.parentUserId)) ?? null : null,
        slot: m.slot ?? null,
        qualified: !!c?.pass,
        paymentVerified: Number(m.receiptCount || 0) > 0 || Number(m.verifiedAmount || 0) > 0,
        active: !!m.isActive,
        joinedAt: m.joinDate ? Date.parse(m.joinDate) : null,
      };
    });
  }, [inTree, members, checkByUser]);

  const model = useMemo<CosmicNetworkModel>(
    () => buildNetworkFromMembers(realMembers, { rootName: 'AI INSURANCE NETWORK' }),
    [realMembers],
  );

  const deepest = perLevel.length ? perLevel[perLevel.length - 1] : null;
  const deepPct = deepest ? Math.min(100, Math.round((deepest.count / Math.max(1, deepest.capacity)) * 100)) : 0;
  const fullLevels = perLevel.filter((r) => r.count >= r.capacity).length;
  const openSlots = inTree.reduce((a, m) => a + (m.emptySlots?.length || 0), 0);
  const selectedMember = selected ? members.find((m) => m.code === selected) || null : null;
  const selectedCheck = selectedMember ? checkByUser.get(String(selectedMember.userId)) || null : null;
  const realRoot = inTree.find((m) => !m.parentUserId) || null;

  return (
    <section className="min-h-screen bg-[#020617] text-sky-50">
      {/* pb-24: เว้นที่ให้แถบล่างติดจอ (VisitorCounter, fixed bottom-0 z-50) — ไม่งั้นข้อความท้ายหน้าถูกบัง */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-5 pt-5 pb-24">
        {/* ── หัวเรื่อง ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-sky-300/80">NETWORK UNIVERSE 1×5 · ข้อมูลจริงในฐานข้อมูล</div>
            <h2 className="text-xl sm:text-2xl font-bold leading-tight">🪐 จักรวาลการสร้างเครือข่าย — สถานะการขยายสายงานแบบเห็นทันที</h2>
            <p className="text-xs text-sky-200/70 mt-1 max-w-3xl leading-relaxed">
              ทุกทรงกลมพลังงานคือสมาชิกจริงที่อยู่ในผัง 1:5 · เส้นแสงคือสายผู้แนะนำ → สมาชิกใหม่ ·
              <span className="text-amber-200"> ทรงกลมทอง</span> = ผ่านเงื่อนไขรอบนี้ ·
              <span className="text-slate-400"> ทรงกลมหม่น</span> = ยังไม่ยืนยันผลงานหรือปิดจุดในผัง ·
              สีของทรงกลมเรียงตามชั้นจริงในสายงาน (ชั้นต้น → ชั้นลึก) — ลากเพื่อหมุน ซูมเข้า-ออก คลิกสมาชิกเพื่อดูข้อมูล
              และกด ⛶ ขยายเต็มจอ (Esc เพื่อย่อกลับ) · ตัวเลขทั้งหมดประเมินสดจากฐานข้อมูลและอัปเดตเองทุก 8 วินาที
              (ส่วนนี้เป็นมุมมองอ่านเท่านั้น ไม่แก้ข้อมูล)
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-sky-200/80 shrink-0">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> อัปเดตอัตโนมัติทุก 8 วินาที
          </label>
        </div>

        {err && <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-100 text-sm px-3 py-2">{err}</div>}

        {/* ── สถานะการสร้างเครือข่าย (ตัวเลขจริง) ── */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Tile
            label="สมาชิกในจักรวาล (ในผัง)"
            value={th(summary.total)}
            sub={`ใช้งาน ${th(summary.active)} · ปิดจุด ${th(summary.nonActive)}${summary.outOfTree ? ` · นอกผัง ${th(summary.outOfTree)}` : ''}`}
            tone="bg-sky-500/10 border-sky-400/30"
          />
          <Tile
            label={deepest ? `ชั้นที่กำลังขยาย (ชั้น ${deepest.level})` : 'ชั้นที่กำลังขยาย'}
            value={deepest ? `${th(deepest.count)} / ${th(deepest.capacity)}` : '—'}
            sub={deepest ? `เติมแล้ว ${deepPct}% ของความจุชั้นนี้${deepest.count >= deepest.capacity ? ' · เต็มแล้ว พร้อมเปิดชั้นถัดไป' : ''}` : 'ยังไม่มีสมาชิกในผัง'}
          />
          <Tile
            label="ช่อง 1:5 ที่ยังว่าง"
            value={th(summary.emptySlots ?? openSlots)}
            sub={`ตำแหน่งว่างที่ต้องเติม ${th(summary.vacancies)} ตำแหน่ง`}
            tone="bg-indigo-500/10 border-indigo-400/30"
          />
          <Tile
            label="ผ่านเงื่อนไข (แหวนทอง)"
            value={th(summary.passed)}
            sub="พร้อมขึ้นตำแหน่งตามกติกา"
            tone="bg-emerald-500/10 border-emerald-400/30"
          />
          <Tile
            label="ไม่ผ่านเงื่อนไข"
            value={th(summary.failed)}
            sub={`ต้องดำเนินการ ${th(summary.failedActionable)} · รอตรวจใบเสร็จ ${th(summary.pendingReview)}`}
            tone="bg-amber-500/10 border-amber-400/30"
          />
          <Tile
            label="รอบอัตโนมัติล่าสุด"
            value={state?.lastRun ? `${th(state.lastRun.promoted)}⬆ / ${th(state.lastRun.cut)}⛔` : 'ยังไม่รัน'}
            sub={state?.lastRun ? `${relTime(state.lastRun.startedAt)} · เลื่อนขึ้นแทน ${th(state.lastRun.promoted)} · คัดออก ${th(state.lastRun.cut)}` : 'ตัวเฝ้ารันให้เองทุก 5 นาที'}
          />
        </div>

        {/* ── จักรวาล + แผงสถานะ ── */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            {inTree.length ? (
              <CosmicNetwork
                model={model}
                heightClass="h-[68vh] min-h-[440px]"
                rootLabel={realRoot ? `${realRoot.name} · ${realRoot.code}` : 'AI INSURANCE NETWORK'}
                nodeLabel={(n) => `${n.name} · ${n.code}`}
                onSelectCode={(code) => setSelected(code)}
                badge={{
                  label: `LIVE · ข้อมูลจริง ${th(inTree.length)} คนในผัง`,
                  sub: state?.now ? `ประเมินล่าสุด ${new Date(state.now).toLocaleString('th-TH', { hour12: false })}` : undefined,
                }}
                chips={
                  <>
                    <Chip label="Members In Tree" value={th(inTree.length)} sub={`${model.byLevel.length} ชั้นในสายงาน`} />
                    <Chip label="Sponsor Links" value={th(model.edges.length)} sub="เส้นพลังงานผู้แนะนำ" />
                    <Chip label="Network Depth" value={`${model.depth + 1} ชั้น`} sub={`ลึกสุด ${model.depth} ต่อ`} tone="violet" />
                    <Chip label="ผ่านเงื่อนไข" value={th(summary.passed)} sub="ทรงกลมทอง" tone="gold" />
                    <Chip label="ช่องว่าง 1:5" value={th(summary.emptySlots ?? openSlots)} sub="ยังไม่มีสมาชิก" tone="emerald" />
                    {Number(state?.testAccounts || 0) > 0 ? (
                      <Chip label="Test Accounts" value={th(state?.testAccounts)} sub="บัญชีทดสอบในฐานข้อมูล" />
                    ) : null}
                  </>
                }
                panel={
                  selectedMember ? (
                    <MemberPanel member={selectedMember} check={selectedCheck} onClose={() => setSelected(null)} />
                  ) : undefined
                }
              />
            ) : (
              <div className="relative flex h-[68vh] min-h-[440px] w-full items-center justify-center overflow-hidden rounded-3xl border border-sky-500/20 bg-slate-950 px-6 text-center">
                <div>
                  <div className="text-4xl mb-2">🌌</div>
                  <div className="text-sm font-semibold text-sky-100">จักรวาลยังว่าง — ยังไม่มีสมาชิกในผัง 1:5</div>
                  <div className="text-xs text-sky-200/70 mt-1 max-w-md leading-relaxed">
                    เมื่อมีสมาชิกถูกจัดเข้าผัง ดาวจะปรากฏขึ้นทีละดวงจากตำแหน่งผู้แนะนำ และสถานะด้านบนจะขยับตามข้อมูลจริงทันที
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* รายละเอียดดาวที่เลือก (แสดงคู่กับฉาก เพื่ออ่านบนจอเล็ก) */}
            <div className="rounded-2xl border border-sky-400/20 bg-white/5 p-3">
              <div className="text-sm font-semibold text-sky-100 mb-2">ดาวที่เลือก</div>
              {!selectedMember && <div className="text-xs text-sky-200/60">คลิกที่ดาวดวงใดก็ได้ในจักรวาล เพื่อดูสถานะจริงของสมาชิกคนนั้น</div>}
              {selectedMember && <MemberPanel member={selectedMember} check={selectedCheck} onClose={() => setSelected(null)} />}
            </div>

            {/* ขั้นตอนการสร้างเครือข่าย */}
            <div className="rounded-2xl border border-sky-400/20 bg-white/5 p-3">
              <div className="text-sm font-semibold text-sky-100 mb-2">ขั้นตอนการสร้างเครือข่าย (7 ขั้น)</div>
              <div className="space-y-1.5">
                {steps.map((s: any, i: number) => {
                  const meta = STEP_META[s.key] || { icon: '•', label: s.label };
                  return (
                    <div key={s.key || i} className="flex items-start gap-2 text-[11px]">
                      <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[s.status] || 'bg-slate-500'}`} />
                      <div className="min-w-0">
                        <div className="text-sky-100 font-semibold">{meta.icon} ขั้น {i + 1} · {meta.label} <span className="text-sky-300/80 font-normal">({th(s.count)})</span></div>
                        <div className="text-sky-200/60 leading-snug">{String(s.detail || '').slice(0, 170)}</div>
                      </div>
                    </div>
                  );
                })}
                {!steps.length && <div className="text-xs text-sky-200/60">กำลังอ่านสถานะจากฐานข้อมูล…</div>}
              </div>
            </div>

            {/* ความจุต่อชั้น */}
            <div className="rounded-2xl border border-sky-400/20 bg-white/5 p-3">
              <div className="text-sm font-semibold text-sky-100 mb-2">
                การขยายตัวต่อชั้น {fullLevels ? `· เต็มแล้ว ${fullLevels} ชั้น` : ''}
              </div>
              <div className="space-y-1.5">
                {perLevel.map((r) => (
                  <div key={r.level} className="text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-sky-100">ชั้น {r.level}</span>
                      <span className="text-sky-200/70">{th(r.count)} / {th(r.capacity)}</span>
                    </div>
                    <div className="h-1.5 mt-0.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${Math.min(100, (r.count / Math.max(1, r.capacity)) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {!perLevel.length && <div className="text-xs text-sky-200/60">ยังไม่มีสมาชิกในผัง</div>}
              </div>
            </div>

            {/* เหตุการณ์ล่าสุด */}
            <div className="rounded-2xl border border-sky-400/20 bg-white/5 p-3">
              <div className="text-sm font-semibold text-sky-100 mb-2">เหตุการณ์ล่าสุดในจักรวาล ({logs.length})</div>
              <div className="space-y-1.5">
                {logs.slice(0, 6).map((l: any) => (
                  <div key={l.id} className="text-[11px] border-b border-white/10 pb-1.5 last:border-0">
                    <div className="text-sky-100">{String(l.action || '').replace(/^net1x5\./, '')} · <span className="text-sky-300/70">{relTime(l.createdAt)}</span></div>
                    <div className="text-sky-200/60 leading-snug">{String(l.reason || '').slice(0, 150)}</div>
                  </div>
                ))}
                {!logs.length && <div className="text-xs text-sky-200/60">ยังไม่มีเหตุการณ์ — ระบบจะบันทึกทุกครั้งที่ตรวจ/คัดออก/เลื่อนตำแหน่ง</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-400/20 bg-white/5 p-3 text-[11px] text-sky-200/70 leading-relaxed">
          {state?.disclaimer ||
            'ข้อมูลชุดนี้เป็นข้อมูลจริงในฐานข้อมูลของระบบ (ไม่ใช่ข้อมูลจำลอง) — ทุกการเปลี่ยนแปลงถูกบันทึกไว้ตรวจสอบย้อนหลังได้'}
          {state?.now ? ` · ประเมินล่าสุด ${new Date(state.now).toLocaleString('th-TH', { hour12: false })}` : ''}
        </div>
      </div>
    </section>
  );
}
