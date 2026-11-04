// URL parameters (all optional):
//   img=input/my.jpg   the image to bring to life (path under the repo folder;
//                      default: the sample in examples/)
//   mode=ascii|flow    ASCII layer, or the strands alone (default ascii)
//   width=1080         output width in px; height follows the image
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
const maps = deriveMaps(image);
const even = (v) => Math.max(2, Math.round(v / 2) * 2); // H.264 wants even sizes
const W = even(num('width', 1080)), H = even((W * image.height) / image.width);
const rad = (deg) => (deg * Math.PI) / 180;
const wind = q.get('wind') && q.get('wind') !== 'auto' ? rad(Number(q.get('wind'))) : maps.dominant;
const LOOP = num('loop', 12), FPS = num('fps', 30);
const NAME = imgPath.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-');
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

async function exportLoop(modes) {
  const N = Math.round(LOOP * FPS);
  for (let i = 0; i < N; i++) {
    draw(i / N, i);
    for (const m of modes) {
      post.output(m);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await fetch(`/frame?tag=${NAME}-${m}&i=${i}`, { method: 'POST', body: blob });
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
  exportLoop(modes.length ? modes : ['ascii']).catch((e) => { hud.textContent = String(e); document.title = 'failed'; });
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
