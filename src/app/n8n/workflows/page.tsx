'use client';

import Link from 'next/link';

export default function N8nWorkflowsPage() {
  const codeExample = "fetch(process.env.N8N_WEBHOOK_URL, { method: 'POST', body: ... })";

  const webhooks = [
    {
      id: 'vercel-sync',
      name: 'Webhook — Vercel Sync',
      url: 'http://localhost:5678/webhook/vercel-sync',
      desc: 'รับข้อมูลเมื่อมีเหตุการณ์จาก Vercel app',
      methods: ['POST'],
    },
    {
      id: 'vercel-webhook',
      name: 'Webhook — Vercel Webhook',
      url: 'http://localhost:5678/webhook/vercel-webhook',
      desc: 'เว็บฮุคสำหรับการเชื่อมต่อเพิ่มเติม',
      methods: ['POST'],
    },
  ];

  return (
    <div className="min-h-screen bg-soft-white">
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy mb-2">🔗 Webhook URLs</h1>
          <p className="text-slate-500 text-sm">คัดลอก URL แล้วใช้ใน Vercel app หรือบริการอื่นๆ เพื่อเรียก N8N Workflow</p>
        </div>

        {webhooks.map((wh) => (
          <div key={wh.id} className="bg-white rounded-2xl border border-[#dbeafe] p-6 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{wh.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{wh.desc}</p>
              </div>
              <div className="flex gap-1">
                {wh.methods.map((m) => (
                  <span key={m} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-mono">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                value={wh.url}
                readOnly
                className="w-full bg-slate-50 border border-[#dbeafe] rounded-lg px-3 py-2.5 text-sm font-mono text-slate-700 pr-10"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(wh.url);
                  const btn = document.getElementById(`copy-${wh.id}`);
                  if (btn) {
                    btn.textContent = '✓ คัดลอกแล้ว';
                    btn.classList.add('bg-green-500');
                    setTimeout(() => {
                      btn.textContent = 'คัดลอก';
                      btn.classList.remove('bg-green-500');
                    }, 2000);
                  }
                }}
                id={`copy-${wh.id}`}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-sky-500 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-sky-600 transition-colors"
              >
                คัดลอก
              </button>
            </div>
          </div>
        ))}

        <div className="mt-8 p-6 bg-[#f8fafc] rounded-2xl border border-[#e2e8f0]">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">การตั้งค่าใน Vercel App</h3>
          <div className="text-xs text-slate-500 space-y-2">
            <p>1. เปิดไฟล์ <code className="bg-slate-200 px-1 rounded">.env</code> ในโปรเจกต์</p>
            <p>2. เพิ่มค่าดังนี้:</p>
            <pre className="bg-slate-800 text-green-400 p-3 rounded-lg text-xs overflow-x-auto" style={{whiteSpace: 'pre'}}>
N8N_WEBHOOK_URL=http://localhost:5678/webhook/vercel-sync
N8N_SECRET=your-secret-here
            </pre>
            <p>3. เรียก webhook จาก API:</p>
            <pre className="bg-slate-800 text-green-400 p-3 rounded-lg text-xs overflow-x-auto mt-1" style={{whiteSpace: 'pre'}}>
{codeExample}
            </pre>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/n8n"
            className="text-sm text-sky-600 hover:text-sky-700 underline"
          >
            ← กลับหน้า N8N
          </Link>
        </div>
      </main>
    </div>
  );
}
