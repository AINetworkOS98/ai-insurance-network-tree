# -*- coding: utf-8 -*-
"""pages/02_tax_calculator.py — เครื่องคำนวณภาษีบุคคลธรรมดา 2569 (ก่อน/หลังวางแผน)"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
import streamlit as st

from services import tax_calculator as tc
from services.engines import ENGINE_VERSION, TAX_YEAR
from services.tax_rules import DISCLAIMER, PENDING_RULES, RULES
from ui import money, page_header

page_header(
    "🧾 เครื่องคำนวณภาษีบุคคลธรรมดา",
    f"ปีภาษี {TAX_YEAR} · เดินตามลำดับข้อ ภ.ง.ด.90 + ใบแนบลดหย่อน · เอนจิน v{ENGINE_VERSION}",
)

if "scenarios" not in st.session_state:
    st.session_state["scenarios"] = {}

tab_calc, tab_compare, tab_rules = st.tabs(["คำนวณ", "เปรียบเทียบก่อน–หลังวางแผน", "กฎที่ใช้/ข้อจำกัด"])

CAT_LABEL = dict(tc.INCOME_CATEGORIES)
LABEL_CAT = {v: k for k, v in CAT_LABEL.items()}

with tab_calc:
    st.markdown("### 1) เงินได้พึงประเมิน (เพิ่มได้หลายแหล่ง)")
    default_income = pd.DataFrame(
        [{"ประเภทเงินได้": CAT_LABEL["salary"], "จำนวนเงิน": 1200000.0, "ประเภทย่อย": "",
          "หัก ณ ที่จ่าย": 60000.0, "รายละเอียด": "เงินเดือน+โบนัส"}]
    )
    income_df = st.data_editor(
        default_income,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "ประเภทเงินได้": st.column_config.SelectboxColumn(options=list(LABEL_CAT), required=True),
            "จำนวนเงิน": st.column_config.NumberColumn(min_value=0.0, step=10000.0, format="%.0f"),
            "หัก ณ ที่จ่าย": st.column_config.NumberColumn(min_value=0.0, step=1000.0, format="%.0f"),
            "ประเภทย่อย": st.column_config.TextColumn(help="เช่น building / vehicle / agri_land / medical / general / entertainer"),
        },
        key="income_editor",
    )

    items = []
    for _, r in income_df.iterrows():
        if pd.isna(r.get("ประเภทเงินได้")) or float(r.get("จำนวนเงิน") or 0) <= 0:
            continue
        cat = LABEL_CAT.get(r["ประเภทเงินได้"], "salary")
        variant = (str(r.get("ประเภทย่อย") or "")).strip()
        if cat == "rent" and not variant:
            variant = "building"
        if cat == "professional" and not variant:
            variant = "other"
        if cat == "business" and not variant:
            variant = "general"
        items.append(
            {
                "category": cat,
                "amount": float(r["จำนวนเงิน"]),
                "variant": variant,
                "withholding": float(r.get("หัก ณ ที่จ่าย") or 0),
                "description": str(r.get("รายละเอียด") or ""),
                "expense_mode": "standard",
            }
        )

    with st.expander("ตัวเลือกประเภทย่อยของเงินได้ 40(5)–(8)", expanded=False):
        st.write("**ค่าเช่า (40(5))**: " + " · ".join(f"`{k}` {v}" for k, v in tc.RENT_VARIANTS.items()))
        st.write("**วิชาชีพอิสระ (40(6))**: " + " · ".join(f"`{k}` {v}" for k, v in tc.PROFESSIONAL_VARIANTS.items()))
        st.write("**ธุรกิจ (40(8))**: " + " · ".join(f"`{k}` {v}" for k, v in tc.BUSINESS_VARIANTS.items()))

    st.markdown("### 2) สถานภาพและค่าลดหย่อนครอบครัว")
    f1, f2, f3, f4 = st.columns(4)
    personal = f1.checkbox("ลดหย่อนส่วนตัว 60,000", value=True)
    personal_special = f2.checkbox("กรณีพิเศษ 120,000", value=False)
    spouse_no_income = f3.checkbox("คู่สมรสไม่มีเงินได้ 60,000", value=False)
    counts = {}
    c1, c2, c3, c4, c5 = st.columns(5)
    for col, (key, label, lo, hi) in zip((c1, c2, c3, c4, c5), tc.COUNT_FIELDS):
        counts[key] = col.number_input(label, min_value=lo, max_value=hi, value=lo, step=1)

    st.markdown("### 3) ค่าลดหย่อนอื่น (กรอกเท่าที่จ่ายจริง — ระบบจำกัดเพดานให้เอง)")
    allowance_values = {}
    groups = ["ประกัน", "การออม/ลงทุน", "อื่น ๆ", "บริจาค", "มาตรการพิเศษ"]
    for group in groups:
        fields = [f for f in tc.ALLOWANCE_FIELDS if f[2] == group]
        if not fields:
            continue
        st.caption(f"— {group} —")
        cols = st.columns(min(len(fields), 3))
        for i, (key, label, _g, cap) in enumerate(fields):
            col = cols[i % len(cols)]
            allowance_values[key] = col.number_input(
                label, min_value=0.0, max_value=float(cap), value=0.0, step=10000.0,
                format="%.0f", key=f"al_{key}",
                help=f"เพดานตามกฎ: {cap:,.0f} บาท" + (" · รอตรวจสอบประกาศปีนี้" if key in tc.PENDING_ALLOWANCE_KEYS else ""),
            )

    w1, w2 = st.columns([1, 2])
    withholding_total = w1.number_input(
        "ภาษีหัก ณ ที่จ่ายรวมทั้งปี (ถ้าไม่ได้กรอกในตารางเงินได้)",
        min_value=0.0, step=1000.0, value=0.0, format="%.0f",
    )
    scenario_name = w2.text_input("ชื่อสถานการณ์ (ใช้บันทึกไว้เปรียบเทียบ)", "ก่อนวางแผน")

    if st.button("คำนวณภาษี", type="primary"):
        form = tc.empty_form()
        form.update({k: float(v) for k, v in allowance_values.items()})
        form.update({k: int(v) for k, v in counts.items()})
        form.update(
            {
                "personal": personal,
                "personal_special": personal_special,
                "spouse_no_income": spouse_no_income,
                "withholding": float(withholding_total),
                "income_items": items,
            }
        )
        res = tc.calc(form)
        st.session_state["last_tax"] = {"name": scenario_name or "สถานการณ์", "result": res, "form": form}
        st.session_state["scenarios"][scenario_name or "สถานการณ์"] = res

    last = st.session_state.get("last_tax")
    if last:
        res = last["result"]
        st.divider()
        st.subheader(f"ผลการคำนวณ — {last['name']}")
        m1, m2, m3, m4, m5 = st.columns(5)
        m1.metric("เงินได้รวม", money(res["gross_total"]))
        m2.metric("เงินได้สุทธิ", money(res["net_income"]))
        m3.metric("ภาษีทั้งปี", money(res["item12_total_tax"]))
        m4.metric("ขั้นภาษีสูงสุด", f"{res['marginal_rate'] * 100:.0f}%")
        m5.metric("ต้องชำระ/ขอคืน", money(res["net_payable"]))

        st.dataframe(
            pd.DataFrame(tc.summary_rows(res)).style.format({"จำนวนเงิน": "{:,.2f}"}),
            use_container_width=True, hide_index=True,
        )

        cc1, cc2 = st.columns(2)
        with cc1:
            st.markdown("**รายละเอียดเงินได้แต่ละแหล่ง**")
            st.dataframe(pd.DataFrame(res["income_items"]), use_container_width=True, hide_index=True)
            st.markdown("**ค่าลดหย่อนที่ใช้ได้จริง**")
            st.dataframe(pd.DataFrame(res["allowance_items"]), use_container_width=True, hide_index=True)
        with cc2:
            st.markdown("**ขั้นบันไดภาษี**")
            st.dataframe(pd.DataFrame(res["bracket_steps"]), use_container_width=True, hide_index=True)
            if res.get("allowance_notes"):
                st.markdown("**หมายเหตุการจำกัดเพดาน**")
                for n in res["allowance_notes"]:
                    st.caption(f"• {n}")

        if res.get("pending_items"):
            st.warning(
                "รายการที่ใช้ในปีนี้แต่ยัง 'รอตรวจสอบ' ประกาศทางการ: " + " · ".join(res["pending_items"])
            )
        st.info(res["result"] + " · " + res["engine_note"])
        st.caption(res["disclaimer"])

        d1, d2 = st.columns(2)
        d1.download_button(
            "⬇ ส่งออกผลเป็น Excel",
            data=tc.to_excel(res),
            file_name=f"tax_{TAX_YEAR}_{last['name']}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        d2.download_button(
            "⬇ ส่งออกสรุป CSV",
            data=pd.DataFrame(tc.summary_rows(res)).to_csv(index=False).encode("utf-8-sig"),
            file_name=f"tax_{TAX_YEAR}_{last['name']}.csv",
            mime="text/csv",
        )

with tab_compare:
    scen = st.session_state.get("scenarios", {})
    if len(scen) < 2:
        st.info("คำนวณอย่างน้อย 2 สถานการณ์ (เช่น 'ก่อนวางแผน' และ 'หลังวางแผน') เพื่อเปรียบเทียบ")
        if scen:
            st.write("บันทึกไว้แล้ว:", ", ".join(scen.keys()))
    else:
        names = list(scen.keys())
        c1, c2 = st.columns(2)
        before_name = c1.selectbox("ก่อนวางแผน", names, index=0)
        after_name = c2.selectbox("หลังวางแผน", names, index=len(names) - 1)
        if before_name == after_name:
            st.warning("เลือกสองสถานการณ์ที่ต่างกัน")
        else:
            cmp = tc.compare(scen[before_name], scen[after_name])
            st.metric("ภาษีที่ประหยัดได้ต่อปี", f"{money(cmp['tax_saved'])} บาท")
            st.dataframe(
                pd.DataFrame(cmp["rows"]).style.format(
                    {"ก่อนวางแผน": "{:,.2f}", "หลังวางแผน": "{:,.2f}", "ผลต่าง": "{:,.2f}"}
                ),
                use_container_width=True, hide_index=True,
            )
            st.caption(
                "การเปรียบเทียบนี้ใช้ข้อมูลที่กรอกในแต่ละรอบ · ผลต่างเกิดจากเงินได้/ลดหย่อนที่เปลี่ยน "
                "ไม่ใช่การรับประกันผลตอบแทนหรือสิทธิทางภาษี"
            )
        if st.button("ล้างสถานการณ์ที่บันทึกไว้"):
            st.session_state["scenarios"] = {}
            st.rerun()

with tab_rules:
    st.markdown(f"**สถานะกฎหมายที่ใช้ (ปีภาษี {TAX_YEAR})**")
    pending = [r for r in PENDING_RULES]
    if pending:
        st.warning(
            "รายการรอตรวจสอบ: " + " · ".join(f"{r.label} ({r.value})" for r in pending)
        )
    st.dataframe(
        pd.DataFrame(
            [{"หัวข้อ": r.label, "ค่า/เพดาน": r.value, "แหล่งอ้างอิง": r.source,
              "ตรวจล่าสุด": r.checked, "สถานะ": r.status} for r in RULES]
        ),
        use_container_width=True, hide_index=True,
    )
    st.caption(DISCLAIMER)
    st.markdown(
        "**แหล่งอ้างอิงหลัก**\n"
        "- แบบ ภ.ง.ด.90 + ใบแนบลดหย่อน (rd.go.th/67335.html)\n"
        "- การหักค่าใช้จ่ายตามประเภทเงินได้ (rd.go.th/556.html)\n"
        "- วิธีคำนวณภาษีสิ้นปี วิธีที่ 1 / วิธีที่ 2 (rd.go.th/555.html)"
    )
