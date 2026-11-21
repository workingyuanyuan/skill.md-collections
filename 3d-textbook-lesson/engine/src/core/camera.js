// 相機：閱讀視角、拖曳環視回正、滾輪朝游標拉近、雙擊聚焦、示範取景
import * as THREE from 'three';
import { PAPER_Y } from './config.js';

const D2R = Math.PI / 180;
export const VIEWS = {
  stereo: { name: '立體', el: 52, az: 0 },
  top: { name: '俯視', el: 89.4, az: 0 },
  low: { name: '低角度', el: 25, az: 0 },
};

const BOOK_BOX = new THREE.Box3(new THREE.Vector3(-1.62, 0, -1.12), new THREE.Vector3(1.62, PAPER_Y + 0.3, 1.12));
const READ_SAFE = { x0: -0.78, x1: 0.78, y0: -0.7, y1: 0.78 };

export class CameraRig {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.view = 'stereo';
    this.baseTarget = new THREE.Vector3(0, PAPER_Y, 0.05);
    // 目前值與目標值
    this.cur = { target: this.baseTarget.clone(), dist: 6.2, az: 0, el: 52 };
    this.goal = { target: this.baseTarget.clone(), dist: 6.2, az: 0, el: 52 };
    this.orbit = { az: 0, el: 0 };      // 拖曳的暫時偏移
    this.mode = 'read';                 // read | focus | demo
    this.userGen = 0;                   // 老師每手動調整一次鏡頭（視角、距離、聚焦、回預設）就加一
    this.back = null;                   // 離開閱讀模式前的鏡頭，回來時還原
    this.safe = { x0: -0.86, x1: 0.86, y0: -0.28, y1: 0.86 }; // 示範取景安全範圍（NDC；下方留給桌卡與工具列，桌卡上緣約在 -0.3）
    this.speed = 3.2;
    this.fitDefault();
  }

  // 預設距離：以立體視角讓書本周圍留出桌面；切換視角沿用同一距離
  fitDefault() {
    const v = VIEWS.stereo;
    this.defaultDist = this.fitDist(BOOK_BOX, v.az, v.el, READ_SAFE).dist;
  }

  // 書本置中於閱讀安全範圍時的目標點
  aimBook(d) {
    const v = VIEWS[this.view];
    return this.aim(BOOK_BOX, v.az, v.el, d, READ_SAFE);
  }

  // 切換閱讀視角：只改角度，維持目前距離
  setView(v) {
    this.userGen++;
    if (v) this.view = v;
    if (this.mode === 'demo') { this.home(); return; }
    this.goal.az = VIEWS[this.view].az; this.goal.el = VIEWS[this.view].el;
    if (this.mode === 'read') this.goal.target.copy(this.aimBook(this.goal.dist));
  }

  // 回到預設距離與位置
  home() {
    this.userGen++;
    this.mode = 'read'; this.back = null;
    this.goal.az = VIEWS[this.view].az; this.goal.el = VIEWS[this.view].el;
    this.goal.dist = this.defaultDist;
    this.goal.target.copy(this.aimBook(this.goal.dist));
  }

  saveBack() {
    if (this.mode === 'read') this.back = { target: this.goal.target.clone(), dist: this.goal.dist, az: this.goal.az, el: this.goal.el };
  }

  // 回到離開閱讀模式前的鏡頭
  release() {
    this.userGen++;
    const b = this.back;
    if (!b) { this.home(); return; }
    this.mode = 'read'; this.back = null;
    this.goal.dist = b.dist; this.goal.az = VIEWS[this.view].az; this.goal.el = VIEWS[this.view].el;
    this.goal.target.copy(this.aimBook(b.dist));
  }

  place(cam, target, dist, azDeg, elDeg) {
    const el = elDeg * D2R, az = azDeg * D2R;
    cam.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az));
    cam.up.set(0, 1, 0);
    if (elDeg > 89) cam.up.set(-Math.sin(az), 0, -Math.cos(az));
    cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  }

  zoomBy(k, ndc) {
    this.userGen++;
    const old = this.goal.dist;
    const minD = this.defaultDist * 0.22, maxD = this.defaultDist * 1.7;
    const nd = THREE.MathUtils.clamp(old * k, minD, maxD);
    if (this.mode === 'read' && Math.abs(nd - old) > 1e-3 && ndc) { this.saveBack(); this.mode = 'focus'; }
    if (ndc) {
      const hit = this.hitPaper(ndc);
      if (hit) {
        const f = 1 - nd / old;
        this.goal.target.lerp(hit, f);
        this.goal.target.y = PAPER_Y;
      }
    }
    this.goal.dist = nd;
  }

  hitPaper(ndc) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.cam);
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAPER_Y);
    const p = new THREE.Vector3();
    return rc.ray.intersectPlane(pl, p) ? p : null;
  }

  focusAt(point) {
    this.userGen++;
    this.saveBack();
    this.mode = 'focus';
    this.goal.target.copy(point); this.goal.target.y = PAPER_Y;
    this.goal.dist = this.defaultDist * 0.42;
  }

  // 依包圍盒計算可完整入鏡的距離：每個候選距離都讓包圍盒中心落在安全區中心，再檢查八個角
  fitDist(box, azDeg, elDeg, safe = this.safe) {
    const c = box.getCenter(new THREE.Vector3());
    const cam = this.cam.clone();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const el = elDeg * D2R, az = azDeg * D2R;
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const wantX = (safe.x0 + safe.x1) / 2, wantY = (safe.y0 + safe.y1) / 2;
    const tgt = new THREE.Vector3();
    const place = (d) => {
      cam.up.set(0, 1, 0);
      if (elDeg > 89) cam.up.set(-Math.sin(az), 0, -Math.cos(az));
      cam.position.copy(c).addScaledVector(dir, d); cam.lookAt(c); cam.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const halfH = Math.tan(cam.fov * D2R / 2) * d, halfW = halfH * cam.aspect;
      tgt.copy(c).addScaledVector(right, -wantX * halfW).addScaledVector(upv, -wantY * halfH);
      cam.position.copy(tgt).addScaledVector(dir, d); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    };
    const fits = (d) => {
      place(d);
      for (const p of corners) {
        const q = p.clone().project(cam);
        if (q.z > 1 || q.z < -1 || q.x < safe.x0 || q.x > safe.x1 || q.y < safe.y0 || q.y > safe.y1) return false;
      }
      return true;
    };
    let lo = 0.15, hi = 60;
    for (let i = 0; i < 44; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    place(hi);
    return { dist: hi, target: tgt.clone() };
  }

  // 指定距離時，讓包圍盒中心落在安全範圍中心的目標點
  aim(box, azDeg, elDeg, d, safe) {
    const c = box.getCenter(new THREE.Vector3());
    const cam = this.cam.clone();
    this.place(cam, c, d, azDeg, elDeg);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const halfH = Math.tan(cam.fov * D2R / 2) * d, halfW = halfH * cam.aspect;
    return c.addScaledVector(right, -(safe.x0 + safe.x1) / 2 * halfW).addScaledVector(upv, -(safe.y0 + safe.y1) / 2 * halfH);
  }

  // 示範開始前的鏡頭。示範不論怎麼結束（播完、Esc、點紙籤、翻頁）都用 restore 還原成這個樣子
  snapshot() {
    const b = this.back;
    return { mode: this.mode === 'demo' ? 'read' : this.mode, view: this.view, target: this.goal.target.clone(), dist: this.goal.dist,
      back: b ? { target: b.target.clone(), dist: b.dist, az: b.az, el: b.el } : null };
  }
  // 角度用目前選的閱讀視角（示範中換過視角就照新的），距離與位置照示範前
  restore(s) {
    this.userGen++;
    this.mode = s.mode; this.back = s.back;
    this.goal.az = VIEWS[this.view].az; this.goal.el = VIEWS[this.view].el;
    this.goal.dist = s.dist;
    // 示範中換過閱讀視角時，書要依新的角度重新對準；沒換過就原樣放回去
    if (s.mode === 'read' && s.view !== this.view) this.goal.target.copy(this.aimBook(s.dist)); else this.goal.target.copy(s.target);
  }

  // 示範取景：box 為世界座標包圍盒；讓它完整落在安全範圍（桌卡與工具列之上）內
  frame(box, az = 0, el = 45, pad = 1.0) {
    const b = box.clone();
    if (pad !== 1) { const c = b.getCenter(new THREE.Vector3()); const s = b.getSize(new THREE.Vector3()).multiplyScalar(pad / 2); b.set(c.clone().sub(s), c.clone().add(s)); }
    const r = this.fitDist(b, az, el, this.safe);
    this.mode = 'demo';
    this.goal.target.copy(r.target); this.goal.dist = r.dist; this.goal.az = az; this.goal.el = el;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * this.speed);
    const c = this.cur, g = this.goal;
    c.target.lerp(g.target, k);
    c.dist += (g.dist - c.dist) * k;
    c.az += (g.az - c.az) * k;
    c.el += (g.el - c.el) * k;
    const kk = 1 - Math.exp(-dt * 6);
    if (!this.dragging) { this.orbit.az *= 1 - kk; this.orbit.el *= 1 - kk; }
    const az = (c.az + this.orbit.az) * D2R, el = THREE.MathUtils.clamp(c.el + this.orbit.el, 8, 89.4) * D2R;
    const t = c.target;
    this.cam.position.set(t.x + c.dist * Math.cos(el) * Math.sin(az), t.y + c.dist * Math.sin(el), t.z + c.dist * Math.cos(el) * Math.cos(az));
    if (el > 89 * D2R) this.cam.up.set(-Math.sin(az), 0, -Math.cos(az)); else this.cam.up.set(0, 1, 0);
    this.cam.lookAt(t);
    this.cam.updateMatrixWorld();
  }

  settled() {
    const c = this.cur, g = this.goal;
    return c.target.distanceTo(g.target) < 0.002 && Math.abs(c.dist - g.dist) < 0.004 && Math.abs(c.az - g.az) < 0.1 && Math.abs(c.el - g.el) < 0.1;
  }
  snap() { const c = this.cur, g = this.goal; c.target.copy(g.target); c.dist = g.dist; c.az = g.az; c.el = g.el; this.orbit.az = this.orbit.el = 0; this.update(0); }
}
