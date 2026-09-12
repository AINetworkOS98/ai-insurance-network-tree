// src/lib/ai/skills.ts — Hermes Skills Registry
export type Skill = {
  name: string;
  description: string;
  triggers: string[];
  hint: string;
};

export const skills: Skill[] = [
  { name:"analyze-table", description:"วิเคราะห์ตาราง/CSV/JSON ที่วาง", triggers:["วิเคราะห์","สรุป","เปรียบเทียบ","ตาราง","csv","json"], hint:"วางข้อมูลแล้วบอกให้วิเคราะห์ เช่น สรุปยอดรวม หาค่าสูงสุด" },
  { name:"network-1x5", description:"ผัง 1 แตก 5", triggers:["ผัง","เครือข่าย","1 แตก 5","สายงาน","ทีม"], hint:"ค้นหาด้วยรหัสสมาชิก เช่น ดูผังของ M-000123" },
  { name:"receipt-validate", description:"ตรวจใบเสร็จ/สลิป OCR", triggers:["ใบเสร็จ","สลิป","receipt","ocr"], hint:"แนบไฟล์หรือวางข้อความจากสลิป" },
  { name:"income-calc", description:"คำนวณรายได้/ภาษี", triggers:["รายได้","ภาษี","หัก ณ","เบี้ย","คอม"], hint:"บอกยอดและประเภท ระบบคำนวณตามกฎปัจจุบัน" },
  { name:"rank-plan", description:"ประเมินเลื่อนตำแหน่ง", triggers:["เลื่อนตำแหน่ง","rank","คุณสมบัติ","ประเมิน"], hint:"บอกตำแหน่งและผลงาน ระบบเทียบกับ RankPlan" },
  { name:"web-search", description:"ค้นเว็บ + YouTube", triggers:["ค้นเว็บ","หาเว็บ","youtube","เพลง","ข่าว"], hint:"พิมพ์สิ่งที่ต้องการค้นหา" },
];

export function matchSkills(query: string, limit=3): Skill[] {
  const q = query.toLowerCase();
  const scored = skills.map(s=> ({ s, score: s.triggers.filter(t=> q.includes(t.toLowerCase())).length })).filter(x=> x.score>0).sort((a,b)=> b.score-a.score);
  return scored.slice(0,limit).map(x=> x.s);
}
