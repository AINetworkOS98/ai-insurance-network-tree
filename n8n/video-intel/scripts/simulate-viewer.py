#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
simulate-viewer.py
================================================================================
จำลองผู้ชมวิดีโอจริงแบบ end-to-end สำหรับระบบ AI Video Intelligence
End-to-end viewer simulator for the AI Video Intelligence ingest, used to prove
the acceptance tests (ส่ง event ตามลำดับเหมือนผู้ใช้จริง แล้วรายงานผล每一步)

อะไรเกิดขึ้น (What it does)
--------------------------------------------------------------------------------
ยิง POST /api/video-intel/event ตามลำดับเหตุการณ์จริงของผู้ชม:
   page_view → video_loaded → video_play
     → video_progress ที่ 10/25/50/75/90 (current_time เพิ่มขึ้นเรื่อย ๆ)
     → video_pause + video_resume 1 ครั้ง
     → video_seek (เลื่อนไปข้างหน้า) 1 ครั้ง
     → video_interaction (fullscreen) 1 ครั้ง
     → video_ended (100%)
     → video_exit + page_exit
ทุก request ส่ง consent {analytics:true}, event_id = uuid4 และ source:'web'
แล้วพิมพ์ตารางผลลัพธ์: step / event / HTTP status / stored / n8n / note

Flags
--------------------------------------------------------------------------------
  --base URL        ฐาน URL ของแอป (default: http://localhost:3000)
  --visitor ID      ระบุ visitor_id เอง (default: สุ่ม uuid4)
  --session ID      ระบุ session_id เอง (default: สุ่ม uuid4)
  --hot             สร้างรูปแบบ VERY HOT (replay + ดูนาน + progress mark สูงครบ)
  --second-visit    ใช้ visitor_id เดิมกับ session_id ใหม่ เพื่อพิสูจน์การตรวจจับ
                    ผู้ชมที่กลับมา (ต้องใช้คู่กับ --visitor <id จากรอบแรก>)
  --delay SECONDS   หน่วงระหว่าง request (default: 0.15) — กัน rate limit
  --timeout SECONDS timeout ต่อ request (default: 15)
  -h, --help        แสดงวิธีใช้ (ไทย + English)

Exit code
--------------------------------------------------------------------------------
  0 = ทุก step สำเร็จ (HTTP 200 + stored ≥ 1)
  1 = มีอย่างน้อย 1 step ล้มเหลว

ตัวอย่าง (Examples)
--------------------------------------------------------------------------------
  python n8n/video-intel/scripts/simulate-viewer.py
  python n8n/video-intel/scripts/simulate-viewer.py --base http://localhost:3000
  python n8n/video-intel/scripts/simulate-viewer.py --hot
  # รอบแรก (จำ id ที่พิมพ์ไว้) แล้วจำลองการกลับมาซ้ำ:
  python n8n/video-intel/scripts/simulate-viewer.py
  python n8n/video-intel/scripts/simulate-viewer.py --visitor <ID จากรอบแรก> --second-visit

สคริปต์นี้ใช้ stdlib เท่านั้น (urllib) ไม่ต้องติดตั้งอะไรเพิ่ม
Stdlib only (urllib). No third-party dependencies.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

# ── ค่าคงที่ของระบบ (ตรงกับ frontend SDK: public/video-intel.js) ──────────────
VIDEO_ID = "financial-freedom-video"
PAGE = "/financial-freedom"
VIDEO_DURATION = 480.0          # ความยาวคลิป (วินาที) — ใช้สร้าง current_time/watch
DEVICE = "desktop"
BROWSER = "chrome"
LANGUAGE = "th-TH"
REFERRER = ""
SOURCE = "web"
USER_AGENT = "video-intel-simulator/1.0 (+n8n/video-intel/scripts/simulate-viewer.py)"


# ── HTTP helper (stdlib) ──────────────────────────────────────────────────────
def post_json(url: str, payload: dict, timeout: float) -> tuple:
    """คืน (status, data, raw). status=0 หมายถึงเชื่อมต่อไม่ได้/error ฝั่ง client"""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, _safe_json(raw), raw
    except urllib.error.HTTPError as exc:  # 400/429/... ยังอ่าน body ได้
        raw = exc.read().decode("utf-8", "replace")
        return exc.code, _safe_json(raw), raw
    except urllib.error.URLError as exc:
        return 0, {}, f"URLError: {exc.reason}"
    except Exception as exc:  # noqa: BLE001 — สคริปต์ทดสอบ ต้องไม่ตายกลางทาง
        return 0, {}, f"{type(exc).__name__}: {exc}"


def _safe_json(text: str) -> dict:
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {"_raw": obj}
    except Exception:  # noqa: BLE001
        return {}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


# ── แผนการยิง event (ลำดับเดียวกับผู้ชมจริง) ─────────────────────────────────
def build_plan(hot: bool) -> list:
    plan = []

    def step(event, current=None, progress=None, interaction=None,
             replay=False, watch=None):
        plan.append({
            "event": event,
            "video_duration": VIDEO_DURATION,
            "current_time": current,
            "progress_percent": progress,
            "interaction": interaction,
            "replay": bool(replay),
            "watch_duration": watch,
        })

    # 1) เข้าหน้า + โหลด + กดเล่น
    step("page_view", current=None, progress=None, watch=0)
    step("video_loaded", current=0, progress=0, watch=0)
    step("video_play", current=0, progress=0, replay=False, watch=0)

    # 2) progress mark 10 / 25 / 50
    step("video_progress", current=48, progress=10, watch=48)
    step("video_progress", current=120, progress=25, watch=120)
    step("video_progress", current=240, progress=50, watch=240)

    # 3) หยุดดูชั่วคราว แล้วเล่นต่อ
    step("video_pause", current=240, progress=50, watch=240)
    step("video_resume", current=240, progress=50, watch=240)

    # 4) เลื่อนไปข้างหน้า + ใส่ fullscreen
    step("video_seek", current=360, progress=75, interaction="forward", watch=300)
    step("video_interaction", current=360, progress=75,
         interaction="fullscreen", watch=300)

    # 5) progress mark 75 / 90 (และ 100 ถ้า --hot)
    step("video_progress", current=360, progress=75, watch=300)
    step("video_progress", current=432, progress=90, watch=360)
    if hot:
        step("video_progress", current=480, progress=100, watch=480)

    # 6) ดูจบ
    step("video_ended", current=480, progress=100, watch=480)

    # 7) --hot: ดูซ้ำอีกรอบ (replay + ดูนานขึ้น + mark สูงครบ)
    if hot:
        step("video_play", current=0, progress=0, replay=True, watch=480)
        step("video_progress", current=120, progress=25, replay=True, watch=600)
        step("video_progress", current=240, progress=50, replay=True, watch=720)
        step("video_progress", current=360, progress=75, replay=True, watch=840)
        step("video_progress", current=432, progress=90, replay=True, watch=912)
        step("video_progress", current=480, progress=100, replay=True, watch=960)
        step("video_ended", current=480, progress=100, replay=True, watch=960)
        watch_total = 960
    else:
        watch_total = 480

    # 8) ออกจากวิดีโอ + ออกจากหน้า
    step("video_exit", current=480, progress=100, watch=watch_total)
    step("page_exit", current=None, progress=None, watch=watch_total)
    return plan


def build_payload(item: dict, visitor_id: str, session_id: str) -> dict:
    payload = {
        "visitor_id": visitor_id,
        "session_id": session_id,
        "event": item["event"],
        "page": PAGE,
        "video_id": VIDEO_ID,
        "timestamp": now_iso(),
        "video_duration": item["video_duration"],
        "current_time": item["current_time"],
        "watch_duration": item["watch_duration"],
        "progress_percent": item["progress_percent"],
        "interaction": item["interaction"],
        "device": DEVICE,
        "browser": BROWSER,
        "referrer": REFERRER,
        "language": LANGUAGE,
        "replay": item["replay"],
        "event_id": str(uuid.uuid4()),
        "consent": {"analytics": True},
        "source": SOURCE,
    }
    return payload


def verdict(status: int, data: dict) -> tuple:
    """คืน (ok: bool, stored, n8n, note: str)"""
    stored = data.get("stored")
    n8n = data.get("n8n")
    note = ""
    ok = status == 200 and data.get("ok") is not False

    if status == 0:
        note = "เชื่อมต่อไม่ได้ (server ปิด/URL ผิด)"
    elif status == 429:
        note = "rate_limited (ยิงถี่เกิน)"
    elif status == 400:
        note = "bad_request: " + str(data.get("error") or data.get("reason") or "")
    elif status != 200:
        note = "error: " + str(data.get("error") or data.get("reason") or status)

    if ok and stored is not None:
        try:
            stored_int = int(stored)
        except (TypeError, ValueError):
            stored_int = stored
        if stored_int == 0:
            reason = str(data.get("reason") or "")
            if reason == "no_consent":
                ok = False
                note = "no_consent (ไม่คาดคิด — สคริปต์ส่ง consent:true แล้ว)"
            else:
                ok = False
                note = "stored=0" + (f" reason={reason}" if reason else "")

    if ok and not note:
        if data.get("queued") is not None:
            note = f"queued={data.get('queued')}"
        if data.get("reason"):
            note = str(data.get("reason"))
    return ok, stored, n8n, note


def render_table(rows: list) -> str:
    headers = ["step", "event", "HTTP", "stored", "n8n", "note"]
    table = [headers] + rows
    widths = [0] * len(headers)
    for row in table:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))

    def line(cells):
        return "| " + " | ".join(str(c).ljust(widths[i]) for i, c in enumerate(cells)) + " |"

    sep = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    out = [sep, line(headers), sep]
    for row in rows:
        out.append(line(row))
    out.append(sep)
    return "\n".join(out)


def parse_args(argv) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="simulate-viewer.py",
        description=(
            "จำลองผู้ชมวิดีโอ end-to-end แล้วรายงานผลแต่ละ step\n"
            "Simulate an end-to-end video viewer session and report each step."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "ตัวอย่าง (Examples):\n"
            "  python simulate-viewer.py\n"
            "  python simulate-viewer.py --base http://localhost:3000\n"
            "  python simulate-viewer.py --hot\n"
            "  python simulate-viewer.py --visitor <id> --second-visit\n\n"
            "Exit code: 0 = ทุก step สำเร็จ, 1 = มี step ล้มเหลว\n"
            "Endpoint ที่ใช้: POST {base}/api/video-intel/event\n"
        ),
    )
    parser.add_argument("--base", default="http://localhost:3000",
                        help="ฐาน URL ของแอป / app base URL (default: http://localhost:3000)")
    parser.add_argument("--visitor", default=None,
                        help="ระบุ visitor_id เอง / explicit visitor_id (default: random uuid4)")
    parser.add_argument("--session", default=None,
                        help="ระบุ session_id เอง / explicit session_id (default: random uuid4)")
    parser.add_argument("--hot", action="store_true",
                        help="สร้างรูปแบบ VERY HOT (replay + ดูนาน + mark สูง) / build a VERY HOT pattern")
    parser.add_argument("--second-visit", action="store_true",
                        help="ใช้ visitor เดิม + session ใหม่ (พิสูจน์ returning visitor) — ใช้คู่กับ --visitor")
    parser.add_argument("--delay", type=float, default=0.15,
                        help="หน่วงระหว่าง request (วินาที) / delay between requests (default: 0.15)")
    parser.add_argument("--timeout", type=float, default=15.0,
                        help="timeout ต่อ request (วินาที) / per-request timeout (default: 15)")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    base = args.base.rstrip("/")
    endpoint = f"{base}/api/video-intel/event"

    visitor_id = args.visitor or str(uuid.uuid4())
    session_id = args.session or str(uuid.uuid4())

    if args.second_visit and not args.visitor:
        print("[คำเตือน/WARN] --second-visit ต้องใช้คู่กับ --visitor <id จากรอบแรก> "
              "เพื่อให้ตรวจ returning visitor ได้จริง\n")

    mode = "VERY-HOT" if args.hot else "normal"
    if args.second_visit:
        mode += " + second-visit"

    print("=" * 78)
    print("AI Video Intelligence — Viewer Simulator")
    print("=" * 78)
    print(f"endpoint   : {endpoint}")
    print(f"visitor_id : {visitor_id}")
    print(f"session_id : {session_id}")
    print(f"mode       : {mode}")
    print(f"page/video : {PAGE}  /  {VIDEO_ID}")
    print("-" * 78)

    plan = build_plan(args.hot)
    rows = []
    failures = 0

    for i, item in enumerate(plan, start=1):
        payload = build_payload(item, visitor_id, session_id)
        status, data, _raw = post_json(endpoint, payload, args.timeout)
        ok, stored, n8n, note = verdict(status, data)
        if not ok:
            failures += 1
        rows.append([
            i,
            item["event"],
            status if status else "ERR",
            "" if stored is None else stored,
            "" if n8n is None else n8n,
            note,
        ])
        if args.delay > 0 and i < len(plan):
            time.sleep(args.delay)

    print(render_table(rows))
    total = len(plan)
    print(f"\nรวม {total} step • สำเร็จ {total - failures} • ล้มเหลว {failures}")

    if failures == 0:
        print("RESULT: PASS — ทุก step ถูกบันทึก (stored ≥ 1)")
    else:
        print("RESULT: FAIL — มี step ที่ไม่สำเร็จ (ดูคอลัมน์ note)")

    print("-" * 78)
    print("ค่าที่ต้องใช้ต่อ (keep for the next run):")
    print(f"  visitor_id = {visitor_id}")
    print(f"  session_id = {session_id}")
    print("\nตรวจผลต่อ (verify next):")
    print("  • GET /api/video-intel/aggregate?visitor_id=<id>&session_id=<id>&minutes=30")
    print("  • GET /api/video-intel/stats?window=1h&limit=30")
    print("  • กลับมาซ้ำ: รันสคริปต์อีกครั้งด้วย "
          f"--visitor {visitor_id} --second-visit")
    print("=" * 78)

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
