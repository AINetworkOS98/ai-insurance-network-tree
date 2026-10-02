#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_sim_workflows.py — นำ workflow ระบบจำลองเครือข่ายเข้า n8n (SQLite ตรง)
และ export workflow ทั้งหมดออกมาเป็นไฟล์ JSON สำรองไว้ใน n8n/_exports/ (กันไฟล์หาย)

ใช้งาน:
    python scripts/import_sim_workflows.py            # import 6 workflow + export สำรอง
    python scripts/import_sim_workflows.py --dry-run  # ดูว่าจะทำอะไร
    python scripts/import_sim_workflows.py --export-only

หลัง import ต้องรีสตาร์ท n8n เพื่อให้ webhook ลงทะเบียน
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
EXPORT_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "_exports"))
ERROR_WORKFLOW = "a7d8069f-ac7a-4919-b0ff-d4d6e51a263b"  # Passive Income 11 · Error Handler


def now_ms():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}"


def template_row(cur):
    """ใช้แถวของ workflow ที่มีอยู่เป็นแม่แบบ เพื่อให้คอลัมน์ตรงกับเวอร์ชัน n8n ที่ติดตั้ง"""
    rows = cur.execute("select * from workflow_entity where active = 1 order by updatedAt desc limit 5").fetchall()
    cols = [d[0] for d in cur.description]
    for r in rows:
        d = dict(zip(cols, r))
        if d.get("nodes") and d.get("connections"):
            return cols, d
    raise SystemExit("ไม่พบ workflow ต้นแบบใน n8n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--export-only", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(DB):
        raise SystemExit(f"ไม่พบฐานข้อมูล n8n: {DB}")
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cols, tpl = template_row(cur)
    project_id = None
    try:
        sw = cur.execute("select projectId from shared_workflow limit 1").fetchone()
        project_id = sw[0] if sw else None
    except Exception:
        pass

    # ── 1) export สำรองทุก workflow ──
    os.makedirs(EXPORT_DIR, exist_ok=True)
    all_rows = cur.execute("select id, name, active, nodes, connections, settings, staticData, pinData, versionId, triggerCount from workflow_entity order by name").fetchall()
    n_exp = 0
    for (wid, name, active, nodes, connections, settings, staticdata, pindata, vid, tcount) in all_rows:
        safe = "".join(ch if ch.isalnum() or ch in "-_ " else "_" for ch in (name or wid)).strip()[:80]
        payload = {
            "id": wid,
            "name": name,
            "active": bool(active),
            "nodes": json.loads(nodes or "[]"),
            "connections": json.loads(connections or "{}"),
            "settings": json.loads(settings or "{}"),
            "staticData": json.loads(staticdata) if staticdata else None,
            "pinData": json.loads(pindata) if pindata else None,
            "versionId": vid,
            "triggerCount": tcount,
        }
        with open(os.path.join(EXPORT_DIR, f"{safe}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        n_exp += 1
    print(f"export สำรอง {n_exp} workflow → {EXPORT_DIR}")

    if args.export_only:
        con.close()
        return

    files = sorted(f for f in os.listdir(WF_DIR) if f.endswith(".json"))
    added, updated, skipped = [], [], []
    for fn in files:
        with open(os.path.join(WF_DIR, fn), encoding="utf-8") as f:
            wf = json.load(f)
        name = wf.get("name") or fn
        nodes = wf.get("nodes") or []
        conns = wf.get("connections") or {}
        settings = wf.get("settings") or {}
        # n8n 2.x ต้องมี executionOrder ใน settings ไม่เช่นนั้น workflow จะไม่ถูก activate/ลงทะเบียน webhook
        settings.setdefault("executionOrder", "v1")
        if ERROR_WORKFLOW and not settings.get("errorWorkflow"):
            settings["errorWorkflow"] = ERROR_WORKFLOW
        existing = cur.execute("select id from workflow_entity where name = ?", (name,)).fetchone()
        if args.dry_run:
            print(("[update] " if existing else "[new]    ") + name)
            continue
        # n8n 2.x: workflow จะ "active" จริงเมื่อ versionId == activeVersionId และมีแถวใน workflow_history
        version_id = str(uuid.uuid4())
        iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
        if existing:
            wid = existing[0]
            cur.execute(
                "update workflow_entity set nodes = ?, connections = ?, settings = ?, active = 1, versionId = ?, activeVersionId = ?, versionCounter = 1, staticData = '{}', pinData = '{}', description = NULL, updatedAt = ? where id = ?",
                (json.dumps(nodes, ensure_ascii=False), json.dumps(conns, ensure_ascii=False), json.dumps(settings, ensure_ascii=False), version_id, version_id, now_ms(), wid),
            )
            updated.append(name)
        else:
            wid = str(uuid.uuid4())
            row = dict(tpl)
            row.update(
                {
                    "id": wid,
                    "name": name,
                    "active": 1,
                    "nodes": json.dumps(nodes, ensure_ascii=False),
                    "connections": json.dumps(conns, ensure_ascii=False),
                    "settings": json.dumps(settings, ensure_ascii=False),
                    "staticData": "{}",
                    "pinData": "{}",
                    "description": None,
                    "versionId": version_id,
                    "activeVersionId": version_id,
                    "triggerCount": len([n for n in nodes if "webhook" in (n.get("type") or "") or "trigger" in (n.get("type") or "")]),
                    "createdAt": now_ms(),
                    "updatedAt": now_ms(),
                    "isArchived": 0,
                    "versionCounter": 1,
                }
            )
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
            added.append((name, wid))

        # สร้าง version ใน workflow_history ให้ตรงกับ activeVersionId (จำเป็นสำหรับ n8n 2.x)
        cur.execute("delete from workflow_history where workflowId = ?", (wid,))
        cur.execute(
            "insert into workflow_history (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description, nodeGroups) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (version_id, wid, "hermes", iso, iso, json.dumps(nodes, ensure_ascii=False), json.dumps(conns, ensure_ascii=False), name, 0, None, "[]"),
        )

    con.commit()
    con.close()
    print(f"\nเพิ่มใหม่ {len(added)} · อัปเดต {len(updated)} · ข้าม {len(skipped)}")
    for n, w in added:
        print(f"  + {n}  ({w})")
    for n in updated:
        print(f"  ~ {n}")
    print("\nต่อไป: รีสตาร์ท n8n เพื่อให้ webhook ลงทะเบียน")


if __name__ == "__main__":
    main()
