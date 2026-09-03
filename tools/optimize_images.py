#!/usr/bin/env python3
"""Safe recursive media optimizer + audit for the portfolio.

Workflow:
  py tools/optimize_images.py public/media --audit
  py tools/optimize_images.py public/media --clean
  py tools/optimize_images.py public/media

Rules:
- web assets stay in normal folders
- originals are archived in sibling _source/
- _source is never re-optimized
- an MP4 with _source/<same-name>.mp4 is treated as an already-generated web file
- cleanup only removes byte-identical duplicates / stale temp files / empty _source dirs
"""
from __future__ import annotations

import argparse, hashlib, shutil, subprocess
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Missing Pillow. Install: py -m pip install Pillow pillow-heif")
    raise SystemExit(1)
try:
    from pillow_heif import register_heif_opener
    register_heif_opener(); HEIF_ENABLED=True
except Exception:
    HEIF_ENABLED=False

IMAGE_INPUTS={'.jpg','.jpeg','.png','.tif','.tiff','.bmp','.heic','.heif'}
VIDEO_INPUTS={'.mov','.avi','.mkv','.m4v','.mpg','.mpeg','.wmv','.mp4'}
SKIP_DIRS={'_source','node_modules','.git'}
TEMP_VIDEO_SUFFIX='.__optimized__.mp4'

@dataclass
class AuditIssue:
    level:str; code:str; path:Path; note:str

def sha256(path:Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def identical(a:Path,b:Path)->bool:
    try:return a.stat().st_size==b.stat().st_size and sha256(a)==sha256(b)
    except OSError:return False

def human_bytes(n:int)->str:
    x=float(n)
    for u in ['B','KB','MB','GB']:
        if x<1024 or u=='GB': return f'{x:.1f} {u}'
        x/=1024

def is_in_source(path:Path)->bool:return '_source' in path.parts

def archived_canonical(path:Path)->Path:return path.parent/'_source'/path.name

def generated_for_archived(path:Path)->Path:
    parent=path.parent.parent
    suffix='.webp' if path.suffix.lower() in IMAGE_INPUTS else '.mp4'
    stem=path.stem
    # legacy backups foo-2.mp4, foo-3.mp4 belong to generated foo.mp4 when canonical foo.mp4 exists
    if path.suffix.lower()=='.mp4' and '-' in stem:
        base,tail=stem.rsplit('-',1)
        if tail.isdigit() and (parent/f'{base}.mp4').exists(): stem=base
    return parent/f'{stem}{suffix}'

def is_generated_mp4(path:Path)->bool:
    return path.suffix.lower()=='.mp4' and archived_canonical(path).exists()

def iter_media(root:Path):
    for p in root.rglob('*'):
        if not p.is_file() or any(part in SKIP_DIRS for part in p.parts): continue
        s=p.suffix.lower()
        if s in IMAGE_INPUTS: yield 'image',p
        elif s in VIDEO_INPUTS:
            if s=='.mp4' and is_generated_mp4(p): continue
            yield 'video',p

def safe_archive_destination(source:Path)->Path:
    d=source.parent/'_source'; d.mkdir(exist_ok=True)
    target=d/source.name
    if not target.exists(): return target
    i=2
    while True:
        c=d/f'{source.stem}-{i}{source.suffix}'
        if not c.exists(): return c
        i+=1

def archive_original(source:Path,keep:bool)->None:
    if not keep: shutil.move(str(source),str(safe_archive_destination(source)))

def collect_audit(root:Path)->list[AuditIssue]:
    issues=[]
    for p in root.rglob('*'):
        if not p.is_file(): continue
        if p.name.endswith(TEMP_VIDEO_SUFFIX):
            final=p.with_name(p.name.replace(TEMP_VIDEO_SUFFIX,'.mp4'))
            issues.append(AuditIssue('WARN','temp-video',p,'stale ffmpeg temp' if final.exists() else 'temp file without final'))
            continue
        s=p.suffix.lower()
        if is_in_source(p):
            if s not in IMAGE_INPUTS|VIDEO_INPUTS: continue
            generated=generated_for_archived(p)
            canonical=generated.parent/'_source'/generated.name
            # legacy numbered MP4 backups are reported separately; never treated as errors
            if s=='.mp4' and p.stem.rsplit('-',1)[-1].isdigit() and canonical.exists():
                issues.append(AuditIssue('INFO','legacy-video-source',p,f'old optimizer backup for {generated.name}'))
            elif not generated.exists():
                issues.append(AuditIssue('INFO','orphan-source',p,f'no generated file: {generated.name}'))
            continue
        if s not in IMAGE_INPUTS|VIDEO_INPUTS: continue
        archived=archived_canonical(p)
        if s=='.mp4' and archived.exists():
            # This is the expected pair: compressed web MP4 + original archived MP4.
            continue
        generated=p.with_suffix('.webp') if s in IMAGE_INPUTS else p.with_suffix('.mp4')
        has_generated=generated.exists() and generated.resolve()!=p.resolve()
        if archived.exists():
            if identical(p,archived): issues.append(AuditIssue('WARN','duplicate-original',p,f'identical copy already in _source/{p.name}'))
            else: issues.append(AuditIssue('ERROR','source-conflict',p,f'different original already exists at _source/{p.name}'))
        elif has_generated:
            issues.append(AuditIssue('WARN','original-outside-source',p,f'{generated.name} already exists; original should be archived'))
    for d in root.rglob('_source'):
        try:
            if d.is_dir() and not any(d.iterdir()): issues.append(AuditIssue('INFO','empty-source-dir',d,'empty _source folder'))
        except OSError: pass
    return issues

def print_audit(root:Path,issues:list[AuditIssue],heading='Media audit')->None:
    print(f'\n{heading}\nFolder: {root}')
    if not issues:
        print('OK  media tree is clean'); return
    counts={'ERROR':0,'WARN':0,'INFO':0}
    for i in issues:
        counts[i.level]+=1
        try:r=i.path.relative_to(root)
        except ValueError:r=i.path
        print(f'{i.level:<5} {i.code:<24} {r}  {i.note}')
    print(f"Audit summary: {counts['ERROR']} errors | {counts['WARN']} warnings | {counts['INFO']} info")

def clean_safe(root:Path)->tuple[int,int]:
    fixed=manual=0
    issues=collect_audit(root)
    for i in issues:
        p=i.path
        try:
            if i.code=='duplicate-original' and p.exists():
                a=archived_canonical(p)
                if a.exists() and identical(p,a): p.unlink(); fixed+=1; print(f'CLEAN exact duplicate: {p.relative_to(root)}')
            elif i.code=='original-outside-source' and p.exists():
                a=archived_canonical(p); a.parent.mkdir(exist_ok=True)
                if not a.exists(): shutil.move(str(p),str(a)); fixed+=1; print(f'CLEAN archived original: {p.relative_to(root)}')
                elif identical(p,a): p.unlink(); fixed+=1; print(f'CLEAN duplicate original: {p.relative_to(root)}')
                else: manual+=1; print(f'KEEP conflict: {p.relative_to(root)}')
            elif i.code=='legacy-video-source' and p.exists():
                generated=generated_for_archived(p); canonical=generated.parent/'_source'/generated.name
                if canonical.exists() and identical(p,canonical): p.unlink(); fixed+=1; print(f'CLEAN duplicate legacy backup: {p.relative_to(root)}')
                else: print(f'KEEP legacy variant: {p.relative_to(root)}')
            elif i.code=='source-conflict': manual+=1; print(f'KEEP manual review: {p.relative_to(root)}')
            elif i.code=='temp-video' and p.exists():
                final=p.with_name(p.name.replace(TEMP_VIDEO_SUFFIX,'.mp4'))
                if final.exists(): p.unlink(); fixed+=1; print(f'CLEAN stale temp: {p.relative_to(root)}')
                else: manual+=1; print(f'KEEP temp without final: {p.relative_to(root)}')
        except OSError as e:
            manual+=1; print(f'KEEP could not clean {p.relative_to(root)}: {e}')
    for d in sorted(root.rglob('_source'),key=lambda x:len(x.parts),reverse=True):
        try:
            if d.is_dir() and not any(d.iterdir()): d.rmdir(); fixed+=1; print(f'CLEAN empty folder: {d.relative_to(root)}')
        except OSError: pass
    return fixed,manual

def optimize_image(src:Path,quality:int,max_size:int,keep:bool,force:bool):
    if src.suffix.lower() in {'.heic','.heif'} and not HEIF_ENABLED:return 'skip',0,0,'HEIC requires pillow-heif'
    dst=src.with_suffix('.webp')
    if dst.exists() and not force:return 'skip',src.stat().st_size,dst.stat().st_size,'WebP already exists'
    before=src.stat().st_size
    try:
        with Image.open(src) as im:
            im=ImageOps.exif_transpose(im)
            if max(im.size)>max_size:
                ratio=max_size/max(im.size); im=im.resize((max(1,round(im.width*ratio)),max(1,round(im.height*ratio))),Image.Resampling.LANCZOS)
            im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB'); im.save(dst,'WEBP',quality=quality,method=6,optimize=True)
        after=dst.stat().st_size; archive_original(src,keep); return 'ok',before,after,''
    except Exception as e:
        dst.unlink(missing_ok=True); return 'error',before,0,str(e)

def ffmpeg_available()->bool:return shutil.which('ffmpeg') is not None

def optimize_video(src:Path,crf:int,max_width:int,keep:bool,force:bool):
    if not ffmpeg_available(): return 'skip',0,0,'ffmpeg not found'
    dst=src.with_suffix('.mp4'); same=src.resolve()==dst.resolve()
    if same and is_generated_mp4(src) and not force:return 'skip',src.stat().st_size,src.stat().st_size,'already optimized (original exists in _source)'
    if dst.exists() and not same and not force:return 'skip',src.stat().st_size,dst.stat().st_size,'optimized MP4 already exists'
    out=src.with_name(f'{src.stem}{TEMP_VIDEO_SUFFIX}') if same else dst
    before=src.stat().st_size
    vf=['-vf',f"scale='min({max_width},iw)':-2"] if max_width>0 else []
    cmd=['ffmpeg','-y' if force or same else '-n','-i',str(src),*vf,'-c:v','libx264','-preset','medium','-crf',str(crf),'-pix_fmt','yuv420p','-movflags','+faststart','-c:a','aac','-b:a','160k',str(out)]
    try:
        r=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
        if r.returncode!=0:
            out.unlink(missing_ok=True); return 'error',before,0,'\n'.join(r.stderr.splitlines()[-4:]) or 'ffmpeg failed'
        if not out.exists() or out.stat().st_size==0:return 'error',before,0,'ffmpeg produced no output'
        if same:
            archive=safe_archive_destination(src)
            if keep: shutil.copy2(src,archive)
            else: shutil.move(str(src),str(archive))
            out.replace(dst)
        else: archive_original(src,keep)
        return 'ok',before,dst.stat().st_size,''
    except Exception as e:
        out.unlink(missing_ok=True); return 'error',before,0,str(e)

def main()->int:
    p=argparse.ArgumentParser(description='Optimize and audit portfolio media safely.')
    p.add_argument('folder',nargs='?',default='public/media/artistic')
    p.add_argument('--audit',action='store_true'); p.add_argument('--clean',action='store_true')
    p.add_argument('--quality',type=int,default=82); p.add_argument('--max-size',type=int,default=2400)
    p.add_argument('--video-crf',type=int,default=23); p.add_argument('--max-video-width',type=int,default=1920)
    p.add_argument('--keep-originals',action='store_true'); p.add_argument('--force',action='store_true')
    p.add_argument('--images-only',action='store_true'); p.add_argument('--videos-only',action='store_true')
    a=p.parse_args(); root=Path(a.folder).expanduser().resolve()
    if not root.is_dir(): print(f'Folder not found: {root}'); return 1
    if a.images_only and a.videos_only: print('Choose one of --images-only / --videos-only'); return 1
    pre=collect_audit(root); print_audit(root,pre,'Preflight media audit')
    if a.audit:return 1 if any(i.level=='ERROR' for i in pre) else 0
    if a.clean:
        print('\nSafe cleanup'); fixed,manual=clean_safe(root); print(f'Cleanup summary: {fixed} fixed | {manual} need manual review')
        print_audit(root,collect_audit(root),'Audit after cleanup')
    media=list(iter_media(root))
    if a.images_only:media=[x for x in media if x[0]=='image']
    if a.videos_only:media=[x for x in media if x[0]=='video']
    print(f'\nPortfolio Media Optimizer\nFolder: {root}\nConvertible items: {len(media)}\nHEIC: {"yes" if HEIF_ENABLED else "no"}\nFFmpeg: {"yes" if ffmpeg_available() else "no"}\n')
    converted=skipped=failed=before_total=after_total=0
    for kind,src in media:
        if kind=='image':status,before,after,note=optimize_image(src,a.quality,a.max_size,a.keep_originals,a.force)
        else:status,before,after,note=optimize_video(src,a.video_crf,a.max_video_width,a.keep_originals,a.force)
        rel=src.relative_to(root)
        if status=='ok':
            converted+=1; before_total+=before; after_total+=after; print(f'OK   {rel}  {human_bytes(before)} -> {human_bytes(after)}')
        elif status=='skip':skipped+=1; print(f'SKIP {rel}  {note}')
        else:failed+=1; print(f'ERROR {rel}  {note}')
    print(f'\nDone. Optimized: {converted} | skipped: {skipped} | errors: {failed}')
    if converted:print(f'Processed: {human_bytes(before_total)} -> {human_bytes(after_total)}')
    post=collect_audit(root); print_audit(root,post,'Final media audit')
    return 1 if failed or any(i.level=='ERROR' for i in post) else 0

if __name__=='__main__': raise SystemExit(main())
