'use client';

import { useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// AutoTranslate — ทำให้ "ทุกหน้า" ของระบบเป็นสากลโดยไม่ต้องแก้ทีละหน้า
//
// หลักการ:
//   • อ่านภาษาที่ผู้ใช้เลือกจากเมนูภาษา (localStorage 'app-lang' + event 'app-lang-change')
//   • โหลดพจนานุกรมไทย→อังกฤษ (/i18n/th-en.json) แล้วสลับข้อความไทยที่ "เรนเดอร์จริง" ทั้งหน้า
//     (text node + placeholder/title/aria-label/alt) เป็นอังกฤษ
//   • เลือก "ไทย" → คืนข้อความเดิมทุกจุด (ไม่มีการแก้ไฟล์ต้นฉบับ)
//   • ภาษาอื่น ๆ (ไม่ใช่ไทย) → ใช้อังกฤษเป็นสะพานสากล เหมือนคอมโพเนนต์อื่นของระบบ
//   • ข้อความที่เพิ่มมาทีหลัง (React render ใหม่/โหลดข้อมูล) ถูกแปลด้วย MutationObserver
//
// ข้อจำกัดที่ตั้งใจ: ไม่แตะค่าใน <input>/<textarea> (ค่าที่ผู้ใช้พิมพ์) และไม่แตะ <script>/<style>/<code>
// ─────────────────────────────────────────────────────────────────────────────

type Dict = Record<string, string>;
const SRC = '/i18n/th-en.json';
const THAI = /[\u0E00-\u0E7F]/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

let dict: Dict | null = null;
let loading: Promise<Dict> | null = null;
let applying = false;

async function loadDict(): Promise<Dict> {
  if (dict) return dict;
  if (!loading) {
    loading = fetch(SRC, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: Dict) => (dict = j || {}))
      .catch(() => (dict = {}));
  }
  const d = await loading;
  return d || {};
}

/** เก็บข้อความเดิมไว้คืนค่าเมื่อสลับกลับเป็นไทย */
const origText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();

function translateTextNode(node: Text, d: Dict) {
  const raw = node.nodeValue;
  if (!raw || !THAI.test(raw)) return;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const hit = d[trimmed];
  if (!hit) return;
  if (!origText.has(node)) origText.set(node, raw);
  const next = raw.replace(trimmed, hit);
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateElementAttrs(el: Element, d: Dict) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !THAI.test(v)) continue;
    const trimmed = v.replace(/\s+/g, ' ').trim();
    const hit = d[trimmed];
    if (!hit) continue;
    const store = origAttr.get(el) || {};
    if (store[a] === undefined) store[a] = v;
    origAttr.set(el, store);
    const next = v.replace(trimmed, hit);
    if (el.getAttribute(a) !== next) el.setAttribute(a, next);
  }
}

function walkAndApply(d: Dict) {
  const root = document.body;
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.nextNode();
  const els: Element[] = [];
  const texts: Text[] = [];
  while (n) {
    if (n.nodeType === 3) {
      const parent = (n as Text).parentElement;
      if (parent && !SKIP_TAGS.has(parent.tagName)) texts.push(n as Text);
    } else {
      const el = n as Element;
      if (!SKIP_TAGS.has(el.tagName)) els.push(el);
    }
    n = walker.nextNode();
  }
  texts.forEach((t) => translateTextNode(t, d));
  els.forEach((e) => translateElementAttrs(e, d));
}

function restoreAll() {
  const root = document.body;
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n.nodeType === 3) {
      const t = n as Text;
      const orig = origText.get(t);
      if (orig !== undefined && t.nodeValue !== orig) t.nodeValue = orig;
    } else {
      const el = n as Element;
      const store = origAttr.get(el);
      if (store) for (const [a, v] of Object.entries(store)) if (el.getAttribute(a) !== v) el.setAttribute(a, v);
    }
    n = walker.nextNode();
  }
}

function lang(): string {
  if (typeof window === 'undefined') return 'th';
  return localStorage.getItem('app-lang') || 'th';
}

async function apply(l: string) {
  if (applying) return;
  applying = true;
  try {
    if (l === 'th') {
      restoreAll();
    } else {
      const d = await loadDict();
      if (Object.keys(d).length) {
        restoreAll();          // กันการแปลซ้อน
        walkAndApply(d);
      }
    }
  } finally {
    applying = false;
  }
}

export default function AutoTranslate() {
  useEffect(() => {
    let obs: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const start = async () => {
      const l = lang();
      await apply(l);
      // ข้อความใหม่ที่โหลดมาทีหลัง (ข้อมูลจาก API/เรนเดอร์ใหม่) — แปลตามด้วย
      obs = new MutationObserver(() => {
        if (applying || lang() === 'th') return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          const d = await loadDict();
          if (!Object.keys(d).length) return;
          applying = true;
          try { walkAndApply(d); } finally { applying = false; }
        }, 350);
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    };

    const onLang = (e: Event) => {
      const l = (e as CustomEvent).detail || lang();
      apply(l);
    };

    void start();
    window.addEventListener('app-lang-change', onLang);
    // เผื่อหน้าอื่นเปลี่ยนภาษาผ่าน localStorage โดยไม่ยิง event
    window.addEventListener('storage', () => apply(lang()));
    return () => {
      window.removeEventListener('app-lang-change', onLang);
      if (obs) obs.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
