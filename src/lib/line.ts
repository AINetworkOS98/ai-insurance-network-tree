// LINE Messaging API — server-side เท่านั้น (env vars, ห้ามใส่ secret ใน frontend)
const LINE_API = 'https://api.line.me/v2/bot/message/push';

export interface LineConfig {
  configured: boolean;
  channelAccessToken: string;
  targetId: string;
}

export function getLineConfig(): LineConfig {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  const targetId = process.env.LINE_TARGET_ID || '';
  return {
    configured: !!(channelAccessToken && targetId),
    channelAccessToken,
    targetId,
  };
}

export async function sendLineMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const { configured, channelAccessToken, targetId } = getLineConfig();
  if (!configured) {
    return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN / LINE_TARGET_ID ยังไม่ได้ตั้งค่าใน Environment Variables' };
  }
  try {
    const res = await fetch(LINE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ to: targetId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `LINE API ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'LINE send failed' };
  }
}
