'use client';
import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// LineOaCard — การ์ด "แอด LINE OA แล้วคุยกับทีมงานผ่านมือถือ"
//
// ทำไมมี QR + ปุ่ม:
//   • คนที่เปิดเว็บจากคอม = สแกน QR ด้วยมือถือ → เด้งเข้าแอป LINE → กดเพิ่มเพื่อน
//   • คนที่เปิดจากมือถืออยู่แล้ว = กดปุ่ม "เพิ่มเพื่อน" ได้เลย (ข้าม QR)
//   • ปุ่มหัวข้อย่อย = deep link เข้าห้องแชทของ OA พร้อมข้อความตั้งต้น
//     (https://line.me/R/oaMessage/<oa-id>/?<ข้อความ>) → สมาชิกไม่ต้องพิมพ์เอง
//
// ข้อกำหนดความปลอดภัย: หน้านี้เป็นสาธารณะ ไม่มี token/ความลับใด ๆ อยู่ในคอมโพเนนต์นี้
// ─────────────────────────────────────────────────────────────────────────────

export const LINE_OA_ID = '@923jrlgz';
export const LINE_OA_ADD_URL = `https://line.me/R/ti/p/${LINE_OA_ID}`;
export const LINE_OA_QR_SRC = '/line-oa-qr.png';
export const LINE_OA_CHAT_URL = (text: string) =>
  `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(text)}`;

export const LINE_OA_TOPICS: { icon: string; label: string; text: string }[] = [
  { icon: '💰', label: 'สอบถามรายได้/ค่าคอม', text: 'สวัสดีครับ/ค่ะ ต้องการสอบถามเรื่องรายได้และค่าคอมมิชชั่น' },
  { icon: '🤝', label: 'สมัครเป็นตัวแทน', text: 'สวัสดีครับ/ค่ะ ต้องการสมัครเป็นตัวแทนประกัน' },
  { icon: '🛠', label: 'แจ้งปัญหาการใช้ระบบ', text: 'สวัสดีครับ/ค่ะ พบปัญหาการใช้งานระบบ ขอความช่วยเหลือ' },
];

export default function LineOaCard({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(LINE_OA_ADD_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard ถูกบล็อก — ไม่เป็นไร ปุ่มอื่นยังใช้ได้ */ }
  }

  return (
    <div className="rounded-2xl border border-[#06C755]/30 bg-[#f2fdf5] p-4 md:p-5">
      <div className="flex flex-col md:flex-row gap-5">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LINE_OA_QR_SRC}
            alt={`QR แอด LINE OA ${LINE_OA_ID}`}
            width={compact ? 132 : 160}
            height={compact ? 132 : 160}
            className="rounded-xl bg-white p-1.5 border border-[#06C755]/25"
          />
          <div className="text-[11px] text-slate-500 text-center leading-snug">
            สแกนด้วยกล้องมือถือ<br />เพื่อแอดเพื่อน OA
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800">💬 คุยกับทีมงานผ่าน LINE OA</div>
          <div className="text-xs text-slate-500 mt-1 leading-relaxed">
            แอดเพื่อน OA แล้วคุยผ่านมือถือได้ทันที — สอบถามรายได้ สมัครเป็นตัวแทน หรือแจ้งปัญหาการใช้ระบบ
            (ทีมงานตอบกลับพร้อม AI ผู้ช่วยอัตโนมัติ)
          </div>

          <a
            href={LINE_OA_ADD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center gap-2 w-full md:w-auto px-4 py-2.5 rounded-xl bg-[#06C755] text-white text-sm font-semibold hover:brightness-95"
          >
            ➕ เพิ่มเพื่อน LINE OA ({LINE_OA_ID})
          </a>

          <div className="mt-3">
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">หรือกดหัวข้อเพื่อเปิดแชทพร้อมข้อความตั้งต้น (เปิดจากมือถือ)</div>
            <div className="flex flex-wrap gap-2">
              {LINE_OA_TOPICS.map(t => (
                <a
                  key={t.label}
                  href={LINE_OA_CHAT_URL(t.text)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-full border border-[#06C755]/40 bg-white text-xs text-slate-700 hover:bg-[#06C755]/10"
                >
                  {t.icon} {t.label}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={copyLink}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
            >
              {copied ? '✅ คัดลอกลิงก์แล้ว' : '🔗 คัดลอกลิงก์ OA ส่งให้คนอื่น'}
            </button>
            <span className="text-[11px] text-slate-400">
              {isMobile ? 'แตะปุ่มเขียวได้เลย ไม่ต้องสแกน QR' : 'เปิดจากคอม: สแกน QR ด้วยมือถือ'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
