# -*- coding: utf-8 -*-
"""database/seed.py — ข้อมูลตัวอย่าง (สมมติทั้งหมด ไม่ใช่ข้อมูลลูกค้าจริง)"""
from __future__ import annotations

from datetime import date, timedelta

from database import db
from services import prospect_service as ps

DEMO = [
    {
        "prefix": "นาย", "first_name": "สมชาย", "last_name": "ตัวอย่าง", "nickname": "ชาย",
        "phone": "0800000001", "email": "somchai.demo@example.com",
        "province": "กรุงเทพมหานคร", "area": "บางรัก", "lead_source": "แนะนำ (Referral)",
        "owner": "ตัวแทน A", "pdpa_consent": 1, "pdpa_purpose": "ติดต่อเพื่อเสนอประกันคีย์แมน",
        "company_name": "บริษัท ตัวอย่างการผลิต จำกัด", "business_type": "การผลิตชิ้นส่วน",
        "annual_revenue": 8000000, "net_profit": 1500000, "employees": 25, "shareholders": 3,
        "position": "กรรมการผู้จัดการ", "share_pct": 40, "key_executives": 2,
        "importance": "ผู้ก่อตั้ง ตัดสินใจลูกค้ารายใหญ่ทั้งหมด",
        "successor": "ยังไม่มี ผู้ช่วยผู้จัดการฝ่ายขาย",
        "risk_note": "ค้ำประกันสินเชื่อธนาคาร 2 ล้าน + ลูกค้ารายใหญ่ขึ้นกับเจ้าตัว",
        "status": "Needs Analysis",
        "next_follow_up": (date.today() + timedelta(days=2)).isoformat(),
        "est_cover": 6000000, "premium": 120000, "notes": "ข้อมูลตัวอย่างสำหรับสาธิต",
    },
    {
        "prefix": "นางสาว", "first_name": "สมหญิง", "last_name": "ทดสอบ", "nickname": "หญิง",
        "phone": "0800000002", "email": "somying.demo@example.com",
        "province": "เชียงใหม่", "area": "เมือง", "lead_source": "LINE OA",
        "owner": "ตัวแทน B", "pdpa_consent": 1, "pdpa_purpose": "ติดต่อเพื่อเสนอประกันคีย์แมน",
        "company_name": "บริษัท ทดสอบโลจิสติกส์ จำกัด", "business_type": "ขนส่ง",
        "annual_revenue": 50000000, "net_profit": 8000000, "employees": 60, "shareholders": 2,
        "position": "ประธานกรรมการ", "share_pct": 60, "key_executives": 1,
        "importance": "เจ้าของคนเดียวที่ดูแลสัญญาขนส่งทั้งหมด",
        "successor": "บุตรสาว (ยังเรียนอยู่)",
        "risk_note": "หนี้ค้ำประกัน 10 ล้าน + ซื้อหุ้นคืนจากทายาท",
        "status": "Proposal",
        "next_follow_up": (date.today() - timedelta(days=1)).isoformat(),
        "est_cover": 12000000, "premium": 240000, "notes": "ข้อมูลตัวอย่างสำหรับสาธิต",
    },
]


def run(force: bool = False) -> int:
    db.init_db()
    existing = db.query_one("SELECT COUNT(*) AS c FROM prospects")
    if existing and existing["c"] and not force:
        return 0
    n = 0
    for row in DEMO:
        pid = ps.create(row)
        ps.add_activity(
            pid, "โทร", (date.today() - timedelta(days=3)).isoformat(),
            "โทรครั้งแรก ผู้สนใจนัดประชุม", concern="ขอศึกษาข้อมูลก่อน",
        )
        n += 1
    return n


if __name__ == "__main__":
    print(f"seed: {run(force=True)} รายการ")
