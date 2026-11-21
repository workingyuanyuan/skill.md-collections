// 精裝書：書板、書背、堵頭布、書頁堆、翻頁
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { drawPaper, paperBump } from './paperfx.js';
import { PAGE_W as W, PAGE_H as H, BLOCK_H, BOARD_T, PAPER_Y, PT_W, PT_H, TEX_SCALE, PAPER, INK, FONT, FIRST_PAGE, LAST_PAGE } from './config.js';
import { CHAPTER } from '../content/chapter.js';

const OVER = 0.035; // 書板比書頁多出的邊
export const SPREADS = (() => {
  const s = [['blank', 'title']];
  for (let p = FIRST_PAGE; p <= LAST_PAGE; p += 2) s.push([p, p + 1]);
  return s;
})();

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function clothTextures() {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#26405a'; ctx.fillRect(0, 0, S, S);
  const nv = document.createElement('canvas'); nv.width = nv.height = S;
  const n = nv.getContext('2d');
  n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) {
    const over = ((x >> 2) + (y >> 2)) % 2 === 0;
    const v = 0.85 + Math.random() * 0.25;
    ctx.fillStyle = `rgba(${Math.round(38 * v)},${Math.round(64 * v)},${Math.round(92 * v)},1)`;
    ctx.fillRect(x, y, 4, 4);
    n.fillStyle = over ? 'rgb(170,128,230)' : 'rgb(128,170,230)'; n.fillRect(x, y, 2, 4);
    n.fillStyle = over ? 'rgb(90,128,230)' : 'rgb(128,90,230)'; n.fillRect(x + 2, y, 2, 4);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  const nm = new THREE.CanvasTexture(nv);
  for (const t of [map, nm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 8); t.anisotropy = 8; }
  return { map, nm };
}

function edgeTexture(horizontal) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#efe6d2'; ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(120,100,70,${0.12 + Math.random() * 0.2})`;
    ctx.fillRect(0, y, 64, 0.8);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function titleAlpha() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1400;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 1400);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6; ctx.strokeRect(70, 70, 884, 1260); ctx.lineWidth = 2; ctx.strokeRect(92, 92, 840, 1216);
  ctx.textAlign = 'center';
  // 字太長時縮小字級，寬度不超過框線內 820px
  const fit = (text, weight, px, y) => {
    let size = px;
    do { ctx.font = `${weight} ${size}px ${FONT.serif}`; size -= 2; } while (ctx.measureText(text).width > 820 && size > 20);
    ctx.fillText(text, 512, y);
  };
  fit(CHAPTER.book, 700, 104, 470);
  if (CHAPTER.volume) fit(CHAPTER.volume, 700, 70, 580);
  ctx.fillRect(330, 660, 364, 3);
  fit(CHAPTER.label, 500, 52, 790);
  fit(CHAPTER.title, 500, 50, 870);
  const t = new THREE.CanvasTexture(cv);
  return t;
}

export class Book {
  constructor(stage, pageSource) {
    this.stage = stage;
    this.src = pageSource; // (pageKey) => canvas
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.spread = 0;
    this.openT = 0; // 0 闔上，1 攤開
    this.busy = false;
    this.texCache = new Map();
    this.build();
    this.setOpen(0);
  }

  build() {
    const g = this.group;
    const BUMP = 2.2; // 紙面凹凸的強度
    const cloth = clothTextures();
    const clothMat = new THREE.MeshPhysicalMaterial({ map: cloth.map, normalMap: cloth.nm, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.78, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#8aa4c8'), envMapIntensity: 0.6 });
    this.clothMat = clothMat;
    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTexture(), roughness: 0.9 });
    const paperMat = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.95 });
    const boardGeo = new RoundedBoxGeometry(W + OVER, BOARD_T, H + OVER * 2, 2, 0.008);

    // 背板（右）
    const back = new THREE.Mesh(boardGeo, clothMat);
    back.position.set((W + OVER) / 2, BOARD_T / 2 + 0.0006, 0);
    back.castShadow = back.receiveShadow = true;
    g.add(back);
    // 右書頁堆
    const blockMats = [edgeMat, paperMat, paperMat, paperMat, edgeMat, edgeMat];
    const blockGeo = new THREE.BoxGeometry(W - 0.004, BLOCK_H, H);
    this.fixEdgeUV(blockGeo);
    const rb = new THREE.Mesh(blockGeo, blockMats);
    rb.position.set(W / 2 + 0.002, BOARD_T + BLOCK_H / 2, 0);
    rb.castShadow = rb.receiveShadow = true;
    g.add(rb);

    // 旋轉單元（前板＋左書頁堆），樞紐在書溝 (x=0, y=PAPER_Y)
    const pivot = this.pivot = new THREE.Group();
    pivot.position.set(0, PAPER_Y, 0);
    g.add(pivot);
    const inner = new THREE.Group(); inner.position.set(0, -PAPER_Y, 0); pivot.add(inner);
    const front = new THREE.Mesh(boardGeo, clothMat);
    front.position.set(-(W + OVER) / 2, BOARD_T / 2 + 0.0006, 0);
    front.castShadow = front.receiveShadow = true;
    inner.add(front);
    const lb = new THREE.Mesh(blockGeo, [edgeMat, edgeMat, paperMat, paperMat, edgeMat, edgeMat]);
    lb.position.set(-W / 2 - 0.002, BOARD_T + BLOCK_H / 2, 0);
    lb.castShadow = lb.receiveShadow = true;
    inner.add(lb);
    // 封面燙金（前板外側：攤開時朝下）
    const gold = new THREE.MeshStandardMaterial({ color: '#d8b25a', metalness: 1, roughness: 0.32, alphaMap: titleAlpha(), transparent: true, alphaTest: 0.4, envMapIntensity: 1.6 });
    const tplane = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, W * 0.86 * 1400 / 1024), gold);
    // 闔上時面朝上、文字正向：繞 z 轉 π 之後 (x,y)->(-x,-y)
    tplane.rotation.set(Math.PI / 2, 0, Math.PI); // 面朝 -y
    tplane.position.set(-(W + OVER) / 2, -0.0004, -0.02);
    inner.add(tplane);

    // 頁面網格
    this.pageGeo = new THREE.PlaneGeometry(W, H);
    this.pageGeo.rotateX(-Math.PI / 2);
    const mk = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, envMapIntensity: 0.2, bumpMap: paperBump(), bumpScale: BUMP });
    this.rightPage = new THREE.Mesh(this.pageGeo, mk());
    this.rightPage.position.set(W / 2, PAPER_Y + 0.0004, 0);
    this.rightPage.receiveShadow = true; this.rightPage.userData.side = 'R';
    g.add(this.rightPage);
    this.leftPage = new THREE.Mesh(this.pageGeo, mk());
    this.leftPage.position.set(-W / 2, PAPER_Y + 0.0004, 0);
    this.leftPage.receiveShadow = true; this.leftPage.userData.side = 'L';
    inner.add(this.leftPage);

    // 書背（闔上時看得到的弧形布面）
    this.spineGeo = new THREE.BufferGeometry();
    this.spine = new THREE.Mesh(this.spineGeo, clothMat);
    this.spine.castShadow = true;
    g.add(this.spine);
    // 堵頭布
    const hbTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'); for (let i = 0; i < 64; i += 4) { x.fillStyle = (i / 4) % 2 ? '#8b2a2a' : '#e8d9b0'; x.fillRect(i, 0, 4, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })();
    this.headbands = [];
    for (const zs of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(0, PAPER_Y, zs * (H / 2 - 0.004));
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.075, 12), new THREE.MeshStandardMaterial({ map: hbTex, roughness: 0.6 }));
      hb.rotation.z = Math.PI / 2; hb.position.set(0, -0.012, 0);
      hp.add(hb); g.add(hp); this.headbands.push(hp);
    }

    // 翻動中的書頁
    const SEG = 48, ROWS = 6;
    const lg = new THREE.PlaneGeometry(W, H, SEG, ROWS);
    lg.rotateX(-Math.PI / 2); lg.translate(W / 2, 0, 0);
    this.leafBase = lg.attributes.position.array.slice();
    this.leafGeo = lg;
    lg.computeVertexNormals();
    // 背面：共用位置與法線，u 鏡像（翻到左側時書溝在右緣）
    const backGeo = new THREE.BufferGeometry();
    backGeo.setAttribute('position', lg.attributes.position);
    backGeo.setAttribute('normal', lg.attributes.normal);
    const buv = lg.attributes.uv.array.slice();
    for (let i = 0; i < buv.length; i += 2) buv[i] = 1 - buv[i];
    backGeo.setAttribute('uv', new THREE.BufferAttribute(buv, 2));
    backGeo.setIndex(lg.index);
    this.leafFront = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, side: THREE.FrontSide, envMapIntensity: 0.2, bumpMap: paperBump(), bumpScale: BUMP }));
    this.leafBack = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, side: THREE.BackSide, envMapIntensity: 0.2, bumpMap: paperBump(), bumpScale: BUMP }));
    for (const m of [this.leafFront, this.leafBack]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.visible = false; m.position.y = PAPER_Y + 0.0012; g.add(m); }
    this.leafSeg = SEG; this.leafRows = ROWS;
  }

  fixEdgeUV(geo) {
    // 書口紋理：讓紙層線條沿頁面方向
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * 1);
  }

  texFor(key) {
    let t = this.texCache.get(key);
    if (!t) {
      const cv = this.src(key);
      t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.stage.renderer.capabilities.getMaxAnisotropy();
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      this.texCache.set(key, t);
      // 快取上限
      if (this.texCache.size > 8) {
        const keep = new Set(SPREADS[this.spread].concat(SPREADS[Math.max(0, this.spread - 1)], SPREADS[Math.min(SPREADS.length - 1, this.spread + 1)]).map(String));
        for (const [k, v] of this.texCache) if (!keep.has(String(k)) && this.texCache.size > 8) { v.dispose(); this.texCache.delete(k); }
      }
    }
    return t;
  }
  // 頁面內容變更（答案、教師註解）後重繪
  refresh(key) {
    const t = this.texCache.get(key);
    if (!t) return;
    this.src(key, t.image);
    t.needsUpdate = true;
  }
  refreshAll() { for (const k of this.texCache.keys()) this.refresh(k); }
  setMap(mesh, key, flipX = false) {
    const t = this.texFor(key);
    mesh.material.map = t; mesh.material.needsUpdate = true;
    mesh.userData.page = key;
  }

  showSpread(i) {
    const [l, r] = SPREADS[i];
    this.setMap(this.leftPage, l);
    this.setMap(this.rightPage, r);
  }

  // 開書程度：0 闔上，1 攤開
  setOpen(t) {
    this.openT = t;
    const ang = (1 - t) * -Math.PI; // 闔上：繞 z 轉 -π（向右蓋上）
    this.pivot.rotation.z = ang;
    for (const hp of this.headbands) hp.rotation.z = ang / 2;
    // 書背弧面：連接背板左緣 A=(0,0) 與前板左緣 B
    const B = new THREE.Vector2(0, 0).sub(new THREE.Vector2(0, PAPER_Y)).rotateAround(new THREE.Vector2(), ang).add(new THREE.Vector2(0, PAPER_Y));
    const A = new THREE.Vector2(0, 0);
    const mid = A.clone().add(B).multiplyScalar(0.5), d = B.clone().sub(A), len = d.length();
    const pos = [], idx = [];
    const N = 24;
    if (len > 0.01) {
      const nrm = new THREE.Vector2(-d.y, d.x).normalize();
      if (nrm.x > 0) nrm.negate();
      const r = len / 2;
      for (let i = 0; i <= N; i++) {
        const a = Math.PI * i / N;
        const p = mid.clone().add(d.clone().normalize().multiplyScalar(-Math.cos(a) * r)).add(nrm.clone().multiplyScalar(Math.sin(a) * (r + 0.01)));
        for (const z of [-H / 2 - OVER, H / 2 + OVER]) pos.push(p.x, p.y, z);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    this.spineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.spineGeo.setIndex(idx);
    this.spineGeo.computeVertexNormals();
    this.spine.visible = len > 0.01;
  }

  async open(dur = 1.8) {
    this.showSpread(0);
    await this.anim(dur, (t) => this.setOpen(ease(t)));
    this.setOpen(1);
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

  // 書頁彎曲：theta 0（平放右側）→ π（平放左側）
  curl(theta, dir) {
    const p = this.leafGeo.attributes.position;
    const base = this.leafBase;
    const S = this.leafSeg, R = this.leafRows;
    const lag = 0.95 * Math.sin(theta);
    for (let r = 0; r <= R; r++) {
      let x = 0, y = 0;
      const zrow = base[(r * (S + 1)) * 3 + 2];
      const zt = zrow / H; // -0.5..0.5
      for (let c = 0; c <= S; c++) {
        const i = r * (S + 1) + c;
        const s = c / S;
        if (c > 0) {
          const sm = (c - 0.5) / S;
          let phi = theta - dir * lag * Math.pow(sm, 1.25) * (1 + 0.35 * zt * dir);
          phi = Math.min(Math.PI, Math.max(0, phi));
          const ds = W / S;
          x += Math.cos(phi) * ds; y += Math.sin(phi) * ds;
        }
        p.setXYZ(i, x, y + s * 0.0, zrow);
      }
    }
    p.needsUpdate = true;
    this.leafGeo.computeVertexNormals();
  }

  /** 翻到指定跨頁；beforeTurn/afterTurn 由外部處理模型降下與升起 */
  async turnTo(target, dur = 1.0) {
    target = Math.max(0, Math.min(SPREADS.length - 1, target));
    if (target === this.spread || this.busy) return false;
    this.busy = true;
    while (this.spread !== target) {
      const fwd = target > this.spread;
      const from = this.spread, to = from + (fwd ? 1 : -1);
      const [fl, fr] = SPREADS[from], [tl, tr] = SPREADS[to];
      const steps = Math.abs(target - this.spread);
      const d = steps > 1 ? Math.max(0.35, dur * 0.55) : dur;
      if (fwd) {
        this.setMap(this.leafFront, fr); this.setMap(this.leafBack, tl);
        this.setMap(this.rightPage, tr);
      } else {
        this.setMap(this.leafFront, tr); this.setMap(this.leafBack, fl);
        this.setMap(this.leftPage, tl);
      }
      this.leafFront.visible = this.leafBack.visible = true;
      this.curl(fwd ? 0 : Math.PI, fwd ? 1 : -1);
      await this.anim(d, (t) => {
        const e = ease(t);
        this.curl(fwd ? e * Math.PI : (1 - e) * Math.PI, fwd ? 1 : -1);
      });
      if (fwd) this.setMap(this.leftPage, tl); else this.setMap(this.rightPage, tr);
      this.leafFront.visible = this.leafBack.visible = false;
      this.spread = to;
    }
    this.busy = false;
    return true;
  }

  // 依跨頁取得頁面中心（世界座標）
  pageOrigin(side) { return new THREE.Vector3(side === 'L' ? -W : 0, PAPER_Y, -H / 2); }
  // pt 座標 → 世界座標（頁面左上角為原點）
  ptToWorld(side, x, y) {
    const o = this.pageOrigin(side);
    return new THREE.Vector3(o.x + (x / PT_W) * W, PAPER_Y, o.z + (y / PT_H) * H);
  }
  sideOfPage(num) { const [l, r] = SPREADS[this.spread]; return num === l ? 'L' : num === r ? 'R' : null; }
}

// 扉頁與空白頁
export function specialPage(key, canvas) {
  canvas = canvas || document.createElement('canvas');
  canvas.width = Math.round(PT_W * TEX_SCALE); canvas.height = Math.round(PT_H * TEX_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  drawPaper(ctx, PT_W, PT_H, key === 'title' ? 31 : 77);
  if (key === 'title') {
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    ctx.font = `400 14px ${FONT.serif}`; ctx.fillText(CHAPTER.book + (CHAPTER.volume || ''), PT_W / 2, 250);
    ctx.fillStyle = '#9a3b2a'; ctx.font = `700 60px ${FONT.sans}`; ctx.fillText(CHAPTER.number, PT_W / 2, 350);
    ctx.fillStyle = INK; ctx.font = `700 28px ${FONT.serif}`;
    const lines = CHAPTER.titleLines || [CHAPTER.title];
    lines.forEach((t, i) => ctx.fillText(t, PT_W / 2, 410 + 40 * i));
    const ry = 400 + 40 * lines.length;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(PT_W / 2 - 60, ry); ctx.lineTo(PT_W / 2 + 60, ry); ctx.stroke();
    ctx.font = `400 12px ${FONT.serif}`;
    const secs = CHAPTER.sections || [];
    const gap = Math.min(25, (PT_H - 70 - (ry + 40)) / Math.max(1, secs.length - 1));
    secs.forEach((t, i) => ctx.fillText(t, PT_W / 2, ry + 40 + gap * i));
  }
  const g = ctx.createLinearGradient(key === 'blank' ? PT_W : 0, 0, key === 'blank' ? PT_W - 40 : 40, 0);
  g.addColorStop(0, 'rgba(90,70,40,0.16)'); g.addColorStop(1, 'rgba(90,70,40,0)');
  ctx.fillStyle = g; ctx.fillRect(key === 'blank' ? PT_W - 40 : 0, 0, 40, PT_H);
  return canvas;
}
