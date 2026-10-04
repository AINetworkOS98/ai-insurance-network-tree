/**
 * ค่าตั้งเสียง "จักรวาลเครือข่าย" ที่ใช้ร่วมกันทุกหน้า
 *
 * ใช้กับทุกที่ที่ฝังฉากจักรวาล 3 มิติ (คอมโพเนนต์ CosmicNetwork):
 *   ● หน้าแรก (/ แท็บ 🌌 จักรวาลของเครือข่าย)
 *   ● หน้า /financial-freedom
 *   ● หน้า /network/1x5-autopilot (จักรวาล 1 แตก 5 · ข้อมูลจริง)
 * และหน้า /network-simulator (Future Network Simulator)
 *
 * ⇒ เปิด/ปิดเสียง + ระดับความดัง ที่ตั้งไว้ที่หน้าหนึ่ง จะมีผลกับทุกลิงก์ (ทุกหน้า) ที่เหลือ
 *    เพราะอ่าน/เขียนค่าจากที่เดียวกัน · เก็บไว้ใน localStorage ของเบราว์เซอร์เท่านั้น ไม่ส่งขึ้นเซิร์ฟเวอร์
 */

/** ระดับความดังเริ่มต้น — เดิม 0.32 ซึ่งเบาจนแทบไม่ได้ยิน จึงเร่งขึ้นให้ได้ยินชัด */
export const DEFAULT_UNIVERSE_VOLUME = 0.62;

/** ยอมรับค่าที่บันทึกไว้ต่ำสุดเท่านี้ก่อนถือว่า "ผู้ใช้ปิดเสียงไว้" */
const MIN_AUDIBLE = 0.05;

const KEY_ON = 'ain-universe-sound-on';
const KEY_VOL = 'ain-universe-volume';

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_UNIVERSE_VOLUME;
  return Math.max(0, Math.min(1, v));
}

export type UniverseSoundPref = { on: boolean; volume: number };

/** อ่านค่าที่ผู้ใช้ตั้งไว้ (ครั้งแรก = เปิดเสียง + ระดับเริ่มต้นที่ดังขึ้นแล้ว) */
export function readUniverseSoundPref(): UniverseSoundPref {
  const fallback: UniverseSoundPref = { on: true, volume: DEFAULT_UNIVERSE_VOLUME };
  if (typeof window === 'undefined') return fallback;
  try {
    const rawOn = window.localStorage.getItem(KEY_ON);
    const rawVol = Number(window.localStorage.getItem(KEY_VOL));
    return {
      on: rawOn === null ? true : rawOn === '1',
      volume: Number.isFinite(rawVol) && rawVol >= 0 ? clampVolume(rawVol) : DEFAULT_UNIVERSE_VOLUME,
    };
  } catch {
    return fallback;
  }
}

/** บันทึกค่าที่ผู้ใช้ตั้งไว้ (ใช้ร่วมกันทุกหน้า/ทุกลิงก์) */
export function writeUniverseSoundPref(patch: Partial<UniverseSoundPref>): void {
  if (typeof window === 'undefined') return;
  try {
    if (typeof patch.on === 'boolean') window.localStorage.setItem(KEY_ON, patch.on ? '1' : '0');
    if (typeof patch.volume === 'number') window.localStorage.setItem(KEY_VOL, String(clampVolume(patch.volume)));
  } catch {
    /* เบราว์เซอร์ปิด localStorage (โหมดส่วนตัว) — ใช้ค่าเริ่มต้นต่อไป ไม่ให้หน้าพัง */
  }
}

export function isUniverseVolumeAudible(v: number): boolean {
  return clampVolume(v) >= MIN_AUDIBLE;
}
