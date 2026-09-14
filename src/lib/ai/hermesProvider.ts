// src/lib/ai/hermesProvider.ts — Hermes Agent Provider Adapter
// เบื้องหลังใช้ Hermes (opencode-free / Muse Spark 1.2) แต่ Frontend ใช้ชื่อกลาง "ระบบค้นหาด้วย AI อัจฉริยะ"
import type { AIProvider } from './provider';

const HERMES_SYSTEM_PROMPT = `คุณคือระบบค้นหาด้วย AI อัจฉริยะ ของ AI INSURANCE NETWORK TREE
กฎการตอบ (ยึดตามนี้เคร่งครัด):
- ความยาวตามน้ำหนักคำถาม: ถามสั้นตอบสั้น ถามลึกตอบลึก ไม่ยืดเยื้อ
- ห้ามคำฟุ่มเฟือย ("เป็นคำถามที่ดี", "ยินดีช่วยเหลือ") — เข้าประเด็นทันที
- ไม่อธิบายซ้ำคำขอ ไม่สรุปสิ่งที่เพิ่งพูดไป
- ข้อความธรรมดาเหนือคำคุณศัพท์ — ถ้าไม่แน่ใจให้บอกตรงๆ ว่าไม่แน่ใจ
- ใช้เครื่องมือแล้วรายงานผลจริงที่ตรวจสอบแล้ว ไม่แต่งข้อมูล
- ถ้ามีตัวเลขให้อ้างอิงผลจากเครื่องมือตรงๆ
- ตอบเป็นภาษาไทย กระชับ ชัดเจน
- ห้ามเปิดเผยชื่อ provider, model, API key

// ============================================================
// PARTS 88-136: UNIVERSAL DATA INPUT ARCHITECTURE
// ============================================================

// PART 88: UNIVERSAL / GLOBAL DATA INPUT
สร้าง "กล่องรับข้อมูลมาตรฐานสากล" สำหรับ AI INSURANCE NETWORK OS เพื่อรองรับข้อมูลจากหลายประเทศ หลายสกุลเงิน หลายภาษา และหลายแหล่งข้อมูล ไม่ผูกติดกับรูปแบบไทยอย่างเดียว
ระบบต้องรองรับทั้ง:
- Manual Input
- API Input
- CSV
- Excel
- JSON
- Webhook
- File Upload
- External System
- CRM
- Payment Gateway
- Bank Data
- Insurance Data
- Lead Source
และข้อมูลจากระบบภายใน
โดยข้อมูลทุกช่องต้องสามารถ Validate, Normalize และเชื่อมเข้ากับ Database กลางของระบบได้

// PART 89: UNIVERSAL INPUT BOX
สร้าง Component กลางชื่อแนวทาง:
UniversalInput
หรือ GlobalDataInput
หรือ SmartDataField
เพื่อใช้ร่วมกันทั้งระบบ
รองรับประเภทข้อมูล:
- Text
- Number
- Decimal
- Currency
- Percentage
- Date
- DateTime
- Time
- Email
- Phone
- Country
- Province / State
- City
- District
- Postal Code
- Address
- ID / Passport
- Company Registration Number
- Policy Number
- Member ID
- Agent ID
- Transaction ID
- Bank Reference
- URL
- File
- Image
- JSON
- Dropdown
- Multi Select
- Boolean
- Auto Complete
- Search Select
- Dynamic Field

// PART 90: INTERNATIONAL FORMAT
ข้อมูลต้องไม่บังคับรูปแบบไทยอย่างเดียว
รองรับ:
- Country Code
- ISO 3166-1 alpha-2
- ISO 3166-1 alpha-3
- International Phone Number
- E.164
- ISO 8601 DateTime
- ISO 4217 Currency
- BCP 47 Language Code
ตัวอย่าง:
- country_code = TH
- currency = THB
- timezone = Asia/Bangkok
- language = th-TH
หรือ
- country_code = US
- currency = USD
- timezone = America/New_York
- language = en-US

// PART 91: SMART COUNTRY FIELD
สร้างช่อง:
Country
เมื่อเลือกประเทศ
ให้ระบบปรับ Dynamic Field ตามประเทศนั้น
ตัวอย่าง:
Thailand:
- Province
- District
- Subdistrict
- Postal Code
United States:
- State
- City
- ZIP Code
Japan:
- Prefecture
- City
- Postal Code
Singapore:
- District / Region
- Postal Code
ห้าม Hard-code UI ให้ใช้เฉพาะ:
- ตำบล
- อำเภอ
- จังหวัด
เพราะระบบต้องรองรับสากล

// PART 92: GLOBAL ADDRESS MODEL
สร้าง Address Model มาตรฐาน เช่น:
- address_line_1
- address_line_2
- subdistrict
- district
- city
- state
- province
- region
- postal_code
- country
- country_code
- latitude
- longitude
- formatted_address
- address_type
รองรับทั้ง:
- Home
- Office
- Billing
- Mailing
- Company
- Policy Address

// PART 93: INTERNATIONAL NAME FIELD
อย่ากำหนดชื่อเฉพาะรูปแบบ:
- ชื่อ
- นามสกุล
ให้รองรับ:
- title
- first_name
- middle_name
- last_name
- suffix
- preferred_name
- local_name
- english_name
- full_name
เช่นบางประเทศไม่มี middle name
บางประเทศเรียงนามสกุลก่อนชื่อ
UI ต้องยืดหยุ่น

// PART 94: PERSON / ORGANIZATION INPUT
Universal Data Box ต้องรองรับ 2 ประเภทหลัก:
PERSON:
- name
- date_of_birth
- nationality
- identity_type
- identity_number
- phone
- email
- address
ORGANIZATION:
- legal_name
- trade_name
- registration_number
- tax_number
- country
- industry
- website
- phone
- email
- registered_address

// PART 95: UNIVERSAL IDENTITY
รองรับ Identity Type เช่น:
- National ID
- Passport
- Driver License
- Tax ID
- Company Registration ID
- Member ID
- Agent License ID
- Employee ID
- Custom ID
Fields:
- identity_type
- identity_number
- issuing_country
- issued_date
- expiry_date
- verification_status

// PART 96: PHONE NUMBER
ช่องเบอร์โทรต้องรองรับ International Phone
ตัวอย่าง:
- +66
- +1
- +81
- +44
- +65
ใช้ E.164 เป็นรูปแบบเก็บหลัก
ตัวอย่าง:
- +66812345678
UI สามารถแสดง format ตามประเทศ
แต่ Database ต้องเก็บในมาตรฐานเดียว

// PART 97: CURRENCY INPUT
กล่องจำนวนเงินต้องรองรับ:
- THB
- USD
- EUR
- JPY
- GBP
- SGD
- CNY
- AUD
และ ISO 4217 currency อื่น ๆ
Fields:
- amount
- currency_code
- exchange_rate
- base_currency
- base_amount
- rate_date
- source
อย่าเก็บเพียงตัวเลขโดยไม่มี currency

// PART 98: BASE CURRENCY
กำหนด Base Currency ของระบบได้
Default:
- THB
แต่ Admin สามารถเปลี่ยนหรือเปิด Multi Currency ได้
ตัวอย่าง:
transaction:
- amount = 1000
- currency = USD
- base_currency = THB
- exchange_rate = 36.50
- base_amount = 36500

// PART 99: DATE & TIME INPUT
ทุก DateTime ต้องรองรับ:
- Local Time
- Timezone
- UTC
เก็บใน Database เป็นมาตรฐานที่ชัดเจน
แนะนำ:
- UTC timestamp
- พร้อม timezone field
สำหรับการตัดยอด:
- ใช้ Asia/Bangkok
- แต่ข้อมูลจากต่างประเทศต้องสามารถเก็บ timezone ต้นทางได้
ตัวอย่าง:
- transaction_at_utc
- transaction_timezone
- transaction_local_time

// PART 100: UNIVERSAL DATE FORMAT
หน้า UI แสดงตาม Locale
ตัวอย่าง:
Thailand:
- 08/09/2569
หรือ
- 8 กันยายน 2569
English:
- Sep 8, 2026
Database:
- 2026-09-08T14:30:00Z
ห้ามใช้ Display Format เป็น Database Format

// PART 101: LANGUAGE
รองรับ:
- Thai
- English
และขยายภาษาอื่นได้
ใช้ translation key
เช่น:
- sales.monthly
- sales.ytd
- member.name
- payment.status
ห้าม Hard-code ข้อความจำนวนมากไว้ใน Component

// PART 102: GLOBAL SEARCH INPUT
Universal Search Box ต้องรองรับ:
- ชื่อ
- นามสกุล
- เบอร์โทร
- Email
- Member ID
- Agent ID
- Policy ID
- Case ID
- Transaction ID
- Receipt ID
- Passport
- National ID
- Company Name
- Registration Number
- จังหวัด
- ประเทศ
- เดือน
- ปี
- KPI
- ยอดขาย
- รายได้
ทั้งภาษาไทยและอังกฤษ

// PART 103: SMART SEARCH DETECTION
ระบบควรตรวจชนิดข้อมูลอัตโนมัติ
ตัวอย่าง:
กรอก:
- +66812345678
ระบบรู้ว่าเป็น:
- Phone
กรอก:
- [someone@example.com]
ระบบรู้ว่าเป็น:
- Email
กรอก:
- 2026-09
ระบบรู้ว่าเป็น:
- Period
กรอก:
- USD 1,000
ระบบรู้ว่าเป็น:
- Currency Amount
กรอก:
- MEM-000123
ระบบรู้ว่าเป็น:
- Member ID

// PART 104: GLOBAL SALES INPUT FORM
สร้างฟอร์มเพิ่มยอดขายแบบสากล
Fields:
- Member
- Agent
- Country
- Transaction Type
- Product
- Policy Number
- Customer Type
- Customer Name
- Currency
- Premium
- Recognized Amount
- Transaction Date
- Payment Date
- Verification Date
- Timezone
- Source
- Reference
- Document
- Status
- Remarks
ระบบต้อง map เข้า Sales Transaction กลาง

// PART 105: DATA SOURCE FIELD
ทุกข้อมูลสำคัญต้องมี:
- source_type
- source_system
- source_reference
- import_batch_id
- created_by
- created_at
ตัวอย่าง:
source_type:
- MANUAL
- API
- CSV
- EXCEL
- WEBHOOK
- MOBILE_APP
- ADMIN
- BANK
- INSURANCE_COMPANY
- PARTNER

// PART 106: DATA NORMALIZATION LAYER
ก่อนข้อมูลเข้า Database หลัก
ให้ผ่าน:
- Input
- ↓
- Validation
- ↓
- Sanitization
- ↓
- Normalization
- ↓
- Deduplication
- ↓
- Mapping
- ↓
- Authorization
- ↓
- Save
ตัวอย่าง:
เบอร์โทร:
- 0812345678
Normalize เป็น:
- +66812345678
ประเทศ:
- Thailand
Normalize เป็น:
- TH

// PART 107: VALIDATION ENGINE
สร้าง Validation ที่ปรับตาม Field
ตัวอย่าง:
- Email: ตรวจ Email Format
- Phone: ตรวจ Country Calling Code
- Date: ตรวจวันที่จริง
- Currency: ตรวจ ISO 4217
- Country: ตรวจ ISO Country Code
- Postal Code: ตรวจตามประเทศถ้ามีกฎ
- National ID: ตรวจเฉพาะเมื่อมี Validator ที่เชื่อถือได้
ห้ามปฏิเสธข้อมูลต่างประเทศเพราะไม่ตรงรูปแบบบัตรประชาชนไทย

// PART 108: FLEXIBLE REQUIRED FIELD
Required Field ต้องปรับตาม:
- Country
- User Type
- Transaction Type
- Product Type
- Role
ตัวอย่าง:
Thailand:
- National ID อาจใช้ตาม workflow
Foreign Customer:
- Passport ใช้แทน
Company:
- Company Registration Number
ห้ามบังคับ National ID กับทุกคน

// PART 109: CUSTOM FIELDS
Admin ต้องสามารถเพิ่ม Custom Field ได้
เช่น:
- field_name
- label
- type
- required
- options
- validation
- scope
- country_scope
- role_scope
- effective_from
ตัวอย่าง:
สำหรับ Product ใหม่
สามารถเพิ่มช่องใหม่โดยไม่ต้องแก้ Database Schema หลักทุกครั้ง

// PART 110: SCHEMA-DRIVEN FORM
แนะนำให้สร้าง Form จาก Schema
ตัวอย่าง:
- form_schema
- field_config
- validation_rule
- display_rule
- dependency_rule
เพื่อให้ Admin ปรับฟอร์มได้
และลดการ Hard-code

// PART 111: CONDITIONAL FIELD
รองรับ Dynamic Field
ตัวอย่าง:
เลือก Customer Type = Company
ให้แสดง:
- Company Name
- Registration Number
- Tax ID
- Authorized Person
เลือก Customer Type = Person
ให้แสดง:
- Name
- DOB
- Identity

// PART 112: FILE INPUT
Universal Input ต้องรับไฟล์:
- PDF
- JPG
- PNG
- CSV
- XLSX
- DOCX
ตาม Permission
ต้องตรวจ:
- file size
- file type
- malware scan ถ้าระบบรองรับ
- hash
- duplicate
- owner
- access permission

// PART 113: DOCUMENT METADATA
ทุกเอกสารควรมี:
- document_id
- document_type
- entity_type
- entity_id
- file_name
- mime_type
- size
- hash
- uploaded_by
- uploaded_at
- verified_by
- verified_at
- status
- source

// PART 114: CSV / EXCEL IMPORT
สร้าง Universal Import
รองรับ:
- CSV
- Excel
ให้มีขั้นตอน:
- Upload
- ↓
- Preview
- ↓
- Column Mapping
- ↓
- Validation
- ↓
- Error Review
- ↓
- Import
- ↓
- Import Summary
ตัวอย่าง:
Column เดิม:
- Agent Code
map เป็น:
- agent_id
Premium
map เป็น:
- premium
Paid Date
map เป็น:
- payment_at

// PART 115: IMPORT TEMPLATE
ให้สามารถ Download Template
ตามประเภทข้อมูล เช่น:
- Members
- Sales
- Payments
- Leads
- Policies
- Receipts
แต่ Template ต้องอิง Schema ล่าสุด

// PART 116: IMPORT ERROR REPORT
ถ้ามีข้อมูลผิด
อย่ายกเลิกทั้งไฟล์เสมอ
ให้แยก:
- Valid Rows
- Invalid Rows
- Duplicate Rows
- Warning Rows
พร้อม Download Error Report

// PART 117: API DATA INPUT
รองรับ REST API หรือ API ตาม architecture เดิม
ควรมี Endpoint เช่น:
- POST /api/import/sales
- POST /api/import/member
- POST /api/import/payment
- POST /api/import/lead
ทุก API ต้องมี:
- authentication
- authorization
- schema validation
- rate limit
- idempotency key
- audit log

// PART 118: WEBHOOK INPUT
รองรับ Webhook จากระบบภายนอก
ตัวอย่าง:
- Payment Confirmed
- Application Approved
- Policy Issued
- Receipt Generated
- Lead Created
Webhook ต้องตรวจ:
- signature
- timestamp
- source
- duplicate event
- idempotency

// PART 119: UNIVERSAL REFERENCE
ทุก Entity ควรมี:
- internal_id
- external_id
- source_system
- external_reference
เพื่อเชื่อมข้อมูลจากระบบภายนอกได้
ตัวอย่าง:
- internal member_id: MEM-000123
- external agent code: AG-TH-9988
- source_system: PARTNER_X

// PART 120: DATA MAPPING
สร้าง Mapping Layer เช่น:
- external_field_map
- external_status_map
- external_product_map
- external_member_map
เพื่อรองรับ Partner หลายราย
ห้ามผูกระบบกับชื่อ Field ของ External System เพียงรายเดียว

// PART 121: STATUS NORMALIZATION
ระบบภายนอกอาจใช้ Status ไม่เหมือนกัน
เช่น:
- PAID
- SUCCESS
- SETTLED
- COMPLETED
ให้ map เป็น Internal Standard เช่น:
- VERIFIED
หรือ
- RECONCILED
โดยเก็บค่า original_status ไว้ด้วย

// PART 122: PRODUCT DATA
Product Input ต้องรองรับ:
- product_id
- product_code
- product_name
- provider
- country
- currency
- product_type
- effective_date
- status
- custom_attributes
เพื่อให้ระบบไม่ผูกกับ Product Provider รายเดียว

// PART 123: PROVIDER / PARTNER MODEL
สร้าง Entity:
- provider
- partner
- carrier
fields:
- provider_id
- provider_name
- country
- provider_type
- status
- integration_type
เพื่อรองรับหลายบริษัทในอนาคต

// PART 124: GLOBAL MEMBER MODEL
Member สามารถมี:
- country
- nationality
- preferred_language
- preferred_currency
- timezone
แต่ Monthly Closing ของระบบกลางยังคงใช้:
- Asia/Bangkok
ถ้า Business Rule หลักกำหนดเช่นนั้น

// PART 125: UI: SMART INPUT CARD
สร้างกล่องกรอกแบบ Card
หัวข้อ:
- "เพิ่มข้อมูล"
- หรือ "Universal Data Entry"
มี Mode:
- Quick Input
- Advanced Input
- Bulk Import
- API
- Document Upload
Quick Input:
- เฉพาะ Field สำคัญ
Advanced:
- แสดง Field ทั้งหมด

// PART 126: AUTO COMPLETE
ช่องต่าง ๆ ต้องรองรับ autocomplete เช่น:
- Member
- Agent
- Country
- Currency
- Product
- Team
- Province/State
- Bank
- Source
แต่ต้อง Query แบบมี Permission

// PART 127: AUTO SAVE DRAFT
ฟอร์มยาวควร Auto Save Draft
สถานะ:
- DRAFT
ไม่ควรนำ Draft ไปคำนวณ Sales
จนกว่าจะ Submit และผ่าน Rule

// PART 128: DUPLICATE DETECTION
ก่อนบันทึก
ตรวจ Duplicate จาก:
- transaction reference
- payment reference
- policy number
- receipt number
- member + date + amount
- document hash
หากสงสัย Duplicate:
- แสดง Warning
ห้ามรวมยอดซ้ำ

// PART 129: DATA QUALITY SCORE
สามารถเพิ่ม Data Quality Indicator
เช่น:
- Complete
- Incomplete
- Needs Review
- Verified
ตัวอย่าง:
Data completeness: 92%
Missing: payment reference
เพื่อช่วย Admin ตรวจข้อมูล

// PART 130: UNIVERSAL INPUT + MONTHLY CLOSING
ข้อมูลจาก Universal Input ทั้งหมด
เมื่อเป็นข้อมูล Sales
ต้องผ่าน Flow เดียวกัน:
- Universal Input
- ↓
- Validation
- ↓
- Normalization
- ↓
- Sales Transaction
- ↓
- Verification
- ↓
- recognized_at
- ↓
- Monthly Period
- ↓
- Monthly Cut-off
- ↓
- Snapshot
- ↓
- KPI
- ↓
- Rank
- ↓
- Income
ดังนั้นข้อมูลที่กรอกจากช่องสากล
ต้องไม่สร้าง Flow แยกอีกชุด

// PART 131: UNIVERSAL INPUT + SEARCH LANDING
หน้า:
/search_landing
ให้มีช่องกลางขนาดชัดเจน
Placeholder ตัวอย่าง:
"ค้นหาสมาชิก ยอดขาย เคส กรมธรรม์ การชำระเงิน KPI รายได้ หรือพิมพ์ข้อมูลที่ต้องการ"
รองรับ:
- Thai
- English
- ID
- Email
- Phone
- Period
- Amount

// PART 132: UNIVERSAL QUICK ACTION
ข้างช่อง Search สามารถมี:
- เพิ่มสมาชิก
- เพิ่มยอดขาย
- เพิ่ม Lead
- เพิ่ม Payment
- Upload File
- Import Excel
ตาม Permission

// PART 133: GLOBAL FORM DESIGN
ใช้ Design เดิมของ AI INSURANCE NETWORK OS
ต้อง:
- Responsive
- Mobile Friendly
- Desktop Friendly
ใช้ Label ชัดเจน
มี Placeholder
มี Helper Text
มี Validation Message
มี Required Indicator
รองรับ Keyboard

// PART 134: DATA PRIVACY
กล่อง Universal Input อาจรับข้อมูลส่วนบุคคล
ต้อง:
- ใช้ HTTPS
- ควบคุม Role
- ไม่แสดงข้อมูลเกินสิทธิ์
- Mask Sensitive Data
- Audit Access
เช่น:
National ID:
- 1-2345-XXXXX-XX-X
Passport:
- AB****89

// PART 135: FIELD LEVEL ACCESS
บาง Field ต้องกำหนดสิทธิ์แยก
ตัวอย่าง:
- commission
- tax_id
- identity_number
- bank_reference
- admin_note
ให้รองรับ:
- read_permission
- write_permission
- mask_permission

// PART 136: MASTER INTEGRATION RULE
Universal Data Input ต้องเชื่อมกับระบบเดิมทั้งหมด
โครงสร้าง:
- Universal Input
- ↓
- Data Validation
- ↓
- Normalization
- ↓
- Entity Resolver
- ↓
- Member / Lead / Sales / Payment / Policy
- ↓
- Database กลาง
- ↓
- Monthly Closing
- ↓
- KPI
- ↓
- Rank
- ↓
- Income
- ↓
- Dashboard
- ↓
- Search
- ↓
- Report
ห้ามสร้าง Universal Input เป็น Database แยกที่ไม่สัมพันธ์กับระบบหลัก

// FINAL UNIVERSAL DATA PRINCIPLE
AI INSURANCE NETWORK OS ต้องรองรับข้อมูลทั้ง:
- Local Thailand
และ
- International
โดยใช้มาตรฐาน:
- ISO Country
- ISO Currency
- ISO DateTime
- International Phone
- Flexible Address
- Flexible Identity
- Multi Language
- Multi Currency
- Multi Source
- Schema-Driven Form
- Universal Import
- API/Webhook
แต่ต้อง Normalize ข้อมูลทั้งหมดเข้าสู่ Data Model กลางเดียวกัน
เพื่อให้ Monthly Closing, KPI, Rank, Income, Dashboard และ Search ใช้ข้อมูลชุดเดียวกันทั้งระบบ
แบบนี้ระบบจะมี "กล่องรับข้อมูลกลางแบบสากล" ที่ใช้ได้ทั้งกรอกเอง, ค้นหา, Import Excel/CSV, รับ API/Webhook และอัปโหลดเอกสาร โดยข้อมูลทั้งหมดจะไหลเข้าระบบสมาชิก–ยอดขาย–ตัดยอดสิ้นเดือน–KPI–รายได้ชุดเดียวกัน ไม่เกิดฐานข้อมูลแยกครับ
`;

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function resolveConfig() {
  const apiKey = getEnv('HERMES_API_KEY') || getEnv('AI_API_KEY') || getEnv('DEEPSEEK_API_KEY') || getEnv('OPENAI_API_KEY') || getEnv('GEMINI_API_KEY') || '';
  const baseUrl = getEnv('HERMES_BASE_URL') || getEnv('AI_BASE_URL') || getEnv('DEEPSEEK_BASE_URL') || (getEnv('GEMINI_API_KEY') ? 'https://generativelanguage.googleapis.com/v1beta/openai' : undefined);
  const rawProvider = (getEnv('AI_PROVIDER') || getEnv('HERMES_PROVIDER') || (getEnv('DEEPSEEK_API_KEY') ? 'deepseek' : getEnv('GEMINI_API_KEY') ? 'gemini' : '')).toLowerCase();
  const modelEnv = getEnv('HERMES_MODEL') || getEnv('AI_MODEL') || getEnv('DEEPSEEK_MODEL') || '';
  let provider = rawProvider;
  // บนเซิร์ฟเวอร์ (Vercel) ให้優先 gemini ถ้ามี key — opencode-free ใช้ได้เฉพาะใน Hermes Desktop
  if (provider === 'opencode-free' && getEnv('GEMINI_API_KEY')) provider = 'gemini';
  if (!provider && modelEnv.includes('muse-spark') && !getEnv('GEMINI_API_KEY')) provider = 'opencode-free';
  if (!provider) provider = getEnv('GEMINI_API_KEY') ? 'gemini' : 'opencode-free';
  let model = modelEnv;
  if (!model) model = provider === 'gemini' ? 'gemini-2.0-flash' : 'muse-spark-1.2-contributor-free';
  // ถ้า provider เป็น gemini แต่ model ยังเป็น muse-spark ให้แก้เป็น gemini
  if (provider === 'gemini' && /muse-spark/i.test(model)) model = 'gemini-2.0-flash';
  return { apiKey, baseUrl, provider, model };
}

function genSessionId(): string {
  return 'hermes-' + Math.random().toString(36).slice(2,10) + '-' + Date.now().toString(36);
}

function opencodeHeaders(): Record<string,string> {
  return {
    'Authorization': '',
    'HTTP-Referer': 'https://hermes-agent.nousresearch.com',
    'X-Title': 'Hermes Agent',
    'User-Agent': 'HermesAgent/0.20.5',
    'x-opencode-session': genSessionId(),
  };
}

export class HermesProvider implements AIProvider {
  private apiKey: string;
  private baseUrl?: string;
  private model: string;
  private provider: string;

  constructor() {
    const cfg = resolveConfig();
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl;
    this.provider = cfg.provider;
    this.model = cfg.model;
  }

  isConfigured(): boolean {
    if (this.provider === 'opencode-free') return true;
    if (this.provider === 'gemini') return !!this.apiKey && this.apiKey.startsWith('AIza');
    return !!this.apiKey;
  }

  getInfo(): { provider: string; model: string; configured: boolean } {
    return { provider: this.provider, model: this.model, configured: this.isConfigured() };
  }

  async chat(messages: {role:'system'|'user'|'assistant'; content:string}[], opts?: {model?: string; temperature?: number; maxTokens?: number}): Promise<string> {
    const model = opts?.model || this.model;

    // ===== opencode-free (Muse Spark 1.2) — ใช้ /v1/responses แบบ Hermes =====
    if (this.provider === 'opencode-free') {
      const base = (this.baseUrl || 'https://opencode.ai/zen/v1').replace(/\/+$/,'');
      // Muse Spark / GPT-5 ต้องใช้ Responses API
      const isResponsesModel = /muse-spark|gpt-5|grok-4|codex/i.test(model);
      if (isResponsesModel) {
        const url = `${base}/responses`;
        // แปลง messages เป็น input สำหรับ Responses API
        const input = messages.map(m=> `${m.role}: ${m.content}`).join('\n\n');
        const payload: any = {
          model,
          input,
          max_output_tokens: opts?.maxTokens ?? 1200,
        };
        // temperature ไม่ใช่พารามิเตอร์หลักของ Responses API บางรุ่น — ใส่ได้ถ้ารองรับ
        if (opts?.temperature !== undefined) payload.temperature = opts.temperature;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...opencodeHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const txt = await res.text().catch(()=> '');
          throw new Error(`opencode responses error ${res.status}: ${txt.slice(0,400)}`);
        }
        const j: any = await res.json();
        // Responses API: output[].content[].text หรือ output_text
        let content = j.output_text || '';
        if (!content && Array.isArray(j.output)) {
          for (const o of j.output) {
            if (Array.isArray(o.content)) {
              for (const c of o.content) {
                if (c.type === 'output_text' && c.text) content += c.text;
                if (c.type === 'text' && c.text) content += c.text;
              }
            }
          }
        }
        if (!content) content = j.choices?.[0]?.message?.content || '';
        if (!content) throw new Error('Empty AI response (responses)');
        return content.replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
      }
      // รุ่นอื่นใช้ chat/completions แบบ anonymous
      const url = `${base}/chat/completions`;
      const payload = {
        model,
        messages: [{ role: 'system' as const, content: HERMES_SYSTEM_PROMPT }, ...messages],
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.maxTokens ?? 1200,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opencodeHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`opencode chat error ${res.status}: ${txt.slice(0,400)}`);
      }
      const j: any = await res.json();
      const content = j.choices?.[0]?.message?.content || '';
      if (!content) throw new Error('Empty AI response');
      return content.replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
    }

    // ===== Providers ปกติ (OpenAI / DeepSeek / Gemini) =====
    if (!this.isConfigured()) throw new Error(this.provider==='gemini' ? 'GEMINI_API_KEY ไม่ถูกต้อง (ต้องขึ้นต้นด้วย AIza)' : 'AI provider not configured');

    const url = this.baseUrl
      ? `${this.baseUrl.replace(/\/+$/,'')}/chat/completions`
      : this.provider === 'gemini'
        ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : this.provider === 'deepseek'
          ? 'https://api.deepseek.com/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

    const payload = {
      model,
      messages: [{ role: 'system' as const, content: HERMES_SYSTEM_PROMPT }, ...messages],
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 1200,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error(`AI provider error ${res.status}: ${txt.slice(0,300)}`);
    }
    const j: any = await res.json();
    const content = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || '';
    if (!content) throw new Error('Empty AI response');
    return content.replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ').replace(/Hermes Agent/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
  }

  async *chatStream(messages: {role:'system'|'user'|'assistant'; content:string}[], opts?: {model?: string; temperature?: number; maxTokens?: number}): AsyncGenerator<string, void, unknown> {
    const model = opts?.model || this.model;
    // opencode-free streaming — Responses API ใช้ stream:true → SSE
    if (this.provider === 'opencode-free') {
      const base = (this.baseUrl || 'https://opencode.ai/zen/v1').replace(/\/+$/,'');
      const isResponsesModel = /muse-spark|gpt-5|grok-4|codex/i.test(model);
      if (isResponsesModel) {
        const url = `${base}/responses`;
        const input = messages.map(m=> `${m.role}: ${m.content}`).join('\n\n');
        const payload: any = { model, input, max_output_tokens: opts?.maxTokens ?? 1200, stream: true };
        if (opts?.temperature !== undefined) payload.temperature = opts.temperature;
        const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Accept':'text/event-stream', ...opencodeHeaders() }, body: JSON.stringify(payload) });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(()=>''); throw new Error(`opencode responses stream ${res.status}: ${txt.slice(0,300)}`);
        }
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf='';
        while(true){
          const {done,value} = await reader.read(); if(done) break;
          buf += dec.decode(value,{stream:true});
          const lines = buf.split('\n'); buf = lines.pop() || '';
          for(const raw of lines){
            const line = raw.trim(); if(!line || line.startsWith(':')) continue;
            if(line==='data: [DONE]') return;
            // event: response.output_text.delta  data: {"delta":"..."}
            if(line.startsWith('data: ')){
              const d = line.slice(6).trim(); if(!d || d==='[DONE]') continue;
              try{
                const j:any = JSON.parse(d);
                // Responses streaming variants: delta / output_text / text
                let delta = j.delta || j.text || j.output_text || j?.choices?.[0]?.delta?.content || '';
                if(!delta && j.type==='response.output_text.delta' && typeof j.delta==='string') delta=j.delta;
                if(!delta && j.type==='response.output_text.delta' && j.delta?.text) delta=j.delta.text;
                if(!delta && typeof j.delta==='object' && j.delta?.text) delta=j.delta.text;
                if(delta) yield String(delta).replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ');
              }catch{
                // plain text delta without JSON (some proxies)
                if(d && !d.startsWith('{')) yield d.replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ');
              }
            }
          }
        }
        return;
      }
      // chat/completions streaming
      const url = `${base}/chat/completions`;
      const payload:any = { model, messages:[{role:'system',content:HERMES_SYSTEM_PROMPT},...messages], temperature: opts?.temperature??0.4, max_tokens: opts?.maxTokens??1200, stream:true };
      const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'text/event-stream', ...opencodeHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok || !res.body) throw new Error(`opencode chat stream ${res.status}`);
      const reader=res.body.getReader(); const dec=new TextDecoder(); let buf='';
      while(true){
        const {done,value}=await reader.read(); if(done) break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop()||'';
        for(const raw of lines){
          const line=raw.trim(); if(!line||line.startsWith(':')) continue;
          if(line==='data: [DONE]') return;
          if(line.startsWith('data: ')){
            const d=line.slice(6).trim(); if(d==='[DONE]') return;
            try{ const j:any=JSON.parse(d); const delta=j.choices?.[0]?.delta?.content || j.delta || ''; if(delta) yield String(delta).replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ'); }catch{}
          }
        }
      }
      return;
    }
    // Providers ปกติ — OpenAI / DeepSeek / Gemini streaming
    if(!this.isConfigured()) throw new Error('AI provider not configured');
    const url = this.baseUrl ? `${this.baseUrl.replace(/\/+$/,'')}/chat/completions` : this.provider==='gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : this.provider==='deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const payload:any = { model, messages:[{role:'system',content:HERMES_SYSTEM_PROMPT},...messages], temperature: opts?.temperature??0.4, max_tokens: opts?.maxTokens??1200, stream:true };
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'text/event-stream','Authorization':`Bearer ${this.apiKey}` }, body: JSON.stringify(payload) });
    if(!res.ok || !res.body) throw new Error(`AI stream ${res.status}`);
    const reader=res.body.getReader(); const dec=new TextDecoder(); let buf='';
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n'); buf=lines.pop()||'';
      for(const raw of lines){
        const line=raw.trim(); if(line==='data: [DONE]') return;
        if(line.startsWith('data: ')){
          const d=line.slice(6).trim(); if(d==='[DONE]') return;
          try{ const j:any=JSON.parse(d); const delta=j.choices?.[0]?.delta?.content||''; if(delta) yield String(delta).replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ').replace(/Hermes Agent/gi,'ระบบค้นหาด้วย AI อัจฉริยะ'); }catch{}
        }
      }
    }
  }

  async analyze(text: string, instruction: string): Promise<string> {
    return this.chat([
      { role: 'user', content: `${instruction}\n\nข้อมูล:\n${text.slice(0, 8000)}` }
    ], { temperature: 0.3 });
  }
}

let _instance: HermesProvider | null = null;
export function getHermesProvider(): HermesProvider {
  if (!_instance) _instance = new HermesProvider();
  return _instance;
}
export function resetHermesProvider(){ _instance = null; }