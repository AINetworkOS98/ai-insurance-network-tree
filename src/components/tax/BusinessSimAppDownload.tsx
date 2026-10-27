'use client';
import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// การ์ด "ดาวน์โหลดแอปผลประกอบการ (Keyman)" — แสดงในเมนูคำนวณภาษี (แท็บผลประกอบการ)
// สมาชิกทั่วไปทุกระดับ (minRank 0) ดาวน์โหลด APK ไปใช้เองได้ ไม่ต้องขอสิทธิ์
// ตัวเลขเวอร์ชัน/ขนาด/แฮช อ่านจาก /apk/business-sim-release.json (ไฟล์จริงบน public)
// ─────────────────────────────────────────────────────────────────────────────

type ApkInfo = { url?: string; downloadUrl?: string; sizeText?: string; sha256?: string; version?: string };
type Manifest = {
  app?: { name?: string; version?: string };
  apk?: { primary?: ApkInfo; legacy?: ApkInfo; universal?: ApkInfo };
  releasedAt?: string;
  platform?: { android?: { minOs?: string }; ios?: { note?: string } };
};

const FALLBACK_URL = '/apk/business-sim.apk';
const FALLBACK_LEGACY = '/apk/business-sim-legacy.apk';

export default function BusinessSimAppDownload() {
  const [m, setM] = useState<Manifest | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/apk/business-sim-release.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setM(j as Manifest); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const primary = m?.apk?.primary;
  const legacy = m?.apk?.legacy || m?.apk?.universal;
  const url = primary?.downloadUrl || primary?.url || FALLBACK_URL;
  const urlLegacy = legacy?.downloadUrl || legacy?.url || FALLBACK_LEGACY;
  const version = primary?.version || m?.app?.version || '1.0.0';
  const size = primary?.sizeText || '—';
  const sha = primary?.sha256 || '';
  const released = m?.releasedAt
    ? new Date(m.releasedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  return (
    <section id="bussim-app-download" className="card p-5 border-2 border-[#475569]/20 bg-gradient-to-br from-white to-slate-50">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#334155] text-white grid place-items-center text-2xl shrink-0">📊</div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-[#475569]">แอปผลประกอบการ (Keyman Business Result)</h2>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              ฟรี · สมาชิกทั่วไปดาวน์โหลดได้
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            กรอกข้อมูลลูกค้าแล้วเทียบ <b>3 สถานการณ์</b> — ก่อนวางแผน · วางแผน (จ่ายเบี้ย) · บริษัทออกภาษีให้ทุกทอด
            เห็นทั้ง<b>ภาษีกรรมการ (ภ.ง.ด.90/91)</b> <b>งบการเงิน–ภาษีนิติบุคคล (ภ.ง.ด.50)</b>
            ภาษีที่ประหยัดได้ ต้นทุนสุทธิของบริษัท และสรุปหลายปี — ใช้<b>ออฟไลน์ได้ 100%</b> ไม่ต้องล็อกอิน (PDPA-safe)
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2 text-[10.5px]">
            {[
              'ออฟไลน์ 100%',
              'สูตรเดียวกับเว็บ (ชุดทดสอบ 6 กรณี)',
              'ปีภาษี 2569',
              'Gross-up ภาษี ป.96/2543',
              'จำข้อมูลลูกค้าในเครื่อง',
              'ไม่ต้องสมัครใหม่',
            ].map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full border bg-white text-slate-600">{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">สำหรับ Android (ติดตั้งได้ทันที)</div>
          <a
            href={url}
            download
            className="mt-2 inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-[#475569] text-white text-sm font-bold hover:opacity-90"
          >
            ⤓ ดาวน์โหลด APK · {size}
          </a>
          <a href={urlLegacy} download className="mt-2 block text-center text-[11.5px] text-sky-700 underline">
            มือถือรุ่นเก่า (32-bit) → ไฟล์สำรอง {legacy?.sizeText ? `· ${legacy.sizeText}` : ''}
          </a>
          <div className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
            เวอร์ชัน {version}{released ? ` · อัปเดต ${released}` : ''}
            {sha ? <> · SHA-256 <code className="text-[10px] text-slate-500 break-all">{sha}</code></> : null}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">สำหรับ iPhone / iPad</div>
          <ol className="mt-2 text-[11.5px] text-slate-600 space-y-1 list-decimal list-inside">
            <li>เปิดหน้านี้ใน Safari</li>
            <li>กดปุ่ม “แชร์” → “เพิ่มไปที่หน้าจอโฮม”</li>
            <li>เปิดจากไอคอนบนหน้าจอ — ใช้ได้เหมือนแอป</li>
          </ol>
          <div className="mt-2 text-[10.5px] text-slate-400">
            เวอร์ชัน iOS (.ipa) ต้องเซ็นผ่าน Apple Developer — ระหว่างนี้ใช้วิธีเพิ่มไปที่หน้าจอโฮมที่ให้ผลเหมือนกัน
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 border p-3 text-[11.5px] text-slate-600">
        <b className="text-slate-700">วิธีติดตั้ง APK (ครั้งแรกครั้งเดียว):</b>{' '}
        แตะไฟล์ที่ดาวน์โหลด → “ติดตั้ง” → ถ้าเครื่องเตือน ให้เปิด “อนุญาตจากแหล่งที่มานี้” (Install unknown apps)
        เฉพาะเบราว์เซอร์ที่ใช้ดาวน์โหลด → เปิดแอป “ผลประกอบการ” ได้เลย (ไม่ต้องใช้เน็ตหลังจากนี้)
        รองรับ {m?.platform?.android?.minOs || 'Android 7.0 (API 24) ขึ้นไป'}
      </div>

      <div className="mt-3 text-[11px] text-slate-400">
        ตรวจไฟล์ก่อนติดตั้งได้จาก SHA-256 ด้านบน · ตัวเลขในแอปเป็นการประมาณการเพื่อวางแผน
        ควรตรวจสอบกับกรมสรรพากร (โทร. 1161) หรือผู้สอบบัญชีก่อนตัดสินใจ
      </div>
    </section>
  );
}
