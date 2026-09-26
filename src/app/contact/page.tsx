'use client';
import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { SUBJECT_OPTIONS } from '@/lib/support';

export default function ContactPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [form, setForm] = useState({
    phone: '',
    lineId: '',
    subject: '',
    message: '',
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j.ok) setProfile(j.user || null); })
      .finally(() => setLoadingProfile(false));
  }, []);

  const handleChange = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const handleSubjectChange = (value: string) => setForm(f => ({ ...f, subject: value }));

  async function submit() {
    if (!form.subject || !form.message.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone || undefined,
          lineId: form.lineId || undefined,
          subject: form.subject,
          message: form.message.trim(),
        }),
      });
      const j = await res.json();
      if (j.ok) {
        setResult({ ok: true, text: '✅ ส่งข้อความเรียบร้อยแล้ว Admin จะติดต่อกลับผ่านช่องทางที่คุณแจ้งไว้' });
        setForm({ phone: '', lineId: '', subject: '', message: '' });
      } else {
        setResult({ ok: false, text: '❌ ' + (j.error || 'ส่งไม่สำเร็จ') });
      }
    } catch {
      setResult({ ok: false, text: '❌ เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' });
    } finally {
      setSending(false);
    }
  }

  const name = profile?.displayName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'สมาชิก';

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8 bg-white">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-xl font-bold text-slate-800 mb-1">📩 ติดต่อ Admin</h1>
            <p className="text-sm text-slate-500 mb-5">Support Center — ส่งคำถาม แจ้งปัญหา หรือขอความช่วยเหลือจากทีมงาน</p>

            {loadingProfile ? (
              <div className="card p-5 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
            ) : (
              <div className="card p-5 space-y-4">
                {/* ชื่อ */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-sky-50 border border-sky-100">
                  <div className="w-9 h-9 rounded-full bg-sky-200 flex items-center justify-center text-sky-700 font-bold text-sm">
                    {name?.[0] || '?'}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{name}</div>
                    <div className="text-xs text-slate-500">ดึงข้อมูลอัตโนมัติจากโปรไฟล์</div>
                  </div>
                </div>

                {/* เบอร์โทร */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทร</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    placeholder="เช่น 0812345678"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                  <p className="text-xs text-slate-400 mt-1">ไม่บังคับ</p>
                </div>

                {/* LINE ID */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">LINE ID</label>
                  <input
                    type="text"
                    value={form.lineId}
                    onChange={e => handleChange('lineId', e.target.value)}
                    placeholder="เช่น myline123"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                  <p className="text-xs text-slate-400 mt-1">ไม่บังคับ</p>
                </div>

                {/* หัวข้อ */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">หัวข้อ</label>
                  <select
                    value={form.subject}
                    onChange={e => handleSubjectChange(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    <option value="">เลือกหัวข้อ...</option>
                    {SUBJECT_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* ข้อความ */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ข้อความ</label>
                  <textarea
                    value={form.message}
                    onChange={e => handleChange('message', e.target.value)}
                    placeholder="พิมพ์คำถามหรือรายละเอียดที่ต้องการติดต่อ..."
                    rows={6}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                  />
                </div>

                {/* Result */}
                {result && (
                  <div className={`p-4 rounded-xl text-sm ${result.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                    {result.text}
                  </div>
                )}

                {/* ปุ่มส่ง */}
                <button
                  onClick={submit}
                  disabled={sending || !form.subject || !form.message.trim()}
                  className="w-full px-4 py-3 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? 'กำลังส่ง...' : '📩 ส่งข้อความถึง Admin'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
