# -*- coding: utf-8 -*-
"""pages/04_follow_ups.py — Follow-up CRM: นัดหมาย ประวัติติดต่อ สถานะ"""
from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
import streamlit as st

from services import prospect_service as ps
from ui import page_header, rerun, thai_date

page_header("📅 Follow-up CRM", "รายการที่ต้องติดตาม · บันทึกการติดต่อ · เลื่อนนัด · ปิดการขาย")

rows = ps.all_rows()
if not rows:
    st.info("ยังไม่มี Prospect — เพิ่มที่หน้า Prospects ก่อน")
    st.stop()

overdue = ps.due_followups(include_overdue_only=True)
upcoming = ps.due_followups(include_overdue_only=False)

c1, c2, c3 = st.columns(3)
c1.metric("เลยกำหนดติดตาม", len(overdue))
c2.metric("ครบกำหนดใน 7 วัน", len(upcoming))
c3.metric("ยังไม่กำหนดนัด", sum(1 for r in rows if not r["next_follow_up"]))

st.divider()
tab_due, tab_log, tab_all = st.tabs(["⏰ ต้องติดตาม", "📝 บันทึกการติดต่อ", "📊 ทั้งหมด"])

with tab_due:
    if not upcoming:
        st.success("ไม่มีรายการค้างติดตามในช่วง 7 วัน")
    else:
        table = []
        for r in upcoming:
            late = r["next_follow_up"] < date.today().isoformat()
            table.append(
                {
                    "รหัส": r["id"],
                    "ชื่อ": f"{r['first_name']} {r['last_name']}",
                    "บริษัท": r["company_name"],
                    "สถานะ": r["status"],
                    "นัดติดตาม": thai_date(r["next_follow_up"]),
                    "เลยกำหนด": "⚠️" if late else "",
                    "ผู้รับผิดชอบ": r["owner"],
                }
            )
        st.dataframe(pd.DataFrame(table), use_container_width=True, hide_index=True)

with tab_log:
    ids = [r["id"] for r in rows]
    pid = st.selectbox(
        "เลือกลูกค้า", ids,
        format_func=lambda x: f"{x} · {next((r['first_name'] + ' ' + r['last_name'] for r in rows if r['id'] == x), '')}",
    )
    with st.form("log_activity"):
        a1, a2, a3 = st.columns([1, 1, 1])
        kind = a1.selectbox("ช่องทาง", ps.ACTIVITY_KINDS)
        when = a2.date_input("วันที่ติดต่อ", value=date.today())
        new_status = a3.selectbox("อัปเดตสถานะเป็น", ps.STATUSES,
                                  index=ps.STATUSES.index(ps.get(pid)["status"]))
        summary = st.text_area("สรุปการติดต่อ *", height=80)
        b1, b2 = st.columns(2)
        concern = b1.text_area("ความต้องการ/ข้อกังวล", height=70)
        lost_reason = b2.text_area("เหตุผลที่ไม่สนใจ (ถ้าปิดไม่สำเร็จ)", height=70)
        c1_, c2_ = st.columns(2)
        next_date = c1_.date_input("นัดครั้งถัดไป", value=None)
        save = st.form_submit_button("บันทึก", type="primary")
    if save:
        if not summary.strip():
            st.error("ต้องกรอกสรุปการติดต่อ")
        else:
            ps.add_activity(pid, kind, when.isoformat(), summary.strip(), concern.strip(), lost_reason.strip())
            fields = {"status": new_status}
            if next_date:
                fields["next_follow_up"] = next_date.isoformat()
            ps.update_fields(pid, **fields)
            st.success("บันทึกแล้ว")
            rerun()

    hist = ps.activities(pid)
    st.markdown("**ประวัติของรายนี้**")
    if hist:
        st.dataframe(
            pd.DataFrame(
                [
                    {"วันที่": thai_date(a["activity_at"]), "ช่องทาง": a["kind"],
                     "สรุป": a["summary"], "ข้อกังวล": a["concern"], "เหตุไม่สนใจ": a["lost_reason"]}
                    for a in hist
                ]
            ),
            use_container_width=True, hide_index=True,
        )
    else:
        st.caption("ยังไม่มีประวัติ")

with tab_all:
    status_filter = st.multiselect("กรองสถานะ", ps.STATUSES, default=ps.OPEN_STATUSES)
    data = [r for r in rows if not status_filter or r["status"] in status_filter]
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "รหัส": r["id"],
                    "ชื่อ": f"{r['first_name']} {r['last_name']}",
                    "บริษัท": r["company_name"],
                    "สถานะ": r["status"],
                    "นัดติดตาม": thai_date(r["next_follow_up"]),
                    "แก้ไขล่าสุด": thai_date(r["updated_at"]),
                }
                for r in data
            ]
        ),
        use_container_width=True, hide_index=True,
    )
    st.caption(f"แสดง {len(data)} จาก {len(rows)} รายการ")
