// 圖模組使用的工具組：基本形體、標籤、箭頭、訊號封包、共用裝置模型、互動、補間
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WPT, PAPER_Y, CONCEPT, WASH, INK, PAPER, FONT } from './config.js';
import { inkMesh, inkMaterial, flatMaterial, label as mkLabel, linesFromPositions, setGlow, color, depthMaterial, outline } from './ink.js';

const EASE = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

export function makeKit(app, inst) {
  const U = inst.U;
  const k = {
    THREE, app, inst, U, root: inst.root, size: inst.size, CONCEPT, WASH, INK, PAPER, FONT, EASE,
    block: app.blockOf(inst.id),
    get teacher() { return !!app.state.teacher; },
  };

  // ---------- 座標 ----------
  // 頁面 pt 座標（原書版面）→ 圖的區域座標
  k.ptLocal = (x, y, h = 0) => new THREE.Vector3((x - (inst.rect.x + inst.rect.w / 2)) * WPT, h, (y - (inst.rect.y + inst.rect.h / 2)) * WPT);
  k.add = (...objs) => { objs.forEach((o) => inst.root.add(o)); return objs[0]; };

  // ---------- 基本形體（皆含墨線輪廓與排線） ----------
  const mk = (geo, o = {}) => inkMesh(geo, { U, ...o });
  k.mesh = mk;
  k.mat = (o = {}) => inkMaterial({ U, ...o });
  k.box = (w, h, d, o = {}) => { const g = new THREE.BoxGeometry(w, h, d); if (o.base !== false) g.translate(0, h / 2, 0); return mk(g, o); };
  k.rbox = (w, h, d, r = 0.01, o = {}) => { const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)); if (o.base !== false) g.translate(0, h / 2, 0); return mk(g, { edgeAngle: 50, ...o }); };
  k.cyl = (rt, rb, h, o = {}) => { const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 28, 1, false); if (o.base !== false) g.translate(0, h / 2, 0); return mk(g, { edgeAngle: 40, ...o }); };
  k.sphere = (r, o = {}) => mk(new THREE.SphereGeometry(r, o.seg || 28, Math.round((o.seg || 28) * 0.7)), { edges: false, ...o });
  k.cone = (r, h, o = {}) => { const g = new THREE.ConeGeometry(r, h, o.seg || 24); if (o.base !== false) g.translate(0, h / 2, 0); return mk(g, { edgeAngle: 40, ...o }); };
  k.torus = (R, r, o = {}) => mk(new THREE.TorusGeometry(R, r, 12, o.seg || 40, o.arc ?? Math.PI * 2), { edges: false, ...o });
  k.extrude = (shape, depth, o = {}) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 2, curveSegments: o.curveSegments || 16 }); return mk(g, { edgeAngle: 35, ...o }); };
  k.lathe = (pts, o = {}) => mk(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), o.seg || 32), { edgeAngle: 40, ...o });
  k.group = (...children) => { const g = new THREE.Group(); children.forEach((c) => g.add(c)); return g; };

  // 平面（紙片、螢幕）：雙面、不加外殼
  k.plane = (w, h, o = {}) => {
    const g = new THREE.PlaneGeometry(w, h);
    const m = mk(g, { side: THREE.DoubleSide, hull: false, ...o });
    return m;
  };

  // ---------- 線、箭頭 ----------
  // pts: Vector3 陣列（折線），opts: { dashed, width, color, closed }
  k.line = (pts, o = {}) => {
    const arr = [];
    const P = o.closed ? pts.concat([pts[0]]) : pts;
    for (let i = 0; i < P.length - 1; i++) arr.push(P[i].x, P[i].y, P[i].z, P[i + 1].x, P[i + 1].y, P[i + 1].z);
    return linesFromPositions(arr, U, o.width ?? 1.4, o.color ?? INK, { dashed: o.dashed, dashSize: o.dashSize, gapSize: o.gapSize });
  };
  // 弧線（兩點間拱起）
  k.arcPts = (a, b, lift = 0.1, n = 24) => {
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += lift;
    const c = new THREE.QuadraticBezierCurve3(a, mid, b);
    return c.getPoints(n);
  };
  // 立體箭頭（軸＋錐），從 a 到 b
  k.arrow = (a, b, o = {}) => {
    const g = new THREE.Group();
    const dir = b.clone().sub(a); const len = dir.length();
    const r = o.r ?? 0.008, head = o.head ?? Math.min(0.05, len * 0.35);
    const shaft = mk(new THREE.CylinderGeometry(r, r, Math.max(0.001, len - head), 14), { wash: o.wash, concept: o.concept, edgeAngle: 60 });
    shaft.position.y = (len - head) / 2;
    const cone = mk(new THREE.ConeGeometry(r * 2.6, head, 18), { wash: o.wash, concept: o.concept, edgeAngle: 60 });
    cone.position.y = len - head / 2;
    g.add(shaft, cone);
    g.position.copy(a);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return g;
  };
  // 沿曲線的立體管狀箭頭
  k.tubeArrow = (pts, o = {}) => {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(pts);
    const r = o.r ?? 0.008;
    const tube = mk(new THREE.TubeGeometry(curve, 48, r, 10, false), { wash: o.wash, concept: o.concept, edges: false });
    const end = curve.getPoint(1), tan = curve.getTangent(1);
    const head = o.head ?? 0.045;
    const cone = mk(new THREE.ConeGeometry(r * 2.6, head, 18), { wash: o.wash, concept: o.concept, edgeAngle: 60 });
    cone.position.copy(end).addScaledVector(tan, head / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    g.add(tube, cone);
    g.userData.curve = curve;
    return g;
  };

  // ---------- 文字 ----------
  // opts: size(字高), color, bg('none'|顏色), border, font, weight, billboard(預設 true), flat(平貼), persist
  k.label = (text, o = {}) => mkLabel(text, { U, ...o });
  // 平貼在紙面上的印刷文字（降下後仍在）
  k.print = (text, o = {}) => { const l = mkLabel(text, { U, flat: true, bg: 'none', persist: true, weight: 500, ...o }); l.position.y = o.y ?? 0.002; return l; };

  // ---------- 螢幕與畫布貼圖 ----------
  k.canvasTex = (wPx, hPx, draw) => {
    const cv = document.createElement('canvas'); cv.width = wPx; cv.height = hPx;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const api = { canvas: cv, ctx, tex, texts: [], redraw(fn) { api.texts.length = 0; ctx.save(); (fn || draw)(ctx, wPx, hPx); ctx.restore(); tex.needsUpdate = true; } };
    // 記下畫在這張畫布上的每段字（位置與字級），驗收時用來量字在畫面上有多高
    const fill = ctx.fillText.bind(ctx);
    ctx.fillText = (s, x, y, ...rest) => {
      if (String(s).trim() && api.texts.length < 400) {
        const m = ctx.getTransform(), px = parseFloat(/([\d.]+)px/.exec(ctx.font)?.[1] || 0);
        api.texts.push({ s: String(s), px: px * Math.hypot(m.c, m.d), x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
      }
      fill(s, x, y, ...rest);
    };
    if (draw) api.redraw(draw);
    return api;
  };
  // 螢幕面：不受光照的紙張色畫面（壓平）
  k.screen = (w, h, ct, o = {}) => {
    const mat = flatMaterial({ map: ct.tex, toneMapped: true, side: THREE.DoubleSide, transparent: !!o.transparent }, U, THREE.MeshBasicMaterial);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.renderOrder = 3;
    m.userData.screen = { ct, w, h };
    return m;
  };
  // 共用的畫面繪製工具（紙墨風格 UI）
  k.ui = {
    font: (px, w = 500, f = 'sans') => `${w} ${px}px ${FONT[f]}`,
    bg(ctx, w, h, c = '#fbf7ee') { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); },
    text(ctx, s, x, y, px, c = INK, w = 500, align = 'left', f = 'sans') { ctx.font = `${w} ${px}px ${FONT[f]}`; ctx.fillStyle = c; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); },
    rect(ctx, x, y, w, h, stroke = INK, fill = null, lw = 2) { if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); } if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); } },
    titleBar(ctx, w, title, px = 26) { ctx.fillStyle = '#e8e1d0'; ctx.fillRect(0, 0, w, px * 1.8); ctx.fillStyle = INK; ctx.fillRect(0, px * 1.8, w, 2); k.ui.text(ctx, title, 14, px * 0.9, px, INK, 600); k.ui.text(ctx, '－　□　×', w - 12, px * 0.9, px * 0.9, INK, 400, 'right'); },
    check(ctx, x, y, s, on, c = INK) { ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.strokeRect(x, y, s, s); if (on) { ctx.beginPath(); ctx.moveTo(x + s * 0.2, y + s * 0.55); ctx.lineTo(x + s * 0.42, y + s * 0.78); ctx.lineTo(x + s * 0.82, y + s * 0.22); ctx.stroke(); } },
    radio(ctx, x, y, r, on, c = INK) { ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); if (on) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill(); } },
    bar(ctx, x, y, w, h, frac, c) { ctx.fillStyle = 'rgba(28,36,51,0.08)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = c; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); },
  };

  // 小牌子：立在模型旁的紙卡，顯示示範過程中會變的讀數（數值、結果、比較）。
  // k.plaque({ w, h, lines, tilt, leg }) 回傳 Group；用 g.userData.set(['第一行', { text: '第二行', color, bold }]) 更新文字。
  // 牌子用兩根細腳立在紙面上，放的位置要在圖的佔地內、不擋住模型。
  k.plaque = (o = {}) => {
    const w = o.w ?? 0.2, h = o.h ?? 0.08, leg = o.leg ?? 0.025, px = o.px ?? 640;
    const H = Math.round(px * h / w);
    const g = new THREE.Group();
    const ct = k.canvasTex(px, H, (c, W, Hh) => k.ui.bg(c, W, Hh, '#fbf7ee'));
    const tilt = new THREE.Group(); tilt.rotation.x = -(o.tilt ?? 0.3); g.add(tilt); // 略往後仰，從上方也讀得到
    const slab = k.rbox(w, h, 0.006, 0.003, { wash: 'paper', base: false }); slab.position.y = leg + h / 2; tilt.add(slab);
    const sc = k.screen(w * 0.96, h * 0.92, ct); sc.position.set(0, leg + h / 2, 0.0042); tilt.add(sc);
    sc.userData.screen.read = true; // 讀數牌的字是要學生讀的，驗收時量它在畫面上的高度
    for (const sx of [-1, 1]) { const p = k.cyl(0.003, 0.003, leg + 0.004, { wash: 'grey', outline: false }); p.position.x = sx * w * 0.36; tilt.add(p); }
    let cur = null;
    g.userData.set = (lines) => {
      const list = [].concat(lines).map((ln) => (typeof ln === 'string' ? { text: ln } : ln));
      const key = JSON.stringify(list); if (key === cur) return; cur = key;
      ct.redraw((c, W, Hh) => {
        k.ui.bg(c, W, Hh, '#fbf7ee');
        const n = Math.max(1, list.length);
        let fs = Math.min(Hh / (n * 1.4), o.maxFont ?? 1e9);
        for (const ln of list) { c.font = k.ui.font(fs, ln.bold ? 700 : 500); const tw = c.measureText(ln.text).width; if (tw > W * 0.92) fs *= (W * 0.92) / tw; }
        list.forEach((ln, i) => k.ui.text(c, ln.text, W / 2, Hh / 2 + (i - (n - 1) / 2) * fs * 1.32, fs, ln.color || INK, ln.bold ? 700 : 500, 'center'));
      });
    };
    g.userData.set(o.lines ?? []);
    g.userData.size = { w, h: leg + h };
    return g;
  };

  // ---------- 互動 ----------
  // opts: { click(hitPoint), drag: { onStart(p), onMove(localPoint), onEnd(), plane:'xz', y }, hover:true, tip:'說明' }
  k.interact = (obj, opts) => { obj.userData.interact = { hover: true, ...opts }; return obj; };

  // ---------- 發光 ----------
  k.glow = (obj, key, strength = 1, spill = true) => {
    setGlow(obj, key, strength * 2.2);
    if (spill && !obj.userData.spill) obj.userData.spill = app.figures.addSpill(inst, obj, key, obj.userData.spillR || 0.18, 0.7 * strength);
    if (obj.userData.spill) { obj.userData.spill.visible = true; obj.userData.spill.material.uniforms.uCol.value.copy(color(CONCEPT[key] ? CONCEPT[key].color : key)); obj.userData.spill.userData.k = 0.7 * strength; }
  };
  k.unglow = (obj) => { setGlow(obj, null); if (obj.userData.spill) obj.userData.spill.visible = false; };

  // ---------- 時間 ----------
  k.onUpdate = (fn) => { inst.updaters.push(fn); return fn; };
  k.wait = (s) => new Promise((r) => setTimeout(r, (app.fast ? 0.02 : s) * 1000));
  const tweens = new Map();
  // 對物件屬性做補間：k.tween(obj.position, {x:1}, 0.6)
  k.tween = (target, to, dur = 0.6, ease = 'inOut') => {
    const prev = tweens.get(target); if (prev) prev.cancel = true;
    const al = alongs.get(target); if (al) { alongs.delete(target); k.stop(al); }
    const from = {}; for (const key in to) from[key] = target[key];
    const job = { cancel: false };
    tweens.set(target, job);
    if (app.fast) dur = 0.001;
    return new Promise((res) => {
      const t0 = performance.now();
      const f = EASE[ease] || EASE.inOut;
      const step = () => {
        if (job.cancel) return res(false);
        const t = Math.min(1, (performance.now() - t0) / (dur * 1000));
        const e = f(t);
        for (const key in to) target[key] = from[key] + (to[key] - from[key]) * e;
        if (t < 1) requestAnimationFrame(step); else { tweens.delete(target); res(true); }
      };
      step();
    });
  };
  // 停掉某個物件屬性上還在進行的補間（它的 Promise 會以 false 結束）
  // k.along 的移動也停得掉：k.stop(obj.position)
  const alongs = new Map();
  k.stop = (target) => {
    const job = tweens.get(target); if (job) { job.cancel = true; tweens.delete(target); }
    const al = alongs.get(target); if (al) { alongs.delete(target); k.stop(al); }
  };
  // 沿曲線移動物件。對同一個物件再呼叫 k.along、k.tween(obj.position, …) 或 k.stop(obj.position) 會立刻停下這次移動（Promise 以 false 結束），物件留在當時的位置
  k.along = (obj, curve, dur = 1, ease = 'inOut') => {
    k.stop(obj.position);
    const s = { t: 0 };
    alongs.set(obj.position, s);
    const p = k.tween(s, { t: 1 }, dur, ease);
    const u = k.onUpdate(() => { if (alongs.get(obj.position) === s) obj.position.copy(curve.getPoint(Math.min(1, s.t))); });
    return p.then((r) => {
      inst.updaters.splice(inst.updaters.indexOf(u), 1);
      if (alongs.get(obj.position) === s) { alongs.delete(obj.position); if (r) obj.position.copy(curve.getPoint(1)); }
      return r;
    });
  };

  // ---------- 訊號封包 ----------
  // 沿路徑持續流動的發光小球；回傳 { start(), stop(), obj }
  k.flow = (pts, o = {}) => {
    const curve = (pts.isCurve || typeof pts.getPoint === 'function') ? pts : new THREE.CatmullRomCurve3(pts);
    const n = o.count ?? 3;
    const g = new THREE.Group();
    const balls = [];
    for (let i = 0; i < n; i++) {
      const b = o.make ? o.make(i) : k.sphere(o.r ?? 0.014, { concept: o.concept, wash: o.wash });
      if (o.concept) setGlow(b, o.concept, 2.4);
      b.visible = false; g.add(b); balls.push(b);
    }
    let on = false, t = 0;
    k.onUpdate((dt) => {
      if (!on) return;
      t += dt * (o.speed ?? 0.35);
      balls.forEach((b, i) => {
        let u = (t + i / n) % 1;
        if (o.once && t + i / n > 1) { b.visible = false; return; }
        b.visible = true;
        b.position.copy(curve.getPoint(u));
      });
    });
    return { obj: g, curve, start() { on = true; t = 0; }, stop() { on = false; balls.forEach((b) => (b.visible = false)); }, get on() { return on; } };
  };

  // 波紋（Wi-Fi、訊號）：數個同心弧
  k.waves = (o = {}) => {
    const g = new THREE.Group();
    const n = o.n ?? 3, r0 = o.r0 ?? 0.03, dr = o.dr ?? 0.025, arc = o.arc ?? Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = k.torus(r0 + i * dr, o.thick ?? 0.0035, { arc, concept: o.concept, wash: o.wash ?? 'blue', hull: false, outline: false });
      t.rotation.z = Math.PI / 2 - arc / 2;
      g.add(t);
    }
    if (o.concept) setGlow(g, o.concept, 1.2);
    return g;
  };

  // ---------- 共用裝置模型（墨線＋淡彩） ----------
  const parts = {};
  k.parts = parts;
  // 手機：w 寬；回傳 group，.screen 為畫面網格，.ct 為畫布
  parts.phone = (o = {}) => {
    const w = o.w ?? 0.07, h = w * 2.0, t = w * 0.12;
    const g = new THREE.Group();
    const body = k.rbox(w, t, h, w * 0.14, { wash: o.wash ?? 'slate' });
    g.add(body);
    const ct = o.ct || k.canvasTex(240, 480, o.draw || ((c, W, H) => { k.ui.bg(c, W, H, '#dfe9f2'); }));
    const sc = k.screen(w * 0.86, h * 0.86, ct);
    sc.rotation.x = -Math.PI / 2; sc.position.y = t + 0.0012;
    g.add(sc);
    g.userData.screen = sc; g.userData.ct = ct; g.userData.size = { w, h, t };
    // at(u, v, lift)：畫面上的點（u 由左而右、v 由上而下，0–1）在這個 Group 座標下的位置
    g.userData.at = (u, v, lift = 0.002) => new THREE.Vector3((u - 0.5) * w * 0.86, t + 0.0012 + lift, (v - 0.5) * h * 0.86);
    return g;
  };
  // 筆電：w 寬，open 開啟角度（度）
  parts.laptop = (o = {}) => {
    const w = o.w ?? 0.26, d = w * 0.68, t = w * 0.045;
    const g = new THREE.Group();
    const base = k.rbox(w, t, d, t * 0.4, { wash: o.wash ?? 'grey' });
    g.add(base);
    const kb = k.box(w * 0.86, 0.002, d * 0.5, { wash: '#bdb6a6', outline: false });
    kb.position.set(0, t, -d * 0.08); g.add(kb);
    const hinge = new THREE.Group(); hinge.position.set(0, t, -d / 2); g.add(hinge);
    const lid = k.rbox(w, t * 0.7, d, t * 0.3, { wash: o.wash ?? 'grey', base: false });
    lid.position.set(0, 0, -d / 2); hinge.add(lid);
    const ct = o.ct || k.canvasTex(512, 340, o.draw || ((c, W, H) => k.ui.bg(c, W, H, '#dfe9f2')));
    const sc = k.screen(w * 0.9, d * 0.86, ct);
    sc.rotation.x = Math.PI / 2; sc.position.set(0, t * 0.36, -d / 2); sc.rotation.y = Math.PI; sc.rotation.z = Math.PI;
    hinge.add(sc);
    hinge.rotation.x = Math.PI - (o.open ?? 105) * Math.PI / 180;
    g.userData = { screen: sc, ct, hinge, size: { w, d, t } };
    return g;
  };
  // 桌上型螢幕：w 寬；畫面朝 +z
  parts.monitor = (o = {}) => {
    const w = o.w ?? 0.36, h = w * (o.ratio ?? 0.62), t = 0.016;
    const g = new THREE.Group();
    const foot = k.rbox(w * 0.36, 0.008, w * 0.2, 0.004, { wash: o.wash ?? 'grey' }); g.add(foot);
    const neck = k.box(0.02, h * 0.35, 0.014, { wash: o.wash ?? 'grey' }); neck.position.set(0, 0.008, -w * 0.04); g.add(neck);
    const panel = k.rbox(w, h, t, 0.006, { wash: o.wash ?? 'grey', base: false });
    panel.position.set(0, h * 0.35 + h / 2, -w * 0.02); g.add(panel);
    const ct = o.ct || k.canvasTex(Math.round(1024), Math.round(1024 * (o.ratio ?? 0.62)), o.draw || ((c, W, H) => k.ui.bg(c, W, H)));
    const sc = k.screen(w * 0.94, h * 0.9, ct);
    sc.position.set(0, h * 0.35 + h / 2, -w * 0.02 + t / 2 + 0.0012); g.add(sc);
    g.userData = { screen: sc, ct, panel, size: { w, h, t }, screenCenter: new THREE.Vector3(0, h * 0.35 + h / 2, 0) };
    return g;
  };
  // 伺服器機櫃：units 層，正面朝 +z
  parts.server = (o = {}) => {
    const w = o.w ?? 0.12, h = o.h ?? 0.26, d = o.d ?? 0.12, units = o.units ?? 6;
    const g = new THREE.Group();
    const frame = k.rbox(w, h, d, 0.006, { wash: o.wash ?? 'slate' }); g.add(frame);
    const leds = [];
    for (let i = 0; i < units; i++) {
      const y = h * 0.08 + (h * 0.84) * (i + 0.5) / units;
      const u = k.box(w * 0.84, (h * 0.84) / units * 0.7, 0.006, { wash: '#e7e2d6', base: false, edgeAngle: 20 });
      u.position.set(0, y, d / 2 + 0.002); g.add(u);
      const led = k.sphere(0.0045, { concept: o.concept || 'proc', outline: false });
      led.position.set(w * 0.32, y, d / 2 + 0.006); g.add(led); leds.push(led);
    }
    g.userData = { leds, size: { w, h, d } };
    return g;
  };
  // 行動通訊基地台（鐵塔＋天線）
  parts.tower = (o = {}) => {
    const h = o.h ?? 0.32;
    const g = new THREE.Group();
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const b = h * 0.12, tp = h * 0.03;
    for (const [sx, sz] of legs) {
      const a = new THREE.Vector3(sx * b, 0, sz * b), c = new THREE.Vector3(sx * tp, h, sz * tp);
      const leg = k.arrow(a, c, { r: 0.0035, head: 0.0001, wash: 'grey' });
      g.add(leg);
    }
    const lat = [];
    for (let i = 1; i < 6; i++) {
      const y = h * i / 6, s = b + (tp - b) * (i / 6);
      lat.push(new THREE.Vector3(-s, y, -s), new THREE.Vector3(s, y, -s), new THREE.Vector3(s, y, s), new THREE.Vector3(-s, y, s), new THREE.Vector3(-s, y, -s));
      g.add(k.line(lat.splice(0), { width: 1.1 }));
    }
    for (let i = 0; i < 3; i++) {
      const ant = k.box(0.012, h * 0.16, 0.006, { wash: '#f0ece2' });
      const a = i * Math.PI * 2 / 3;
      ant.position.set(Math.cos(a) * tp * 2.2, h * 0.84, Math.sin(a) * tp * 2.2); ant.rotation.y = -a;
      g.add(ant);
    }
    g.userData = { top: new THREE.Vector3(0, h * 0.92, 0), size: { h } };
    return g;
  };
  // 人造衛星
  parts.satellite = (o = {}) => {
    const s = o.s ?? 0.05;
    const g = new THREE.Group();
    const body = k.rbox(s, s, s * 1.3, s * 0.1, { wash: o.wash ?? '#e9d79a', base: false }); g.add(body);
    for (const sx of [-1, 1]) {
      const p = k.box(s * 1.7, s * 0.06, s * 0.9, { wash: 'blue', base: false });
      p.position.set(sx * s * 1.4, 0, 0); g.add(p);
    }
    const dish = k.cone(s * 0.35, s * 0.3, { wash: 'paper', base: false }); dish.position.set(0, -s * 0.65, 0); dish.rotation.x = Math.PI; g.add(dish);
    return g;
  };
  // 雲（數個球合成，底部平）
  parts.cloud = (o = {}) => {
    const w = o.w ?? 0.3;
    const g = new THREE.Group();
    const blobs = [[0, 0.32, 0.32], [-0.32, 0.22, 0.24], [0.33, 0.2, 0.25], [-0.14, 0.42, 0.22], [0.16, 0.45, 0.2], [-0.52, 0.14, 0.15], [0.55, 0.13, 0.15]];
    const mat = inkMaterial({ U, wash: o.wash ?? '#eef3f8', concept: o.concept, hatch: 0.6 });
    for (const [x, y, r] of blobs) {
      const s = k.mesh(new THREE.SphereGeometry(r * w * 0.5, 28, 20), { material: mat, edges: false });
      s.scale.y = 0.75; s.position.set(x * w * 0.5, y * w * 0.32, 0);
      g.add(s);
    }
    g.userData = { size: { w } };
    return g;
  };
  // 晶片（CPU、NPU）
  parts.chip = (o = {}) => {
    const s = o.s ?? 0.08;
    const g = new THREE.Group();
    const sub = k.box(s * 1.25, s * 0.06, s * 1.25, { wash: '#c9d6b8' }); g.add(sub);
    const die = k.box(s, s * 0.08, s, { wash: o.wash ?? '#3d4655', concept: o.concept }); die.position.y = s * 0.06; g.add(die);
    if (o.text) { const t = k.label(o.text, { size: s * 0.22, bg: 'none', color: '#f6efe0', billboard: false, flat: true }); t.position.y = s * 0.141 + 0.001; g.add(t); }
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) {
      const p1 = k.box(s * 0.05, s * 0.02, s * 0.14, { wash: '#d8b25a', outline: false }); p1.position.set(-s * 0.5 + (i + 0.5) * s / 6, 0, sd * s * 0.69); g.add(p1);
      const p2 = k.box(s * 0.14, s * 0.02, s * 0.05, { wash: '#d8b25a', outline: false }); p2.position.set(sd * s * 0.69, 0, -s * 0.5 + (i + 0.5) * s / 6); g.add(p2);
    }
    g.userData = { die, size: { s } };
    return g;
  };
  // 墨線小人（比例尺）：h 身高
  parts.person = (o = {}) => {
    const h = o.h ?? 0.18;
    const g = new THREE.Group();
    const wash = o.wash ?? '#f0d9c4';
    const legL = k.cyl(h * 0.045, h * 0.04, h * 0.45, { wash: o.pants ?? 'slate' }); legL.position.x = -h * 0.06; g.add(legL);
    const legR = k.cyl(h * 0.045, h * 0.04, h * 0.45, { wash: o.pants ?? 'slate' }); legR.position.x = h * 0.06; g.add(legR);
    const body = k.cyl(h * 0.1, h * 0.12, h * 0.32, { wash: o.shirt ?? 'blue' }); body.position.y = h * 0.45; g.add(body);
    const head = k.sphere(h * 0.1, { wash }); head.position.y = h * 0.88; g.add(head);
    const armL = new THREE.Group(); armL.position.set(-h * 0.13, h * 0.74, 0); g.add(armL);
    const armR = new THREE.Group(); armR.position.set(h * 0.13, h * 0.74, 0); g.add(armR);
    for (const a of [armL, armR]) { const m = k.cyl(h * 0.03, h * 0.028, h * 0.3, { wash: o.shirt ?? 'blue', base: false }); m.position.y = -h * 0.15; a.add(m); const hand = k.sphere(h * 0.035, { wash }); hand.position.y = -h * 0.31; a.add(hand); }
    armL.rotation.z = -0.15; armR.rotation.z = 0.15;
    g.userData = { armL, armR, head, size: { h } };
    return g;
  };
  // 文件紙張
  parts.doc = (o = {}) => {
    const w = o.w ?? 0.07, h = w * 1.35;
    const g = new THREE.Group();
    const sheet = k.box(w, 0.002, h, { wash: o.wash ?? 'paper', hatch: 0.3 }); g.add(sheet);
    for (let i = 0; i < 5; i++) { const l = k.line([new THREE.Vector3(-w * 0.35, 0.0025, -h * 0.3 + i * h * 0.13), new THREE.Vector3(w * (i === 4 ? 0.05 : 0.35), 0.0025, -h * 0.3 + i * h * 0.13)], { width: 1 }); g.add(l); }
    g.userData = { size: { w, h } };
    return g;
  };
  // 資料夾
  parts.folder = (o = {}) => {
    const w = o.w ?? 0.09, d = w * 0.75, t = w * 0.12;
    const g = new THREE.Group();
    const back = k.box(w, t, d, { wash: o.wash ?? '#f2d58a' }); g.add(back);
    const tab = k.box(w * 0.4, t * 0.6, d * 0.12, { wash: o.wash ?? '#f2d58a' }); tab.position.set(-w * 0.3, 0, -d * 0.5 - d * 0.05); g.add(tab);
    g.userData = { size: { w, d, t } };
    return g;
  };
  // 視窗面板（直立，正面朝 +z）：w、h 寬高；draw(ctx,W,H) 繪製內容
  parts.window = (o = {}) => {
    const w = o.w ?? 0.4, h = o.h ?? 0.26, t = o.t ?? 0.012;
    const g = new THREE.Group();
    const slab = k.rbox(w, h, t, 0.004, { wash: o.wash ?? '#ece6d8', base: false, hatch: 0.4 });
    slab.position.y = h / 2; g.add(slab);
    const px = o.px ?? 1024;
    const ct = o.ct || k.canvasTex(px, Math.round(px * h / w), o.draw || ((c, W, H) => { k.ui.bg(c, W, H); k.ui.titleBar(c, W, o.title || ''); }));
    const sc = k.screen(w * 0.98, h * 0.97, ct);
    sc.position.set(0, h / 2, t / 2 + 0.0012); g.add(sc);
    g.userData = { screen: sc, ct, slab, size: { w, h, t } };
    return g;
  };
  // 印表機
  parts.printer = (o = {}) => {
    const w = o.w ?? 0.2, d = w * 0.8, h = w * 0.42;
    const g = new THREE.Group();
    const body = k.rbox(w, h, d, 0.01, { wash: o.wash ?? 'grey' }); g.add(body);
    const tray = k.box(w * 0.7, 0.006, d * 0.45, { wash: '#e5dfd0' }); tray.position.set(0, h * 0.25, d * 0.6); g.add(tray);
    const slot = k.box(w * 0.74, h * 0.06, 0.004, { wash: '#2b2f38', outline: false }); slot.position.set(0, h * 0.5, d / 2 + 0.001); g.add(slot);
    const feed = k.box(w * 0.7, 0.006, d * 0.4, { wash: '#e5dfd0' }); feed.position.set(0, h, -d * 0.2); feed.rotation.x = 0.5; g.add(feed);
    g.userData = { tray, slot, size: { w, d, h } };
    return g;
  };
  // 硬碟（3.5 吋外觀）
  parts.disk = (o = {}) => {
    const w = o.w ?? 0.1, d = w * 1.4, t = w * 0.25;
    const g = new THREE.Group();
    const body = k.rbox(w, t, d, 0.006, { wash: o.wash ?? 'slate' }); g.add(body);
    const plat = k.cyl(w * 0.38, w * 0.38, 0.003, { wash: '#d4d8de' }); plat.position.set(0, t, -d * 0.12); g.add(plat);
    g.userData = { size: { w, d, t } };
    return g;
  };
  // 光碟
  parts.disc = (o = {}) => {
    const r = o.r ?? 0.06;
    const g = new THREE.Group();
    const p = [[r * 0.15, 0], [r, 0], [r, 0.003], [r * 0.15, 0.003]];
    const d = k.lathe(p, { wash: o.wash ?? '#dfe4ee', seg: 48 }); g.add(d);
    return g;
  };

  // 兩點之間的細桿（支架、撐桿、桌腳）
  k.rod = (a, b, o = {}) => {
    const d = b.clone().sub(a), r = o.r ?? 0.004;
    const m = k.cyl(r, r, Math.max(0.001, d.length()), { wash: o.wash ?? 'slate', base: false, seg: 10, ...o });
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  // 立在紙面上的軟體視窗：視窗面板向後斜靠在底座與兩根後撐上，畫面朝讀者（+z）。
  // o: { w, h, tilt（後仰的弧度，預設 0.45）, draw(ctx, W, H) 或 ct, px, wash }
  // 回傳 Group，原點在底座中央、紙面高度。userData：
  //   win（視窗面板）、screen、ct、size、pivot、
  //   at(u, v, lift)：畫面上的點（u 由左而右、v 由上而下，0–1）在這個 Group 座標下的位置，用來接引線或讓東西從畫面飛出來
  parts.easel = (o = {}) => {
    const w = o.w ?? 0.5, h = o.h ?? w * 0.75, tilt = o.tilt ?? 0.45, t = o.t ?? 0.012;
    const g = new THREE.Group();
    const base = k.rbox(w * 0.96, 0.012, 0.034, 0.004, { wash: o.baseWash ?? 'slate' }); g.add(base);
    const pivot = new THREE.Group(); pivot.position.set(0, 0.011, -0.004); pivot.rotation.x = -tilt; g.add(pivot);
    const win = parts.window({ w, h, t, ct: o.ct, draw: o.draw, px: o.px, wash: o.wash ?? '#e8e4da', title: o.title });
    pivot.add(win);
    pivot.updateMatrix();
    const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(pivot.matrix);
    for (const sx of [-1, 1]) {
      const top = P(sx * w * 0.34, h * 0.56, -t / 2);
      g.add(k.rod(top, new THREE.Vector3(top.x, 0, top.z - top.y * 0.55), { r: 0.0045 }));
    }
    g.userData = {
      win, pivot, screen: win.userData.screen, ct: win.userData.ct, size: { w, h, t, tilt },
      at: (u, v, lift = 0.002) => P((u - 0.5) * w * 0.98, h / 2 + (0.5 - v) * h * 0.97, t / 2 + lift),
    };
    return g;
  };
  // 原書的說明引線：一張立著的說明標籤，用洋紅色引線接到它指的地方（引線端點有一個小圓點）。
  // k.callout('說明文字', 標籤位置, 指向的位置, { size, knee: 轉折點, color })：回傳 Group，userData.label 是標籤
  k.callout = (str, at, to, o = {}) => {
    const col = o.color ?? '#d6247a';
    const g = new THREE.Group();
    const lb = k.label(str, { size: o.size ?? 0.022, bg: '#fbf7ee', border: false, color: INK });
    lb.position.copy(at); g.add(lb);
    g.add(k.line(o.knee ? [to, o.knee, at] : [to, at], { color: col, width: 1.6 }));
    const dot = k.sphere(0.005, { wash: col, outline: false, seg: 12 }); dot.position.copy(to); g.add(dot);
    g.userData.text = lb;
    return g;
  };

  // 讓物件陰影與深度都使用此圖的壓平材質
  k.fix = (obj) => { obj.traverse((o) => { if (o.isMesh && !o.userData.part) { o.customDepthMaterial = depthMaterial(U); } }); return obj; };
  return k;
}
