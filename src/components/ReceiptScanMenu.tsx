'use client';
// ReceiptScanMenu.tsx — เมนูย่อย "สแกนใบเสร็จ" บนแถบเมนูด้านบนขวา (Header)
// สั่งโดยเจ้าของระบบ: เพิ่มเมนูสแกนใบเสร็จ "บนขวา" เป็นเมนูย่อย (submenu) — ห้ามลบเมนูเดิม
// เมนูนี้เป็น "ทางลัด" รวมงานใบเสร็จทั้งหมดไว้ที่เดียว จึงปรากฏบนทุกหน้า รวมทั้ง
// /documents (สแกนใบเสร็จรับเงิน) และ /network/1x5-autopilot (ตรวจใบเสร็จ → เลื่อนตำแหน่ง)
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';

type Item = {
  href: string;
  icon: string;
  labelTh: string;
  labelEn: string;
  hint?: string;
  external?: boolean;
  needLogin?: boolean;
};

// ลำดับ: สแกนใบเสร็จ (หน้าหลัก) → หลักฐาน/ผลงาน → ตรวจใบเสร็จระบบ 1 แตก 5 → ตั้งค่าการรับเงิน → คู่มือ PDF
const ITEMS: Item[] = [
  { href: '/documents', icon: '📄', labelTh: 'สแกนใบเสร็จรับเงิน', labelEn: 'Scan receipt', hint: 'อัปโหลด / ถ่ายรูป / OCR', needLogin: true },
  { href: '/receipts', icon: '🧾', labelTh: 'หลักฐานและผลงาน', labelEn: 'Receipts & performance', needLogin: true },
  { href: '/network/1x5-autopilot', icon: '🧬', labelTh: 'ตรวจใบเสร็จ → ระบบ 1 แตก 5', labelEn: 'Receipts → 1×5 autopilot', needLogin: true },
  { href: '/receipts/settings', icon: '⚙', labelTh: 'ตั้งค่าการรับเงิน', labelEn: 'Receipt settings', hint: 'ระดับศูนย์ขึ้นไป', needLogin: true },
  { href: '/docs/net-1x5-autopilot.pdf', icon: '📕', labelTh: 'อ่าน PDF: สรุประบบ 1 แตก 5', labelEn: 'Read PDF: 1×5 system', external: true },
];

export default function ReceiptScanMenu({ className = '' }: { className?: string }) {
  const { lang, t } = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // ปิดเมนูเมื่อคลิกนอกกรอบ / กด Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = (it: Item) => (lang === 'en' ? it.labelEn : it.labelTh);

  return (
    <div ref={boxRef} className={`relative ${className}`} data-menu="receipt-scan">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors font-semibold"
      >
        <span className="text-base">🧾</span>
        <span className="text-sm">{t('sb_scan')}</span>
        <svg className="w-3.5 h-3.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[#e2e8f0] bg-white shadow-xl z-50 overflow-hidden" role="menu">
          <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs font-semibold text-slate-500 uppercase tracking-wider">
            🧾 {t('sb_scan')}
          </div>
          <div className="py-1">
            {ITEMS.map(it => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#eff6ff] hover:text-sky-700 transition-colors"
                {...(it.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="text-base">{it.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate">{label(it)}</span>
                  {it.hint && <span className="block text-[11px] text-slate-400">{it.hint}</span>}
                </span>
              </Link>
            ))}
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-400 bg-slate-50 border-t border-[#e2e8f0]">
            ใบเสร็จที่สแกนแล้วจะถูกตรวจเงื่อนไขและเลื่อนตำแหน่งอัตโนมัติ (ระบบ 1 แตก 5)
          </div>
        </div>
      )}
    </div>
  );
}

// เมนูย่อยแบบรายการ (ใช้ในเมนูมือถือของ Header)
export function ReceiptScanMobileItems({ onNavigate }: { onNavigate?: () => void }) {
  const { lang, t } = useT();
  const label = (it: Item) => (lang === 'en' ? it.labelEn : it.labelTh);
  return (
    <div className="mt-1 pt-2 border-t border-[#e2e8f0]">
      <div className="px-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">🧾 {t('sb_scan')}</div>
      {ITEMS.map(it => (
        <Link
          key={it.href}
          href={it.href}
          onClick={() => onNavigate?.()}
          className="block px-3 py-2.5 rounded-xl text-sm text-[#57534e] hover:bg-[#FCFBF6]"
          {...(it.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {it.icon} {label(it)}
        </Link>
      ))}
    </div>
  );
}
