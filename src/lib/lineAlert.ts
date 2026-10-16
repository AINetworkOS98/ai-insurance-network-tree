// lineAlert.ts — ยิงแจ้งเตือนเข้าหา LINE ของผู้ดูแล (Messaging API)
// ใช้ร่วมกันทุกจุดที่ต้อง "เด้ง LINE": ใบสมัครตัวแทนใหม่, ข้อความติดต่อ Support, ฯลฯ
// ถ้ายังไม่ได้ตั้งค่า LINE ให้เก็บข้อความเข้าคิว (EventOutbox channel='line') ไม่ให้ข้อมูลหาย
import { prisma } from '@/lib/prisma';
import { sendLineMessage, getLineConfig } from '@/lib/line';

export type LineAlertResult = { configured: boolean; sent: boolean; error?: string | null };

export function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
}

export async function sendLineAlert(o: { text: string; refId: string; kind?: string }): Promise<LineAlertResult> {
  const kind = o.kind || 'alert';
  const cfg = getLineConfig();

  if (!cfg.configured) {
    await prisma.eventOutbox
      .create({
        data: {
          eventId: `line:${kind}:${o.refId}:${Date.now()}`,
          eventType: `line_alert_${kind}`,
          channel: 'line',
          recipientId: o.refId,
          payload: { text: o.text } as any,
          status: 'pending',
        } as any,
      })
      .catch(() => null);
    return { configured: false, sent: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN / LINE_TARGET_ID' };
  }

  const res = await sendLineMessage(o.text);
  if (!res.ok) {
    await prisma.eventOutbox
      .create({
        data: {
          eventId: `line:${kind}:${o.refId}:${Date.now()}`,
          eventType: `line_alert_${kind}`,
          channel: 'line',
          recipientId: o.refId,
          payload: { text: o.text } as any,
          status: 'pending',
        } as any,
      })
      .catch(() => null);
  }
  return { configured: true, sent: res.ok, error: res.ok ? null : (res.error || 'send failed') };
}
