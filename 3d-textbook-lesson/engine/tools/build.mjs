// 建置：esbuild 打包成 app.js（傳統 script，可由 file:// 開啟）→ 字型子集
// 用法：node tools/build.mjs
// 環境變數：NODE_MODULES（含 three、n8ao、esbuild 的 node_modules，必要）、FONT_DIR（字型來源）、
//          FIGS=fig5-1,fig5-2 只打包指定的圖模組、OUTDIR 輸出到其他資料夾（會一併複製 index.html 與 fonts.js）、
//          SKIP_FONTS=1 略過字型、DEBUG=1 不壓縮
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = process.env.NODE_MODULES;
if (!NM) { console.error('請設定 NODE_MODULES'); process.exit(1); }
const require = createRequire(path.join(NM, 'x.js'));
const esbuild = require('esbuild');

const figDir = path.join(root, 'src', 'figs');
const only = process.env.FIGS ? process.env.FIGS.split(',').map((s) => s.trim() + '.js') : null;
const figs = fs.readdirSync(figDir)
  .filter((f) => /^(fig|tab)[\w.-]*\.js$/.test(f) && (!only || only.includes(f)))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const outDir = process.env.OUTDIR ? path.resolve(process.env.OUTDIR) : root;
fs.mkdirSync(outDir, { recursive: true });

// 虛擬的圖模組索引（不寫入檔案，避免平行建置互相覆蓋）
const figIndex = {
  name: 'fig-index',
  setup(b) {
    b.onResolve({ filter: /figs[\\/]index\.js$/ }, () => ({ path: 'figs-index', namespace: 'figidx' }));
    b.onLoad({ filter: /.*/, namespace: 'figidx' }, () => ({
      contents: figs.map((f, i) => `import f${i} from ${JSON.stringify(path.join(figDir, f).replace(/\\/g, '/'))};`).join('\n')
        + `\nexport default [${figs.map((_, i) => 'f' + i).join(', ')}];\n`,
      resolveDir: figDir, loader: 'js',
    }));
  },
};

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true, format: 'iife', minify: !process.env.DEBUG, sourcemap: false, target: 'es2020',
  nodePaths: [NM], outfile: path.join(outDir, 'app.js'), legalComments: 'eof', logLevel: 'warning',
  plugins: [figIndex],
});
if (outDir !== root) {
  fs.copyFileSync(path.join(root, 'index.html'), path.join(outDir, 'index.html'));
  // 還沒做過完整建置時沒有 fonts.js：先放空的，畫面會暫時用系統字型
  if (fs.existsSync(path.join(root, 'fonts.js'))) fs.copyFileSync(path.join(root, 'fonts.js'), path.join(outDir, 'fonts.js'));
  else fs.writeFileSync(path.join(outDir, 'fonts.js'), 'window.__FONTS={};\n');
}
console.log(path.join(outDir, 'app.js'), (fs.statSync(path.join(outDir, 'app.js')).size / 1024).toFixed(0), 'KB;', figs.length, 'modules:', figs.join(' '));
if (!process.env.SKIP_FONTS && outDir === root) {
  execFileSync('python', [path.join(root, 'tools', 'fonts.py')], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
}
