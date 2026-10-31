#!/usr/bin/env python3
"""SocialDL helper - local yt-dlp / gallery-dl service with self-setup and GitHub auto-update.

* Double-click the released SocialDL-Setup.exe once: it installs itself, downloads the tools
  (yt-dlp, gallery-dl, ffmpeg, deno), unpacks the browser extension and starts on every login.
* Listens on 127.0.0.1 only; only browser-extension origins that hold the secret token may call it.
"""
import collections, ctypes, hashlib, json, mimetypes, os, re, secrets, shutil, subprocess, sys, threading, time
import urllib.parse, urllib.request, uuid, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.1.0"
REPO = "shashin2000/socialdl"
FROZEN = bool(getattr(sys, "frozen", False))
WIN = os.name == "nt"
DATA = Path(os.environ.get("APPDATA") or (Path.home() / ".config")) / "SocialDL"          # config, token, history
INSTALL = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / ".local" / "share")) / "SocialDL"  # exe, bin, extension
BIN, EXT_DIR, INSTALL_EXE = INSTALL / "bin", INSTALL / "extension", INSTALL / "SocialDL-Helper.exe"
for _d in (DATA,):
    _d.mkdir(parents=True, exist_ok=True)
CFG_FILE, HIST_FILE, TOKEN_FILE, LOG_FILE = DATA / "config.json", DATA / "history.json", DATA / "token.txt", DATA / "helper.log"
DEFAULT_CFG = {"port": 47800, "folder": str(Path.home() / "Downloads" / "SocialDL"), "template": "%(title).150B.%(ext)s",
               "max_parallel": 2, "auto_update": True, "ffmpeg": "", "last_update": 0, "paired": False, "ext_origin": ""}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
EXT_SCHEMES = ("chrome-extension://", "moz-extension://", "edge-extension://")
TOOL_URLS = {
    "yt-dlp": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
    "gallery-dl": "https://github.com/mikf/gallery-dl/releases/latest/download/gallery-dl.exe",
    "deno": "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip",
    "ffmpeg": "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
}


def log(*a):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(x) for x in a) + "\n")
        if LOG_FILE.stat().st_size > 500_000:
            LOG_FILE.write_text("", encoding="utf-8")
    except Exception:
        pass


def load_json(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(p, obj):
    tmp = Path(str(p) + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


cfg = {**DEFAULT_CFG, **load_json(CFG_FILE, {})}


def get_token():
    if TOKEN_FILE.exists() and TOKEN_FILE.read_text().strip():
        return TOKEN_FILE.read_text().strip()
    t = secrets.token_urlsafe(24)
    TOKEN_FILE.write_text(t)
    return t


TOKEN = get_token()


def py_exe():
    exe = sys.executable
    if os.path.basename(exe).lower() == "pythonw.exe" and os.path.exists(os.path.join(os.path.dirname(exe), "python.exe")):
        return os.path.join(os.path.dirname(exe), "python.exe")
    return exe


PY = py_exe()
ENV = os.environ.copy()
ENV["PATH"] = str(BIN) + os.pathsep + ENV.get("PATH", "")
ENV["PYTHONUTF8"] = "1"
ENV["PYTHONIOENCODING"] = "utf-8"


def tool_cmd(name, module):
    exe = BIN / (name + (".exe" if WIN else ""))
    if exe.exists():
        return [str(exe)]
    if FROZEN:
        raise RuntimeError("%s is not ready yet - tools are still being downloaded" % name)
    return [PY, "-m", module]


def run_capture(args, timeout=60):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=timeout, creationflags=NOWIN, env=ENV)


def ytdlp_base(cookies=""):
    a = tool_cmd("yt-dlp", "yt_dlp") + ["--no-warnings", "--windows-filenames", "--no-mtime"]
    if cfg.get("ffmpeg"):
        a += ["--ffmpeg-location", cfg["ffmpeg"]]
    elif (BIN / "ffmpeg.exe").exists():
        a += ["--ffmpeg-location", str(BIN)]
    if cookies:
        a += ["--cookies-from-browser", cookies]
    return a


# ================================================================ downloading tools / updates
BOOT = {"state": "idle", "msg": "", "pct": 0}
UPD = {"latest": "", "checked": 0, "msg": ""}


def download(url, dest, label="", sha=None):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r, open(tmp, "wb") as f:
        total, got = int(r.headers.get("Content-Length") or 0), 0
        while True:
            c = r.read(1 << 17)
            if not c:
                break
            f.write(c)
            h.update(c)
            got += len(c)
            if total:
                BOOT["pct"] = int(got * 100 / total)
                BOOT["msg"] = label
    if sha and h.hexdigest().lower() != sha.lower():
        tmp.unlink(missing_ok=True)
        raise RuntimeError("checksum mismatch for " + dest.name)
    os.replace(tmp, dest)


def extract_members(zpath, wanted):
    """wanted: {suffix_in_zip: dest_path}"""
    with zipfile.ZipFile(zpath) as z:
        for n in z.namelist():
            for suf, dest in wanted.items():
                if n.lower().endswith(suf):
                    Path(dest).parent.mkdir(parents=True, exist_ok=True)
                    with z.open(n) as src, open(dest, "wb") as out:
                        shutil.copyfileobj(src, out)


def ensure_tools():
    if BOOT["state"] == "working":
        return
    BOOT.update(state="working", msg="", pct=0)
    try:
        BIN.mkdir(parents=True, exist_ok=True)
        for n in ("yt-dlp", "gallery-dl"):
            if not (BIN / (n + ".exe")).exists():
                download(TOOL_URLS[n], BIN / (n + ".exe"), "Downloading " + n)
        if not (BIN / "deno.exe").exists():
            download(TOOL_URLS["deno"], BIN / "deno.zip", "Downloading deno")
            extract_members(BIN / "deno.zip", {"deno.exe": BIN / "deno.exe"})
            (BIN / "deno.zip").unlink(missing_ok=True)
        if not (BIN / "ffmpeg.exe").exists():
            download(TOOL_URLS["ffmpeg"], BIN / "ffmpeg.zip", "Downloading ffmpeg (large, one time)")
            BOOT["msg"] = "Unpacking ffmpeg"
            extract_members(BIN / "ffmpeg.zip", {"bin/ffmpeg.exe": BIN / "ffmpeg.exe", "bin/ffprobe.exe": BIN / "ffprobe.exe"})
            (BIN / "ffmpeg.zip").unlink(missing_ok=True)
        BOOT.update(state="ready", msg="", pct=100)
    except Exception as e:
        log("bootstrap failed", e)
        BOOT.update(state="error", msg=str(e)[:200])


def gh_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SocialDL", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_text(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "SocialDL"}), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def vt(v):
    return tuple(int(x) for x in re.findall(r"\d+", str(v))[:3]) or (0,)


def parse_sums(txt):
    d = {}
    for line in txt.splitlines():
        m = re.match(r"([0-9a-fA-F]{64})\s+\*?(.+)", line.strip())
        if m:
            d[m.group(2).strip()] = m.group(1)
    return d


def spawn_self(args=()):
    env = os.environ.copy()
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"      # make the child an independent onefile instance
    subprocess.Popen([str(INSTALL_EXE), *args], env=env, close_fds=True, creationflags=0x00000008 | 0x00000200,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ext_disk_version():
    return str(load_json(EXT_DIR / "manifest.json", {}).get("version", ""))


def is_installed_copy():
    try:
        return Path(sys.executable).resolve() == INSTALL_EXE.resolve()
    except Exception:
        return False


def check_app_update():
    """Look at the latest GitHub release; verify SHA256 and install extension + helper. Returns True if restarting."""
    rel = gh_json("https://api.github.com/repos/%s/releases/latest" % REPO)
    tag = rel["tag_name"].lstrip("vV")
    UPD.update(latest=tag, checked=time.time())
    if vt(tag) <= vt(VERSION) and vt(tag) <= vt(ext_disk_version() or "0"):
        return False
    assets = {a["name"]: a["browser_download_url"] for a in rel.get("assets", [])}
    if "SHA256SUMS.txt" not in assets:
        raise RuntimeError("release has no SHA256SUMS.txt - refusing to update")
    sums = parse_sums(fetch_text(assets["SHA256SUMS.txt"]))

    def need(name):
        if name not in assets or name not in sums:
            raise RuntimeError("release is missing %s or its checksum" % name)
        return assets[name], sums[name]

    if INSTALL.exists() and vt(tag) > vt(ext_disk_version() or "0"):      # 1) extension files
        url, sha = need("extension.zip")
        z = INSTALL / "extension.zip"
        download(url, z, "Updating extension", sha)
        stage = INSTALL / "ext_stage"
        shutil.rmtree(stage, ignore_errors=True)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(stage)
        EXT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copytree(stage, EXT_DIR, dirs_exist_ok=True)
        shutil.rmtree(stage, ignore_errors=True)
        z.unlink(missing_ok=True)
        log("extension updated to", tag)
    if FROZEN and is_installed_copy() and vt(tag) > vt(VERSION):          # 2) helper exe
        url, sha = need("SocialDL-Setup.exe")
        new = INSTALL / "SocialDL-Helper.exe.new"
        download(url, new, "Updating helper", sha)

        def swap():
            time.sleep(1.2)
            old = INSTALL / "SocialDL-Helper.exe.old"
            old.unlink(missing_ok=True)
            os.replace(INSTALL_EXE, old)
            os.replace(new, INSTALL_EXE)
            spawn_self(["--updated"])
            os._exit(0)
        threading.Thread(target=swap, daemon=True).start()
        return True
    return False


def update_gallery_dl():
    rel = gh_json("https://api.github.com/repos/mikf/gallery-dl/releases/latest")
    tag = rel["tag_name"]
    vf = BIN / "gallery-dl.version"
    if vf.exists() and vf.read_text().strip() == tag:
        return
    asset = next((a for a in rel["assets"] if a["name"] == "gallery-dl.exe"), None)
    if asset:
        download(asset["browser_download_url"], BIN / "gallery-dl.exe", "Updating gallery-dl")
        vf.write_text(tag)


def update_tools():
    """Update yt-dlp + gallery-dl. Returns (ok, message)."""
    try:
        if FROZEN or (BIN / "yt-dlp.exe").exists():
            r = run_capture(tool_cmd("yt-dlp", "yt_dlp") + ["-U"], 300)
            ok = r.returncode == 0
            update_gallery_dl()
        else:
            r = run_capture([PY, "-m", "pip", "install", "-U", "yt-dlp[default]", "gallery-dl"], 900)
            ok = r.returncode == 0
        cfg["last_update"] = time.time()
        save_json(CFG_FILE, cfg)
        _ver["t"] = 0
        return ok, (r.stdout or "")[-200:]
    except Exception as e:
        log("tool update failed", e)
        return False, str(e)[:200]


def updater():
    time.sleep(20)
    while True:
        try:
            if cfg.get("auto_update") and time.time() - cfg.get("last_update", 0) > 86400:
                update_tools()
                check_app_update()
        except Exception as e:
            log("auto-update failed", e)
            cfg["last_update"] = time.time() - 86400 + 3600       # retry in an hour
        time.sleep(3600)


# ================================================================ media info
def _thumb(e):
    if e.get("thumbnail"):
        return e["thumbnail"]
    th = e.get("thumbnails") or []
    return th[-1].get("url", "") if th else ""


def get_info(url, cookies="", depth=0):
    r = run_capture(ytdlp_base(cookies) + ["-J", "--flat-playlist", url], 150)
    if cookies and r.returncode != 0 and "cookie" in (r.stderr or "").lower():
        cookies = ""  # browser cookies unreadable (Chrome locked/encrypted) - retry without them
        r = run_capture(ytdlp_base("") + ["-J", "--flat-playlist", url], 150)
    if r.returncode != 0 or not r.stdout.strip():
        lines = [l for l in (r.stderr or "").splitlines() if "ERROR" in l]
        raise RuntimeError((lines[-1] if lines else (r.stderr or "yt-dlp failed")[-300:]).strip())
    d = json.loads(r.stdout)
    if d.get("_type") == "playlist":
        ents = [e for e in (d.get("entries") or []) if e]
        if depth < 2 and ents and all(e.get("ie_key") == "YoutubeTab" for e in ents):
            pick = next((e for e in ents if str(e.get("url", "")).rstrip("/").endswith("/videos")), ents[0])
            return get_info(pick["url"], cookies, depth + 1)
        out = []
        for e in ents:
            u = e.get("url") or e.get("webpage_url")
            if not u and e.get("id") and (e.get("ie_key") or "").lower() == "youtube":
                u = "https://www.youtube.com/watch?v=" + e["id"]
            if u:
                out.append({"id": e.get("id"), "title": e.get("title") or u, "url": u, "duration": e.get("duration"), "thumb": _thumb(e)})
        return {"type": "playlist", "title": d.get("title") or "Playlist", "uploader": d.get("uploader") or d.get("channel") or "",
                "thumb": _thumb(d) or (out[0]["thumb"] if out else ""), "entries": out}
    fm = []
    for f in d.get("formats") or []:
        vc, ac = f.get("vcodec") or "none", f.get("acodec") or "none"
        if vc == "none":
            continue
        fm.append({"id": f["format_id"], "ext": f.get("ext"), "h": f.get("height") or 0, "fps": f.get("fps"),
                   "vc": vc.split(".")[0], "ac": "" if ac == "none" else ac.split(".")[0],
                   "size": f.get("filesize") or f.get("filesize_approx"), "vonly": ac == "none", "tbr": f.get("tbr") or 0})
    fm.sort(key=lambda x: (x["h"], x["tbr"]), reverse=True)
    subs = sorted(set(list((d.get("subtitles") or {}).keys()) + list((d.get("automatic_captions") or {}).keys())))[:40]
    return {"type": "video", "title": d.get("title"), "uploader": d.get("uploader") or d.get("channel") or "",
            "duration": d.get("duration"), "thumb": _thumb(d), "formats": fm[:60], "subs": subs, "url": d.get("webpage_url") or url}


# ================================================================ jobs
JOBS = collections.OrderedDict()
PENDING = collections.deque()
cv = threading.Condition()
running = 0
hist_lock = threading.Lock()


def num(s):
    try:
        return float(s)
    except Exception:
        return None


def add_history(job):
    with hist_lock:
        h = load_json(HIST_FILE, [])
        h.append({"title": job["title"] or job["url"], "url": job["url"], "kind": job["kind"], "file": job["file"],
                  "note": job["note"], "time": time.time()})
        save_json(HIST_FILE, h[-500:])


def finish(job, status, error=""):
    job.update(status=status, error=error, finished=time.time(), speed=None, eta=None)
    if status == "done":
        job["percent"] = 100
        add_history(job)


def kill(job):
    p = job.get("proc")
    if p and p.poll() is None:
        try:
            if WIN:
                subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True, creationflags=NOWIN)
            else:
                p.terminate()
        except Exception:
            pass


def unique_path(p):
    p = Path(p)
    i = 1
    while p.exists():
        p = p.with_name(f"{Path(p).stem.rsplit(' (', 1)[0]} ({i}){p.suffix}")
        i += 1
    return p


def build_ytdlp_cmd(job):
    o, kind = job["opts"], job["kind"]
    folder = cfg["folder"]
    Path(folder).mkdir(parents=True, exist_ok=True)
    tmpl = cfg["template"]
    cs, ce = (o.get("clipStart") or "").strip(), (o.get("clipEnd") or "").strip()
    cmd = ytdlp_base(o.get("cookies", "")) + ["--newline", "--no-playlist", "--progress", "--no-simulate", "--concurrent-fragments", "4",
        "--progress-template", "download:SDLP|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.fragment_index)s|%(progress.fragment_count)s",
        "--progress-template", "postprocess:SDLPP|%(progress.postprocessor)s|%(progress.status)s",
        "--print", "before_dl:SDLT|%(title)s", "--print", "after_move:SDLFILE|%(filepath)s"]
    if cs or ce:
        suffix = " [clip %s-%s]" % (cs.replace(":", "-") or "0", ce.replace(":", "-") or "end")
        if tmpl.endswith(".%(ext)s"):
            tmpl = tmpl[:-8] + suffix + ".%(ext)s"
        cmd += ["--download-sections", "*%s-%s" % (cs or "0", ce or "inf"), "--force-keyframes-at-cuts"]
    cmd += ["-o", os.path.join(folder, tmpl)]
    if kind == "audio":
        af = o.get("aformat", "mp3")
        cmd += ["-f", "bestaudio/best", "-x", "--audio-format", af, "--audio-quality", "0"]
        if o.get("embed", True) and af != "wav":
            cmd += ["--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "jpg"]
    else:
        fmt = o.get("format")
        if not fmt:
            q = str(o.get("quality", "best"))
            fmt = "bv*+ba/b" if q == "best" else "bv*[height<=%s]+ba/b[height<=%s]/b" % (q, q)
        cont = o.get("container", "mp4")
        cmd += ["-f", fmt, "--merge-output-format", {"mp4": "mp4/mkv", "mkv": "mkv", "webm": "webm/mkv"}.get(cont, "mp4/mkv")]
        if cont in ("mp4", "mkv"):
            cmd += ["--remux-video", cont]
        if o.get("subs", "none") in ("save", "embed"):
            cmd += ["--write-subs", "--write-auto-subs", "--sub-langs", o.get("sublangs") or "en", "--convert-subs", "srt"]
            if o["subs"] == "embed":
                cmd += ["--embed-subs"]
    return cmd + [job["url"]]


def pump(job, cmd, parse):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                         errors="replace", creationflags=NOWIN, env=ENV)
    job["proc"] = p
    err = ""
    for raw in p.stdout:
        line = raw.strip()
        if "ERROR" in line:
            err = line
        parse(line)
    return p.wait(), err


def run_ytdlp(job):
    def parse(line):
        if line.startswith("SDLP|"):
            parts = (line.split("|") + [""] * 8)[:8]
            db, tb, te, sp, eta, fi, fc = [num(x) for x in parts[1:]]
            tot = tb or te
            if tot and db is not None:
                job["percent"] = round(min(100.0, db * 100 / tot), 1)
            elif fc:
                job["percent"] = round(min(100.0, (fi or 0) * 100 / fc), 1)
            job.update(status="downloading", speed=sp, eta=eta)
        elif line.startswith("SDLPP|"):
            if line.endswith("started"):
                job.update(status="processing", percent=100, speed=None, eta=None)
        elif line.startswith("SDLT|"):
            if not job["title"]:
                job["title"] = line[5:]
        elif line.startswith("SDLFILE|"):
            job["file"] = line[8:]
    rc, err = pump(job, build_ytdlp_cmd(job), parse)
    if rc != 0 and not job["canceled"] and job["opts"].get("cookies") and "cookie" in err.lower():
        job["opts"] = {**job["opts"], "cookies": ""}      # fall back to no cookies
        job["percent"] = 0
        rc, err = pump(job, build_ytdlp_cmd(job), parse)
    if job["canceled"]:
        return finish(job, "canceled")
    if rc == 0:
        return finish(job, "done")
    msg = err or "download failed"
    if "ffmpeg" in msg.lower() or "ffprobe" in msg.lower():
        msg += "  (ffmpeg missing?)"
    finish(job, "error", msg[-300:])


def run_gallery(job):
    folder = cfg["folder"]
    Path(folder).mkdir(parents=True, exist_ok=True)
    cmd = tool_cmd("gallery-dl", "gallery_dl") + ["-d", folder]
    if job["opts"].get("cookies"):
        cmd += ["--cookies-from-browser", job["opts"]["cookies"]]
    cmd.append(job["url"])
    job["percent"] = -1
    count = [0]

    def parse(line):
        if line and not line.startswith("#") and ("\\" in line or "/" in line) and not line.startswith("["):
            count[0] += 1
            job.update(file=line, note="%d files" % count[0], status="downloading")
    rc, err = pump(job, cmd, parse)
    if job["canceled"]:
        return finish(job, "canceled")
    if rc == 0 and count[0] > 0:
        job["file"] = folder
        return finish(job, "done")
    finish(job, "error", err or "no images found")


def run_image(job):
    url, ref = job["url"], job["opts"].get("referer")
    folder = Path(cfg["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    hdr = {"User-Agent": UA}
    if ref:
        hdr["Referer"] = ref
    with urllib.request.urlopen(urllib.request.Request(url, headers=hdr), timeout=40) as r:
        ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip()
        total = int(r.headers.get("Content-Length") or 0)
        name = "image" if url.startswith("data:") else urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(url).path)) or "image"
        name = re.sub(r'[<>:"/\\|?*]', "_", name)[:120]
        if not os.path.splitext(name)[1]:
            ext = mimetypes.guess_extension(ctype) or ".jpg"
            name += {".jpe": ".jpg", ".jfif": ".jpg"}.get(ext, ext)
        path = unique_path(folder / name)
        job["title"] = path.name
        got = 0
        with open(path, "wb") as f:
            while True:
                chunk = r.read(65536)
                if not chunk or job["canceled"]:
                    break
                f.write(chunk)
                got += len(chunk)
                if total:
                    job["percent"] = round(got * 100 / total, 1)
    if job["canceled"]:
        path.unlink(missing_ok=True)
        return finish(job, "canceled")
    job["file"] = str(path)
    finish(job, "done")


def run_job(job):
    global running
    try:
        if job["canceled"]:
            finish(job, "canceled")
        else:
            job["status"] = "downloading"
            {"gallery": run_gallery, "image": run_image}.get(job["kind"], run_ytdlp)(job)
    except Exception as e:
        log("job error", job["url"], e)
        finish(job, "error", str(e)[-300:])
    finally:
        job["proc"] = None
        with cv:
            running -= 1
            cv.notify_all()


def scheduler():
    global running
    while True:
        with cv:
            while not (PENDING and running < max(1, int(cfg.get("max_parallel", 2)))):
                cv.wait(1)
            job = PENDING.popleft()
            running += 1
        threading.Thread(target=run_job, args=(job,), daemon=True).start()


def add_jobs(kind, items, opts):
    ids = []
    with cv:
        for it in items:
            if not it.get("url"):
                continue
            jid = uuid.uuid4().hex[:10]
            job = {"id": jid, "kind": kind, "url": it["url"], "title": it.get("title") or "", "thumb": it.get("thumb") or "",
                   "status": "queued", "percent": 0, "speed": None, "eta": None, "file": "", "error": "", "note": "",
                   "created": time.time(), "opts": opts or {}, "canceled": False, "proc": None}
            JOBS[jid] = job
            PENDING.append(job)
            ids.append(jid)
        for k in [k for k, v in JOBS.items() if v["status"] in ("done", "error", "canceled")][:-100]:
            JOBS.pop(k, None)
        cv.notify_all()
    return ids


def public(job):
    return {k: v for k, v in job.items() if k not in ("proc", "opts", "canceled")}


_ver = {"t": 0, "v": {}}


def versions(force=False):
    if not force and time.time() - _ver["t"] < 120 and _ver["v"]:
        return _ver["v"]

    def ver(name, mod):
        try:
            return run_capture(tool_cmd(name, mod) + ["--version"], 30).stdout.strip().splitlines()[0]
        except Exception:
            return ""
    _ver["v"] = {"yt_dlp": ver("yt-dlp", "yt_dlp"), "gallery_dl": ver("gallery-dl", "gallery_dl"),
                 "ffmpeg": bool((BIN / "ffmpeg.exe").exists() or shutil.which("ffmpeg") or (cfg.get("ffmpeg") and os.path.exists(cfg["ffmpeg"]))),
                 "helper": VERSION}
    _ver["t"] = time.time()
    return _ver["v"]


def pick_folder():
    if WIN:
        ps = ("Add-Type -AssemblyName System.Windows.Forms; $f=New-Object Windows.Forms.Form -Property @{TopMost=$true}; "
              "$d=New-Object Windows.Forms.FolderBrowserDialog; if($d.ShowDialog($f) -eq 'OK'){$d.SelectedPath}")
        return run_capture(["powershell", "-NoProfile", "-STA", "-Command", ps], 300).stdout.strip()
    code = "import tkinter,tkinter.filedialog as f;r=tkinter.Tk();r.withdraw();print(f.askdirectory())"
    return run_capture([PY, "-c", code], 300).stdout.strip()


# ================================================================ HTTP
class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SocialDL"

    def log_message(self, *a):
        pass

    def origin(self):
        return self.headers.get("Origin") or ""

    def origin_ok(self):
        return (not self.origin()) or self.origin().startswith(EXT_SCHEMES)

    def host_ok(self):
        return (self.headers.get("Host") or "").split(":")[0] in ("127.0.0.1", "localhost")

    def cors(self):
        if self.origin() and self.origin_ok():
            self.send_header("Access-Control-Allow-Origin", self.origin())
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Vary", "Origin")

    def send_j(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.cors()
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        if not (self.origin_ok() and self.host_ok()):
            return self.send_j(403, {"error": "forbidden"})
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.cors()
        self.end_headers()

    def do_GET(self):
        self.handle_req()

    def do_POST(self):
        self.handle_req()

    def handle_req(self):
        try:
            if not (self.origin_ok() and self.host_ok()):
                return self.send_j(403, {"error": "forbidden"})
            path = urllib.parse.urlparse(self.path).path
            body = {}
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            if path == "/ping":
                return self.send_j(200, {"ok": True, "app": "SocialDL", "version": VERSION})
            if path == "/pair":       # one-time automatic pairing: the first extension that asks gets bound
                o = self.origin()
                if o.startswith(EXT_SCHEMES) and (not cfg.get("paired") or cfg.get("ext_origin") == o):
                    cfg.update(paired=True, ext_origin=o)
                    save_json(CFG_FILE, cfg)
                    return self.send_j(200, {"token": TOKEN})
                return self.send_j(403, {"error": "already paired"})
            if not secrets.compare_digest(self.headers.get("X-Token", ""), TOKEN):
                return self.send_j(401, {"error": "bad token"})
            if cfg.get("ext_origin") and self.origin() and self.origin() != cfg["ext_origin"]:
                return self.send_j(403, {"error": "unknown extension"})
            self.route(path, body)
        except Exception as e:
            log("http error", self.path, e)
            try:
                self.send_j(500, {"error": str(e)[-300:]})
            except Exception:
                pass

    def route(self, path, body):
        s = self.send_j
        if path == "/status":
            return s(200, {"ok": True, "config": {k: v for k, v in cfg.items() if k not in ("ext_origin",)}, "versions": versions(),
                           "boot": BOOT, "app": {"version": VERSION, "latest": UPD["latest"], "ext_version": ext_disk_version(), "frozen": FROZEN}})
        if path == "/config":
            for k in ("folder", "template", "max_parallel", "auto_update", "ffmpeg"):
                if k in body:
                    cfg[k] = body[k]
            cfg["max_parallel"] = max(1, min(8, int(cfg["max_parallel"])))
            save_json(CFG_FILE, cfg)
            with cv:
                cv.notify_all()
            return s(200, {"ok": True, "config": cfg})
        if path == "/info":
            return s(200, get_info(body["url"], body.get("cookies", "")))
        if path == "/download":
            return s(200, {"ok": True, "ids": add_jobs(body.get("kind", "video"), body.get("items", []), body.get("opts", {}))})
        if path == "/jobs":
            return s(200, {"jobs": [public(j) for j in JOBS.values()]})
        if path == "/cancel":
            j = JOBS.get(body.get("id"))
            if j and j["status"] in ("queued", "downloading", "processing"):
                j["canceled"] = True
                if j["status"] == "queued":
                    finish(j, "canceled")
                kill(j)
            return s(200, {"ok": True})
        if path == "/retry":
            j = JOBS.get(body.get("id"))
            if j and j["status"] in ("error", "canceled"):
                j.update(status="queued", percent=0, error="", canceled=False, speed=None, eta=None)
                with cv:
                    PENDING.append(j)
                    cv.notify_all()
            return s(200, {"ok": True})
        if path == "/clear":
            for k in [k for k, v in JOBS.items() if v["status"] in ("done", "error", "canceled")]:
                JOBS.pop(k, None)
            return s(200, {"ok": True})
        if path == "/history":
            return s(200, {"history": list(reversed(load_json(HIST_FILE, [])))})
        if path == "/history/clear":
            save_json(HIST_FILE, [])
            return s(200, {"ok": True})
        if path == "/open":
            p = body.get("path") or cfg["folder"]
            if WIN:
                if os.path.isfile(p):
                    subprocess.Popen('explorer /select,"%s"' % os.path.normpath(p))
                else:
                    os.makedirs(p, exist_ok=True)
                    os.startfile(p)
            else:
                subprocess.Popen(["xdg-open", p if os.path.isdir(p) else os.path.dirname(p)])
            return s(200, {"ok": True})
        if path == "/openfile":
            p = body.get("path", "")
            if os.path.isfile(p):
                os.startfile(p) if WIN else subprocess.Popen(["xdg-open", p])
            return s(200, {"ok": True})
        if path == "/pickfolder":
            return s(200, {"folder": pick_folder().replace("/", os.sep)})
        if path == "/update":
            if FROZEN and BOOT["state"] != "working":
                threading.Thread(target=ensure_tools, daemon=True).start()
            ok, msg = update_tools()
            restarting, err = False, ""
            try:
                restarting = check_app_update()
            except Exception as e:
                err = str(e)[:200]
            return s(200, {"ok": ok, "restarting": restarting, "error": err, "versions": versions(True),
                           "app": {"version": VERSION, "latest": UPD["latest"], "ext_version": ext_disk_version()}})
        if path == "/repair":
            cfg.update(paired=False, ext_origin="")
            save_json(CFG_FILE, cfg)
            return s(200, {"ok": True})
        if path == "/shutdown":
            s(200, {"ok": True})
            threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start()
            return
        s(404, {"error": "not found"})


# ================================================================ install / startup (Windows exe)
def msgbox(text, flags=0x40, title="SocialDL"):
    if WIN:
        return ctypes.windll.user32.MessageBoxW(0, text, title, flags)
    print(text)
    return 6


def api_call(path, body=None, timeout=3):
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (cfg["port"], path), data=json.dumps(body or {}).encode() if body is not None else None,
                                 headers={"X-Token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def server_running():
    try:
        return api_call("/ping", None, 1.5).get("app") == "SocialDL"
    except Exception:
        return False


def set_autostart():
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as k:
        winreg.SetValueEx(k, "SocialDLHelper", 0, winreg.REG_SZ, '"%s"' % INSTALL_EXE)


def setup():
    INSTALL.mkdir(parents=True, exist_ok=True)
    if server_running():
        try:
            api_call("/shutdown", {})
        except Exception:
            pass
        time.sleep(2)
    for _ in range(15):
        try:
            shutil.copy2(sys.executable, INSTALL_EXE)
            break
        except PermissionError:
            time.sleep(1)
    src = Path(getattr(sys, "_MEIPASS", "")) / "extension"
    if src.exists():
        shutil.copytree(src, EXT_DIR, dirs_exist_ok=True)
    set_autostart()
    spawn_self(["--updated"])
    try:
        subprocess.run(["clip"], input=str(EXT_DIR), text=True, creationflags=NOWIN)
        os.startfile(str(EXT_DIR))
    except Exception:
        pass
    msgbox("SocialDL helper ස්ථාපනය වුණා ✔  (Windows එක on වෙද්දී ඉබේම start වෙනවා)\n\n"
           "දැන් browser එකේ:\n"
           "1) chrome://extensions  (Edge: edge://extensions) open කරන්න\n"
           "2) Developer mode ON කරන්න\n"
           "3) 'Load unpacked' → දැන් open වුණ  extension  folder එක select කරන්න\n"
           "   (path එක clipboard එකට copy කරලා තියෙනවා)\n\n"
           "ඊට පස්සේ extension icon එක click කරාම ඉබේම සම්බන්ධ වෙනවා.\n"
           "yt-dlp / ffmpeg පළමු වතාවේ ඉබේම download වෙනවා (විනාඩි කිහිපයක්).")


def run_server():
    save_json(CFG_FILE, cfg)
    for old in (INSTALL / "SocialDL-Helper.exe.old", INSTALL / "SocialDL-Helper.exe.new"):
        try:
            old.unlink(missing_ok=True)
        except Exception:
            pass
    ThreadingHTTPServer.allow_reuse_address = False     # never allow two helpers on the same port (Windows)
    srv = None
    for _ in range(20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", int(cfg["port"])), H)
            break
        except OSError:
            time.sleep(0.5)
    if not srv:
        log("port busy - helper already running?")
        return
    srv.daemon_threads = True
    threading.Thread(target=scheduler, daemon=True).start()
    threading.Thread(target=updater, daemon=True).start()
    if FROZEN:
        threading.Thread(target=ensure_tools, daemon=True).start()
    log("helper", VERSION, "started on", cfg["port"])
    srv.serve_forever()


def main():
    if "--init" in sys.argv:
        save_json(CFG_FILE, cfg)
        print(TOKEN)
        return
    if FROZEN and WIN and not is_installed_copy() and "--no-setup" not in sys.argv:
        return setup()
    if FROZEN and "--updated" not in sys.argv and server_running():
        if msgbox("SocialDL දැනටමත් ක්‍රියාත්මකයි.\n\nExtension එක නැවත pair කරන්න ඕනද?\n(Extension එක අලුතින් install කළා නම් හෝ 'already paired' කියලා ආවොත් Yes දෙන්න)", 0x24) == 6:
            try:
                api_call("/repair", {})
                msgbox("හරි. දැන් extension icon එක click කරන්න - ඉබේම pair වෙයි.")
            except Exception as e:
                msgbox("Re-pair කරන්න බැරි වුණා: %s" % e, 0x10)
        return
    run_server()


if __name__ == "__main__":
    main()
