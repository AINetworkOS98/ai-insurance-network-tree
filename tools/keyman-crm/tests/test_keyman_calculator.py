# -*- coding: utf-8 -*-
"""tests/test_keyman_calculator.py — ทดสอบผลวิเคราะห์คีย์แมน + ชั้นบริการ CRM"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import keyman_calculator as kc
from services.engines import ENGINE_DIR, compute_keyman


def _cases():
    return json.loads((ENGINE_DIR / "testcases_keyman.json").read_text(encoding="utf-8"))["cases"]


def test_keyman_testcases_match_engine():
    cases = _cases()
    assert cases
    for case in cases:
        a = compute_keyman(case["input"])
        b = kc.analyze(case["input"])
        for key, exp in case["expect"].items():
            if isinstance(exp, bool):
                assert bool(b[key]) == exp, f"{case['name']} · {key}"
            elif isinstance(exp, (int, float)):
                assert float(b[key]) == pytest.approx(float(exp), abs=0.51), f"{case['name']} · {key}"
            else:
                assert b[key] == exp
        assert a["recommended_cover"] == pytest.approx(b["recommended_cover"], abs=0.01)


def test_cover_is_max_of_three_methods():
    res = kc.analyze(
        {
            "profit_per_year": 1_000_000, "years_to_replace": 3,
            "successor_cost": 500_000, "revenue_at_risk": 200_000,
            "guaranteed_debt": 4_000_000, "share_buyout": 1_000_000,
        }
    )
    assert res["profit_need"] == pytest.approx(3_000_000, abs=0.51)
    assert res["replacement_need"] == pytest.approx(700_000, abs=0.51)
    assert res["obligation_need"] == pytest.approx(5_000_000, abs=0.51)
    assert res["recommended_cover"] == pytest.approx(5_000_000, abs=0.51)


def test_cover_options_three_levels():
    res = kc.analyze({"profit_per_year": 1_000_000, "years_to_replace": 3})
    opts = kc.cover_options(res)
    assert len(opts) == 3
    assert opts[1]["ทุนประกัน"] == pytest.approx(res["recommended_cover"], abs=1)


def test_no_data_no_cover():
    res = kc.analyze({})
    assert res["recommended_cover"] == 0
    assert kc.cover_options(res) == []
    assert any("ยังไม่มีข้อมูล" in kc.method_label(res) for _ in [0])


def test_prospect_crud_and_duplicate_detection(tmp_path, monkeypatch):
    from database import db
    from services import prospect_service as ps

    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db.init_db()
    pid = ps.create(
        {
            "first_name": "ทดสอบ", "last_name": "ระบบ", "phone": "0899999999",
            "email": "t@example.com", "company_name": "ทดสอบ จำกัด", "status": "New Lead",
        }
    )
    assert pid.startswith("P")
    row = ps.get(pid)
    assert row is not None and row["first_name"] == "ทดสอบ"

    dups = ps.duplicates("ทดสอบ", "ระบบ", "0899999999", "")
    assert len(dups) == 1

    ps.update_fields(pid, status="Contacted", next_follow_up="2026-01-01")
    assert ps.get(pid)["status"] == "Contacted"

    ps.add_activity(pid, "โทร", "2025-12-01", "คุยครั้งแรก")
    assert len(ps.activities(pid)) == 1

    stats = ps.stats()
    assert stats["total"] == 1

    ps.delete(pid)
    assert ps.get(pid) is None
