// 用正常速度把指定的示範從頭播到尾，每一步截兩張圖：動畫進行中（開始後 1.2 秒）與動畫做完、鏡頭停妥時。
// 用法：FIG=fig5-3,tab5-1 Q= node tools/shot.mjs tools/play.mjs <截圖資料夾>
//       （Q= 表示不加 ?fast，用上課時的速度；ROOT、W、H 同 shot.mjs。不設 FIG 時播全書每一段示範，約需半小時）
// 畫面上印出每一步「動畫幾秒＋停留幾秒」。截圖要自己看：主體清楚、牌子上的字讀得到、沒有東西互相遮住或被桌卡擋住。
export async function run({ page, shot, eval: ev, wait }) {
  const want = (process.env.FIG || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pageOf = await ev(() => { const a = window.book.app; for (const p of window.book.pages()) a.pageCanvas(p); return Object.fromEntries(Object.entries(window.book.tabRects()).flatMap(([p, l]) => l.map((r) => [r.id, +p]))); });
  const ids = want.length ? want : Object.keys(pageOf);
  for (const id of ids) {
    if (!(id in pageOf)) { console.log(`${id}：頁面上沒有這張圖`); continue; }
    await ev((p) => window.book.goto(p), pageOf[id]);
    let tab = null;
    for (let k = 0; k < 300 && !tab; k++) { tab = (await ev(() => window.book.figs())).find((f) => f.id === id)?.tab || null; if (!tab) await wait(100); }
    if (!tab) { console.log(`${id}：紙籤沒有出現`); continue; }
    // 等鏡頭停妥再取紙籤的位置：鏡頭還在動時位置會過期，點不到
    await wait(400); await ev(() => window.book.settle()); await wait(200);
    tab = (await ev(() => window.book.figs())).find((f) => f.id === id)?.tab || tab;
    await ev(() => window.book.clearDemoLog());
    await page.mouse.click(tab.x, tab.y);
    // 截圖靠輪詢抓時機；每一步的秒數用頁面自己的紀錄（demoLog）
    let cur = -1, t0 = 0, mid = false, held = false;
    const tStart = Date.now();
    while (Date.now() - tStart < 600000) {
      const d = await ev(() => window.book.demoInfo());
      const now = Date.now();
      if (!d) { if (cur >= 0 || now - tStart > 8000) break; await wait(80); continue; }
      if (d.i !== cur && d.i >= 0) { cur = d.i; t0 = now; mid = false; held = false; }
      if (cur >= 0) {
        if (!mid && now - t0 > 1200 && d.phase === 'busy') { mid = true; await shot(`${id}-${cur + 1}a`); }
        if (!held && d.phase === 'hold') { held = true; await wait(250); await shot(`${id}-${cur + 1}b`); }
      }
      await wait(80);
    }
    if (cur < 0) { console.log(`${id}：點了紙籤，示範沒有開始`); continue; }
    if (await ev(() => window.book.demoInfo())) { console.log(`${id}：十分鐘內沒有播完`); await ev(() => window.book.endDemo()); await wait(300); }
    const log = (await ev(() => window.book.demoLog())) || [];
    const f = (v) => (v === null ? '?' : v.toFixed(1));
    const total = log.reduce((a, r) => a + (r.anim || 0) + (r.hold || 0), 0);
    console.log(`${id}（${log.length} 步，共 ${total.toFixed(0)} 秒）：` + log.map((r) => `${r.i + 1}) 動畫 ${f(r.anim)}＋停留 ${f(r.hold)}${r.stuck ? '【動畫的 Promise 沒有結束】' : ''}`).join('　'));
    await wait(2500);
  }
}
