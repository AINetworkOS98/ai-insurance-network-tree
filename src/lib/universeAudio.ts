/**
 * เสียงจักรวาลสำหรับหน้า Future Network Simulator — v2 "สมจริง"
 *
 * สังเคราะห์สดด้วย Web Audio API ทั้งหมด (ไม่โหลดไฟล์เสียงจากภายนอก ไม่มีปัญหาลิขสิทธิ์)
 * องค์ประกอบที่ทำให้ฟังดูเป็นอวกาศจริง:
 *  1) Sub drone ~38 Hz (รู้สึกได้มากกว่าได้ยิน) + ฮาร์มอนิก 57 / 76 / 114 Hz
 *  2) Pad เคลื่อนไหวช้า — ออสซิลเลเตอร์ดีจูนคู่ แพนซ้าย/ขวา ส่ายแบบไม่เป็นคาบซ้ำ
 *  3) ลม/อวกาศ — noise 2 ชุด แพนคนละข้าง ผ่าน lowpass ที่ขยับช้าคนละจังหวะ
 *  4) Shimmer — noise กรองสูง (>5 kHz) ระดับเบามาก ให้ประกายไกล ๆ
 *  5) Reverb ยาว 4.6 วิ (สร้าง impulse response เองจาก noise สลายตัวแบบเอกซ์โพเนนเชียล)
 *  6) เสียงเหตุการณ์: ระฆังไกล (ping) และเสียง "ผ่านเงื่อนไข" (chime) — ส่งผ่าน reverb
 *  7) คอมเพรสเซอร์ + ไฮเชลฟ์ลดความจัดของยอดแหลม กันเสียงแตก
 *
 * ต้องเริ่มจาก "การคลิกของผู้ใช้" เท่านั้น (ข้อกำหนดของเบราว์เซอร์)
 */

export class UniverseAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private send: GainNode | null = null; // บัสส่งเข้า reverb
  private nodes: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];
  private volume = 0.32;

  /**
   * @param makeCtx ใช้สำหรับทดสอบ (เช่นส่ง OfflineAudioContext เข้ามาเพื่อวัดเสียง)
   *                 ปกติไม่ต้องส่ง — ระบบจะสร้าง AudioContext จริงเอง
   */
  constructor(private readonly makeCtx?: () => AudioContext) {}

  get running() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** เล่นได้หรือไม่ (ระหว่าง render แบบ offline สถานะจะเป็น suspended) */
  private get audible() {
    if (!this.ctx) return false;
    return this.ctx.state === 'running' || typeof (this.ctx as unknown as OfflineAudioContext).startRendering === 'function';
  }

  /** ต้องเรียกจากเหตุการณ์คลิก/แตะของผู้ใช้เท่านั้น */
  async start() {
    if (typeof window === 'undefined') return false;
    if (this.ctx) {
      await this.ctx.resume?.().catch(() => null);
      this.fade(this.volume, 1.5);
      return true;
    }
    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;

    const ctx = this.makeCtx ? this.makeCtx() : new (AC as typeof AudioContext)();
    this.ctx = ctx;

    // ── ห่วงโซ่เสียงหลัก: master → compressor → ลดยอดแหลม → destination ──
    const master = ctx.createGain();
    master.gain.value = 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.05;
    comp.release.value = 0.6;

    const softTop = ctx.createBiquadFilter();
    softTop.type = 'highshelf';
    softTop.frequency.value = 6500;
    softTop.gain.value = -3.5;

    master.connect(comp).connect(softTop).connect(ctx.destination);
    this.master = master;

    // ── Reverb ยาว (สร้าง impulse response เอง) + บัสส่ง ──
    const send = ctx.createGain();
    send.gain.value = 0.55;
    const convolver = ctx.createConvolver();
    convolver.buffer = this.buildImpulse(ctx, 4.6, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    send.connect(convolver).connect(wet).connect(comp);
    this.send = send;

    // ── 1) Sub drone + ฮาร์มอนิก (หายใจช้า ๆ ไม่เป็นคาบซ้ำ) ──
    const droneSpec: Array<{ f: number; t: OscillatorType; g: number; pan: number }> = [
      { f: 38, t: 'sine', g: 0.42, pan: 0 },
      { f: 57, t: 'sine', g: 0.28, pan: -0.25 },
      { f: 76, t: 'triangle', g: 0.16, pan: 0.25 },
      { f: 114, t: 'sine', g: 0.09, pan: 0.4 },
    ];
    droneSpec.forEach((d, i) => {
      const osc = ctx.createOscillator();
      osc.type = d.t;
      osc.frequency.value = d.f;
      const g = ctx.createGain();
      g.gain.value = d.g;
      const p = ctx.createStereoPanner();
      p.pan.value = d.pan;

      const lfo1 = ctx.createOscillator();
      lfo1.frequency.value = 0.021 + i * 0.009;
      const lfo1g = ctx.createGain();
      lfo1g.gain.value = 0.35 + i * 0.15;
      lfo1.connect(lfo1g).connect(osc.frequency);

      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.077 + i * 0.013;
      const lfo2g = ctx.createGain();
      lfo2g.gain.value = 0.22;
      lfo2.connect(lfo2g).connect(osc.frequency);

      const breath = ctx.createOscillator();
      breath.frequency.value = 0.037 + i * 0.011;
      const breathG = ctx.createGain();
      breathG.gain.value = 0.14;
      breath.connect(breathG).connect(g.gain);

      osc.connect(g).connect(p).connect(master);
      p.connect(send);
      osc.start();
      lfo1.start();
      lfo2.start();
      breath.start();
      this.nodes.push(osc, lfo1, lfo2, breath);
    });

    // ── 2) Pad: ออสซิลเลอร์ดีจูนคู่ แพนซ้าย/ขวา (กว้างและหนา) ──
    const padNotes = [152, 228, 304];
    padNotes.forEach((f, i) => {
      [-1, 1].forEach((side) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * (1 + side * 0.0016);
        const g = ctx.createGain();
        g.gain.value = 0.075;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900 + i * 420;
        filter.Q.value = 0.4;
        const p = ctx.createStereoPanner();
        p.pan.value = side * (0.6 + i * 0.15);

        const drift = ctx.createOscillator();
        drift.frequency.value = 0.017 + i * 0.009 + (side + 1) * 0.004;
        const driftG = ctx.createGain();
        driftG.gain.value = 1.6;
        drift.connect(driftG).connect(osc.frequency);

        const swell = ctx.createOscillator();
        swell.frequency.value = 0.026 + i * 0.007;
        const swellG = ctx.createGain();
        swellG.gain.value = 0.03;
        swell.connect(swellG).connect(g.gain);

        osc.connect(filter).connect(g).connect(p).connect(master);
        p.connect(send);
        osc.start();
        drift.start();
        swell.start();
        this.nodes.push(osc, drift, swell);
      });
    });

    // ── 3) ลม/อวกาศ: noise 2 ชุด แพนคนละข้าง กรองคนละจังหวะ ──
    const noiseBuf = this.buildNoise(ctx, 6);
    [-1, 1].forEach((side, i) => {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300 + i * 160;
      lp.Q.value = 0.6;
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.013 + i * 0.006;
      const sweepG = ctx.createGain();
      sweepG.gain.value = 160;
      sweep.connect(sweepG).connect(lp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.16;
      const p = ctx.createStereoPanner();
      p.pan.value = side * 0.85;
      noise.connect(lp).connect(g).connect(p).connect(master);
      p.connect(send);
      noise.start();
      sweep.start();
      this.nodes.push(noise, sweep);
    });

    // ── 4) Shimmer + อากาศ: ประกายสูงเบา ๆ + เสียงลมบาง ๆ ย่านกลาง (ให้มี "อากาศ" จริง) ──
    const shim = ctx.createBufferSource();
    shim.buffer = noiseBuf;
    shim.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3800;
    const shimG = ctx.createGain();
    shimG.gain.value = 0.1;
    const shimLfo = ctx.createOscillator();
    shimLfo.frequency.value = 0.037;
    const shimLfoG = ctx.createGain();
    shimLfoG.gain.value = 0.03;
    shimLfo.connect(shimLfoG).connect(shimG.gain);
    const shimPan = ctx.createStereoPanner();
    const shimPanLfo = ctx.createOscillator();
    shimPanLfo.frequency.value = 0.023;
    const shimPanLfoG = ctx.createGain();
    shimPanLfoG.gain.value = 0.8;
    shimPanLfo.connect(shimPanLfoG).connect(shimPan.pan);
    shim.connect(hp).connect(shimG).connect(shimPan).connect(master);
    shimPan.connect(send);
    shim.start();
    shimLfo.start();
    shimPanLfo.start();
    this.nodes.push(shim, shimLfo, shimPanLfo);

    // อากาศย่านกลาง (1.1–2.6 kHz) — ทำให้เหมือน "ลมสุริยะ" บาง ๆ
    const air = ctx.createBufferSource();
    air.buffer = noiseBuf;
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1850;
    bp.Q.value = 0.8;
    const bpSweep = ctx.createOscillator();
    bpSweep.frequency.value = 0.019;
    const bpSweepG = ctx.createGain();
    bpSweepG.gain.value = 620;
    bpSweep.connect(bpSweepG).connect(bp.frequency);
    const airG = ctx.createGain();
    airG.gain.value = 0.085;
    const airPan = ctx.createStereoPanner();
    airPan.pan.value = -0.35;
    const airPanLfo = ctx.createOscillator();
    airPanLfo.frequency.value = 0.011;
    const airPanLfoG = ctx.createGain();
    airPanLfoG.gain.value = 0.6;
    airPanLfo.connect(airPanLfoG).connect(airPan.pan);
    air.connect(bp).connect(airG).connect(airPan).connect(master);
    airPan.connect(send);
    air.start();
    bpSweep.start();
    airPanLfo.start();
    this.nodes.push(air, bpSweep, airPanLfo);

    // ── 4.5) ประกายดาว: เสียง "แคร็ก" เบามากเป็นระยะ ๆ ──
    const scheduleCrackle = () => {
      const t = window.setTimeout(() => {
        this.crackle();
        scheduleCrackle();
      }, 1100 + Math.random() * 2600);
      this.timers.push(t);
    };
    scheduleCrackle();

    // ── 6) ระฆังไกลเป็นระยะ ──
    const schedulePing = () => {
      const t = window.setTimeout(() => {
        this.ping(0.05 + Math.random() * 0.045);
        schedulePing();
      }, 7000 + Math.random() * 13000);
      this.timers.push(t);
    };
    schedulePing();

    await ctx.resume?.().catch(() => null);
    this.fade(this.volume, 3.0); // ค่อย ๆ ก่อตัว เหมือนค่อย ๆ เข้าไปในอวกาศ
    return true;
  }

  stop() {
    if (!this.ctx) return;
    this.fade(0, 1.2);
    const ctx = this.ctx;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    window.setTimeout(() => {
      this.nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* หยุดไปแล้ว */
        }
      });
      this.nodes = [];
      try {
        ctx.close();
      } catch {
        /* ปิดไปแล้ว */
      }
    }, 1400);
    this.ctx = null;
    this.master = null;
    this.send = null;
  }

  /** ระฆังไกล ๆ (ใช้เป็นระยะ และตอนเกิดโหนดใหม่) */
  ping(gainAmount = 0.08, note?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.audible) return;
    const scale = [261.63, 293.66, 349.23, 392.0, 440.0, 523.25]; // เพนทาโทนิกนุ่ม ๆ
    const f = note ?? scale[Math.floor(Math.random() * scale.length)];
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gainAmount, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() * 2 - 1) * 0.75;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = f * 2.005; // ฮาร์มอนิกที่ค่อย ๆ หายไป
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc.connect(g);
    osc2.connect(g2).connect(g);
    g.connect(p).connect(this.master);
    if (this.send) p.connect(this.send);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 4.4);
    osc2.stop(now + 4.4);
  }

  /** เสียง "ผ่านเงื่อนไข" — สองโน้ตไล่ขึ้น นุ่มนวล */
  chime() {
    if (!this.ctx || !this.audible) return;
    this.ping(0.09, 523.25);
    const t = window.setTimeout(() => this.ping(0.075, 659.25), 260);
    this.timers.push(t);
  }

  /** พลังงานวิ่งผ่านโหนด — เสียงสั้น เบา ไม่รบกวน (ความถี่สูงขึ้นตามชั้นที่สว่าง) */
  energyPulse(intensity = 0.045, note?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.audible) return;
    const now = ctx.currentTime;
    const f = note ?? 720 + Math.random() * 900;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 1.7, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4600;
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() * 2 - 1) * 0.7;
    osc.connect(lp).connect(g).connect(p).connect(this.master);
    if (this.send) p.connect(this.send);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /** ดาวหางพุ่งผ่าน — เสียงวูบกวาดความถี่ (deep space whoosh) */
  whoosh(intensity = 0.12) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.audible) return;
    const now = ctx.currentTime;
    const dur = 1.7;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.sin(Math.PI * t); // ขึ้น-ลง นุ่ม ๆ
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(220, now);
    bp.frequency.exponentialRampToValueAtTime(2400, now + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(150, now + dur);
    const g = ctx.createGain();
    g.gain.value = intensity;
    const p = ctx.createStereoPanner();
    const from = Math.random() < 0.5 ? -0.95 : 0.95;
    p.pan.setValueAtTime(from, now);
    p.pan.linearRampToValueAtTime(-from, now + dur);
    src.connect(bp).connect(g).connect(p).connect(this.master);
    if (this.send) p.connect(this.send);
    src.start(now);
    src.stop(now + dur);
  }

  /** สมาชิกใหม่เข้ามาในเครือข่าย — สองโน้ตไล่ขึ้น + ประกายพลังงาน */
  activation() {
    if (!this.ctx || !this.audible) return;
    this.ping(0.085, 392.0);
    const t1 = window.setTimeout(() => this.ping(0.08, 587.33), 220);
    const t2 = window.setTimeout(() => this.ping(0.07, 880.0), 430);
    const t3 = window.setTimeout(() => this.crackle(0.035), 520);
    this.timers.push(t1, t2, t3);
  }

  /** ประกายดาว: เสียงแคร็กสั้นมาก ๆ ผ่านตัวกรองสูง (ทำให้จักรวาลมีชีวิต) */
  crackle(gainAmount = 0.02) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.audible) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 4200 + Math.random() * 5200;
    f.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.value = gainAmount;
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() * 2 - 1) * 0.85;
    src.connect(f).connect(g).connect(p).connect(this.master);
    if (this.send) p.connect(this.send);
    src.start(now);
    src.stop(now + 0.07);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) this.fade(this.volume, 0.35);
  }

  // ── ตัวสร้างเสียงช่วย ──

  /** impulse response ของ reverb: noise สลายตัวเอกซ์โพเนนเชียล (+ pre-delay สั้น ๆ) */
  private buildImpulse(ctx: AudioContext, seconds: number, decay: number) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      const preDelay = Math.floor(rate * (0.012 + ch * 0.006));
      for (let i = 0; i < len; i++) {
        if (i < preDelay) {
          data[i] = 0;
          continue;
        }
        const t = (i - preDelay) / (len - preDelay);
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  /** noise สีชมพู-ish สำหรับลม/อวกาศ */
  private buildNoise(ctx: AudioContext, seconds: number) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = Math.max(-1, Math.min(1, last * 3.2));
    }
    return buf;
  }

  private fade(to: number, seconds: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(to, now + seconds);
    } catch {
      master.gain.value = to;
    }
  }
}
