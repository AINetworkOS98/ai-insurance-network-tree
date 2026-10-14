#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thai_tax_calculator.py — โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ประเทศไทย)
=========================================================================
v2.0.0 — ปรับโครงสร้างการคำนวณให้ตรงกับ "แบบแสดงรายการ ภ.ง.ด.90" และ
โปรแกรมคำนวณภาษีของกรมสรรพากร (rd.go.th) ทุกข้อ เพื่อใช้คำนวณภาษีตามจริงก่อนยื่นแบบ

อ้างอิง
  • แบบ ภ.ง.ด.90 (ข้อ 1–23): https://www.rd.go.th/fileadmin/tax_pdf/pit/2567/201267PIT90.pdf
  • วิธีการคำนวณภาษีเงินได้บุคคลธรรมดาสิ้นปี (วิธีที่ 1 / วิธีที่ 2): https://rd.go.th/555.html
  • การหักค่าใช้จ่าย (อัตราเหมาแยกประเภทเงินได้): https://www.rd.go.th/556.html
  • ตารางสรุปการหักลดหย่อนและยกเว้นภาษี: https://www.rd.go.th/59674.html
  • อัตราภาษีเงินได้บุคคลธรรมดา (มาตรา 48): https://www.rd.go.th/59670.html

สิ่งที่แก้ให้ตรงกรมสรรพากร (เทียบ v1)
  1) 40(3) ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์: เหมา 50% "ไม่เกิน 100,000" (v1 ไม่มีเพดาน)
  2) 40(5) ค่าเช่า: แยกร้อยละตามประเภททรัพย์สิน 30% (อาคาร/แพ/ยานพาหนะ) ·
     20% (ที่ดินเกษตร) · 15% (ที่ดินอื่น) · 10% (ทรัพย์สินอื่น) — ตามตารางหักค่าใช้จ่าย
  3) 40(6): 60% (ประกอบโรคศิลปะ) / 30% (กฎหมาย วิศวกรรม สถาปัตย์ บัญชี ประณีตศิลป์)
  4) 40(8): เหมา 60% (ทั่วไป) / 40% (บางประเภทตามที่กรมสรรพากรกำหนด) / ตามจริง
  5) ภาษีวิธีที่ 2 (ข้อ 9) ใช้เมื่อเงินได้ไม่รวม 40(1) "ตั้งแต่ 120,000 บาทขึ้นไป" และถ้า
     คำนวณได้ "ไม่เกิน 5,000 บาท" → ยกเว้นวิธีที่ 2 ให้ใช้วิธีที่ 1 (หมายเหตุท้ายแบบ)
  6) ลำดับเงินบริจาคตามแบบ ข้อ 4 → ข้อ 6 (การศึกษา 2 เท่า ≤10% ของข้อ 3 ก่อน แล้ว
     บริจาคทั่วไป ≤10% ของข้อ 5) — v1 คิดเพดานพร้อมกัน
  7) เงินได้แยกรายแหล่งได้ (หลายนายจ้าง/หลายทรัพย์สิน) พร้อมภาษีหัก ณ ที่จ่ายรายแหล่ง
  8) หักภาษีที่ชำระไว้ครบตามข้อ 13: หัก ณ ที่จ่าย + เครดิตภาษีเงินปันผล + ภ.ง.ด.93 + ภ.ง.ด.94

วิธีใช้
  python thai_tax_calculator.py                 # ถาม-ตอบทีละขั้น
  python thai_tax_calculator.py --demo          # ตัวอย่างสำเร็จรูป
  python thai_tax_calculator.py --selftest      # ตรวจความถูกต้องกับชุดทดสอบมาตรฐาน
  python thai_tax_calculator.py --json-in in.json [--json-out out.json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

VERSION = "2.0.0"
DEFAULT_YEAR = 2568  # ปีภาษี 2568 (2025) → ยื่นแบบปี 2569

# ─────────────────────────────────────────────────────────────────────────────
# 1) อัตราภาษีขั้นบันได (แบบ ภ.ง.ด.90 ข้อ 8 — มาตรา 48(1))
# ─────────────────────────────────────────────────────────────────────────────
TAX_BRACKETS: List[Tuple[float, float]] = [
    (150_000, 0.00), (300_000, 0.05), (500_000, 0.10), (750_000, 0.15),
    (1_000_000, 0.20), (2_000_000, 0.25), (5_000_000, 0.30), (float("inf"), 0.35),
]

# ─────────────────────────────────────────────────────────────────────────────
# 2) ค่าใช้จ่าย (แบบข้อ 5 + ตารางการหักค่าใช้จ่ายของกรมสรรพากร)
# ─────────────────────────────────────────────────────────────────────────────
EXPENSE_RULES: Dict[str, Dict[str, Any]] = {
    "salary":       {"label": "เงินเดือน ค่าจ้าง โบนัส เบี้ยเลี้ยง (40(1))", "rate": 0.50, "cap": 100_000},
    "service":      {"label": "รับทำงานให้ ค่านายหน้า เบี้ยประชุม (40(2))", "rate": 0.50, "cap": 100_000},
    "royalty":      {"label": "ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์/สิทธิอย่างอื่น (40(3))", "rate": 0.50, "cap": 100_000},
    "interest":     {"label": "ดอกเบี้ย เงินปันผล ส่วนแบ่งกำไร (40(4))", "rate": 0.00, "cap": 0},
    "rent":         {"label": "ค่าเช่าทรัพย์สิน/ผิดสัญญาเช่าซื้อ (40(5))", "rate": 0.30, "cap": None},
    "professional": {"label": "วิชาชีพอิสระ (40(6))", "rate": 0.30, "cap": None},
    "contractor":   {"label": "รับเหมาก่อสร้าง (40(7))", "rate": 0.60, "cap": None},
    "business":     {"label": "ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))", "rate": 0.60, "cap": None},
}
SHARED_CAP_1_2 = 100_000   # 40(1)+(2) รวมกัน: ร้อยละ 50 ไม่เกิน 100,000 (แบบข้อ 5)
CAP_40_3 = 100_000         # 40(3): ร้อยละ 50 ไม่เกิน 100,000

# ประเภทย่อยที่มีอัตราเหมาต่างกัน (ตรงตาราง "การหักค่าใช้จ่าย" ของกรมสรรพากร)
VARIANT_RATES: Dict[str, Dict[str, Dict[str, Any]]] = {
    "rent": {
        "building":   {"rate": 0.30, "label": "บ้าน โรงเรือน สิ่งปลูกสร้าง แพ"},
        "vehicle":    {"rate": 0.30, "label": "ยานพาหนะ"},
        "agri_land":  {"rate": 0.20, "label": "ที่ดินที่ใช้ในการเกษตร"},
        "other_land": {"rate": 0.15, "label": "ที่ดินที่มิได้ใช้ในการเกษตร"},
        "other":      {"rate": 0.10, "label": "ทรัพย์สินอื่น"},
    },
    "professional": {
        "medical": {"rate": 0.60, "label": "ประกอบโรคศิลปะ (แพทย์ ทันตแพทย์ พยาบาล เภสัชกร ฯลฯ)"},
        "other":   {"rate": 0.30, "label": "กฎหมาย วิศวกรรม สถาปัตยกรรม บัญชี ประณีตศิลปกรรม"},
    },
    "business": {
        "general":   {"rate": 0.60, "label": "ธุรกิจทั่วไป"},
        "transport": {"rate": 0.40, "label": "บางประเภทตามที่กรมสรรพากรกำหนด"},
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# 3) เพดานค่าลดหย่อน ปีภาษี 2568 (แบบ ภ.ง.ด.90 + ใบแนบแสดงรายการลดหย่อน)
# ─────────────────────────────────────────────────────────────────────────────
LIM = {
    "personal": 60_000, "spouse": 60_000,
    "child": 30_000, "child_extra": 30_000,
    "adopted_child": 60_000, "adopted_max": 3,
    "prenatal": 60_000, "parent": 30_000, "disabled_dependent": 60_000,
    "life_insurance": 100_000, "health_insurance": 25_000, "life_health_combined": 100_000,
    "parent_health": 15_000, "spouse_life": 10_000, "social_security": 9_000,
    "pension_life": 200_000, "retirement_cap": 500_000, "nsf": 30_000,
    "thai_esg": 300_000, "social_enterprise": 100_000,
    "home_loan_interest": 100_000, "home_construction_exempt": 100_000,
    "easy_e_receipt": 50_000, "travel_main": 20_000, "travel_secondary": 30_000,
    "donation_political": 10_000, "senior_disabled_exemption": 190_000,
    "min_tax_rate": 0.005,        # วิธีที่ 2 (แบบข้อ 9)
    "min_tax_threshold": 120_000,  # ต้องมีเงินได้ 40(2)–(8) ตั้งแต่ 120,000 ขึ้นไป
    "min_tax_exempt": 5_000,       # วิธีที่ 2 ได้ไม่เกิน 5,000 → ยกเว้น ใช้วิธีที่ 1
}
PCT_RULES = {
    "provident_fund": 0.15, "gpf": 0.30, "teacher_fund": 0.15,
    "rmf": 0.30, "ssf": 0.30, "pension_life_insurance": 0.15,
    "thai_esg": 0.30, "thai_esgx": 0.30,
}
EFFECTIVE_YEARS = (2568, 2569)

SOURCES = [
    "แบบแสดงรายการ ภ.ง.ด.90 กรมสรรพากร (ข้อ 1–23): https://www.rd.go.th/fileadmin/tax_pdf/pit/2567/201267PIT90.pdf",
    "วิธีการคำนวณภาษีเงินได้บุคคลธรรมดาสิ้นปี (วิธีที่ 1 / วิธีที่ 2): https://rd.go.th/555.html",
    "การหักค่าใช้จ่าย (อัตราเหมาแยกประเภทเงินได้): https://www.rd.go.th/556.html",
    "ตารางสรุปการหักลดหย่อนและยกเว้นภาษี: https://www.rd.go.th/59674.html",
    "อัตราภาษีเงินได้บุคคลธรรมดา (มาตรา 48): https://www.rd.go.th/59670.html",
]


# ─────────────────────────────────────────────────────────────────────────────
# 4) โครงสร้างข้อมูล
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Person:
    # ── เงินได้: รายแหล่ง (ถ้ามี จะใช้แทนช่องยอดรวมด้านล่าง) ──
    income_items: List[Dict[str, Any]] = field(default_factory=list)
    salary: float = 0.0
    service: float = 0.0
    royalty: float = 0.0
    interest: float = 0.0
    rent: float = 0.0
    professional: float = 0.0
    contractor: float = 0.0
    business: float = 0.0
    medical_professional: bool = False
    actual_expense: Dict[str, float] = field(default_factory=dict)

    # ── ลดหย่อนส่วนตัว/ครอบครัว ──
    personal: bool = True
    spouse_no_income: bool = False
    children: int = 0
    children_born_2561_plus: int = 0
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

    # ── กองทุน/ลงทุน ──
    provident_fund: float = 0.0
    gpf: float = 0.0
    teacher_fund: float = 0.0
    rmf: float = 0.0
    ssf: float = 0.0
    nsf: float = 0.0
    thai_esg: float = 0.0
    thai_esgx: float = 0.0
    social_enterprise: float = 0.0

    # ── อสังหา + มาตรการรัฐของปี ──
    home_loan_interest: float = 0.0
    home_construction_cost: float = 0.0
    easy_e_receipt: float = 0.0
    travel_main_city: float = 0.0
    travel_secondary_city: float = 0.0
    other_measure_amount: float = 0.0

    # ── บริจาค ──
    donation_general: float = 0.0
    donation_education: float = 0.0
    donation_political: float = 0.0

    # ── ยกเว้นเงินได้ ──
    senior_or_disabled_exemption: float = 0.0

    # ── ภาษีที่ชำระไว้แล้ว (แบบข้อ 13) ──
    withholding: float = 0.0      # ยอดรวม (ใช้เมื่อไม่ได้กรอกเป็นรายแหล่ง)
    dividend_credit: float = 0.0  # เครดิตภาษีเงินปันผล
    pnd93: float = 0.0            # ภาษีชำระไว้ตาม ภ.ง.ด.93
    pnd94: float = 0.0            # ภาษีชำระไว้ตาม ภ.ง.ด.94 (ครึ่งปี)


@dataclass
class IncomeItem:
    """เงินได้ 1 แหล่ง = 1 บรรทัดในแบบ ภ.ง.ด.90"""
    category: str = "salary"
    amount: float = 0.0
    description: str = ""
    expense_mode: str = "standard"   # standard = หักเหมา | actual = หักตามจริง
    actual_expense: float = 0.0
    variant: str = ""
    withholding: float = 0.0

    def rate(self) -> float:
        if self.category in VARIANT_RATES:
            table = VARIANT_RATES[self.category]
            key = self.variant if self.variant in table else next(iter(table))
            return table[key]["rate"]
        return EXPENSE_RULES[self.category]["rate"]

    def rate_label(self) -> str:
        if self.category in VARIANT_RATES and self.variant in VARIANT_RATES[self.category]:
            return VARIANT_RATES[self.category][self.variant]["label"]
        return EXPENSE_RULES[self.category]["label"]


def _money(x: Any) -> float:
    """แปลงค่าเป็นตัวเลขเงิน (ติดลบ/ใช้ไม่ได้ = 0)"""
    try:
        v = float(x or 0)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if v < 0 else round(v, 2)


def build_items(p: Person) -> List[IncomeItem]:
    """รวมเงินได้เป็นรายแหล่ง — ใช้ income_items ถ้ามี ไม่งั้นสร้างจากช่องยอดรวม (เข้ากันได้กับ v1)"""
    items: List[IncomeItem] = []
    for raw in (p.income_items or []):
        if not isinstance(raw, dict):
            continue
        cat = str(raw.get("category") or "")
        if cat not in EXPENSE_RULES:
            continue
        items.append(IncomeItem(
            category=cat, amount=_money(raw.get("amount")),
            description=str(raw.get("description") or ""),
            expense_mode=str(raw.get("expense_mode") or "standard"),
            actual_expense=_money(raw.get("actual_expense")),
            variant=str(raw.get("variant") or ""),
            withholding=_money(raw.get("withholding")),
        ))
    if any(i.amount > 0 for i in items):
        return items

    for cat in ("salary", "service", "royalty", "interest", "rent", "professional", "contractor", "business"):
        amt = _money(getattr(p, cat))
        if amt <= 0:
            continue
        variant = "medical" if (cat == "professional" and p.medical_professional) else ""
        actual = _money(p.actual_expense.get(cat, 0))
        items.append(IncomeItem(category=cat, amount=amt,
                                expense_mode="actual" if actual > 0 else "standard",
                                actual_expense=actual, variant=variant))
    return items


# ─────────────────────────────────────────────────────────────────────────────
# 5) ค่าใช้จ่าย (แบบข้อ 5) — คิดรายแหล่ง รวมเป็นบรรทัดตาม (ประเภท, วิธีหัก)
# ─────────────────────────────────────────────────────────────────────────────
def compute_expenses(items: List[IncomeItem]) -> Dict[str, Any]:
    groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for it in items:
        if it.amount <= 0:
            continue
        if it.category == "interest":
            rate, how = 0.0, "หักค่าใช้จ่ายไม่ได้"
        elif it.expense_mode == "actual":
            rate, how = None, f"ตามจริง (จ่ายจริง {it.actual_expense:,.0f} บาท)"
        else:
            rate = it.rate()
            extra = f" ({it.rate_label()})" if it.variant else ""
            how = f"เหมา {int(round(rate * 100))}%{extra}"
        g = groups.setdefault((it.category, how), {"category": it.category, "how": how,
                                                   "rate": rate, "gross": 0.0, "ded": 0.0})
        g["gross"] += it.amount
        g["ded"] += min(it.actual_expense, it.amount) if rate is None else it.amount * rate

    # เพดาน: 40(1)+(2) รวมกัน ≤ 100,000 · 40(3) ≤ 100,000
    cap12 = sum(g["ded"] for g in groups.values() if g["category"] in ("salary", "service"))
    if cap12 > SHARED_CAP_1_2:
        excess = cap12 - SHARED_CAP_1_2
        for g in sorted(groups.values(), key=lambda x: -x["ded"]):
            if g["category"] in ("salary", "service") and excess > 0:
                cut = min(g["ded"], excess)
                g["ded"] -= cut
                excess -= cut
        for g in groups.values():
            if g["category"] in ("salary", "service"):
                g["how"] += " · จำกัดเพดานรวม 40(1)+(2) 100,000 บาท"
                break
    cap3 = sum(g["ded"] for g in groups.values() if g["category"] == "royalty")
    if cap3 > CAP_40_3:
        excess = cap3 - CAP_40_3
        for g in groups.values():
            if g["category"] == "royalty" and excess > 0:
                cut = min(g["ded"], excess)
                g["ded"] -= cut
                excess -= cut
                g["how"] += " · จำกัดเพดาน 40(3) 100,000 บาท"

    lines = [{"group": g["category"],
              "label": f"{EXPENSE_RULES[g['category']]['label']} — {g['how']}",
              "gross": round(g["gross"], 2), "deductible": round(g["ded"], 2)}
             for g in groups.values()]
    lines.sort(key=lambda x: list(EXPENSE_RULES).index(x["group"]))
    return {"lines": lines, "total": round(sum(l["deductible"] for l in lines), 2)}


# ─────────────────────────────────────────────────────────────────────────────
# 6) ค่าลดหย่อน (ใบแนบแสดงรายการลดหย่อนและยกเว้นหลังจากหักค่าใช้จ่าย)
# ─────────────────────────────────────────────────────────────────────────────
def compute_allowances(p: Person, assessable: float, married_combined: bool) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    notes: List[str] = []

    def add(code: str, label: str, amount: float, note: str = "") -> None:
        amount = round(max(0.0, amount), 2)
        if amount > 0:
            items.append({"code": code, "label": label, "amount": amount, "note": note})

    if p.personal:
        add("personal", "ค่าลดหย่อนส่วนตัว", LIM["personal"])
    if p.spouse_no_income and not married_combined:
        add("spouse", "ค่าลดหย่อนคู่สมรส (ไม่มีเงินได้)", LIM["spouse"],
            "คู่สมรสมีเงินได้พึงประเมินไม่เกิน 60,000 บาท/ปี และจดทะเบียนสมรสถูกต้อง")
    elif p.spouse_no_income and married_combined:
        notes.append("ยื่นรวมกับคู่สมรส → ใช้สิทธิลดหย่อนคู่สมรสไม่ได้ (แต่หักส่วนตัวของคู่สมรส 60,000 บาทได้)")

    kids, kids_extra = _money(p.children), _money(p.children_born_2561_plus)
    add("children",
        f"ค่าลดหย่อนบุตร ({kids:,.0f} คน"
        + (f" + บุตรคนที่ 2 ขึ้นไปเกิดตั้งแต่ 2561 อีก {kids_extra:,.0f} คน" if kids_extra else "") + ")",
        kids * LIM["child"] + kids_extra * LIM["child_extra"],
        "บุตรชอบด้วยกฎหมาย คนละ 30,000 · บุตรคนที่ 2+ เกิดตั้งแต่ปี 2561 ได้เพิ่มอีก 30,000")
    adopted = min(_money(p.adopted_children), LIM["adopted_max"])
    add("adopted_children", f"ค่าลดหย่อนบุตรบุญธรรม ({adopted:,.0f} คน)", adopted * LIM["adopted_child"],
        "คนละ 60,000 บาท ไม่เกิน 3 คน")
    if int(_money(p.pregnancies)) > 0:
        add("prenatal", f"ค่าฝากครรภ์และค่าคลอดบุตร ({int(_money(p.pregnancies))} ครั้ง)",
            min(_money(p.prenatal_expense), LIM["prenatal"] * max(1, int(_money(p.pregnancies)))),
            "ตามที่จ่ายจริง ไม่เกิน 60,000 บาทต่อการตั้งครรภ์ 1 ครั้ง")
    add("parents", f"ค่าอุปการะบิดามารดา ({_money(p.parents):,.0f} คน)", _money(p.parents) * LIM["parent"],
        "คนละ 30,000 บาท — อายุ 60 ปีขึ้นไป และมีเงินได้ไม่เกิน 30,000 บาท/ปี")
    add("disabled_dependents", f"ค่าอุปการะผู้พิการ/ทุพพลภาพ ({_money(p.disabled_dependents):,.0f} คน)",
        _money(p.disabled_dependents) * LIM["disabled_dependent"], "คนละ 60,000 บาท")

    life = min(_money(p.life_insurance), LIM["life_insurance"])
    health = min(_money(p.health_insurance), LIM["health_insurance"])
    cut = max(0.0, life + health - LIM["life_health_combined"])
    if cut > 0:
        health = max(0.0, health - cut)
        cut = max(0.0, life + health - LIM["life_health_combined"])
        if cut > 0:
            life = max(0.0, life - cut)
        notes.append("เบี้ยประกันชีวิต + ประกันสุขภาพ รวมกันได้ไม่เกิน 100,000 บาท/ปี (ตัดส่วนเกินให้แล้ว)")
    add("life_insurance", "เบี้ยประกันชีวิต/สะสมทรัพย์", life,
        "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท · กรมธรรม์อายุความคุ้มครอง 10 ปีขึ้นไป")
    add("health_insurance", "เบี้ยประกันสุขภาพ (ตนเอง)", health,
        "ไม่เกิน 25,000 บาท และรวมกับประกันชีวิตไม่เกิน 100,000 บาท")
    add("parent_health_insurance", "เบี้ยประกันสุขภาพบิดามารดา",
        min(_money(p.parent_health_insurance), LIM["parent_health"]), "ไม่เกิน 15,000 บาท")
    if not married_combined:
        add("spouse_life_insurance", "เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)",
            min(_money(p.spouse_life_insurance), LIM["spouse_life"]), "ไม่เกิน 10,000 บาท")
    add("social_security", "เงินสมทบกองทุนประกันสังคม (มาตรา 33)",
        min(_money(p.social_security), LIM["social_security"]), "ตามที่จ่ายจริง ไม่เกิน 9,000 บาท/ปี")

    orders = [
        ("provident_fund", "เงินสะสมกองทุนสำรองเลี้ยงชีพ", LIM["retirement_cap"], "15% ของเงินได้ ไม่เกิน 500,000"),
        ("gpf", "เงินสะสม กบข.", LIM["retirement_cap"], "30% ของเงินได้ ไม่เกิน 500,000"),
        ("teacher_fund", "เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน", LIM["retirement_cap"], "15% ของเงินได้ ไม่เกิน 500,000"),
        ("pension_life_insurance", "เบี้ยประกันชีวิตแบบบำนาญ", LIM["pension_life"], "15% ของเงินได้ ไม่เกิน 200,000"),
        ("rmf", "ค่าซื้อหน่วยลงทุน RMF", LIM["retirement_cap"], "30% ของเงินได้ ไม่เกิน 500,000"),
        ("ssf", "ค่าซื้อหน่วยลงทุน SSF", 200_000, "30% ของเงินได้ ไม่เกิน 200,000"),
    ]
    retirement: List[Dict[str, Any]] = []
    for key, label, cap, note in orders:
        raw = _money(getattr(p, key))
        if raw <= 0:
            continue
        retirement.append({"key": key, "label": label,
                           "amount": min(raw, assessable * PCT_RULES[key], cap), "note": note})
    over = sum(r["amount"] for r in retirement) - LIM["retirement_cap"]
    if over > 0:
        for r in reversed(retirement):
            if over <= 0:
                break
            cut_amt = min(r["amount"], over)
            r["amount"] -= cut_amt
            over -= cut_amt
        notes.append("กองทุนเกษียณ (สำรองเลี้ยงชีพ/กบข./สงเคราะห์ครู/ประกันบำนาญ/RMF/SSF) "
                     "รวมกันไม่เกิน 500,000 บาท/ปี — ปรับลดส่วนเกินให้แล้ว")
    for r in retirement:
        add(r["key"], r["label"], r["amount"], r["note"])

    add("nsf", "เงินสะสมกองทุนการออมแห่งชาติ (กอช.)", min(_money(p.nsf), LIM["nsf"]),
        "ตามที่จ่ายจริง ไม่เกิน 30,000 บาท")
    add("thai_esg", "ค่าซื้อหน่วยลงทุน Thai ESG", min(_money(p.thai_esg), assessable * 0.30, LIM["thai_esg"]),
        "30% ของเงินได้ ไม่เกิน 300,000 บาท (ถือไม่น้อยกว่า 5 ปี)")
    add("thai_esgx", "ค่าซื้อหน่วยลงทุน Thai ESGX (เฉพาะปีภาษี 2568)",
        min(_money(p.thai_esgx), assessable * 0.30, 300_000), "ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568")
    add("social_enterprise", "เงินลงทุนวิสาหกิจเพื่อสังคม (Social Enterprise)",
        min(_money(p.social_enterprise), LIM["social_enterprise"]), "ไม่เกิน 100,000 บาท")

    add("home_loan_interest", "ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย",
        min(_money(p.home_loan_interest), LIM["home_loan_interest"]), "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท")
    add("easy_e_receipt", "มาตรการ Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)",
        min(_money(p.easy_e_receipt), LIM["easy_e_receipt"]), "ไม่เกิน 50,000 บาท ต้องมี e-Tax Invoice")
    add("travel_main_city", "เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองหลัก (29 ต.ค.–15 ธ.ค. 2568)",
        min(_money(p.travel_main_city), LIM["travel_main"]), "1 เท่าของที่จ่ายจริง ไม่เกิน 20,000 บาท")
    add("travel_secondary_city", "เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองรอง 55 จังหวัด",
        min(min(_money(p.travel_secondary_city), LIM["travel_main"]) * 1.5, LIM["travel_secondary"]),
        "1.5 เท่าของที่จ่ายจริง (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000 บาท")
    add("other_measure_amount", "มาตรการรัฐอื่นของปีภาษี (เช่น ค่าติดตั้งโซลาร์รูฟท็อป)",
        _money(p.other_measure_amount), "ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน")

    return {"items": items, "subtotal": round(sum(i["amount"] for i in items), 2), "notes": notes}


# ─────────────────────────────────────────────────────────────────────────────
# 7) ภาษีขั้นบันได (แบบข้อ 8)
# ─────────────────────────────────────────────────────────────────────────────
def progressive_tax(net_income: float) -> Dict[str, Any]:
    net = max(0.0, net_income)
    tax = 0.0
    lower = 0.0
    steps: List[Dict[str, Any]] = []
    for upper, rate in TAX_BRACKETS:
        if net <= lower:
            break
        amount = min(net, upper) - lower
        step_tax = amount * rate
        tax += step_tax
        steps.append({
            "range": f"{'0' if lower == 0 else f'{lower:,.0f}+1'} – {'ขึ้นไป' if upper == float('inf') else f'{upper:,.0f}'}",
            "rate": rate, "amount": round(amount, 2), "tax": round(step_tax, 2),
        })
        lower = upper
    return {"tax": round(tax, 2), "steps": steps, "marginal_rate": steps[-1]["rate"] if steps else 0.0}


# ─────────────────────────────────────────────────────────────────────────────
# 8) เครื่องยนต์หลัก — เดินตามแบบ ภ.ง.ด.90 ข้อ 1 → ข้อ 14
# ─────────────────────────────────────────────────────────────────────────────
def compute_pit(persons: List[Person], year: int = DEFAULT_YEAR) -> Dict[str, Any]:
    """
    คำนวณภาษีเงินได้บุคคลธรรมดา
      persons = [ผู้เสียภาษี]           → ยื่นคนเดียว (ภ.ง.ด.90/91)
      persons = [ผู้เสียภาษี, คู่สมรส] → ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)
    """
    if not persons:
        raise ValueError("ต้องมีข้อมูลผู้เสียภาษีอย่างน้อย 1 คน")

    married_combined = len(persons) > 1

    # ── ข้อ 1–7: เงินได้พึงประเมิน + ค่าใช้จ่าย (คิดแยกคน) ──
    gross_by_cat: Dict[str, float] = {k: 0.0 for k in EXPENSE_RULES}
    expense_lines: List[Dict[str, Any]] = []
    expenses_total = 0.0
    item_rows: List[Dict[str, Any]] = []
    credits_from_items = 0.0
    credits_flat = 0.0
    for idx, p in enumerate(persons):
        person_items = build_items(p)
        has_items = any(i.amount > 0 for i in person_items)
        for it in person_items:
            gross_by_cat[it.category] += it.amount
            if it.amount <= 0:
                continue
            if has_items:
                credits_from_items += it.withholding
            item_rows.append({
                "owner": "คู่สมรส" if (married_combined and idx > 0) else "ผู้มีเงินได้",
                "category": it.category, "category_label": EXPENSE_RULES[it.category]["label"],
                "description": it.description, "amount": round(it.amount, 2),
                "variant": it.variant,
                "variant_label": it.rate_label() if it.variant else "",
                "expense_mode": it.expense_mode, "withholding": round(it.withholding, 2),
            })
        if not has_items:
            credits_flat += _money(p.withholding)
        exp = compute_expenses(person_items)
        for l in exp["lines"]:
            expense_lines.append({**l, "label": ("(คู่สมรส) " if (married_combined and idx > 0) else "") + l["label"]})
        expenses_total += exp["total"]

    gross_total = round(sum(gross_by_cat.values()), 2)
    expenses_total = round(expenses_total, 2)
    income_after_expense = round(max(0.0, gross_total - expenses_total), 2)   # แบบข้อ 1

    # ── เงินได้ที่ได้รับยกเว้น (หักก่อนคิดภาษี) ──
    exemptions: List[Dict[str, Any]] = []
    senior_cap = LIM["senior_disabled_exemption"] * (2 if married_combined else 1)
    senior_exempt = min(sum(_money(p.senior_or_disabled_exemption) for p in persons), senior_cap)
    if senior_exempt > 0:
        exemptions.append({"label": "ยกเว้นเงินได้ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ",
                           "amount": round(senior_exempt, 2), "note": "ไม่เกิน 190,000 บาท/ปี ต่อคน"})
    construction = sum(_money(p.home_construction_cost) for p in persons)
    if construction > 0:
        exemptions.append({"label": "ยกเว้นเงินได้ค่าจ้างก่อสร้างบ้านใหม่ (มาตรการล้านละหมื่น)",
                           "amount": round(min(construction // 1_000_000 * 10_000, LIM["home_construction_exempt"]), 2),
                           "note": "10,000 บาทต่อค่าก่อสร้าง 1,000,000 (ไม่เกิน 100,000) สัญญา 9 เม.ย. 2567–31 ธ.ค. 2568"})
    exemptions_total = round(sum(e["amount"] for e in exemptions), 2)

    # ── ข้อ 2: ค่าลดหย่อน (ยกเว้นเงินบริจาค) ──
    allowance_items: List[Dict[str, Any]] = []
    allowance_notes: List[str] = []
    for idx, p in enumerate(persons):
        q = p
        if idx > 0:   # ลดหย่อนระดับครอบครัวนับครั้งเดียวที่ผู้ยื่นหลัก
            q = Person(**{**asdict(p), "children": 0, "children_born_2561_plus": 0, "adopted_children": 0,
                          "pregnancies": 0, "prenatal_expense": 0, "parents": 0, "disabled_dependents": 0,
                          "spouse_no_income": False})
        allow = compute_allowances(q, income_after_expense, married_combined)
        for it in allow["items"]:
            allowance_items.append({**it, "label": ("(คู่สมรส) " if (married_combined and idx > 0) else "") + it["label"]})
        allowance_notes.extend(allow["notes"])
    allowances_before_donation = round(sum(i["amount"] for i in allowance_items), 2)

    # ── ข้อ 3–6: เงินบริจาคตามลำดับในแบบ (การศึกษา 2 เท่า ก่อน แล้วบริจาคทั่วไป) ──
    base3 = max(0.0, income_after_expense - exemptions_total - allowances_before_donation)   # ข้อ 3
    cap_edu = base3 * 0.10
    don_edu_actual = sum(_money(p.donation_education) for p in persons)
    don_edu = min(don_edu_actual * 2, cap_edu)                                              # ข้อ 4
    base5 = max(0.0, base3 - don_edu)                                                        # ข้อ 5
    cap_gen = base5 * 0.10
    don_gen_actual = sum(_money(p.donation_general) for p in persons)
    don_gen = min(don_gen_actual, cap_gen)                                                   # ข้อ 6
    don_pol = min(sum(_money(p.donation_political) for p in persons), LIM["donation_political"])
    if don_edu > 0:
        allowance_items.append({"code": "donation_education",
                                "label": f"เงินบริจาคสนับสนุนการศึกษา/กีฬา/สถานพยาบาลรัฐ (2 เท่าของ {don_edu_actual:,.0f})",
                                "amount": round(don_edu, 2),
                                "note": f"แบบข้อ 4 — ไม่เกิน 10% ของข้อ 3 ({cap_edu:,.0f} บาท)"})
        if don_edu_actual * 2 > cap_edu:
            allowance_notes.append("เงินบริจาคการศึกษา 2 เท่า ถูกจำกัดด้วยเพดาน 10% ของเงินได้หลังหักค่าใช้จ่ายและลดหย่อน (แบบข้อ 4)")
    if don_gen > 0:
        allowance_items.append({"code": "donation_general", "label": "เงินบริจาคทั่วไป (1 เท่า)",
                                "amount": round(don_gen, 2),
                                "note": f"แบบข้อ 6 — ไม่เกิน 10% ของข้อ 5 ({cap_gen:,.0f} บาท)"})
        if don_gen_actual > cap_gen:
            allowance_notes.append("เงินบริจาคทั่วไปถูกจำกัดด้วยเพดาน 10% ของเงินได้คงเหลือหลังหักบริจาคการศึกษา (แบบข้อ 6)")
    if don_pol > 0:
        allowance_items.append({"code": "donation_political", "label": "เงินบริจาคให้พรรคการเมือง",
                                "amount": round(don_pol, 2), "note": "ไม่เกิน 10,000 บาท"})
    allowances_total = round(sum(i["amount"] for i in allowance_items), 2)

    # ── ข้อ 7: เงินได้สุทธิ ──
    net_income = round(max(0.0, base5 - don_gen - don_pol), 2)

    # ── ข้อ 8–10: วิธีที่ 1 (ขั้นบันได) เทียบ วิธีที่ 2 (0.5% ของเงินได้ 40(2)–(8)) ──
    bracket = progressive_tax(net_income)
    tax_method1 = bracket["tax"]
    gross_2_to_8 = round(gross_total - gross_by_cat["salary"], 2)
    method2_applies = gross_2_to_8 >= LIM["min_tax_threshold"]
    tax_method2 = round(gross_2_to_8 * LIM["min_tax_rate"], 2)
    method2_used = bool(method2_applies and tax_method2 > LIM["min_tax_exempt"] and tax_method2 > tax_method1)
    if not method2_applies:
        method2_note = (f"เงินได้ไม่รวม 40(1) = {gross_2_to_8:,.2f} บาท ไม่ถึง 120,000 บาท "
                        "→ ไม่ต้องคำนวณภาษีวิธีที่ 2 (แบบข้อ 9)")
    elif tax_method2 <= LIM["min_tax_exempt"]:
        method2_note = (f"ภาษีวิธีที่ 2 คำนวณได้ {tax_method2:,.2f} บาท ไม่เกิน 5,000 บาท "
                        "→ ได้รับยกเว้นภาษีวิธีที่ 2 ใช้จำนวนภาษีตามวิธีที่ 1 (หมายเหตุท้ายแบบข้อ 9)")
    else:
        method2_note = ""
    tax_before_credit = tax_method2 if method2_used else tax_method1

    # ── ข้อ 13: หัก ภาษีหัก ณ ที่จ่าย + เครดิตภาษี + ภ.ง.ด.93 + ภ.ง.ด.94 ──
    credits = round(credits_from_items + credits_flat
                    + sum(_money(p.dividend_credit) for p in persons)
                    + sum(_money(p.pnd93) + _money(p.pnd94) for p in persons), 2)
    net_payable = round(tax_before_credit - credits, 2)

    salary_only = gross_2_to_8 <= 0
    threshold = 60_000 if salary_only else 120_000

    return {
        "program": "thai_tax_calculator.py", "version": VERSION, "year": year,
        "filing_mode": "ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)" if married_combined else "ยื่นคนเดียว (ภ.ง.ด.90/91)",
        "form_reference": "โครงสร้างและลำดับการคำนวณตามแบบ ภ.ง.ด.90 ของกรมสรรพากร (ข้อ 1–14)",
        "income_items": item_rows,
        "gross_by_category": {EXPENSE_RULES[k]["label"]: round(v, 2) for k, v in gross_by_cat.items() if v > 0},
        "gross_total": gross_total,
        "expense_lines": expense_lines, "expenses_total": expenses_total,
        "income_after_expense": income_after_expense,
        "exemptions": exemptions, "exemptions_total": exemptions_total,
        "allowance_items": allowance_items, "allowances_total": allowances_total,
        "allowance_notes": allowance_notes,
        "base_after_allowances": round(base3, 2),
        "donation_caps": {"education_10pct_of_item3": round(cap_edu, 2),
                          "general_10pct_of_item5": round(cap_gen, 2)},
        "net_income": net_income,
        "bracket_steps": bracket["steps"], "tax_by_bracket": tax_method1,
        "marginal_rate": bracket["marginal_rate"],
        "tax_method1": tax_method1, "tax_method2": tax_method2,
        "method2_applies": method2_applies, "method2_note": method2_note,
        "min_tax_05pct": tax_method2, "min_tax_applied": method2_used,
        "tax_before_credit": round(tax_before_credit, 2),
        "tax_credits": credits, "withholding_total": round(credits_from_items + credits_flat, 2),
        "net_payable": net_payable,
        "result": ("ต้องชำระเพิ่ม" if net_payable > 0.5 else ("ขอคืนภาษี" if net_payable < -0.5 else "ไม่มีภาษีต้องชำระ/ขอคืน")),
        "must_file": gross_total > threshold, "file_threshold": threshold,
        "sources": SOURCES,
        "disclaimer": ("ผลคำนวณนี้ทำตามหลักเกณฑ์และลำดับการคำนวณในแบบ ภ.ง.ด.90 ของกรมสรรพากร "
                       "เพื่อใช้ประมาณการภาษีของตนเองก่อนยื่นแบบ ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — "
                       "กรณีมีเงินได้หลายประเภท/สิทธิพิเศษ โปรดตรวจสอบกับสำนักงานสรรพากรหรือผู้ทำบัญชีก่อนยื่นแบบ"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9) รายงานตามลำดับข้อของแบบ ภ.ง.ด.90
# ─────────────────────────────────────────────────────────────────────────────
def format_report(r: Dict[str, Any]) -> str:
    b: List[str] = []
    line = "─" * 78
    b.append(line)
    b.append(f" การคำนวณภาษีเงินได้บุคคลธรรมดา · ปีภาษี {r['year']} · {r['filing_mode']}")
    b.append(f" โปรแกรม {r['program']} v{r['version']} · {r['form_reference']}")
    b.append(line)
    b.append(" [เงินได้พึงประเมิน รายแหล่ง — แบบ ภ.ง.ด.90 ข้อ 1–7]")
    for it in r["income_items"]:
        desc = f" — {it['description']}" if it["description"] else ""
        extra = f"  (หัก ณ ที่จ่าย {it['withholding']:,.2f})" if it["withholding"] else ""
        b.append(f"    • {it['category_label']}{desc}")
        b.append(f"      {it['amount']:>16,.2f}{extra}")
    b.append(f"    {'รวมเงินได้พึงประเมินทั้งปี':<54} {r['gross_total']:>15,.2f}")
    b.append("")
    b.append(" [หักค่าใช้จ่าย — แบบข้อ 5]")
    for l in r["expense_lines"]:
        b.append(f"    • {l['label'][:66]}")
        b.append(f"      {l['deductible']:>16,.2f}")
    b.append(f"    {'รวมค่าใช้จ่าย':<54} {r['expenses_total']:>15,.2f}")
    b.append(f"    ข้อ 1 เงินได้หลังจากหักค่าใช้จ่าย{' ' * 34}{r['income_after_expense']:>15,.2f}")
    if r["exemptions"]:
        b.append("")
        b.append(" [เงินได้ที่ได้รับยกเว้น]")
        for e in r["exemptions"]:
            b.append(f"    • {e['label'][:66]:<68} {e['amount']:>12,.2f}")
        b.append(f"    {'รวมยกเว้น':<54} {r['exemptions_total']:>15,.2f}")
    b.append("")
    b.append(" [ค่าลดหย่อน — แบบข้อ 2 และข้อ 4/6 (เงินบริจาค)]")
    for i in r["allowance_items"]:
        b.append(f"    • {i['label'][:62]:<64} {i['amount']:>12,.2f}")
    b.append(f"    {'รวมค่าลดหย่อน':<54} {r['allowances_total']:>15,.2f}")
    b.append(f"    ข้อ 3 คงเหลือหลังหักค่าลดหย่อน{' ' * 36}{r['base_after_allowances']:>15,.2f}")
    b.append(f"      เพดานเงินบริจาค: ข้อ 4 ≤ {r['donation_caps']['education_10pct_of_item3']:,.2f} บาท · "
             f"ข้อ 6 ≤ {r['donation_caps']['general_10pct_of_item5']:,.2f} บาท")
    b.append(f"    ข้อ 7 เงินได้สุทธิ{' ' * 49}{r['net_income']:>15,.2f}")
    b.append("")
    b.append(" [คำนวณภาษี]")
    for s in r["bracket_steps"]:
        b.append(f"    • ข้อ 8 ขั้น {s['range']:<20} {int(s['rate'] * 100):>3}% × {s['amount']:>14,.2f} = {s['tax']:>12,.2f}")
    b.append(f"    ข้อ 8 ภาษีวิธีที่ 1 (จากเงินได้สุทธิ){' ' * 31}{r['tax_method1']:>15,.2f}")
    b.append(f"    ข้อ 9 ภาษีวิธีที่ 2 (0.5% ของเงินได้ 40(2)–(8)){' ' * 22}{r['tax_method2']:>15,.2f}")
    if r["method2_note"]:
        b.append(f"       ℹ {r['method2_note']}")
    b.append(f"    ข้อ 10 ภาษีที่ต้องชำระ (ใช้วิธีที่ {'2' if r['min_tax_applied'] else '1'}){' ' * 30}{r['tax_before_credit']:>15,.2f}")
    if r["tax_credits"]:
        b.append(f"    ข้อ 13 หัก ภาษีหัก ณ ที่จ่าย/เครดิตภาษี/ภ.ง.ด.93,94{' ' * 20}{-r['tax_credits']:>15,.2f}")
    b.append(line)
    if r["net_payable"] > 0.5:
        b.append(f" ข้อ 14 สรุป: ต้องชำระภาษีเพิ่ม {r['net_payable']:,.2f} บาท")
    elif r["net_payable"] < -0.5:
        b.append(f" ข้อ 14 สรุป: ชำระไว้เกิน — ขอคืนภาษีได้ {abs(r['net_payable']):,.2f} บาท")
    else:
        b.append(" ข้อ 14 สรุป: ไม่มีภาษีต้องชำระเพิ่ม และไม่มีภาษีขอคืน")
    if r["must_file"]:
        b.append(f" ต้องยื่นแบบ (เงินได้ทั้งปีเกิน {r['file_threshold']:,} บาท) — ภายใน 31 มี.ค. ของปีถัดไป (ออนไลน์ถึง 8 เม.ย.)")
    else:
        b.append(f" เงินได้ทั้งปีไม่ถึง {r['file_threshold']:,} บาท — ไม่มีหน้าที่ต้องยื่นแบบ (ยื่นเพื่อขอคืนภาษีได้)")
    b.append(line)
    b.append(" แหล่งอ้างอิง:")
    for s in r["sources"]:
        b.append(f"  - {s}")
    b.append(f" หมายเหตุ: {r['disclaimer']}")
    return "\n".join(b)


# ─────────────────────────────────────────────────────────────────────────────
# 10) โหมดถาม-ตอบ
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
    return default if not raw else raw in ("y", "yes", "ใช่", "ค")


CATS: List[Tuple[str, str]] = [
    ("salary", "เงินเดือน ค่าจ้าง โบนัส (40(1))"), ("service", "รับทำงานให้ ค่านายหน้า (40(2))"),
    ("royalty", "ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์ (40(3))"), ("interest", "ดอกเบี้ย/เงินปันผล (40(4))"),
    ("rent", "ค่าเช่าทรัพย์สิน (40(5))"), ("professional", "วิชาชีพอิสระ (40(6))"),
    ("contractor", "รับเหมาก่อสร้าง (40(7))"), ("business", "ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))"),
]


def interactive(year: int = DEFAULT_YEAR) -> Person:
    print("\n=== โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ตามแบบ ภ.ง.ด.90 กรมสรรพากร) ===")
    print(f"ปีภาษี {year} — ใส่ตัวเลขเป็นบาท (เว้นว่าง = 0)\n")
    p = Person()
    print("[ข้อ 1–7] เงินได้พึงประเมิน — กรอกได้หลายแหล่ง (หลายนายจ้าง/หลายทรัพย์สิน)")
    items: List[Dict[str, Any]] = []
    while True:
        print("\n  ประเภทเงินได้:")
        for i, (_, label) in enumerate(CATS, 1):
            print(f"    {i}) {label}")
        try:
            sel = int(input("  หมายเลข (0 = จบการกรอกเงินได้): ").strip() or "0")
        except ValueError:
            sel = 0
        if sel <= 0 or sel > len(CATS):
            break
        cat = CATS[sel - 1][0]
        item: Dict[str, Any] = {"category": cat,
                                "description": input("  รายละเอียด/ชื่อผู้จ่าย (ไม่บังคับ): ").strip()}
        item["amount"] = ask_number("  จำนวนเงินทั้งปี")
        if cat in VARIANT_RATES:
            keys = list(VARIANT_RATES[cat].keys())
            print("  ประเภทย่อย:")
            for i, k in enumerate(keys, 1):
                print(f"    {i}) {VARIANT_RATES[cat][k]['label']} — เหมา {int(round(VARIANT_RATES[cat][k]['rate'] * 100))}%")
            idx = ask_int("  เลือกหมายเลข", 1)
            item["variant"] = keys[min(max(idx, 1), len(keys)) - 1]
        if cat != "interest" and ask_yes("  หักค่าใช้จ่ายตามจริง (ไม่ = ใช้เหมา)", False):
            item["expense_mode"] = "actual"
            item["actual_expense"] = ask_number("  ค่าใช้จ่ายตามจริง")
        item["withholding"] = ask_number("  ภาษีหัก ณ ที่จ่ายของแหล่งนี้")
        items.append(item)
        if not ask_yes("  เพิ่มเงินได้อีกรายการไหม", True):
            break
    p.income_items = items

    print("\n[ลดหย่อนครอบครัว]")
    p.spouse_no_income = ask_yes("  คู่สมรสไม่มีเงินได้ (ลดหย่อน 60,000)")
    p.children = ask_int("  จำนวนบุตรชอบด้วยกฎหมาย (คน)")
    p.children_born_2561_plus = ask_int("  บุตรคนที่ 2+ ที่เกิดตั้งแต่ปี 2561 (คน)")
    p.adopted_children = ask_int("  บุตรบุญธรรม (คน, ไม่เกิน 3)")
    p.parents = ask_int("  บิดามารดาที่อุปการะ (คน)")
    p.disabled_dependents = ask_int("  ผู้พิการ/ทุพพลภาพที่อุปการะ (คน)")
    p.pregnancies = ask_int("  จำนวนครั้งที่ตั้งครรภ์/คลอดบุตร")
    if p.pregnancies:
        p.prenatal_expense = ask_number("    ค่าฝากครรภ์+คลอดบุตรรวม")

    print("\n[ประกัน]")
    p.life_insurance = ask_number("  เบี้ยประกันชีวิต+สะสมทรัพย์")
    p.health_insurance = ask_number("  เบี้ยประกันสุขภาพตนเอง")
    p.parent_health_insurance = ask_number("  เบี้ยประกันสุขภาพบิดามารดา")
    if p.spouse_no_income:
        p.spouse_life_insurance = ask_number("  เบี้ยประกันชีวิตคู่สมรส")
    p.social_security = ask_number("  เงินสมทบประกันสังคมทั้งปี")

    print("\n[กองทุน/ลงทุน]")
    p.provident_fund = ask_number("  กองทุนสำรองเลี้ยงชีพ")
    p.gpf = ask_number("  กบข.")
    p.rmf = ask_number("  RMF")
    p.ssf = ask_number("  SSF")
    p.nsf = ask_number("  กอช.")
    p.pension_life_insurance = ask_number("  ประกันชีวิตแบบบำนาญ")
    p.thai_esg = ask_number("  Thai ESG")
    p.social_enterprise = ask_number("  วิสาหกิจเพื่อสังคม")

    print("\n[บ้าน + มาตรการรัฐของปี]")
    p.home_loan_interest = ask_number("  ดอกเบี้ยกู้ยืมเพื่อที่อยู่อาศัย")
    p.home_construction_cost = ask_number("  ค่าจ้างก่อสร้างบ้านใหม่ (ล้านละหมื่น)")
    p.easy_e_receipt = ask_number("  Easy E-Receipt 2.0 (ไม่เกิน 50,000)")
    p.travel_main_city = ask_number("  เที่ยวดีมีคืน — เมืองหลัก")
    p.travel_secondary_city = ask_number("  เที่ยวดีมีคืน — เมืองรอง")

    print("\n[บริจาค / ยกเว้น / ภาษีที่ชำระไว้]")
    p.donation_education = ask_number("  บริจาคการศึกษา/กีฬา/รพ.รัฐ (ได้ 2 เท่า)")
    p.donation_general = ask_number("  บริจาคทั่วไป")
    p.donation_political = ask_number("  บริจาคพรรคการเมือง")
    if ask_yes("  อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ (ยกเว้นเงินได้ไม่เกิน 190,000)?"):
        p.senior_or_disabled_exemption = 190_000
    p.withholding = ask_number("  ภาษีหัก ณ ที่จ่าย (กรณียังไม่ได้กรอกรายแหล่ง)")
    p.dividend_credit = ask_number("  เครดิตภาษีเงินปันผล")
    p.pnd94 = ask_number("  ภาษีชำระไว้ตาม ภ.ง.ด.94 (ครึ่งปี)")
    return p


def demo() -> int:
    examples = [
        ("ตัวอย่าง 1 — พนักงานเงินเดือน 500,000 บาท/ปี (หัก ณ ที่จ่าย 10,000)",
         [Person(income_items=[{"category": "salary", "amount": 500_000, "withholding": 10_000}],
                 social_security=9_000)]),
        ("ตัวอย่าง 2 — ปล่อยเช่า 2 แหล่ง: อาคารพาณิชย์ 1,000,000 + ที่ดินเกษตร 200,000",
         [Person(income_items=[
             {"category": "rent", "amount": 1_000_000, "variant": "building", "description": "อาคารพาณิชย์"},
             {"category": "rent", "amount": 200_000, "variant": "agri_land", "description": "ที่ดินเกษตร"},
         ])]),
        ("ตัวอย่าง 3 — ยื่นรวมกับคู่สมรส (900,000 + 600,000) หลายแหล่ง/มีภาษีหัก ณ ที่จ่าย",
         [Person(income_items=[{"category": "salary", "amount": 900_000, "withholding": 90_000}],
                 life_insurance=100_000, social_security=9_000, home_loan_interest=100_000,
                 donation_education=20_000),
          Person(income_items=[{"category": "salary", "amount": 600_000, "withholding": 30_000}],
                 social_security=9_000, provident_fund=90_000)]),
    ]
    for title, persons in examples:
        print("\n" + "=" * 78)
        print(" " + title)
        print("=" * 78)
        print(format_report(compute_pit(persons)))
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# 11) ชุดทดสอบมาตรฐาน (ใช้ร่วมกับเว็บ: GET /api/tax/thai-pit?selftest=1)
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
    print("ตรวจความถูกต้องของเครื่องคำนวณ (ชุดทดสอบมาตรฐาน)\n" + "-" * 74)
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
    print("-" * 74)
    print(f"ผ่าน {ok}/{len(cases)} กรณี")
    return 0 if ok == len(cases) else 1


# ─────────────────────────────────────────────────────────────────────────────
# 12) CLI
# ─────────────────────────────────────────────────────────────────────────────
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ตามแบบ ภ.ง.ด.90 กรมสรรพากร)")
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
        result = compute_pit([interactive(args.year)], args.year)

    print(format_report(result))
    if args.json_out or args.json_in:
        out = args.json_out or (os.path.splitext(args.json_in)[0] + ".result.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\nบันทึกผลลัพธ์ JSON → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
