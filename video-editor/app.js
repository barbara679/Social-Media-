/* Reel Editor: a starter browser video editor.
 *
 * Everything runs locally in the browser. Clips are drawn onto a <canvas>,
 * audio is mixed with the Web Audio API, and export records the canvas plus
 * the mixed audio in real time with MediaRecorder (MP4 where the browser
 * supports it, WebM otherwise).
 */
'use strict';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ASPECTS = {
  '9:16': [1080, 1920],
  '4:5': [1080, 1350],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};
const FADE_SECONDS = 0.3;          // dip-to-black at each clip boundary
const DEFAULT_IMAGE_SECONDS = 3;
const MUSIC_FADE_OUT_SECONDS = 1.5;
const EXPORT_FPS = 30;
const TEXT_SIZES = { s: 0.05, m: 0.07, l: 0.1 };  // fraction of the short side

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  aspect: '9:16',
  fades: true,
  bg: '#000000',
  clips: [],          // see makeClip()
  music: null,        // { name, url, el, volume, fadeOut }
  selectedId: null,
  pxPerSec: 50,
};
let nextId = 1;

const player = {
  playing: false,
  t: 0,              // global time in seconds
  i: 0,              // index of the clip that is playing
  clipWall: 0,       // performance.now() timestamp that equals local time 0 of image clips
  raf: 0,
  onEnd: null,
  seekToken: 0,
};

let exporting = null; // { recorder, cancelled }

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const canvas = $('#stage');
const g = canvas.getContext('2d');
const mediaBin = $('#media-bin');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function fmt(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function once(el, ev, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); el.removeEventListener(ev, done); resolve(); };
    const timer = setTimeout(done, timeoutMs);
    el.addEventListener(ev, done);
  });
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

const clipLen = (c) => (c.type === 'video' ? Math.max(0.1, c.out - c.in) : c.dur);
const totalLen = () => state.clips.reduce((sum, c) => sum + clipLen(c), 0);
const clipStart = (i) => state.clips.slice(0, i).reduce((sum, c) => sum + clipLen(c), 0);
const selectedClip = () => state.clips.find((c) => c.id === state.selectedId) || null;

/** Map a global time to { i, local } (clip index and time inside that clip). */
function locate(t) {
  let start = 0;
  for (let i = 0; i < state.clips.length; i++) {
    const len = clipLen(state.clips[i]);
    if (t < start + len || i === state.clips.length - 1) {
      return { i, local: clamp(t - start, 0, len) };
    }
    start += len;
  }
  return { i: -1, local: 0 };
}

// ---------------------------------------------------------------------------
// Loading media
// ---------------------------------------------------------------------------
function loadVideoEl(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.muted = false;
    v.addEventListener('loadeddata', () => resolve(v), { once: true });
    v.addEventListener('error', () => reject(new Error('This browser cannot play that video format.')), { once: true });
    v.src = url;
    mediaBin.appendChild(v); // keep it in the DOM so browsers keep decoding it
  });
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

function loadAudioEl(url) {
  return new Promise((resolve, reject) => {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.loop = true;
    a.addEventListener('loadedmetadata', () => resolve(a), { once: true });
    a.addEventListener('error', () => reject(new Error('This browser cannot play that audio format.')), { once: true });
    a.src = url;
    mediaBin.appendChild(a);
  });
}

async function seekVideo(v, t) {
  t = clamp(t, 0, (v.duration || t) - 0.001);
  if (Math.abs(v.currentTime - t) < 0.005 && v.readyState >= 2) return;
  const p = once(v, 'seeked');
  v.currentTime = t;
  await p;
}

async function makeThumb(el, type) {
  const w = 120, h = 68;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cg = c.getContext('2d');
  if (type === 'video') await seekVideo(el, Math.min(0.5, (el.duration || 1) / 2));
  const sw = type === 'video' ? el.videoWidth : el.naturalWidth;
  const sh = type === 'video' ? el.videoHeight : el.naturalHeight;
  if (sw && sh) {
    const s = Math.max(w / sw, h / sh);
    cg.drawImage(el, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s);
  }
  try { return c.toDataURL('image/jpeg', 0.7); } catch { return ''; }
}

function makeClip(type, name, url, el) {
  const srcDur = type === 'video' && isFinite(el.duration) ? el.duration : 0;
  return {
    id: nextId++,
    type, name, url, el,
    srcDur,
    in: 0,
    out: srcDur || DEFAULT_IMAGE_SECONDS,
    dur: DEFAULT_IMAGE_SECONDS,      // images only
    motion: type === 'image',        // slow zoom ("Ken Burns") for photos
    fit: 'cover',
    volume: 1,
    text: '',
    textPos: 'bottom',
    textSize: 'm',
    textStyle: 'box',
    textColor: '#ffffff',
    thumb: '',
  };
}

async function importFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  let added = 0;
  for (const f of files) {
    const url = URL.createObjectURL(f);
    try {
      if (f.type.startsWith('video/')) {
        const el = await loadVideoEl(url);
        const clip = makeClip('video', f.name, url, el);
        clip.thumb = await makeThumb(el, 'video');
        connectAudio(el, clip.volume);
        state.clips.push(clip);
        added++;
      } else if (f.type.startsWith('image/')) {
        const el = await loadImageEl(url);
        const clip = makeClip('image', f.name, url, el);
        clip.thumb = await makeThumb(el, 'image');
        state.clips.push(clip);
        added++;
      } else if (f.type.startsWith('audio/')) {
        const el = await loadAudioEl(url);
        if (state.music) removeMusic();
        state.music = { name: f.name, url, el, volume: 0.6, fadeOut: true };
        connectAudio(el, state.music.volume);
        toast(`Music set: ${f.name}`);
      } else {
        URL.revokeObjectURL(url);
        toast(`Skipped ${f.name}: not a video, image or audio file`);
      }
    } catch (err) {
      URL.revokeObjectURL(url);
      toast(`${f.name}: ${err.message}`);
    }
  }
  if (added && !state.selectedId) state.selectedId = state.clips[0].id;
  refreshAll();
  await seek(player.t);
}

// ---------------------------------------------------------------------------
// Audio graph (needed so export can capture the mixed sound)
// ---------------------------------------------------------------------------
let actx = null, master = null, recDest = null;
const gains = new WeakMap(); // media element -> GainNode

function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.connect(actx.destination);
    recDest = actx.createMediaStreamDestination();
    master.connect(recDest);
    state.clips.forEach((c) => c.type === 'video' && connectAudio(c.el, c.volume));
    if (state.music) connectAudio(state.music.el, state.music.volume);
  }
  if (actx.state === 'suspended') actx.resume();
}

function connectAudio(el, volume) {
  if (!actx) { el.volume = clamp(volume, 0, 1); return; } // wired up later in ensureAudio()
  if (gains.has(el)) return;
  el.volume = 1;
  const src = actx.createMediaElementSource(el);
  const gain = actx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(master);
  gains.set(el, gain);
}

function setVolume(el, v) {
  const gain = gains.get(el);
  if (gain) gain.gain.value = v;
  else el.volume = clamp(v, 0, 1);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function applyAspect() {
  const [w, h] = ASPECTS[state.aspect];
  canvas.width = w;
  canvas.height = h;
}

function drawFrame(i, local, { noFade = false } = {}) {
  const W = canvas.width, H = canvas.height;
  const c = state.clips[i];
  if (!c) {
    g.fillStyle = state.bg;
    g.fillRect(0, 0, W, H);
    return;
  }
  // A video that is still seeking has no frame yet: keep the last one on screen.
  if (c.type === 'video' && c.el.readyState < 2) return;

  g.fillStyle = state.bg;
  g.fillRect(0, 0, W, H);

  const len = clipLen(c);
  const sw = c.type === 'video' ? c.el.videoWidth : c.el.naturalWidth;
  const sh = c.type === 'video' ? c.el.videoHeight : c.el.naturalHeight;
  if (sw && sh) {
    let scale = c.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    if (c.motion) scale *= 1 + 0.1 * clamp(local / len, 0, 1);
    const dw = sw * scale, dh = sh * scale;
    g.drawImage(c.el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  drawText(c, W, H);

  if (state.fades && !noFade) {
    const a = Math.max(0, 1 - local / FADE_SECONDS, 1 - (len - local) / FADE_SECONDS);
    if (a > 0) {
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}

function wrapLines(text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && g.measureText(test).width > maxW) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function drawText(c, W, H) {
  const text = c.text.trim();
  if (!text) return;
  const fs = Math.round(Math.min(W, H) * TEXT_SIZES[c.textSize]);
  const lh = fs * 1.25;
  g.font = `800 ${fs}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = wrapLines(text, W * 0.82);
  const blockH = lines.length * lh;
  // "bottom" sits above the caption/UI area that Reels and TikTok cover.
  const top = c.textPos === 'top' ? H * 0.1
    : c.textPos === 'center' ? (H - blockH) / 2
    : H * 0.78 - blockH;

  lines.forEach((line, n) => {
    const y = top + n * lh + lh / 2;
    const w = g.measureText(line).width;
    if (c.textStyle === 'box') {
      const padX = fs * 0.35, padY = fs * 0.12;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      const rx = W / 2 - w / 2 - padX, ry = y - lh / 2 + padY / 2, rw = w + padX * 2, rh = lh - padY / 2;
      if (g.roundRect) g.roundRect(rx, ry, rw, rh, fs * 0.2); else g.rect(rx, ry, rw, rh);
      g.fill();
    }
    if (c.textStyle === 'outline') {
      g.lineWidth = fs * 0.14;
      g.lineJoin = 'round';
      g.strokeStyle = '#000';
      g.strokeText(line, W / 2, y);
    }
    if (c.textStyle === 'shadow') {
      g.shadowColor = 'rgba(0,0,0,0.75)';
      g.shadowBlur = fs * 0.35;
      g.shadowOffsetY = fs * 0.05;
    }
    g.fillStyle = c.textColor;
    g.fillText(line, W / 2, y);
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
  });
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function pauseAllMedia(except) {
  for (const c of state.clips) if (c.type === 'video' && c.el !== except && !c.el.paused) c.el.pause();
}

function startClip(i, offset) {
  const c = state.clips[i];
  player.i = i;
  player.clipWall = performance.now() - offset * 1000;
  pauseAllMedia(c.type === 'video' ? c.el : null);
  if (c.type === 'video') {
    setVolume(c.el, c.volume);
    c.el.currentTime = c.in + offset;
    c.el.play().catch(() => {});
  }
  // Pre-seek the next video so the cut is quick.
  const next = state.clips[i + 1];
  if (next && next.type === 'video' && next.el !== c.el) next.el.currentTime = next.in;
}

function musicGainAt(t) {
  const m = state.music;
  if (!m) return 0;
  const remaining = totalLen() - t;
  const fade = m.fadeOut ? clamp(remaining / MUSIC_FADE_OUT_SECONDS, 0, 1) : 1;
  return m.volume * fade;
}

function startMusic(t) {
  const m = state.music;
  if (!m) return;
  const d = m.el.duration;
  m.el.currentTime = isFinite(d) && d > 0 ? t % d : 0;
  setVolume(m.el, musicGainAt(t));
  m.el.play().catch(() => {});
}

function play(fromT) {
  if (!state.clips.length || player.playing) return;
  ensureAudio();
  let t = fromT ?? player.t;
  if (t >= totalLen() - 0.05) t = 0;
  const { i, local } = locate(t);
  player.playing = true;
  player.t = t;
  startClip(i, local);
  startMusic(t);
  updateTransport();
  player.raf = requestAnimationFrame(tick);
}

function pause() {
  if (!player.playing) return;
  player.playing = false;
  cancelAnimationFrame(player.raf);
  pauseAllMedia(null);
  if (state.music) state.music.el.pause();
  updateTransport();
}

function finish() {
  pause();
  player.t = totalLen();
  updatePlayhead();
  const cb = player.onEnd;
  player.onEnd = null;
  if (cb) cb();
}

function tick() {
  if (!player.playing) return;
  const c = state.clips[player.i];
  const len = clipLen(c);
  const local = c.type === 'video'
    ? c.el.currentTime - c.in
    : (performance.now() - player.clipWall) / 1000;

  if (local >= len - 0.01 || (c.type === 'video' && c.el.ended)) {
    if (player.i + 1 < state.clips.length) startClip(player.i + 1, 0);
    else { finish(); return; }
  } else {
    const l = Math.max(0, local);
    player.t = clipStart(player.i) + l;
    drawFrame(player.i, l);
    if (state.music) setVolume(state.music.el, musicGainAt(player.t));
    updatePlayhead();
    if (exporting) $('#export-progress').style.width = `${(player.t / totalLen()) * 100}%`;
  }
  player.raf = requestAnimationFrame(tick);
}

/** Jump to global time t and draw that frame. */
async function seek(t, opts) {
  const wasPlaying = player.playing;
  pause();
  const token = ++player.seekToken;
  player.t = clamp(t, 0, totalLen());
  updatePlayhead();
  if (!state.clips.length) { drawFrame(-1, 0); return; }
  const { i, local } = locate(player.t);
  const c = state.clips[i];
  if (c.type === 'video') await seekVideo(c.el, c.in + local);
  if (token !== player.seekToken) return; // a newer seek won
  drawFrame(i, local, opts);
  if (wasPlaying) play(player.t);
}

/** Show a specific frame of a clip (used while trimming); fades are skipped so the frame is visible. */
function previewClipAt(clip, local) {
  const i = state.clips.indexOf(clip);
  if (i < 0) return;
  seek(clipStart(i) + clamp(local, 0, clipLen(clip) - 0.05), { noFade: true });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function pickMimeType() {
  // H.264 MP4 first: it is what Instagram, TikTok and iPhones handle best.
  // A bare "video/mp4" goes last because some browsers put VP9 inside it.
  const candidates = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

async function exportVideo() {
  if (!state.clips.length || exporting) return;
  if (!window.MediaRecorder || !canvas.captureStream) {
    toast('This browser cannot record video. Try Chrome, Edge or Safari.');
    return;
  }
  ensureAudio();
  pause();
  const mimeType = pickMimeType();
  const stream = canvas.captureStream(EXPORT_FPS);
  recDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { recorder.onstop = r; });

  exporting = { recorder, cancelled: false };
  $('#export-progress').style.width = '0%';
  $('#export-overlay').hidden = false;
  setControlsDisabled(true);

  await seek(0);
  const ended = new Promise((r) => { player.onEnd = r; });
  recorder.start(250);
  play(0);
  await Promise.race([ended, new Promise((r) => { exporting.cancel = r; })]);
  pause();
  player.onEnd = null;
  await new Promise((r) => setTimeout(r, 150)); // let the last frames flush
  recorder.stop();
  await stopped;
  stream.getVideoTracks().forEach((tr) => tr.stop());

  const cancelled = exporting.cancelled;
  exporting = null;
  $('#export-overlay').hidden = true;
  setControlsDisabled(false);

  if (cancelled) { toast('Export cancelled'); return; }
  const type = recorder.mimeType || mimeType || 'video/webm';
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reel-${state.aspect.replace(':', 'x')}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  toast(ext === 'mp4' ? 'Exported MP4' : 'Exported WebM (this browser cannot record MP4)');
}

function cancelExport() {
  if (!exporting) return;
  exporting.cancelled = true;
  if (exporting.cancel) exporting.cancel();
}

function setControlsDisabled(disabled) {
  document.querySelectorAll('.topbar button, .topbar select, .transport button').forEach((el) => { el.disabled = disabled; });
  if (!disabled) updateTransport();
}

// ---------------------------------------------------------------------------
// Editing operations
// ---------------------------------------------------------------------------
function removeClip(id) {
  const idx = state.clips.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const [c] = state.clips.splice(idx, 1);
  if (c.type === 'video' && !state.clips.some((o) => o.el === c.el)) {
    c.el.pause();
    c.el.remove();
  }
  if (!state.clips.some((o) => o.url === c.url)) URL.revokeObjectURL(c.url);
  state.selectedId = state.clips[Math.min(idx, state.clips.length - 1)]?.id ?? null;
  refreshAll();
  seek(Math.min(player.t, totalLen()));
}

async function duplicateClip(id) {
  const idx = state.clips.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const src = state.clips[idx];
  const copy = { ...src, id: nextId++ };
  if (src.type === 'video') {
    // Each video clip needs its own element so back-to-back copies don't fight over playback.
    copy.el = await loadVideoEl(src.url);
    connectAudio(copy.el, copy.volume);
  }
  state.clips.splice(idx + 1, 0, copy);
  state.selectedId = copy.id;
  refreshAll();
}

function moveClip(id, toIndex) {
  const from = state.clips.findIndex((c) => c.id === id);
  if (from < 0) return;
  const [c] = state.clips.splice(from, 1);
  state.clips.splice(clamp(toIndex, 0, state.clips.length), 0, c);
  refreshAll();
  seek(player.t);
}

function removeMusic() {
  if (!state.music) return;
  state.music.el.pause();
  state.music.el.remove();
  URL.revokeObjectURL(state.music.url);
  state.music = null;
}

// ---------------------------------------------------------------------------
// UI: inspector
// ---------------------------------------------------------------------------
function seg(name, value, options) {
  return `<div class="seg" data-seg="${name}">${options
    .map(([v, label]) => `<button type="button" data-value="${v}" class="${v === value ? 'on' : ''}">${label}</button>`)
    .join('')}</div>`;
}

function renderClipPanel() {
  const panel = $('#clip-panel');
  const c = selectedClip();
  if (!c) { panel.hidden = true; panel.innerHTML = ''; return; }
  panel.hidden = false;
  const idx = state.clips.indexOf(c);
  const timing = c.type === 'video' ? `
      <div class="field">
        <label>Trim start <span class="value" data-out="in">${c.in.toFixed(1)}s</span></label>
        <input type="range" data-bind="in" min="0" max="${c.srcDur}" step="0.1" value="${c.in}">
      </div>
      <div class="field">
        <label>Trim end <span class="value" data-out="out">${c.out.toFixed(1)}s</span></label>
        <input type="range" data-bind="out" min="0" max="${c.srcDur}" step="0.1" value="${c.out}">
      </div>
      <div class="field">
        <label>Clip volume <span class="value" data-out="volume">${Math.round(c.volume * 100)}%</span></label>
        <input type="range" data-bind="volume" min="0" max="1" step="0.05" value="${c.volume}">
      </div>` : `
      <div class="field">
        <label>Duration <span class="value" data-out="dur">${c.dur.toFixed(1)}s</span></label>
        <input type="range" data-bind="dur" min="0.5" max="15" step="0.5" value="${c.dur}">
      </div>`;

  panel.innerHTML = `
    <div class="panel-title">
      <span class="name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
      <span class="badge">Clip ${idx + 1} of ${state.clips.length}</span>
    </div>
    <div class="muted" data-out="len">Length on timeline: ${clipLen(c).toFixed(1)}s</div>
    ${timing}
    <div class="field">
      <label>Framing</label>
      ${seg('fit', c.fit, [['cover', 'Fill frame'], ['contain', 'Fit whole']])}
    </div>
    <div class="field">
      <label class="check"><input type="checkbox" data-bind="motion" ${c.motion ? 'checked' : ''}> Slow zoom (Ken Burns)</label>
    </div>
    <div class="field-group">
      <div class="field-head">Text overlay</div>
      <div class="field">
        <textarea data-bind="text" rows="2" placeholder="e.g. Just Listed · 3 bd / 2 ba">${escapeHtml(c.text)}</textarea>
      </div>
      <div class="field">
        <label>Position</label>
        ${seg('textPos', c.textPos, [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']])}
      </div>
      <div class="field">
        <label>Size</label>
        ${seg('textSize', c.textSize, [['s', 'S'], ['m', 'M'], ['l', 'L']])}
      </div>
      <div class="field">
        <label>Style</label>
        ${seg('textStyle', c.textStyle, [['box', 'Box'], ['shadow', 'Shadow'], ['outline', 'Outline']])}
      </div>
      <div class="field">
        <label>Text color</label>
        <input type="color" data-bind="textColor" value="${c.textColor}">
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-sm" data-act="left" ${idx === 0 ? 'disabled' : ''}>◀ Move</button>
      <button type="button" class="btn btn-sm" data-act="right" ${idx === state.clips.length - 1 ? 'disabled' : ''}>Move ▶</button>
      <button type="button" class="btn btn-sm" data-act="dup">Duplicate</button>
      <button type="button" class="btn btn-sm btn-danger" data-act="del">Delete</button>
    </div>`;
}

function onClipPanelInput(e) {
  const c = selectedClip();
  const key = e.target.dataset.bind;
  if (!c || !key) return;
  const panel = $('#clip-panel');
  const out = (k, text) => { const el = panel.querySelector(`[data-out="${k}"]`); if (el) el.textContent = text; };

  if (key === 'in' || key === 'out') {
    let v = parseFloat(e.target.value);
    if (key === 'in') v = Math.min(v, c.out - 0.1);
    else v = Math.max(v, c.in + 0.1);
    v = clamp(v, 0, c.srcDur);
    c[key] = v;
    e.target.value = v;
    out(key, `${v.toFixed(1)}s`);
    previewClipAt(c, key === 'in' ? 0 : clipLen(c));
  } else if (key === 'dur') {
    c.dur = parseFloat(e.target.value);
    out('dur', `${c.dur.toFixed(1)}s`);
  } else if (key === 'volume') {
    c.volume = parseFloat(e.target.value);
    setVolume(c.el, c.volume);
    out('volume', `${Math.round(c.volume * 100)}%`);
    return;
  } else if (key === 'motion') {
    c.motion = e.target.checked;
  } else {
    c[key] = e.target.value;
  }
  out('len', `Length on timeline: ${clipLen(c).toFixed(1)}s`);
  renderTimeline();
  updateTotals();
  if (key !== 'in' && key !== 'out') redrawCurrent();
}

function onClipPanelClick(e) {
  const c = selectedClip();
  if (!c) return;
  const segBtn = e.target.closest('.seg button');
  if (segBtn) {
    const key = segBtn.parentElement.dataset.seg;
    c[key] = segBtn.dataset.value;
    segBtn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === segBtn));
    redrawCurrent();
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const idx = state.clips.indexOf(c);
  if (act === 'left') moveClip(c.id, idx - 1);
  else if (act === 'right') moveClip(c.id, idx + 1);
  else if (act === 'dup') duplicateClip(c.id);
  else if (act === 'del') removeClip(c.id);
}

function renderMusicPanel() {
  const panel = $('#music-panel');
  const m = state.music;
  if (!m) {
    panel.innerHTML = `
      <p class="muted" style="margin:4px 0 8px">No music yet. Import an audio file (MP3, M4A, WAV) to add a soundtrack.</p>
      <label class="btn btn-sm" for="file-input">+ Add music</label>`;
    return;
  }
  panel.innerHTML = `
    <div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(m.name)}">♪ ${escapeHtml(m.name)}</div>
    <div class="field">
      <label>Music volume <span class="value" data-out="mvol">${Math.round(m.volume * 100)}%</span></label>
      <input type="range" id="music-volume" min="0" max="1" step="0.05" value="${m.volume}">
    </div>
    <div class="field">
      <label class="check"><input type="checkbox" id="music-fade" ${m.fadeOut ? 'checked' : ''}> Fade out at the end</label>
    </div>
    <div class="actions">
      <label class="btn btn-sm" for="file-input">Replace</label>
      <button type="button" class="btn btn-sm btn-danger" id="music-remove">Remove</button>
    </div>`;
  $('#music-volume').addEventListener('input', (e) => {
    m.volume = parseFloat(e.target.value);
    panel.querySelector('[data-out="mvol"]').textContent = `${Math.round(m.volume * 100)}%`;
    if (player.playing) setVolume(m.el, musicGainAt(player.t));
  });
  $('#music-fade').addEventListener('change', (e) => { m.fadeOut = e.target.checked; });
  $('#music-remove').addEventListener('click', () => { removeMusic(); refreshAll(); });
}

// ---------------------------------------------------------------------------
// UI: timeline
// ---------------------------------------------------------------------------
let dragId = null;

function renderTimeline() {
  const pps = state.pxPerSec;
  const total = totalLen();
  const width = Math.max(total * pps, 200);
  const scroll = $('#timeline-scroll');
  $('#timeline').style.width = `${Math.max(width + 60, scroll.clientWidth)}px`;

  // Ruler
  const ruler = $('#ruler');
  const span = Math.max(total, scroll.clientWidth / pps);
  const labelEvery = pps >= 80 ? 1 : pps >= 40 ? 2 : pps >= 20 ? 5 : 10;
  let html = '';
  for (let s = 0; s <= span; s++) {
    const major = s % labelEvery === 0;
    html += `<div class="tick${major ? ' major' : ''}" style="left:${s * pps}px">${major ? `<span>${fmt(s).replace(/\.0$/, '')}</span>` : ''}</div>`;
  }
  ruler.innerHTML = html;

  // Video/photo track
  const track = $('#track-video');
  if (!state.clips.length) {
    track.innerHTML = '<div class="track-empty">Imported clips and photos appear here.</div>';
  } else {
    track.innerHTML = state.clips.map((c) => `
      <div class="clip${c.id === state.selectedId ? ' selected' : ''}" draggable="true" data-id="${c.id}"
           style="width:${Math.max(clipLen(c) * pps - 2, 8)}px;${c.thumb ? `background-image:url(${c.thumb})` : ''}"
           title="${escapeHtml(c.name)} (${clipLen(c).toFixed(1)}s)">
        <span class="clip-kind">${c.type === 'video' ? '🎬' : '🖼'}</span>
        ${c.text.trim() ? '<span class="clip-text">T</span>' : ''}
        <span class="clip-label">${escapeHtml(c.name)}</span>
      </div>`).join('');
  }

  // Music track
  const mt = $('#track-music');
  mt.innerHTML = state.music
    ? `<div class="music-bar" style="width:${Math.max(total * pps - 2, 120)}px">♪ ${escapeHtml(state.music.name)}</div>`
    : '<div class="track-empty">No music</div>';

  updatePlayhead();
}

function timeFromTimelineX(clientX) {
  const rect = $('#timeline').getBoundingClientRect();
  return clamp((clientX - rect.left) / state.pxPerSec, 0, totalLen());
}

function onTimelineClick(e) {
  if (!state.clips.length) return;
  const clipEl = e.target.closest('.clip');
  if (clipEl) {
    const id = Number(clipEl.dataset.id);
    if (id !== state.selectedId) {
      state.selectedId = id;
      renderClipPanel();
      document.querySelectorAll('.clip').forEach((el) => el.classList.toggle('selected', Number(el.dataset.id) === id));
    }
  }
  seek(timeFromTimelineX(e.clientX));
}

function clearDropMarks() {
  document.querySelectorAll('.clip.drop-before, .clip.drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
}

function setupTimelineDrag() {
  const track = $('#track-video');
  track.addEventListener('dragstart', (e) => {
    const clipEl = e.target.closest('.clip');
    if (!clipEl) return;
    dragId = Number(clipEl.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragId));
  });
  track.addEventListener('dragover', (e) => {
    if (dragId == null) return;
    const clipEl = e.target.closest('.clip');
    if (!clipEl) return;
    e.preventDefault();
    clearDropMarks();
    const r = clipEl.getBoundingClientRect();
    clipEl.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  });
  track.addEventListener('drop', (e) => {
    if (dragId == null) return;
    e.preventDefault();
    e.stopPropagation();
    const clipEl = e.target.closest('.clip');
    if (clipEl) {
      const targetId = Number(clipEl.dataset.id);
      const after = clipEl.classList.contains('drop-after');
      if (targetId !== dragId) {
        const from = state.clips.findIndex((c) => c.id === dragId);
        let to = state.clips.findIndex((c) => c.id === targetId) + (after ? 1 : 0);
        if (from < to) to -= 1;
        moveClip(dragId, to);
      }
    }
    clearDropMarks();
    dragId = null;
  });
  track.addEventListener('dragend', () => { clearDropMarks(); dragId = null; });
}

// ---------------------------------------------------------------------------
// UI: misc
// ---------------------------------------------------------------------------
function updatePlayhead() {
  $('#playhead').style.left = `${player.t * state.pxPerSec}px`;
  $('#time-cur').textContent = fmt(player.t);
  if (player.playing) {
    // keep the playhead visible while playing
    const scroll = $('#timeline-scroll');
    const x = player.t * state.pxPerSec;
    if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40) scroll.scrollLeft = x - 40;
  }
}

function updateTotals() {
  $('#time-total').textContent = fmt(totalLen());
}

function updateTransport() {
  const btn = $('#play-btn');
  btn.textContent = player.playing ? '❚❚' : '▶';
  btn.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  const has = state.clips.length > 0;
  if (!exporting) {
    $('#export-btn').disabled = !has;
    btn.disabled = !has;
    $('#restart-btn').disabled = !has;
  }
}

function refreshAll() {
  $('#empty-state').hidden = state.clips.length > 0;
  renderClipPanel();
  renderMusicPanel();
  renderTimeline();
  updateTotals();
  updateTransport();
}

function redrawCurrent() {
  if (player.playing) return; // the play loop redraws every frame
  seek(player.t);
}

function isTyping(e) {
  const t = e.target;
  if (!t) return false;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable) return true;
  return t.tagName === 'INPUT' && ['text', 'number', 'search', 'email', 'url'].includes(t.type);
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
function init() {
  applyAspect();
  drawFrame(-1, 0);
  refreshAll();
  setupTimelineDrag();

  $('#file-input').addEventListener('change', (e) => {
    importFiles(e.target.files);
    e.target.value = '';
  });

  $('#aspect').addEventListener('change', (e) => {
    state.aspect = e.target.value;
    applyAspect();
    redrawCurrent();
  });

  $('#fades').addEventListener('change', (e) => { state.fades = e.target.checked; redrawCurrent(); });
  $('#bg-color').addEventListener('input', (e) => { state.bg = e.target.value; redrawCurrent(); });

  $('#play-btn').addEventListener('click', () => (player.playing ? pause() : play()));
  $('#restart-btn').addEventListener('click', () => seek(0));
  $('#export-btn').addEventListener('click', exportVideo);
  $('#export-cancel').addEventListener('click', cancelExport);

  $('#clip-panel').addEventListener('input', onClipPanelInput);
  $('#clip-panel').addEventListener('click', onClipPanelClick);

  $('#ruler').addEventListener('click', onTimelineClick);
  $('#track-video').addEventListener('click', onTimelineClick);
  $('#zoom').addEventListener('input', (e) => { state.pxPerSec = Number(e.target.value); renderTimeline(); });
  window.addEventListener('resize', renderTimeline);

  // Drag files from the desktop anywhere onto the page.
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('#drop-overlay').hidden = false; } });
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#drop-overlay').hidden = true;
    if (!exporting) importFiles(e.dataTransfer.files);
  });

  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || exporting) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (player.playing) pause(); else play();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId != null) {
      e.preventDefault();
      removeClip(state.selectedId);
    }
  });
}

init();
