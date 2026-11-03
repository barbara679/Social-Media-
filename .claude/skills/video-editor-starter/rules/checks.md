# Checks
Run `scripts/check_frames.py` on the half-size draft. It writes pictures at 10 frames per second, with a clear gap between tiles. Look at EVERY sheet, in order.

Mistakes to hunt, on every pass:
1. An animation plays twice.
2. A graphic flashes for a split second (anything under 0.5 s), or the picture pops for a frame.
3. Text shows up too late to read.
4. A graphic covers the face.
5. A word is said twice.
6. Lips are out of sync with the voice.

- Say what you saw, by time (for example "graphic at 8.2s covers the chin"). Never just say "looks good".
- Before you call something a defect, look at one full-size frame: `check_frames.py --frame 8.2`. Tiles that touch each other can look like garbled text when the real frame is fine.
- Lip sync: pick 5 moments spread across the video. At each, compare the mouth shape with the caption word showing.
- If the check report lists something (two picture changes within 1.5 s, graphics overlapping, too short), deal with it first.
- Fix what you find, make a new draft, check again. Only then show the user.
