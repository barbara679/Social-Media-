# Caption rules
Settings are the flags of `scripts/make_captions.py`.

- Caption only the key words of a line: 1 to 6 words, the ones that matter. Never the whole sentence, never every word of the video.
- Word by word: each word appears when it is spoken and stays until the line ends.
- Lowercase, bold white, a soft shadow (no box), in the lower middle of the picture. One accent word per line, in the accent colour. Never a box in a corner.
- A line longer than 3 words splits into two short lines, one after the other. Never one long line.
- Never put captions on the speaker's mouth or chin. Raise `margin` if they do.
- When a graphic is on screen and has empty space, put the caption in that space (use `margin`). Never cut back to the face just to show a caption.
- Numbers stay together: "149,000" is one caption, not three.
- Never caption on top of text in a graphic. If they would touch, move the caption or drop it.
- Check the spelling of names and tools against the transcript before burning. Fix wrong words in `work/words.json`, then rebuild.
