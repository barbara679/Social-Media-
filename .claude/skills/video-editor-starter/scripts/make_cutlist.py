#!/usr/bin/env python3
"""Step 2a. words.json -> work/cutlist.json (what to KEEP) + work/cutlist.txt (read this with the user).
Jobs: (1) keep the LAST clean take of any line you said more than once, (2) shrink long pauses,
(3) drop a word said twice in a row, (4) end each piece when the last word's sound really ends (never early),
(5) list sounds hiding between words (a false start Whisper left out of the transcript).
Tune the numbers in rules/cut.md; this script reads them from the flags below.
Usage: make_cutlist.py [--work work] [--pause 0.6] [--keep-gap 0.25] [--lead 0.08] [--tail 0.1]"""
import argparse, re
from difflib import SequenceMatcher
from common import work_dir, load, save, energy

ap = argparse.ArgumentParser(); ap.add_argument("--work")
ap.add_argument("--pause", type=float, default=0.6, help="gaps longer than this get shortened")
ap.add_argument("--keep-gap", type=float, default=0.25, help="how much of a long gap stays")
ap.add_argument("--lead", type=float, default=0.08); ap.add_argument("--tail", type=float, default=0.1, help="extra seconds after the last word's sound ends")
ap.add_argument("--sentence-gap", type=float, default=0.5, help="a gap this long may end a line")
ap.add_argument("--retake-sim", type=float, default=0.6)
a = ap.parse_args(); w = work_dir(a.work); words = load(w / "words.json")
norm = lambda t: re.sub(r"[^a-z0-9' ]", "", t.lower())

# 1. split into lines at punctuation or a pause
lines, cur = [], []
for i, x in enumerate(words):
    cur.append(i)
    nxt = words[i + 1]["s"] - x["e"] if i + 1 < len(words) else 99
    if x["w"][-1] in ".?!" or nxt > a.sentence_gap * 1.6:
        lines.append(cur); cur = []
if cur: lines.append(cur)
en = energy(w)
def sound_end(t, limit):
    """Walk forward from t while there is still sound. Never past `limit` (the next word)."""
    if not en: return t + 0.15                       # no audio file: old fixed padding
    rms, thr = en; i = int(t * 50)
    while i < len(rms) - 1 and (i + 1) / 50 < min(limit, t + 0.4) and rms[i] > thr: i += 1
    return i / 50
text = lambda ln: norm(" ".join(words[i]["w"] for i in ln))

# 2. a line is a dropped take if a later line (within 4 lines) starts the same way
dropped = set(); why = {}
for n, ln in enumerate(lines):
    head = " ".join(text(ln).split()[:5])
    for m in range(n + 1, min(n + 5, len(lines))):
        other = " ".join(text(lines[m]).split()[:5])
        if len(head.split()) >= 3 and SequenceMatcher(None, head, other).ratio() >= a.retake_sim:
            dropped.add(n); why[n] = f"said again as line {m+1}"; break

# 3. build keep segments from the kept lines, shrinking long gaps
keep = []
for n, ln in enumerate(lines):
    if n in dropped: continue
    nxt_s = words[ln[-1] + 1]["s"] if ln[-1] + 1 < len(words) else 1e9
    s = max(0, words[ln[0]]["s"] - a.lead); e = sound_end(words[ln[-1]]["e"], nxt_s) + a.tail
    if keep and s - keep[-1]["end"] <= a.pause and not (n - 1) in dropped:
        keep[-1]["end"] = e; keep[-1]["last"] = ln[-1]
    else:
        keep.append({"start": round(s, 3), "end": round(e, 3), "first": ln[0], "last": ln[-1]})
# do not let neighbours overlap
for p, q in zip(keep, keep[1:]):
    if p["end"] > q["start"]: p["end"] = q["start"] = round((p["end"] + q["start"]) / 2, 3)
for k in keep: k["end"] = round(k["end"], 3)

# 4. a word said twice in a row ("the the", restarts): cut the first, keep the last clean one
norm1 = lambda t: re.sub(r"[^a-z0-9']", "", t.lower())
twice = [i for i in range(len(words) - 1) if norm1(words[i]["w"]) == norm1(words[i + 1]["w"]) and len(norm1(words[i]["w"])) > 0]
holes = [(words[i]["s"] - 0.02, words[i + 1]["s"] - 0.04) for i in twice]
out = []
for k in keep:
    s = k["start"]
    for hs, he in holes:
        if s < hs < k["end"] and he > s:
            out.append({**k, "start": s, "end": round(hs, 3)}); s = round(he, 3)
    out.append({**k, "start": s})
keep = out
save(w / "cutlist.json", keep)

lines_out = ["LINES (D = dropped earlier take):"]
for n, ln in enumerate(lines):
    t = f'{words[ln[0]]["s"]:6.1f}s  ' + " ".join(words[i]["w"] for i in ln)
    lines_out.append(("D " if n in dropped else "  ") + t + (f"   <- {why[n]}" if n in why else ""))
tot = sum(k["end"] - k["start"] for k in keep); full = words[-1]["e"]
lines_out += ["", f"KEEP {len(keep)} pieces: {tot:.1f}s of {full:.1f}s (removes {full-tot:.1f}s)"]
lines_out += [f'  {k["start"]:6.2f} -> {k["end"]:6.2f}' for k in keep]
if twice: lines_out += ["", "WORD SAID TWICE (first one cut; tell me if it was on purpose):"] + [f'  {words[i]["s"]:6.1f}s "{words[i]["w"]}"' for i in twice]
if en:
    rms, thr = en; sus = []
    for a_, b_ in zip(words, words[1:]):
        g0, g1 = a_["e"] + 0.15, b_["s"] - 0.1
        n = sum(1 for j in range(int(g0 * 50), int(g1 * 50)) if j < len(rms) and rms[j] > thr * 1.5)
        if g1 - g0 > 0.2 and n >= 4: sus.append(f"  {g0:6.1f}s -> {g1:.1f}s  sound between \"{a_['w']}\" and \"{b_['w']}\"")
    if sus: lines_out += ["", "SOUND BETWEEN WORDS (maybe a false start the transcript hid; listen, then cut it in cutlist.json):"] + sus
(w / "cutlist.txt").write_text("\n".join(lines_out) + "\n"); print("\n".join(lines_out))
