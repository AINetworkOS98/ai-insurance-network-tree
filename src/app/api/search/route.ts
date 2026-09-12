import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function duckDuckGoUrl(q: string){ return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`; }
function youtubeSearchUrl(q: string){ return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`; }

async function fetchWebLinks(q: string): Promise<{title:string; url:string; snippet:string}[]>{
  const tryUrls = [
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  ];
  for(const url of tryUrls){
    try{
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(8000),
      });
      if(!res.ok) continue;
      const html = await res.text();
      const links: {title:string; url:string; snippet:string}[] = [];
      const titleRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      // lite: <a href="...">title</a> ... <td class="result-snippet">
      let m: RegExpExecArray|null;
      // For lite, rows are <tr> with link + snippet
      const rowRe = /<tr[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
      while((m = rowRe.exec(html)) && links.length<5){
        let href = m[1].replace(/&amp;/g,'&');
        let title = m[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim();
        let snippet = m[3].replace(/<[^>]+>/g,'').trim().slice(0,120);
        if(href.includes('uddg=')){
          try{ const u = new URL('https://duckduckgo.com'+ href); const real=u.searchParams.get('uddg'); if(real) href = decodeURIComponent(real); }catch{}
        }
        if(href.startsWith('/l/?')){ try{ const u=new URL('https://duckduckgo.com'+href); const r=u.searchParams.get('uddg'); if(r) href=decodeURIComponent(r);}catch{} }
        if(title && href.startsWith('http')) links.push({title, url: href, snippet});
      }
      if(links.length>0) return links;
      // fallback generic title parse
      while((m = titleRe.exec(html)) && links.length<5){
        let href = m[1];
        if(!href.startsWith('http')) continue;
        let title = m[2].replace(/<[^>]+>/g,'').trim();
        if(title.length<8 || title.includes('DuckDuckGo')) continue;
        links.push({title, url: href, snippet: ''});
      }
      if(links.length>0) return links.slice(0,5);
    } catch{}
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
    // ดึงลิงก์เว็บ (ถ้าไม่ใช่เพลงก็ดึงด้วย)
    const webLinks = await fetchWebLinks(q);
    // ถ้าเป็นเพลง — เติม YouTube เป็นลิงก์แรกเสมอ
    const links: {title:string; url:string; snippet:string; source:string}[] = [];
    if(isSong){
      links.push({ title: `YouTube — ค้นหา "${q}"`, url: youtubeUrl, snippet: 'เปิด YouTube เพื่อฟังเพลง/ดูวิดีโอที่เกี่ยวข้อง', source: 'youtube' });
    } else {
      links.push({ title: `YouTube — "${q}"`, url: youtubeUrl, snippet: 'ค้นหาวิดีโอที่เกี่ยวข้องบน YouTube', source: 'youtube' });
    }
    for(const w of webLinks){
      links.push({ ...w, source: 'web' });
    }
    // ถ้าไม่มีลิงก์เว็บเลย — อย่างน้อยให้ YouTube + Google
    if(webLinks.length===0){
      links.push({ title: `Google — ค้นหา "${q}"`, url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, snippet: 'ค้นหาบน Google', source:'web' });
    }
    return NextResponse.json({ ok:true, query: q, mode: mode||'SMART', isSong, youtubeUrl, links: links.slice(0,8) });
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'search failed' }, {status:500});
  }
}

export async function GET(req: NextRequest){
  const q = req.nextUrl.searchParams.get('q') || '';
  if(!q) return NextResponse.json({ ok:false, error:'ใส่ ?q=' }, {status:400});
  // reuse POST logic
  const fakeReq = { json: async()=> ({query:q}), nextUrl: req.nextUrl } as any;
  return POST(fakeReq);
}
