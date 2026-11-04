// The image rebuilt as a field of individual strands. Each strand carries the
// slice of the image it covers at rest and points along the texture's own
// direction. One shared heading field turns whole regions together — like a
// school of fish — while every strand keeps a little motion of its own. Light
// comes from a swinging sun, drifting light pools and glints that flash as the
// strands turn. Every animated term is integer-periodic in the loop phase t,
// so the last frame flows straight into the first.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const SEG = 7;                      // segments per strand
const REF_W = 1080, REF_H = 1772;   // the frame the defaults were tuned on
const REF_STRANDS = 160000;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMON = /* glsl */`
  uniform sampler2D tImg, tMap;
  uniform vec2 uRes, uWind;
  uniform vec3 uSheen;
  uniform float uT, uLight, uAmp;
  const float TAU = 6.28318530718;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  // value noise repeating every per lattice cells (per must be whole numbers),
  // so shifting it by whole periods over one loop brings it back to the start.
  // Only the drift axis needs to wrap; the other gets a huge period.
  float pnoise(vec2 p, vec2 per) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(mod(i, per)), hash(mod(i + vec2(1, 0), per)), u.x),
               mix(hash(mod(i + vec2(0, 1), per)), hash(mod(i + vec2(1, 1), per)), u.x), u.y);
  }
  float pfbm(vec2 p, vec2 per) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * pnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
    return s / 0.9375;
  }
  vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  vec2 isoOf(vec2 uv) { return vec2(uv.x * uRes.x / uRes.y, uv.y); }
  vec2 windFrame(vec2 q) { return vec2(dot(q, uWind), dot(q, vec2(-uWind.y, uWind.x))); }

  // the sun swings around the light already in the image
  vec3 sunDir() {
    float az = uLight + 0.7 * sin(TAU * uT) + 0.15 * sin(TAU * 2.0 * uT + 1.3);
    float el = 0.8 + 0.25 * sin(TAU * uT + 2.1);
    return normalize(vec3(cos(az), sin(az), el));
  }
  // warm light breaking through drifting cloud gaps, cool shade elsewhere
  float sunPool(vec2 rq) { return smoothstep(0.32, 0.72, pfbm(rq * 1.3 + vec2(0.0, 5.1) - vec2(2.0 * uT, 0.0), vec2(2.0, 1000.0))); }
  vec3 poolTint(float sun) { return mix(vec3(0.74, 0.84, 0.72), vec3(1.25, 1.2, 0.98), sun); }
  // relight the hills: normals from the ridge and clump heights, compared
  // with how the image was lit to begin with
  float relight(vec2 uv) {
    vec2 px = 5.0 / uRes;
    vec4 l = texture(tMap, uv - vec2(px.x, 0.0)), r = texture(tMap, uv + vec2(px.x, 0.0));
    vec4 d = texture(tMap, uv - vec2(0.0, px.y)), u = texture(tMap, uv + vec2(0.0, px.y));
    vec3 N = normalize(vec3((l.r - r.r) * 7.0 + (l.g - r.g) * 2.5, (d.r - u.r) * 7.0 + (d.g - u.g) * 2.5, 1.0));
    vec3 L0 = normalize(vec3(cos(uLight), sin(uLight), 0.75));
    return clamp((0.3 + max(dot(N, sunDir()), 0.0)) / (0.3 + max(dot(N, L0), 0.0)), 0.5, 2.0);
  }`;

const STRAND_VS = /* glsl */`
  ${COMMON}
  attribute vec2 aStrand;  // x: side (-1 | 1), y: segment index 0..SEG
  attribute vec2 aRoot;    // root, in uv
  attribute vec4 aParam;   // length px, width px, own phase, rest curl
  attribute float aDepth;
  varying vec2 vRestUv;
  varying vec2 vDir;
  varying float vS, vSide, vGust;
  const int SEG = ${SEG};

  void main() {
    vec4 m = texture(tMap, aRoot);
    vec2 q = isoOf(aRoot), rq = windFrame(q);

    // texture direction, signed downwind; where the image has no clear
    // direction, strands follow the wind with a little scatter
    vec2 sv = m.ba * 2.0 - 1.0;
    float th = 0.5 * atan(sv.y, sv.x);
    vec2 d = vec2(cos(th), sin(th));
    if (dot(d, uWind) < 0.0) d = -d;
    float windAng = atan(uWind.y, uWind.x);
    float combed = length(sv) > 1e-4 ? atan(d.y, d.x) : windAng;   // atan(0, 0) is undefined
    float base = mix(windAng + (fract(aParam.z * 0.731) - 0.5) * 0.9, combed, smoothstep(0.04, 0.3, length(sv)));

    // ---- the school: one heading field turns whole regions together.
    // A broad turning wave sweeps downwind, sub-schools drift through it and
    // turn at their own moments, the whole field leans left and right, and
    // each strand adds a small motion of its own
    float sub = pfbm(rq * 2.2 - vec2(8.0 * uT, 0.0), vec2(4.0, 1000.0)) * 2.0 - 1.0;
    float lean = 0.3 * sin(TAU * uT);
    float gust = smoothstep(0.25, 0.9, (0.5 + 0.5 * sin(TAU * 1.6 * rq.x - TAU * 3.0 * uT))
                 * (0.5 + 0.9 * pfbm(rq * 4.0 - vec2(8.0 * uT, 0.0), vec2(8.0, 1000.0))));
    float amp = (1.05 + 0.6 * gust) * uAmp;
    float own = 0.12 * sin(TAU * 6.0 * uT + aParam.z) + 0.06 * sin(TAU * 9.0 * uT + aParam.z * 1.7);
    float L = aParam.x * (0.8 + 0.5 * m.g), W = aParam.y;

    int seg = int(aStrand.y + 0.5);
    float sHere = aStrand.y / float(SEG);
    vec2 pos = aRoot * uRes, rest = pos;
    float angHere = base, restHere = base;
    for (int i = 0; i <= SEG; i++) {
      float s = i == seg ? sHere : (float(i) + 0.5) / float(SEG);
      // the tip lags the root, so each turn whips up the strand
      float wave = sin(TAU * (1.25 * rq.x + 0.3 * rq.y) - TAU * 3.0 * (uT - 0.03 * s) + 2.0 * sub);
      float heading = 0.62 * wave + 0.38 * sub + lean;
      // capped so a strand never folds back over its own root
      float bend = clamp(heading * amp + own, -1.45, 1.45) * pow(s, 1.1);
      float ra = base + aParam.w * s;
      if (i == seg) { angHere = ra + bend; restHere = ra; break; }
      pos += vec2(cos(ra + bend), sin(ra + bend)) * L / float(SEG);
      rest += vec2(cos(ra), sin(ra)) * L / float(SEG);
    }
    vec2 dir = vec2(cos(angHere), sin(angHere)), rdir = vec2(cos(restHere), sin(restHere));
    float side = 0.5 * W * (1.0 - 0.85 * sHere) * aStrand.x;
    pos += vec2(-dir.y, dir.x) * side;
    rest += vec2(-rdir.y, rdir.x) * side;

    vRestUv = rest / uRes;
    vDir = dir; vS = sHere; vSide = aStrand.x; vGust = gust;
    // taller clumps draw over the hollows
    float z = 0.9 - 0.85 * (0.65 * m.g + 0.35 * aDepth);
    gl_Position = vec4(pos / uRes * 2.0 - 1.0, z, 1.0);
  }`;

const STRAND_FS = /* glsl */`
  ${COMMON}
  varying vec2 vRestUv;
  varying vec2 vDir;
  varying float vS, vSide, vGust;
  void main() {
    // MSAA samples can extrapolate varyings past the strand; pow() of a
    // negative s would be NaN
    float s = clamp(vS, 0.0, 1.0);
    // the strand carries the image it covered at rest
    vec3 c = toLin(texture(tImg, vRestUv).rgb);
    c *= mix(0.72, 1.18, pow(s, 0.6)) * (1.0 - 0.22 * vSide * vSide);  // darker roots, rounded edges
    vec2 uv = gl_FragCoord.xy / uRes;
    float sun = sunPool(windFrame(isoOf(uv)));
    c *= mix(1.0, relight(vRestUv), 0.7) * poolTint(sun);

    // anisotropic glint: a strand lights up when it turns across the sun,
    // so turning regions flash together like a school of fish
    vec3 T = normalize(vec3(vDir, 0.55));
    vec3 H = normalize(sunDir() + vec3(0.0, 0.0, 1.0));
    float th = dot(T, H);
    float glint = pow(sqrt(max(0.0, 1.0 - th * th)), 70.0) * smoothstep(0.2, 1.0, s);
    vec3 lightCol = vec3(1.0, 0.94, 0.7) * (0.35 + 0.65 * sun);
    c += lightCol * glint * (0.25 + 0.6 * vGust) * (0.3 + dot(c, vec3(2.0)));
    // sheen where gusts flatten the strands, tinted by the image's own colour
    c += uSheen * vGust * sun * s * 0.6;
    gl_FragColor = vec4(c, 1.0);
  }`;

// Direction pass for the ASCII layer: each strand writes its current heading
// as a doubled-angle vector (so opposite headings agree), weighted toward
// the tip where the sway is largest.
const DIR_FS = /* glsl */`
  varying vec2 vDir;
  varying float vS;
  void main() {
    float w = 0.4 + clamp(vS, 0.0, 1.0);
    gl_FragColor = vec4(vec2(vDir.x * vDir.x - vDir.y * vDir.y, 2.0 * vDir.x * vDir.y) * w, w, 1.0);
  }`;

// the darker undergrowth that shows through the gaps between strands
const GROUND_FS = /* glsl */`
  ${COMMON}
  varying vec2 vUv;
  void main() {
    vec3 c = toLin(textureLod(tImg, vUv, 1.5).rgb) * 0.62;
    c *= poolTint(sunPool(windFrame(isoOf(vUv))));
    gl_FragColor = vec4(c, 1.0);
  }`;

export const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }';

function strandGeometry(rand, W, H, density) {
  const count = Math.round(REF_STRANDS * density * (W * H) / (REF_W * REF_H));
  const scale = Math.sqrt((W * H) / (REF_W * REF_H)); // strand size follows the frame
  const base = [];
  for (let i = 0; i <= SEG; i++) base.push(-1, i, 1, i);
  const index = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('aStrand', new THREE.Float32BufferAttribute(base, 2));
  // a dummy position so three can count vertices; the shader builds the strand
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const root = new Float32Array(count * 2), param = new Float32Array(count * 4), depth = new Float32Array(count);
  // stratified jitter so coverage is even, overshooting the frame a little
  const cols = Math.ceil(Math.sqrt(count * (W / H))), rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const cx = i % cols, cy = Math.floor(i / cols) % rows;
    root[i * 2] = -0.04 + ((cx + rand()) / cols) * 1.06;
    root[i * 2 + 1] = -0.03 + ((cy + rand()) / rows) * 1.05;
    param.set([(48 + 62 * rand()) * scale, (3.0 + 2.4 * rand()) * scale / Math.sqrt(density), rand() * TAU, (rand() - 0.5) * 0.6], i * 4);
    depth[i] = rand();
  }
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root, 2));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(param, 4));
  geo.setAttribute('aDepth', new THREE.InstancedBufferAttribute(depth, 1));
  geo.instanceCount = count;
  return { geo, count };
}

// opts: { image, maps, width, height, wind (rad), light (rad), amp, density }
export function buildField(renderer, opts) {
  const { width: W, height: H } = opts;
  const photo = new THREE.Texture(opts.image);
  photo.minFilter = THREE.LinearMipmapLinearFilter;
  photo.generateMipmaps = true;
  photo.needsUpdate = true;
  const uniforms = {
    tImg: { value: photo }, tMap: { value: opts.maps.tex },
    uRes: { value: new THREE.Vector2(W, H) }, uT: { value: 0 },
    uWind: { value: new THREE.Vector2(Math.cos(opts.wind), Math.sin(opts.wind)) },
    uLight: { value: opts.light }, uAmp: { value: opts.amp },
    uSheen: { value: new THREE.Vector3(...opts.maps.tint).multiplyScalar(0.36) },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VS, fragmentShader: GROUND_FS, depthWrite: false,
  }));
  ground.renderOrder = -1;
  const colorMat = new THREE.ShaderMaterial({ uniforms, vertexShader: STRAND_VS, fragmentShader: STRAND_FS, side: THREE.DoubleSide });
  const dirMat = new THREE.ShaderMaterial({ uniforms, vertexShader: STRAND_VS, fragmentShader: DIR_FS, side: THREE.DoubleSide });
  const { geo, count } = strandGeometry(mulberry32(640), W, H, opts.density);
  const strands = new THREE.Mesh(geo, colorMat);
  for (const m of [ground, strands]) { m.frustumCulled = false; scene.add(m); }

  // the same strands in the same pose, writing headings instead of colour
  function renderDirection(target) {
    strands.material = dirMat;
    ground.visible = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    strands.material = colorMat;
    ground.visible = true;
  }
  return { scene, camera, count, update: (t) => { uniforms.uT.value = t; }, renderDirection };
}
