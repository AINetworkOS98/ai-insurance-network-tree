# -*- coding: utf-8 -*-
"""pages/03_keyman_analysis.py — วิเคราะห์ความจำเป็นประกันคีย์แมน + ช่องว่างความคุ้มครอง"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
import streamlit as st

from services import keyman_calculator as kc
from services import prospect_service as ps
from services.engines import TAX_YEAR
from ui import money, page_header, rerun

page_header(
    "📐 Keyman Needs Analysis",
    f"คำนวณวงเงินคุ้มครองที่ธุรกิจควรมี + ผลภาษีทั้งฝั่งบริษัทและผู้บริหาร · ปีภาษี {TAX_YEAR}",
)

rows = ps.all_rows()
options = [""] + [r["id"] for r in rows]
pick = st.selectbox(
    "ดึงข้อมูลจาก Prospect (ถ้ามี)",
    options,
    format_func=lambda x: "— ไม่ระบุ —" if not x else f"{x} · {next((r['first_name'] + ' ' + r['last_name'] + ' (' + (r['company_name'] or '') + ')' for r in rows if r['id'] == x), '')}",
)

row = ps.get(pick) if pick else None
default = dict(kc.DEFAULT_INPUT)
default["profit_per_year"] = float(row["net_profit"]) if row else 0.0
default["company_revenue"] = float(row["annual_revenue"]) if row else 0.0
default["share_buyout"] = float(row["est_cover"]) if row else 0.0
default["premium"] = float(row["premium"]) if row else 0.0

st.markdown("### 1) ข้อมูลธุรกิจและความเสี่ยง")
c1, c2, c3 = st.columns(3)
profit = c1.number_input("กำไรสุทธิต่อปี (บาท)", min_value=0.0, value=default["profit_per_year"], step=100000.0, format="%.0f")
years = c2.number_input("จำนวนปีที่ต้องทดแทนกำไร", min_value=0, max_value=20, value=3, step=1)
successor_cost = c3.number_input("ต้นทุนสรรหา/ฝึกผู้ทดแทน (บาท)", min_value=0.0, value=float(default["successor_cost"]), step=50000.0, format="%.0f")

c4, c5, c6 = st.columns(3)
revenue_at_risk = c4.number_input("รายได้ที่หายไประหว่างช่วงเปลี่ยนผ่าน (บาท)", min_value=0.0, value=float(default["revenue_at_risk"]), step=100000.0, format="%.0f")
debt = c5.number_input("หนี้/K และภาระค้ำประกันที่เกี่ยวข้อง (บาท)", min_value=0.0, value=float(default["guaranteed_debt"]), step=100000.0, format="%.0f")
buyout = c6.number_input("ทุนซื้อหุ้นคืนจากทายาท (บาท)", min_value=0.0, value=float(default["share_buyout"]), step=500000.0, format="%.0f")

st.markdown("### 2) สถานะทางภาษี")
d1, d2, d3, d4 = st.columns(4)
premium = d1.number_input("เบี้ยประกัน (บาท/ปี)", min_value=0.0, value=default["premium"], step=10000.0, format="%.0f")
deductible = d2.checkbox("บริษัทหักเบี้ยเป็นค่าใช้จ่ายได้", value=True,
                         help="หักได้เมื่อจ่ายให้ผู้บริหาร/ลูกจ้างตามระเบียบและผู้รับประโยชน์เป็นบริษัท")
benefit = d3.checkbox("เบี้ยก่อประโยชน์แก่ผู้บริหาร (ต้องนับเป็นเงินได้)", value=True)
pays_tax = d4.checkbox("บริษัทออกภาษีบุคคลธรรมดาให้ผู้บริหาร (gross-up)", value=True)

d5, d6, d7, d8 = st.columns(4)
company_revenue = d5.number_input("รายได้บริษัท (บาท/ปี)", min_value=0.0, value=default["company_revenue"], step=500000.0, format="%.0f")
company_expenses = d6.number_input("ค่าใช้จ่ายบริษัท (บาท/ปี)", min_value=0.0, value=default["company_expenses"], step=500000.0, format="%.0f")
company_capital = d7.number_input("ทุนชำระแล้ว (บาท)", min_value=0.0, value=default["company_capital"], step=500000.0, format="%.0f")
exec_income = d8.number_input("เงินได้ผู้บริหาร (บาท/ปี)", min_value=0.0, value=default["executive_income"], step=100000.0, format="%.0f")

if st.button("วิเคราะห์ความจำเป็น", type="primary"):
    payload = {
        "profit_per_year": profit, "years_to_replace": years, "successor_cost": successor_cost,
        "revenue_at_risk": revenue_at_risk, "guaranteed_debt": debt, "share_buyout": buyout,
        "premium": premium, "deductible": deductible, "benefit_to_executive": benefit,
        "company_pays_exec_tax": pays_tax, "company_revenue": company_revenue,
        "company_expenses": company_expenses, "company_capital": company_capital,
        "executive_income": exec_income,
    }
    st.session_state["keyman_result"] = {"payload": payload, "result": kc.analyze(payload), "prospect": pick}
    if pick:
        res = st.session_state["keyman_result"]["result"]
        ps.save_analysis(
            pick, json.dumps(payload, ensure_ascii=False), json.dumps(res, ensure_ascii=False),
            float(res.get("recommended_cover") or 0), float(res.get("net_cost") or 0),
        )
        ps.update_fields(pick, est_cover=float(res.get("recommended_cover") or 0), premium=premium)
        st.success("บันทึกผลวิเคราะห์ลงฐานข้อมูล Prospect แล้ว")

state = st.session_state.get("keyman_result")
if state:
    res = state["result"]
    st.divider()
    st.subheader("ผลวิเคราะห์")
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("ทุนประกันที่แนะนำ", f"{money(res.get('recommended_cover'))} บาท")
    m2.metric("วิธีที่กำหนดวงเงิน", kc.method_label(res))
    m3.metric("ต้นทุนสุทธิ/ปี", f"{money(res.get('net_cost'))} บาท")
    m4.metric("ประหยัดภาษีนิติบุคคล", f"{money(res.get('cit_saving'))} บาท")

    st.dataframe(
        pd.DataFrame(kc.result_rows(res)).style.format({"จำนวนเงิน": "{:,.2f}"}),
        use_container_width=True, hide_index=True,
    )

    left, right = st.columns(2)
    with left:
        st.markdown("**ช่วงทุนประกันที่เสนอเป็นทางเลือก**")
        opts = kc.cover_options(res)
        if opts:
            st.dataframe(pd.DataFrame(opts).style.format({"ทุนประกัน": "{:,.0f}"}),
                         use_container_width=True, hide_index=True)
        else:
            st.caption("ยังไม่มีข้อมูลพอ — กรอกกำไร/ภาระผูกพันก่อน")
    with right:
        st.markdown("**ผลภาษีฝั่งผู้บริหาร**")
        st.write(
            {
                "ภาษีก่อนทำประกัน": money(res.get("pit_before")),
                "ภาษีหลังรวมเบี้ย": money(res.get("pit_after")),
                "ภาษีเพิ่มขึ้น": money(res.get("exec_tax_increase")),
                "ภาษีที่บริษัทออกให้ (gross-up)": money(res.get("gu_tax_borne")),
                "ยอดจ่ายรวมของบริษัท": money(res.get("gu_total_outlay")),
            }
        )
        st.caption("ต้นทุนสุทธิต่อทุนประกัน 1 บาท: " + f"{res.get('net_cost_per_cover', 0):.4f}")

    st.markdown("**สมมติฐาน**")
    for a in kc.ASSUMPTIONS:
        st.caption(f"• {a}")
    for w in kc.warnings(res):
        st.warning(w)

    st.download_button(
        "⬇ ส่งออกผลวิเคราะห์ (CSV)",
        data=pd.DataFrame(kc.result_rows(res)).to_csv(index=False).encode("utf-8-sig"),
        file_name="keyman_analysis.csv",
        mime="text/csv",
    )

st.divider()
st.caption(
    "ห้ามใช้ผลนี้เป็นคำแนะนำเฉพาะบุคคลโดยไม่ตรวจข้อเท็จจริง · ไม่รับประกันผลตอบแทน · "
    "ห้ามสรุปว่าเบี้ยหักภาษีได้ทุกกรณี"
)
