// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/richmenu — สร้าง/อัปโหลด/ตั้งค่าเริ่มต้น/ลบ ริชเมนูจริงบน LINE
//   POST   multipart/form-data: image (PNG/JPEG), name, chatBarText, size, areas(JSON), setDefault
//   PATCH  JSON { id, action: 'default' | 'clear-default' | 'clear-user' }
//   DELETE ?id=            — ลบออกจาก LINE
//   GET                    — รายการริชเมนู + ตัวที่ตั้งเป็นค่าเริ่มต้น
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import {
  RICHMENU_SIZES, richMenuList, getDefaultRichMenuId, createRichMenu, uploadRichMenuImage,
  setDefaultRichMenu, clearDefaultRichMenu, deleteRichMenu, loadConfig, lineEnvStatus,
} from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** อ่านขนาดภาพจาก header (PNG/JPEG) เพื่อกันอัปโหลดผิดสเปกก่อนยิง LINE */
function imageSize(buf: Buffer): { width: number; height: number; type: string } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: 'jpeg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

function sanitizeAreas(areas: any, size: { width: number; height: number }) {
  const list = Array.isArray(areas) ? areas : [];
  const out: any[] = [];
  for (const a of list.slice(0, 20)) {
    const b = a?.bounds || {};
    const x = Math.max(0, Math.round(Number(b.x) || 0));
    const y = Math.max(0, Math.round(Number(b.y) || 0));
    const w = Math.max(1, Math.round(Number(b.width) || 0));
    const h = Math.max(1, Math.round(Number(b.height) || 0));
    if (x + w > size.width || y + h > size.height) return { error: `พื้นที่ปุ่มเกินขอบภาพ (x${x}+${w} > ${size.width} หรือ y${y}+${h} > ${size.height})` };
    const act = a?.action || {};
    let action: any = null;
    if (act.type === 'uri' && act.uri) action = { type: 'uri', uri: String(act.uri) };
    else if (act.type === 'postback') action = { type: 'postback', data: String(act.data || 'menu'), displayText: act.displayText ? String(act.displayText).slice(0, 300) : undefined };
    else if (act.type === 'richmenuswitch' && act.richMenuAliasId) action = { type: 'richmenuswitch', richMenuAliasId: String(act.richMenuAliasId), data: String(act.data || 'switch') };
    else if (act.text) action = { type: 'message', text: String(act.text).slice(0, 300) };
    if (!action) return { error: `ปุ่มที่ ${out.length + 1} ยังไม่ได้ตั้งค่าการทำงาน (ข้อความ/ลิงก์)` };
    out.push({ bounds: { x, y, width: w, height: h }, action });
  }
  if (!out.length) return { error: 'ต้องมีอย่างน้อย 1 ปุ่ม' };
  return { areas: out };
}

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const env = lineEnvStatus();
    if (!env.tokenConfigured) return NextResponse.json({ ok: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN', env }, { status: 400 });
    const [menus, def, cfg] = await Promise.all([richMenuList(), getDefaultRichMenuId(), loadConfig()]);
    return NextResponse.json({ ok: true, richMenus: menus, defaultRichMenuId: def || (cfg as any).defaultRichMenuId || null, sizes: RICHMENU_SIZES });
  } catch (e: any) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const env = lineEnvStatus();
    if (!env.tokenConfigured) return NextResponse.json({ ok: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN (ตั้งใน Vercel แล้ว deploy ใหม่)' }, { status: 400 });

    const form = await req.formData();
    const sizeKey = String(form.get('size') || '2500x1686');
    const size = RICHMENU_SIZES[sizeKey] || RICHMENU_SIZES['2500x1686'];
    const name = String(form.get('name') || 'ริชเมนู').slice(0, 300);
    const chatBarText = String(form.get('chatBarText') || 'เมนู').slice(0, 14);
    const setDefault = String(form.get('setDefault') || '1') !== '0';
    const file = form.get('image');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'ต้องแนบไฟล์ภาพริชเมนู (PNG/JPEG)' }, { status: 400 });
    if (file.size > 1024 * 1024) return NextResponse.json({ ok: false, error: `ไฟล์ใหญ่เกิน 1 MB (ตอนนี้ ${(file.size / 1024).toFixed(0)} KB) — LINE จำกัด 1 MB` }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const dim = imageSize(buf);
    if (!dim) return NextResponse.json({ ok: false, error: 'อ่านไฟล์ภาพไม่ได้ — ต้องเป็น PNG หรือ JPEG' }, { status: 400 });
    if (dim.width !== size.width || dim.height !== size.height) {
      return NextResponse.json({ ok: false, error: `ขนาดภาพไม่ตรงสเปก: ได้ ${dim.width}×${dim.height} ต้องเป็น ${size.width}×${size.height} (LINE บังคับ)` }, { status: 400 });
    }

    let areas: any;
    try { areas = JSON.parse(String(form.get('areas') || '[]')); } catch { return NextResponse.json({ ok: false, error: 'areas ไม่ใช่ JSON ที่ถูกต้อง' }, { status: 400 }); }
    const clean = sanitizeAreas(areas, size);
    if ((clean as any).error) return NextResponse.json({ ok: false, error: (clean as any).error }, { status: 400 });

    const created = await createRichMenu({
      size: { width: size.width, height: size.height },
      selected: true,
      name,
      chatBarText,
      areas: (clean as any).areas,
    });
    if (!created.ok || !created.id) return NextResponse.json({ ok: false, error: created.error || 'สร้างริชเมนูไม่สำเร็จ' }, { status: 502 });

    const up = await uploadRichMenuImage(created.id, buf, dim.type === 'png' ? 'image/png' : 'image/jpeg');
    if (!up.ok) {
      await deleteRichMenu(created.id); // อัปโหลดไม่ผ่าน → ไม่ทิ้งริชเมนูเปล่าไว้
      return NextResponse.json({ ok: false, error: up.error || 'อัปโหลดภาพไม่สำเร็จ' }, { status: 502 });
    }

    let defaultSet = false;
    if (setDefault) {
      const d = await setDefaultRichMenu(created.id);
      defaultSet = d.ok;
      if (d.ok) await (prisma as any).lineOaConfig.upsert({ where: { id: 'default' }, create: { id: 'default', defaultRichMenuId: created.id }, update: { defaultRichMenuId: created.id } });
    }
    return NextResponse.json({ ok: true, richMenuId: created.id, areas: (clean as any).areas.length, defaultSet });
  } catch (e: any) { return fail(e, 'สร้างริชเมนูไม่สำเร็จ'); }
}

export async function PATCH(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (body.action === 'clear-default') {
      const r = await clearDefaultRichMenu();
      if (r.ok) await (prisma as any).lineOaConfig.upsert({ where: { id: 'default' }, create: { id: 'default', defaultRichMenuId: null }, update: { defaultRichMenuId: null } });
      return NextResponse.json({ ok: r.ok, error: r.error });
    }
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id' }, { status: 400 });
    const r = await setDefaultRichMenu(id);
    if (r.ok) await (prisma as any).lineOaConfig.upsert({ where: { id: 'default' }, create: { id: 'default', defaultRichMenuId: id }, update: { defaultRichMenuId: id } });
    return NextResponse.json({ ok: r.ok, error: r.error, richMenuId: id });
  } catch (e: any) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id' }, { status: 400 });
    const def = await getDefaultRichMenuId();
    if (def && def === id) await clearDefaultRichMenu();
    const r = await deleteRichMenu(id);
    const cfg: any = await loadConfig();
    if ((cfg as any).defaultRichMenuId === id) {
      await (prisma as any).lineOaConfig.update({ where: { id: 'default' }, data: { defaultRichMenuId: null } }).catch(() => null);
    }
    return NextResponse.json({ ok: r.ok, error: r.error });
  } catch (e: any) { return fail(e, 'ลบไม่สำเร็จ'); }
}
