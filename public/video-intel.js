/*!
 * video-intel.js — SDK เก็บพฤติกรรมการรับชมวิดีโอ (consent-gated) สำหรับระบบ
 * AI Video Intelligence & Lead Monitoring
 * --------------------------------------------------------------------------
 * โปรเจกต์: ai-insurance-network-tree · หน้าเป้าหมาย: /financial-freedom
 *
 * กติกาที่บังคับ (ตามสเปกหมวด 14-16):
 *   ① เก็บเฉพาะเมื่อผู้ใช้ "ยินยอม" ชัดเจน — ไม่ยินยอม = ไม่ยิง event เลย
 *   ② ใช้ Anonymous Visitor ID (uuid สุ่มในเบราว์เซอร์) เท่านั้น
 *      ไม่เก็บชื่อ/อีเมล/อายุ/เพศ/รายได้/อาชีพ และไม่จดจำใบหน้าหรือเสียง
 *   ③ ห้ามทำให้วิดีโอกระตุก: ยิง event แบบ asynchronous (fetch keepalive)
 *      และใช้ navigator.sendBeacon() เฉพาะตอนผู้ใช้ออกจากหน้า
 *   ④ ถ้า API/n8n ล่ม วิดีโอต้องเล่นได้ตามปกติ — ทุกฟังก์ชันกลืน error เงียบ
 *
 * วิธีใช้:
 *   <script src="/video-intel.js"></script>
 *   AIN_VIDEO_INTEL.grant();                       // ผู้ใช้กดยินยอม
 *   AIN_VIDEO_INTEL.track('page_view');
 *   var t = AIN_VIDEO_INTEL.attach(videoEl, { video_id: 'financial-freedom-video', page: '/financial-freedom' });
 *   t.detach();                                    // ถอดการฟัง event
 *
 * event ที่ส่ง: page_view, page_exit, video_loaded, video_play, video_pause,
 *   video_resume, video_seek, video_ended, video_exit, video_progress (10/25/50/75/90/100),
 *   video_interaction (play/pause/resume/seek_forward/seek_backward/fullscreen/fullscreen_exit/
 *   mute/unmute/volume_change/replay)
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/video-intel/event';
  var VERSION = '1.0.0';
  var KEY_VISITOR = 'ain_vi_visitor_id';   // localStorage — uuid ของเบราว์เซอร์นี้
  var KEY_CONSENT = 'ain_vi_consent';      // localStorage — 'granted' | 'denied'
  var KEY_SESSION = 'ain_vi_session_id';   // sessionStorage — session ปัจจุบัน
  var KEY_SESSION_AT = 'ain_vi_session_at';
  var SESSION_TIMEOUT = 30 * 60 * 1000;    // ห่างเกิน 30 นาที = เริ่ม session ใหม่
  var MARKS = [10, 25, 50, 75, 90, 100];
  var HEARTBEAT_SEC = 60;                  // ส่ง video_progress ซ้ำทุก 60 วิ (ยังดูอยู่จริง)

  var state = {
    enabled: false,
    ready: false,
    visitor_id: '',
    session_id: '',
    page: '/financial-freedom',
    video_id: 'financial-freedom-video',
    video_duration: 0,
    current_time: 0,
    watch_duration: 0,
    first_play_at: null,
    last_activity_at: null,
    session_started_at: null,
    play_count: 0,
    sent: 0,
    failed: 0,
    last_error: null
  };

  // ── storage helpers (ทนโหมดส่วนตัว/storage ถูกบล็อก) ─────────────────────
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }

  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var b = new Uint8Array(16);
        window.crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = [];
        for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
        return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') +
          '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
      }
    } catch (e) {}
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }) + '-' + Date.now().toString(16);
  }

  function device() {
    var w = window.innerWidth || 0;
    if (/iPad|Tablet/i.test(navigator.userAgent)) return 'tablet';
    if (w && w < 768) return 'mobile';
    return 'desktop';
  }
  function browser() {
    var ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'unknown';
  }
  function language() { return (navigator.language || 'th').slice(0, 12); }
  function ref() {
    try {
      if (!document.referrer) return '';
      var u = new URL(document.referrer);
      return u.hostname === window.location.hostname ? '' : u.hostname;
    } catch (e) { return ''; }
  }

  function ensureIds() {
    if (!state.visitor_id) {
      var v = lsGet(KEY_VISITOR);
      state.visitor_id = v || uuid();
      if (!v) lsSet(KEY_VISITOR, state.visitor_id);
    }
    var at = Number(ssGet(KEY_SESSION_AT) || 0);
    var sid = ssGet(KEY_SESSION);
    if (!sid || !at || Date.now() - at > SESSION_TIMEOUT) {
      state.session_id = 'session-' + uuid();
      ssSet(KEY_SESSION, state.session_id);
      state.session_started_at = Date.now();
      state.first_play_at = null;
    } else {
      state.session_id = sid;
      if (!state.session_started_at) state.session_started_at = at;
    }
    ssSet(KEY_SESSION_AT, String(Date.now()));
  }

  function hasConsent() {
    if (state.enabled) return true;
    var own = lsGet(KEY_CONSENT);
    if (own === 'granted') return true;
    if (own === 'denied') return false;
    // เคารพระบบความยินยอมเดิมของเว็บ (public/track.js ใช้คีย์ ain_consent)
    try { if (lsGet('ain_consent') === 'granted') return true; } catch (e) {}
    return false;
  }

  function snapshot() {
    return {
      event: 'page_view',
      event_id: uuid(),
      visitor_id: state.visitor_id,
      session_id: state.session_id,
      page: state.page,
      video_id: state.video_id,
      timestamp: new Date().toISOString(),
      video_duration: state.video_duration || null,
      current_time: state.current_time || null,
      watch_duration: state.watch_duration || null,
      progress_percent: state.video_duration
        ? Math.min(100, Math.round((state.current_time / state.video_duration) * 100))
        : null,
      session_duration: state.session_started_at
        ? Math.round((Date.now() - state.session_started_at) / 1000)
        : null,
      first_play_timestamp: state.first_play_at ? new Date(state.first_play_at).toISOString() : null,
      last_activity_timestamp: new Date().toISOString(),
      device: device(),
      browser: browser(),
      language: language(),
      referrer: ref(),
      page_title: document.title || '',
      consent: { analytics: true, version: VERSION }
    };
  }

  /** ส่ง event หนึ่งรายการ — ไม่ throw ไม่รอผล (async ล้วน) */
  function send(payload, useBeacon) {
    try {
      if (!hasConsent()) return false;
      ensureIds();
      state.sent += 1;
      state.last_activity_at = Date.now();
      ssSet(KEY_SESSION_AT, String(Date.now()));
      var body = JSON.stringify(payload);
      if (useBeacon && navigator.sendBeacon) {
        try {
          var blob = new Blob([body], { type: 'application/json' });
          if (navigator.sendBeacon(ENDPOINT, blob)) return true;
        } catch (e) {}
      }
      if (window.fetch) {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
          credentials: 'omit',
          mode: 'cors'
        }).catch(function (e) { state.failed += 1; state.last_error = String(e && e.message || e); });
      }
      return true;
    } catch (e) {
      state.failed += 1;
      state.last_error = String(e && e.message || e);
      return false;
    }
  }

  /** ยิง event ใด ๆ (ใช้ชื่อตามสเปก) */
  function track(name, extra) {
    var p = snapshot();
    p.event = String(name || 'page_view');
    p.progress_percent = null;
    p.current_time = state.current_time || null;
    p.watch_duration = state.watch_duration || null;
    if (extra && typeof extra === 'object') {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) p[k] = extra[k];
    }
    return send(p);
  }

  // ── ติดตาม <video> ──────────────────────────────────────────────────────
  function attach(video, opts) {
    if (!video) return { detach: function () {} };
    opts = opts || {};
    if (opts.video_id) state.video_id = String(opts.video_id);
    if (opts.page) state.page = String(opts.page);
    ensureIds();

    var marksSeen = {};
    var paused = false;
    var endedOnce = false;
    var lastVolume = null;
    var heartbeat = null;
    var lastTime = 0;

    function onLoaded() {
      state.video_duration = Math.round(video.duration || 0) || state.video_duration;
      track('video_loaded', { video_duration: state.video_duration });
    }
    function onPlay() {
      if (!state.first_play_at) state.first_play_at = Date.now();
      state.play_count += 1;
      if (endedOnce) {
        marksSeen = {};
        endedOnce = false;
        track('video_interaction', { interaction: 'replay', replay: true });
      }
      if (paused) {
        paused = false;
        track('video_resume', { interaction: 'resume' });
      } else {
        track('video_play', { interaction: 'play' });
      }
      if (!heartbeat) {
        heartbeat = setInterval(function () {
          if (video.paused || video.ended) return;
          state.current_time = Math.round(video.currentTime || 0);
          state.watch_duration = state.current_time;
          track('video_progress', {
            current_time: state.current_time,
            video_duration: state.video_duration,
            watch_duration: state.watch_duration,
            progress_percent: state.video_duration
              ? Math.min(100, Math.round((state.current_time / state.video_duration) * 100))
              : null
          });
        }, HEARTBEAT_SEC * 1000);
      }
    }
    function onPause() {
      if (video.ended) return;
      paused = true;
      state.current_time = Math.round(video.currentTime || 0);
      state.watch_duration = state.current_time;
      track('video_pause', { interaction: 'pause' });
    }
    function onTimeUpdate() {
      if (!video.duration) return;
      state.video_duration = Math.round(video.duration);
      state.current_time = Math.round(video.currentTime || 0);
      // watch_duration = เวลาที่ดูสะสม (นับเฉพาะช่วงที่เล่นอยู่)
      if (!video.paused) {
        var dt = video.currentTime - lastTime;
        if (dt > 0 && dt < 5) state.watch_duration += dt;
        lastTime = video.currentTime;
      }
      var pct = Math.min(100, Math.floor((video.currentTime / video.duration) * 100));
      for (var i = 0; i < MARKS.length; i++) {
        var m = MARKS[i];
        if (pct >= m && !marksSeen[m]) {
          marksSeen[m] = true;
          track('video_progress', {
            current_time: Math.round(video.currentTime),
            video_duration: state.video_duration,
            watch_duration: Math.round(state.watch_duration),
            progress_percent: m,
            mark: m
          });
        }
      }
    }
    function onSeeked() {
      state.current_time = Math.round(video.currentTime || 0);
      track('video_seek', {
        current_time: state.current_time,
        video_duration: state.video_duration,
        seek_direction: video.currentTime >= lastTime ? 'forward' : 'backward'
      });
      track('video_interaction', { interaction: video.currentTime >= lastTime ? 'seek_forward' : 'seek_backward' });
      lastTime = video.currentTime;
    }
    function onEnded() {
      endedOnce = true;
      state.current_time = Math.round(video.duration || 0);
      track('video_ended', { current_time: state.current_time, progress_percent: 100, video_duration: state.video_duration });
    }
    function onFullscreen() {
      var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      track('video_interaction', { interaction: on ? 'fullscreen' : 'fullscreen_exit', fullscreen: on });
    }
    function onVolume() {
      var isMuted = !!video.muted;
      if (lastVolume === null) { lastVolume = video.volume; return; }
      if (isMuted && lastVolume !== false) {
        track('video_interaction', { interaction: 'mute', muted: true, volume: isMuted ? 0 : video.volume });
      } else if (!isMuted && lastVolume === false) {
        track('video_interaction', { interaction: 'unmute', muted: false, volume: video.volume });
      }
      lastVolume = isMuted;
    }
    function onExit() {
      try {
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        var p = snapshot();
        p.event = 'video_exit';
        p.current_time = Math.round(video.currentTime || 0);
        p.video_duration = Math.round(video.duration || state.video_duration || 0);
        p.watch_duration = Math.round(state.watch_duration || p.current_time || 0);
        p.progress_percent = p.video_duration
          ? Math.min(100, Math.round((p.current_time / p.video_duration) * 100)) : null;
        send(p, true);
        var q = snapshot();
        q.event = 'page_exit';
        q.watch_duration = p.watch_duration;
        q.progress_percent = p.progress_percent;
        send(q, true);
      } catch (e) {}
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') onExit();
      else if (document.visibilityState === 'visible') track('video_resume', { interaction: 'resume' });
    }

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onEnded);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    video.addEventListener('volumechange', onVolume);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onExit);

    return {
      detach: function () {
        try {
          if (heartbeat) clearInterval(heartbeat);
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('play', onPlay);
          video.removeEventListener('pause', onPause);
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('ended', onEnded);
          document.removeEventListener('fullscreenchange', onFullscreen);
          document.removeEventListener('webkitfullscreenchange', onFullscreen);
          video.removeEventListener('volumechange', onVolume);
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('pagehide', onExit);
        } catch (e) {}
      }
    };
  }

  function init(opts) {
    opts = opts || {};
    if (opts.page) state.page = String(opts.page);
    if (opts.video_id) state.video_id = String(opts.video_id);
    ensureIds();
    state.ready = true;
    state.enabled = hasConsent();
    try {
      window.dispatchEvent(new CustomEvent('ain:video-intel-ready', { detail: status() }));
    } catch (e) {}
    return status();
  }
  function grant() {
    lsSet(KEY_CONSENT, 'granted');
    // ให้ระบบ track.js เดิมเห็นความยินยอมเดียวกันด้วย
    try { if (!lsGet('ain_consent')) lsSet('ain_consent', 'granted'); } catch (e) {}
    state.enabled = true;
    ensureIds();
    track('page_view');
    return status();
  }
  function deny() {
    lsSet(KEY_CONSENT, 'denied');
    state.enabled = false;
    return status();
  }
  function revoke() { return deny(); }
  function status() {
    return {
      version: VERSION,
      ready: state.ready,
      enabled: hasConsent(),
      visitor_id: state.visitor_id,
      session_id: state.session_id,
      video_id: state.video_id,
      page: state.page,
      sent: state.sent,
      failed: state.failed,
      last_error: state.last_error,
      video_duration: state.video_duration,
      current_time: state.current_time,
      watch_duration: Math.round(state.watch_duration || 0)
    };
  }

  window.AIN_VIDEO_INTEL = {
    version: VERSION,
    init: init,
    attach: attach,
    track: track,
    grant: grant,
    deny: deny,
    revoke: revoke,
    isGranted: hasConsent,
    status: status,
    marks: MARKS.slice()
  };
  // ถ้าผู้ใช้เคยยินยอมไว้แล้ว เริ่มนับได้เลยโดยไม่ต้องรอกดซ้ำ
  try { init({}); } catch (e) {}
})();
