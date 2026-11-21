// 入口：載入字型、建立場景、書、圖、介面與輸入
import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { Book, SPREADS, specialPage } from './core/book.js';
import { CameraRig } from './core/camera.js';
import { PageRenderer } from './core/pagerender.js';
import { FigureManager, holdSeconds } from './core/figures.js';
import { UI, CSS } from './core/ui.js';
import { tableModule } from './core/table3d.js';
import { PAGES, GLOSSARY } from './content/pages.js';
import { PT_W, PT_H, PAPER_Y, PAGE_W, PAGE_H, FIRST_PAGE, LAST_PAGE } from './core/config.js';
import { CHAPTER } from './content/chapter.js';
import FIGS from './figs/index.js';

async function loadFonts() {
  const F = window.__FONTS || {};
  const defs = [
    ['NSerif', 'serif400', '400'], ['NSerif', 'serif700', '700'],
    ['NSans', 'sans400', '400'], ['NSans', 'sans700', '700'],
    ['WKai', 'kai', '400'], ['WKai', 'kai', '500'], ['WKai', 'kai', '700'],
  ];
  const list = [];
  for (const [fam, key, w] of defs) {
    if (!F[key]) continue;
    const bin = Uint8Array.from(atob(F[key]), (c) => c.charCodeAt(0));
    const ff = new FontFace(fam, bin.buffer, { weight: w });
    document.fonts.add(ff);
    list.push(ff.load());
  }
  await Promise.all(list);
  await document.fonts.ready;
}

class App {
  constructor() {
    this.state = { teacher: false, revealed: new Set(), allAns: false };
    this.layouts = {};
    this.fast = /[?&]fast/.test(location.search);
  }

  async init() {
    document.title = `${CHAPTER.title}｜3D 互動課本`;
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    await loadFonts();
    this.stage = new Stage(document.getElementById('app'));
    this.renderer = new PageRenderer(PAGES);
    this.book = new Book(this.stage, (key, canvas) => this.pageCanvas(key, canvas));
    this.rig = new CameraRig(this.stage.camera, this.stage.renderer.domElement);
    this.figures = new FigureManager(this);
    for (const f of FIGS) this.figures.register(f);
    this.ui = new UI(this);
    this.ui.setPage(0);
    this.ui.setToggles();
    this.bindInput();
    // 開場：闔上的書，鏡頭稍高
    this.rig.view = 'stereo'; this.rig.home(); this.rig.snap();
    this.t0 = this.tPrev = performance.now() / 1000;
    this.stage.renderer.setAnimationLoop(() => this.frame());
    document.querySelector('.loading')?.remove();
    await new Promise((r) => setTimeout(r, this.fast ? 10 : 600));
    await this.book.open(this.fast ? 0.01 : 1.8);
    await this.turnToSpread(1);
    this.ready = true;
  }

  pageCanvas(key, canvas) {
    if (typeof key !== 'number') return specialPage(key, canvas);
    const res = this.renderer.render(key, this.state, canvas);
    this.layouts[key] = res;
    if (res.overflow) console.warn(`第 ${key} 頁內容超出 ${res.overflow.toFixed(1)}pt`);
    return res.canvas;
  }

  blockOf(id) {
    const find = (blocks) => {
      for (const b of blocks) {
        if (b.id === id) return b;
        if (b.t === 'row') for (const c of b.cols) { const r = find(c.blocks); if (r) return r; }
      }
      return null;
    };
    for (const p of Object.values(PAGES)) { const r = find(p.blocks); if (r) return r; }
    return null;
  }
  figTitle(id) {
    const b = this.blockOf(id);
    if (!b) return id;
    if (b.caption) return b.caption.replace(/\s+/g, ' ');
    if (b.t === 'table') return '表：' + (b.cols || []).map((c) => String(c).replace(/\n/g, '')).join('／');
    return id;
  }
  tableModule(id, r) { return tableModule(this, id, r); }

  tocItems() {
    const items = [];
    const scan = (blocks, page) => {
      for (const b of blocks) {
        if (b.t === 'h1') items.push({ lv: 1, text: `${b.num}　${b.text}`, page });
        else if (b.t === 'h2') items.push({ lv: 2, text: `${b.num}　${b.text}`, page });
        else if (b.t === 'exBanner') items.push({ lv: 1, text: b.text, page });
        else if (b.t === 'sumHead') items.push({ lv: 1, text: b.text || '重點整理', page });
        else if (b.t === 'row') b.cols.forEach((c) => scan(c.blocks, page));
      }
    };
    for (const [n, p] of Object.entries(PAGES)) scan(p.blocks, +n);
    return items;
  }

  spreadOfPage(p) { return SPREADS.findIndex((s) => s.includes(p)); }

  async turnToSpread(i) {
    if (this.turning) return;
    i = Math.max(1, Math.min(SPREADS.length - 1, i));
    if (i === this.book.spread && this.figures.active.length) return;
    this.turning = true;
    await this.figures.hideAll(); // 進行中的示範會先結束
    if (i !== this.book.spread) await this.book.turnTo(i, this.fast ? 0.01 : 1.0);
    this.ui.setPage(this.book.spread);
    const [l, r] = SPREADS[this.book.spread];
    // 確保版面已排（取得圖的位置）
    for (const k of [l, r]) if (typeof k === 'number' && !this.layouts[k]) this.pageCanvas(k);
    this.turning = false;
    await this.figures.showSpread([l, r], this.layouts);
  }
  turn(d) { return this.turnToSpread(this.book.spread + d); }
  gotoPage(p) { const i = this.spreadOfPage(p); if (i >= 0) return this.turnToSpread(i); }

  refreshPages() {
    this.book.refreshAll();
    for (const f of this.figures.live.values()) f.api.refresh?.();
  }
  toggleTeacher() { this.state.teacher = !this.state.teacher; this.refreshPages(); this.ui.setToggles(); }
  toggleAllAnswers() { this.state.allAns = !this.state.allAns; if (!this.state.allAns) this.state.revealed.clear(); this.refreshPages(); this.ui.setToggles(); }

  fullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }

  // ---------- 輸入 ----------
  ndc(e) { const r = this.stage.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }

  pick(e, objs) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this.ndc(e), this.stage.camera);
    rc.layers.enableAll();
    // 射線不會自己略過隱藏的物件：還沒出場的示範道具不能擋住後面的紙籤
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    return rc.intersectObjects(objs, true).filter((h) => shown(h.object));
  }
  findInteract(o) { while (o) { if (o.userData && o.userData.interact) return o; o = o.parent; } return null; }
  findFig(o) { while (o) { if (o.userData && o.userData.figId) return this.figures.live.get(o.userData.figId); o = o.parent; } return null; }

  pageHit(e) {
    const hits = this.pick(e, [this.book.leftPage, this.book.rightPage]);
    if (!hits.length) return null;
    const h = hits[0];
    const key = h.object.userData.page;
    return { key, x: h.uv.x * PT_W, y: (1 - h.uv.y) * PT_H, point: h.point, dist: h.distance };
  }

  bindInput() {
    const dom = this.stage.renderer.domElement;
    let down = null, drag = null, longT = null;
    const figRoots = () => this.clickables();
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, t: performance.now(), az: this.rig.orbit.az, el: this.rig.orbit.el, moved: false };
      const hits = this.pick(e, figRoots());
      const io = hits.length ? this.findInteract(hits[0].object) : null;
      if (io && io.userData.interact.drag) {
        const d = io.userData.interact.drag;
        const y = hits[0].point.y;
        drag = { obj: io, d, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(d.y ?? y)) };
        d.onStart?.(hits[0].point);
      }
      if (e.pointerType === 'touch') {
        longT = setTimeout(() => { this.stage.mag.on = true; this.touchMag = true; this.updateMag(e); }, 520);
      }
    });
    dom.addEventListener('pointermove', (e) => {
      if (this.touchMag) { this.updateMag(e); return; }
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) { down.moved = true; clearTimeout(longT); }
        if (drag) {
          const rc = new THREE.Raycaster(); rc.setFromCamera(this.ndc(e), this.stage.camera);
          const p = new THREE.Vector3();
          if (rc.ray.intersectPlane(drag.plane, p)) {
            const parent = drag.obj.parent;
            drag.d.onMove?.(parent.worldToLocal(p.clone()), p);
          }
          return;
        }
        if (down.moved) {
          this.rig.dragging = true;
          this.rig.orbit.az = THREE.MathUtils.clamp(down.az - dx * 0.08, -28, 28);
          this.rig.orbit.el = THREE.MathUtils.clamp(down.el + dy * 0.06, -16, 16);
        }
        return;
      }
      this.hover(e);
      if (this.stage.mag.on) this.updateMag(e);
    });
    const up = (e) => {
      clearTimeout(longT);
      if (this.touchMag) { this.touchMag = false; this.stage.mag.on = false; this.ui.hideCard(); down = null; return; }
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t;
      this.rig.dragging = false;
      if (drag) { drag.d.onEnd?.(); drag = null; down = null; return; }
      if (down.moved && dt < 380 && Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.6) { this.turn(dx < 0 ? 1 : -1); down = null; return; }
      if (!down.moved) this.click(e);
      down = null;
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('dblclick', (e) => {
      if (this.rig.mode === 'focus') { this.rig.release(); return; }
      const ph = this.pageHit(e);
      const p = ph ? ph.point : this.rig.hitPaper(this.ndc(e));
      if (p) { this.rig.focusAt(p); this.ui.syncViews(); }
    });
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this.rig.zoomBy(Math.exp(e.deltaY * 0.0012), this.ndc(e)); this.ui.syncViews(); }, { passive: false });
    const heldInDemo = new Set();
    window.addEventListener('keyup', (e) => heldInDemo.delete(e.key));
    window.addEventListener('blur', () => heldInDemo.clear());
    // 鍵盤（簡報筆送出的是 PageUp／PageDown）
    //   示範中：空白鍵暫停／繼續；→ PageDown 立刻換下一步；← PageUp 回上一步並暫停；Esc 結束
    //   平時：← → PageUp PageDown 翻頁；Enter 示範這個跨頁的下一張圖；Esc 回到預設距離
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key;
      const figs = this.figures, demo = figs.demo;
      if ((k === ' ' || k === 'Enter') && e.target.tagName === 'BUTTON') return;
      // 按住不放時的重複鍵：這個鍵第一次按下時是給示範用的，放開之前都不改作翻頁或回預設（否則按住 → 會在示範結束後連翻好幾頁）
      if (e.repeat && heldInDemo.has(k)) { e.preventDefault(); return; }
      if (demo && !e.repeat) heldInDemo.add(k);
      if (demo && k === ' ') { e.preventDefault(); if (!e.repeat) figs.togglePause(); }
      else if (demo && (k === 'ArrowRight' || k === 'PageDown')) { e.preventDefault(); if (!e.repeat) figs.stepDemo(1); }
      else if (demo && (k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); if (!e.repeat) { figs.togglePause(true); figs.stepDemo(-1); } }
      else if (demo && k === 'Escape') figs.endDemo();
      else if (k === 'Enter') { e.preventDefault(); if (!e.repeat && !this.turning) figs.startNext(); }
      else if (k === ' ') e.preventDefault();
      else if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); this.turn(1); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); this.turn(-1); }
      else if (k === '+' || k === '=') this.rig.zoomBy(1 / 1.18);
      else if (k === '-' || k === '_') this.rig.zoomBy(1.18);
      else if (k === 'Escape') this.rig.home();
      else if (k === 'f' || k === 'F') this.fullscreen();
    });
    dom.addEventListener('pointerleave', () => { this.ui.showHover(null); });
  }

  // 可點的東西：升起的模型（其中的互動物件）與「示範」紙籤
  clickables() { return this.figures.active.filter((f) => f.raised).map((f) => f.root).concat(this.figures.tabs()); }

  click(e) {
    const hits = this.pick(e, this.clickables());
    if (hits.length) {
      const io = this.findInteract(hits[0].object);
      if (io && io.userData.interact.click) { io.userData.interact.click(hits[0].point); this.hovered = null; return; } // 點了之後鏡頭會動，虛線框先收掉
      if (this.findFig(hits[0].object)) return; // 點到模型本身：不做事（示範從圖說旁的紙籤開始）
    }
    const ph = this.pageHit(e);
    if (ph && typeof ph.key === 'number') {
      const lay = this.layouts[ph.key];
      const hot = lay && lay.hot.find((h) => ph.x >= h.x - 3 && ph.x <= h.x + h.w + 3 && ph.y >= h.y - 3 && ph.y <= h.y + h.h + 3);
      if (hot) {
        if (this.state.revealed.has(hot.id)) this.state.revealed.delete(hot.id); else this.state.revealed.add(hot.id);
        this.book.refresh(ph.key);
        return;
      }
    }
  }

  hover(e) {
    const hits = this.pick(e, this.clickables());
    let target = null;
    if (hits.length) target = this.findInteract(hits[0].object); // 只有可操作的東西（紙籤、互動物件）才出現虛線框
    if (target !== this.hovered) { this.hovered = target; }
    this.stage.renderer.domElement.style.cursor = target ? 'pointer' : 'default';
  }

  hoverRect() {
    const o = this.hovered;
    if (!o || !o.visible) return null;
    const box = new THREE.Box3().setFromObject(o);
    if (box.isEmpty()) return null;
    const cam = this.stage.camera;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(cam);
      const sx = (p.x * 0.5 + 0.5) * this.stage.w, sy = (-p.y * 0.5 + 0.5) * this.stage.h;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
  }

  updateMag(e) {
    const m = this.stage.mag;
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    m.x = e.clientX - r.left; m.y = e.clientY - r.top;
    m.r = Math.round(Math.min(this.stage.w, this.stage.h) * 0.15);
    const ph = this.pageHit(e);
    let g = null;
    if (ph && typeof ph.key === 'number') {
      const lay = this.layouts[ph.key];
      const hit = lay && lay.gloss.find((q) => ph.x >= q.x - 2 && ph.x <= q.x + q.w + 2 && ph.y >= q.y && ph.y <= q.y + q.h);
      if (hit) g = GLOSSARY[hit.id];
    }
    if (g) this.ui.showCard(g, m.x, m.y); else this.ui.hideCard();
  }

  frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.2, now - this.tPrev); // 上限只用來擋掉分頁切回來時的大跳動；設太小的話，畫面更新慢的電腦上所有動畫都會變慢
    this.tPrev = now;
    const t = now - this.t0;
    this.rig.update(dt);
    this.figures.update(dt, t);
    this.ui.update();
    this.ui.showHover(this.hovered ? this.hoverRect() : null);
    this.stage.render();
  }
}

const app = new App();
window.book = {
  app,
  ready: () => new Promise((res) => { const c = () => (app.ready ? res(true) : setTimeout(c, 50)); c(); }),
  goto: (p) => app.gotoPage(p),
  spread: (i) => app.turnToSpread(i),
  fig: (id) => app.figures.live.get(id),
  demo: async (id) => { const f = app.figures.live.get(id); if (f) await app.figures.startDemo(f); },
  next: () => app.figures.stepDemo(1),
  prev: () => app.figures.stepDemo(-1),
  pause: (on) => app.figures.togglePause(on),
  endDemo: () => app.figures.endDemo(),
  // 示範的進度：{ id, i, n, paused, phase, hold, stuck }；沒有示範時為 null
  demoInfo: () => { const d = app.figures.demo; return d ? { id: d.inst.id, i: d.i, n: d.inst.api.demo.length, paused: d.paused, phase: d.phase, hold: d.hold, stuck: !!d.stuck } : null; },
  // 上一段示範每一步的紀錄：[{ i, anim, hold, stuck }]（秒；anim＝動畫與鏡頭停妥、hold＝之後停留到換步）。示範還在進行或還沒示範過時為 null
  demoLog: () => { const l = app.figures.lastLog; return l ? l.map((r) => ({ i: r.i, anim: r.held ? (r.held - r.start) / 1000 : null, hold: r.held && r.end ? (r.end - r.held) / 1000 : null, stuck: r.stuck })) : null; },
  clearDemoLog: () => { app.figures.lastLog = null; },
  // 第 i 步動畫做完後停留的秒數（正常速度）
  holdOf: (id, i) => holdSeconds(app.figures.live.get(id).api.demo[i]),
  // 模型上看得到的字在畫面上各有多高（px，量的是一個字的高度）：示範中只量示範的那張圖，否則量這個跨頁的每張圖。
  // kind：label（k.label、k.callout 的標籤）、plaque（k.plaque 讀數牌）、screen（其他畫面貼圖裡的字）
  textSizes: () => {
    const d = app.figures.demo, cam = app.stage.camera, out = [];
    const r = app.stage.renderer.domElement.getBoundingClientRect();
    const V = cam.position.constructor;
    const scr = (v) => { const p = v.project(cam); return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, z: p.z }; };
    const measure = (o, lx, ly, em) => {
      const a = scr(new V(lx, ly - em / 2, 0).applyMatrix4(o.matrixWorld)), b = scr(new V(lx, ly + em / 2, 0).applyMatrix4(o.matrixWorld));
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, px = Math.hypot(a.x - b.x, a.y - b.y);
      return a.z > 1 || b.z > 1 || x < 0 || x > r.width || y < 0 || y > r.height || px < 2 ? null : { px: +px.toFixed(1), x: Math.round(x), y: Math.round(y) };
    };
    for (const f of d ? [d.inst] : app.figures.active) {
      f.root.updateMatrixWorld(true);
      f.root.traverse((o) => {
        const L = o.userData.label, S = o.userData.screen;
        if (!o.isMesh || (!L && !S)) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        if ([].concat(o.material).some((m) => m.opacity < 0.5)) return;
        if (L) {
          if (L.alpha.value < 0.5 || !L.em) return;
          const m = measure(o, 0, 0, L.em);
          if (m) out.push({ id: f.id, kind: 'label', text: String(L.text), ...m });
        } else if (S.ct && S.ct.texts) {
          const W = S.ct.canvas.width, H = S.ct.canvas.height;
          for (const t of S.ct.texts) {
            const m = measure(o, (t.x / W - 0.5) * S.w, (0.5 - t.y / H) * S.h, t.px / H * S.h);
            if (m) out.push({ id: f.id, kind: S.read ? 'plaque' : 'screen', text: t.s, ...m });
          }
        }
      });
    }
    return out;
  },
  // 這個跨頁上的圖（依版面順序）與各自「示範」紙籤在畫面上的位置（px）；紙籤還沒貼上時 tab 為 null
  figs: () => app.figures.active.map((f) => {
    let tab = null;
    if (f.tab && f.tab.visible) {
      const p = f.tab.position.clone().project(app.stage.camera);
      const r = app.stage.renderer.domElement.getBoundingClientRect();
      tab = { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
    }
    return { id: f.id, page: f.page, side: f.side, kind: f.kind, state: f.state, steps: f.api.demo?.length || 0, tab };
  }),
  // 每頁排版留給紙籤與圖說的位置（pt），驗收時檢查有沒有互相重疊或超出紙面
  tabRects: () => Object.fromEntries(Object.entries(app.layouts).map(([k, l]) => [k, [...Object.values(l.figs), ...Object.values(l.tables)].map((r) => ({ id: r.id, tab: r.tab || null, cap: r.capBox || null, capLeft: !!r.capLeft, rect: { x: r.x, y: r.y, w: r.w, h: r.h } }))])),
  settle: () => new Promise((res) => { const c = () => (app.rig.settled() ? res(true) : setTimeout(c, 50)); setTimeout(c, 60); }),
  view: (v) => { app.rig.setView(v); app.ui.syncViews(); },
  home: () => app.rig.home(),
  teacher: (on) => { if (!!on !== app.state.teacher) app.toggleTeacher(); },
  answers: (on) => { if (!!on !== app.state.allAns) app.toggleAllAnswers(); },
  pages: () => Object.keys(PAGES).map(Number).sort((a, b) => a - b),
  spreads: () => SPREADS.length - 1,
  range: () => [FIRST_PAGE, LAST_PAGE],
  geom: () => ({ pageW: PAGE_W, pageH: PAGE_H }),
  // 頁面上有佔位、卻沒有對應模組的圖（表格有通用模組，不算）
  missingFigs: () => Object.values(app.layouts).flatMap((l) => Object.keys(l.figs)).filter((id) => !app.figures.registry.has(id)),
  overflow: () => Object.fromEntries(Object.entries(app.layouts).map(([k, v]) => [k, v.overflow])),
  mag: (x, y, on = true) => { app.stage.mag.on = on; app.stage.mag.x = x; app.stage.mag.y = y; app.stage.mag.r = Math.round(Math.min(app.stage.w, app.stage.h) * 0.15); },
  cam: () => ({ ...app.rig.cur, target: app.rig.cur.target.toArray() }),
};
app.init().catch((e) => { console.error(e); const d = document.querySelector('.loading'); if (d) d.textContent = '載入失敗：' + e.message; });
