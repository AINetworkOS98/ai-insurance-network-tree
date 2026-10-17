# -*- coding: utf-8 -*-
"""ui.py — ตัวช่วยร่วมของทุกหน้า (path bootstrap, รูปแบบเงิน/วันที่ไทย)"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st


def money(x: float | int | None) -> str:
    try:
        return f"{float(x or 0):,.0f}"
    except (TypeError, ValueError):
        return "0"


def money2(x: float | int | None) -> str:
    try:
        return f"{float(x or 0):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def thai_date(iso: str) -> str:
    if not iso:
        return "—"
    try:
        d = date.fromisoformat(str(iso)[:10])
    except ValueError:
        return str(iso)
    return f"{d.day:02d}/{d.month:02d}/{d.year + 543}"


def page_header(title: str, subtitle: str = "") -> None:
    st.title(title)
    if subtitle:
        st.caption(subtitle)


def pct_of_total(value: float, total: float) -> str:
    if not total:
        return "0%"
    return f"{value / total * 100:.1f}%"


def rerun() -> None:
    """st.rerun() แบบเข้ากันได้ทั้ง Streamlit เก่า/ใหม่"""
    fn = getattr(st, "rerun", None) or getattr(st, "experimental_rerun", None)
    if fn:
        fn()
