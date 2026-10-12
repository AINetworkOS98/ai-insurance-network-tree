(() => {
  const rows = [...document.querySelectorAll('tr,[role="row"],div')].filter(e => /Steps_to_financial_freedom_journey_20261012045342/.test(e.innerText||''));
  const small = rows.sort((a,b) => (a.innerText||'').length - (b.innerText||'').length)[0];
  const btns = small ? [...small.querySelectorAll('button,[role="button"]')].map(b => ({ t:(b.innerText||'').trim().slice(0,14), aria:(b.getAttribute('aria-label')||'').slice(0,20), x:Math.round(b.getBoundingClientRect().x) })) : [];
  const t = small ? (small.innerText||'').replace(/\s+/g,' ').slice(0, 200) : null;
  return JSON.stringify({ found: !!small, text: t, btns });
})()
