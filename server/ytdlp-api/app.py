from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
import tempfile
import time
from collections import OrderedDict
from typing import Any
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request as UrlRequest, urlopen

import requests
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, ExtractorError


logger = logging.getLogger("streamvault.ytdlp")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="StreamVault yt-dlp API")
YTDLP_BINARY_CANDIDATES = [
    Path(__file__).with_name("yt-dlp_macos"),
    Path(__file__).with_name("yt-dlp"),
]
YTDLP_BINARY_UNCHECKED = object()
_ytdlp_binary_cache: str | None | object = YTDLP_BINARY_UNCHECKED
PLAYBACK_CACHE_TTL_SECONDS = 10 * 60
PLAYBACK_CACHE_MAX_ENTRIES = 256
# OrderedDict gives us LRU semantics via move_to_end + popitem(last=False).
# Long-running servers seeing many distinct video IDs would otherwise grow this dict unbounded.
_playback_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


class ExtractRequest(BaseModel):
    url: str = Field(min_length=1)
    flat: bool = False
    limit: int = Field(default=20, ge=1, le=50)


class ResolveRequest(BaseModel):
    url: str = Field(min_length=1)
    format: str = Field(default="mp4_720p")


class PlaybackRequest(BaseModel):
    url: str = Field(min_length=1)


def text_value(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    if isinstance(value.get("simpleText"), str):
        return value["simpleText"]
    runs = value.get("runs")
    if isinstance(runs, list):
        return "".join(run.get("text", "") for run in runs if isinstance(run, dict))
    return ""


def parse_compact_number(text: str) -> int:
    normalized = text.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))
    match = re.search(r"([\d.,]+)\s*([KMB])?", normalized, re.IGNORECASE)
    if not match:
        return 0
    try:
        value = float(match.group(1).replace(",", ""))
    except ValueError:
        return 0
    suffix = (match.group(2) or "").upper()
    if suffix == "B":
        value *= 1_000_000_000
    elif suffix == "M":
        value *= 1_000_000
    elif suffix == "K":
        value *= 1_000
    return round(value)


def parse_duration(text: str) -> int:
    try:
        total = 0
        for part in text.split(":"):
            total = total * 60 + int(part)
        return total
    except ValueError:
        return 0


def extract_balanced_json(source: str, marker: str) -> str | None:
    marker_index = source.find(marker)
    if marker_index < 0:
        return None
    start = source.find("{", marker_index)
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    return None


def map_youtube_renderer(renderer: dict[str, Any]) -> dict[str, Any] | None:
    video_id = renderer.get("videoId")
    if not isinstance(video_id, str):
        return None

    thumbnails = renderer.get("thumbnail", {}).get("thumbnails", [])
    if not isinstance(thumbnails, list):
        thumbnails = []
    mapped_thumbnails = []
    for index, thumbnail in enumerate(thumbnails):
        if not isinstance(thumbnail, dict) or not isinstance(thumbnail.get("url"), str):
            continue
        url = thumbnail["url"]
        mapped_thumbnails.append(
            {
                "quality": str(index),
                "url": f"https:{url}" if url.startswith("//") else url,
                "width": thumbnail.get("width") or 0,
                "height": thumbnail.get("height") or 0,
            }
        )

    views_text = text_value(renderer.get("viewCountText")) or text_value(renderer.get("shortViewCountText"))
    return {
        "videoId": video_id,
        "title": text_value(renderer.get("title")) or "Untitled video",
        "author": text_value(renderer.get("ownerText")) or text_value(renderer.get("longBylineText")) or "Unknown",
        "authorId": "",
        "authorUrl": "",
        "videoThumbnails": mapped_thumbnails,
        "description": text_value(renderer.get("descriptionSnippet")),
        "published": 0,
        "publishedText": text_value(renderer.get("publishedTimeText")) or "Recently",
        "viewCount": parse_compact_number(views_text),
        "lengthSeconds": parse_duration(text_value(renderer.get("lengthText"))),
        "paid": False,
        "premium": False,
        "liveNow": False,
        "isUpcoming": False,
    }


def parse_youtube_data(initial_data: Any, limit: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    def walk(value: Any) -> None:
        if value is None or len(results) >= limit:
            return
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if not isinstance(value, dict):
            return

        renderer = value.get("videoRenderer")
        if isinstance(renderer, dict):
            mapped = map_youtube_renderer(renderer)
            if mapped and mapped["videoId"] not in seen:
                seen.add(mapped["videoId"])
                results.append(mapped)

        for child in value.values():
            walk(child)

    walk(initial_data)
    return results


def parse_youtube_videos(html: str, limit: int) -> list[dict[str, Any]]:
    json_text = (
        extract_balanced_json(html, "var ytInitialData =")
        or extract_balanced_json(html, 'window["ytInitialData"] =')
        or extract_balanced_json(html, "ytInitialData =")
    )
    if not json_text:
        return []
    try:
        initial_data = json.loads(json_text)
    except json.JSONDecodeError:
        return []
    return parse_youtube_data(initial_data, limit)


def map_ytdlp_feed_entry(entry: dict[str, Any]) -> dict[str, Any] | None:
    video_id = entry.get("id") or entry.get("url")
    if not isinstance(video_id, str) or not video_id:
        return None

    thumbnails = entry.get("thumbnails")
    mapped_thumbnails = []
    if isinstance(thumbnails, list):
        for index, thumbnail in enumerate(thumbnails):
            if not isinstance(thumbnail, dict) or not isinstance(thumbnail.get("url"), str):
                continue
            mapped_thumbnails.append(
                {
                    "quality": str(thumbnail.get("id") or thumbnail.get("height") or index),
                    "url": thumbnail["url"],
                    "width": thumbnail.get("width") or 0,
                    "height": thumbnail.get("height") or 0,
                }
            )

    return {
        "videoId": video_id,
        "title": entry.get("title") or "Untitled video",
        "author": entry.get("uploader") or entry.get("channel") or "Unknown",
        "authorId": entry.get("uploader_id") or entry.get("channel_id") or "",
        "authorUrl": entry.get("uploader_url") or "",
        "videoThumbnails": mapped_thumbnails,
        "description": entry.get("description") or "",
        "published": entry.get("timestamp") or 0,
        "publishedText": "Recently",
        "viewCount": entry.get("view_count") or 0,
        "lengthSeconds": entry.get("duration") or 0,
        "paid": False,
        "premium": False,
        "liveNow": bool(entry.get("is_live")),
        "isUpcoming": entry.get("live_status") == "is_upcoming",
    }


def merge_feed_results(primary: list[dict[str, Any]], secondary: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    results = []
    seen: set[str] = set()
    for item in [*primary, *secondary]:
        video_id = item.get("videoId")
        if not isinstance(video_id, str) or video_id in seen:
            continue
        seen.add(video_id)
        results.append(item)
        if len(results) >= limit:
            break
    return results


def is_good_feed_item(item: dict[str, Any]) -> bool:
    title = str(item.get("title") or "").lower()
    if not item.get("videoId") or not item.get("title"):
        return False
    if any(token in title for token in ("#shorts", "youtubeshorts", "shortsfeed")):
        return False
    duration = item.get("lengthSeconds")
    return not isinstance(duration, int) or duration == 0 or duration >= 60


def clean_feed_results(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in items if is_good_feed_item(item)]


def expanded_feed_queries(query: str) -> list[str]:
    normalized = query.strip()
    if normalized.lower() == "trending videos today":
        return [
            normalized,
            "popular videos today",
            "viral videos today",
            "most viewed videos today",
            "trending youtube videos",
            "top videos this week",
            "new trending videos",
            "best videos today",
        ]
    return [
        normalized,
        f"{normalized} most viewed",
        f"{normalized} viral",
        f"{normalized} popular",
        f"{normalized} today",
        f"best {normalized}",
    ]


def youtube_search(query: str, limit: int) -> list[dict[str, Any]]:
    url = "https://www.youtube.com/results?" + urlencode(
        {
            "search_query": query,
            "hl": "en",
            "gl": "US",
        }
    )
    request = UrlRequest(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            html = response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="YouTube metadata fetch failed") from exc
    return parse_youtube_videos(html, limit)


def youtube_trending(region: str, limit: int) -> list[dict[str, Any]]:
    html_request = UrlRequest(
        "https://www.youtube.com/feed/trending?" + urlencode({"hl": "en", "gl": region}),
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urlopen(html_request, timeout=10) as response:
            html = response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="YouTube trending fetch failed") from exc

    html_results = parse_youtube_videos(html, limit)
    if html_results:
        return html_results

    api_key_match = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
    context_json = extract_balanced_json(html, '"INNERTUBE_CONTEXT":')
    if not api_key_match or not context_json:
        return []

    try:
        context = json.loads(context_json)
    except json.JSONDecodeError:
        return []

    body = json.dumps({"context": context, "browseId": "FEtrending"}).encode("utf-8")
    api_request = UrlRequest(
        f"https://www.youtube.com/youtubei/v1/browse?key={quote(api_key_match.group(1), safe='')}",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Origin": "https://www.youtube.com",
            "Referer": "https://www.youtube.com/feed/trending",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        },
    )
    try:
        with urlopen(api_request, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception:
        return []
    return parse_youtube_data(data, limit)


def json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def ytdlp_binary_path() -> str | None:
    global _ytdlp_binary_cache

    if _ytdlp_binary_cache is not YTDLP_BINARY_UNCHECKED:
        return _ytdlp_binary_cache if isinstance(_ytdlp_binary_cache, str) else None

    for binary in YTDLP_BINARY_CANDIDATES:
        if binary.exists() and binary.stat().st_mode & 0o111:
            try:
                subprocess.run(
                    [str(binary), "--version"],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=8,
                )
            except Exception:
                continue
            _ytdlp_binary_cache = str(binary)
            return str(binary)
    _ytdlp_binary_cache = None
    return None


def ydl_extract_binary(
    url: str,
    *,
    flat: bool,
    limit: int,
    format_selector: str | None = None,
    extractor_args: str | None = None,
    timeout: int = 90,
) -> dict[str, Any]:
    binary = ytdlp_binary_path()
    if not binary:
        raise RuntimeError("yt-dlp binary not available")

    command = [
        binary,
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "--playlist-end",
        str(limit),
        "--socket-timeout",
        "30",
    ]
    if flat:
        command.append("--flat-playlist")
    if extractor_args:
        command.extend(["--extractor-args", extractor_args])
    if format_selector:
        command.extend(["-f", format_selector])
    command.append(url)

    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or "yt-dlp extraction failed"
        raise HTTPException(status_code=422, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="yt-dlp extraction failed") from exc

    try:
        return json_safe(json.loads(completed.stdout))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="yt-dlp returned invalid metadata") from exc


def ydl_extract(
    url: str,
    *,
    flat: bool,
    limit: int,
    format_selector: str | None = None,
    extractor_args: str | None = None,
    timeout: int = 90,
) -> dict[str, Any]:
    if ytdlp_binary_path():
        return ydl_extract_binary(
            url,
            flat=flat,
            limit=limit,
            format_selector=format_selector,
            extractor_args=extractor_args,
            timeout=timeout,
        )

    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "playlistend": limit,
        "socket_timeout": min(timeout, 30),
    }
    if flat:
        options["extract_flat"] = "in_playlist"
    if extractor_args == "youtube:player_client=ios":
        options["extractor_args"] = {"youtube": {"player_client": ["ios"]}}
    elif extractor_args == "youtube:player_client=android_vr":
        options["extractor_args"] = {"youtube": {"player_client": ["android_vr"]}}
    if format_selector:
        options["format"] = format_selector

    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
    except (DownloadError, ExtractorError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="yt-dlp extraction failed") from exc

    if not isinstance(info, dict):
        raise HTTPException(status_code=422, detail="yt-dlp returned no metadata")
    return json_safe(info)


DOWNLOAD_FORMATS: dict[str, dict[str, Any]] = {
    "mp4_360p": {"height": 360, "ext": "mp4", "media_type": "video/mp4"},
    "mp4_720p": {"height": 720, "ext": "mp4", "media_type": "video/mp4"},
    "mp4_1080p": {"height": 1080, "ext": "mp4", "media_type": "video/mp4"},
    "mp4_4k": {"height": 2160, "ext": "mp4", "media_type": "video/mp4"},
    "mp3_128": {"audio": "mp3", "quality": "128", "ext": "mp3", "media_type": "audio/mpeg"},
    "mp3_320": {"audio": "mp3", "quality": "320", "ext": "mp3", "media_type": "audio/mpeg"},
    "flac": {"audio": "flac", "quality": "0", "ext": "flac", "media_type": "audio/flac"},
}


def app_format(format_id: str) -> dict[str, Any]:
    if format_id not in DOWNLOAD_FORMATS:
        raise HTTPException(status_code=422, detail=f"Unsupported format: {format_id}")
    return DOWNLOAD_FORMATS[format_id]


def selector_for_app_format(format_id: str) -> str:
    spec = app_format(format_id)
    if "audio" in spec:
        return "bestaudio/best"

    height = spec["height"]
    return (
        f"bestvideo[height<={height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/"
        f"best[height<={height}][ext=mp4][vcodec^=avc1][acodec^=mp4a]/"
        f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/"
        f"best[height<={height}][ext=mp4]/best[height<={height}]/best"
    )


def playback_selector() -> str:
    return (
        "best[ext=mp4][vcodec!=none][acodec!=none]/"
        "best[vcodec!=none][acodec!=none]/"
        "best[protocol*=m3u8]/"
        "best[ext=mp4]/best"
    )


PLAYBACK_ATTEMPTS = [
    ("youtube:player_client=ios", "best[protocol*=m3u8]/best[ext=m3u8]/best"),
    (
        "youtube:player_client=android_vr",
        "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/best",
    ),
]


def audio_playback_selector() -> str:
    return "bestaudio[ext=m4a]/bestaudio[acodec!=none]/bestaudio/best"


def playback_metadata(info: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": info.get("title"),
        "uploader": info.get("uploader"),
        "channel": info.get("channel"),
        "uploader_id": info.get("uploader_id"),
        "channel_id": info.get("channel_id"),
        "uploader_url": info.get("uploader_url"),
        "description": info.get("description"),
        "duration": info.get("duration"),
        "timestamp": info.get("timestamp"),
        "upload_date": info.get("upload_date"),
        "view_count": info.get("view_count"),
        "like_count": info.get("like_count"),
        "thumbnails": info.get("thumbnails") if isinstance(info.get("thumbnails"), list) else [],
    }


def playback_response_from_info(info: dict[str, Any]) -> dict[str, Any] | None:
    stream_url = info.get("url")
    if not isinstance(stream_url, str) or not stream_url:
        return None
    return {
        "url": stream_url,
        "formatId": info.get("format_id"),
        "ext": info.get("ext"),
        "container": info.get("container") or info.get("ext"),
        "filesize": info.get("filesize") or info.get("filesize_approx"),
        "quality": info.get("format_note") or info.get("resolution") or info.get("format_id"),
        "height": info.get("height"),
        "width": info.get("width"),
        "bitrate": info.get("abr") or info.get("tbr"),
        "headers": info.get("http_headers") if isinstance(info.get("http_headers"), dict) else None,
        **playback_metadata(info),
    }


def resolve_playback_info(url: str, timeout: int = 55) -> dict[str, Any]:
    last_error: HTTPException | None = None
    for extractor_args, selector in PLAYBACK_ATTEMPTS:
        try:
            info = ydl_extract(
                url,
                flat=False,
                limit=1,
                format_selector=selector,
                extractor_args=extractor_args,
                timeout=timeout,
            )
        except HTTPException as exc:
            last_error = exc
            continue

        response = playback_response_from_info(info)
        if response:
            return response

    if last_error:
        raise last_error
    raise HTTPException(status_code=422, detail="yt-dlp returned no playable stream")


def postprocessors_for_app_format(format_id: str) -> list[dict[str, Any]]:
    spec = app_format(format_id)
    audio = spec.get("audio")
    if not audio:
        return []
    return [
        {
            "key": "FFmpegExtractAudio",
            "preferredcodec": audio,
            "preferredquality": spec["quality"],
        }
    ]


def find_downloaded_file(directory: Path) -> Path:
    files = [path for path in directory.iterdir() if path.is_file() and not path.name.endswith(".part")]
    if not files:
        raise HTTPException(status_code=500, detail="yt-dlp produced no downloadable file")
    return max(files, key=lambda path: path.stat().st_mtime)


def download_with_ytdlp(url: str, format_id: str, output_dir: Path) -> Path:
    spec = app_format(format_id)
    binary = ytdlp_binary_path()
    if binary:
        command = [
            binary,
            "--no-warnings",
            "--socket-timeout",
            "30",
            "--extractor-args",
            "youtube:player_client=android_vr",
            "-f",
            selector_for_app_format(format_id),
            "-o",
            str(output_dir / "%(title).180B-%(id)s.%(ext)s"),
        ]
        if "audio" in spec:
            command.extend(["-x", "--audio-format", spec["audio"], "--audio-quality", spec["quality"]])
        else:
            command.extend(["--merge-output-format", spec["ext"]])
        command.append(url)

        try:
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=900)
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr.strip() or exc.stdout.strip() or "yt-dlp download failed"
            raise HTTPException(status_code=422, detail=detail) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail="yt-dlp download failed") from exc
        return find_downloaded_file(output_dir)

    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "format": selector_for_app_format(format_id),
        "merge_output_format": spec["ext"] if "audio" not in spec else None,
        "postprocessors": postprocessors_for_app_format(format_id),
        "outtmpl": str(output_dir / "%(title).180B-%(id)s.%(ext)s"),
        "socket_timeout": 30,
        "extractor_args": {"youtube": {"player_client": ["android_vr"]}},
    }
    options = {key: value for key, value in options.items() if value is not None}

    try:
        with YoutubeDL(options) as ydl:
            ydl.download([url])
    except (DownloadError, ExtractorError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="yt-dlp download failed") from exc

    return find_downloaded_file(output_dir)


def cleanup_dir(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract")
def extract(request: ExtractRequest) -> dict[str, Any]:
    return ydl_extract(request.url, flat=request.flat, limit=request.limit)


@app.get("/feed")
def feed(q: str = Query(default="trending videos today", min_length=1), limit: int = Query(default=20, ge=1, le=50)) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if q.strip().lower() == "trending videos today":
        try:
            results = youtube_trending("US", limit)
        except HTTPException:
            results = []
        if len(results) >= limit:
            return results

    for query in expanded_feed_queries(q):
        if len(results) >= limit:
            break
        try:
            query_results = clean_feed_results(youtube_search(query, min(limit, 20)))
        except HTTPException:
            continue
        results = merge_feed_results(results, query_results, limit)

    if len(results) >= limit:
        return results
    if results or limit > 20:
        return results

    try:
        info = ydl_extract(f"ytsearch{limit}:{q}", flat=True, limit=limit)
        entries = info.get("entries")
        if isinstance(entries, list):
            ytdlp_results = [
                mapped
                for entry in entries
                if isinstance(entry, dict)
                for mapped in [map_ytdlp_feed_entry(entry)]
                if mapped and is_good_feed_item(mapped)
            ]
            return merge_feed_results(results, ytdlp_results, limit)
    except HTTPException:
        pass

    return results


@app.post("/resolve")
def resolve(request: ResolveRequest, http_request: Request) -> dict[str, Any]:
    spec = app_format(request.format)
    base_url = str(http_request.base_url).rstrip("/")
    download_url = f"{base_url}/download?url={quote(request.url, safe='')}&format={quote(request.format)}"

    return {
        "url": download_url,
        "formatId": request.format,
        "ext": spec["ext"],
        "container": spec["ext"],
        "filesize": None,
        "quality": request.format,
        "height": spec.get("height"),
        "width": None,
        "bitrate": None,
    }


@app.post("/playback")
def playback(request: PlaybackRequest) -> dict[str, Any]:
  # Mobile clients give this request roughly 30s; ending the extractor first lets
  # the app show a clean retry state instead of hanging on an abandoned request.
  return cached_or_resolve_playback(request.url, timeout=55)


def youtube_watch_url(video_id: str) -> str:
  return video_id if video_id.startswith("http") else f"https://www.youtube.com/watch?v={video_id}"


def playback_cache_key(url_or_id: str) -> str:
  patterns = [
    r"[?&]v=([^&]+)",
    r"youtu\.be/([^?&/]+)",
    r"/shorts/([^?&/]+)",
  ]
  for pattern in patterns:
    match = re.search(pattern, url_or_id)
    if match:
      return match.group(1)
  return url_or_id


def cached_playback_info(url_or_id: str) -> dict[str, Any] | None:
  key = playback_cache_key(url_or_id)
  cached = _playback_cache.get(key)
  if not cached:
    return None
  expires_at, stream = cached
  if expires_at <= time.monotonic():
    _playback_cache.pop(key, None)
    return None
  # Mark as recently used so LRU eviction targets cold entries first.
  _playback_cache.move_to_end(key)
  return dict(stream)


def cache_playback_info(url_or_id: str, stream: dict[str, Any]) -> dict[str, Any]:
  key = playback_cache_key(url_or_id)
  _playback_cache[key] = (
    time.monotonic() + PLAYBACK_CACHE_TTL_SECONDS,
    json_safe(stream),
  )
  _playback_cache.move_to_end(key)
  while len(_playback_cache) > PLAYBACK_CACHE_MAX_ENTRIES:
    _playback_cache.popitem(last=False)
  return stream


def clear_cached_playback(url_or_id: str) -> None:
  _playback_cache.pop(playback_cache_key(url_or_id), None)


def cached_or_resolve_playback(url_or_id: str, timeout: int) -> dict[str, Any]:
  cached = cached_playback_info(url_or_id)
  if cached:
    return cached
  stream = resolve_playback_info(youtube_watch_url(url_or_id), timeout=timeout)
  return cache_playback_info(url_or_id, stream)


def stream_request_headers(stream: dict[str, Any], request: Request) -> dict[str, str]:
  headers = stream.get("headers") if isinstance(stream.get("headers"), dict) else {}
  out = {str(key): str(value) for key, value in headers.items() if value}
  range_header = request.headers.get("range")
  if range_header:
    out["Range"] = range_header
  return out


def content_type_for_stream(url: str, response: requests.Response) -> str:
  content_type = response.headers.get("Content-Type")
  if content_type:
    return content_type.split(";", 1)[0]
  return "application/vnd.apple.mpegurl" if ".m3u8" in url else "video/mp4"


def proxy_response_headers(response: requests.Response) -> dict[str, str]:
  headers = {"Accept-Ranges": response.headers.get("Accept-Ranges", "bytes")}
  for header in ["Content-Length", "Content-Range"]:
    value = response.headers.get(header)
    if value:
      headers[header] = value
  return headers


def stream_proxy_response(video_id: str, request: Request):
  stream = cached_or_resolve_playback(video_id, timeout=75)
  stream_url = stream["url"]
  headers = stream_request_headers(stream, request)

  try:
    upstream = requests.get(stream_url, headers=headers, stream=True, timeout=(10, 60))
    if upstream.status_code in (403, 410):
      upstream.close()
      clear_cached_playback(video_id)
      stream = cached_or_resolve_playback(video_id, timeout=75)
      stream_url = stream["url"]
      headers = stream_request_headers(stream, request)
      upstream = requests.get(stream_url, headers=headers, stream=True, timeout=(10, 60))
    upstream.raise_for_status()
  except requests.RequestException as exc:
    raise HTTPException(status_code=502, detail=f"Stream proxy request failed: {exc}") from exc

  def body():
    try:
      for chunk in upstream.iter_content(chunk_size=64 * 1024):
        if chunk:
          yield chunk
    except requests.RequestException as exc:
      logger.warning("Upstream stream closed for %s: %s", video_id, exc)
    finally:
      upstream.close()

  return StreamingResponse(
    body(),
    status_code=upstream.status_code,
    media_type=content_type_for_stream(stream_url, upstream),
    headers=proxy_response_headers(upstream),
  )


def stream_proxy_head_response(video_id: str, request: Request):
  stream = cached_or_resolve_playback(video_id, timeout=75)
  stream_url = stream["url"]
  headers = stream_request_headers(stream, request)

  try:
    upstream = requests.head(stream_url, headers=headers, allow_redirects=True, timeout=(10, 60))
    if upstream.status_code == 405:
      upstream.close()
      upstream = requests.get(stream_url, headers=headers, stream=True, timeout=(10, 60))
    if upstream.status_code in (403, 410):
      upstream.close()
      clear_cached_playback(video_id)
      stream = cached_or_resolve_playback(video_id, timeout=75)
      stream_url = stream["url"]
      headers = stream_request_headers(stream, request)
      upstream = requests.head(stream_url, headers=headers, allow_redirects=True, timeout=(10, 60))
      if upstream.status_code == 405:
        upstream.close()
        upstream = requests.get(stream_url, headers=headers, stream=True, timeout=(10, 60))
    upstream.raise_for_status()
  except requests.RequestException as exc:
    raise HTTPException(status_code=502, detail=f"Stream proxy HEAD request failed: {exc}") from exc

  try:
    return Response(
      status_code=upstream.status_code,
      media_type=content_type_for_stream(stream_url, upstream),
      headers=proxy_response_headers(upstream),
    )
  finally:
    upstream.close()


@app.head("/stream/{video_id}.m3u8")
def stream_proxy_hls_head(video_id: str, request: Request):
  return stream_proxy_head_response(video_id, request)


@app.get("/stream/{video_id}.m3u8")
def stream_proxy_hls(video_id: str, request: Request):
  return stream_proxy_response(video_id, request)


@app.head("/stream/{video_id}")
def stream_proxy_head(video_id: str, request: Request):
  return stream_proxy_head_response(video_id, request)


@app.get("/stream/{video_id}")
def stream_proxy(video_id: str, request: Request):
  return stream_proxy_response(video_id, request)


@app.post("/audio")
def audio_playback(request: PlaybackRequest) -> dict[str, Any]:
    info = ydl_extract(
        request.url,
        flat=False,
        limit=1,
        format_selector=audio_playback_selector(),
    )
    stream_url = info.get("url")
    if not isinstance(stream_url, str) or not stream_url:
        raise HTTPException(status_code=422, detail="yt-dlp returned no audio stream")

    return {
        "url": stream_url,
        "formatId": info.get("format_id"),
        "ext": info.get("ext"),
        "container": info.get("container") or info.get("ext"),
        "filesize": info.get("filesize") or info.get("filesize_approx"),
        "quality": info.get("format_note") or info.get("resolution") or "audio",
        "height": None,
        "width": None,
        "bitrate": info.get("abr") or info.get("tbr"),
        "headers": info.get("http_headers") if isinstance(info.get("http_headers"), dict) else None,
    }


@app.get("/download")
def download(
    background_tasks: BackgroundTasks,
    url: str = Query(min_length=1),
    format: str = Query(default="mp4_720p"),
) -> FileResponse:
    spec = app_format(format)
    temp_dir = tempfile.mkdtemp(prefix="streamvault-")
    output_dir = Path(temp_dir)
    downloaded_file = download_with_ytdlp(url, format, output_dir)
    background_tasks.add_task(cleanup_dir, temp_dir)
    return FileResponse(
        downloaded_file,
        media_type=spec["media_type"],
        filename=downloaded_file.name,
        background=background_tasks,
    )
