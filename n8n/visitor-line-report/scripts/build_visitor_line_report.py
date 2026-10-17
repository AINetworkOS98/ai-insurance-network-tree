#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_visitor_line_report.py
สร้าง workflow n8n "02 Visitor LINE Report · ทุกหน้า/ทุกลิงก์ → LINE OA"
  - บันทึก JSON ไว้ใน git (n8n/visitor-line-report/workflows/)
  - นำเข้า n8n (database.sqlite) โหมด active พร้อม version/history/shared

โครง workflow
  [A] ทุก 15 นาที  → เตรียมคิวรี (cursor) → GET /api/track/report?since=cursor
                   → สร้างข้อความ → มีอะไรต้องแจ้ง? → POST /api/line/notify → อัปเดต cursor + log
  [B] ทุกวัน 20:00 → GET /api/track/report?range=today → สรุปทั้งวัน → POST /api/line/notify + log
  [C] Webhook POST /webhook/visitor-line-report {range} → สรุปตามช่วงที่ขอ → LINE + log

ใช้:
    python n8n/visitor-line-report/scripts/build_visitor_line_report.py --dry-run
    python n8n/visitor-line-report/scripts/build_visitor_line_report.py
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
WF_NAME = "02 Visitor LINE Report · ทุกหน้า/ทุกลิงก์ → LINE OA"

AUTH_HEADERS = [
    {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"},
    {"name": "Content-Type", "value": "application/json"},
]

CODE_PREP_INSTANT = r"""
// รอบ 15 นาที — ดึง "รายการใช้งานที่น่าสนใจ" ที่เกิดหลัง cursor ครั้งก่อน
// cursor เก็บใน staticData ของ workflow (ไม่ต้องมี DB เพิ่ม)
const sd = $getWorkflowStaticData('global');
const now = new Date();
const lastMs = sd.cursor ? new Date(sd.cursor).getTime() : (now.getTime() - 24 * 3600e3);
const safeLast = new Date(Math.min(lastMs, now.getTime() - 60e3));
const lastPushMs = sd.lastInstantPushAt ? new Date(sd.lastInstantPushAt).getTime() : 0;
const quiet = lastPushMs > 0 && (now.getTime() - lastPushMs) < 10 * 60e3;
const base = ($env.APP_BASE_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
return [{ json: {
  mode: 'instant',
  quiet: quiet,
  cursor: safeLast.toISOString(),
  url: base + '/api/track/report?range=24h&since=' + encodeURIComponent(safeLast.toISOString()),
} }];
""".strip()

CODE_PREP_DAILY = r"""
// รอบสรุปประจำวัน 20:00 — ภาพรวมของ "วันนี้" ทั้งหมด
const base = ($env.APP_BASE_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
return [{ json: {
  mode: 'daily',
  quiet: false,
  cursor: null,
  url: base + '/api/track/report?range=today',
} }];
""".strip()

CODE_PREP_MANUAL = r"""
// สั่งเองผ่าน webhook: POST /webhook/visitor-line-report { "range": "today" | "24h" | "7d" | "30d" }
const body = $json.body || $json;
const range = String(body.range || 'today');
const allowed = ['today', '24h', '7d', '30d'];
const key = allowed.indexOf(range) >= 0 ? range : 'today';
const base = ($env.APP_BASE_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
return [{ json: {
  mode: 'manual',
  quiet: false,
  cursor: null,
  rangeKey: key,
  url: base + '/api/track/report?range=' + key,
} }];
""".strip()

CODE_BUILD = r"""
// สร้างข้อความ LINE จากข้อมูลจริงของ /api/track/report
// กติกา: ข้อความล้วน (LINE ไม่แสดง markdown) · ไม่มีข้อมูลส่วนบุคคล (ผู้เข้าชมเป็นรหัสสั้น)
function prepOf() {
  const names = ['เตรียมคิวรี (15 นาที)', 'เตรียมคิวรี (สรุปวัน)', 'เตรียมคิวรี (สั่งเอง)'];
  for (let i = 0; i < names.length; i++) {
    try { return $(names[i]).first().json; } catch (e) { /* โหนดนี้ไม่ได้รันในรอบนี้ */ }
  }
  return {};
}
const prep = prepOf();
const mode = prep.mode;
const j = $input.first().json || {};
const body = (j.body && typeof j.body === 'object') ? j.body : j;
const quiet = prep.quiet === true;

if (body.ok !== true) {
  return [{ json: {
    push: false, mode: mode, error: true,
    detail: 'ดึงรายงานไม่สำเร็จ: ' + String(body.error || body.message || 'unknown').slice(0, 160),
    cursor: prep.cursor, nextCursor: null,
  } }];
}

const t = body.totals || {};
const pages = Array.isArray(body.pages) ? body.pages : [];
const recent = Array.isArray(body.recent) ? body.recent : [];
const dev = Array.isArray(body.devices) ? body.devices : [];
const src = Array.isArray(body.sources) ? body.sources : [];
const bkk = new Date(new Date(body.generatedAt || Date.now()).getTime() + 7 * 3600e3);
const dstr = bkk.toISOString().slice(0, 10).split('-');
const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const dateTh = Number(dstr[2]) + ' ' + months[Number(dstr[1]) - 1] + ' ' + (Number(dstr[0]) + 543);
const hhmm = bkk.toISOString().slice(11, 16);
const num = function (v) { return Number(v || 0); };

let text = '';
if (mode === 'instant') {
  if (quiet || !recent.length) {
    return [{ json: { push: false, mode: mode, skipped: true,
      detail: recent.length ? 'มีรายการแต่ยังไม่ถึงรอบแจ้ง (กันถี่เกิน 10 นาที)' : 'ไม่มีรายการใช้งานใหม่ที่น่าสนใจ',
      cursor: prep.cursor, nextCursor: body.range ? body.range.to : new Date().toISOString() } }];
  }
  const lines = recent.slice(-8).map(function (r) {
    return '• ' + r.label + ' — ' + r.pagePath + ' เวลา ' + r.atBkk + ' (ผู้เข้าชม ' + r.visitor + ')';
  });
  text = '🔔 มีผู้สนใจใช้งานเว็บ\n' + lines.join('\n');
  if (recent.length > 8) text += '\n…และอีก ' + (recent.length - 8) + ' รายการ';
  text += '\n\nดูรายละเอียด: https://ai-insurance-network-tree.vercel.app/admin';
} else {
  const label = mode === 'daily' ? 'สรุปวันนี้' : ('สรุป' + String((body.range && body.range.label) || ''));
  const top = pages.filter(function (p) { return p.views > 0; }).slice(0, 15);
  text = '📊 ผู้เข้าชมเว็บ — ' + label + '\n' + dateTh + ' · ข้อมูลถึง ' + hhmm + '\n';
  text += '\n👥 ผู้เข้าชม ' + num(t.visitors) + ' คน · เปิดหน้า ' + num(t.pageViews) + ' ครั้ง · ' + num(t.sessions) + ' ช่วงใช้งาน';
  if (num(t.returnVisits)) text += '\n🔁 กลับมาเยี่ยมซ้ำ ' + num(t.returnVisits) + ' ครั้ง';
  if (num(t.ctaClicks)) text += ' · กดปุ่ม CTA ' + num(t.ctaClicks) + ' ครั้ง';
  text += '\n\n📄 หน้าถูกเปิดมากที่สุด' + (body.pagesSeen ? ' (ทั้งหมด ' + num(body.pagesSeen) + ' หน้า)' : '');
  if (!top.length) text += '\n— ยังไม่มีการเปิดหน้าในช่วงนี้ —';
  top.forEach(function (p, i) {
    text += '\n' + (i + 1) + '. ' + p.path + ' — ' + num(p.views) + ' ครั้ง' + (num(p.visitors) ? ' (' + num(p.visitors) + ' คน)' : '');
  });
  if (pages.length > top.length) text += '\n…และอีก ' + (pages.length - top.length) + ' หน้า';

  text += '\n\n🎯 การใช้งาน';
  text += '\n• กรอก/ส่งฟอร์ม ' + num(t.formSubmits) + ' · ขอติดต่อกลับ ' + num(t.callbackRequests) + ' · เลือกหัวข้อ ' + num(t.topicSelects);
  if (num(t.videoViews) || num(t.videoCompletes)) text += '\n• เปิดคลิป ' + num(t.videoViews) + ' · ดูจนจบ ' + num(t.videoCompletes);

  if (dev.length) text += '\n\n📱 อุปกรณ์: ' + dev.map(function (d) { return d.device + ' ' + num(d.visitors); }).join(' · ');
  if (src.length) text += '\n🔗 ที่มา: ' + src.slice(0, 4).map(function (s) { return s.source + ' (' + num(s.count) + ')'; }).join(' · ');
  if (body.lastEventAt) {
    const lb = new Date(new Date(body.lastEventAt).getTime() + 7 * 3600e3).toISOString().slice(11, 16);
    text += '\n⏱ เข้าชมล่าสุด ' + lb;
  }
  text += '\n\nดูรายละเอียด: https://ai-insurance-network-tree.vercel.app/admin';
}

if (text.length > 4800) text = text.slice(0, 4790) + '\n…';

return [{ json: {
  push: true,
  mode: mode,
  text: text,
  kind: mode === 'instant' ? 'line.visitor.alert' : 'line.visitor.report',
  detail: 'mode=' + mode + ' pages=' + pages.length + ' interesting=' + recent.length,
  cursor: prep.cursor,
  nextCursor: body.range ? body.range.to : new Date().toISOString(),
} }];
""".strip()

CODE_FINALIZE_SENT = r"""
// ส่ง LINE สำเร็จแล้ว → เลื่อน cursor (กันแจ้งซ้ำ) เฉพาะโหมด instant
const pushed = $('สร้างข้อความ LINE').first().json;
const res = $input.first().json || {};
const body = (res.body && typeof res.body === 'object') ? res.body : res;
const sd = $getWorkflowStaticData('global');
const ok = body.ok === true;
if (pushed.mode === 'instant' && ok) {
  if (pushed.nextCursor) sd.cursor = pushed.nextCursor;
  sd.lastInstantPushAt = new Date().toISOString();
}
return [{ json: {
  ok: ok,
  stage: pushed.mode === 'instant' ? 'send_alert' : 'send_report',
  detail: (ok ? 'ส่ง LINE สำเร็จ: ' : 'ส่ง LINE ไม่สำเร็จ: ') + String(body.error || pushed.detail || ''),
  sent: ok ? 1 : 0,
  chars: Number(body.chars || 0),
  at: new Date().toISOString(),
} }];
""".strip()

CODE_FINALIZE_SKIP = r"""
// ไม่ต้องส่ง LINE รอบนี้ → เลื่อน cursor ได้อย่างปลอดภัย (ไม่มีอะไรค้าง)
const built = $('สร้างข้อความ LINE').first().json;
const sd = $getWorkflowStaticData('global');
if (built.mode === 'instant' && built.nextCursor && !built.error) sd.cursor = built.nextCursor;
return [{ json: {
  ok: true,
  stage: 'skip',
  detail: String(built.detail || 'ไม่มีอะไรต้องแจ้ง'),
  sent: 0,
  chars: 0,
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
    sched15 = node("vr-sched-15m", "ทุก 15 นาที", "n8n-nodes-base.scheduleTrigger", 1.2, [-420, 40],
                   {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}})
    sched20 = node("vr-sched-20", "สรุปประจำวัน 20:00", "n8n-nodes-base.scheduleTrigger", 1.2, [-420, 280],
                   {"rule": {"interval": [{"field": "days", "triggerAtHour": 20, "triggerAtMinute": 0}]}})
    hook = node("vr-hook", "Webhook สั่งรายงานเอง (POST /visitor-line-report)", "n8n-nodes-base.webhook", 2,
                [-420, 520],
                {"httpMethod": "POST", "path": "visitor-line-report", "responseMode": "onReceived", "options": {}},
                {"webhookId": str(uuid.uuid4())})

    prepI = node("vr-prep-instant", "เตรียมคิวรี (15 นาที)", "n8n-nodes-base.code", 2, [-160, 40],
                 {"mode": "runOnceForAllItems", "jsCode": CODE_PREP_INSTANT})
    prepD = node("vr-prep-daily", "เตรียมคิวรี (สรุปวัน)", "n8n-nodes-base.code", 2, [-160, 280],
                 {"mode": "runOnceForAllItems", "jsCode": CODE_PREP_DAILY})
    prepM = node("vr-prep-manual", "เตรียมคิวรี (สั่งเอง)", "n8n-nodes-base.code", 2, [-160, 520],
                 {"mode": "runOnceForAllItems", "jsCode": CODE_PREP_MANUAL})

    fetch_r = node("vr-fetch", "ดึงรายงานการเข้าชม (/api/track/report)", "n8n-nodes-base.httpRequest", 4.2,
                   [100, 280],
                   {"method": "GET",
                    "url": "={{ $json.url }}",
                    "sendHeaders": True,
                    "headerParameters": {"parameters": [
                        {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"}]},
                    "options": {"timeout": 30000,
                                "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    built = node("vr-build", "สร้างข้อความ LINE", "n8n-nodes-base.code", 2, [360, 280],
                 {"mode": "runOnceForAllItems", "jsCode": CODE_BUILD})

    push_if = node("vr-if", "ต้องส่ง LINE?", "n8n-nodes-base.if", 2.2, [620, 280],
                   {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                                   "conditions": [{"id": "vr-cond-1", "leftValue": "={{ $json.push }}",
                                                   "operator": {"type": "boolean", "operation": "true"}}],
                                   "combinator": "and"},
                    "looseTypeValidation": True, "options": {}})

    line = node("vr-line", "ส่งเข้า LINE OA (/api/line/notify)", "n8n-nodes-base.httpRequest", 4.2, [880, 160],
                {"method": "POST",
                 "url": APP + "/api/line/notify",
                 "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
                 "sendBody": True, "contentType": "json", "specifyBody": "json",
                 "jsonBody": json_body("{ text: $json.text, kind: $json.kind }"),
                 "options": {"timeout": 20000,
                             "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    fin_sent = node("vr-fin-sent", "ปิดรอบ (ส่งแล้ว)", "n8n-nodes-base.code", 2, [1120, 160],
                    {"mode": "runOnceForAllItems", "jsCode": CODE_FINALIZE_SENT})
    fin_skip = node("vr-fin-skip", "จบรอบ (ไม่มีอะไรต้องแจ้ง)", "n8n-nodes-base.code", 2, [880, 400],
                    {"mode": "runOnceForAllItems", "jsCode": CODE_FINALIZE_SKIP})

    def log_node(nid, name, pos):
        return node(nid, name, "n8n-nodes-base.httpRequest", 4.2, pos,
                    {"method": "POST",
                     "url": APP + "/api/agent-log",
                     "sendHeaders": True, "headerParameters": {"parameters": AUTH_HEADERS},
                     "sendBody": True, "contentType": "json", "specifyBody": "json",
                     "jsonBody": json_body(
                         "{ source: 'n8n', workflow: '02-visitor-line-report', ok: $json.ok, "
                         "stage: $json.stage, detail: $json.detail, sent: $json.sent, "
                         "chars: $json.chars, at: $json.at }"),
                     "options": {"timeout": 15000,
                                 "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    log1 = log_node("vr-log-1", "บันทึก Log (ส่งแล้ว)", [1360, 160])
    log2 = log_node("vr-log-2", "บันทึก Log (ข้ามรอบ)", [1120, 400])

    nodes = [sched15, sched20, hook, prepI, prepD, prepM, fetch_r, built, push_if, line, fin_sent, fin_skip, log1, log2]

    connections = {
        sched15["name"]: {"main": [[{"node": prepI["name"], "type": "main", "index": 0}]]},
        sched20["name"]: {"main": [[{"node": prepD["name"], "type": "main", "index": 0}]]},
        hook["name"]: {"main": [[{"node": prepM["name"], "type": "main", "index": 0}]]},
        prepI["name"]: {"main": [[{"node": fetch_r["name"], "type": "main", "index": 0}]]},
        prepD["name"]: {"main": [[{"node": fetch_r["name"], "type": "main", "index": 0}]]},
        prepM["name"]: {"main": [[{"node": fetch_r["name"], "type": "main", "index": 0}]]},
        fetch_r["name"]: {"main": [[{"node": built["name"], "type": "main", "index": 0}]]},
        built["name"]: {"main": [[{"node": push_if["name"], "type": "main", "index": 0}]]},
        push_if["name"]: {"main": [
            [{"node": line["name"], "type": "main", "index": 0}],
            [{"node": fin_skip["name"], "type": "main", "index": 0}],
        ]},
        line["name"]: {"main": [[{"node": fin_sent["name"], "type": "main", "index": 0}]]},
        fin_sent["name"]: {"main": [[{"node": log1["name"], "type": "main", "index": 0}]]},
        fin_skip["name"]: {"main": [[{"node": log2["name"], "type": "main", "index": 0}]]},
    }

    return {
        "name": WF_NAME,
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1", "errorWorkflow": ERROR_WORKFLOW,
                     "saveManualExecutions": True, "timezone": "Asia/Bangkok"},
        "active": True,
    }


def now_ms():
    u = datetime.now(timezone.utc)
    return u.strftime("%Y-%m-%d %H:%M:%S.") + f"{u.microsecond // 1000:03d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-import", action="store_true")
    args = ap.parse_args()

    wf = build_workflow()
    os.makedirs(WF_DIR, exist_ok=True)
    out = os.path.join(WF_DIR, "02-visitor-line-report.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(wf, f, ensure_ascii=False, indent=2)
    print(f"เขียนไฟล์ workflow → {out} ({len(wf['nodes'])} โหนด)")
    if args.no_import:
        return

    con = sqlite3.connect(DB)
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
            "activeVersionId = ?, versionCounter = 1, staticData = '{}', pinData = '{}', description = NULL, updatedAt = ? "
            "where id = ?",
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
            "staticData": "{}", "pinData": "{}", "description": None,
            "versionId": version_id, "activeVersionId": version_id,
            "triggerCount": len([n for n in nodes if "trigger" in (n.get("type") or "") or n.get("type", "").endswith("webhook")]),
            "createdAt": now_ms(), "updatedAt": now_ms(), "isArchived": 0, "versionCounter": 1,
        })
        placeholders = ", ".join("?" for _ in cols)
        cur.execute(f"insert into workflow_entity ({', '.join(cols)}) values ({placeholders})", [row.get(c) for c in cols])
        if project_id:
            try:
                cur.execute(
                    "insert into shared_workflow (workflowId, projectId, role, createdAt, updatedAt) values (?, ?, 'workflow:owner', ?, ?)",
                    (wid, project_id, now_ms(), now_ms()),
                )
            except Exception as e:
                print(f"  (ข้าม shared_workflow: {e})")
        print(f"[new]    {name} ({wid})")

    cur.execute("delete from workflow_history where workflowId = ?", (wid,))
    cur.execute(
        "insert into workflow_history (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description, nodeGroups) "
        "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (version_id, wid, "hermes", iso, iso, json.dumps(nodes, ensure_ascii=False),
         json.dumps(conns, ensure_ascii=False), name, 0, None, "[]"),
    )
    con.commit()
    con.close()
    print("\nต่อไป: restart n8n เพื่อให้ trigger/webhook ลงทะเบียน แล้วทดสอบ")


if __name__ == "__main__":
    main()
