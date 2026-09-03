#!/usr/bin/env python3
"""Offline media optimizer + integrity audit for the micolgelsi portfolio.

Recommended workflow:
  py tools/optimize_images.py public/media/artistic/abundance --audit
  py tools/optimize_images.py public/media/artistic/abundance --clean
  py tools/optimize_images.py public/media/artistic/abundance

Rules:
- web-ready files live in the normal media folders
- originals live only in a sibling _source/ folder
- _source/ is never optimized recursively
- cleanup never deletes orphan originals or conflicting files
- exact duplicate originals are removed only when --clean can prove they are byte-identical

Optimization:
- JPG/JPEG/PNG/TIFF/BMP/HEIC/HEIF -> WebP
- MOV/AVI/MKV/M4V/MPG/MPEG/WMV/MP4 -> web MP4 (H.264 + AAC)
- successful originals are moved into sibling _source/
- safe to run repeatedly

Audit detects:
- originals left beside an already-generated WebP/MP4
- duplicate originals both outside and inside _source/
- conflicting originals with the same name but different bytes
- orphan originals in _source/ with no generated web file
- stale ffmpeg temporary files
- empty _source/ folders

HEIC/HEIF support requires pillow-heif.
Video support requires ffmpeg available in PATH.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
from dataclasses import dataclass
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
TEMP_VIDEO_SUFFIX = ".__optimized__.mp4"


@dataclass
class AuditIssue:
    level: str
    code: str
    path: Path
    note: str


def human_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{value} B"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def files_identical(a: Path, b: Path) -> bool:
    try:
        return a.stat().st_size == b.stat().st_size and sha256(a) == sha256(b)
    except OSError:
        return False


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


def generated_for_original(source: Path) -> Path:
    return source.with_suffix(".webp") if source.suffix.lower() in IMAGE_INPUTS else source.with_suffix(".mp4")


def generated_for_archived_source(source: Path) -> Path:
    # _source/foo.jpg -> ../foo.webp ; _source/foo.mov -> ../foo.mp4
    parent = source.parent.parent if source.parent.name == "_source" else source.parent
    suffix = ".webp" if source.suffix.lower() in IMAGE_INPUTS else ".mp4"
    return parent / f"{source.stem}{suffix}"


def canonical_source_destination(source: Path) -> Path:
    source_dir = source.parent / "_source"
    source_dir.mkdir(exist_ok=True)
    return source_dir / source.name


def safe_source_destination(source: Path) -> Path:
    destination = canonical_source_destination(source)
    if not destination.exists():
        return destination
    stem, suffix = source.stem, source.suffix
    index = 2
    while True:
        candidate = destination.parent / f"{stem}-{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def move_original(source: Path, keep_originals: bool) -> None:
    if not keep_originals:
        shutil.move(str(source), str(safe_source_destination(source)))


def collect_audit(root: Path) -> list[AuditIssue]:
    issues: list[AuditIssue] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        if path.name.endswith(TEMP_VIDEO_SUFFIX):
            final = path.with_name(path.name.replace(TEMP_VIDEO_SUFFIX, ".mp4"))
            note = "temporary ffmpeg file; final exists" if final.exists() else "temporary ffmpeg file; final is missing"
            issues.append(AuditIssue("WARN", "temp-video", path, note))
            continue

        in_source = "_source" in path.parts
        suffix = path.suffix.lower()

        if in_source and suffix in IMAGE_INPUTS | VIDEO_INPUTS:
            generated = generated_for_archived_source(path)
            if not generated.exists():
                issues.append(AuditIssue("INFO", "orphan-source", path, f"no generated file: {generated.name}"))
            continue

        if in_source or suffix not in IMAGE_INPUTS | VIDEO_INPUTS:
            continue

        generated = generated_for_original(path)
        archived = path.parent / "_source" / path.name

        # For MP4, source and generated are the same path, so only duplicate-source checks apply.
        has_generated = generated.exists() and generated.resolve() != path.resolve()

        if archived.exists():
            if files_identical(path, archived):
                issues.append(AuditIssue("WARN", "duplicate-original", path, f"identical copy already in _source/{path.name}"))
            else:
                issues.append(AuditIssue("ERROR", "source-conflict", path, f"different file already exists at _source/{path.name}"))
        elif has_generated:
            issues.append(AuditIssue("WARN", "original-outside-source", path, f"{generated.name} already exists; original should be in _source/"))

    for directory in root.rglob("_source"):
        if directory.is_dir():
            try:
                if not any(directory.iterdir()):
                    issues.append(AuditIssue("INFO", "empty-source-dir", directory, "empty _source folder"))
            except OSError:
                pass

    return issues


def print_audit(root: Path, issues: list[AuditIssue], heading: str = "Media audit") -> None:
    print(f"\n{heading}")
    print(f"Folder: {root}")
    if not issues:
        print("OK  media tree is clean")
        return

    counts = {"ERROR": 0, "WARN": 0, "INFO": 0}
    for issue in issues:
        counts[issue.level] = counts.get(issue.level, 0) + 1
        try:
            relative = issue.path.relative_to(root)
        except ValueError:
            relative = issue.path
        print(f"{issue.level:<5} {issue.code:<24} {relative}  {issue.note}")

    print(f"Audit summary: {counts['ERROR']} errors | {counts['WARN']} warnings | {counts['INFO']} info")


def clean_safe_issues(root: Path) -> tuple[int, int]:
    """Apply only deterministic cleanup. Returns (fixed, conflicts)."""
    fixed = conflicts = 0

    # Work from a fresh snapshot because moves change the tree.
    for issue in collect_audit(root):
        path = issue.path
        try:
            if issue.code == "original-outside-source" and path.exists():
                destination = canonical_source_destination(path)
                if destination.exists():
                    if files_identical(path, destination):
                        path.unlink()
                        print(f"CLEAN duplicate removed: {path.relative_to(root)}")
                        fixed += 1
                    else:
                        print(f"KEEP  conflict: {path.relative_to(root)}")
                        conflicts += 1
                else:
                    shutil.move(str(path), str(destination))
                    print(f"CLEAN moved original -> {destination.relative_to(root)}")
                    fixed += 1

            elif issue.code == "duplicate-original" and path.exists():
                archived = path.parent / "_source" / path.name
                if archived.exists() and files_identical(path, archived):
                    path.unlink()
                    print(f"CLEAN exact duplicate removed: {path.relative_to(root)}")
                    fixed += 1

            elif issue.code == "source-conflict":
                print(f"KEEP  manual review required: {path.relative_to(root)}")
                conflicts += 1

            elif issue.code == "temp-video" and path.exists():
                final = path.with_name(path.name.replace(TEMP_VIDEO_SUFFIX, ".mp4"))
                if final.exists():
                    path.unlink()
                    print(f"CLEAN stale ffmpeg temp removed: {path.relative_to(root)}")
                    fixed += 1
                else:
                    print(f"KEEP  temp has no final file: {path.relative_to(root)}")
                    conflicts += 1
        except OSError as exc:
            print(f"KEEP  could not clean {path.relative_to(root)}: {exc}")
            conflicts += 1

    # Empty _source directories are always safe to remove.
    for directory in sorted(root.rglob("_source"), key=lambda p: len(p.parts), reverse=True):
        try:
            if directory.is_dir() and not any(directory.iterdir()):
                directory.rmdir()
                print(f"CLEAN removed empty folder: {directory.relative_to(root)}")
                fixed += 1
        except OSError:
            pass

    return fixed, conflicts


def optimize_image(source: Path, quality: int, max_size: int, keep_originals: bool, force: bool):
    if source.suffix.lower() in {".heic", ".heif"} and not HEIF_ENABLED:
        return "skip", 0, 0, "HEIC/HEIF requires pillow-heif"

    destination = source.with_suffix(".webp")
    if destination.exists() and not force:
        return "skip", source.stat().st_size, destination.stat().st_size, "WebP already exists (run --clean to archive the loose original)"

    before = source.stat().st_size
    try:
        with Image.open(source) as im:
            im = ImageOps.exif_transpose(im)
            if max(im.size) > max_size:
                ratio = max_size / max(im.size)
                new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
                im = im.resize(new_size, Image.Resampling.LANCZOS)
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
            im.save(destination, "WEBP", quality=quality, method=6, optimize=True)

        after = destination.stat().st_size
        move_original(source, keep_originals)
        return "ok", before, after, ""
    except Exception as exc:
        destination.unlink(missing_ok=True)
        return "error", before, 0, str(exc)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def optimize_video(source: Path, crf: int, max_video_width: int, keep_originals: bool, force: bool):
    if not ffmpeg_available():
        return "skip", 0, 0, "ffmpeg not found in PATH"

    destination = source.with_suffix(".mp4")
    same_path = source.resolve() == destination.resolve()
    output = source.with_name(f"{source.stem}{TEMP_VIDEO_SUFFIX}") if same_path else destination

    if destination.exists() and not same_path and not force:
        return "skip", source.stat().st_size, destination.stat().st_size, "optimized MP4 already exists (run --clean to archive the loose original)"

    before = source.stat().st_size
    vf = ["-vf", f"scale='min({max_video_width},iw)':-2"] if max_video_width > 0 else []
    command = [
        "ffmpeg", "-y" if force or same_path else "-n", "-i", str(source), *vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "160k", str(output),
    ]

    try:
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
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

        return "ok", before, destination.stat().st_size, ""
    except Exception as exc:
        output.unlink(missing_ok=True)
        return "error", before, 0, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Optimize and audit portfolio media safely.")
    parser.add_argument("folder", nargs="?", default="public/media/artistic", help="Folder to scan recursively")
    parser.add_argument("--audit", action="store_true", help="Audit only; do not optimize or modify files")
    parser.add_argument("--clean", action="store_true", help="Apply only safe cleanup, then optimize remaining new media")
    parser.add_argument("--quality", type=int, default=82, help="WebP image quality, 1-100 (default: 82)")
    parser.add_argument("--max-size", type=int, default=2400, help="Maximum image width/height in px (default: 2400)")
    parser.add_argument("--video-crf", type=int, default=23, help="H.264 CRF, lower = higher quality (default: 23)")
    parser.add_argument("--max-video-width", type=int, default=1920, help="Maximum video width in px; 0 disables resizing")
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

    preflight = collect_audit(root)
    print_audit(root, preflight, "Preflight media audit")

    if args.audit:
        return 1 if any(issue.level == "ERROR" for issue in preflight) else 0

    if args.clean:
        print("\nSafe cleanup")
        fixed, conflicts = clean_safe_issues(root)
        print(f"Cleanup summary: {fixed} fixed | {conflicts} need manual review")
        print_audit(root, collect_audit(root), "Audit after cleanup")

    media = list(iter_media(root))
    if args.images_only:
        media = [(kind, p) for kind, p in media if kind == "image"]
    elif args.videos_only:
        media = [(kind, p) for kind, p in media if kind == "video"]

    image_count = sum(1 for kind, _ in media if kind == "image")
    video_count = sum(1 for kind, _ in media if kind == "video")

    print("\nPortfolio Media Optimizer")
    print(f"Folder:      {root}")
    print(f"Images:      {image_count}")
    print(f"Videos:      {video_count}")
    print(f"Image WebP:  quality {args.quality}, max side {args.max_size}px")
    print(f"Video MP4:   H.264 CRF {args.video_crf}, max width {args.max_video_width or 'original'}px")
    print(f"HEIC:        {'yes' if HEIF_ENABLED else 'no (install pillow-heif if needed)'}")
    print(f"FFmpeg:      {'yes' if ffmpeg_available() else 'no — videos will be skipped'}\n")

    if not media:
        print("No convertible media found.")
        return 0

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
        print("Originals from successful conversions were moved into sibling _source/ folders.")

    postflight = collect_audit(root)
    print_audit(root, postflight, "Final media audit")
    return 1 if failed or any(issue.level == "ERROR" for issue in postflight) else 0


if __name__ == "__main__":
    raise SystemExit(main())
