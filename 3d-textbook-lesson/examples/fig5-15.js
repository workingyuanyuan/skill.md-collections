// 圖5-15 雲端化示意圖
// 立體化：兩根支柱撐起的雲（正面嵌著原圖的服務圖示徽章），下方手機、螢幕、平板、筆電、手機以網路連線接到雲。
// 示範後半演出對比：兩台裝置的網路連線中斷時向雲端要求服務（先預測），再全部連上網路要求一次；沒有網路連線的裝置無法使用雲端服務（對應習題10）。
export default {
  id: 'fig5-15',
  build(k) {
    const { THREE } = k;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const CC = k.CONCEPT.cloud.color;
    const hub = new THREE.Group();
    k.add(hub);

    // ---------- 雲（立起的雲形厚板＋支柱） ----------
    const CZ = -0.105, CB = 0.1, CW = 0.3, CH = 0.14, CT = 0.026;
    const sh = new THREE.Shape();
    const bumps = [[-0.11, 0.035, 0.04], [-0.055, 0.075, 0.05], [0.02, 0.09, 0.055], [0.085, 0.06, 0.045], [0.125, 0.03, 0.03]];
    sh.moveTo(-0.15, 0); sh.lineTo(0.15, 0);
    sh.absarc(0.125, 0.03, 0.03, -Math.PI / 2, Math.PI * 0.55, false);
    sh.absarc(0.085, 0.06, 0.045, -0.2, Math.PI * 0.75, false);
    sh.absarc(0.02, 0.085, 0.055, 0.1, Math.PI * 0.92, false);
    sh.absarc(-0.06, 0.07, 0.048, 0.35, Math.PI * 1.05, false);
    sh.absarc(-0.12, 0.035, 0.035, Math.PI * 0.45, Math.PI * 1.5, false);
    sh.lineTo(-0.15, 0);
    void bumps;
    const cloud = k.extrude(sh, CT, { wash: '#dcecf8', bevel: 0.006, curveSegments: 20, hatch: 0.5 });
    cloud.position.set(0, CB, CZ - CT / 2); hub.add(cloud);
    const posts = [];
    for (const sx of [-1, 1]) {
      const p = k.cyl(0.006, 0.007, CB + 0.01, { wash: 'slate' }); p.position.set(sx * 0.085, 0, CZ); hub.add(p); posts.push(p);
      const f = k.cyl(0.016, 0.019, 0.006, { wash: 'slate' }); f.position.set(sx * 0.085, 0, CZ); hub.add(f);
    }

    // ---------- 服務圖示徽章（依原圖：搜尋、齒輪、下載、分享、通訊、耳機） ----------
    const INK = k.INK;
    const drawIcon = (c, i, cx, cy, s, col = '#1f6f9e') => {
      c.save(); c.translate(cx, cy); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.12; c.lineCap = 'round'; c.lineJoin = 'round';
      if (i === 0) { // 搜尋（放大鏡）
        c.beginPath(); c.arc(-s * 0.12, -s * 0.12, s * 0.3, 0, Math.PI * 2); c.stroke();
        c.lineWidth = s * 0.16; c.beginPath(); c.moveTo(s * 0.1, s * 0.1); c.lineTo(s * 0.4, s * 0.4); c.stroke();
      } else if (i === 1) { // 齒輪
        const gear = (x, y, r) => { c.beginPath(); for (let k2 = 0; k2 < 16; k2++) { const a = k2 / 16 * Math.PI * 2, rr = k2 % 2 ? r : r * 1.3; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); c.fillStyle = '#f6efe0'; c.beginPath(); c.arc(x, y, r * 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = col; };
        gear(-s * 0.15, s * 0.08, s * 0.25); gear(s * 0.25, -s * 0.2, s * 0.17);
      } else if (i === 2) { // 下載
        c.beginPath(); c.moveTo(0, -s * 0.42); c.lineTo(0, s * 0.12); c.stroke();
        c.beginPath(); c.moveTo(-s * 0.2, -s * 0.06); c.lineTo(0, s * 0.14); c.lineTo(s * 0.2, -s * 0.06); c.stroke();
        c.beginPath(); c.moveTo(-s * 0.38, s * 0.12); c.lineTo(-s * 0.38, s * 0.36); c.lineTo(s * 0.38, s * 0.36); c.lineTo(s * 0.38, s * 0.12); c.stroke();
      } else if (i === 3) { // 分享
        const P = [[-s * 0.28, 0], [s * 0.26, -s * 0.28], [s * 0.26, s * 0.28]];
        c.beginPath(); c.moveTo(...P[1]); c.lineTo(...P[0]); c.lineTo(...P[2]); c.stroke();
        for (const [x, y] of P) { c.beginPath(); c.arc(x, y, s * 0.13, 0, Math.PI * 2); c.fill(); }
      } else if (i === 4) { // 通訊（人＋對話框）
        c.beginPath(); c.arc(-s * 0.15, -s * 0.08, s * 0.15, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(-s * 0.15, s * 0.32, s * 0.27, s * 0.18, 0, Math.PI, 0); c.fill();
        c.beginPath(); c.roundRect(s * 0.05, -s * 0.45, s * 0.38, s * 0.24, s * 0.05); c.fill();
        c.beginPath(); c.moveTo(s * 0.12, -s * 0.22); c.lineTo(s * 0.08, -s * 0.12); c.lineTo(s * 0.2, -s * 0.22); c.fill();
      } else { // 耳機
        c.beginPath(); c.arc(0, s * 0.05, s * 0.32, Math.PI, 0); c.stroke();
        c.beginPath(); c.roundRect(-s * 0.4, s * 0.02, s * 0.15, s * 0.3, s * 0.05); c.fill();
        c.beginPath(); c.roundRect(s * 0.25, s * 0.02, s * 0.15, s * 0.3, s * 0.05); c.fill();
      }
      c.restore();
    };
    const badges = [];
    const BR = 0.021;
    const slots = [[-0.075, 0.075], [0, 0.085], [0.075, 0.07], [-0.075, 0.028], [0, 0.03], [0.075, 0.028]];
    const order = [0, 1, 2, 4, 3, 5];
    slots.forEach(([x, y], j) => {
      const i = order[j];
      const g = new THREE.Group(); g.position.set(x, CB + y, CZ + CT / 2 + 0.006); hub.add(g);
      const disc = k.cyl(BR, BR, 0.006, { wash: '#f6f1e4', base: false, seg: 28 }); disc.rotation.x = Math.PI / 2; g.add(disc);
      const ct = k.canvasTex(128, 128, (c, W, H) => { c.clearRect(0, 0, W, H); drawIcon(c, i, W / 2, H / 2, W * 0.8); });
      const sc = k.screen(BR * 1.6, BR * 1.6, ct, { transparent: true }); sc.position.z = 0.0032; g.add(sc);
      badges.push({ g, disc, i });
    });

    // ---------- 裝置 ----------
    const devCanvas = (w, h) => k.canvasTex(w, h);
    const dev = [];
    const mkSlate = (w, h, wash) => {
      const g = new THREE.Group();
      const t = 0.007;
      const body = k.rbox(w, t, h, Math.min(w, h) * 0.12, { wash });
      g.add(body);
      const ct = devCanvas(Math.round(256 * w / Math.max(w, h)), Math.round(256 * h / Math.max(w, h)));
      const sc = k.screen(w * 0.86, h * 0.84, ct); sc.rotation.x = -Math.PI / 2; sc.position.y = t + 0.0012; g.add(sc);
      return { g, ct };
    };
    // 斜放支架上的手機、平板
    const mkStanding = (x, z, w, h, wash) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); hub.add(g);
      const stand = k.box(w * 0.9, 0.005, h * 0.55, { wash: 'grey' }); g.add(stand);
      const lip = k.box(w * 1.05, 0.009, 0.006, { wash: 'grey' }); lip.position.set(0, 0, h * 0.3); g.add(lip);
      const prop = k.box(w * 0.6, h * 0.42, 0.005, { wash: 'grey' }); prop.position.set(0, 0, -h * 0.22); prop.rotation.x = -0.45; g.add(prop);
      const tilt = new THREE.Group(); tilt.position.set(0, 0.005, h * 0.3 - 0.004); tilt.rotation.x = 1.0; g.add(tilt);
      const s = mkSlate(w, h, wash); s.g.position.z = -h / 2; tilt.add(s.g);
      return { g, ct: s.ct, top: () => s.g.localToWorld(V(0, 0.01, -h * 0.45)), body: s.g };
    };
    const phone1 = mkStanding(-0.205, 0.075, 0.034, 0.068, 'slate');
    const tablet = mkStanding(0.0, 0.095, 0.075, 0.054, 'slate');
    const phone2 = mkStanding(0.207, 0.075, 0.034, 0.066, 'slate');
    tablet.g.rotation.y = 0; // 橫放
    const mon = k.parts.monitor({ w: 0.11 }); mon.position.set(-0.105, 0, 0.045); hub.add(mon);
    // 筆電（自建：共用零件的螢幕蓋會向下轉入機身）
    const lap = new THREE.Group(); lap.position.set(0.108, 0, 0.075); hub.add(lap);
    const LW = 0.1, LD = 0.066, LT = 0.0045;
    lap.add(k.rbox(LW, LT, LD, 0.002, { wash: 'grey' }));
    const kb = k.box(LW * 0.84, 0.0015, LD * 0.5, { wash: '#bdb6a6', outline: false }); kb.position.set(0, LT, -LD * 0.06); lap.add(kb);
    const lapHinge = new THREE.Group(); lapHinge.position.set(0, LT, -LD / 2); lapHinge.rotation.x = -0.32; lap.add(lapHinge);
    const lid = k.rbox(LW, LD * 0.92, 0.004, 0.002, { wash: 'grey' }); lapHinge.add(lid);
    const lapCt = k.canvasTex(256, 160);
    const lapSc = k.screen(LW * 0.9, LD * 0.8, lapCt); lapSc.position.set(0, LD * 0.46, 0.0032); lapHinge.add(lapSc);
    lap.userData = { ct: lapCt, hinge: lapHinge };
    const devices = [
      { name: '手機', obj: phone1.g, ct: phone1.ct, top: phone1.top, shape: 'v' },
      { name: '螢幕', obj: mon, ct: mon.userData.ct, top: () => mon.localToWorld(V(0, 0.115, -0.002)), shape: 'h' },
      { name: '平板', obj: tablet.g, ct: tablet.ct, top: tablet.top, shape: 'h' },
      { name: '筆電', obj: lap, ct: lap.userData.ct, top: () => lapHinge.localToWorld(V(0, LD * 0.92, 0)), shape: 'h' },
      { name: '手機', obj: phone2.g, ct: phone2.ct, top: phone2.top, shape: 'v' },
    ];
    devices.forEach((d, j) => { d.on = true; d.icon = -1; d.fail = false; d.label = d.name + (j === 4 ? '２' : j === 0 ? '１' : ''); });

    // 畫面：Wi-Fi 圖示（有連線藍色、中斷加斜線）＋取得的服務圖示
    const drawScreen = (d) => (c, W, H) => {
      k.ui.bg(c, W, H, d.on ? '#e6f1fa' : '#e9e4da');
      const s = Math.min(W, H);
      const cx = W / 2, cy = d.icon >= 0 || d.fail ? H * 0.32 : H / 2;
      const col = d.on ? '#1f6f9e' : '#8b8576';
      c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineWidth = s * 0.06;
      for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, cy + s * 0.14, s * 0.1 * i, -Math.PI * 0.75, -Math.PI * 0.25); c.stroke(); }
      c.beginPath(); c.arc(cx, cy + s * 0.14, s * 0.035, 0, Math.PI * 2); c.fill();
      if (!d.on) { c.strokeStyle = '#c8382b'; c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(cx - s * 0.25, cy + s * 0.2); c.lineTo(cx + s * 0.25, cy - s * 0.2); c.stroke(); }
      if (d.icon >= 0) drawIcon(c, d.icon, W / 2, H * 0.74, s * 0.38, '#2f80d8');
      else if (d.fail) { c.strokeStyle = '#c8382b'; c.lineWidth = s * 0.07; const r = s * 0.12, y = H * 0.74; c.beginPath(); c.moveTo(W / 2 - r, y - r); c.lineTo(W / 2 + r, y + r); c.moveTo(W / 2 + r, y - r); c.lineTo(W / 2 - r, y + r); c.stroke(); }
    };
    const redraw = (d) => { d.ct.redraw(drawScreen(d)); };

    // ---------- 連線（雲底 → 裝置） ----------
    hub.updateMatrixWorld(true);
    const toL = (wp) => hub.worldToLocal(wp.clone());
    const cloudX = [-0.11, -0.055, 0, 0.055, 0.11];
    devices.forEach((d, j) => {
      const tp = toL(d.top());
      const a = V(cloudX[j], CB + 0.002, CZ + 0.004);
      const ym = CB - 0.02 - Math.abs(j - 2) * 0.004;
      const pts = [a, V(cloudX[j], ym, CZ + 0.004), V(tp.x, ym, CZ + 0.004 + (tp.z - CZ) * 0.15), tp];
      // 平滑成曲線（給封包），墨線用折線
      const curvePts = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1).getPoints(30);
      d.line = k.line(pts, { dashed: true, width: 1.6, color: CC, dashSize: 0.008, gapSize: 0.006 }); hub.add(d.line);
      d.down = k.flow(curvePts, { concept: 'cloud', count: 2, speed: 0.55, r: 0.0055 }); hub.add(d.down.obj);
      d.up = k.flow(curvePts.slice().reverse(), { wash: '#f2e2a8', count: 1, speed: 0.55, r: 0.0045 }); hub.add(d.up.obj);
      d.curve = new THREE.CatmullRomCurve3(curvePts);
    });
    const setLine = (d) => { d.line.material.color.set(d.on ? CC : '#b8b1a2'); d.line.material.dashSize = d.on ? 0.008 : 0.003; };
    let flowing = false;
    const setFlows = (on) => {
      flowing = on;
      for (const d of devices) { if (on && d.on) { if (!d.down.on) d.down.start(); if (!d.up.on) d.up.start(); } else { d.down.stop(); d.up.stop(); } }
    };
    const setDev = (j, on) => { const d = devices[j]; d.on = on; d.icon = -1; d.fail = false; setLine(d); redraw(d); setFlows(flowing); };
    devices.forEach((d) => { setLine(d); redraw(d); });

    // ---------- 讀數牌：幾台裝置用得到雲端服務（示範到要求服務時才出現） ----------
    const board = k.plaque({ w: 0.078, h: 0.062, leg: 0.084 }); // 腳做高一點，牌面在連到手機２的虛線上方
    board.position.set(0.204, 0, -0.062); board.visible = false; hub.add(board); // 站在雲的右前方，不被雲擋住
    const showCount = () => {
      const ok = devices.filter((d) => d.icon >= 0).length;
      board.userData.set(['可使用', { text: `${ok}／${devices.length} 台`, bold: true, color: ok === devices.length ? '#2f7d55' : '#9a3b2a' }]);
      board.visible = true;
    };

    // ---------- 各裝置向雲端要求服務（照規則演出：有網路連線的裝置才收得到雲端傳回的服務） ----------
    // gen：每一步開頭加一，還在飛的封包和還沒做完的要求就此作廢
    let gen = 0;
    const flying = new Set();
    const cancel = () => { gen++; for (const b of flying) hub.remove(b); flying.clear(); };
    const packet = (curve, rev, opts) => {
      const b = k.sphere(0.0065, { ...opts, outline: false, seg: 12 });
      if (opts.concept) k.glow(b, opts.concept, 1, false);
      hub.add(b); flying.add(b);
      const c2 = rev ? new THREE.CatmullRomCurve3(curve.getPoints(30).reverse()) : curve;
      return k.along(b, c2, 0.9).then(() => { hub.remove(b); flying.delete(b); });
    };
    const request = async (i) => {
      const g = gen;
      devices.forEach((d) => { d.icon = -1; d.fail = false; redraw(d); });
      // 1) 裝置送出要求：有連線才能沿網路到雲端，沒有連線的當場失敗
      await Promise.all(devices.map(async (d) => {
        if (!d.on) { d.fail = true; redraw(d); return; }
        await packet(d.curve, true, { wash: '#f2e2a8' });
      }));
      if (g !== gen) return;
      // 2) 雲端提供服務：對應圖示發光，傳回給有連線的裝置
      const b = badges.find((x) => x.i === i);
      k.glow(b.g, 'cloud', 0.7);
      await Promise.all(devices.filter((d) => d.on).map(async (d) => { await packet(d.curve, false, { concept: 'cloud' }); if (g === gen) { d.icon = i; redraw(d); } }));
      if (g !== gen) return;
      showCount();
    };

    const glowOff = () => { badges.forEach((b) => k.unglow(b.g)); k.unglow(cloud); devices.forEach((d) => k.unglow(d.obj)); };
    // 每一步開頭：作廢上一步的動畫，回到「全部連線、沒有要求」的狀態
    const base = () => { cancel(); glowOff(); board.visible = false; devices.forEach((d, j) => setDev(j, true)); };
    const OFF = [0, 3]; // 示範中斷線的裝置：手機１、筆電
    return {
      demo: [
        { say: '隨著網路的普及，愈來愈多系統「雲端化」，讓我們只要在有網路連線的地方，就可以使用這些系統所提供的服務。', cam: { az: 0, el: 30, pad: 1.1 },
          do: () => { base(); k.glow(cloud, 'cloud', 0.25); setFlows(true); } },
        { say: '例如許多應用軟體、繳費系統、社區服務平台、健保系統……等都已整合至雲端，使用者在全國各地都可以即時取得與更新資訊。', cam: { az: 18, el: 24, pad: 1.1 },
          do: () => { base(); devices.forEach((d, j) => { d.icon = [0, 1, 2, 4, 3][j]; redraw(d); }); badges.forEach((b) => k.glow(b.g, 'cloud', 0.5)); setFlows(true); } },
        // 先預測：只擺出題目的情境（兩台裝置斷線），不露出結果
        { ask: true, say: '先預測：手機１和筆電的網路連線中斷了，它們還能使用雲端提供的服務嗎？', cam: { az: 0, el: 30, pad: 1.1 },
          do: () => { base(); setFlows(false); OFF.forEach((j) => setDev(j, false)); } },
        { say: '答案：不行。各裝置向雲端要求服務，只有網路連線的 3 台收到雲端傳回的服務，沒有網路連線就無法使用。', cam: { az: 0, el: 30, pad: 1.1 },
          do: () => { base(); setFlows(false); OFF.forEach((j) => setDev(j, false)); return request(2); } },
        { say: '重新連上網路後再要求一次，5 台裝置都能使用雲端服務：只要在有網路連線的地方就可以使用。', cam: { az: 0, el: 30, pad: 1.1 },
          do: () => { base(); setFlows(false); return request(4); } },
      ],
      demoEnd: () => { base(); setFlows(false); },
      reset: () => { base(); setFlows(false); },
    };
  },
};
