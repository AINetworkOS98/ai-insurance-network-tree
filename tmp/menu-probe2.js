(() => {
  let e = [...document.querySelectorAll('*')].filter(x => x.children.length === 0 && /Steps_to_financial_freedom_journey_20261012045342/.test(x.innerText || ''))[0];
  if (!e) return JSON.stringify({ ok:false });
  const out = [];
  let cur = e;
  for (let i = 0; i < 14 && cur; i++) {
    const ctrls = [...cur.querySelectorAll('button,[role="button"],a,[class*=Action]')];
    const labels = ctrls.map(c => (c.getAttribute('aria-label')||c.getAttribute('title')||c.innerText||'').trim().slice(0,22)).filter(Boolean);
    out.push({ lvl:i, tag:cur.tagName, cls:(cur.className||'').toString().slice(0,44), n:ctrls.length, labels:labels.slice(0,8) });
    cur = cur.parentElement;
  }
  return JSON.stringify(out);
})()
