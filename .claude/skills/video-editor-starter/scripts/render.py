#!/usr/bin/env python3
"""Steps 5 and 8. Put it all together: cut video + graphics + word captions.
  render.py draft   -> work/draft.mp4   half size, quick, no motion blur (do this first, always)
  render.py final   -> work/final.mp4   full size (only after the user says the draft is approved)
Usage: render.py draft|final [--work work]
Renders wait in line: a lock file stops two renders running at once."""
import argparse, os, sys, time
from pathlib import Path
from common import work_dir, load, run, probe

ap = argparse.ArgumentParser(); ap.add_argument("mode", choices=["draft", "final"]); ap.add_argument("--work")
a = ap.parse_args(); w = work_dir(a.work); lock = w / ".render.lock"
for _ in range(600):                                  # wait in line, one at a time
    try: os.close(os.open(lock, os.O_CREAT | os.O_EXCL)); break
    except FileExistsError:
        if time.time() - lock.stat().st_mtime > 3600: lock.unlink(); continue
        print("another render is running, waiting..."); time.sleep(5)
else: sys.exit("gave up waiting for the render line")
try:
    p = probe(w / "cut.mp4"); built = w / "graphics_built.json"
    gs = load(built) if built.exists() else []
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(w / "cut.mp4")]
    for g in gs: cmd += ["-itsoffset", str(g["start"]), "-i", g["file"]]   # each graphic starts at its time
    chain, last = [], "0:v"
    for i, g in enumerate(gs, 1):
        chain.append(f"[{last}][{i}:v]overlay=eof_action=pass:format=auto[o{i}]"); last = f"o{i}"
    ass = str((w / "captions.ass").resolve()).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")
    chain.append(f"[{last}]subtitles='{ass}'" + (",scale=iw/2:ih/2" if a.mode == "draft" else "") + "[v]")
    enc = ["-c:v", "libx264", "-crf", "30", "-preset", "veryfast"] if a.mode == "draft" else ["-c:v", "libx264", "-crf", "17", "-preset", "slow"]
    out = w / f"{a.mode}.mp4"
    run(cmd + ["-filter_complex", ";".join(chain), "-map", "[v]", "-map", "0:a"] + enc +
        ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(out)])
    q = probe(out); print(f"{out}  {q['w']}x{q['h']}  {q['dur']:.1f}s")
finally:
    lock.unlink(missing_ok=True)
