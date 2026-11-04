// URL parameters (all optional):
//   img=input/my.jpg   the image to bring to life (path under the repo folder;
//                      default: the sample in examples/)
//   mode=ascii|flow    ASCII layer, or the strands alone (default ascii)
//   width=1080         output width in px; height follows the image
//   height=2160        output height in px; with both set, the image is
//                      cropped to that shape (e.g. your screen, for a wallpaper)
//   focus=0.5,0.5      which part of the image to keep when cropping
//                      (0–1 across, 0–1 down)
//   wind=auto|35       wind direction in degrees (0 = right, 90 = up); auto
//                      follows the texture's own dominant direction
//   light=130          where the light in the image comes from, in degrees
//   amp=1              sway amount
//   density=1          strand count multiplier
//   loop=12            loop length in seconds
//   fps=30             export frame rate
//   t=0.25             freeze at a loop phase (for stills)
//   export=ascii,flow  render one loop of each listed mode and encode MP4s
// Keys: M switches mode, Space pauses.
import * as THREE from 'three';
import { loadImage, deriveMaps } from './maps.js';
import { buildField } from './field.js';
import { makePost } from './post.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : d);
const hud = document.getElementById('hud');
const imgPath = q.get('img') || 'examples/grass.png';

let image;
try {
  image = await loadImage(`/${imgPath.replace(/^\/+/, '')}`);
} catch (e) {
  hud.innerHTML = `Couldn't load <code>${imgPath}</code>. Put your image in <code>input/</code> and open <code>?img=input/your-image.jpg</code>`;
  throw e;
}
const even = (v) => Math.max(2, Math.round(v / 2) * 2); // H.264 wants even sizes
const W = even(num('width', 1080));
const cropped = q.has('height') && q.get('height') !== '';
const H = cropped ? even(num('height', 0)) : even((W * image.height) / image.width);
if (cropped) image = cropTo(image, W / H, (q.get('focus') || '0.5,0.5').split(',').map(Number));
const maps = deriveMaps(image);

// Cut the largest W:H window out of the image, placed by focus (0–1 each way).
function cropTo(img, aspect, [fx = 0.5, fy = 0.5]) {
  let w = img.width, h = img.height;
  if (w / h > aspect) w = Math.round(h * aspect); else h = Math.round(w / aspect);
  const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, (img.width - w) * clamp(fx), (img.height - h) * clamp(fy), w, h, 0, 0, w, h);
  return cv;
}
const rad = (deg) => (deg * Math.PI) / 180;
const wind = q.get('wind') && q.get('wind') !== 'auto' ? rad(Number(q.get('wind'))) : maps.dominant;
const LOOP = num('loop', 12), FPS = num('fps', 30);
const NAME = imgPath.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-') + (cropped ? `-${W}x${H}` : '');
const MODES = ['ascii', 'flow'];
let mode = MODES.includes(q.get('mode')) ? q.get('mode') : 'ascii';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const field = buildField(renderer, {
  image, maps, width: W, height: H, wind,
  light: rad(num('light', 130)), amp: num('amp', 1), density: num('density', 1),
});
const post = makePost(renderer, W, H, field);
window.livingAscii = { field, post, renderer }; // handle for debugging in the console

const info = `${W}×${H} · ${field.count.toLocaleString()} strands · wind ${Math.round((wind * 180) / Math.PI)}°`;

function draw(t, frame) {
  field.update(t);
  post.renderScene(frame);
}

// A long export sends hundreds of large uploads; retry the odd dropped one
// instead of losing the whole loop.
async function upload(url, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', body });
      if (res.ok) return res;
      throw new Error(`${url}: HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= 5) throw e;
      console.warn(`retrying ${url} (${e.message})`);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

async function exportLoop(modes) {
  const N = Math.round(LOOP * FPS);
  for (let i = 0; i < N; i++) {
    draw(i / N, i);
    for (const m of modes) {
      post.output(m);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await upload(`/frame?tag=${NAME}-${m}&i=${i}`, blob);
    }
    hud.textContent = `exporting ${modes.join(' + ')} · frame ${i + 1}/${N}`;
    document.title = `${i + 1}/${N}`;
  }
  const files = [];
  for (const m of modes) {
    hud.textContent = `encoding ${m}…`;
    const res = await (await fetch(`/encode?tag=${NAME}-${m}&fps=${FPS}`, { method: 'POST' })).json();
    if (res.code !== 0) throw new Error(`ffmpeg failed:\n${res.log}`);
    files.push(res.file);
  }
  hud.textContent = `done → ${files.join(', ')}`;
  document.title = 'done';
}

if (q.has('export')) {
  const modes = q.get('export').split(',').filter((m) => MODES.includes(m));
  exportLoop(modes.length ? modes : ['ascii']).catch((e) => { console.error(e); hud.textContent = String(e); document.title = 'failed'; });
} else {
  let paused = q.has('t');
  let frozen = num('t', 0);
  const start = performance.now();
  const phase = () => (((performance.now() - start) / 1000) % LOOP) / LOOP;
  addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (e.key === ' ') { frozen = phase(); paused = !paused; }
  });
  let frame = 0;
  const tick = () => {
    const t = paused ? frozen : phase();
    draw(t, frame++);
    post.output(mode);
    hud.textContent = `${info} · t=${t.toFixed(3)} · [M] ${mode} · [space] pause`;
    requestAnimationFrame(tick);
  };
  tick();
}
