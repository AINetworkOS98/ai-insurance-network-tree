#!/usr/bin/env python3
"""
export-workflows-json.py — สร้าง public/n8n/workflows.json จากฐานข้อมูล n8n จริง

ใช้โดยหน้า /n8n/workflow-3d (ฉาก 3D "ทุกเวิร์กโฟลว์ n8n") ซึ่งอ่านไฟล์นิ่งนี้
(ไม่เรียก n8n โดยตรง) ดังนั้นเมื่อ workflow ใน n8n ถูกเพิ่ม/แก้/ลบ ต้องรันสคริปต์นี้
ใหม่แล้ว deploy เพื่อให้หน้าเว็บเห็นข้อมูลล่าสุด

ข้อมูลที่ export: ชื่อโหนด / ชนิดโหนด / พิกัด / เส้นเชื่อม เท่านั้น
(ไม่เก็บ parameters, credentials, คีย์ API หรือข้อมูลส่วนบุคคล)

วิธีใช้:
    python scripts/export-workflows-json.py
ตัวแปร (env): N8N_DB (default ~/.n8n/database.sqlite), OUT (default public/n8n/workflows.json)
"""

import json
import os
import sqlite3
from datetime import date

HOME = os.path.expanduser("~")
N8N_DB = os.environ.get("N8N_DB", os.path.join(HOME, ".n8n", "database.sqlite"))
OUT = os.environ.get("OUT", os.path.join("public", "n8n", "workflows.json"))


def strip_type(t: str) -> str:
    """แปลงชนิดโหนด n8n → รูปที่หน้า 3D ใช้ (ตรงกับ workflowGraphs.ts)"""
    if t.startswith("@n8n/n8n-nodes-langchain."):
        return "ai:" + t[len("@n8n/n8n-nodes-langchain."):]
    if t.startswith("n8n-nodes-base."):
        return t[len("n8n-nodes-base."):]
    return t


def build_edges(connections) -> list:
    """แปลง connections ของ n8n → รายการ edge {from,to,out}"""
    edges = []
    if not isinstance(connections, dict):
        return edges
    for src_name, by_type in connections.items():
        if not isinstance(by_type, dict):
            continue
        for out_type, out_arr in by_type.items():
            if not isinstance(out_arr, list):
                continue
            # out_arr: รายการของ output-index → รายการ connection ปลายทาง
            for out_idx, conns in enumerate(out_arr):
                if not isinstance(conns, list):
                    continue
                for c in conns:
                    if isinstance(c, dict) and c.get("node"):
                        edges.append({"from": src_name, "to": c["node"], "out": out_idx})
    return edges


def main() -> None:
    conn = sqlite3.connect(N8N_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, name, active, updatedAt, nodes, connections FROM workflow_entity"
    ).fetchall()
    conn.close()

    workflows = []
    for r in rows:
        try:
            nodes_raw = json.loads(r["nodes"]) if r["nodes"] else []
            conn_raw = json.loads(r["connections"]) if r["connections"] else {}
        except (json.JSONDecodeError, TypeError):
            nodes_raw, conn_raw = [], {}

        nodes = []
        for n in nodes_raw:
            if not isinstance(n, dict) or not n.get("name"):
                continue
            pos = n.get("position")
            x = float(pos[0]) if isinstance(pos, list) and len(pos) >= 2 else 0.0
            y = float(pos[1]) if isinstance(pos, list) and len(pos) >= 2 else 0.0
            nodes.append({
                "name": n["name"],
                "type": strip_type(str(n.get("type") or "")),
                "disabled": bool(n.get("disabled")),
                "x": x,
                "y": y,
                "cred": bool(n.get("credentials")),
            })

        workflows.append({
            "id": r["id"],
            "name": r["name"],
            "active": bool(r["active"]),
            "updatedAt": r["updatedAt"],
            "nodes": nodes,
            "edges": build_edges(conn_raw),
        })

    workflows.sort(key=lambda w: w["name"])

    payload = {
        "generatedAt": date.today().isoformat(),
        "count": len(workflows),
        "workflows": workflows,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"OK: เขียน {len(workflows)} เวิร์กโฟลว์ → {OUT}")


if __name__ == "__main__":
    main()
