"""Shared helpers. Every script keeps its files in one work folder (default: ./work)."""
import json, subprocess, sys
from pathlib import Path

def work_dir(arg):
    p = Path(arg or "work"); p.mkdir(parents=True, exist_ok=True); return p

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("FAILED: " + " ".join(map(str, cmd))[:200] + "\n" + r.stderr[-1500:])
    return r.stdout

def probe(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
               "stream=width,height,r_frame_rate:format=duration", "-of", "json", str(path)])
    d = json.loads(out); s = d["streams"][0]
    n, m = s["r_frame_rate"].split("/")
    return {"w": s["width"], "h": s["height"], "fps": float(n) / float(m), "dur": float(d["format"]["duration"])}

def load(p): return json.loads(Path(p).read_text())
def save(p, d): Path(p).write_text(json.dumps(d, indent=1))

def energy(work):
    """Loudness of work/audio.wav every 20 ms -> (list, threshold). None if there is no audio file.
    Used to find where a word's sound really ends, and sounds hiding between words."""
    import array, math, wave
    p = Path(work) / "audio.wav"
    if not p.exists(): return None
    with wave.open(str(p)) as f:
        hop = f.getframerate() // 50; raw = array.array("h", f.readframes(f.getnframes()))
    rms = [math.sqrt(sum(x * x for x in raw[i:i + hop]) / hop) for i in range(0, len(raw) - hop, hop)]
    quiet = sorted(rms)[len(rms) // 10]               # the quiet floor of this recording
    return rms, max(150.0, quiet * 4)
