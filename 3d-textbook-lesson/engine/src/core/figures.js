// 圖的管理：依排版放到頁面、逐筆描線、升起降下、「示範」紙籤、自動播放的示範
import * as THREE from 'three';
import { PAGE_W, PAGE_H, PT_W, PT_H, PAPER_Y, WPT, CONCEPT, INK, VERMILION, FONT, DEMO_PACE, TAB } from './config.js';
import { drawPaper } from './paperfx.js';
import { figUniforms, setGlow, spillDecal, color } from './ink.js';
import { makeKit } from './kit.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---------- 「示範」紙籤 ----------
// 貼在圖說旁的一小張紙片：點一下開始示範，示範中變成「結束」。位置由排版決定（pagerender.js 的 r.tab）
const TAB_T = 0.0022;
const tabTex = {};
function tabTexture(playing) {
  const key = playing ? 'stop' : 'play';
  if (tabTex[key]) return tabTex[key];
  const S = 10, w = TAB.w, h = TAB.h;
  const cv = document.createElement('canvas'); cv.width = w * S; cv.height = h * S;
  const c = cv.getContext('2d'); c.scale(S, S);
  drawPaper(c, w, h, playing ? 5 : 3, '#f8f0da');
  if (playing) { c.fillStyle = 'rgba(154,59,42,0.93)'; c.fillRect(0, 0, w, h); } // 朱色蓋在紙上，留一點紙紋
  const fg = playing ? '#f8f0da' : INK;
  if (!playing) { c.fillStyle = VERMILION; c.fillRect(0, 0, 5, h); }
  c.strokeStyle = playing ? '#5e2217' : INK; c.lineWidth = 1; c.strokeRect(0.5, 0.5, w - 1, h - 1);
  // 圖示用向量畫，不依賴字型：▶ 開始、■ 結束
  c.fillStyle = playing ? fg : VERMILION;
  const m = h / 2;
  if (playing) c.fillRect(10.6, m - 3.9, 7.8, 7.8);
  else { c.beginPath(); c.moveTo(10.8, m - 5); c.lineTo(19.4, m); c.lineTo(10.8, m + 5); c.closePath(); c.fill(); }
  c.fillStyle = fg; c.font = `700 12px ${FONT.sans}`; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(playing ? '結束' : '示範', 23.6, m + 0.6);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return (tabTex[key] = tex);
}

// 每一步動畫做完、鏡頭停妥之後再停留的秒數：依說明的字數，讓老師講得完
export function holdSeconds(step) {
  if (typeof step.hold === 'number') return step.hold * DEMO_PACE;
  if (step.ask) return 10 * DEMO_PACE;
  const n = Array.from(String(step.say || '').replace(/\s/g, '')).length;
  return Math.max(4, Math.min(12, n / 5)) * DEMO_PACE;
}

export class FigureManager {
  constructor(app) {
    this.app = app;
    this.registry = new Map();   // id -> module
    this.live = new Map();       // id -> instance（已建立）
    this.active = [];            // 目前跨頁上的 instance
    this.group = new THREE.Group();
    app.stage.scene.add(this.group);
    this.pen = this.makePen();
    this.group.add(this.pen);
    this.pen.visible = false;
    this.demo = null;       // 進行中的示範：{ inst, i, paused, phase: 'busy'|'settle'|'hold', hold, busyT }
    this.lastDemo = null;   // 這個跨頁上最近示範過的圖（Enter 接著示範下一張）
  }

  // ---------- 紙籤 ----------
  makeTab(inst) {
    const g = new THREE.Group();
    const w = TAB.w * WPT, d = TAB.h * WPT;
    const geo = new THREE.BoxGeometry(w, TAB_T, d); geo.translate(0, TAB_T / 2, 0);
    const edge = new THREE.MeshStandardMaterial({ color: '#e2d6ba', roughness: 0.95 });
    const top = new THREE.MeshStandardMaterial({ map: tabTexture(false), roughness: 0.9, metalness: 0, envMapIntensity: 0.2 });
    const face = new THREE.Mesh(geo, [edge, edge, top, edge, edge, edge]);
    face.castShadow = true; face.receiveShadow = true;
    // 看不見的感應區：比紙籤大一圈，遠看時也點得到
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 10 * WPT, 0.004, d + 10 * WPT), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.002;
    g.add(face, hit);
    g.userData.interact = { hover: true, click: () => this.toggleDemo(inst) };
    g.userData.tabOf = inst.id; g.userData.face = face; g.userData.top = top;
    g.visible = false;
    this.group.add(g);
    return g;
  }
  placeTab(inst, side, r) {
    if (!r.tab || !inst.api.demo?.length) return;
    if (!inst.tab) inst.tab = this.makeTab(inst);
    const t = r.tab, ox = side === 'L' ? -PAGE_W : 0;
    inst.tab.position.set(ox + (t.x + t.w / 2) * WPT, PAPER_Y + 0.0006, -PAGE_H / 2 + (t.y + t.h / 2) * WPT);
    // 像手貼上去的：每張略歪一點點（依 id 固定）
    let hsh = 0; for (const ch of inst.id) hsh = (hsh * 31 + ch.charCodeAt(0)) % 97;
    inst.tab.rotation.y = ((hsh % 5) - 2) * 0.009;
  }
  syncTabs() {
    for (const f of this.active) {
      if (!f.tab) continue;
      const playing = this.demo?.inst === f;
      const tex = tabTexture(playing);
      if (f.tab.userData.top.map !== tex) { f.tab.userData.top.map = tex; f.tab.userData.top.needsUpdate = true; }
    }
  }
  // 目前看得到、可以點的紙籤
  tabs() { return this.active.filter((f) => f.tab && f.tab.visible).map((f) => f.tab); }
  toggleDemo(inst) { if (this.demo?.inst === inst) this.endDemo(); else this.startDemo(inst); }

  register(mod) { this.registry.set(mod.id, mod); }

  makePen() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.42, 20), new THREE.MeshStandardMaterial({ color: '#1d2a3c', roughness: 0.35, metalness: 0.2 }));
    body.position.y = 0.27;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 1, roughness: 0.3 }));
    band.position.y = 0.16;
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 20), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 1, roughness: 0.25 }));
    nib.rotation.x = Math.PI; nib.position.y = 0.03 + 0.0;
    const tilt = new THREE.Group(); tilt.add(body, band, nib); tilt.rotation.z = -0.5; tilt.rotation.x = 0.25;
    g.add(tilt);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // 依頁面排版結果，建立此跨頁的圖
  async showSpread(spreadPages, layouts) {
    this.active = [];
    for (const [side, num] of [['L', spreadPages[0]], ['R', spreadPages[1]]]) {
      const lay = layouts[num];
      if (!lay) continue;
      const rects = [];
      for (const [id, r] of Object.entries(lay.figs)) rects.push({ id, r, kind: 'fig' });
      for (const [id, r] of Object.entries(lay.tables)) rects.push({ id, r, kind: 'table' });
      for (const { id, r, kind } of rects) {
        let inst = this.live.get(id);
        if (!inst) {
          const mod = this.registry.get(id) || (kind === 'table' ? this.app.tableModule(id, r) : null);
          if (!mod) continue;
          inst = this.instantiate(mod, num, side, r, kind);
          if (!inst) continue;
          this.live.set(id, inst);
        }
        inst.root.visible = true;
        this.place(inst, side, r);
        this.placeTab(inst, side, r);
        this.active.push(inst);
      }
    }
    // 版面順序（先左頁後右頁、由上而下）：Enter 依這個順序示範下一張
    const act = this.active;
    act.sort((a, b) => (a.side === b.side ? a.rect.y - b.rect.y || a.rect.x - b.rect.x : a.side === 'L' ? -1 : 1));
    this.lastDemo = null;
    // 逐筆描線，再升起；升起之後紙籤才貼上
    await Promise.all(act.map((f, i) => this.drawIn(f, i * 0.25)));
    if (this.active !== act) return; // 描線途中已經翻頁
    for (const f of act) if (f.tab) f.tab.visible = true;
    this.syncTabs();
  }

  place(inst, side, r) {
    const ox = side === 'L' ? -PAGE_W : 0;
    const cx = ox + (r.x + r.w / 2) * WPT, cz = -PAGE_H / 2 + (r.y + r.h / 2) * WPT;
    inst.root.position.set(cx, PAPER_Y, cz);
    inst.root.updateMatrixWorld(true);
    inst.U.uRootInv.value.copy(inst.root.matrixWorld).invert();
  }

  instantiate(mod, num, side, r, kind) {
    const U = figUniforms();
    const root = new THREE.Group();
    root.userData.figId = mod.id;
    this.group.add(root);
    const size = { w: r.w * WPT, d: r.h * WPT };
    const inst = { id: mod.id, mod, page: num, side, rect: r, U, root, size, kind, state: 'hidden', updaters: [], spills: [], raised: false };
    const kit = makeKit(this.app, inst);
    inst.kit = kit;
    try {
      inst.api = mod.build(kit) || {};
    } catch (e) {
      console.error('圖建立失敗', mod.id, e);
      this.group.remove(root);
      return null;
    }
    // 筆順：依物件位置由左而右、由遠而近排序，分配每條線的顯示範圍
    root.updateMatrixWorld(true);
    const lines = [];
    root.traverse((o) => { if (o.userData.inkLine) lines.push(o); });
    const ctr = new THREE.Vector3();
    lines.forEach((l) => { l.userData.key = (l.parent ? l.parent.getWorldPosition(ctr) : ctr.set(0, 0, 0)).x + ctr.z * 0.35; });
    lines.sort((a, b) => a.userData.key - b.userData.key);
    const n = lines.length;
    lines.forEach((l, i) => { l.material.userData.range.value.set(i / Math.max(1, n), (i + 1) / Math.max(1, n)); });
    inst.lines = lines;
    U.uRise.value = 0; U.uDraw.value = 0; U.uFace.value = 0; U.uFade.value = 1;
    root.visible = false;
    return inst;
  }

  // 筆的位置：取目前描到的線段
  penAt(inst, t) {
    const lines = inst.lines;
    if (!lines.length) return null;
    const idx = Math.min(lines.length - 1, Math.floor(t * lines.length));
    const l = lines[idx];
    const local = (t * lines.length) - idx;
    const ist = l.geometry.attributes.instanceStart;
    if (!ist) return null;
    const segCount = ist.count;
    const si = Math.min(segCount - 1, Math.floor(local * segCount));
    const p = new THREE.Vector3(ist.getX(si), ist.getY(si), ist.getZ(si)).applyMatrix4(l.matrixWorld);
    p.y = PAPER_Y;
    return p;
  }

  anim(dur, fn) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / (dur * 1000));
        fn(t);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  async drawIn(inst, delay = 0) {
    const U = inst.U;
    if (inst.state === 'up') return;
    inst.state = 'drawing';
    U.uFade.value = 1;
    if (this.app.fast) { U.uDraw.value = 1; U.uFace.value = 1; U.uRise.value = 1; inst.state = 'up'; inst.raised = true; inst.api.onRaised?.(); return; }
    if (delay) await new Promise((r) => setTimeout(r, delay * 1000));
    U.uRise.value = 0; U.uFace.value = 0;
    this.pen.visible = true; inst.inking = true;
    const dDraw = Math.min(1.6, 0.6 + inst.lines.length * 0.012);
    await this.anim(dDraw, (t) => {
      U.uDraw.value = t;
      const p = this.penAt(inst, t);
      if (p) this.pen.position.lerp(p, 0.5);
    });
    U.uDraw.value = 1;
    inst.inking = false;
    this.pen.visible = this.active.some((f) => f.inking);
    await this.anim(0.35, (t) => { U.uFace.value = t; });
    U.uFace.value = 1;
    await this.raise(inst);
  }

  // 升起與降下可能接連被呼叫（示範剛開始就結束、連續換圖）：後來的那一次作數，先前的動畫不再改動高度
  async raise(inst, dur = 0.9) {
    const U = inst.U;
    if (inst.state === 'hidden') return;
    const g = inst.moveGen = (inst.moveGen || 0) + 1;
    inst.state = 'rising';
    const s = U.uRise.value;
    await this.anim(dur * (1 - s), (t) => { if (inst.moveGen === g) U.uRise.value = s + (1 - s) * ease(t); });
    if (inst.moveGen !== g) return;
    U.uRise.value = 1; inst.state = 'up'; inst.raised = true;
    inst.api.onRaised?.();
  }

  async lower(inst, dur = 0.6) {
    const U = inst.U;
    if (inst.state === 'hidden') return;
    const g = inst.moveGen = (inst.moveGen || 0) + 1;
    inst.state = 'lowering';
    const s = U.uRise.value;
    await this.anim(dur * s, (t) => { if (inst.moveGen === g) U.uRise.value = s * (1 - ease(t)); });
    if (inst.moveGen !== g) return;
    U.uRise.value = 0; inst.state = 'down'; inst.raised = false;
  }

  // 翻頁前：降下並淡出
  async hideAll() {
    if (this.demo) await this.endDemo('leave');
    const act = this.active;
    for (const f of act) if (f.tab) f.tab.visible = false;
    await Promise.all(act.map((f) => this.lower(f, 0.35)));
    await this.anim(0.18, (t) => { for (const f of act) { f.U.uFade.value = 1 - t; f.U.uFace.value = 1 - t; } });
    for (const f of act) { for (const st of f.stakes || []) st.visible = false; f.root.visible = false; f.state = 'hidden'; f.moveGen = (f.moveGen || 0) + 1; f.U.uDraw.value = 0; f.api.reset?.(); for (const s of f.spills) s.visible = false; }
    this.active = [];
    this.pen.visible = false;
  }

  // 立起的標籤若下方懸空，加一根細墨線支柱接到模型或紙面
  updateStakes(f) {
    const rc = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const show = f.U.uRise.value > 0.95;
    f.root.traverse((o) => {
      const L = o.userData.label;
      if (!L) return;
      let st = o.userData.stake;
      if (!L.billboard || o.userData.noStake) { if (st) st.visible = false; return; }
      let vis = show && L.alpha.value > 0.5;
      for (let p = o; p && vis; p = p.parent) if (!p.visible) vis = false;
      if (!vis) { if (st) st.visible = false; return; }
      const wp = o.getWorldPosition(new THREE.Vector3());
      const sc = o.getWorldScale(new THREE.Vector3());
      const bottom = wp.y - (L.h / 2) * sc.y;
      rc.set(new THREE.Vector3(wp.x, bottom - 0.002, wp.z), down);
      rc.far = 2;
      const hits = rc.intersectObject(f.root, true).filter((h) => h.object.isMesh && !h.object.userData.label && !h.object.userData.part);
      const hy = hits.length ? hits[0].point.y : PAPER_Y;
      const gap = bottom - Math.max(hy, PAPER_Y);
      if (gap < 0.012) { if (st) st.visible = false; return; }
      if (!st) {
        st = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6), new THREE.MeshBasicMaterial({ color: '#2a3140' }));
        st.raycast = () => {}; st.userData.part = 'stake';
        this.group.add(st); o.userData.stake = st; f.stakes = f.stakes || []; f.stakes.push(st);
      }
      st.visible = true;
      st.scale.set(1, gap, 1);
      st.position.set(wp.x, bottom - gap / 2, wp.z);
    });
  }

  update(dt, t) {
    this.tickDemo();
    const cam = this.app.stage.camera;
    this._stakeT = (this._stakeT || 0) + dt;
    const doStakes = this._stakeT > 0.2;
    if (doStakes) this._stakeT = 0;
    for (const f of this.active) {
      if (doStakes) this.updateStakes(f);
      for (const u of f.updaters) u(dt, t);
      f.api.update?.(dt, t);
      f.root.traverse((o) => {
        const L = o.userData.label;
        if (L && L.billboard && o.visible) {
          // 面向相機（保持直立）
          const wp = o.getWorldPosition(new THREE.Vector3());
          const parentQ = o.parent.getWorldQuaternion(new THREE.Quaternion());
          const look = new THREE.Matrix4().lookAt(cam.position, wp, cam.up);
          const q = new THREE.Quaternion().setFromRotationMatrix(look);
          o.quaternion.copy(parentQ.invert().multiply(q));
        }
      });
      for (const s of f.spills) {
        if (!s.userData.src) continue;
        const wp = new THREE.Box3().setFromObject(s.userData.src).getCenter(new THREE.Vector3());
        s.position.set(wp.x, PAPER_Y + 0.0009, wp.z);
        s.material.uniforms.uK.value = s.userData.k * f.U.uRise.value;
      }
    }
  }

  // ---------- 示範 ----------
  // 按下紙籤後整段自動播放：每一步等動畫做完、鏡頭停妥，再停留 holdSeconds 秒，然後換下一步；最後一步停留完就結束。
  async startDemo(inst) {
    if (!inst || !inst.api.demo || !inst.api.demo.length) return;
    if (this.active.some((f) => f.state === 'hidden' || f.state === 'drawing')) return; // 這個跨頁還在描線
    // 示範前的鏡頭：接著示範另一張圖時沿用上一段記下的，結束時才還原
    const prev = this.demo;
    const pose = prev ? prev.pose : this.app.rig.snapshot();
    if (prev) await this.endDemo('switch');
    const d = this.demo = { inst, i: -1, seq: 0, starting: true, paused: false, phase: 'busy', hold: 0, busyT: 0, pose, log: [] };
    this.lastDemo = inst;
    this.lastLog = null; // 上一段示範每一步的紀錄（驗收用）
    this.syncTabs();
    // 同跨頁其他模型降回紙面
    await Promise.all(this.active.filter((f) => f !== inst).map((f) => this.lower(f)));
    if (this.demo !== d) return;
    if (!inst.raised) await this.raise(inst);
    if (this.demo !== d) return;
    d.starting = false;
    await this.stepDemo(1);
  }

  // 示範這個跨頁的下一張圖（依版面順序，最後一張之後回到第一張）
  startNext() {
    const list = this.active.filter((f) => f.api.demo?.length);
    if (!list.length) return;
    const k = list.indexOf(this.lastDemo);
    return this.startDemo(list[(k + 1) % list.length]);
  }

  // 暫停／繼續：暫停的是「自動換下一步」，正在做的動畫會做完
  togglePause(on) {
    const d = this.demo;
    if (!d) return;
    d.paused = on === undefined ? !d.paused : !!on;
    this.app.ui.demoState(d);
  }

  // 每格：倒數這一步的停留時間
  tickDemo() {
    const d = this.demo;
    if (!d || d.i < 0) return;
    // 用實際經過的時間倒數，不用每格的 dt：畫面更新慢的電腦上，每格的 dt 有上限，停留會被拖長
    const now = performance.now();
    const dt = Math.min(1, (now - (d.tickT ?? now)) / 1000); // 分頁被切到背景再回來時，最多只算 1 秒
    d.tickT = now;
    const rec = d.log[d.log.length - 1];
    if (d.phase === 'busy') {
      // 動畫的 Promise 遲遲不結束時不讓示範卡死（正常速度下每一步的動畫都遠短於這個上限）
      d.busyT += dt;
      if (d.busyT > (this.app.fast ? 3 : 30)) { d.phase = 'settle'; d.stuck = true; rec.stuck = true; }
      return;
    }
    if (d.phase === 'settle') { if (this.app.rig.settled()) { d.phase = 'hold'; rec.held = performance.now(); } return; }
    if (d.paused) return;
    d.hold -= dt;
    if (d.hold <= 0) this.stepDemo(1);
  }

  subjectBox(inst, subj) {
    const box = new THREE.Box3();
    const add = (o) => {
      if (!o) return;
      if (o.isBox3) { box.union(o); return; }
      o.updateWorldMatrix(true, true); // 連同上層一起更新：上層剛改過縮放或位置時，只更新自己會算出過期的範圍
      o.traverse((c) => {
        if (!c.visible) return;
        if ((c.isMesh || c.isInstancedMesh) && !c.userData.part && c.geometry) {
          if (c.isInstancedMesh) { const b = new THREE.Box3(); c.computeBoundingBox?.(); if (c.boundingBox) b.copy(c.boundingBox).applyMatrix4(c.matrixWorld); box.union(b); }
          else { c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld)); }
        }
      });
    };
    if (!subj) add(inst.root);
    else (Array.isArray(subj) ? subj : [subj]).forEach(add);
    if (box.isEmpty()) box.setFromCenterAndSize(inst.root.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0.3, 0.2, 0.3));
    box.min.y = Math.min(box.min.y, PAPER_Y);
    return box;
  }

  async stepDemo(delta) {
    const d = this.demo;
    if (!d || d.starting) return; // 其他模型還在降下、這張圖還沒升起時不換步
    const steps = d.inst.api.demo;
    const ni = d.i + delta;
    if (ni >= steps.length) { await this.endDemo(); return; }
    if (ni < 0) return;
    const now = performance.now();
    if (d.log.length) d.log[d.log.length - 1].end = now;
    d.i = ni;
    const seq = ++d.seq; // 每次進入一步都有新的序號：同一步被重新進入時，先前那次的 Promise 不能替這一次收尾
    d.log.push({ i: ni, start: now, held: 0, end: 0, stuck: false });
    const st = steps[ni];
    d.phase = 'busy'; d.busyT = 0; d.stuck = false;
    d.hold = holdSeconds(st) * (this.app.fast ? 0.06 : 1);
    this.app.ui.demoState(d);
    const run = st.do ? st.do(d.inst.kit) : null;
    // 取景：cam.after 為真時，等狀態設定（物件移動、開蓋）完成後再取景
    const cam = st.cam || {};
    const stale = () => this.demo !== d || d.seq !== seq;
    if (cam.after && run && run.then) { await run; if (stale()) return; }
    const frameIt = () => {
      const subj = typeof cam.subject === 'function' ? cam.subject() : cam.subject;
      const box = this.subjectBox(d.inst, subj);
      this.app.rig.frame(box, cam.az ?? 0, cam.el ?? 48, Math.max(1, cam.pad ?? 1.08)); // 邊界倍率小於 1 會讓主體超出畫面或被桌卡擋住
    };
    frameIt();
    const gen = this.app.rig.userGen;
    // 動畫做完後主體的範圍可能變了（東西升起、展開），再取景一次；範圍沒變時鏡頭不會動。
    // 老師在動畫進行中自己調過鏡頭時不再取景，以免把鏡頭搶回去
    if (!cam.after && run && run.then) { await run; if (stale()) return; if (this.app.rig.userGen === gen) frameIt(); }
    if (stale()) return;
    d.phase = 'settle'; // 接下來由 tickDemo 等鏡頭停妥、倒數停留時間
  }

  // mode：省略＝正常結束（鏡頭回到示範前、所有模型升回來）；'switch'＝接著示範另一張圖（鏡頭與其他模型都不動）；
  //       'leave'＝要翻頁了（鏡頭回到示範前，模型不用升回來）
  async endDemo(mode) {
    const d = this.demo;
    if (!d) return;
    this.demo = null;
    if (d.log.length) d.log[d.log.length - 1].end = performance.now();
    this.lastLog = d.log;
    d.inst.api.demoEnd?.(d.inst.kit);
    if (mode !== 'switch') this.app.rig.restore(d.pose);
    this.app.ui.demoState(null);
    this.syncTabs();
    // 連同這張圖自己：示範可能在它還沒升起（剛從別張圖換過來）時就被結束
    if (!mode) await Promise.all(this.active.filter((f) => f.state !== 'up').map((f) => this.raise(f)));
  }

  // 世界座標的灑光
  addSpill(inst, obj, key, radius = 0.22, k = 0.6) {
    const s = spillDecal(radius);
    s.material.uniforms.uCol.value.copy(color(CONCEPT[key] ? CONCEPT[key].color : key));
    s.userData.src = obj; s.userData.k = k;
    this.group.add(s);
    inst.spills.push(s);
    return s;
  }
}
