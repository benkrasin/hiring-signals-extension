// Builds a store screenshot (1280x800) of the real popup code with live data.
// 1) writes tools/_popup-harness.html: popup.html with a tiny chrome.* stub that
//    pretends the active tab is https://<domain>/ (no extension APIs needed)
// 2) writes tools/_screenshot.html: 1280x800 marketing frame embedding the harness
// 3) serves the extension dir on localhost and captures with headless Chrome.
// Usage: node tools/build-screenshot.mjs [domain]   (default stripe.com)
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const domain = process.argv[2] || 'stripe.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const stub = `<script>
window.chrome = {
  tabs: { query: async () => [{ id: 1, url: 'https://${domain}/' }] },
  scripting: { executeScript: async () => [{ result: [] }] },
};
</script>`;
let popup = readFileSync(join(root, 'popup.html'), 'utf8')
  .replace('href="popup.css"', 'href="../popup.css"')
  .replace('src="icons/icon32.png"', 'src="../icons/icon32.png"')
  .replace('<script type="module" src="popup.js"></script>', `${stub}\n<script type="module" src="../popup.js"></script>`);
writeFileSync(join(root, 'tools/_popup-harness.html'), popup);

writeFileSync(join(root, 'tools/_screenshot.html'), `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{background:linear-gradient(135deg,#0b5e53 0%,#0f7b6c 55%,#18a08c 100%);display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;color:#fff}
.copy{flex:1}
.copy img{width:72px;height:72px;margin-bottom:22px}
h1{font-size:50px;line-height:1.08;margin:0 0 18px;letter-spacing:-.02em}
p{font-size:21px;line-height:1.5;margin:0 0 12px;opacity:.92;max-width:560px}
ul{margin:20px 0 0;padding:0;list-style:none;font-size:18px;line-height:1.9;opacity:.95}
ul li:before{content:"✓  ";color:#ffc43d;font-weight:700}
.frame{width:400px;height:600px;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 30px 70px rgba(0,0,0,.35)}
iframe{border:0;width:400px;height:600px;display:block}
</style></head><body>
<div class="copy">
  <img src="../icons/icon128.png" alt="">
  <h1>Who's hiring — and for what?</h1>
  <p>Open the popup on any company's website to see its open roles straight from Greenhouse, Lever, Ashby, Workable and SmartRecruiters.</p>
  <ul><li>Open roles by function: engineering, sales, data &amp; AI…</li><li>Remote share and newest posting date</li><li>One-click links to apply, plus free CSV export</li></ul>
</div>
<div class="frame"><iframe src="_popup-harness.html"></iframe></div>
</body></html>`);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const f = join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  let body;
  try { body = readFileSync(f); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/tools/_screenshot.html`;
const out = join(root, 'store-assets/screenshot-1280x800.png');
try {
  await new Promise((resolve, reject) => {
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--window-size=1280,800', '--virtual-time-budget=20000', `--screenshot=${out}`, url], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`))));
  });
  console.log('wrote', out);
} finally {
  server.close();
}
