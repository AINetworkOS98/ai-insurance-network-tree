# -*- coding: utf-8 -*-
"""pages/05_dashboard.py — Dashboard สรุปยอดไปป์ไลน์และอัตราการแปลง"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
import plotly.express as px
import streamlit as st

from services import prospect_service as ps
from ui import money, page_header, thai_date

page_header("📊 Dashboard", "สรุปจำนวน Lead · มูลค่าโอกาส · นัดหมาย · อัตราการแปลงสถานะ")

stats = ps.stats()
rows = ps.all_rows()

k1, k2, k3, k4, k5 = st.columns(5)
k1.metric("Lead ทั้งหมด", stats["total"])
k2.metric("อยู่ระหว่างติดตาม", stats["open"])
k3.metric("ปิดการขายได้", stats["won"])
k4.metric("อัตราปิด", f"{stats['conversion']:.1f}%")
k5.metric("เลยกำหนดติดตาม", stats["overdue"])

v1, v2 = st.columns(2)
v1.metric("วงเงินคุ้มครองในไปป์ไลน์", f"{money(stats['pipeline_cover'])} บาท")
v2.metric("เบี้ยประเมินในไปป์ไลน์", f"{money(stats['pipeline_premium'])} บาท/ปี")

if not rows:
    st.info("ยังไม่มีข้อมูล — เริ่มที่หน้า Prospects")
    st.stop()

left, right = st.columns(2)
with left:
    st.subheader("จำนวนตามสถานะ")
    df_status = pd.DataFrame(
        [{"สถานะ": k, "จำนวน": v} for k, v in stats["by_status"].items() if v]
    )
    if not df_status.empty:
        fig = px.bar(df_status, x="สถานะ", y="จำนวน", text="จำนวน")
        fig.update_layout(margin=dict(l=10, r=10, t=20, b=10), height=360)
        st.plotly_chart(fig, use_container_width=True)

with right:
    st.subheader("สัดส่วนสถานะ")
    if not df_status.empty:
        fig2 = px.pie(df_status, names="สถานะ", values="จำนวน", hole=0.45)
        fig2.update_layout(margin=dict(l=10, r=10, t=20, b=10), height=360)
        st.plotly_chart(fig2, use_container_width=True)

st.subheader("มูลค่าโอกาสตามจังหวัด")
df_prov = pd.DataFrame(
    [
        {"จังหวัด": r["province"] or "ไม่ระบุ", "วงเงินเป้าหมาย": float(r["est_cover"] or 0)}
        for r in rows
        if not str(r["status"]).startswith("Closed")
    ]
)
if not df_prov.empty:
    grouped = df_prov.groupby("จังหวัด", as_index=False)["วงเงินเป้าหมาย"].sum().sort_values(
        "วงเงินเป้าหมาย", ascending=False
    )
    fig3 = px.bar(grouped, x="จังหวัด", y="วงเงินเป้าหมาย", text_auto=".2s")
    fig3.update_layout(margin=dict(l=10, r=10, t=20, b=10), height=340)
    st.plotly_chart(fig3, use_container_width=True)

st.subheader("รายการที่ต้องติดตามก่อน")
due = ps.due_followups(include_overdue_only=False)
if due:
    st.dataframe(
        pd.DataFrame(
            [
                {"รหัส": r["id"], "ชื่อ": f"{r['first_name']} {r['last_name']}",
                 "บริษัท": r["company_name"], "สถานะ": r["status"],
                 "นัดติดตาม": thai_date(r["next_follow_up"]), "ผู้รับผิดชอบ": r["owner"]}
                for r in due
            ]
        ),
        use_container_width=True, hide_index=True,
    )
else:
    st.caption("ไม่มีรายการค้าง")

st.caption(
    "อัตราปิด = ปิดการขายได้ ÷ Lead ทั้งหมด · ตัวเลขทั้งหมดมาจากฐานข้อมูลของโปรแกรมนี้ "
    "(ไม่ใช่การดึงจากเว็บต้นทาง)"
)
