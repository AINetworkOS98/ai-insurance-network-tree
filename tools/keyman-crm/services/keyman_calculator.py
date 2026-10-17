# -*- coding: utf-8 -*-
"""services/keyman_calculator.py — วิเคราะห์ความจำเป็นประกันคีย์แมน (ห่อเอนจินที่ตรวจแล้ว)"""
from __future__ import annotations

from typing import Any, Dict, List

from .engines import TAX_YEAR, compute_keyman

DEFAULT_INPUT: Dict[str, Any] = {
    "profit_per_year": 0.0,
    "years_to_replace": 3,
    "successor_cost": 0.0,
    "revenue_at_risk": 0.0,
    "guaranteed_debt": 0.0,
    "share_buyout": 0.0,
    "premium": 0.0,
    "deductible": True,
    "benefit_to_executive": True,
    "company_pays_exec_tax": True,
    "company_revenue": 0.0,
    "company_expenses": 0.0,
    "company_capital": 0.0,
    "executive_income": 0.0,
}

ASSUMPTIONS = [
    "ทุนประกันที่แนะนำ = ค่าสูงสุดของ 3 วิธี (ทดแทนกำไร · ต้นทุนทดแทน · ภาระผูกพัน) — ไม่ใช่ผลบวกของทุกวิธี",
    "การหักเบี้ยเป็นค่าใช้จ่ายของบริษัทต้องจ่ายให้ผู้บริหาร/ลูกจ้างตามระเบียบ และผู้รับประโยชน์เป็นบริษัท "
    "(จ่ายเฉพาะผู้ถือหุ้นรายเดียวหักไม่ได้ ตามคำสั่ง ป.96/2543)",
    "หากเบี้ยเป็นประโยชน์แก่ผู้บริหาร ต้องนับเป็นเงินได้ของผู้นั้น (มาตรา 39(1)) และถ้าบริษัทออกภาษีให้ "
    "ต้อง gross-up จนกว่าภาษีจะนิ่ง",
    "ยังไม่รวมผลของเงินค่าสินไหมที่บริษัทได้รับ (อาจต้องนำมารวมคำนวณภาษีนิติบุคคล) — ใช้เป็นการประมาณการ",
]


def analyze(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = {**DEFAULT_INPUT, **{k: v for k, v in data.items() if v is not None}}
    res = compute_keyman(payload)
    res["_inputs"] = payload
    return res


def cover_options(res: Dict[str, Any]) -> List[Dict[str, Any]]:
    """ช่วงทุนประกันที่เสนอเป็นทางเลือก พร้อมสมมติฐานของแต่ละทาง"""
    base = float(res.get("recommended_cover") or 0)
    if base <= 0:
        return []
    notes = {
        0.8: "ระดับพื้นฐาน — พอปิดภาระผูกพัน/กำไรบางส่วน เป็นทางเลือกงบประมาณจำกัด",
        1.0: "ระดับที่โมเดลแนะนำ (สูงสุดของ 3 วิธี)",
        1.2: "ระดับเผื่อความไม่แน่นอน 20% (เงินเฟ้อ/ต้นทุนสรรหาสูงกว่าประมาณ)",
    }
    out = []
    for factor, note in notes.items():
        out.append({"ทุนประกัน": round(base * factor, -3), "สมมติฐาน": note})
    return out


def result_rows(res: Dict[str, Any]) -> List[dict]:
    return [
        {"รายการ": "ความจำเป็นทดแทนกำไร (กำไร × ปี)", "จำนวนเงิน": res.get("profit_need", 0)},
        {"รายการ": "ความจำเป็นต้นทุนทดแทน (สรรหา + รายได้เสี่ยง)", "จำนวนเงิน": res.get("replacement_need", 0)},
        {"รายการ": "ภาระผูกพัน (หนี้ค้ำ + ซื้อหุ้นคืน)", "จำนวนเงิน": res.get("obligation_need", 0)},
        {"รายการ": "ทุนประกันที่แนะนำ", "จำนวนเงิน": res.get("recommended_cover", 0)},
        {"รายการ": "ภาษีนิติบุคคลก่อนทำประกัน", "จำนวนเงิน": res.get("cit_before", 0)},
        {"รายการ": "ภาษีนิติบุคคลหลังทำประกัน", "จำนวนเงิน": res.get("cit_after", 0)},
        {"รายการ": "ประหยัดภาษีนิติบุคคล", "จำนวนเงิน": res.get("cit_saving", 0)},
        {"รายการ": "ภาษีบุคคลธรรมดาของผู้บริหารเพิ่มขึ้น", "จำนวนเงิน": res.get("exec_tax_increase", 0)},
        {"รายการ": "ต้นทุนสุทธิของบริษัท (เบี้ย − ประหยัดภาษี + ภาษีผู้บริหาร)", "จำนวนเงิน": res.get("net_cost", 0)},
        {"รายการ": "ต้นทุนสุทธิต่อทุนประกัน 1 บาท", "จำนวนเงิน": res.get("net_cost_per_cover", 0)},
    ]


def method_label(res: Dict[str, Any]) -> str:
    return str(res.get("cover_method") or "ยังไม่มีข้อมูลเพียงพอ")


def warnings(res: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    if not res.get("deductible", True):
        out.append("กรณีนี้เบี้ยหักเป็นค่าใช้จ่ายของบริษัทไม่ได้ → ต้นทุนสุทธิสูงกว่าปกติ")
    if res.get("exec_tax_increase", 0) > 0 and res.get("benefit_to_executive", True):
        out.append("เบี้ยก่อประโยชน์ผู้บริหาร = เงินได้ของผู้นั้น ต้องแจ้ง/นำยื่นรวมภาษีบุคคลธรรมดา")
    if not res.get("gu_converged", True) and res.get("gu_tax_borne", 0) > 0:
        out.append("การคำนวณ gross-up ยังไม่ลู่เข้า — ควรใช้ที่ปรึกษาภาษีตรวจ")
    out.append(f"ตัวเลขนี้ใช้ชุดกฎปีภาษี {TAX_YEAR} และยังไม่รวมเงินค่าสินไหมที่บริษัทอาจได้รับ")
    return out
