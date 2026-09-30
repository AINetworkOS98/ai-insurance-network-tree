# แผนสร้างระบบ Lead Nurturing + AI Follow-up (สเปก 20 ส่วน)
โปรเจกต์: ai-insurance-network-tree · n8n: http://localhost:5679 · TikTok: @aka989._
วันที่: 30 ก.ย. 2026 · สถานะ: **ยึดของจริงจากโค้ด/DB ที่ตรวจแล้ว** (ไม่ใช่การเดา)

---

## 1) สิ่งที่มีอยู่แล้วในระบบ (92 โมเดล — ใช้ซ้ำ ไม่สร้างใหม่)
| สเปกขอ | ของที่มีจริง | ใช้แทนได้ |
|---|---|---|
| leads | **`Prospect`** + `ProspectActivity` + `ProspectAssignment` + `ProspectDocument` + `ProspectConversion` + `ProspectStatusHistory` | ✅ ใช้เป็น Lead Profile ได้เลย (เพิ่มฟิลด์ที่ขาด) |
| consents | **`ConsentRecord`** + `ProspectConsent` | ✅ ใช้ตรง ๆ |
| sessions | **`UserSession`** | ✅ ต่อยอดเป็น session_id |
| events (outbox) | **`EventOutbox`** | ✅ ใช้เป็นคิว event ไป n8n |
| messages | `EmailMessage` · `MemberMessage` · `MessageReply` · `SupportMessage` | ✅ ใช้เป็น messages |
| lead source | **`LeadSource`** | ✅ |
| API | `/api/visitor` · `/api/prospects` · `/api/consent` · `/api/support` · `/api/notifications` · `/api/cron/*` | ✅ ต่อยอด ไม่เขียนใหม่ |
| n8n | ทำงานอยู่ (HTTP 200) · workflow เดิม `Registration Outbox Sync` | ✅ |

## 2) ต้องสร้างใหม่ (ยังไม่มีในสคีมา)
**โมเดลใหม่ (Prisma):**
- `Visitor` (visitor_id, first_visit, last_visit, total_visits, device, browser, consent_status)
- `VisitorEvent` (event_id, visitor_id, session_id, type, page_url, referrer, utm_*, video_id, watch_pct, meta, at)
- `Video` (video_id, title, url, thumbnail, topic, sub_topic, target_interest, duration, keywords, description, cta, priority, status, tiktok_id)
- `VideoView` (visitor_id/prospect_id, video_id, started_at, seconds_watched, completion_pct)
- `Recommendation` (prospect_id, video_id, reason, confidence, status, sent_at, channel)
- `FollowUp` (prospect_id, day_offset, channel, message, status, scheduled_at, sent_at, result)
- `EngagementScore` (prospect_id, score, level, breakdown json, updated_at)
- `LeadInterest` (prospect_id, topic, weight, source, updated_at)
- `ChannelPreference` (prospect_id, line, email, sms, web_push, chosen_at)
- `Unsubscribe` (prospect_id/contact, scope, reason, at) ← **หยุดทุกอย่างทันทีเมื่อมี record**
- `AgentTask` (assignee, prospect_id, type, priority, note, due_at, status)

**API ใหม่:** `/api/track` (event รับจากเว็บ) · `/api/lead/register` · `/api/lead/me` · `/api/lead/interest` · `/api/videos` (CRUD) · `/api/recommend` · `/api/followup/due` · `/api/unsubscribe` · `/api/consent/withdraw` · `/api/dashboard/leads`

**หน้าเว็บ:** สคริปต์ tracking (consent-gated) · กล่องลงทะเบียน Lead (mobile-first) · Dashboard ตัวแทน · หน้า Unsubscribe / Delete My Data

## 3) n8n 6 Workflow (สร้างผ่าน DB insert ตามสกิล n8n-workflow-edit)
| WF | Trigger | เส้นทาง | ปลายทาง |
|---|---|---|---|
| 01 Visitor Tracking | Webhook `/webhook/track` | validate → upsert visitor → store event → update profile | DB |
| 02 Lead Registration | Webhook `/webhook/lead` | validate → **check consent** → create lead → profile → initial interest → welcome message | LINE/Email |
| 03 Behavior Analyzer | Schedule ทุก 15 นาที | recent events → group by lead → **AI Interest Analyst** → update interest + engagement score | DB |
| 04 Video Recommendation | Schedule ทุก 1 ชม. | active leads → **AI Video Recommender** → frequency cap → เลือกคลิป → สร้าง task | DB |
| 05 Follow-up | Schedule ทุก 30 นาที | due follow-ups → consent/opt-out → สร้างข้อความ → ส่ง → บันทึกผล | LINE/Email/SMS |
| 06 Lead Escalation | ทุก 15 นาที | score ≥ 70 → สร้าง task ให้มนุษย์ → แจ้งเตือน → stage = HIGH | แจ้งเตือน |

**หลักที่ต้องถือทุก workflow:** ต้องผ่าน 5 ด่านก่อนส่ง — ①Consent ②Opt-out ③Frequency cap (≤1-2/วัน, ≤4-5/สัปดาห์) ④Topic relevance ⑤ยังไม่เคยส่งคลิปนี้

**Error handling ที่ต้องมี:** API error · timeout · invalid/duplicate lead · missing consent · message failure · video not found · AI failure → retry แบบ exponential (3 ครั้ง) แล้วส่งออก log/แจ้งเตือน

## 4) Engagement Score (ตามสเปกส่วน 5)
page_view +1 · return_visit +5 · video_view +3 · >50% +5 · complete +8 · ดูคลิปเดิมซ้ำ +5 · form_open +5 · form_submit +20 · เลือกหัวข้อ +10 · ขอให้ติดต่อกลับ +30
ระดับ: 0-19 LOW · 20-39 WARM · 40-69 INTERESTED · **70+ HIGH INTENT → สร้าง task ให้มนุษย์ (ห้าม AI ปิดการขายเอง)**

## 5) ความเป็นส่วนตัว (บังคับตามสเปก)
- เก็บเฉพาะเมื่อยินยอม · ปุ่ม Unsubscribe / Delete My Data / หยุดติดตาม ใช้ได้ทุกข้อความ
- ถอนความยินยอม = **หยุดทุกช่องทางทันที** (เช็คก่อนส่งทุกครั้ง)
- ห้ามใช้ถ้อยคำแบบ "ผมรู้ว่าคุณกำลังดูอะไรอยู่" — ใช้ภาษาธรรมชาติ เป็นมิตร โปร่งใส
- TikTok: **ห้าม scrape** — ใช้ข้อมูลที่เจ้าของบัญชีนำเข้า (URL/แคปชัน/ทรานสคริปต์)

## 6) ลำดับลงมือ (แต่ละเฟสมีเกณฑ์พิสูจน์)
- **เฟส 1 (ฐานข้อมูล + API tracking)**: เพิ่มโมเดล Prisma → migrate → `/api/track` + `/api/lead/register` → ทดสอบยิงจริง (ต้องได้ visitor_id + event ใน DB)
- **เฟส 2 (หน้าบ้าน)**: สคริปต์ tracking + กล่องลงทะเบียน Lead (mobile-first, มี consent) → ทดสอบบน production
- **เฟส 3 (คลังคลิป + คะแนน)**: `Video` + `VideoView` + คำนวณ Engagement Score + `/api/dashboard/leads`
- **เฟส 4 (n8n 01-02)**: webhook + consent check → พิสูจน์ด้วย `execution_data` ว่าทำงานจริง
- **เฟส 5 (AI agents 03-06 + follow-up)**: ต่อ AI + frequency cap + human handoff
- **เฟส 6 (Dashboard + ปุ่มถอนความยินยอม + ทดสอบ end-to-end)**

## 7) Environment Variables ที่ต้องมี
`N8N_WEBHOOK_BASE` (`http://localhost:5679/webhook`) · `TRACK_WEBHOOK_SECRET` · `CRON_SECRET` (มีแล้ว) · `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_TARGET_ID` (ยังไม่มี) · `SMTP_*` (มีแล้ว — ใช้กับ Hostinger) · `EMAIL_API_KEY` (Resend สำรอง) · `AI_PROVIDER/API_KEY` สำหรับ agent · `TIKTOK_CREATOR_HANDLE=@aka989._`

## 8) ข้อจำกัดที่ต้องรู้ (ตรงไปตรงมา)
- n8n local (`localhost:5679`) ถูกเรียกได้จากเครื่องนี้เท่านั้น — เว็บ production (Vercel) เรียกกลับเข้ามาไม่ได้ ต้องมี tunnel (ngrok/Cloudflare) หรือย้าย n8n ขึ้น VPS ⇒ **ต้องตัดสินใจก่อนเฟส 4**
- โมเดล AI สำหรับ Interest/Recommender/เขียนข้อความ = ต้องมี API key + คุมค่าใช้จ่าย
- LINE Messaging API ยังไม่มีโทเคน ⇒ เฟส 5 ส่งได้แค่ Email ก่อน
