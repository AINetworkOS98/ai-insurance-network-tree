(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const priv = [...document.querySelectorAll('button,[role="button"],div,span')].filter(vis)
    .filter(e => /^(Everyone|Only me|Friends|ทุกคน|เฉพาะฉัน)$/.test((e.innerText||'').trim()))
    .map(e => ({ t:(e.innerText||'').trim(), tag:e.tagName, cls:(e.className||'').toString().slice(0,50), x:Math.round(e.getBoundingClientRect().x), y:Math.round(e.getBoundingClientRect().y) }));
  const body = document.body.innerText;
  const idx = body.indexOf('Who can watch');
  return JSON.stringify({ priv, aroundWatch: idx >= 0 ? body.slice(idx, idx + 120).replace(/\s+/g,' ') : null,
                          hasFilename: /^\s*Steps_to_financial/u.test(body) });
})()
