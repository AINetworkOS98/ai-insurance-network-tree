import { NextResponse } from 'next/server';
import { extractReceiptData, OCRError } from '@/lib/ocr';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SIZE = 4 * 1024 * 1024; // 4MB (Vercel body limit)
const ALLOWED = /^(image\/(jpeg|png|webp))$/i;

// ตรวจชื่อผู้รับ/บริษัทเทียบกับบริษัทที่กำหนด (warning ไม่ reject)
function companyWarning(result: { receiverName: string | null; companyName: string | null }): string | null {
  const haystack = `${result.receiverName || ''} ${result.companyName || ''}`.toLowerCase();
  const matched =
    haystack.includes('ไทยประกันชีวิต') ||
    haystack.includes('ไทยประกัน') ||
    haystack.includes('thai life') ||
    haystack.includes('thailife');
  return matched ? null : 'ไม่พบข้อมูลผู้รับที่ตรงกับบริษัทที่กำหนด กรุณาตรวจสอบเอกสาร';
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 });
    }
    if (!ALLOWED.test(file.type)) {
      return NextResponse.json({ success: false, error: 'รองรับเฉพาะ JPG / PNG / WEBP' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'ไฟล์ใหญ่เกิน 4MB กรุณาลดขนาดรูป' }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString('base64');

    const result = await extractReceiptData(base64, file.type);

    const warning = companyWarning(result);
    const status =
      result.confidence >= 0.8 ? 'อ่านข้อมูลสำเร็จ' : 'ต้องตรวจสอบด้วยตนเอง';

    return NextResponse.json({
      ...result,
      status,
      companyWarning: warning,
      needsManualReview: result.confidence < 0.8,
    });
  } catch (e: any) {
    if (e instanceof OCRError) {
      return NextResponse.json(
        { success: false, error: e.thaiMessage, code: e.code },
        { status: e.status }
      );
    }
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการอ่านเอกสาร กรุณาลองใหม่' },
      { status: 500 }
    );
  }
}
