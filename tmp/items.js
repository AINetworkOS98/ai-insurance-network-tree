(() => {
  const s = document.getElementById('__Creator_Center_Context__');
  if (!s) return JSON.stringify({ ok:false, why:'no context json' });
  let j; try { j = JSON.parse(s.textContent); } catch (e) { return JSON.stringify({ ok:false, why:'parse', e:String(e) }); }
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (o.desc !== undefined && (o.id !== undefined || o.item_id !== undefined)) found.push({ id:String(o.id || o.item_id), desc:String(o.desc).slice(0, 90), t:String(o.create_time || '') });
    Object.values(o).forEach(walk);
  };
  walk(j);
  return JSON.stringify({ ok:true, n:found.length, first:found.slice(0, 3) });
})()
