#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Insert "TL Smart Outbox Sync" workflow into n8n DB (schedule 1 min -> POST tl-smart-sync)."""
import json, sqlite3, uuid, os
from datetime import datetime, timezone

DB = os.path.expanduser("~/.n8n/database.sqlite")
WF_NAME = "TL Smart Outbox Sync"
SYNC_URL = "https://darkslateblue-nightingale-938495.hostingersite.com/api/cron/tl-smart-sync"

def now_ms():
    d = datetime.now(timezone.utc)
    return d.strftime("%Y-%m-%d %H:%M:%S.") + f"{d.microsecond // 1000:03d}"

con = sqlite3.connect(DB)
cur = con.cursor()

# template columns from an existing active workflow
cols = [d[0] for d in cur.execute("select * from workflow_entity limit 1").description]
tpl_row = cur.execute("select * from workflow_entity where active = 1 order by updatedAt desc limit 1").fetchone()
tpl = dict(zip(cols, tpl_row))

project_id = cur.execute("select projectId from shared_workflow limit 1").fetchone()
project_id = project_id[0] if project_id else None

existing = cur.execute("select id from workflow_entity where name = ?", (WF_NAME,)).fetchone()

nodes = [
    {
        "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 1}]}},
        "id": str(uuid.uuid4()),
        "name": "Schedule Every 1 Min",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [0, 0],
    },
    {
        "parameters": {
            "method": "POST",
            "url": SYNC_URL,
            "sendHeaders": True,
            "headerParameters": {"parameters": [{"name": "Authorization", "value": "=Bearer {{ $env.CRON_SECRET }}"}]},
            "options": {"timeout": 20000, "response": {"response": {"neverError": True}}},
        },
        "id": str(uuid.uuid4()),
        "name": "TL Smart Sync",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [260, 0],
        "onError": "continueRegularOutput",
    },
]
conns = {
    "Schedule Every 1 Min": {"main": [[{"node": "TL Smart Sync", "type": "main", "index": 0}]]},
}
settings = {"executionOrder": "v1"}
version_id = str(uuid.uuid4())
iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"

if existing:
    wid = existing[0]
    cur.execute(
        "update workflow_entity set nodes=?, connections=?, settings=?, active=1, versionId=?, activeVersionId=?, versionCounter=1, staticData='{}', pinData='{}', description=NULL, updatedAt=? where id=?",
        (json.dumps(nodes, ensure_ascii=False), json.dumps(conns, ensure_ascii=False), json.dumps(settings, ensure_ascii=False), version_id, version_id, now_ms(), wid),
    )
    print("updated", wid)
else:
    wid = str(uuid.uuid4())
    row = dict(tpl)
    row.update({
        "id": wid,
        "name": WF_NAME,
        "active": 1,
        "nodes": json.dumps(nodes, ensure_ascii=False),
        "connections": json.dumps(conns, ensure_ascii=False),
        "settings": json.dumps(settings, ensure_ascii=False),
        "staticData": "{}",
        "pinData": "{}",
        "description": None,
        "versionId": version_id,
        "activeVersionId": version_id,
        "triggerCount": 1,
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        "isArchived": 0,
        "versionCounter": 1,
    })
    ph = ", ".join("?" for _ in cols)
    cur.execute(f"insert into workflow_entity ({', '.join(cols)}) values ({ph})", [row.get(c) for c in cols])
    if project_id:
        cur.execute(
            "insert into shared_workflow (workflowId, projectId, role, createdAt, updatedAt) values (?, ?, 'workflow:owner', ?, ?)",
            (wid, project_id, now_ms(), now_ms()),
        )
    print("inserted", wid)

cur.execute("delete from workflow_history where workflowId = ?", (wid,))
cur.execute(
    "insert into workflow_history (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description, nodeGroups) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    (version_id, wid, "hermes", iso, iso, json.dumps(nodes, ensure_ascii=False), json.dumps(conns, ensure_ascii=False), WF_NAME, 0, None, "[]"),
)

con.commit()
con.close()
print("done. workflow id:", wid)
