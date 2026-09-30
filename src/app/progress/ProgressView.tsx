'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import BusinessModelBoard from '@/components/BusinessModelBoard';
import { RANK_CATALOG } from '@/lib/rankCatalog';
import { DEFAULT_POSITIONS, PositionId } from '@/lib/compensationRules';

/**
 * เนื้อหาจริงของหน้า /progress — เรนเดอร์เฉพาะผู้ที่ผ่านเกณฑ์ระดับตำแหน่งแล้ว
 *
 * เดิม: บันไดตำแหน่ง 6 ขั้นกับตัวเลข % ฝังตายในไฟล์ (80/30/10/5/2) — ไม่ตรงกับ
 *   rankCatalog ของโปรแกรม (5 ขั้น) และไม่ตรงกับข้อมูลจริงของผู้ใช้
 * ตอนนี้: ใช้ RANK_CATALOG เป็นบันไดเดียวกับโปรแกรม + คำนวณจากข้อมูลจริง
 *   - ระดับที่ถึงแล้ว = ผ่านแล้ว
 *   - ระดับถัดไป = คิด % จากยอดผลงานที่รับรองแล้ว เทียบเกณฑ์ใน DEFAULT_POSITIONS
 *   - ระดับที่เหลือ = ยังไม่เริ่ม (0%) ไม่แสดงตัวเลขที่ไม่จริง
 */

const RANK_TO_POSITION: Record<number, PositionId> = {
  1: 'agent' as PositionId,
  2: 'unit_manager' as PositionId,
  3: 'center_manager' as PositionId,
  4: 'region_manager' as PositionId,
};

interface Step {
  level: number;
  name: string;
  need: string;
  have: boolean;
  progress?: number;
  note?: string;
}

export default function ProgressView() {
  const [myRank, setMyRank] = useState<number | null>(null);
  const [fyc, setFyc] = useState(0);
  const [teamNote, setTeamNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // ระดับปัจจุบันของผู้ใช้ที่ล็อกอิน (API อ่านจาก DB ไม่ใช่ค่าในโทเคน)
        const sr = await fetch('/api/income/summary', { credentials: 'include' });
        const sj = await sr.json();
        // ยอดผลงานที่รับรองแล้ว — ถ้าไม่มีข้อมูลให้ถือเป็น 0 (ไม่เดายอด)
        const tx = Array.isArray(sj?.transactions) ? sj.transactions : [];
        const sum = tx.reduce((a: number, t: any) => a + Number(t?.amount || t?.approvedAmount || 0), 0);
        if (mounted) { setMyRank(typeof sj?.rank === 'number' ? sj.rank : null); setFyc(sum); }

        // ขนาดทีม (ข้อมูลประกอบ) — นับจากทะเบียนสมาชิกจริง
        const mr = await fetch('/api/members', { credentials: 'include' });
        const mj = await mr.json();
        const list = Array.isArray(mj?.members) ? mj.members : [];
        const active = list.filter((m: any) => String(m?.status || '').toLowerCase() === 'active').length;
        if (mounted) setTeamNote(`สมาชิกในทะเบียน ${list.length} คน (ใช้งานอยู่ ${active} คน)`);
      } catch {
        if (mounted) setTeamNote(null);
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const rank = myRank ?? 0;

  const steps: Step[] = RANK_CATALOG.map((r) => {
    const pos = RANK_TO_POSITION[r.level];
    const qual = pos ? DEFAULT_POSITIONS.find((p) => p.id === pos)?.qualification : undefined;
    const minFyc = Number(qual?.minFyc || 0);
    const need = qual?.description || r.description;
    const have = r.level <= rank;

    if (have) return { level: r.level, name: r.nameTh, need, have: true };

    // ระดับถัดไปจากสถานะปัจจุบัน = ระดับที่กำลังไต่; ถัดจากนั้นไป = ยังไม่เริ่ม
    const isNext = r.level === rank + 1;
    const base = isNext && minFyc > 0 ? Math.min(100, Math.round((fyc / minFyc) * 100)) : 0;
    const sep = (qual as any)?.requiredSeparations;
    const note = isNext && sep
      ? `ยังไม่มี${sep.positionId === 'unit_manager' ? 'หน่วย' : 'ศูนย์'}ที่แยกครบ ${sep.count} ${sep.positionId === 'unit_manager' ? 'หน่วย' : 'ศูนย์'}`
      : undefined;
    return { level: r.level, name: r.nameTh, need, have: false, progress: base, note };
  });

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">ความก้าวหน้า ⬆</h1>
            <span className="badge-demo">เส้นทางตำแหน่ง</span>
            {loaded && <span className="text-xs text-slate-500">ปัจจุบัน: {RANK_CATALOG.find((r) => r.level === rank)?.nameTh || '—'}</span>}
          </div>
          <div className="card p-5">
            <div className="text-sm font-semibold text-[#475569]">Progress ไปตำแหน่งถัดไป</div>
            <div className="mt-1 text-xs text-slate-500">
              เกณฑ์และบันไดตำแหน่งดึงจากโปรแกรม (rank catalog) • คิดจากยอดที่รับรองแล้ว {fyc.toLocaleString('th-TH')} บาท
              {teamNote ? ` • ${teamNote}` : ''}
            </div>
            <div className="mt-4 space-y-3">
              {steps.map((s, i) => (
                <div key={s.name} className={`p-4 rounded-xl border flex items-center gap-4 ${s.have ? 'bg-emerald-50 border-emerald-200' : 'bg-white'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.have ? 'bg-emerald-600 text-white' : 'bg-[#475569] text-white'}`}>{i + 1}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">
                      {s.name} {s.have && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white">ผ่านแล้ว</span>}
                    </div>
                    <div className="text-xs text-slate-500">{s.need}</div>
                    {s.note && <div className="text-[11px] text-amber-600 mt-1">{s.note}</div>}
                    {!s.have && s.progress !== undefined && (
                      <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-2 bg-[#c8a84e] rounded-full" style={{ width: `${s.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{s.have ? '✓' : `${s.progress || 0}%`}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">เงื่อนไขปรับได้โดย Admin • ต้องผ่านผู้มีอำนาจอนุมัติ • แสดงสิ่งที่ยังขาดชัดเจน</p>
          </div>

          {/* ── ต่อลงมา: โมเดลธุรกิจตัวแทนประกันชีวิต (รายได้ 2 ทาง) ── */}
          <BusinessModelBoard />
        </main>
      </div>
    </div>
  );
}
