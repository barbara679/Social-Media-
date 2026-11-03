# Cut rules
Short rulebook. Claude reads it before every cut. When a note is given, one of these lines gets REWRITTEN (not added to). Settings are the flags of `scripts/make_cutlist.py`.

- Keep the LAST clean take of any line that was said more than once. Drop the earlier tries. A line that ends mid-sentence and starts again is a retake: keep the full version.
- A word said twice in a row ("the the") or a restart: keep only the last clean one.
- Never cut inside a word. Start each piece 0.08 seconds before the first word. End it only when the last word's sound has really ended (the script listens for this), plus a tiny bit. A cut that ends early clips the word.
- Do not trust the transcript alone for false starts. Whisper often leaves out a stumble ("and wh-... on one"). The script lists sounds that sit between words. Listen to each one and cut it if it is a stumble.
- Shorten a pause longer than 0.6 seconds. Leave about a quarter second, so it still sounds like a person.
- Two picture changes on the same footage within about 1.5 seconds feel jumpy. Merge them, or smooth the jump (a cut plus a graphic landing together counts as two).
- When unsure whether something is a retake, keep it and tell the user.
- Always show the cut list and wait for an OK before cutting.
