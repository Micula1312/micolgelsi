#!/usr/bin/env python3
"""Offline media optimizer for the micolgelsi portfolio.

Usage:
  py tools/optimize_images.py public/media/artistic/abundance
  py tools/optimize_images.py public/media/artistic

What it does:
- recursively scans the selected project/media folder
- converts JPG/JPEG/PNG/TIFF/BMP/HEIC/HEIF to WebP
- applies EXIF orientation
- resizes images only when the longest side exceeds --max-size (default 2400px)
- saves WebP at --quality (default 82)
- optimizes videos found anywhere below the selected folder
- converts MOV/AVI/MKV/M4V/MPG/MPEG/WMV and non-web MP4 to web-ready MP4 (H.264 + AAC)
- uses ffmpeg with CRF 23, faststart and yuv420p for browser compatibility
- moves originals into a sibling _source/ folder after successful conversion
- skips every _source folder, so it is safe to run repeatedly
- leaves GIF, SVG, WebM and already-generated WebP untouched

This means files can live in images/, video/, videos/, moments/ or any other
subfolder: the optimizer discovers supported media recursively.

HEIC/HEIF support requires pillow-heif.
Video support requires ffmpeg available in PATH.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Missing Pillow. Install it with: py -m pip install Pillow pillow-heif")
    raise SystemExit(1)

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_ENABLED = True
except Exception:
    HEIF_ENABLED = False

IMAGE_INPUTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".heic", ".heif"}
VIDEO_INPUTS = {".mov", ".avi", ".mkv", ".m4v", ".mpg", ".mpeg", ".wmv", ".mp4"}
SKIP_DIRS = {"_source", "node_modules", ".git"}


def human_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{value} B"


def iter_media(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        suffix = path.suffix.lower()
        if suffix in IMAGE_INPUTS:
            yield "image", path
        elif suffix in VIDEO_INPUTS:
            yield "video", path


def safe_source_destination(source: Path) -> Path:
    source_dir = source.parent / "_source"
    source_dir.mkdir(exist_ok=True)
    destination = source_dir / source.name
    if not destination.exists():
        return destination
    stem, suffix = source.stem, source.suffix
    index = 2
    while True:
        candidate = source_dir / f"{stem}-{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def move_original(source: Path, keep_originals: bool) -> None:
    if not keep_originals:
        shutil.move(str(source), str(safe_source_destination(source)))


def optimize_image(source: Path, quality: int, max_size: int, keep_originals: bool, force: bool):
    if source.suffix.lower() in {".heic", ".heif"} and not HEIF_ENABLED:
        return "skip", 0, 0, "HEIC/HEIF requires pillow-heif"

    destination = source.with_suffix(".webp")
    if destination.exists() and not force:
        return "skip", source.stat().st_size, destination.stat().st_size, "WebP already exists"

    before = source.stat().st_size
    try:
        with Image.open(source) as im:
            im = ImageOps.exif_transpose(im)
            if max(im.size) > max_size:
                ratio = max_size / max(im.size)
                new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
                im = im.resize(new_size, Image.Resampling.LANCZOS)
            if "A" in im.getbands():
                im = im.convert("RGBA")
            else:
                im = im.convert("RGB")
            im.save(destination, "WEBP", quality=quality, method=6, optimize=True)

        after = destination.stat().st_size
        move_original(source, keep_originals)
        return "ok", before, after, ""
    except Exception as exc:
        if destination.exists():
            try:
                destination.unlink()
            except OSError:
                pass
        return "error", before, 0, str(exc)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def optimize_video(source: Path, crf: int, max_video_width: int, keep_originals: bool, force: bool):
    if not ffmpeg_available():
        return "skip", 0, 0, "ffmpeg not found in PATH"

    destination = source.with_suffix(".mp4")

    # When the source is already MP4, encode to a temporary sibling first.
    same_path = source.resolve() == destination.resolve()
    output = source.with_name(f"{source.stem}.__optimized__.mp4") if same_path else destination

    if destination.exists() and not same_path and not force:
        return "skip", source.stat().st_size, destination.stat().st_size, "optimized MP4 already exists"

    before = source.stat().st_size

    vf = []
    if max_video_width > 0:
        # Preserve aspect ratio; only downscale videos wider than the configured width.
        vf = ["-vf", f"scale='min({max_video_width},iw)':-2"]

    command = [
        "ffmpeg", "-y" if force or same_path else "-n",
        "-i", str(source),
        *vf,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "160k",
        str(output),
    ]

    try:
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            if output.exists():
                output.unlink(missing_ok=True)
            tail = "\n".join(result.stderr.splitlines()[-4:])
            return "error", before, 0, tail or "ffmpeg failed"

        if not output.exists() or output.stat().st_size == 0:
            return "error", before, 0, "ffmpeg produced no output"

        if same_path:
            if keep_originals:
                backup = safe_source_destination(source)
                shutil.copy2(source, backup)
                source.unlink()
            else:
                shutil.move(str(source), str(safe_source_destination(source)))
            output.replace(destination)
        else:
            move_original(source, keep_originals)

        after = destination.stat().st_size
        return "ok", before, after, ""
    except Exception as exc:
        if output.exists():
            try:
                output.unlink()
            except OSError:
                pass
        return "error", before, 0, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Optimize portfolio images and videos for the web.")
    parser.add_argument("folder", nargs="?", default="public/media/artistic", help="Folder to scan recursively")
    parser.add_argument("--quality", type=int, default=82, help="WebP image quality, 1-100 (default: 82)")
    parser.add_argument("--max-size", type=int, default=2400, help="Maximum image width/height in px (default: 2400)")
    parser.add_argument("--video-crf", type=int, default=23, help="H.264 CRF, lower = higher quality (default: 23)")
    parser.add_argument("--max-video-width", type=int, default=1920, help="Maximum video width in px; 0 disables resizing (default: 1920)")
    parser.add_argument("--keep-originals", action="store_true", help="Keep originals in place/copy instead of moving them")
    parser.add_argument("--force", action="store_true", help="Overwrite existing generated media")
    parser.add_argument("--images-only", action="store_true", help="Optimize images but skip videos")
    parser.add_argument("--videos-only", action="store_true", help="Optimize videos but skip images")
    args = parser.parse_args()

    root = Path(args.folder).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"Folder not found: {root}")
        return 1
    if not 1 <= args.quality <= 100:
        print("--quality must be between 1 and 100")
        return 1
    if not 0 <= args.video_crf <= 51:
        print("--video-crf must be between 0 and 51")
        return 1
    if args.images_only and args.videos_only:
        print("Choose either --images-only or --videos-only, not both")
        return 1

    media = list(iter_media(root))
    if args.images_only:
        media = [(kind, p) for kind, p in media if kind == "image"]
    elif args.videos_only:
        media = [(kind, p) for kind, p in media if kind == "video"]

    image_count = sum(1 for kind, _ in media if kind == "image")
    video_count = sum(1 for kind, _ in media if kind == "video")

    if not media:
        print(f"No convertible media found in {root}")
        return 0

    print("\nPortfolio Media Optimizer")
    print(f"Folder:      {root}")
    print(f"Images:      {image_count}")
    print(f"Videos:      {video_count}")
    print(f"Image WebP:  quality {args.quality}, max side {args.max_size}px")
    print(f"Video MP4:   H.264 CRF {args.video_crf}, max width {args.max_video_width or 'original'}px")
    print(f"HEIC:        {'yes' if HEIF_ENABLED else 'no (install pillow-heif if needed)'}")
    print(f"FFmpeg:      {'yes' if ffmpeg_available() else 'no — videos will be skipped'}\n")

    total_before = total_after = converted = skipped = failed = 0

    for kind, source in media:
        if kind == "image":
            status, before, after, note = optimize_image(source, args.quality, args.max_size, args.keep_originals, args.force)
            generated_name = source.with_suffix(".webp").name
        else:
            status, before, after, note = optimize_video(source, args.video_crf, args.max_video_width, args.keep_originals, args.force)
            generated_name = source.with_suffix(".mp4").name

        relative = source.relative_to(root)
        label = "IMG" if kind == "image" else "VID"

        if status == "ok":
            converted += 1
            total_before += before
            total_after += after
            reduction = (1 - after / before) * 100 if before else 0
            print(f"OK {label}  {relative} -> {generated_name}  {human_bytes(before)} -> {human_bytes(after)}  ({reduction:+.0f}% size)")
        elif status == "skip":
            skipped += 1
            print(f"SKIP {label} {relative}  {note}")
        else:
            failed += 1
            print(f"ERROR {label} {relative}  {note}")

    print("\nDone.")
    print(f"Optimized: {converted} | skipped: {skipped} | errors: {failed}")
    if converted:
        saved = total_before - total_after
        reduction = (1 - total_after / total_before) * 100 if total_before else 0
        print(f"Processed media: {human_bytes(total_before)} -> {human_bytes(total_after)} | difference {human_bytes(abs(saved))} ({reduction:+.0f}%)")
    if not args.keep_originals:
        print("Originals were moved into local _source/ folders.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
