# -*- coding: utf-8 -*-
"""database/models.py — โครงข้อมูล + ตรวจสอบความถูกต้องด้วย Pydantic"""
from __future__ import annotations

import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

STATUS_LITERAL = Literal[
    "New Lead", "Researching", "Contacted", "Appointment", "Fact Finding",
    "Needs Analysis", "Proposal", "Follow Up", "Closed Won", "Closed Lost",
]

PHONE_RE = re.compile(r"^[0-9+\-\s()]{6,20}$")


class ProspectIn(BaseModel):
    prefix: str = ""
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    nickname: str = ""
    phone: str = ""
    email: str = ""
    province: str = ""
    area: str = ""
    lead_source: str = ""
    owner: str = ""
    pdpa_consent: bool = False
    pdpa_purpose: str = ""

    company_name: str = ""
    company_reg_no: str = ""
    business_type: str = ""
    annual_revenue: float = Field(default=0, ge=0)
    net_profit: float = Field(default=0)
    employees: int = Field(default=0, ge=0)
    shareholders: int = Field(default=0, ge=0)
    position: str = ""
    share_pct: float = Field(default=0, ge=0, le=100)
    key_executives: int = Field(default=1, ge=0)
    importance: str = ""
    successor: str = ""
    risk_note: str = ""

    status: STATUS_LITERAL = "New Lead"
    next_follow_up: str = ""
    est_cover: float = Field(default=0, ge=0)
    premium: float = Field(default=0, ge=0)
    notes: str = ""

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = (v or "").strip()
        if v and not PHONE_RE.match(v):
            raise ValueError("เบอร์โทรไม่ถูกต้อง (ใช้ 0-9, +, -, เว้นวรรค)")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = (v or "").strip()
        if v and "@" not in v:
            raise ValueError("อีเมลไม่ถูกต้อง")
        return v

    @field_validator("next_follow_up")
    @classmethod
    def _date(cls, v: str) -> str:
        v = (v or "").strip()
        if v:
            try:
                date.fromisoformat(v)
            except ValueError as exc:
                raise ValueError("วันที่นัดติดตามต้องเป็น YYYY-MM-DD") from exc
        return v


class KeymanInput(BaseModel):
    profit_per_year: float = Field(default=0, ge=0)
    years_to_replace: int = Field(default=3, ge=0, le=20)
    successor_cost: float = Field(default=0, ge=0)
    revenue_at_risk: float = Field(default=0, ge=0)
    guaranteed_debt: float = Field(default=0, ge=0)
    share_buyout: float = Field(default=0, ge=0)
    premium: float = Field(default=0, ge=0)
    deductible: bool = True
    benefit_to_executive: bool = True
    company_pays_exec_tax: bool = True
    company_revenue: float = Field(default=0, ge=0)
    company_expenses: float = Field(default=0, ge=0)
    company_capital: float = Field(default=0, ge=0)
    executive_income: float = Field(default=0, ge=0)
    prospect_id: Optional[str] = None
