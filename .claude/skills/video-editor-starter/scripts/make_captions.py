#!/usr/bin/env python3
"""Step 3. words_cut.json -> work/captions.ass: lowercase, bold white, soft shadow, lower middle, one word at a time.
Plain ffmpeg burns it in later (render.py). Style lives in rules/captions.md; flags below.
Usage: make_captions.py [--work work] [--size 120] [--color FFFFFF] [--hilite FFD400] [--margin 200]

TWO MODES
  Key lines (the one to use): write work/captions_plan.json, a list of key phrases (1 to 6 words each):
    [{"say":"I touched nothing","accent":"nothing"},
     {"say":"it cleans the pauses and the retakes","accent":"retakes","margin":420}]
  "say" = the words as spoken, in the order they are spoken. "accent" (optional) = the one word in the accent colour.
  "margin" (optional) = pixels up from the bottom, for a spot with empty space (for example inside a graphic).
  Each word lands on its spoken word and stays. A phrase longer than 3 words is split into two lines, one after the other.
  Only these phrases get captions. Nothing else.
  No plan file: every word gets a caption, one at a time (the old way; only for a quick test)."""
import argparse, re
from common import work_dir, load, probe

ap = argparse.ArgumentParser(); ap.add_argument("--work")
ap.add_argument("--size", type=int, default=120); ap.add_argument("--color", default="FFFFFF")
ap.add_argument("--hilite", default="FFD400"); ap.add_argument("--per", type=int, default=1, help=argparse.SUPPRESS)
ap.add_argument("--margin", type=int, default=200, help="pixels up from the bottom")
ap.add_argument("--font", default="Arial")
a = ap.parse_args(); w = work_dir(a.work); words = load(w / "words_cut.json")
p = probe(w / "cut.mp4"); W, H = p["w"], p["h"]
bgr = lambda c: c[4:6] + c[2:4] + c[0:2]
def ts(t): h, r = divmod(t, 3600); m, s = divmod(r, 60); return f"{int(h)}:{int(m):02d}:{s:05.2f}"
head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Cap,{a.font},{a.size * H // 1080},&H00{bgr(a.color)},&H00FFFFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,{max(2, a.size // 30)},{max(3, a.size // 28)},2,60,60,{a.margin * H // 1080},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
ev = []
clean = lambda t: t.replace("{", "").replace("}", "").lower()
shown_word = lambda t: clean(t).strip(".,!?;:")
plan_file = w / "captions_plan.json"
if plan_file.exists():
    norm = lambda t: re.sub(r"[^a-z0-9']", "", t.lower()); pos = 0
    for ph in load(plan_file):
        toks = [norm(t) for t in ph["say"].split()]
        for i in range(pos, len(words) - len(toks) + 1):      # find the phrase, moving forward only
            if [norm(x["w"]) for x in words[i:i + len(toks)]] == toks: break
        else: raise SystemExit(f'could not find "{ph["say"]}" in the words after {pos}; check the spelling in words_cut.json')
        pos = i + len(toks); seg = words[i:i + len(toks)]
        half = len(seg) if len(seg) <= 3 else (len(seg) + 1) // 2        # long line -> two lines, one after the other
        mv = ph.get("margin", a.margin) * H // 1080; acc = norm(ph.get("accent", ""))
        parts = [p_ for p_ in (seg[:half], seg[half:]) if p_]
        for n_, part in enumerate(parts):
            last = part[-1]["e"] + 0.6
            if n_ + 1 < len(parts): last = min(last, parts[n_ + 1][0]["s"])      # line one is gone when line two starts
            for j, x in enumerate(part):
                shown = " ".join((r"{\c&H" + bgr(a.hilite) + "&}" + shown_word(y["w"]) + r"{\c&H" + bgr(a.color) + "&}") if norm(y["w"]) == acc else shown_word(y["w"]) for y in part[:j + 1])
                rest = " ".join(shown_word(y["w"]) for y in part[j + 1:])
                txt = shown + (r" {\alpha&HFF&}" + rest + r"{\alpha&H00&}" if rest else "")   # unspoken words are invisible but hold the spot
                end = part[j + 1]["s"] if j + 1 < len(part) else last
                ev.append(f"Dialogue: 0,{ts(x['s'])},{ts(end)},Cap,,0,0,{mv},,{{\\blur2}}{txt}")
    words = []                                                   # plan mode is done; skip the loop below
for i, x in enumerate(words):
    end = words[i + 1]["s"] if i + 1 < len(words) and words[i + 1]["s"] - x["e"] < 0.4 else x["e"] + 0.15
    if a.per == 1:
        pop = r"{\fscx80\fscy80\t(0,90,\fscx100\fscy100)}"
        ev.append(f"Dialogue: 0,{ts(x['s'])},{ts(end)},Cap,,0,0,0,,{pop}{clean(x['w'])}")
    else:  # group of N, highlight current word
        g0 = i - i % a.per; grp = words[g0:g0 + a.per]
        txt = " ".join((r"{\c&H" + bgr(a.hilite) + "&}" + clean(y["w"]) + r"{\c&H" + bgr(a.color) + "&}") if y is x else clean(y["w"]) for y in grp)
        ev.append(f"Dialogue: 0,{ts(x['s'])},{ts(end)},Cap,,0,0,0,,{txt}")
(w / "captions.ass").write_text(head + "\n".join(ev) + "\n"); print(f"{len(ev)} caption lines -> {w/'captions.ass'}")
