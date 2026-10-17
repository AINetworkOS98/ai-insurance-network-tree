# -*- coding: utf-8 -*-
"""database/db.py — SQLite (มาตรฐานของโปรเจกต์: ใช้ sqlite3 จาก stdlib)"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Iterable, List

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "keyman_crm.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS prospects (
    id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '', first_name TEXT NOT NULL, last_name TEXT DEFAULT '', nickname TEXT DEFAULT '',
    phone TEXT DEFAULT '', email TEXT DEFAULT '', province TEXT DEFAULT '', area TEXT DEFAULT '',
    lead_source TEXT DEFAULT '', owner TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    pdpa_consent INTEGER NOT NULL DEFAULT 0, pdpa_purpose TEXT DEFAULT '',
    company_name TEXT DEFAULT '', company_reg_no TEXT DEFAULT '', business_type TEXT DEFAULT '',
    annual_revenue REAL DEFAULT 0, net_profit REAL DEFAULT 0,
    employees INTEGER DEFAULT 0, shareholders INTEGER DEFAULT 0,
    position TEXT DEFAULT '', share_pct REAL DEFAULT 0, key_executives INTEGER DEFAULT 1,
    importance TEXT DEFAULT '', successor TEXT DEFAULT '', risk_note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'New Lead',
    next_follow_up TEXT DEFAULT '', est_cover REAL DEFAULT 0, premium REAL DEFAULT 0,
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id TEXT NOT NULL,
    kind TEXT DEFAULT 'โทร',
    activity_at TEXT DEFAULT '',
    summary TEXT DEFAULT '', concern TEXT DEFAULT '', lost_reason TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS keyman_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id TEXT,
    created_at TEXT NOT NULL,
    inputs TEXT NOT NULL, results TEXT NOT NULL,
    recommended_cover REAL DEFAULT 0, net_cost REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_activities_prospect ON activities(prospect_id);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def query(sql: str, params: Iterable[Any] = ()) -> List[sqlite3.Row]:
    with connect() as conn:
        return list(conn.execute(sql, tuple(params)).fetchall())


def query_one(sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
    with connect() as conn:
        row = conn.execute(sql, tuple(params)).fetchone()
        return row


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    with connect() as conn:
        cur = conn.execute(sql, tuple(params))
        conn.commit()
        return cur.lastrowid or cur.rowcount
