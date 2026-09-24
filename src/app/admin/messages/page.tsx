'use client';
import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

interface Member {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  memberCode?: string;
}
interface Reply {
  id: string;
  replyMessage: string;
  createdAt: string;
  replier?: { displayName?: string; firstName?: string; lastName?: string; email?: string };
}
interface Msg {
  id: string;
  message: string;
  status: 'PENDING' | 'REPLIED';
  createdAt: string;
  updatedAt: string;
  member: Member;
  replies: Reply[];
}

function memberName(m: Member) {
  return m.displayName || [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'สมาชิก';
}
function fmt(d: string) {
  try { return new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }); } catch { return d; }
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'REPLIED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const r = await fetch(`/api/admin/messages?${params.toString()}`, { credentials: 'include' });
      const j = await r.json();
      if (j.ok) {
        setMessages(j.messages || []);
        setPendingCount(j.pending || 0);
      } else {
        setError(j.error || 'ดึงข้อมูลไม่สำเร็จ');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const selected = messages.find((m) => m.id === selectedId) || null;

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/messages/${selected.id}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyMessage: replyText.trim() }),
      });
      const j = await r.json();
      if (j.ok) {
        setReplyText('');
        setToast('✅ ส่งคำตอบสำเร็จ');
        await fetchMessages();
        // refresh detail
        const rd = await fetch(`/api/admin/messages?status=ALL`, { credentials: 'include' });
        const jd = await rd.json();
        if (jd.ok) {
          setMessages(jd.messages || []);
          setPendingCount(jd.pending || 0);
        }
      } else {
        setToast('❌ ' + (j.error || 'ส่งไม่สำเร็จ'));
      }
    } catch {
      setToast('❌ เชื่อมต่อไม่สำเร็จ');
    } finally {
      setSending(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800">💬 ตอบสมาชิก</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                รอตอบ {pendingCount}
              </span>
            )}
          </div>

          {toast && <div className="mb-3 px-4 py-2 rounded-xl border border-blue-100 bg-[#f0f7ff] text-sm text-slate-700">{toast}</div>}

          {error && (
            <div className="card p-5 bg-sky-50 border-blue-100 mb-4">
              <p className="text-sm text-sky-700">{error}</p>
              <button onClick={fetchMessages} className="mt-2 px-4 py-2 rounded-full bg-sky-400 text-white text-sm">ลองใหม่</button>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสมาชิก / ข้อความ..."
              className="flex-1 px-4 py-2 rounded-xl border border-[#dbeafe] bg-[#f0f7ff] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <div className="flex gap-2">
              {(['ALL', 'PENDING', 'REPLIED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border ${statusFilter === s ? 'bg-sky-400 text-white border-sky-400' : 'bg-white border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'}`}
                >
                  {s === 'ALL' ? 'ทั้งหมด' : s === 'PENDING' ? 'รอตอบ' : 'ตอบแล้ว'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="card p-6 text-center"><div className="loading-spinner mx-auto mb-3" /><p className="text-sm text-slate-500">กำลังโหลดข้อความ...</p></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* List */}
              <div className="card p-4 max-h-[70vh] overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">ไม่พบข้อความ</p>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedId(m.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedId === m.id ? 'border-sky-300 bg-[#eff6ff]' : 'border-blue-100 bg-white hover:bg-[#f0f7ff]'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-800 truncate">{memberName(m.member)}</span>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${m.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {m.status === 'PENDING' ? 'รอตอบ' : 'ตอบแล้ว'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{fmt(m.createdAt)}</div>
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{m.message}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Detail */}
              <div className="card p-4 flex flex-col max-h-[70vh]">
                {!selected ? (
                  <p className="text-sm text-slate-500 text-center py-16">เลือกข้อความเพื่อดูรายละเอียดการสนทนา</p>
                ) : (
                  <>
                    <div className="pb-3 border-b border-blue-100">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{memberName(selected.member)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${selected.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {selected.status === 'PENDING' ? 'รอตอบ' : 'ตอบแล้ว'}
                        </span>
                      </div>
                      {selected.member.memberCode && <div className="text-xs text-slate-400 mt-0.5">รหัส {selected.member.memberCode}</div>}
                      <div className="text-xs text-slate-400">{fmt(selected.createdAt)}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-3 space-y-3">
                      {/* Question */}
                      <div className="flex justify-start">
                        <div className="max-w-[85%] bg-[#f0f7ff] border border-[#dbeafe] rounded-2xl rounded-tl-sm px-4 py-2.5">
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{selected.message}</p>
                        </div>
                      </div>
                      {/* Replies */}
                      {selected.replies.map((rp) => (
                        <div key={rp.id} className="flex justify-end">
                          <div className="max-w-[85%] bg-sky-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                            <p className="text-sm whitespace-pre-wrap">{rp.replyMessage}</p>
                            <div className="text-[10px] text-sky-100 mt-1 text-right">
                              {memberName(rp.replier as Member)} • {fmt(rp.createdAt)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Reply form */}
                    <div className="pt-3 border-t border-blue-100">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="พิมพ์คำตอบสมาชิก..."
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                      />
                      <button
                        onClick={sendReply}
                        disabled={sending || !replyText.trim()}
                        className="mt-2 w-full px-4 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {sending ? 'กำลังส่ง...' : 'ส่งคำตอบ'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
