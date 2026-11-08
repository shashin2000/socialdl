// Finds downloadable media on the current page WITHOUT any helper (used by popup, context menu and the page button).
globalThis.sdlScan = function () {
  const out = new Map();
  const MEDIA = /\.(mp4|m4v|webm|mov|mkv|mp3|m4a|aac|ogg|oga|opus|wav|flac)(?=[?#]|$)/i;
  const AUDIO = new Set(['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac']);
  const clean = u => String(u || '').replace(/\\u0026/g, '&').replace(/\\u0025/g, '%').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const add = (raw, p = {}) => {
    const url = clean(raw);
    if (!/^https?:\/\//i.test(url) || /\.(m4s|ts|m3u8|mpd)(\?|$)/i.test(url)) return;
    const m = url.match(MEDIA);
    const ext = (p.ext || (m ? m[1] : '') || '').toLowerCase();
    const kind = p.kind || (AUDIO.has(ext) ? 'audio' : 'video');
    const key = url.split('#')[0];
    const prev = out.get(key);
    const item = {url: key, kind, ext: ext || (kind === 'audio' ? 'm4a' : 'mp4'), label: p.label || '', w: p.w || 0, h: p.h || 0, src: p.src || 'page', dur: p.dur || 0};
    if (!prev || (item.h > prev.h)) out.set(key, {...prev, ...item});
  };

  document.querySelectorAll('video,audio').forEach(el => {
    const kind = el.tagName === 'AUDIO' ? 'audio' : 'video';
    const props = {kind, w: el.videoWidth || 0, h: el.videoHeight || 0, dur: isFinite(el.duration) ? el.duration : 0, src: 'player'};
    if (el.currentSrc) add(el.currentSrc, props);
    if (el.src) add(el.src, props);
    el.querySelectorAll('source[src]').forEach(s => add(s.src, {...props, ext: (s.type || '').split('/')[1]}));
  });
  document.querySelectorAll('meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"],meta[name="twitter:player:stream"]')
    .forEach(m => add(m.content, {kind: 'video', src: 'page'}));
  document.querySelectorAll('meta[property="og:audio"],meta[property="og:audio:url"]').forEach(m => add(m.content, {kind: 'audio', src: 'page'}));
  document.querySelectorAll('a[href]').forEach(a => { if (MEDIA.test(a.href)) add(a.href, {src: 'link'}); });
  try {
    performance.getEntriesByType('resource').forEach(e => {
      if (MEDIA.test(e.name) || e.initiatorType === 'video' || e.initiatorType === 'audio') add(e.name, {src: 'network'});
    });
  } catch (e) {}
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { const walk = o => { if (!o || typeof o !== 'object') return; if (o.contentUrl) add(o.contentUrl, {src: 'page'}); Object.values(o).forEach(walk); }; walk(JSON.parse(s.textContent)); } catch (e) {}
  });

  // ---- site specific (best effort - these sites change often)
  const host = location.hostname;
  try {
    if (/tiktok\.com$/.test(host)) {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__') || document.getElementById('SIGI_STATE');
      if (el) {
        const find = o => { if (!o || typeof o !== 'object') return; if (o.video && (o.video.playAddr || o.video.downloadAddr)) { const v = o.video; add(v.downloadAddr, {label: 'HQ', h: v.height, w: v.width, src: 'site', ext: 'mp4'}); add(v.playAddr, {h: v.height, w: v.width, src: 'site', ext: 'mp4'}); return; } Object.values(o).forEach(find); };
        find(JSON.parse(el.textContent));
      }
    }
    if (/facebook\.com$|fb\.watch$/.test(host)) {
      const html = document.documentElement.innerHTML;
      for (const [key, label, h] of [['browser_native_hd_url', 'HD', 720], ['playable_url_quality_hd', 'HD', 720], ['browser_native_sd_url', 'SD', 360], ['playable_url', 'SD', 360]]) {
        const re = new RegExp('"' + key + '":"(https:[^"]+)"', 'g'); let m;
        while ((m = re.exec(html))) add(JSON.parse('"' + m[1] + '"'), {label, h, src: 'site', ext: 'mp4'});
      }
    }
    if (/instagram\.com$/.test(host)) {
      const re = /"video_url":"(https:[^"]+)"/g; let m; const html = document.documentElement.innerHTML;
      while ((m = re.exec(html))) add(JSON.parse('"' + m[1] + '"'), {src: 'site', ext: 'mp4'});
    }
  } catch (e) {}

  const title = (document.querySelector('meta[property="og:title"]') || {}).content || document.title || host;
  const items = [...out.values()].filter(i => !/\.(jpg|png|gif|webp)(\?|$)/i.test(i.url));
  const host2 = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
  items.forEach(i => i.host = host2(i.url));
  return {title: title.replace(/\s+/g, ' ').trim().slice(0, 120), page: location.href, items};
};
