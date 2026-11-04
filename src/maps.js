// Everything the motion needs is read from the image itself:
//   R  ridge height   — heavily blurred luminance (the big hills)
//   G  clump height   — lightly blurred luminance (tufts that sway more)
//   BA strand direction, as a doubled-angle vector whose length is how
//      clearly the texture runs one way (structure tensor)
// The analysis runs on a copy MAP_WIDTH wide, so blur sizes mean the same
// thing for any input size and large photos don't stall the page.
import * as THREE from 'three';

const MAP_WIDTH = 640;

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load image: ${url}`));
    img.src = url;
  });
}

function blur(src, w, h, sigma) {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
    out[y * w + x] = s;
  }
  return out;
}

function normalise(a) {
  const sorted = Float32Array.from(a).sort();
  const lo = sorted[Math.floor(a.length * 0.01)], hi = sorted[Math.floor(a.length * 0.99)];
  return a.map((v) => Math.min(1, Math.max(0, (v - lo) / Math.max(hi - lo, 1e-6))));
}

// Returns the map texture, the image's dominant strand direction (radians,
// y up, pointing rightward) which becomes the default wind, and its average
// linear colour scaled to a max channel of 1, which tints the gust sheen.
export function deriveMaps(img) {
  const w = MAP_WIDTH, h = Math.max(2, Math.round((MAP_WIDTH * img.height) / img.width));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  const tint = [0, 0, 0];
  // rows stored bottom-up to match GL texture coordinates
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    L[(h - 1 - y) * w + x] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    for (let k = 0; k < 3; k++) tint[k] += (px[i + k] / 255) ** 2.2;
  }
  const tmax = Math.max(...tint, 1e-6);
  const ridge = normalise(blur(L, w, h, 14));
  const clump = normalise(blur(L, w, h, 3.5));
  const fine = blur(L, w, h, 1.0);
  const gxx = new Float32Array(w * h), gyy = new Float32Array(w * h), gxy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = (fine[i + 1] - fine[i - 1]) * 0.5, gy = (fine[i + w] - fine[i - w]) * 0.5;
    gxx[i] = gx * gx; gyy[i] = gy * gy; gxy[i] = gx * gy;
  }
  const Jxx = blur(gxx, w, h, 4), Jyy = blur(gyy, w, h, 4), Jxy = blur(gxy, w, h, 4);
  const data = new Uint8Array(w * h * 4);
  let sx = 0, sy = 0;
  for (let i = 0; i < w * h; i++) {
    const tr = Jxx[i] + Jyy[i] + 1e-9;
    // strands run perpendicular to the luminance gradient: negate its doubled angle
    const vx = -(Jxx[i] - Jyy[i]) / tr, vy = -(2 * Jxy[i]) / tr;
    sx += vx; sy += vy;
    data[i * 4] = ridge[i] * 255;
    data[i * 4 + 1] = clump[i] * 255;
    data[i * 4 + 2] = (0.5 + 0.5 * vx) * 255;
    data[i * 4 + 3] = (0.5 + 0.5 * vy) * 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  let dominant = 0.5 * Math.atan2(sy, sx);           // in (-π/2, π/2]: already points rightward
  if (Math.abs(Math.cos(dominant)) < 0.2) dominant = Math.PI / 2; // near vertical: blow upward
  return { tex, dominant, coherence: Math.hypot(sx, sy) / (w * h), tint: tint.map((v) => v / tmax) };
}
