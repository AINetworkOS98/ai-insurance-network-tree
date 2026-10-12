(() => {
  const out = [];
  for (const s of document.querySelectorAll('script')) {
    const t = s.textContent || '';
    if (!t.includes('Steps_to_financial')) continue;
    let i = -1, n = 0;
    while ((i = t.indexOf('Steps_to_financial', i + 1)) !== -1 && n < 2) { out.push({ id: s.id || s.type || 'script', snippet: t.slice(Math.max(0, i - 260), i + 120).replace(/\s+/g, ' ') }); n++; }
  }
  return JSON.stringify(out);
})()
