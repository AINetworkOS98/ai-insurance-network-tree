#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_member_interest_workflow.py
สร้าง workflow n8n "Member Interest 01 · กิจกรรมสมาชิก → คะแนนความสนใจ → รายงาน + อีเมล"
แล้วบันทึกเป็น JSON (ไว้ใน git) + นำเข้า n8n database.sqlite โดยตรง (โหมด active)

หลักการของ workflow (ตามสเปก AI Member Interest & Activity Tracking):
  Schedule 10 นาที
    → GET /api/activity/radar           (อ่านกิจกรรมจริง + คะแนนที่คำนวณจากพฤติกรรมจริง)
    → คัดรายที่ถึงเกณฑ์ 60 + ยังไม่ถูกรายงานใน 24 ชม.
    → IF มีรายต้องรายงาน
        → POST /api/activity/report     (สร้างรายงาน + ส่งอีเมลเฉพาะอีเมลที่ยืนยัน+ยินยอม)
        → สรุปผลการส่ง
        → POST /api/agent-log           (บันทึกการทำงานของระบบตรวจย้อนหลังได้)
      ไม่มี → จบรอบ (ไม่ส่งอะไร ไม่เขียนอะไร)

ใช้:
    python n8n/member-interest/scripts/build_member_interest_workflow.py --dry-run
    python n8n/member-interest/scripts/build_member_interest_workflow.py
"""
import argparse
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
WF_DIR = os.path.normpath(os.path.join(HERE, "..", "workflows"))
DB = os.path.expanduser(os.path.join("~", ".n8n", "database.sqlite"))
APP = "https://ai-insurance-network-tree.vercel.app"
ERROR_WORKFLOW = "a7d8069f-ac7a-4919-b0ff-d4d6e51a263b"  # Passive Income 11 · Error Handler
WF_NAME = "Member Interest 01 · กิจกรรมสมาชิก → คะแนนความสนใจ → รายงาน + อีเมล (ทุก 10 นาที)"

AUTH_HEADERS = [
    {"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"},
    {"name": "Content-Type", "value": "application/json"},
]

CODE_PICK = r"""
// คัดเฉพาะรายที่ "ถึงเกณฑ์" (สนใจสูง 60+) และยังไม่ถูกรายงานภายใน 24 ชม.
// ตัวเลข/คะแนนทั้งหมดมาจาก /api/activity/radar ซึ่งคำนวณจาก event จริงเท่านั้น
const payload = $input.first().json || {};
const body = (payload.body && typeof payload.body === 'object') ? payload.body : payload;
const list = Array.isArray(body.members) ? body.members : [];
const MIN = 60;                       // 60-79 = สนใจสูง, 80+ = สนใจสูงมาก
const scanned = body.scanned || {};
const picked = list.filter(function (m) {
  return Number(m.interestScore || 0) >= MIN && m.reportedIn24h !== true;
});

if (!picked.length) {
  return [{ json: {
    none: true,
    scannedVisitors: Number(scanned.visitors || 0),
    scannedEvents: Number(scanned.events || 0),
    min: MIN,
    detail: 'รอบนี้ยังไม่มีรายที่ถึงเกณฑ์ ' + MIN + ' คะแนน (สแกน ' + Number(scanned.visitors || 0) + ' ผู้เข้าชม / ' + Number(scanned.events || 0) + ' event)',
  } }];
}

return picked.map(function (m) {
  return { json: {
    none: false,
    visitorKey: String(m.visitorKey || ''),
    prospectId: m.prospectId ? String(m.prospectId) : null,
    score: Number(m.interestScore || 0),
    level: String(m.interestLevel || ''),
    summary: String(m.aiSummary || ''),
    behaviors: Array.isArray(m.keyBehaviors) ? m.keyBehaviors : [],
    pagePath: String(m.pagePath || '/network/1x5-autopilot'),
    durationSec: Number(m.durationSec || 0),
    visits: Number(m.sessions || 1),
    ctaClicks: Number(m.ctaClicks || 0),
    emailEligible: m.emailEligible === true,
  } };
});
""".strip()

CODE_SUM = r"""
// สรุปผลการสร้างรายงาน + ส่งอีเมล (ล้มเหลวได้โดยไม่ทำให้ระบบล้ม — บันทึกไว้ตรวจย้อนหลัง)
const raw = $('สร้างรายงาน + ส่งอีเมล (/api/activity/report)').all();
let reports = 0, sent = 0, skipped = 0, failed = 0, firstError = null;
for (const it of raw) {
  const j = it.json || {};
  const b = (j.body && typeof j.body === 'object') ? j.body : j;
  if (b.reportId || b.deduped) reports++;
  const st = String(b.email || '');
  if (st === 'sent') sent++;
  else if (st === 'failed') { failed++; if (!firstError) firstError = String(b.error || 'send failed').slice(0, 200); }
  else skipped++;
}
return [{ json: {
  ok: failed === 0,
  workflow: 'member-interest-01',
  stage: 'report_email',
  detail: 'สร้างรายงาน ' + reports + ' ฉบับ · ส่งอีเมลสำเร็จ ' + sent + ' · ข้าม (ยังไม่ยืนยัน/ไม่ยินยอม) ' + skipped + ' · ล้มเหลว ' + failed,
  at: new Date().toISOString(),
  reports: reports, sent: sent, skipped: skipped, failed: failed, firstError: firstError,
} }];
""".strip()


def json_body(expr_dict_js: str) -> str:
    return "={{ JSON.stringify(" + expr_dict_js + ") }}"


def build_workflow():
    def node(nid, name, ntype, tv, pos, params):
        return {"parameters": params, "id": nid, "name": name, "type": ntype,
                "typeVersion": tv, "position": pos}

    n1 = node("mi-01-sched", "Schedule ทุก 10 นาที", "n8n-nodes-base.scheduleTrigger", 1.2, [-320, 300],
              {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}})

    n2 = node("mi-02-radar", "เรดาร์กิจกรรมสมาชิก (/api/activity/radar)", "n8n-nodes-base.httpRequest", 4.2, [-100, 300],
              {"method": "GET",
               "url": APP + "/api/activity/radar",
               "sendHeaders": True,
               "headerParameters": {"parameters": [{"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"}]},
               "sendQuery": True,
               "queryParameters": {"parameters": [{"name": "minutes", "value": "30"}, {"name": "minScore", "value": "40"}]},
               "options": {"timeout": 20000, "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    n3 = node("mi-03-pick", "คัดรายที่ถึงเกณฑ์ + เตรียมรายงาน", "n8n-nodes-base.code", 2, [120, 300],
              {"mode": "runOnceForAllItems", "jsCode": CODE_PICK})

    n4 = node("mi-04-if", "มีรายต้องรายงาน?", "n8n-nodes-base.if", 2.2, [340, 300],
              {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                              "conditions": [{"id": "mi-cond-1", "leftValue": "={{ $json.none !== true }}",
                                              "operator": {"type": "boolean", "operation": "true"}}],
                              "combinator": "and"},
               "looseTypeValidation": True, "options": {}})

    n5 = node("mi-05-report", "สร้างรายงาน + ส่งอีเมล (/api/activity/report)", "n8n-nodes-base.httpRequest", 4.2, [560, 180],
              {"method": "POST",
               "url": APP + "/api/activity/report",
               "sendHeaders": True,
               "headerParameters": {"parameters": AUTH_HEADERS},
               "sendBody": True, "contentType": "json", "specifyBody": "json",
               "jsonBody": json_body(
                   "{ visitorKey: $json.visitorKey, prospectId: $json.prospectId, score: $json.score, "
                   "level: $json.level, summary: $json.summary, behaviors: $json.behaviors, "
                   "pagePath: $json.pagePath, durationSec: $json.durationSec, visits: $json.visits, "
                   "ctaClicks: $json.ctaClicks, source: 'n8n-member-interest' }"),
               "options": {"timeout": 20000, "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    n6 = node("mi-06-sum", "สรุปผลการส่ง + ตรวจข้อผิดพลาด", "n8n-nodes-base.code", 2, [780, 180],
              {"mode": "runOnceForAllItems", "jsCode": CODE_SUM})

    n7 = node("mi-07-log", "บันทึก Log การทำงาน (/api/agent-log)", "n8n-nodes-base.httpRequest", 4.2, [1000, 180],
              {"method": "POST",
               "url": APP + "/api/agent-log",
               "sendHeaders": True,
               "headerParameters": {"parameters": AUTH_HEADERS},
               "sendBody": True, "contentType": "json", "specifyBody": "json",
               "jsonBody": json_body(
                   "{ source: 'n8n', workflow: $json.workflow, ok: $json.ok, stage: $json.stage, "
                   "detail: $json.detail, at: $json.at, reports: $json.reports, sent: $json.sent, "
                   "skipped: $json.skipped, failed: $json.failed }"),
               "options": {"timeout": 15000, "response": {"response": {"neverError": True, "responseFormat": "json"}}}})

    n8 = node("mi-08-noop", "จบรอบ — ยังไม่มีรายถึงเกณฑ์", "n8n-nodes-base.noOp", 1, [560, 440], {})

    nodes = [n1, n2, n3, n4, n5, n6, n7, n8]

    connections = {
        n1["name"]: {"main": [[{"node": n2["name"], "type": "main", "index": 0}]]},
        n2["name"]: {"main": [[{"node": n3["name"], "type": "main", "index": 0}]]},
        n3["name"]: {"main": [[{"node": n4["name"], "type": "main", "index": 0}]]},
        n4["name"]: {"main": [
            [{"node": n5["name"], "type": "main", "index": 0}],
            [{"node": n8["name"], "type": "main", "index": 0}],
        ]},
        n5["name"]: {"main": [[{"node": n6["name"], "type": "main", "index": 0}]]},
        n6["name"]: {"main": [[{"node": n7["name"], "type": "main", "index": 0}]]},
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
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-import", action="store_true")
    args = ap.parse_args()

    wf = build_workflow()
    os.makedirs(WF_DIR, exist_ok=True)
    out = os.path.join(WF_DIR, "01-member-interest-radar.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(wf, f, ensure_ascii=False, indent=2)
    print(f"เขียนไฟล์ workflow → {out} ({len(wf['nodes'])} โหนด)")
    if args.no_import:
        return

    if not os.path.exists(DB):
        raise SystemExit(f"ไม่พบฐานข้อมูล n8n: {DB}")
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

    name = wf["name"]
    nodes = wf["nodes"]
    conns = wf["connections"]
    settings = dict(wf["settings"])
    version_id = str(uuid.uuid4())
    iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
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
            "triggerCount": len([n for n in nodes if "trigger" in (n.get("type") or "")]),
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
    print("\nต่อไป: restart n8n แล้วทดสอบด้วย CLI/API (ดู README.md)")


if __name__ == "__main__":
    main()
