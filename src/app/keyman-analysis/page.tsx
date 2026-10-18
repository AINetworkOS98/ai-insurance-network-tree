'use client';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * หน้าเปรียบเทียบรูปแบบการทำประกันคีย์แมน (Keyman Analysis)
 * - ลิงก์มาจากแท็บ "ผลประกอบการ (Keyman)" ใน /prospects?tab=sim
 * - PDPA: ใช้เฉพาะ "ข้อมูลนิติบุคคล" (รายได้/กำไร/ภาระผูกพัน) — ไม่มีชื่อ-อีเมล-เบอร์-เลขบัตร
 *   ของกรรมการ/ผู้บริหาร/ผู้เอาประกัน
 * - ตัวอย่างบริษัท 100 ราย ดึงผ่าน /api/keyman/examples (ต้องล็อกอิน) — ไม่ฝังในหน้าเว็บสาธารณะ
 */

type FormOpt = {
  key: string;
  label: string;
  note: string;
  term: string;
  mult: number;
  cashValue: string;
  tax: string;
  fit: string;
};

type ExampleRow = { i: number; n: string; r: string; p: string; b: string; y66: number; y67: number; y68: number };

const FORMS: FormOpt[] = [
  { key: 'term', label: '1. Term Life (ชั่วระยะเวลา)', note: 'เบี้ยต่ำสุดต่อทุนประกัน เน้นคุ้มครองล้วน', term: '1 ปี (ต่ออายุได้ถึงอายุจำกัด)', mult: 1.0, cashValue: 'ไม่มี', tax: 'ตามเงื่อนไข ป.96/2543', fit: 'ทดแทนกำไรช่วงเปลี่ยนผ่าน / ภาระหนี้' },
  { key: 'whole', label: '2. Whole Life (ตลอดชีพ)', note: 'คุ้มครองตลอดชีวิต มีเงินสำรอง/มูลค่าเวนคืน', term: 'ตลอดชีพ', mult: 3.5, cashValue: 'มี (สะสมตามกรมธรรม์)', tax: 'ตามเงื่อนไข ป.96/2543', fit: 'คุมต้นทุนระยะยาว + มีสินทรัพย์ในกรมธรรม์' },
  { key: 'endo', label: '3. Endowment / สะสมทรัพย์', note: 'มีเงินคืนระหว่างทาง สภาพคล่องสูง แต่ทุนต่อเบี้ยต่ำ', term: '10–20 ปี', mult: 6.0, cashValue: 'มี (เงินคืนเป็นงวด)', tax: 'ตามเงื่อนไข ป.96/2543', fit: 'ต้องการสภาพคล่อง/แผนภาษีส่วนบุคคล มากกว่าคุ้มครองล้วน' },
  { key: 'group', label: '4. ประกันกลุ่มผู้บริหาร (Group Life)', note: 'เบี้ยถูกที่สุด ผูกกับสถานะพนักงาน ปรับวงเงินรายปีได้', term: 'ปีต่อปี (ต่ออายุทั้งกลุ่ม)', mult: 0.4, cashValue: 'ไม่มี', tax: 'ตามเงื่อนไข (ค่าใช้จ่ายพนักงาน)', fit: 'เสริมความคุ้มครองให้ทีมผู้บริหารทั้งชุด' },
];

const money = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0');

const PDPA_RULES = [
  'แสดงเฉพาะข้อมูลนิติบุคคล — ไม่แสดง/ไม่บันทึกชื่อ-นามสกุล ที่อยู่ อีเมล เบอร์โทร เลขบัตรประชาชน ของกรรมการ ผู้บริหาร หรือผู้เอาประกัน',
  'ห้ามป้อนข้อมูลอ่อนไหว (สุขภาพ ผลตรวจรักษา ศาสนา ความเห็นทางการเมือง ฯลฯ) ตามมาตรา 26 — ใช้เฉพาะข้อมูลที่จำเป็นต่อการประเมินวงเงิน',
  'ข้อมูลตัวอย่างบริษัทเก็บฝั่งเซิร์ฟเวอร์และส่งผ่าน API ที่ต้องล็อกอินเท่านั้น — ไม่ฝังในไฟล์หน้าเว็บสาธารณะ และไม่ส่งข้อมูลผู้ใช้ไปยังบุคคลที่สาม',
  'ต้องมีฐานทางกฎหมายก่อนติดต่อ (สัญญา/ความยินยอม/ประโยชน์โดยชอบด้วยกฎหมาย) และต้องมีช่องทางถอนความยินยอมทุกครั้ง',
  'ห้ามนำรายชื่อบุคคลไปประกอบโปรไฟล์เพื่อยิงโฆษณา หรือส่งต่อให้บุคคลที่สามโดยไม่ได้รับความยินยอม',
  'เก็บเท่าที่จำเป็น กำหนดอายุการเก็บ และลบเมื่อหมดความจำเป็น (Data Minimization / Retention)',
];

export default function KeymanAnalysisPage() {
  const [profit, setProfit] = useState<number>(1500000);
  const [years, setYears] = useState<number>(3);
  const [debt, setDebt] = useState<number>(0);
  const [basePerMillion, setBasePerMillion] = useState<number>(12000);

  // ตัวอย่างบริษัท — ดึงจาก API ที่ต้องล็อกอิน (ไม่ฝังข้อมูลใน bundle)
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>('');

  const cover = Math.max(0, profit * years + debt);

  const rows = useMemo(
    () =>
      FORMS.map((f) => {
        const premium = (cover / 1_000_000) * basePerMillion * f.mult;
        return {
          ...f,
          premium,
          perMillion: cover > 0 ? premium / (cover / 1_000_000) : 0,
        };
      }),
    [cover, basePerMillion]
  );

  const cheapest = rows.reduce((a, b) => (a.premium <= b.premium ? a : b), rows[0]);
  const priciest = rows.reduce((a, b) => (a.premium >= b.premium ? a : b), rows[0]);
  const spread = cheapest.premium > 0 ? priciest.premium / cheapest.premium : 0;

  const loadExamples = useCallback(async (offset: number, limit: number, mode: 'replace' | 'append') => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/keyman/examples?offset=${offset}&limit=${limit}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? 'ต้องเข้าสู่ระบบก่อนดูรายชื่อบริษัทตัวอย่าง (ข้อมูลสงวนสิทธิ์สำหรับสมาชิก)'
            : `โหลดข้อมูลไม่สำเร็จ (${res.status})`
        );
      }
      const j = await res.json();
      setTotal(Number(j.total) || 0);
      const next: ExampleRow[] = Array.isArray(j.rows) ? j.rows : [];
      setExamples((prev) => (mode === 'append' ? [...prev, ...next] : next));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExamples(0, 10, 'replace');
  }, [loadExamples]);

  const hasMore = examples.length < total;

  return (
    <>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[#475569]">🛡 Keyman Analysis — เปรียบเทียบรูปแบบการทำประกันคีย์แมน</h1>
            <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">PDPA-safe · คำนวณในเครื่อง</span>
            <div className="ml-auto">
              <Link href="/prospects?tab=sim" className="px-4 py-2 rounded-full border bg-white text-sm text-slate-600 hover:bg-slate-50">
                ← กลับไปผลประกอบการ
              </Link>
            </div>
          </div>

          <div className="card p-4 space-y-1">
            <div className="text-sm text-slate-600">
              กรอกข้อมูล <b>ระดับนิติบุคคล</b> เพื่อเทียบสัดส่วนเบี้ยระหว่าง 4 รูปแบบ — ตัวเลขเบี้ยเป็น <b>ประมาณการ</b> จาก
              &ldquo;ตัวคูณสมมติ&rdquo; × เบี้ยฐานที่กำหนด <b>ไม่ใช่ใบเสนอราคา</b>
            </div>
            <div className="text-xs text-slate-500">
              เบี้ยจริงขึ้นกับอายุ สุขภาพ อาชีพ ประวัติการเคลม และเงื่อนไขของบริษัทประกัน · การหักภาษีต้องเข้าเงื่อนไข ป.96/2543
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="card p-4 block">
              <span className="text-xs text-slate-500">กำไรสุทธิต่อปี (บาท)</span>
              <input type="number" value={profit} min={0} step={100000} onChange={(e) => setProfit(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="card p-4 block">
              <span className="text-xs text-slate-500">ปีที่ต้องทดแทนกำไร</span>
              <input type="number" value={years} min={1} max={10} step={1} onChange={(e) => setYears(Number(e.target.value) || 1)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="card p-4 block">
              <span className="text-xs text-slate-500">หนี้/ภาระค้ำประกัน (บาท)</span>
              <input type="number" value={debt} min={0} step={100000} onChange={(e) => setDebt(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="card p-4 block">
              <span className="text-xs text-slate-500">เบี้ยฐานต่อทุน 1 ล้าน/ปี (บาท)</span>
              <input type="number" value={basePerMillion} min={1000} step={500} onChange={(e) => setBasePerMillion(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="card p-4">
            <div className="text-xs text-slate-500">ทุนประกันที่ต้องมี (กำไร × ปีทดแทน + ภาระค้ำประกัน)</div>
            <div className="text-2xl font-bold text-[#475569]">{money(cover)} บาท</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm bg-white rounded-xl overflow-hidden">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left p-3">รูปแบบ</th>
                  <th className="text-right p-3">เบี้ยประมาณ/ปี</th>
                  <th className="text-right p-3">ต่อทุน 1 ล้าน</th>
                  <th className="text-left p-3">ระยะคุ้มครอง</th>
                  <th className="text-left p-3">มูลค่าเวนคืน</th>
                  <th className="text-left p-3">หักภาษีนิติบุคคล</th>
                  <th className="text-left p-3">เหมาะกับ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-3">
                      <div className="font-semibold text-[#475569]">{r.label}</div>
                      <div className="text-xs text-slate-500">{r.note}</div>
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">{money(r.premium)}</td>
                    <td className="p-3 text-right tabular-nums text-slate-600">{money(r.perMillion)}</td>
                    <td className="p-3">{r.term}</td>
                    <td className="p-3">{r.cashValue}</td>
                    <td className="p-3 text-slate-600">{r.tax}</td>
                    <td className="p-3 text-slate-600">{r.fit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4 text-sm">
            <b>อ่านผล:</b> ทุนประกัน {money(cover)} บาท → ถูกสุดคือ <b>{cheapest.label}</b> ประมาณ{' '}
            <b>{money(cheapest.premium)} บาท/ปี</b> · แพงสุดคือ <b>{priciest.label}</b> ประมาณ{' '}
            <b>{money(priciest.premium)} บาท/ปี</b>
            {spread > 0 ? ` (ต่างกัน ${spread.toFixed(1)} เท่า)` : ''}
          </div>

          <div className="card p-4">
            <div className="font-semibold text-[#475569] mb-2">🔒 กฎข้อห้าม PDPA ที่หน้านี้บังคับใช้</div>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
              {PDPA_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          <div className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <div className="font-semibold text-[#475569]">📚 ตัวอย่างบริษัทที่มีกำไรต่อเนื่อง 3 ปี (ปีงบการเงิน 2566–2568)</div>
                <div className="text-xs text-slate-500">
                  คัดจากทะเบียน DBD ที่กำไรสุทธิเป็นบวกทั้ง 3 ปี (ไม่รวมบริษัทมหาชน) · แสดง {examples.length} จาก{' '}
                  {total || '…'} บริษัท
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">🔒 ข้อมูลนิติบุคคล · ต้องล็อกอิน</span>
            </div>

            {err ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {err}{' '}
                <button type="button" onClick={() => loadExamples(0, 10, 'replace')} className="underline font-semibold">
                  ลองใหม่
                </button>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">บริษัท</th>
                    <th className="text-left p-2">เลขทะเบียน</th>
                    <th className="text-left p-2">จังหวัด</th>
                    <th className="text-right p-2">กำไร 2566</th>
                    <th className="text-right p-2">กำไร 2567</th>
                    <th className="text-right p-2">กำไร 2568</th>
                    <th className="text-right p-2">ทุนคีย์แมนแนะนำ (3 ปี)</th>
                    <th className="text-center p-2">ใช้เป็นตัวอย่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {examples.map((c) => (
                    <tr key={c.r} className="border-t hover:bg-slate-50/60">
                      <td className="p-2 text-slate-400">{c.i}</td>
                      <td className="p-2">
                        <div className="font-medium text-[#475569]">{c.n}</div>
                        <div className="text-[11px] text-slate-400">{c.b}</div>
                      </td>
                      <td className="p-2 text-slate-500 tabular-nums">{c.r}</td>
                      <td className="p-2 text-slate-600">{c.p}</td>
                      <td className="p-2 text-right tabular-nums">{money(c.y66)}</td>
                      <td className="p-2 text-right tabular-nums">{money(c.y67)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{money(c.y68)}</td>
                      <td className="p-2 text-right tabular-nums text-sky-700">{money(c.y68 * 3)}</td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setProfit(Math.round(c.y68));
                            setYears(3);
                            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="px-3 py-1.5 rounded-full border bg-white text-xs text-[#475569] hover:bg-slate-100"
                        >
                          ใส่ในเครื่องคำนวณ ↑
                        </button>
                      </td>
                    </tr>
                  ))}
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-slate-400 text-sm">กำลังโหลดข้อมูล…</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {hasMore ? (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadExamples(examples.length, 10, 'append')}
                    className="px-5 py-2 rounded-full bg-[#475569] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    ดูตัวอย่างต่อไป (+10) →
                  </button>
                  <span className="text-xs text-slate-500">เหลืออีก {total - examples.length} บริษัท</span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadExamples(0, Math.max(total, 10), 'replace')}
                    className="px-4 py-2 rounded-full border bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    แสดงทั้งหมด {total} บริษัท
                  </button>
                </>
              ) : examples.length > 0 ? (
                <>
                  <span className="text-sm text-emerald-700 font-semibold">✅ แสดงครบทั้ง {total} บริษัทแล้ว</span>
                  <button
                    type="button"
                    onClick={() => loadExamples(0, 10, 'replace')}
                    className="px-4 py-2 rounded-full border bg-white text-sm text-slate-600 hover:bg-slate-50"
                  >
                    ↺ เริ่มดูใหม่ตั้งแต่ต้น
                  </button>
                </>
              ) : null}
            </div>

            <div className="text-xs text-slate-500">
              ที่มา: DBD DataWarehouse+ (กรมพัฒนาธุรกิจการค้า) · คัดเฉพาะนิติบุคคลที่กำไรสุทธิเป็นบวกทั้ง 2566/2567/2568 ·
              &ldquo;ทุนคีย์แมนแนะนำ&rdquo; = กำไรสุทธิ 2568 × 3 ปี (เกณฑ์ตัวอย่าง ปรับได้ในเครื่องคำนวณด้านบน) ·
              ไม่มีชื่อกรรมการ อีเมล เบอร์โทร หรือเลขบัตรของบุคคลใดในตารางนี้
            </div>
          </div>

          <div className="text-xs text-slate-500">
            หน้านี้ไม่มีข้อมูลส่วนบุคคลของผู้ใด · ใช้ประกอบการอธิบายลูกค้าเท่านั้น · ห้ามใช้เป็นคำแนะนำเฉพาะบุคคลโดยไม่ตรวจข้อเท็จจริง ·
            ไม่รับประกันผลตอบแทน · ห้ามสรุปว่าเบี้ยหักภาษีได้ทุกกรณี
          </div>
        </main>
      </div>
    </>
  );
}
