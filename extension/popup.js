const $ = id => document.getElementById(id);
let engine = 'lite', liteItems = [], liteTitle = '', prevBytes = {}, S, info = null, mode = 'video', tab = null, saveFolder = '', histCache = [], scanned = [], curTab = 'dl', ready = false;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDur = s => { if (!s) return ''; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtSize = b => !b ? '' : b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB';
const fmtSpeed = b => !b ? '' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB/s' : (b / 1e3).toFixed(0) + ' KB/s';
const setMsg = (m, cls = '') => { $('msg').textContent = m; $('msg').className = 'msg ' + cls; };
const ACTIVE = ['queued', 'downloading', 'processing'];
const ICON = {video: '🎬', audio: '🎵', image: '🖼', gallery: '🖼'};

// chips mirror hidden <select>s so the rest of the code can keep reading .value
function chipify(selId, boxId) {
  const sel = $(selId), box = $(boxId);
  box.innerHTML = [...sel.options].map(o => `<button type="button" data-v="${esc(o.value || o.text)}">${esc(o.value === 'best' ? t('best') : (o.value || o.text) + (selId === 'qual' ? 'p' : ''))}</button>`).join('');
  const sync = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === sel.value));
  box.onclick = e => { const b = e.target.closest('button'); if (!b) return; sel.value = b.dataset.v; sync(); syncMode(); };
  sync(); box._sync = sync;
}
const chipSync = () => ['qChips', 'cChips', 'aChips'].forEach(i => $(i)._sync && $(i)._sync());

function applyUI() {
  document.documentElement.dataset.theme = S.theme;
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i]').forEach(e => e.textContent = t(e.dataset.i));
  document.querySelectorAll('[data-ph]').forEach(e => e.placeholder = t(e.dataset.ph));
  $('bLang').textContent = S.lang === 'si' ? 'EN' : 'සිං';
  chipify('qual', 'qChips'); chipify('cont', 'cChips'); chipify('afmt', 'aChips');
  setPill();
}
function setPill() { $('pill').className = 'pill ' + engine; $('pillT').textContent = t(engine === 'full' ? 'pill_full' : 'pill_lite'); }

async function connect() {
  try {
    const st = await api('/status');
    engine = 'full'; setPill(); saveFolder = st.config.folder; $('banner').classList.add('hidden');
    const b = st.boot || {};
    $('boot').classList.toggle('hidden', b.state !== 'working' && b.state !== 'error');
    if (b.state === 'working') {
      $('bootT').textContent = t('boot') + ' ' + (b.msg || '') + (b.pct ? ' ' + b.pct + '%' : ''); $('bootBar').style.width = (b.pct || 5) + '%';
      setTimeout(connect, 1500);
    } else if (b.state === 'error') { $('bootT').textContent = t('boot_err') + ': ' + b.msg; $('bootBar').style.width = '0'; }
    else if (!st.versions.ffmpeg) setMsg(t('ffmpeg_missing'), 'err');
    syncMode();
    return true;
  } catch (e) {
    engine = 'lite'; setPill(); $('boot').classList.add('hidden');
    const pairProblem = e.message !== 'NO_HELPER';            // helper is running but not paired with this extension
    $('bannerMsg').textContent = t('repair_help'); $('banner').classList.toggle('hidden', !pairProblem);
    syncMode();
    return false;
  }
}

function syncMode() {
  const lite = engine === 'lite', pl = !lite && info && info.type === 'playlist';
  document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  $('optV').classList.toggle('hidden', lite || mode !== 'video');
  $('optA').classList.toggle('hidden', lite || mode !== 'audio');
  $('optI').classList.toggle('hidden', mode !== 'image');
  $('lite').classList.toggle('hidden', !lite || mode === 'image');
  $('more').classList.toggle('hidden', lite || mode === 'image');
  $('card').classList.toggle('hidden', lite || !info);
  $('bGal').classList.toggle('hidden', lite);
  $('exactBox').classList.toggle('hidden', mode !== 'video' || !!pl);
  $('subBox').classList.toggle('hidden', mode !== 'video');
  $('clip').classList.toggle('hidden', !!pl);
  $('pl').classList.toggle('hidden', !pl || mode === 'image');
  $('dock').classList.toggle('hidden', curTab !== 'dl' || mode === 'image');
  if (lite) $('bDl').textContent = t('dl_best');
  else if (!pl) $('bDl').textContent = t('download');
  $('qChips').style.opacity = $('exact').value ? .4 : 1;
  chipSync();
  if (lite && curTab === 'dl' && mode !== 'image') renderLite();
}

async function fetchInfo() {
  const url = $('url').value.trim();
  if (!/^https?:/i.test(url)) return;
  if (engine === 'lite') { if (LITE_MEDIA.test(url)) return liteGetOne({url, kind: LITE_AUDIO.includes(extOf(url)) ? 'audio' : 'video', ext: extOf(url)}); if (url === (tab && tab.url)) return liteScanNow(); return setMsg(t('need_helper') + ' — ' + t('lite_hint'), 'err'); }
  info = null; renderInfo(); setMsg(t('loading'));
  try { info = await api('/info', {url, cookies: S.cookies}); setMsg(''); renderInfo(); }
  catch (e) { setMsg(e.message === 'NO_HELPER' ? t('no_helper') : t('no_info') + ' ' + e.message.slice(0, 110), 'err'); }
}

function renderInfo() {
  $('card').classList.toggle('hidden', !info);
  const ex = $('exact'); ex.innerHTML = `<option value="">${esc(t('auto'))}</option>`;
  $('plList').innerHTML = '';
  if (info) {
    $('thumb').src = info.thumb || '';
    $('dur').textContent = fmtDur(info.duration); $('dur').classList.toggle('hidden', !info.duration);
    $('ttl').textContent = info.title || '';
    const pl = info.type === 'playlist';
    $('meta').textContent = [info.uploader, pl ? info.entries.length + ' ' + t('items') : ''].filter(Boolean).join(' · ');
    if (pl) {
      $('plList').innerHTML = info.entries.map((e, i) => `<label><input type="checkbox" class="plc" data-n="${i}" checked><span>${i + 1}. ${esc(e.title)}</span><em class="mut">${fmtDur(e.duration)}</em></label>`).join('');
      $('plAll').checked = true; updPl();
    } else {
      $('bDl').textContent = t('download');
      ex.innerHTML += info.formats.map(f => {
        const v = f.vonly ? `${f.id}+bestaudio/${f.id}` : f.id;
        return `<option value="${esc(v)}">${esc(`${f.h ? f.h + 'p' : '?'}${f.fps > 30 ? f.fps : ''} · ${f.ext} · ${f.vc}${f.vonly ? '' : ' +audio'} ${fmtSize(f.size)}`)}</option>`;
      }).join('');
    }
  }
  syncMode();
}
function updPl() { const n = document.querySelectorAll('.plc:checked').length; $('plN').textContent = `(${n}/${info.entries.length})`; $('bDl').textContent = `${t('download_sel')} (${n})`; }

async function liteScanNow() {
  $('liteN').textContent = t('loading');
  try { const r = await scanTab(tab.id); liteItems = r.items; liteTitle = r.title; }
  catch (e) { liteItems = []; $('liteN').textContent = e.message; return; }
  renderLite();
}
function renderLite() {
  const kind = mode === 'audio' ? 'audio' : 'video';
  const list = liteItems.filter(i => i.kind === kind).sort((a, b) => scoreItem(b) - scoreItem(a));
  $('liteN').textContent = list.length ? list.length + ' ' + t('found_n') : '';
  $('liteList').innerHTML = list.length ? list.map((it, n) => `<div class="mrow"><div class="mi2">${kind === 'audio' ? '🎵' : '🎬'}</div>
    <div class="jb"><div class="jt">${esc(it.label || it.ext.toUpperCase())}${it.h ? ' · ' + it.h + 'p' : ''}</div><div class="mut">${esc(it.host || '')}${it.dur ? ' · ' + fmtDur(it.dur) : ''}</div></div>
    <button class="getbtn" data-n="${liteItems.indexOf(it)}">${esc(t('download'))}</button></div>`).join('')
    : `<div class="empty"><b>🔍</b>${esc(t('nothing_found'))}</div>`;
}
async function liteGetOne(it) {
  try { await liteDownload(it, liteTitle); setMsg(t('added'), 'okc'); tick(); } catch (e) { setMsg(e.message, 'err'); }
}

function collectOpts() {
  const o = defaultOpts(S);
  Object.assign(o, {container: $('cont').value, quality: $('qual').value, format: $('exact').value, aformat: $('afmt').value,
    subs: $('subs').value, sublangs: $('sublangs').value, embed: $('embed').checked, clipStart: $('cs').value.trim(), clipEnd: $('ce').value.trim()});
  return o;
}
async function submit(kind, items, opts) {
  if (engine === 'lite') {
    let n = 0;
    for (const it of items) { try { await liteDownload({url: it.url, kind: kind === 'gallery' ? 'image' : kind}, it.title || decodeURIComponent((it.url.split('?')[0].split('/').pop() || 'image').replace(/\.[a-z0-9]+$/i, ''))); n++; } catch (e) { setMsg(e.message, 'err'); } }
    if (n) { setMsg(t('added') + ' (' + n + ')', 'okc'); tick(); }
    return;
  }
  try {
    const r = await api('/download', {kind, items, opts});
    chrome.runtime.sendMessage({type: 'kick', ids: r.ids});
    setMsg(t('added') + ' (' + r.ids.length + ')', 'okc'); tick();
  } catch (e) { setMsg(e.message, 'err'); connect(); }
}
async function onDownload() {
  if (engine === 'lite') {
    const kind = mode === 'audio' ? 'audio' : 'video';
    let it = pickBest(liteItems, kind) || (kind === 'audio' ? pickBest(liteItems, 'video') : null);
    if (!it) return setMsg(t('nothing_found'), 'err');
    return liteGetOne(it);
  }
  const url = $('url').value.trim(); if (!url) return;
  let items;
  if (info && info.type === 'playlist') {
    items = [...document.querySelectorAll('.plc:checked')].map(c => info.entries[+c.dataset.n]);
    if (!items.length) return;
  } else items = [{url, title: info ? info.title : '', thumb: info ? info.thumb : ''}];
  await submit(mode, items, collectOpts());
}

async function scanImages() {
  $('scanN').textContent = t('loading');
  try {
    const [res] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => {
      const out = new Map(), ext = /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i;
      document.querySelectorAll('img').forEach(im => {
        if ((im.naturalWidth || 0) < 80 && (im.naturalHeight || 0) < 80) return;
        const a = im.closest('a'); const src = (a && ext.test(a.href)) ? a.href : (im.currentSrc || im.src);
        if (src && !out.has(src)) out.set(src, {src, thumb: im.currentSrc || im.src});
      });
      const og = document.querySelector('meta[property="og:image"]'); if (og && og.content && !out.has(og.content)) out.set(og.content, {src: og.content, thumb: og.content});
      return [...out.values()].slice(0, 300);
    }});
    scanned = res.result || [];
    $('scanN').textContent = scanned.length + ' ' + t('found');
    $('imgs').innerHTML = scanned.map((x, i) => `<label><img src="${esc(x.thumb)}" referrerpolicy="no-referrer"><input type="checkbox" class="imc" data-n="${i}" checked></label>`).join('');
    $('bImgs').classList.toggle('hidden', !scanned.length);
  } catch (e) { $('scanN').textContent = e.message; }
}

function renderJobs(jobs) {
  const act = jobs.filter(j => ACTIVE.includes(j.status)).length;
  $('qn').textContent = act ? `(${act})` : '';
  if (!jobs.length) { $('jobs').innerHTML = `<div class="empty"><b>⬇</b>${esc(t('empty_q'))}</div>`; return; }
  $('jobs').innerHTML = jobs.map(j => {
    const live = ACTIVE.includes(j.status), ind = j.percent < 0 && live;
    const center = j.status === 'done' ? '✓' : j.status === 'error' ? '!' : j.status === 'canceled' ? '✕' : ind ? '…' : Math.round(j.percent) + '%';
    const meta = [t(j.status), fmtSpeed(j.speed), j.eta ? 'ETA ' + fmtDur(j.eta) : '', j.note].filter(Boolean).join(' · ');
    return `<div class="job st-${j.status}"><div class="ring" style="--p:${ind ? 30 : Math.max(0, j.percent)}"><span>${center}</span></div>
      <div class="jb"><div class="jt">${esc(j.title || j.url)}</div><div class="mut ${j.status === 'error' ? 'err' : ''}">${esc(meta)}${j.error ? ' — ' + esc(j.error) : ''}</div>
      ${live ? `<div class="bar ${ind ? 'ind' : ''}" style="margin-top:5px"><i style="width:${Math.max(0, j.percent)}%"></i></div>` : ''}</div>
      <div class="ja">${live ? `<button data-a="cancel" data-id="${j.id}">${esc(t('cancel'))}</button>` : ''}
      ${['error', 'canceled'].includes(j.status) ? `<button data-a="retry" data-id="${j.id}">${esc(t('retry'))}</button>` : ''}
      ${j.status === 'done' ? `<button data-a="open" data-id="${j.id}" data-f="${esc(j.file)}">📂</button>` : ''}</div></div>`;
  }).join('');
}
async function tick() {
  try {
    if (engine === 'lite') {
      const jobs = await liteJobs(), now = Date.now();
      jobs.forEach(j => { const p = prevBytes[j.did]; if (p && j.status === 'downloading' && now > p.t) j.speed = Math.max(0, (j.bytes - p.b) * 1000 / (now - p.t)); prevBytes[j.did] = {b: j.bytes, t: now}; });
      renderJobs(jobs);
    } else renderJobs((await api('/jobs')).jobs.reverse());
  } catch (e) {}
}

async function loadHist() {
  try {
    if (engine === 'lite') histCache = (await chrome.storage.local.get('liteHist')).liteHist || [];
    else histCache = (await api('/history')).history;
  } catch (e) { histCache = []; }
  $('hist').innerHTML = histCache.length ? histCache.map((h, i) => `<div class="hrow"><div class="ring" style="--p:100;background:var(--chip)"><span style="font-size:18px">${ICON[h.kind] || '⬇'}</span></div>
    <div class="jb"><div class="jt">${esc(h.title)}</div><div class="mut">${new Date(h.time * 1000).toLocaleString()} ${esc(h.note || '')}</div></div>
    <div class="ja"><button data-a="hfolder" data-n="${i}">📂</button><button data-a="hredo" data-n="${i}">↻</button></div></div>`).join('')
    : `<div class="empty"><b>🕘</b>${esc(t('empty_h'))}</div>`;
}

function showTab(n) {
  curTab = n;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === n));
  ['dl', 'q', 'h'].forEach(x => $('tab-' + x).classList.toggle('hidden', x !== n));
  syncMode(); if (n === 'h') loadHist(); if (n === 'q') tick();
}

async function init() {
  S = await getS(); mode = S.mode;
  $('cont').value = S.vformat; $('qual').value = S.quality; $('afmt').value = S.aformat; $('subs').value = S.subs;
  $('sublangs').value = S.sublangs; $('embed').checked = S.embedCover;
  applyUI();
  const qs = new URLSearchParams(location.search);       // ?tabId= is only used for automated UI tests
  tab = qs.get('tabId') ? await chrome.tabs.get(+qs.get('tabId')) : (await chrome.tabs.query({active: true, currentWindow: true}))[0];
  if (tab && /^https?:/i.test(tab.url || '')) $('url').value = tab.url;
  syncMode();
  const ok = await connect();
  setInterval(tick, 1000); tick();
  if (ok && $('url').value && mode !== 'image') fetchInfo();
  if (!ok && tab && /^https?:/i.test(tab.url || '')) liteScanNow();
}

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
document.querySelectorAll('#seg button').forEach(b => b.onclick = () => { mode = b.dataset.m; syncMode(); });
$('bFetch').onclick = fetchInfo;
$('url').onkeydown = e => { if (e.key === 'Enter') fetchInfo(); };
$('bDl').onclick = onDownload;
$('exact').onchange = syncMode;
$('plAll').onchange = e => { document.querySelectorAll('.plc').forEach(c => c.checked = e.target.checked); updPl(); };
$('plList').onchange = updPl;
$('bScan').onclick = scanImages;
$('bGal').onclick = () => submit('gallery', [{url: $('url').value.trim()}], defaultOpts(S));
$('bImgs').onclick = () => {
  const items = [...document.querySelectorAll('.imc:checked')].map(c => ({url: scanned[+c.dataset.n].src}));
  if (items.length) submit('image', items, {...defaultOpts(S), referer: tab ? tab.url : ''});
};
$('bSet').onclick = () => chrome.runtime.openOptionsPage();
$('bLang').onclick = async () => { S = await setS({lang: S.lang === 'si' ? 'en' : 'si'}); applyUI(); renderInfo(); tick(); };
$('bTheme').onclick = async () => {
  const cur = S.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.theme;
  S = await setS({theme: cur === 'dark' ? 'light' : 'dark'}); applyUI();
};
$('bConn').onclick = async () => { await setS({token: $('tok').value.trim()}); if (await connect() && $('url').value) fetchInfo(); };
$('bClear').onclick = async () => { if (engine === 'lite') await liteClear(); else await api('/clear', {}); tick(); };
$('bClearH').onclick = async () => { if (engine === 'lite') await chrome.storage.local.set({liteHist: []}); else await api('/history/clear', {}); loadHist(); };
const openF = () => engine === 'lite' ? chrome.downloads.showDefaultFolder() : api('/open', {path: saveFolder}).catch(() => {});
$('bOpenF').onclick = openF; $('bOpenF2').onclick = openF;
$('jobs').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.id, did = +String(id).replace('d', '');
  if (engine === 'lite') {
    if (b.dataset.a === 'cancel') await chrome.downloads.cancel(did);
    if (b.dataset.a === 'retry') { const j = (await liteJobs()).find(x => x.did === did); if (j) await liteDownload({url: j.url, kind: j.kind}, j.title); }
    if (b.dataset.a === 'open') chrome.downloads.show(did);
  } else {
    if (b.dataset.a === 'cancel') await api('/cancel', {id});
    if (b.dataset.a === 'retry') { await api('/retry', {id}); chrome.runtime.sendMessage({type: 'kick', ids: [id]}); }
    if (b.dataset.a === 'open') await api('/open', {path: b.dataset.f || saveFolder});
  }
  tick();
};
$('hist').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const h = histCache[+b.dataset.n];
  if (b.dataset.a === 'hfolder') { if (engine === 'lite') (h.did ? chrome.downloads.show(h.did) : chrome.downloads.showDefaultFolder()); else api('/open', {path: h.file || saveFolder}); }
  if (b.dataset.a === 'hredo') { await submit(h.kind, [{url: h.url, title: h.title}], defaultOpts(S)); showTab('q'); }
};
$('liteList').onclick = e => { const b = e.target.closest('button'); if (b) liteGetOne(liteItems[+b.dataset.n]); };
$('bRescan').onclick = liteScanNow;
$('bGet').onclick = async () => {      // one click: download the installer straight from the latest GitHub release
  try { await chrome.downloads.download({url: 'https://github.com/shashin2000/socialdl/releases/latest/download/SocialDL-Setup.exe', filename: 'SocialDL-Setup.exe', conflictAction: 'uniquify'}); setMsg(t('setup_dl'), 'okc'); }
  catch (e) { chrome.tabs.create({url: 'https://github.com/shashin2000/socialdl/releases/latest'}); }
};
setInterval(() => { if (engine === 'lite') connect(); }, 5000);      // switches to Full by itself once the helper starts
init();
