'use client';

/**
 * /dashboard/leads — หน้าจัดการผู้สนใจ (Lead) ตามสเปกส่วน 12
 * ------------------------------------------------------------------
 * • ดึงข้อมูลจาก GET /api/dashboard/leads
 * • ตารางแสดง: ข้อมูลติดต่อ · กลุ่ม · ความสนใจ · คะแนน/ระดับความสนใจ ·
 *   ช่องทางที่เลือก · สถานะความยินยอม · ขอติดต่อกลับ · กิจกรรมล่าสุด
 * • มีสรุปจำนวนตามระดับ (LOW / WARM / INTERESTED / HIGH INTENT)
 * • ค้นหา + กรองระดับ + กรองความยินยอม + ส่งออก CSV (ไม่พึ่ง dependency)
 * • อ่านผลลัพธ์แบบยืดหยุ่น — รองรับทั้ง leads / data / items จาก API
 */

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

// ── ชนิดข้อมูลที่ normalize แล้ว ─────────────────────────────────────────────
type Level = 'HIGH' | 'INTERESTED' | 'WARM' | 'LOW';

interface Lead {
  id: string;
  name: string;
  phone: string;
  lineId: string;
  ageRange: string;
  occupation: string;
  interests: string[];
  financialGoal: string;
  insuranceInterest: string;
  contactRequested: boolean;
  preferredChannel: string;
  channelPreference: { line: boolean; email: boolean; sms: boolean; web_push: boolean };
  consent: boolean;
  status: string;
  score: number;
  level: Level;
  createdAt: string;
}

const LEVEL_LABEL: Record<Level, string> = {
  HIGH: 'สูงมาก (HIGH INTENT)',
  INTERESTED: 'สนใจ',
  WARM: 'อุ่น',
  LOW: 'เริ่มสนใจ',
};

const LEVEL_BADGE: Record<Level, string> = {
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  INTERESTED: 'bg-amber-100 text-amber-700 border-amber-200',
  WARM: 'bg-sky-100 text-sky-700 border-sky-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

const CHANNEL_LABEL: Record<string, string> = {
  line: 'LINE',
  email: 'อีเมล',
  sms: 'SMS',
  web_push: 'แจ้งเตือนเว็บ',
};

function levelFromScore(s: number): Level {
  if (s >= 70) return 'HIGH';
  if (s >= 40) return 'INTERESTED';
  if (s >= 20) return 'WARM';
  return 'LOW';
}

function pick(l: any, keys: string[]): any {
  for (const k of keys) {
    const v = l?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function normInterests(l: any): string[] {
  const raw = pick(l, ['interests', 'lead_interests', 'leadInterests', 'topics']);
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'string' ? x : x?.topic || x?.name || x?.interest || x?.label || ''))
      .filter(Boolean);
  }
  if (typeof raw === 'string') return raw.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function normConsent(l: any): boolean {
  const c = pick(l, ['consent', 'consent_status', 'consentStatus', 'pdpa_consent']);
  if (typeof c === 'boolean') return c;
  if (typeof c === 'string') return /^(granted|true|yes|y|accepted|consented)$/i.test(c) || c === 'ยินยอม';
  return false;
}

function normalizeLead(l: any): Lead {
  const scoreRaw = pick(l, ['engagement_score', 'engagementScore', 'score']);
  const score = typeof scoreRaw === 'object' && scoreRaw !== null
    ? Number(scoreRaw.score ?? scoreRaw.value ?? 0)
    : Number(scoreRaw ?? 0);
  const levelRaw = String(pick(l, ['level', 'engagement_level', 'engagementLevel']) || '').toUpperCase();
  const level = (['HIGH', 'INTERESTED', 'WARM', 'LOW'].includes(levelRaw) ? levelRaw : levelFromScore(score)) as Level;
  const cp = pick(l, ['channel_preference', 'channelPreference']) || {};

  return {
    id: String(pick(l, ['id', 'prospect_id', 'prospectId', 'lead_id', 'leadId']) || Math.random()),
    name: String(pick(l, ['name', 'full_name', 'fullName', 'display_name', 'displayName', 'contact_name']) || 'ไม่ระบุชื่อ'),
    phone: String(pick(l, ['phone', 'phone_number', 'phoneNumber', 'tel']) || ''),
    lineId: String(pick(l, ['line_id', 'lineId', 'line']) || ''),
    ageRange: String(pick(l, ['age_range', 'ageRange', 'age']) || ''),
    occupation: String(pick(l, ['occupation', 'job', 'career']) || ''),
    interests: normInterests(l),
    financialGoal: String(pick(l, ['financial_goal', 'financialGoal', 'goal']) || ''),
    insuranceInterest: String(pick(l, ['insurance_interest', 'insuranceInterest', 'insurance_type']) || ''),
    contactRequested: Boolean(pick(l, ['contact_requested', 'contactRequested', 'callback_requested', 'wants_contact'])),
    preferredChannel: String(pick(l, ['preferred_channel', 'preferredChannel', 'channel']) || ''),
    channelPreference: {
      line: !!cp.line,
      email: !!cp.email,
      sms: !!cp.sms,
      web_push: !!(cp.web_push ?? cp.webPush),
    },
    consent: normConsent(l),
    status: String(pick(l, ['status', 'stage', 'lead_status']) || 'NEW').toUpperCase(),
    score: Number.isFinite(score) ? score : 0,
    level,
    createdAt: String(pick(l, ['created_at', 'createdAt', 'first_seen', 'registered_at', 'updatedAt']) || ''),
  };
}

function timeAgo(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return d.toLocaleDateString('th-TH');
}

function channelsOf(l: Lead): string {
  const on = (Object.keys(l.channelPreference) as (keyof typeof l.channelPreference)[])
    .filter((k) => l.channelPreference[k])
    .map((k) => CHANNEL_LABEL[k]);
  if (on.length) return on.join(' · ');
  return l.preferredChannel ? (CHANNEL_LABEL[l.preferredChannel] || l.preferredChannel) : '—';
}

export default function DashboardLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState<'ALL' | Level>('ALL');
  const [onlyConsent, setOnlyConsent] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/leads', { credentials: 'include', cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        setAuthRequired(true);
        setLeads([]);
        return;
      }
      const j = await res.json().catch(() => ({}));
      const raw: any[] = j?.leads || j?.data || j?.items || [];
      if (j?.ok === false) {
        setError(j?.error || 'โหลดข้อมูลไม่สำเร็จ');
        setLeads([]);
        return;
      }
      setAuthRequired(false);
      setLeads(Array.isArray(raw) ? raw.map(normalizeLead) : []);
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── สรุปจำนวนตามระดับ ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const base: Record<Level, number> = { HIGH: 0, INTERESTED: 0, WARM: 0, LOW: 0 };
    for (const l of leads) base[l.level]++;
    return { total: leads.length, ...base, consent: leads.filter((l) => l.consent).length };
  }, [leads]);

  // ── กรอง + ค้นหา ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (levelFilter !== 'ALL' && l.level !== levelFilter) return false;
      if (onlyConsent && !l.consent) return false;
      if (!needle) return true;
      const hay = [l.name, l.phone, l.lineId, l.occupation, l.insuranceInterest, l.financialGoal, ...l.interests]
        .join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [leads, q, levelFilter, onlyConsent]);

  // ── ส่งออก CSV (ไม่พึ่ง dependency) ───────────────────────────────────────
  function exportCsv() {
    const head = ['ชื่อ', 'เบอร์โทร', 'LINE', 'ช่วงอายุ', 'อาชีพ', 'ความสนใจ', 'เป้าหมายการเงิน', 'ความสนใจด้านประกัน', 'ให้ติดต่อกลับ', 'ช่องทาง', 'ความยินยอม', 'คะแนน', 'ระดับ', 'สถานะ', 'วันที่'];
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((l) => [
      l.name, l.phone, l.lineId, l.ageRange, l.occupation, l.interests.join(' / '),
      l.financialGoal, l.insuranceInterest, l.contactRequested ? 'ใช่' : 'ไม่', channelsOf(l),
      l.consent ? 'ยินยอม' : 'ไม่ยินยอม', String(l.score), LEVEL_LABEL[l.level], l.status, l.createdAt,
    ].map(esc).join(','));
    const csv = '\uFEFF' + [head.map(esc).join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8 bg-white">
          <div className="max-w-6xl mx-auto">
            {/* หัวเรื่อง + รีเฟรช */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <h1 className="text-xl font-bold text-slate-800">🎯 ผู้สนใจ (Leads)</h1>
                <p className="text-sm text-slate-500 mt-1">
                  จัดการผู้ลงทะเบียน ดูความสนใจและระดับความตั้งใจ — ผู้ที่ได้คะแนนสูงควรให้ตัวแทนติดต่อเอง
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportCsv}
                  disabled={!filtered.length}
                  className="text-sm px-3 py-2 rounded-xl border border-[#dbeafe] bg-white hover:bg-sky-50 disabled:opacity-40"
                >
                  ⬇️ ส่งออก CSV
                </button>
                <button
                  onClick={() => load(true)}
                  disabled={refreshing}
                  className="text-sm px-3 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {refreshing ? 'กำลังโหลด…' : '🔄 รีเฟรช'}
                </button>
              </div>
            </div>

            {/* สรุปตามระดับ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              <StatCard label="ผู้สนใจทั้งหมด" value={stats.total} tone="slate" />
              <StatCard label="HIGH INTENT (70+)" value={stats.HIGH} tone="red" />
              <StatCard label="สนใจ (40-69)" value={stats.INTERESTED} tone="amber" />
              <StatCard label="อุ่น (20-39)" value={stats.WARM} tone="sky" />
              <StatCard label="ยินยอมให้ติดต่อ" value={stats.consent} tone="emerald" />
            </div>

            {/* แถบค้นหา/กรอง */}
            <div className="card p-3 sm:p-4 mb-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหา ชื่อ / เบอร์โทร / LINE / ความสนใจ"
                className="flex-1 min-w-[200px] rounded-xl border border-[#dbeafe] bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as 'ALL' | Level)}
                className="rounded-xl border border-[#dbeafe] bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                <option value="ALL">ทุกระดับ</option>
                <option value="HIGH">HIGH INTENT</option>
                <option value="INTERESTED">สนใจ</option>
                <option value="WARM">อุ่น</option>
                <option value="LOW">เริ่มสนใจ</option>
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyConsent}
                  onChange={(e) => setOnlyConsent(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-300"
                />
                เฉพาะที่ยินยอม
              </label>
              <span className="text-xs text-slate-400">แสดง {filtered.length} / {leads.length}</span>
            </div>

            {/* สถานะต่าง ๆ */}
            {loading ? (
              <div className="card p-5">
                <div className="animate-pulse space-y-2">
                  <div className="h-5 bg-slate-200 rounded w-1/4" />
                  {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded w-full" />)}
                </div>
              </div>
            ) : authRequired ? (
              <div className="card p-8 text-center">
                <div className="text-3xl mb-2">🔒</div>
                <div className="font-semibold text-slate-700">ต้องเข้าสู่ระบบก่อน</div>
                <p className="text-sm text-slate-500 mt-1">หน้านี้เป็นข้อมูลผู้สนใจ ต้องเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์</p>
                <Link href="/login?next=/dashboard/leads" className="inline-block mt-4 px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold">
                  เข้าสู่ระบบ
                </Link>
              </div>
            ) : error ? (
              <div className="card p-6 text-center text-sm text-red-600">⚠️ {error}</div>
            ) : filtered.length === 0 ? (
              <div className="card p-8 text-center text-sm text-slate-500">
                {leads.length === 0 ? 'ยังไม่มีผู้ลงทะเบียน — เมื่อมีผู้สนใจลงทะเบียนจะแสดงที่นี่' : 'ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา'}
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="text-left p-3 whitespace-nowrap">ผู้สนใจ</th>
                        <th className="text-left p-3 whitespace-nowrap">ช่องทางติดต่อ</th>
                        <th className="text-left p-3 whitespace-nowrap hidden md:table-cell">กลุ่ม</th>
                        <th className="text-left p-3 hidden lg:table-cell">ความสนใจ</th>
                        <th className="text-center p-3 whitespace-nowrap">คะแนน / ระดับ</th>
                        <th className="text-left p-3 whitespace-nowrap hidden xl:table-cell">ช่องทางที่เลือก</th>
                        <th className="text-center p-3 whitespace-nowrap">ยินยอม</th>
                        <th className="text-left p-3 whitespace-nowrap hidden sm:table-cell">ลงทะเบียน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50 align-top">
                          <td className="p-3">
                            <div className="font-medium text-slate-800">{l.name}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{l.status}</span>
                              {l.contactRequested && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">📞 ขอให้ติดต่อกลับ</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-600">
                            {l.phone ? <a href={`tel:${l.phone}`} className="block hover:text-sky-600">📱 {l.phone}</a> : <span className="text-slate-400">ไม่มีเบอร์</span>}
                            {l.lineId && <div className="text-xs text-slate-500 mt-0.5">LINE: {l.lineId}</div>}
                          </td>
                          <td className="p-3 text-slate-600 hidden md:table-cell">
                            <div>{l.ageRange || '—'}</div>
                            <div className="text-xs text-slate-400">{l.occupation || ''}</div>
                          </td>
                          <td className="p-3 hidden lg:table-cell max-w-[260px]">
                            <div className="flex flex-wrap gap-1">
                              {l.interests.length ? l.interests.map((it) => (
                                <span key={it} className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">{it}</span>
                              )) : <span className="text-xs text-slate-400">—</span>}
                            </div>
                            {(l.insuranceInterest || l.financialGoal) && (
                              <div className="text-[11px] text-slate-500 mt-1">
                                {l.insuranceInterest && <>สนใจ: {l.insuranceInterest}</>}
                                {l.insuranceInterest && l.financialGoal && ' · '}
                                {l.financialGoal && <>เป้าหมาย: {l.financialGoal}</>}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="font-semibold text-slate-700">{l.score}</div>
                            <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${LEVEL_BADGE[l.level]}`}>
                              {LEVEL_LABEL[l.level]}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 text-xs hidden xl:table-cell">{channelsOf(l)}</td>
                          <td className="p-3 text-center">
                            {l.consent ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">ยินยอม</span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">ไม่ยินยอม</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 text-xs whitespace-nowrap hidden sm:table-cell">{timeAgo(l.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 mt-3">
              ดึงจาก <code className="font-mono">GET /api/dashboard/leads</code> · ระดับความสนใจคำนวณตามสเปกส่วน 5
              (70+ = HIGH INTENT ควรให้ตัวแทนติดต่อเอง · ห้าม AI ปิดการขายเอง)
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'red' | 'amber' | 'sky' | 'emerald' }) {
  const tones: Record<string, string> = {
    slate: 'text-slate-700',
    red: 'text-red-600',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
  };
  return (
    <div className="card p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${tones[tone]}`}>{value}</div>
    </div>
  );
}
