#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tax_examples_by_occupation.py — ตัวอย่างการยื่นภาษีตามอาชีพ (ประมาณการรายได้)
                                + เปรียบเทียบการลดหย่อนด้วยเบี้ยประกันชีวิต
--------------------------------------------------------------------------------
ใช้เอนจินตัวเดียวกับ thai_tax_calculator.py (ไม่มีการพิมพ์ตัวเลขค้างไว้)
ตัวเลขทั้งหมดจึงตรงกับโปรแกรมคำนวณบนเว็บ /prospects (แท็บ “คำนวณภาษี”) และแบบ ภ.ง.ด.90

วิธีใช้:
    python tax_examples_by_occupation.py            # พิมพ์ตารางทั้งหมด
    python tax_examples_by_occupation.py --json     # ออก JSON (ใช้เทียบกับเว็บ/ทดสอบ)
    python tax_examples_by_occupation.py --only 2ก  # พิมพ์เฉพาะหัวข้อที่ระบุ

อ้างอิง: ใบแนบลดหย่อน ข้อ 7.1–7.3 · คำชี้แจงการกรอก ภ.ง.ด.90 ข้อ 7.6/7.7 ·
        ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 301) — เบี้ยประกันชีวิต+สุขภาพรวมไม่เกิน 100,000
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from thai_tax_calculator import LIM, Person, compute_pit  # type: ignore

DEFAULT_YEAR = 2568
LIFE = LIM["life_insurance"]            # 100,000 (ข้อ 7.1)
HEALTH = LIM["health_insurance"]        # 25,000 (ข้อ 7.2)
COMBINED = LIM.get("life_health_combined", 100_000)
PENSION = LIM["pension_life"]           # 200,000 (ข้อ 7.3)
CHILD = LIM["child"]


def it(category: str, amount: float, variant: str = "", description: str = "") -> Dict[str, Any]:
    """รายการเงินได้รายแหล่ง (รูปแบบเดียวกับไฟล์ชุดทดสอบ)"""
    return {"category": category, "amount": amount, "variant": variant,
            "description": description, "expense_mode": "standard"}


def run(items: List[Dict[str, Any]], **extra: Any) -> Dict[str, Any]:
    p = Person(income_items=items, personal=True, **extra)
    return compute_pit([p], DEFAULT_YEAR)


# ───────────────────────────── 1) อาชีพ ─────────────────────────────
# รายการอาชีพใช้ไฟล์ร่วมกับเว็บ (src/components/tax/TaxExamplesByOccupation.tsx)
_OCC_FILE = Path(__file__).with_name("occupations_examples.json")
_OCC_DATA = json.loads(_OCC_FILE.read_text(encoding="utf-8"))
OCCUPATIONS: List[Dict[str, Any]] = [
    {"id": o["id"], "job": o["job"], "form": o["income_label"], "assume": o["assume"],
     "items": [dict(it) for it in o["items"]], "extra": dict(o["extra"])}
    for o in _OCC_DATA["occupations"]
]

LEVELS = [300_000, 480_000, 600_000, 1_000_000, 2_000_000, 5_000_000]
PREMIUMS = [0, 12_000, 30_000, 60_000, 100_000, 150_000, 200_000]

MIXED: List[Dict[str, Any]] = [
    {"label": "ไม่ซื้อประกันเลย", "extra": {}, "note": "ฐานเปรียบเทียบ"},
    {"label": f"ประกันชีวิต {LIFE:,.0f}", "extra": {"life_insurance": LIFE}, "note": "ใช้สิทธิได้เต็มเพดานข้อ 7.1"},
    {"label": f"ประกันสุขภาพ {HEALTH:,.0f} อย่างเดียว", "extra": {"health_insurance": HEALTH}, "note": "ไม่เกินเพดานข้อ 7.2"},
    {"label": f"ชีวิต 60,000 + สุขภาพ {HEALTH:,.0f}", "extra": {"life_insurance": 60_000, "health_insurance": HEALTH},
     "note": "รวม 85,000 — ยังไม่ชนเพดานรวม"},
    {"label": f"ชีวิต {LIFE:,.0f} + สุขภาพ {HEALTH:,.0f}", "extra": {"life_insurance": LIFE, "health_insurance": HEALTH},
     "note": f"จ่ายรวม 125,000 แต่ใช้สิทธิได้แค่ {COMBINED:,.0f}"},
    {"label": "ชีวิตแบบบำนาญ 150,000", "extra": {"pension_life_insurance": 150_000},
     "note": "15% ของเงินได้ ไม่เกิน 200,000 · นับในวงเงินเกษียณ 500,000"},
]


def build() -> Dict[str, Any]:
    """คำนวณทุกตาราง (เรียกเอนจินจริง) แล้วคืนโครงสร้างข้อมูล"""
    # 1) อาชีพ
    occ: List[Dict[str, Any]] = []
    for o in OCCUPATIONS:
        r = run(o["items"], **o["extra"])
        gross = r["gross_total"]
        cats = {i["category"] for i in o["items"]}
        form_doc = "ภ.ง.ด.91" if (len(cats) == 1 and cats == {"salary"}) else "ภ.ง.ด.90"
        occ.append({
            "id": o["id"], "job": o["job"], "income_type": o["form"], "assume": o["assume"],
            "gross": gross, "expenses": r["expenses_total"], "allowances": r["allowances_total"],
            "net_income": r["net_income"], "tax": r["tax_before_credit"],
            "effective_rate": round(r["tax_before_credit"] / gross, 6) if gross else 0.0,
            "marginal_rate": r["marginal_rate"], "form_doc": form_doc,
            "must_file": r["must_file"], "file_threshold": r["file_threshold"],
        })

    # 2ก) ระดับเงินได้
    table_a: List[Dict[str, Any]] = []
    for income in LEVELS:
        base = {"social_security": 9_000}
        no_ins = run([it("salary", income, "", "เงินเดือน")], **base)
        with_ins = run([it("salary", income, "", "เงินเดือน")], **base, life_insurance=LIFE)
        table_a.append({
            "income": income,
            "tax_no_insurance": no_ins["tax_before_credit"],
            "tax_with_insurance": with_ins["tax_before_credit"],
            "saved": round(no_ins["tax_before_credit"] - with_ins["tax_before_credit"], 2),
            "marginal_rate": no_ins["marginal_rate"],
        })

    # 2ข) ขนาดเบี้ยที่จ่าย (เงินได้ 1,000,000)
    base = {"social_security": 9_000}
    no_ins = run([it("salary", 1_000_000, "", "เงินเดือน")], **base)
    table_b: List[Dict[str, Any]] = []
    for premium in PREMIUMS:
        r = run([it("salary", 1_000_000, "", "เงินเดือน")], **base, life_insurance=premium)
        item71 = next((a["amount"] for a in r["allowance_items"] if a.get("item") == "7.1"), 0.0)
        saved = round(no_ins["tax_before_credit"] - r["tax_before_credit"], 2)
        table_b.append({
            "premium": premium, "used_item_7_1": round(item71, 2),
            "wasted": round(max(0.0, premium - item71), 2),
            "tax": r["tax_before_credit"], "saved": saved,
            "effective_rate": round(saved / premium, 6) if premium else 0.0,
        })

    # 2ค) กรณีเข้าใจผิดบ่อย (เงินได้ 1,000,000)
    table_c: List[Dict[str, Any]] = []
    for m in MIXED:
        r = run([it("salary", 1_000_000, "", "เงินเดือน")], **base, **m["extra"])
        paid = sum(float(m["extra"].get(k, 0)) for k in
                   ("life_insurance", "health_insurance", "pension_life_insurance"))
        used = sum(a["amount"] for a in r["allowance_items"] if a.get("item") in ("7.1", "7.2", "7.3"))
        table_c.append({
            "label": m["label"], "note": m["note"], "premium_paid": round(paid, 2),
            "allowed": round(used, 2), "tax": r["tax_before_credit"],
            "saved": round(no_ins["tax_before_credit"] - r["tax_before_credit"], 2),
        })

    # 1ข) เปรียบเทียบรายได้–ภาษี เฉพาะอาชีพที่ต้องยื่นแบบ
    filing = [o for o in occ if o["must_file"]]
    by_tax = sorted(filing, key=lambda o: -o["tax"])
    gross_sum = sum(o["gross"] for o in filing)
    tax_sum = sum(o["tax"] for o in filing)
    grouped: Dict[float, List[Dict[str, Any]]] = {}
    for o in filing:
        grouped.setdefault(float(o["gross"]), []).append(o)
    same_income: List[Dict[str, Any]] = []
    for income, rows in grouped.items():
        if len(rows) < 2:
            continue
        s = sorted(rows, key=lambda o: -o["tax"])
        same_income.append({
            "income": income,
            "rows": [{"job": r["job"], "income_type": r["income_type"], "tax": r["tax"],
                      "effective_rate": r["effective_rate"], "expenses": r["expenses"]} for r in s],
            "gap": round(s[0]["tax"] - s[-1]["tax"], 2),
            "rate_gap": round(s[0]["effective_rate"] - s[-1]["effective_rate"], 6),
        })
    same_income.sort(key=lambda g: -g["gap"])
    same_income = [g for g in same_income if g["gap"] > 0]   # รายได้เท่ากัน+ภาษีเท่ากัน ไม่ต้องแสดง
    income_compare = {
        "filing_count": len(filing),
        "pay_tax": sum(1 for o in filing if o["tax"] > 0),
        "zero_tax": sum(1 for o in filing if o["tax"] <= 0),
        "gross_sum": gross_sum, "tax_sum": round(tax_sum, 2),
        "avg_rate": round(tax_sum / gross_sum, 6) if gross_sum else 0.0,
        "max_gross": max((o["gross"] for o in filing), default=0),
        "max_tax": max((o["tax"] for o in filing), default=0),
        "by_tax": [{"job": o["job"], "gross": o["gross"], "tax": o["tax"],
                    "effective_rate": o["effective_rate"]} for o in by_tax],
        "same_income": same_income,
    }

    # 3) หลักประกันลดหย่อนภาษี: สะสมทรัพย์ (7.1) / บำนาญ (7.3) / สุขภาพ (7.2)
    ins_levels = [300_000, 480_000, 600_000, 1_000_000, 2_000_000, 5_000_000]

    def ins_matrix(kind: str, premium: float, also_life: float = 0.0) -> List[Dict[str, Any]]:
        item = {"savings": "7.1", "pension": "7.3", "health": "7.2"}[kind]
        rows: List[Dict[str, Any]] = []
        for inc in ins_levels:
            pay = [it("salary", inc, "", "เงินได้พึงประเมิน")]
            if kind == "pension":
                w = run(pay, social_security=9000, pension_life_insurance=premium, life_insurance=also_life)
                b = run(pay, social_security=9000, life_insurance=also_life) if also_life else run(pay, social_security=9000)
            elif kind == "health":
                w = run(pay, social_security=9000, health_insurance=premium, life_insurance=also_life)
                b = run(pay, social_security=9000, life_insurance=also_life) if also_life else run(pay, social_security=9000)
            else:
                w = run(pay, social_security=9000, life_insurance=premium)
                b = run(pay, social_security=9000)
            allowed = next((a["amount"] for a in w["allowance_items"] if a.get("item") == item), 0.0)
            rows.append({
                "income": inc, "premium": premium, "allowed": round(allowed, 2),
                "tax_before": b["tax_before_credit"], "tax_after": w["tax_before_credit"],
                "saved": round(max(0.0, b["tax_before_credit"] - w["tax_before_credit"]), 2),
                "marginal_rate": b["marginal_rate"], "net_income": w["net_income"],
            })
        return rows

    insurance_tools = {
        "limits": {"life_insurance": LIFE, "health_insurance": HEALTH, "life_health_combined": COMBINED,
                   "pension_life": PENSION, "retirement_cap": LIM["retirement_cap"]},
        "levels": ins_levels,
        "savings": ins_matrix("savings", LIFE),
        "pension": ins_matrix("pension", 150_000),
        "health": ins_matrix("health", HEALTH),
    }

    return {
        "year": DEFAULT_YEAR, "program": "tax_examples_by_occupation.py",
        "limits": {"life_insurance": LIFE, "health_insurance": HEALTH,
                   "life_health_combined": COMBINED, "pension_life": PENSION,
                   "child": CHILD, "retirement_cap": LIM["retirement_cap"]},
        "occupations": occ, "income_compare": income_compare, "insurance_tools": insurance_tools,
        "table_a_income_levels": table_a,
        "table_b_premium_sizes": table_b, "table_c_common_mistakes": table_c,
    }


# ───────────────────────────── แสดงผล ─────────────────────────────
def _line(ch: str = "─", n: int = 118) -> str:
    return ch * n


def print_occupations(d: Dict[str, Any]) -> None:
    print(_line("="))
    print(f" 1) ประมาณการภาษีตามอาชีพ · ปีภาษี {d['year']} · {len(d['occupations'])} อาชีพ")
    print("    (ค่าใช้จ่ายแบบเหมาตามกฎหมาย · สมมติโสด ไม่มีบุตร · ตัวเลขจากเอนจินเดียวกับเว็บ)")
    print(_line("="))
    print(f" {'อาชีพ':<32}{'ประเภท':<12}{'รายได้/ปี':>12}{'หักค่าใช้จ่าย':>14}"
          f"{'ลดหย่อน':>12}{'เงินได้สุทธิ':>14}{'ภาษี':>12}{'เฉลี่ย':>9}  {'แบบ'}")
    print(_line("-"))
    for o in d["occupations"]:
        print(f" {o['job'][:31]:<32}{o['income_type']:<12}{o['gross']:>12,.0f}{o['expenses']:>14,.0f}"
              f"{o['allowances']:>12,.0f}{o['net_income']:>14,.0f}{o['tax']:>12,.0f}"
              f"{o['effective_rate'] * 100:>8.2f}%  {o['form_doc']}"
              f"{'' if o['must_file'] else ' (ไม่ถึงเกณฑ์)'}")
    print(_line("-"))
    print(f" รวมภาษีทั้ง {len(d['occupations'])} ตัวอย่าง: {sum(o['tax'] for o in d['occupations']):,.0f} บาท")
    print()


def print_table_a(d: Dict[str, Any]) -> None:
    L = d["limits"]
    print(_line("="))
    print(f" 2ก) ประหยัดภาษีจากเบี้ยประกันชีวิต {L['life_insurance']:,.0f} บาท (เต็มเพดานข้อ 7.1) — ตามระดับเงินได้")
    print(_line("="))
    print(f" {'เงินได้/ปี (40(1))':>18}{'ภาษีก่อนใช้สิทธิ':>18}{'ลดหย่อนที่ได้จริง':>18}"
          f"{'ภาษีหลังใช้สิทธิ':>18}{'ประหยัดภาษี':>14}{'% ของเบี้ย':>12}{'ขั้นภาษี':>10}")
    print(_line("-"))
    for x in d["table_a_income_levels"]:
        eff = x["saved"] / L["life_insurance"] * 100
        print(f" {x['income']:>18,.0f}{x['tax_no_insurance']:>18,.0f}{L['life_insurance']:>18,.0f}"
              f"{x['tax_with_insurance']:>18,.0f}{x['saved']:>14,.0f}{eff:>11.2f}%"
              f"{x['marginal_rate'] * 100:>9.0f}%")
    print(_line("-"))
    print(" หมายเหตุ: เงินได้ 300,000 บาท เงินได้สุทธิยังไม่ถึงเกณฑ์เสียภาษี → ไม่มีภาษีให้ประหยัด")
    print()


def print_table_b(d: Dict[str, Any]) -> None:
    print(_line("="))
    print(" 2ข) จ่ายเบี้ยเกินเพดาน = ใช้สิทธิไม่ได้เพิ่ม (เงินได้ 1,000,000 บาท)")
    print(_line("="))
    print(f" {'เบี้ยที่จ่ายจริง':>16}{'ลดหย่อนได้จริง':>16}{'ใช้สิทธิไม่ได้':>16}"
          f"{'ภาษีต้องชำระ':>16}{'ประหยัด':>12}{'ผลตอบแทนต่อเบี้ย':>18}")
    print(_line("-"))
    for x in d["table_b_premium_sizes"]:
        eff = f"{x['effective_rate'] * 100:.2f}%" if x["premium"] else "—"
        waste = f"{x['wasted']:,.0f}" if x["wasted"] > 0 else "—"
        print(f" {x['premium']:>16,.0f}{x['used_item_7_1']:>16,.0f}{waste:>16}"
              f"{x['tax']:>16,.0f}{x['saved']:>12,.0f}{eff:>18}")
    print(_line("-"))
    print(f" จ่าย 200,000 ใช้สิทธิได้แค่ {d['limits']['life_insurance']:,.0f} — ส่วนเกินไม่ได้ลดหย่อนและไม่ได้รับคืน")
    print()


def print_table_c(d: Dict[str, Any]) -> None:
    L = d["limits"]
    print(_line("="))
    print(" 2ค) ประกันชีวิต + ประกันสุขภาพ: รวมกันไม่เกิน "
          f"{L['life_health_combined']:,.0f} บาท (เงินได้ 1,000,000 บาท)")
    print(_line("="))
    print(f" {'กรณี':<44}{'เบี้ยที่จ่ายรวม':>16}{'ลดหย่อนที่ใช้ได้':>18}{'ภาษี':>12}{'ประหยัด':>12}")
    print(_line("-"))
    for x in d["table_c_common_mistakes"]:
        print(f" {x['label'][:43]:<44}{x['premium_paid']:>16,.0f}{x['allowed']:>18,.0f}"
              f"{x['tax']:>12,.0f}{x['saved']:>12,.0f}")
    print(_line("-"))
    print(" จุดที่คนมักเข้าใจผิด: ชีวิต 100,000 + สุขภาพ 25,000 ≠ ลดหย่อน 125,000")
    print(f" ตามประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 301) 7.1+7.2 ต้องไม่เกิน "
          f"{L['life_health_combined']:,.0f} บาท")
    print(" และตามคำชี้แจงการกรอก ภ.ง.ด.90 ข้อ 7.6 กรณีมีเบี้ยประกันชีวิตแบบบำนาญ ให้ใช้สิทธิ 7.1 "
          f"ให้เต็ม {L['life_insurance']:,.0f} บาทก่อน แล้วส่วนที่เหลือจึงกรอกเป็นแบบบำนาญ (ข้อ 7.3)")
    print()


def print_income_compare(d: Dict[str, Any]) -> None:
    c = d["income_compare"]
    print(_line("="))
    print(f" 1ข) เปรียบเทียบรายได้–ภาษี ของทุกอาชีพที่ต้องยื่นแบบ ({c['filing_count']} อาชีพ · เรียงจากภาษีมาก → น้อย)")
    print(_line("="))
    print(f" อาชีพที่ต้องยื่นแบบ {c['filing_count']} · ต้องชำระภาษี {c['pay_tax']} · "
          f"ต้องยื่นแต่ภาษี 0 บาท {c['zero_tax']} · ภาษีรวม {c['tax_sum']:,.0f} บาท "
          f"จากรายได้รวม {c['gross_sum']:,.0f} (อัตราเฉลี่ยรวม {c['avg_rate'] * 100:.2f}%)")
    print(_line("-"))
    print(f" {'อาชีพ':<34}{'รายได้/ปี':>14}{'ภาษี':>12}{'อัตรา':>10}   แท่งเทียบรายได้/ภาษี (เต็ม = "
          f"{c['max_gross']:,.0f}/{c['max_tax']:,.0f})")
    print(_line("-"))
    for o in c["by_tax"]:
        bar_g = "█" * max(1, round(o["gross"] / c["max_gross"] * 30)) if c["max_gross"] else ""
        bar_t = "▒" * (round(o["tax"] / c["max_tax"] * 30) if c["max_tax"] and o["tax"] > 0 else 0)
        print(f" {o['job'][:33]:<34}{o['gross']:>14,.0f}{o['tax']:>12,.0f}"
              f"{o['effective_rate'] * 100:>9.2f}%  {bar_g}{'|' if bar_t else ''}{bar_t}")
    print(_line("-"))
    print(f" 1ค) รายได้เท่ากัน แต่ภาษีต่างกัน ({len(c['same_income'])} กลุ่ม)")
    print(_line("-"))
    for g in c["same_income"]:
        print(f" รายได้ {g['income']:,.0f} บาท/ปี  → ภาษีต่างกัน {g['gap']:,.0f} บาท "
              f"(คิดเป็น {g['rate_gap'] * 100:.2f}% ของรายได้)")
        for r in g["rows"]:
            print(f"     • {r['job'][:44]:<46}{r['income_type']:<12} ภาษี {r['tax']:>10,.0f}"
                  f" (อัตรา {r['effective_rate'] * 100:>5.2f}% · หักค่าใช้จ่าย {r['expenses']:>10,.0f})")
    print()
    print(" เหตุผล: ประเภทเงินได้ 40(1)–(8) หักค่าใช้จ่ายเหมาได้ต่างกัน (40(1)/(2)/(3) 50% เพดาน 100,000 ·")
    print("         40(5)–(8) 30–60% ไม่มีเพดาน) → รายได้เท่ากันจึงเสียภาษีไม่เท่ากัน")
    print()


def print_insurance_tools(d: Dict[str, Any]) -> None:
    t = d["insurance_tools"]
    L = t["limits"]
    print(_line("="))
    print(" 3) ประกันลดหย่อนภาษี — ประกันชีวิตแบบสะสมทรัพย์ (ข้อ 7.1) · แบบบำนาญ (ข้อ 7.3) · ประกันสุขภาพ (ข้อ 7.2)")
    print(f"    เพดาน: สะสมทรัพย์ {L['life_insurance']:,.0f} · สุขภาพ {L['health_insurance']:,.0f} "
          f"(รวม 7.1+7.2 ไม่เกิน {L['life_health_combined']:,.0f}) · บำนาญ 15% ของเงินได้ ไม่เกิน {L['pension_life']:,.0f} "
          f"(วงเงินเกษียณรวม {L['retirement_cap']:,.0f})")
    print(_line("="))
    for key, title in (("savings", "3.1 ประกันชีวิตแบบสะสมทรัพย์ (เบี้ย 100,000/ปี)"),
                       ("pension", "3.2 ประกันชีวิตแบบบำนาญ (เบี้ย 150,000/ปี · เพดาน 15%)"),
                       ("health", "3.3 ประกันสุขภาพ (เบี้ย 25,000/ปี)")):
        rows = t[key]
        print(f" {title}")
        print(f"    {'เงินได้/ปี':>12}{'ลดหย่อนที่ใช้ได้จริง':>22}{'ภาษีก่อน':>12}{'ภาษีหลัง':>12}"
              f"{'ประหยัดภาษี':>14}{'ขั้นภาษี':>10}")
        for r in rows:
            print(f"    {r['income']:>12,.0f}{r['allowed']:>22,.0f}{r['tax_before']:>12,.0f}"
                  f"{r['tax_after']:>12,.0f}{r['saved']:>14,.0f}{r['marginal_rate'] * 100:>9.0f}%")
        print(_line("-"))
    print(" หมายเหตุ: ที่เงินได้ 300,000 บาท เงินได้สุทธิยังไม่ถึงเกณฑ์เสียภาษี → ไม่มีภาษีให้ประหยัด")
    print()


def main(argv: Optional[List[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    data = build()
    if "--json" in argv:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    only = None
    if "--only" in argv:
        i = argv.index("--only")
        only = argv[i + 1] if i + 1 < len(argv) else None
    jobs = [("1", print_occupations), ("1ข", print_income_compare), ("2ก", print_table_a),
            ("2ข", print_table_b), ("2ค", print_table_c), ("3", print_insurance_tools)]
    for key, fn in jobs:
        if only is None or only == key:
            fn(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
