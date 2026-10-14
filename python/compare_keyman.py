#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""เทียบผลประกันคีย์แมน ระหว่างเว็บ (API) กับโปรแกรม Python — ทุกค่าจากไฟล์ชุดทดสอบ"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://ai-insurance-network-tree.vercel.app"
PY = Path(r"C:\Users\User\ai-insurance-network-tree\python")
cases = json.loads((PY / "testcases_keyman.json").read_text(encoding="utf-8"))["cases"]

FIELDS = ["profit_need", "replacement_need", "obligation_need", "recommended_cover", "cover_per_premium",
          "cit_before", "cit_after", "cit_saving", "pit_before", "pit_after", "exec_tax_increase",
          "net_cost", "net_cost_per_cover", "cover_method", "result",
          "gu_tax_borne", "gu_total_outlay", "gu_cit_saving", "gu_net_cost", "gu_rounds", "gu_converged",
          "gu_marginal_rate", "gu_employee_declared_income", "gu_employee_gets"]
BOOLS = ["deductible", "benefit_to_executive"]

checks, fails = 0, []


def cmp(label, a, b, tol=0.51):
    global checks
    checks += 1
    try:
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            if abs(float(a) - float(b)) > tol:
                fails.append(f"{label}: python={a} · เว็บ={b}")
        elif str(a) != str(b):
            fails.append(f"{label}: python={a} · เว็บ={b}")
    except Exception as e:
        fails.append(f"{label}: เทียบไม่ได้ ({e})")


for c in cases:
    payload = json.dumps({"input": c["input"]}).encode()
    req = urllib.request.Request(f"{BASE}/api/tax/keyman", data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        web = json.loads(resp.read().decode())

    out = subprocess.run([sys.executable, "-c",
                          "import json,sys;sys.path.insert(0,r'%s');import keyman_insurance as k;"
                          "print(json.dumps(k.compute_keyman(json.loads(sys.argv[1]))))" % PY, json.dumps(c["input"])],
                         capture_output=True, text=True, encoding="utf-8")
    py = json.loads(out.stdout)

    for f in FIELDS:
        cmp(f"[{c['name'][:28]}] {f}", py[f], web[f])
    for b in BOOLS:
        cmp(f"[{c['name'][:28]}] {b}", str(py[b]), str(web[b]))

print(f"เทียบทั้งหมด {checks} ค่า ({len(cases)} กรณี × {len(FIELDS) + len(BOOLS)} ฟิลด์)")
if fails:
    print(f"✗ ไม่ตรง {len(fails)} รายการ")
    for f in fails:
        print("   -", f)
    raise SystemExit(1)
print("✓ ตรงกันทุกค่า — โปรแกรม Python กับเว็บให้ผลเหมือนกัน (ใช้เอนจินภาษีชุดเดียวกัน)")
