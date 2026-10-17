# -*- coding: utf-8 -*-
"""
services/engines.py — เชื่อมเอนจินที่ตรวจสอบแล้วของ repo (python/*.py)
=====================================================================
ไม่เขียนสูตรภาษีซ้ำ: ระบบนี้เรียกใช้ engines ที่ผ่านชุดทดสอบร่วมกับเว็บแล้ว
  • python/thai_tax_calculator.py  → ภาษีบุคคลธรรมดา (ภ.ง.ด.90 + ใบแนบลดหย่อน)
  • python/thai_cit_calculator.py  → ภาษีนิติบุคคล (SME ขั้นบันได)
  • python/keyman_insurance.py     → ประกันคีย์แมน (วงเงิน + ผลภาษีทั้ง 2 ฝั่ง)

ถ้าแก้กติกาภาษี ต้องแก้ที่ python/ ใน repo แล้วชุดทดสอบ (testcases_*.json) ต้องผ่าน
แล้วหน้านี้จะใช้ค่าใหม่ทันทีโดยไม่ต้องแก้โค้ดแอป
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

PROJECT_ROOT = Path(__file__).resolve().parent.parent          # tools/keyman-crm
REPO_ROOT = PROJECT_ROOT.parent.parent                          # repo root
ENGINE_DIR = REPO_ROOT / "python"

TAX_YEAR = 2569


def _load(name: str, filename: str) -> ModuleType:
    path = ENGINE_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"ไม่พบเอนจิน {path} — ต้องรันจาก repo ai-insurance-network-tree")
    if str(ENGINE_DIR) not in sys.path:
        sys.path.insert(0, str(ENGINE_DIR))
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)          # type: ignore[arg-type]
    assert spec and spec.loader
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)                          # type: ignore[union-attr]
    return mod


pit = _load("thai_tax_calculator", "thai_tax_calculator.py")
cit = _load("thai_cit_calculator", "thai_cit_calculator.py")
keyman = _load("keyman_insurance", "keyman_insurance.py")

Person = pit.Person
IncomeItem = pit.IncomeItem
compute_pit = pit.compute_pit
progressive_tax = pit.progressive_tax
compute_cit = cit.compute_cit
compute_keyman = keyman.compute_keyman

ENGINE_VERSION = pit.VERSION
ENGINE_SOURCES = list(getattr(pit, "SOURCES", []))


def engine_selftest() -> dict:
    """รันชุดทดสอบของเอนจิน เดิม (ใช้ตรวจว่าฐานข้อมูลกฎยังตรงกับเว็บ)"""
    out: dict = {"pit": None, "cit": None, "keyman": None}
    for mod, key in ((pit, "pit"), (cit, "cit"), (keyman, "keyman")):
        try:
            out[key] = mod.selftest()
        except Exception as exc:          # pragma: no cover - รายงานตรง ๆ
            out[key] = f"error: {exc}"
    return out
