// 交付前驗收：用無頭瀏覽器離線開啟 index.html，以真實的滑鼠與鍵盤操作全書，逐項判定通過與否。
// 用法：node tools/check.mjs [輸出資料夾]      （先用 tools/build.mjs 完整建置，不要帶 SKIP_FONTS）
// 環境變數：NODE_MODULES（含 playwright-core，必要）、CHROME（瀏覽器執行檔，選用）、
//          W、H（視窗大小，預設 1920×1080）、
//          ROOT（改為檢查本章用 OUTDIR 建到別處的版本；原始碼與字型報告仍以本章資料夾為準，不能拿來檢查別的章）、
//          SPR=3-5 只跑部分跨頁（除錯用；交付前要跑全書）、SHOTS=0 不截圖、
//          ONLY=overflow 只檢查版面溢出（還沒有圖模組時用）、REAL=0 略過最後的正常速度測試（除錯用）
// 結果：畫面印出每一項的通過／未通過，並寫入 輸出資料夾/report.txt 與 report.json；有任何一項未通過時結束碼為 1。
// 大部分項目在 ?fast 模式下跑（動畫瞬間完成、停留時間縮短）；最後另外用正常速度播一段示範，量每一步實際停留多久。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.ROOT ? path.resolve(process.env.ROOT) : toolRoot;
const outDir = path.resolve(process.argv[2] || path.join(toolRoot, 'check-out'));
fs.mkdirSync(outDir, { recursive: true });
if (!process.env.NODE_MODULES) { console.error('請設定 NODE_MODULES'); process.exit(2); }
const require = createRequire(path.join(process.env.NODE_MODULES, 'x.js'));
const { chromium } = require('playwright-core');
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY || '';
const TOL = 0.01;                     // 鏡頭距離的容許誤差（比例）
const SAFE = { x: 0.92, top: 0.92 };  // 示範主體的畫面範圍（NDC）；下緣另外和桌卡的上緣比較
const CARD_GAP = 0.03;                // 主體下緣可以低於桌卡上緣的容許量（NDC）
const EPS = 0.02;                     // 佔地檢查的容許量（世界單位）
const MIN_TEXT = 16 * H / 1080;       // 模型上要讀的字在畫面上的最小高度（px）：1920×1080 時 16 px，學生顯示器上讀得清楚
const VIEW_NAME = { stereo: '立體', top: '俯視', low: '低角度' };

const results = [];      // { name, ok, detail }
const add = (name, bad, okText = '') => {
  const list = Array.isArray(bad) ? bad : (bad ? [String(bad)] : []);
  results.push({ name, ok: list.length === 0, detail: list.length ? list : okText });
};

// ---------- 1. 打包檔是否為最新、字型是否涵蓋所有用到的字 ----------
{
  const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
    const p = path.join(dir, e.name);
    return Math.max(m, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }, 0);
  const src = newest(path.join(toolRoot, 'src'));
  const stale = ['app.js', 'fonts.js'].filter((f) => !fs.existsSync(path.join(root, f)) || fs.statSync(path.join(root, f)).mtimeMs < src);
  add('打包檔與字型子集比原始碼新', stale.map((f) => `${f} 比 src 舊，請重新建置（不帶 SKIP_FONTS）`));
  const f = path.join(toolRoot, 'fonts-report.json');
  if (!fs.existsSync(f)) add('內嵌字型涵蓋原始碼用到的每個字', ['找不到 fonts-report.json，請先完整建置']);
  else {
    const miss = JSON.parse(fs.readFileSync(f, 'utf8')).missing_everywhere;
    add('內嵌字型涵蓋原始碼用到的每個字', miss ? [`這些字不是每一套內嵌字型都有：${[...miss].join(' ')}`] : []);
  }
}

// ---------- 啟動 ----------
const browser = await chromium.launch({
  executablePath: process.env.CHROME || chromium.executablePath(), headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, offline: true });
let page = await ctx.newPage();
const logs = [];
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
};
watch(page);
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
let shotN = 0;
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(outDir, `${String(++shotN).padStart(3, '0')}-${name}.png`) }); };
const until = async (fn, ms = 6000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(fn, arg)) return true; await wait(60); } return false; };
const near = (a, b) => Math.abs(a - b) <= Math.abs(b) * TOL;
// 鏡頭的實際位置（不是目標值）：先等鏡頭停下，停不下來另外記錄
const unsettled = [];
const cam = async (where = '') => {
  if (!(await until(() => window.book.app.rig.settled(), 5000))) unsettled.push(where || '（未註明）');
  return ev(() => { const r = window.book.app.rig; return { dist: r.cur.dist, el: r.cur.el, target: r.cur.target.toArray(), mode: r.mode, view: r.view, def: r.defaultDist }; });
};
// 鏡頭 c 是否回到 b 那個樣子：模式、距離、位置、仰角都要相同。相同時回傳空字串，不同時回傳說明
const off = (c, b) => {
  const dt = Math.hypot(c.target[0] - b.target[0], c.target[1] - b.target[1], c.target[2] - b.target[2]);
  if (c.mode === b.mode && near(c.dist, b.dist) && dt < 0.02 && Math.abs(c.el - b.el) < 0.5) return '';
  return `模式 ${c.mode}、距離 ${c.dist.toFixed(2)}、仰角 ${c.el.toFixed(0)}°、位置偏了 ${dt.toFixed(2)}（原本：模式 ${b.mode}、距離 ${b.dist.toFixed(2)}、仰角 ${b.el.toFixed(0)}°）`;
};
const demoInfo = () => ev(() => window.book.demoInfo());
const figsNow = () => ev(() => window.book.figs());
const toolbarTop = () => ev(() => document.querySelector('.toolbar').getBoundingClientRect().top);
// 把滑鼠真的移到紙籤上：回傳滑鼠底下是不是這張圖的紙籤（被模型、桌卡或工具列擋住時不是）
const hoverTab = async (id) => {
  const f = (await figsNow()).find((x) => x.id === id);
  if (!f || !f.tab) return { ok: false, why: '紙籤還沒貼上' };
  const tb = await toolbarTop();
  if (f.tab.x < 4 || f.tab.x > W - 4 || f.tab.y < 4 || f.tab.y > tb - 4) return { ok: false, why: '紙籤不在畫面內', off: true };
  await page.mouse.move(6, 6); await wait(40);
  await page.mouse.move(f.tab.x, f.tab.y); await wait(90);
  const on = await ev((i) => window.book.app.hovered?.userData.tabOf === i, id);
  return on ? { ok: true, x: f.tab.x, y: f.tab.y } : { ok: false, why: '紙籤被擋住，滑鼠點不到' };
};
const clickTab = async (id) => { const h = await hoverTab(id); if (h.ok) await page.mouse.click(h.x, h.y); return h; };
const waitStep = (i, ms = 7000) => until((n) => { const d = window.book.demoInfo(); return !!d && d.i === n; }, ms, i);
// 等這一步的動畫做完、鏡頭停妥
// 等示範自己播完。判斷「卡住」看的是進展而不是總時間：步數或階段超過 stallMs 沒有變化才算卡住，
// 電腦一時變慢只會播得久一點，不會被當成卡住。播完回傳 null，否則回傳停在哪裡的說明
const PHASE = { busy: '動畫還沒結束', settle: '鏡頭還沒停妥', hold: '停留中' };
const autoPlay = async (n, stallMs = 20000) => {
  const t0 = Date.now(); let key = '', tk = t0;
  for (;;) {
    const s = await ev(() => { const d = window.book.demoInfo(); return d ? `${d.i}/${d.phase}${d.paused ? '/paused' : ''}` : (window.book.demoLog() ? 'done' : 'none'); });
    if (s === 'done') return null;
    const now = Date.now();
    if (s !== key) { key = s; tk = now; }
    const [i, ph, pz] = key.split('/');
    const where = key === 'none' ? '示範不見了，也沒有留下紀錄' : `停在第 ${+i + 1} 步，${pz ? '被暫停了' : PHASE[ph] || ph}`;
    if (now - tk > stallMs) return `${where}，超過 ${stallMs / 1000} 秒沒有進展`;
    if (now - t0 > n * 30000 + 60000) return `${where}，整段播了超過 ${n * 30 + 60} 秒`;
    await wait(60);
  }
};
const waitIdle = (ms = 9000) => until(() => { const d = window.book.demoInfo(); return !d || (d.phase !== 'busy' && window.book.app.rig.settled()); }, ms);
const endState = () => ev(() => { const a = window.book.app; return { demo: !!a.figures.demo, card: a.ui.deskCard.visible, down: a.figures.active.filter((f) => f.state !== 'up').map((f) => f.id) }; });
// 目前示範步驟的主體在畫面上的範圍，以及桌卡上緣的位置（NDC）
const subjectInfo = () => ev(() => {
  const a = window.book.app, d = a.figures.demo;
  if (!d || d.i < 0) return null;
  const st = d.inst.api.demo[d.i], c = st.cam || {};
  const box = a.figures.subjectBox(d.inst, typeof c.subject === 'function' ? c.subject() : c.subject);
  const V = a.stage.camera.position.constructor;
  let mx = 0, top = -9, bottom = 9;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const q = new V(x, y, z).project(a.stage.camera);
    mx = Math.max(mx, Math.abs(q.x)); top = Math.max(top, q.y); bottom = Math.min(bottom, q.y);
  }
  const el = document.querySelector('.deskcard');
  const cardTop = a.ui.deskCard.visible && el ? 1 - 2 * el.getBoundingClientRect().top / innerHeight : null;
  return { i: d.i, mx, top, bottom, cardTop, card: a.ui.deskCard.visible };
});
const frameBad = (s) => {
  if (s.mx > SAFE.x || s.top > SAFE.top) return `主體超出畫面（左右 ${s.mx.toFixed(2)}、上 ${s.top.toFixed(2)}）`;
  if (s.cardTop !== null && s.bottom < s.cardTop - CARD_GAP) return `主體下緣被桌卡擋住（主體下緣 ${s.bottom.toFixed(2)}、桌卡上緣 ${s.cardTop.toFixed(2)}）`;
  return '';
};
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

let fatal = null, realPick = null;
try {
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?fast');
  await page.waitForFunction(() => window.book && window.book.app && window.book.app.ready, null, { timeout: 120000 });

  // ---------- 2. 版面溢出（一般狀態，以及答案與教師註解都打開的狀態） ----------
  const renderAll = () => ev(() => { const a = window.book.app; for (const p of window.book.pages()) a.pageCanvas(p); return window.book.overflow(); });
  const over = await renderAll();
  await ev(() => { window.book.teacher(true); window.book.answers(true); });
  const overT = await renderAll();
  await ev(() => { window.book.teacher(false); window.book.answers(false); });
  await renderAll();
  const [first, last] = await ev(() => window.book.range());
  const blank = [];
  for (let p = first; p <= last; p++) if (!(p in over)) blank.push(p);
  add('每頁內容都在版面內（一般狀態，以及答案與教師註解打開時）', [
    ...Object.entries(over).filter(([, v]) => v > 0).map(([p, v]) => `第 ${p} 頁超出 ${v.toFixed(1)} pt`),
    ...Object.entries(overT).filter(([p, v]) => v > 0 && !(over[p] > 0)).map(([p, v]) => `第 ${p} 頁在打開答案與教師註解後超出 ${v.toFixed(1)} pt`),
  ], `${Object.keys(over).length} 頁${blank.length ? `；第 ${blank.join('、')} 頁沒有內容，顯示為空白頁，請確認是刻意的` : ''}`);

  // ---------- 3. 「示範」紙籤的排版位置：在紙面上，不壓到圖說、別張圖表或別的紙籤 ----------
  {
    const tr = await ev(() => window.book.tabRects());
    const PTW = 595.276, PTH = 793.701, badTab = [];
    let nTab = 0;
    for (const [p, list] of Object.entries(tr)) {
      for (const a of list) {
        if (!a.tab) { badTab.push(`第 ${p} 頁 ${a.id}：排版沒有留紙籤的位置`); continue; }
        nTab++;
        const t = a.tab;
        if (t.x < 0.5 || t.y < 0.5 || t.x + t.w > PTW - 0.5 || t.y + t.h > PTH - 0.5) badTab.push(`第 ${p} 頁 ${a.id}：紙籤超出紙面`);
        if (!a.capLeft && overlap(t, { x: a.rect.x, y: a.rect.y + 1, w: a.rect.w, h: a.rect.h - 2 })) badTab.push(`第 ${p} 頁 ${a.id}：紙籤壓到自己的圖表`);
        for (const b of list) {
          if (b.cap && overlap(t, b.cap)) badTab.push(`第 ${p} 頁 ${a.id}：紙籤壓到 ${b.id} 的圖說`);
          if (b !== a && overlap(t, b.rect)) badTab.push(`第 ${p} 頁 ${a.id}：紙籤壓到 ${b.id}`);
          if (b !== a && b.tab && a.id < b.id && overlap(t, b.tab)) badTab.push(`第 ${p} 頁 ${a.id} 與 ${b.id} 的紙籤重疊`);
        }
      }
    }
    add('每張圖表的「示範」紙籤都在紙面上，不壓到圖說、別張圖表或別的紙籤', badTab, `${nTab} 張紙籤`);
  }

  if (ONLY === 'overflow') throw { skip: true };

  // ---------- 4. 每個跨頁的每張圖表 ----------
  const nSpreads = await ev(() => window.book.spreads());
  const G = await ev(() => window.book.geom());
  const [A, Z] = (process.env.SPR || `1-${nSpreads}`).split('-').map(Number);
  const bad = { tabView: [], demoRun: [], demoFrame: [], anim: [], auto: [], demoFast: [], text: [], tabEnd: [], demoCam: [], place: [], none: [] };
  const frames = [];
  const textMin = new Map(); // 每張圖每段字在各步驟量到的最小高度
  let figCount = 0, stepCount = 0, tabEndCount = 0, tabEndSkip = 0, pick = null;
  const lowHidden = [];
  for (let sp = A; sp <= Z; sp++) {
    await ev((i) => window.book.spread(i), sp);
    await until(() => { const f = window.book.figs(); return window.book.app.figures.active.every((x) => x.raised) && f.every((x) => x.tab || !x.steps); }, 12000);
    await wait(500);
    await shot(`s${sp}`);
    const figs = await figsNow();
    const ids = figs.map((f) => f.id);
    const c0 = await cam(`跨頁${sp}`);
    // 模型升起後的佔地：不跨過書溝、不超出書頁、彼此不重疊
    const boxes = await ev(() => { const a = window.book.app; return a.figures.active.map((f) => { const b = a.figures.subjectBox(f); return { id: f.id, side: f.side, x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z }; }); });
    for (const b of boxes) {
      const t = `跨頁${sp} ${b.id}`;
      if (b.side === 'L' ? b.x1 > EPS : b.x0 < -EPS) bad.place.push(`${t}：伸進書溝`);
      if (b.x0 < -G.pageW - EPS || b.x1 > G.pageW + EPS || b.z0 < -G.pageH / 2 - EPS || b.z1 > G.pageH / 2 + EPS) bad.place.push(`${t}：超出書頁`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      if (Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > EPS && Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0) > EPS) bad.place.push(`跨頁${sp} ${p.id} 與 ${q.id} 的佔地重疊`);
    }
    for (const f of figs) if (!f.steps) bad.none.push(`跨頁${sp} ${f.id}：沒有示範`);
    const demos = figs.filter((f) => f.steps);
    if (!pick && demos.length >= 2 && demos.some((f) => f.steps >= 3)) pick = { sp, id: demos.find((f) => f.steps >= 3).id, first: demos[0].id, second: demos[1].id };
    if (!realPick || demos.some((f) => f.steps >= 2 && f.steps < realPick.steps)) { const f = demos.filter((x) => x.steps >= 2).sort((a, b) => a.steps - b.steps)[0]; if (f && (!realPick || f.steps < realPick.steps)) realPick = { sp, id: f.id, steps: f.steps }; }

    // 三種視角（預設距離）：每張紙籤都看得到、滑鼠點得到
    for (const v of ['top', 'low', 'stereo']) {
      await page.click(`.toolbar [data-view=${v}]`); await cam(`跨頁${sp} 視角${v}`); await wait(200);
      for (const f of demos) {
        const h = await hoverTab(f.id);
        if (h.ok) continue;
        // 低角度時，立著的模型本來就會擋住它後面的紙面：只記錄、不算未通過（老師可按 Enter 或換視角）
        if (v === 'low' && !h.off) lowHidden.push(`${f.id}`);
        else bad.tabView.push(`跨頁${sp} ${f.id}：${VIEW_NAME[v]}視角下${h.why}`);
      }
      if (v !== 'stereo') await shot(`s${sp}-${v}`);
    }

    for (const f of demos) {
      const id = f.id, n = f.steps;
      figCount++;
      const tag = `跨頁${sp} ${id}`;
      const before = await cam(`${tag} 示範前`);
      let o;

      // 第一輪：點紙籤開始，立刻按空白鍵暫停，再用 → 一步一步檢查
      let h = await clickTab(id);
      if (!h.ok || !(await waitStep(0))) { bad.demoRun.push(`${tag}：點紙籤後示範沒有開始${h.ok ? '' : `（${h.why}）`}`); await ev(() => window.book.endDemo()); await wait(1200); continue; }
      await page.keyboard.press(' ');
      for (let i = 0; i < n; i++) {
        stepCount++;
        await waitIdle();
        const d = await demoInfo();
        if (!d || d.i !== i) { bad.demoRun.push(`${tag}：第 ${i + 1} 步沒有到位${d ? `（停在第 ${d.i + 1} 步）` : '（示範已結束）'}`); break; }
        if (!d.paused) bad.demoRun.push(`${tag}：第 ${i + 1} 步，按空白鍵後沒有保持暫停`);
        if (d.stuck || d.phase === 'busy') bad.anim.push(`${tag}：第 ${i + 1} 步的 do 回傳的 Promise 一直沒有結束`);
        await wait(250);
        const s = await subjectInfo();
        if (!s) { bad.demoRun.push(`${tag}：第 ${i + 1} 步取不到主體`); break; }
        if (!s.card) bad.demoRun.push(`${tag}：第 ${i + 1} 步沒有桌卡`);
        frames.push({ sp, id, step: i + 1, mx: +s.mx.toFixed(3), top: +s.top.toFixed(3), bottom: +s.bottom.toFixed(3), cardTop: s.cardTop === null ? null : +s.cardTop.toFixed(3) });
        const fb = frameBad(s); if (fb) bad.demoFrame.push(`${tag}：第 ${i + 1} 步${fb}`);
        for (const t of await ev(() => window.book.textSizes())) {
          const key = `${tag}\u0001${t.kind}\u0001${t.text.replace(/\n/g, '／')}`;
          const m = textMin.get(key) || { px: 1e9, steps: [] };
          if (t.px < MIN_TEXT) m.steps.push(i + 1);
          m.px = Math.min(m.px, t.px); textMin.set(key, m);
        }
        await shot(`s${sp}-${id}-d${i + 1}`);
        await page.keyboard.press('ArrowRight'); await wait(120);
      }
      await until(() => !window.book.demoInfo(), 3000); await wait(1300);
      let end = await endState();
      if (end.demo || end.card) { bad.demoRun.push(`${tag}：最後一步後示範沒有結束或桌卡沒有收起`); await ev(() => window.book.endDemo()); await wait(1300); }
      const after = await cam(`${tag} 示範後`);
      if ((o = off(after, before))) bad.demoCam.push(`${tag}：逐步走完後，鏡頭${o}`);

      // 第二輪：點紙籤之後完全不碰，示範要自己從第一步播到最後一步並結束
      await ev(() => window.book.clearDemoLog()); // 清掉上一輪的紀錄，這一輪必須自己留下新的
      h = await clickTab(id);
      if (!h.ok) bad.auto.push(`${tag}：第二次點紙籤，${h.why}`);
      else if (!(await until((i) => window.book.demoInfo()?.id === i, 5000, id))) bad.auto.push(`${tag}：第二次點紙籤後示範沒有開始`);
      else {
        const stalled = await autoPlay(n);
        if (stalled) { bad.auto.push(`${tag}：沒有自己播完（${stalled}）`); await ev(() => window.book.endDemo()); }
        else {
          const log = await ev(() => window.book.demoLog());
          if (log.map((r) => r.i).join() !== Array.from({ length: n }, (_, i) => i).join()) bad.auto.push(`${tag}：自動播放的步驟順序是 ${log.map((r) => r.i + 1).join('→')}，應為 1 到 ${n}`);
          for (const r of log) if (r.stuck) bad.anim.push(`${tag}：自動播放時第 ${r.i + 1} 步的動畫沒有結束，是引擎強制往下走的`);
        }
        await wait(1400);
        end = await endState();
        if (end.card) bad.auto.push(`${tag}：播完後桌卡沒有收起`);
        if (end.down.length) bad.auto.push(`${tag}：播完後這些模型沒有升回來：${end.down.join('、')}`);
        const c = await cam(`${tag} 自動播完`);
        if ((o = off(c, before))) bad.auto.push(`${tag}：播完後鏡頭${o}`);
      }

      // 第三輪：暫停後不等動畫，連續快按到最後一步，再按 Esc 結束
      if (n >= 2) {
        h = await clickTab(id);
        if (h.ok && await waitStep(0)) {
          await page.keyboard.press(' ');
          for (let i = 1; i < n; i++) { await page.keyboard.press('ArrowRight'); await wait(220); }
          await wait(600); await waitIdle(); await wait(900); await waitIdle();
          const s = await subjectInfo();
          if (!s || s.i !== n - 1) bad.demoFast.push(`${tag}：連續快按後沒有停在最後一步`);
          else { const fb = frameBad(s); if (fb) { bad.demoFast.push(`${tag}：連續快按到最後一步，${fb}`); await shot(`s${sp}-${id}-fast`); } }
          await page.keyboard.press('Escape'); await wait(1500);
          end = await endState();
          if (end.demo || end.card) { bad.demoFast.push(`${tag}：快按後按 Esc，示範沒有結束`); await ev(() => window.book.endDemo()); await wait(1300); }
          const c = await cam(`${tag} 快按後`);
          if ((o = off(c, before))) bad.demoFast.push(`${tag}：快按後按 Esc，鏡頭${o}`);
        } else { bad.demoFast.push(`${tag}：第三次點紙籤後示範沒有開始`); await ev(() => window.book.endDemo()); await wait(1300); }
      }

      // 第四輪：示範中紙籤變成「結束」，再點一次就結束（鏡頭拉近後紙籤不在畫面內的圖略過，那時用 Esc）
      h = await clickTab(id);
      if (h.ok && await waitStep(0)) {
        await page.keyboard.press(' '); await waitIdle(); await wait(200);
        const h2 = await hoverTab(id);
        if (h2.ok) {
          tabEndCount++;
          await page.mouse.click(h2.x, h2.y);
          if (!(await until(() => !window.book.demoInfo(), 2500))) { bad.tabEnd.push(`${tag}：示範中點紙籤沒有結束`); await shot(`s${sp}-${id}-tabend`); }
        } else tabEndSkip++;
        if (await demoInfo()) await page.keyboard.press('Escape');
        await wait(1400);
        if ((await endState()).demo) { await ev(() => window.book.endDemo()); await wait(1300); }
      } else { bad.tabEnd.push(`${tag}：第四次點紙籤後示範沒有開始`); await ev(() => window.book.endDemo()); await wait(1300); }
      const c1 = await cam(`${tag} 全部測完`);
      if ((o = off(c1, c0))) bad.demoCam.push(`${tag}：四輪測完後，鏡頭${o}`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(frames));
  // 字高：標籤與讀數牌的字太小算未通過；其他畫面貼圖裡的字（多半是軟體畫面的示意文字）只列出來供判斷
  const texts = [...textMin].map(([key, m]) => { const [tag, kind, text] = key.split('\u0001'); return { tag, kind, text, px: m.px, steps: [...new Set(m.steps)] }; });
  fs.writeFileSync(path.join(outDir, 'text.json'), JSON.stringify(texts, null, 1));
  const small = texts.filter((t) => t.steps.length).sort((a, b) => a.px - b.px);
  const KIND = { label: '標籤', plaque: '讀數牌' };
  for (const t of small) if (t.kind !== 'screen') bad.text.push(`${t.tag}：${KIND[t.kind]}「${t.text}」只有 ${t.px} px（第 ${t.steps.join('、')} 步）`);
  const smallScr = small.filter((t) => t.kind === 'screen');
  const read = texts.filter((t) => t.kind !== 'screen');
  add(`示範每一步，模型上的標籤與讀數牌的字在畫面上不小於 ${MIN_TEXT.toFixed(0)} px`, bad.text,
    `${read.length} 段字，最小 ${read.length ? Math.min(...read.map((t) => t.px)) : '－'} px${smallScr.length ? `；畫面貼圖裡另有 ${smallScr.length} 段字小於 ${MIN_TEXT.toFixed(0)} px（最小 ${smallScr[0].px} px，清單在 text.json），其中要學生讀的字請放大` : ''}`);
  add('頁面上的每張圖都有對應的模組', (await ev(() => window.book.missingFigs())).map((id) => `${id} 沒有模組（src/figs/${id}.js）`));
  add('每張圖表都有示範', bad.none, `${figCount} 張圖表`);
  add('模型升起後不伸進書溝、不超出書頁、彼此不重疊', bad.place, `${figCount} 張圖表`);
  add('立體與俯視視角下每張紙籤都看得到、滑鼠點得到；低角度視角下都在畫面內', bad.tabView, `${figCount} 張紙籤${lowHidden.length ? `；低角度視角下有 ${lowHidden.length} 張被前方立著的模型擋住：${lowHidden.join('、')}` : ''}`);
  add('點一下紙籤示範就開始；暫停後逐步檢查每一步都到位，結束後桌卡收起', bad.demoRun, `${stepCount} 步`);
  add('示範每一步主體完整入鏡，不被桌卡擋住', bad.demoFrame, `${stepCount} 步`);
  add('每一步的動畫都會結束（不會讓自動播放卡住）', bad.anim, `${stepCount} 步`);
  add('點紙籤後不碰任何按鍵，示範自己從第一步播到最後一步並結束，鏡頭回原位、其他模型升回來', bad.auto, `${figCount} 段示範`);
  add('暫停後連續快按到最後一步仍正確，按 Esc 能結束並回到原位', bad.demoFast);
  add('示範中再點一次紙籤（變成「結束」）就結束', bad.tabEnd, `${tabEndCount} 張圖測過${tabEndSkip ? `；${tabEndSkip} 張圖在第一步鏡頭拉近後紙籤不在畫面內，改用 Esc` : ''}`);
  add('示範結束後鏡頭回到示範前的距離', bad.demoCam);

  // ---------- 5. 狀態切換 ----------
  const st = [];
  let stNote = '';
  if (!pick) { stNote = '沒有「同一個跨頁有兩張以上的圖、其中一張示範三步以上」的跨頁，未測試按鍵與桌卡的狀態切換'; }
  else {
    await ev((i) => window.book.spread(i), pick.sp);
    await until(() => window.book.figs().every((x) => x.tab || !x.steps), 12000); await wait(600);
    await ev(() => { window.book.home(); window.book.app.figures.lastDemo = null; }); await wait(1200);
    const c0 = await cam('狀態切換開始');
    let d, c;
    // 平時按 Enter → 示範這個跨頁的第一張圖；示範中再按 Enter → 換下一張圖
    await page.keyboard.press('Enter'); await waitStep(0);
    d = await demoInfo();
    if (!d || d.id !== pick.first) st.push(`平時按 Enter：應開始示範 ${pick.first}，實際 ${d ? d.id : '沒有開始'}`);
    await page.keyboard.press('Enter'); await wait(300); await waitStep(0);
    d = await demoInfo();
    if (!d || d.id !== pick.second) st.push(`示範中按 Enter：應換成 ${pick.second}，實際 ${d ? d.id : '沒有示範'}`);
    await page.keyboard.press('Escape'); await wait(1600);
    c = await cam('Enter 之後按 Esc');
    if ((await endState()).demo || off(c, c0)) st.push(`連按兩次 Enter 再按 Esc：示範${(await endState()).demo ? '仍在' : '已結束'}，鏡頭${off(c, c0) || '已回原位'}`);
    let es = await endState();
    if (es.down.length) st.push(`連按兩次 Enter 再按 Esc：這些模型沒有升回來：${es.down.join('、')}`);

    // 換圖途中就結束：Enter 開始第一張，再按 Enter 換第二張，第一張還在降下時立刻按 Esc → 所有模型都要升回來、鏡頭回原位
    await ev(() => { window.book.app.figures.lastDemo = null; });
    await page.keyboard.press('Enter'); await waitStep(0);
    await page.keyboard.press('Enter'); await wait(60); await page.keyboard.press('Escape'); await wait(2200);
    es = await endState(); c = await cam('換圖途中按 Esc');
    if (es.demo || es.card || es.down.length || off(c, c0)) st.push(`換圖途中按 Esc：${es.demo ? '示範仍在、' : ''}${es.down.length ? `${es.down.join('、')} 沒有升回來、` : ''}鏡頭${off(c, c0) || '已回原位'}`);
    // 拉近之後才開始示範，第一步還沒出現就按 Esc → 回到拉近後的樣子，不是預設距離
    await page.click('.toolbar .pbtn[title^="拉近"]'); await page.click('.toolbar .pbtn[title^="拉近"]'); await wait(300);
    const cz = await cam('示範前先拉近');
    let hz = await clickTab(pick.id);
    await wait(80); await page.keyboard.press('Escape'); await wait(2200);
    c = await cam('拉近後開始示範又立刻 Esc');
    if (!hz.ok) st.push(`拉近後點不到 ${pick.id} 的紙籤（${hz.why}）`);
    else if ((await endState()).demo || off(c, cz)) st.push(`拉近後開始示範、第一步出現前按 Esc：鏡頭${off(c, cz) || '已回原位'}${(await endState()).demo ? '、示範仍在' : ''}`);
    // 拉近後整段播完 → 也回到拉近後的樣子
    hz = await clickTab(pick.id);
    if (hz.ok && await waitStep(0)) {
      const sz = await autoPlay(20); if (sz) { st.push(`拉近後整段播放沒有自己播完（${sz}）`); await ev(() => window.book.endDemo()); }
      await wait(1600);
      c = await cam('拉近後整段播完');
      if (off(c, cz)) st.push(`拉近後整段播完：鏡頭${off(c, cz)}`);
    } else st.push('拉近後第二次點紙籤，示範沒有開始');
    await ev(() => window.book.home()); await wait(1500);
    // 其他模型還在降下時就按 →：不能因此跳過第一步
    hz = await clickTab(pick.id);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press(' ');
    if (!hz.ok || !(await waitStep(0))) st.push('點紙籤後立刻按 →：示範沒有開始');
    else {
      await waitIdle(); await wait(400);
      d = await demoInfo();
      if (!d || d.i !== 0) st.push(`點紙籤後、模型還在升降時按 →：應停在第 1 步，實際 ${d ? `第 ${d.i + 1} 步` : '已結束'}`);
    }
    await page.keyboard.press('Escape'); await wait(1800);
    // 最後一步按住 → 不放：示範結束，但不能接著翻頁
    hz = await clickTab(pick.id);
    if (hz.ok && await waitStep(0)) {
      await page.keyboard.press(' ');
      const nn = (await demoInfo()).n;
      for (let i = 1; i < nn; i++) { await page.keyboard.press('ArrowRight'); await wait(120); }
      await page.keyboard.down('ArrowRight'); await wait(1500); await page.keyboard.up('ArrowRight'); await wait(2500);
      const sp2 = await ev(() => window.book.app.book.spread);
      if (await demoInfo()) { st.push('最後一步按 →：示範沒有結束'); await page.keyboard.press('Escape'); await wait(1500); }
      if (sp2 !== pick.sp) { st.push(`最後一步按住 → 不放：示範結束後接著翻到了跨頁 ${sp2}`); await ev((i) => window.book.spread(i), pick.sp); await until(() => window.book.figs().every((x) => x.tab || !x.steps), 12000); await wait(600); }
    } else st.push('測試按住 → 之前，示範沒有開始');
    await ev(() => window.book.home()); await wait(1500);

    // 空白鍵暫停／繼續；← 回上一步並暫停；→ 立刻換下一步、不改變暫停狀態；點桌卡暫停／繼續
    const h = await clickTab(pick.id);
    if (!h.ok || !(await waitStep(0))) st.push(`點 ${pick.id} 的紙籤後示範沒有開始`);
    else {
      await page.keyboard.press(' '); await wait(1800);
      d = await demoInfo();
      if (!d || !d.paused || d.i !== 0) st.push(`示範中按空白鍵：應暫停在第 1 步，實際 ${d ? `第 ${d.i + 1} 步、${d.paused ? '暫停' : '沒有暫停'}` : '已結束'}`);
      if (!(await ev(() => document.querySelector('.deskcard').classList.contains('paused')))) st.push('暫停時桌卡上沒有出現「暫停」印');
      await shot('state-paused');
      await page.keyboard.press(' ');
      if (!(await waitStep(1, 5000))) st.push('再按一次空白鍵：沒有繼續播放到第 2 步');
      d = await demoInfo();
      if (d && d.paused) st.push('再按一次空白鍵：仍是暫停');
      await page.keyboard.press('ArrowRight'); await wait(150);
      d = await demoInfo();
      if (!d || d.i !== 2 || d.paused) st.push(`示範中按 →：應立刻到第 3 步且不暫停，實際 ${d ? `第 ${d.i + 1} 步、${d.paused ? '暫停' : '播放中'}` : '已結束'}`);
      await page.keyboard.press('ArrowLeft'); await wait(1800);
      d = await demoInfo();
      if (!d || d.i !== 1 || !d.paused) st.push(`示範中按 ←：應回到第 2 步並暫停，實際 ${d ? `第 ${d.i + 1} 步、${d.paused ? '暫停' : '播放中'}` : '已結束'}`);
      await page.keyboard.press('PageUp'); await wait(300);
      d = await demoInfo();
      if (!d || d.i !== 0) st.push('示範中按 PageUp（簡報筆）：沒有回上一步');
      await page.keyboard.press('PageDown'); await wait(300);
      d = await demoInfo();
      if (!d || d.i !== 1) st.push('示範中按 PageDown（簡報筆）：沒有到下一步');
      await waitIdle();
      const card = await (await page.$('.deskcard .dc-say')).boundingBox();
      await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2); await wait(150);
      d = await demoInfo();
      if (!d || d.paused) st.push('暫停時點桌卡：沒有繼續');
      await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2); await wait(150);
      d = await demoInfo();
      if (!d || !d.paused) st.push('播放中點桌卡：沒有暫停');
      // 示範中按工具列的翻頁鈕 → 示範結束、翻到別的跨頁
      if (nSpreads > 1) {
        await page.click(`.toolbar .pbtn[title^="${pick.sp < nSpreads ? '下一頁' : '上一頁'}"]`); await wait(3500);
        const s = await ev(() => ({ demo: !!window.book.app.figures.demo, card: window.book.app.ui.deskCard.visible, sp: window.book.app.book.spread, mode: window.book.app.rig.mode }));
        if (s.demo || s.card || s.sp === pick.sp || s.mode !== 'read') st.push(`示範中按翻頁鈕：${s.demo ? '示範仍在、' : ''}${s.card ? '桌卡仍在、' : ''}跨頁 ${s.sp}、模式 ${s.mode}`);
        await ev((i) => window.book.spread(i), pick.sp);
        await until(() => window.book.figs().every((x) => x.tab || !x.steps), 12000); await wait(600);
      } else { await page.keyboard.press('Escape'); await wait(1600); }
    }
    // 點模型本身不會開始示範
    const mid = await ev((i) => { const a = window.book.app, f = a.figures.live.get(i); const p = a.figures.subjectBox(f).getCenter(new a.stage.camera.position.constructor()).project(a.stage.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }, pick.id);
    await page.mouse.click(mid.x, mid.y); await wait(700);
    if (await demoInfo()) { st.push('點模型本身：示範開始了（應該只有紙籤能開始）'); await page.keyboard.press('Escape'); await wait(1500); }
    c = await cam('點模型之後');
    if (off(c, c0)) st.push(`點模型本身：鏡頭${off(c, c0)}`);
    // 平時按 PageDown（簡報筆）→ 翻頁
    if (nSpreads > 1) {
      const key = pick.sp < nSpreads ? 'PageDown' : 'PageUp';
      await page.keyboard.press(key); await wait(3500);
      const sp2 = await ev(() => window.book.app.book.spread);
      if (sp2 === pick.sp) st.push(`平時按 ${key}：沒有翻頁`);
      await ev((i) => window.book.spread(i), pick.sp);
      await until(() => window.book.figs().every((x) => x.tab || !x.steps), 12000); await wait(600);
    }
    // 滾輪拉近後雙擊 → 回到滾動前的距離
    await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, -300); await wait(1500);
    c = await cam('滾輪拉近');
    if (!(c.dist < c0.dist * 0.95)) st.push('滾輪沒有拉近');
    await page.mouse.dblclick(30, 30); await wait(2500);
    c = await cam('滾輪拉近後雙擊');
    if (off(c, c0)) st.push(`滾輪拉近後雙擊：鏡頭${off(c, c0)}`);
    // 切換視角 → 角度改變、距離不變；按「回到預設距離」→ 回預設；拉近後按 Esc → 回預設
    await page.click('.toolbar .pbtn[title^="拉近"]'); await wait(1200);
    const zoomed = (await cam('按拉近')).dist;
    const els = {};
    for (const v of ['top', 'low', 'stereo']) {
      await page.click(`.toolbar [data-view=${v}]`); await wait(1500);
      c = await cam(`切到視角 ${v}`);
      els[v] = c.el;
      if (c.view !== v || !near(c.dist, zoomed)) st.push(`切到視角 ${v}：視角 ${c.view}、距離 ${c.dist.toFixed(2)}（原 ${zoomed.toFixed(2)}）`);
    }
    if (!(els.top > els.stereo + 5 && els.stereo > els.low + 5)) st.push(`切換視角後鏡頭的仰角沒有跟著改變（俯視 ${els.top.toFixed(0)}°、立體 ${els.stereo.toFixed(0)}°、低角度 ${els.low.toFixed(0)}°）`);
    await page.click('.toolbar .pbtn[title^="回到預設距離"]'); await wait(1500);
    c = await cam('按回到預設距離');
    if (c.mode !== 'read' || !near(c.dist, c.def)) st.push(`按回到預設距離：模式 ${c.mode}、距離 ${c.dist.toFixed(2)}（預設 ${c.def.toFixed(2)}）`);
    await page.click('.toolbar .pbtn[title^="拉近"]'); await wait(1200);
    await page.keyboard.press('Escape'); await wait(1500);
    c = await cam('拉近後按 Esc');
    if (c.mode !== 'read' || !near(c.dist, c.def)) st.push(`平時拉近後按 Esc：模式 ${c.mode}、距離 ${c.dist.toFixed(2)}（預設 ${c.def.toFixed(2)}）`);
  }
  add('狀態切換（Enter、空白鍵、← →、簡報筆的 PageUp／PageDown、點桌卡、點模型、Esc、滾輪、雙擊、切視角、回預設、翻頁）', st, stNote);

  // ---------- 6. 正常速度：播一段示範，量每一步實際停留多久 ----------
  if (process.env.REAL !== '0') {
    const real = [];
    let note = '';
    if (!realPick) note = '沒有兩步以上的示範，未測試';
    else {
      await page.close();
      page = await ctx.newPage(); watch(page);
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
      await page.waitForFunction(() => window.book && window.book.app && window.book.app.ready, null, { timeout: 120000 });
      await ev((i) => window.book.spread(i), realPick.sp);
      await until(() => { const f = window.book.figs(); return f.length > 0 && f.every((x) => x.tab || !x.steps); }, 30000); await wait(800);
      const before = await cam('正常速度 示範前');
      const holds = await ev((i) => window.book.fig(i).api.demo.map((_, k) => window.book.holdOf(i, k)), realPick.id);
      await ev(() => window.book.clearDemoLog());
      const h = await clickTab(realPick.id);
      if (!h.ok) real.push(`${realPick.id}：${h.why}`);
      else if (!(await until((i) => window.book.demoInfo()?.id === i, 8000, realPick.id))) real.push(`${realPick.id}：點紙籤後示範沒有開始`);
      else {
        // 每一步的時間由頁面自己記錄（demoLog），不受這支腳本輪詢快慢的影響
        const limit = holds.reduce((a, b) => a + b, 0) * 1000 + realPick.steps * 32000 + 15000;
        const done = await until(() => !window.book.demoInfo() && !!window.book.demoLog(), limit);
        if (!done) { real.push(`${realPick.id}：正常速度下沒有自己播完`); await ev(() => window.book.endDemo()); await wait(500); }
        const log = (await ev(() => window.book.demoLog())) || [];
        if (done && log.length !== realPick.steps) real.push(`${realPick.id}：播了 ${log.length} 步，應為 ${realPick.steps} 步`);
        for (const r of log) {
          if (r.stuck) { real.push(`${realPick.id}：第 ${r.i + 1} 步的動畫 30 秒內沒有結束，是引擎強制往下走的`); continue; }
          if (r.hold === null) { real.push(`${realPick.id}：第 ${r.i + 1} 步沒有進入停留`); continue; }
          if (done && (r.hold < holds[r.i] - 0.3 || r.hold > holds[r.i] + 1)) real.push(`${realPick.id}：第 ${r.i + 1} 步動畫結束後停留 ${r.hold.toFixed(1)} 秒，應為 ${holds[r.i].toFixed(1)} 秒`);
        }
        note = `${realPick.id}：${log.map((r) => `第${r.i + 1}步動畫 ${r.anim === null ? '?' : r.anim.toFixed(1)} 秒＋停留 ${r.hold === null ? '?' : r.hold.toFixed(1)} 秒`).join('，')}`;
        await wait(2500);
        const c = await cam('正常速度 播完');
        if (off(c, before)) real.push(`${realPick.id}：正常速度播完後，鏡頭${off(c, before)}`);
      }
    }
    add('正常速度下，每一步動畫做完後停留的秒數正確，播完自己結束並回到原位', real, note);
  }
  add('每次操作後鏡頭都能停下', unsettled.slice(0, 20).map((w) => `${w}：5 秒後鏡頭仍在移動`));
} catch (e) { if (!e || !e.skip) fatal = e; }

// ---------- 7. 主控台 ----------
// 著色器「編譯警告」（Program Info Log: warning X…）來自顯示卡驅動程式對 AO、抗鋸齒等後製著色器的提示，
// 換一台電腦就不同，也不影響畫面；編譯「錯誤」是 console.error，仍會被判定為未通過。
const driver = logs.filter((l) => l.startsWith('[warning]') && /Program Info Log:[\s\S]*warning X\d+/.test(l));
const real = logs.filter((l) => !driver.includes(l));
add('主控台沒有錯誤或警告', real.slice(0, 40), driver.length ? `另有 ${driver.length} 則顯示卡驅動程式的著色器編譯警告，已略過` : '');
if (fatal) add('檢查流程完整跑完', [String(fatal.stack || fatal)]);
await browser.close();

const lines = results.map((r) => `${r.ok ? '通過  ' : '未通過'}  ${r.name}${r.ok ? (r.detail ? `（${r.detail}）` : '') : '\n' + r.detail.map((d) => '          - ' + d).join('\n')}`);
const fails = results.filter((r) => !r.ok).length;
const scope = ONLY ? `（只檢查 ${ONLY}，不能當作交付依據）` : (process.env.SPR ? `（只跑跨頁 ${process.env.SPR}，不能當作交付依據）` : (process.env.REAL === '0' ? '（略過了正常速度測試，不能當作交付依據）' : ''));
const head = `驗收結果${scope}：${fails ? `${fails} 項未通過` : '全部通過'}（${results.length} 項，視窗 ${W}×${H}，${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC）`;
const text = [head, ...lines].join('\n');
fs.writeFileSync(path.join(outDir, 'report.txt'), text + '\n');
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ ok: !fails, partial: !!scope, size: [W, H], results }, null, 2));
console.log(text);
process.exit(fails ? 1 : 0);
