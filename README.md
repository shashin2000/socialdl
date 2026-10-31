# SocialDL

Download videos, music and images from social media straight from your browser (Chrome / Edge / Brave) —
powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp), [gallery-dl](https://github.com/mikf/gallery-dl) and ffmpeg.
UI: English / සිංහල, light / dark.

## Install (Windows)

1. Download **`SocialDL-Setup.exe`** from the [latest release](https://github.com/shashin2000/socialdl/releases/latest) and double-click it.
   It installs the helper to `%LOCALAPPDATA%\SocialDL`, starts it with Windows, downloads yt-dlp / gallery-dl / ffmpeg / deno
   and unpacks the extension.
   *(Windows SmartScreen may warn because the exe is not code-signed: "More info" → "Run anyway".)*
2. In the browser open `chrome://extensions` (Edge: `edge://extensions`) → turn on **Developer mode** → **Load unpacked** →
   choose `%LOCALAPPDATA%\SocialDL\extension` (the setup opens this folder and copies its path to the clipboard).
3. Click the SocialDL icon. It pairs with the helper automatically. Done.

## Features
Video / MP3 / image download · mp4 mkv webm · mp3 m4a wav flac opus · quality 360–2160 · real format list ·
playlists & channels (pick videos) · queue with progress / speed / ETA · subtitles (save / embed) ·
cover art + tags in audio · clip cut (start–end) · gallery-dl · history with “open folder” ·
settings (folder, filename template, parallel downloads) · browser-cookies support · right-click menus ·
“Download” button on YouTube / Facebook / TikTok / Instagram videos · auto-start · auto-update.

## Updates
* yt-dlp / gallery-dl: updated automatically (daily).
* SocialDL itself: the helper checks the latest GitHub release daily, **verifies the SHA-256 from `SHA256SUMS.txt`**, replaces the
  helper and the extension files, and the extension reloads itself. Manual check: *Settings → Updates*.

## Security
The helper listens on `127.0.0.1` only, rejects every origin that is not a browser extension, requires a secret token, and binds to
the first extension that pairs. To re-pair (e.g. new browser profile) double-click `SocialDL-Helper.exe` again and choose **Yes**.

## Releasing a new version
```
git tag v1.1.1
git push origin v1.1.1
```
GitHub Actions builds `SocialDL-Setup.exe`, `extension.zip` and `SHA256SUMS.txt` and publishes the release.
(The repository must be **public** so installed copies can read releases without logging in.)

## Development
`python helper/helper.py` runs the helper from source (needs `pip install yt-dlp gallery-dl` and ffmpeg on PATH).
Load the `extension/` folder as an unpacked extension.

## Credits & licenses
SocialDL is MIT. It downloads and runs yt-dlp (Unlicense), gallery-dl (GPL-2.0), ffmpeg (GPL build by yt-dlp/FFmpeg-Builds) and deno (MIT)
as separate programs; they are not bundled in this repo. Use only for content you have the right to download.
