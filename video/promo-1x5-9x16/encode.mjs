
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const log = (m) => { console.log(m); };
const countFrames = () => existsSync(join(OUT, 'frames')) ? readdirSync(join(OUT, 'frames')).filter(f => /^f\d{5}\.jpg$/.test(f)).length : 0;
// 1) รอเฟรมครบ 1800 (สูงสุด 25 นาที)
const t0 = Date.now();
while (countFrames() < 1800) {
  if (Date.now() - t0 > 25 * 60 * 1000) { log('❌ เฟรมไม่ครบใน 25 นาที: ' + countFrames()); process.exit(1); }
  await new Promise(r => setTimeout(r, 15000));
}
log('· เฟรมครบ 1800 (' + ((Date.now() - t0) / 1000).toFixed(0) + ' วิ)');
// 2) ประกอบวิดีโอ (cwd = out เพื่อให้ ass=overlay.ass อ้างชื่อไฟล์สั้นได้)
const vo = ['vo1', 'vo2', 'vo3', 'vo4', 'vo5'];
const delays = [800, 9200, 21200, 36000, 49100];
const inputs = ['-y', '-framerate', '30', '-i', 'frames/f%05d.jpg'];
for (const v of vo) inputs.push('-i', `audio/${v}.mp3`);
inputs.push('-i', 'music.wav');
const stereo = i => `[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,adelay=${delays[i - 1]}:all=1[l${i}]`;
const graphA = [
  '[0:v]ass=overlay.ass[v]',
  ...[1, 2, 3, 4, 5].map(stereo),
  '[l1][l2][l3][l4][l5]amix=inputs=5:normalize=0[vo]',
  '[vo]highpass=f=90,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-15:TP=-1.5:LRA=11,asplit=2[voA][sc]',
  '[6:a]volume=0.17[mu]',
  '[mu][sc]sidechaincompress=threshold=0.05:ratio=6:attack=15:release=350[mu2]',
  '[voA][mu2]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[aout]',
].join(';');
const graphB = [
  '[0:v]ass=overlay.ass[v]',
  ...[1, 2, 3, 4, 5].map(stereo),
  '[l1][l2][l3][l4][l5]amix=inputs=5:normalize=0[vo]',
  '[6:a]volume=0.17[mu]',
  '[vo][mu]amix=inputs=2:normalize=0:duration=longest[aout]',
].join(';');
const tail = ['-map', '[v]', '-map', '[aout]', '-t', '60', '-r', '30',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '../promo-1x5-autopilot-9x16.mp4'];
for (const [name, graph] of [['A (sidechain duck)', graphA], ['B (simple mix)', graphB]]) {
  log('▶ ffmpeg filtergraph ' + name);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', graph, ...tail],
    { cwd: OUT, stdio: 'inherit' });
  const f = join(HERE, 'promo-1x5-autopilot-9x16.mp4');
  if (r.status === 0 && existsSync(f) && statSync(f).size > 1_000_000) { log('✅ เข้ารหัสเสร็จ ' + (statSync(f).size / 1024 / 1024).toFixed(1) + ' MB'); process.exit(0); }
  log('⚠️ ล้มเหลว (' + (r.status) + ') — ลองกราฟถัดไป');
}
writeFileSync(join(OUT, 'encode_failed.flag'), new Date().toISOString());
log('❌ ทั้งสองกราฟล้มเหลว');
process.exit(1);
