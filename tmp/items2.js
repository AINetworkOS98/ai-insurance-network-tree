(() => {
  const s = document.getElementById('__Creator_Center_Context__');
  const t = (s ? s.textContent : document.documentElement.innerHTML);
  const out = [];
  const re = /"desc":"((?:[^"\]|\.){0,200})"/g;
  let m;
  while ((m = re.exec(t)) !== null && out.length < 4) {
    const before = t.slice(Math.max(0, m.index - 150), m.index);
    const idm = before.match(/"id":"(\d{15,})"/);
    out.push({ id: idm ? idm[1] : null, desc: m[1].replace(/\u([0-9a-f]{4})/gi, (x,h) => String.fromCharCode(parseInt(h,16))).slice(0, 80) });
  }
  return JSON.stringify(out);
})()
