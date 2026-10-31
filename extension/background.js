importScripts('common.js');

const known = new Map();
let polling = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const badge = (text, color) => { chrome.action.setBadgeText({text}); if (color) chrome.action.setBadgeBackgroundColor({color}); };
function flash(text, color) { badge(text, color); setTimeout(() => badge(''), 8000); }
function notify(msg) {
  chrome.notifications.create({type: 'basic', iconUrl: 'icons/icon128.png', title: 'SocialDL', message: String(msg).slice(0, 200)});
}

async function poll() {
  if (polling) return;
  polling = true;
  let lastOk = 0, lastErr = 0;
  try {
    for (let i = 0; i < 7200; i++) {
      let jobs;
      try { jobs = (await api('/jobs')).jobs; } catch (e) { break; }
      const active = jobs.filter(j => ['queued', 'downloading', 'processing'].includes(j.status));
      for (const j of jobs) {
        const prev = known.get(j.id);
        if (prev && ['queued', 'downloading', 'processing'].includes(prev)) {
          if (j.status === 'done') lastOk++;
          if (j.status === 'error') lastErr++;
        }
        known.set(j.id, j.status);
      }
      if (!active.length) break;
      badge(String(active.length), '#2d8cf0');
      await sleep(1000);
    }
  } finally { polling = false; }
  if (lastErr) flash('ERR', '#dc2626');
  else if (lastOk) flash('OK', '#16a34a');
  else badge('');
}

async function enqueue(kind, url, extra = {}) {
  try {
    const s = await getS();
    const opts = {...defaultOpts(s), ...(extra.opts || {})};
    const r = await api('/download', {kind, items: [{url, title: extra.title || ''}], opts});
    r.ids.forEach(id => known.set(id, 'queued'));
    poll();
    return {ok: true};
  } catch (e) {
    flash('ERR', '#dc2626');
    notify(e.message === 'NO_HELPER' ? t('no_helper') : e.message === 'NO_TOKEN' || e.message === 'BAD_TOKEN' ? t('token_help') : e.message);
    return {ok: false, error: e.message};
  }
}

async function buildMenus() {
  await getS();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id: 'v_page', title: t('ctx_v_page'), contexts: ['page', 'frame']});
    chrome.contextMenus.create({id: 'a_page', title: t('ctx_a_page'), contexts: ['page', 'frame']});
    chrome.contextMenus.create({id: 'g_page', title: t('ctx_g_page'), contexts: ['page', 'frame']});
    chrome.contextMenus.create({id: 'v_link', title: t('ctx_v_link'), contexts: ['link']});
    chrome.contextMenus.create({id: 'a_link', title: t('ctx_a_link'), contexts: ['link']});
    chrome.contextMenus.create({id: 'v_media', title: t('ctx_v_media'), contexts: ['video']});
    chrome.contextMenus.create({id: 'a_media', title: t('ctx_a_media'), contexts: ['video', 'audio']});
    chrome.contextMenus.create({id: 'i_img', title: t('ctx_i'), contexts: ['image']});
  });
}
chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);
chrome.storage.onChanged.addListener((c) => { if (c.s && (c.s.oldValue || {}).lang !== (c.s.newValue || {}).lang) buildMenus(); });

chrome.contextMenus.onClicked.addListener((info) => {
  const id = info.menuItemId;
  const page = info.pageUrl || info.frameUrl;
  const mediaUrl = info.srcUrl && !info.srcUrl.startsWith('blob:') ? info.srcUrl : page;
  if (id === 'v_page') enqueue('video', page);
  else if (id === 'a_page') enqueue('audio', page);
  else if (id === 'g_page') enqueue('gallery', page);
  else if (id === 'v_link') enqueue('video', info.linkUrl);
  else if (id === 'a_link') enqueue('audio', info.linkUrl);
  else if (id === 'v_media') enqueue('video', mediaUrl);
  else if (id === 'a_media') enqueue('audio', mediaUrl);
  else if (id === 'i_img') enqueue('image', info.srcUrl, {opts: {referer: page}});
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg.type === 'enqueue') { enqueue(msg.kind, msg.url).then(send); return true; }
  if (msg.type === 'kick') { (msg.ids || []).forEach(id => known.set(id, 'queued')); poll(); send({ok: true}); }
});

// ---- auto-update: the helper downloads new extension files from GitHub; reload ourselves when they are newer
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
