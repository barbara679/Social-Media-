#!/usr/bin/env python3
"""Step 1. Video -> work/words.json (every word with start and end time) + work/transcript.txt.
Usage: transcribe.py VIDEO [--work work] [--model base.en]
Uses openai-whisper if installed, else faster-whisper. If neither: prints the install line."""
import argparse, shutil, sys, tempfile
from pathlib import Path
from common import work_dir, run, save

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--work")
ap.add_argument("--model", default="base.en"); a = ap.parse_args()
w = work_dir(a.work)

def have(mod):
    try: __import__(mod); return True
    except ImportError: return False

wav = w / "audio.wav"
run(["ffmpeg", "-y", "-v", "error", "-i", a.video, "-vn", "-ac", "1", "-ar", "16000", str(wav)])
words = []
if shutil.which("whisper"):
    with tempfile.TemporaryDirectory() as t:
        run(["whisper", str(wav), "--model", a.model, "--language", "en", "--word_timestamps", "True",
             "--output_format", "json", "--output_dir", t, "--fp16", "False"])
        from common import load
        for seg in load(Path(t) / "audio.json")["segments"]:
            for x in seg["words"]:
                words.append({"w": x["word"].strip(), "s": round(x["start"], 3), "e": round(x["end"], 3)})
elif have("faster_whisper"):
    from faster_whisper import WhisperModel
    segs, _ = WhisperModel(a.model, compute_type="int8").transcribe(str(wav), language="en", word_timestamps=True)
    for seg in segs:
        for x in seg.words: words.append({"w": x.word.strip(), "s": round(x.start, 3), "e": round(x.end, 3)})
else:
    sys.exit("No Whisper found. Install it with:  pip install openai-whisper   (also needs ffmpeg)")
fixed = []
for x in words:                      # glue tokens like ",000" onto the word before
    if x["w"] and x["w"][0] in ",.%" and fixed and not x["w"].startswith("..."):
        fixed[-1]["w"] += x["w"]; fixed[-1]["e"] = x["e"]
    elif x["w"]: fixed.append(x)
words = fixed
save(w / "words.json", words)
(w / "transcript.txt").write_text(" ".join(x["w"] for x in words) + "\n")
print(f"{len(words)} words -> {w/'words.json'}")
