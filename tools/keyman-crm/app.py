# -*- coding: utf-8 -*-
"""AI Insurance Keyman Prospect & Tax Planning System 2569 — entry point (Streamlit)"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
import streamlit as st

from database import db, seed
from services import prospect_service as ps
from services import tax_rules
from services.engines import ENGINE_VERSION, TAX_YEAR

st.set_page_config(
    page_title="Keyman CRM & Tax 2569",
    page_icon="🛡",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_resource
def _bootstrap() -> dict:
    db.init_db()
    added = seed.run()
    return {"seeded": added}


info = _bootstrap()
stats = ps.stats()

st.title("🛡 AI Insurance Keyman Prospect & Tax Planning")
st.caption(
    f"ระบบบริหารรายชื่อลูกค้าเป้าหมายสำหรับประกันผู้บริหาร/เจ้าของกิจการ · ปีภาษี {TAX_YEAR} · "
    f"เอนจินภาษี v{ENGINE_VERSION} (ใช้ร่วมกับเว็บ ai-insurance-network-tree)"
)

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Prospect ทั้งหมด", stats["total"])
c2.metric("อยู่ระหว่างติดตาม", stats["open"])
c3.metric("ปิดการขายได้", stats["won"])
c4.metric("อัตราปิด", f"{stats['conversion']:.1f}%")
c5.metric("เลยกำหนดติดตาม", stats["overdue"])

st.divider()

left, right = st.columns([1.1, 1])

with left:
    st.subheader("เมนูงาน")
    st.page_link("pages/01_prospects.py", label="1. Prospects / Keyman — ฐานข้อมูลลูกค้าเป้าหมาย", icon="👥")
    st.page_link("pages/02_tax_calculator.py", label="2. Tax Calculator 2569 — ภาษีก่อน/หลังวางแผน", icon="🧾")
    st.page_link("pages/03_keyman_analysis.py", label="3. Keyman Needs Analysis — ช่องว่างความคุ้มครอง", icon="📐")
    st.page_link("pages/04_follow_ups.py", label="4. Follow-up CRM — ประวัติติดต่อ นัดหมาย", icon="📅")
    st.page_link("pages/05_dashboard.py", label="5. Dashboard — สรุปยอดและอัตราแปลง", icon="📊")

    st.subheader("สถานะฐานข้อมูล")
    st.write(f"ไฟล์ฐานข้อมูล: `{db.DB_PATH}`")
    if info["seeded"]:
        st.success(f"สร้างข้อมูลตัวอย่าง {info['seeded']} รายการ (สมมติทั้งหมด)")

with right:
    st.subheader("Pipeline")
    pipe = pd.DataFrame(
        [{"สถานะ": k, "จำนวน": v} for k, v in stats["by_status"].items() if v > 0]
    )
    if pipe.empty:
        st.info("ยังไม่มีข้อมูล — เริ่มที่หน้า Prospects")
    else:
        st.bar_chart(pipe.set_index("สถานะ")["จำนวน"])
    st.metric("วงเงินคุ้มครองที่อยู่ในไปป์ไลน์", f"{stats['pipeline_cover']:,.0f} บาท")
    st.metric("เบี้ยประเมินในไปป์ไลน์", f"{stats['pipeline_premium']:,.0f} บาท/ปี")

st.divider()
st.subheader("กฎภาษีที่โปรแกรมใช้ (Tax Rules Configuration)")
st.caption(
    "ทุกอัตรา/เพดานมีแหล่งอ้างอิงและวันที่ตรวจ · รายการที่ยังไม่ยืนยันประกาศของปีภาษีจะติดสถานะ 'รอตรวจสอบ' "
    "และห้ามนำไปสรุปเป็นคำแนะนำ"
)
st.dataframe(pd.DataFrame(tax_rules.rules_for_display()), use_container_width=True, hide_index=True)
st.warning(tax_rules.DISCLAIMER)
