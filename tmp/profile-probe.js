(() => {
  const links = [...document.querySelectorAll('a[href*="/video/"]')].map(a => a.href);
  const items = [...document.querySelectorAll('[data-e2e="user-post-item"], li')]
    .map(el => (el.innerText||'').trim()).filter(t => t.length > 20).slice(0, 3);
  return JSON.stringify({ url: location.href, nvideos: links.length, first: links.slice(0,3), texts: items });
})()
