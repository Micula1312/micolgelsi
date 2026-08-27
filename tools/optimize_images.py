#!/usr/bin/env python3
"""Offline image optimizer for the micolgelsi portfolio.

Usage:
  python tools/optimize_images.py public/media/artistic/abundance
  python tools/optimize_images.py public/media/artistic

What it does:
- recursively scans a project/media folder
- converts JPG/JPEG/PNG/TIFF/BMP/HEIC/HEIF to WebP
- applies EXIF orientation
- resizes images only when the longest side exceeds --max-size (default 2400px)
- saves WebP at --quality (default 82)
- moves originals into a sibling _source/ folder after successful conversion
- skips GIF, WebP, SVG and video files
- skips every _source folder so it is safe to run more than once

HEIC/HEIF support is enabled when pillow-heif is installed.
"""

from __future__ import annotations

import argparse
import shutil
import sys
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

CONVERTIBLE = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".heic", ".heif"}
SKIP_DIRS = {"_source", "node_modules", ".git"}


def human_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{value} B"


def iter_images(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in CONVERTIBLE:
            yield path


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


def optimize(source: Path, quality: int, max_size: int, keep_originals: bool, force: bool):
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

            # Preserve alpha. Palette images are normalized for reliable WebP output.
            if "A" in im.getbands():
                im = im.convert("RGBA")
            else:
                im = im.convert("RGB")

            im.save(destination, "WEBP", quality=quality, method=6, optimize=True)

        after = destination.stat().st_size
        if not keep_originals:
            shutil.move(str(source), str(safe_source_destination(source)))
        return "ok", before, after, ""
    except Exception as exc:
        if destination.exists():
            try:
                destination.unlink()
            except OSError:
                pass
        return "error", before, 0, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert portfolio images to web-ready WebP files.")
    parser.add_argument("folder", nargs="?", default="public/media/artistic", help="Folder to scan recursively")
    parser.add_argument("--quality", type=int, default=82, help="WebP quality, 1-100 (default: 82)")
    parser.add_argument("--max-size", type=int, default=2400, help="Maximum width/height in px (default: 2400)")
    parser.add_argument("--keep-originals", action="store_true", help="Do not move originals into _source/")
    parser.add_argument("--force", action="store_true", help="Overwrite existing WebP files")
    args = parser.parse_args()

    root = Path(args.folder).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"Folder not found: {root}")
        return 1
    if not 1 <= args.quality <= 100:
        print("--quality must be between 1 and 100")
        return 1

    files = list(iter_images(root))
    if not files:
        print(f"No convertible images found in {root}")
        return 0

    print(f"\nPortfolio Image Optimizer")
    print(f"Folder:   {root}")
    print(f"Images:   {len(files)}")
    print(f"Quality:  {args.quality}")
    print(f"Max side: {args.max_size}px")
    print(f"HEIC:     {'yes' if HEIF_ENABLED else 'no (install pillow-heif if needed)'}\n")

    total_before = total_after = converted = skipped = failed = 0
    for source in files:
        status, before, after, note = optimize(source, args.quality, args.max_size, args.keep_originals, args.force)
        relative = source.relative_to(root)
        if status == "ok":
            converted += 1
            total_before += before
            total_after += after
            reduction = (1 - after / before) * 100 if before else 0
            print(f"OK    {relative} -> {source.with_suffix('.webp').name}  {human_bytes(before)} -> {human_bytes(after)}  (-{reduction:.0f}%)")
        elif status == "skip":
            skipped += 1
            print(f"SKIP  {relative}  {note}")
        else:
            failed += 1
            print(f"ERROR {relative}  {note}")

    print("\nDone.")
    print(f"Converted: {converted} | skipped: {skipped} | errors: {failed}")
    if converted:
        saved = max(0, total_before - total_after)
        reduction = (1 - total_after / total_before) * 100 if total_before else 0
        print(f"Converted files: {human_bytes(total_before)} -> {human_bytes(total_after)} | saved {human_bytes(saved)} ({reduction:.0f}%)")
    if not args.keep_originals:
        print("Originals were moved into local _source/ folders.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
