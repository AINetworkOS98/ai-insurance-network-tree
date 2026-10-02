import fs from 'fs';

const GKEY = process.env.GKEY;
const img = fs.readFileSync('test_r.jpg').toString('base64');

const body = {
  contents: [{ parts: [{ text: 'อ่านยอดเงินจากใบเสร็จนี้ ตอบ JSON {amount:number}' }, { inline_data: { mime_type: 'image/jpeg', data: img } }] }],
  generationConfig: { responseMimeType: 'application/json', temperature: 0 },
};

try {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GKEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('HTTP', res.status);
  console.log(text.slice(0, 1200));
} catch (e) {
  console.error('FETCH ERROR:', e.message);
}
