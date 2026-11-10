// Build a browser-only GitHub Pages edition without changing the local MP4 exporter.
// The local server is still required for PNG frame capture and ffmpeg encoding.
import { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = 'pages-dist';
mkdirSync(out, { recursive: true });
mkdirSync(path.join(out, 'src'), { recursive: true });
mkdirSync(path.join(out, 'examples'), { recursive: true });
mkdirSync(path.join(out, 'vendor'), { recursive: true });

for (const file of ['ascii.js', 'field.js', 'font5x7.js', 'main.js', 'maps.js', 'post.js']) {
  copyFileSync(path.join('src', file), path.join(out, 'src', file));
}
copyFileSync('examples/grass.png', path.join(out, 'examples/grass.png'));
copyFileSync('node_modules/three/build/three.module.js', path.join(out, 'vendor/three.module.js'));

const indexSource = readFileSync('index.html', 'utf8');
const index = indexSource
  .replaceAll('/node_modules/three/build/three.module.js', './vendor/three.module.js')
  .replaceAll('src="/src/main.js"', 'src="./src/main.js"');
if (index === indexSource || !index.includes('./vendor/three.module.js') || !index.includes('./src/main.js')) {
  throw new Error('Could not rewrite index.html imports for Pages');
}
writeFileSync(path.join(out, 'index.html'), index);

const mainSource = readFileSync(path.join(out, 'src/main.js'), 'utf8');
const beforeImage = "await loadImage(`/${imgPath.replace(/^\\/+/, '')}`)";
const afterImage = "await loadImage(new URL(imgPath.replace(/^\\/+/, ''), document.baseURI).href)";
if (!mainSource.includes(beforeImage)) throw new Error('Expected sample-image path not found');
let main = mainSource.replace(beforeImage, afterImage);
main = main.replace(
  /if \(q\.has\('export'\)\) \{\s*const modes = q\.get\('export'\)\.split\(','\)\.filter\(\(m\) => MODES\.includes\(m\)\);\s*exportLoop\(modes\.length \? modes : \['ascii'\]\)\.catch\(\(e\) => \{ console\.error\(e\); hud\.textContent = String\(e\); document\.title = 'failed'; \}\);\s*\} else \{/,
  "if (q.has('export')) { hud.textContent = 'MP4 encoding requires the local server (npm start).'; } else {"
);
if (main.includes("exportLoop(modes.length ? modes")) throw new Error('Browser-only export guard failed');
writeFileSync(path.join(out, 'src/main.js'), main);
writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Built static living-ascii demo at', out);
