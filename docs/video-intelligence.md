# AI Video Intelligence & Lead Monitoring

ระบบวิเคราะห์พฤติกรรมผู้ชมวิดีโอบนหน้า `/financial-freedom` → ให้คะแนนความสนใจเชิงพฤติกรรม (Behavioral Interest Level) → แจ้งเตือนแบบเรียลไทม์ + รายงานรายชั่วโมง/รายวัน ผ่าน n8n + AI (Gemini)

> **สถานะ:** เอกสารนี้คือ "สัญญา (contract)" ของระบบ — endpoint บางส่วนกำลังถูก implement ควบคู่กันในโค้ด ในกรณีที่โค้ดกับเอกสารไม่ตรง ให้ยึดเอกสารนี้เป็นแหล่งอ้างอิงหลัก แล้วแก้ให้ตรงกัน
>
> **ขอบเขตความรับผิดชอบ:** ระบบนี้ประเมิน "ความสนใจเชิงพฤติกรรม" จาก event การดูวิดีโอเท่านั้น **ไม่ใช่** การยืนยันตัวตน ไม่ใช่การยืนยันว่าเป็นลูกค้า และ **ห้ามอนุมาน PII** (ชื่อ/อายุ/เพศ/รายได้/อาชีพ) จากพฤติกรรมการดู

---

## 1. ภาพรวมสถาปัตยกรรม (Architecture)

```
 ┌──────────────────────────────────────────────┐
 │  Browser  —  หน้า /financial-freedom           │
 │  public/video-intel.js (frontend SDK)          │
 │  visitor_id (localStorage) + session_id        │
 │  (sessionStorage) + event_id (uuid4)           │
 └───────────────────────┬──────────────────────┘
                         │  POST /api/video-intel/event   (PUBLIC · consent-gated)
                         ▼
 ┌──────────────────────────────────────────────┐        ┌───────────────────────────────┐
 │  Next.js API  —  /api/video-intel/*           │        │  n8n  (http://localhost:5679)  │
 │   event · queue · aggregate · analysis        │        │  WF01..WF05 · WF09             │
 │   notify · stats                              │◀──────▶│                                │
 │  (Prisma ORM — ไม่มี secret ฝั่ง frontend)      │  push  │  WF01 webhook                 │
 └───────────────────────┬──────────────────────┘  webhook│  /video-intel-event           │
                         │                                 │  + pull loop ทุก 1 นาที        │
                         │  Prisma                         │  GET /video-intel/queue       │
                         ▼                                 └───────────────┬───────────────┘
 ┌──────────────────────────────────────────────┐                        │ JSON only
 │  Postgres                                     │                        ▼
 │   visitors                                     │        ┌───────────────────────────────┐
 │   visitor_events                              │        │  AI — Google Gemini            │
 │   video_views                                 │        │  (OpenAI-compatible endpoint)  │
 │   video_ai_analysis                           │        │  model: gemini-3.5-flash-lite  │
 └──────────────────────────────────────────────┘        └───────────────┬───────────────┘
                                                                         │
                          ┌──────────────────────────────────────────────┘
                          ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │  ปลายทาง (Outputs)                                                │
        │   • Real-time alert email  → ALERT_EMAIL (เฉพาะ HOT / VERY_HOT)   │
        │   • รายงานรายชั่วโมง (Hourly)  +  รายงานรายวัน 20:00 Asia/Bangkok  │
        │   • Dashboard feed (GET /video-intel-dashboard) + /video-intel-score│
        └─────────────────────────────────────────────────────────────────┘
```

**หลักการไหลของข้อมูล (data flow)**

1. Frontend SDK เก็บ `visitor_id`/`session_id` และยิง event ด้วย consent → `POST /api/video-intel/event`
2. API ตรวจ consent + validate schema + rate limit → เขียนลง `visitors` / `visitor_events` / `video_views` → ตอบ 200
3. n8n รับข้อมูลได้ **2 ทาง**: (ก) push webhook `/video-intel-event` เมื่อมี tunnel/ลิงก์ถึง (ข) **pull loop ทุก 1 นาที** อ่าน `GET /api/video-intel/queue` เป็น safety net — กัน event ตกหล่น
4. WF01 ส่งต่อให้ AI (Gemini) วิเคราะห์ → ได้ JSON → `POST /api/video-intel/analysis`
5. ถ้า `interest_level` = HOT / VERY_HOT → `POST /api/video-intel/notify` ส่งอีเมลแจ้งเตือน
6. WF02/03 สรุปเป็นรายงานรายชั่วโมง/รายวัน, WF04 ป้อน dashboard, WF05 ให้ re-score on-demand
7. WF09 รับ error ทุกตัวเพื่อไม่ให้งานล้มเงียบ

---

## 2. ตาราง API ทั้งหมด

| # | Method | Path | Auth | หน้าที่ |
|---|--------|------|------|---------|
| 1 | POST | `/api/video-intel/event` | ไม่ต้อง (public) + **ต้องมี consent `analytics:true`** | รับ event จากผู้ชม (ingest) |
| 2 | GET | `/api/video-intel/queue?limit=50` | `Authorization: Bearer $CRON_SECRET` | อ่าน event ที่ยังไม่ประมวลผล (pending) |
| 3 | POST | `/api/video-intel/queue` | `Authorization: Bearer $CRON_SECRET` | มาร์ก event ว่าประมวลผลแล้ว |
| 4 | GET | `/api/video-intel/aggregate` | `Authorization: Bearer $CRON_SECRET` | รวมพฤติกรรมต่อ visitor/session |
| 5 | POST | `/api/video-intel/analysis` | `Authorization: Bearer $CRON_SECRET` | เก็บผลวิเคราะห์ AI + คะแนน |
| 6 | POST | `/api/video-intel/notify` | `Authorization: Bearer $CRON_SECRET` | ส่งอีเมลแจ้งเตือน/รายงาน (HTML) |
| 7 | GET | `/api/video-intel/stats` | `Authorization: Bearer $CRON_SECRET` หรือ session ผู้ดูแล | ข้อมูลสรุปสำหรับ dashboard |

> ทุกตัวอย่าง curl ด้านล่างรันจาก **git-bash** และอ่าน secret จาก environment variable — **ห้ามพิมพ์ค่า secret ลงในคำสั่งหรือไฟล์เด็ดขาด**
> ```bash
> export BASE="http://localhost:3000"
> export CRON_SECRET="..."     # ตั้งใน shell ของคุณเท่านั้น อย่า commit
> ```

### 2.1 `POST /api/video-intel/event` — Public ingest (consent-gated)

**Auth:** ไม่ต้องมี token แต่ **ต้องส่ง `consent.analytics = true`** มิฉะนั้นจะไม่บันทึกอะไรเลย

**Request body**

| field | type | บังคับ | คำอธิบาย |
|-------|------|:---:|----------|
| `visitor_id` | string (uuid) | ✔ | uuid ที่เว็บสร้าง เก็บใน localStorage (anonymous) |
| `session_id` | string (uuid) | ✔ | uuid ต่อ session เก็บใน sessionStorage |
| `event` | string | ✔ | ดูรายการในหัวข้อ 3 |
| `page` | string | ✔ | path ของหน้า เช่น `/financial-freedom` |
| `video_id` | string | ✔ | `financial-freedom-video` |
| `timestamp` | string (ISO 8601) | ✔ | เวลาที่ event เกิด (client) |
| `video_duration` | number | – | ความยาวคลิป (วินาที) |
| `current_time` | number | – | ตำแหน่งเล่นปัจจุบัน (วินาที) |
| `watch_duration` | number | – | เวลาที่ดูสะสม (วินาที) |
| `progress_percent` | number | – | เปอร์เซ็นต์ที่ดู (0–100) |
| `interaction` | string | – | รายละเอียด interaction เช่น `fullscreen` |
| `device` | string | – | `mobile` \| `tablet` \| `desktop` |
| `browser` | string | – | ชนิดเบราว์เซอร์ |
| `referrer` | string | – | ผู้ส่งต่อ (ไม่เก็บ PII) |
| `language` | string | – | เช่น `th-TH` |
| `replay` | boolean | – | true = ดูซ้ำ |
| `event_id` | string (uuid) | ✔ | idempotency — ยิงซ้ำด้วย id เดิมจะไม่สร้างซ้ำ |
| `consent` | object | ✔ | `{ "analytics": true }` |
| `source` | string | ✔ | `"web"` |

**Responses**

| สถานะ | รูปแบบ | ความหมาย |
|-------|--------|----------|
| 200 | `{ "ok": true, "stored": 1, "eventId": "...", "visitorId": "...", "sessionId": "...", "n8n": true, "queued": true, "at": "..." }` | บันทึกสำเร็จ (n8n = ส่ง push webhook สำเร็จหรือไม่, queued = เข้าคิวรอ pull) |
| 200 | `{ "ok": true, "stored": 0, "reason": "no_consent" }` | ไม่มีความยินยอม → **ไม่บันทึกเลย** |
| 400 | `{ "ok": false, "error": "..." }` | body ไม่ผ่าน schema / ขาด field บังคับ |
| 429 | `{ "ok": false, "error": "rate_limited" }` | ยิงถี่เกิน (rate limit) |

**curl (public — ไม่มี secret):**
```bash
curl -sS -X POST "$BASE/api/video-intel/event" \
  -H 'Content-Type: application/json' \
  -d '{
    "visitor_id": "11111111-1111-4111-8111-111111111111",
    "session_id": "22222222-2222-4222-8222-222222222222",
    "event": "video_play",
    "page": "/financial-freedom",
    "video_id": "financial-freedom-video",
    "timestamp": "2026-01-01T10:00:00Z",
    "video_duration": 480,
    "current_time": 0,
    "watch_duration": 0,
    "progress_percent": 0,
    "interaction": null,
    "device": "desktop",
    "browser": "chrome",
    "referrer": "",
    "language": "th-TH",
    "replay": false,
    "event_id": "33333333-3333-4333-8333-333333333333",
    "consent": { "analytics": true },
    "source": "web"
  }'
```

**ทดสอบว่า consent block ทำงาน (คาดได้ `stored:0`):**
```bash
curl -sS -X POST "$BASE/api/video-intel/event" \
  -H 'Content-Type: application/json' \
  -d '{"visitor_id":"11111111-1111-4111-8111-111111111111","session_id":"s1","event":"video_play","page":"/financial-freedom","video_id":"financial-freedom-video","timestamp":"2026-01-01T10:00:00Z","event_id":"44444444-4444-4444-8444-444444444444","consent":{"analytics":false},"source":"web"}'
```

### 2.2 `GET /api/video-intel/queue` — ดึง event รอประมวลผล

**Auth:** `Bearer $CRON_SECRET` · **Query:** `limit` (default 50)

**Response 200:** `{ "ok": true, "events": [ { "eventId", "visitorId", "sessionId", "event", "page", "videoId", "progressPercent", "currentTime", "watchDuration", "at" } ], "count": N }`

```bash
curl -sS "$BASE/api/video-intel/queue?limit=50" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 2.3 `POST /api/video-intel/queue` — มาร์กว่าประมวลผลแล้ว

**Auth:** `Bearer $CRON_SECRET` · **Body:** `{ "eventIds": ["<uuid>", "..."], "processed": true }`

**Response 200:** `{ "ok": true, "updated": N }`

```bash
curl -sS -X POST "$BASE/api/video-intel/queue" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"eventIds":["33333333-3333-4333-8333-333333333333"],"processed":true}'
```

### 2.4 `GET /api/video-intel/aggregate` — รวมพฤติกรรมต่อ visitor/session

**Auth:** `Bearer $CRON_SECRET` · **Query:** `visitor_id`, `session_id`, `minutes` (default 30)

**Response 200:** `{ "ok": true, "visitorProfile": {...}, "sessionProfile": {...}, "summary": {...}, "recentEvents": [ ... ] }`

```bash
curl -sS "$BASE/api/video-intel/aggregate?visitor_id=11111111-1111-4111-8111-111111111111&session_id=22222222-2222-4222-8222-222222222222&minutes=30" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 2.5 `POST /api/video-intel/analysis` — เก็บผลวิเคราะห์ของ AI

**Auth:** `Bearer $CRON_SECRET` · **Body (JSON ที่ AI ส่งกลับ):**

| field | type | คำอธิบาย |
|-------|------|----------|
| `analysis_id` | string | id ของผลวิเคราะห์ |
| `visitor_id` / `session_id` | string | อ้างอิงผู้ชม |
| `page` / `video_id` | string | หน้า/คลิปที่วิเคราะห์ |
| `engagement_score` | number 0–100 | คะแนนความสนใจเชิงพฤติกรรม |
| `interest_level` | string | `COLD` \| `WARM` \| `HOT` \| `VERY_HOT` |
| `watch_probability` | number 0–1 | โอกาสดูต่อ |
| `returning_visitor` | boolean | เป็นผู้ชมที่กลับมาหรือไม่ |
| `video_completion` | number 0–1 | สัดส่วนที่ดูจบ |
| `ai_summary` | string | สรุปสั้น (ภาษาคน) |
| `recommended_action` | string | สิ่งที่ควรทำต่อ (ให้ "คน" ทำ) |
| `reason[]` | string[] | **เหตุผลประกอบทุกครั้ง** (ห้ามให้คะแนนลอย ๆ) |
| `model` | string | เช่น `gemini-3.5-flash-lite` |
| `send_alert` | boolean | true = ให้ส่งอีเมลแจ้งเตือน |

**Response 200:** `{ "ok": true, "analysisId": "...", "stored": true }`

```bash
curl -sS -X POST "$BASE/api/video-intel/analysis" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{
    "analysis_id": "a1",
    "visitor_id": "11111111-1111-4111-8111-111111111111",
    "session_id": "22222222-2222-4222-8222-222222222222",
    "page": "/financial-freedom",
    "video_id": "financial-freedom-video",
    "engagement_score": 82,
    "interest_level": "VERY_HOT",
    "watch_probability": 0.91,
    "returning_visitor": false,
    "video_completion": 1.0,
    "ai_summary": "ดูคลิปจบและดูซ้ำ ให้ความสนใจสูงต่อเนื้อหาวางแผนการเงิน",
    "recommended_action": "ให้ตัวแทนติดต่อกลับภายใน 24 ชม. (เฉพาะเมื่อมี consent)",
    "reason": ["ดูจบ 100%", "ดูซ้ำ 1 ครั้ง", "มี interaction fullscreen"],
    "model": "gemini-3.5-flash-lite",
    "send_alert": true
  }'
```

### 2.6 `POST /api/video-intel/notify` — ส่งอีเมล (real-time / report)

**Auth:** `Bearer $CRON_SECRET` · **Body:** `{ "subject", "html", "to?", "kind?", "analysis_id?" }`
ค่าเริ่มต้น `to` = `ALERT_EMAIL` (อีเมลเจ้าของระบบ)

**Response 200:** `{ "ok": true, "email": "sent(smtp)" }`

```bash
curl -sS -X POST "$BASE/api/video-intel/notify" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"subject":"[Video Intel] VERY_HOT visitor","html":"<p>ผู้ชมให้ความสนใจสูงมาก</p>","kind":"realtime","analysis_id":"a1"}'
```

### 2.7 `GET /api/video-intel/stats` — ข้อมูลสรุปสำหรับ dashboard

**Auth:** `Bearer $CRON_SECRET` หรือ session ผู้ดูแล · **Query:** `window=1h|24h|7d`, `limit` (default 30)

**Response 200 (โครงสร้าง):**

| field | type | คำอธิบาย |
|-------|------|----------|
| `currentVisitors` | int | ผู้ชมที่ active ตอนนี้ |
| `activeVideoSessions` | int | session ที่กำลังดูวิดีโอ |
| `totalVisitors` / `totalSessions` / `totalEvents` | int | ยอดรวม |
| `totalVideoViews` / `videoCompletes` | int | จำนวนครั้งที่ดู / ดูจบ |
| `avgWatchSeconds` / `avgWatchPercent` | number | ค่าเฉลี่ยเวลาดู / % ที่ดู |
| `completionRate` | number | อัตราดูจบ |
| `returningVisitors` | int | ผู้ชมที่กลับมา |
| `peakHour` | string/int | ชั่วโมงที่มีคนดูมากสุด |
| `watchProgress` | array | `[{ "mark": 50, "count": 12 }, ...]` |
| `engagement` | object | `{ "cold": N, "warm": N, "hot": N, "veryHot": N }` |
| `hotVisitors` | array | `[{ visitorId, label, score, level, watchPercent, watchSeconds, lastSeen }]` |
| `recentEvents` | array | `[{ at, visitorLabel, event, progressPercent, videoId, page }]` |
| `hourly` | array | `[{ hour, visitors, views, avgWatchPercent }]` |
| `aiInsight` | string | ข้อความสรุปจาก AI |

```bash
curl -sS "$BASE/api/video-intel/stats?window=1h&limit=30" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 3. ตาราง Event ทั้งหมด

### 3.1 Session events (วงจรการเข้าชม)

| event | ยิงเมื่อ | field เด่นที่ควรมี |
|-------|----------|--------------------|
| `page_view` | ผู้ชมเข้าหน้า | `page` |
| `page_exit` | ออกจากหน้า | `watch_duration` |
| `video_loaded` | คลิปโหลดเสร็จ | `video_duration` |
| `video_play` | กดเล่น | `current_time`, `replay` |
| `video_pause` | กดหยุดชั่วคราว | `current_time`, `progress_percent` |
| `video_resume` | เล่นต่อ | `current_time` |
| `video_seek` | เลื่อนตำแหน่ง | `current_time`, `interaction` (`forward`/`backward`) |
| `video_ended` | ดูจบ | `progress_percent:100` |
| `video_exit` | ออกจากวิดีโอ | `watch_duration` |
| `video_progress` | ผ่าน mark 10/25/50/75/90/100 | `progress_percent`, `current_time` |
| `video_interaction` | ปฏิสัมพันธ์อื่น | `interaction` (`fullscreen`, ...) |

### 3.2 Progress marks (ยิง `video_progress` ที่ค่าเหล่านี้)

`10` · `25` · `50` · `75` · `90` · `100`

### 3.3 Interactions (`interaction` field)

`fullscreen` · `forward` · `backward` · (อื่น ๆ ที่เพิ่มภายหลังได้)

### 3.4 ตัวอย่าง payload จริง

**video_progress (mark 50):**
```json
{
  "visitor_id": "11111111-1111-4111-8111-111111111111",
  "session_id": "22222222-2222-4222-8222-222222222222",
  "event": "video_progress",
  "page": "/financial-freedom",
  "video_id": "financial-freedom-video",
  "timestamp": "2026-01-01T10:02:31Z",
  "video_duration": 480,
  "current_time": 240,
  "watch_duration": 240,
  "progress_percent": 50,
  "interaction": null,
  "device": "desktop",
  "browser": "chrome",
  "referrer": "",
  "language": "th-TH",
  "replay": false,
  "event_id": "55555555-5555-4555-8555-555555555555",
  "consent": { "analytics": true },
  "source": "web"
}
```

**video_interaction (fullscreen):**
```json
{
  "visitor_id": "11111111-1111-4111-8111-111111111111",
  "session_id": "22222222-2222-4222-8222-222222222222",
  "event": "video_interaction",
  "page": "/financial-freedom",
  "video_id": "financial-freedom-video",
  "timestamp": "2026-01-01T10:03:05Z",
  "video_duration": 480,
  "current_time": 360,
  "watch_duration": 300,
  "progress_percent": 75,
  "interaction": "fullscreen",
  "device": "desktop",
  "browser": "chrome",
  "language": "th-TH",
  "replay": false,
  "event_id": "66666666-6666-4666-8666-666666666666",
  "consent": { "analytics": true },
  "source": "web"
}
```

**video_exit:**
```json
{
  "visitor_id": "11111111-1111-4111-8111-111111111111",
  "session_id": "22222222-2222-4222-8222-222222222222",
  "event": "video_exit",
  "page": "/financial-freedom",
  "video_id": "financial-freedom-video",
  "timestamp": "2026-01-01T10:04:00Z",
  "video_duration": 480,
  "current_time": 480,
  "watch_duration": 480,
  "progress_percent": 100,
  "event_id": "77777777-7777-4777-8777-777777777777",
  "consent": { "analytics": true },
  "source": "web"
}
```

---

## 4. n8n Workflows

โฟลเดอร์ในโปรเจกต์: `n8n/video-intel/` · n8n รันที่ `http://localhost:5679`
(งานนี้ยังไม่ใส่ workflow id — จะเติมเมื่อนำเข้าจริง)

| ชื่อ | Trigger | หน้าที่ | ปลายทาง |
|------|---------|---------|---------|
| **Video Intel 01 · Event Ingest + AI + Alert** | Webhook `POST /video-intel-event` (push จากแอปเมื่อมี tunnel) **+** pull loop ทุก 1 นาที อ่าน `GET /api/video-intel/queue` | รับ event → เรียก AI วิเคราะห์ → จัดระดับ COLD/WARM/HOT/VERY_HOT → ถ้า HOT/VERY_HOT ส่งแจ้งเตือนทันที → มาร์ก processed | `POST /analysis`, `POST /notify`, `POST /queue` |
| **Video Intel 02 · Hourly AI Report** | Schedule ทุก 1 ชั่วโมง | ดึง `GET /stats?window=1h` → ให้ AI สรุป → ส่งรายงาน | `POST /notify` |
| **Video Intel 03 · Daily AI Report** | Schedule ทุกวัน **20:00 Asia/Bangkok** | ดึง `GET /stats?window=24h` → สรุปภาพรวมรายวัน → ส่งรายงาน | `POST /notify` |
| **Video Intel 04 · Dashboard Feed** | Webhook `GET /video-intel-dashboard` | รวมข้อมูลสดสำหรับ dashboard | อ่าน `GET /stats`, `GET /aggregate` |
| **Video Intel 05 · On-demand Re-score** | Webhook `POST /video-intel-score` | ให้ AI ประเมินคะแนนเชิงพฤติกรรมใหม่เมื่อถูกเรียก | `POST /analysis` |
| **Video Intel 09 · Error Handler** | Error Trigger (ผูกกับ workflow อื่น) | รับ error ทุกตัว → แจ้งเตือน ไม่ให้ล้มเงียบ | `POST /notify` |

**หมายเหตุ:** เส้นทาง webhook ของ n8n (`/video-intel-event`, `/video-intel-dashboard`, `/video-intel-score`) เป็น endpoint ฝั่ง n8n; แอป/ผู้ใช้เรียกผ่าน URL ใน env `N8N_VIDEO_WEBHOOK_URL`

---

## 5. Engagement Score & ระดับความสนใจ

**ช่วงคะแนน (0–100):**

| ช่วง | ระดับ | ความหมาย |
|------|-------|----------|
| 0–24 | `COLD` | สนใจน้อย / ผ่านมาเฉย ๆ |
| 25–49 | `WARM` | สนใจปานกลาง |
| 50–74 | `HOT` | สนใจสูง |
| 75–100 | `VERY_HOT` | สนใจสูงมาก |

**กติกา:** คะแนนต้อง **มีเหตุผลประกอบเสมอ** (`reason[]`) — ทุกการให้ระดับต้องอ้าง event/พฤติกรรมจริงได้ ห้ามให้คะแนนลอย ๆ และห้ามสรุปว่า "เป็นลูกค้า"

**rubric น้ำหนักเริ่มต้น (ปรับได้ที่ logic ของ WF01 / prompt ของ AI) — ตัวอย่าง transparent:**

| พฤติกรรม | คะแนน |
|----------|------:|
| `page_view` | +2 |
| `video_loaded` | +1 |
| `video_play` | +5 |
| `video_progress` mark 10 | +2 |
| `video_progress` mark 25 | +4 |
| `video_progress` mark 50 | +8 |
| `video_progress` mark 75 | +12 |
| `video_progress` mark 90 | +16 |
| `video_progress` mark 100 / `video_ended` | +15 |
| `video_pause` | 0 |
| `video_resume` | +1 |
| `video_seek` forward | +2 |
| `video_interaction` (`fullscreen` ฯลฯ) | +3 |
| `replay` (ดูซ้ำ, `replay:true`) | +10 |
| เป็นผู้ชมที่กลับมา (`returning_visitor`) | +8 |

- ผลรวมถูก **cap ที่ 100** และ clamp ไม่ให้ติดลบ
- AI เป็นผู้ยืนยัน/ปรับระดับสุดท้าย พร้อมแนบ `reason[]` เสมอ
- เกณฑ์ตัดสิน "แบบต้องมีคนทำต่อ": `HOT` (50–74) เฝ้าดู, `VERY_HOT` (75–100) แจ้งเตือนทันที

> น้ำหนักในตารางนี้เป็น **ค่าเริ่มต้นที่เสนอ** — ให้ยึดค่า config จริงใน workflow เป็นหลัก และอัปเดตตารางนี้ให้ตรงกันเมื่อปรับ

---

## 6. ความเป็นส่วนตัว (PDPA)

- ใช้ **anonymous visitor id เท่านั้น** (`visitor_id` = uuid ใน localStorage) — ไม่ผูกกับตัวตนจริง
- **Consent-gated:** ถ้าไม่มี `consent.analytics = true` → **ไม่บันทึกเลย** (ตอบ `stored:0, reason:"no_consent"`)
- **ห้าม** face recognition / facial emotion / ระบุตัวตนจากภาพหรือเสียง ทุกกรณี
- **ไม่เก็บ IP ดิบ** — เก็บเป็น `ip_hash` (hash ที่ผูกกับ secret) เท่านั้น
- **ห้าม AI อนุมาน PII** (ชื่อ/อายุ/เพศ/รายได้/อาชีพ) จากพฤติกรรมการดู
- ถ้าจะเชื่อมต่อกับ **lead** (ระบุตัวตน) → **ต้องมีความยินยอมชัดเจนก่อน** ระบบจึงจะผูก `visitor_id` → `prospect_id`
- ถอนความยินยอมได้ทุกเมื่อ (`consent:false`) → หยุดเก็บเพิ่มทันที
- การจัดระดับเป็น **"Behavioral Interest Level"** ไม่ใช่ข้อพิสูจน์ว่าเป็นลูกค้า และไม่ใช่ข้อมูลอ่อนไหว

---

## 7. ความปลอดภัย

- **Secret อยู่ฝั่ง server เท่านั้น** — frontend (`public/video-intel.js`) **ไม่มี secret ใด ๆ** และไม่รู้จัก `CRON_SECRET`
- **Middleware allowlist** — `/api/video-intel/*` ต้องถูกเพิ่มใน allowlist ของ `src/middleware.ts` (public สำหรับ `/event`; endpoint อื่น route ตรวจสิทธิ์เอง)
- **Ingest เปิดสาธารณะแต่ consent-gated** — ตรวจ `consent.analytics` ก่อนเขียนทุกครั้ง
- **Rate limit** ต่อ IP/session → ตอบ `429` เมื่อเกิน
- **Schema validation** — ตรวจชนิด/ขอบเขตข้อมูล (เช่น `progress_percent` 0–100) ก่อนบันทึก → `400` เมื่อไม่ผ่าน
- **Idempotency** — `event_id` ไม่ซ้ำ (ยิงซ้ำด้วย id เดิมไม่สร้างข้อมูลหรือคะแนนซ้ำ)
- **Header secret ระหว่างแอปกับ n8n** — ใช้ `x-webhook-secret`/`Authorization` ที่ตั้งจาก `N8N_WEBHOOK_SECRET` / `TRACK_WEBHOOK_SECRET`; ฝั่ง n8n ตรวจทุกครั้งก่อนประมวลผล
- **Bearer CRON_SECRET** สำหรับ endpoint ฝั่ง server (`queue`, `aggregate`, `analysis`, `notify`, `stats`) — ใช้ timing-safe compare
- **Fail closed** — ถ้าไม่ได้ตั้ง `CRON_SECRET` ให้ปฏิเสธ (ไม่เปิดสาธารณะโดยปริยาย)

---

## 8. Environment Variables (ตัวอย่าง)

> ⚠️ ตั้งค่าจริงเฉพาะใน `.env.local` / หน้า Settings ของผู้ให้บริการ (Vercel / n8n) — **ห้าม commit ค่าจริงลงเอกสารหรือโค้ด**

```bash
# URL ของ n8n webhook (push) ที่แอปจะเรียก
N8N_VIDEO_WEBHOOK_URL=

# secret ที่ใช้ยืนยัน header ระหว่างแอปกับ n8n
N8N_WEBHOOK_SECRET=

# secret สำหรับ webhook ฝั่ง tracking (แยกจาก N8N)
TRACK_WEBHOOK_SECRET=

# secret สำหรับ endpoint ฝั่ง server (queue/aggregate/analysis/notify/stats)
CRON_SECRET=

# อีเมลปลายทางของแจ้งเตือน/รายงาน
ALERT_EMAIL=

# API key ของ AI (Gemini ผ่าน endpoint แบบ OpenAI-compatible)
AI_API_KEY=

# การเชื่อมต่อฐานข้อมูล Postgres
DATABASE_URL=
```

---

## 9. Acceptance Test 1–7

รันด้วยสคริปต์: `python n8n/video-intel/scripts/simulate-viewer.py` (ดูหัวข้อ 10)
คำสั่งตรวจผลใช้ env `$BASE` และ `$CRON_SECRET`

| # | สิ่งที่ต้องพิสูจน์ | วิธีทำ | วิธีตรวจผลจริง |
|---|------------------|--------|----------------|
| 1 | เปิดหน้า → สร้าง `visitor_id`/`session_id` | เปิด `/financial-freedom` (หรือรันสคริปต์) | DevTools Console: `localStorage.getItem('visitor_id')`, `sessionStorage.getItem('session_id')` มีค่า; สคริปต์พิมพ์ id ทั้งสอง |
| 2 | กด play → ได้ `video_play` | ยิง `video_play` | `curl` ไป `GET /queue` แล้วเจอ event `video_play`; response ของ ingest เป็น `stored:1` |
| 3 | ดูถึง 50% → ได้ `video_progress = 50` | ยิง `video_progress` mark 50 | `GET /aggregate?...` เห็น `progress_percent:50`; `GET /stats` มี `watchProgress` mark 50 เพิ่ม |
| 4 | ดูถึง 90% → AI ประเมิน | ถึง mark 90 → รอ WF01 (push หรือ pull ≤1 นาที) | `visitor_events.processed_at` ไม่ว่าง; `GET /aggregate`/ตาราง `video_ai_analysis` มีแถวใหม่ (score + `reason[]`) |
| 5 | score ≥ 80 → ส่งอีเมล | `--hot` (สร้าง VERY HOT) → รอ WF01 | อีเมลเข้า `$ALERT_EMAIL`; หรือตรวจ response `POST /notify` = `email:"sent(smtp)"` |
| 6 | ออกจากหน้า → `video_exit` + watch duration | ยิง `video_exit` + `page_exit` | `GET /queue`/`aggregate` เห็น `video_exit` พร้อม `watch_duration`; `GET /stats` `avgWatchSeconds` ขยับ |
| 7 | กลับมาซ้ำ → returning session ของ visitor เดิม | รันสคริปต์รอบ 2 ด้วย `--visitor <id เดิม> --second-visit` | `GET /stats` → `returningVisitors` เพิ่ม; `GET /aggregate` ของ visitor เดิมมี session ใหม่; AI ตอบ `returning_visitor:true` |

**คำสั่งช่วยตรวจ (git-bash):**
```bash
# 2) ดู event ที่รอประมวลผล
curl -sS "$BASE/api/video-intel/queue?limit=50" -H "Authorization: Bearer $CRON_SECRET"

# 3-7) รวมพฤติกรรมต่อ visitor/session
curl -sS "$BASE/api/video-intel/aggregate?visitor_id=11111111-1111-4111-8111-111111111111&minutes=30" \
  -H "Authorization: Bearer $CRON_SECRET"

# 5-7) ภาพรวม dashboard
curl -sS "$BASE/api/video-intel/stats?window=1h&limit=30" -H "Authorization: Bearer $CRON_SECRET"
```

---

## 10. วิธีรัน / ทดสอบ

**n8n:** รันที่ `http://localhost:5679` · workflow ของระบบอยู่ใน `n8n/video-intel/`
- เส้นทาง webhook (ฝั่ง n8n): `POST /video-intel-event`, `GET /video-intel-dashboard`, `POST /video-intel-score`
- WF01 ทำงาน 2 ทาง: push webhook + pull loop (`/api/video-intel/queue`) ทุก 1 นาที (safety net)

**รันสคริปต์จำลองผู้ชม (stdlib เท่านั้น):**
```bash
# จาก root ของโปรเจกต์
python n8n/video-intel/scripts/simulate-viewer.py                     # รอบปกติ
python n8n/video-intel/scripts/simulate-viewer.py --base http://localhost:3000
python n8n/video-intel/scripts/simulate-viewer.py --hot               # VERY HOT → ควรกระตุ้นอีเมล
python n8n/video-intel/scripts/simulate-viewer.py --visitor <id> --second-visit   # พิสูจน์ returning
python n8n/video-intel/scripts/simulate-viewer.py --help              # วิธีใช้ (ไทย + English)
```

สคริปต์จะพิมพ์ตาราง `step / event / HTTP / stored / n8n / note` ทุก step, สรุป PASS/FAIL และ **exit code 1** ถ้ามี step ใดล้มเหลว (ใช้ใน CI ได้)

**ลำดับการทดสอบที่แนะนำ (acceptance 1–7):**
1. รัน `simulate-viewer.py` (รอบปกติ) → เก็บ `visitor_id` ที่พิมพ์ออกมา
2. ตรวจข้อ 2–6 ด้วย `queue` / `aggregate` / `stats` + ดูอีเมลที่ `$ALERT_EMAIL`
3. รัน `simulate-viewer.py --hot` → ตรวจการแจ้งเตือนแบบเรียลไทม์
4. รัน `simulate-viewer.py --visitor <id จากข้อ 1> --second-visit` → ตรวจ returning visitor
