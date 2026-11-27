(() => {
  const d = document;
  const r = d.documentElement;
  const KEY = 'uzn-theme';
  const SYS = '(prefers-color-scheme: dark)';
  const mq = matchMedia(SYS);
  const sys = () => (mq.matches ? 'dark' : 'light');
  const store = (t) => {
    try {
      if (t) localStorage.setItem(KEY, t);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage off: the choice lives until the page is left */
    }
  };
  const set = (t) => {
    if (t && t !== sys()) r.dataset.theme = t;
    else delete r.dataset.theme;
    store(r.dataset.theme);
  };
  const sync = () => {
    const t = r.dataset.theme;
    const media = t ? (t === 'dark' ? 'all' : 'not all') : SYS;
    for (const s of d.querySelectorAll('source[data-theme-src]')) {
      if (s.media !== media) s.media = media;
    }
    const on = t || sys();
    for (const b of d.querySelectorAll('[data-theme-set]')) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === on));
    }
  };
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* storage off: system theme */
  }
  if (saved === 'light' || saved === 'dark') set(saved);
  r.dataset.js = '';
  if (r.dataset.theme) {
    const mo = new MutationObserver(sync);
    mo.observe(r, { childList: true, subtree: true });
    d.addEventListener('DOMContentLoaded', () => mo.disconnect());
  }
  d.addEventListener('DOMContentLoaded', sync);
  mq.addEventListener('change', () => {
    set(r.dataset.theme);
    sync();
  });
  d.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-theme-set]');
    if (!b) return;
    r.dataset.themeSwitching = '';
    set(b.dataset.themeSet);
    sync();
    requestAnimationFrame(() => requestAnimationFrame(() => delete r.dataset.themeSwitching));
  });
})();
