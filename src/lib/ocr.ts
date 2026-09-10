// OCR ใบเสร็จ/สลิป — รองรับ 2 provider: OpenAI GPT-4o (หลัก) และ Gemini (สำรอง)
// ใช้ key ผ่าน process.env ฝั่ง server เท่านั้น (ห้าม NEXT_PUBLIC_*)

export interface OCRResult {
  success: boolean;
  documentType: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  time: string | null;
  referenceNumber: string | null;
  payerName: string | null;
  receiverName: string | null;
  bank: string | null;
  receiptNumber: string | null;
  companyName: string | null;
  confidence: number;
  provider: 'openai' | 'gemini';
  rawText?: string;
}

export class OCRError extends Error {
  status: number;
  code: string;
  thaiMessage: string;
  constructor(status: number, code: string, thaiMessage: string) {
    super(thaiMessage);
    this.status = status;
    this.code = code;
    this.thaiMessage = thaiMessage;
  }
}

const PROMPT = [
  'อ่านข้อมูลจากภาพใบเสร็จ/สลิปโอนเงินนี้ แล้วตอบเป็น JSON เท่านั้น',
  'ห้ามใส่ Markdown ห้ามใส่คำอธิบาย ห้ามเดาข้อมูลที่มองไม่เห็น ถ้าไม่พบข้อมูลให้คืนค่า null',
  'รูปแบบ JSON:',
  '{',
  '  "documentType": "bank_slip | receipt | tax_document | other",',
  '  "amount": <ยอดเงินรวมเป็นตัวเลข เช่น 12500.00>,',
  '  "currency": "THB",',
  '  "date": "YYYY-MM-DD",',
  '  "time": "HH:MM",',
  '  "referenceNumber": "<เลขอ้างอิง/เลขรายการ>",',
  '  "payerName": "<ชื่อผู้จ่าย>",',
  '  "receiverName": "<ชื่อผู้รับ/บริษัท>",',
  '  "bank": "<ธนาคาร เช่น SCB, KBANK, KTB, BBL, BAY>",',
  '  "receiptNumber": "<เลขใบเสร็จ>",',
  '  "companyName": "<ชื่อบริษัทที่ออกเอกสาร>",',
  '  "confidence": <0.0 ถึง 1.0 ความมั่นใจในการอ่านภาพรวม>',
  '}',
].join('\n');

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const normalized = Number(
    String(raw)
      .replace(/[฿]/g, '')
      .replace(/THB|thb/gi, '')
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '')
  );
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function parseResponse(rawText: string): any {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (!m) throw new OCRError(422, 'INVALID_JSON', 'อ่านข้อมูลจากเอกสารไม่สำเร็จ (ผลลัพธ์ไม่ถูกต้อง)');
    parsed = JSON.parse(m[0]);
  }
  return parsed;
}

// ── OpenAI GPT-4o ────────────────────────────────────────────────
async function extractWithOpenAI(imageBase64: string, mime: string): Promise<OCRResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OCRError(500, 'MISSING_KEY', 'OPENAI_API_KEY is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) throw new OCRError(401, 'INVALID_KEY', 'API Key ไม่ถูกต้อง (ตรวจสอบ OPENAI_API_KEY)');
      if (response.status === 429) throw new OCRError(429, 'QUOTA_EXCEEDED', 'โควตา OpenAI หมด กรุณาลองใหม่ภายหลัง');
      if (response.status >= 500) throw new OCRError(502, 'PROVIDER_DOWN', 'ไม่สามารถเชื่อมต่อ OpenAI ได้ กรุณาลองใหม่');
      throw new OCRError(response.status, 'OCR_FAILED', 'อ่านเอกสารไม่สำเร็จ กรุณาลองใหม่');
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';
    const parsed = parseResponse(rawText);
    return buildResult(parsed, rawText, 'openai');
  } catch (e: any) {
    clearTimeout(timeout);
    if (e instanceof OCRError) throw e;
    if (e.name === 'AbortError') throw new OCRError(504, 'TIMEOUT', 'OpenAI ใช้เวลานานเกินไป กรุณาลองใหม่');
    throw new OCRError(500, 'OCR_FAILED', 'เกิดข้อผิดพลาดในการอ่านเอกสาร กรุณาลองใหม่');
  }
}

// ── Gemini ───────────────────────────────────────────────────────
async function extractWithGemini(imageBase64: string, mime: string): Promise<OCRResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.includes('placeholder')) {
    throw new OCRError(500, 'MISSING_KEY', 'GEMINI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: imageBase64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) throw new OCRError(401, 'INVALID_KEY', 'API Key ไม่ถูกต้อง (ตรวจสอบ GEMINI_API_KEY)');
      if (response.status === 429) throw new OCRError(429, 'QUOTA_EXCEEDED', 'โควตา Gemini หมด กรุณาลองใหม่ภายหลัง');
      if (response.status >= 500) throw new OCRError(502, 'PROVIDER_DOWN', 'ไม่สามารถเชื่อมต่อ Gemini ได้ กรุณาลองใหม่');
      throw new OCRError(response.status, 'OCR_FAILED', 'อ่านเอกสารไม่สำเร็จ กรุณาลองใหม่');
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseResponse(rawText);
    return buildResult(parsed, rawText, 'gemini');
  } catch (e: any) {
    clearTimeout(timeout);
    if (e instanceof OCRError) throw e;
    if (e.name === 'AbortError') throw new OCRError(504, 'TIMEOUT', 'Gemini ใช้เวลานานเกินไป กรุณาลองใหม่');
    throw new OCRError(500, 'OCR_FAILED', 'เกิดข้อผิดพลาดในการอ่านเอกสาร กรุณาลองใหม่');
  }
}

function buildResult(parsed: any, rawText: string, provider: 'openai' | 'gemini'): OCRResult {
  const amount = parseAmount(parsed.amount);
  if (amount === null) {
    throw new OCRError(422, 'NO_AMOUNT', 'ไม่สามารถอ่านยอดเงินจากเอกสารได้ กรุณาถ่ายรูปให้ชัดขึ้น');
  }
  const confidence = Number(parsed.confidence);
  const finalConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0.5;

  return {
    success: true,
    documentType: parsed.documentType || null,
    amount,
    currency: parsed.currency || 'THB',
    date: parsed.date || null,
    time: parsed.time || null,
    referenceNumber: parsed.referenceNumber || null,
    payerName: parsed.payerName || null,
    receiverName: parsed.receiverName || null,
    bank: parsed.bank || null,
    receiptNumber: parsed.receiptNumber || null,
    companyName: parsed.companyName || null,
    confidence: finalConfidence,
    provider,
    rawText,
  };
}

// ── เลือก provider อัตโนมัติ: OpenAI ก่อน (ถ้ามี key) ไม่งั้น Gemini ──
export async function extractReceiptData(imageBase64: string, mime: string): Promise<OCRResult> {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';

  if (hasOpenAI) {
    return extractWithOpenAI(imageBase64, mime);
  }
  if (hasGemini) {
    return extractWithGemini(imageBase64, mime);
  }
  throw new OCRError(500, 'MISSING_KEY', 'ยังไม่ได้ตั้งค่า API key สำหรับ OCR (OPENAI_API_KEY หรือ GEMINI_API_KEY)');
}

// ── Health check ──────────────────────────────────────────────────
export function ocrHealth() {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const hasGemini = !!gemini && gemini !== 'MY_GEMINI_API_KEY' && !gemini.includes('placeholder');
  const configured = hasOpenAI || hasGemini;
  return {
    ocr: configured ? 'ready' : 'not_configured',
    geminiConfigured: hasGemini,
    openaiConfigured: hasOpenAI,
    provider: hasOpenAI ? 'openai' : hasGemini ? 'gemini' : null,
  };
}
