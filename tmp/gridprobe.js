(() => {
  const out = [];
  const links = [...document.querySelectorAll('a[href*="/video/"]')].slice(0, 3);
  for (const a of links) {
    const li = a.closest('li') || a.parentElement;
    const desc = li ? (li.querySelector('[data-e2e="user-post-item-desc"]') || li.querySelector('[data-e2e="user-post-item-title"]')) : null;
    out.push({ href: a.href.split('?')[0], desc: desc ? (desc.innerText || desc.getAttribute('title') || '').slice(0, 120) : null,
               txt: li ? (li.innerText || '').replace(/\s+/g,' ').slice(0, 60) : null });
  }
  return JSON.stringify(out);
})()
