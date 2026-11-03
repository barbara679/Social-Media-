#!/usr/bin/env python3
"""Step 2b. Cut the video to the cutlist. Writes work/cut.mp4 and work/words_cut.json (word times on the NEW timeline).
Usage: apply_cut.py VIDEO [--work work]
Edit work/cutlist.json by hand (or ask Claude to) before running if the user wants changes."""
import argparse
from common import work_dir, load, save, run, probe

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--work"); a = ap.parse_args()
w = work_dir(a.work); keep = load(w / "cutlist.json"); words = load(w / "words.json")
parts, f, t0, new = [], [], 0.0, []
for i, k in enumerate(keep):
    f.append(f"[0:v]trim=start={k['start']}:end={k['end']},setpts=PTS-STARTPTS[v{i}];"
             f"[0:a]atrim=start={k['start']}:end={k['end']},asetpts=PTS-STARTPTS,afade=t=in:d=0.01[a{i}]")
    parts.append(f"[v{i}][a{i}]")
    for x in words:
        if k["start"] <= x["s"] < k["end"]:
            new.append({"w": x["w"], "s": round(x["s"] - k["start"] + t0, 3), "e": round(min(x["e"], k["end"]) - k["start"] + t0, 3)})
    t0 += k["end"] - k["start"]
graph = ";".join(f) + ";" + "".join(parts) + f"concat=n={len(keep)}:v=1:a=1[v][a]"
run(["ffmpeg", "-y", "-v", "error", "-i", a.video, "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
     "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", str(w / "cut.mp4")])
save(w / "words_cut.json", new)
p = probe(w / "cut.mp4"); print(f"cut.mp4 {p['dur']:.1f}s, {len(new)} words")
