#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_video_intel_workflows.py — สร้างชุด workflow "AI Video Intelligence & Lead Monitoring"
ลงใน n8n (SQLite) ของเครื่องนี้ โดยไม่ต้องใช้ UI

สร้าง 6 workflow:
  Video Intel 01 · รับ Event วิดีโอ + คิวประมวลผล (Webhook + ดึงคิวทุก 1 นาที)
  Video Intel 02 · AI วิเคราะห์พฤติกรรม → จัดระดับ → แจ้งเตือนทันที (Webhook /video-intel-analyze)
  Video Intel 03 · รายงานรายชั่วโมง (AI Hourly Report)
  Video Intel 04 · รายงานรายวัน 20:00 (AI Daily Report)
  Video Intel 05 · Dashboard Feed (GET /video-intel-dashboard)
  Video Intel 09 · Error Handler

วิธีใช้:
  python build_video_intel_workflows.py --dry-run     # สร้าง JSON + ตรวจสอบ ไม่เขียน DB
  python build_video_intel_workflows.py               # เขียนลง DB (workflow_entity + shared_workflow + workflow_history)
  python build_video_intel_workflows.py --export-only # เขียนไฟล์ JSON ลง n8n/video-intel/ เท่านั้น
"""
import argparse, datetime, json, os, re, sqlite3, subprocess, sys, uuid

DB = os.path.expanduser(r"~/.n8n/database.sqlite").replace("\\", "/")
REPO = r"C:/Users/User/ai-insurance-network-tree"
OUTDIR = os.path.join(REPO, "n8n", "video-intel")
APP = "https://ai-insurance-network-tree.vercel.app"
LOCAL_N8N = "http://127.0.0.1:5679"
MODEL_CRED = {"openAiApi": {"id": "openrouter-workflow-1790828913760", "name": "Google Gemini API (OpenAI-compatible)"}}
MODEL_ID = "gemini-3.5-flash-lite"
TZ = "Asia/Bangkok"

ERROR_WF_NAME = "Video Intel 09 · Error Handler"

# ── node helpers ────────────────────────────────────────────────────────────
def nid():
    return str(uuid.uuid4())

def node(type_, name, params, x, y=0, tv=2, extra=None):
    n = {"parameters": params, "id": nid(), "name": name, "type": type_, "typeVersion": tv, "position": [x, y]}
    if extra:
        n.update(extra)
    return n

def code(name, js, x, y=0, on_error="continueRegularOutput"):
    return node("n8n-nodes-base.code", name, {"mode": "runOnceForAllItems", "jsCode": js}, x, y, 2,
                {"onError": on_error})

def http(name, url, x, y=0, method="POST", body=None, headers_extra=None, query=None,
         never_error=True, timeout=120000, on_error="continueRegularOutput"):
    hdrs = [{"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"}]
    if headers_extra:
        hdrs += headers_extra
    p = {
        "method": method,
        "url": url,
        "sendHeaders": True,
        "headerParameters": {"parameters": hdrs},
        "options": {"timeout": timeout, "response": {"response": {"neverError": never_error, "responseFormat": "json"}}},
    }
    if method != "GET" and body is not None:
        p.update({"sendBody": True, "contentType": "json", "specifyBody": "json", "jsonBody": body})
    if query:
        p["sendQuery"] = True
        p["queryParameters"] = {"parameters": [{"name": k, "value": v} for k, v in query]}
    return node("n8n-nodes-base.httpRequest", name, p, x, y, 4.2, {"onError": on_error})

def webhook(name, path, x, y=0, method="POST", mode="onReceived", wid=None):
    n = node("n8n-nodes-base.webhook", name,
             {"httpMethod": method, "path": path, "responseMode": mode, "options": {}}, x, y, 2)
    n["webhookId"] = wid or nid()
    return n

def schedule(name, rule, x, y=0):
    return node("n8n-nodes-base.scheduleTrigger", name, {"rule": {"interval": rule}}, x, y, 1.2)

def ifnode(name, left, x, y=0, right="true", op="true"):
    cond = {"id": nid(), "leftValue": left, "operator": {"type": "boolean", "operation": op}}
    if op != "true" and op != "false":
        cond["rightValue"] = right
    return node("n8n-nodes-base.if", name, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
            "conditions": [cond],
            "combinator": "and",
        },
        "looseTypeValidation": True,
        "options": {},
    }, x, y, 2.2)

def respond(name, x, y=0):
    return node("n8n-nodes-base.respondToWebhook", name,
                {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {"responseCode": 200}},
                x, y, 1.1)

def noop(name, x, y=0):
    return node("n8n-nodes-base.noOp", name, {}, x, y, 1)

def agent(name, text, system, x, y=0):
    # onError: continueRegularOutput — ถ้า credential/โมเดลของ AI ล่มทั้งท่อต้องไม่ตาย
    # (node "ตรวจคำตอบ AI + ตัดสินใจ" จะถอยไปใช้คะแนนที่คำนวณจากข้อมูลจริงแทน แล้วยังแจ้งเตือนได้)
    return node("@n8n/n8n-nodes-langchain.agent", name,
                {"promptType": "define", "text": text, "hasOutputParser": True,
                 "options": {"systemMessage": system, "maxIterations": 3}},
                x, y, 2,
                {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 8000,
                 "onError": "continueRegularOutput"})

def chat_model(name, x, y=0):
    return node("@n8n/n8n-nodes-langchain.lmChatOpenAi", name,
                {"model": {"__rl": True, "mode": "id", "value": MODEL_ID}, "options": {"temperature": 0.2}},
                x, y, 1.2, {"credentials": MODEL_CRED})

def parser(name, example, x, y=0):
    return node("@n8n/n8n-nodes-langchain.outputParserStructured", name,
                {"jsonSchemaExample": example}, x, y, 1.2)

def sticky(name, content, x, y, w=420, h=320):
    return node("n8n-nodes-base.stickyNote", name,
                {"content": content, "height": h, "width": w, "color": 4}, x, y, 1)

def chain(conns, pairs):
    """pairs: [(source, [targets]), ...] -> connections dict (main output 0)"""
    for src, targets in pairs:
        lst = targets if isinstance(targets, list) else [targets]
        conns[src] = {"main": [[{"node": t, "type": "main", "index": 0} for t in lst]]}
    return conns

def branch(conns, src, index, targets):
    """ต่อออกทาง output index (0=true,1=false)"""
    lst = targets if isinstance(targets, list) else [targets]
    if src not in conns:
        conns[src] = {"main": []}
    mains = conns[src]["main"]
    while len(mains) <= index:
        mains.append([])
    mains[index] = [{"node": t, "type": "main", "index": 0} for t in lst]
    return conns

def sub(conns, sub_name, kind, consumer):
    if sub_name not in conns:
        conns[sub_name] = {kind: []}
    conns[sub_name][kind] = [[{"node": consumer, "type": kind, "index": 0}]]
    return conns

# ── JS blocks ───────────────────────────────────────────────────────────────
JS_WEBHOOK_PREP = r"""
// คัดเฉพาะ event ที่ "ควรวิเคราะห์" (play / ended / exit / กลับมาเยี่ยม / ดูถึง 50%+)
const WORTHY = { video_play: 1, video_ended: 1, video_exit: 1, return_visit: 1 };
const out = [];
for (const item of $input.all()) {
  const raw = item.json || {};
  const body = (raw.body && typeof raw.body === 'object') ? raw.body : raw;
  const list = Array.isArray(body.events) ? body.events : [body];
  for (const ev of list) {
    const event = String(ev.event || ev.type || '').toLowerCase();
    const pct = Number(ev.progress_percent || ev.progressPercent || 0);
    const worthy = WORTHY[event] === 1 || (event === 'video_progress' && pct >= 50);
    if (!worthy) continue;
    out.push({ json: {
      visitor_id: String(body.visitor_id || ev.visitor_id || ''),
      session_id: String(body.session_id || ev.session_id || ''),
      event: event,
      progress_percent: pct,
      event_id: ev.event_id || body.event_id || null,
      page: body.page || '/financial-freedom',
      video_id: body.video_id || 'financial-freedom-video',
      at: body.timestamp || ev.timestamp || new Date().toISOString(),
      from: 'push',
    }});
  }
}
return out;
"""

JS_QUEUE_PREP = r"""
// แปลงคิวจาก /api/video-intel/queue ให้เป็น item เดียวกันกับฝั่ง webhook
const out = [];
for (const item of $input.all()) {
  const raw = item.json || {};
  const body = (raw.body && typeof raw.body === 'object') ? raw.body : raw;
  const events = Array.isArray(body.events) ? body.events : [];
  for (const ev of events) {
    out.push({ json: {
      visitor_id: String(ev.visitorId || ev.visitor_id || ''),
      session_id: String(ev.sessionId || ev.session_id || ''),
      event: String(ev.event || ''),
      progress_percent: Number(ev.watchPercent || ev.progressPercent || 0),
      event_id: ev.eventId || null,
      page: ev.page || '/financial-freedom',
      video_id: ev.videoId || 'financial-freedom-video',
      at: ev.at || new Date().toISOString(),
      from: 'queue',
    }});
  }
}
return out;
"""

JS_MERGE = r"""
// รวม event ทุกแหล่งเป็น "งานวิเคราะห์" ต่อ (visitor + session) — สูงสุด 5 งานต่อรอบ
const groups = new Map();
for (const item of $input.all()) {
  const j = item.json || {};
  if (!j.visitor_id) continue;
  const key = j.visitor_id + '|' + (j.session_id || 'nosession');
  let g = groups.get(key);
  if (!g) {
    g = { visitor_id: j.visitor_id, session_id: j.session_id || '', event_ids: [],
          trigger_event: null, page: j.page || '/financial-freedom',
          video_id: j.video_id || 'financial-freedom-video', marks: [], at: j.at };
  }
  if (j.event_id && g.event_ids.indexOf(j.event_id) === -1) g.event_ids.push(j.event_id);
  if (j.event === 'video_progress' && j.progress_percent) g.marks.push(Number(j.progress_percent));
  if (['video_ended', 'video_exit', 'return_visit', 'video_play'].indexOf(j.event) >= 0 && !g.trigger_event) {
    g.trigger_event = j.event;
  }
  if (j.event === 'video_progress' && !g.trigger_event) g.trigger_event = 'video_progress';
  groups.set(key, g);
}
const sessions = Array.from(groups.values()).slice(0, 5);
return sessions.map(function (s) {
  s.marks = s.marks.sort(function (a, b) { return a - b; });
  s.max_mark = s.marks.length ? s.marks[s.marks.length - 1] : 0;
  s.source = 'vi01';
  return { json: s };
});
"""

JS_READ_REQ = r"""
// อ่านคำขอจาก VI01 (หรือผู้เรียกอื่น) แล้วเตรียมค่าที่ต้องใช้ตลอดสาย
const raw = $input.first().json || {};
const body = (raw.body && typeof raw.body === 'object') ? raw.body : raw;
const visitorId = String(body.visitor_id || body.visitorId || '').trim();
const sessionId = String(body.session_id || body.sessionId || '').trim();
const eventIds = Array.isArray(body.event_ids) ? body.event_ids.slice(0, 200).map(String) : [];
return [{ json: {
  visitor_id: visitorId,
  session_id: sessionId,
  event_ids: eventIds,
  trigger_event: body.trigger_event || null,
  source: body.source || 'unknown',
  ok: visitorId.length > 0,
  error: visitorId.length ? null : 'ต้องระบุ visitor_id',
} }];
"""

JS_AI_PROMPT = r"""
// สร้างโจทย์ให้ AI จากข้อมูลพฤติกรรมจริง (aggregate) — ห้ามเดาข้อมูลส่วนบุคคล
const agg = $input.first().json || {};
const req = $('อ่านคำขอ').first().json || {};
if (agg.ok === false) {
  return [{ json: { skip: true, reason: agg.error || 'aggregate_failed', visitor_id: req.visitor_id, session_id: req.session_id } }];
}
const v = agg.visitorProfile || {};
const s = agg.sessionProfile || {};
const payload = {
  visitor: {
    visitor_id: v.visitorId || req.visitor_id,
    total_sessions: v.totalSessions || 1,
    total_video_views: v.totalVideoViews || 0,
    total_watch_seconds: v.totalWatchSeconds || 0,
    average_watch_percent: v.averageWatchPercent || 0,
    returning_visitor: v.returning === true,
    device: v.device || null,
    browser: v.browser || null,
  },
  session: {
    session_id: s.sessionId || req.session_id,
    page: s.page || '/financial-freedom',
    video_id: s.videoId || 'financial-freedom-video',
    video_duration: s.videoDuration || null,
    max_progress_percent: s.maxProgressPercent || 0,
    marks_reached: s.marksReached || [],
    watch_seconds: s.watchSeconds || 0,
    play_count: s.playCount || 0,
    pause_count: s.pauseCount || 0,
    resume_count: s.resumeCount || 0,
    seek_count: s.seekCount || 0,
    replay_count: s.replayCount || 0,
    ended: s.completed === true,
    session_duration_seconds: s.sessionDurationSeconds || null,
    interactions: s.interactions || [],
  },
  trigger_event: req.trigger_event || null,
  base_engagement_score: agg.baseEngagementScore || 0,
};
const prompt = 'ข้อมูลพฤติกรรมการรับชมวิดีโอ (Anonymous Visitor ID — ห้ามอนุมานตัวตน):\n'
  + JSON.stringify(payload, null, 1)
  + '\n\nจงวิเคราะห์และตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น';
return [{ json: {
  prompt: prompt,
  visitor_id: payload.visitor.visitor_id,
  session_id: payload.session.session_id,
  event_ids: req.event_ids || [],
  trigger_event: req.trigger_event || null,
  max_progress: payload.session.max_progress_percent,
  marks: payload.session.marks_reached,
  base_score: payload.session.base_engagement_score || payload.base_engagement_score,
  base_engagement_score: payload.base_engagement_score,
  returning: payload.visitor.returning_visitor,
  headless: agg.visitorProfile ? false : true,
} }];
"""

JS_DECIDE = r"""
// ตรวจคำตอบของ AI → บังคับ schema → ตัดสินใจแจ้งเตือน (ไม่เชื่อ AI 100% ถ้าตอบผิดรูป)
const ctx = $('สร้างโจทย์ให้ AI').first().json || {};
const raw = $input.first().json || {};
let ai = raw.output;
if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch (e) { ai = null; } }
if (!ai || typeof ai !== 'object') ai = {};
const clamp = function (n, a, b) { const v = Number(n); if (!isFinite(v)) return a; return Math.max(a, Math.min(b, v)); };
const levelOf = function (s) { return s >= 75 ? 'VERY_HOT' : s >= 50 ? 'HOT' : s >= 25 ? 'WARM' : 'COLD'; };
const scoreRaw = Number(ai.engagement_score);
let score = isFinite(scoreRaw) ? Math.round(clamp(scoreRaw, 0, 100)) : 0;
if (!isFinite(scoreRaw)) {
  // AI ตอบไม่ครบ → ใช้คะแนนฐานจากข้อมูลจริง (ไม่ปล่อยให้ระบบเงียบ)
  const derived = Math.round(clamp((Number(ctx.max_progress) || 0) * 0.8 + (ctx.returning ? 12 : 0), 0, 100));
  score = Math.max(score, Math.round(clamp(ctx.base_engagement_score, 0, 100)), derived);
}
let level = String(ai.interest_level || ai.interestLevel || '').toUpperCase().replace(/[^A-Z_]/g, '');
if (['COLD', 'WARM', 'HOT', 'VERY_HOT'].indexOf(level) === -1) level = levelOf(score);
const completion = isFinite(Number(ai.video_completion))
  ? clamp(ai.video_completion, 0, 1)
  : clamp((Number(ctx.max_progress) || 0) / 100, 0, 1);
const reasons = Array.isArray(ai.reason) ? ai.reason.map(String).slice(0, 8) : [];
if (!reasons.length) reasons.push('รับชม ' + (ctx.max_progress || 0) + '% ของวิดีโอ');
const bucket = Math.min(100, Math.floor((Number(ctx.max_progress) || score) / 25) * 25);
const analysisId = [ctx.visitor_id || 'v', ctx.session_id || 's', 'p' + bucket].join(':');
const sendAlert = score >= 80 && ai.send_alert !== false;
const intent = String(ai.watch_intent || ai.watch_probability || '').toLowerCase();
return [{ json: {
  analysis_id: analysisId,
  visitor_id: ctx.visitor_id || null,
  session_id: ctx.session_id || null,
  page: '/financial-freedom',
  video_id: 'financial-freedom-video',
  engagement_score: score,
  interest_level: level,
  watch_probability: ['low', 'medium', 'high'].indexOf(intent) >= 0 ? intent : (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'),
  returning_visitor: ctx.returning === true,
  video_completion: Number(completion.toFixed(3)),
  ai_summary: String(ai.ai_summary || '').slice(0, 1200) || ('ผู้ชมรับชม ' + (ctx.max_progress || 0) + '% ของวิดีโอ · คะแนน Engagement ' + score + '/100'),
  recommended_action: String(ai.recommended_action || '').slice(0, 800) || 'ตรวจสอบว่าผู้ชมมีช่องทางติดต่อที่ได้รับความยินยอมไว้หรือไม่ ก่อนดำเนินการติดตามผล',
  reason: reasons,
  model: '""" + MODEL_ID + r"""',
  send_alert: sendAlert,
  event_ids: ctx.event_ids || [],
  ai_ok: isFinite(scoreRaw) ? true : false,
  max_progress: Number(ctx.max_progress) || 0,
  returning: ctx.returning === true,
  watch_seconds: null,
  trigger_event: ctx.trigger_event || null,
} }];
"""

JS_ALERT_EMAIL = r"""
// สร้างอีเมล HTML แจ้งเตือนแบบเรียลไทม์ (ตามสเปกข้อ 8)
const d = $('ตรวจคำตอบ AI + ตัดสินใจ').first().json || {};
const agg = $('[VI02] ดึงข้อมูลพฤติกรรม (aggregate)').first().json || {};
const s = agg.sessionProfile || {};
const fmt = function (sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(n / 60), r = n % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
};
const esc = function (t) { return String(t == null ? '' : t).replace(/[<>&]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]; }); };
const levelColor = d.interest_level === 'VERY_HOT' ? '#e11d48' : d.interest_level === 'HOT' ? '#f59e0b' : d.interest_level === 'WARM' ? '#0ea5e9' : '#64748b';
const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date());
const rows = [
  ['เวลา', when],
  ['หน้าเว็บ', esc(d.page)],
  ['Visitor', 'Visitor #' + String(d.visitor_id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()],
  ['Session', esc(d.session_id || '-')],
  ['วิดีโอ', esc(d.video_id)],
  ['Watch Progress', (d.max_progress || 0) + '%'],
  ['Watch Duration', fmt(s.watchSeconds || 0)],
  ['จำนวนครั้งที่เล่น', String(s.playCount || 0) + ' ครั้ง (Replay ' + String(s.replayCount || 0) + ')'],
  ['คะแนน Engagement', d.engagement_score + '/100'],
  ['ระดับความสนใจ', d.interest_level],
  ['กลับมาดูซ้ำ', d.returning ? 'ใช่ (visitor เดิม)' : 'ไม่ใช่'],
];
const html = ''
  + '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;padding:24px">'
  + '<div style="background:#0f172a;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px">'
  + '<div style="font-size:13px;letter-spacing:.08em;color:#94a3b8">AI VIDEO INTELLIGENCE</div>'
  + '<h2 style="margin:6px 0 0;font-size:20px">🔥 มีผู้ชมที่มี Engagement สูง</h2></div>'
  + '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 24px">'
  + '<div style="display:block;padding:14px;background:#f1f5f9;border-radius:10px;text-align:center">'
  + '<div style="font-size:34px;font-weight:700;color:' + levelColor + '">' + d.engagement_score + '<span style="font-size:16px;color:#64748b">/100</span></div>'
  + '<div style="font-size:14px;font-weight:600;color:' + levelColor + '">' + esc(d.interest_level) + ' · Behavioral Interest Level</div></div>'
  + '<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">'
  + rows.map(function (r) { return '<tr><td style="padding:7px 0;color:#64748b">' + r[0] + '</td><td style="padding:7px 0;text-align:right;font-weight:600;color:#0f172a">' + r[1] + '</td></tr>'; }).join('')
  + '</table>'
  + '<div style="margin-top:16px;padding:14px;border-left:4px solid ' + levelColor + ';background:#f8fafc">'
  + '<div style="font-size:12px;color:#64748b;font-weight:700">AI ANALYSIS</div>'
  + '<div style="margin-top:4px">' + esc(d.ai_summary) + '</div>'
  + '<ul style="margin:8px 0 0 18px;padding:0;color:#334155;font-size:13px">'
  + (d.reason || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('')
  + '</ul></div>'
  + '<div style="margin-top:12px;padding:14px;background:#ecfdf5;border-radius:10px">'
  + '<div style="font-size:12px;color:#047857;font-weight:700">SUGGESTED ACTION</div>'
  + '<div style="margin-top:4px;color:#065f46">' + esc(d.recommended_action) + '</div></div>'
  + '<p style="margin-top:16px;font-size:12px;color:#94a3b8;line-height:1.6">ข้อมูลนี้มาจาก Anonymous Visitor ID และพฤติกรรมการรับชมเท่านั้น — ไม่มีการระบุตัวตน ไม่มีชื่อ/อีเมล/อายุ/เพศ/รายได้ และไม่มีการวิเคราะห์ใบหน้าหรือเสียง. '
  + 'หากไม่ใช่เรื่องที่ต้องติดตาม สามารถเพิกเฉยได้เลย</p>'
  + '</div></div>';
return [{ json: {
  subject: '🔥 AI Video Intelligence Alert — High Engagement (Score ' + d.engagement_score + '/100 · ' + d.interest_level + ')',
  html: html,
  kind: 'alert',
  analysis_id: d.analysis_id,
  visitor_id: d.visitor_id,
  engagement_score: d.engagement_score,
  interest_level: d.interest_level,
} }];
"""

JS_REPORT_PROMPT = r"""
// สร้างโจทย์ให้ AI สรุปภาพรวมจากตัวเลขจริงของ /api/video-intel/stats
const stats = $input.first().json || {};
const st = (stats.body && typeof stats.body === 'object') ? stats.body : stats;
if (st.ok === false || !st.generatedAt) {
  return [{ json: { skip: true, reason: 'stats_unavailable', window: st.window || null } }];
}
const compact = {
  window: st.window, current_visitors: st.currentVisitors, active_video_sessions: st.activeVideoSessions,
  total_visitors: st.totalVisitors, total_sessions: st.totalSessions, total_events: st.totalEvents,
  total_video_views: st.totalVideoViews, video_completes: st.videoCompletes,
  avg_watch_seconds: st.avgWatchSeconds, avg_watch_percent: st.avgWatchPercent,
  completion_rate_pct: st.completionRate, returning_visitors: st.returningVisitors, peak_hour: st.peakHour,
  watch_progress_buckets: st.watchProgress || [], engagement: st.engagement || {},
  hot_visitors: (st.hotVisitors || []).slice(0, 8),
  hourly: (st.hourly || []).slice(-12),
  recent_events: (st.recentEvents || []).slice(0, 12),
};
const prompt = 'ข้อมูลสรุปการรับชมวิดีโอ (ตัวเลขจากฐานข้อมูลจริง):\n' + JSON.stringify(compact, null, 1)
  + '\n\nจงสรุปเป็นภาษาไทยสำหรับเจ้าของธุรกิจ และตอบเป็น JSON ตาม schema เท่านั้น';
return [{ json: {
  prompt: prompt,
  window: st.window || '24h',
  stats: compact,
  headline: {
    visitors: st.totalVisitors || 0, sessions: st.totalSessions || 0, views: st.totalVideoViews || 0,
    avg_pct: st.avgWatchPercent || 0, completion_rate: st.completionRate || 0,
    hot: (st.engagement || {}).hot || 0, very_hot: (st.engagement || {}).veryHot || 0,
    returning: st.returningVisitors || 0, peak_hour: st.peakHour || '-',
    avg_watch_seconds: st.avgWatchSeconds || 0,
  },
} }];
"""

JS_REPORT_EMAIL = r"""
// ประกอบอีเมลรายงาน (รายชั่วโมง/รายวัน) จากตัวเลขจริง + บทสรุปของ AI
const ctx = $('[VIRA] สร้างโจทย์รายงาน').first().json || {};
const raw = $input.first().json || {};
let ai = raw.output;
if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch (e) { ai = null; } }
if (!ai || typeof ai !== 'object') ai = {};
const kind = String($execution.id ? ctx.kind : ctx.kind) === 'hourly' ? 'hourly' : 'daily';
""".replace("ctx.kind", "ctx.window")  # ไม่ใช้ — คงรูปไว้ให้อ่านง่าย (kind ส่งผ่าน ctx โดย node ก่อนหน้า)

JS_REPORT_EMAIL = r"""
// ประกอบอีเมลรายงาน (รายชั่วโมง/รายวัน) จากตัวเลขจริง + บทสรุปของ AI
const ctx = $('[VIRA] สร้างโจทย์รายงาน').first().json || {};
const raw = $input.first().json || {};
let ai = raw.output;
if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch (e) { ai = null; } }
if (!ai || typeof ai !== 'object') ai = {};
const isHourly = ctx.report_kind === 'hourly';
const h = ctx.headline || {};
const esc = function (t) { return String(t == null ? '' : t).replace(/[<>&]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]; }); };
const fmtSec = function (sec) { const n = Math.max(0, Math.round(Number(sec) || 0)); const m = Math.floor(n / 60); return m + ' นาที ' + (n % 60) + ' วินาที'; };
const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
const cards = [
  ['ผู้ชม', h.visitors], ['Session', h.sessions], ['เปิดดูวิดีโอ', h.views],
  ['ดูเฉลี่ย', h.avg_pct + '%'], ['ดูจนจบ', h.completion_rate + '%'], ['กลับมาซ้ำ', h.returning],
  ['Hot', h.hot], ['Very Hot', h.very_hot], ['เวลาดูเฉลี่ย', fmtSec(h.avg_watch_seconds)], ['ช่วงพีค', h.peak_hour],
];
const buckets = ctx.stats && ctx.stats.watch_progress_buckets ? ctx.stats.watch_progress_buckets : [];
const html = ''
  + '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:660px;margin:0 auto;background:#f8fafc;padding:24px">'
  + '<div style="background:#0f172a;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px">'
  + '<div style="font-size:13px;letter-spacing:.08em;color:#94a3b8">AI VIDEO INTELLIGENCE</div>'
  + '<h2 style="margin:6px 0 0;font-size:20px">' + (isHourly ? '📊 รายงานรายชั่วโมง' : '📈 รายงานรายวัน') + '</h2>'
  + '<div style="font-size:13px;color:#cbd5e1;margin-top:4px">' + when + ' · ช่วงข้อมูล ' + esc(ctx.window || '') + '</div></div>'
  + '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 24px">'
  + '<table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>'
  + [0, 2, 4, 6, 8].map(function (i) {
      const a = cards[i] || ['-', '-'], b = cards[i + 1] || ['-', '-'];
      return '<tr>'
        + '<td style="padding:8px 6px;color:#64748b;width:50%">' + a[0] + ' <b style="color:#0f172a">' + a[1] + '</b></td>'
        + '<td style="padding:8px 6px;color:#64748b;width:50%">' + b[0] + ' <b style="color:#0f172a">' + b[1] + '</b></td></tr>';
    }).join('')
  + '</tbody></table>'
  + '<div style="margin-top:16px;padding:14px;background:#f1f5f9;border-radius:10px">'
  + '<div style="font-size:12px;font-weight:700;color:#475569">ขั้นบันไดการรับชม (จำนวนผู้ชมถึงเกณฑ์)</div>'
  + '<div style="margin-top:8px;font-size:13px;color:#0f172a">'
  + buckets.map(function (b) { return esc(b.mark) + '%: <b>' + esc(b.count) + '</b>'; }).join(' &nbsp;·&nbsp; ')
  + '</div></div>'
  + '<div style="margin-top:14px;padding:14px;border-left:4px solid #0ea5e9;background:#f8fafc">'
  + '<div style="font-size:12px;font-weight:700;color:#0369a1">AI INSIGHTS</div>'
  + '<div style="margin-top:6px;color:#0f172a">' + esc(ai.summary || ai.ai_summary || 'ยังไม่มีบทสรุปจาก AI ในรอบนี้') + '</div>'
  + '<ul style="margin:8px 0 0 18px;padding:0;color:#334155;font-size:13px">'
  + (Array.isArray(ai.insights) ? ai.insights : []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('')
  + '</ul></div>'
  + '<div style="margin-top:12px;padding:14px;background:#ecfdf5;border-radius:10px">'
  + '<div style="font-size:12px;font-weight:700;color:#047857">ข้อเสนอแนะ下一步</div>'
  + '<ul style="margin:6px 0 0 18px;padding:0;color:#065f46;font-size:13px">'
  + (Array.isArray(ai.recommendedActions) ? ai.recommendedActions : (Array.isArray(ai.recommended_actions) ? ai.recommended_actions : [])).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('')
  + '</ul></div>'
  + '<p style="margin-top:16px;font-size:12px;color:#94a3b8;line-height:1.6">ตัวเลขทั้งหมดคำนวณจาก event การรับชมจริงในฐานข้อมูล (Anonymous Visitor ID) — '
  + 'ไม่มีการระบุตัวตนผู้ชม และไม่มีการเก็บข้อมูลส่วนบุคคล</p>'
  + '</div></div>';
return [{ json: {
  subject: (isHourly ? '📊 AI Video Intelligence Report — Hourly' : '📈 Daily AI Video Intelligence Report'),
  html: html,
  kind: isHourly ? 'hourly' : 'daily',
  window: ctx.window || null,
  headline: h,
} }];
"""

JS_LOG = r"""
// บันทึก log การทำงานของ workflow ผ่าน /api/agent-log (เส้นทางที่ระบบเดิมใช้อยู่)
const j = $json || {};
return [{ json: {
  source: 'n8n',
  workflow: '""" + "Video Intel" + r"""',
  ok: j.ok !== false,
  stage: j.stage || 'done',
  detail: j.detail || '',
  at: new Date().toISOString(),
  payload: j.payload || null,
} }];
"""

JS_HOURLY_CTX = r"""
// เติมค่า report_kind ให้ node สร้างอีเมลรู้ว่ากำลังทำรายงานแบบไหน
const j = $json || {};
return [{ json: Object.assign({}, j, { report_kind: 'hourly' }) }];
"""

JS_DAILY_CTX = r"""
// เติมค่า report_kind ให้ node สร้างอีเมลรู้ว่ากำลังทำรายงานแบบไหน
const j = $json || {};
return [{ json: Object.assign({}, j, { report_kind: 'daily' }) }];
"""

JS_DASH = r"""
// จัดรูปข้อมูลสำหรับ dashboard (เรียกจากหน้า /admin/video-intelligence หรือระบบอื่น)
const raw = $input.first().json || {};
const st = (raw.body && typeof raw.body === 'object') ? raw.body : raw;
if (st.ok === false) {
  return [{ json: { ok: false, error: st.error || 'stats_unavailable', generatedAt: new Date().toISOString() } }];
}
const eng = st.engagement || {};
return [{ json: {
  ok: true,
  source: 'n8n/video-intel',
  generatedAt: new Date().toISOString(),
  window: st.window,
  currentVisitors: st.currentVisitors || 0,
  activeVideoSessions: st.activeVideoSessions || 0,
  totals: {
    visitors: st.totalVisitors || 0, sessions: st.totalSessions || 0, events: st.totalEvents || 0,
    videoViews: st.totalVideoViews || 0, completes: st.videoCompletes || 0,
    avgWatchSeconds: st.avgWatchSeconds || 0, avgWatchPercent: st.avgWatchPercent || 0,
    completionRate: st.completionRate || 0, returningVisitors: st.returningVisitors || 0,
    peakHour: st.peakHour || null,
  },
  engagement: { cold: eng.cold || 0, warm: eng.warm || 0, hot: eng.hot || 0, veryHot: eng.veryHot || 0 },
  watchProgress: st.watchProgress || [],
  hotVisitors: st.hotVisitors || [],
  recentEvents: (st.recentEvents || []).slice(0, 20),
  hourly: st.hourly || [],
  aiInsight: st.aiInsight || null,
} }];
"""

JS_ERR = r"""
// สรุป error จาก workflow อื่น (errorTrigger) — ไม่ส่งข้อมูลส่วนบุคคลออกไป
const j = $input.first().json || {};
const wf = (j.workflow && j.workflow.name) || j.workflowName || 'unknown';
const ex = j.execution || {};
const lastNode = ex.lastNodeExecuted || (j.execution && j.execution.lastNodeExecuted) || '-';
const msg = String((j.execution && j.execution.error && (j.execution.error.message || j.execution.error.description)) || j.error || 'unknown error');
return [{ json: {
  source: 'n8n',
  workflow: 'Video Intel · Error Handler',
  ok: false,
  stage: 'error',
  detail: 'workflow=' + wf + ' · node=' + lastNode + ' · ' + msg.slice(0, 400),
  failed_workflow: wf,
  failed_execution_id: ex.id || null,
  at: new Date().toISOString(),
} }];
"""

AI_SYSTEM_ANALYZE = (
    "You are a behavioral analyst for a Thai insurance-agency network website. "
    "You receive factual video-watching behaviour of ONE anonymous visitor (uuid, no identity).\n"
    "RULES (absolute):\n"
    "1. Use ONLY the numbers given. Never invent events, counts or durations.\n"
    "2. NEVER infer or mention name, age, gender, income, occupation, location, health or any personal attribute.\n"
    "3. NEVER claim the person is a customer or will buy. The label is a 'Behavioral Interest Level' only.\n"
    "4. Reply with ONE JSON object, no markdown, no explanation outside the JSON, in Thai text for ai_summary/recommended_action/reason.\n"
    "5. engagement_score is an integer 0-100 reflecting watching engagement (progress %, watch time, plays, replays, "
    "returning visitor, pauses/resumes, completion).\n"
    "6. Levels: COLD 0-24 (brief visit, <10%, no interaction) · WARM 25-49 (>25%, some interaction) · "
    "HOT 50-74 (>70%, completed/replay/returning) · VERY_HOT 75-100 (completed, multiple returns, very high engagement).\n"
    "JSON schema:\n"
    '{"engagement_score": 0, "interest_level": "COLD|WARM|HOT|VERY_HOT", "watch_intent": "low|medium|high", '
    '"visitor_stage": "cold|warm|hot|very_hot", "returning_visitor": false, "video_completion": 0.0, '
    '"ai_summary": "สรุปภาษาไทย 1-2 ประโยค", "recommended_action": "ข้อเสนอถัดไปที่สุภาพ ไม่ล้ำเส้นความเป็นส่วนตัว", '
    '"reason": ["เหตุผลสั้น ๆ 1-4 ข้อ อ้างจากตัวเลขจริง"], "send_alert": false}'
)

AI_EXAMPLE_ANALYZE = json.dumps({
    "engagement_score": 87,
    "interest_level": "VERY_HOT",
    "watch_intent": "high",
    "visitor_stage": "very_hot",
    "returning_visitor": True,
    "video_completion": 0.91,
    "ai_summary": "ผู้ชมดูเนื้อหาส่วนใหญ่ของวิดีโอและกลับมารับชมซ้ำ แสดงถึง Engagement สูงต่อเนื้อหา",
    "recommended_action": "ตรวจสอบว่าผู้ชมมีช่องทางติดต่อที่ได้รับความยินยอมไว้หรือไม่ ก่อนดำเนินการติดตามผล",
    "reason": ["ดูวิดีโอเกิน 80%", "กลับมาดูซ้ำ", "ใช้เวลาอยู่บนหน้าเว็บนาน"],
    "send_alert": True,
}, ensure_ascii=False, indent=1)

AI_SYSTEM_REPORT = (
    "You are an analytics writer for a Thai insurance-agency network website owner. "
    "You receive real aggregate numbers of the video-intelligence dashboard for a time window.\n"
    "RULES: use ONLY the given numbers; never infer personal attributes of any visitor; write Thai; "
    "reply with ONE JSON object only.\n"
    '{"summary": "ภาพรวม 2-3 ประโยคภาษาไทย", "insights": ["ข้อสังเกตจากตัวเลข 2-5 ข้อ"], '
    '"recommendedActions": ["สิ่งที่ควรทำต่อ 2-4 ข้อ (สุภาพ เคารพความเป็นส่วนตัว)"], "highlight": "จุดเด่นที่สุดของช่วงนี้ 1 ประโยค"}'
)

AI_EXAMPLE_REPORT = json.dumps({
    "summary": "มีผู้ชม 12 คน เปิดดูวิดีโอ 21 ครั้ง โดยเฉลี่ยดู 61% ของคลิป",
    "insights": ["ผู้ชม 4 คนดูจนจบ", "ช่วง 20:00 มีผู้ชมมากที่สุด"],
    "recommendedActions": ["ทดลองเปลี่ยนคลิปเปิดให้สั้นลงและมีคำชวนชัดเจนขึ้น"],
    "highlight": "อัตราดูจนจบ 19% สูงกว่าค่าเฉลี่ยทั่วไปของหน้าแนะนำ",
}, ensure_ascii=False, indent=1)


def build_vi01():
    n = []
    vf = "https://ai-insurance-network-tree.vercel.app/financial-freedom"
    n.append(sticky("คำอธิบาย", (
        "## Video Intel 01 · รับ Event + คิวประมวลผล\n"
        "**หน้าที่**: รับ event การรับชมวิดีโอจากหน้า /financial-freedom 2 ทาง\n"
        "1) Webhook (push จากแอปทันทีเมื่อผู้ชมมี interaction)\n"
        "2) ดึงคิวทุก 1 นาที (สำรอง — ทำงานแม้ท่อส่งภายนอกล่ม)\n\n"
        "คัดเฉพาะ event ที่ควรวิเคราะห์ (play / ended / exit / กลับมาเยี่ยม / ดูถึง 50%+)\n"
        "แล้วส่งต่อให้ **Video Intel 02** วิเคราะห์ด้วย AI"), 0, -260, 460, 300))
    n.append(webhook("รับ Event จากเว็บ (Webhook /video-intel-event)", "video-intel-event", 220, -160))
    n.append(code("คัด event ที่ควรวิเคราะห์ (จาก Webhook)", JS_WEBHOOK_PREP, 480, -160))
    n.append(schedule("ทุก 1 นาที (ดึงคิวสำรอง)", [{"field": "minutes", "minutesInterval": 1}], 220, 60))
    n.append(http("ดึงคิวรอประมวลผล (/api/video-intel/queue)", APP + "/api/video-intel/queue", 480, 60,
                  method="GET", query=[["limit", "40"], ["minutes", "720"]]))
    n.append(code("แปลงคิวเป็นงานวิเคราะห์", JS_QUEUE_PREP, 740, 60))
    n.append(code("รวมงานเป็นรายเซสชัน", JS_MERGE, 1000, -50))
    n.append(ifnode("มีงานต้องวิเคราะห์?", "={{ $json.visitor_id !== undefined && $json.visitor_id !== '' }}", 1260, -50))
    n.append(http("ส่งเข้า AI วิเคราะห์ (VI02)",
                  LOCAL_N8N + "/webhook/video-intel-analyze", 1520, -160,
                  body="={{ JSON.stringify({ visitor_id: $json.visitor_id, session_id: $json.session_id, "
                       "event_ids: $json.event_ids, trigger_event: $json.trigger_event, "
                       "max_mark: $json.max_mark, source: 'n8n-vi01' }) }}",
                  timeout=180000))
    n.append(noop("จบรอบ — ไม่มีงานใหม่", 1520, 40))

    c = {}
    chain(c, [
        ("รับ Event จากเว็บ (Webhook /video-intel-event)", "คัด event ที่ควรวิเคราะห์ (จาก Webhook)"),
        ("ทุก 1 นาที (ดึงคิวสำรอง)", "ดึงคิวรอประมวลผล (/api/video-intel/queue)"),
        ("ดึงคิวรอประมวลผล (/api/video-intel/queue)", "แปลงคิวเป็นงานวิเคราะห์"),
    ])
    chain(c, [("คัด event ที่ควรวิเคราะห์ (จาก Webhook)", "รวมงานเป็นรายเซสชัน"),
              ("แปลงคิวเป็นงานวิเคราะห์", "รวมงานเป็นรายเซสชัน"),
              ("รวมงานเป็นรายเซสชัน", "มีงานต้องวิเคราะห์?")])
    branch(c, "มีงานต้องวิเคราะห์?", 0, "ส่งเข้า AI วิเคราะห์ (VI02)")
    branch(c, "มีงานต้องวิเคราะห์?", 1, "จบรอบ — ไม่มีงานใหม่")
    return {"name": "Video Intel 01 · รับ Event วิดีโอ + คิวประมวลผล (Webhook + ทุก 1 นาที)",
            "nodes": n, "connections": c,
            "description": "รับ event การรับชมวิดีโอจากหน้า /financial-freedom (push + pull) แล้วส่งต่อให้ VI02 วิเคราะห์ด้วย AI"}


def build_vi02():
    n = []
    n.append(sticky("คำอธิบาย", (
        "## Video Intel 02 · AI วิเคราะห์ + จัดระดับ + แจ้งเตือนทันที\n"
        "**สมองกลาง**: อ่านพฤติกรรมจริงจาก /api/video-intel/aggregate → ให้ AI (Gemini) ประเมิน\n"
        "Engagement Score 0-100 และ Behavioral Interest Level → เก็บผล → ถ้าคะแนน ≥ 80 ส่งอีเมลทันที\n"
        "ห้าม AI เดาข้อมูลส่วนบุคคล — ใช้ anonymous visitor id เท่านั้น"), 0, -280, 460, 320))
    n.append(webhook("Webhook /video-intel-analyze", "video-intel-analyze", 220, -160, mode="responseNode"))
    n.append(code("อ่านคำขอ", JS_READ_REQ, 480, -160))
    n.append(ifnode("มี visitor_id?", "={{ $json.ok }}", 740, -160))
    n.append(http("[VI02] ดึงข้อมูลพฤติกรรม (aggregate)",
                  APP + "/api/video-intel/aggregate", 1000, -240, method="GET",
                  query=[["visitor_id", "={{ $json.visitor_id }}"],
                         ["session_id", "={{ $json.session_id }}"],
                         ["minutes", "180"]]))
    n.append(code("สร้างโจทย์ให้ AI", JS_AI_PROMPT, 1260, -240))
    n.append(agent("AI วิเคราะห์พฤติกรรม", "={{ $json.prompt }}", AI_SYSTEM_ANALYZE, 1520, -240))
    n.append(code("ตรวจคำตอบ AI + ตัดสินใจ", JS_DECIDE, 1780, -240))
    n.append(http("บันทึกผลวิเคราะห์ (/api/video-intel/analysis)",
                  APP + "/api/video-intel/analysis", 2040, -240,
                  body="={{ JSON.stringify({ analysis_id: $json.analysis_id, visitor_id: $json.visitor_id, "
                       "session_id: $json.session_id, page: $json.page, video_id: $json.video_id, "
                       "engagement_score: $json.engagement_score, interest_level: $json.interest_level, "
                       "watch_probability: $json.watch_probability, returning_visitor: $json.returning_visitor, "
                       "video_completion: $json.video_completion, ai_summary: $json.ai_summary, "
                       "recommended_action: $json.recommended_action, reason: $json.reason, model: $json.model, "
                       "send_alert: $json.send_alert, event_ids: $json.event_ids }) }}"))
    n.append(ifnode("ควรแจ้งเตือนทันที? (score ≥ 80)",
                    "={{ $('ตรวจคำตอบ AI + ตัดสินใจ').first().json.send_alert === true }}", 2300, -240))
    n.append(code("สร้างอีเมล HTML", JS_ALERT_EMAIL, 2560, -340))
    n.append(http("ส่งอีเมลแจ้งเตือน (/api/video-intel/notify)",
                  APP + "/api/video-intel/notify", 2820, -340,
                  body="={{ JSON.stringify({ subject: $json.subject, html: $json.html, kind: $json.kind, analysis_id: $json.analysis_id }) }}"))
    n.append(code("สรุปผลการแจ้งเตือน", """const j = $json || {};
const d = $('ตรวจคำตอบ AI + ตัดสินใจ').first().json || {};
return [{ json: { source: 'n8n', workflow: 'Video Intel 02 · AI วิเคราะห์', ok: true, stage: 'alert_sent',
  detail: 'visitor=' + String(d.visitor_id || '').slice(0, 8) + ' score=' + d.engagement_score + ' level=' + d.interest_level + ' email=' + (j.email || 'unknown'),
  at: new Date().toISOString(),
  payload: { analysis_id: d.analysis_id, email: j.email || null, provider: j.provider || null } } }];""", 3080, -340))
    n.append(http("บันทึก Log (แจ้งเตือนแล้ว) (/api/agent-log)", APP + "/api/agent-log", 3340, -340,
                  body="={{ JSON.stringify({ source: 'n8n', workflow: $json.workflow, ok: $json.ok, stage: $json.stage, detail: $json.detail, at: $json.at, payload: $json.payload }) }}"))
    n.append(respond("ตอบกลับ (แจ้งเตือนแล้ว)", 3600, -340))
    n.append(respond("ตอบกลับ (ไม่แจ้งเตือน)", 2560, -40))
    n.append(respond("ตอบกลับ (ข้อมูลไม่พอ)", 1000, -60))

    c = {}
    chain(c, [("Webhook /video-intel-analyze", "อ่านคำขอ"),
              ("อ่านคำขอ", "มี visitor_id?")])
    branch(c, "มี visitor_id?", 0, "[VI02] ดึงข้อมูลพฤติกรรม (aggregate)")
    branch(c, "มี visitor_id?", 1, "ตอบกลับ (ข้อมูลไม่พอ)")
    chain(c, [("[VI02] ดึงข้อมูลพฤติกรรม (aggregate)", "สร้างโจทย์ให้ AI"),
              ("สร้างโจทย์ให้ AI", "AI วิเคราะห์พฤติกรรม"),
              ("AI วิเคราะห์พฤติกรรม", "ตรวจคำตอบ AI + ตัดสินใจ"),
              ("ตรวจคำตอบ AI + ตัดสินใจ", "บันทึกผลวิเคราะห์ (/api/video-intel/analysis)"),
              ("บันทึกผลวิเคราะห์ (/api/video-intel/analysis)", "ควรแจ้งเตือนทันที? (score ≥ 80)")])
    branch(c, "ควรแจ้งเตือนทันที? (score ≥ 80)", 0, "สร้างอีเมล HTML")
    branch(c, "ควรแจ้งเตือนทันที? (score ≥ 80)", 1, "ตอบกลับ (ไม่แจ้งเตือน)")
    chain(c, [("สร้างอีเมล HTML", "ส่งอีเมลแจ้งเตือน (/api/video-intel/notify)"),
              ("ส่งอีเมลแจ้งเตือน (/api/video-intel/notify)", "สรุปผลการแจ้งเตือน"),
              ("สรุปผลการแจ้งเตือน", "บันทึก Log (แจ้งเตือนแล้ว) (/api/agent-log)"),
              ("บันทึก Log (แจ้งเตือนแล้ว) (/api/agent-log)", "ตอบกลับ (แจ้งเตือนแล้ว)")])
    sub(c, "Gemini Chat Model", "ai_languageModel", "AI วิเคราะห์พฤติกรรม")
    sub(c, "Structured Output Parser", "ai_outputParser", "AI วิเคราะห์พฤติกรรม")
    n.append(chat_model("Gemini Chat Model", 1520, -60))
    n.append(parser("Structured Output Parser", AI_EXAMPLE_ANALYZE, 1520, 120))
    return {"name": "Video Intel 02 · AI วิเคราะห์พฤติกรรม → จัดระดับ → แจ้งเตือนทันที",
            "nodes": n, "connections": c,
            "description": "AI เป็นสมองกลาง: ประเมิน Engagement Score + Behavioral Interest Level จากพฤติกรรมจริง และแจ้งเตือนทันทีเมื่อคะแนน ≥ 80"}


def _report_workflow(kind):
    hourly = kind == "hourly"
    name = ("Video Intel 03 · รายงานรายชั่วโมง (AI Hourly Report)" if hourly
            else "Video Intel 04 · รายงานรายวัน 20:00 (AI Daily Report)")
    n = []
    n.append(sticky("คำอธิบาย", (
        ("## รายงานรายชั่วโมง\nดึงตัวเลขจริงของ 1 ชั่วโมงล่าสุด → ให้ AI สรุปเป็นภาษาไทย → ส่งอีเมล"
         if hourly else
         "## รายงานรายวัน (20:00 Asia/Bangkok)\nดึงตัวเลขจริงของ 24 ชั่วโมง → ให้ AI สรุป + ข้อเสนอแนะ → ส่งอีเมล"),
    ), 0, -280, 460, 240))
    if hourly:
        n.append(schedule("ทุก 1 ชั่วโมง", [{"field": "hours", "hoursInterval": 1}], 220, -160))
    else:
        n.append(schedule("ทุกวัน 20:00 (Asia/Bangkok)", [{"field": "cronExpression", "expression": "0 20 * * *"}], 220, -160))
    # ทริกเกอร์เสริม: รันรายงานเดี๋ยวนี้ผ่าน webhook (ใช้ทดสอบ/สั่งด้วยมือได้โดยไม่ต้องล็อกอิน n8n)
    n.append(webhook("รันเดี๋ยวนี้ (Webhook /%s)" % ("video-intel-report-hourly" if hourly else "video-intel-report-daily"),
                     "video-intel-report-hourly" if hourly else "video-intel-report-daily",
                     220, 40, method="POST", mode="onReceived"))
    n.append(http("ดึงสถิติจริง (/api/video-intel/stats)",
                  APP + "/api/video-intel/stats", 480, -160, method="GET",
                  query=[["window", "1h" if hourly else "24h"], ["limit", "40"]]))
    n.append(code("[VIRA] สร้างโจทย์รายงาน", JS_REPORT_PROMPT, 740, -160))
    n.append(code("เติมชนิดรายงาน", JS_HOURLY_CTX if hourly else JS_DAILY_CTX, 1000, -300))
    n.append(agent("AI สรุปภาพรวม", "={{ $json.prompt }}", AI_SYSTEM_REPORT, 1260, -300))
    n.append(code("ประกอบอีเมลรายงาน", JS_REPORT_EMAIL, 1520, -300))
    n.append(http("ส่งอีเมลรายงาน (/api/video-intel/notify)",
                  APP + "/api/video-intel/notify", 1780, -300,
                  body="={{ JSON.stringify({ subject: $json.subject, html: $json.html, kind: $json.kind }) }}"))
    n.append(code("สรุปการส่ง", """const j = $json || {};
const h = $('ประกอบอีเมลรายงาน').first().json || {};
const head = h.headline || {};
return [{ json: { source: 'n8n', workflow: '""" + ("Video Intel 03 · รายงานรายชั่วโมง" if hourly else "Video Intel 04 · รายงานรายวัน") + """',
  ok: true, stage: 'report_sent',
  detail: 'email=' + (j.email || 'unknown') + ' visitors=' + (head.visitors || 0) + ' veryHot=' + (head.very_hot || 0),
  at: new Date().toISOString() } }];""", 2040, -300))
    n.append(http("บันทึก Log (/api/agent-log)", APP + "/api/agent-log", 2300, -300,
                  body="={{ JSON.stringify({ source: 'n8n', workflow: $json.workflow, ok: $json.ok, stage: $json.stage, detail: $json.detail, at: $json.at }) }}"))
    n.append(noop("จบรอบ", 1520, 20))
    c = {}
    trig = "ทุก 1 ชั่วโมง" if hourly else "ทุกวัน 20:00 (Asia/Bangkok)"
    wh = "รันเดี๋ยวนี้ (Webhook /%s)" % ("video-intel-report-hourly" if hourly else "video-intel-report-daily")
    chain(c, [(trig, "ดึงสถิติจริง (/api/video-intel/stats)"),
              (wh, "ดึงสถิติจริง (/api/video-intel/stats)"),
              ("ดึงสถิติจริง (/api/video-intel/stats)", "[VIRA] สร้างโจทย์รายงาน"),
              ("[VIRA] สร้างโจทย์รายงาน", "เติมชนิดรายงาน"),
              ("เติมชนิดรายงาน", "AI สรุปภาพรวม"),
              ("AI สรุปภาพรวม", "ประกอบอีเมลรายงาน"),
              ("ประกอบอีเมลรายงาน", "ส่งอีเมลรายงาน (/api/video-intel/notify)"),
              ("ส่งอีเมลรายงาน (/api/video-intel/notify)", "สรุปการส่ง"),
              ("สรุปการส่ง", "บันทึก Log (/api/agent-log)")])
    sub(c, "Gemini Chat Model", "ai_languageModel", "AI สรุปภาพรวม")
    sub(c, "Structured Output Parser", "ai_outputParser", "AI สรุปภาพรวม")
    n.append(chat_model("Gemini Chat Model", 1260, -100))
    n.append(parser("Structured Output Parser", AI_EXAMPLE_REPORT, 1260, 60))
    return {"name": name, "nodes": n, "connections": c,
            "description": ("รายงานรายชั่วโมง: AI สรุปสถิติการรับชมจริง 1 ชั่วโมงล่าสุดแล้วส่งอีเมล"
                            if hourly else
                            "รายงานรายวัน 20:00: AI สรุปสถิติการรับชมจริง 24 ชั่วโมง + ข้อเสนอแนะ แล้วส่งอีเมล")}


def build_vi05():
    n = []
    n.append(sticky("คำอธิบาย", ("## Dashboard Feed\nAPI กลางของ n8n สำหรับดึงสถิติ Video Intelligence "
                                 "(ให้หน้า /admin/video-intelligence หรือระบบอื่นเรียกใช้)\n"
                                 "GET /video-intel-dashboard?window=1h|24h|7d"), 0, -240, 440, 200))
    n.append(webhook("Webhook GET /video-intel-dashboard", "video-intel-dashboard", 220, -120,
                     method="GET", mode="responseNode"))
    n.append(http("ดึงสถิติจริง (/api/video-intel/stats)", APP + "/api/video-intel/stats", 480, -120,
                  method="GET", query=[["window", "={{ $json.query.window || '24h' }}"], ["limit", "30"]]))
    n.append(code("[VID] จัดรูปข้อมูล dashboard", JS_DASH, 740, -120))
    n.append(respond("ตอบกลับ (JSON)", 1000, -120))
    c = {}
    chain(c, [("Webhook GET /video-intel-dashboard", "ดึงสถิติจริง (/api/video-intel/stats)"),
              ("ดึงสถิติจริง (/api/video-intel/stats)", "[VID] จัดรูปข้อมูล dashboard"),
              ("[VID] จัดรูปข้อมูล dashboard", "ตอบกลับ (JSON)")])
    return {"name": "Video Intel 05 · Dashboard Feed (GET /video-intel-dashboard)",
            "nodes": n, "connections": c,
            "description": "API กลางของ n8n สำหรับดึงสถิติ Video Intelligence แบบเรียลไทม์ (ให้ dashboard/ระบบอื่นเรียก)"}


def build_vi09():
    n = []
    n.append(sticky("คำอธิบาย", "## Error Handler\nรับ error จาก workflow Video Intel ทุกตัว → บันทึก log + แจ้งเตือนผ่านแอป",
                    0, -200, 420, 180))
    n.append(node("n8n-nodes-base.errorTrigger", "รับ error จาก workflow อื่น", {}, 220, -80, 1))
    n.append(code("สรุป error", JS_ERR, 480, -80, on_error="continueRegularOutput"))
    n.append(http("บันทึก Log (/api/agent-log)", APP + "/api/agent-log", 740, -80,
                  body="={{ JSON.stringify({ source: 'n8n', workflow: $json.workflow, ok: false, stage: 'error', "
                       "detail: $json.detail, at: $json.at, failed_workflow: $json.failed_workflow }) }}"))
    c = {}
    chain(c, [("รับ error จาก workflow อื่น", "สรุป error"),
              ("สรุป error", "บันทึก Log (/api/agent-log)")])
    return {"name": ERROR_WF_NAME, "nodes": n, "connections": c,
            "description": "รับ error จาก workflow Video Intel ทุกตัว แล้วบันทึก log/แจ้งเตือนผ่านแอป"}


# ── validation ──────────────────────────────────────────────────────────────
def validate(wf):
    errs = []
    nodes = wf["nodes"]
    names = [x["name"] for x in nodes]
    if len(names) != len(set(names)):
        errs.append("ชื่อ node ซ้ำ: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    nameset = set(names)
    for src, ports in wf["connections"].items():
        if src not in nameset:
            errs.append(f"connections อ้าง node ที่ไม่มี: {src}")
            continue
        for port, lists in ports.items():
            for lst in lists:
                for tgt in lst:
                    if tgt["node"] not in nameset:
                        errs.append(f"{src} → {tgt['node']} (ไม่มี node ปลายทาง)")
    triggers = [x for x in nodes if x["type"] in
                ("n8n-nodes-base.webhook", "n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.errorTrigger",
                 "n8n-nodes-base.manualTrigger")]
    if not triggers:
        errs.append("ไม่มี trigger node")
    for x in nodes:
        if x["type"] == "n8n-nodes-base.webhook" and not x.get("webhookId"):
            errs.append(f"webhook {x['name']} ไม่มี webhookId")
    # ทุก webhook ที่ใช้ responseNode ต้องมี respondToWebhook  reachable
    if any(x["type"] == "n8n-nodes-base.webhook" and x["parameters"].get("responseMode") == "responseNode" for x in nodes):
        if not any(x["type"] == "n8n-nodes-base.respondToWebhook" for x in nodes):
            errs.append("webhook responseNode แต่ไม่มี respondToWebhook")
    # ตรวจ JS ของ Code node
    for x in nodes:
        if x["type"] == "n8n-nodes-base.code":
            js = x["parameters"]["jsCode"]
            f = os.path.join(TMP, f"check_{abs(hash(x['name']))}.js")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("async function __n8n(){\n" + js + "\n}\n")
            r = subprocess.run([NODE, "--check", f], capture_output=True, text=True)
            if r.returncode != 0:
                errs.append(f"JS พังใน node {x['name']}: {r.stderr.strip().splitlines()[-1] if r.stderr else 'syntax error'}")
    return errs


# ── DB import ───────────────────────────────────────────────────────────────
def insert(wf, error_wf_id, wid=None):
    wid = wid or str(uuid.uuid4())
    vid = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    settings = {"executionOrder": "v1", "saveManualExecutions": True, "timezone": TZ}
    if error_wf_id and wf["name"] != ERROR_WF_NAME:
        settings["errorWorkflow"] = error_wf_id
    nodes_json = json.dumps(wf["nodes"], ensure_ascii=False)
    conns_json = json.dumps(wf["connections"], ensure_ascii=False)
    cur = con.cursor()
    busy(cur)
    cur.execute("""INSERT INTO workflow_entity
      (id,name,active,nodes,connections,settings,staticData,pinData,versionId,triggerCount,meta,
       parentFolderId,createdAt,updatedAt,isArchived,versionCounter,description,activeVersionId,nodeGroups,sourceWorkflowId)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (wid, wf["name"], 1, nodes_json, conns_json,
         json.dumps(settings, ensure_ascii=False), "{}", "{}", vid,
         len([x for x in wf["nodes"] if x["type"] in ("n8n-nodes-base.webhook", "n8n-nodes-base.scheduleTrigger",
                                                      "n8n-nodes-base.errorTrigger")]),
         json.dumps({}, ensure_ascii=False), None, now, now, 0, 1,
         wf.get("description", ""), vid, json.dumps([]), None))
    busy(cur)
    cur.execute("INSERT OR IGNORE INTO shared_workflow (workflowId,projectId,role,createdAt,updatedAt) VALUES (?,?,?,?,?)",
                (wid, PROJECT, "workflow:owner", now, now))
    cur.execute("""INSERT INTO workflow_history
      (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (vid, wid, "hermes-build", now, now, nodes_json, conns_json, wf["name"], 0,
                 wf.get("description", ""), json.dumps([])))
    return wid, vid


def busy(cur):
    cur.execute("PRAGMA busy_timeout=60000")


TMP = os.environ.get("TMPDIR") or os.path.expanduser("~/AppData/Local/Temp")
NODE = r"C:/Users/User/AppData/Local/hermes/tools/node-26.7.0-win32-x64/node.exe"
PROJECT = None
con = None

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--export-only", action="store_true")
    ap.add_argument("--update", action="store_true", help="เขียนทับ workflow ที่มีชื่อเดียวกัน")
    args = ap.parse_args()

    workflows = [build_vi01(), build_vi02(), _report_workflow("hourly"), _report_workflow("daily"),
                 build_vi05(), build_vi09()]

    ok = True
    for wf in workflows:
        errs = validate(wf)
        print(("OK    " if not errs else "FAIL  ") + wf["name"] + f"  ({len(wf['nodes'])} nodes)")
        for e in errs:
            print("        ! " + e)
        ok = ok and not errs
    if not ok:
        print("\nตรวจสอบไม่ผ่าน — ไม่เขียน DB")
        sys.exit(2)

    os.makedirs(OUTDIR, exist_ok=True)
    for wf in workflows:
        slug = re.sub(r"[^a-z0-9]+", "-", wf["name"].lower()).strip("-")
        path = os.path.join(OUTDIR, f"{slug}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"],
                       "settings": {"executionOrder": "v1", "timezone": TZ}}, fh, ensure_ascii=False, indent=2)
        print("export →", os.path.basename(path))
    if args.dry_run or args.export_only:
        print("\n(ไม่เขียน DB)" if args.dry_run else "\n(export เท่านั้น)")
        sys.exit(0)

    con = sqlite3.connect(DB, timeout=60)
    con.execute("PRAGMA busy_timeout=60000")
    PROJECT = con.execute("SELECT id FROM project LIMIT 1").fetchone()[0]

    created = {}
    for wf in workflows:
        if args.update:
            row = con.execute("SELECT id FROM workflow_entity WHERE name=?", (wf["name"],)).fetchone()
        else:
            row = con.execute("SELECT id FROM workflow_entity WHERE name=?", (wf["name"],)).fetchone()
            if row:
                print(f"มีอยู่แล้ว ข้าม: {wf['name']} ({row[0]})")
                created[wf["name"]] = row[0]
                continue
        wid = row[0] if row else None
        if wid:
            vid = str(uuid.uuid4())
            now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
            settings = {"executionOrder": "v1", "saveManualExecutions": True, "timezone": TZ}
            if created.get(ERROR_WF_NAME):
                settings["errorWorkflow"] = created[ERROR_WF_NAME]
            cur = con.cursor(); busy(cur)
            cur.execute("""UPDATE workflow_entity SET nodes=?, connections=?, settings=?, versionId=?,
                activeVersionId=?, updatedAt=?, description=?, versionCounter=versionCounter+1 WHERE id=?""",
                (json.dumps(wf["nodes"], ensure_ascii=False), json.dumps(wf["connections"], ensure_ascii=False),
                 json.dumps(settings, ensure_ascii=False), vid, vid, now, wf.get("description", ""), wid))
            busy(cur)
            cur.execute("""INSERT INTO workflow_history
                (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (vid, wid, "hermes-build", now, now, json.dumps(wf["nodes"], ensure_ascii=False),
                 json.dumps(wf["connections"], ensure_ascii=False), wf["name"], 0, wf.get("description", ""), json.dumps([])))
            print("updated →", wf["name"], wid)
        else:
            # สร้าง error handler ก่อน เพื่อให้ workflow อื่นอ้าง id ได้
            wid, vid = insert(wf, created.get(ERROR_WF_NAME))
            print("created →", wf["name"], wid)
        created[wf["name"]] = wid
        con.commit()

    # อัปเดต errorWorkflow ให้ครบ (เผื่อ VI09 ถูกสร้างทีหลัง)
    err_id = created.get(ERROR_WF_NAME)
    if err_id:
        for name, wid in created.items():
            if name == ERROR_WF_NAME:
                continue
            s = con.execute("SELECT settings FROM workflow_entity WHERE id=?", (wid,)).fetchone()[0]
            d = json.loads(s or "{}")
            d["errorWorkflow"] = err_id
            cur = con.cursor(); busy(cur)
            cur.execute("UPDATE workflow_entity SET settings=? WHERE id=?", (json.dumps(d, ensure_ascii=False), wid))
        con.commit()
    con.close()
    print("\nเสร็จ — workflow ทั้งหมด:")
    for k, v in created.items():
        print("  ", v, k)
