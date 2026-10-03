#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
run_workflow_now.py — สั่งรัน workflow ของ n8n เดี๋ยวนี้ ผ่าน REST ของ instance ที่กำลังรันอยู่
(ใช้ทดสอบ workflow ที่ทริกเกอร์ด้วย schedule เพราะ n8n CLI รันไม่ได้ขณะเซิร์ฟเวอร์ทำงาน)

วิธีใช้:
  python run_workflow_now.py --name "Video Intel 03"           # หา workflow จากชื่อ (บางส่วน)
  python run_workflow_now.py --id aff42cce-5749-48db-8f8e-4e6d389e72b6
  python run_workflow_now.py --name "Video Intel 04" --show-log

หมายเหตุความปลอดภัย: รหัสผ่านอ่านจาก ~/.n8n/start-n8n-now.bat และไม่ถูกพิมพ์ออกหน้าจอ
"""
import argparse, json, os, re, sqlite3, subprocess, sys, tempfile, time

DB = os.path.expanduser("~/.n8n/database.sqlite")
BAT = os.path.expanduser("~/.n8n/start-n8n-now.bat")
BASE = "http://localhost:5679"
CURL = "curl"


def env_from_bat():
    out = {}
    if not os.path.exists(BAT):
        return out
    for line in open(BAT, encoding="utf-8", errors="replace"):
        m = re.match(r'^\s*set\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line.strip(), re.I)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def find_workflow(con, wid=None, name=None):
    if wid:
        row = con.execute("SELECT id,name,nodes FROM workflow_entity WHERE id=?", (wid,)).fetchone()
    else:
        row = con.execute("SELECT id,name,nodes FROM workflow_entity WHERE name LIKE ? ORDER BY name LIMIT 1",
                          (f"%{name}%",)).fetchone()
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id")
    ap.add_argument("--name")
    ap.add_argument("--show-log", action="store_true")
    ap.add_argument("--wait", type=int, default=180)
    a = ap.parse_args()

    con = sqlite3.connect(DB, timeout=60)
    con.execute("PRAGMA busy_timeout=60000")
    row = find_workflow(con, a.id, a.name)
    if not row:
        print("ไม่พบ workflow"); return 2
    wid, wname, nodes_json = row
    nodes = json.loads(nodes_json)
    trig = next((n for n in nodes if n["type"] in ("n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.webhook",
                                                   "n8n-nodes-base.manualTrigger", "n8n-nodes-base.errorTrigger")), None)
    if not trig:
        print("workflow นี้ไม่มี trigger"); return 2
    print(f"workflow: {wname}\n  id={wid}\n  trigger={trig['name']} ({trig['type']})")

    tmp = tempfile.mkdtemp(prefix="n8nrun-")
    jar = os.path.join(tmp, "cookies.txt")
    body = os.path.join(tmp, "run.json")
    with open(body, "w", encoding="utf-8") as fh:
        json.dump({"triggerToStartFrom": {"name": trig["name"]}}, fh, ensure_ascii=False)

    env = env_from_bat()
    pw = env.get("N8N_FIRST_PASSWORD") or os.environ.get("N8N_FIRST_PASSWORD") or ""
    email = env.get("N8N_FIRST_EMAIL") or "akaraporn@example.com"
    if not pw:
        print("ไม่พบรหัสผ่านใน start-n8n-now.bat (N8N_FIRST_PASSWORD)"); return 2

    login_payload = json.dumps({"emailOrLdapLoginId": email, "password": pw})
    r = subprocess.run([CURL, "-s", "-c", jar, "-o", os.path.join(tmp, "login.json"), "-w", "%{http_code}",
                        "-X", "POST", f"{BASE}/rest/login", "-H", "Content-Type: application/json",
                        "--data-raw", login_payload], capture_output=True, text=True)
    print("  login HTTP", r.stdout.strip())
    if r.stdout.strip() != "200":
        print("  login ไม่ผ่าน — ตรวจรหัส/อีเมลเจ้าของ n8n"); return 2

    r = subprocess.run([CURL, "-s", "-b", jar, "-X", "POST", f"{BASE}/rest/workflows/{wid}/run",
                        "-H", "Content-Type: application/json", "--data-binary", "@" + body],
                       capture_output=True, text=True)
    try:
        eid = json.loads(r.stdout).get("data", {}).get("executionId")
    except Exception:
        eid = None
    if not eid:
        print("  สั่งรันไม่สำเร็จ:", r.stdout[:300]); return 2
    print(f"  สั่งรันแล้ว executionId={eid} — รอผล…")

    deadline = time.time() + a.wait
    status, finished = "unknown", 0
    while time.time() < deadline:
        row2 = con.execute("SELECT status,finished FROM execution_entity WHERE id=?", (eid,)).fetchone()
        if row2:
            status, finished = row2[0], row2[1]
            if finished:
                break
        time.sleep(3)
    print(f"  ผล: status={status} finished={finished}")

    if a.show_log:
        d = con.execute('SELECT data FROM execution_data WHERE "executionId"=?', (eid,)).fetchone()
        if d:
            txt = d[0]
            for n in nodes:
                c = txt.count('"' + n["name"] + '"')
                if c and n["type"] != "n8n-nodes-base.stickyNote":
                    print(f"    {c:3d} {n['name']}")
            for pat in [r'sent\((\w+)\)', r'email\\?":\\?"([^"\\]{0,40})', r'subject\\?":\\?"([^"\\]{0,90})',
                        r'error\\?":\\?"([^"\\]{0,120})']:
                hits = re.findall(pat, txt)[:4]
                if hits:
                    print("    ", pat[:24], "->", hits)
    return 0 if status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
