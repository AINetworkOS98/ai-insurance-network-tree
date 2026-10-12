(() => {
  const eds = [...document.querySelectorAll('div[contenteditable="true"]')].filter(e => e.getBoundingClientRect().height > 20);
  return JSON.stringify(eds.map(e => ({ cls:(e.className||'').slice(0,60), len:(e.innerText||'').length, head:(e.innerText||'').slice(0,40), tail:(e.innerText||'').slice(-40) })));
})()
