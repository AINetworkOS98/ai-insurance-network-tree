import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, createEmailToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';
import { sendToGoogleSheet } from '@/lib/googleSheet';

// POST /api/auth/register — สเปคหมวด 3+4
// สมัครด้วยอีเมล + รหัสผ่าน + ชื่อผู้ใช้ | บันทึก PDPA/Marketing consent เพื่อตรวจสอบย้อนหลังได้
// ทุกคนเริ่มที่ rankLevel 0 (ผู้สนใจทั่วไป) — ไม่มีสิทธิเลือกตำแหน่งเอง
// ทำงานเป็น transaction เดียว: user + authIdentity + referralCode + sponsorship
//   + placementQueue + ConsentRecord + AuditLog + email token + EventOutbox
// ห้ามคืน ok:true แบบ mock เมื่อฐานข้อมูลล้มเหลว

const PDPA_VERSION = '1.0';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digits(s: any){ return String(s ?? '').replace(/\D/g, ''); }

export async function POST(req: NextRequest){
  try{
    const body = await req.json();
    const {
      firstName, lastName, email, phone, password, confirm,
      username, nickname, occupation, birthDate,
      referralCode, referral_code,
      province, district, subdistrict, addressLine, zipCode, lineId, facebookUrl, tiktokUrl,
      consentPdpa, consentMarketing,
    } = body || {};

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    // ── 1) Validation ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อ client) ──
    const fn = String(firstName ?? '').trim();
    const ln = String(lastName ?? '').trim();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const normalizedUsername = String(username ?? '').trim().toLowerCase();
    const pwd = String(password ?? '');
    const phoneDigits = digits(phone);

    if(!fn || !ln) return NextResponse.json({ ok:false, error:'กรอกชื่อและนามสกุลให้ครบ' }, { status:400 });
    if(!EMAIL_RE.test(normalizedEmail)) return NextResponse.json({ ok:false, error:'อีเมลไม่ถูกต้อง' }, { status:400 });
    if(normalizedUsername.length < 4) return NextResponse.json({ ok:false, error:'ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร' }, { status:400 });
    if(!/^[a-z0-9._-]+$/.test(normalizedUsername)) return NextResponse.json({ ok:false, error:'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - เท่านั้น' }, { status:400 });
    if(pwd.length < 8) return NextResponse.json({ ok:false, error:'รหัสผ่านต้องมีอย่างน้อย 8 อักขระ' }, { status:400 });
    if(confirm !== undefined && pwd !== String(confirm)) return NextResponse.json({ ok:false, error:'ยืนยันรหัสผ่านไม่ตรงกัน' }, { status:400 });
    if(phoneDigits && (phoneDigits.length < 9 || phoneDigits.length > 10)) return NextResponse.json({ ok:false, error:'เบอร์โทรไม่ถูกต้อง' }, { status:400 });
    if(consentPdpa !== true) return NextResponse.json({ ok:false, error:'กรุณายอมรับนโยบายความเป็นส่วนตัว (PDPA) ก่อนสมัคร' }, { status:400 });

    // ── 2) กันข้อมูลซ้ำ ──
    const existing = await prisma.user.findUnique({ where:{ email: normalizedEmail } }).catch(()=>null);
    if(existing) return NextResponse.json({ ok:false, error:'อีเมลนี้ถูกใช้งานแล้ว — หากเคยสมัครด้วย Google ให้ใช้เมนูเชื่อมบัญชี' }, { status:409 });
    const usernameTaken = await prisma.user.findUnique({ where:{ username: normalizedUsername } }).catch(()=>null);
    if(usernameTaken) return NextResponse.json({ ok:false, error:'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' }, { status:409 });
    if(phoneDigits){
      const phoneExists = await prisma.user.findUnique({ where:{ phone: phoneDigits } }).catch(()=>null);
      if(phoneExists) return NextResponse.json({ ok:false, error:'เบอร์โทรนี้ถูกใช้งานแล้ว' }, { status:409 });
    }

    // ── 3) รหัสผู้แนะนำ ──
    const rawRef = String(referralCode || referral_code || '').trim().toUpperCase() || null;
    let sponsorUser: any = null;
    if(rawRef){
      let found: any = await prisma.user.findUnique({ where:{ referralCode: rawRef } }).catch(()=>null);
      if(!found){
        const rc: any = await prisma.referralCode.findUnique({ where:{ code: rawRef }, include:{ user:true } }).catch(()=>null);
        found = rc?.user || null;
      }
      if(!found) return NextResponse.json({ ok:false, error:'รหัสผู้แนะนำไม่ถูกต้อง กรุณาตรวจสอบหรือลบออก' }, { status:400 });
      if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(found.status))){
        return NextResponse.json({ ok:false, error:'ผู้แนะนำนี้ไม่สามารถรับการแนะนำได้ในขณะนี้' }, { status:400 });
      }
      const rcActive: any = await prisma.referralCode.findUnique({ where:{ code: rawRef } }).catch(()=>null);
      if(rcActive && rcActive.isActive === false){
        return NextResponse.json({ ok:false, error:'รหัสผู้แนะนำนี้ถูกปิดการใช้งาน' }, { status:400 });
      }
      sponsorUser = found;
    } else {
      // ไม่มีรหัส → ผูกผู้แนะนำราก (admin หลัก) เสมอ — สมาชิกทุกคนต้องมี upline
      const { getRootSponsor } = await import('@/lib/admin');
      sponsorUser = await getRootSponsor().catch(()=>null);
    }

    const pwdHash = await hashPassword(pwd);
    const displayName = `${fn} ${ln}`;
    const dobRaw = birthDate ? new Date(String(birthDate)) : null;
    const dob = dobRaw && !isNaN(dobRaw.getTime()) ? dobRaw : null;
    const { raw: emailToken, hash: emailTokenHash } = createEmailToken();
    const verifyUrl = `${process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${emailToken}&email=${encodeURIComponent(normalizedEmail)}`;

    // ── 4) Transaction เดียว (atomic) ──
    let created: any = null;
    for(let attempt=0; attempt<3 && !created; attempt++){
      try{
        created = await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data:{
              email: normalizedEmail,
              username: normalizedUsername,
              nickname: nickname ? String(nickname).trim() : null,
              firstName: fn,
              lastName: ln,
              displayName,
              phone: phoneDigits || null,
              occupation: occupation ? String(occupation).trim() : null,
              dob,
              passwordHash: pwdHash,
              memberCode: generateMemberCode(),
              referralCode: generateReferralCode(),
              province: province ? String(province).trim() : null,
              district: district ? String(district).trim() : null,
              subdistrict: subdistrict ? String(subdistrict).trim() : null,
              addressLine: addressLine ? String(addressLine).trim() : null,
              zipCode: zipCode ? String(zipCode).trim() : null,
              lineId: lineId ? String(lineId).trim() : null,
              facebookUrl: facebookUrl ? String(facebookUrl).trim() : null,
              tiktokUrl: tiktokUrl ? String(tiktokUrl).trim() : null,
              sponsorId: sponsorUser?.id || null,
              status: 'PENDING',
              rankLevel: 0,
              pdpaConsentVersion: PDPA_VERSION,
              pdpaConsentedAt: new Date(),
            }
          });

          await tx.authIdentity.create({ data:{ userId: user.id, provider:'password', email: normalizedEmail } });
          await tx.referralCode.create({ data:{ userId: user.id, code: user.referralCode } });

          // Consent log — บันทึกทั้งยินยอมและไม่ยินยอม เพื่อตรวจสอบย้อนหลังได้
          await tx.consentRecord.createMany({
            data: [
              { userId: user.id, type:'PDPA', version: PDPA_VERSION, granted: true, source:'register', ip },
              { userId: user.id, type:'MARKETING', version: PDPA_VERSION, granted: consentMarketing === true, source:'register', ip },
            ]
          });

          if(sponsorUser){
            await tx.sponsorship.create({ data:{ childId: user.id, sponsorId: sponsorUser.id, referralCode: rawRef } });
          }
          // ทุกคนเข้าคิวผังจากฐานข้อมูลเดียวกัน — จัดวางเมื่อผ่านสถานะ ACTIVE
          await tx.placementQueue.create({
            data:{
              userId: user.id,
              sponsorId: sponsorUser?.id || null,
              reason: rawRef
                ? 'สมัครด้วยรหัสผู้แนะนำ — รออนุมัติและจัดวางผัง'
                : 'ไม่มีรหัสผู้แนะนำ — ผูกผู้แนะนำราก รออนุมัติและจัดวางผัง',
            }
          }).catch(()=>null);

          await tx.auditLog.create({ data:{ userId: user.id, action:'user.register', entity:'User', entityId:user.id, newValue:{ email: normalizedEmail, username: normalizedUsername, rankLevel:0, sponsorId: sponsorUser?.id || null, pdpaVersion: PDPA_VERSION } } });
          await tx.auditLog.create({ data:{ userId: user.id, action:'consent.recorded', entity:'ConsentRecord', entityId:user.id, newValue:{ pdpa:true, marketing: consentMarketing === true, version: PDPA_VERSION, source:'register' } } });

          await tx.emailVerificationToken.create({ data:{ userId: user.id, tokenHash: emailTokenHash, expiresAt: new Date(Date.now() + 24*60*60*1000) } });

          // คิวอีเมลยืนยันจริง — worker /api/cron/email-sync เป็นผู้ส่งผ่าน Resend
          // (เดิมสร้าง token แต่ไม่มีใครส่งอีเมล ทำให้สัญญา "ยืนยันอีเมล 24 ชม." เป็นโมฆะ)
          await tx.emailMessage.create({
            data:{
              // ไม่ใส่ eventId — คอลัมน์เป็น @db.Uuid แต่คีย์ของเราเป็นสตริง (ใช้ idempotencyKey กันซ้ำ)
              idempotencyKey: `emailverify:${user.id}`,
              toEmail: normalizedEmail,
              toUserId: user.id,
              subject: 'ยืนยันอีเมลของคุณ — AI Insurance Network Tree',
              bodyHtml:
                `<p>สวัสดีคุณ ${displayName}</p>` +
                `<p>ขอบคุณที่สมัครสมาชิกกับเรา รหัสสมาชิกของคุณคือ <b>${user.memberCode}</b></p>` +
                `<p>กรุณายืนยันอีเมลภายใน 24 ชั่วโมง เพื่อเปิดใช้งานบัญชีอย่างสมบูรณ์</p>` +
                `<p><a href="${verifyUrl}">ยืนยันอีเมลของฉัน</a></p>` +
                `<p>หากคุณไม่ได้สมัครสมาชิก กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>`,
              status: 'QUEUED',
            }
          }).catch(()=>null);

          // EventOutbox — งานปลายทาง (n8n / แจ้งเตือน) แบบ durable ไม่หายเมื่อ process ตาย
          await tx.eventOutbox.create({
            data:{
              eventId: `registration:${user.id}`,
              eventType: 'member.registered',
              payload: { userId: user.id },
              channel: 'registration',
              status: 'pending',
            }
          }).catch(()=>null);

          return user;
        }, { timeout: 20000 });
      }catch(e:any){
        if(String(e?.code) === 'P2002'){
          const target = String(e?.meta?.target || '');
          if(target.includes('username')) return NextResponse.json({ ok:false, error:'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' }, { status:409 });
          if(target.includes('email')) return NextResponse.json({ ok:false, error:'อีเมลนี้ถูกใช้งานแล้ว' }, { status:409 });
          if(target.includes('phone')) return NextResponse.json({ ok:false, error:'เบอร์โทรนี้ถูกใช้งานแล้ว' }, { status:409 });
          if(attempt < 2) continue; // ชนกันที่รหัสสุ่ม — ลองใหม่
        }
        throw e;
      }
    }
    if(!created) return NextResponse.json({ ok:false, error:'สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่' }, { status:500 });

    const user = created;

    // ── 5) แจ้งเตือน (best-effort — ห้ามทำให้การสมัครล้ม) ──
    try{
      const { emitNotification, notifyAdmins } = await import('@/lib/notify');
      await emitNotification({ userId: user.id, type:'register_welcome', title:'สมัครสมาชิกสำเร็จ', body:`ยินดีต้อนรับ ${displayName} — รหัสสมาชิก ${user.memberCode}`, referenceId:'/members' }).catch(()=>null);
      if(sponsorUser){
        await emitNotification({ userId: sponsorUser.id, type:'new_downline', title:'มีสมาชิกใหม่ในสายงาน', body:`${displayName} สมัครด้วยรหัสผู้แนะนำของคุณ`, referenceId:'/members' }).catch(()=>null);
      }
      await notifyAdmins({ type:'member_registered', title:'สมาชิกสมัครใหม่', body:`${displayName} (${normalizedEmail})`, referenceId:'/admin/members' }).catch(()=>null);
    }catch{}

    // ── 6) Google Sheet (fire-and-forget) ──
    (async () => {
      try{
        await sendToGoogleSheet({ type:'register', firstName:fn, lastName:ln, email:normalizedEmail, phone:phoneDigits||'', lineId:lineId||'', referralCode:rawRef||'', province:province||'', district:district||'', subdistrict:subdistrict||'', addressLine:addressLine||'', zipCode:zipCode||'', memberCode:user.memberCode, username: normalizedUsername, occupation: occupation||'' });
      }catch{}
    })();

    return NextResponse.json({
      ok: true,
      userId: user.id,
      memberCode: user.memberCode,
      referralCode: user.referralCode,
      displayName: user.displayName || displayName,
      createdAt: user.createdAt,
      sponsor: sponsorUser ? { id: sponsorUser.id, displayName: sponsorUser.displayName || `${sponsorUser.firstName} ${sponsorUser.lastName}` } : null,
      message: 'สมัครสำเร็จ — กรุณายืนยันอีเมลภายใน 24 ชั่วโมง',
      requiresEmailVerification: true,
      ...(process.env.NODE_ENV !== 'production' ? { devVerifyUrl: verifyUrl } : {}),
    });
  }catch(e:any){
    console.error('register error', e?.code || e?.message);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status:500 });
  }
}
