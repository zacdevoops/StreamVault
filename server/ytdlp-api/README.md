# StreamVault yt-dlp API

Server-side adapter for the native Expo app using the official yt-dlp GitHub source.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8787
```

Then start the app with:

```bash
EXPO_PUBLIC_YTDLP_API_URL=http://localhost:8787 npx expo run:ios
```

The Expo app also probes localhost/LAN development URLs and falls back to Invidious/Piped when this API is unavailable.

## Required for exact formats

Install `ffmpeg` on the machine running this API. yt-dlp uses it for video/audio merge and MP3/FLAC extraction.
