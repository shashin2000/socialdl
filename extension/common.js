const DEF = {lang: 'si', theme: 'auto', mode: 'video', vformat: 'mp4', aformat: 'mp3', quality: 'best', subs: 'none',
  sublangs: 'en,si', embedCover: true, pageButton: true, cookies: '', helper: 'http://127.0.0.1:47800', token: ''};
let LANG = 'si';

const TXT = {
en: {
  pill_on:'Connected', pill_off:'Not connected', boot:'Setting up tools…', boot_err:'Tool setup failed',
  repair_help:'Paired with another extension already. Run SocialDL-Helper.exe and press Yes to re-pair, or paste the token.',
  updates:'Updates', check_upd:'Check for updates', app_ver:'Version', latest:'Latest', up_to_date:'Up to date',
  restarting:'Updating – helper is restarting…', more:'More options', paste:'Paste', empty_q:'No downloads yet', empty_h:'History is empty',

  tab_dl:'Download', tab_q:'Queue', tab_hist:'History', fetch:'Fetch', url_ph:'Paste a video / page link',
  video:'Video', audio:'Audio', image:'Image', container:'Format', quality:'Quality', best:'Best',
  exact:'Exact format', auto:'Auto (by quality)', subs:'Subtitles', sub_none:'None', sub_save:'Download',
  sub_embed:'Embed in video', sublangs:'Languages (en,si)', clip:'Clip (optional)', start:'Start e.g. 1:30',
  end:'End e.g. 2:45', embed_cover:'Embed cover art & tags', download:'Download', download_sel:'Download selected',
  select_all:'Select all', items:'items', gallery:'Gallery download (gallery-dl)', scan:'Scan images on this page',
  found:'images found', cancel:'Cancel', retry:'Retry', clear:'Clear finished', open_folder:'Open folder',
  open_file:'Open', empty:'Nothing here yet', queued:'Queued', downloading:'Downloading', processing:'Processing',
  done:'Done', error:'Error', canceled:'Canceled', connect:'Connect', token_ph:'Paste helper token',
  token_help:'The installer copied the token to your clipboard. Paste it here once.',
  no_helper:'Helper is not running. Run install.bat (or start helper.py).', loading:'Loading…', added:'Added to queue',
  no_info:'Could not read info – you can still press Download.', settings:'Settings', saved:'Saved',
  test:'Test connection', connected:'Connected', folder:'Save folder', browse:'Browse', template:'Filename template',
  parallel:'Parallel downloads', cookies:'Use browser cookies (private / age-restricted videos)', cookies_none:'Off',
  page_btn:'Show a Download button on videos (YouTube / Facebook / TikTok …)', auto_update:'Auto-update yt-dlp',
  update_now:'Update now', updating:'Updating…', language:'Language', theme:'Theme', theme_auto:'Auto',
  theme_light:'Light', theme_dark:'Dark', defaults:'Defaults', helper_conn:'Helper connection', helper_url:'Helper URL',
  token:'Token', redo:'Download again', clear_hist:'Clear history', save:'Save', files:'files', versions:'Versions',
  ctx_v_page:'SocialDL: Download video (this page)', ctx_a_page:'SocialDL: Download MP3 (this page)',
  ctx_g_page:'SocialDL: Download images (this page)', ctx_v_link:'SocialDL: Download video (link)',
  ctx_a_link:'SocialDL: Download MP3 (link)', ctx_v_media:'SocialDL: Download this video',
  ctx_a_media:'SocialDL: Download as MP3', ctx_i:'SocialDL: Download image', folder_hint:'Needs the helper to be running.',
  storage:'Storage & files', ffmpeg_missing:'ffmpeg not found – merging / MP3 need it (winget install Gyan.FFmpeg)'
},
si: {
  pill_on:'සම්බන්ධයි', pill_off:'සම්බන්ධ නැත', boot:'මෙවලම් සකසමින්…', boot_err:'මෙවලම් සැකසීම අසාර්ථකයි',
  repair_help:'වෙනත් extension එකක් සමඟ දැනටමත් pair කරලා. SocialDL-Helper.exe එක click කරලා Yes දීලා re-pair කරන්න, නැත්නම් token එක paste කරන්න.',
  updates:'යාවත්කාලීන', check_upd:'යාවත්කාලීන සොයන්න', app_ver:'අනුවාදය', latest:'නවතම', up_to_date:'නවතමයි',
  restarting:'යාවත්කාලීන වෙමින් – helper restart වෙනවා…', more:'තවත් විකල්ප', paste:'Paste', empty_q:'තවම බාගැනීම් නැත', empty_h:'ඉතිහාසය හිස්',

  tab_dl:'බාගන්න', tab_q:'පෝලිම', tab_hist:'ඉතිහාසය', fetch:'තොරතුරු', url_ph:'වීඩියෝ / පිටු link එක දාන්න',
  video:'වීඩියෝ', audio:'ශ්‍රව්‍ය', image:'රූප', container:'ෆෝමැට්', quality:'ගුණාත්මකභාවය', best:'හොඳම',
  exact:'නිශ්චිත ෆෝමැට්', auto:'ස්වයංක්‍රීය (quality අනුව)', subs:'උපසිරැසි', sub_none:'නැත', sub_save:'බාගන්න',
  sub_embed:'වීඩියෝවට ඇතුළත් කරන්න', sublangs:'භාෂා (en,si)', clip:'කොටසක් පමණක් (අවශ්‍ය නම්)', start:'ආරම්භය 1:30',
  end:'අවසානය 2:45', embed_cover:'Cover art සහ tags ඇතුළත් කරන්න', download:'බාගන්න', download_sel:'තෝරාගත් ඒවා බාගන්න',
  select_all:'සියල්ල තෝරන්න', items:'ක්', gallery:'Gallery බාගැනීම (gallery-dl)', scan:'පිටුවේ රූප සොයන්න',
  found:'රූප හමුවුණා', cancel:'නවත්වන්න', retry:'නැවත', clear:'අවසන් ඒවා ඉවත් කරන්න', open_folder:'ෆෝල්ඩරය විවෘත කරන්න',
  open_file:'විවෘත කරන්න', empty:'තවම කිසිවක් නැත', queued:'පෝලිමේ', downloading:'බාගත වෙමින්', processing:'සකසමින්',
  done:'අවසන්', error:'දෝෂයක්', canceled:'නවත්වා ඇත', connect:'සම්බන්ධ කරන්න', token_ph:'Helper token එක paste කරන්න',
  token_help:'Installer එක token එක clipboard එකට copy කරලා තියෙනවා. එක පාරක් මෙතන paste කරන්න.',
  no_helper:'Helper ධාවනය වෙන්නේ නැහැ. install.bat run කරන්න (නැත්නම් helper.py start කරන්න).', loading:'පූරණය වෙමින්…',
  added:'පෝලිමට එක් කළා', no_info:'තොරතුරු ගන්න බැරි වුණා – ඒත් බාගන්න බොත්තම ඔබන්න පුළුවන්.', settings:'සැකසුම්',
  saved:'සුරැකුවා', test:'සම්බන්ධතාවය පරීක්ෂා කරන්න', connected:'සම්බන්ධයි', folder:'සුරකින ෆෝල්ඩරය', browse:'තෝරන්න',
  template:'ගොනු නාම ආකෘතිය', parallel:'එකවර බාගැනීම් ගණන', cookies:'Browser cookies භාවිතා කරන්න (private / වයස් සීමා videos)',
  cookies_none:'අක්‍රියයි', page_btn:'වීඩියෝ උඩ Download බොත්තම පෙන්වන්න (YouTube / Facebook / TikTok …)',
  auto_update:'yt-dlp ස්වයංක්‍රීයව update කරන්න', update_now:'දැන් update කරන්න', updating:'Update වෙමින්…',
  language:'භාෂාව', theme:'තේමාව', theme_auto:'ස්වයංක්‍රීය', theme_light:'ආලෝක', theme_dark:'අඳුරු', defaults:'පෙරනිමි',
  helper_conn:'Helper සම්බන්ධතාවය', helper_url:'Helper URL', token:'Token', redo:'නැවත බාගන්න', clear_hist:'ඉතිහාසය මකන්න',
  save:'සුරකින්න', files:'ගොනු', versions:'Versions',
  ctx_v_page:'SocialDL: වීඩියෝව බාගන්න (මේ පිටුව)', ctx_a_page:'SocialDL: MP3 බාගන්න (මේ පිටුව)',
  ctx_g_page:'SocialDL: රූප බාගන්න (මේ පිටුව)', ctx_v_link:'SocialDL: වීඩියෝව බාගන්න (link)',
  ctx_a_link:'SocialDL: MP3 බාගන්න (link)', ctx_v_media:'SocialDL: මේ වීඩියෝව බාගන්න', ctx_a_media:'SocialDL: MP3 විදියට බාගන්න',
  ctx_i:'SocialDL: රූපය බාගන්න', folder_hint:'Helper එක ධාවනය වෙන්න ඕනේ.', storage:'ගබඩාව',
  ffmpeg_missing:'ffmpeg හම්බුණේ නැහැ – merge / MP3 වලට ඕනේ (winget install Gyan.FFmpeg)'
}};

function t(k) { return (TXT[LANG] && TXT[LANG][k]) || TXT.en[k] || k; }
async function getS() { const r = await chrome.storage.local.get('s'); const s = {...DEF, ...(r.s || {})}; LANG = s.lang; return s; }
async function setS(p) { const s = {...(await getS()), ...p}; await chrome.storage.local.set({s}); LANG = s.lang; return s; }
function defaultOpts(s) {
  return {container: s.vformat, quality: s.quality, format: '', aformat: s.aformat, subs: s.subs,
          sublangs: s.sublangs, embed: s.embedCover, cookies: s.cookies};
}
const vt = v => (String(v).match(/\d+/g) || ['0']).slice(0, 3).map(Number);
const newer = (a, b) => { const x = vt(a), y = vt(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

async function autoPair() {
  const s = await getS();
  let r;
  try { r = await fetch(s.helper + '/pair', {method: 'POST'}); } catch (e) { throw new Error('NO_HELPER'); }
  if (!r.ok) throw new Error('NO_TOKEN');
  const j = await r.json();
  await setS({token: j.token});
  return j.token;
}
async function api(path, body, retried) {
  const s = await getS();
  const token = s.token || await autoPair();
  let r;
  try {
    r = await fetch(s.helper + path, {method: body === undefined ? 'GET' : 'POST',
      headers: {'X-Token': token, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body)});
  } catch (e) { throw new Error('NO_HELPER'); }
  if (r.status === 401) {
    if (!retried) { try { await setS({token: ''}); return await api(path, body, true); } catch (e) { throw e; } }
    throw new Error('BAD_TOKEN');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
