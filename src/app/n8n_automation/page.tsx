'use client';

import Link from 'next/link';

export default function N8nAutomationPage() {
  const workflowJson = `{
  "name": "AI Insurance Network Tree — N8n Workflow",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "ai-insurance-network-webhook",
        "responseMode": "onReceived"
      },
      "id": "webhook",
      "name": "Webhook — รับข้อมูลจากระบบ",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [200, 300]
    },
    {
      "parameters": {
        "operation": "getAll",
        "collection": "agents"
      },
      "id": "get-agents",
      "name": "ดึงข้อมูล Agents",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [400, 300]
    },
    {
      "parameters": {
        "operation": "getAll",
        "collection": "leads"
      },
      "id": "get-leads",
      "name": "ดึงข้อมูล Leads",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [400, 500]
    },
    {
      "parameters": {
        "systemMessage": "คุณคือ AI Manager สำหรับเครือข่ายตัวแทนประกันชีวิต\n\nวิเคราะห์ข้อมูล Lead และ Agent แล้วตัดสินใจ Action:\n\n1. ตรวจสอบว่า Lead อยู่ขั้นตอนไหน\n2. ตรวจสอบว่า Agent มี Activity ไหม\n3. ดูว่า Lead ไหนต้อง Follow-up\n4. ตัดสินใจส่งการแจ้งเตือน\n\nตอบกลับเป็น JSON:\n{\n  "action": "FOLLOW_UP|SEND_NOTIFICATION|UPDATE_LEAD|NO_ACTION",\n  "priority": "HIGH|MEDIUM|LOW",\n  "agent_id": "",\n  "lead_id": "",\n  "message": ""\n}",
        "userMessage": "=== Input Data ===\n{{ $json }}\n\n=== Task ===\nวิเคราะห์ข้อมูลแล้วตัดสินใจ Action",
        "options": {}
      },
      "id": "ai-analyze",
      "name": "AI วิเคราะห์ข้อมูล",
      "type": "n8n-nodes-base.ai",
      "typeVersion": 1,
      "position": [600, 400]
    },
    {
      "parameters": {
        "table": "activities",
        "operation": "insert",
        "columns": {
          "activity_type": "={{ $json.action }}",
          "agent_id": "={{ $json.agent_id }}",
          "lead_id": "={{ $json.lead_id }}",
          "description": "={{ $json.message }}",
          "created_at": "={{ new Date().toISOString() }}"
        }
      },
      "id": "save-activity",
      "name": "บันทึก Activity ลง Database",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [800, 400]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "send",
        "contentType": "text",
        "text": "={{ $json.message }}"
      },
      "id": "notify",
      "name": "แจ้งเตือนผ่าน LINE/Email/Telegram",
      "type": "n8n-nodes-base.line",
      "typeVersion": 1,
      "position": [1000, 400]
    }
  ],
  "connections": {
    "webhook": {
      "main": [[{ "node": "get-agents", "type": "main", "index": 0 }, { "node": "get-leads", "type": "main", "index": 0 }]]
    },
    "get-agents": {
      "main": [[{ "node": "ai-analyze", "type": "main", "index": 0 }]]
    },
    "get-leads": {
      "main": [[{ "node": "ai-analyze", "type": "main", "index": 0 }]]
    },
    "ai-analyze": {
      "main": [[{ "node": "save-activity", "type": "main", "index": 0 }]]
    },
    "save-activity": {
      "main": [[{ "node": "notify", "type": "main", "index": 0 }]]
    }
  }
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(workflowJson).then(() => {
      alert('คัดลอก JSON เรียบร้อยแล้ว — นำไป Import ใน n8n ได้เลย');
    }).catch(() => {
      alert('ไม่สามารถคัดลอกได้ โปรดลองอีกครั้ง');
    });
  };

  const actionTypes = [
    { action: 'CREATE_LEAD', desc: 'สร้าง Lead ใหม่ในระบบ' },
    { action: 'UPDATE_LEAD', desc: 'อัปเดตสถานะ Lead' },
    { action: 'CREATE_TASK', desc: 'สร้างงานให้ตัวแทน' },
    { action: 'FOLLOW_UP', desc: 'ติดตาม Lead ที่ค้าง' },
    { action: 'SEND_NOTIFICATION', desc: 'ส่งการแจ้งเตือน' },
    { action: 'CREATE_APPOINTMENT', desc: 'สร้างการนัดหมาย' },
    { action: 'GENERATE_REPORT', desc: 'สร้างรายงาน' },
    { action: 'AGENT_COACHING', desc: 'ให้คำแนะนำตัวแทน' },
    { action: 'TEAM_ANALYSIS', desc: 'วิเคราะห์ทีม' },
    { action: 'DAILY_REPORT', desc: 'รายงานรายวัน' },
    { action: 'WEEKLY_REPORT', desc: 'รายงานรายสัปดาห์' },
    { action: 'NO_ACTION', desc: 'ไม่ต้องทำอะไร' },
  ];

  const workflowSteps = [
    { step: '1', title: 'Webhook รับข้อมูล', desc: 'ระบบส่งข้อมูล Agent, Lead, Activity มา via Webhook API' },
    { step: '2', title: 'ดึงข้อมูล Agents/Leads', desc: 'n8n ดึงข้อมูลตัวแทนและ Leads จากฐานข้อมูล' },
    { step: '3', title: 'AI วิเคราะห์ข้อมูล', desc: 'AI Agent วิเคราะห์สถานะ Lead, Activity, และตัดสินใจ Action' },
    { step: '4', title: 'ตัดสินใจ Action', desc: 'AI สั่งการ: FOLLOW_UP, SEND_NOTIFICATION, UPDATE_LEAD หรือ NO_ACTION' },
    { step: '5', title: 'บันทึกกลับ Database', desc: 'บันทึก Activity และอัปเดตข้อมูลกลับไปยัง Database' },
    { step: '6', title: 'แจ้งเตือนตัวแทน/หัวหน้า', desc: 'ส่งการแจ้งเตือนผ่าน LINE / Email / Telegram' },
  ];

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      {/* Header */}
      <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <svg className="h-7 w-7 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-sm font-bold text-slate-800">AI Insurance Network Tree</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/network-example" className="text-slate-500 hover:text-slate-800">Network Tree</Link>
            <Link href="/n8n_automation" className="text-sky-600 font-semibold">n8n Automation</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 md:px-6 py-8">
        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-sky-900">n8n Automation</h1>
          <p className="mt-2 text-base text-slate-600">
            ระบบอัตโนมัติด้วย n8n Workflow สำหรับบริหารเครือข่ายตัวแทนประกันชีวิต — ตั้งแต่รับ Webhook,
            วิเคราะห์ข้อมูลด้วย AI, บันทึกกลับ Database, และแจ้งเตือนผ่าน LINE / Email / Telegram
          </p>
        </div>

        {/* Architecture Diagram */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">ระบบ Architecture — สายงานอัตโนมัติ</h2>
          <div className="flex flex-col items-center gap-2 text-sm">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex flex-col items-center rounded-lg border-2 border-sky-600 bg-sky-50 px-4 py-2 text-sky-700">
                <div className="text-base font-bold">AI Insurance</div>
                <div className="text-base font-bold">Network Tree</div>
                <div className="text-xs text-sky-500">ฐานข้อมูลหลัก</div>
              </div>
              <div className="h-5 w-0.5 bg-sky-300" />
              <svg className="h-4 w-4 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <div className="flex flex-col items-center rounded-lg border-2 border-purple-500 bg-purple-50 px-4 py-2 text-purple-700">
                <div className="text-base font-bold">Webhook</div>
                <div className="text-xs text-purple-500">รับข้อมูลจากระบบ</div>
              </div>
            </div>
            <div className="flex justify-center">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <div className="rounded-xl border-2 border-amber-500 bg-amber-50 px-5 py-2 text-amber-700">
              <div className="text-base font-bold">n8n Workflow</div>
              <div className="text-xs text-amber-500">ระบบอัตโนมัติ (Automation Engine)</div>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              <div className="flex flex-col items-center">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <div className="flex flex-col items-center rounded-lg border-2 border-green-500 bg-green-50 px-3 py-1 text-green-700">
                  <div className="text-sm font-bold">Database</div>
                  <div className="text-xs text-green-500">บันทึกข้อมูล</div>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">Agents • Leads • Activities</div>
              </div>
              <div className="flex flex-col items-center">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <div className="flex flex-col items-center rounded-lg border-2 border-indigo-500 bg-indigo-50 px-3 py-1 text-indigo-700">
                  <div className="text-sm font-bold">AI Agent</div>
                  <div className="text-xs text-indigo-500">วิเคราะห์ + ตัดสินใจ</div>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">วิเคราะห์ • Coaching • Follow-up</div>
              </div>
            </div>
            <div className="flex justify-center">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M15 11l-7-7m0 0l7-7m-7 7V3" />
              </svg>
            </div>
            <div className="rounded-lg border-2 border-rose-500 bg-rose-50 px-3 py-1 text-rose-700">
              <div className="text-sm font-bold">Notification</div>
              <div className="text-xs text-rose-500">LINE / Email / Telegram</div>
            </div>
            <div className="flex justify-center">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M15 11l-7-7m0 0l7-7m-7 7V3" />
              </svg>
            </div>
            <div className="flex flex-col items-center rounded-lg border-2 border-sky-600 bg-sky-50 px-3 py-1 text-sky-700">
              <div className="text-sm font-bold">Network Tree</div>
              <div className="text-xs text-sky-500">อัปเดตสถานะตัวแทน</div>
            </div>
          </div>
        </div>

        {/* 6-Step Workflow */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">ขั้นตอนการทำงาน (Workflow Flow) 6 ขั้นตอน</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map((item) => (
              <div key={item.step} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
                    {item.step}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Types */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Action Types — 12 รูปแบบการทำงาน</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actionTypes.map((item) => (
              <div key={item.action} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-7 min-w-0 flex-1 flex-col items-start justify-center rounded bg-sky-100 px-2 py-0.5 text-xs font-bold uppercase text-sky-700">
                  {item.action}
                </div>
                <div className="text-xs text-slate-600">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Export/Import JSON */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Export / Import n8n Workflow JSON</h2>
          <p className="mb-4 text-sm text-slate-600">
            ด้านล่างคือ n8n Workflow JSON สำหรับนำเข้าใช้งานจริงใน n8n — คัดลอกแล้ว Import ใน n8n ได้เลย
          </p>
          <div className="mb-4 flex gap-2">
            <button
              onClick={copyToClipboard}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition"
            >
              📋 Copy JSON
            </button>
          </div>
          <pre className="overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-green-300">
            {workflowJson}
          </pre>
        </div>

        {/* Instructions */}
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">วิธี Import n8n Workflow JSON</h3>
          <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600">
            <li>เปิด n8n Dashboard</li>
            <li>คลิก "Add Workflow"</li>
            <li>เลือก "Import from File" หรือคัดลอก JSON ข้างบนไปวาง</li>
            <li>ตั้งค่า Database connection (PostgreSQL/MySQL)</li>
            <li>ตั้งค่า LINE / Email / Telegram notification channel</li>
            <li>ทดสอบ Webhook โดยส่งข้อมูลทดสอบผ่าน curl หรือ Postman</li>
            <li>เปิดใช้งาน Workflow</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
