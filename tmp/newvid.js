(() => {
  const links = [...document.querySelectorAll('a[href*="/video/"]')].map(a => a.href.split('?')[0])
    .filter(h => h.includes('@aka989._/video/'));
  const uniq = [...new Set(links)];
  return JSON.stringify({ n: uniq.length, first3: uniq.slice(0,3) });
})()
