// Progressive enhancement layer
document.addEventListener('click', async (e) => {
  const fav = e.target.closest('[data-bookmark]');
  if (fav) {
    e.preventDefault();
    const [type, id] = fav.dataset.bookmark.split(':');
    const r = await fetch('/api/v1/bookmarks/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: type, target_id: +id }),
    });
    if (r.status === 401) return (location.href = '/auth/login');
    const d = await r.json();
    fav.textContent = d.saved ? '★' : '☆';
    fav.classList.toggle('gold', d.saved);
  }
  const g = e.target.closest('[data-gallery]');
  if (g) {
    document.getElementById('galleryMain').src = g.dataset.gallery;
    document.querySelectorAll('[data-gallery]').forEach(x => x.classList.remove('on'));
    g.classList.add('on');
  }
});
// autosave drafts
document.querySelectorAll('form[data-autosave]').forEach(f => {
  const key = 'draft:' + f.dataset.autosave;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    Object.entries(saved).forEach(([k, v]) => {
      const el = f.elements[k];
      if (el && !el.value && el.type !== 'file' && el.type !== 'hidden') el.value = v;
    });
  } catch {}
  f.addEventListener('input', () => {
    const o = {};
    new FormData(f).forEach((v, k) => { if (typeof v === 'string') o[k] = v; });
    localStorage.setItem(key, JSON.stringify(o));
  });
  f.addEventListener('submit', () => localStorage.removeItem(key));
});
// chat autoscroll
const cb = document.querySelector('.chat-body');
if (cb) cb.scrollTop = cb.scrollHeight;
// live message polling
if (window.__CONV_ID) {
  setInterval(async () => {
    const r = await fetch('/api/v1/messages/' + window.__CONV_ID + '?after=' + (window.__LAST_MSG || 0));
    const d = await r.json();
    if (d.messages && d.messages.length) location.reload();
  }, 7000);
}
