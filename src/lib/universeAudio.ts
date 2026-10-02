/**
 * เสียงจักรวาลสำหรับหน้า Future Network Simulator
 * สังเคราะห์เสียงเองด้วย Web Audio API (ไม่โหลดไฟล์เสียงจากภายนอก)
 *  - drone ความถี่ต่ำ + ชั้นเสียงกว้าง (space pad)
 *  - สัญญาณรบกวนผ่านตัวกรองความถี่ต่ำที่ขยับช้า ๆ (ลม/อวกาศ)
 *  - เสียง "ติ๊ง" เบา ๆ เป็นระยะ และเวลาเกิดโหนดใหม่
 * ต้องเริ่มจาก "การคลิกของผู้ใช้" เท่านั้น (ข้อกำหนดของเบราว์เซอร์)
 */

type Ctx = AudioContext & { _universeMaster?: GainNode };

export class UniverseAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];
  private volume = 0.25;

  get running() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** ต้องเรียกจากเหตุการณ์คลิก/แตะของผู้ใช้เท่านั้น */
  async start() {
    if (typeof window === 'undefined') return false;
    if (this.ctx) {
      await this.ctx.resume().catch(() => null);
      this.fade(this.volume, 1.2);
      return true;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;

    const ctx = new AC() as Ctx;
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // ── ชั้นเสียงกว้าง: 3 ออสซิลเลเตอร์ความถี่ต่ำ (คอร์ดเปิด) ──
    const base = [55, 82.5, 110];
    base.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : i === 1 ? 0.32 : 0.18;
      // ขยับความถี่ช้า ๆ ให้เหมือนหายใจ
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.6 + i * 0.4;
      lfo.connect(lfoGain).connect(osc.frequency);
      // ขยับความดังช้า ๆ
      const amp = ctx.createOscillator();
      amp.frequency.value = 0.05 + i * 0.021;
      const ampGain = ctx.createGain();
      ampGain.gain.value = 0.12;
      amp.connect(ampGain).connect(g.gain);

      osc.connect(g).connect(master);
      osc.start();
      lfo.start();
      amp.start();
      this.nodes.push(osc, lfo, amp);
    });

    // ── เสียงลม/อวกาศ: noise → lowpass ที่ขยับช้า ๆ ──
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // pink-ish
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.7;

    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.017;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 210;
    sweep.connect(sweepGain).connect(filter.frequency);

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.22;
    noise.connect(filter).connect(noiseGain).connect(master);
    noise.start();
    sweep.start();
    this.nodes.push(noise, sweep);

    // ── ติ๊งเบา ๆ เป็นระยะ (สุ่ม) ──
    const schedulePing = () => {
      const t = window.setTimeout(() => {
        this.ping(0.06 + Math.random() * 0.05);
        schedulePing();
      }, 6000 + Math.random() * 12000);
      this.timers.push(t);
    };
    schedulePing();

    await ctx.resume().catch(() => null);
    this.fade(this.volume, 1.6);
    return true;
  }

  stop() {
    if (!this.ctx) return;
    this.fade(0, 0.8);
    const ctx = this.ctx;
    const timers = this.timers;
    this.timers = [];
    timers.forEach((t) => window.clearTimeout(t));
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
    }, 900);
    this.ctx = null;
    this.master = null;
  }

  /** เสียงติ๊งสั้น ๆ (ใช้ตอนเกิดโหนดใหม่ หรือเป็นระยะ) */
  ping(gainAmount = 0.1) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gainAmount, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 2.6);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) this.fade(this.volume, 0.3);
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
