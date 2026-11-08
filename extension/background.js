importScripts('common.js', 'lite.js');

const known = new Map();
let polling = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const badge = (text, color) => { chrome.action.setBadgeText({text}); if (color) chrome.action.setBadgeBackgroundColor({color}); };
function flash(text, color) { badge(text, color); setTimeout(() => badge(''), 8000); }
function notify(msg) { chrome.notifications.create({type: 'basic', iconUrl: 'icons/icon128.png', title: 'SocialDL', message: String(msg).slice(0, 220)}); }
const FALLBACK = ['NO_HELPER', 'NO_TOKEN', 'BAD_TOKEN'];

// ------------------------------------------------------------ FULL engine (helper)
async function poll() {
  if (polling) return;
  polling = true;
  let ok = 0, bad = 0;
  try {
    for (let i = 0; i < 7200; i++) {
      let jobs;
      try { jobs = (await api('/jobs')).jobs; } catch (e) { break; }
      const active = jobs.filter(j => ['queued', 'downloading', 'processing'].includes(j.status));
      for (const j of jobs) {
        const prev = known.get(j.id);
        if (prev && ['queued', 'downloading', 'processing'].includes(prev)) { if (j.status === 'done') ok++; if (j.status === 'error') bad++; }
        known.set(j.id, j.status);
      }
      if (!active.length) break;
      badge(String(active.length), '#2d8cf0');
      await sleep(1000);
    }
  } finally { polling = false; }
  if (bad) flash('ERR', '#dc2626'); else if (ok) flash('OK', '#16a34a'); else badge('');
}
async function tryFull(kind, url, extra = {}) {
  try {
    const s = await getS();
    const r = await api('/download', {kind, items: [{url, title: extra.title || ''}], opts: {...defaultOpts(s), ...(extra.opts || {})}});
    r.ids.forEach(id => known.set(id, 'queued'));
    poll();
    return {ok: true, engine: 'full'};
  } catch (e) {
    if (FALLBACK.includes(e.message)) return {ok: false, fallback: true};
    flash('ERR', '#dc2626'); notify(e.message);
    return {ok: false, error: e.message};
  }
}

// ------------------------------------------------------------ LITE engine (no helper)
async function liteImages(tabId) {
  const [r] = await chrome.scripting.executeScript({target: {tabId}, func: () => [...document.images].filter(i => i.naturalWidth >= 300 && i.naturalHeight >= 200).map(i => i.currentSrc || i.src).filter(u => /^https?:/i.test(u))});
  const urls = [...new Set(r.result || [])].slice(0, 60);
  for (const u of urls) { try { await liteDownload({url: u, kind: 'image'}, decodeURIComponent((u.split('?')[0].split('/').pop() || 'image').replace(/\.[a-z0-9]+$/i, ''))); } catch (e) {} }
  return urls.length;
}
async function liteGet(kind, items, title) {
  let best = pickBest(items, kind);
  if (!best && kind === 'audio') { best = pickBest(items, 'video'); if (best) notify(t('lite_audio_fallback')); }
  if (!best) { notify(t('nothing_found') + ' — ' + t('lite_hint')); flash('ERR', '#dc2626'); return {ok: false}; }
  try { await liteDownload(best, title); }
  catch (e) { flash('ERR', '#dc2626'); notify(e.message); return {ok: false, error: e.message}; }
  return {ok: true, engine: 'lite'};
}
async function liteEnqueue(kind, url, extra = {}, tab) {
  try {
    if (kind === 'image') { await liteDownload({url, kind: 'image', ext: extOf(url) || 'jpg'}, decodeURIComponent((url.split('?')[0].split('/').pop() || 'image').replace(/\.[a-z0-9]+$/i, ''))); return {ok: true}; }
    if (kind === 'gallery') { if (!tab) return {ok: false}; const n = await liteImages(tab.id); notify(n + ' ' + t('found')); return {ok: !!n}; }
    if (LITE_MEDIA.test(url) && !/^https?:\/\/[^/]*(youtube|facebook|tiktok)\./i.test(url)) { await liteDownload({url, kind: LITE_AUDIO.includes(extOf(url)) ? 'audio' : 'video'}, decodeURIComponent(url.split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, ''))); return {ok: true}; }
    if (tab) { const r = await scanTab(tab.id); return await liteGet(kind, r.items, r.title); }
    notify(t('lite_hint')); return {ok: false};
  } catch (e) { flash('ERR', '#dc2626'); notify(e.message); return {ok: false, error: e.message}; }
}
async function enqueue(kind, url, extra = {}, tab) {
  const r = await tryFull(kind, url, extra);
  return r.fallback ? liteEnqueue(kind, url, extra, tab) : r;
}

async function liteBadge() {
  const {liteMeta: m = {}} = await chrome.storage.local.get('liteMeta');
  const act = (await chrome.downloads.search({state: 'in_progress'})).filter(d => m[d.id]);
  if (act.length) badge(String(act.length), '#2d8cf0');
  return act.length;
}
chrome.downloads.onCreated.addListener(() => setTimeout(liteBadge, 300));
chrome.downloads.onChanged.addListener(async d => {
  if (!d.state && !d.paused) return;
  let {liteMeta: m = {}} = await chrome.storage.local.get('liteMeta');
  if (!m[d.id]) { await sleep(700); ({liteMeta: m = {}} = await chrome.storage.local.get('liteMeta')); }
  if (!m[d.id]) return;
  const cur = d.state && d.state.current;
  if (cur === 'complete') {
    const [it] = await chrome.downloads.search({id: d.id});
    await liteHistAdd({title: m[d.id].title, url: m[d.id].url, kind: m[d.id].kind, file: it ? it.filename : '', time: Date.now() / 1000, note: '', did: d.id});
    if (!(await liteBadge())) flash('OK', '#16a34a');
  } else if (cur === 'interrupted') {
    const why = d.error && d.error.current;
    if (why && why !== 'USER_CANCELED') notify(t('dl_failed') + ' (' + why + ')' + (/SERVER_|NETWORK_|UNAUTH|FORBIDDEN/.test(why) ? ' — ' + t('site_refused') : ''));
    if (!(await liteBadge())) { if (why !== 'USER_CANCELED') flash('ERR', '#dc2626'); else badge(''); }
  } else liteBadge();
});

// ------------------------------------------------------------ menus / messages
function buildMenus() {
  getS().then(() => chrome.contextMenus.removeAll(() => {
    const c = (id, contexts) => chrome.contextMenus.create({id, title: t('ctx_' + id), contexts});
    c('v_page', ['page', 'frame']); c('a_page', ['page', 'frame']); c('g_page', ['page', 'frame']);
    c('v_link', ['link']); c('a_link', ['link']); c('v_media', ['video']); c('a_media', ['video', 'audio']); c('i_img', ['image']);
  }));
}
chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);
chrome.storage.onChanged.addListener(c => { if (c.s && (c.s.oldValue || {}).lang !== (c.s.newValue || {}).lang) buildMenus(); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = info.menuItemId, page = info.pageUrl || info.frameUrl;
  const media = info.srcUrl && !info.srcUrl.startsWith('blob:') ? info.srcUrl : page;
  const go = {v_page: ['video', page], a_page: ['audio', page], g_page: ['gallery', page], v_link: ['video', info.linkUrl], a_link: ['audio', info.linkUrl],
    v_media: ['video', media], a_media: ['audio', media], i_img: ['image', info.srcUrl]}[id];
  if (go) enqueue(go[0], go[1], id === 'i_img' ? {opts: {referer: page}} : {}, tab);
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  const reply = p => Promise.resolve(p).then(send).catch(e => { try { send({ok: false, error: String((e && e.message) || e)}); } catch (_) {} });   // ALWAYS answer
  if (msg.type === 'enqueue') { reply(tryFull(msg.kind, msg.url).then(r => r.fallback ? {ok: false, lite: true} : r)); return true; }
  if (msg.type === 'liteGet') { reply(liteGet(msg.kind, msg.items || [], msg.title)); return true; }
  if (msg.type === 'kick') { (msg.ids || []).forEach(id => known.set(id, 'queued')); poll(); send({ok: true}); }
});

// ------------------------------------------------------------ auto-update: reload when the helper unpacked newer extension files
async function checkExtUpdate() {
  try {
    const st = await api('/status');
    const disk = st.app && st.app.ext_version, cur = chrome.runtime.getManifest().version;
    if (disk && newer(disk, cur)) {
      const {lastReload} = await chrome.storage.local.get('lastReload');
      if (lastReload !== disk) { await chrome.storage.local.set({lastReload: disk}); chrome.runtime.reload(); }
    }
  } catch (e) {}
}
chrome.alarms.create('extUpdate', {periodInMinutes: 30});
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'extUpdate') checkExtUpdate(); });
chrome.runtime.onStartup.addListener(() => setTimeout(checkExtUpdate, 5000));
chrome.runtime.onInstalled.addListener(() => setTimeout(checkExtUpdate, 5000));
