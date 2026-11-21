// 無頭瀏覽器截圖檢查：node tools/shot.mjs 腳本.mjs 輸出資料夾
// 腳本匯出 async function run({ page, shot, eval: ev }) 依序操作並截圖
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.env.NODE_MODULES, 'x.js'));
const { chromium } = require('playwright-core');
const [script, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const exe = process.env.CHROME || chromium.executablePath(); // 沒裝 Playwright 的 Chromium 時，用 CHROME 指定瀏覽器執行檔
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files'], headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, offline: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const url = pathToFileURL(path.join(process.env.ROOT ? path.resolve(process.env.ROOT) : root, 'index.html')).href + (process.env.Q ?? '?fast');
await page.goto(url);
if (!process.env.NOWAIT) await page.waitForFunction(() => window.book && window.book.app && window.book.app.ready, null, { timeout: 120000 });
else await page.waitForFunction(() => window.book && window.book.app && window.book.app.stage, null, { timeout: 120000 });
let n = 0;
const shot = async (name, opts = {}) => { const f = path.join(outDir, `${String(++n).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f, ...opts }); return f; };
const ev = (fn, arg) => page.evaluate(fn, arg);
const mod = await import(pathToFileURL(path.resolve(script)).href);
try { await mod.run({ page, shot, eval: ev, wait: (ms) => page.waitForTimeout(ms) }); }
catch (e) { logs.push('[script] ' + e.stack); }
fs.writeFileSync(path.join(outDir, 'console.txt'), logs.join('\n'));
console.log(logs.length ? logs.slice(0, 30).join('\n') : 'console clean');
await browser.close();
