# Reel Editor (starter)

A simple browser video editor for making social media videos (Reels, TikTok, Stories, feed posts).
It's plain HTML, CSS and JavaScript, with no build step and no server. Your media stays on your
computer and is never uploaded.

## Run it

Open `index.html` in Chrome, Edge or Safari. You can double-click it, or serve the folder:

```bash
cd video-editor
python3 -m http.server 8000   # then open http://localhost:8000
```

## What it does

- **Import** videos, photos and one music track. Use the button or drag files onto the page.
- **Timeline:** clips play in order. Drag to reorder, click to seek, and zoom in or out.
- **Trim** the start and end of video clips, and set how long each photo stays on screen.
- **Slow zoom (Ken Burns)** on photos. It's on by default and works well for listing photos.
- **Framing:** fill the frame (crop) or fit the whole image (letterbox, in a color you choose).
- **Text overlays** on each clip: top, center or bottom; three sizes; box, shadow or outline style; any color.
- **Fade transitions** between clips (dip to black).
- **Music** with its own volume, looping, and an automatic fade-out at the end. Each video clip also has its own volume.
- **Output sizes:** 9:16 (1080×1920), 4:5 (1080×1350), 1:1 (1080×1080) and 16:9 (1920×1080).
- **Export** downloads the finished video. It's H.264 MP4 where the browser supports it, otherwise WebM.

Shortcuts: `Space` plays or pauses. `Delete` removes the selected clip.

## How it works

| Piece | Where |
|---|---|
| Compositing (frame, zoom, text, fades) | `drawFrame()` in `app.js`, drawn on a `<canvas>` |
| Playback engine | `play()`, `tick()`, `seek()` |
| Audio mix (clip audio and music) | Web Audio graph in `ensureAudio()` / `connectAudio()` |
| Export | `exportVideo()`: `canvas.captureStream()` plus the mixed audio go into `MediaRecorder` |

## Known limits of this starter

- **Export runs in real time.** A 30-second video takes about 30 seconds to export. Keep the tab
  visible while it runs, because browsers slow down background tabs.
- The file format depends on the browser. Chrome and Edge produce H.264 MP4; the audio may be Opus
  instead of AAC, depending on the version. Firefox produces WebM. To convert WebM to MP4, run
  `ffmpeg -i in.webm -c:v libx264 -c:a aac out.mp4`.
- Projects aren't saved. Reloading the page clears the timeline.
- There's one video track and one music track, with no overlapping clips or picture-in-picture.

## Ideas for next steps

- Save and load projects (IndexedDB for the media, JSON for the timeline)
- Brand presets: logo watermark, fonts, colors and an end card for each client
- Faster-than-real-time export with WebCodecs, or ffmpeg.wasm for guaranteed MP4/AAC
- Auto-captions, beat-synced cuts and more transitions (slide, zoom, crossfade)
