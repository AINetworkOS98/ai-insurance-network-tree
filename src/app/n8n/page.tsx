'use client';

import Link from 'next/link';

export default function N8nPage() {
  const webhooks = [
    {
      name: 'Webhook — Vercel Sync',
      path: '/webhook/vercel-sync',
      url: 'http://localhost:5678/webhook/vercel-sync',
      desc: 'รับข้อมูลจาก Vercel app เมื่อมีเหตุการณ์เกิดขึ้น',
      active: true,
    },
    {
      name: 'Webhook — Vercel Webhook',
      path: '/webhook/vercel-webhook',
      url: 'http://localhost:5678/webhook/vercel-webhook',
      desc: 'เว็บฮุคสำหรับการเชื่อมต่อเพิ่มเติม',
      active: true,
    },
  ];

  const workflows = [
    {
      name: 'AI Insurance Network Tree - sync & webhook',
      status: 'Active',
      triggers: 2,
      nodes: 9,
    },
    {
      name: 'TikTok Lead Conversion Automation',
      status: 'Inactive',
      triggers: 0,
      nodes: 19,
    },
  ];

  return (
    <div className="min-h-screen bg-soft-white">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 border-b border-[#f3e8d3] text-[#475569]">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="AI Insurance Network Tree" className="h-9 w-auto bg-white rounded-xl px-1 py-1 object-contain border border-[#f3e8d3]" />
            <div>
              <div className="font-bold leading-none text-sm text-[#475569]">AI Insurance Network Tree</div>
              <div className="text-[11px] text-[#57534e]">ระบบบริหารเครือข่ายตัวแทน</div>
            </div>
          </Link>
          <nav className="hidden md:flex gap-5 text-sm items-center">
            <Link href="/" className="text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">หน้าแรก</Link>
            <Link href="/n8n" className="text-sky-700 bg-[#eff6ff] rounded-full px-3 py-1.5 font-medium">N8N</Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy mb-2">⚡ N8N Automation</h1>
          <p className="text-slate-500 text-sm">เชื่อมต่อ N8N Workflow กับ AI Insurance Network Tree บน Vercel</p>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-2xl border border-[#dbeafe] p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <h2 className="text-lg font-semibold text-slate-800">N8N Server — กำลังทำงาน</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-1">URL</div>
              <div className="font-mono text-sky-700 font-medium">http://localhost:5678/</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-1">เวอร์ชัน</div>
              <div className="text-slate-700">v2.35.7</div>
            </div>
          </div>
          <div className="mt-4">
            <a href="http://localhost:5678/" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors">
              เปิด N8n Editor
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>
          </div>
        </div>

        {/* Webhooks */}
        <div className="bg-white rounded-2xl border border-[#dbeafe] p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">🔗 Webhook URLs</h2>
          <p className="text-sm text-slate-500 mb-4">คัดลอก URL เหล่านี้ไปใช้ใน Vercel app หรือบริการอื่นๆ เพื่อเรียก N8N Workflow</p>
          {webhooks.map((wh, i) => (
            <div key={i} className="mb-4 p-4 bg-slate-50 rounded-lg border border-[#e2e8f0]">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-slate-800">{wh.name}</div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${wh.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                  {wh.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-2">{wh.desc}</div>
              <div className="Relative">
                <input
                  type="text"
                  value={wh.url}
                  readOnly
                  className="w-full bg-white border border-[#dbeafe] rounded-lg px-3 py-2 text-sm font-mono text-slate-700"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(wh.url);
                    const btn = document.querySelector(`button[data-copy="${i}"]`);
                    if (btn) {
                      btn.textContent = 'คัดลอกแล้ว!';
                      setTimeout(() => btn.textContent = 'คัดลอก', 2000);
                    }
                  }}
                  data-copy={i}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-sky-500 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-sky-600 transition-colors"
                >
                  คัดลอก
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Workflows */}
        <div className="bg-white rounded-2xl border border-[#dbeafe] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">⚙️ Workflows</h2>
          <div className="space-y-3">
            {workflows.map((wf, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-[#e2e8f0]">
                <div>
                  <div className="font-medium text-slate-800">{wf.name}</div>
                  <div className="text-xs text-slate-500 mt-1">Nodes: {wf.nodes} • Triggers: {wf.triggers}</div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${wf.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                  {wf.status}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
            <p className="text-xs text-slate-400">
              หมายเหตุ: N8N ทำงานในเครื่อง (Local) เท่านั้น ไม่สามารถเข้าถึงจากภายนอกโดยตรง
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
