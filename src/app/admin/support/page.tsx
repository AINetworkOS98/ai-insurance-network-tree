'use client';
import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useRouter } from 'next/navigation';
import { SUBJECT_OPTIONS } from '@/lib/support';

const STATUS_LABELS: Record<string, string> = {
  NEW: '🔴 ใหม่',
  IN_PROGRESS: '🟡 กำลังดำเนินการ',
  REPLIED: '🟢 ตอบแล้ว',
  CLOSED: '⚫ ปิดเคส',
};

const STATUS_ORDER = ['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED'];

export default function AdminSupportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({ NEW: 0, IN_PROGRESS: 0, REPLIED: 0, CLOSED: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchTickets = async (reset = true) => {
    if (reset) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/admin/support?${params.toString()}`, { credentials: 'include' });
      const j = await res.json();
      if (j.ok) {
        setTickets(j.tickets || []);
        setStats(j.stats || { NEW: 0, IN_PROGRESS: 0, REPLIED: 0, CLOSED: 0 });
      } else {
        setToast('❌ ' + (j.error || 'ดึงข้อมูลไม่สำเร็จ'));
      }
    } catch {
      setToast('❌ เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, []);

  const fetchTicketDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/${id}`, { credentials: 'include' });
      const j = await res.json();
      if (j.ok) {
        setSelectedTicket(j.ticket);
        setReplyText('');
      } else {
        setToast('❌ ' + (j.error || 'ดึงรายละเอียดไม่สำเร็จ'));
      }
    } catch {
      setToast('❌ เชื่อมต่อไม่สำเร็จ');
    }
  };

  const handleSelectTicket = (ticket: any) => {
    setSelectedTicket(null);
    setReplyText('');
    fetchTicketDetail(ticket.id);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket || savingStatus) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const j = await res.json();
      if (j.ok) {
        setSelectedTicket({ ...selectedTicket, status: j.ticket.status });
        setToast('✅ เปลี่ยนสถานะสำเร็จ');
        fetchTickets(false);
      } else {
        setToast('❌ ' + (j.error || 'เปลี่ยนสถานะไม่สำเร็จ'));
      }
    } catch {
      setToast('❌ เชื่อมต่อไม่สำเร็จ');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const j = await res.json();
      if (j.ok) {
        setReplyText('');
        setToast('✅ ส่งคำตอบสำเร็จ');
        fetchTicketDetail(selectedTicket.id);
        fetchTickets(false);
      } else {
        setToast('❌ ' + (j.error || 'ส่งไม่สำเร็จ'));
      }
    } catch {
      setToast('❌ เชื่อมต่อไม่สำเร็จ');
    } finally {
      setSendingReply(false);
    }
  };

  const handleClose = async () => {
    await handleStatusChange('CLOSED');
  };

  const openTelephony = (phone: string) => {
    if (!phone) return;
    window.open(`tel:${phone.replace(/[^0-9+]/g, '')}`, '_blank');
  };
  const openLINE = (lineId: string) => {
    if (!lineId) return;
    window.open(`https://line.me/Ronti/me/${lineId}`, '_blank');
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch { return d; }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="flex w-full">
          <Sidebar />
          <main className="flex-1 p-6 bg-white">
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="loading-spinner" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 bg-white min-h-screen">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800">📩 Contact / Support</h1>
            {stats.NEW > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                {stats.NEW} ใหม่
              </span>
            )}
          </div>

          {toast && <div className="mb-3 px-4 py-2 rounded-xl bg-[#f0f7ff] text-sm text-slate-700 border border-blue-100">{toast}</div>}

          {/* สรุป */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {STATUS_ORDER.map(status => (
              <div
                key={status}
                className={`card p-3 cursor-pointer transition-colors ${statusFilter === status || statusFilter === 'ALL' ? 'ring-2 ring-sky-300' : ''} onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}`}
              >
                <div className="text-sm font-semibold">{STATUS_LABELS[status]}</div>
                <div className="text-lg font-bold text-sky-700">{stats[status] || 0}</div>
              </div>
            ))}
          </div>

          {/* ฟอร์มค้นหา + กรอง */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, เบอร์โทร, LINE ID หรือ Ticket ID"
              className="flex-1 px-4 py-2 rounded-xl border border-[#dbeafe] bg-[#f0f7ff] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <div className="flex gap-2">
              {['ALL', 'NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-2 rounded-full text-sm font-medium border ${statusFilter === s ? 'bg-sky-400 text-white border-sky-400' : 'bg-white border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'}`}
                >
                  {s === 'ALL' ? 'ทั้งหมด' : STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Main grid: List + Detail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ticket List */}
            <div className="card p-4 max-h-[70vh] overflow-y-auto">
              {tickets.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">ไม่พบ ticket</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => handleSelectTicket(ticket)}
                      className={`w-full text-left p-3 rounded-xl border cursor-pointer transition-colors ${selectedTicket?.id === ticket.id ? 'border-sky-300 bg-[#eff6ff]' : 'border-blue-100 bg-white hover:bg-[#f0f7ff]'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-400">#{ticket.id.slice(0, 8)}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                          {STATUS_LABELS[ticket.status]}
                        </span>
                      </div>
                      <div className="font-semibold text-sm text-slate-800 mt-1">{ticket.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{ticket.subject}</div>
                      {ticket.phone && <div className="text-xs text-slate-400 mt-0.5">📞 {ticket.phone}</div>}
                      {ticket.lineId && <div className="text-xs text-slate-400">LINE: {ticket.lineId}</div>}
                      <div className="text-xs text-slate-400 mt-0.5">{formatDate(ticket.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ticket Detail */}
            <div className="card p-4 flex flex-col max-h-[70vh]">
              {!selectedTicket ? (
                <p className="text-sm text-slate-500 text-center py-16">เลือก ticket เพื่อดูรายละเอียด</p>
              ) : (
                <>
                  {/* Header info */}
                  <div className="pb-3 border-b border-blue-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{selectedTicket.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        {STATUS_LABELS[selectedTicket.status]}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">#{selectedTicket.id.slice(0, 8)} • {formatDate(selectedTicket.createdAt)}</div>
                    <div className="flex gap-2 mt-2">
                      {selectedTicket.phone ? (
                        <button
                          onClick={() => openTelephony(selectedTicket.phone)}
                          className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200"
                        >
                          📞 โทร
                        </button>
                      ) : <span />}
                      {selectedTicket.lineId ? (
                        <button
                          onClick={() => openLINE(selectedTicket.lineId)}
                          className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200"
                        >
                          LINE
                        </button>
                      ) : <span />}
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="grid grid-cols-2 gap-2 py-3 text-sm bg-[#f0f7ff] rounded-xl px-3 mb-3">
                    <div><span className="text-slate-500">ชื่อ:</span> <span className="font-medium text-slate-800">{selectedTicket.name}</span></div>
                    {selectedTicket.phone && <div><span className="text-slate-500">โทร:</span> <span className="font-medium text-slate-800">{selectedTicket.phone}</span></div>}
                    {selectedTicket.lineId && <div><span className="text-slate-500">LINE ID:</span> <span className="font-medium text-slate-800">{selectedTicket.lineId}</span></div>}
                  </div>

                  {/* Subject + Message */}
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">หัวข้อ</div>
                    <div className="text-sm font-semibold text-slate-800">{selectedTicket.subject}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">ข้อความ</div>
                    <div className="bg-[#f0f7ff] border border-[#dbeafe] rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedTicket.message}
                    </div>
                  </div>

                  {/* Conversation */}
                  <div className="mb-3 flex-1 overflow-y-auto" style={{ maxHeight: '200px' }}>
                    <div className="text-xs text-slate-500 mb-2">การสนทนา ({selectedTicket.messages?.length || 0} ข้อความ)</div>
                    <div className="space-y-2">
                      {selectedTicket.messages?.map((msg: any) => (
                        <div key={msg.id} className={`flex ${msg.senderType === 'USER' ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${msg.senderType === 'USER' ? 'bg-[#f0f7ff] border border-[#dbeafe] text-slate-700' : 'bg-sky-500 text-white'}`}>
                            <div className="text-[10px] opacity-70 mb-0.5">
                              {msg.senderType === 'USER' ? 'ผู้ใช้' : 'Admin'} • {formatDate(msg.createdAt)}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status */}
                  {selectedTicket.status !== 'CLOSED' && (
                    <div className="border-t border-blue-100 pt-3 mb-3">
                      <div className="text-xs text-slate-500 mb-2">เปลี่ยนสถานะ</div>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_ORDER.filter(s => s !== selectedTicket.status).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(s)}
                            disabled={savingStatus || selectedTicket.status === 'CLOSED'}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff] disabled:opacity-40"
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reply form */}
                  <div className="border-t border-blue-100 pt-3">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="พิมพ์คำตอบ... (กดปิดเคสหากเสร็จสิ้น)"
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleReply}
                        disabled={sendingReply || !replyText.trim()}
                        className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {sendingReply ? 'กำลังส่ง...' : '💬 ส่งข้อความ'}
                      </button>
                      {selectedTicket.status !== 'CLOSED' && (
                        <button
                          onClick={handleClose}
                          disabled={savingStatus}
                          className="px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
                        >
                          ✓ ปิดเคส
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
