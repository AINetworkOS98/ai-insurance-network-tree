'use client';

/**
 * Net1x5MembersBoard — “สมาชิก 1 แตก 5” (แบบผัง 1:5 · ข้อมูลจริงเท่านั้น)
 *
 * ● ทำไมมีส่วนนี้: หน้า /network/1x5-autopilot เดิมแสดงแดชบอร์ดวงจรอัตโนมัติต่อด้วยจักรวาล 3 มิติ
 *   ทำให้ต้องเลื่อนยาวกว่าจะเห็น “สมาชิกจริงอยู่ในช่องไหนของผัง 1:5” — ส่วนนี้คือแท็บ “สมาชิก 1 แตก 5”
 *   ที่วาดผังผู้แนะนำ 1 → 5 ครบทุกช่อง (ใครอยู่ช่องไหนของใคร) จากข้อมูลจริงในฐานข้อมูล
 * ● ข้อมูลทั้งหมดมาจาก /api/net/1x5/state (ตารางจริง: User / TreeNode / TreePlacement / PerformanceLedger / ReceiptFile)
 *   ไม่มีข้อมูลจำลอง ไม่มีการสุ่มตัวเลข และตัวเลขทุกตัวประเมินสดจากฐานข้อมูล · อัปเดตเองทุก 8 วินาที
 * ● ชื่อสมาชิกคือค่าที่เซิร์ฟเวอร์ส่งมา (ผู้ที่ไม่ใช่ผู้ดูแลระบบจะถูกปกปิดชื่อแล้ว) — ไม่มีอีเมล/เบอร์โทร/ตัวเลขรายได้
 * ● คอมโพเนนต์นี้ “อ่านเท่านั้น” ไม่เรียกคำสั่งที่เขียนข้อมูล และไม่สั่งรันวงจรเอง (กันวงจรซ้อนกับตัวเฟ้า)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 8000;
const SLOTS = [1, 2, 3, 4, 5] as const;

type Check = {
  userId: string;
  code: string;
  name: string;
  level?: number;
  pass: boolean;
  pendingReview?: boolean;
  reasons?: string[];
  verifiedAmount?: number;
  readyForPromotion?: boolean;
  promotionGap?: string;
};

type Member = {
  userId: string;
  code: string;
  name: string;
  rankLevel?: number;
  positionName?: string;
  status: string;
  isActive: boolean;
  inTree: boolean;
  nodeLevel?: number | null;
  level?: number;
  slot?: number | null;
  parentUserId?: string | null;
  joinDate?: string | null;
  childrenCount?: number;
  emptySlots?: number[];
  isTest?: boolean;
  isAdminAccount?: boolean;
  verifiedAmount?: number;
  receiptCount?: number;
  pendingReceipts?: number;
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
  testAccounts?: number;
  disclaimer?: string;
  error?: string;
  message?: string;
};

function th(n: any) {
  return Number(n || 0).toLocaleString('th-TH');
}

function Tile({ label, value, sub, tone }: { label: string; value: any; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone || 'bg-white border-[#f3e8d3]'}`}>
      <div className="text-[11px] text-[#57534e]">{label}</div>
      <div className="text-xl font-bold text-[#475569] leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[#78716c] mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

/** ป้ายสถานะของคุณสมบัติ (จากผลประเมินจริงใน /api/net/1x5/state) */
function statusPill(m: Member, c: Check | null) {
  if (m.isAdminAccount) return { cls: 'border-slate-300 bg-slate-50 text-slate-600', text: '🛡 บัญชีผู้ดูแลระบบ (ยกเว้นการคัดออก)' };
  if (c?.pendingReview) return { cls: 'border-sky-200 bg-[#eff6ff] text-sky-800', text: '⏳ รอตรวจใบเสร็จ' };
  if (c?.pass) return { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', text: '✅ ผ่านเงื่อนไข' };
  if (c && !c.pass) return { cls: 'border-amber-200 bg-amber-50 text-amber-900', text: '⚠️ ไม่ผ่านเงื่อนไข' };
  return { cls: 'border-slate-200 bg-white text-slate-500', text: '— ยังไม่ประเมิน' };
}

export default function Net1x5MembersBoard() {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [onlyTree, setOnlyTree] = useState(false);

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

  const members = useMemo(() => state?.members || [], [state]);
  const checks = useMemo(() => state?.checks || [], [state]);
  const perLevel = useMemo<Level[]>(() => state?.tree?.perLevel || [], [state]);
  const branchLimit = state?.tree?.branchLimit || 5;
  const summary = state?.summary || {};

  const checkByUser = useMemo(() => {
    const m = new Map<string, Check>();
    for (const c of checks) m.set(String(c.userId), c);
    return m;
  }, [checks]);

  /**ลูกของแต่ละคน แยกตามช่อง 1:5 (slot) — ใช้ค่าจริง parentUserId + slot จากผัง */
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Map<number, Member>>();
    for (const m of members) {
      if (!m.inTree || !m.parentUserId || m.slot == null) continue;
      const key = String(m.parentUserId);
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(Number(m.slot), m);
    }
    return map;
  }, [members]);

  const inTree = useMemo(() => members.filter((m) => m.inTree), [members]);
  const outOfTree = useMemo(() => members.filter((m) => !m.inTree), [members]);

  /** จัดกลุ่มสมาชิกในผังตาม “ชั้นจริงในสายงาน” (0 = ราก) */
  const byLevel = useMemo(() => {
    const groups = new Map<number, Member[]>();
    for (const m of inTree) {
      const lv = Number(m.level ?? m.nodeLevel ?? 0);
      if (!groups.has(lv)) groups.set(lv, []);
      groups.get(lv)!.push(m);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, list]) => ({ level, list: list.sort((a, b) => String(a.code).localeCompare(String(b.code))) }));
  }, [inTree]);

  const capacityOf = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of perLevel) map.set(Number(r.level), Number(r.capacity));
    return map;
  }, [perLevel]);

  const openSlots = inTree.reduce((a, m) => a + (m.emptySlots?.length || 0), 0);

  /** การ์ดหนึ่งช่อง 1:5 — มีสมาชิกจริงอยู่ = แสดงรหัส/ชื่อ · ว่าง = ช่องรอเติม */
  function SlotCard({ owner, slot }: { owner: Member; slot: number }) {
    const child = childrenByParent.get(String(owner.userId))?.get(slot) || null;
    if (!child) {
      return (
        <div className="rounded-xl border border-dashed border-[#c8a84e] bg-white px-2 py-1.5">
          <div className="text-[9px] font-semibold text-[#c8a84e]">ช่อง {slot}</div>
          <div className="text-[11px] text-[#a8a29e]">ว่าง — รอสมาชิกใหม่</div>
        </div>
      );
    }
    const cc = checkByUser.get(String(child.userId)) || null;
    const tone = cc?.pass
      ? 'border-emerald-200 bg-emerald-50'
      : cc?.pendingReview
      ? 'border-sky-200 bg-[#eff6ff]'
      : cc && !cc.pass
      ? 'border-amber-200 bg-amber-50'
      : 'border-sky-200 bg-[#eff6ff]';
    return (
      <div className={`rounded-xl border px-2 py-1.5 ${tone}`} title={cc?.promotionGap || ''}>
        <div className="flex items-center gap-1 text-[9px] font-semibold text-[#57534e]">
          <span>ช่อง {slot}</span>
          {child.isActive ? null : <span className="text-rose-700">· ปิดจุด</span>}
          {cc?.pass ? <span className="text-emerald-700">· ผ่าน</span> : null}
        </div>
        <div className="font-mono text-[10px] text-[#475569] truncate">{child.code}</div>
        <div className="text-[11px] font-semibold text-[#475569] truncate">{child.name}</div>
        <div className="text-[9px] text-[#78716c] truncate">
          ชั้น {Number(child.level ?? 0)} · ลูกในผัง {Number(child.childrenCount || 0)}/{branchLimit}
        </div>
      </div>
    );
  }

  function MemberRow({ m }: { m: Member }) {
    const c = checkByUser.get(String(m.userId)) || null;
    const pill = statusPill(m, c);
    const filled = branchLimit - (m.emptySlots?.length ?? branchLimit);
    return (
      <div className={`rounded-2xl border bg-white p-3 ${m.isActive ? 'border-[#f3e8d3]' : 'border-rose-200'}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono font-semibold text-[#475569]">{m.code}</span>
          <span className="font-semibold text-[#475569]">{m.name}</span>
          <span className="rounded-full border border-[#f3e8d3] bg-[#FCFBF6] px-2 py-0.5 text-[10px] text-[#57534e]">
            ชั้น {Number(m.level ?? m.nodeLevel ?? 0)}
          </span>
          {m.positionName ? (
            <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2 py-0.5 text-[10px] text-sky-800">{m.positionName}</span>
          ) : null}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${pill.cls}`}>{pill.text}</span>
          {m.status !== 'ACTIVE' ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-800">{m.status}</span>
          ) : null}
          {!m.isActive ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-800">ปิดจุดในผัง</span>
          ) : null}
          {m.isTest ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-800">บัญชีทดสอบ</span>
          ) : null}
          <span className="ml-auto text-[11px] text-[#78716c]">
            ช่อง 1:5 ที่มีสมาชิก {filled}/{branchLimit} · ลูกในผัง {Number(m.childrenCount || 0)} คน · ยอดรับรอง ฿{th(m.verifiedAmount)}
            {Number(m.pendingReceipts || 0) > 0 ? ` · รอตรวจ ${th(m.pendingReceipts)} ใบ` : ''}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {SLOTS.map((slot) => (
            <SlotCard key={slot} owner={m} slot={slot} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="bg-[#FCFBF6]">
      {/* pb-24: เว้นที่ให้แถบล่างติดจอ (VisitorCounter) — ไม่งั้นข้อความท้ายส่วนถูกบัง */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-5 pt-5 pb-24">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold text-[#c8a84e] tracking-wide">MEMBER 1×5 BOARD · ข้อมูลจริงในฐานข้อมูล</div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#475569] leading-tight">
              👥 สมาชิก 1 แตก 5 — ผังผู้แนะนำ 1 → {branchLimit} ครบทุกช่อง
            </h2>
            <p className="text-xs text-[#57534e] mt-1 max-w-3xl leading-relaxed">
              ทุกรายการคือสมาชิกจริงในฐานข้อมูล · แต่ละคนมี {branchLimit} ช่องตามกติกา 1 แตก 5 โดยช่องที่ 1–{branchLimit}
              แสดง “รหัส · ชื่อ” ของสมาชิกที่อยู่ในช่องนั้นจริง (เรียงตามสายผู้แนะนำ) · ช่องเส้นประ = ยังว่าง ·
              สถานะ “ผ่านเงื่อนไข / รอตรวจใบเสร็จ / ไม่ผ่าน” เป็นผลประเมินสดของรอบปัจจุบัน ·
              ตัวเลขทั้งหมดประเมินสดและอัปเดตเองทุก 8 วินาที (ส่วนนี้เป็นมุมมองอ่านเท่านั้น ไม่แก้ข้อมูล)
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-[#57534e] shrink-0">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> อัปเดตอัตโนมัติทุก 8 วินาที
          </label>
        </div>

        {err && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">{err}</div>}

        {/* ── สรุปสถานะจริง ── */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Tile
            label="สมาชิกในผัง 1:5"
            value={th(inTree.length)}
            sub={`ใช้งาน ${th(summary.active)} · ปิดจุด ${th(summary.nonActive)}${summary.outOfTree ? ` · นอกผัง ${th(summary.outOfTree)}` : ''}`}
            tone="bg-white border-[#f3e8d3]"
          />
          <Tile
            label="ชั้นที่มีสมาชิกอยู่"
            value={th(byLevel.length)}
            sub={byLevel.length ? `ลึกสุดชั้น ${byLevel[byLevel.length - 1].level}` : 'ยังไม่มีสมาชิกในผัง'}
            tone="bg-white border-[#dbeafe]"
          />
          <Tile label="ช่อง 1:5 ที่ยังว่าง" value={th(openSlots)} sub={`ตำแหน่งว่างที่ต้องเติม ${th(summary.vacancies)} ตำแหน่ง`} tone="bg-white border-[#dbeafe]" />
          <Tile label="ผ่านเงื่อนไข" value={th(summary.passed)} sub="พร้อมขึ้นตำแหน่งตามกติกา" tone="bg-emerald-50 border-emerald-200" />
          <Tile label="ไม่ผ่านเงื่อนไข" value={th(summary.failed)} sub={`ต้องดำเนินการ ${th(summary.failedActionable)} · รอตรวจ ${th(summary.pendingReview)}`} tone="bg-amber-50 border-amber-200" />
          <Tile
            label="สมาชิกที่ยังไม่อยู่ในผัง"
            value={th(outOfTree.length)}
            sub="รอจัดเข้าช่องว่างตามกติกา"
            tone="bg-white border-[#f3e8d3]"
          />
        </div>

        {/* ── ปุ่มสลับมุมมอง: ผังเท่านั้น / รวมสมาชิกนอกผัง ── */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setOnlyTree(false)}
            className={`px-3 py-1.5 rounded-full border font-semibold ${!onlyTree ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-[#57534e] border-[#f3e8d3]'}`}
          >
            ทั้งหมด (ในผัง {th(inTree.length)} + นอกผัง {th(outOfTree.length)})
          </button>
          <button
            onClick={() => setOnlyTree(true)}
            className={`px-3 py-1.5 rounded-full border font-semibold ${onlyTree ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-[#57534e] border-[#f3e8d3]'}`}
          >
            เฉพาะสมาชิกในผัง 1:5 ({th(inTree.length)})
          </button>
          <span className="text-[11px] text-[#78716c]">ความจุตามกติกา = {branchLimit} ช่องต่อคนต่อชั้น (ชั้น 1 = {th(branchLimit)} · ชั้น 2 = {th(branchLimit ** 2)} · ชั้น 3 = {th(branchLimit ** 3)})</span>
        </div>

        {/* ── ผัง 1:5 จริง แยกตามชั้น ── */}
        {byLevel.map((g) => {
          const cap = capacityOf.get(g.level);
          const pct = cap ? Math.min(100, Math.round((g.list.length / Math.max(1, cap)) * 100)) : 0;
          return (
            <div key={g.level} className="mt-4 rounded-2xl border border-[#f3e8d3] bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-[#475569]">ชั้น {g.level}{g.level === 0 ? ' (ราก)' : ''}</span>
                <span className="text-xs text-[#78716c]">สมาชิก {th(g.list.length)} คน{cap ? ` · ความจุตามกติกา ${th(cap)} ตำแหน่ง` : ''}</span>
                {cap ? (
                  <span className="ml-2 flex-1 min-w-[120px] max-w-[320px]">
                    <span className="block h-2 w-full rounded-full bg-[#f3e8d3] overflow-hidden">
                      <span className="block h-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                ) : null}
                {cap && g.list.length >= cap ? <span className="text-[11px] text-emerald-700">เต็มชั้นแล้ว — พร้อมเปิดชั้นถัดไป</span> : null}
              </div>
              <div className="mt-3 space-y-3">
                {g.list.map((m) => (
                  <MemberRow key={m.userId} m={m} />
                ))}
              </div>
            </div>
          );
        })}

        {!inTree.length && (
          <div className="mt-4 rounded-2xl border border-dashed border-[#c8a84e] bg-white p-6 text-center">
            <div className="text-3xl">🌱</div>
            <div className="mt-1 text-sm font-semibold text-[#475569]">ยังไม่มีสมาชิกในผัง 1:5</div>
            <div className="mt-1 text-xs text-[#78716c] max-w-xl mx-auto leading-relaxed">
              ช่องทั้ง {branchLimit} ของแต่ละคนจะปรากฏชื่อสมาชิกจริงทันทีเมื่อระบบจัดเข้าผัง (สมาชิกที่อนุมัติแล้วจะถูกจัดเข้าช่องว่าง
              ตามกติกา 1 แตก 5 โดยวงจรอัตโนมัติ) — ตัวเลขช่องว่างด้านบนคือสถานะจริง ณ ขณะนี้
            </div>
          </div>
        )}

        {/* ── สมาชิกที่ยังไม่อยู่ในผัง ── */}
        {!onlyTree && outOfTree.length > 0 && (
          <div className="mt-4 rounded-2xl border border-[#dbeafe] bg-white p-3">
            <div className="text-sm font-semibold text-[#475569]">สมาชิกที่ยังไม่อยู่ในผัง 1:5 ({th(outOfTree.length)} คน)</div>
            <div className="text-[11px] text-[#78716c] mt-0.5">
              รอจัดเข้าช่องว่างตามกติกา — ยังไม่ถูกนับเป็นสมาชิกในผัง (กล่องด้านล่างแสดงช่อง 1:{branchLimit} ที่จะใช้เมื่อเข้าผัง)
            </div>
            <div className="mt-3 space-y-3">
              {outOfTree.map((m) => (
                <MemberRow key={m.userId} m={m} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-[#f3e8d3] bg-white p-3 text-[11px] text-[#57534e] leading-relaxed">
          {state?.disclaimer ||
            'ข้อมูลชุดนี้เป็นข้อมูลจริงในฐานข้อมูลของระบบ (ไม่ใช่ข้อมูลจำลอง) — ชื่อที่แสดงถูกปกปิดบางส่วนตาม PDPA สำหรับผู้ที่ไม่ใช่ผู้ดูแลระบบ และทุกการเปลี่ยนแปลงถูกบันทึกไว้ตรวจสอบย้อนหลังได้'}
          {state?.now ? ` · ประเมินล่าสุด ${new Date(state.now).toLocaleString('th-TH', { hour12: false })}` : ''}
          {state?.period ? ` · รอบที่ประเมิน ${state.period}` : ''}
        </div>
      </div>
    </section>
  );
}
