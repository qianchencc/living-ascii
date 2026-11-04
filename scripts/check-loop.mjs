// Checks that a loop is seamless: the jump from the last frame back to the
// first should be no bigger than an ordinary step between two frames.
//   node scripts/check-loop.mjs out/grass-ascii        (frame folder, exact)
//   node scripts/check-loop.mjs out/grass-ascii.mp4    (encoded video)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const target = process.argv[2];
if (!target) { console.error('usage: node scripts/check-loop.mjs <frames-folder | video.mp4>'); process.exit(2); }

const run = (args) => spawnSync(ffmpeg, ['-hide_banner', ...args], { encoding: 'utf8' }).stderr;
const psnr = (a, b) => Number((run(['-i', a, '-i', b, '-lavfi', '[0:v][1:v]psnr', '-f', 'null', '-'])
  .match(/average:([\d.]+|inf)/) || [])[1]);

let frames;
if (fs.statSync(target).isDirectory()) {
  frames = fs.readdirSync(target).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(target, f));
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loopcheck-'));
  run(['-i', target, path.join(tmp, 'f_%04d.png')]);
  frames = fs.readdirSync(tmp).sort().map((f) => path.join(tmp, f));
}
if (frames.length < 3) { console.error('need at least 3 frames'); process.exit(2); }

const seam = psnr(frames.at(-1), frames[0]);
const steps = [0, Math.floor(frames.length / 2)].map((i) => psnr(frames[i], frames[i + 1]));
const typical = Math.min(...steps);
console.log(`last → first : ${seam.toFixed(2)} dB`);
console.log(`typical step : ${steps.map((s) => s.toFixed(2)).join(' / ')} dB`);
// higher PSNR = smaller change; allow the seam to be a little worse than the worst ordinary step
const ok = seam >= typical - 1;
console.log(ok ? '✓ seamless' : '✗ visible jump at the loop point');
process.exit(ok ? 0 : 1);
