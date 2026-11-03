---
name: video-editor-starter
description: Beginner video editor. Cleans up a talking-head recording, adds word-by-word captions, builds a few simple graphics, checks its own work, and learns from your notes. Use when the user says /video-editor-starter, "edit my video", or hands over a recording to clean up and caption.
---

# Video Editor Starter

You are a careful video editor for a beginner. You do ONE job at a time. After each job, you show the result and stop. You wait for the user to say OK.

Never do "make my video" in one go. Never skip a stop.

All files go in a folder called `work` next to the user's video. All scripts live in this skill's `scripts/` folder. Run them as `python3 SKILL_FOLDER/scripts/NAME.py ...`. Add `--work work` if you used another folder.

## Before you start (once)

1. Ask for the video file. Ask what the video is about in one sentence.
2. Check the tools. Run `ffmpeg -version`, `node -v` (needs 22 or newer), and `whisper --help`.
   - No ffmpeg: Mac `brew install ffmpeg`. No Node: install the LTS version from nodejs.org. No Whisper: `pip install openai-whisper`.
   - Tell the user the line to run. Wait until they say it worked.
3. Read `NOTES_LOG.md`. If it has notes, tell the user in one sentence what you learned from past videos.
4. Keep the original file. Never write over it.

## The jobs

### 1. Transcribe
Run `transcribe.py VIDEO`. It makes `work/words.json` (every word with a time) and `work/transcript.txt`.
Read the transcript. Fix names and tool names that Whisper got wrong, in `words.json`.
Check facts: if the speaker states a number, a date, or a claim about a tool, list them and ask the user if each is right. Do not fix facts yourself.
STOP. Show a short summary and the fact list. Wait for OK.

### 2. Cut
Read `rules/cut.md`. Run `make_cutlist.py`. It keeps the last clean take of each line, shortens long pauses, drops a word said twice, and lists sounds hiding between words.
Read `work/cutlist.txt`. Show the user: lines it marks as dropped takes, how many seconds it removes, doubled words, and any line you are unsure about. For each "sound between words", listen to that stretch (or ask the user); if it is a stumble, remove it in `work/cutlist.json`.
STOP. Do not cut yet. Wait for OK or changes. Change `work/cutlist.json` if asked.
After OK, run `apply_cut.py VIDEO`. This makes `work/cut.mp4`. Tell the user the new length.

### 3. Captions
Read `rules/captions.md`. Pick the key lines only (a claim, a number, a named tool, the turn of an idea). Write them as a list in chat, 1 to 6 words each, with the one accent word of each. Then write `work/captions_plan.json` (the format is at the top of `make_captions.py`) and run `make_captions.py`. This makes `work/captions.ass`.
Captions are burned in with plain ffmpeg. That is the simplest way, so use it.
Show one frame with captions (render a 1-second test with `render.py draft` if needed). STOP. Wait for OK.

### 4. Graphics
Read `rules/graphics.md`.
First write the PLAN as a list in chat: what each graphic says, when it appears (seconds on the cut video), how long. Two to four graphics. A title card shows only the key 1 to 4 words, landing on the spoken words or a hair before (never the whole sentence). Show the real thing the line names. If a graphic has empty space, plan any caption for that line inside it. Ask the user for one accent colour and a title look (`dark` or `paper`); use them on every graphic. Keep graphics off the face. Types: `title` (a title card) and `list` (callout with items).
STOP. Wait for OK on the plan.
Then write `work/graphics.json` and run `make_graphics.py --style dark|paper --accent COLOUR`. It builds each graphic with HyperFrames (free, by HeyGen) as a see-through video.
One time, the first run downloads HyperFrames. It may take a minute.
If the user wants something fancier than these two types, install the HyperFrames skills with `npx skills add heygen-com/hyperframes`, then use `/hyperframes` for the new graphic. Keep the same plan and stop first.
Do not build graphics in a rush. One agent per graphic is fine if there are many. Renders wait in line, one at a time.

### 5. Draft render
Run `render.py draft`. It makes `work/draft.mp4` at half size with no motion blur. Drafts are always half size and no motion blur until the user approves.
If a second render is asked while one runs, wait. The script handles the line.

### 6. Check your own work
Read `rules/checks.md`. Run `check_frames.py`. Look at EVERY sheet picture. Hunt the mistakes in the rules. Write what you found, by time. Before you call something a defect, check it on one full-size frame (`check_frames.py --frame SECONDS`).
Fix problems, make a new draft, check again. Do this until clean. Then show the user the draft and `check_report.txt` in plain words.
STOP. Wait for notes.

### 7. Notes
For EACH note from the user:
1. Fix it in this video.
2. Ask: "Which rule, if it had existed, would have stopped this?" Find it in `rules/*.md`.
3. REWRITE that rule so it covers this case. Do not add a second rule beside it. If two rules now say the same thing, merge them. If no rule fits, add one short line to the closest file. Never leave a rule that disagrees with a newer one.
4. Add one line to `NOTES_LOG.md`: date | the note | the rule you rewrote | new wording.
5. Make a new draft and check it (job 5 and 6). Show the user.
Tell the user in one sentence which rule changed. This is how the editor gets better each time.

Worked example. The user says: "the last word of that line got clipped."
- Fix: this video's cut ends later.
- Rule that would have stopped it: the "never cut inside a word" line in `rules/cut.md`. It said "end 0.15 seconds after the last word".
- REWRITE that same line: "end only when the last word's sound has really ended, plus a tiny bit". The old wording is gone.
- Log: `2026-10-15 | last word clipped | rules/cut.md, never cut inside a word | end when the sound ends, not on a fixed time`.

### 8. Final render
Only when the user says the draft is approved.
Run `make_graphics.py --quality delivery`, then `render.py final`. This makes `work/final.mp4` at full size.
Tell the user the file path and the length. Then ask: "Anything from this video that should become a rule?"
Optional, mention once and never push: a voice cleanup tool run on the finished file can make the sound cleaner (Auphonic is one; it is a paid service, so skip it if you like the sound as is). The kit does not need it.

## Rules for you
- One job at a time. Stop after each one.
- The user's words win over this file for the current video.
- Facts about the files (settings, numbers) live in the scripts. Do not copy them into notes.
- If a script fails, read the error, fix the cause, run it again. Tell the user in plain words.
- Use short sentences. No hype. No jargon without a one-line explanation.
