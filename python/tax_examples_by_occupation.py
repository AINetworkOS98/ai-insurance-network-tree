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
OCCUPATIONS: List[Dict[str, Any]] = [
    {"id": "employee", "job": "พนักงานบริษัทเอกชน (เงินเดือน)", "form": "40(1)",
     "items": [it("salary", 600_000, "", "เงินเดือน + โบนัสปีละ 1 เดือน")],
     "extra": {"social_security": 9_000, "provident_fund": 30_000},
     "assume": "โสด · ประกันสังคม 9,000 · สำรองเลี้ยงชีพ 5% (30,000) ส่วน 10,000 แรกนับเป็นลดหย่อน ข้อ 8"},
    {"id": "gov", "job": "ข้าราชการ / ครู (เงินเดือนราชการ)", "form": "40(1)",
     "items": [it("salary", 480_000, "", "เงินเดือนราชการ")],
     "extra": {"gpf": 14_400},
     "assume": "โสด · กบข. 3% (14,400) · ไม่มีประกันสังคม (ใช้สิทธิ กบข. แทน)"},
    {"id": "nurse", "job": "พยาบาล / บุคลากรสาธารณสุข", "form": "40(1)",
     "items": [it("salary", 540_000, "", "เงินเดือน + ค่าตอบแทนพิเศษ")],
     "extra": {"gpf": 21_600, "social_security": 9_000},
     "assume": "โสด · มีทั้งกองทุนสำรองเลี้ยงชีพและประกันสังคม"},
    {"id": "sales", "job": "พนักงานขาย (เงินเดือน + คอมมิชชัน)", "form": "40(1)+40(2)",
     "items": [it("salary", 480_000, "", "เงินเดือน"), it("service", 180_000, "", "ค่าคอมมิชชัน")],
     "extra": {"social_security": 9_000},
     "assume": "โสด · 2 ประเภทเงินได้ → ยื่น ภ.ง.ด.90 · ค่าใช้จ่าย 40(1)+40(2) รวมกัน 50% ไม่เกิน 100,000"},
    {"id": "doctor", "job": "แพทย์ / ทันตแพทย์ (คลินิกส่วนตัว)", "form": "40(6)",
     "items": [it("professional", 2_400_000, "medical", "ค่ารักษาพยาบาลผู้ป่วยนอก")],
     "extra": {},
     "assume": "โสด · วิชาชีพอิสระ “การประกอบโรคศิลปะ” หักเหมา 60% (ใบแนบข้อ 5)"},
    {"id": "engineer", "job": "วิศวกร / สถาปนิก (รับงานเอง)", "form": "40(6)",
     "items": [it("professional", 1_200_000, "other", "ค่าออกแบบ/ควบคุมงาน")],
     "extra": {}, "assume": "โสด · วิศวกรรม/สถาปัตยกรรม หักเหมา 30% (หรือหักตามจริงได้)"},
    {"id": "lawyer", "job": "ทนายความ / นักกฎหมาย", "form": "40(6)",
     "items": [it("professional", 1_500_000, "other", "ค่าที่ปรึกษากฎหมาย")],
     "extra": {}, "assume": "โสด · กฎหมาย หักเหมา 30%"},
    {"id": "accountant", "job": "นักบัญชี (CPA รับงานเอง)", "form": "40(6)",
     "items": [it("professional", 1_000_000, "other", "ค่าทำบัญชี/ตรวจสอบ")],
     "extra": {}, "assume": "โสด · การบัญชี หักเหมา 30%"},
    {"id": "agent", "job": "ตัวแทน / นายหน้าประกันชีวิต", "form": "40(2)",
     "items": [it("service", 900_000, "", "ค่านายหน้า/ค่าบริการ")],
     "extra": {}, "assume": "โสด · 40(2) หักเหมา 50% แต่ไม่เกิน 100,000 บาท"},
    {"id": "freelance", "job": "ฟรีแลนซ์ (โปรแกรมเมอร์/กราฟิก)", "form": "40(2)",
     "items": [it("service", 720_000, "", "ค่าจ้างทำงานให้")],
     "extra": {}, "assume": "โสด · รับทำงานให้ → 40(2)"},
    {"id": "online", "job": "ขายของออนไลน์ (ร้านค้าออนไลน์)", "form": "40(8)",
     "items": [it("business", 1_200_000, "general", "ยอดขายทั้งปี")],
     "extra": {}, "assume": "โสด · 40(8) หักเหมา 60% ตามมาตรา 8 ทวิ (ไม่ต้องเก็บใบเสร็จ)"},
    {"id": "restaurant", "job": "เจ้าของร้านอาหาร", "form": "40(8)",
     "items": [it("business", 1_800_000, "general", "ยอดขายร้าน")],
     "extra": {}, "assume": "โสด · 40(8) เหมา 60% (มีบัญชีหักตามจริงได้)"},
    {"id": "rider", "job": "ไรเดอร์ / พนักงานส่งอาหาร–พัสดุ", "form": "40(8)",
     "items": [it("business", 300_000, "transport", "ค่าส่งอาหาร/พัสดุ")],
     "extra": {}, "assume": "โสด · 40(8) ประเภทการขนส่ง หักเหมา 40%"},
    {"id": "landlord", "job": "เจ้าของบ้านให้เช่า / ที่ดินให้เช่า", "form": "40(5)",
     "items": [it("rent", 600_000, "building", "ค่าเช่าบ้านให้เช่า")],
     "extra": {}, "assume": "โสด · ค่าเช่าอาคาร/โรงเรือน 30% (ที่ดินเกษตร 20% · ที่ดินอื่น 15% · ทรัพย์สินอื่น 10%)"},
    {"id": "farmer", "job": "เกษตรกร (พืชผล/ปศุสัตว์)", "form": "40(8)",
     "items": [it("business", 400_000, "general", "ขายพืชผล")],
     "extra": {}, "assume": "โสด · 40(8) เหมา 60% — ส่วนใหญ่เงินได้สุทธิไม่ถึงเกณฑ์เสียภาษี"},
    {"id": "youtuber", "job": "ยูทูบเบอร์ / ครีเอเตอร์ออนไลน์", "form": "40(8)",
     "items": [it("business", 960_000, "general", "รายได้โฆษณา/สปอนเซอร์")],
     "extra": {}, "assume": "โสด · 40(8) เหมา 60% (หรือหักตามจริงถ้ามีอุปกรณ์/ทีมงาน)"},
    {"id": "writer", "job": "นักเขียน / ค่าแห่งลิขสิทธิ์", "form": "40(3)",
     "items": [it("royalty", 500_000, "", "ค่าลิขสิทธิ์หนังสือ")],
     "extra": {}, "assume": "โสด · 40(3) หักเหมา 50% ไม่เกิน 100,000"},
    {"id": "technician", "job": "ช่างฝีมือ / ช่างไฟฟ้า รับเหมางาน", "form": "40(7)",
     "items": [it("contractor", 900_000, "", "ค่าจ้างรับเหมา")],
     "extra": {}, "assume": "โสด · 40(7) รับเหมาก่อสร้าง 60% · ถ้าเป็น 40(2) หัก 50% ไม่เกิน 100,000"},
    {"id": "market", "job": "พ่อค้าแม่ค้าในตลาด (แผงขาย)", "form": "40(8)",
     "items": [it("business", 720_000, "general", "ยอดขายรายวันรวมทั้งปี")],
     "extra": {}, "assume": "โสด · 40(8) เหมา 60%"},
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

    return {
        "year": DEFAULT_YEAR, "program": "tax_examples_by_occupation.py",
        "limits": {"life_insurance": LIFE, "health_insurance": HEALTH,
                   "life_health_combined": COMBINED, "pension_life": PENSION,
                   "child": CHILD, "retirement_cap": LIM["retirement_cap"]},
        "occupations": occ, "table_a_income_levels": table_a,
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
    jobs = [("1", print_occupations), ("2ก", print_table_a), ("2ข", print_table_b), ("2ค", print_table_c)]
    for key, fn in jobs:
        if only is None or only == key:
            fn(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
