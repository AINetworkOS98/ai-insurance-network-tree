#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_admin_change_watch.py
workflow n8n: "ตรวจความเปลี่ยนแปลง /admin ทุกวินาที · Hermes AI → LINE OA"

เส้นทาง
  [A] Schedule ทุก 10 วินาที ─┐
  [B] Webhook สั่งตรวจเอง ────┤→ ตั้งพารามิเตอร์รอบ (manual = ไม่หน่วง/ไม่จำกัดช่วงเวลา)
                              └→ GET /api/admin/watch?claim=1  (long-poll 9 วิ = ตรวจทุก 1 วินาทีฝั่งแอป)
                                 → "ถึงรอบแจ้งเตือน?" (เซิร์ฟเวอร์เป็นคนตัดสิน + จองรอบไว้แล้ว)
                                    → ใช่ → Hermes AI สรุป (/api/ai/query) → ประกอบข้อความ
                                          → POST /api/line/notify → ปิดรอบ + บันทึก log
                                    → ไม่ใช่ → จบรอบ (ไม่มีอะไรต้องส่ง)

เหตุที่ให้ "เซิร์ฟเวอร์" ถือสถานะ (ไม่ใช้ staticData ของ n8n)
  พบจากการรันจริง: บนเครื่องนี้ workflow_entity.staticData ไม่ถูกบันทึก (ค้าง '{}') และ
  execution_entity.status ค้างที่ running ⇒ การกันแจ้งซ้ำ/กันรอบซ้อนที่พึ่ง staticData ใช้ไม่ได้
  และทำให้ LINE ถูกยิงทุกรอบ (10 วินาที/ครั้ง) จนโควตาหมด
  ⇒ /api/admin/watch?claim=1 เก็บสถานะล่าสุด (sig + เวลาส่ง) ใน NotificationLog แบบ atomic
    แล้วตอบ allowed=true/false — n8n จึงไม่มี state ต้องจำ และรีสตาร์ทได้โดยไม่หาย

ใช้:
    python n8n/admin-change-watch/scripts/build_admin_change_watch.py --dry-run
    python n8n/admin-change-watch/scripts/build_admin_change_watch.py
"""
import argparse
import json
import os
import re
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

INTERVAL_SECONDS = 10
LONGPOLL_SECONDS = 9
MIN_GAP_SECONDS = 300      # แจ้งเตือนปกติไม่ถี่กว่า 5 นาที (โควตา LINE มีจำกัด)

AUTH_HEADERS = [
    {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"},
    {"name": "Content-Type", "value": "application/json"},
]

CODE_SETUP = r"""
// ตั้งค่าของรอบนี้ — schedule = long-poll 9 วิ + ห่างอย่างน้อย 5 นาที · webhook สั่งเอง = ตรวจทันที ไม่จำกัดเวลา
const input = $input.first().json || {};
const isManual = !!(input && input.headers);
return [{ json: {
  claim: '1',
  wait: isManual ? 0 : __LONGPOLL__,
  minGap: isManual ? 0 : __MIN_GAP__,
  manual: isManual,
} }];
""".replace("__LONGPOLL__", str(LONGPOLL_SECONDS)).replace("__MIN_GAP__", str(MIN_GAP_SECONDS)).strip()

CODE_SUMMARY = r"""
// สร้างข้อความพื้นฐาน + คำถามให้ Hermes AI จากเหตุการณ์จริงที่เซิร์ฟเวอร์ส่งมา
function j(v) { return (v === null || v === undefined) ? '' : String(v); }
const raw = $input.first().json || {};
const body = (raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body)) ? raw.body : raw;

if (body.ok !== true || body.allowed !== true) {
  return [{ json: {
    skip: true,
    why: body.ok !== true ? ('read failed: ' + j(body.error || body.message).slice(0, 120)) : j(body.reason || 'ไม่ถึงรอบส่ง'),
    count: 0, text: '', prompt: '', at: body.at || null,
  } }];
}

const events = Array.isArray(body.events) ? body.events.slice(-25) : [];
const c = body.counts || {};
const countsLine = 'สมาชิก ' + Number(c.users || 0) +
  ' · รออนุมัติ ' + Number(c.membersPending || 0) +
  ' · ผู้สนใจ ' + Number(c.prospects || 0) +
  ' · ใบเสร็จ ' + Number(c.receipts || 0) +
  ' · ข้อความค้างตอบ ' + Number(c.messagesPending || 0);

function bkk(iso) {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  return new Date(t.getTime() + 7 * 3600e3).toISOString().slice(11, 19);
}
const items = events.map(function (e) { return '• ' + bkk(e.at) + ' ' + j(e.label); });
const stamp = bkk(body.at || new Date().toISOString());

let base = '🔔 ตรวจพบการเปลี่ยนแปลงในระบบ\n' + stamp + ' น.\n\n';
base += '📋 รายการ (' + events.length + ')\n' + (items.join('\n') || '• ข้อมูลในระบบเปลี่ยน');
base += '\n\n📊 ' + countsLine;
base += '\n👉 https://ai-insurance-network-tree.vercel.app/admin';

const prompt = [
  'คุณคือผู้ช่วยผู้ดูแลระบบ AI Insurance Network',
  'รายการเปลี่ยนแปลงล่าสุดของระบบ (จาก AuditLog จริง เรียงตามเวลา):',
  items.join('\n') || '- ไม่มีรายละเอียด',
  'จำนวน ' + events.length + ' รายการ · ' + countsLine,
  '',
  'ให้สรุปเป็นภาษาไทยสั้น ๆ ไม่เกิน 4 บรรทัดว่าเกิดอะไรขึ้น น่าจับตาอะไร และควรทำอะไรต่อ',
  'ห้ามแต่งข้อมูลที่ไม่มีในรายการ ห้ามใส่ชื่อบุคคล อีเมล หรือรหัสส่วนตัว',
].join('\n');

return [{ json: {
  skip: false, count: events.length, text: base.slice(0, 4600), prompt: prompt,
  countsLine: countsLine, at: body.at || null,
} }];
""".strip()

CODE_COMPOSE = r"""
// ต่อบทสรุปของ Hermes AI เข้ากับรายการจริง
const s = $('สรุปเหตุการณ์').first().json || {};
const aiRaw = $input.first().json || {};
const aiText = String(aiRaw.answer || aiRaw.text || (aiRaw.body && aiRaw.body.answer) || '').trim();

let text = String(s.text || '');
if (aiText.length >= 10) {
  const idx = text.indexOf('\n\n');
  const head = idx >= 0 ? text.slice(0, idx) : text;
  const rest = idx >= 0 ? text.slice(idx) : '';
  text = head + '\n\n🤖 สรุปโดย Hermes AI\n' + aiText.slice(0, 1200) + rest;
}

return [{ json: {
  text: text.slice(0, 4800),
  kind: 'admin.change',
  count: Number(s.count || 0),
  aiUsed: aiText.length >= 10,
  at: s.at,
} }];
""".strip()

CODE_DONE = r"""
// ปิดรอบ — รายงานผลจากคำตอบของ /api/line/notify
const resp = $input.first().json || {};
const c = $('ประกอบข้อความ').first().json || {};
const body = (resp.body && typeof resp.body === 'object') ? resp.body : resp;
const ok = body.ok === true;
return [{ json: {
  ok: ok, sent: ok ? 1 : 0,
  count: Number(c.count || 0),
  aiUsed: c.aiUsed === true,
  detail: ok ? 'ส่ง LINE สำเร็จ' : ('ส่ง LINE ไม่สำเร็จ: ' + String(body.error || body.message || '').slice(0, 120)),
  chars: String(c.text || '').length,
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
    sched = node("acw-sched", "ตรวจทุก 10 วินาที", "n8n-nodes-base.scheduleTrigger", 1.2, [-480, 40],
                 {"rule": {"interval": [{"field": "seconds", "secondsInterval": INTERVAL_SECONDS}]}})
    hook = node("acw-hook", "Webhook สั่งตรวจเอง (POST /admin-change-watch)", "n8n-nodes-base.webhook", 2,
                [-480, 280],
                {"httpMethod": "POST", "path": WEBHOOK_PATH, "responseMode": "onReceived", "options": {}},
                {"webhookId": str(uuid.uuid4())})

    setup = node("acw-setup", "ตั้งค่าของรอบ", "n8n-nodes-base.code", 2, [-220, 160],
                 {"mode": "runOnceForAllItems", "jsCode": CODE_SETUP})

    claim = node("acw-claim", "ตรวจ + จองรอบแจ้งเตือน (/api/admin/watch?claim=1)", "n8n-nodes-base.httpRequest", 4.2,
                 [40, 160],
                 {"method": "GET",
                  "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/admin/watch",
                  "sendQuery": True,
                  "queryParameters": {"parameters": [
                      {"name": "claim", "value": "={{ $json.claim }}"},
                      {"name": "wait", "value": "={{ $json.wait }}"},
                      {"name": "minGap", "value": "={{ $json.minGap }}"},
                  ]},
                  "sendHeaders": True,
                  "headerParameters": {"parameters": [
                      {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"}]},
                  "options": {"timeout": 25000,
                              "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    allowed = node("acw-if", "ถึงรอบแจ้งเตือน?", "n8n-nodes-base.if", 2.2, [300, 160],
                   {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose",
                                               "version": 2},
                                   "conditions": [{"id": "acw-c1", "leftValue": "={{ $json.allowed }}",
                                                   "operator": {"type": "boolean", "operation": "true"}}],
                                   "combinator": "and"},
                    "looseTypeValidation": True, "options": {}})

    summary = node("acw-summary", "สรุปเหตุการณ์", "n8n-nodes-base.code", 2, [560, 60],
                   {"mode": "runOnceForAllItems", "jsCode": CODE_SUMMARY})

    ai = node("acw-ai", "Hermes AI สรุป (/api/ai/query)", "n8n-nodes-base.httpRequest", 4.2, [820, 60],
              {"method": "POST",
               "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/ai/query",
               "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
               "sendBody": True, "contentType": "json", "specifyBody": "json",
               "jsonBody": json_body("{ query: $json.prompt, mode: 'SMART' }"),
               "options": {"timeout": 30000,
                           "response": {"response": {"neverError": True, "responseFormat": "json"}}}},
              {"onError": "continueRegularOutput"})

    compose = node("acw-compose", "ประกอบข้อความ", "n8n-nodes-base.code", 2, [1080, 60],
                   {"mode": "runOnceForAllItems", "jsCode": CODE_COMPOSE})

    line = node("acw-line", "ส่งเข้า LINE OA (/api/line/notify)", "n8n-nodes-base.httpRequest", 4.2,
                [1340, 60],
                {"method": "POST",
                 "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/line/notify",
                 "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
                 "sendBody": True, "contentType": "json", "specifyBody": "json",
                 "jsonBody": json_body("{ text: $json.text, kind: $json.kind }"),
                 "options": {"timeout": 25000,
                             "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    done = node("acw-done", "ปิดรอบ (ส่งแล้ว)", "n8n-nodes-base.code", 2, [1600, 60],
                {"mode": "runOnceForAllItems", "jsCode": CODE_DONE})

    log1 = node("acw-log-1", "บันทึก Log (ส่งแล้ว)", "n8n-nodes-base.httpRequest", 4.2, [1860, 60],
                {"method": "POST",
                 "url": "={{ $env.APP_BASE_URL || '" + APP + "' }}/api/agent-log",
                 "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
                 "sendBody": True, "contentType": "json", "specifyBody": "json",
                 "jsonBody": json_body("{ source: 'n8n', workflow: 'admin-change-watch', ok: $json.ok, "
                                       "stage: 'send_report', detail: $json.detail, sent: $json.sent, "
                                       "chars: $json.chars, at: $json.at }"),
                 "options": {"timeout": 15000,
                             "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    nodes = [sched, hook, setup, claim, allowed, summary, ai, compose, line, done, log1]

    connections = {
        sched["name"]: {"main": [[{"node": setup["name"], "type": "main", "index": 0}]]},
        hook["name"]: {"main": [[{"node": setup["name"], "type": "main", "index": 0}]]},
        setup["name"]: {"main": [[{"node": claim["name"], "type": "main", "index": 0}]]},
        claim["name"]: {"main": [[{"node": allowed["name"], "type": "main", "index": 0}]]},
        allowed["name"]: {"main": [
            [{"node": summary["name"], "type": "main", "index": 0}],
            [],
        ]},
        summary["name"]: {"main": [[{"node": ai["name"], "type": "main", "index": 0}]]},
        ai["name"]: {"main": [[{"node": compose["name"], "type": "main", "index": 0}]]},
        compose["name"]: {"main": [[{"node": line["name"], "type": "main", "index": 0}]]},
        line["name"]: {"main": [[{"node": done["name"], "type": "main", "index": 0}]]},
        done["name"]: {"main": [[{"node": log1["name"], "type": "main", "index": 0}]]},
    }

    return {
        "name": WF_NAME,
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1", "errorWorkflow": ERROR_WORKFLOW,
                     "saveManualExecutions": True, "timezone": "Asia/Bangkok",
                     "saveDataSuccessExecution": "all"},
        "active": True,
    }


def validate(wf):
    names = [n["name"] for n in wf["nodes"]]
    assert len(names) == len(set(names)), "ชื่อโหนดซ้ำ"
    for n in wf["nodes"]:
        src = (n.get("parameters") or {}).get("jsCode") or ""
        for ref in re.findall(r"\$\('([^']+)'\)", src):
            assert ref in names, f"Code ของ '{n['name']}' อ้างโหนดที่ไม่มีจริง: {ref}"
    for s, branches in wf["connections"].items():
        assert s in names, "ต้นทางไม่มีจริง: " + s
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
            "activeVersionId = ?, versionCounter = 1, staticData = '{}', updatedAt = ? where id = ?",
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
            "staticData": "{}", "pinData": "{}",
            "description": "ตรวจจับการเปลี่ยนแปลงของหน้า /admin ทุกวินาที (long-poll + claim ฝั่งเซิร์ฟเวอร์) → Hermes AI สรุป → LINE OA",
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
    for tbl in ("workflow_publication_trigger_status", "workflow_publication_outbox"):
        try:
            cur.execute(f"delete from {tbl} where workflowId = ?", (wid,))
        except Exception as e:
            print(f"  (ข้าม {tbl}: {e})")
    # ต้องชี้ published version มาที่ versionId ใหม่ ไม่งั้น n8n 2.x จะไม่ publish trigger
    # ของเวอร์ชันใหม่ให้ (อาการ: schedule ไม่ยิง / webhook ตอบ "Cannot POST /webhook/<path>")
    try:
        if cur.execute("select 1 from workflow_published_version where workflowId = ?", (wid,)).fetchone():
            cur.execute("update workflow_published_version set publishedVersionId = ?, updatedAt = ? where workflowId = ?",
                        (version_id, now_ms(), wid))
        else:
            cur.execute("insert into workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt) values (?, ?, ?, ?)",
                        (wid, version_id, now_ms(), now_ms()))
        print("  อัปเดต workflow_published_version → versionId ใหม่แล้ว")
    except Exception as e:
        print(f"  (ข้าม workflow_published_version: {e})")
    con.commit()
    con.close()
    print("\nต่อไป: restart n8n เพื่อให้ trigger/webhook ลงทะเบียน แล้วทดสอบ")


if __name__ == "__main__":
    main()
