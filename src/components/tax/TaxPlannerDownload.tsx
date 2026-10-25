'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// การ์ด "ดาวน์โหลดโปรแกรมคำนวณภาษี 2569" — แสดงในเมนูคำนวณภาษี (แท็บภาษีบุคคลธรรมดา)
// เปิดให้สมาชิกทั่วไปทุกระดับ (minRank 0) ดาวน์โหลดได้เอง ไม่ต้องขอสิทธิ์
//
// ข้อมูลเวอร์ชัน/ขนาด/แฮช อ่านจาก /apk/thai-tax-planner-release.json (ไฟล์จริงบน public)
// → เมื่อ build APK ใหม่แล้วอัปเดตไฟล์ JSON นี้ ตัวเลขบนหน้าเว็บจะเปลี่ยนตามทันที
// ─────────────────────────────────────────────────────────────────────────────

type ApkInfo = { url?: string; downloadUrl?: string; sizeText?: string; sha256?: string; version?: string };
type Manifest = {
  app?: { name?: string; version?: string };
  apk?: { primary?: ApkInfo; legacy?: ApkInfo; universal?: ApkInfo };
  releasedAt?: string;
  platform?: { android?: { minOs?: string }; ios?: { note?: string } };
};

const FALLBACK_URL = '/apk/thai-tax-planner.apk';
const FALLBACK_URL_ALL = '/apk/thai-tax-planner-legacy.apk';

export default function TaxPlannerDownload() {
  const [m, setM] = useState<Manifest | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/apk/thai-tax-planner-release.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setM(j as Manifest); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const primary = m?.apk?.primary;
  const legacy = m?.apk?.legacy || m?.apk?.universal;
  const url = primary?.downloadUrl || primary?.url || FALLBACK_URL;
  const urlAll = legacy?.downloadUrl || legacy?.url || FALLBACK_URL_ALL;
  const version = primary?.version || m?.app?.version || '1.0.0';
  const size = primary?.sizeText || '—';
  const sha = primary?.sha256 || '';
  const released = m?.releasedAt ? new Date(m.releasedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  return (
    <section id="tax-planner-download" className="card p-5 border-2 border-[#475569]/20 bg-gradient-to-br from-white to-slate-50">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#475569] text-white grid place-items-center text-2xl shrink-0">⤓</div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-[#475569]">โปรแกรมคำนวณภาษี 2569 (แอปมือถือ)</h2>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              ฟรี · สมาชิกทั่วไปดาวน์โหลดได้
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90/91) สำหรับ Android — ใช้<b>ออฟไลน์ได้ 100%</b> ไม่ต้องล็อกอิน
            กรอกแล้วเห็นผลทันทีในเครื่อง ข้อมูลไม่ถูกส่งขึ้นเซิร์ฟเวอร์ (PDPA-safe)
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2 text-[10.5px]">
            {['ออฟไลน์ 100%', 'ปีภาษี 2569', 'สูตรเดียวกับเว็บ (ผ่านชุดทดสอบ 23 กรณี)', 'เก็บข้อมูลในเครื่อง', 'ไม่ต้องสมัครใหม่'].map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full border bg-white text-slate-600">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ปุ่มดาวน์โหลด */}
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
          <a href={urlAll} download className="mt-2 block text-center text-[11.5px] text-sky-700 underline">
            มือถือรุ่นเก่า (32-bit) → ดาวน์โหลดไฟล์สำรอง {legacy?.sizeText ? `· ${legacy.sizeText}` : ''}
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

      {/* วิธีติดตั้ง */}
      <div className="mt-3 rounded-2xl bg-slate-50 border p-3 text-[11.5px] text-slate-600">
        <b className="text-slate-700">วิธีติดตั้ง APK (ครั้งแรกครั้งเดียว):</b>{' '}
        แตะไฟล์ที่ดาวน์โหลด → “ติดตั้ง” → ถ้าเครื่องเตือน ให้เปิด “อนุญาตจากแหล่งที่มานี้” (Install unknown apps) เฉพาะเบราว์เซอร์ที่ใช้ดาวน์โหลด → เปิดแอป “คำนวณภาษี 2569” ได้เลย
        (ไม่ต้องใช้เน็ตหลังจากนี้)
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <Link href="/download" className="px-3 py-1.5 rounded-full border bg-white text-slate-600 font-semibold">
          ดูหน้าแอปสมาชิก (NAVI Agent) →
        </Link>
        <span className="text-slate-400">
          ตรวจไฟล์ก่อนติดตั้งได้จาก SHA-256 ด้านบน · สงสัยการใช้งาน โทร. 1161 (กรมสรรพากร) หรือสอบถามทีมงานผ่าน LINE OA
        </span>
      </div>
    </section>
  );
}
