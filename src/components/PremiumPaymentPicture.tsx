'use client';

// "ภาพการจ่ายเบี้ย" — แถบปีที่ชำระเบี้ย + แถบความคุ้มครอง ให้เห็นเป็นภาพในใบโครงการแต่ละแบบ
// ตัวเลขเป็นตัวอย่าง (เบี้ยต่อปีสมมติ) จำนวนปีมาจากเงื่อนไขในตารางค่าคอม/ชื่อแบบ
const fmt = (n: number) => Number(n || 0).toLocaleString('th-TH');

export default function PremiumPaymentPicture({
  payYears, premium, cover, assumed, rider, cashback,
}: {
  payYears: number; premium: number; cover: number; assumed?: boolean; rider?: boolean;
  cashback?: { has: boolean; title?: string };
}) {
  const years = Math.min(Math.max(1, Math.round(payYears || 10)), 30);
  const total = Math.round(premium * years);
  const hasCash = cashback?.has === true;
  const W = 340, H = 150;
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
        aria-label={`จ่ายเบี้ยปีละ ${fmt(premium)} บาท ${years} ปี รวม ${fmt(total)} บาท ความคุ้มครอง ${fmt(cover)} บาท ${hasCash ? 'มีเงินคืนระหว่างสัญญาตามรอบ' : 'รับผลประโยชน์ตอนครบสัญญา'}`}>
        {/* แถบความคุ้มครอง */}
        <rect x={x0} y={4} width={x1 - x0} height={16} rx={3} fill="#dbeafe" />
        <text x={x0 + 6} y={16} fontSize="8.5" fill="#1e3a8a" fontWeight="600">
          ความคุ้มครอง {fmt(cover)} บาท {rider ? '(ตามแผน/ต่อครั้ง)' : '(ตลอดสัญญา)'}
        </text>

        {/* แถบปีที่ชำระเบี้ย */}
        {Array.from({ length: years }).map((_, i) => (
          <rect key={i} x={x0 + i * cellW} y={28} width={Math.max(1, cellW - 1.5)} height={20} rx={2}
            fill="#1d4ed8" opacity={0.92} />
        ))}
        {/* ปีที่เหลือ (ไม่ต้องชำระ) */}
        <rect x={x0 + payW} y={28} width={x1 - (x0 + payW)} height={20} rx={2} fill="#e2e8f0" />
        <text x={x0 + payW + 6} y={42} fontSize="7.5" fill="#475569">ไม่ต้องชำระ</text>

        {/* แถวรับผลประโยชน์: เงินคืนระหว่างสัญญา (จุดเขียวตามรอบ) + จุดครบสัญญา */}
        {hasCash && (
          <>
            <line x1={x0} y1={60} x2={x0 + payW} y2={60} stroke="#a7f3d0" strokeWidth="1" strokeDasharray="2 2" />
            {Array.from({ length: years }).map((_, i) => (
              <circle key={`c${i}`} cx={x0 + i * cellW + Math.max(1, cellW - 1.5) / 2} cy={60} r={2.6} fill="#059669" />
            ))}
          </>
        )}
        <line x1={x0 + payW} y1={60} x2={x1 - 10} y2={60} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 2" />
        <circle cx={x1 - 4} cy={60} r={3.6} fill="#0ea5e9" />
        <text x={x0 + payW + 4} y={76} fontSize="7.5" fill="#0f172a">
          {hasCash ? 'เงินคืนตามรอบ' : 'ยังไม่จ่าย'}
        </text>
        <text x={x1 - 4} y={76} fontSize="7.5" fill="#0369a1" textAnchor="end">ครบสัญญา</text>

        {/* ป้ายปีที่ 1 และปีสุดท้าย */}
        <text x={x0 + 1} y={90} fontSize="7.5" fill="#334155">ปีที่ 1</text>
        <text x={x0 + payW - 34} y={90} fontSize="7.5" fill="#334155">ปีที่ {years}</text>
        <text x={x1 - 4} y={90} fontSize="7.5" fill="#334155" textAnchor="end">สิ้นสุดสัญญา</text>

        {/* เส้นฐาน */}
        <line x1={x0} y1={96} x2={x1} y2={96} stroke="#cbd5e1" strokeWidth="1" />
        <text x={x0} y={110} fontSize="8.5" fill="#0f172a">
          จ่ายเบี้ย {years} ปี ปีละ {fmt(premium)} บาท = รวม {fmt(total)} บาท
        </text>
        <text x={x0} y={123} fontSize="8.5" fill="#047857">
          {hasCash
            ? 'รับเงินคืนระหว่างสัญญาตามรอบ + เงินครบสัญญาเมื่อครบกำหนด'
            : 'ไม่มีเงินคืนระหว่างสัญญา — รับผลประโยชน์ก้อนเดียวเมื่อครบกำหนดสัญญา'}
        </text>
        <text x={x0} y={136} fontSize="7.5" fill="#64748b">
          % เงินคืน / เงินครบสัญญา: ยืนยันจากตารางผลประโยชน์ของแบบก่อนยื่นลูกค้า
        </text>
      </svg>
      <div className="text-[10px] text-slate-500">
        ตัวเลขเบี้ยเป็นตัวอย่าง (แก้ช่อง "เบี้ยประกันต่อปี" ด้านบนได้) — จำนวนปีชำระจริงยืนยันกับตารางผลประโยชน์/ใบเสนอขาย
      </div>
    </div>
  );
}
