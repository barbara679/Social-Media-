#!/usr/bin/env python3
"""Step 4b. Build the graphics in work/graphics.json with HyperFrames, one see-through clip each.
Plan file (you and the user agree on it FIRST):
  [{"type":"title","text":"Edit with Claude","accent":"Claude","start":1.0,"dur":3.0},
   {"type":"list","title":"3 jobs","items":["Clean","Caption","Check"],"start":8.0,"dur":6.0}]
Title text = only the key 1-4 words, real text (never a picture of text). `start` = a hair BEFORE the spoken word. `accent` (optional) = the one word shown in the accent colour (default: the last word).
`start` = seconds on the CUT video (work/cut.mp4). Look/colours live in rules/graphics.md.
Usage: make_graphics.py [--work work] [--style dark|paper] [--accent "#EA3D05"]     (needs Node 22+, ffmpeg; first run downloads HyperFrames)"""
import argparse, html, os, shutil
from pathlib import Path
from common import work_dir, load, save, run, probe

ap = argparse.ArgumentParser(); ap.add_argument("--work")
ap.add_argument("--accent", default="#EA3D05"); ap.add_argument("--card", default="#000000", help="card colour: solid black or white")
ap.add_argument("--style", choices=["dark", "paper"], default="dark", help="title card look: dark (solid black card, default) or paper (solid white card)")
ap.add_argument("--quality", default="draft", help="draft for drafts, delivery for the final")
a = ap.parse_args(); w = work_dir(a.work); plan = load(w / "graphics.json"); p = probe(w / "cut.mp4")
W, H = p["w"], p["h"]; g = w / "graphics"; env = dict(os.environ, HYPERFRAMES_SKIP_SKILLS="1")
if not (g / "hyperframes.json").exists():
    run(["npx", "-y", "hyperframes", "init", str(g), "--example", "blank", "--non-interactive", "--skip-transcribe"])

def page(item):
    dur = item["dur"]; e = html.escape
    if item["type"] == "title":
        words = item["text"].split(); acc = item.get("accent") or words[-1]
        txt = " ".join(f'<b class="{"hit" if x.strip(".,!?:;") == acc else ""}">{e(x)}</b>' for x in words)
        body = f'<div id="card" class="card title"><span>{txt}</span></div>'
        anim = 'tl.from("#card",{y:-40,opacity:0,duration:0.45,ease:"power3.out"},0);'
    else:
        rows = "".join(f'<div class="row">{e(t)}</div>' for t in item["items"])
        body = f'<div id="card" class="card list"><h2>{e(item.get("title",""))}</h2>{rows}</div>'
        step = min(0.5, max(0.2, (dur - 1.2) / max(1, len(item["items"]))))
        anim = ('tl.from("#card",{x:-60,opacity:0,duration:0.4,ease:"power3.out"},0);'
                f'tl.from(".row",{{x:-30,opacity:0,duration:0.35,stagger:{step:.2f},ease:"power2.out"}},0.35);')
    out = f'tl.to("#card",{{opacity:0,duration:0.3}},{max(0.5, dur-0.3):.2f});'
    return f"""<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:transparent}}
#root{{width:100%;height:100%;position:relative;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#fff}}
.card{{position:absolute;background:{a.card};border-left:{H//90}px solid {a.accent};border-radius:{H//50}px;padding:{H//30}px {H//20}px}}
.title{{top:{H//14}px;left:{W//24}px;max-width:{W//3}px;font-size:{H//18}px;font-weight:800;line-height:1.15}}
.paper .title{{background:#FFFFFF;color:#000000;border-left:0;border-radius:{H//40}px;box-shadow:0 {H//80}px {H//30}px rgba(0,0,0,.25)}}
.title b{{font-weight:800}}
.paper .title b.hit{{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;color:{a.accent};font-size:1.15em}}
.dark .title b.hit{{color:{a.accent}}}
.list{{top:{H//8}px;left:{W//24}px;min-width:{W//4}px}}
.list h2{{font-size:{H//22}px;color:{a.accent};margin-bottom:{H//50}px;text-transform:uppercase;letter-spacing:.06em}}
.row{{font-size:{H//20}px;font-weight:700;padding:{H//90}px 0}}
</style></head><body>
<div id="root" class="{a.style}" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="{W}" data-height="{H}">
{body}</div>
<script>const tl=gsap.timeline({{paused:true}});{anim}{out}window.__timelines["main"]=tl;tl.seek(0);</script>
</body></html>"""

done = []
for i, item in enumerate(plan):
    (g / "index.html").write_text(page(item)); out = g / "renders" / f"g{i+1}.mov"
    run(["npx", "-y", "hyperframes", "render", str(g), "--format", "mov", "--quality", a.quality, "--fps", "30", "-o", str(out), "--quiet"])
    done.append({**item, "file": str(out)}); print("built", out.name, item["type"], f'{item["start"]}s +{item["dur"]}s')
save(w / "graphics_built.json", done)
