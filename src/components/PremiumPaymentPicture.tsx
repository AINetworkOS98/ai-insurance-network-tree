'use client';

// "ภาพการจ่ายเบี้ย" — แถบปีที่ชำระเบี้ย + แถบความคุ้มครอง ให้เห็นเป็นภาพในใบโครงการแต่ละแบบ
// ตัวเลขเป็นตัวอย่าง (เบี้ยต่อปีสมมติ) จำนวนปีมาจากเงื่อนไขในตารางค่าคอม/ชื่อแบบ
const fmt = (n: number) => Number(n || 0).toLocaleString('th-TH');

export default function PremiumPaymentPicture({
  payYears, premium, cover, assumed, rider,
}: { payYears: number; premium: number; cover: number; assumed?: boolean; rider?: boolean }) {
  const years = Math.min(Math.max(1, Math.round(payYears || 10)), 30);
  const total = Math.round(premium * years);
  const W = 340, H = 96;
  const x0 = 8, x1 = W - 8;
  const payW = (x1 - x0) * 0.62;          // สัดส่วนแถบชำระเบี้ยในภาพ
  const cellW = payW / years;

  return (
    <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/50 p-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-semibold text-navy">ภาพการจ่ายเบี้ย</span>
        <span className="text-slate-500">
          ชำระ {years} ปี {assumed ? '(จำนวนปีสมมติ)' : '(ตามเงื่อนไขตาราง)'}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-1" role="img"
        aria-label={`จ่ายเบี้ยปีละ ${fmt(premium)} บาท ${years} ปี รวม ${fmt(total)} บาท ความคุ้มครอง ${fmt(cover)} บาท`}>
        {/* แถบความคุ้มครอง */}
        <rect x={x0} y={6} width={x1 - x0} height={16} rx={3} fill="#dbeafe" />
        <text x={x0 + 6} y={18} fontSize="9" fill="#1e3a8a" fontWeight="600">
          ความคุ้มครอง {fmt(cover)} บาท {rider ? '(ตามแผน/ต่อครั้ง)' : '(ตลอดสัญญา)'}
        </text>

        {/* แถบปีที่ชำระเบี้ย */}
        {Array.from({ length: years }).map((_, i) => (
          <rect key={i} x={x0 + i * cellW} y={30} width={Math.max(1, cellW - 1.5)} height={22} rx={2}
            fill="#1d4ed8" opacity={0.92} />
        ))}
        {/* ปีที่เหลือ (ไม่ต้องชำระ) — แสดงเป็นแถบเทาโปร่งให้เห็นว่าคุ้มครองต่อ */}
        <rect x={x0 + payW} y={30} width={x1 - (x0 + payW)} height={22} rx={2} fill="#e2e8f0" />
        <text x={x0 + payW + 6} y={45} fontSize="8.5" fill="#475569">คุ้มครองต่อ</text>

        {/* ป้ายปีที่ 1 และปีสุดท้าย */}
        <text x={x0 + 1} y={64} fontSize="8.5" fill="#334155">ปีที่ 1</text>
        <text x={x0 + payW - 30} y={64} fontSize="8.5" fill="#334155">ปีที่ {years}</text>
        <text x={x1 - 46} y={64} fontSize="8.5" fill="#334155">ครบสัญญา</text>

        {/* เส้นฐาน + จุดครบสัญญา */}
        <line x1={x0} y1={72} x2={x1} y2={72} stroke="#cbd5e1" strokeWidth="1" />
        <circle cx={x1 - 4} cy={72} r={4} fill="#0ea5e9" />
        <text x={x0} y={88} fontSize="9" fill="#0f172a">
          จ่ายปีละ {fmt(premium)} บาท × {years} ปี = รวม {fmt(total)} บาท
        </text>
      </svg>
      <div className="text-[10px] text-slate-500">
        ตัวเลขเบี้ยเป็นตัวอย่าง (แก้ช่อง "เบี้ยประกันต่อปี" ด้านบนได้) — จำนวนปีชำระจริงยืนยันกับตารางผลประโยชน์/ใบเสนอขาย
      </div>
    </div>
  );
}
