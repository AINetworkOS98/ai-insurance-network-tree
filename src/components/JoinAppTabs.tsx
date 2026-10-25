'use client';
// JoinAppTabs — เมนูย่อย 2 เมนูของกลุ่มหน้า "เข้าระบบ/โหลดแอป"
//   1) สมาชิกทั่วไป → /join   (แบบฟอร์มขอเข้าใช้ระบบเดิม — ไม่ถูกแก้ไข)
//   2) ดาวน์โหลดแอป → /download (หน้าใหม่: APK Android + วิธีติดตั้ง iPhone)
// ใช้ร่วมกันทั้ง 2 หน้า เพื่อให้ผู้ใช้สลับไปมาได้ตลอด และไม่ทับเส้นทางเดิมของเว็บ
import Link from 'next/link';

export default function JoinAppTabs({ active }: { active: 'join' | 'download' }) {
  const items = [
    { key: 'join', href: '/join', label: 'สมาชิกทั่วไป', icon: '👤', hint: 'สมัคร/ขอเข้าใช้ระบบ' },
    { key: 'download', href: '/download', label: 'ดาวน์โหลดแอป', icon: '📲', hint: 'Android APK · iPhone' },
  ] as const;

  return (
    <nav aria-label="เมนูย่อย" className="mb-3">
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-[#dbeafe] bg-[#f0f7ff] p-1.5">
        {items.map((it) => {
          const on = it.key === active;
          return (
            <Link
              key={it.key}
              href={it.href}
              aria-current={on ? 'page' : undefined}
              className={
                'rounded-xl px-3 py-2 text-center transition ' +
                (on
                  ? 'bg-[#1d4ed8] text-white shadow-sm'
                  : 'text-[#334155] hover:bg-white')
              }
            >
              <span className="block text-[12.5px] font-bold leading-tight">
                <span className="mr-1">{it.icon}</span>
                {it.label}
              </span>
              <span className={'block text-[10px] ' + (on ? 'text-white/80' : 'text-slate-500')}>
                {it.hint}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
