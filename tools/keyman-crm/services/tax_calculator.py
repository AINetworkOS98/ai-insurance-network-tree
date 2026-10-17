# -*- coding: utf-8 -*-
"""
services/tax_calculator.py — ชั้นบริการของหน้าคำนวณภาษี
=====================================================
รับ "form dict" จาก UI → สร้าง Person → เรียกเอนจิน check แล้วที่ python/thai_tax_calculator.py
ไม่มีสูตรภาษีในไฟล์นี้เลย (กันกฎสองชุดขัดกันเอง)
"""
from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List

import pandas as pd

from .engines import TAX_YEAR, IncomeItem, Person, compute_pit
from .tax_rules import DISCLAIMER

INCOME_CATEGORIES = [
    ("salary", "เงินเดือน ค่าจ้าง โบนัส (40(1))"),
    ("service", "รับทำงานให้/ค่านายหน้า (40(2))"),
    ("royalty", "ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์ (40(3))"),
    ("interest", "ดอกเบี้ย/เงินปันผล (40(4))"),
    ("rent", "ค่าเช่าทรัพย์สิน (40(5))"),
    ("professional", "วิชาชีพอิสระ (40(6))"),
    ("contractor", "รับเหมาก่อสร้าง (40(7))"),
    ("business", "ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))"),
]

RENT_VARIANTS = {
    "building": "บ้าน/โรงเรือน (30%)",
    "vehicle": "ยานพาหนะ (30%)",
    "agri_land": "ที่ดินเกษตร (20%)",
    "other_land": "ที่ดินอื่น (15%)",
    "other": "ทรัพย์สินอื่น (10%)",
}
PROFESSIONAL_VARIANTS = {
    "other": "กฎหมาย/วิศวกรรม/บัญชี (30%)",
    "medical": "โรคศิลปะ (60%)",
    "fine_arts": "ประณีตศิลปกรรม (60%)",
}
BUSINESS_VARIANTS = {
    "general": "ธุรกิจ/พาณิชย์/เกษตร (60%)",
    "transport": "ขนส่ง/รับจ้างยานพาหนะ (60%)",
    "entertainer": "นักแสดง/นักกีฬาอาชีพ (ขั้นบันได 60/40 · ไม่เกิน 600,000)",
}

# ── ค่าลดหย่อนที่ UI รับ (key ตรงกับ dataclass Person) ─────────────────────────
ALLOWANCE_FIELDS: List[tuple[str, str, str, float]] = [
    # (key, label, group, max)
    ("life_insurance", "ประกันชีวิต (ข้อ 7.1)", "ประกัน", 100_000),
    ("health_insurance", "ประกันสุขภาพตนเอง (ข้อ 7.2)", "ประกัน", 25_000),
    ("pension_life_insurance", "ประกันบำนาญ (ข้อ 7.3)", "ประกัน", 200_000),
    ("spouse_life_insurance", "ประกันชีวิตคู่สมรส", "ประกัน", 10_000),
    ("parent_health_insurance", "ประกันสุขภาพบิดามารดา (ข้อ 6)", "ประกัน", 15_000),
    ("provident_fund", "กองทุนสำรองเลี้ยงชีพ (แบบ ข้อ 2(1))", "การออม/ลงทุน", 500_000),
    ("gpf", "กองทุนบำเหน็จบำนาญข้าราชการ (กบข.)", "การออม/ลงทุน", 500_000),
    ("teacher_fund", "กองทุนสงเคราะห์ครูโรงเรียนเอกชน", "การออม/ลงทุน", 500_000),
    ("rmf", "RMF (ข้อ 10)", "การออม/ลงทุน", 500_000),
    ("ssf", "SSF (ข้อ 23)", "การออม/ลงทุน", 200_000),
    ("thai_esg", "Thai ESG (ข้อ 18)", "การออม/ลงทุน", 300_000),
    ("thai_esgx", "Thai ESGX (ข้อ 19.1)", "การออม/ลงทุน", 300_000),
    ("nsf", "กองทุนการออมแห่งชาติ กอช. (ข้อ 9)", "การออม/ลงทุน", 30_000),
    ("home_loan_interest", "ดอกเบี้ยกู้ซื้อบ้าน (ข้อ 11)", "อื่น ๆ", 100_000),
    ("social_security", "ประกันสังคม (ข้อ 12)", "อื่น ๆ", 9_000),
    ("donation_education", "บริจาคการศึกษา/กีฬา (2 เท่า)", "บริจาค", 10_000_000),
    ("donation_general", "บริจาคทั่วไป", "บริจาค", 10_000_000),
    ("e_receipt_general", "Easy E-Receipt 2.0 (ข้อ 17)", "มาตรการพิเศษ", 50_000),
    ("travel_main_city", "เที่ยวดีมีคืน · เมืองหลัก (ข้อ 22.1)", "มาตรการพิเศษ", 20_000),
    ("travel_secondary_city", "เที่ยวดีมีคืน · เมืองรอง (ข้อ 22.2)", "มาตรการพิเศษ", 30_000),
    ("home_construction_cost", "ค่าจ้างก่อสร้างบ้าน (ข้อ 20)", "มาตรการพิเศษ", 100_000),
    ("art_purchase", "ค่างานศิลปะ (ข้อ 21)", "มาตรการพิเศษ", 100_000),
]

PENDING_ALLOWANCE_KEYS = {"e_receipt_general", "thai_esgx", "travel_main_city", "travel_secondary_city"}

COUNT_FIELDS = [
    ("children", "จำนวนบุตร (คนละ 30,000)", 0, 20),
    ("children_2nd_2561", "บุตรคนที่ 2+ ที่เกิดปี 2561 ขึ้นไป (คนละ 60,000)", 0, 20),
    ("adopted_children", "บุตรบุญธรรม (คนละ 60,000)", 0, 3),
    ("parents", "อุปการะบิดามารดา (คนละ 30,000 ไม่เกิน 4)", 0, 4),
    ("disabled_dependents", "อุปการะคนพิการ (คนละ 60,000)", 0, 20),
]


def empty_form() -> Dict[str, Any]:
    form: Dict[str, Any] = {k: 0.0 for k, *_ in ALLOWANCE_FIELDS}
    form.update({k: 0 for k, *_ in COUNT_FIELDS})
    form.update(
        {
            "personal": True,
            "personal_special": False,
            "spouse_no_income": False,
            "withholding": 0.0,
            "income_items": [],
        }
    )
    return form


def build_person(form: Dict[str, Any]) -> Person:
    items = []
    for raw in form.get("income_items", []):
        if float(raw.get("amount") or 0) <= 0:
            continue
        items.append(
            IncomeItem(
                category=raw["category"],
                amount=float(raw["amount"]),
                description=raw.get("description", ""),
                variant=raw.get("variant", ""),
                expense_mode=raw.get("expense_mode", "standard"),
                actual_expense=float(raw.get("actual_expense") or 0),
                withholding=float(raw.get("withholding") or 0),
            )
        )
    allowed = {k: v for k, v in form.items() if k in Person.__dataclass_fields__}
    allowed["income_items"] = [i.__dict__ for i in items]
    allowed.pop("withholding", None)
    return Person(**allowed)


def calc(form: Dict[str, Any], year: int = TAX_YEAR) -> Dict[str, Any]:
    """คำนวณภาษี 1 คน/1 ครัวเรือน จาก form dict"""
    person = build_person(form)
    # withholding: ถ้าไม่ได้กรอกแยกรายการ ใช้ยอดรวมใน form
    if not form.get("income_items") and float(form.get("withholding") or 0) > 0:
        person.withholding = float(form["withholding"])
    res = compute_pit([person], year)
    res["pending_items"] = [
        f"{dict((k, l) for k, l, *_ in ALLOWANCE_FIELDS).get(k, k)} (รอตรวจสอบประกาศปี {TAX_YEAR})"
        for k in PENDING_ALLOWANCE_KEYS
        if float(form.get(k) or 0) > 0
    ]
    res["disclaimer"] = DISCLAIMER
    res["engine_note"] = (
        f"คำนวณด้วยเอนจิน v{res['version']} (ชุดกฎที่ตรวจกับ ภ.ง.ด.90 ปีภาษี 2568) · "
        f"แสดงผลในชื่อปีภาษี {year}"
    )
    return res


def summary_rows(res: Dict[str, Any]) -> List[dict]:
    return [
        {"รายการ": "1. เงินได้พึงประเมินรวม", "จำนวนเงิน": res["gross_total"]},
        {"รายการ": "2. หักค่าใช้จ่าย (อัตราเหมา)", "จำนวนเงิน": res["expenses_total"]},
        {"รายการ": "3. หักแบบ ข้อ 2(1)–(4) (สำรองเลี้ยงชีพส่วนเกิน/กบข./ครู/ชดเชย)", "จำนวนเงิน": res["section2_total"]},
        {"รายการ": "4. เงินได้หลังหักค่าใช้จ่าย", "จำนวนเงิน": res["income_after_expense"]},
        {"รายการ": "5. หักค่าลดหย่อนและยกเว้น", "จำนวนเงิน": res["allowances_total"] + res["exemptions_total"]},
        {"รายการ": "6. หักบริจาคการศึกษา (2 เท่า)", "จำนวนเงิน": res["item4_education_donation"]},
        {"รายการ": "7. หักบริจาคทั่วไป", "จำนวนเงิน": res["item6_general_donation"]},
        {"รายการ": "8. เงินได้สุทธิ", "จำนวนเงิน": res["net_income"]},
        {"รายการ": "9. ภาษีตามขั้นบันได", "จำนวนเงิน": res["tax_by_bracket"]},
        {"รายการ": "10. ภาษีขั้นต่ำ 0.5% (ถ้าใช้)", "จำนวนเงิน": res["tax_method2"] if res["min_tax_applied"] else 0},
        {"รายการ": "11. ภาษีที่ต้องชำระทั้งปี", "จำนวนเงิน": res["item12_total_tax"]},
        {"รายการ": "12. ภาษีหัก ณ ที่จ่าย/เครดิต", "จำนวนเงิน": res["tax_credits"]},
        {"รายการ": "13. ภาษีต้องชำระเพิ่ม (+) / ขอคืน (−)", "จำนวนเงิน": res["net_payable"]},
    ]


def compare(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    rows = [
        ("เงินได้พึงประเมินรวม", before["gross_total"], after["gross_total"]),
        ("ค่าใช้จ่ายที่หักได้", before["expenses_total"], after["expenses_total"]),
        ("ค่าลดหย่อนที่ใช้ได้จริง", before["allowances_total"], after["allowances_total"]),
        ("เงินได้สุทธิ", before["net_income"], after["net_income"]),
        ("ภาษีทั้งปี", before["item12_total_tax"], after["item12_total_tax"]),
        ("อัตราภาษีขั้นสูงสุด (marginal)", before["marginal_rate"] * 100, after["marginal_rate"] * 100),
        ("ภาษีต้องชำระเพิ่ม/ขอคืน", before["net_payable"], after["net_payable"]),
    ]
    return {
        "rows": [{"รายการ": r, "ก่อนวางแผน": b, "หลังวางแผน": a, "ผลต่าง": round(a - b, 2)} for r, b, a in rows],
        "tax_saved": round(before["item12_total_tax"] - after["item12_total_tax"], 2),
    }


def to_excel(res: Dict[str, Any], form_name: str = "ภาษี 2569") -> bytes:
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame(summary_rows(res)).to_excel(writer, sheet_name="สรุป", index=False)
        pd.DataFrame(res["income_items"]).to_excel(writer, sheet_name="เงินได้", index=False)
        pd.DataFrame(res["allowance_items"]).to_excel(writer, sheet_name="ลดหย่อน", index=False)
        pd.DataFrame(res["bracket_steps"]).to_excel(writer, sheet_name="ขั้นบันได", index=False)
        pd.DataFrame({"หมายเหตุ": [res["engine_note"], res["disclaimer"]]}).to_excel(
            writer, sheet_name="ข้อจำกัด", index=False
        )
    return buf.getvalue()


def to_html_report(res: Dict[str, Any], title: str = "รายงานภาษีบุคคลธรรมดา") -> str:
    """รายงาน HTML พร้อมพิมพ์ (Ctrl+P → บันทึกเป็น PDF ได้จากเบราว์เซอร์)"""
    rows = "".join(
        f"<tr><td>{r['รายการ']}</td><td class='n'>{r['จำนวนเงิน']:,.2f}</td></tr>"
        for r in summary_rows(res)
    )
    steps = "".join(
        f"<tr><td>{s.get('range', '')}</td><td class='n'>{float(s.get('rate', 0)) * 100:.0f}%</td>"
        f"<td class='n'>{float(s.get('amount', 0)):,.2f}</td><td class='n'>{float(s.get('tax', 0)):,.2f}</td></tr>"
        for s in res["bracket_steps"]
    )
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>{title}</title>
<style>
 body{{font-family:'Sarabun','Tahoma',sans-serif;margin:28px;color:#111}}
 h1{{font-size:20px;margin:0 0 4px}} .muted{{color:#555;font-size:12px}}
 table{{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}}
 th,td{{border:1px solid #bbb;padding:6px 8px}} th{{background:#f0f2f5;text-align:left}}
 td.n,th.n{{text-align:right;font-variant-numeric:tabular-nums}}
 .note{{font-size:11px;color:#666}}
</style></head><body>
<h1>{title}</h1>
<div class="muted">ปีภาษี {res['year']} · เอนจิน v{res['version']} · {res['filing_mode']}</div>
<table><thead><tr><th>รายการ</th><th class="n">จำนวนเงิน (บาท)</th></tr></thead><tbody>{rows}</tbody></table>
<table><thead><tr><th>ช่วงเงินได้สุทธิ</th><th class="n">อัตรา</th><th class="n">เงินได้ในช่วง</th><th class="n">ภาษี</th></tr></thead>
<tbody>{steps}</tbody></table>
<p class="note">{res['engine_note']}<br>{res['disclaimer']}</p>
</body></html>"""
