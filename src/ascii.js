// ASCII layer. Every 5×7 cell reads the graded colour of the
// strands under it and their mean direction (from a separate direction pass),
// then draws a stroke glyph turned to that direction: 8 angles × 4 weights,
// rasterised here so the strokes rotate in small steps as the strands sway.
// Each weight lights about the same number of pixels at every angle. Colour
// is solved per cell: strokes take the cell's own colour a step brighter, and
// the glow behind them is set so the cell averages to the flow render's
// colour — so at viewing size the ASCII keeps the original's exposure and hues.
// Cells with no clear direction (gaps, undergrowth) use a density ramp.
import * as THREE from 'three';
import { G, RAMP, CELL_W, CELL_H } from './font5x7.js';

const BINS = 8;
// [half length, lit pixels out of the 4×6 box], light → heavy
const WEIGHTS = [[1.6, 3], [3.6, 6], [3.6, 10], [3.6, 14]];

// Strokes stay inside a 4×6 box (last column and bottom row left blank, as
// in the bitmap font), so neighbouring glyphs never join into long lines.
function strokeGlyph(theta, halfLen, halfThick) {
  const rows = [];
  const dx = Math.cos(theta), dy = Math.sin(theta);
  // centred on a pixel (col 1, row 3), so a one-pixel line stays one pixel wide
  const cx = 1.5, cy = 3.5;
  for (let y = 0; y < CELL_H; y++) {
    let row = '';
    for (let x = 0; x < CELL_W; x++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        if (x === CELL_W - 1 || y === 0) continue;
        const px = x + (sx + 0.5) / 4 - cx, py = y + (sy + 0.5) / 4 - cy;
        const along = px * dx + py * dy, across = Math.abs(-px * dy + py * dx);
        if (across <= halfThick && Math.abs(along) <= halfLen) hit++;
      }
      row += hit >= 5 ? '#' : '.';
    }
    rows.push(row); // row 0 is the bottom: theta is measured with y up
  }
  return rows;
}

const litCount = (rows) => rows.join('').split('#').length - 1;

// search length and thickness for the stroke that lights closest to `target`
// pixels while still reading as a line (never thicker than half its length).
// Angles that can't reach the target (horizontal: the box is 4 px wide) are
// evened out by the per-cell glow solve.
function fitStroke(theta, halfLen, target) {
  let best = null, bestCost = Infinity;
  for (let hl = 0.8; hl <= 4.6; hl += 0.1) for (let ht = 0.2; ht <= hl * 0.5; ht += 0.05) {
    const g = strokeGlyph(theta, hl, ht);
    const cost = Math.abs(litCount(g) - target) * 10 + Math.abs(hl - halfLen) + ht * 0.1;
    if (cost < bestCost) { best = g; bestCost = cost; }
  }
  return best;
}

// one strip of CELL_W×CELL_H glyphs; rows already bottom-up
function buildAtlas() {
  const glyphs = [];
  const flip = (g) => g.slice().reverse(); // font rows are top-down
  for (const ch of RAMP) glyphs.push(flip(G[ch]));
  for (let w = 0; w < WEIGHTS.length; w++) for (let b = 0; b < BINS; b++) {
    glyphs.push(fitStroke((b / BINS) * Math.PI, ...WEIGHTS[w]));
  }
  // fraction of the cell each glyph lights, for the colour solve
  const covers = glyphs.map((g) => litCount(g) / (CELL_W * CELL_H));
  const W = CELL_W * glyphs.length;
  const data = new Uint8Array(W * CELL_H * 4);
  glyphs.forEach((g, gi) => {
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (g[y][x] !== '#') continue;
      const o = (y * W + gi * CELL_W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255;
    }
  });
  const tex = new THREE.DataTexture(data, W, CELL_H, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, count: glyphs.length, strokes: RAMP.length, glyphs, covers };
}

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class AsciiStrokes {
  constructor(renderer, W, H, { sat = 0.97, glyphBoost = 2.0, highlightBoost = 1.3, lift = 1.0 } = {}) {
    this.renderer = renderer;
    const cols = Math.ceil(W / CELL_W), rows = Math.ceil(H / CELL_H);
    this.cellRT = new THREE.WebGLRenderTarget(cols, rows, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
    });
    const atlas = buildAtlas();
    this.atlas = atlas;
    const cell = new THREE.Vector2(CELL_W, CELL_H), res = new THREE.Vector2(W, H);

    this.reduceMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDir: { value: null }, uRes: { value: res }, uCell: { value: cell } },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDir; uniform vec2 uRes, uCell;
        void main() {
          vec2 cell = floor(gl_FragCoord.xy);
          vec3 sum = vec3(0.0), mx = vec3(0.0);
          vec3 dir = vec3(0.0);
          for (int y = 0; y < ${CELL_H}; y++) for (int x = 0; x < ${CELL_W}; x++) {
            vec2 uv = (cell * uCell + vec2(x, y) + 0.5) / uRes;
            vec3 c = clamp(texture2D(tColor, uv).rgb, 0.0, 16.0);
            sum += c; mx = max(mx, c);
            dir += texture2D(tDir, uv).rgb;
          }
          // mean of doubled-angle vectors: its angle halved is the strands'
          // heading, its length over the weight is how much they agree
          float coh = dir.z > 1e-4 ? length(dir.xy) / dir.z : 0.0;
          float cover = dir.z / ${(CELL_W * CELL_H).toFixed(1)};
          float theta = dir.z > 1e-4 ? mod(0.5 * atan(dir.y, dir.x), 3.14159265) : 0.0;
          float bin = mod(floor(theta / (3.14159265 / ${BINS}.0) + 0.5), ${BINS}.0);
          gl_FragColor = vec4(mix(sum / ${(CELL_W * CELL_H).toFixed(1)}, mx, 0.3), bin + 0.9 * clamp(coh * smoothstep(0.15, 0.6, cover), 0.0, 1.0));
        }`,
    });

    this.drawMat = new THREE.ShaderMaterial({
      uniforms: {
        tCells: { value: this.cellRT.texture }, tAtlas: { value: atlas.tex },
        uCell: { value: cell }, uGrid: { value: new THREE.Vector2(cols, rows) }, uRes: { value: res },
        uCount: { value: atlas.count }, uStrokes: { value: atlas.strokes }, uCover: { value: atlas.covers },
        uSat: { value: sat }, uGlyphBoost: { value: glyphBoost }, uHighlightBoost: { value: highlightBoost }, uLift: { value: lift },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tCells, tAtlas; uniform vec2 uCell, uGrid, uRes;
        uniform float uCount, uStrokes, uSat, uGlyphBoost, uHighlightBoost, uLift;
        uniform float uCover[${RAMP.length + BINS * WEIGHTS.length}];
        float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main() {
          vec2 fc = gl_FragCoord.xy;
          vec2 cell = floor(fc / uCell);
          vec2 local = fract(fc / uCell);
          vec4 texel = texture2D(tCells, (cell + 0.5) / uGrid);
          // same grade as the flow render: gamma, then saturation
          vec3 c = pow(max(texel.rgb, 0.0), vec3(1.0 / 2.2));
          c = clamp(mix(vec3(luma(c)), c, 1.2) * 1.06, 0.0, 1.0);
          // the flow grade is a touch more saturated than the image; pull back
          // toward the image's own colour
          c = mix(vec3(luma(c)), c, uSat);
          float l = luma(c);
          float bin = floor(texel.a);
          float conf = fract(texel.a) / 0.9;
          // shadows keep visible strokes; only the deepest gaps thin out to dots
          float v = smoothstep(0.0, 0.8, l);
          float idx;
          if (conf > 0.3 && v > 0.03) {
            float weight = v < 0.12 ? 0.0 : v < 0.35 ? 1.0 : v < 0.65 ? 2.0 : 3.0;
            idx = uStrokes + weight * ${BINS}.0 + bin;
          } else {
            idx = clamp(floor(pow(v, 1.3) * ${RAMP.length}.0), 0.0, ${RAMP.length - 1}.0);
          }
          float m = texture2D(tAtlas, vec2((idx + local.x) / uCount, local.y)).r;
          float f = uCover[int(idx + 0.5)];

          // ---- colour solve: what the cell should average to. The cell colour
          // leans toward its brightest pixel (to keep glints), so this scale,
          // measured against the flow render, brings it back to the flow's
          // exposure; shadows end a little deeper than flow
          float target = l * uLift * (0.82 + 0.17 * smoothstep(0.15, 0.7, l));
          // strokes: the cell's own colour, brightened — a lot in shadow so the
          // strokes read, only a little in highlights so they stay natural
          float mx = max(c.r, max(c.g, c.b));
          vec3 hue = c / max(mx, 1e-4);
          float boost = mix(uGlyphBoost, uHighlightBoost, smoothstep(0.2, 0.7, l));
          float gv = min(min(1.0, mx * boost), target / max(f * max(luma(hue), 1e-4), 1e-4));
          vec3 ink = hue * gv;
          // soft shoulder: near full brightness the stroke eases toward warm
          // cream, as sunlit tips do in a photo, instead of going neon
          float shoulder = smoothstep(0.75, 1.0, gv);
          ink = mix(ink, vec3(luma(ink)) * vec3(1.04, 1.0, 0.82), 0.35 * shoulder);
          float lg = luma(ink);
          // glow behind the strokes makes up the rest of the cell's brightness
          float b = f < 0.999 ? clamp((target - f * lg) / ((1.0 - f) * max(l, 1e-4)), 0.0, 1.0 / max(mx, 1e-4)) : 0.0;
          vec3 col = m > 0.5 ? ink : c * b;
          vec2 vg = (fc / uRes - 0.5) * vec2(1.15, 0.85);
          col *= 1.0 - 0.22 * pow(clamp(dot(vg, vg) * 2.4, 0.0, 1.0), 1.6);  // same vignette as flow
          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.cam);
  }

  render(colorTex, dirTex) {
    this.reduceMat.uniforms.tColor.value = colorTex;
    this.reduceMat.uniforms.tDir.value = dirTex;
    this.pass(this.reduceMat, this.cellRT);
    this.pass(this.drawMat, null);
  }
}
