(() => {
  // find the smallest node containing the posted caption, then walk up to the row that owns buttons
  let e = [...document.querySelectorAll('*')].filter(x => x.children.length === 0 && /Steps_to_financial_freedom_journey_20261012045342/.test(x.innerText || ''))
    .sort((a,b) => (a.innerText||'').length - (b.innerText||'').length)[0];
  if (!e) return JSON.stringify({ ok:false, why:'caption node not found' });
  let row = e;
  for (let i = 0; i < 12 && row; i++) { row = row.parentElement; if (row && row.querySelectorAll('button,[role=button],a').length) break; }
  const btns = row ? [...row.querySelectorAll('button,[role="button"],a')].map(b => {
    const r = b.getBoundingClientRect();
    return { t:(b.innerText||'').trim().slice(0,16), aria:(b.getAttribute('aria-label')||'').slice(0,24),
             title:(b.getAttribute('title')||'').slice(0,20), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width) };
  }) : [];
  return JSON.stringify({ ok:true, rowText:(row ? row.innerText.replace(/\s+/g,' ').slice(0,160) : null), btns });
})()
