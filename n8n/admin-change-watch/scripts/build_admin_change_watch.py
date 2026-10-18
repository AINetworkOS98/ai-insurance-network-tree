#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_admin_change_watch.py
สร้าง/อัปเดต workflow n8n "ตรวจความเปลี่ยนแปลง /admin ทุกวินาที · Hermes AI → LINE OA"

โครง workflow
  [A] Schedule ทุก 10 วินาที ─┐
  [B] Webhook สั่งตรวจเอง ────┤→ อ่าน cursor (staticData) → GET /api/admin/watch (long-poll 9 วิ)
                             └→ มีการเปลี่ยนแปลง? → สรุปด้วย Hermes AI (/api/ai/query)
                                → ประกอบข้อความ LINE → ถึงเวลาส่ง? → POST /api/line/notify
                                → ปิดรอบ (เก็บ cursor/pending)

หลักการ
  • ฝั่งแอปเป็นคน "ตรวจทุก 1 วินาที" (long-poll วนอ่านทุก 1 วิฝั่งเซิร์ฟเวอร์) — n8n เพียงถือคำขอไว้
    ⇒ เห็นการเปลี่ยนแปลงภายใน ~1 วินาที โดย n8n ไม่ต้องยิง HTTP ถี่
  • cursor (sig/since) และคิว pending เก็บใน staticData ของ workflow (ไม่ต้องมีตารางเพิ่ม)
  • จำกัดความถี่การ push LINE (โควตาข้อความมีจำกัด): ปกติ ≥5 นาที/ครั้ง · เหตุการณ์สำคัญ ≥60 วินาที/ครั้ง
    ระหว่างที่ยังไม่ถึงเวลา จะสะสมไว้ใน pending แล้วส่งรวมครั้งถัดไป (ไม่หาย)
  • ไม่ส่งข้อมูลส่วนบุคคล: /api/admin/watch คืนเฉพาะจำนวน/เวลา/ป้ายเหตุการณ์

ใช้:
    python n8n/admin-change-watch/scripts/build_admin_change_watch.py --dry-run
    python n8n/admin-change-watch/scripts/build_admin_change_watch.py
"""
import argparse
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
WF_DIR = os.path.normpath(os.path.join(HERE, "..", "workflows"))
DB = os.path.expanduser(os.path.join("~", ".n8n", "database.sqlite"))
APP = "https://ai-insurance-network-tree.vercel.app"
ERROR_WORKFLOW = "a3c53150-d772-4e18-8017-5c95a98882f4"  # Video Intel 09 · Error Handler
WF_NAME = "ตรวจความเปลี่ยนแปลง /admin ทุกวินาที · Hermes AI → LINE OA"
WEBHOOK_PATH = "admin-change-watch"

INTERVAL_SECONDS = 10          # รอบของ n8n
LONGPOLL_SECONDS = 9           # ถือคำขอไว้กี่วินาที (น้อยกว่ารอบ 1 วิ เพื่อไม่ให้คิวทับกัน)

AUTH_HEADERS = [
    {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"},
    {"name": "Content-Type", "value": "application/json"},
]

CODE_CURSOR = r"""
// อ่าน cursor/คิวที่ค้างจาก staticData — ใช้ร่วมกันทั้ง schedule และ webhook
const input = $input.first().json || {};
const isManual = !!(input && input.headers);   // webhook มี headers · schedule มี {}
const s = $getWorkflowStaticData('global');
const nowIso = new Date().toISOString();
return [{ json: {
  sig: String(s.sig || ''),
  since: String(s.since || nowIso),
  wait: isManual ? 0 : __LONGPOLL__,
  manual: isManual,
  pending: Array.isArray(s.pending) ? s.pending : [],
  lastPushAt: Number(s.lastPushAt || 0),
} }];
""".replace("__LONGPOLL__", str(LONGPOLL_SECONDS)).strip()

CODE_SUMMARY = r"""
// รวมเหตุการณ์ใหม่ + คิวที่ยังไม่ได้รายงาน → สร้างคำถามให้ Hermes AI สรุป
function j(v) { return (v === null || v === undefined) ? '' : String(v); }
const prep = $('อ่าน cursor').first().json || {};
const raw = $input.first().json || {};
const body = (raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body)) ? raw.body : raw;

if (body.ok !== true) {
  return [{ json: {
    push: false, error: true,
    detail: 'อ่านสถานะไม่สำเร็จ: ' + j(body.error || body.message || 'unknown').slice(0, 160),
    sig: prep.sig, at: null, events: [], pending: prep.pending, lastPushAt: prep.lastPushAt,
    highSignal: false, counts: {}, prompt: '', totalNew: 0,
  } }];
}

const events = Array.isArray(body.events) ? body.events : [];
const pending = Array.isArray(prep.pending) ? prep.pending : [];
const seen = {};
const all = [];
pending.concat(events).forEach(function (e) {
  const key = j(e.at) + '|' + j(e.label);
  if (seen[key]) return;
  seen[key] = 1;
  all.push({ at: j(e.at), label: j(e.label), action: j(e.action) });
});
all.sort(function (a, b) { return a.at < b.at ? -1 : (a.at > b.at ? 1 : 0); });

// การเปลี่ยนแปลงที่ตัวเลขเปลี่ยนแต่ไม่มี AuditLog (เช่น เขียนผ่านสคริปต์) — ต้องไม่เงียบ
if (!all.length && body.changed === true) {
  all.push({ at: j(body.at), label: 'ข้อมูลในระบบเปลี่ยน (ไม่พบบันทึก AuditLog)', action: 'system.change' });
}

const HIGH = ['register', 'approve', 'reject', 'delete', 'restore', 'receipt', 'support', 'message', 'prospect.create', 'promot', 'verify'];
const highSignal = all.some(function (e) {
  const a = j(e.action).toLowerCase();
  return HIGH.some(function (h) { return a.indexOf(h) >= 0; });
});

function bkk(iso) {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  const d = new Date(t.getTime() + 7 * 3600e3).toISOString();
  return d.slice(11, 19);
}
const lines = all.slice(-12).map(function (e) { return '- ' + bkk(e.at) + ' ' + e.label; });
const c = body.counts || {};
const countsLine = 'สมาชิก ' + Number(c.users || 0) +
  ' · รออนุมัติ ' + Number(c.membersPending || 0) +
  ' · ผู้สนใจ ' + Number(c.prospects || 0) +
  ' · ใบเสร็จ ' + Number(c.receipts || 0) +
  ' · ข้อความค้างตอบ ' + Number(c.messagesPending || 0);

const prompt = [
  'คุณคือผู้ช่วยผู้ดูแลระบบ AI Insurance Network',
  'รายการเปลี่ยนแปลงล่าสุดในระบบ (จาก AuditLog จริง เรียงตามเวลา):',
  lines.join('\n') || '- ไม่มีรายละเอียด',
  'จำนวนรวม ' + all.length + ' รายการ · ' + countsLine,
  '',
  'ให้สรุปเป็นภาษาไทยสั้น ๆ ไม่เกิน 4 บรรทัดว่าเกิดอะไรขึ้น น่าจับตาอะไร และควรทำอะไรต่อ',
  'ห้ามแต่งข้อมูลที่ไม่มีในรายการ ห้ามใส่ชื่อบุคคล อีเมล หรือรหัสส่วนตัว',
].join('\n');

return [{ json: {
  push: false, error: false, detail: '',
  sig: j(body.sig), at: j(body.at),
  events: all.slice(-25), totalNew: all.length, highSignal: highSignal,
  counts: c, countsLine: countsLine, prompt: prompt,
  pending: prep.pending, lastPushAt: prep.lastPushAt,
} }];
""".strip()

CODE_COMPOSE = r"""
// ประกอบข้อความ LINE + ตัดสินว่าจะส่งรอบนี้หรือสะสมไว้ (โควตาข้อความ LINE มีจำกัด)
const b = $('สรุปการเปลี่ยนแปลง').first().json || {};
const aiRaw = $input.first().json || {};
const aiText = String(aiRaw.answer || aiRaw.text || (aiRaw.body && aiRaw.body.answer) || '').trim();

const MIN_GAP = 300000;   // ปกติ: ไม่ถี่กว่า 1 ครั้ง / 5 นาที
const HIGH_GAP = 60000;   // เหตุการณ์สำคัญ: ไม่ถี่กว่า 1 ครั้ง / 60 วินาที
const MAX_PENDING = 15;

const now = Date.now();
const gap = now - Number(b.lastPushAt || 0);
const shouldPush = (b.events || []).length > 0 && !b.error && (gap >= MIN_GAP || (b.highSignal && gap >= HIGH_GAP));

function bkk(iso) {
  const t = new Date(iso || Date.now());
  const d = new Date(t.getTime() + 7 * 3600e3);
  const p = d.toISOString();
  return p.slice(8, 10) + '/' + p.slice(5, 7) + '/' + (Number(p.slice(0, 4)) + 543) + ' ' + p.slice(11, 19);
}

const evs = Array.isArray(b.events) ? b.events : [];
const items = evs.slice(-10).map(function (e) {
  return '• ' + (bkk(e.at).slice(-8)) + ' ' + e.label;
});
let text = '🔔 ตรวจพบการเปลี่ยนแปลงในระบบ\n' + bkk(b.at) + ' น.\n';
if (aiText.length >= 10) {
  text += '\n🤖 สรุปโดย Hermes AI\n' + aiText.slice(0, 1200) + '\n';
} else {
  text += '\n• รายการที่เปลี่ยน (' + evs.length + ')\n' + (items.join('\n') || '• ข้อมูลในระบบเปลี่ยน');
}
text += '\n📊 ' + (b.countsLine || '');
if (evs.length > 10) text += '\n…และอีก ' + (evs.length - 10) + ' รายการ';
text += '\n👉 https://ai-insurance-network-tree.vercel.app/admin';

const sd = $getWorkflowStaticData('global');
sd.sig = b.sig || sd.sig || '';
if (b.at) sd.since = b.at;
if (!shouldPush) {
  sd.pending = evs.slice(-MAX_PENDING);
}

const pendingAfter = shouldPush ? (sd.pending || []) : evs.slice(-MAX_PENDING);
return [{ json: {
  shouldPush: shouldPush,
  text: text.slice(0, 4800),
  kind: 'admin.change',
  count: evs.length,
  highSignal: !!b.highSignal,
  aiUsed: aiText.length >= 10,
  at: b.at,
  pendingAfter: pendingAfter,
} }];
""".strip()

CODE_DONE = r"""
// ปิดรอบหลังส่ง LINE — เลื่อน cursor และเคลียร์คิวเฉพาะเมื่อส่งสำเร็จ
const sent = $input.first().json || {};
const c = $('ประกอบข้อความ LINE').first().json || {};
const body = (sent.body && typeof sent.body === 'object') ? sent.body : sent;
const ok = body.ok === true;
const sd = $getWorkflowStaticData('global');
if (ok) {
  sd.lastPushAt = Date.now();
  sd.pending = [];
} else {
  sd.pending = Array.isArray(c.pendingAfter) ? c.pendingAfter : [];
}
if (c.at) sd.since = c.at;
return [{ json: {
  ok: ok,
  sent: ok ? 1 : 0,
  count: Number(c.count || 0),
  aiUsed: c.aiUsed === true,
  detail: ok ? 'ส่ง LINE สำเร็จ' : ('ส่ง LINE ไม่สำเร็จ: ' + String(body.error || body.message || '').slice(0, 120)),
  chars: String(c.text || '').length,
  at: new Date().toISOString(),
} }];
""".strip()

CODE_SKIP = r"""
// ยังไม่ถึงรอบส่ง หรือไม่มีอะไรใหม่ — เก็บคิวไว้ ไม่ยิง LINE (ประหยัดโควตา)
const c = $('ประกอบข้อความ LINE').first().json || {};
const sd = $getWorkflowStaticData('global');
sd.pending = Array.isArray(c.pendingAfter) ? c.pendingAfter : [];
if (c.at) sd.since = c.at;
return [{ json: {
  ok: true, sent: 0, count: Number(c.count || 0),
  detail: 'สะสมไว้ในคิว (' + Number((c.pendingAfter || []).length) + ' รายการ) — รอรอบส่งถัดไป',
  at: new Date().toISOString(),
} }];
""".strip()


def node(nid, name, ntype, tver, pos, params, extra=None):
    n = {"parameters": params, "id": nid, "name": name, "type": ntype,
         "typeVersion": tver, "position": pos}
    if extra:
        n.update(extra)
    return n


def json_body(expr_js):
    return "={{ JSON.stringify(" + expr_js + ") }}"


def build_workflow():
    sched = node("acw-sched", "ตรวจทุก 10 วินาที", "n8n-nodes-base.scheduleTrigger", 1.2, [-460, 40],
                 {"rule": {"interval": [{"field": "seconds", "secondsInterval": INTERVAL_SECONDS}]}})
    hook = node("acw-hook", "Webhook สั่งตรวจเอง (POST /admin-change-watch)", "n8n-nodes-base.webhook", 2,
                [-460, 280],
                {"httpMethod": "POST", "path": WEBHOOK_PATH, "responseMode": "onReceived", "options": {}},
                {"webhookId": str(uuid.uuid4())})

    cursor = node("acw-cursor", "อ่าน cursor (staticData)", "n8n-nodes-base.code", 2, [-200, 160],
                  {"mode": "runOnceForAllItems", "jsCode": CODE_CURSOR})

    watch = node("acw-watch", "อ่านสถานะระบบ (/api/admin/watch · long-poll)", "n8n-nodes-base.httpRequest", 4.2,
                 [60, 160],
                 {"method": "GET",
                  "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/admin/watch",
                  "sendQuery": True,
                  "queryParameters": {"parameters": [
                      {"name": "sig", "value": "={{ $json.sig }}"},
                      {"name": "since", "value": "={{ $json.since }}"},
                      {"name": "wait", "value": "={{ $json.wait }}"},
                  ]},
                  "sendHeaders": True,
                  "headerParameters": {"parameters": [
                      {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"}]},
                  "options": {"timeout": 25000,
                              "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    changed = node("acw-if", "มีการเปลี่ยนแปลง?", "n8n-nodes-base.if", 2.2, [320, 160],
                   {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose",
                                               "version": 2},
                                   "conditions": [{"id": "acw-cond-1", "leftValue": "={{ $json.changed }}",
                                                   "operator": {"type": "boolean", "operation": "true"}}],
                                   "combinator": "and"},
                    "looseTypeValidation": True, "options": {}})

    summary = node("acw-summary", "สรุปการเปลี่ยนแปลง", "n8n-nodes-base.code", 2, [580, 60],
                   {"mode": "runOnceForAllItems", "jsCode": CODE_SUMMARY})

    ai = node("acw-ai", "Hermes AI สรุป (/api/ai/query)", "n8n-nodes-base.httpRequest", 4.2, [840, 60],
              {"method": "POST",
               "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/ai/query",
               "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
               "sendBody": True, "contentType": "json", "specifyBody": "json",
               "jsonBody": json_body("{ query: $json.prompt, mode: 'SMART' }"),
               "options": {"timeout": 60000,
                           "response": {"response": {"neverError": True, "responseFormat": "json"}}}},
              {"onError": "continueRegularOutput"})

    compose = node("acw-compose", "ประกอบข้อความ LINE", "n8n-nodes-base.code", 2, [1100, 60],
                   {"mode": "runOnceForAllItems", "jsCode": CODE_COMPOSE})

    pushif = node("acw-if-push", "ถึงเวลาส่ง LINE?", "n8n-nodes-base.if", 2.2, [1360, 60],
                  {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose",
                                              "version": 2},
                                  "conditions": [{"id": "acw-cond-2", "leftValue": "={{ $json.shouldPush }}",
                                                  "operator": {"type": "boolean", "operation": "true"}}],
                                  "combinator": "and"},
                   "looseTypeValidation": True, "options": {}})

    line = node("acw-line", "ส่งเข้า LINE OA (/api/line/notify)", "n8n-nodes-base.httpRequest", 4.2,
                [1620, -40],
                {"method": "POST",
                 "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/line/notify",
                 "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
                 "sendBody": True, "contentType": "json", "specifyBody": "json",
                 "jsonBody": json_body("{ text: $json.text, kind: $json.kind }"),
                 "options": {"timeout": 25000,
                             "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    done = node("acw-done", "ปิดรอบ (ส่งแล้ว)", "n8n-nodes-base.code", 2, [1880, -40],
                {"mode": "runOnceForAllItems", "jsCode": CODE_DONE})
    skip = node("acw-skip", "สะสมคิว (ยังไม่ส่ง)", "n8n-nodes-base.code", 2, [1620, 200],
                {"mode": "runOnceForAllItems", "jsCode": CODE_SKIP})

    log1 = node("acw-log-1", "บันทึก Log (ส่งแล้ว)", "n8n-nodes-base.httpRequest", 4.2, [2140, -40],
                {"method": "POST",
                 "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/agent-log",
                 "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
                 "sendBody": True, "contentType": "json", "specifyBody": "json",
                 "jsonBody": json_body("{ source: 'n8n', workflow: 'admin-change-watch', ok: $json.ok, "
                                       "stage: 'send_report', detail: $json.detail, sent: $json.sent, "
                                       "chars: $json.chars, at: $json.at }"),
                 "options": {"timeout": 15000,
                             "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    nodes = [sched, hook, cursor, watch, changed, summary, ai, compose, pushif, line, done, skip, log1]

    connections = {
        sched["name"]: {"main": [[{"node": cursor["name"], "type": "main", "index": 0}]]},
        hook["name"]: {"main": [[{"node": cursor["name"], "type": "main", "index": 0}]]},
        cursor["name"]: {"main": [[{"node": watch["name"], "type": "main", "index": 0}]]},
        watch["name"]: {"main": [[{"node": changed["name"], "type": "main", "index": 0}]]},
        changed["name"]: {"main": [
            [{"node": summary["name"], "type": "main", "index": 0}],
            [],
        ]},
        summary["name"]: {"main": [[{"node": ai["name"], "type": "main", "index": 0}]]},
        ai["name"]: {"main": [[{"node": compose["name"], "type": "main", "index": 0}]]},
        compose["name"]: {"main": [[{"node": pushif["name"], "type": "main", "index": 0}]]},
        pushif["name"]: {"main": [
            [{"node": line["name"], "type": "main", "index": 0}],
            [{"node": skip["name"], "type": "main", "index": 0}],
        ]},
        line["name"]: {"main": [[{"node": done["name"], "type": "main", "index": 0}]]},
        done["name"]: {"main": [[{"node": log1["name"], "type": "main", "index": 0}]]},
    }

    return {
        "name": WF_NAME,
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1", "errorWorkflow": ERROR_WORKFLOW,
                     "saveManualExecutions": True, "timezone": "Asia/Bangkok",
                     "saveDataSuccessExecution": "none"},
        "active": True,
    }


def validate(wf):
    names = [n["name"] for n in wf["nodes"]]
    assert len(names) == len(set(names)), "ชื่อโหนดซ้ำ"
    for src, branches in wf["connections"].items():
        assert src in names, "ต้นทางไม่มีจริง: " + src
        for branch in branches.get("main", []):
            for edge in branch:
                assert edge["node"] in names, "ปลายทางไม่มีจริง: " + edge["node"]
    assert any("trigger" in n["type"] or n["type"].endswith("webhook") for n in wf["nodes"]), "ไม่มี trigger"


def now_ms():
    u = datetime.now(timezone.utc)
    return u.strftime("%Y-%m-%d %H:%M:%S.") + f"{u.microsecond // 1000:03d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-import", action="store_true")
    args = ap.parse_args()

    wf = build_workflow()
    validate(wf)
    os.makedirs(WF_DIR, exist_ok=True)
    out = os.path.join(WF_DIR, "admin-change-watch.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(wf, f, ensure_ascii=False, indent=2)
    print(f"เขียนไฟล์ workflow → {out} ({len(wf['nodes'])} โหนด)")
    if args.no_import:
        return

    con = sqlite3.connect(DB, timeout=60)
    con.execute("PRAGMA busy_timeout=60000")
    cur = con.cursor()
    cols = [d[0] for d in cur.execute("select * from workflow_entity limit 1").description]
    tpl_row = cur.execute("select * from workflow_entity where active = 1 order by updatedAt desc limit 1").fetchone()
    tpl = dict(zip(cols, tpl_row))
    project_id = None
    try:
        sw = cur.execute("select projectId from shared_workflow limit 1").fetchone()
        project_id = sw[0] if sw else None
    except Exception:
        pass

    name, nodes, conns = wf["name"], wf["nodes"], wf["connections"]
    settings = dict(wf["settings"])
    version_id = str(uuid.uuid4())
    u = datetime.now(timezone.utc)
    iso = u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"
    existing = cur.execute("select id from workflow_entity where name = ?", (name,)).fetchone()

    if args.dry_run:
        print(("[update] " if existing else "[new]    ") + name)
        con.close()
        return

    if existing:
        wid = existing[0]
        cur.execute(
            "update workflow_entity set nodes = ?, connections = ?, settings = ?, active = 1, versionId = ?, "
            "activeVersionId = ?, versionCounter = 1, updatedAt = ? where id = ?",
            (json.dumps(nodes, ensure_ascii=False), json.dumps(conns, ensure_ascii=False),
             json.dumps(settings, ensure_ascii=False), version_id, version_id, now_ms(), wid),
        )
        print(f"[update] {name} ({wid})")
    else:
        wid = str(uuid.uuid4())
        row = dict(tpl)
        row.update({
            "id": wid, "name": name, "active": 1,
            "nodes": json.dumps(nodes, ensure_ascii=False),
            "connections": json.dumps(conns, ensure_ascii=False),
            "settings": json.dumps(settings, ensure_ascii=False),
            "staticData": "{}", "pinData": "{}", "description": "ตรวจจับการเปลี่ยนแปลงของหน้า /admin ทุกวินาที (long-poll) แล้วสรุปด้วย Hermes AI และส่งเข้า LINE OA",
            "versionId": version_id, "activeVersionId": version_id,
            "triggerCount": 2,
            "createdAt": now_ms(), "updatedAt": now_ms(), "isArchived": 0, "versionCounter": 1,
        })
        placeholders = ", ".join("?" for _ in cols)
        cur.execute(f"insert into workflow_entity ({', '.join(cols)}) values ({placeholders})", [row.get(c) for c in cols])
        if project_id:
            cur.execute(
                "insert into shared_workflow (workflowId, projectId, role, createdAt, updatedAt) values (?, ?, 'workflow:owner', ?, ?)",
                (wid, project_id, now_ms(), now_ms()),
            )
        print(f"[new]    {name} ({wid})")

    cur.execute("delete from workflow_history where workflowId = ?", (wid,))
    cur.execute(
        "insert into workflow_history (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description, nodeGroups) "
        "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (version_id, wid, "hermes", iso, iso, json.dumps(nodes, ensure_ascii=False),
         json.dumps(conns, ensure_ascii=False), name, 0, None, "[]"),
    )
    # ล้างแถว publication ของเวอร์ชันเก่า ไม่งั้น reconcile จะไม่ลงทะเบียน trigger ใหม่
    for tbl in ("workflow_publication_trigger_status", "workflow_publication_outbox"):
        try:
            cur.execute(f"delete from {tbl} where workflowId = ?", (wid,))
        except Exception as e:
            print(f"  (ข้าม {tbl}: {e})")
    con.commit()
    con.close()
    print("\nต่อไป: restart n8n เพื่อให้ trigger/webhook ลงทะเบียน แล้วทดสอบ")


if __name__ == "__main__":
    main()
