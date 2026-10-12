(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const bs = [...document.querySelectorAll('button')].filter(vis).map(b => {
    const r = b.getBoundingClientRect();
    return { t:(b.innerText||'').trim().slice(0,24), dis:b.disabled, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) };
  });
  const prog = document.body.innerText.match(/Uploaded（[^）]+）|Processing|กำลังประมวลผล|Checks? in progress/g);
  return JSON.stringify({ prog, buttons: bs });
})()
