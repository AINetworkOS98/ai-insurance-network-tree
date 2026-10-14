#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thai_tax_calculator.py — โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ประเทศไทย)
=======================================================================
อ้างอิงกฎหมาย/หลักเกณฑ์: ประมวลรัษฎากร มาตรา 40, 42 ทวิ, 42 ตรี, 43, 47, 48
และตารางสรุปการหักลดหย่อนของกรมสรรพากร (rd.go.th/59674.html)
ปีภาษีที่ใช้เป็นค่าเริ่มต้น: 2568 (2025) — ยื่นแบบ ภ.ง.ด.90/91 ในปี 2569

คุณสมบัติ
  • เงินได้ครบทั้ง 8 ประเภทตามมาตรา 40 พร้อมหักค่าใช้จ่าย "เหมา" อัตโนมัติ
    (หรือหักตามจริงได้ถ้ามีหลักฐาน)
  • ค่าลดหย่อนครบทุกกลุ่มที่กรมสรรพากรประกาศใช้ในปีภาษี 2568
    (ส่วนตัว/ครอบครัว, ประกัน, กองทุน-ลงทุน, อสังหาริมทรัพย์,
     มาตรการรัฐเฉพาะปี, บริจาค, ยกเว้นเงินได้ผู้สูงอายุ/ผู้พิการ)
  • คิดภาษีแบบขั้นบันได 0–35% + ตรวจภาษีขั้นต่ำ 0.5% (มาตรา 48(2))
  • หักภาษีหัก ณ ที่จ่าย/เครดิตภาษี → บอกยอด "ต้องจ่ายเพิ่ม" หรือ "ขอคืน"
  • โหมดยื่นคนเดียว หรือ ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)
  • ใช้ได้ทันที ไม่ต้องติดตั้งไลบรารีเพิ่ม (Python 3.9+ มาตรฐานเท่านั้น)

วิธีใช้
  python thai_tax_calculator.py                # โปรแกรมถาม-ตอบทีละขั้น (แนะนำ)
  python thai_tax_calculator.py --demo         # ตัวอย่างสำเร็จรูป 3 กรณี
  python thai_tax_calculator.py --json-in in.json            # รับข้อมูลเป็น JSON
  python thai_tax_calculator.py --json-in in.json --json-out out.json
  python thai_tax_calculator.py --selftest     # ตรวจความถูกต้องกับชุดทดสอบมาตรฐาน
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

VERSION = "1.0.0"
DEFAULT_YEAR = 2568  # ปีภาษี 2568 (2025) → ยื่นแบบปี 2569

# ─────────────────────────────────────────────────────────────────────────────
# 1) อัตราภาษีขั้นบันได (มาตรา 48(1)) — ใช้เหมือนกันทุกปีภาษีปัจจุบัน
#    (เงินได้สุทธิ, เพดานบนของขั้น, อัตราภาษี)
# ─────────────────────────────────────────────────────────────────────────────
TAX_BRACKETS: List[Tuple[float, float]] = [
    (150_000, 0.00),        # 0 – 150,000 ยกเว้น
    (300_000, 0.05),        # 150,001 – 300,000 → 5%
    (500_000, 0.10),        # 300,001 – 500,000 → 10%
    (750_000, 0.15),        # 500,001 – 750,000 → 15%
    (1_000_000, 0.20),      # 750,001 – 1,000,000 → 20%
    (2_000_000, 0.25),      # 1,000,001 – 2,000,000 → 25%
    (5_000_000, 0.30),      # 2,000,001 – 5,000,000 → 30%
    (float("inf"), 0.35),   # 5,000,001 ขึ้นไป → 35%
]

# ─────────────────────────────────────────────────────────────────────────────
# 2) ค่าใช้จ่ายแบบเหมาแยกตามประเภทเงินได้ (มาตรา 42 ทวิ / 42 ตรี / 43)
#    rate = อัตราหักเหมา, cap = เพดานบาท (None = ไม่มีเพดาน)
# ─────────────────────────────────────────────────────────────────────────────
EXPENSE_RULES: Dict[str, Dict[str, Any]] = {
    "salary":       {"label": "เงินเดือน ค่าจ้าง โบนัส (40(1))", "rate": 0.50, "cap": 100_000},
    "service":      {"label": "รับจ้างทำของ/ค่าบริการ (40(2))", "rate": 0.50, "cap": 100_000},
    "royalty":      {"label": "ค่าแห่งลิขสิทธิ์/ค่ากู๊ดวิลล์ (40(3))", "rate": 0.50, "cap": None},
    "interest":     {"label": "ดอกเบี้ย/เงินปันผล (40(4))", "rate": 0.00, "cap": 0},
    "rent":         {"label": "ค่าเช่าทรัพย์สิน (40(5))", "rate": 0.30, "cap": None},
    "professional": {"label": "วิชาชีพอิสระ (40(6))", "rate": 0.30, "cap": None},
    "contractor":   {"label": "รับเหมาก่อสร้าง (40(7))", "rate": 0.60, "cap": None},
    "business":     {"label": "ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))", "rate": 0.60, "cap": None},
}
# วิชาชีพแพทย์ ทันตแพทย์ พยาบาล เภสัชกร เทคนิคการแพทย์ กายภาพบำบัด → หักเหมาได้ 60%
MEDICAL_RATE = 0.60
# เงินได้ตามมาตรา 40(1)+(2) หักรวมกันได้ 50% แต่ไม่เกิน 100,000 บาท (เพดานร่วม)
SHARED_CAP_1_2 = 100_000

# ─────────────────────────────────────────────────────────────────────────────
# 3) เพดาน/เงื่อนไขค่าลดหย่อน ปีภาษี 2568 (กรมสรรพากร)
# ─────────────────────────────────────────────────────────────────────────────
LIM = {
    "personal": 60_000,
    "spouse": 60_000,                 # คู่สมรสที่ไม่มีเงินได้ (มีเงินได้ ≤ 60,000)
    "child": 30_000,                  # บุตรชอบด้วยกฎหมาย คนละ 30,000
    "child_extra": 30_000,            # บุตรคนที่ 2+ ที่เกิดตั้งแต่ปี 2561 ได้เพิ่มอีก 30,000
    "adopted_child": 60_000,
    "adopted_max": 3,
    "prenatal": 60_000,               # ฝากครรภ์+คลอดบุตร ตามจริง ต่อการตั้งครรภ์ 1 ครั้ง
    "parent": 30_000,                 # บิดามารดา/คู่สมรสของบิดามารดา คนละ 30,000
    "disabled_dependent": 60_000,
    "life_insurance": 100_000,
    "health_insurance": 25_000,
    "life_health_combined": 100_000,  # ประกันชีวิต + ประกันสุขภาพ รวมกันไม่เกิน 100,000
    "parent_health": 15_000,
    "spouse_life": 10_000,
    "social_security": 9_000,
    "pension_life": 200_000,          # 15% ของเงินได้ ไม่เกิน 200,000 (อยู่ในวงเงินเกษียณ 500,000)
    "retirement_cap": 500_000,        # สำรองเลี้ยงชีพ+กบข+สงเคราะห์ครู+RMF+SSF+ประกันบำนาญ
    "nsf": 30_000,                    # กองทุนการออมแห่งชาติ (กอช.)
    "thai_esg": 300_000,              # กองทุนรวมไทยเพื่อความยั่งยืน 30% ของเงินได้
    "social_enterprise": 100_000,
    "home_loan_interest": 100_000,
    "home_construction_exempt": 100_000,  # ค่าจ้างก่อสร้างบ้าน ล้านละหมื่น (9 เม.ย.67–31 ธ.ค.68)
    "easy_e_receipt": 50_000,         # Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)
    "travel_main": 20_000,            # เที่ยวดีมีคืน 2568 เมืองหลัก (1 เท่า)
    "travel_secondary": 30_000,       # เที่ยวดีมีคืน 2568 เมืองรอง (1.5 เท่า, จ่ายจริง ≤ 20,000)
    "donation_political": 10_000,
    "senior_disabled_exemption": 190_000,  # อายุ 65 ปีขึ้นไป / ผู้พิการ ยกเว้นเงินได้ไม่เกิน 190,000
    "min_tax_rate": 0.005,            # มาตรา 48(2) ภาษีขั้นต่ำ 0.5% ของเงินได้พึงประเมิน 40(2)–(8)
}
# อัตราร้อยละของเงินได้ของแต่ละกองทุน (เพดาน %×เงินได้ และเพดานบาท ถูกเลือกค่าที่ต่ำกว่า)
PCT_RULES = {
    "provident_fund": 0.15,
    "gpf": 0.30,
    "teacher_fund": 0.15,
    "rmf": 0.30,
    "ssf": 0.30,
    "pension_life_insurance": 0.15,
    "thai_esg": 0.30,
    "thai_esgx": 0.30,
}
EFFECTIVE_YEARS = (2568, 2569)   # ปีภาษีที่ตารางนี้ใช้ได้

SOURCES = [
    "กรมสรรพากร — ตารางสรุปการหักลดหย่อนและยกเว้นภาษี: https://www.rd.go.th/59674.html",
    "กรมสรรพากร — อัตราภาษีเงินได้บุคคลธรรมดา (มาตรา 48): https://www.rd.go.th/315.html",
    "ประมวลรัษฎากร มาตรา 40 (ประเภทเงินได้) / 42 ทวิ-ตรี, 43 (ค่าใช้จ่าย) / 47, 48 (การคำนวณภาษี)",
    "มาตรการเที่ยวดีมีคืน 2568: https://www.rd.go.th/fileadmin/user_upload/lorkhor/newsbanner/2025/10/PR22102568.pdf",
]


# ─────────────────────────────────────────────────────────────────────────────
# 4) โครงสร้างข้อมูลผู้เสียภาษี 1 คน
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Person:
    # ── เงินได้พึงประเมิน 8 ประเภท (บาท/ปี) ──
    salary: float = 0.0
    service: float = 0.0
    royalty: float = 0.0
    interest: float = 0.0
    rent: float = 0.0
    professional: float = 0.0
    contractor: float = 0.0
    business: float = 0.0
    medical_professional: bool = False      # วิชาชีพแพทย์/พยาบาล ฯลฯ → หักเหมา 60%
    actual_expense: Dict[str, float] = field(default_factory=dict)  # หักตามจริงรายประเภท

    # ── ลดหย่อนส่วนตัวและครอบครัว ──
    personal: bool = True
    spouse_no_income: bool = False
    children: int = 0
    children_born_2561_plus: int = 0        # นับเฉพาะบุตรคนที่ 2 เป็นต้นไปที่เกิดตั้งแต่ 2561
    adopted_children: int = 0
    pregnancies: int = 0
    prenatal_expense: float = 0.0
    parents: int = 0
    disabled_dependents: int = 0

    # ── ประกัน ──
    life_insurance: float = 0.0
    health_insurance: float = 0.0
    spouse_life_insurance: float = 0.0
    parent_health_insurance: float = 0.0
    social_security: float = 0.0
    pension_life_insurance: float = 0.0

    # ── กองทุน/การลงทุน ──
    provident_fund: float = 0.0
    gpf: float = 0.0
    teacher_fund: float = 0.0
    rmf: float = 0.0
    ssf: float = 0.0
    nsf: float = 0.0
    thai_esg: float = 0.0
    thai_esgx: float = 0.0
    social_enterprise: float = 0.0

    # ── อสังหาริมทรัพย์ + มาตรการรัฐเฉพาะปี ──
    home_loan_interest: float = 0.0
    home_construction_cost: float = 0.0     # มูลค่าค่าก่อสร้างบ้าน → ยกเว้น ล้านละหมื่น
    easy_e_receipt: float = 0.0
    travel_main_city: float = 0.0
    travel_secondary_city: float = 0.0
    other_measure_amount: float = 0.0       # มาตรการอื่นของปี (เช่น โซลาร์รูฟท็อป) — ใส่ยอดที่ใช้สิทธิ

    # ── บริจาค ──
    donation_general: float = 0.0
    donation_education: float = 0.0         # การศึกษา/กีฬา/รพ.รัฐ → 2 เท่า
    donation_political: float = 0.0

    # ── ยกเว้นเงินได้ ──
    senior_or_disabled_exemption: float = 0.0

    # ── ภาษีที่ชำระไว้แล้ว ──
    withholding: float = 0.0                # ภาษีหัก ณ ที่จ่าย (หนังสือรับรอง 50 ทวิ)
    dividend_credit: float = 0.0            # เครดิตภาษีเงินปันผล ฯลฯ


def _money(x: Any) -> float:
    """แปลงค่าที่รับมาเป็นตัวเลขเงิน (ติดลบ = 0)"""
    try:
        v = float(x or 0)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if v < 0 else round(v, 2)


# ─────────────────────────────────────────────────────────────────────────────
# 5) ค่าใช้จ่าย (มาตรา 42 ทวิ / 42 ตรี / 43)
# ─────────────────────────────────────────────────────────────────────────────
def compute_expenses(p: Person) -> Dict[str, Any]:
    """หักค่าใช้จ่ายแบบเหมา (หรือตามจริงถ้าผู้ใช้ระบุใน actual_expense)"""
    lines: List[Dict[str, Any]] = []
    exp_1_2_gross = _money(p.salary) + _money(p.service)
    exp_1_2 = min(exp_1_2_gross * 0.50, SHARED_CAP_1_2)
    if exp_1_2_gross > 0:
        lines.append({
            "group": "40(1)+(2)", "label": "เงินเดือน/ค่าจ้าง/ค่าบริการ — หักเหมา 50% (รวมกันไม่เกิน 100,000)",
            "gross": round(exp_1_2_gross, 2), "deductible": round(exp_1_2, 2),
        })

    for key in ("royalty", "rent", "professional", "contractor", "business"):
        gross = _money(getattr(p, key))
        if gross <= 0:
            continue
        rule = EXPENSE_RULES[key]
        rate = MEDICAL_RATE if (key == "professional" and p.medical_professional) else rule["rate"]
        hedged = gross * rate
        if rule["cap"] is not None:
            hedged = min(hedged, rule["cap"])
        actual = _money(p.actual_expense.get(key, 0))
        if actual > 0:                       # ผู้ใช้เลือกหักตามจริง
            used, how = min(actual, gross), "ตามจริง"
        else:
            used, how = hedged, f"เหมา {int(rate * 100)}%"
        lines.append({
            "group": rule["label"], "label": f"{rule['label']} — หัก{how}",
            "gross": round(gross, 2), "deductible": round(used, 2),
        })

    interest_gross = _money(p.interest)
    if interest_gross > 0:
        lines.append({
            "group": "40(4)", "label": "ดอกเบี้ย/เงินปันผล (40(4)) — หักค่าใช้จ่ายไม่ได้",
            "gross": round(interest_gross, 2), "deductible": 0.0,
        })

    total = round(sum(l["deductible"] for l in lines), 2)
    return {"lines": lines, "total": total}


# ─────────────────────────────────────────────────────────────────────────────
# 6) ค่าลดหย่อนของผู้เสียภาษี 1 คน
#    assessable = เงินได้พึงประเมินทั้งสิ้น (ใช้คิดเพดานแบบร้อยละ)
# ─────────────────────────────────────────────────────────────────────────────
def compute_allowances(p: Person, assessable: float, married_combined: bool) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    notes: List[str] = []

    def add(code: str, label: str, amount: float, note: str = "") -> float:
        amount = round(max(0.0, amount), 2)
        if amount > 0:
            items.append({"code": code, "label": label, "amount": amount, "note": note})
        return amount

    # ── 6.1 ส่วนตัว / ครอบครัว ──
    if p.personal:
        add("personal", "ค่าลดหย่อนส่วนตัว", LIM["personal"])

    if p.spouse_no_income and not married_combined:
        add("spouse", "ค่าลดหย่อนคู่สมรส (ไม่มีเงินได้)", LIM["spouse"],
            "คู่สมรสต้องมีเงินได้พึงประเมินไม่เกิน 60,000 บาท/ปี และจดทะเบียนสมรสถูกต้อง")
    elif p.spouse_no_income and married_combined:
        notes.append("ยื่นรวมกับคู่สมรส → ใช้สิทธิลดหย่อนคู่สมรสไม่ได้ "
                     "(แต่หักลดหย่อนส่วนตัวของคู่สมรส 60,000 บาทได้)")

    child_amt = _money(p.children) * LIM["child"] + _money(p.children_born_2561_plus) * LIM["child_extra"]
    add("children", f"ค่าลดหย่อนบุตร ({int(p.children)} คน"
        + (f" + บุตรคนที่ 2 ขึ้นไปเกิดตั้งแต่ 2561 อีก {int(p.children_born_2561_plus)} คน" if p.children_born_2561_plus else "")
        + ")", child_amt, "บุตรชอบด้วยกฎหมาย คนละ 30,000 · บุตรคนที่ 2+ เกิดตั้งแต่ปี 2561 ได้เพิ่มอีก 30,000")

    adopted = min(int(_money(p.adopted_children)), LIM["adopted_max"])
    add("adopted_children", f"ค่าลดหย่อนบุตรบุญธรรม ({adopted} คน)", adopted * LIM["adopted_child"],
        "บุตรบุญธรรมคนละ 60,000 บาท ไม่เกิน 3 คน")

    if p.pregnancies > 0:
        add("prenatal", f"ค่าฝากครรภ์และค่าคลอดบุตร ({int(p.pregnancies)} ครั้ง)",
            min(_money(p.prenatal_expense), LIM["prenatal"] * max(1, int(p.pregnancies))),
            "ตามที่จ่ายจริง ไม่เกิน 60,000 บาทต่อการตั้งครรภ์ 1 ครั้ง")

    add("parents", f"ค่าอุปการะบิดามารดา ({int(_money(p.parents))} คน)", _money(p.parents) * LIM["parent"],
        "คนละ 30,000 บาท — อายุ 60 ปีขึ้นไป และมีเงินได้ไม่เกิน 30,000 บาท/ปี")
    add("disabled_dependents", f"ค่าอุปการะผู้พิการ/ทุพพลภาพ ({int(_money(p.disabled_dependents))} คน)",
        _money(p.disabled_dependents) * LIM["disabled_dependent"], "คนละ 60,000 บาท")

    # ── 6.2 ประกัน ──
    life = min(_money(p.life_insurance), LIM["life_insurance"])
    health = min(_money(p.health_insurance), LIM["health_insurance"])
    cut = max(0.0, (life + health) - LIM["life_health_combined"])
    if cut > 0:                                    # ตัดส่วนเกินออกจากเบี้ยประกันสุขภาพก่อน
        health = max(0.0, health - cut)
        cut = max(0.0, (life + health) - LIM["life_health_combined"])
        if cut > 0:
            life = max(0.0, life - cut)
        notes.append("เบี้ยประกันชีวิต + ประกันสุขภาพ รวมกันได้ไม่เกิน 100,000 บาท/ปี (ตัดส่วนเกินให้แล้ว)")
    add("life_insurance", "เบี้ยประกันชีวิต/สะสมทรัพย์", life,
        "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท · กรมธรรม์อายุความคุ้มครอง 10 ปีขึ้นไป")
    add("health_insurance", "เบี้ยประกันสุขภาพ (ตนเอง)", health, "ไม่เกิน 25,000 บาท และรวมกับประกันชีวิตไม่เกิน 100,000 บาท")
    add("parent_health_insurance", "เบี้ยประกันสุขภาพบิดามารดา", min(_money(p.parent_health_insurance), LIM["parent_health"]),
        "บิดามารดามีเงินได้ไม่เกิน 30,000 บาท/ปี — ไม่เกิน 15,000 บาท")
    if not married_combined:
        add("spouse_life_insurance", "เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)",
            min(_money(p.spouse_life_insurance), LIM["spouse_life"]), "ไม่เกิน 10,000 บาท")
    add("social_security", "เงินสมทบประกันสังคม (มาตรา 33)", min(_money(p.social_security), LIM["social_security"]),
        "ตามที่จ่ายจริง ไม่เกิน 9,000 บาท/ปี")

    # ── 6.3 เงินสะสม/กองทุนเพื่อการเกษียณ (วงเงินรวม 500,000) ──
    retirement_orders = [
        ("provident_fund", "เงินสะสมกองทุนสำรองเลี้ยงชีพ", LIM["retirement_cap"], "15% ของเงินได้ ไม่เกิน 500,000"),
        ("gpf", "เงินสะสม กบข. (ข้าราชการ)", LIM["retirement_cap"], "30% ของเงินได้ ไม่เกิน 500,000"),
        ("teacher_fund", "เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน", LIM["retirement_cap"], "15% ของเงินได้ ไม่เกิน 500,000"),
        ("pension_life_insurance", "เบี้ยประกันชีวิตแบบบำนาญ", LIM["pension_life"], "15% ของเงินได้ ไม่เกิน 200,000"),
        ("rmf", "ค่าซื้อหน่วยลงทุน RMF", LIM["retirement_cap"], "30% ของเงินได้ ไม่เกิน 500,000"),
        ("ssf", "ค่าซื้อหน่วยลงทุน SSF", 200_000, "30% ของเงินได้ ไม่เกิน 200,000"),
    ]
    retirement_items: List[Dict[str, Any]] = []
    for key, label, cap_baht, note in retirement_orders:
        raw = _money(getattr(p, key))
        if raw <= 0:
            continue
        pct_cap = assessable * PCT_RULES[key]
        allowed = min(raw, pct_cap, cap_baht)
        retirement_items.append({"key": key, "label": label, "amount": allowed, "note": note})
    used = sum(i["amount"] for i in retirement_items)
    if used > LIM["retirement_cap"]:
        over = used - LIM["retirement_cap"]
        for it in reversed(retirement_items):      # ตัดส่วนเกินจากรายการท้ายสุดก่อน
            if over <= 0:
                break
            cut_amt = min(it["amount"], over)
            it["amount"] -= cut_amt
            over -= cut_amt
        notes.append("กองทุนเกษียณ (สำรองเลี้ยงชีพ/กบข./สงเคราะห์ครู/ประกันบำนาญ/RMF/SSF) "
                     "รวมกันได้ไม่เกิน 500,000 บาท/ปี — ปรับลดส่วนเกินให้แล้ว")
    for it in retirement_items:
        add(it["key"], it["label"], it["amount"], it["note"])

    add("nsf", "เงินสะสมกองทุนการออมแห่งชาติ (กอช.)", min(_money(p.nsf), LIM["nsf"]),
        "ตามที่จ่ายจริง ไม่เกิน 30,000 บาท (วงเงินแยกจากกองทุนเกษียณ 500,000)")
    add("thai_esg", "ค่าซื้อหน่วยลงทุน Thai ESG", min(_money(p.thai_esg), assessable * PCT_RULES["thai_esg"], LIM["thai_esg"]),
        "30% ของเงินได้ ไม่เกิน 300,000 บาท (ถือหน่วยลงทุนไม่น้อยกว่า 5 ปี)")
    add("thai_esgx", "ค่าซื้อหน่วยลงทุน Thai ESGX (เฉพาะปีภาษี 2568)", min(_money(p.thai_esgx), assessable * 0.30, 300_000),
        "ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568 — 30% ของเงินได้ ไม่เกิน 300,000 บาท")
    add("social_enterprise", "เงินลงทุนวิสาหกิจเพื่อสังคม (Social Enterprise)",
        min(_money(p.social_enterprise), LIM["social_enterprise"]), "ไม่เกิน 100,000 บาท")

    # ── 6.4 อสังหาริมทรัพย์และมาตรการรัฐเฉพาะปี ──
    add("home_loan_interest", "ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย",
        min(_money(p.home_loan_interest), LIM["home_loan_interest"]), "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท")
    add("easy_e_receipt", "มาตรการ Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)",
        min(_money(p.easy_e_receipt), LIM["easy_e_receipt"]), "ไม่เกิน 50,000 บาท ต้องมีใบกำกับภาษีอิเล็กทรอนิกส์")
    travel_main = min(_money(p.travel_main_city), LIM["travel_main"])
    add("travel_main_city", "เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองหลัก (29 ต.ค.–15 ธ.ค. 2568)", travel_main,
        "1 เท่าของที่จ่ายจริง ไม่เกิน 20,000 บาท (ค่าที่พัก/ร้านอาหารที่จด VAT)")
    travel_sec = min(min(_money(p.travel_secondary_city), LIM["travel_main"]) * 1.5, LIM["travel_secondary"])
    add("travel_secondary_city", "เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองรอง 55 จังหวัด", travel_sec,
        "1.5 เท่าของที่จ่ายจริง (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000 บาท")
    add("other_measure_amount", "มาตรการรัฐอื่นของปีภาษี (เช่น ค่าติดตั้งโซลาร์รูฟท็อป)",
        _money(p.other_measure_amount), "ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน — ไม่มีหลักฐาน = ไม่ควรใส่")

    subtotal = sum(i["amount"] for i in items)
    return {"items": items, "subtotal": round(subtotal, 2), "notes": notes}


# ─────────────────────────────────────────────────────────────────────────────
# 7) ภาษีขั้นบันได + รายละเอียดแต่ละขั้น
# ─────────────────────────────────────────────────────────────────────────────
def progressive_tax(net_income: float) -> Dict[str, Any]:
    net_income = max(0.0, net_income)
    tax = 0.0
    lower = 0.0
    steps: List[Dict[str, Any]] = []
    for upper, rate in TAX_BRACKETS:
        if net_income <= lower:
            break
        amount = min(net_income, upper) - lower
        step_tax = amount * rate
        tax += step_tax
        steps.append({
            "range": f"{'0' if lower == 0 else f'{lower:,.0f}+1'} – {'∞ ขึ้นไป' if upper == float('inf') else f'{upper:,.0f}'}",
            "rate": rate, "amount": round(amount, 2), "tax": round(step_tax, 2),
        })
        lower = upper
    return {"tax": round(tax, 2), "steps": steps, "marginal_rate": steps[-1]["rate"] if steps else 0.0}


# ─────────────────────────────────────────────────────────────────────────────
# 8) เครื่องยนต์หลัก
# ─────────────────────────────────────────────────────────────────────────────
def compute_pit(persons: List[Person], year: int = DEFAULT_YEAR) -> Dict[str, Any]:
    """
    คำนวณภาษีเงินได้บุคคลธรรมดา
      persons = [ผู้เสียภาษี]                      → ยื่นคนเดียว (ภ.ง.ด.91/90)
      persons = [ผู้เสียภาษี, คู่สมรส]            → ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)
    """
    if not persons:
        raise ValueError("ต้องมีข้อมูลผู้เสียภาษีอย่างน้อย 1 คน")
    married_combined = len(persons) > 1
    if year not in EFFECTIVE_YEARS:
        # ไม่บังคับให้ล้ม — แจ้งเตือนให้ตรวจสอบตารางปีภาษี
        pass

    # ── 8.1 เงินได้พึงประเมิน + ค่าใช้จ่าย (คิดแยกคนตามกฎหมาย) ──
    gross_by_cat: Dict[str, float] = {k: 0.0 for k in EXPENSE_RULES}
    expenses_total = 0.0
    expense_lines: List[Dict[str, Any]] = []
    for idx, p in enumerate(persons):
        for k in EXPENSE_RULES:
            gross_by_cat[k] += _money(getattr(p, k))
        exp = compute_expenses(p)
        for l in exp["lines"]:
            if married_combined:
                l = dict(l, label=("(คู่สมรส) " if idx else "") + l["label"])
            expense_lines.append(l)
        expenses_total += exp["total"]

    gross_total = round(sum(gross_by_cat.values()), 2)
    expenses_total = round(expenses_total, 2)
    income_after_expense = round(max(0.0, gross_total - expenses_total), 2)

    # ── 8.2 ยกเว้นเงินได้ (ผู้สูงอายุ 65+/ผู้พิการ 190,000 · ค่าจ้างก่อสร้างบ้าน ล้านละหมื่น) ──
    exemptions: List[Dict[str, Any]] = []
    senior_cap = LIM["senior_disabled_exemption"] * (2 if married_combined else 1)
    senior_exempt = min(sum(_money(p.senior_or_disabled_exemption) for p in persons), senior_cap)
    if senior_exempt > 0:
        exemptions.append({
            "label": "ยกเว้นเงินได้ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ",
            "amount": round(senior_exempt, 2), "note": "ยกเว้นเงินได้ไม่เกิน 190,000 บาท/ปี ต่อคน",
        })
    construction_cost = sum(_money(p.home_construction_cost) for p in persons)
    if construction_cost > 0:
        exempt = min(construction_cost // 1_000_000 * 10_000, LIM["home_construction_exempt"])
        exemptions.append({
            "label": "ยกเว้นเงินได้ค่าจ้างก่อสร้างบ้านใหม่ (มาตรการล้านละหมื่น)",
            "amount": round(exempt, 2),
            "note": "10,000 บาทต่อค่าก่อสร้าง 1,000,000 บาท (ไม่เกิน 100,000) สัญญาจ้าง 9 เม.ย. 2567–31 ธ.ค. 2568",
        })
    exemptions_total = round(sum(e["amount"] for e in exemptions), 2)

    # ── 8.3 ค่าลดหย่อน ──
    all_items: List[Dict[str, Any]] = []
    all_notes: List[str] = []
    for idx, p in enumerate(persons):
        # ลดหย่อนระดับครอบครัว (บุตร/บิดามารดา/ครรภ์) นับครั้งเดียวที่ผู้ยื่นหลัก
        q = p
        if idx > 0:
            q = Person(**{**asdict(p), "children": 0, "children_born_2561_plus": 0, "adopted_children": 0,
                          "pregnancies": 0, "prenatal_expense": 0, "parents": 0, "disabled_dependents": 0,
                          "spouse_no_income": False})
        allow = compute_allowances(q, income_after_expense, married_combined)
        for it in allow["items"]:
            if married_combined and idx > 0:
                it = dict(it, label="(คู่สมรส) " + it["label"])
            all_items.append(it)
        all_notes.extend(allow["notes"])
    allowances_before_donation = round(sum(i["amount"] for i in all_items), 2)

    # ── 8.4 เงินบริจาค (เพดาน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน) ──
    donation_base = max(0.0, income_after_expense - exemptions_total - allowances_before_donation)
    don_cap = donation_base * 0.10
    don_general = min(sum(_money(p.donation_general) for p in persons), don_cap)
    don_edu_raw = sum(_money(p.donation_education) for p in persons)
    don_edu = min(don_edu_raw * 2, don_cap)
    don_pol = min(sum(_money(p.donation_political) for p in persons), LIM["donation_political"])
    donations = []
    if don_general > 0:
        donations.append({"code": "donation_general", "label": "เงินบริจาคทั่วไป (1 เท่า)",
                          "amount": round(don_general, 2), "note": f"ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย/ลดหย่อน = {don_cap:,.0f}"})
    if don_edu > 0:
        donations.append({"code": "donation_education",
                          "label": f"เงินบริจาคเพื่อการศึกษา/กีฬา/สถานพยาบาลรัฐ (2 เท่าของ {don_edu_raw:,.0f})",
                          "amount": round(don_edu, 2), "note": "ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย/ลดหย่อน"})
    if don_pol > 0:
        donations.append({"code": "donation_political", "label": "เงินบริจาคให้พรรคการเมือง",
                          "amount": round(don_pol, 2), "note": "ไม่เกิน 10,000 บาท"})
    for d in donations:
        all_items.append(d)
        if don_edu > 0 and d["code"] == "donation_education" and don_edu_raw * 2 > don_cap:
            all_notes.append("เงินบริจาคเพื่อการศึกษา 2 เท่า ถูกจำกัดด้วยเพดาน 10% ของเงินได้")

    allowances_total = round(sum(i["amount"] for i in all_items), 2)

    # ── 8.5 เงินได้สุทธิ + ภาษี ──
    net_income = round(max(0.0, income_after_expense - exemptions_total - allowances_total), 2)
    bracket = progressive_tax(net_income)

    # ── 8.6 ภาษีขั้นต่ำ 0.5% (มาตรา 48(2)) — เฉพาะเงินได้ 40(2)–(8) ──
    gross_2_to_8 = round(gross_total - gross_by_cat["salary"], 2)
    min_tax = round(gross_2_to_8 * LIM["min_tax_rate"], 2)
    applied_min_tax = min_tax > bracket["tax"] and gross_2_to_8 > 0
    tax_before_credit = max(bracket["tax"], min_tax) if gross_2_to_8 > 0 else bracket["tax"]

    credit = round(sum(_money(p.withholding) + _money(p.dividend_credit) for p in persons), 2)
    net_payable = round(tax_before_credit - credit, 2)

    # ── 8.7 หน้าที่ในการยื่นแบบ ──
    salary_only = gross_2_to_8 <= 0
    threshold = 60_000 if salary_only else 120_000
    must_file = gross_total > threshold

    return {
        "program": "thai_tax_calculator.py",
        "version": VERSION,
        "year": year,
        "filing_mode": "ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)" if married_combined else "ยื่นคนเดียว (ภ.ง.ด.90/91)",
        "gross_by_category": {EXPENSE_RULES[k]["label"]: round(v, 2) for k, v in gross_by_cat.items() if v > 0},
        "gross_total": gross_total,
        "expense_lines": expense_lines,
        "expenses_total": expenses_total,
        "income_after_expense": income_after_expense,
        "exemptions": exemptions,
        "exemptions_total": exemptions_total,
        "allowance_items": all_items,
        "allowances_total": allowances_total,
        "allowance_notes": all_notes,
        "net_income": net_income,
        "bracket_steps": bracket["steps"],
        "tax_by_bracket": bracket["tax"],
        "marginal_rate": bracket["marginal_rate"],
        "min_tax_05pct": min_tax,
        "min_tax_applied": applied_min_tax,
        "tax_before_credit": round(tax_before_credit, 2),
        "tax_credits": credit,
        "net_payable": net_payable,
        "result": ("ต้องชำระเพิ่ม" if net_payable > 0.5 else ("ขอคืนภาษี" if net_payable < -0.5 else "ไม่มีภาษีต้องชำระ/ขอคืน")),
        "must_file": must_file,
        "file_threshold": threshold,
        "sources": SOURCES,
        "disclaimer": ("ผลคำนวณนี้เป็นเครื่องช่วยประมาณการตามหลักเกณฑ์กรมสรรพากร "
                       "ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — กรณีมีเงินได้หลายประเภท/สิทธิพิเศษ "
                       "โปรดตรวจสอบกับสำนักงานสรรพากรหรือผู้ทำบัญชีก่อนยื่นแบบ"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9) รายงานแบบข้อความ (อ่านง่ายบนหน้าจอ/พิมพ์)
# ─────────────────────────────────────────────────────────────────────────────
def format_report(r: Dict[str, Any]) -> str:
    b = []
    line = "─" * 72
    b.append(line)
    b.append(f" รายงานการคำนวณภาษีเงินได้บุคคลธรรมดา · ปีภาษี {r['year']} · {r['filing_mode']}")
    b.append(f" โปรแกรม {r['program']} v{r['version']} (อ้างอิงกรมสรรพากร)")
    b.append(line)
    b.append(" 1) เงินได้พึงประเมิน (มาตรา 40)")
    for label, amt in r["gross_by_category"].items():
        b.append(f"    • {label:<52} {amt:>15,.2f}")
    b.append(f"    {'รวมเงินได้ทั้งปี':<54} {r['gross_total']:>15,.2f}")
    b.append("")
    b.append(" 2) หักค่าใช้จ่าย")
    for l in r["expense_lines"]:
        b.append(f"    • {l['label'][:60]:<62} {l['deductible']:>12,.2f}")
    b.append(f"    {'รวมค่าใช้จ่าย':<54} {r['expenses_total']:>15,.2f}")
    b.append(f"    {'เงินได้หลังหักค่าใช้จ่าย':<54} {r['income_after_expense']:>15,.2f}")
    if r["exemptions"]:
        b.append("")
        b.append(" 3) เงินได้ที่ได้รับยกเว้น")
        for e in r["exemptions"]:
            b.append(f"    • {e['label'][:60]:<62} {e['amount']:>12,.2f}")
        b.append(f"    {'รวมยกเว้น':<54} {r['exemptions_total']:>15,.2f}")
    b.append("")
    b.append(" 4) ค่าลดหย่อน")
    for i in r["allowance_items"]:
        note = f"  ({i['note']})" if i.get("note") else ""
        b.append(f"    • {i['label'][:58]:<60} {i['amount']:>12,.2f}{note}")
    b.append(f"    {'รวมค่าลดหย่อน':<54} {r['allowances_total']:>15,.2f}")
    b.append("")
    b.append(f" 5) เงินได้สุทธิ = {r['net_income']:,.2f} บาท")
    b.append(" 6) ภาษีตามอัตราขั้นบันได (มาตรา 48(1))")
    for s in r["bracket_steps"]:
        b.append(f"    • ช่วง {s['range']:<18} {int(s['rate'] * 100):>3}%  ของ {s['amount']:>14,.2f} = {s['tax']:>12,.2f}")
    b.append(f"    {'ภาษีขั้นบันได':<54} {r['tax_by_bracket']:>15,.2f}")
    if r["min_tax_05pct"] > 0:
        tag = " ← ใช้ยอดนี้" if r["min_tax_applied"] else ""
        b.append(f"    • ภาษีขั้นต่ำ 0.5% ของเงินได้ 40(2)–(8) (มาตรา 48(2)){'':<6} {r['min_tax_05pct']:>12,.2f}{tag}")
    b.append(f"    {'ภาษีที่ต้องเสียทั้งปี':<54} {r['tax_before_credit']:>15,.2f}")
    if r["tax_credits"]:
        b.append(f"    {'หัก ภาษีหัก ณ ที่จ่าย/เครดิตภาษี':<54} {-r['tax_credits']:>15,.2f}")
    b.append(line)
    if r["net_payable"] > 0.5:
        b.append(f" สรุป: ต้องชำระภาษีเพิ่ม {r['net_payable']:,.2f} บาท")
    elif r["net_payable"] < -0.5:
        b.append(f" สรุป: ขอคืนภาษี {abs(r['net_payable']):,.2f} บาท")
    else:
        b.append(" สรุป: ไม่มีภาษีต้องชำระเพิ่ม และไม่มีภาษีขอคืน")
    if r["must_file"]:
        b.append(f" ต้องยื่นแบบแสดงรายการ (เงินได้ทั้งปีเกิน {r['file_threshold']:,} บาท) — "
                 "ยื่น ภ.ง.ด.90/91 ภายใน 31 มีนาคม ของปีถัดไป (ยื่นออนไลน์ได้ถึง 8 เมษายน)")
    else:
        b.append(f" เงินได้ทั้งปีไม่เกิน {r['file_threshold']:,} บาท — ไม่มีหน้าที่ต้องยื่นแบบ "
                 "(แต่ยื่นเพื่อขอคืนภาษีที่ถูกหักไว้ได้)")
    b.append(line)
    b.append(" แหล่งอ้างอิง:")
    for s in r["sources"]:
        b.append(f"  - {s}")
    b.append(f" หมายเหตุ: {r['disclaimer']}")
    return "\n".join(b)


# ─────────────────────────────────────────────────────────────────────────────
# 10) โหมดถาม-ตอบ (ใช้ง่ายสำหรับบุคคลทั่วไป)
# ─────────────────────────────────────────────────────────────────────────────
def ask_number(prompt: str, default: float = 0.0) -> float:
    raw = input(f"{prompt} [{default:,.0f}]: ").strip().replace(",", "")
    if not raw:
        return float(default)
    try:
        return _money(raw)
    except Exception:
        print("  ! ใส่ตัวเลขไม่ถูกต้อง ใช้ค่าเริ่มต้น")
        return float(default)


def ask_int(prompt: str, default: int = 0) -> int:
    return int(ask_number(prompt, default))


def ask_yes(prompt: str, default: bool = False) -> bool:
    raw = input(f"{prompt} (y/n) [{'y' if default else 'n'}]: ").strip().lower()
    if not raw:
        return default
    return raw in ("y", "yes", "ใช่", "ค")


def interactive(year: int = DEFAULT_YEAR) -> Person:
    print("\n=== โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (กรมสรรพากร) ===")
    print(f"ปีภาษี {year} — ใส่ตัวเลขเป็นบาท (เว้นว่าง = 0) ห้ามใส่เครื่องหมายอื่น\n")
    p = Person()
    print("[1] เงินได้พึงประเมินทั้งปี")
    p.salary = ask_number("  เงินเดือน/ค่าจ้าง/โบนัส (40(1))")
    p.service = ask_number("  รับจ้างทำของ/ค่าบริการ (40(2))")
    p.royalty = ask_number("  ค่าแห่งลิขสิทธิ์/ค่ากู๊ดวิลล์ (40(3))")
    p.interest = ask_number("  ดอกเบี้ย/เงินปันผล (40(4))")
    p.rent = ask_number("  ค่าเช่าทรัพย์สิน (40(5))")
    p.professional = ask_number("  วิชาชีพอิสระ (40(6))")
    if p.professional > 0:
        p.medical_professional = ask_yes("    เป็นวิชาชีพแพทย์/ทันตแพทย์/พยาบาล/เภสัชกร/เทคนิคการแพทย์/กายภาพบำบัด (หักเหมา 60%)?")
    p.contractor = ask_number("  รับเหมาก่อสร้าง (40(7))")
    p.business = ask_number("  ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))")

    print("\n[2] ค่าลดหย่อนครอบครัว")
    p.spouse_no_income = ask_yes("  คู่สมรสไม่มีเงินได้ (ลดหย่อน 60,000)")
    p.children = ask_int("  จำนวนบุตรชอบด้วยกฎหมาย (คน)")
    p.children_born_2561_plus = ask_int("  ในนั้นเป็นบุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 (คน)")
    p.adopted_children = ask_int("  จำนวนบุตรบุญธรรม (คน, ไม่เกิน 3)")
    p.parents = ask_int("  จำนวนบิดามารดาที่อุปการะ (คน, อายุ 60+ เงินได้ไม่เกิน 30,000)")
    p.disabled_dependents = ask_int("  จำนวนผู้พิการ/ทุพพลภาพที่อุปการะ (คน)")
    p.pregnancies = ask_int("  จำนวนครั้งที่ตั้งครรภ์/คลอดบุตรในปีนี้")
    if p.pregnancies:
        p.prenatal_expense = ask_number("    ค่าฝากครรภ์+คลอดบุตรรวม (ไม่เกิน 60,000/ครั้ง)")

    print("\n[3] ประกัน/IPD")
    p.life_insurance = ask_number("  เบี้ยประกันชีวิต+สะสมทรัพย์ (ไม่เกิน 100,000)")
    p.health_insurance = ask_number("  เบี้ยประกันสุขภาพตนเอง (ไม่เกิน 25,000)")
    p.parent_health_insurance = ask_number("  เบี้ยประกันสุขภาพบิดามารดา (ไม่เกิน 15,000)")
    if p.spouse_no_income:
        p.spouse_life_insurance = ask_number("  เบี้ยประกันชีวิตคู่สมรส (ไม่เกิน 10,000)")
    p.social_security = ask_number("  เงินสมทบประกันสังคมทั้งปี (ไม่เกิน 9,000)")

    print("\n[4] กองทุน/การลงทุนเพื่อลดหย่อน")
    p.provident_fund = ask_number("  เงินสะสมกองทุนสำรองเลี้ยงชีพ")
    p.gpf = ask_number("  เงินสะสม กบข.")
    p.rmf = ask_number("  ค่าซื้อหน่วยลงทุน RMF")
    p.ssf = ask_number("  ค่าซื้อหน่วยลงทุน SSF")
    p.nsf = ask_number("  เงินสะสม กอช. (ไม่เกิน 30,000)")
    p.pension_life_insurance = ask_number("  เบี้ยประกันชีวิตแบบบำนาญ")
    p.thai_esg = ask_number("  หน่วยลงทุน Thai ESG")
    p.social_enterprise = ask_number("  เงินลงทุนวิสาหกิจเพื่อสังคม")

    print("\n[5] บ้าน + มาตรการรัฐของปี")
    p.home_loan_interest = ask_number("  ดอกเบี้ยกู้ยืมเพื่อที่อยู่อาศัย (ไม่เกิน 100,000)")
    p.home_construction_cost = ask_number("  มูลค่าค่าจ้างก่อสร้างบ้านใหม่ (ล้านละหมื่น ไม่เกิน 100,000)")
    p.easy_e_receipt = ask_number("  Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568, ไม่เกิน 50,000)")
    p.travel_main_city = ask_number("  เที่ยวดีมีคืน — เมืองหลัก (ไม่เกิน 20,000)")
    p.travel_secondary_city = ask_number("  เที่ยวดีมีคืน — เมืองรอง (1.5 เท่า ไม่เกิน 30,000)")

    print("\n[6] บริจาค + ยกเว้นเงินได้ + ภาษีที่จ่ายไว้แล้ว")
    p.donation_general = ask_number("  เงินบริจาคทั่วไป")
    p.donation_education = ask_number("  เงินบริจาคการศึกษา/กีฬา/รพ.รัฐ (ได้ 2 เท่า)")
    p.donation_political = ask_number("  เงินบริจาคพรรคการเมือง (ไม่เกิน 10,000)")
    if ask_yes("  อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ (ยกเว้นเงินได้ไม่เกิน 190,000)?"):
        p.senior_or_disabled_exemption = 190_000
    p.withholding = ask_number("  ภาษีหัก ณ ที่จ่ายทั้งปี (ตามหนังสือรับรอง 50 ทวิ)")
    p.dividend_credit = ask_number("  เครดิตภาษีเงินปันผล/อื่น ๆ")
    return p


def demo() -> int:
    examples = [
        ("ตัวอย่าง 1 — พนักงานเงินเดือน 500,000 บาท/ปี (โสด)",
         [Person(salary=500_000, social_security=9_000)]),
        ("ตัวอย่าง 2 — ปล่อยเช่าอสังหาริมทรัพย์ 1,000,000 บาท/ปี (โสด)",
         [Person(rent=1_000_000)]),
        ("ตัวอย่าง 3 — คู่สมรสยื่นรวมกัน (เงินเดือน 900,000 + 600,000)",
         [Person(salary=900_000, life_insurance=100_000, social_security=9_000,
                 home_loan_interest=100_000, donation_education=20_000),
          Person(salary=600_000, social_security=9_000, provident_fund=90_000)]),
    ]
    for title, persons in examples:
        print("\n" + "=" * 72)
        print(" " + title)
        print("=" * 72)
        print(format_report(compute_pit(persons)))
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# 11) ชุดทดสอบมาตรฐาน (ยืนยันตัวเลขด้วยมือ + ใช้อ้างอิงเทียบกับเว็บ)
# ─────────────────────────────────────────────────────────────────────────────
def load_testcases(path: Optional[str] = None) -> List[Dict[str, Any]]:
    base = os.path.dirname(os.path.abspath(__file__))
    path = path or os.path.join(base, "testcases_thai_pit.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


def run_case(case: Dict[str, Any]) -> Dict[str, Any]:
    persons = []
    for raw in case["persons"]:
        allowed = {k: v for k, v in raw.items() if k in Person.__dataclass_fields__}
        persons.append(Person(**allowed))
    return compute_pit(persons, case.get("year", DEFAULT_YEAR))


def selftest(path: Optional[str] = None) -> int:
    cases = load_testcases(path)
    ok = 0
    print("ตรวจความถูกต้องของเครื่องคำนวณ (ชุดทดสอบมาตรฐาน)\n" + "-" * 72)
    for c in cases:
        r = run_case(c)
        errors = []
        for key, expected in c.get("expect", {}).items():
            got = r.get(key)
            if isinstance(expected, (int, float)) and isinstance(got, (int, float)):
                if abs(float(got) - float(expected)) > 0.01:
                    errors.append(f"{key}: ได้ {got:,.2f} · ควรเป็น {expected:,.2f}")
            elif got != expected:
                errors.append(f"{key}: ได้ {got!r} · ควรเป็น {expected!r}")
        if errors:
            print(f"✗ {c['name']}")
            for e in errors:
                print(f"    {e}")
        else:
            print(f"✓ {c['name']}")
            ok += 1
    print("-" * 72)
    print(f"ผ่าน {ok}/{len(cases)} กรณี")
    return 0 if ok == len(cases) else 1


# ─────────────────────────────────────────────────────────────────────────────
# 12) CLI
# ─────────────────────────────────────────────────────────────────────────────
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (อ้างอิงกรมสรรพากร)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--year", type=int, default=DEFAULT_YEAR, help="ปีภาษี (ค่าเริ่มต้น 2568)")
    ap.add_argument("--demo", action="store_true", help="แสดงตัวอย่างสำเร็จรูป")
    ap.add_argument("--selftest", action="store_true", help="ตรวจความถูกต้องกับชุดทดสอบ")
    ap.add_argument("--json-in", help="อ่านข้อมูลจากไฟล์ JSON")
    ap.add_argument("--json-out", help="บันทึกผลลัพธ์เป็น JSON")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()
    if args.demo:
        return demo()

    if args.json_in:
        with open(args.json_in, "r", encoding="utf-8") as f:
            payload = json.load(f)
        persons = [Person(**{k: v for k, v in raw.items() if k in Person.__dataclass_fields__})
                   for raw in payload.get("persons", [])]
        result = compute_pit(persons, payload.get("year", args.year))
    else:
        if len(sys.argv) == 1:
            result = compute_pit([interactive(args.year)], args.year)
        else:
            result = compute_pit([Person()], args.year)

    print(format_report(result))
    if args.json_out or args.json_in:
        out = args.json_out or (os.path.splitext(args.json_in)[0] + ".result.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\nบันทึกผลลัพธ์ JSON → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
