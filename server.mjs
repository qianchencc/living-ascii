// Local server: serves the page, receives rendered PNG frames, and encodes
// them into an MP4 with the bundled ffmpeg once a loop is complete.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const PORT = Number(process.env.PORT || 5177);
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const safeTag = (t) => (t || 'loop').replace(/[^a-z0-9_-]/gi, '');

function encode(tag, fps) {
  const file = path.join(OUT, `${tag}.mp4`);
  const args = ['-y', '-framerate', String(fps), '-i', path.join(OUT, tag, 'f_%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file];
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args);
    let log = '';
    p.stderr.on('data', (d) => { log += d; });
    p.on('close', (code) => resolve({ code, file: path.relative(ROOT, file), log: log.slice(-800) }));
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'POST' && url.pathname === '/frame') {
      const dir = path.join(OUT, safeTag(url.searchParams.get('tag')));
      const i = Number(url.searchParams.get('i'));
      if (i === 0) fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `f_${String(i).padStart(4, '0')}.png`), await readBody(req));
      res.end('ok');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/encode') {
      const result = await encode(safeTag(url.searchParams.get('tag')), Number(url.searchParams.get('fps') || 30));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p) p = 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404; res.end('not found'); return;
    }
    res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.statusCode = 500; res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`living-ascii → http://localhost:${PORT}`));
