/*!
 * track.js — สคริปต์เก็บข้อมูลผู้เข้าชมแบบยินยอมก่อน (consent-gated)
 * โปรเจกต์: ai-insurance-network-tree
 * ------------------------------------------------------------------
 * กติกาที่บังคับ:
 *   ① จะเริ่มเก็บ (สร้าง visitor_id/session_id หรือยิง event) เฉพาะเมื่อผู้ใช้กด "ยินยอม" เท่านั้น
 *   ② ไม่มีถ้อยคำทำนอง "ผมรู้ว่าคุณกำลังดูอะไรอยู่" — ใช้ภาษาธรรมชาติ โปร่งใส เป็นมิตร
 *   ③ ยิง payload ไปที่ POST /api/track
 *      { visitor_id, session_id, event, page_url, referrer,
 *        utm_source, utm_medium, utm_campaign, device, browser, meta }
 *   ④ ถอนความยินยอมได้ทุกเมื่อผ่าน AIN_TRACK.revoke()
 *
 * วิธีใช้จาก React/คอมโพเนนต์:
 *   window.AIN_TRACK.track('button_click', { label: 'สมัคร' })
 *   window.AIN_TRACK.formOpen('lead_capture')
 *   window.AIN_TRACK.formSubmit('lead_capture')
 *   window.AIN_TRACK.buttonClick('สมัครตัวแทน')
 *   window.AIN_TRACK.grant() / window.AIN_TRACK.deny() / window.AIN_TRACK.revoke()
 *   window.addEventListener('ain:track-ready', function () { ... });
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/track';
  var VERSION = '1.0.0';

  // ── คีย์ที่เก็บฝั่งเบราว์เซอร์ ─────────────────────────────────────────────
  var KEY_VISITOR = 'ain_visitor_id';     // localStorage — ตัวตนผู้เข้าชม (เครื่องนี้)
  var KEY_CONSENT = 'ain_consent';        // localStorage — 'granted' | 'denied'
  var KEY_UTM = 'ain_utm';                // sessionStorage — แคมเปญที่พามา
  var KEY_SESSION = 'ain_session_id';     // sessionStorage — session ปัจจุบัน
  var KEY_SESSION_AT = 'ain_session_at';  // sessionStorage — เวลาล่าสุดที่ยัง active
  var SESSION_TIMEOUT = 30 * 60 * 1000;   // 30 นาที = หมด session

  var state = {
    enabled: false,      // เก็บข้อมูลได้หรือยัง (true เมื่อยินยอม)
    ready: false,        // เริ่มต้นระบบแล้ว
    visitor_id: '',
    session_id: '',
    utm: { source: '', medium: '', campaign: '' }
  };
  var seenFormOpen = {};   // กัน event form_open ซ้ำในฟอร์มเดียว
  var lastClick = { label: '', at: 0 };

  // ── storage helpers (กันพังในโหมด private / storage ถูกบล็อก) ─────────────
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { window.sessionStorage.removeItem(k); } catch (e) {} }

  function genId(prefix) {
    var id;
    try {
      if (window.crypto && window.crypto.randomUUID) id = window.crypto.randomUUID();
    } catch (e) { id = null; }
    if (!id) {
      id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    return (prefix || 'v') + '_' + id;
  }

  // ── ตรวจชนิดอุปกรณ์ / เบราว์เซอร์ (ไม่ระบุตัวบุคคล) ───────────────────────
  function deviceType() {
    try {
      var ua = navigator.userAgent || '';
      var w = window.innerWidth || 0;
      if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
      if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua) || w < 768) return 'mobile';
      return 'desktop';
    } catch (e) { return 'unknown'; }
  }

  function browserName() {
    try {
      var ua = navigator.userAgent || '';
      if (/Line\//i.test(ua)) return 'line';
      if (/Edg\//i.test(ua)) return 'edge';
      if (/OPR\/|Opera/i.test(ua)) return 'opera';
      if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
      if (/Chrome\//i.test(ua)) return 'chrome';
      if (/Firefox\//i.test(ua)) return 'firefox';
      if (/Safari\//i.test(ua)) return 'safari';
      return 'other';
    } catch (e) { return 'unknown'; }
  }

  // ── UTM — อ่านจาก URL แล้วจำไว้ใน session เพื่อให้ event ถัด ๆ ไปยังรู้ที่มา ─
  function readUtm() {
    var out = { source: '', medium: '', campaign: '' };
    try {
      var q = new URLSearchParams(window.location.search);
      out.source = (q.get('utm_source') || '').slice(0, 120);
      out.medium = (q.get('utm_medium') || '').slice(0, 120);
      out.campaign = (q.get('utm_campaign') || '').slice(0, 160);
      if (out.source || out.medium || out.campaign) {
        ssSet(KEY_UTM, JSON.stringify(out));
      } else {
        try {
          var saved = JSON.parse(ssGet(KEY_UTM) || 'null');
          if (saved && typeof saved === 'object') out = {
            source: saved.source || '', medium: saved.medium || '', campaign: saved.campaign || ''
          };
        } catch (e2) {}
      }
    } catch (e) {}
    return out;
  }

  // ── ส่ง event ไป /api/track ────────────────────────────────────────────────
  function buildPayload(event, meta) {
    var ev = String(event || '').slice(0, 64);
    var m = meta && typeof meta === 'object' ? meta : {};
    var pageUrl = (function () { try { return window.location.href; } catch (e) { return ''; } })();
    var referrer = (function () { try { return document.referrer || ''; } catch (e) { return ''; } })();
    var title = (function () { try { return document.title || ''; } catch (e) { return ''; } })();
    var path = (function () { try { return window.location.pathname; } catch (e) { return ''; } })();

    var payload = {
      // ── รูปแบบกลางตามสเปก (snake_case) ──────────────────────────────────
      visitor_id: state.visitor_id,
      session_id: state.session_id,
      event: ev,
      page_url: pageUrl,
      referrer: referrer,
      utm_source: state.utm.source,
      utm_medium: state.utm.medium,
      utm_campaign: state.utm.campaign,
      device: deviceType(),
      browser: browserName(),
      meta: m,
      // ── alias (camelCase) — /api/track อ่านชื่อเหล่านี้ · ส่งทั้งสองแบบเพื่อความเข้ากันได้ ──
      visitorId: state.visitor_id,
      sessionId: state.session_id,
      type: ev,
      pageUrl: pageUrl,
      pageTitle: title,
      path: path,
      // บรรทัดนี้ส่งได้ก็ต่อเมื่อ send() ผ่านด่านความยินยอมแล้วเท่านั้น (state.enabled)
      analyticsConsent: true
    };

    // event วิดีโอ: ส่ง video_id / watch_pct ระดับบนสุดที่ route ใช้จริงด้วย (นอกเหนือจากใน meta)
    if (ev.indexOf('video') === 0) {
      if (m.video_id !== undefined) payload.video_id = m.video_id;
      if (m.watch_pct !== undefined) payload.watch_pct = m.watch_pct;
    }
    return payload;
  }

  function send(event, meta) {
    // ด่านสำคัญ: ห้ามส่งถ้ายังไม่ยินยอม
    if (!state.enabled || !state.visitor_id) return false;
    var body;
    try { body = JSON.stringify(buildPayload(event, meta)); } catch (e) { return false; }
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return true;
      }
    } catch (e) {}
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  // ── ผูกการติดตามกับ <video> (video_start / 25 / 50 / 75 / complete) ────────
  function bindVideos() {
    var vids;
    try { vids = document.querySelectorAll('video'); } catch (e) { return; }
    Array.prototype.forEach.call(vids, function (v) {
      if (v.__ain_bound) return;
      v.__ain_bound = true;
      var videoId = v.getAttribute('data-video-id') || v.getAttribute('data-video') || v.currentSrc || v.src || 'unknown';
      var fired = { start: false, s: {}, complete: false };

      v.addEventListener('play', function () {
        if (fired.start) return;
        fired.start = true;
        send('video_start', { video_id: videoId });
      });

      v.addEventListener('timeupdate', function () {
        var d = v.duration;
        if (!d || !isFinite(d) || d <= 0) return;
        var pct = (v.currentTime / d) * 100;
        [25, 50, 75].forEach(function (mark) {
          if (pct >= mark && !fired.s[mark]) {
            fired.s[mark] = true;
            send('video_' + mark, { video_id: videoId, watch_pct: Math.round(pct) });
          }
        });
        if (pct >= 95 && !fired.complete) {
          fired.complete = true;
          send('video_complete', { video_id: videoId, watch_pct: Math.round(pct) });
        }
      });
    });
  }

  // ── button_click — ติดตามปุ่ม/ลิงก์ที่ผู้ใช้กด (dedupe ป้ายซ้ำใน 800ms) ─────
  function bindClicks() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      if (el && el.closest) el = el.closest('[data-ain-track], button, a');
      if (!el) return;
      var label = (el.getAttribute('data-ain-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      var now = Date.now();
      if (label && label === lastClick.label && now - lastClick.at < 800) return;
      lastClick = { label: label, at: now };
      send('button_click', {
        label: label,
        tag: (el.tagName || '').toLowerCase(),
        id: el.id || '',
        href: el.getAttribute ? (el.getAttribute('href') || '') : ''
      });
    }, true);
  }

  // ── form_open (โฟกัสช่องแรกของฟอร์ม) + form_submit ────────────────────────
  function formKey(f) {
    return (f && (f.id || f.getAttribute('name') || f.getAttribute('data-form'))) || 'form';
  }

  function bindForms() {
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return;
      var f = t.closest ? t.closest('form') : null;
      var key = f ? formKey(f) : ('field:' + (t.name || t.id || t.type || 'input'));
      if (seenFormOpen[key]) return;
      seenFormOpen[key] = true;
      send('form_open', { form: key });
    }, true);

    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f) return;
      send('form_submit', { form: formKey(f) });
    }, true);
  }

  // ── กล่องขอความยินยอม (แสดงเฉพาะครั้งแรกที่ยังไม่ตัดสินใจ) ─────────────────
  function injectStyles() {
    if (document.getElementById('ain-consent-style')) return;
    var css = document.createElement('style');
    css.id = 'ain-consent-style';
    css.textContent = [
      '#ain-consent-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;',
      'background:#ffffff;border-top:1px solid #dbeafe;box-shadow:0 -4px 20px rgba(15,23,42,.12);',
      'padding:14px 16px calc(14px + env(safe-area-inset-bottom));',
      "font-family:'Sarabun','Noto Sans Thai',sans-serif;color:#334155;}",
      '#ain-consent-bar .ain-inner{max-width:920px;margin:0 auto;}',
      '#ain-consent-bar h3{margin:0 0 6px;font-size:15px;font-weight:700;color:#1e293b;}',
      '#ain-consent-bar p{margin:0;font-size:12.5px;line-height:1.5;color:#475569;}',
      '#ain-consent-bar a{color:#0284c7;text-decoration:underline;}',
      '#ain-consent-bar .ain-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}',
      '#ain-consent-bar button{flex:1 1 auto;min-height:44px;border-radius:12px;font-size:14px;',
      'font-weight:600;cursor:pointer;border:1px solid transparent;padding:0 16px;}',
      '#ain-consent-accept{background:#0284c7;color:#fff;}',
      '#ain-consent-accept:hover{background:#0369a1;}',
      '#ain-consent-deny{background:#fff;color:#475569;border-color:#cbd5e1;}',
      '#ain-consent-deny:hover{background:#f1f5f9;}'
    ].join('');
    (document.head || document.documentElement).appendChild(css);
  }

  function showBanner() {
    if (document.getElementById('ain-consent-bar')) return;
    injectStyles();
    var bar = document.createElement('div');
    bar.id = 'ain-consent-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'ขอความยินยอมในการเก็บข้อมูลการใช้งาน');
    bar.innerHTML =
      '<div class="ain-inner">' +
        '<h3>ความเป็นส่วนตัวของคุณ</h3>' +
        '<p>เราเก็บข้อมูลการใช้งานเว็บ (เช่น หน้าที่เปิด คลิปที่รับชม และช่องทางที่คุณสนใจ) ' +
        'เพื่อนำไปปรับปรุงเนื้อหาให้ตรงกับความต้องการของคุณ ' +
        'โดยระบบจะเริ่มเก็บก็ต่อเมื่อคุณกดปุ่ม “ยินยอมให้เก็บข้อมูล” เท่านั้น ' +
        'และคุณถอนความยินยอมได้ทุกเมื่อ ไม่กระทบการใช้งานเว็บ ' +
        '<a href="/privacy" target="_blank" rel="noopener">อ่านนโยบายความเป็นส่วนตัว</a></p>' +
        '<div class="ain-actions">' +
          '<button type="button" id="ain-consent-deny">ไม่ยินยอม</button>' +
          '<button type="button" id="ain-consent-accept">ยินยอมให้เก็บข้อมูล</button>' +
        '</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(bar);

    var accept = document.getElementById('ain-consent-accept');
    var deny = document.getElementById('ain-consent-deny');
    if (accept) accept.addEventListener('click', function () { setConsent('granted'); });
    if (deny) deny.addEventListener('click', function () { setConsent('denied'); });
  }

  function removeBanner() {
    var bar = document.getElementById('ain-consent-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  // ── บันทึก/ถอนความยินยอม ──────────────────────────────────────────────────
  function setConsent(value) {
    if (value === 'granted') {
      lsSet(KEY_CONSENT, 'granted');
      removeBanner();
      init();
      dispatch('ain:consent-changed', { consent: 'granted' });
    } else {
      lsSet(KEY_CONSENT, 'denied');
      removeBanner();
      dispatch('ain:consent-changed', { consent: 'denied' });
    }
  }

  function revokeConsent() {
    // หยุดเก็บทันที + ล้างตัวตนที่เคยเก็บไว้ในเครื่องนี้
    state.enabled = false;
    state.ready = false;
    state.visitor_id = '';
    state.session_id = '';
    lsDel(KEY_VISITOR);
    lsSet(KEY_CONSENT, 'denied');
    ssDel(KEY_SESSION);
    ssDel(KEY_SESSION_AT);
    ssDel(KEY_UTM);
    dispatch('ain:consent-changed', { consent: 'revoked' });
    return true;
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {}
  }

  // ── เริ่มต้นระบบ (เรียกเฉพาะเมื่อยินยอมแล้ว) ──────────────────────────────
  function init() {
    if (state.ready) return;
    if (lsGet(KEY_CONSENT) !== 'granted') return;

    state.enabled = true;
    state.ready = true;

    // visitor_id: มีอยู่เดิม = ผู้เข้าชมที่กลับมา
    var existing = lsGet(KEY_VISITOR);
    var isReturning = !!existing;
    state.visitor_id = existing || genId('v');
    lsSet(KEY_VISITOR, state.visitor_id);

    // session_id: หมดอายุเมื่อเงียบเกิน 30 นาที
    var now = Date.now();
    var lastAt = Number(ssGet(KEY_SESSION_AT) || 0);
    var newSession = !ssGet(KEY_SESSION) || !lastAt || (now - lastAt) > SESSION_TIMEOUT;
    if (newSession) {
      state.session_id = genId('s');
      ssSet(KEY_SESSION, state.session_id);
    } else {
      state.session_id = ssGet(KEY_SESSION) || genId('s');
    }
    ssSet(KEY_SESSION_AT, String(now));

    state.utm = readUtm();

    if (newSession) send('session_start', {});
    send('page_view', { title: (function () { try { return document.title; } catch (e) { return ''; } })(), path: (function () { try { return window.location.pathname; } catch (e) { return ''; } })() });
    if (newSession && isReturning) send('return_visit', { visits: 'returning' });

    bindVideos();
    bindClicks();
    bindForms();

    dispatch('ain:track-ready', { visitor_id: state.visitor_id, session_id: state.session_id });
  }

  // ── API สาธารณะสำหรับReact ─────────────────────────────────────────────────
  window.AIN_TRACK = {
    version: VERSION,
    isEnabled: function () { return state.enabled; },
    hasConsent: function () { return lsGet(KEY_CONSENT) === 'granted'; },
    getIds: function () { return { visitor_id: state.visitor_id, session_id: state.session_id }; },
    track: function (event, meta) { return send(event, meta || {}); },
    formOpen: function (name) {
      var key = name || 'custom';
      if (seenFormOpen[key]) return false;
      seenFormOpen[key] = true;
      return send('form_open', { form: key });
    },
    formSubmit: function (name) { return send('form_submit', { form: name || 'custom' }); },
    buttonClick: function (label, meta) {
      var m = meta && typeof meta === 'object' ? meta : {};
      m.label = String(label || '').slice(0, 80);
      return send('button_click', m);
    },
    videoStart: function (videoId) { return send('video_start', { video_id: videoId || 'unknown' }); },
    videoProgress: function (videoId, pct) {
      var p = Number(pct) || 0;
      return send('video_' + (p >= 75 ? 75 : p >= 50 ? 50 : 25), { video_id: videoId || 'unknown', watch_pct: Math.round(p) });
    },
    videoComplete: function (videoId) { return send('video_complete', { video_id: videoId || 'unknown' }); },
    grant: function () { setConsent('granted'); },
    deny: function () { setConsent('denied'); },
    revoke: function () { return revokeConsent(); },
    refreshVideos: function () { bindVideos(); }
  };

  // ── บูต: อ่านความยินยอมเดิมก่อน ถ้ายังไม่ตัดสินใจจึงแสดงกล่องขออนุญาต ───────
  function boot() {
    var consent = lsGet(KEY_CONSENT);
    if (consent === 'granted') {
      init();
    } else if (consent !== 'denied') {
      showBanner();
    }
    // consent === 'denied' → เงียบ ไม่เก็บอะไรเลย
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
