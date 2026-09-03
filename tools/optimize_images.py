#!/usr/bin/env python3
"""Safe recursive media optimizer + repair tool for the portfolio.

NORMAL DATA-ENTRY WORKFLOW
  py tools/optimize_images.py public/media/artistic/<project>

CHECK ONLY
  py tools/optimize_images.py public/media --audit

SAFE HOUSEKEEPING ONLY
  py tools/optimize_images.py public/media --clean

ONE-TIME / AFTER MOVING MEDIA BETWEEN FOLDERS
  py tools/optimize_images.py public/media --repair

Rules
- web assets live in normal media folders
- originals live only in the sibling _source/ folder
- _source is never optimized recursively
- an MP4 with _source/<same-name>.mp4 is already optimized and is never re-encoded
- --clean removes only provably safe duplicates, stale temp files and empty folders
- --repair additionally reconnects orphan originals when exactly one matching web asset exists
  in the same project, and removes the numbered MP4 backup chain produced by the old optimizer
- ambiguous orphan sources are NEVER moved or deleted automatically
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
    print("Missing Pillow. Install: py -m pip install Pillow pillow-heif")
    raise SystemExit(1)

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_ENABLED = True
except Exception:
    HEIF_ENABLED = False

IMAGE_INPUTS = {'.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.heic', '.heif'}
VIDEO_INPUTS = {'.mov', '.avi', '.mkv', '.m4v', '.mpg', '.mpeg', '.wmv', '.mp4'}
SKIP_DIRS = {'_source', 'node_modules', '.git'}
PROJECT_GROUPS = {'artistic', 'external'}
TEMP_VIDEO_SUFFIX = '.__optimized__.mp4'


@dataclass
class AuditIssue:
    level: str
    code: str
    path: Path
    note: str


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def identical(a: Path, b: Path) -> bool:
    try:
        return a.stat().st_size == b.stat().st_size and sha256(a) == sha256(b)
    except OSError:
        return False


def human_bytes(n: int) -> str:
    x = float(n)
    for unit in ['B', 'KB', 'MB', 'GB']:
        if x < 1024 or unit == 'GB':
            return f'{x:.1f} {unit}'
        x /= 1024
    return f'{n} B'


def is_in_source(path: Path) -> bool:
    return '_source' in path.parts


def archived_canonical(path: Path) -> Path:
    return path.parent / '_source' / path.name


def expected_web_name(original: Path) -> str:
    suffix = '.webp' if original.suffix.lower() in IMAGE_INPUTS else '.mp4'
    return f'{original.stem}{suffix}'


def generated_for_archived(path: Path) -> Path:
    return path.parent.parent / expected_web_name(path)


def legacy_base_name(path: Path) -> str | None:
    """Return foo.mp4 for a legacy foo-2.mp4 backup, otherwise None."""
    if path.suffix.lower() != '.mp4':
        return None
    stem = path.stem
    if '-' not in stem:
        return None
    base, tail = stem.rsplit('-', 1)
    if not tail.isdigit() or int(tail) < 2:
        return None
    return f'{base}.mp4'


def project_root_for(path: Path, scan_root: Path) -> Path:
    """Find public/media/artistic|external/<slug>; fall back to scan root."""
    current = path if path.is_dir() else path.parent
    for candidate in [current, *current.parents]:
        if candidate.parent.name in PROJECT_GROUPS:
            return candidate
        if candidate == scan_root:
            break
    return scan_root


def is_generated_mp4(path: Path) -> bool:
    return path.suffix.lower() == '.mp4' and archived_canonical(path).exists()


def iter_media(root: Path):
    for p in root.rglob('*'):
        if not p.is_file() or any(part in SKIP_DIRS for part in p.parts):
            continue
        suffix = p.suffix.lower()
        if suffix in IMAGE_INPUTS:
            yield 'image', p
        elif suffix in VIDEO_INPUTS:
            # Canonical web MP4 + archived original is a completed pair.
            if suffix == '.mp4' and is_generated_mp4(p):
                continue
            yield 'video', p


def safe_archive_destination(source: Path) -> Path:
    directory = source.parent / '_source'
    directory.mkdir(exist_ok=True)
    target = directory / source.name
    if not target.exists():
        return target
    index = 2
    while True:
        candidate = directory / f'{source.stem}-{index}{source.suffix}'
        if not candidate.exists():
            return candidate
        index += 1


def archive_original(source: Path, keep: bool) -> None:
    if not keep:
        shutil.move(str(source), str(safe_archive_destination(source)))


def find_web_candidates(orphan: Path, scan_root: Path) -> list[Path]:
    project_root = project_root_for(orphan, scan_root)
    wanted = expected_web_name(orphan).lower()
    matches = []
    for candidate in project_root.rglob('*'):
        if not candidate.is_file() or is_in_source(candidate):
            continue
        if candidate.name.lower() == wanted:
            matches.append(candidate)
    return matches


def collect_audit(root: Path) -> list[AuditIssue]:
    issues: list[AuditIssue] = []

    for p in root.rglob('*'):
        if not p.is_file():
            continue

        if p.name.endswith(TEMP_VIDEO_SUFFIX):
            final = p.with_name(p.name.replace(TEMP_VIDEO_SUFFIX, '.mp4'))
            note = 'stale ffmpeg temp; final exists' if final.exists() else 'temp file without final'
            issues.append(AuditIssue('WARN', 'temp-video', p, note))
            continue

        suffix = p.suffix.lower()
        if is_in_source(p):
            if suffix not in IMAGE_INPUTS | VIDEO_INPUTS:
                continue

            legacy_name = legacy_base_name(p)
            if legacy_name:
                canonical = p.parent / legacy_name
                generated = p.parent.parent / legacy_name
                if canonical.exists() and generated.exists():
                    issues.append(AuditIssue('INFO', 'legacy-video-source', p, f'old optimizer backup for {legacy_name}'))
                    continue

            generated = generated_for_archived(p)
            if not generated.exists():
                candidates = find_web_candidates(p, root)
                if len(candidates) == 1:
                    try:
                        rel = candidates[0].relative_to(project_root_for(p, root))
                    except ValueError:
                        rel = candidates[0]
                    issues.append(AuditIssue('INFO', 'orphan-movable', p, f'unique matching web asset found at {rel}'))
                elif len(candidates) > 1:
                    issues.append(AuditIssue('WARN', 'orphan-ambiguous', p, f'{len(candidates)} matching web assets found; manual review required'))
                else:
                    issues.append(AuditIssue('INFO', 'orphan-source', p, f'no generated file found for {expected_web_name(p)}'))
            continue

        if suffix not in IMAGE_INPUTS | VIDEO_INPUTS:
            continue

        archived = archived_canonical(p)
        if suffix == '.mp4' and archived.exists():
            continue

        generated = p.with_suffix('.webp') if suffix in IMAGE_INPUTS else p.with_suffix('.mp4')
        has_generated = generated.exists() and generated.resolve() != p.resolve()
        if archived.exists():
            if identical(p, archived):
                issues.append(AuditIssue('WARN', 'duplicate-original', p, f'identical copy already in _source/{p.name}'))
            else:
                issues.append(AuditIssue('ERROR', 'source-conflict', p, f'different original already exists at _source/{p.name}'))
        elif has_generated:
            issues.append(AuditIssue('WARN', 'original-outside-source', p, f'{generated.name} already exists; original should be archived'))

    for directory in root.rglob('_source'):
        try:
            if directory.is_dir() and not any(directory.iterdir()):
                issues.append(AuditIssue('INFO', 'empty-source-dir', directory, 'empty _source folder'))
        except OSError:
            pass

    return issues


def print_audit(root: Path, issues: list[AuditIssue], heading: str = 'Media audit') -> None:
    print(f'\n{heading}\nFolder: {root}')
    if not issues:
        print('OK  media tree is clean')
        return

    counts = {'ERROR': 0, 'WARN': 0, 'INFO': 0}
    for issue in issues:
        counts[issue.level] += 1
        try:
            relative = issue.path.relative_to(root)
        except ValueError:
            relative = issue.path
        print(f'{issue.level:<5} {issue.code:<24} {relative}  {issue.note}')
    print(f"Audit summary: {counts['ERROR']} errors | {counts['WARN']} warnings | {counts['INFO']} info")


def remove_empty_source_dirs(root: Path) -> int:
    fixed = 0
    for directory in sorted(root.rglob('_source'), key=lambda x: len(x.parts), reverse=True):
        try:
            if directory.is_dir() and not any(directory.iterdir()):
                directory.rmdir()
                fixed += 1
                print(f'CLEAN empty folder: {directory.relative_to(root)}')
        except OSError:
            pass
    return fixed


def clean_safe(root: Path) -> tuple[int, int]:
    """Non-destructive housekeeping. No legacy or orphan inference."""
    fixed = manual = 0
    for issue in collect_audit(root):
        p = issue.path
        try:
            if issue.code == 'duplicate-original' and p.exists():
                archived = archived_canonical(p)
                if archived.exists() and identical(p, archived):
                    p.unlink()
                    fixed += 1
                    print(f'CLEAN exact duplicate: {p.relative_to(root)}')

            elif issue.code == 'original-outside-source' and p.exists():
                archived = archived_canonical(p)
                archived.parent.mkdir(exist_ok=True)
                if not archived.exists():
                    shutil.move(str(p), str(archived))
                    fixed += 1
                    print(f'CLEAN archived original: {archived.relative_to(root)}')
                elif identical(p, archived):
                    p.unlink()
                    fixed += 1
                    print(f'CLEAN duplicate original: {p.relative_to(root)}')
                else:
                    manual += 1
                    print(f'KEEP conflict: {p.relative_to(root)}')

            elif issue.code == 'source-conflict':
                manual += 1
                print(f'KEEP manual review: {p.relative_to(root)}')

            elif issue.code == 'temp-video' and p.exists():
                final = p.with_name(p.name.replace(TEMP_VIDEO_SUFFIX, '.mp4'))
                if final.exists():
                    p.unlink()
                    fixed += 1
                    print(f'CLEAN stale temp: {p.relative_to(root)}')
                else:
                    manual += 1
                    print(f'KEEP temp without final: {p.relative_to(root)}')
        except OSError as exc:
            manual += 1
            print(f'KEEP could not clean {p.relative_to(root)}: {exc}')

    fixed += remove_empty_source_dirs(root)
    return fixed, manual


def repair_media_tree(root: Path) -> tuple[int, int]:
    """Repair known old-optimizer residue and reconnect uniquely identifiable sources."""
    fixed = manual = 0

    # Start with all completely safe cleanup.
    safe_fixed, safe_manual = clean_safe(root)
    fixed += safe_fixed
    manual += safe_manual

    # Snapshot again because safe cleanup may have changed paths.
    for issue in collect_audit(root):
        p = issue.path
        try:
            if issue.code == 'legacy-video-source' and p.exists():
                legacy_name = legacy_base_name(p)
                canonical = p.parent / legacy_name if legacy_name else None
                generated = p.parent.parent / legacy_name if legacy_name else None
                # This exact numbered pattern was created by the old same-path MP4 optimizer.
                # We only remove it when BOTH canonical archived original and web MP4 exist.
                if canonical and generated and canonical.exists() and generated.exists():
                    p.unlink()
                    fixed += 1
                    print(f'REPAIR removed old optimizer backup: {p.relative_to(root)}')
                else:
                    manual += 1
                    print(f'KEEP legacy file (pair incomplete): {p.relative_to(root)}')

            elif issue.code == 'orphan-movable' and p.exists():
                candidates = find_web_candidates(p, root)
                if len(candidates) != 1:
                    manual += 1
                    print(f'KEEP orphan changed/ambiguous: {p.relative_to(root)}')
                    continue

                web = candidates[0]
                destination_dir = web.parent / '_source'
                destination_dir.mkdir(exist_ok=True)
                destination = destination_dir / p.name

                if destination.exists():
                    if identical(p, destination):
                        p.unlink()
                        fixed += 1
                        print(f'REPAIR removed duplicate orphan: {p.relative_to(root)}')
                    else:
                        manual += 1
                        print(f'KEEP orphan destination conflict: {p.relative_to(root)}')
                    continue

                shutil.move(str(p), str(destination))
                fixed += 1
                print(f'REPAIR source -> {destination.relative_to(root)}')

            elif issue.code in {'orphan-source', 'orphan-ambiguous'}:
                manual += 1
                print(f'KEEP unresolved orphan: {p.relative_to(root)}')
        except OSError as exc:
            manual += 1
            print(f'KEEP could not repair {p.relative_to(root)}: {exc}')

    fixed += remove_empty_source_dirs(root)
    return fixed, manual


def optimize_image(src: Path, quality: int, max_size: int, keep: bool, force: bool):
    if src.suffix.lower() in {'.heic', '.heif'} and not HEIF_ENABLED:
        return 'skip', 0, 0, 'HEIC requires pillow-heif'

    dst = src.with_suffix('.webp')
    if dst.exists() and not force:
        return 'skip', src.stat().st_size, dst.stat().st_size, 'WebP already exists'

    before = src.stat().st_size
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if max(im.size) > max_size:
                ratio = max_size / max(im.size)
                new_size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
                im = im.resize(new_size, Image.Resampling.LANCZOS)
            im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
            im.save(dst, 'WEBP', quality=quality, method=6, optimize=True)
        after = dst.stat().st_size
        archive_original(src, keep)
        return 'ok', before, after, ''
    except Exception as exc:
        dst.unlink(missing_ok=True)
        return 'error', before, 0, str(exc)


def ffmpeg_available() -> bool:
    return shutil.which('ffmpeg') is not None


def optimize_video(src: Path, crf: int, max_width: int, keep: bool, force: bool):
    if not ffmpeg_available():
        return 'skip', 0, 0, 'ffmpeg not found'

    dst = src.with_suffix('.mp4')
    same = src.resolve() == dst.resolve()

    if same and is_generated_mp4(src) and not force:
        return 'skip', src.stat().st_size, src.stat().st_size, 'already optimized (original in sibling _source)'
    if dst.exists() and not same and not force:
        return 'skip', src.stat().st_size, dst.stat().st_size, 'optimized MP4 already exists'

    out = src.with_name(f'{src.stem}{TEMP_VIDEO_SUFFIX}') if same else dst
    before = src.stat().st_size
    vf = ['-vf', f"scale='min({max_width},iw)':-2"] if max_width > 0 else []
    cmd = [
        'ffmpeg', '-y' if force or same else '-n', '-i', str(src), *vf,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf),
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-c:a', 'aac', '-b:a', '160k', str(out),
    ]

    try:
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            out.unlink(missing_ok=True)
            return 'error', before, 0, '\n'.join(result.stderr.splitlines()[-4:]) or 'ffmpeg failed'
        if not out.exists() or out.stat().st_size == 0:
            return 'error', before, 0, 'ffmpeg produced no output'

        if same:
            archive = safe_archive_destination(src)
            if keep:
                shutil.copy2(src, archive)
            else:
                shutil.move(str(src), str(archive))
            out.replace(dst)
        else:
            archive_original(src, keep)

        return 'ok', before, dst.stat().st_size, ''
    except Exception as exc:
        out.unlink(missing_ok=True)
        return 'error', before, 0, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description='Optimize, audit and repair portfolio media safely.')
    parser.add_argument('folder', nargs='?', default='public/media/artistic')
    parser.add_argument('--audit', action='store_true', help='report only; never modify files')
    parser.add_argument('--clean', action='store_true', help='safe housekeeping only; do not optimize')
    parser.add_argument('--repair', action='store_true', help='repair old optimizer backups and uniquely match moved sources; do not optimize')
    parser.add_argument('--quality', type=int, default=82)
    parser.add_argument('--max-size', type=int, default=2400)
    parser.add_argument('--video-crf', type=int, default=23)
    parser.add_argument('--max-video-width', type=int, default=1920)
    parser.add_argument('--keep-originals', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--images-only', action='store_true')
    parser.add_argument('--videos-only', action='store_true')
    args = parser.parse_args()

    root = Path(args.folder).expanduser().resolve()
    if not root.is_dir():
        print(f'Folder not found: {root}')
        return 1
    if args.images_only and args.videos_only:
        print('Choose one of --images-only / --videos-only')
        return 1
    if sum(bool(x) for x in [args.audit, args.clean, args.repair]) > 1:
        print('Choose only one maintenance mode: --audit, --clean or --repair')
        return 1

    preflight = collect_audit(root)
    print_audit(root, preflight, 'Preflight media audit')

    if args.audit:
        return 1 if any(i.level == 'ERROR' for i in preflight) else 0

    if args.clean:
        print('\nSafe cleanup')
        fixed, manual = clean_safe(root)
        print(f'Cleanup summary: {fixed} fixed | {manual} need manual review')
        final = collect_audit(root)
        print_audit(root, final, 'Final media audit')
        return 1 if any(i.level == 'ERROR' for i in final) else 0

    if args.repair:
        print('\nMedia tree repair')
        fixed, manual = repair_media_tree(root)
        print(f'Repair summary: {fixed} fixed | {manual} unresolved/manual')
        final = collect_audit(root)
        print_audit(root, final, 'Final media audit')
        return 1 if any(i.level == 'ERROR' for i in final) else 0

    media = list(iter_media(root))
    if args.images_only:
        media = [item for item in media if item[0] == 'image']
    if args.videos_only:
        media = [item for item in media if item[0] == 'video']

    print(
        f'\nPortfolio Media Optimizer\n'
        f'Folder: {root}\n'
        f'Convertible new items: {len(media)}\n'
        f'HEIC: {"yes" if HEIF_ENABLED else "no"}\n'
        f'FFmpeg: {"yes" if ffmpeg_available() else "no"}\n'
    )

    converted = skipped = failed = before_total = after_total = 0
    for kind, src in media:
        if kind == 'image':
            status, before, after, note = optimize_image(src, args.quality, args.max_size, args.keep_originals, args.force)
        else:
            status, before, after, note = optimize_video(src, args.video_crf, args.max_video_width, args.keep_originals, args.force)

        rel = src.relative_to(root)
        if status == 'ok':
            converted += 1
            before_total += before
            after_total += after
            print(f'OK   {rel}  {human_bytes(before)} -> {human_bytes(after)}')
        elif status == 'skip':
            skipped += 1
            print(f'SKIP {rel}  {note}')
        else:
            failed += 1
            print(f'ERROR {rel}  {note}')

    print(f'\nDone. Optimized: {converted} | skipped: {skipped} | errors: {failed}')
    if converted:
        print(f'Processed: {human_bytes(before_total)} -> {human_bytes(after_total)}')

    postflight = collect_audit(root)
    print_audit(root, postflight, 'Final media audit')
    return 1 if failed or any(i.level == 'ERROR' for i in postflight) else 0


if __name__ == '__main__':
    raise SystemExit(main())
