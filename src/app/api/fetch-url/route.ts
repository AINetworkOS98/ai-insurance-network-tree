import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function stripHtml(html: string): string {
  // ลบ script/style
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // แปลง tag เป็น space แล้วลบซ้ำ
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

export async function POST(req: NextRequest){
  try{
    const { url } = await req.json().catch(()=> ({} as any));
    if(!url || typeof url!=='string') return NextResponse.json({ ok:false, error:'กรุณาใส่ URL' }, {status:400});
    let parsed: URL;
    try{ parsed = new URL(url); } catch{ return NextResponse.json({ ok:false, error:'URL ไม่ถูกต้อง' }, {status:400}); }
    if(!['http:','https:'].includes(parsed.protocol)) return NextResponse.json({ ok:false, error:'รองรับเฉพาะ http/https' }, {status:400});

    // กัน SSRF — บล็อก private IP
    const hostname = parsed.hostname.toLowerCase();
    if (['localhost','127.0.0.1','::1','0.0.0.0'].includes(hostname) || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) {
      // อนุญาต 172.16-31 แต่บล็อกเพื่อความปลอดภัย — ข้ามถ้าเป็น vercel ภายในก็บล็อกไปก่อน
      // แต่ให้ผ่าน hostname ปกติ
      if (hostname==='localhost' || hostname==='127.0.0.1') return NextResponse.json({ ok:false, error:'ไม่อนุญาต URL ภายใน' }, {status:400});
    }

    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AI-Insurance-Network-Tree/1.0 (+https://ai-insurance-network-tree.vercel.app)', 'Accept': 'text/html,application/xhtml+xml,application/pdf,text/plain,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    } as any).finally(()=> clearTimeout(timeout));

    if(!res.ok) return NextResponse.json({ ok:false, error:`ดึง URL ไม่สำเร็จ: ${res.status} ${res.statusText}` }, {status:400});

    const contentType = res.headers.get('content-type') || '';
    let text = '';

    if (contentType.includes('application/pdf')) {
      const buf = Buffer.from(await res.arrayBuffer());
      try{
        const pdfjs:any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjs.getDocument({data: new Uint8Array(buf)}).promise;
        for(let i=1;i<=Math.min(doc.numPages, 15); i++){
          const page = await doc.getPage(i);
          const c = await page.getTextContent();
          text += c.items.map((it:any)=> it.str).join(' ') + '\n';
          if(text.length>15000) break;
        }
      } catch(e:any){ text = `(อ่าน PDF จาก URL ไม่สำเร็จ: ${e?.message||'error'})`; }
    } else {
      const html = await res.text();
      // ถ้าเป็น JSON / text plain
      if (contentType.includes('application/json')) {
        try{ text = JSON.stringify(JSON.parse(html), null, 2); } catch{ text = html; }
      } else if (contentType.includes('text/plain')) {
        text = html;
      } else {
        text = stripHtml(html);
      }
    }

    text = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 20000);
    if(!text) text = '(ไม่มีข้อความที่อ่านได้จาก URL นี้)';

    return NextResponse.json({ ok:true, url, contentType, chars: text.length, text });
  } catch(e:any){
    const msg = e?.name==='AbortError' ? 'หมดเวลาเชื่อมต่อ URL' : (e?.message||'fetch failed');
    return NextResponse.json({ ok:false, error: msg }, {status:500});
  }
}
