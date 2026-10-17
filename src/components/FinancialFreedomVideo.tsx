'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useT } from '@/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// FinancialFreedomVideo — วิดีโอ + ระบบ AI Video Intelligence (หน้า /financial-freedom)
//
// 🌐 ฉบับสากล (international):
//   • เลือกไฟล์วิดีโอตามภาษาที่ผู้ใช้เลือกจากเมนูภาษา (LanguageMenu ของแอป)
//     - ไทย   → /financial-freedom.mp4      (ฉบับไทยเดิม)
//     - อื่น ๆ → /financial-freedom-intl.mp4 (ฉบับสากล · อังกฤษเป็นหลัก + บรรทัดไทย)
//   • มีคำบรรยาย .vtt สองภาษา (EN/TH) เปิด-ปิดได้จากปุ่ม CC ในตัวเล่น
//   • เนื้อหาตรงกับหน้าเว็บจริง: 3 ขั้นตอน (สมัครตัวแทน → แสดงความสนใจ → ส่งใบเสร็จ) + ระบบ 1 แตก 5
//
// หน้าที่:
//   • เล่นวิดีโอแนะนำเส้นทางอิสรภาพทางการเงิน (ไม่แตะหน้าตาเดิมของหน้า — เป็น section เพิ่ม)
//   • ต่อ SDK /video-intel.js เพื่อเก็บ event การรับชมแบบ anonymous (consent-gated)
//   • ถ้า API/n8n ล่ม วิดีโอยังเล่นได้ปกติ (SDK กลืน error ทั้งหมด)
//
// ความเป็นส่วนตัว: เก็บเฉพาะ Anonymous Visitor ID + พฤติกรรมการดูวิดีโอ
// ไม่เก็บชื่อ/อีเมล/อายุ/เพศ/รายได้/อาชีพ และไม่มีการจดจำใบหน้าหรือเสียง
// ─────────────────────────────────────────────────────────────────────────────

type ViStatus = {
  enabled?: boolean;
  visitor_id?: string;
  session_id?: string;
  sent?: number;
  failed?: number;
};

declare global {
  interface Window {
    AIN_VIDEO_INTEL?: any;
  }
}

const PAGE = '/financial-freedom';
const VIDEO_ID = 'financial-freedom-video';

type Edition = { src: string; poster: string; subEn: string; subTh: string };

// ฉบับสากล (อังกฤษเป็นหลัก) — ใช้เมื่อเลือกภาษาใด ๆ ที่ไม่ใช่ไทย
const INTL: Edition = {
  src: '/financial-freedom-intl.mp4',
  poster: '/financial-freedom-intl-poster.jpg',
  subEn: '/videos/financial-freedom-intl.en.vtt',
  subTh: '/videos/financial-freedom-intl.th.vtt',
};

// ฉบับไทย (เดิม)
const TH_ED: Edition = {
  src: '/financial-freedom.mp4',
  poster: '/financial-freedom-poster.jpg',
  subEn: '/videos/financial-freedom-intl.en.vtt',
  subTh: '/videos/financial-freedom-intl.th.vtt',
};

const COPY = {
  th: {
    badge: '🎥 วิดีโอสรุปเส้นทาง · 30 SECONDS',
    title: 'ดูภาพรวมก่อนตัดสินใจ',
    sub: 'THAI EDITION · 1080P',
    desc:
      'คลิป 30 วินาที สรุป 3 ขั้นตอนจริงของระบบ (สมัครตัวแทน → แสดงความสนใจ → ส่งใบเสร็จ) พร้อมระบบ 1 แตก 5 — กด CC ในตัวเล่นเพื่อเปิดคำบรรยาย EN/TH',
    hint: '💬 คำบรรยาย EN/TH เปิดได้ที่ปุ่ม CC · 🌐 เลือกภาษาอื่นที่เมนูมุมขวาบนเพื่อดูฉบับสากล',
  },
  en: {
    badge: '🎥 30-SECOND OVERVIEW · INTERNATIONAL EDITION',
    title: 'See the whole journey first',
    sub: 'EN PRIMARY · TH SUBTITLES · 1080P',
    desc:
      'A 30-second walkthrough of the real 3-step journey (become a prospective agent → register your interest → submit your receipt) and the 1-to-5 network engine — press CC for English or Thai subtitles.',
    hint: '💬 Subtitles EN/TH via the CC button · 🌐 Switch to ไทย in the language menu for the Thai edition.',
  },
};

export default function FinancialFreedomVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detachRef = useRef<{ detach: () => void } | null>(null);
  const { lang } = useT();
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<'granted' | 'denied' | null>(null);
  const [status, setStatus] = useState<ViStatus>({});
  const [seconds, setSeconds] = useState(0);

  const refresh = useCallback(() => {
    try {
      const vi = window.AIN_VIDEO_INTEL;
      if (!vi) return;
      setStatus(vi.status ? vi.status() : {});
      setConsent(vi.isGranted && vi.isGranted() ? 'granted' : null);
    } catch {
      /* ห้ามให้ระบบ tracking ทำให้หน้าพัง */
    }
  }, []);

  const wire = useCallback(() => {
    try {
      const vi = window.AIN_VIDEO_INTEL;
      if (!vi || !videoRef.current) return;
      vi.init({ page: PAGE, video_id: VIDEO_ID });
      if (detachRef.current) detachRef.current.detach();
      detachRef.current = vi.attach(videoRef.current, { page: PAGE, video_id: VIDEO_ID });
      setReady(true);
      refresh();
    } catch {
      /* วิดีโอยังต้องเล่นได้ */
    }
  }, [refresh]);

  useEffect(() => {
    if (window.AIN_VIDEO_INTEL) wire();
    const t = setInterval(() => {
      refresh();
      const v = videoRef.current;
      if (v && !v.paused) setSeconds(Math.round(v.currentTime || 0));
    }, 3000);
    return () => {
      clearInterval(t);
      try { detachRef.current?.detach(); } catch {}
    };
  }, [wire, refresh]);

  const granted = consent === 'granted';
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  // ฉบับที่แสดงตามภาษาที่เลือกจากเมนูภาษา: ไทย → ฉบับไทยเดิม · ภาษาอื่น → ฉบับสากล
  const isThai = lang === 'th';
  const edition = isThai ? TH_ED : INTL;
  const c = isThai ? COPY.th : COPY.en;

  return (
    <section className="max-w-4xl mx-auto mt-12">
      <Script src="/video-intel.js" strategy="afterInteractive" onLoad={wire} />

      <div className="mb-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 text-rose-700 text-sm font-semibold border border-rose-200">
          <span>{c.badge}</span>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">{c.title}</h2>
        <p className="mt-1.5 text-[11px] font-semibold tracking-[0.24em] text-slate-400">
          THREE REAL STEPS + 1-TO-5 NETWORK · {c.sub}
        </p>
        <p className="mt-2 text-slate-600 leading-relaxed">{c.desc}</p>
        <p className="mt-1.5 text-xs text-slate-500">{c.hint}</p>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          key={edition.src}
          ref={videoRef}
          src={edition.src}
          controls
          playsInline
          preload="metadata"
          poster={edition.poster}
          className="w-full aspect-video max-h-[70vh] bg-black object-contain"
          crossOrigin="anonymous"
        >
          <track kind="captions" src={edition.subEn} srcLang="en" label="English" default={!isThai} />
          <track kind="captions" src={edition.subTh} srcLang="th" label="ไทย" default={isThai} />
        </video>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${ready && granted ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          ระบบวิเคราะห์การรับชม: {ready ? (granted ? 'ทำงานอยู่ ( anonymous )' : 'ปิดอยู่') : 'กำลังเตรียม…'}
        </span>
        {granted && <span>· รับชม {mmss} · ส่งสัญญาณ {status.sent ?? 0} ครั้ง</span>}
      </div>

      {/* ── Consent + Privacy Notice ─────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-sm font-bold text-slate-800">🔒 ความเป็นส่วนตัวของข้อมูลการรับชม</h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          หน้านี้เก็บข้อมูล <strong>การใช้งานเว็บไซต์และการรับชมวิดีโอ</strong> เพื่อปรับปรุงเนื้อหาและวิเคราะห์ว่า
          ส่วนใดมีประโยชน์จริง โดยใช้ <strong>Anonymous Visitor ID</strong> ที่สุ่มขึ้นในเบราว์เซอร์ของคุณเท่านั้น —
          เราไม่เก็บชื่อ อีเมล อายุ เพศ รายได้ หรืออาชีพ และ<strong>ไม่มีการจดจำใบหน้าหรือวิเคราะห์อารมณ์จากภาพ/เสียง</strong>
          หากไม่กดยินยอม ระบบจะไม่บันทึกข้อมูลใด ๆ และวิดีโอยังเล่นได้ตามปกติ
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {granted ? (
            <button
              type="button"
              onClick={() => { try { window.AIN_VIDEO_INTEL?.revoke(); } catch {} setConsent(null); refresh(); }}
              className="px-4 py-2 rounded-full text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-white"
            >
              ถอนความยินยอม
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { try { window.AIN_VIDEO_INTEL?.grant(); } catch {} setConsent('granted'); refresh(); }}
              className="px-4 py-2 rounded-full text-sm font-semibold bg-[#475569] text-white hover:bg-slate-800"
            >
              ยินยอมให้วิเคราะห์การรับชม
            </button>
          )}
          <button
            type="button"
            onClick={() => { try { window.AIN_VIDEO_INTEL?.deny(); } catch {} setConsent(null); refresh(); }}
            className="px-4 py-2 rounded-full text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-white"
          >
            ไม่ยินยอม
          </button>
          <span className="text-xs text-slate-500">
            เปลี่ยนใจได้ทุกเมื่อ · การถอนความยินยอมหยุดการเก็บข้อมูลทันที
          </span>
        </div>
      </div>
    </section>
  );
}
