(() => {
  const d = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]');
  const t = document.querySelector('[data-e2e="browse-video-title"]');
  return JSON.stringify({
    url: location.href,
    desc: d ? d.innerText : null,
    title: t ? t.innerText : null,
    body: document.body.innerText.slice(0, 500)
  });
})()
