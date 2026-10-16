'use client';
// /expand-team — "ช่องขยายทีมงาน"
// ศูนย์รวมช่องทางและเครื่องมือสำหรับขยายทีมของตัวแทนไว้ในหน้าเดียว:
//   ลิงก์/รหัสแนะนำของตัวเอง + QR → ช่องทาง 6 ช่อง (แนะนำโดยตรง, LINE, Facebook, TikTok, งานสัมมนา, สื่อออฟไลน์)
//   → ข้อความชวนสำเร็จรูป (คัดลอก/แชร์ทันที) → แผนลงมือ 7 วัน → ทางลัดไปเครื่องมือที่ใช้บ่อย
// ข้อมูลลิงก์/รหัสมาจาก GET /api/referral (ตัวเดียวกับหน้า /referral — ไม่มีตารางใหม่)
// ข้อความสองภาษา ผูกกับปุ่มเลือกภาษาของแอปผ่าน useT().lang (คีย์อยู่ใน navCatalog: nav_expand_team)
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AdsManager from '@/components/AdsManager';
import TikTokAdsResults from '@/components/TikTokAdsResults';
import { useT } from '@/i18n';
import LineOaCard from '@/components/LineOaCard';

type Any = Record<string, any>;

const STR: Record<'th' | 'en', Any> = {
  th: {
    title: 'ช่องขยายทีมงาน',
    sub: 'รวมช่องทางและเครื่องมือขยายทีมของคุณไว้ในที่เดียว — เลือกช่องที่ถนัด ลงมือวันนี้',
    rankChip: 'ตำแหน่งปัจจุบัน',
    memberChip: 'รหัสสมาชิก',
    invitedChip: 'สมาชิกที่คุณแนะนำแล้ว',
    people: 'คน',
    myLink: 'ลิงก์รับสมัครของฉัน',
    myLinkHint: 'ลิงก์นี้ผูกกับรหัสแนะนำของคุณ — ผู้ที่กรอกผ่านลิงก์นี้จะอยู่ใต้สายงานของคุณ',
    copyLink: 'คัดลอกลิงก์',
    copied: 'คัดลอกแล้ว ✓',
    openLink: 'เปิดลิงก์สมัคร',
    qr: 'QR ลิงก์รับสมัคร (แตะเพื่อขยาย)',
    qrHint: 'ใช้ตอนนัดคุย งานสัมมนา หรือพิมพ์ลงสื่อออฟไลน์',
    channels: 'ช่องทางขยายทีม',
    channelsSub: '6 ช่องที่ใช้ได้จริง — เริ่มจากช่องที่คุณถนัดที่สุด',
    steps: 'ลงมืออย่างไร',
    shareLine: 'แชร์ไป LINE',
    shareFb: 'แชร์ไป Facebook',
    copyShort: 'คัดลอกข้อความสั้น',
    copyLong: 'คัดลอกข้อความยาว',
    copyCaption: 'คัดลอกแคปชัน',
    copyDone: 'คัดลอกแล้ว ✓',
    openQr: 'เปิด QR ให้สแกน',
    goProspects: 'บันทึกผู้มุ่งหวัง',
    goRecruit: 'เปิดลิงก์รับสมัคร',
    templates: 'ข้อความชวนสำเร็จรูป',
    templatesSub: 'คัดลอกไปใช้ได้เลย — ปรับให้เป็นน้ำเสียงของคุณเองก่อนส่งทุกครั้ง',
    plan: 'แผนลงมือ 7 วัน',
    planSub: 'แผนเริ่มต้นสำหรับคนที่เพิ่งเริ่มขยายทีม',
    tools: 'ทางลัดไปเครื่องมือที่ใช้บ่อย',
    toolsSub: 'ทุกอย่างที่ต้องใช้ระหว่างชวน ขั้นตอนรับสมัคร และการวางตำแหน่งในผัง',
    note: 'ทุกช่องทางเป็นแนวทางปฏิบัติ ไม่ใช่การรับประกันรายได้หรือผลลัพธ์ทางธุรกิจ · ผลลัพธ์ขึ้นอยู่กับความสม่ำเสมอ จำนวนคนที่คุณคุยจริง และการปฏิบัติตามเกณฑ์ของระบบ · ห้ามใช้ข้อความที่ทำให้เข้าใจผิดหรือสัญญาผลตอบแทนกับผู้สนใจ',
    noteShort: 'แนวทางปฏิบัติ ไม่ใช่การรับประกันรายได้/ผลลัพธ์',
    loadNote: 'ยังไม่ดึงข้อมูลรหัสแนะนำได้ — กด ↻ อัปเดตเดี๋ยวนี้',
    refresh: '↻ อัปเดตเดี๋ยวนี้',
    msgShort: 'สวัสดีครับ/ค่ะ 😊 ตอนนี้ผม/ฉันทำงานเป็นตัวแทนประกันชีวิตและวางแผนการเงินให้ลูกค้าครับ กำลังมองหาคนที่สนใจรายได้เสริมหรืออยากเปลี่ยนสายงานจริงจัง ถ้าสนใจดูรายละเอียดเบื้องต้นก่อนได้เลย (กรอก 3–5 นาที) → {link}',
    msgLong: 'สวัสดีครับ/ค่ะ 🙏 ผม/ฉันทำงานเป็นตัวแทนประกันชีวิตและที่ปรึกษาการวางแผนการเงิน\n\nกำลังขยายทีมและมองหาคนที่อยากมีรายได้เสริม หรืออยากเปลี่ยนสายงานมาเริ่มจากศูนย์ก็ได้ เพราะมีระบบอบรมและพี่เลี้ยงดูแลตั้งแต่ขั้นสมัครจนถึงสอบใบอนุญาต\n\nถ้าสนใจ ลองดูรายละเอียดเบื้องต้นจากลิงก์นี้ก่อนได้เลย (กรอก 3–5 นาที ไม่ผูกมัด) → {link}\n\nถ้ามีคำถามทักมาคุยกันได้เลยครับ/ค่ะ 😊',
    msgCaption: 'เริ่มจาก 0 ก็มีเส้นทางให้เดิน #ตัวแทนประกันชีวิต #อาชีพเสริม #วางแผนการเงิน\nดูรายละเอียดในไบโอ 👉',
    ch1t: 'ผู้แนะนำโดยตรง (คนรู้จัก/ลูกค้าเดิม)',
    ch1d: 'เริ่มจากคนที่รู้จักคุณอยู่แล้ว — เพื่อน ญาติ ลูกค้าเดิม เพื่อนร่วมงาน',
    ch1s: ['เขียนรายชื่อ 20 คนแรกใน 1 วัน (ยังไม่ต้องคัดคุณสมบัติ)', 'ส่งข้อความหรือโทรนัดคุย 15 นาที แบบเป็นกันเอง', 'คุยเสร็จบันทึกผู้มุ่งหวังในระบบทันที (กันลืมติดตาม)'],
    ch2t: 'LINE',
    ch2d: 'ช่องทางตอบกลับเร็วที่สุด — ส่งลิงก์รับสมัครพร้อมข้อความสั้น',
    ch2s: ['กดปุ่ม «แชร์ไป LINE» เพื่อส่งลิงก์พร้อมข้อความ', 'ตอบกลับทุกคนภายใน 24 ชม. แล้วชวนนัดคุย', 'ปิดท้ายด้วยการนัดวันและเวลาชัดเจน ไม่ปล่อยจบแบบไม่มีนัด'],
    ch3t: 'Facebook',
    ch3d: 'โพสต์หรือส่งลิงก์ให้เพื่อนในรายชื่อและกลุ่มที่คุณอยู่',
    ch3s: ['แชร์โพสต์พร้อมข้อความยาวที่ให้ข้อมูลครบ', 'ตอบคอมเมนต์ทุกครั้ง แล้วชวนคุยต่อในข้อความส่วนตัว', 'โพสต์สัปดาห์ละ 2–3 ครั้ง ไม่ยิงรวดเดียวหลายกลุ่ม'],
    ch4t: 'TikTok',
    ch4d: 'คลิปสั้น 15–30 วินาที เล่าประสบการณ์ทำงานและสิ่งที่ได้เรียนรู้',
    ch4s: ['ถ่ายวันละ 1 คลิป เรื่องสั้นเรื่องเดียว', 'วางลิงก์รับสมัครไว้ในไบโอ แล้วชี้ให้ดูท้ายคลิป', 'ตอบทุกคอมเมนต์ แล้วชวนคุยต่อในข้อความ'],
    ch5t: 'งานสัมมนา / อีเวนต์',
    ch5d: 'นัดคุยตัวต่อตัว หรือจัดรอบนำเสนอสั้นให้กลุ่มเล็ก',
    ch5s: ['เตรียม QR ลิงก์รับสมัครไว้ในมือถือให้พร้อม', 'ให้ผู้สนใจสแกนแล้วกรอกเอง ณ จุดนั้นเลย', 'นัดติดตามผลภายใน 48 ชม. ทุกครั้ง'],
    ch6t: 'สื่อออฟไลน์ / ป้าย QR',
    ch6d: 'นามบัตร แผ่นพับ ป้าย หรือสแตนดีที่มี QR ลิงก์รับสมัคร',
    ch6s: ['พิมพ์ QR คู่กับรหัสแนะนำของคุณลงนามบัตร', 'วางป้ายหรือสแตนดีในจุดที่มีคนผ่านบ่อย', 'เปิดโหมด QR ขยายจากมือถือเมื่อมีคนขอดู'],
    p1d: 'วัน 1–2',
    p1t: 'ทำรายชื่อ 20 คน',
    p1s: 'เพื่อน ญาติ ลูกค้าเดิม เพื่อนร่วมงาน — เขียนไว้ก่อน ยังไม่ต้องคัด',
    p2d: 'วัน 3–4',
    p2t: 'ส่งข้อความและนัดคุย',
    p2s: 'ส่งข้อความสั้นหรือโพสต์ พร้อมปิดท้ายด้วยการนัดวันและเวลา',
    p3d: 'วัน 5–6',
    p3t: 'คุยตัวต่อตัว 3–5 คน',
    p3s: 'ให้กรอกใบสมัครผ่านลิงก์ของคุณ แล้วบันทึกผู้มุ่งหวังในระบบ',
    p4d: 'วัน 7',
    p4t: 'ติดตามและวางแผนสัปดาห์ถัดไป',
    p4s: 'ติดตามทุกคนที่ยังไม่ตอบ + ตั้งเป้าจำนวนคนคุยของสัปดาห์หน้า',
    t1label: 'บันทึกผู้มุ่งหวังในระบบ',
    t2label: 'ลิงก์รับสมัครตัวแทน (ส่งให้ผู้สนใจกรอกเอง)',
    t3label: 'ใบสมัคร 4 ขั้นตอน (ขั้นตอนรับสมัครผู้มุ่งหวัง)',
    t4label: 'รหัสแนะนำ + QR เต็มหน้า',
    t5label: 'ตัวอย่างเครือข่าย',
    t6label: 'หลักเกณฑ์ 1 แตก 5',
    t7label: 'ผังทีม 1:5 ของฉัน',
  },
  en: {
    title: 'Team growth channels',
    sub: 'Every channel and tool for growing your team in one page — pick the one you are best at and start today',
    rankChip: 'Current rank',
    memberChip: 'Member code',
    invitedChip: 'Members you referred',
    people: 'people',
    myLink: 'My recruitment link',
    myLinkHint: 'This link carries your referral code — anyone applying through it stays in your downline',
    copyLink: 'Copy link',
    copied: 'Copied ✓',
    openLink: 'Open the form',
    qr: 'QR of my recruitment link (tap to enlarge)',
    qrHint: 'Use it in one-to-one meetings, seminars, or printed materials',
    channels: 'Growth channels',
    channelsSub: 'Six channels that actually work — start with the one you are best at',
    steps: 'How to do it',
    shareLine: 'Share to LINE',
    shareFb: 'Share to Facebook',
    copyShort: 'Copy short message',
    copyLong: 'Copy long message',
    copyCaption: 'Copy caption',
    copyDone: 'Copied ✓',
    openQr: 'Open QR to scan',
    goProspects: 'Save a prospect',
    goRecruit: 'Open recruitment link',
    templates: 'Ready-to-send messages',
    templatesSub: 'Copy and use — adjust them to your own voice before sending',
    plan: '7-day action plan',
    planSub: 'A starter plan for a brand-new team builder',
    tools: 'Shortcuts to the tools you use most',
    toolsSub: 'Everything you need while inviting, applying, and placing people in the tree',
    note: 'These channels are practical guidance, not a guarantee of income or business results · Results depend on consistency, how many people you actually talk to, and meeting the system criteria · Never promise returns or use misleading wording with a prospect',
    noteShort: 'Practical guidance — not a guarantee of income or results',
    loadNote: 'Could not load your referral codes — tap ↻ Refresh now',
    refresh: '↻ Refresh now',
    msgShort: 'Hi 😊 I work as a life-insurance agent and financial planner. I am looking for people who want extra income or a real career change. Here are the basic details (3–5 minutes to fill in) → {link}',
    msgLong: 'Hi 🙏 I work as a life-insurance agent and financial-planning advisor.\n\nI am growing my team and looking for people who want extra income or a career change — you can start from zero, because there is a training system and a mentor from application through licensing.\n\nIf you are interested, see the basic details here (3–5 minutes, no commitment) → {link}\n\nAny questions, just message me 😊',
    msgCaption: 'Starting from zero still has a path #lifeinsurance #sideincome #financialplanning\nDetails in bio 👉',
    ch1t: 'Direct referral (people you know)',
    ch1d: 'Start with people who already know you — friends, family, existing clients, colleagues',
    ch1s: ['Write the first 20 names in one day (do not pre-filter them)', 'Message or call for a relaxed 15-minute talk', 'Save each prospect in the system right after the talk'],
    ch2t: 'LINE',
    ch2d: 'The fastest-replying channel — send the link with a short message',
    ch2s: ['Tap “Share to LINE” to send the link with the message', 'Answer everyone within 24 hours, then ask for a talk', 'Always close with a concrete date and time'],
    ch3t: 'Facebook',
    ch3d: 'Post or send the link to your friends and the groups you are in',
    ch3s: ['Share the post with the longer informational message', 'Reply to every comment, then move to private chat', 'Post 2–3 times a week, not many groups at once'],
    ch4t: 'TikTok',
    ch4d: 'Short 15–30 second clips about the work and what you learned',
    ch4s: ['One short clip a day, one topic per clip', 'Put the recruitment link in your bio and point to it at the end', 'Reply to every comment, then chat privately'],
    ch5t: 'Seminars / events',
    ch5d: 'One-to-one meetings or a short presentation for a small group',
    ch5s: ['Keep the QR of your recruitment link ready on your phone', 'Let interested people scan and fill it in on the spot', 'Follow up within 48 hours, every time'],
    ch6t: 'Offline / QR materials',
    ch6d: 'Business cards, leaflets, posters or standees carrying your QR',
    ch6s: ['Print the QR with your referral code on your card', 'Place posters or standees where foot traffic is high', 'Open the enlarged QR on your phone when someone asks'],
    p1d: 'Day 1–2',
    p1t: 'Build a list of 20',
    p1s: 'Friends, family, clients, colleagues — write the names first, filter later',
    p2d: 'Day 3–4',
    p2t: 'Send messages and book talks',
    p2s: 'Send the short message or post, always ending with a proposed date',
    p3d: 'Day 5–6',
    p3t: 'Talk to 3–5 people',
    p3s: 'Have them fill the form through your link, then save the prospect',
    p4d: 'Day 7',
    p4t: 'Follow up and plan next week',
    p4s: 'Follow up with everyone who went quiet + set next week’s talk target',
    t1label: 'Save a prospect in the system',
    t2label: 'Recruitment link (let prospects fill it themselves)',
    t3label: 'The 4-step application (prospect pipeline)',
    t4label: 'Referral code + QR (full page)',
    t5label: 'Network example',
    t6label: '1:5 build rules',
    t7label: 'My 1:5 team tree',
  },
};

export default function ExpandTeamPage() {
  const { lang } = useT();
  const x = STR[lang === 'en' ? 'en' : 'th'];

  const [data, setData] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [qrOpen, setQrOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/referral', { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (j?.ok) setData(j);
    } catch { /* เงียบไว้ — แสดงหมายเหตุให้กดอัปเดต */ }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const link: string = data?.referralLink || '';
  const qrSrc = (size: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(link)}`;
  const msgShort = String(x.msgShort).replace('{link}', link || '—');
  const msgLong = String(x.msgLong).replace('{link}', link || '—');

  function copy(text: string, key: string) {
    try { navigator.clipboard.writeText(text); } catch { /* clipboard ถูกบล็อก — เจ้าของคัดลอกจากช่องลิงก์ได้ */ }
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }
  const label = (key: string, fallback: string) => (copied === key ? x.copied : fallback);

  const channels: Any[] = [
    {
      icon: '🤝', title: x.ch1t, desc: x.ch1d, steps: x.ch1s,
      actions: [
        { kind: 'copy', key: 'ch1', label: label('ch1', x.copyShort), text: msgShort },
        { kind: 'link', href: '/prospects', label: x.goProspects },
      ],
    },
    {
      icon: '💬', title: x.ch2t, desc: x.ch2d, steps: x.ch2s,
      actions: [
        { kind: 'share', href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(link)}`, label: x.shareLine, accent: true },
        { kind: 'copy', key: 'ch2', label: label('ch2', x.copyShort), text: msgShort },
      ],
    },
    {
      icon: '📘', title: x.ch3t, desc: x.ch3d, steps: x.ch3s,
      actions: [
        { kind: 'share', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, label: x.shareFb, accent: true },
        { kind: 'copy', key: 'ch3', label: label('ch3', x.copyLong), text: msgLong },
      ],
    },
    {
      icon: '🎵', title: x.ch4t, desc: x.ch4d, steps: x.ch4s,
      actions: [
        { kind: 'copy', key: 'ch4', label: label('ch4', x.copyCaption), text: String(x.msgCaption) },
        { kind: 'link', href: '/recruit', label: x.goRecruit },
      ],
    },
    {
      icon: '🎤', title: x.ch5t, desc: x.ch5d, steps: x.ch5s,
      actions: [{ kind: 'qr', label: x.openQr }],
    },
    {
      icon: '🖨️', title: x.ch6t, desc: x.ch6d, steps: x.ch6s,
      actions: [{ kind: 'qr', label: x.openQr }, { kind: 'link', href: '/recruit', label: x.goRecruit }],
    },
  ];

  const plan: Any[] = [
    { when: x.p1d, title: x.p1t, sub: x.p1s },
    { when: x.p2d, title: x.p2t, sub: x.p2s },
    { when: x.p3d, title: x.p3t, sub: x.p3s },
    { when: x.p4d, title: x.p4t, sub: x.p4s },
  ];

  const tools: Any[] = [
    { href: '/prospects', label: x.t1label, icon: '◎' },
    { href: '/recruit', label: x.t2label, icon: '🤝' },
    { href: '/recruit/pipeline', label: x.t3label, icon: '🧭' },
    { href: '/referral', label: x.t4label, icon: '✉' },
    { href: '/network-example', label: x.t5label, icon: '👥' },
    { href: '/network/1x5-rules', label: x.t6label, icon: '📋' },
    { href: '/tree', label: x.t7label, icon: '⁂' },
  ];

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 pb-32 space-y-4 w-full min-w-0">
          {/* ── หัวเรื่อง + สถานะของฉัน ─────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-navy">📣 {x.title}</h1>
            {data?.rankName && (
              <span className="px-3 py-1 rounded-full bg-[#eff6ff] border border-[#dbeafe] text-sky-700 text-xs font-semibold">
                {x.rankChip}: {data.rankName}
              </span>
            )}
            {data?.memberCode && (
              <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold font-mono">
                {x.memberChip}: {data.memberCode}
              </span>
            )}
            {data && (
              <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                {x.invitedChip}: {data.totalSponsored || 0} {x.people}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="ml-auto text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? '…' : x.refresh}
            </button>
          </div>
          <p className="text-sm text-slate-500">{x.sub}</p>

          {/* ── ลิงก์ + QR ของฉัน ───────────────────────────────────────── */}
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm text-navy">{x.myLink}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{x.myLinkHint}</p>
            </div>
            {loading && !link ? (
              <div className="text-xs text-slate-400">…</div>
            ) : !link ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">{x.loadNote}</div>
            ) : (
              <>
                <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
                  <div className="space-y-2 min-w-0">
                    <div className="text-sm font-mono break-all bg-white border border-[#dbeafe] p-2.5 rounded-xl">{link}</div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => copy(link, 'link')} className="text-xs px-3 py-1.5 rounded-full bg-navy text-white">
                        {label('link', x.copyLink)}
                      </button>
                      <a href={link} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white">
                        {x.openLink}
                      </a>
                      {data?.referralCode && (
                        <button onClick={() => copy(String(data.referralCode), 'ref')} className="text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white">
                          {label('ref', ` referralCode: ${data.referralCode} `.trim())}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <button onClick={() => setQrOpen(true)} className="block mx-auto focus:outline-none" aria-label={x.qr}>
                      <img src={qrSrc(512)} alt="QR" width={150} height={150} className="mx-auto border border-[#dbeafe] rounded-xl p-1.5 bg-white" />
                    </button>
                    <div className="text-[11px] text-slate-500 mt-1.5 max-w-[180px]">{x.qr}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 border-t border-[#dbeafe] pt-2">{x.qrHint}</div>
              </>
            )}
          </div>

          {/* ── LINE OA: ช่องทางให้ผู้มุ่งหวัง/สมาชิกคุยกับทีมงานผ่านมือถือ ── */}
          <LineOaCard />

          {/* ── 6 ช่องทางขยายทีม ────────────────────────────────────────── */}
          <div className="pt-1">
            <h2 className="text-lg font-bold text-navy">{x.channels}</h2>
            <p className="text-xs text-slate-500">{x.channelsSub}</p>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {channels.map((c) => (
              <div key={c.title} className="card p-4 flex flex-col gap-2.5">
                <div className="flex items-start gap-2.5">
                  <span className="text-2xl leading-none">{c.icon}</span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-navy">{c.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#dbeafe] p-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{x.steps}</div>
                  <ol className="mt-1.5 space-y-1.5">
                    {c.steps.map((s: string, i: number) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-600">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-[#eff6ff] text-sky-700 text-[10px] font-bold flex items-center justify-center mt-[1px]">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="mt-auto flex gap-2 flex-wrap">
                  {c.actions.map((a: Any, i: number) =>
                    a.kind === 'share' ? (
                      <a key={i} href={link ? a.href : '/referral'} target={link ? '_blank' : undefined} rel="noreferrer"
                         className="text-xs px-3 py-1.5 rounded-full bg-navy text-white">
                        {a.label}
                      </a>
                    ) : a.kind === 'copy' ? (
                      <button key={i} onClick={() => copy(a.text, a.key)} className="text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white text-slate-700">
                        {a.label}
                      </button>
                    ) : a.kind === 'qr' ? (
                      <button key={i} onClick={() => setQrOpen(true)} className="text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white text-slate-700">
                        {a.label}
                      </button>
                    ) : (
                      <a key={i} href={a.href} className="text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white text-sky-700">
                        {a.label}
                      </a>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── ข้อความชวนสำเร็จรูป ────────────────────────────────────── */}
          <div className="card p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-sm text-navy">{x.templates}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{x.templatesSub}</p>
            </div>
            {[
              { key: 'tpl1', label: x.copyShort, text: msgShort },
              { key: 'tpl2', label: x.copyLong, text: msgLong },
              { key: 'tpl3', label: x.copyCaption, text: String(x.msgCaption) },
            ].map((t) => (
              <div key={t.key} className="rounded-xl bg-white border border-[#dbeafe] p-3">
                <pre className="whitespace-pre-wrap text-xs text-slate-600 font-sans m-0">{t.text}</pre>
                <button onClick={() => copy(t.text, t.key)} className="mt-2 text-xs px-3 py-1.5 rounded-full border border-[#dbeafe] bg-white text-slate-700">
                  {label(t.key, t.label)}
                </button>
              </div>
            ))}
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">{x.noteShort}</div>
          </div>

          {/* ── แผนลงมือ 7 วัน ─────────────────────────────────────────── */}
          <div className="card p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-sm text-navy">{x.plan}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{x.planSub}</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              {plan.map((p) => (
                <div key={p.when} className="rounded-xl bg-white border border-[#dbeafe] p-3">
                  <div className="text-[11px] font-semibold text-sky-700">{p.when}</div>
                  <div className="text-sm font-semibold text-navy mt-1">{p.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{p.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── ทางลัดไปเครื่องมือ ─────────────────────────────────────── */}
          <div className="card p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-sm text-navy">{x.tools}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{x.toolsSub}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tools.map((t) => (
                <a key={t.href} href={t.href} className="text-xs px-3 py-2 rounded-full bg-white border border-[#dbeafe] text-slate-700 hover:bg-[#eff6ff]">
                  <span className="mr-1">{t.icon}</span>{t.label}
                </a>
              ))}
            </div>
          </div>

          {/* ── ข้อกำกับ (บังคับแสดง) ──────────────────────────────────── */}
          <div className="rounded-xl bg-slate-50 border border-[#dbeafe] p-3 text-[11px] text-slate-500">{x.note}</div>

          {/* ── ล่างสุด: AI Insurance Ads Manager (ศูนย์โฆษณา TikTok) ──────
              คำสั่งเจ้าของระบบ 12 ต.ค. 2026: "สร้างต่อลงมาไว้ล่างสุดในหน้านี้"
              แยกเป็นคอมโพเนนต์ @/components/AdsManager — อ่านข้อมูลจริงผ่าน GET /api/ads/overview
              และแสดงโหมด Demo ชัดเจนจนกว่าจะเชื่อมต่อ TikTok Marketing API (ห้ามยิงแอดจริง) */}
          <AdsManager />

          {/* ── ล่างสุดของหน้า: ผลการทำงานโฆษณา TikTok (จาก Ads Manager จริง) ──
              คำสั่งเจ้าของระบบ 13 ต.ค. 2026: "ให้แสดงผลการทำงานนี้ในหน้านี้ เอาไว้ล่างสุด"
              ข้อมูล/ภาพหลักฐานอยู่ใน src/lib/tiktokAdsSnapshot.json + public/ads/*.png
              ตัวเลขที่ยังไม่มีค่าจริงจะขึ้น "ยังไม่มีข้อมูล" (ไม่ใส่ 0 แทน) จนกว่าจะมีสิทธิ์ Marketing API */}
          <TikTokAdsResults />
        </main>
      </div>

      {qrOpen && link && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setQrOpen(false)}>
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={qrSrc(512)}
              alt="QR"
              width={340}
              height={340}
              className="rounded-xl border border-[#dbeafe] p-2"
              style={{ maxWidth: '70vw', maxHeight: '70vw', width: 'auto', height: 'auto' }}
            />
            <div className="mt-4 text-xs text-slate-500 break-all text-center max-w-[70vw]">{link}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => copy(link, 'qrlink')} className="px-4 py-2 rounded-full border border-[#dbeafe] text-sm text-slate-700">
                {label('qrlink', x.copyLink)}
              </button>
              <button onClick={() => setQrOpen(false)} className="px-5 py-2 rounded-full bg-navy text-white text-sm">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
