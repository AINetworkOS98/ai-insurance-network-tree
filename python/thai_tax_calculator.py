#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thai_tax_calculator.py — โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ประเทศไทย) v3.0.0
==============================================================================
เดินตามเอกสารราชการจริง ปีภาษี 2568 ทีละข้อ
  • แบบ ภ.ง.ด.90 ข้อ 1–7 (เงินได้ + ค่าใช้จ่าย) และข้อ 11 การคำนวณภาษี 1.–16.
  • ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้นหลังจากหักค่าใช้จ่าย ข้อ 1.–24.
     1 ผู้มีเงินได้ (60,000/120,000) · 2 คู่สมรส · 3 บุตร (คนที่ 2+ เกิดใน/หลัง 2561 คนละ 60,000)
     · 4 อุปการะบิดามารดา (บิดา/มารดา ผู้มีเงินได้ + คู่สมรส คนละ 30,000) · 5 คนพิการ (ล.ย.04)
     · 6 ประกันสุขภาพบิดามารดา · 7.1 ประกันชีวิต 7.2 ประกันสุขภาพ 7.3 ประกันบำนาญ
     · 8 สำรองเลี้ยงชีพส่วนไม่เกิน 10,000 · 9 กอช. · 10 RMF · 11 ดอกเบี้ยบ้าน
     · 12 ประกันสังคม · 13 CCTV (เขตพัฒนาพิเศษเฉพาะกิจ) · 14 ฝากครรภ์/คลอดบุตร
     · 15 บริจาคพรรคการเมือง · 16 วิสาหกิจเพื่อสังคม (SE) · 17 Easy E-Receipt 2.0 (17.1–17.4)
     · 18 Thai ESG · 19 Thai ESGX (19.1 ลงทุนใหม่ / 19.2 สับเปลี่ยนจาก LTF) · 20 ค่าจ้างก่อสร้างบ้าน
     · 21 ค่างานศิลปะ · 22 เที่ยวดีมีคืน (22.1 เมืองหลัก / 22.2 เมืองรอง) · 23 อื่น ๆ (SSF) · 24 รวม
  • เงินสะสมสำรองเลี้ยงชีพส่วนที่เกิน 10,000 + กบข. + กองทุนสงเคราะห์ครู + เงินค่าชดเชย
    หักที่ "แบบ ข้อ 2(1)–(4)" ก่อนคิดค่าใช้จ่ายร้อยละ 50 (ข้อ 5) ตามตัวแบบ

อ้างอิงไฟล์ราชการ (ดาวน์โหลดตรงจาก rd.go.th, เก็บในเครื่องผู้ใช้):
  C:\\Users\\User\\Desktop\\เอกสารภาษี-กรมสรรพากร-2568  ·  https://www.rd.go.th/67335.html

วิธีใช้
  python thai_tax_calculator.py                 # ถาม-ตอบทีละข้อของแบบ
  python thai_tax_calculator.py --demo          # ตัวอย่างสำเร็จรูป
  python thai_tax_calculator.py --selftest      # ตรวจกับชุดทดสอบมาตรฐาน (ใช้ร่วมกับเว็บ)
  python thai_tax_calculator.py --json-in in.json [--json-out out.json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

VERSION = "3.0.0"
DEFAULT_YEAR = 2568

TAX_BRACKETS: List[Tuple[float, float]] = [
    (150_000, 0.00), (300_000, 0.05), (500_000, 0.10), (750_000, 0.15),
    (1_000_000, 0.20), (2_000_000, 0.25), (5_000_000, 0.30), (float("inf"), 0.35),
]

INCOME_SECTION: Dict[str, Dict[str, str]] = {
    "salary":       {"form": "ข้อ 1", "label": "มาตรา 40(1) เงินเดือน ค่าจ้าง บำนาญ ฯลฯ"},
    "service":      {"form": "ข้อ 3", "label": "มาตรา 40(2) เบี้ยประชุม ค่านายหน้า ฯลฯ"},
    "royalty":      {"form": "ใบแนบ ข้อ 2", "label": "มาตรา 40(3) ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์/สิทธิอย่างอื่น"},
    "interest":     {"form": "ใบแนบ ข้อ 3", "label": "มาตรา 40(4) ดอกเบี้ย เงินปันผล ส่วนแบ่งกำไร"},
    "rent":         {"form": "ใบแนบ ข้อ 4", "label": "มาตรา 40(5) ค่าเช่าทรัพย์สิน/ผิดสัญญาเช่าซื้อ"},
    "professional": {"form": "ใบแนบ ข้อ 5", "label": "มาตรา 40(6) วิชาชีพอิสระ"},
    "contractor":   {"form": "ใบแนบ ข้อ 6", "label": "มาตรา 40(7) รับเหมาก่อสร้าง"},
    "business":     {"form": "ใบแนบ ข้อ 7", "label": "มาตรา 40(8) ธุรกิจ/พาณิชย์/เกษตร/อุตสาหกรรม/ขนส่ง/อื่น ๆ"},
}
EXPENSE_RULES: Dict[str, Dict[str, Any]] = {
    "salary":       {"rate": 0.50, "cap": 100_000},
    "service":      {"rate": 0.50, "cap": 100_000},
    "royalty":      {"rate": 0.50, "cap": 100_000},
    "interest":     {"rate": 0.00, "cap": 0},
    "rent":         {"rate": 0.30, "cap": None},
    "professional": {"rate": 0.30, "cap": None},
    "contractor":   {"rate": 0.60, "cap": None},
    "business":     {"rate": 0.60, "cap": None},
}
SHARED_CAP_1_2 = 100_000
CAP_40_3 = 100_000
VARIANT_RATES: Dict[str, Dict[str, Dict[str, Any]]] = {
    "rent": {
        "building":   {"rate": 0.30, "label": "บ้าน โรงเรือน สิ่งปลูกสร้างอย่างอื่น หรือแพ (ร้อยละ 30)"},
        "vehicle":    {"rate": 0.30, "label": "ยานพาหนะ (ร้อยละ 30)"},
        "agri_land":  {"rate": 0.20, "label": "ที่ดินที่ใช้ในการเกษตร (ร้อยละ 20)"},
        "other_land": {"rate": 0.15, "label": "ที่ดินที่มิได้ใช้ในการเกษตร (ร้อยละ 15)"},
        "other":      {"rate": 0.10, "label": "ทรัพย์สินอื่น (ร้อยละ 10)"},
    },
    "professional": {
        "medical":   {"rate": 0.60, "label": "การประกอบโรคศิลปะ (ร้อยละ 60)"},
        "fine_arts": {"rate": 0.60, "label": "ประณีตศิลปกรรม (ร้อยละ 60)"},
        "other":     {"rate": 0.30, "label": "อื่น ๆ กฎหมาย วิศวกรรม สถาปัตยกรรม การบัญชี (ร้อยละ 30)"},
    },
    "business": {
        "general":   {"rate": 0.60, "label": "ธุรกิจ/พาณิชย์/เกษตร/อุตสาหกรรม/อื่น ๆ (ร้อยละ 60)"},
        "transport": {"rate": 0.40, "label": "การขนส่ง (ร้อยละ 40)"},
    },
}

LIM = {
    "personal": 60_000, "personal_special": 120_000, "spouse": 60_000,
    "child": 30_000, "child_2nd_born_2561": 60_000, "adopted_child": 60_000, "adopted_max": 3,
    "parent": 30_000, "parent_max": 4, "disabled_dependent": 60_000, "parent_health": 15_000,
    "life_insurance": 100_000, "health_insurance": 25_000, "life_health_combined": 100_000,
    "pension_life": 200_000, "spouse_life": 10_000, "provident_allowance": 10_000,
    "nsf": 30_000, "rmf": 500_000, "home_loan_interest": 100_000, "social_security": 9_000,
    "cctv": 100_000, "prenatal": 60_000, "donation_political": 10_000, "social_enterprise": 100_000,
    "easy_e_receipt": 50_000, "thai_esg": 300_000, "thai_esgx": 300_000,
    "home_construction": 100_000, "art": 100_000, "travel_main": 20_000, "travel_secondary": 30_000,
    "ssf": 200_000, "retirement_cap": 500_000, "senior_disabled_exemption": 190_000,
    "min_tax_rate": 0.005, "min_tax_threshold": 120_000, "min_tax_exempt": 5_000,
}
PCT_RULES = {
    "provident_fund": 0.15, "gpf": 0.30, "teacher_fund": 0.15,
    "rmf": 0.30, "ssf": 0.30, "pension_life_insurance": 0.15, "thai_esg": 0.30, "thai_esgx": 0.30,
}
EFFECTIVE_YEARS = (2568, 2569)

SOURCES = [
    "แบบ ภ.ง.ด.90 + ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น ปีภาษี 2568 (ไฟล์ราชการในเครื่อง: Desktop\\เอกสารภาษี-กรมสรรพากร-2568)",
    "หน้าดาวน์โหลดแบบ ภ.ง.ด. ปี 2568 กรมสรรพากร: https://www.rd.go.th/67335.html",
    "การหักค่าใช้จ่าย (อัตราเหมาแยกประเภทเงินได้): https://www.rd.go.th/556.html",
    "วิธีการคำนวณภาษีเงินได้บุคคลธรรมดาสิ้นปี (วิธีที่ 1 / วิธีที่ 2): https://rd.go.th/555.html",
]


@dataclass
class IncomeItem:
    category: str = "salary"
    amount: float = 0.0
    description: str = ""
    expense_mode: str = "standard"
    actual_expense: float = 0.0
    variant: str = ""
    withholding: float = 0.0

    def rate(self) -> float:
        table = VARIANT_RATES.get(self.category)
        if table:
            key = self.variant if self.variant in table else next(iter(table))
            return table[key]["rate"]
        return EXPENSE_RULES[self.category]["rate"]

    def rate_label(self) -> str:
        table = VARIANT_RATES.get(self.category)
        if table and self.variant in table:
            return table[self.variant]["label"]
        return EXPENSE_RULES[self.category]["label"]


@dataclass
class Person:
    # เงินได้ (รายแหล่ง)
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

    # แบบ ข้อ 2(1)–(4)
    provident_fund: float = 0.0
    gpf: float = 0.0
    teacher_fund: float = 0.0
    severance_pay: float = 0.0

    # ใบแนบ ข้อ 1–23
    personal: bool = True
    personal_special: bool = False
    spouse_no_income: bool = False
    children: int = 0
    children_2nd_2561: int = 0
    children_born_2561_plus: int = 0     # ชื่อเดิม (เข้ากันได้กับชุดทดสอบ v2)
    adopted_children: int = 0
    parents: int = 0
    disabled_dependents: int = 0
    parent_health_insurance: float = 0.0
    life_insurance: float = 0.0
    health_insurance: float = 0.0
    pension_life_insurance: float = 0.0
    spouse_life_insurance: float = 0.0
    nsf: float = 0.0
    rmf: float = 0.0
    home_loan_interest: float = 0.0
    social_security: float = 0.0
    cctv_amount: float = 0.0
    pregnancies: int = 0
    prenatal_expense: float = 0.0
    donation_political: float = 0.0
    social_enterprise: float = 0.0
    e_receipt_general: float = 0.0
    e_receipt_books: float = 0.0
    e_receipt_ebooks: float = 0.0
    e_receipt_otop: float = 0.0
    easy_e_receipt: float = 0.0          # ชื่อเดิม: ยอดรวม Easy E-Receipt
    thai_esg: float = 0.0
    thai_esgx: float = 0.0
    thai_esgx_ltf_swap: float = 0.0
    home_construction_cost: float = 0.0
    home_construction_exempt: float = 0.0   # ชื่อเดิม (เข้ากันได้กับชุดทดสอบ v2)
    art_purchase: float = 0.0
    travel_main_city: float = 0.0
    travel_secondary_city: float = 0.0
    ssf: float = 0.0
    other_measure_amount: float = 0.0

    # แบบ ข้อ 11.4 / 11.6
    donation_general: float = 0.0
    donation_education: float = 0.0

    # ยกเว้นเงินได้
    senior_or_disabled_exemption: float = 0.0

    # แบบ ข้อ 11.13 / 11.15
    withholding: float = 0.0
    dividend_credit: float = 0.0
    pnd93: float = 0.0
    pnd94: float = 0.0
    foreign_tax_credit: float = 0.0


def _money(x: Any) -> float:
    try:
        v = float(x or 0)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if v < 0 else round(v, 2)


def build_items(p: Person) -> List[IncomeItem]:
    items: List[IncomeItem] = []
    for raw in (p.income_items or []):
        if not isinstance(raw, dict):
            continue
        cat = str(raw.get("category") or "")
        if cat not in EXPENSE_RULES:
            continue
        items.append(IncomeItem(
            category=cat, amount=_money(raw.get("amount")), description=str(raw.get("description") or ""),
            expense_mode=str(raw.get("expense_mode") or "standard"), actual_expense=_money(raw.get("actual_expense")),
            variant=str(raw.get("variant") or ""), withholding=_money(raw.get("withholding")),
        ))
    if any(i.amount > 0 for i in items):
        return items
    for cat in ("salary", "service", "royalty", "interest", "rent", "professional", "contractor", "business"):
        amt = _money(getattr(p, cat))
        if amt <= 0:
            continue
        variant = "medical" if (cat == "professional" and p.medical_professional) else ""
        actual = _money(p.actual_expense.get(cat, 0))
        items.append(IncomeItem(category=cat, amount=amt, expense_mode="actual" if actual > 0 else "standard",
                                actual_expense=actual, variant=variant))
    return items


def compute_retirement(p: Person, assessable: float) -> Dict[str, Any]:
    allowed = {
        "provident": min(_money(p.provident_fund), assessable * PCT_RULES["provident_fund"], LIM["retirement_cap"]),
        "gpf": min(_money(p.gpf), assessable * PCT_RULES["gpf"], LIM["retirement_cap"]),
        "teacher": min(_money(p.teacher_fund), assessable * PCT_RULES["teacher_fund"], LIM["retirement_cap"]),
        "pension": min(_money(p.pension_life_insurance), assessable * PCT_RULES["pension_life_insurance"], LIM["pension_life"]),
        "rmf": min(_money(p.rmf), assessable * PCT_RULES["rmf"], LIM["rmf"]),
        "ssf": min(_money(p.ssf), assessable * PCT_RULES["ssf"], LIM["ssf"]),
    }
    order = ["provident", "gpf", "teacher", "pension", "rmf", "ssf"]
    over = sum(allowed[k] for k in order) - LIM["retirement_cap"]
    notes: List[str] = []
    if over > 0:
        for k in reversed(order):
            if over <= 0:
                break
            cut = min(allowed[k], over)
            allowed[k] -= cut
            over -= cut
        notes.append("วงเงินกลุ่มเกษียณ (สำรองเลี้ยงชีพ/กบข./สงเคราะห์ครู/ประกันบำนาญ/RMF/SSF) รวมกันไม่เกิน 500,000 บาท — ปรับลดส่วนเกินให้แล้ว")
    return {"allowed": allowed, "notes": notes}


def compute_section2(p: Person, retirement: Dict[str, float]) -> Dict[str, Any]:
    """แบบ ข้อ 2(1)–(4): หักจากเงินได้ 40(1)+(2) ก่อนคิดค่าใช้จ่ายร้อยละ 50"""
    items: List[Dict[str, Any]] = []
    excess = max(0.0, retirement["provident"] - LIM["provident_allowance"])
    if excess > 0:
        items.append({"code": "provident_excess", "form": "แบบ ข้อ 2(1)",
                      "label": "เงินสะสมกองทุนสำรองเลี้ยงชีพ (ส่วนที่เกิน 10,000 บาท)", "amount": round(excess, 2)})
    if retirement["gpf"] > 0:
        items.append({"code": "gpf", "form": "แบบ ข้อ 2(2)", "label": "เงินสะสม กบข.", "amount": round(retirement["gpf"], 2)})
    if retirement["teacher"] > 0:
        items.append({"code": "teacher_fund", "form": "แบบ ข้อ 2(3)",
                      "label": "เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน", "amount": round(retirement["teacher"], 2)})
    severance = _money(p.severance_pay)
    if severance > 0:
        items.append({"code": "severance_pay", "form": "แบบ ข้อ 2(4)",
                      "label": "เงินค่าชดเชยที่ได้รับตามกฎหมายแรงงาน (กรณีนำมารวมคำนวณภาษี)", "amount": round(severance, 2)})
    return {"items": items, "total": round(sum(i["amount"] for i in items), 2)}


def compute_allowances(p: Person, assessable: float, married_combined: bool, retirement: Dict[str, float]) -> Dict[str, Any]:
    """ใบแนบ ข้อ 1.–23. (ยังไม่รวมเงินบริจาคในแบบข้อ 11.4/11.6)"""
    items: List[Dict[str, Any]] = []
    notes: List[str] = []

    def add(item: str, code: str, label: str, amount: float, note: str = "") -> None:
        amount = round(max(0.0, amount), 2)
        if amount > 0:
            items.append({"item": item, "code": code, "label": label, "amount": amount, "note": note})

    if p.personal:
        add("1", "personal", "ผู้มีเงินได้" + (" (กรณี 120,000 บาท)" if p.personal_special else ""),
            LIM["personal_special"] if p.personal_special else LIM["personal"],
            "ปกติ 60,000 บาท (กรณี 120,000 ตามที่กรมสรรพากรกำหนดเป็นรายกรณี)")
    if p.spouse_no_income:
        add("2", "spouse", "คู่สมรส" + (" (มีเงินได้รวมคำนวณภาษี)" if married_combined else " (ไม่มีเงินได้)"),
            LIM["spouse"], "กรณีมีเงินได้รวมคำนวณภาษี หรือไม่มีเงินได้")

    children_2nd = int(_money(getattr(p, "children_2nd_2561", 0))) or int(_money(p.children_born_2561_plus))
    kids = int(_money(p.children))
    children_2nd = min(children_2nd, kids)
    if kids > 0:
        base = max(0, kids - children_2nd) * LIM["child"]
        extra = children_2nd * LIM["child_2nd_born_2561"]
        add("3", "children", f"บุตร {kids} คน" + (f" (ในจำนวนนี้ {children_2nd} คนเป็นบุตรคนที่ 2 ขึ้นไปเกิดใน/หลังปี 2561)" if children_2nd else ""),
            base + extra, "คนละ 30,000 บาท · บุตรตั้งแต่คนที่ 2 ที่เกิดในหรือหลังปี พ.ศ. 2561 คนละ 60,000 บาท")
    adopted = min(int(_money(p.adopted_children)), LIM["adopted_max"])
    add("3.1", "adopted_children", f"บุตรบุญธรรม {adopted} คน", adopted * LIM["adopted_child"], "คนละ 60,000 บาท ไม่เกิน 3 คน")

    parents = min(int(_money(p.parents)), LIM["parent_max"])
    add("4", "parents", f"อุปการะเลี้ยงดูบิดามารดา {parents} คน", parents * LIM["parent"],
        "บิดา/มารดาของผู้มีเงินได้ และของคู่สมรส คนละ 30,000 บาท")
    add("5", "disabled_dependents", f"อุปการะเลี้ยงดูคนพิการ/คนทุพพลภาพ {int(_money(p.disabled_dependents))} คน",
        _money(p.disabled_dependents) * LIM["disabled_dependent"], "ยกมาจากแบบ ล.ย.04 · คนละ 60,000 บาท")
    add("6", "parent_health", "เบี้ยประกันสุขภาพบิดามารดาของผู้มีเงินได้และคู่สมรส",
        min(_money(p.parent_health_insurance), LIM["parent_health"]), "ตามที่จ่ายจริง ไม่เกิน 15,000 บาท")

    life = min(_money(p.life_insurance), LIM["life_insurance"])
    health = min(_money(p.health_insurance), LIM["health_insurance"])
    cut = max(0.0, life + health - LIM["life_health_combined"])
    if cut > 0:
        health = max(0.0, health - cut)
        cut = max(0.0, life + health - LIM["life_health_combined"])
        if cut > 0:
            life = max(0.0, life - cut)
        notes.append("ข้อ 7.1 + 7.2 เบี้ยประกันชีวิตและประกันสุขภาพ รวมกันไม่เกิน 100,000 บาท (ตัดส่วนเกินให้แล้ว)")
    add("7.1", "life_insurance", "เบี้ยประกันชีวิต", life, "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท")
    add("7.2", "health_insurance", "เบี้ยประกันสุขภาพ", health, "ไม่เกิน 25,000 บาท และรวมกับ 7.1 ไม่เกิน 100,000 บาท")
    add("7.3", "pension_life", "เบี้ยประกันชีวิตแบบบำนาญ", retirement["pension"], "15% ของเงินได้ ไม่เกิน 200,000 บาท (นับในวงเงินเกษียณ 500,000)")
    if not married_combined:
        add("7.4", "spouse_life", "เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)",
            min(_money(p.spouse_life_insurance), LIM["spouse_life"]), "ไม่เกิน 10,000 บาท")

    add("8", "provident_10k", "เงินสะสมกองทุนสำรองเลี้ยงชีพ (ส่วนที่ไม่เกิน 10,000 บาท)",
        min(retirement["provident"], LIM["provident_allowance"]), "ส่วนที่เกิน 10,000 บาท หักเป็นเงินได้ที่ได้รับยกเว้นในแบบ ข้อ 2(1)")
    add("9", "nsf", "เงินสะสมกองทุนการออมแห่งชาติ (กอช.)", min(_money(p.nsf), LIM["nsf"]), "ตามที่จ่ายจริง ไม่เกิน 30,000 บาท")
    add("10", "rmf", "ค่าซื้อหน่วยลงทุนในกองทุนรวมเพื่อการเลี้ยงชีพ (RMF)", retirement["rmf"], "30% ของเงินได้ ไม่เกิน 500,000 บาท")
    add("11", "home_loan_interest", "ดอกเบี้ยเงินกู้ยืมเพื่อซื้อ เช่าซื้อ หรือสร้างอาคารอยู่อาศัย",
        min(_money(p.home_loan_interest), LIM["home_loan_interest"]), "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท")
    add("12", "social_security", "เงินสมทบกองทุนประกันสังคม", min(_money(p.social_security), LIM["social_security"]),
        "ตามที่จ่ายจริง ไม่เกิน 9,000 บาท")
    add("13", "cctv", "ค่าซื้อและค่าติดตั้งระบบกล้องโทรทัศน์วงจรปิด (เขตพัฒนาพิเศษเฉพาะกิจ)",
        min(_money(p.cctv_amount), LIM["cctv"]), "เฉพาะเงินได้ตามมาตรา 40(5)–(8) ในเขตพัฒนาพิเศษเฉพาะกิจ ไม่เกิน 100,000 บาท")
    if int(_money(p.pregnancies)) > 0:
        add("14", "prenatal", f"ค่าฝากครรภ์และค่าคลอดบุตร ({int(_money(p.pregnancies))} ครั้ง)",
            min(_money(p.prenatal_expense), LIM["prenatal"] * max(1, int(_money(p.pregnancies)))),
            "ตามที่จ่ายจริง ไม่เกิน 60,000 บาทต่อการตั้งครรภ์ 1 ครั้ง")
    add("15", "donation_political", "เงินที่บริจาคแก่พรรคการเมือง",
        min(_money(p.donation_political), LIM["donation_political"]), "ไม่เกิน 10,000 บาท")
    add("16", "social_enterprise", "เงินลงทุนในหุ้น/หุ้นส่วน วิสาหกิจเพื่อสังคม (SE)",
        min(_money(p.social_enterprise), LIM["social_enterprise"]), "ไม่เกิน 100,000 บาท")

    e1 = _money(p.e_receipt_general)
    e2 = _money(p.e_receipt_books)
    e3 = _money(p.e_receipt_ebooks)
    e4 = _money(p.e_receipt_otop)
    if e1 + e2 + e3 + e4 <= 0 and _money(p.easy_e_receipt) > 0:
        e1 = _money(p.easy_e_receipt)
    e_total = e1 + e2 + e3 + e4
    if e_total > 0:
        allowed = min(e_total, LIM["easy_e_receipt"])
        ratio = allowed / e_total
        add("17.1", "e_receipt_17.1", "ค่าซื้อสินค้าและค่าบริการในระบบภาษีมูลค่าเพิ่ม", e1 * ratio,
            "Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568) รวมทั้ง 17.1–17.4 ไม่เกิน 50,000 บาท")
        add("17.2", "e_receipt_17.2", "ค่าซื้อหนังสือ หนังสือพิมพ์ และนิตยสาร", e2 * ratio)
        add("17.3", "e_receipt_17.3", "หนังสือ/บริการหนังสือในรูปข้อมูลอิเล็กทรอนิกส์ผ่านอินเทอร์เน็ต", e3 * ratio)
        add("17.4", "e_receipt_17.4", "ค่าซื้อสินค้า OTOP วิสาหกิจชุมชน และวิสาหกิจเพื่อสังคม", e4 * ratio)
        if e_total > LIM["easy_e_receipt"]:
            notes.append("ข้อ 17 Easy E-Receipt 2.0 รวมทั้ง 4 รายการไม่เกิน 50,000 บาท (ปรับลดตามสัดส่วนให้แล้ว)")

    add("18", "thai_esg", "ค่าซื้อหน่วยลงทุนกองทุนรวมไทยเพื่อความยั่งยืน (Thai ESG)",
        min(_money(p.thai_esg), assessable * PCT_RULES["thai_esg"], LIM["thai_esg"]), "30% ของเงินได้ ไม่เกิน 300,000 บาท")
    add("19.1", "thai_esgx", "ค่าซื้อหน่วยลงทุน Thai ESGX",
        min(_money(p.thai_esgx), assessable * PCT_RULES["thai_esgx"], LIM["thai_esgx"]),
        "ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568 · 30% ของเงินได้ ไม่เกิน 300,000 บาท")
    add("19.2", "thai_esgx_ltf", "มูลค่าการสับเปลี่ยนหน่วยลงทุนจากกองทุน LTF ไป Thai ESGX",
        min(_money(p.thai_esgx_ltf_swap), assessable * 0.30, LIM["thai_esgx"]), "เฉพาะปีภาษี 2568")

    construction = _money(p.home_construction_cost) or _money(p.home_construction_exempt)
    if construction > 0:
        add("20", "home_construction", "ค่าจ้างก่อสร้างอาคารเพื่ออยู่อาศัยขึ้นใหม่ (ผู้รับจ้างจดทะเบียน VAT)",
            min(construction // 1_000_000 * 10_000, LIM["home_construction"]),
            "ล้านละ 10,000 บาท รวมไม่เกิน 100,000 บาท · สัญญาจ้าง 9 เม.ย. 2567–31 ธ.ค. 2568")
    add("21", "art_purchase", "ค่าซื้องานศิลปะ", min(_money(p.art_purchase), LIM["art"]),
        "ตามที่จ่ายจริง ไม่เกิน 100,000 บาท")
    add("22.1", "travel_main", "ค่าท่องเที่ยวภายในประเทศ — เที่ยวเมืองหลัก",
        min(_money(p.travel_main_city), LIM["travel_main"]), "29 ต.ค.–15 ธ.ค. 2568 · 1 เท่า ไม่เกิน 20,000 บาท")
    add("22.2", "travel_secondary", "ค่าท่องเที่ยวภายในประเทศ — เที่ยวเมืองรอง",
        min(min(_money(p.travel_secondary_city), LIM["travel_main"]) * 1.5, LIM["travel_secondary"]),
        "29 ต.ค.–15 ธ.ค. 2568 · 1.5 เท่า (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000 บาท")
    add("23", "ssf", "อื่น ๆ — ค่าซื้อหน่วยลงทุน SSF", retirement["ssf"], "30% ของเงินได้ ไม่เกิน 200,000 บาท")
    add("23.9", "other_measure", "อื่น ๆ — มาตรการของรัฐอื่นของปีภาษี", _money(p.other_measure_amount),
        "ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน")

    items.sort(key=lambda i: tuple(int(x) for x in i["item"].split(".")))
    return {"items": items, "total": round(sum(i["amount"] for i in items), 2), "notes": notes}


def progressive_tax(net_income: float) -> Dict[str, Any]:
    net = max(0.0, net_income)
    tax = 0.0
    lower = 0.0
    steps: List[Dict[str, Any]] = []
    for upper, rate in TAX_BRACKETS:
        if net <= lower:
            break
        amount = min(net, upper) - lower
        steps.append({
            "range": f"{'0' if lower == 0 else f'{lower:,.0f}+1'} – {'ขึ้นไป' if upper == float('inf') else f'{upper:,.0f}'}",
            "rate": rate, "amount": round(amount, 2), "tax": round(amount * rate, 2),
        })
        tax += amount * rate
        lower = upper
    return {"tax": round(tax, 2), "steps": steps, "marginal_rate": steps[-1]["rate"] if steps else 0.0}


def compute_expenses(items: List[IncomeItem]) -> Dict[str, Any]:
    groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for it in items:
        if it.amount <= 0:
            continue
        if it.category == "interest":
            rate, how = 0.0, "หักค่าใช้จ่ายไม่ได้ (ใบแนบข้อ 3)"
        elif it.expense_mode == "actual":
            rate, how = None, f"ตามจริง (จ่ายจริง {it.actual_expense:,.0f} บาท)"
        else:
            rate = it.rate()
            how = f"ร้อยละ {int(round(rate * 100))}" + (f" · {it.rate_label()}" if it.variant else "")
        g = groups.setdefault((it.category, how), {"category": it.category, "how": how, "rate": rate, "gross": 0.0, "ded": 0.0})
        g["gross"] += it.amount
        g["ded"] += min(it.actual_expense, it.amount) if rate is None else it.amount * rate

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
                g["how"] += " · แบบข้อ 5 จำกัดร้อยละ 50 ไม่เกิน 100,000 บาท"
                break
    cap3 = sum(g["ded"] for g in groups.values() if g["category"] == "royalty")
    if cap3 > CAP_40_3:
        excess = cap3 - CAP_40_3
        for g in groups.values():
            if g["category"] == "royalty" and excess > 0:
                cut = min(g["ded"], excess)
                g["ded"] -= cut
                excess -= cut
                g["how"] += " · ใบแนบข้อ 2 จำกัดไม่เกิน 100,000 บาท"
    lines = [{"group": g["category"],
              "label": f"{INCOME_SECTION[g['category']]['form']} · {INCOME_SECTION[g['category']]['label']} — {g['how']}",
              "gross": round(g["gross"], 2), "deductible": round(g["ded"], 2)} for g in groups.values()]
    lines.sort(key=lambda x: list(EXPENSE_RULES).index(x["group"]))
    return {"lines": lines, "total": round(sum(l["deductible"] for l in lines), 2)}


def compute_pit(persons: List[Person], year: int = DEFAULT_YEAR) -> Dict[str, Any]:
    """เดินตามแบบ ภ.ง.ด.90 ข้อ 1–7 → ข้อ 11.1–11.16"""
    if not persons:
        raise ValueError("ต้องมีข้อมูลผู้เสียภาษีอย่างน้อย 1 คน")
    married_combined = len(persons) > 1

    gross_by_cat: Dict[str, float] = {k: 0.0 for k in EXPENSE_RULES}
    expense_lines: List[Dict[str, Any]] = []
    item_rows: List[Dict[str, Any]] = []
    section2_items: List[Dict[str, Any]] = []
    allowance_items: List[Dict[str, Any]] = []
    exemptions: List[Dict[str, Any]] = []
    notes: List[str] = []
    expenses_total = 0.0
    credits_items = 0.0
    credits_flat = 0.0

    assessable_all = round(sum(sum(i.amount for i in build_items(p)) for p in persons), 2)

    for idx, p in enumerate(persons):
        person_items = build_items(p)
        has_items = any(i.amount > 0 for i in person_items)
        for it in person_items:
            gross_by_cat[it.category] += it.amount
            if it.amount <= 0:
                continue
            if has_items:
                credits_items += it.withholding
            item_rows.append({
                "owner": "คู่สมรส" if (married_combined and idx > 0) else "ผู้มีเงินได้",
                "category": it.category, "form": INCOME_SECTION[it.category]["form"],
                "category_label": INCOME_SECTION[it.category]["label"], "description": it.description,
                "amount": round(it.amount, 2), "variant": it.variant,
                "variant_label": it.rate_label() if it.variant else "",
                "expense_mode": it.expense_mode, "withholding": round(it.withholding, 2),
            })
        if not has_items:
            credits_flat += 0.0
        credits_flat += _money(p.withholding)

        ret = compute_retirement(p, assessable_all)
        sec2 = compute_section2(p, ret["allowed"])
        for it in sec2["items"]:
            section2_items.append({**it, "label": ("(คู่สมรส) " if (married_combined and idx > 0) else "") + it["label"]})

        salary_base = sum(i.amount for i in person_items if i.category in ("salary", "service"))
        sec2_for_salary = min(sec2["total"], salary_base)
        expense_items = [IncomeItem(**{**asdict(i)}) for i in person_items]
        remaining = sec2_for_salary
        for i in expense_items:
            if remaining <= 0:
                break
            if i.category in ("salary", "service"):
                cut = min(i.amount, remaining)
                i.amount = round(i.amount - cut, 2)
                remaining -= cut
        exp = compute_expenses(expense_items)
        for l in exp["lines"]:
            expense_lines.append({**l, "label": ("(คู่สมรส) " if (married_combined and idx > 0) else "") + l["label"]})
        expenses_total += exp["total"]

        q = p
        if idx > 0:
            q = Person(**{**asdict(p), "children": 0, "children_2nd_2561": 0, "children_born_2561_plus": 0,
                          "adopted_children": 0, "pregnancies": 0, "prenatal_expense": 0, "parents": 0,
                          "disabled_dependents": 0, "spouse_no_income": False})
        allow = compute_allowances(q, assessable_all, married_combined,
                                  {"provident": ret["allowed"]["provident"], "rmf": ret["allowed"]["rmf"],
                                   "ssf": ret["allowed"]["ssf"], "pension": ret["allowed"]["pension"]})
        for it in allow["items"]:
            allowance_items.append({**it, "label": ("(คู่สมรส) " if (married_combined and idx > 0) else "") + it["label"]})
        notes.extend(allow["notes"])
        notes.extend(ret["notes"])

        senior = _money(p.senior_or_disabled_exemption)
        if senior > 0:
            exemptions.append({"label": "ยกเว้นเงินได้ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ",
                               "amount": round(min(senior, LIM["senior_disabled_exemption"]), 2),
                               "note": "ไม่เกิน 190,000 บาท/ปี ต่อคน"})

    gross_total = round(sum(gross_by_cat.values()), 2)
    section2_total = round(sum(i["amount"] for i in section2_items), 2)
    salary_after_section2 = round(max(0.0, gross_by_cat["salary"] + gross_by_cat["service"] - section2_total), 2)
    expenses_total = round(expenses_total, 2)

    income_after_expense = round(max(0.0, gross_total - section2_total - expenses_total), 2)   # ข้อ 11.1
    exemptions_total = round(sum(e["amount"] for e in exemptions), 2)
    allowances_total = round(sum(i["amount"] for i in allowance_items), 2)                      # ใบแนบ 24 → ข้อ 11.2

    item3 = round(max(0.0, income_after_expense - exemptions_total - allowances_total), 2)      # ข้อ 11.3
    cap_edu = round(item3 * 0.10, 2)
    don_edu_actual = sum(_money(p.donation_education) for p in persons)
    don_edu = round(min(don_edu_actual * 2, cap_edu), 2)                                        # ข้อ 11.4
    item5 = round(max(0.0, item3 - don_edu), 2)                                                 # ข้อ 11.5
    cap_gen = round(item5 * 0.10, 2)
    don_gen_actual = sum(_money(p.donation_general) for p in persons)
    don_gen = round(min(don_gen_actual, cap_gen), 2)                                            # ข้อ 11.6
    if don_edu_actual > 0 and don_edu_actual * 2 > cap_edu:
        notes.append("ข้อ 11.4 เงินบริจาค 2 เท่า ถูกจำกัดด้วยเพดาน 10% ของยอดข้อ 11.3")
    if don_gen_actual > cap_gen:
        notes.append("ข้อ 11.6 เงินบริจาคทั่วไปถูกจำกัดด้วยเพดาน 10% ของยอดข้อ 11.5")

    net_income = round(max(0.0, item5 - don_gen), 2)                                            # ข้อ 11.7
    bracket = progressive_tax(net_income)
    tax_method1 = bracket["tax"]                                                                # ข้อ 11.8
    gross_2_to_8 = round(gross_total - gross_by_cat["salary"], 2)
    method2_applies = gross_2_to_8 >= LIM["min_tax_threshold"]
    tax_method2 = round(gross_2_to_8 * LIM["min_tax_rate"], 2)                                  # ข้อ 11.9
    method2_used = bool(method2_applies and tax_method2 > LIM["min_tax_exempt"] and tax_method2 > tax_method1)
    if not method2_applies:
        method2_note = (f"ข้อ 11.9 · เงินได้ไม่รวมมาตรา 40(1) = {gross_2_to_8:,.2f} บาท ไม่ถึง 120,000 บาท "
                        "→ ไม่ต้องคำนวณภาษีวิธีที่ 2")
    elif tax_method2 <= LIM["min_tax_exempt"]:
        method2_note = (f"ข้อ 11.10 · ภาษีข้อ 11.9 คำนวณได้ {tax_method2:,.2f} บาท ไม่เกิน 5,000 บาท "
                        "→ ให้ชำระภาษีตามข้อ 11.8 (วิธีที่ 1)")
    else:
        method2_note = ""
    tax_before_credit = tax_method2 if method2_used else tax_method1                            # ข้อ 11.10

    item11 = 0.0                                                                                # ข้อ 11.11 เขตพัฒนาพิเศษเฉพาะกิจ
    item12 = round(tax_before_credit + item11, 2)                                               # ข้อ 11.12
    foreign_credit = min(sum(_money(p.foreign_tax_credit) for p in persons), item12)            # ข้อ 11.13
    item14 = round(item12 - foreign_credit, 2)                                                  # ข้อ 11.14
    credits = round(credits_items + credits_flat
                    + sum(_money(p.dividend_credit) for p in persons)
                    + sum(_money(p.pnd93) + _money(p.pnd94) for p in persons), 2)               # ข้อ 11.15
    net_payable = round(item14 - credits, 2)                                                    # ข้อ 11.16

    salary_only = gross_2_to_8 <= 0
    threshold = 60_000 if salary_only else 120_000

    return {
        "program": "thai_tax_calculator.py", "version": VERSION, "year": year,
        "filing_mode": "ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)" if married_combined else "ยื่นคนเดียว (ภ.ง.ด.90/91)",
        "form_reference": "เดินตามแบบ ภ.ง.ด.90 ข้อ 1–7 และข้อ 11 (1.–16.) + ใบแนบลดหย่อน ข้อ 1.–24. ปีภาษี 2568",
        "income_items": item_rows, "gross_total": gross_total,
        "expense_lines": expense_lines, "expenses_total": expenses_total,
        "section2_items": section2_items, "section2_total": section2_total,
        "salary_after_section2": salary_after_section2,
        "income_after_expense": income_after_expense,
        "allowance_items": allowance_items, "allowances_total": allowances_total,
        "allowance_notes": sorted(set(notes)),
        "exemptions": exemptions, "exemptions_total": exemptions_total,
        "item3_balance": item3,
        "donation_caps": {"education_10pct_of_item3": cap_edu, "general_10pct_of_item5": cap_gen},
        "item4_education_donation": don_edu, "item5_balance": item5, "item6_general_donation": don_gen,
        "net_income": net_income,
        "bracket_steps": bracket["steps"], "tax_by_bracket": tax_method1, "marginal_rate": bracket["marginal_rate"],
        "tax_method1": tax_method1, "tax_method2": tax_method2,
        "method2_applies": method2_applies, "method2_note": method2_note,
        "min_tax_05pct": tax_method2, "min_tax_applied": method2_used,
        "tax_before_credit": round(tax_before_credit, 2),
        "item11_special_area": item11, "item12_total_tax": item12,
        "foreign_tax_credit": round(foreign_credit, 2), "item14_after_foreign_credit": item14,
        "tax_credits": credits, "withholding_total": round(credits_items + credits_flat, 2),
        "net_payable": net_payable,
        "result": ("ต้องชำระเพิ่ม" if net_payable > 0.5 else ("ขอคืนภาษี" if net_payable < -0.5 else "ไม่มีภาษีต้องชำระ/ขอคืน")),
        "must_file": gross_total > threshold, "file_threshold": threshold,
        "sources": SOURCES,
        "disclaimer": ("โปรแกรมนี้ทำตามลำดับข้อของแบบ ภ.ง.ด.90 และใบแนบลดหย่อน ปีภาษี 2568 "
                       "เพื่อประมาณการภาษีก่อนยื่นแบบ ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — "
                       "กรณีสิทธิพิเศษเฉพาะราย โปรดตรวจสอบกับสำนักงานสรรพากร (โทร. 1161)"),
    }


def format_report(r: Dict[str, Any]) -> str:
    b: List[str] = []
    line = "─" * 80
    b.append(line)
    b.append(f" การคำนวณภาษีเงินได้บุคคลธรรมดา · ปีภาษี {r['year']} · {r['filing_mode']}")
    b.append(f" {r['form_reference']}")
    b.append(line)
    b.append(" [แบบ ภ.ง.ด.90 ข้อ 1–7 · เงินได้พึงประเมินรายแหล่ง]")
    for it in r["income_items"]:
        desc = f" — {it['description']}" if it["description"] else ""
        wh = f"   (หัก ณ ที่จ่าย {it['withholding']:,.2f})" if it["withholding"] else ""
        b.append(f"   • {it['form']} {it['category_label']}{desc}")
        b.append(f"     {it['amount']:>18,.2f}{wh}")
    b.append(f"   {'รวมเงินได้พึงประเมินทั้งสิ้น':<52}{r['gross_total']:>18,.2f}")
    if r["section2_items"]:
        b.append("")
        b.append(" [แบบ ข้อ 2(1)–(4) หักจากเงินได้ 40(1) ก่อนคิดค่าใช้จ่าย]")
        for i in r["section2_items"]:
            b.append(f"   • {i['form']} {i['label'][:60]:<62}{i['amount']:>14,.2f}")
        b.append(f"   {'รวม (1) ถึง (4)':<52}{r['section2_total']:>18,.2f}")
    b.append("")
    b.append(" [แบบ ข้อ 5 / ใบแนบข้อ 2-7 · หักค่าใช้จ่าย]")
    for l in r["expense_lines"]:
        b.append(f"   • {l['label'][:74]}")
        b.append(f"     {l['deductible']:>18,.2f}")
    b.append(f"   {'รวมค่าใช้จ่าย':<52}{r['expenses_total']:>18,.2f}")
    b.append(f"   ข้อ 11.1 เงินได้หลังจากหักค่าใช้จ่าย{' ' * 30}{r['income_after_expense']:>18,.2f}")
    if r["exemptions"]:
        b.append("")
        b.append(" [เงินได้ที่ได้รับยกเว้น]")
        for e in r["exemptions"]:
            b.append(f"   • {e['label'][:66]:<68}{e['amount']:>12,.2f}")
        b.append(f"   {'รวมยกเว้น':<52}{r['exemptions_total']:>18,.2f}")
    b.append("")
    b.append(" [ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น ข้อ 1.–23.]")
    for i in r["allowance_items"]:
        b.append(f"   {i['item']:>5}. {i['label'][:62]:<64}{i['amount']:>14,.2f}")
    b.append(f"   {'ข้อ 24. รวม (1. ถึง 23.) → แบบ ข้อ 11.2':<52}{r['allowances_total']:>18,.2f}")
    b.append("")
    b.append(f"   ข้อ 11.3 คงเหลือ (11.1 − 11.2){' ' * 34}{r['item3_balance']:>18,.2f}")
    b.append(f"   ข้อ 11.4 หัก เงินบริจาค (2 เท่า ≤10% ของ 11.3 = {r['donation_caps']['education_10pct_of_item3']:,.2f})"
             f"{r['item4_education_donation']:>18,.2f}")
    b.append(f"   ข้อ 11.5 คงเหลือ{' ' * 44}{r['item5_balance']:>18,.2f}")
    b.append(f"   ข้อ 11.6 หัก เงินบริจาค (≤10% ของ 11.5 = {r['donation_caps']['general_10pct_of_item5']:,.2f})"
             f"{r['item6_general_donation']:>18,.2f}")
    b.append(f"   ข้อ 11.7 เงินได้สุทธิ{' ' * 40}{r['net_income']:>18,.2f}")
    b.append("")
    for s in r["bracket_steps"]:
        b.append(f"   • ข้อ 11.8 ขั้น {s['range']:<20}{int(s['rate'] * 100):>3}% × {s['amount']:>15,.2f} = {s['tax']:>13,.2f}")
    b.append(f"   ข้อ 11.8 ภาษีคำนวณจากเงินได้สุทธิ{' ' * 30}{r['tax_method1']:>18,.2f}")
    b.append(f"   ข้อ 11.9 ภาษีร้อยละ 0.5 ของเงินได้ (ไม่รวม 40(1)){' ' * 20}{r['tax_method2']:>18,.2f}")
    if r["method2_note"]:
        b.append(f"      ℹ {r['method2_note']}")
    b.append(f"   ข้อ 11.10 ภาษีเงินได้ที่ต้องชำระ{' ' * 30}{r['tax_before_credit']:>18,.2f}")
    if r["foreign_tax_credit"]:
        b.append(f"   ข้อ 11.13 หัก เครดิตภาษีเงินได้จากต่างประเทศ{' ' * 24}{-r['foreign_tax_credit']:>18,.2f}")
    if r["tax_credits"]:
        b.append(f"   ข้อ 11.15 หัก ภาษีหัก ณ ที่จ่าย/เครดิต/ภ.ง.ด.93,94{' ' * 20}{-r['tax_credits']:>18,.2f}")
    b.append(line)
    if r["net_payable"] > 0.5:
        b.append(f" ข้อ 11.16 สรุป: ต้องชำระภาษีเพิ่ม {r['net_payable']:,.2f} บาท")
    elif r["net_payable"] < -0.5:
        b.append(f" ข้อ 11.16 สรุป: ชำระไว้เกิน — ขอคืนภาษีได้ {abs(r['net_payable']):,.2f} บาท")
    else:
        b.append(" ข้อ 11.16 สรุป: ไม่มีภาษีต้องชำระเพิ่ม และไม่มีภาษีขอคืน")
    if r["must_file"]:
        b.append(f" ต้องยื่นแบบ (เงินได้เกิน {r['file_threshold']:,} บาท) ภายใน 31 มี.ค. ของปีถัดไป (ออนไลน์ถึง 8 เม.ย.)")
    else:
        b.append(f" เงินได้ไม่ถึง {r['file_threshold']:,} บาท — ไม่มีหน้าที่ต้องยื่นแบบ (ยื่นเพื่อขอคืนภาษีได้)")
    b.append(line)
    for s in r["sources"]:
        b.append(f"  - {s}")
    b.append(f" หมายเหตุ: {r['disclaimer']}")
    return "\n".join(b)


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
    ("salary", "ข้อ 1 · 40(1) เงินเดือน ค่าจ้าง บำนาญ"),
    ("service", "ข้อ 3 · 40(2) เบี้ยประชุม ค่านายหน้า"),
    ("royalty", "ใบแนบ ข้อ 2 · 40(3) ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์"),
    ("interest", "ใบแนบ ข้อ 3 · 40(4) ดอกเบี้ย/เงินปันผล"),
    ("rent", "ใบแนบ ข้อ 4 · 40(5) ค่าเช่าทรัพย์สิน"),
    ("professional", "ใบแนบ ข้อ 5 · 40(6) วิชาชีพอิสระ"),
    ("contractor", "ใบแนบ ข้อ 6 · 40(7) รับเหมาก่อสร้าง"),
    ("business", "ใบแนบ ข้อ 7 · 40(8) ธุรกิจ/พาณิชย์/อื่น ๆ"),
]


def interactive(year: int = DEFAULT_YEAR) -> Person:
    print("\n=== โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (เดินตามแบบ ภ.ง.ด.90 + ใบแนบ ปีภาษี 2568) ===")
    print(f"ปีภาษี {year} — ใส่ตัวเลขเป็นบาท (เว้นว่าง = 0)\n")
    p = Person()
    print("[แบบ ข้อ 1–7] เงินได้พึงประเมิน — กรอกได้หลายแหล่ง")
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
        item: Dict[str, Any] = {"category": cat, "description": input("  รายละเอียด/ชื่อผู้จ่าย (ไม่บังคับ): ").strip()}
        item["amount"] = ask_number("  จำนวนเงินทั้งปี")
        if cat in VARIANT_RATES:
            keys = list(VARIANT_RATES[cat].keys())
            print("  ประเภทย่อย:")
            for i, k in enumerate(keys, 1):
                print(f"    {i}) {VARIANT_RATES[cat][k]['label']}")
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

    print("\n[แบบ ข้อ 2] หักจากเงินได้ 40(1) ก่อนคิดค่าใช้จ่าย")
    p.provident_fund = ask_number("  2(1) เงินสะสมสำรองเลี้ยงชีพทั้งปี (10,000 แรกลดหย่อน ข้อ 8 · ส่วนเกินยกเว้น)")
    p.gpf = ask_number("  2(2) เงินสะสม กบข.")
    p.teacher_fund = ask_number("  2(3) กองทุนสงเคราะห์ครูโรงเรียนเอกชน")
    p.severance_pay = ask_number("  2(4) เงินค่าชดเชยตามกฎหมายแรงงาน (กรณีนำมารวมคำนวณ)")

    print("\n[ใบแนบ ข้อ 1–7] ครอบครัวและประกัน")
    p.personal_special = ask_yes("  ข้อ 1 ใช้สิทธิผู้มีเงินได้ 120,000 บาท (กรณีพิเศษ)?", False)
    p.spouse_no_income = ask_yes("  ข้อ 2 คู่สมรสมีเงินได้รวมคำนวณภาษี หรือไม่มีเงินได้")
    p.children = ask_int("  ข้อ 3 บุตรชอบด้วยกฎหมาย (คน) — คนละ 30,000")
    p.children_2nd_2561 = ask_int("  ข้อ 3 บุตรคนที่ 2 ขึ้นไปที่เกิดใน/หลังปี 2561 (คน) — คนละ 60,000")
    p.parents = ask_int("  ข้อ 4 อุปการะบิดามารดา (0–4 คน) — รวมบิดา/มารดาของผู้มีเงินได้และคู่สมรส")
    p.disabled_dependents = ask_int("  ข้อ 5 อุปการะคนพิการ/ทุพพลภาพ (คน · ยกมาจาก ล.ย.04)")
    p.parent_health_insurance = ask_number("  ข้อ 6 เบี้ยประกันสุขภาพบิดามารดา")
    p.life_insurance = ask_number("  ข้อ 7.1 เบี้ยประกันชีวิต")
    p.health_insurance = ask_number("  ข้อ 7.2 เบี้ยประกันสุขภาพตนเอง")
    p.pension_life_insurance = ask_number("  ข้อ 7.3 เบี้ยประกันชีวิตแบบบำนาญ")

    print("\n[ใบแนบ ข้อ 8–19] เงินออม การลงทุน และประกันสังคม")
    p.nsf = ask_number("  ข้อ 9 เงินสะสม กอช.")
    p.rmf = ask_number("  ข้อ 10 ค่าซื้อหน่วยลงทุน RMF")
    p.home_loan_interest = ask_number("  ข้อ 11 ดอกเบี้ยเงินกู้เพื่อที่อยู่อาศัย")
    p.social_security = ask_number("  ข้อ 12 เงินสมทบกองทุนประกันสังคม")
    p.cctv_amount = ask_number("  ข้อ 13 ค่าซื้อ/ติดตั้ง CCTV (เขตพัฒนาพิเศษเฉพาะกิจ)")
    p.pregnancies = ask_int("  ข้อ 14 จำนวนครั้งที่ตั้งครรภ์/คลอดบุตร")
    if p.pregnancies:
        p.prenatal_expense = ask_number("      ค่าฝากครรภ์+คลอดบุตรรวม")
    p.donation_political = ask_number("  ข้อ 15 เงินบริจาคแก่พรรคการเมือง")
    p.social_enterprise = ask_number("  ข้อ 16 เงินลงทุนวิสาหกิจเพื่อสังคม (SE)")
    p.e_receipt_general = ask_number("  ข้อ 17.1 Easy E-Receipt 2.0 — สินค้า/บริการในระบบ VAT")
    p.e_receipt_books = ask_number("  ข้อ 17.2 — หนังสือ หนังสือพิมพ์ นิตยสาร")
    p.e_receipt_ebooks = ask_number("  ข้อ 17.3 — หนังสืออิเล็กทรอนิกส์ผ่านอินเทอร์เน็ต")
    p.e_receipt_otop = ask_number("  ข้อ 17.4 — สินค้า OTOP/วิสาหกิจชุมชน/SE")
    p.thai_esg = ask_number("  ข้อ 18 หน่วยลงทุน Thai ESG")
    p.thai_esgx = ask_number("  ข้อ 19.1 หน่วยลงทุน Thai ESGX (ลงทุนใหม่)")
    p.thai_esgx_ltf_swap = ask_number("  ข้อ 19.2 สับเปลี่ยนจากกองทุน LTF → Thai ESGX")

    print("\n[ใบแนบ ข้อ 20–23] มาตรการของรัฐของปีภาษี")
    p.home_construction_cost = ask_number("  ข้อ 20 มูลค่าค่าจ้างก่อสร้างบ้านใหม่ (ล้านละหมื่น)")
    p.art_purchase = ask_number("  ข้อ 21 ค่าซื้องานศิลปะ")
    p.travel_main_city = ask_number("  ข้อ 22.1 เที่ยวเมืองหลัก (ไม่เกิน 20,000)")
    p.travel_secondary_city = ask_number("  ข้อ 22.2 เที่ยวเมืองรอง (1.5 เท่า ไม่เกิน 30,000)")
    p.ssf = ask_number("  ข้อ 23 ค่าซื้อหน่วยลงทุน SSF")

    print("\n[แบบ ข้อ 11] บริจาค · ยกเว้น · ภาษีที่ชำระไว้")
    p.donation_education = ask_number("  ข้อ 11.4 บริจาคการศึกษา/กีฬา/รพ.รัฐ (ได้ 2 เท่า)")
    p.donation_general = ask_number("  ข้อ 11.6 บริจาคทั่วไป")
    if ask_yes("  อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ (ยกเว้นเงินได้ไม่เกิน 190,000)?"):
        p.senior_or_disabled_exemption = 190_000
    p.withholding = ask_number("  ข้อ 11.15 ภาษีหัก ณ ที่จ่าย (ถ้าไม่ได้กรอกรายแหล่ง)")
    p.dividend_credit = ask_number("           เครดิตภาษีเงินปันผล")
    p.pnd93 = ask_number("           ภาษีชำระไว้ตาม ภ.ง.ด.93")
    p.pnd94 = ask_number("           ภาษีชำระไว้ตาม ภ.ง.ด.94")
    p.foreign_tax_credit = ask_number("  ข้อ 11.13 เครดิตภาษีเงินได้จากต่างประเทศ")
    return p


def demo() -> int:
    examples = [
        ("ตัวอย่าง 1 — เงินเดือน 500,000 (หัก ณ ที่จ่าย 10,000) + ประกันสังคม",
         [Person(income_items=[{"category": "salary", "amount": 500_000, "withholding": 10_000}], social_security=9_000)]),
        ("ตัวอย่าง 2 — ให้เช่า 2 แหล่ง: บ้าน 1,000,000 + ที่ดินเกษตร 200,000",
         [Person(income_items=[
             {"category": "rent", "amount": 1_000_000, "variant": "building", "description": "บ้านเช่า"},
             {"category": "rent", "amount": 200_000, "variant": "agri_land", "description": "ที่ดินเกษตร"},
         ])]),
        ("ตัวอย่าง 3 — เงินเดือน 2,000,000 + สำรองเลี้ยงชีพ 150,000 + บริจาค",
         [Person(income_items=[{"category": "salary", "amount": 2_000_000, "withholding": 200_000}],
                 provident_fund=150_000, social_security=9_000, life_insurance=100_000,
                 home_loan_interest=100_000, donation_education=50_000, donation_general=20_000)]),
    ]
    for title, persons in examples:
        print("\n" + "=" * 80)
        print(" " + title)
        print("=" * 80)
        print(format_report(compute_pit(persons)))
    return 0


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
            elif isinstance(expected, dict) and isinstance(got, dict):
                for k2, v2 in expected.items():
                    g2 = got.get(k2)
                    if isinstance(v2, (int, float)) and isinstance(g2, (int, float)):
                        if abs(float(g2) - float(v2)) > 0.01:
                            errors.append(f"{key}.{k2}: ได้ {g2:,.2f} · ควรเป็น {v2:,.2f}")
                    elif g2 != v2:
                        errors.append(f"{key}.{k2}: ได้ {g2!r} · ควรเป็น {v2!r}")
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


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา (ตามแบบ ภ.ง.ด.90 + ใบแนบ ปีภาษี 2568)")
    ap.add_argument("--year", type=int, default=DEFAULT_YEAR)
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
