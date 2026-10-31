(() => {
  if (window.__socialdl) return; window.__socialdl = true;
  const L = {en: {dl: 'Download', v: 'Video', a: 'MP3'}, si: {dl: 'බාගන්න', v: 'වීඩියෝ', a: 'MP3'}};
  let lang = 'si', enabled = true;
  const load = () => chrome.storage.local.get('s').then(r => { const s = r.s || {}; lang = s.lang || 'si'; enabled = s.pageButton !== false; render(); });
  chrome.storage.onChanged.addListener(c => { if (c.s) load(); });

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `<style>
    #box{position:fixed;display:none;font:600 13px system-ui,"Iskoola Pota",sans-serif;pointer-events:auto}
    #main{border:0;border-radius:20px;padding:7px 14px;color:#fff;cursor:pointer;background:linear-gradient(135deg,#6c5ce7,#2d8cf0);box-shadow:0 2px 10px #0006}
    #menu{display:none;flex-direction:column;gap:4px;margin-top:4px}
    #box:hover #menu{display:flex}
    #menu button{border:0;border-radius:14px;padding:6px 12px;cursor:pointer;color:#fff;background:#1b1d26ee;text-align:left}
    #menu button:hover{background:#6c5ce7}
  </style><div id="box"><button id="main"></button><div id="menu"><button data-k="video"></button><button data-k="audio"></button></div></div>`;
  const box = root.getElementById('box'), main = root.getElementById('main');
  const [bv, ba] = root.querySelectorAll('#menu button');
  function render() { main.textContent = '⬇ ' + L[lang].dl; bv.textContent = '🎬 ' + L[lang].v; ba.textContent = '🎵 ' + L[lang].a; }
  render(); load();

  const attach = () => { const p = document.fullscreenElement || document.body || document.documentElement; if (p && host.parentNode !== p) p.appendChild(host); };
  document.addEventListener('fullscreenchange', attach);

  let mx = -1, my = -1, cur = null;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, true);

  function resolveUrl(v) {
    const h = location.hostname, p = location.pathname, href = location.href;
    const up = sel => { let n = v; for (let i = 0; n && i < 14; i++, n = n.parentElement) { const a = n.querySelector && n.querySelector(sel); if (a) return a.href; } return null; };
    if (/youtube\.com$/.test(h)) return /^\/(watch|shorts\/|live\/)/.test(p) ? href : null;
    if (/facebook\.com$|fb\.watch$/.test(h)) return /\/(watch|reel|videos)|\/share\/(v|r)\//.test(p) ? href : (up('a[href*="/videos/"],a[href*="/reel/"],a[href*="/watch/?v="]') || null);
    if (/tiktok\.com$/.test(h)) return /\/video\//.test(p) ? href : (up('a[href*="/video/"]') || href);
    if (/instagram\.com$/.test(h)) return /^\/(reel|reels|p|tv)\//.test(p) ? href : (up('a[href*="/reel/"],a[href*="/p/"]') || null);
    return href;
  }
  function bestVideo() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0), h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      if (w < 200 || h < 120) continue;
      if (w * h > area) { area = w * h; best = v; }
    }
    return best;
  }
  function tick() {
    attach();
    if (!enabled) { box.style.display = 'none'; return; }
    const v = bestVideo();
    if (!v) { box.style.display = 'none'; return; }
    const r = v.getBoundingClientRect();
    const inside = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
    const over = box.matches(':hover');
    const url = resolveUrl(v);
    if (!url || !(inside || over)) { if (!over) box.style.display = 'none'; return; }
    cur = url;
    box.style.display = 'block';
    box.style.left = Math.max(6, r.left + 10) + 'px';
    box.style.top = Math.max(6, r.top + 10 + (location.hostname.includes('youtube') ? 40 : 0)) + 'px';
  }
  setInterval(tick, 300);

  async function send(kind) {
    if (!cur) return;
    main.textContent = '⏳';
    const r = await chrome.runtime.sendMessage({type: 'enqueue', kind, url: cur}).catch(() => ({ok: false}));
    main.textContent = r && r.ok ? '✓' : '✗';
    setTimeout(render, 2000);
  }
  for (const [el, k] of [[main, 'video'], [bv, 'video'], [ba, 'audio']]) {
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); send(k); });
    el.addEventListener('mousedown', e => e.stopPropagation());
  }
})();
