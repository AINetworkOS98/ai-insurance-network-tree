#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tax2569_from_workbook.py — สูตรคำนวณภาษีที่ "ดึงออกมา" จากไฟล์ โปรแกรมภาษี2569.xls

ต้นทางของสูตร (ชีตในไฟล์ .xls):
  • PITrate      → อัตราภาษีขั้นบันได ปีภาษี 2569 (8 ขั้น)
  • คำนวณภาษี    → เส้นทางการคำนวณจริง: เงินได้ → หักค่าใช้จ่าย/ลดหย่อน → เงินได้สุทธิ
                   → ภาษีขั้นบันได (แถว 45–52) และการ "ออกภาษีให้ทุกทอด"
                   (gross-up: ภาษีที่บริษัทจ่ายแทนกลายเป็นเงินได้ของกรรมการรอบถัดไป)
  • อัปเดต2569   → เพดานค่าลดหย่อน/ค่าใช้จ่าย ปี 2569 ที่ชีตใช้กำกับ

ใช้:
  python tax2569_from_workbook.py                       # ตรวจกับตัวเลขในไฟล์ (default case)
  python tax2569_from_workbook.py --income 2500000 --premium 500000
  python tax2569_from_workbook.py --income 4000000 --premium 0 --rounds 20 --json
"""
from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List

# ── 1) อัตราภาษีขั้นบันได ปีภาษี 2569 (ชีต PITrate) ────────────────────────────
# ขอบขั้น = ขีดบนของแต่ละช่วง (ความกว้างขั้นละ 150,000 / 200,000 / 250,000 …)
# หมายเหตุ: ชีต PITrate เขียน "ตั้งแต่ 150001 ไม่เกิน 300000" แต่ตัวเลขคงที่ในสูตร (7,500 / 20,000 /
# 37,500 / 50,000 / 250,000 / 900,000) คิดจากความกว้างเต็มขั้น (150,000 × 5% = 7,500) ⇒ ใช้ขอบจริง
# 150,000 / 300,000 / … ไม่ใช่ 150,001 (ไม่งั้นภาษีจะขาดไป 1 บาทต่อขั้น = คลาดเคลื่อนสะสม)
PIT_BRACKETS_2569 = [
    (0,         150_000,   0.00),   # ยกเว้น
    (150_000,   300_000,   0.05),
    (300_000,   500_000,   0.10),
    (500_000,   750_000,   0.15),
    (750_000,   1_000_000, 0.20),
    (1_000_000, 2_000_000, 0.25),
    (2_000_000, 5_000_000, 0.30),   # ปี 2569: 30% กว้างถึง 5 ล้าน (เดิมถึง 4 ล้าน)
    (5_000_000, None,      0.35),
]

# ── 2) เพดานค่าใช้จ่าย/ค่าลดหย่อน ปีภาษี 2569 (ชีต อัปเดต2569) ─────────────────
EXPENSE_RATE_1_2 = 0.50          # เงินได้ 40(1)(2) หัก 50%
EXPENSE_CAP_1_2 = 100_000.0      # ไม่เกิน 100,000 (เดิม 60,000)

CAPS_2569 = {
    "self": 60_000.0,             # ลดหย่อนส่วนตัว
    "spouse": 60_000.0,           # คู่สมรสไม่มีเงินได้
    "child": 30_000.0,            # บุตรคนละ (คนที่ 2+ เกิดตั้งแต่ 2561 = 60,000)
    "child_born_2561": 60_000.0,
    "parents": 30_000.0,          # บิดามารดา คนละ
    "disabled": 60_000.0,         # คนพิการ/ทุพพลภาพ คนละ
    "life_health_self": 100_000.0,  # ประกันชีวิต + สุขภาพตนเอง (รวมกัน)
    "health_self_cap": 25_000.0,  # ส่วนสุขภาพภายใน 100,000 ข้างต้น
    "health_parents": 15_000.0,   # ประกันสุขภาพบิดามารดา คนละ
    "pension_insurance": 200_000.0,  # ประกันชีวิตแบบบำนาญ (และไม่เกิน 15% ของเงินได้)
    "pension_insurance_rate": 0.15,
    "pvd": 500_000.0,             # กองทุนสำรองเลี้ยงชีพ/กบข. (ตามจ่ายจริง)
    "rmf_ssf": 500_000.0,         # RMF/SSF 30% ของเงินได้
    "rmf_ssf_rate": 0.30,
    "thai_esg": 300_000.0,        # Thai ESG 30% ของเงินได้
    "thai_esg_rate": 0.30,
    "sso": 10_500.0,              # ประกันสังคม ม.33 ปี 2569 (875/เดือน × 12)
    "nsf": 30_000.0,              # กอช.
    "home_interest": 100_000.0,   # ดอกเบี้ยเงินกู้ที่อยู่อาศัย
    "solar_rooftop": 200_000.0,   # ค่าติดตั้ง Solar Rooftop (มาตรการ 2569)
    "retirement_group": 500_000.0,  # กลุ่มเกษียณรวม (บำนาญ + PVD + RMF/SSF)
    "donation_general": 0.10,     # บริจาคทั่วไป ไม่เกิน 10% ของเงินได้สุทธิ
    "donation_education": 0.10,   # บริจาคการศึกษา (นับ 2 เท่า) ไม่เกิน 10%
}

# ── 3) ภาษีขั้นบันได (ตรงกับแถว 45–52 ของชีต คำนวณภาษี) ────────────────────────


def progressive_tax(net_income: float) -> Dict[str, Any]:
    """ภาษีเงินได้บุคคลธรรมดาจากเงินได้สุทธิ (ขั้นบันได 2569) + รายละเอียดแต่ละขั้น"""
    if net_income <= 0:
        return {"tax": 0.0, "net_income": round(net_income, 2), "steps": []}

    tax = 0.0
    steps: List[Dict[str, float]] = []
    for lo, hi, rate in PIT_BRACKETS_2569:
        if net_income <= lo:
            break
        upper = net_income if hi is None else min(net_income, hi)
        amount = max(0.0, upper - lo)
        if amount <= 0:
            continue
        part = amount * rate
        tax += part
        steps.append({"from": lo, "to": upper, "rate": rate, "amount": round(amount, 2), "tax": round(part, 2)})
    return {"tax": round(tax, 2), "net_income": round(net_income, 2), "steps": steps}


# ── 4) ค่าใช้จ่าย + ค่าลดหย่อน (พร้อมเพดาน) ───────────────────────────────────


def expense_deduction(assessable_1_2: float) -> float:
    """ค่าใช้จ่ายเงินได้ 40(1)(2): 50% ไม่เกิน 100,000 (ชีต คำนวณภาษี แถว 7)"""
    return round(min(assessable_1_2 * EXPENSE_RATE_1_2, EXPENSE_CAP_1_2), 2)


def allowance_deduction(items: Dict[str, float], assessable: float) -> Dict[str, Any]:
    """รวมค่าลดหย่อนตามเพดาน ปี 2569 — คืนยอดรวม + รายการที่ถูกตัดเพดาน"""
    c = CAPS_2569
    out: Dict[str, float] = {}
    capped: List[str] = []

    def put(key: str, value: float, cap: float) -> None:
        v = max(0.0, float(value or 0))
        if v > cap:
            capped.append(f"{key}: {v:,.0f} → {cap:,.0f}")
            v = cap
        out[key] = round(v, 2)

    put("self", items.get("self", c["self"]), c["self"])
    put("spouse", items.get("spouse", 0), c["spouse"])
    put("child", items.get("child", 0), 10_000_000)          # ผู้เรียกส่งยอดรวมบุตรมาแล้ว
    put("parents", items.get("parents", 0), 10_000_000)
    put("disabled", items.get("disabled", 0), 10_000_000)

    # ประกันชีวิต+สุขภาพตนเอง: เพดานรวม 100,000 (สุขภาพภายใน 25,000)
    life = max(0.0, float(items.get("life_insurance", 0) or 0))
    health = max(0.0, float(items.get("health_insurance", 0) or 0))
    health_used = min(health, c["health_self_cap"])
    put("life_health_self", life + health_used, c["life_health_self"])

    put("health_parents", items.get("health_parents", 0), 10_000_000)  # ผู้เรียกคูณจำนวนคนมาแล้ว

    # กลุ่มเกษียณ: บำนาญ (≤15% ของเงินได้ และ ≤200,000) + PVD + RMF/SSF รวมไม่เกิน 500,000
    pension_ins_cap = min(c["pension_insurance"], assessable * c["pension_insurance_rate"])
    put("pension_insurance", items.get("pension_insurance", 0), pension_ins_cap)
    put("pvd", items.get("pvd", 0), c["pvd"])
    put("rmf_ssf", items.get("rmf_ssf", 0), min(c["rmf_ssf"], assessable * c["rmf_ssf_rate"]))
    group = out["pension_insurance"] + out["pvd"] + out["rmf_ssf"]
    if group > c["retirement_group"]:
        excess = group - c["retirement_group"]
        capped.append(f"กลุ่มเกษียณรวม: {group:,.0f} → {c['retirement_group']:,.0f} (ตัด {excess:,.0f})")
        # ตัดจาก RMF/SSF ก่อน (like the sheet's ordering), แล้วค่อย PVD, แล้วบำนาญ
        for k in ("rmf_ssf", "pvd", "pension_insurance"):
            take = min(out[k], excess)
            out[k] = round(out[k] - take, 2)
            excess -= take
            if excess <= 0:
                break

    put("thai_esg", items.get("thai_esg", 0), min(c["thai_esg"], assessable * c["thai_esg_rate"]))
    put("sso", items.get("sso", 0), c["sso"])
    put("nsf", items.get("nsf", 0), c["nsf"])
    put("home_interest", items.get("home_interest", 0), c["home_interest"])
    put("solar_rooftop", items.get("solar_rooftop", 0), c["solar_rooftop"])
    put("other", items.get("other", 0), 10_000_000)

    total = round(sum(out.values()), 2)
    return {"total": total, "items": out, "capped": capped}


def donation_deduction(net_before_donation: float, donate_general: float, donate_education: float,
                       donate_sport: float = 0.0) -> Dict[str, Any]:
    """เงินบริจาค: การศึกษา 2 เท่า ≤10% · กีฬา 1.5 เท่า · ทั่วไป ≤10% (ต้องผ่าน e-Donation)"""
    base = max(0.0, net_before_donation)
    edu = min(max(0.0, donate_education) * 2, base * CAPS_2569["donation_education"])
    sport = min(max(0.0, donate_sport) * 1.5, base * 0.10)
    gen = min(max(0.0, donate_general), base * CAPS_2569["donation_general"])
    return {"total": round(edu + sport + gen, 2),
            "items": {"education_x2": round(edu, 2), "sport_x1_5": round(sport, 2), "general": round(gen, 2)}}


# ── 5) ตัวคำนวณหลัก: PIT ปกติ ──────────────────────────────────────────────────


def compute_pit(assessable: float, allowances: Dict[str, float] | None = None,
                expense_override: float | None = None) -> Dict[str, Any]:
    allowances = allowances or {}
    expense = expense_override if expense_override is not None else expense_deduction(assessable)
    allow = allowance_deduction(allowances, assessable)
    net_before_donation = max(0.0, assessable - expense - allow["total"])
    don = donation_deduction(net_before_donation, allowances.get("donate_general", 0),
                             allowances.get("donate_education", 0), allowances.get("donate_sport", 0))
    net = max(0.0, net_before_donation - don["total"])
    res = progressive_tax(net)
    return {
        "assessable": round(assessable, 2),
        "expense": round(expense, 2),
        "allowances": allow,
        "donations": don,
        "net_income": round(net, 2),
        "tax": res["tax"],
        "steps": res["steps"],
    }


# ── 6) "ออกภาษีให้ทุกทอด" (gross-up) — หัวใจของชีต คำนวณภาษี ──────────────────
def gross_up_company_pays(assessable: float, premium: float = 0.0,
                          allowances: Dict[str, float] | None = None,
                          rounds: int = 16) -> Dict[str, Any]:
    """
    จำลองชีต คำนวณภาษี: บริษัทจ่ายเบี้ยประกัน + ภาษีแทนกรรมการ
      • เงินได้รวมรอบ n = เงินได้พึงประเมิน + เบี้ยประกัน + ภาษีที่จ่ายแทนรอบก่อน
      • เงินได้สุทธิ      = เงินได้รวม − ค่าใช้จ่าย − ค่าลดหย่อน
      • ภาษีรอบ n        = ภาษีขั้นบันไดของเงินได้สุทธินั้น
      • รอบแรกใช้ภาษี "ยังไม่รวมเบี้ยประกัน" เป็นตัวตั้ง (คอลัมน์ C ของชีต)
    วนซ้ำจนกว่าภาษีจะนิ่ง (ผลต่าง < 1 สตางค์) หรือครบจำนวนรอบ
    """
    allowances = allowances or {}

    base = compute_pit(assessable, allowances)          # คอลัมน์ C: PIT กรรมการ (ยังไม่รวมเบี้ย)
    tax_prev = base["tax"]
    rows: List[Dict[str, float]] = []
    total_income = assessable + premium + tax_prev
    for n in range(1, rounds + 1):
        net = max(0.0, total_income - base["expense"] - base["allowances"]["total"])
        tax = progressive_tax(net)["tax"]
        increase = round(tax - tax_prev, 2)
        rows.append({"round": n, "total_income": round(total_income, 2), "net_income": round(net, 2),
                     "tax": tax, "increase": increase})
        if abs(tax - tax_prev) < 0.005:
            tax_prev = tax
            break
        tax_prev = tax
        total_income = assessable + premium + tax_prev

    final_net = rows[-1]["net_income"]
    return {
        "assessable": round(assessable, 2),
        "premium": round(premium, 2),
        "expense": base["expense"],
        "allowance_total": base["allowances"]["total"],
        "pit_without_premium": base["tax"],          # C29
        "withholding_tax_one_shot": rows[0]["increase"] if rows else 0.0,  # D30: ภาษีหัก ณ ที่จ่ายครั้งเดียว
        "grossed_up_tax": rows[-1]["tax"],           # S5 / S29: ภาษีเมื่อออกให้ทุกทอด
        "final_total_income": rows[-1]["total_income"],
        "final_net_income": final_net,
        "rounds_used": len(rows),
        "rounds": rows,
    }


# ── 7) ตรวจกับค่าที่ผิวไฟล์ .xls เก็บไว้ (ชีต คำนวณภาษี แถว 3,5,6,24,28,29,30,52) ─
WORKBOOK_CHECK = {
    "assessable": 2_500_000.0,
    "premium": 500_000.0,
    "expense": 100_000.0,
    "allowance_total": 60_000.0,
    "columns": {  # คอลัมน์: (เงินได้รวม, เงินได้สุทธิ, ภาษี)
        "C": (2_500_000.0, 2_340_000.0, 467_000.0),
        "D": (3_467_000.0, 3_307_000.0, 757_100.0),
        "E": (3_757_100.0, 3_597_100.0, 844_130.0),
        "F": (3_844_130.0, 3_684_130.0, 870_239.0),
        "G": (3_870_239.0, 3_710_239.0, 878_071.7),
        "H": (3_878_071.7, 3_718_071.7, 880_421.51),
        "I": (3_880_421.51, 3_720_421.51, 881_126.453),
        "J": (3_881_126.453, 3_721_126.453, 881_337.9359),
        "K": (3_881_337.9359, 3_721_337.9359, 881_401.38077),
        "L": (3_881_401.38077, 3_721_401.38077, 881_420.41423),
        "M": (3_881_420.41423, 3_721_420.41423, 881_426.12427),
        "N": (3_881_426.12427, 3_721_426.12427, 881_427.83728),
        "O": (3_881_427.83728, 3_721_427.83728, 881_428.35118),
        "P": (3_881_428.35118, 3_721_428.35118, 881_428.50536),
        "Q": (3_881_428.50536, 3_721_428.50536, 881_428.55161),
        "R": (3_881_428.55161, 3_721_428.55161, 881_428.56548),
        "S": (3_881_428.56548, 3_721_428.56548, 881_428.56964),
    },
}


def selftest() -> int:
    c = WORKBOOK_CHECK
    give = {"self": c["allowance_total"]}
    res = gross_up_company_pays(c["assessable"], c["premium"], give, rounds=17)
    print(f"อัตราภาษี 2569 · เงินได้ {c['assessable']:,.0f} · เบี้ยประกัน {c['premium']:,.0f} · "
          f"ลดหย่อน {c['allowance_total']:,.0f}")
    print(f"{'รอบ':>3} {'เงินได้รวม':>14} {'เงินได้สุทธิ':>14} {'ภาษี':>14} {'เพิ่มขึ้น':>12}")
    for r in res["rounds"]:
        print(f"{r['round']:>3} {r['total_income']:>14,.2f} {r['net_income']:>14,.2f} "
              f"{r['tax']:>14,.2f} {r['increase']:>12,.2f}")

    # เทียบทีละคอลัมน์กับค่าที่บันทึกใน .xls
    fails = 0
    print("\nเทียบกับค่าที่ไฟล์ .xls เก็บไว้ (แถว 6 / 24 / 29):")
    names = list(c["columns"].keys())
    wb = c["columns"]
    mine = [("C", c["assessable"], c["assessable"] - c["expense"] - c["allowance_total"],
             res["pit_without_premium"])]
    for i, r in enumerate(res["rounds"][:16]):
        mine.append((names[i + 1], r["total_income"], r["net_income"], r["tax"]))
    for col, inc, net, tax in mine:
        w = wb[col]
        d1, d2, d3 = abs(inc - w[0]), abs(net - w[1]), abs(tax - w[2])
        ok = d1 < 0.02 and d2 < 0.02 and d3 < 0.02
        if not ok:
            fails += 1
            print(f"  ✗ {col}: เงินได้รวม {inc:,.2f} (ไฟล์ {w[0]:,.2f}) · สุทธิ {net:,.2f} (ไฟล์ {w[1]:,.2f}) "
                  f"· ภาษี {tax:,.2f} (ไฟล์ {w[2]:,.2f})")
    print(f"  {'✓ ตรงทุกคอลัมน์' if not fails else f'✗ ไม่ตรง {fails} คอลัมน์'} (17 คอลัมน์ C–S)")

    print(f"\nภาษีเมื่อบริษัทออกให้ทุกทอด (ลู่เข้า) = {res['grossed_up_tax']:,.2f} บาท")
    print(f"ภาษีหัก ณ ที่จ่ายครั้งเดียว (รอบแรก)   = {res['withholding_tax_one_shot']:,.2f} บาท")
    print(f"เงินได้รวมสุดท้ายที่กรรมการได้รับ     = {res['final_total_income']:,.2f} บาท")
    return 0 if fails == 0 else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="คำนวณภาษี 2569 ตามสูตรที่ดึงจาก โปรแกรมภาษี2569.xls")
    ap.add_argument("--income", type=float, help="เงินได้พึงประเมิน 40(1)(2)")
    ap.add_argument("--premium", type=float, default=0.0, help="เบี้ยประกันที่บริษัทจ่ายแทน")
    ap.add_argument("--self", dest="self_allow", type=float, default=60_000.0, help="ลดหย่อนส่วนตัว (ค่าเริ่มต้น 60,000)")
    ap.add_argument("--spouse", type=float, default=0.0)
    ap.add_argument("--child", type=float, default=0.0, help="ยอดรวมลดหย่อนบุตร")
    ap.add_argument("--parents", type=float, default=0.0)
    ap.add_argument("--life-insurance", type=float, default=0.0)
    ap.add_argument("--health-insurance", type=float, default=0.0)
    ap.add_argument("--pension-insurance", type=float, default=0.0)
    ap.add_argument("--pvd", type=float, default=0.0)
    ap.add_argument("--rmf", type=float, default=0.0)
    ap.add_argument("--thai-esg", type=float, default=0.0)
    ap.add_argument("--sso", type=float, default=0.0)
    ap.add_argument("--nsf", type=float, default=0.0)
    ap.add_argument("--home-interest", type=float, default=0.0)
    ap.add_argument("--solar", type=float, default=0.0)
    ap.add_argument("--rounds", type=int, default=16, help="จำนวนรอบสูงสุดของการออกภาษีให้ทุกทอด")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true", help="ตรวจสูตรกับตัวเลขในไฟล์ .xls")
    a = ap.parse_args(argv)

    if a.selftest or a.income is None:
        return selftest()

    extra = {
        "self": a.self_allow, "spouse": a.spouse, "child": a.child, "parents": a.parents,
        "life_insurance": a.life_insurance, "health_insurance": a.health_insurance,
        "pension_insurance": a.pension_insurance, "pvd": a.pvd, "rmf_ssf": a.rmf,
        "thai_esg": a.thai_esg, "sso": a.sso, "nsf": a.nsf,
        "home_interest": a.home_interest, "solar_rooftop": a.solar,
    }
    out = {"pit": compute_pit(a.income, extra),
           "gross_up": gross_up_company_pays(a.income, a.premium, extra, rounds=a.rounds)}
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    else:
        p = out["pit"]
        g = out["gross_up"]
        print(f"เงินได้พึงประเมิน          {p['assessable']:>15,.2f}")
        print(f"หักค่าใช้จ่าย             {p['expense']:>15,.2f}")
        print(f"หักค่าลดหย่อน             {p['allowances']['total']:>15,.2f}")
        print(f"เงินได้สุทธิ               {p['net_income']:>15,.2f}")
        print(f"ภาษีที่ต้องชำระ (ไม่มีเบี้ยประกัน) {p['tax']:>8,.2f}")
        if a.premium:
            print(f"\nเมื่อบริษัทจ่ายเบี้ยประกันแทน {a.premium:,.2f} บาท:")
            print(f"  ภาษีขั้นแรก (หัก ณ ที่จ่ายครั้งเดียว) {g['withholding_tax_one_shot']:>12,.2f}")
            print(f"  ภาษีเมื่อออกให้ทุกทอด (ลู่เข้า)        {g['grossed_up_tax']:>12,.2f}")
            print(f"  เงินได้รวมที่กรรมการได้รับ             {g['final_total_income']:>12,.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
