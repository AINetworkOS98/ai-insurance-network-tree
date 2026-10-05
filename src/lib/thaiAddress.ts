// ─────────────────────────────────────────────────────────────────────────────
// thaiAddress.ts — ค้นหาที่อยู่ไทย (จังหวัด · อำเภอ/เขต · รหัสไปรษณีย์) แบบออฟไลน์
// ใช้กับฟอร์ม /recruit (และหน้า/ฟอร์มอื่นที่ใช้ที่อยู่) — เติมอำเภอ/จังหวัด/รหัสไปรษณีย์อัตโนมัติ
// ข้อมูล: src/lib/thaiAddressData.ts (77 จังหวัด · 928 อำเภอ/เขต · จากระดับตำบลยุบเป็นอำเภอ)
// ทำงานฝั่ง client ได้ (ไม่ import prisma / ไม่ยิง API) → พิมพ์แล้วเห็นผลทันที
// ─────────────────────────────────────────────────────────────────────────────

import { THAI_ADDRESS, THAI_PROVINCES } from './thaiAddressData';

export interface AddressHit {
  province: string;
  district: string;
  postalCodes: string[];
  /** ระดับความตรง: 3 = รหัสไปรษณีย์ตรงเป๊ะ, 2 = ชื่ออำเภอตรงเป๊ะ, 1 = ตรงบางส่วน */
  score: number;
}

/** ตัดคำนำหน้า (อำเภอ/เขต/จังหวัด) และช่องว่าง ออกก่อนเทียบชื่อ */
export function normalizeThaiPlace(v: string): string {
  return String(v || '')
    .replace(/\s+/g, '')
    .replace(/^(อำเภอ| amphoe|เขต|khet|ตำบล|tambon|แขวง|จังหวัด|จ\.|อ\.|ต\.)/i, '')
    .trim()
    .toLowerCase();
}

function pushHit(out: AddressHit[], p: string, d: string, zips: string[], score: number) {
  out.push({ province: p, district: d, postalCodes: zips, score });
}

/** ค้นหา: รับได้ทั้งรหัสไปรษณีย์ (3–5 หลัก), ชื่ออำเภอ/เขต, หรือชื่อจังหวัด */
export function searchAddress(query: string, limit = 8): AddressHit[] {
  const raw = String(query || '').trim();
  if (raw.length < 2) return [];
  const key = normalizeThaiPlace(raw);
  const digits = raw.replace(/\D/g, '');
  const looksLikePostal = digits.length >= 3 && digits.length <= 5 && !/[ก-๙a-z]/i.test(raw);

  const exact: AddressHit[] = [];
  const starts: AddressHit[] = [];
  const partial: AddressHit[] = [];

  for (const province of THAI_PROVINCES) {
    const districts = THAI_ADDRESS[province] || {};
    const pNorm = normalizeThaiPlace(province);
    for (const district of Object.keys(districts)) {
      const zips = districts[district] || [];
      const dNorm = normalizeThaiPlace(district);

      if (looksLikePostal) {
        if (zips.includes(digits)) pushHit(exact, province, district, zips, 3);
        else if (zips.some((z) => z.startsWith(digits))) pushHit(starts, province, district, zips, 2);
        continue;
      }
      if (dNorm === key) pushHit(exact, province, district, zips, 3);
      else if (dNorm.startsWith(key) || pNorm === key) pushHit(starts, province, district, zips, 2);
      else if (dNorm.includes(key) || pNorm.includes(key)) pushHit(partial, province, district, zips, 1);
    }
  }

  const seen = new Set<string>();
  const out: AddressHit[] = [];
  for (const hit of [...exact, ...starts, ...partial]) {
    const id = `${hit.province}|${hit.district}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/** รหัสไปรษณีย์ 5 หลัก → อำเภอ/จังหวัดที่ใช้รหัสนั้น (มักได้ 1 รายการ, บางรหัสได้หลายอำเภอ) */
export function resolvePostal(code: string): AddressHit[] {
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length !== 5) return [];
  return searchAddress(digits, 50).filter((h) => h.postalCodes.includes(digits));
}

/** ชื่ออำเภอ/เขต → รายการที่ตรงเป๊ะ (ถ้าซ้ำหลายจังหวัดจะคืนหลายรายการ) */
export function resolveDistrict(name: string): AddressHit[] {
  const key = normalizeThaiPlace(name);
  if (key.length < 2) return [];
  return searchAddress(name, 50).filter((h) => normalizeThaiPlace(h.district) === key);
}

/** อำเภอทั้งหมดของจังหวัด */
export function districtsOf(province: string): string[] {
  const key = normalizeThaiPlace(province);
  const found = THAI_PROVINCES.find((p) => normalizeThaiPlace(p) === key || p === province);
  return found ? Object.keys(THAI_ADDRESS[found] || {}) : [];
}

/** รหัสไปรษณีย์ของ อำเภอ+จังหวัด (คืน [] ถ้าไม่พบ) */
export function postalFor(province: string, district: string): string[] {
  const key = normalizeThaiPlace(province);
  const dKey = normalizeThaiPlace(district);
  const p = THAI_PROVINCES.find((x) => normalizeThaiPlace(x) === key || x === province);
  if (!p) return [];
  const d = Object.keys(THAI_ADDRESS[p] || {}).find((x) => normalizeThaiPlace(x) === dKey || x === district);
  return d ? THAI_ADDRESS[p][d] || [] : [];
}

/** เติมที่อยู่อัตโนมัติจากคีย์ค้นหา — คืนเฉพาะเมื่อมั่นใจ (ผู้เรียกเลือกใช้ได้เอง) */
export function autoFillFromQuery(query: string, current: { province?: string; district?: string; postalCode?: string }) {
  const raw = String(query || '').trim();
  const digits = raw.replace(/\D/g, '');
  const patch: { province?: string; district?: string; postalCode?: string; hits: AddressHit[] } = { hits: [] };

  if (digits.length >= 3 && digits.length <= 5 && !/[ก-๙a-z]/i.test(raw)) {
    const hits = searchAddress(digits, 8);
    patch.hits = hits;
    const exact = digits.length === 5 ? hits.filter((h) => h.postalCodes.includes(digits)) : [];
    if (exact.length === 1) {
      patch.province = exact[0].province;
      patch.district = exact[0].district;
      patch.postalCode = digits;
    }
    return patch;
  }

  const hits = searchAddress(raw, 8);
  patch.hits = hits;
  const exact = hits.filter((h) => h.score === 3);
  if (exact.length === 1) {
    patch.province = exact[0].province;
    patch.district = exact[0].district;
    patch.postalCode = exact[0].postalCodes[0] || current.postalCode;
    return patch;
  }
  const sameProvinceOnly = hits.filter((h) => normalizeThaiPlace(h.province) === normalizeThaiPlace(raw));
  if (sameProvinceOnly.length >= 1 && THAI_PROVINCES.some((p) => normalizeThaiPlace(p) === normalizeThaiPlace(raw))) {
    patch.province = sameProvinceOnly[0].province;
  }
  return patch;
}

export { THAI_ADDRESS, THAI_PROVINCES };
