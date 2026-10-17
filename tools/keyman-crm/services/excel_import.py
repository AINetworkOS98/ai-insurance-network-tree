# -*- coding: utf-8 -*-
"""services/excel_import.py — นำเข้า/ส่งออก Excel & CSV (ไม่ดึงข้อมูลจากเว็บต้นทางเอง)"""
from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List

import pandas as pd

from .prospect_service import FIELDS

# หัวคอลัมน์ภาษาไทย/อังกฤษ → field ในฐานข้อมูล
HEADER_MAP: Dict[str, str] = {
    "Prospect ID": "id", "รหัส": "id", "รหัสลูกค้า": "id",
    "คำนำหน้า": "prefix", "ชื่อ": "first_name", "นามสกุล": "last_name", "ชื่อเล่น": "nickname",
    "เบอร์โทร": "phone", "โทรศัพท์": "phone", "อีเมล": "email", "จังหวัด": "province", "พื้นที่": "area",
    "แหล่งที่มา": "lead_source", "ผู้รับผิดชอบ": "owner",
    "บริษัท": "company_name", "ชื่อบริษัท": "company_name", "เลขทะเบียนนิติบุคคล": "company_reg_no",
    "ประเภทธุรกิจ": "business_type", "รายได้ต่อปี": "annual_revenue", "กำไรสุทธิ": "net_profit",
    "จำนวนพนักงาน": "employees", "จำนวนผู้ถือหุ้น": "shareholders",
    "ตำแหน่ง": "position", "สัดส่วนการถือหุ้น": "share_pct", "จำนวนผู้บริหารหลัก": "key_executives",
    "ความสำคัญต่อธุรกิจ": "importance", "ผู้สืบทอดตำแหน่ง": "successor", "ความเสี่ยง": "risk_note",
    "สถานะ": "status", "นัดติดตาม": "next_follow_up", "วงเงินคุ้มครองที่ต้องการ": "est_cover",
    "เบี้ยประเมิน": "premium", "หมายเหตุ": "notes",
    "ยินยอม PDPA": "pdpa_consent", "วัตถุประสงค์การใช้ข้อมูล": "pdpa_purpose",
}

TEMPLATE_COLUMNS = [
    "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อเล่น", "เบอร์โทร", "อีเมล", "จังหวัด", "พื้นที่",
    "แหล่งที่มา", "ผู้รับผิดชอบ", "บริษัท", "ประเภทธุรกิจ", "รายได้ต่อปี", "กำไรสุทธิ",
    "จำนวนพนักงาน", "จำนวนผู้ถือหุ้น", "ตำแหน่ง", "สัดส่วนการถือหุ้น", "สถานะ", "นัดติดตาม",
    "วงเงินคุ้มครองที่ต้องการ", "เบี้ยประเมิน", "หมายเหตุ", "ยินยอม PDPA",
]


def read_table(content: bytes, filename: str) -> List[Dict[str, Any]]:
    """อ่าน .xlsx/.xls/.csv → list ของ dict ที่คีย์เป็น field ฐานข้อมูลแล้ว"""
    name = filename.lower()
    if name.endswith(".csv"):
        for enc in ("utf-8-sig", "utf-8", "cp874"):
            try:
                df = pd.read_csv(BytesIO(content), encoding=enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("อ่านไฟล์ CSV ไม่ได้ (ลอง UTF-8/CP874 แล้ว)")
    else:
        df = pd.read_excel(BytesIO(content))

    df = df.rename(columns={c: HEADER_MAP.get(str(c).strip(), str(c).strip()) for c in df.columns})
    rows: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        row: Dict[str, Any] = {}
        for col, val in r.items():
            if col not in FIELDS:
                continue
            if pd.isna(val):
                continue
            if col in ("annual_revenue", "net_profit", "share_pct", "est_cover", "premium"):
                row[col] = float(val)
            elif col in ("employees", "shareholders", "key_executives"):
                row[col] = int(val)
            elif col == "pdpa_consent":
                row[col] = 1 if str(val).strip().lower() in ("1", "true", "yes", "ใช่", "y") else 0
            else:
                row[col] = str(val).strip()
        if row.get("first_name"):
            rows.append(row)
    if not rows:
        raise ValueError("ไม่พบแถวข้อมูลที่ใช้ได้ — ต้องมีคอลัมน์ 'ชื่อ' อย่างน้อย")
    return rows


def template_bytes() -> bytes:
    df = pd.DataFrame(
        [
            {
                "คำนำหน้า": "นาย", "ชื่อ": "ตัวอย่าง", "นามสกุล": "ทดสอบ", "ชื่อเล่น": "หนึ่ง",
                "เบอร์โทร": "0800000000", "อีเมล": "demo@example.com", "จังหวัด": "กรุงเทพมหานคร",
                "พื้นที่": "บางรัก", "แหล่งที่มา": "แนะนำ (Referral)", "ผู้รับผิดชอบ": "ตัวแทน A",
                "บริษัท": "บริษัท ตัวอย่าง จำกัด", "ประเภทธุรกิจ": "การผลิต", "รายได้ต่อปี": 8000000,
                "กำไรสุทธิ": 1500000, "จำนวนพนักงาน": 25, "จำนวนผู้ถือหุ้น": 3, "ตำแหน่ง": "กรรมการผู้จัดการ",
                "สัดส่วนการถือหุ้น": 40, "สถานะ": "New Lead", "นัดติดตาม": "", "วงเงินคุ้มครองที่ต้องการ": 5000000,
                "เบี้ยประเมิน": 100000, "หมายเหตุ": "แถวตัวอย่าง ลบก่อนนำเข้าจริง", "ยินยอม PDPA": "ใช่",
            }
        ],
        columns=TEMPLATE_COLUMNS,
    )
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="template", index=False)
    return buf.getvalue()


def export_bytes(rows: List[Dict[str, Any]]) -> bytes:
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["id", *FIELDS])
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="prospects", index=False)
    return buf.getvalue()
