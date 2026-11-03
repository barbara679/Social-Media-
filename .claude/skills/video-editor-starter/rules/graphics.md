# Graphics rules
Plan first, build second. Look is set in `scripts/make_graphics.py` (colours and sizes at the top of `page()`).

- Write the plan as a plain list first: what, when it appears, how long. The user approves it before anything is built.
- Build graphics from real text and shapes. Never zoom into a screenshot or a picture: it goes blurry. A real screenshot is fine at its normal size or smaller.
- Solid colours only: a solid white or solid black card, and one accent colour per video, used on every graphic (default orange; ask the user). Pass it as `--accent`.
- Two title looks: `--style dark` (black card, default) or `--style paper` (white card, one accent word in serif italic). Pick one per video.
- Title cards show only the key 1 to 4 words of what is said, never the whole sentence.
- Show the real thing the line names. If the speaker says a number, the number is on screen (written the way they say it).
- Land on the word or just before it, never after.
- Only a few graphics. Title card near the start. List callouts when the speaker says a list.
- Keep graphics off the face. Title card top-left, lists on the left. Move them if the speaker sits elsewhere in the frame.
- A graphic stays up at least 2 seconds, plus 0.35 seconds for every word on it. A label that names a section also stays at least 2 seconds. Too short is a flash.
- Each graphic animates in once and out once. It never replays.
- Never two graphics at once, and never text on top of text. Leave no empty gap of a few frames between graphics that follow each other.
- Big text. If it is hard to read on a phone, make it bigger.
