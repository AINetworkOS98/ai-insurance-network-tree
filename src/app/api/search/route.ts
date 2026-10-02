import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory cache — ค้นหาซ้ำเรื่องเดิมตอบทันที (serverless: ต่อ instance)
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 นาที

function youtubeSearchUrl(q: string){ return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`; }

async function fetchWebLinks(q: string): Promise<{title:string; url:string; snippet:string}[]>{
  const tryUrls = [
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  ];
  // ขนานทั้ง 2 URL + timeout สั้น — ตัวไหนเสร็จก่อนใช้ก่อน
  const results = await Promise.allSettled(tryUrls.map(async (url)=>{
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(4000),
    });
    if(!res.ok) return [];
    const html = await res.text();
    const links: {title:string; url:string; snippet:string}[] = [];
    const rowRe = /<tr[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray|null;
    while((m = rowRe.exec(html)) && links.length<5){
      let href = m[1].replace(/&amp;/g,'&');
      let title = m[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim();
      let snippet = m[3].replace(/<[^>]+>/g,'').trim().slice(0,120);
      if(href.includes('uddg=')){ try{ const u = new URL('https://duckduckgo.com'+ href); const real=u.searchParams.get('uddg'); if(real) href = decodeURIComponent(real); }catch{} }
      if(href.startsWith('/l/?')){ try{ const u=new URL('https://duckduckgo.com'+href); const r=u.searchParams.get('uddg'); if(r) href=decodeURIComponent(r);}catch{} }
      if(title && href.startsWith('http')) links.push({title, url: href, snippet});
    }
    return links;
  }));
  for(const r of results){
    if(r.status==='fulfilled' && r.value.length>0) return r.value.slice(0,5);
  }
  return [];
}

export async function POST(req: NextRequest){
  try{
    const { query, mode } = await req.json().catch(()=> ({} as any));
    const q: string = (query||'').toString().trim().slice(0,300);
    if(!q) return NextResponse.json({ ok:false, error:'กรุณาใส่คำค้นหา' }, {status:400});
    const isSong = /(เพลง|music|song|youtube|ยูทูป|ฟังเพลง|อริสมันต์|อริสมัน)/i.test(q);
    const youtubeUrl = youtubeSearchUrl(q);

    // cache — ค้นหาซ้ำตอบทันที
    const cacheKey = `${q}|${isSong?'song':'web'}`;
    const hit = cache.get(cacheKey);
    if(hit && (Date.now()-hit.ts) < CACHE_TTL){
      return NextResponse.json(hit.data);
    }

    const webLinks = await fetchWebLinks(q);
    const links: {title:string; url:string; snippet:string; source:string}[] = [];
    if(isSong){
      links.push({ title: `YouTube — ค้นหา "${q}"`, url: youtubeUrl, snippet: 'เปิด YouTube เพื่อฟังเพลง/ดูวิดีโอที่เกี่ยวข้อง', source: 'youtube' });
    } else {
      links.push({ title: `YouTube — "${q}"`, url: youtubeUrl, snippet: 'ค้นหาวิดีโอที่เกี่ยวข้องบน YouTube', source: 'youtube' });
    }
    for(const w of webLinks){
      links.push({ ...w, source: 'web' });
    }
    if(webLinks.length===0){
      links.push({ title: `Google — ค้นหา "${q}"`, url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, snippet: 'ค้นหาบน Google', source:'web' });
    }
    const data = { ok:true, query: q, mode: mode||'SMART', isSong, youtubeUrl, links: links.slice(0,8) };
    cache.set(cacheKey, { data, ts: Date.now() });
    if(cache.size > 200){ const oldest = cache.keys().next().value; if(oldest) cache.delete(oldest); }
    return NextResponse.json(data);
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'search failed' }, {status:500});
  }
}

export async function GET(req: NextRequest){
  const q = req.nextUrl.searchParams.get('q') || '';
  if(!q) return NextResponse.json({ ok:false, error:'ใส่ ?q=' }, {status:400});
  const fakeReq = { json: async()=> ({query:q}), nextUrl: req.nextUrl } as any;
  return POST(fakeReq);
}
