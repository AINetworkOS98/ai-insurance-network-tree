#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_sim_workflows.py
======================
สร้าง workflow JSON 6 ตัวสำหรับระบบจำลองเครือข่าย "1 แตก 5"
(Network Simulator) ลงใน n8n/network-simulator/workflows/sim-01..sim-06.json

โครงของทุก workflow:
    Webhook (responseMode = responseNode)
      -> HTTP Request ไปยังแอป (APP_BASE_URL + /api/sim/...)
      -> Code node สรุปผล
      -> Respond to Webhook (ชื่อโหนดสุดท้าย 'ตอบกลับ')

หลักความปลอดภัย:
    * ไม่ hardcode secret ใด ๆ ลงในไฟล์ JSON — ใช้ $env.CRON_SECRET / $env.APP_BASE_URL เท่านั้น
    * settings.errorWorkflow เป็น "" แล้วค่อยเติมตอน import

การใช้งาน:
    # สร้างไฟล์ JSON อย่างเดียว (ค่าเริ่มต้น — ไม่แตะ n8n)
    python scripts/build_sim_workflows.py

    # สร้างไฟล์ + เรียก import-workflows.py เข้า n8n (ผู้ใช้ต้องสั่ง --import เอง)
    python scripts/build_sim_workflows.py --import

    # ดูความช่วยเหลือ
    python scripts/build_sim_workflows.py --help
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------
# ค่าคงที่
# --------------------------------------------------------------------------

APP_BASE_URL_DEFAULT = "https://ai-insurance-network-tree.vercel.app"
# expression: ใช้ตัวแปรสภาพแวดล้อมก่อน ถ้าไม่มีจึง fallback เป็น production URL
APP_EXPR = '{{ $env.APP_BASE_URL || "%s" }}' % APP_BASE_URL_DEFAULT
AUTH_EXPR = "=Bearer {{ $env.CRON_SECRET }}"

# errorWorkflow mapping ที่ใช้ตอน import เฉพาะ sim-01..sim-05
DEFAULT_ERROR_WORKFLOW = (
    "Network Sim 03 · Promotion Rule Engine:"
    "Passive Income 11 · Error Handler (11_ERROR_HANDLER)"
)

# workflow ที่ได้ errorWorkflow (ตามสเปก: เฉพาะ sim-01..05)
ERROR_WORKFLOW_STEMS = {"sim-01", "sim-02", "sim-03", "sim-04", "sim-05"}

# path ของสคริปต์ import (เทียบจาก root ของ repo)
REPO_ROOT = Path(__file__).resolve().parents[3]
IMPORT_SCRIPT = REPO_ROOT / "n8n" / "passive-income" / "scripts" / "import-workflows.py"

# โฟลเดอร์ปลายทางของ workflow JSON (script อยู่ที่ n8n/network-simulator/scripts/)
SCRIPT_DIR = Path(__file__).resolve().parent
WORKFLOWS_DIR = SCRIPT_DIR.parent / "workflows"


def _uid() -> str:
    return str(uuid.uuid4())


# --------------------------------------------------------------------------
# โครงสร้าง node มาตรฐาน
# --------------------------------------------------------------------------

def _webhook_node(path: str, http_method: str, name: str) -> dict[str, Any]:
    return {
        "parameters": {
            "httpMethod": http_method,
            "path": path,
            "responseMode": "responseNode",
            "options": {},
        },
        "id": _uid(),
        "name": name,
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 0],
        "webhookId": _uid(),
    }


def _http_node(
    method: str,
    url: str,
    name: str,
    *,
    json_body: str | None = None,
    timeout: int = 30000,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "method": method,
        "url": url,
        "options": {
            "timeout": timeout,
            "response": {"response": {"neverError": True}},
        },
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [{"name": "Authorization", "value": AUTH_EXPR}]
        },
    }
    if json_body is not None:
        params["sendBody"] = True
        params["specifyBody"] = "json"
        params["jsonBody"] = json_body
    return {
        "parameters": params,
        "id": _uid(),
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [260, 0],
        "onError": "continueRegularOutput",
    }


def _code_node(js_code: str, name: str) -> dict[str, Any]:
    return {
        "parameters": {"jsCode": js_code.lstrip("\n")},
        "id": _uid(),
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [520, 0],
    }


def _respond_node() -> dict[str, Any]:
    # โหนดสุดท้ายของทุก workflow ต้องชื่อ 'ตอบกลับ' และตอบ JSON
    return {
        "parameters": {
            "respondWith": "json",
            "responseBody": "={{ JSON.stringify($json) }}",
            "options": {"responseCode": 200},
        },
        "id": _uid(),
        "name": "ตอบกลับ",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [780, 0],
    }


def _connections(webhook: str, http: str, code: str, respond: str) -> dict[str, Any]:
    chain = [webhook, http, code, respond]
    conns: dict[str, Any] = {}
    for src, dst in zip(chain, chain[1:]):
        conns[src] = {"main": [[{"node": dst, "type": "main", "index": 0}]]}
    return conns


# --------------------------------------------------------------------------
# สรุปผลด้วย Code node (ภาษา JS ของ n8n)
# --------------------------------------------------------------------------

def _code_summary(workflow_title: str, extra_js: str = "") -> str:
    return f"""
// สรุปผลลัพธ์ของ "{workflow_title}"
// รับข้อมูลจาก HTTP Request node (โหนดก่อนหน้า)
const res = $json || {{}};
const ok = res.success !== false && res.error === undefined;
const base = {{
  workflow: "{workflow_title}",
  ok: ok,
  receivedAt: new Date().toISOString(),
}};
{extra_js}
return [{{ json: Object.assign(base, {{ result: res }}) }}];
"""


WORKFLOW_SPECS: list[dict[str, Any]] = [
    {
        "stem": "sim-01",
        "title": "Network Sim 01 · Member Created",
        "webhook_path": "member-created",
        "http_method": "POST",
        "http_url": "=%s/api/sim/member" % APP_EXPR,
        "json_body": "={{ JSON.stringify($json.body || {}) }}",
        "http_label": "บันทึกสมาชิกใหม่ (/api/sim/member)",
        "summary_extra": (
            "  base.memberCode = (res.member && (res.member.code || res.member.memberCode)) || res.memberCode || null;\n"
            "  base.treeDepth = res.depth !== undefined ? res.depth : null;"
        ),
    },
    {
        "stem": "sim-02",
        "title": "Network Sim 02 · Check 1-to-5 Structure",
        "webhook_path": "check-1-to-5",
        "http_method": "GET",
        "http_url": (
            "=%s/api/sim/check?code={{ encodeURIComponent($json.query.code || '') }}" % APP_EXPR
        ),
        "json_body": None,
        "http_label": "ตรวจโครงสร้าง 1 แตก 5 (/api/sim/check)",
        "summary_extra": (
            "  base.memberCode = res.memberCode || null;\n"
            "  base.directCount = res.directCount !== undefined ? res.directCount : null;\n"
            "  base.validStructure = res.validStructure !== undefined ? res.validStructure : null;"
        ),
    },
    {
        "stem": "sim-03",
        "title": "Network Sim 03 · Promotion Rule Engine",
        "webhook_path": "promotion-check",
        "http_method": "POST",
        "http_url": "=%s/api/sim/promotion-check" % APP_EXPR,
        "json_body": "={{ JSON.stringify($json.body || {}) }}",
        "http_label": "คำนวณเงื่อนไขเลื่อนตำแหน่ง (/api/sim/promotion-check)",
        "summary_extra": (
            "  base.promoted = res.promoted !== undefined ? res.promoted : null;\n"
            "  base.fromRank = res.fromRank || null;\n"
            "  base.toRank = res.toRank || null;"
        ),
    },
    {
        "stem": "sim-04",
        "title": "Network Sim 04 · Payment Verification (DEMO)",
        "webhook_path": "payment-verified",
        "http_method": "POST",
        "http_url": "=%s/api/sim/payment" % APP_EXPR,
        "json_body": "={{ JSON.stringify($json.body || {}) }}",
        "http_label": "ตรวจสอบการชำระเงิน DEMO (/api/sim/payment)",
        "summary_extra": (
            "  base.verified = res.verified !== undefined ? res.verified : null;\n"
            "  base.paymentId = res.paymentId || null;\n"
            "  base.amount = res.amount !== undefined ? res.amount : null;"
        ),
    },
    {
        "stem": "sim-05",
        "title": "Network Sim 05 · Simulation Start/Reset",
        "webhook_path": "simulation-start",
        "http_method": "POST",
        "http_url": "=%s/api/sim/run" % APP_EXPR,
        "json_body": "={{ JSON.stringify($json.body || {}) }}",
        "http_label": "เริ่ม/รีเซ็ตการจำลอง (/api/sim/run)",
        "summary_extra": (
            "  base.simId = res.simId || res.id || null;\n"
            "  base.status = res.status || null;\n"
            "  base.memberCount = res.memberCount !== undefined ? res.memberCount : null;"
        ),
    },
    {
        "stem": "sim-06",
        "title": "Network Sim 06 · Event Log & Network Update",
        "webhook_path": "network-update",
        "http_method": "GET",
        "http_url": (
            "=%s/api/sim/state?id={{ encodeURIComponent($json.query.id || '') }}" % APP_EXPR
        ),
        "json_body": None,
        "http_label": "ดึงสถานะเครือข่าย (/api/sim/state)",
        "summary_extra": (
            "  base.simId = res.simId || res.id || null;\n"
            "  base.memberCount = res.memberCount !== undefined ? res.memberCount : null;\n"
            "  base.events = Array.isArray(res.events) ? res.events.length : null;"
        ),
    },
]


def build_workflow(spec: dict[str, Any]) -> dict[str, Any]:
    """สร้าง dict ของ workflow หนึ่งตัวตามสเปก"""
    webhook_name = "Webhook รับเหตุการณ์"
    http_name = spec["http_label"]
    code_name = "สรุปผล"

    webhook = _webhook_node(spec["webhook_path"], spec["http_method"], webhook_name)
    http = _http_node(
        spec["http_method"],
        spec["http_url"],
        http_name,
        json_body=spec["json_body"],
    )
    code = _code_node(_code_summary(spec["title"], spec["summary_extra"]), code_name)
    respond = _respond_node()

    workflow = {
        "name": spec["title"],
        "nodes": [webhook, http, code, respond],
        "connections": _connections(webhook_name, http_name, code_name, "ตอบกลับ"),
        "settings": {
            "errorWorkflow": "",  # เติมตอน import
            "saveExecutionProgress": True,
        },
        "active": False,
        "pinData": {},
        "versionId": _uid(),
        "meta": {},
        "tags": [],
    }
    return workflow


# --------------------------------------------------------------------------
# import เข้า n8n (ผู้เรียกต้องสั่ง --import เอง)
# --------------------------------------------------------------------------

def _detect_import_flags(script: Path) -> dict[str, bool]:
    """เดาความสามารถของ import-workflows.py จาก source (ถ้ามี)"""
    caps = {"only": False, "file": False, "error_workflow": False}
    try:
        text = script.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return caps
    caps["only"] = "--only" in text
    caps["file"] = "--file" in text
    caps["error_workflow"] = "--error-workflow" in text
    return caps


def import_to_n8n(
    workflows_dir: Path,
    import_script: Path = IMPORT_SCRIPT,
    *,
    error_workflow: str = DEFAULT_ERROR_WORKFLOW,
    update: bool = True,
    stems: list[str] | None = None,
) -> int:
    """
    เรียก import-workflows.py ผ่าน subprocess เพื่อนำ workflow JSON เข้า n8n

    Guard: ถ้าไม่พบไฟล์ import-workflows.py จะพิมพ์คำแนะนำแล้วคืนค่า 0
           (ไม่ทำให้สคริปต์หลักล้ม)

    คืนค่า: exit code ของ import script (หรือ 0 เมื่อ guard ทำงาน)
    """
    if not import_script.exists():
        print()
        print("=" * 74)
        print("  ⚠  ยังไม่พบสคริปต์ import เข้า n8n")
        print("     path ที่ต้องการ: %s" % import_script)
        print()
        print("  ไฟล์ workflow JSON ถูกสร้างครบแล้ว — นำเข้าเองได้ 2 วิธี:")
        print("   1) เปิด n8n UI -> Workflows -> Import from File (เลือก sim-01..06.json)")
        print("   2) เมื่อมี import-workflows.py แล้ว รัน:")
        print("        python scripts/build_sim_workflows.py --import")
        print("=" * 74)
        return 0

    caps = _detect_import_flags(import_script)
    all_stems = stems or [s["stem"] for s in WORKFLOW_SPECS]
    sim5 = [s for s in all_stems if s in ERROR_WORKFLOW_STEMS]
    rest = [s for s in all_stems if s not in ERROR_WORKFLOW_STEMS]

    py = sys.executable or "python"
    exit_code = 0

    def _run(target_stems: list[str], err_wf: str | None) -> int:
        cmd = [py, str(import_script), "--dir", str(workflows_dir)]
        if update:
            cmd += ["--update"]
        # ถ้า import script รองรับ เราระบุเฉพาะไฟล์ที่ต้องการ เพื่อให้
        # --error-workflow ถูกใส่เฉพาะ sim-01..05 จริง ๆ
        if caps["only"]:
            cmd += ["--only"] + [wf["title"] for wf in WORKFLOW_SPECS if wf["stem"] in target_stems]
        elif caps["file"]:
            cmd += ["--file"] + [str(WORKFLOWS_DIR / (s + ".json")) for s in target_stems]
        if err_wf and caps["error_workflow"]:
            cmd += ["--error-workflow", err_wf]
        elif err_wf:
            cmd += ["--error-workflow", err_wf]
        print("  >", " ".join(cmd))
        try:
            return subprocess.call(cmd)
        except OSError as exc:  # pragma: no cover - OS-level failure
            print("  ! เรียก import ล้มเหลว: %s" % exc)
            return 1

    print()
    print(">> เริ่มนำเข้า n8n (sim-01..05 พร้อม errorWorkflow)")
    exit_code |= _run(sim5, error_workflow)

    if rest:
        print(">> เริ่มนำเข้า n8n (ที่เหลือ: %s — ไม่มี errorWorkflow)" % ", ".join(rest))
        exit_code |= _run(rest, None)

    return exit_code


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _write_all(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for spec in WORKFLOW_SPECS:
        workflow = build_workflow(spec)
        path = out_dir / (spec["stem"] + ".json")
        path.write_text(
            json.dumps(workflow, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="สร้าง workflow JSON 6 ตัว (Network Simulator 1 แตก 5)",
    )
    parser.add_argument(
        "--out",
        default=str(WORKFLOWS_DIR),
        help="โฟลเดอร์ปลายทางของไฟล์ JSON (ค่าเริ่มต้น: n8n/network-simulator/workflows)",
    )
    parser.add_argument(
        "--import",
        dest="do_import",
        action="store_true",
        help="เรียก import-workflows.py เข้า n8n หลังสร้างไฟล์ (ค่าเริ่มต้น = ไม่ import)",
    )
    parser.add_argument(
        "--error-workflow",
        default=DEFAULT_ERROR_WORKFLOW,
        help="ค่า errorWorkflow สำหรับ sim-01..05 ตอน import",
    )
    parser.add_argument(
        "--no-update",
        action="store_true",
        help="ไม่ใส่ --update ตอน import",
    )
    parser.add_argument(
        "--import-script",
        default=str(IMPORT_SCRIPT),
        help="path ของ import-workflows.py (ค่าเริ่มต้น: n8n/passive-income/scripts/import-workflows.py)",
    )
    args = parser.parse_args(argv)

    out_dir = Path(args.out).resolve()
    written = _write_all(out_dir)

    print("สร้าง workflow JSON สำเร็จ %d ไฟล์ ที่:" % len(written))
    print("  %s" % out_dir)
    for path in written:
        wf = json.loads(path.read_text(encoding="utf-8"))
        last = wf["nodes"][-1]
        print(
            "  - %-14s  %-44s  last_node='%s' id=%s"
            % (path.name, wf["name"], last["name"], last["id"])
        )

    if args.do_import:
        code = import_to_n8n(
            out_dir,
            Path(args.import_script),
            error_workflow=args.error_workflow,
            update=not args.no_update,
        )
        return code

    print()
    print("(ยังไม่นำเข้า n8n — เพิ่ม --import เพื่อนำเข้าเมื่อพร้อม)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
