// 圖5-2 系統平台的運作流程：輸入 → 處理 → 輸出
// 立體化：一座「系統平台」處理站，左側輸入輸送帶送進資料方塊，中央處理器（齒輪）運轉，右側輸出輸送帶送出。
export default {
  id: 'fig5-2',
  build(k) {
    const { THREE } = k;
    const W = k.size.w, D = k.size.d;
    const hub = new THREE.Group();
    k.add(hub);

    // 中央：系統平台（處理）
    const pw = W * 0.34, ph = D * 0.55, pd = D * 0.62;
    const platform = new THREE.Group();
    // 外殼：地板＋四面牆，頂蓋可掀開看內部（剖面）
    const wt = 0.012;
    const floor = k.box(pw, wt, pd, { concept: 'proc' }); platform.add(floor);
    for (const [x, z, w, d] of [[0, -pd / 2 + wt / 2, pw, wt], [0, pd / 2 - wt / 2, pw, wt], [-pw / 2 + wt / 2, 0, wt, pd - wt * 2], [pw / 2 - wt / 2, 0, wt, pd - wt * 2]]) {
      const wall = k.box(w, ph, d, { concept: 'proc', hatch: 0.7 }); wall.position.set(x, 0, z); platform.add(wall);
    }
    // 可掀開的頂蓋（剖面看內部）
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, ph, -pd / 2); platform.add(lidPivot);
    const lid = k.rbox(pw * 1.02, 0.014, pd * 1.02, 0.006, { concept: 'proc', base: false });
    lid.position.set(0, 0.007, pd / 2); lidPivot.add(lid);
    const title = k.label('系統平台', { size: 0.042, billboard: false, bg: 'none' });
    title.position.set(0, 0.0145, pd * 0.5); title.rotation.x = -Math.PI / 2; lidPivot.add(title);
    // 內部：齒輪（處理器）
    const gear = new THREE.Group();
    const teeth = 14, R = Math.min(pw, pd) * 0.3;
    const shape = new THREE.Shape();
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2, r = i % 2 ? R : R * 0.82;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.25, 0, Math.PI * 2, true); shape.holes.push(hole);
    const g = k.extrude(shape, 0.02, { concept: 'proc', edgeAngle: 20 });
    g.rotation.x = -Math.PI / 2; gear.add(g);
    gear.position.set(0, ph * 0.55, 0);
    platform.add(gear);
    const cpuLbl = k.label('處理', { size: 0.036, color: '#1b5e3d' });
    cpuLbl.position.set(0, ph + 0.07, 0); platform.add(cpuLbl);
    hub.add(platform);

    // 輸送帶
    const beltLen = W * 0.3, bw = D * 0.26;
    const mkBelt = (x, key, text) => {
      const gr = new THREE.Group(); gr.position.x = x;
      const belt = k.rbox(beltLen, 0.018, bw, 0.008, { wash: 'grey' }); gr.add(belt);
      for (const sx of [-1, 1]) { const roll = k.cyl(0.014, 0.014, bw * 1.04, { wash: 'slate', base: false }); roll.rotation.x = Math.PI / 2; roll.position.set(sx * beltLen / 2, 0.009, 0); gr.add(roll); }
      const arrow = k.arrow(new THREE.Vector3(-beltLen * 0.38, 0.06, -bw * 0.85), new THREE.Vector3(beltLen * 0.38, 0.06, -bw * 0.85), { concept: key, r: 0.007 });
      gr.add(arrow);
      const lbl = k.label(text, { size: 0.04, color: k.CONCEPT[key].color, bg: '#fbf7ee' });
      lbl.position.set(0, 0.11, -bw * 0.85); gr.add(lbl);
      gr.userData = { belt, arrow, lbl, key };
      hub.add(gr);
      return gr;
    };
    const inBelt = mkBelt(-(pw / 2 + beltLen / 2 + 0.01), 'in', '輸入');
    const outBelt = mkBelt(pw / 2 + beltLen / 2 + 0.01, 'out', '輸出');

    // 資料方塊在輸送帶上流動
    const N = 4, s = 0.032;
    const mkCubes = (key) => Array.from({ length: N }, () => { const c = k.rbox(s, s, s, 0.004, { concept: key }); c.visible = false; hub.add(c); return c; });
    const ins = mkCubes('in'), outs = mkCubes('out');
    let running = true, t = 0;
    k.onUpdate((dt) => {
      if (running) t += dt * 0.32;
      gear.rotation.y += running ? dt * 1.4 : 0;
      for (let i = 0; i < N; i++) {
        const u = (t + i / N) % 1;
        const xin = inBelt.position.x - beltLen / 2 + u * (beltLen + pw * 0.3);
        ins[i].visible = xin < -pw * 0.38;
        ins[i].position.set(xin, 0.018, 0);
        const xo = pw * 0.2 + u * (beltLen + pw * 0.3);
        outs[i].visible = xo > pw * 0.42 && xo < outBelt.position.x + beltLen / 2;
        outs[i].position.set(xo, 0.018, 0);
      }
    });

    const allGlowOff = () => { for (const o of [inBelt, outBelt, platform]) k.unglow(o); };
    const openLid = (open) => k.tween(lidPivot.rotation, { x: open ? -1.9 : 0 }, 0.7);
    return {
      demo: [
        { say: '系統平台運作的流程主要包含輸入、處理、輸出等3個步驟。', cam: { az: 0, el: 40 }, do: () => { allGlowOff(); openLid(false); } },
        { say: '輸入：透過傳輸媒介（如資料傳輸線、網路），將資料輸入至系統中。', cam: { subject: [inBelt], az: -30, el: 35, pad: 1.3 }, do: () => { allGlowOff(); k.glow(inBelt, 'in', 0.8); openLid(false); } },
        { say: '處理：系統利用平台處理器（如電腦中的CPU、雲端的運算資源等）來處理資料。', cam: { subject: [platform], az: 0, el: 58, pad: 1.15, after: true }, do: () => { allGlowOff(); k.glow(gear, 'proc', 0.9); return openLid(true); } },
        { say: '輸出：透過傳輸媒介，將資料輸出至顯示器、儲存設備、雲端空間或系統平台的其他成員。', cam: { subject: [outBelt], az: 30, el: 35, pad: 1.3 }, do: () => { allGlowOff(); k.unglow(gear); openLid(false); k.glow(outBelt, 'out', 0.8); } },
      ],
      demoEnd: () => { allGlowOff(); k.unglow(gear); openLid(false); },
      reset: () => { allGlowOff(); k.unglow(gear); lidPivot.rotation.x = 0; },
    };
  },
};
