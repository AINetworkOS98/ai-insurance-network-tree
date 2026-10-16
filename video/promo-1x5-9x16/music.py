
import numpy as np, wave, os
SR = 44100; DUR = 60.0
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
def add(sig, start, pan=0.5, amp=1.0):
    i0 = int(start * SR); i1 = min(n, i0 + len(sig))
    if i1 <= i0: return
    s = sig[:i1 - i0] * amp
    L[i0:i1] += s * (1 - pan); R[i0:i1] += s * pan
def env(dur, a=0.4, r=0.8, sr=SR):
    m = int(dur * sr); e = np.ones(m)
    ai = max(1, int(a * sr)); ri = max(1, int(r * sr))
    e[:ai] = np.linspace(0, 1, ai) ** 1.5
    if ri < m: e[-ri:] *= np.linspace(1, 0, ri) ** 1.5
    return e
def tone(f, dur, amp=1.0, harm=(1.0, 0.25, 0.08), a=0.4, r=0.8):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros_like(t)
    for k, w in enumerate(harm, start=1): s += w * np.sin(2 * np.pi * f * k * t)
    return s * env(dur, a, r) * amp / sum(harm)
def pluck(f, dur=0.9):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 3 * t)
    return s * np.exp(-t * 6.0) * 0.5
def kick():
    dur = 0.32; t = np.arange(int(dur * SR)) / SR
    f = 120 * np.exp(-t * 22) + 48
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.55
def hat(dur=0.05):
    t = np.arange(int(dur * SR)) / SR
    rng = np.random.default_rng(3)
    return rng.normal(0, 1, len(t)) * np.exp(-t * 90) * 0.09
BPM = 96.0; beat = 60 / BPM
NOTE = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
def f_of(name):
    p, octv = name[:-1], int(name[-1]); return 440.0 * 2 ** ((NOTE[p] + (octv - 4) * 12 - 9) / 12)
CHORDS = [['C4','E4','G4','C5'], ['B3','D4','G4','B4'], ['A3','C4','E4','A4'], ['F3','A3','C4','F4']]
BASS = ['C2','G2','A2','F2']
for ci in range(12):
    t0 = ci * 5.0
    ch = CHORDS[ci % 4]
    for j, nm in enumerate(ch):
        add(tone(f_of(nm), 5.4, 0.16, a=0.6, r=1.2), t0, pan=0.35 + 0.3 * (j / len(ch)), amp=1 / len(ch))
    add(tone(f_of(BASS[ci % 4]), 5.0, 0.30, harm=(1.0, 0.15), a=0.3, r=1.0), t0, pan=0.5, amp=1)
    for k in range(8):                                   # อาร์เพจจิโอ 8th
        nm = ch[(k + ci) % len(ch)]; nm = nm.replace('3', '5').replace('4', '5').replace('5', '5')
        t = t0 + k * beat / 1.0
        if t < DUR: add(pluck(f_of(nm) * 2, 0.9), t, pan=0.4 if k % 2 == 0 else 0.6, amp=0.55)
    add(kick(), t0, 0.5, 1.0); add(kick(), t0 + beat * 2, 0.5, 0.85)
    for k in range(4):                                   # ไฮแฮท offbeat
        t = t0 + beat * (k + 0.5)
        if t < DUR: add(hat(), t, pan=0.55, amp=1.0)
# shimmer แบบเสียงดิจิทัล
t = np.arange(n) / SR
sh = (np.sin(2 * np.pi * 2200 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.35 * t)))
sh *= (0.02 * np.clip((t - 2) / 6, 0, 1) * np.clip((DUR - 3 - t) / 4, 0, 1))
L += sh * 0.7; R += sh * 0.9
# riser ก่อนการ์ดปิดท้าย (44–48 วิ)
r0, r1 = int(44 * SR), int(48.5 * SR)
rr = np.random.default_rng(9).normal(0, 1, r1 - r0)
ramp = np.linspace(0, 1, r1 - r0) ** 2
band = np.sin(2 * np.pi * (600 + 2400 * np.linspace(0, 1, r1 - r0)) * np.arange(r1 - r0) / SR)
L[r0:r1] += rr * ramp * 0.10 + band * ramp * 0.06
R[r0:r1] += rr * ramp * 0.10 + band * ramp * 0.06
# impact ที่ 48.6 วิ
imp = kick() * 1.2
add(imp, 48.6, 0.5, 1.0)
# มาสเตอร์: soft clip + เฟดเข้า/ออก
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1) * 0.75
fin = int(2.0 * SR); fout = int(3.5 * SR)
mix[:fin] *= np.linspace(0, 1, fin)[:, None]
mix[-fout:] *= np.linspace(1, 0, fout)[:, None]
mix /= max(1e-9, np.max(np.abs(mix))) / 0.85
pcm = (mix * 32767).astype('<i2')
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'music.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('music.wav', os.path.getsize(out) // 1024, 'KB')
