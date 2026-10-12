(() => {
  const s = document.getElementById('__Creator_Center_Context__');
  const t = (s ? s.textContent : document.documentElement.innerHTML);
  const out = [];
  let idx = 0;
  while (out.length < 4) {
    const i = t.indexOf('"desc":"', idx);
    if (i === -1) break;
    const start = i + 8;
    const end = t.indexOf('"', start);
    let raw = t.slice(start, end);
    // unescape the common JSON escapes without regex literals
    raw = raw.split('\\u').join('\\u');
    const desc = raw.replace(/\\\\u([0-9a-f]{4})/gi, (x, h) => String.fromCharCode(parseInt(h, 16)));
    const before = t.slice(Math.max(0, i - 200), i);
    const j = before.lastIndexOf('"id":"');
    const id = j === -1 ? null : before.slice(j + 6, before.indexOf('"', j + 6));
    out.push({ id, desc: desc.slice(0, 80) });
    idx = end + 1;
  }
  const url = location.href;
  return JSON.stringify({ url, out });
})()
