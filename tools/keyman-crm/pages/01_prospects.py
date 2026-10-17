# -*- coding: utf-8 -*-
"""pages/01_prospects.py — ฐานข้อมูล Prospect / Keyman: เพิ่ม แก้ไข ค้นหา นำเข้า ส่งออก"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from datetime import date

import pandas as pd
import streamlit as st

from database.models import ProspectIn
from services import excel_import
from services import prospect_service as ps
from ui import money, page_header, rerun, thai_date

page_header("👥 Prospects / Keyman", "ฐานข้อมูลเจ้าของกิจการและผู้บริหาร — ค้นหา เพิ่ม นำเข้า และจัดลำดับ Lead")

tab_list, tab_add, tab_io, tab_detail = st.tabs(
    ["🔍 ค้นหา/รายการ", "➕ เพิ่มรายการ", "📥 นำเข้า/ส่งออก", "📄 รายละเอียด/แก้ไข"]
)

# ─────────────────────────────────── ค้นหา/รายการ ────────────────────────────
with tab_list:
    c1, c2, c3, c4 = st.columns([2, 1, 1, 1])
    text = c1.text_input("ค้นหา (ชื่อ / บริษัท / เบอร์ / รหัส)", "")
    status = c2.selectbox("สถานะ", ["", *ps.STATUSES])
    provinces = sorted({r["province"] for r in ps.all_rows() if r["province"]})
    province = c3.selectbox("จังหวัด", ["", *provinces])
    owners = sorted({r["owner"] for r in ps.all_rows() if r["owner"]})
    owner = c4.selectbox("ผู้รับผิดชอบ", ["", *owners])

    rows = ps.search(text=text, status=status, province=province, owner=owner)
    st.caption(f"พบ {len(rows)} รายการ")

    if rows:
        df = pd.DataFrame(
            [
                {
                    "รหัส": r["id"],
                    "ชื่อ-นามสกุล": f"{r['prefix']}{r['first_name']} {r['last_name']}".strip(),
                    "บริษัท": r["company_name"],
                    "จังหวัด": r["province"],
                    "สถานะ": r["status"],
                    "นัดติดตาม": thai_date(r["next_follow_up"]),
                    "วงเงินเป้าหมาย": money(r["est_cover"]),
                    "เบี้ยประเมิน": money(r["premium"]),
                }
                for r in rows
            ]
        )
        st.dataframe(df, use_container_width=True, hide_index=True)

        pick = st.selectbox(
            "เปิดรายละเอียด (เลือกรหัส)",
            [r["id"] for r in rows],
            format_func=lambda pid: f"{pid} · {next((r['first_name'] + ' ' + r['last_name'] for r in rows if r['id'] == pid), '')}",
        )
        if st.button("เปิดรายละเอียดรายนี้", type="primary"):
            st.session_state["selected_prospect"] = pick
            st.info(f"เลือกรายการ {pick} แล้ว → ไปแท็บ 'รายละเอียด/แก้ไข'")
    else:
        st.info("ยังไม่มีรายการที่ตรงเงื่อนไข")

# ─────────────────────────────────── เพิ่มรายการ ──────────────────────────────
with tab_add:
    with st.form("add_prospect", clear_on_submit=False):
        st.markdown("**A. ข้อมูลบุคคล**")
        a1, a2, a3, a4 = st.columns([0.7, 1.3, 1.3, 1])
        prefix = a1.selectbox("คำนำหน้า", ["นาย", "นาง", "นางสาว", "ดร.", "อื่น ๆ"])
        first_name = a2.text_input("ชื่อ *")
        last_name = a3.text_input("นามสกุล")
        nickname = a4.text_input("ชื่อเล่น")
        b1, b2, b3, b4 = st.columns(4)
        phone = b1.text_input("เบอร์โทร")
        email = b2.text_input("อีเมล")
        province_in = b3.text_input("จังหวัด")
        area = b4.text_input("พื้นที่/อำเภอ")
        c1, c2, c3 = st.columns(3)
        lead_source = c1.selectbox("แหล่งที่มาของ Lead", ps.LEAD_SOURCES)
        owner_in = c2.text_input("ผู้รับผิดชอบ Lead")
        status_in = c3.selectbox("สถานะ", ps.STATUSES, index=0)
        d1, d2 = st.columns([1, 3])
        pdpa_consent = d1.checkbox("ยินยอมให้ติดต่อ (PDPA)", value=False)
        pdpa_purpose = d2.text_input("วัตถุประสงค์การใช้ข้อมูล", "ติดต่อเพื่อเสนอประกันคีย์แมน")

        st.markdown("**B. ข้อมูลธุรกิจ**")
        e1, e2, e3 = st.columns(3)
        company_name = e1.text_input("ชื่อบริษัท")
        company_reg_no = e2.text_input("เลขทะเบียนนิติบุคคล (ถ้าจำเป็น)")
        business_type = e3.text_input("ประเภทธุรกิจ")
        f1, f2, f3, f4 = st.columns(4)
        annual_revenue = f1.number_input("รายได้ต่อปี (บาท)", min_value=0.0, step=100000.0, format="%.0f")
        net_profit = f2.number_input("กำไรสุทธิโดยประมาณ (บาท)", min_value=0.0, step=100000.0, format="%.0f")
        employees = f3.number_input("จำนวนพนักงาน", min_value=0, step=1)
        shareholders = f4.number_input("จำนวนผู้ถือหุ้น", min_value=0, step=1)
        g1, g2, g3, g4 = st.columns(4)
        position = g1.text_input("ตำแหน่งของ Prospect")
        share_pct = g2.number_input("สัดส่วนการถือหุ้น (%)", min_value=0.0, max_value=100.0, step=1.0)
        key_executives = g3.number_input("จำนวนผู้บริหารหลัก", min_value=0, step=1, value=1)
        est_cover = g4.number_input("วงเงินคุ้มครองที่ต้องการ (บาท)", min_value=0.0, step=500000.0, format="%.0f")
        h1, h2 = st.columns(2)
        importance = h1.text_area("ความสำคัญของบุคคลต่อธุรกิจ", height=80)
        successor = h2.text_area("ผู้สืบทอดตำแหน่ง (ถ้ามี)", height=80)
        risk_note = st.text_area("ความเสี่ยงหากบุคคลสำคัญเสียชีวิต/ทุพพลภาพ", height=80)
        i1, i2, i3 = st.columns(3)
        premium = i1.number_input("เบี้ยประกันโดยประมาณ (บาท/ปี)", min_value=0.0, step=10000.0, format="%.0f")
        next_follow_up = i2.date_input("นัดติดตามครั้งถัดไป", value=None)
        notes = i3.text_area("หมายเหตุ", height=68)

        submitted = st.form_submit_button("บันทึก Prospect", type="primary")

    if submitted:
        payload = {
            "prefix": prefix, "first_name": first_name.strip(), "last_name": last_name.strip(),
            "nickname": nickname.strip(), "phone": phone.strip(), "email": email.strip(),
            "province": province_in.strip(), "area": area.strip(), "lead_source": lead_source,
            "owner": owner_in.strip(), "pdpa_consent": 1 if pdpa_consent else 0,
            "pdpa_purpose": pdpa_purpose, "company_name": company_name.strip(),
            "company_reg_no": company_reg_no.strip(), "business_type": business_type.strip(),
            "annual_revenue": annual_revenue, "net_profit": net_profit, "employees": employees,
            "shareholders": shareholders, "position": position.strip(), "share_pct": share_pct,
            "key_executives": key_executives, "importance": importance.strip(),
            "successor": successor.strip(), "risk_note": risk_note.strip(), "status": status_in,
            "next_follow_up": next_follow_up.isoformat() if next_follow_up else "",
            "est_cover": est_cover, "premium": premium, "notes": notes.strip(),
        }
        try:
            model = ProspectIn(**payload)
        except Exception as exc:
            st.error(f"ข้อมูลไม่ผ่านการตรวจสอบ: {exc}")
        else:
            dups = ps.duplicates(model.first_name, model.last_name, model.phone, model.email)
            if dups:
                st.warning(
                    "พบรายการที่อาจซ้ำ: "
                    + ", ".join(f"{d['id']} ({d['first_name']} {d['last_name']})" for d in dups)
                    + " — ถ้าไม่ใช่คนเดียวกันให้แก้ชื่อ/เบอร์ให้ต่างกันแล้วบันทึกใหม่"
                )
            if not model.pdpa_consent:
                st.info("ยังไม่ได้รับความยินยอม (PDPA) — บันทึกได้ แต่ต้องไม่ติดต่อโดยตรงจนกว่าจะได้ความยินยอม")
            pid = ps.create(model.model_dump() | {"pdpa_consent": 1 if model.pdpa_consent else 0})
            st.success(f"บันทึกแล้ว: {pid}")
            st.session_state["selected_prospect"] = pid
            rerun()

# ─────────────────────────────────── นำเข้า/ส่งออก ─────────────────────────────
with tab_io:
    st.markdown("**นำเข้าจาก Excel / CSV**")
    st.caption(
        "รองรับหัวคอลัมน์ภาษาไทย/อังกฤษตามแม่แบบ · ต้องมีคอลัมน์ 'ชื่อ' · "
        "ระบบไม่ดึงข้อมูลจากเว็บต้นทางเอง (ต้องมี API ที่ได้รับอนุญาตหรือไฟล์ที่ส่งออกมาเอง)"
    )
    st.download_button(
        "⬇ ดาวน์โหลดแม่แบบ Excel",
        data=excel_import.template_bytes(),
        file_name="template_prospects.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    up = st.file_uploader("เลือกไฟล์ .xlsx หรือ .csv", type=["xlsx", "xls", "csv"])
    if up is not None:
        try:
            rows_in = excel_import.read_table(up.read(), up.name)
        except Exception as exc:
            st.error(f"อ่านไฟล์ไม่สำเร็จ: {exc}")
        else:
            st.success(f"อ่านได้ {len(rows_in)} แถว")
            st.dataframe(pd.DataFrame(rows_in).head(20), use_container_width=True)
            if st.button(f"นำเข้าทั้ง {len(rows_in)} แถว", type="primary"):
                ok, dup = 0, 0
                for r in rows_in:
                    if ps.duplicates(r.get("first_name", ""), r.get("last_name", ""),
                                     r.get("phone", ""), r.get("email", "")):
                        dup += 1
                        continue
                    ps.create(r)
                    ok += 1
                st.success(f"นำเข้า {ok} แถว · ข้ามรายการซ้ำ {dup} แถว")
                rerun()

    st.divider()
    st.markdown("**ส่งออกทั้งหมด**")
    all_records = ps.to_records(ps.all_rows())
    if all_records:
        st.download_button(
            "⬇ ส่งออก Excel",
            data=excel_import.export_bytes(all_records),
            file_name=f"prospects_{date.today().isoformat()}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        st.download_button(
            "⬇ ส่งออก CSV",
            data=pd.DataFrame(all_records).to_csv(index=False).encode("utf-8-sig"),
            file_name=f"prospects_{date.today().isoformat()}.csv",
            mime="text/csv",
        )
    else:
        st.info("ยังไม่มีข้อมูลให้ส่งออก")

# ─────────────────────────────────── รายละเอียด/แก้ไข ─────────────────────────
with tab_detail:
    all_ids = [r["id"] for r in ps.all_rows()]
    if not all_ids:
        st.info("ยังไม่มีรายการ")
    else:
        default = st.session_state.get("selected_prospect", all_ids[0])
        if default not in all_ids:
            default = all_ids[0]
        pid = st.selectbox("เลือกรายการ", all_ids, index=all_ids.index(default), key="detail_pick")
        row = ps.get(pid)
        assert row is not None
        st.session_state["selected_prospect"] = pid

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("สถานะ", row["status"])
        m2.metric("วงเงินเป้าหมาย", f"{money(row['est_cover'])} บาท")
        m3.metric("เบี้ยประเมิน", f"{money(row['premium'])} บาท/ปี")
        m4.metric("นัดติดตาม", thai_date(row["next_follow_up"]))

        with st.form("edit_prospect"):
            st.markdown("**แก้ไขข้อมูล**")
            k1, k2, k3 = st.columns(3)
            e_status = k1.selectbox("สถานะ", ps.STATUSES, index=ps.STATUSES.index(row["status"]))
            e_next = k2.text_input("นัดติดตาม (YYYY-MM-DD)", row["next_follow_up"])
            e_owner = k3.text_input("ผู้รับผิดชอบ", row["owner"])
            k4, k5, k6 = st.columns(3)
            e_cover = k4.number_input("วงเงินเป้าหมาย", min_value=0.0, value=float(row["est_cover"] or 0), step=500000.0)
            e_premium = k5.number_input("เบี้ยประเมิน", min_value=0.0, value=float(row["premium"] or 0), step=10000.0)
            e_pdpa = k6.checkbox("ยินยอม PDPA", value=bool(row["pdpa_consent"]))
            e_risk = st.text_area("ความเสี่ยง / หมายเหตุสำคัญ", row["risk_note"] or "", height=70)
            e_notes = st.text_area("หมายเหตุ", row["notes"] or "", height=70)
            if st.form_submit_button("บันทึกการแก้ไข", type="primary"):
                try:
                    ps.update_fields(
                        pid, status=e_status, next_follow_up=e_next, owner=e_owner,
                        est_cover=e_cover, premium=e_premium,
                        pdpa_consent=1 if e_pdpa else 0, risk_note=e_risk, notes=e_notes,
                    )
                except Exception as exc:
                    st.error(f"บันทึกไม่สำเร็จ: {exc}")
                else:
                    st.success("บันทึกแล้ว")
                    rerun()

            st.markdown("**ประวัติการติดต่อ**")
            acts = ps.activities(pid)
            if acts:
                st.dataframe(
                    pd.DataFrame(
                        [
                            {"วันที่": thai_date(a["activity_at"]), "ช่องทาง": a["kind"],
                             "สรุป": a["summary"], "ข้อกังวล": a["concern"], "เหตุไม่สนใจ": a["lost_reason"]}
                            for a in acts
                        ]
                    ),
                    use_container_width=True, hide_index=True,
                )
            else:
                st.caption("ยังไม่มีประวัติ — บันทึกได้ที่หน้า Follow-up CRM")

            an = ps.analyses(pid)
            if an:
                st.markdown("**ผลวิเคราะห์คีย์แมนที่บันทึกไว้**")
                st.dataframe(
                    pd.DataFrame(
                        [
                            {"วันที่": thai_date(a["created_at"]),
                             "วงเงินแนะนำ": money(a["recommended_cover"]),
                             "ต้นทุนสุทธิ/ปี": money(a["net_cost"])}
                            for a in an
                        ]
                    ),
                    use_container_width=True, hide_index=True,
                )

            st.divider()
            st.markdown("**ลบรายการ (ถาวร)**")
            confirm = st.checkbox(f"ยืนยันลบ {pid}")
            if st.button("ลบรายการนี้", disabled=not confirm):
                ps.delete(pid)
                st.warning(f"ลบ {pid} แล้ว")
                st.session_state.pop("selected_prospect", None)
                rerun()
