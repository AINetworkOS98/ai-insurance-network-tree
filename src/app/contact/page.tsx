'use client';
import { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

export default function ContactPage() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (!message.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const j = await r.json();
      if (j.ok) {
        setResult({ ok: true, text: '✅ ส่งคำถามถึงทีมงานแล้ว เราจะติดต่อกลับโดยเร็ว' });
        setMessage('');
      } else {
        setResult({ ok: false, text: '❌ ' + (j.error || 'ส่งไม่สำเร็จ') });
      }
    } catch {
      setResult({ ok: false, text: '❌ เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8 bg-white">
          <div className="max-w-xl mx-auto">
            <h1 className="text-xl font-bold text-slate-800 mb-1">📩 ติดต่อสอบถาม</h1>
            <p className="text-sm text-slate-500 mb-5">ส่งคำถามหรือข้อความถึงทีมงาน — เราจะตอบกลับโดยเร็ว</p>

            <div className="card p-5">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="พิมพ์คำถามหรือข้อความของคุณ..."
                rows={6}
                className="w-full px-4 py-3 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
              />
              {result && (
                <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm ${result.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                  {result.text}
                </div>
              )}
              <button
                onClick={submit}
                disabled={sending || !message.trim()}
                className="mt-4 w-full px-4 py-3 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? 'กำลังส่ง...' : 'ส่งคำถาม'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
