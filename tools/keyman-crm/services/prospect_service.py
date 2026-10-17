# -*- coding: utf-8 -*-
"""services/prospect_service.py — CRUD/ค้นหา/สถิติ ของฐานข้อมูล Prospect (SQLite)"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from database import db

STATUSES = [
    "New Lead", "Researching", "Contacted", "Appointment", "Fact Finding",
    "Needs Analysis", "Proposal", "Follow Up", "Closed Won", "Closed Lost",
]
OPEN_STATUSES = [s for s in STATUSES if not s.startswith("Closed")]
LEAD_SOURCES = ["แนะนำ (Referral)", "LINE OA", "Facebook", "งานสัมมนา", "Walk-in", "ลูกค้าเดิม", "อื่น ๆ"]
ACTIVITY_KINDS = ["โทร", "ประชุม", "อีเมล", "LINE", "ส่งข้อเสนอ", "นัดหมาย", "อื่น ๆ"]

FIELDS = [
    "prefix", "first_name", "last_name", "nickname", "phone", "email", "province", "area",
    "lead_source", "owner", "pdpa_consent", "pdpa_purpose",
    "company_name", "company_reg_no", "business_type", "annual_revenue", "net_profit",
    "employees", "shareholders", "position", "share_pct", "key_executives",
    "importance", "successor", "risk_note", "status", "next_follow_up",
    "est_cover", "premium", "notes",
]


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def next_id(conn: sqlite3.Connection) -> str:
    today = date.today().strftime("%y%m%d")
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM prospects WHERE id LIKE ?", (f"P{today}%",)
    ).fetchone()
    return f"P{today}{(row['c'] + 1):03d}"


def create(data: Dict[str, Any]) -> str:
    db.init_db()
    with db.connect() as conn:
        pid = next_id(conn)
        cols = ["id", "created_at", "updated_at", *FIELDS]
        vals = [pid, _now(), _now(), *[data.get(f, "") if not isinstance(data.get(f, 0), (int, float))
                                      else data.get(f, 0) for f in FIELDS]]
        conn.execute(
            f"INSERT INTO prospects ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
            vals,
        )
        conn.commit()
    return pid


def update(pid: str, data: Dict[str, Any]) -> None:
    with db.connect() as conn:
        sets = ", ".join(f"{f} = ?" for f in FIELDS if f in data)
        conn.execute(
            f"UPDATE prospects SET {sets}, updated_at = ? WHERE id = ?",
            [*[data[f] for f in FIELDS if f in data], _now(), pid],
        )
        conn.commit()


def update_fields(pid: str, **kw: Any) -> None:
    update(pid, kw)


def delete(pid: str) -> None:
    with db.connect() as conn:
        conn.execute("DELETE FROM prospects WHERE id = ?", (pid,))
        conn.commit()


def get(pid: str) -> Optional[sqlite3.Row]:
    return db.query_one("SELECT * FROM prospects WHERE id = ?", (pid,))


def all_rows() -> List[sqlite3.Row]:
    return db.query("SELECT * FROM prospects ORDER BY updated_at DESC")


def search(
    text: str = "", status: str = "", province: str = "", owner: str = ""
) -> List[sqlite3.Row]:
    sql = "SELECT * FROM prospects WHERE 1=1"
    params: List[Any] = []
    if text:
        sql += " AND (first_name LIKE ? OR last_name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR id LIKE ?)"
        params += [f"%{text}%"] * 5
    for col, val in (("status", status), ("province", province), ("owner", owner)):
        if val:
            sql += f" AND {col} = ?"
            params.append(val)
    sql += " ORDER BY updated_at DESC"
    return db.query(sql, params)


def duplicates(first_name: str, last_name: str, phone: str = "", email: str = "") -> List[sqlite3.Row]:
    if not (first_name or phone or email):
        return []
    return db.query(
        "SELECT * FROM prospects WHERE (phone <> '' AND phone = ?) OR (email <> '' AND email = ?) "
        "OR (first_name = ? AND last_name = ?)",
        (phone, email, first_name, last_name),
    )


def add_activity(prospect_id: str, kind: str, activity_at: str, summary: str,
                 concern: str = "", lost_reason: str = "") -> None:
    db.init_db()
    db.execute(
        "INSERT INTO activities (prospect_id, kind, activity_at, summary, concern, lost_reason, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (prospect_id, kind, activity_at, summary, concern, lost_reason, _now()),
    )


def activities(prospect_id: str) -> List[sqlite3.Row]:
    return db.query(
        "SELECT * FROM activities WHERE prospect_id = ? ORDER BY activity_at DESC, id DESC",
        (prospect_id,),
    )


def due_followups(include_overdue_only: bool = False) -> List[sqlite3.Row]:
    today = date.today().isoformat()
    if include_overdue_only:
        return db.query(
            "SELECT * FROM prospects WHERE next_follow_up <> '' AND next_follow_up < ? "
            "AND status NOT LIKE 'Closed%' ORDER BY next_follow_up",
            (today,),
        )
    horizon = (date.today() + timedelta(days=7)).isoformat()
    return db.query(
        "SELECT * FROM prospects WHERE next_follow_up <> '' AND next_follow_up <= ? "
        "AND status NOT LIKE 'Closed%' ORDER BY next_follow_up",
        (horizon,),
    )


def save_analysis(prospect_id: str, inputs: str, results: str,
                  recommended_cover: float, net_cost: float) -> None:
    db.init_db()
    db.execute(
        "INSERT INTO keyman_analyses (prospect_id, created_at, inputs, results, recommended_cover, net_cost) "
        "VALUES (?,?,?,?,?,?)",
        (prospect_id, _now(), inputs, results, recommended_cover, net_cost),
    )


def analyses(prospect_id: str) -> List[sqlite3.Row]:
    return db.query(
        "SELECT * FROM keyman_analyses WHERE prospect_id = ? ORDER BY id DESC", (prospect_id,)
    )


def stats() -> Dict[str, Any]:
    rows = all_rows()
    total = len(rows)
    by_status = {s: 0 for s in STATUSES}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    won = by_status.get("Closed Won", 0)
    lost = by_status.get("Closed Lost", 0)
    pipeline = [r for r in rows if not str(r["status"]).startswith("Closed")]
    return {
        "total": total,
        "by_status": by_status,
        "open": len(pipeline),
        "won": won,
        "lost": lost,
        "conversion": (won / total * 100) if total else 0.0,
        "pipeline_cover": sum(float(r["est_cover"] or 0) for r in pipeline),
        "pipeline_premium": sum(float(r["premium"] or 0) for r in pipeline),
        "overdue": len(due_followups(True)),
        "upcoming": len(due_followups(False)),
    }


def to_records(rows: Iterable[sqlite3.Row]) -> List[dict]:
    return [dict(r) for r in rows]
