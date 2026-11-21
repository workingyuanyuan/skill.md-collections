// 示範時立在書頁上的桌卡
// 卡面內容是真正的 HTML（CSS 3D 變換對齊相機），文字清楚；卡上沒有按鈕，點一下卡片是暫停／繼續。
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { PAPER_Y } from './config.js';
import { paperCssUrl } from './paperfx.js';

const ZOOM = 2;               // 內部以兩倍解析度排版，拉近時仍清楚

export class PaperLayer {
  constructor(stage) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    const r = this.renderer = new CSS3DRenderer();
    const el = r.domElement;
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    stage.container.append(el);
    el.addEventListener('scroll', () => { el.scrollTop = 0; el.scrollLeft = 0; }, true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() { this.renderer.setSize(this.stage.w, this.stage.h); }
  render() { this.renderer.render(this.scene, this.stage.camera); }
}

// ---------- 示範桌卡 ----------
const CARD_PX = 700;
export class DeskCard {
  constructor(layer, stage) {
    this.stage = stage;
    this.el = document.createElement('div');
    this.el.className = 'deskcard';
    this.el.title = '點一下：暫停／繼續（空白鍵）';
    this.inner = document.createElement('div');
    this.inner.className = 'dc-in';
    this.inner.style.zoom = ZOOM;
    this.inner.style.backgroundImage = paperCssUrl();
    this.num = document.createElement('div'); this.num.className = 'dc-num';
    this.say = document.createElement('div'); this.say.className = 'dc-say';
    this.seal = document.createElement('div'); this.seal.className = 'dc-seal'; this.seal.textContent = '暫停';
    this.inner.append(this.num, this.say, this.seal);
    this.el.append(this.inner);
    this.obj = new CSS3DObject(this.el);
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.pivot.add(this.obj);
    layer.scene.add(this.pivot);
    layer.render(); this.pivot.visible = false; layer.render();
    this.rc = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAPER_Y);
    this.key = null;
  }

  // i：第幾步（從 0 起）、n：總步數、text：這一步的說明、paused：是否暫停
  show(i, n, text, paused) {
    const key = i + '/' + n + '/' + text;
    if (key !== this.key) {
      this.key = key;
      this.num.innerHTML = `<b>${i + 1}</b><span>／${n}</span>`;
      this.say.textContent = text;
      this.pivot.visible = true;
      this.el.style.display = '';
      // 字多時縮小
      const say = this.say;
      say.style.fontSize = '';
      let fs = 26;
      while (say.scrollHeight > say.clientHeight + 1 && fs > 16) { fs -= 1.5; say.style.fontSize = fs + 'px'; }
    }
    this.pivot.visible = true;
    this.el.classList.toggle('paused', !!paused);
  }
  hide() { this.pivot.visible = false; this.key = null; }
  get visible() { return this.pivot.visible; }

  // 每格：放在畫面下方、書頁上，面向相機略往後仰，畫面上的大小固定
  place(cam) {
    if (!this.pivot.visible) return;
    this.rc.setFromCamera(new THREE.Vector2(0, -0.66), cam);
    const p = new THREE.Vector3();
    if (!this.rc.ray.intersectPlane(this.plane, p)) return;
    const d = cam.position.distanceTo(p);
    const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * d;
    const w = Math.min(viewH * cam.aspect * 0.5, viewH * 1.9);
    const hPx = this.el.offsetHeight || 300, wPx = this.el.offsetWidth || CARD_PX * ZOOM;
    const s = w / wPx;
    this.pivot.position.copy(p);
    const dx = cam.position.x - p.x, dz = cam.position.z - p.z;
    const yaw = Math.atan2(dx, dz);
    const elev = Math.atan2(cam.position.y - p.y, Math.hypot(dx, dz));
    this.pivot.rotation.set(-Math.min(1.25, elev * 0.7 + 0.1), yaw, 0);
    this.obj.scale.setScalar(s);
    this.obj.position.set(0, (hPx * s) / 2, 0);
  }
}

export const PAPER_CSS = /* css */`
.deskcard{width:${CARD_PX * ZOOM}px;cursor:pointer;user-select:none;}
.deskcard .dc-in{position:relative;width:${CARD_PX}px;box-sizing:border-box;display:flex;align-items:center;gap:18px;padding:14px 22px 14px 16px;
  background-color:#f3ead8;background-size:360px 240px;border:2px solid var(--ink);border-radius:9px;
  box-shadow:0 8px 0 -3px #d9ccb0,0 10px 18px rgba(30,15,0,.35);}
.dc-num{flex:none;width:62px;height:62px;border:2.5px solid var(--verm);border-radius:50%;color:var(--verm);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;font-family:"NSerif",serif;}
.dc-num b{font-size:27px;} .dc-num span{font-size:13px;margin-top:2px;}
.dc-say{flex:1;font:500 26px/1.42 "WKai",cursive;max-height:${26 * 1.42 * 3 + 2}px;overflow:hidden;line-break:strict;}
/* 暫停時蓋在卡片右上角的朱印 */
.dc-seal{display:none;position:absolute;right:-14px;top:-20px;padding:3px 9px 4px;border:2.5px solid var(--verm);border-radius:6px;color:var(--verm);
  background:#f6efe0;font:700 19px "NSerif",serif;letter-spacing:3px;transform:rotate(7deg);box-shadow:0 2px 5px rgba(30,15,0,.3);}
.deskcard.paused .dc-seal{display:block;}
.deskcard.paused .dc-num{opacity:.55;}
`;
