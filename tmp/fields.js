(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const out = [];
  document.querySelectorAll('input,textarea,[contenteditable]').forEach(e => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    const v = e.value !== undefined && e.tagName !== 'DIV' ? e.value : (e.innerText || '');
    out.push({ tag:e.tagName, type:e.type||'', val:(v||'').slice(0,70), x:Math.round(r.x), y:Math.round(r.y) });
  });
  const c = document.body.innerText.match(/(\d+)\s*\/\s*4000/);
  return JSON.stringify({ counter: c ? c[0] : null, fields: out });
})()
