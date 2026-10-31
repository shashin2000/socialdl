const $ = id => document.getElementById(id);
let S, helperOk = false;
const ids = ['lang', 'theme', 'mode', 'vformat', 'quality', 'aformat', 'subs', 'sublangs', 'cookies', 'helper', 'token'];
const chks = ['embedCover', 'pageButton'];

function applyUI() {
  document.documentElement.dataset.theme = S.theme;
  document.querySelectorAll('[data-i]').forEach(e => e.textContent = t(e.dataset.i));
}
function showApp(a) { if (a) $('appv').textContent = `${t('app_ver')}: ${a.version || '?'} · extension: ${chrome.runtime.getManifest().version} · ${t('latest')}: ${a.latest || '—'}`; }
function showVers(v) { $('vers').textContent = v ? `yt-dlp ${v.yt_dlp || '?'} · gallery-dl ${v.gallery_dl || '?'} · ffmpeg ${v.ffmpeg ? '✓' : '✗'}` : ''; }

async function loadHelper() {
  try {
    const st = await api('/status'); helperOk = true;
    $('folder').value = st.config.folder; $('template').value = st.config.template;
    showApp(st.app); $('maxp').value = st.config.max_parallel; $('autoUpd').checked = !!st.config.auto_update; showVers(st.versions);
    $('testR').textContent = '✓ ' + t('connected'); $('testR').className = 'okc';
  } catch (e) {
    helperOk = false; $('testR').textContent = e.message === 'NO_HELPER' ? t('no_helper') : t('token_help'); $('testR').className = 'err';
  }
}

async function init() {
  S = await getS(); applyUI();
  ids.forEach(i => $(i).value = S[i]); chks.forEach(i => $(i).checked = !!S[i]);
  loadHelper();
}
$('lang').onchange = async () => { S = await setS({lang: $('lang').value}); applyUI(); };
$('theme').onchange = async () => { S = await setS({theme: $('theme').value}); applyUI(); };
$('bTest').onclick = async () => { await setS({helper: $('helper').value.trim(), token: $('token').value.trim()}); loadHelper(); };
$('bBrowse').onclick = async () => { try { const r = await api('/pickfolder', {}); if (r.folder) $('folder').value = r.folder; } catch (e) {} };
$('bUpd').onclick = async () => {
  $('vers').textContent = t('updating');
  try { const r = await api('/update', {}); showVers(r.versions); } catch (e) { $('vers').textContent = e.message; }
};
$('bCheck').onclick = async () => {
  $('updR').textContent = t('updating'); $('updR').className = 'mut';
  try {
    const r = await api('/update', {}); showVers(r.versions); showApp(r.app);
    $('updR').textContent = r.error ? r.error : r.restarting ? t('restarting') : '✓ ' + t('up_to_date'); $('updR').className = r.error ? 'err' : 'okc';
  } catch (e) { $('updR').textContent = e.message; $('updR').className = 'err'; }
};
$('bSave').onclick = async () => {
  const p = {}; ids.forEach(i => p[i] = $(i).value.trim()); chks.forEach(i => p[i] = $(i).checked);
  S = await setS(p); applyUI();
  if (helperOk) {
    try { await api('/config', {folder: $('folder').value.trim(), template: $('template').value.trim(), max_parallel: +$('maxp').value || 2, auto_update: $('autoUpd').checked}); } catch (e) {}
  }
  $('saved').textContent = '✓ ' + t('saved'); setTimeout(() => $('saved').textContent = '', 2500);
};
init();
