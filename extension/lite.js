// Lite engine: works with NO helper, using only chrome.downloads (direct media files).
const LITE_MEDIA = /\.(mp4|m4v|webm|mov|mkv|mp3|m4a|aac|ogg|oga|opus|wav|flac)(?=[?#]|$)/i;
const LITE_AUDIO = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac'];
const safeName = s => String(s || 'download').replace(/[<>:"\/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 110) || 'download';
const extOf = u => { const m = String(u).match(/\.([a-z0-9]{2,5})(?=[?#]|$)/i); return m ? m[1].toLowerCase() : ''; };

function scoreItem(it) {
  let s = Math.min(it.h || 0, 2160) / 40;
  if (/hd|hq/i.test(it.label || '')) s += 20;
  if (it.ext === 'mp4') s += 5;
  if (it.src === 'site') s += 10; else if (it.src === 'player') s += 4;
  return s;
}
function pickBest(items, kind) { return items.filter(i => i.kind === kind).sort((a, b) => scoreItem(b) - scoreItem(a))[0] || null; }

async function scanTab(tabId) {
  await chrome.scripting.executeScript({target: {tabId}, files: ['scan.js']});
  const [r] = await chrome.scripting.executeScript({target: {tabId}, func: () => sdlScan()});
  return r.result || {title: '', items: []};
}

async function liteDownload(item, title) {
  const ext = item.ext || extOf(item.url) || (item.kind === 'image' ? 'jpg' : item.kind === 'audio' ? 'm4a' : 'mp4');
  const base = safeName((title || item.title || 'media') + (item.label ? ' [' + item.label + ']' : ''));
  const id = await chrome.downloads.download({url: item.url, filename: 'SocialDL/' + base + '.' + ext, conflictAction: 'uniquify'});
  const {liteMeta: m = {}} = await chrome.storage.local.get('liteMeta');
  m[id] = {id, title: base, url: item.url, kind: item.kind || 'video', t: Date.now(), hidden: false};
  const keep = Object.values(m).sort((a, b) => b.t - a.t).slice(0, 120);
  await chrome.storage.local.set({liteMeta: Object.fromEntries(keep.map(x => [x.id, x]))});
  return id;
}

async function liteJobs() {
  const {liteMeta: m = {}} = await chrome.storage.local.get('liteMeta');
  const list = (await chrome.downloads.search({orderBy: ['-startTime'], limit: 300})).filter(d => m[d.id] && !m[d.id].hidden);
  return list.map(d => {
    const meta = m[d.id];
    const status = d.state === 'complete' ? 'done' : d.state === 'interrupted' ? (d.error === 'USER_CANCELED' ? 'canceled' : 'error') : (d.paused ? 'queued' : 'downloading');
    const eta = d.estimatedEndTime ? Math.max(0, (new Date(d.estimatedEndTime) - Date.now()) / 1000) : null;
    return {id: 'd' + d.id, did: d.id, title: meta.title, url: meta.url, kind: meta.kind, status, bytes: d.bytesReceived, file: d.filename,
      percent: d.totalBytes > 0 ? d.bytesReceived * 100 / d.totalBytes : (status === 'done' ? 100 : -1), speed: null, eta, error: status === 'error' ? d.error : '', note: ''};
  });
}
async function liteClear() {
  const {liteMeta: m = {}} = await chrome.storage.local.get('liteMeta');
  const jobs = await liteJobs();
  jobs.filter(j => j.status !== 'downloading' && j.status !== 'queued').forEach(j => { if (m[j.did]) m[j.did].hidden = true; });
  await chrome.storage.local.set({liteMeta: m});
}
async function liteHistAdd(rec) {
  const {liteHist: h = []} = await chrome.storage.local.get('liteHist');
  h.unshift(rec);
  await chrome.storage.local.set({liteHist: h.slice(0, 300)});
}
