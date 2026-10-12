'use client';

/**
 * AdminRightsPanel — แผง "สิทธิ์ของฉัน (ผู้ดูแลระบบ)" สำหรับแสดงให้ผู้ดูแลเห็นว่าตัวเองมีสิทธิอะไรในหน้านั้น
 *
 * ● เรียก /api/auth/me ครั้งเดียวต่อการโหลดหน้า แล้วเก็บผลไว้ใช้ซ้ำ (ไม่ยิงซ้ำทุก component)
 * ● ผู้ใช้ที่ไม่ใช่ผู้ดูแล → ไม่แสดงอะไรเลย (ไม่ error)
 * ● ใช้คู่กับการซ่อน/แสดงปุ่มลบในหน้า เพื่อให้ "เห็นสิทธิ" ตรงกับสิ่งที่ทำได้จริง
 *   และฝั่งเซิร์ฟเวอร์ยังบังคับสิทธิซ้ำเสมอ (UI เป็นเพียงการแสดงผล)
 */

import { useEffect, useState } from 'react';

export type AdminRight = { icon?: string; label: string; detail?: string };

type MeState = { isAdmin: boolean; email?: string; rankLevel?: number; rankName?: string };

let cached: MeState | null = null;
let inflight: Promise<MeState> | null = null;

/** อ่านสถานะผู้ดูแลจากเซิร์ฟเวอร์ (แคชต่อการโหลดหน้า) */
export function useAdminMe(): MeState | null {
  const [state, setState] = useState<MeState | null>(cached);
  useEffect(() => {
    if (cached) { setState(cached); return; }
    if (!inflight) {
      inflight = fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: any) => {
          const s: MeState = {
            isAdmin: j?.isAdmin === true,
            email: j?.user?.email || undefined,
            rankLevel: j?.user?.rankLevel ?? undefined,
            rankName: j?.user?.rankName || undefined,
          };
          cached = s;
          return s;
        })
        .catch(() => { const s = { isAdmin: false }; cached = s; return s; });
    }
    let alive = true;
    inflight.then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);
  return state;
}

const RANK_TH: Record<number, string> = {
  0: 'สมาชิกทั่วไป', 1: 'ตัวแทน', 2: 'ผู้จัดการหน่วย', 3: 'ผู้จัดการศูนย์', 4: 'ผู้จัดการภาค',
};

export default function AdminRightsPanel({
  rights,
  scope,
  note,
}: {
  /** รายการสิทธิที่ผู้ดูแลมี "ในหน้านี้" */
  rights: AdminRight[];
  /** ขอบเขตข้อมูลที่มองเห็น เช่น "เห็นข้อมูลของทุกคนในระบบ (ไม่จำกัดเฉพาะของตัวเอง)" */
  scope?: string;
  /** หมายเหตุท้ายแผง เช่น อธิบายว่าผู้ใช้ทั่วไปทำอะไรไม่ได้ */
  note?: string;
}) {
  const me = useAdminMe();
  if (!me?.isAdmin) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-emerald-800">🔐 สิทธิ์ของคุณ: ผู้ดูแลระบบ</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-300 bg-white text-emerald-700">
          ADMIN
        </span>
        {me.email && (
          <span className="text-[11px] text-emerald-700 font-mono truncate max-w-[260px]" title={me.email}>
            {me.email}
          </span>
        )}
        {typeof me.rankLevel === 'number' && (
          <span className="text-[11px] text-emerald-700">· ระดับ {me.rankLevel} ({me.rankName || RANK_TH[me.rankLevel] || '—'})</span>
        )}
        {scope && <span className="text-[11px] text-emerald-800 basis-full">👁 {scope}</span>}
      </div>

      <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
        {rights.map((r) => (
          <li key={r.label} className="flex gap-2 text-[12px] leading-5 text-emerald-900">
            <span className="mt-[1px] shrink-0">✅</span>
            <span>
              <b>{r.icon ? `${r.icon} ` : ''}{r.label}</b>
              {r.detail ? <span className="block text-emerald-800/80">{r.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 text-[11px] leading-5 text-emerald-800/80">
        {note || 'ผู้ใช้ที่ไม่ใช่ผู้ดูแลจะไม่เห็นปุ่มลบ/คืนค่า และถูกปฏิเสธที่เซิร์ฟเวอร์แม้เรียก API ตรง (ตรวจสิทธิทุกครั้ง)'}
      </div>
    </div>
  );
}
