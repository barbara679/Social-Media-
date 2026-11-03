#!/usr/bin/env python3
"""Step 6. Look at the draft at 10 frames a second. Writes contact sheets (pictures with time labels) to work/check/
and an auto-report of things a computer can catch. Claude then LOOKS at every sheet.
Tiles have a clear gap between them. Tiles that touch make fake "garbled text" at the seams, so never judge a defect on a tile:
when something looks wrong, look at ONE full-size frame:  check_frames.py --frame 8.2   (writes work/check/frame_8.2.png)
Usage: check_frames.py [VIDEO] [--work work] [--fps 10] [--cols 6] [--rows 5] [--frame SECONDS]"""
import argparse, glob, re
from common import work_dir, load, run, probe

ap = argparse.ArgumentParser(); ap.add_argument("video", nargs="?"); ap.add_argument("--work")
ap.add_argument("--fps", type=int, default=10); ap.add_argument("--cols", type=int, default=6); ap.add_argument("--rows", type=int, default=5)
ap.add_argument("--frame", type=float, help="save one full-size frame at this second and stop")
a = ap.parse_args(); w = work_dir(a.work); v = a.video or str(w / "draft.mp4"); c = w / "check"
c.mkdir(exist_ok=True)
if a.frame is not None:
    out = c / f"frame_{a.frame}.png"; run(["ffmpeg", "-y", "-v", "error", "-ss", str(a.frame), "-i", v, "-frames:v", "1", str(out)])
    print(out); raise SystemExit
for f in glob.glob(str(c / "sheet_*")): __import__("os").remove(f)
p = probe(v); tw = 320; th = int(tw * p["h"] / p["w"]) // 2 * 2
# one label per frame = its time in seconds
run(["ffmpeg", "-y", "-v", "error", "-i", v, "-vf",
     f"fps={a.fps},scale={tw}:{th},drawtext=text='%{{pts\\:hms}}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,"
     f"tile={a.cols}x{a.rows}:padding=10:color=white", "-q:v", "3", str(c / "sheet_%02d.jpg")])
sheets = sorted(glob.glob(str(c / "sheet_*.jpg")))
rep = [f"{len(sheets)} sheets in {c}  (each = {a.cols*a.rows} frames = {a.cols*a.rows/a.fps:.1f}s of video)", ""]
rep.append("AUTO CHECKS (a computer can only catch some of the six mistakes):")
words = w / "words_cut.json"
if words.exists():
    ws = load(words); norm = lambda t: re.sub(r"[^a-z0-9']", "", t.lower())
    twice = [f'{x["s"]:.1f}s "{x["w"]}"' for x, y in zip(ws, ws[1:]) if norm(x["w"]) == norm(y["w"]) and len(norm(x["w"])) > 2]
    rep.append(f"- word said twice in a row: {', '.join(twice) if twice else 'none found'}")
gb = w / "graphics_built.json"
if gb.exists():
    for g in load(gb):
        if g["dur"] < 1.5: rep.append(f'- graphic at {g["start"]}s shows only {g["dur"]}s: may flash, too short to read')
        words_n = len((g.get("text") or " ".join(g.get("items", []))).split())
        if g["dur"] < 0.5 + 0.35 * words_n: rep.append(f'- graphic at {g["start"]}s: {words_n} words in {g["dur"]}s, may be too fast to read')
    rep.append("- graphics checked for time on screen; LOOK at the sheets for 'covers the face'")
# picture changes close together: cut joins and graphics starting within 1.5 s of each other
cl = w / "cutlist.json"; ev = []
if cl.exists():
    t = 0.0
    for k in load(cl)[:-1]: t += k["end"] - k["start"]; ev.append((t, "cut join"))
if gb.exists(): ev += [(g["start"], "graphic") for g in load(gb)]
ev.sort(); close = [f"{x:.1f}s {nx} and {y:.1f}s {ny}" for (x, nx), (y, ny) in zip(ev, ev[1:]) if y - x < 1.5]
rep.append(f"- two picture changes within 1.5 s: {'; '.join(close) if close else 'none found'} (merge them, or smooth the jump)")
if gb.exists():
    gs = sorted(load(gb), key=lambda g: g["start"])
    over = [f'{g["start"]}s and {h["start"]}s' for g, h in zip(gs, gs[1:]) if h["start"] < g["start"] + g["dur"]]
    rep.append(f"- graphics on screen together (text over text): {', '.join(over) if over else 'none found'}")
    gaps = [f'{g["start"]+g["dur"]:.1f}s-{h["start"]:.1f}s' for g, h in zip(gs, gs[1:]) if 0 < h["start"] - g["start"] - g["dur"] < 0.4]
    rep.append(f"- tiny empty gap between graphics: {', '.join(gaps) if gaps else 'none found'}")
rep += ["", "YOU LOOK AT THE SHEETS for: animation plays twice | graphic flashes (under 0.5 s) | text too late to read | graphic covers face | word said twice | lips out of sync | sudden pops"]
(w / "check_report.txt").write_text("\n".join(rep) + "\n"); print("\n".join(rep))
