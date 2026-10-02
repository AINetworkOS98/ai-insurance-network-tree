// ส่งข้อมูลเข้่า Google Sheets ผ่าน Apps Script Web App (fire-and-forget)
// ใช้ร่วมกันทั้ง contact form และ register form
export async function sendToGoogleSheet(data: Record<string, any>) {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'GOOGLE_SHEET_WEBHOOK_URL ยังไม่ได้ตั้งค่า' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `Google Sheet ตอบ ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Google Sheet send failed' };
  }
}