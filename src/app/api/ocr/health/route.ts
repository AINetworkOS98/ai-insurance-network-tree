import { NextResponse } from 'next/server';
import { ocrHealth } from '@/lib/ocr';

export const runtime = 'nodejs';

export async function GET() {
  // คืนสถานะโดยไม่เปิดเผย API key
  return NextResponse.json(ocrHealth());
}
