import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function extractText(file: File, buffer: ArrayBuffer): Promise<string>{
  const name = file.name.toLowerCase();
  // text based
  if (/\.(txt|csv|json|md)$/i.test(name) || file.type.startsWith('text/')) {
    return Buffer.from(buffer).toString('utf-8').slice(0, 20000);
  }
  // PDF — ใช้ pdfjs-dist
  if (name.endsWith('.pdf') || file.type==='application/pdf') {
    try{
      const pdfjs:any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({data: new Uint8Array(buffer)}).promise;
      let out='';
      for(let i=1;i<=Math.min(doc.numPages, 20);i++){
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it:any)=> it.str).join(' ');
        out += text + '\n';
        if(out.length>15000) break;
      }
      return out.slice(0, 20000) || '(PDF ไม่มีข้อความที่อ่านได้ — อาจเป็นสแกนรูป)';
    } catch(e:any){ return `(อ่าน PDF ไม่สำเร็จ: ${e?.message||'error'})`; }
  }
  // DOCX — mammoth
  if (name.endsWith('.docx')) {
    try{
      const mammoth:any = await import('mammoth');
      const r = await mammoth.extractRawText({buffer: Buffer.from(buffer)});
      return (r.value||'').slice(0,20000);
    } catch(e:any){ return `(อ่าน DOCX ไม่สำเร็จ: ${e?.message||'error'})`; }
  }
  // XLSX/XLS — xlsx
  if (/\.(xlsx|xls)$/i.test(name)) {
    try{
      const XLSX:any = await import('xlsx');
      const wb = XLSX.read(Buffer.from(buffer), {type:'buffer'});
      let out='';
      for(const sn of wb.SheetNames.slice(0,5)){
        const sheet = wb.Sheets[sn];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        out += `--- ${sn} ---\n` + csv + '\n';
        if(out.length>15000) break;
      }
      return out.slice(0,20000);
    } catch(e:any){ return `(อ่าน Excel ไม่สำเร็จ: ${e?.message||'error'})`; }
  }
  // Images — OCR ด้วย tesseract.js (มีอยู่แล้ว)
  if (file.type.startsWith('image/')) {
    try{
      const Tesseract:any = await import('tesseract.js');
      const { data } = await Tesseract.recognize(Buffer.from(buffer), 'tha+eng');
      return (data.text||'').slice(0,15000) || '(รูปไม่มีข้อความที่อ่านได้)';
    } catch{ return '(อ่านรูปไม่สำเร็จ)'; }
  }
  return `(ไฟล์ ${file.name} — ยังไม่รองรับการอ่านข้อความโดยตรง)`;
}

export async function POST(req: NextRequest){
  try{
    const form = await req.formData();
    const files = form.getAll('files') as File[];
    if(!files || files.length===0) return NextResponse.json({ ok:false, error:'ไม่มีไฟล์' }, {status:400});
    const results:any[] = [];
    for(const f of files.slice(0,8)){
      const buf = await f.arrayBuffer();
      const text = await extractText(f, buf);
      results.push({ name:f.name, size:f.size, type:f.type, text: text.slice(0, 20000), chars: text.length });
    }
    return NextResponse.json({ ok:true, files: results });
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'read failed' }, {status:500});
  }
}
