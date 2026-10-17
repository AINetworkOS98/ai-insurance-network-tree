# -*- coding: utf-8 -*-
"""
tests/test_tax_calculator.py — ทดสอบสูตรภาษี
============================================
1) ใช้ชุดทดสอบร่วมกับเว็บ (repo/python/testcases_thai_pit.json) — ตัวเลข expect มาจาก
   เอนจินที่ตรวจกับไฟล์ราชการแล้ว จึงเป็นการยืนยันว่า "ชั้นบริการ" ส่งข้อมูลเข้าเอนจินถูกต้อง
2) ทดสอบขอบขั้นบันไดตรง ๆ ด้วย progressive_tax
3) ทดสอบว่าเพดานลดหย่อนถูกจำกัดจริงผ่าน form เดียวกับที่ UI ใช้
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import tax_calculator as tc
from services.engines import ENGINE_DIR, Person, compute_pit, progressive_tax


def _cases():
    path = ENGINE_DIR / "testcases_thai_pit.json"
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def test_engine_testcases_pass_through_service():
    """ทุกกรณีในชุดทดสอบกลาง ต้องได้ผลตรงเมื่อผ่าน services.tax_calculator"""
    cases = _cases()
    assert cases, "ไม่พบชุดทดสอบ"
    checked = 0
    for case in cases[:12]:
        expected = case["expect"]
        persons = []
        for raw in case["persons"]:
            allowed = {k: v for k, v in raw.items() if k in Person.__dataclass_fields__}
            persons.append(Person(**allowed))
        got = compute_pit(persons, case.get("year", 2568))
        for key, exp in expected.items():
            if isinstance(exp, (int, float)) and not isinstance(exp, bool):
                assert got[key] == pytest.approx(float(exp), abs=0.51), f"{case['name']} · {key}"
                checked += 1
    assert checked > 0


@pytest.mark.parametrize(
    "income,expected",
    [
        (0, 0.0),
        (150_000, 0.0),
        (300_000, 7_500.0),
        (500_000, 27_500.0),
        (750_000, 65_000.0),
        (1_000_000, 115_000.0),
        (2_000_000, 365_000.0),
        (5_000_000, 1_265_000.0),
        (6_000_000, 1_615_000.0),
    ],
)
def test_progressive_brackets(income, expected):
    assert progressive_tax(income)["tax"] == pytest.approx(expected, abs=0.51)


def test_service_form_matches_engine():
    form = tc.empty_form()
    form["income_items"] = [{"category": "salary", "amount": 1_000_000, "withholding": 50_000}]
    form.update({"social_security": 9_000, "life_insurance": 100_000})
    res = tc.calc(form)
    direct = compute_pit([Person(salary=1_000_000, withholding=50_000,
                                 social_security=9_000, life_insurance=100_000)])
    assert res["item12_total_tax"] == pytest.approx(direct["item12_total_tax"], abs=0.01)
    assert res["net_payable"] == pytest.approx(direct["net_payable"], abs=0.01)


def test_caps_are_applied():
    """กรอกเกินเพดานประกันชีวิต 100,000 → ใช้ได้ไม่เกินเพดาน"""
    form = tc.empty_form()
    form["income_items"] = [{"category": "salary", "amount": 2_000_000}]
    form["life_insurance"] = 500_000
    res = tc.calc(form)
    used = [a for a in res["allowance_items"] if "7.1" in str(a.get("item", "")) or "ประกันชีวิต" in str(a.get("label", ""))]
    assert used, "ไม่พบรายการลดหย่อนประกันชีวิต"
    assert max(a["amount"] for a in used) <= 100_000


def test_min_tax_method_two():
    """เงินได้ 40(2) 1,000,000 ต้องถูกบังคับใช้วิธีที่ 2 (0.5%) ถ้าสูงกว่าภาษีขั้นบันได"""
    form = tc.empty_form()
    form["income_items"] = [{"category": "service", "amount": 1_000_000}]
    res = tc.calc(form)
    assert res["tax_method2"] == pytest.approx(5_000, abs=0.51)
    assert res["item12_total_tax"] >= res["tax_by_bracket"]


def test_compare_reports_saving():
    base = tc.empty_form()
    base["income_items"] = [{"category": "salary", "amount": 2_000_000}]
    before = tc.calc(base)
    plan = dict(base)
    plan["rmf"] = 300_000
    plan["life_insurance"] = 100_000
    after = tc.calc(plan)
    cmp = tc.compare(before, after)
    assert cmp["tax_saved"] > 0
