# Video Editor Starter

A Claude Code skill that edits your talking-head video one job at a time.

It does the same jobs as a bigger editing system, in a simpler way:
- cleans up your recording (keeps your last good take of each line, trims long pauses, catches doubled words and stumbles, never clips your last word)
- adds word-by-word captions for the key words only, lower middle
- builds a few simple graphics from real text (a title card with only the key words, and list callouts)
- checks its own work

It will not look like a pro edit on day one. It saves your notes, so it gets better every time you use it.

## Install

1. Drag the `video-editor-starter` folder (or the zip) into Claude Code.
2. Say: "install this skill".
3. Type `/video-editor-starter`.

## What you need (all free)
- ffmpeg
- Whisper (the speech-to-text tool)
- Node 22 or newer (for HyperFrames, the free graphics tool by HeyGen)

Do not worry if you do not have them. The skill checks, and tells you the one line to run for each.

## How it works
Claude does one job, shows you, and waits for your OK:
1. Writes out what you said
2. Shows the cut list, then cuts
3. Adds captions
4. Plans graphics as a list, then builds them
5. Makes a small draft
6. Checks the draft frame by frame for common mistakes (flashes, repeats, covered faces, late text)
7. Takes your notes and rewrites its own rules
8. Makes the full-size video, only after you approve

## Tips
- Give it one job at a time. "Make my video" in one go goes badly.
- Say "keep the last take" when you re-record a line. Pause two seconds, say the whole line again.
- When you give a note, say it plainly ("the title covers my face"). Claude will fix the video AND the rule behind it.
- Optional, at the very end: a voice cleanup tool (Auphonic is one) can polish the sound of the finished video. It is paid. Skip it if you like how it sounds.
- Your notes live in `NOTES_LOG.md` and the `rules` folder. Keep them. Do not delete them.
