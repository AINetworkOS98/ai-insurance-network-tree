(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const out = [];
  for (const y of [228, 328]) {  // the two newest rows' action cells
    const els = [...document.querySelectorAll('button,[role="button"],a,div,span')].filter(vis)
      .filter(e => (e.getBoundingClientRect().x > 1200 && Math.abs(e.getBoundingClientRect().y + e.getBoundingClientRect().height/2 - y) < 28));
    out.push({ y, hits: els.slice(0, 12).map(e => ({ t:(e.innerText||'').trim().slice(0,16), aria:(e.getAttribute('aria-label')||'').slice(0,20),
      cls:(e.className||'').toString().slice(0,40), x:Math.round(e.getBoundingClientRect().x), w:Math.round(e.getBoundingClientRect().width) })) });
  }
  return JSON.stringify(out);
})()
