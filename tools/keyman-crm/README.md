# 🛡 AI Insurance Keyman Prospect & Tax Planning System 2569

ระบบ Python สำหรับตัวแทนประกันชีวิต: เก็บข้อมูลลูกค้าเป้าหมาย (เจ้าของกิจการ/ผู้บริหาร) →
คำนวณภาษี → วิเคราะห์ความจำเป็นประกันคีย์แมน → ติดตามการขาย
อ้างอิงหน้า Prospect → Keyman ของ [ai-insurance-network-tree](https://ai-insurance-network-tree.vercel.app/prospects?tab=keyman)
และไฟล์ `โปรแกรมภาษี2569_อัปเดต.xlsx`

## จุดสำคัญ: ไม่มีสูตรภาษีซ้ำในโปรเจกต์นี้

สูตรทั้งหมดเรียกเอนจินที่ตรวจกับไฟล์ราชการแล้วใน repo (`python/`):

| เอนจิน | ใช้ทำอะไร | ชุดทดสอบ |
|---|---|---|
| `python/thai_tax_calculator.py` | ภาษีบุคคลธรรมดา (ภ.ง.ด.90 + ใบแนบลดหย่อน) | `python/testcases_thai_pit.json` |
| `python/thai_cit_calculator.py` | ภาษีนิติบุคคล SME ขั้นบันได | `python/testcases_thai_cit.json` |
| `python/keyman_insurance.py` | วงเงินคีย์แมน + ผลภาษี 2 ฝั่ง | `python/testcases_keyman.json` |

แก้กฎหมาย → แก้ที่ `python/` ที่เดียว แล้วอัปเดต `services/tax_rules.py` (วันที่ตรวจ/สถานะ)
แอปนี้ไม่ดึงข้อมูลจากเว็บต้นทางเอง (ไม่มี API ที่ได้รับอนุญาต) — นำเข้าทาง Excel/CSV เท่านั้น

## ติดตั้งและรัน

```bash
cd tools/keyman-crm
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv/Scripts/python.exe -m streamlit run app.py
# เปิด http://localhost:8501
```

ทดสอบ:

```bash
.venv/Scripts/python.exe -m pytest tests -q
.venv/Scripts/python.exe -c "from services.engines import engine_selftest; print(engine_selftest())"
```

## หน้าจอ

1. **Prospects / Keyman** — เพิ่ม/แก้ไข/ค้นหา/ลบ · ตรวจรายการซ้ำ · นำเข้า–ส่งออก Excel/CSV · แม่แบบไฟล์
2. **Tax Calculator 2569** — เงินได้หลายแหล่ง + ลดหย่อนครบชุด · ขั้นบันได · ภาษีขั้นต่ำ 0.5% · เทียบก่อน–หลังวางแผน · ส่งออก Excel/CSV/HTML(พิมพ์ PDF)
3. **Keyman Needs Analysis** — วงเงินจาก 3 วิธี (กำไร/ต้นทุนทดแทน/ภาระผูกพัน) · ประหยัด CIT · ภาษีผู้บริหาร · gross-up · ช่วงทุนประกัน 3 ระดับ
4. **Follow-up CRM** — รายการเลยกำหนด/ครบ 7 วัน · บันทึกการติดต่อ · สถานะ · นัดครั้งถัดไป
5. **Dashboard** — จำนวนตามสถานะ · มูลค่าไปป์ไลน์ · อัตราปิด · รายการต้องติดตาม

## โครงสร้าง

```
app.py                      หน้าแรก + Tax Rules + สถิติ
ui.py                       ตัวช่วยรูปแบบเงิน/วันที่ พ.ศ.
pages/01_prospects.py … 05_dashboard.py
services/engines.py         โหลดเอนจินจาก repo/python (importlib)
services/tax_rules.py       Tax Rules Configuration (ปีภาษี/แหล่งอ้างอิง/วันที่/สถานะ)
services/tax_calculator.py  form → Person → compute_pit + compare + export
services/keyman_calculator.py analyze/cover_options/warnings
services/prospect_service.py CRUD/ค้นหา/ซ้ำ/กิจกรรม/สถิติ
services/excel_import.py    นำเข้า–ส่งออก Excel/CSV + แม่แบบ
database/db.py              SQLite schema + connect
database/models.py          Pydantic validation
database/seed.py            ข้อมูลตัวอย่าง (สมมติ ไม่ใช่ลูกค้าจริง)
tests/                      pytest
```

## Data Dictionary (ตาราง `prospects`)

| กลุ่ม | ฟิลด์ |
|---|---|
| บุคคล | `id, prefix, first_name, last_name, nickname, phone, email, province, area, lead_source, owner, created_at, updated_at, pdpa_consent, pdpa_purpose` |
| ธุรกิจ | `company_name, company_reg_no, business_type, annual_revenue, net_profit, employees, shareholders, position, share_pct, key_executives, importance, successor, risk_note` |
| ขาย | `status, next_follow_up, est_cover, premium, notes` |
| ตารางอื่น | `activities` (ประวัติติดต่อ), `keyman_analyses` (ผลวิเคราะห์ที่บันทึก) |

สถานะ Lead: New Lead → Researching → Contacted → Appointment → Fact Finding →
Needs Analysis → Proposal → Follow Up → Closed Won / Closed Lost

## ข้อจำกัดที่ต้องรายงานลูกค้าตามจริง

- ตัวเลขภาษีเป็นการ **ประมาณการ** ตามแบบ ภ.ง.ด.90/ใบแนบ ปีภาษี 2568 ซึ่งเป็นชุดกฎที่ตรวจไว้
  และแสดงในชื่อปีภาษี 2569 — รายการที่ยังไม่ยืนยันประกาศปีนี้ติดสถานะ `รอตรวจสอบ`
  (Easy E-Receipt 2.0, Thai ESGX, เที่ยวดีมีคืน)
- เบี้ยประกันคีย์แมนหักเป็นค่าใช้จ่ายของบริษัทได้เฉพาะกรณีที่เข้าเงื่อนไข (จ่ายให้ผู้บริหาร/ลูกจ้างตามระเบียบ,
  ผู้รับประโยชน์เป็นบริษัท) — จ่ายเฉพาะผู้ถือหุ้นรายเดียวหักไม่ได้ (ป.96/2543)
- ไม่รับประกันผลตอบแทน · ไม่สรุปว่าหักภาษีได้ทุกกรณี · ทุนประกันที่แนะนำต้องตรวจข้อเท็จจริงก่อนเสนอ
- ไม่มีข้อมูลลูกค้าจริงในระบบ — `seed.py` เป็นข้อมูลสมมติทั้งหมด

## Deploy

- ในเครื่อง: `streamlit run app.py`
- ทีมงาน: Streamlit Community Cloud / VM + `streamlit run app.py --server.port 8501 --server.address 0.0.0.0`
  (ต้องมี `python/` ของ repo อยู่ด้วย เพราะแอปเรียกเอนจินจากที่นั่น — ถ้าแยก deploy ให้คัดลอกโฟลเดอร์ `python/` มาวางข้าง `tools/`)
- ฐานข้อมูลเริ่มต้นเป็น SQLite ไฟล์เดียว (`data/keyman_crm.db`) — สำรองด้วยการ copy ไฟล์
