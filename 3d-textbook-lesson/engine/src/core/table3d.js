// 立體表格：每個儲存格是一塊紙板，表頭較矮（表名與「示範」紙籤就在表頭後方，表頭高了會擋住紙籤）；示範時逐列浮起聚焦
import * as THREE from 'three';
import { WPT, INK, PAPER } from './config.js';
import { flatMaterial, inkMaterial, outline, depthMaterial } from './ink.js';

export function tableModule(app, id, r) {
  return {
    id,
    build(k) {
      const L = r.layout, b = r.block;
      const cells = [];
      const rows = new Map();
      const W = L.w, Hh = L.h;
      for (const c of L.cells) {
        const head = c.head;
        const th = head ? 0.009 : 0.018;
        const w = c.w * WPT - 0.004, d = c.h * WPT - 0.004;
        const geo = new THREE.BoxGeometry(w, th, d);
        geo.translate(0, th / 2, 0);
        const cv = app.renderer.cellCanvas(b, c, L, app.state, 5);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        const top = flatMaterial({ map: tex, roughness: 0.95, metalness: 0, envMapIntensity: 0.2 }, k.U);
        const side = inkMaterial({ U: k.U, wash: head ? '#e3dccb' : (c.teacher ? '#f0d6d0' : PAPER), hatch: 0.8 });
        const mats = [side, side, top, side, side, side];
        const m = new THREE.Mesh(geo, mats);
        m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = depthMaterial(k.U);
        outline(m, k.U, { edgeAngle: 30, hull: false, lineW: 1.1 });
        m.position.set((c.x + c.w / 2 - W / 2) * WPT, 0, (c.y + c.h / 2 - Hh / 2) * WPT);
        m.userData.cell = c; m.userData.baseY = 0;
        m.visible = !c.teacher || app.state.teacher;
        k.root.add(m);
        cells.push(m);
        if (!rows.has(c.r)) rows.set(c.r, []);
        rows.get(c.r).push(m);
      }
      // 升起時蓋住頁面上印刷的同一張表，避免浮起的列露出底下的重複文字
      const cover = new THREE.Mesh(new THREE.PlaneGeometry(W * WPT + 0.01, Hh * WPT + 0.01), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.95 }));
      cover.rotation.x = -Math.PI / 2; cover.position.y = 0.0012; cover.receiveShadow = true; cover.raycast = () => {};
      k.root.add(cover);
      k.onUpdate(() => { cover.visible = k.U.uRise.value > 0.6; });
      const rowIdx = [...rows.keys()].sort((a, b2) => a - b2);
      const bodyRows = rowIdx.filter((ri) => !rows.get(ri).some((m) => m.userData.cell.head));
      const rowText = (ri) => rows.get(ri).filter((m) => m.visible).sort((a, b2) => a.userData.cell.c - b2.userData.cell.c).map((m) => b.rows[ri - (b.cols && b.cols.length ? 1 : 0)]?.[m.userData.cell.c] ?? '').map((s) => String(s).replace(/\{([^|}]+)\|[^}]+\}/g, '$1').replace(/\n/g, '')).filter(Boolean).join('　');
      const setFocus = (ri) => {
        for (const [r2, ms] of rows) for (const m of ms) {
          const up = r2 === ri;
          k.tween(m.position, { y: up ? 0.028 : 0 }, 0.45);
          if (up) k.glow(m, '#2b6c8f', 0.35, false); else k.unglow(m);
        }
      };
      const demo = bodyRows.map((ri) => ({
        say: rowText(ri),
        cam: { subject: () => rows.get(ri).concat(rows.get(rowIdx[0]) || []), az: 0, el: 50, pad: 1.15 },
        do: () => setFocus(ri),
      }));
      return {
        demo,
        demoEnd: () => setFocus(-1),
        reset: () => { for (const m of cells) { m.position.y = 0; k.unglow(m); } },
        refresh: () => { for (const m of cells) m.visible = !m.userData.cell.teacher || app.state.teacher; },
      };
    },
  };
}
