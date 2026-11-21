# 立體圖模組規格（src/figs/*.js）

每個原書的圖（或要客製的表）是一個 ES 模組，檔名等於 id（如 `fig5-3.js`、`tab5-1.js`）：

```js
export default {
  id: 'fig5-3',
  build(k) {            // k = 工具組（src/core/kit.js），回傳 api
    ...
    return { demo, demoEnd, reset, refresh, update, onRaised };
  },
};
```

參考範例在 skill 資料夾的 `examples/`：`fig5-2.js`（示範含剖面）、`fig5-15.js`（示範裡演出兩種情境的對比、先預測再揭曉）。這兩個檔是第5章的成品，只供參考寫法，不要複製進章節資料夾。工具組原始碼：`src/core/kit.js`、`src/core/ink.js`。

## 回傳的 api

| 欄位 | 何時呼叫 | 用途 |
| --- | --- | --- |
| `demo` | 老師點圖說旁的「▶ 示範」紙籤之後，自動一步一步播放 | 示範步驟的陣列（見下）。每張圖表都要有。 |
| `demoEnd(k)` | 示範結束（播完、點「■ 結束」紙籤或按 Esc） | 把模型還原成示範前的樣子。 |
| `onRaised()` | 模型從紙面升起之後 | 啟動升起後才開始的動畫。 |
| `update(dt, t)` | 模型在目前跨頁時的每一格 | 持續性的動畫。 |
| `refresh()` | 老師切換答案或教師註解、頁面重畫之後 | 更新模型上跟著改變的內容（`k.teacher`）。 |
| `reset()` | 翻離這個跨頁時 | 停掉動畫、還原所有狀態，下次翻回來像第一次一樣。 |

除了 `demo` 以外都可省略。沒有紙條、沒有模擬分頁、沒有任何控制項：老師上課只會點一下紙籤，這張圖要讓學生看到的所有動作都寫進 `demo`。表格（`table` 區塊）有通用的立體表格模組，不必另外寫；要客製時才寫一個檔名等於表格 id 的模組。

## 座標與佔地

- 世界單位：頁寬 1.5、頁高 ≈2.0；1pt ≈ 0.00252 單位（`k.size` 已換算）。
- `k.root` 放在圖的佔地中心、紙面高度。區域座標：x 向右、z 向頁面下方（朝讀者）、y 向上（離開紙面）。
- 佔地範圍 `k.size = { w, d }`：模型（含標籤）的投影必須留在 x∈[−w/2, w/2]、z∈[−d/2, d/2] 內，不伸進書溝、不超出書口，不與同跨頁其他圖重疊。高度建議 ≤ 0.35。
- `k.ptLocal(x, y)`：原書頁面 pt 座標 → 區域座標（`k.block.src.bbox` 是原圖在 PDF 的範圍），可用來對齊原書版面。
- `k.block`：頁面內容區塊（`caption`、`labels` 為原書圖中的文字，標籤一律照抄原書用字）。

## 墨水語言（一律用工具組建模）

- 形體：`k.box(w,h,d,o)`、`k.rbox(w,h,d,r,o)`（圓角）、`k.cyl(rt,rb,h,o)`、`k.sphere(r,o)`、`k.cone(r,h,o)`、`k.torus(R,r,o)`、`k.extrude(shape,depth,o)`、`k.lathe(pts,o)`、`k.plane(w,h,o)`、`k.mesh(geometry,o)`。box/rbox/cyl/cone 預設底部在 y=0（`base:false` 改為置中）。
  - `o.wash`：淡彩（`'paper' 'grey' 'blue' 'green' 'yellow' 'rose' 'violet' 'sand' 'teal' 'slate'` 或色碼）；`o.concept`：概念色鍵（見下）；`o.hatch` 排線強度 0–1；`o.outline:false` 不加輪廓；`o.edgeAngle` 邊線角度門檻。
  - 封閉網格才加外殼輪廓；薄片用 `k.plane` 或很薄的 box。不要用寫實／塑膠材質，也不要自建 MeshStandardMaterial（否則不會壓平、不會描線升起）。
- 線：`k.line(points, { dashed, width, color })`（固定像素寬的墨線，可逐筆描出）；`k.arcPts(a, b, lift)` 產生拱形點列。
- 箭頭：`k.arrow(a, b, { concept|wash, r, head })`、`k.tubeArrow(points, {...})`。
- 文字：`k.label(text, { size, color, bg, border, billboard })` 立起的標籤（預設面向相機、只等比縮放）。立起的標籤在後製之後才繪製，不受輝光與暈影影響；`k.print(text, {size})` 平貼紙面、降下後仍在。`size` 為字高（世界單位）。示範每一步鏡頭停妥後，字在 1920×1080 的畫面上不能小於 16 px（驗收腳本逐步量測）：取景範圍大的步驟，標籤要跟著做大。標籤彼此不重疊、不蓋住重點。
- 引線說明：`k.callout('說明文字', 標籤位置, 指向的位置, { size, knee, color })`，原書那種「說明標籤＋洋紅引線＋端點圓點」；`k.rod(a, b, { r, wash })` 是兩點之間的細桿（支架、撐桿、桌腳）。
- 畫面／視窗：`k.canvasTex(wPx, hPx, draw)` 回傳 `{ctx, tex, redraw(fn)}`；`k.screen(w, h, ct)` 螢幕平面；`k.ui.*` 紙墨風格的畫面繪製（bg、text、rect、titleBar、check、radio、bar）。
- 共用零件 `k.parts.*`：`phone`、`laptop`、`monitor`、`server`、`tower`（基地台）、`satellite`、`cloud`、`chip`、`person`（墨線小人）、`doc`、`folder`、`window`（直立視窗面板，含 canvas 畫面）、`easel`（向後斜靠在底座與後撐上的軟體視窗，`{ w, h, tilt, draw }`，適合原書的視窗截圖）、`printer`、`disk`、`disc`。回傳 Group，`userData` 內有 `screen`、`ct`、`size` 等；`easel` 與 `phone` 另有 `at(u, v)`，取畫面上某一點（u 由左而右、v 由上而下，0–1）的位置，用來接引線或讓東西從畫面飛出來。可再加細節，讓模型好看、讓學生想多看一眼。
- 訊號與流動：`k.flow(points, { concept, count, speed, once })` 回傳 `{start(), stop(), obj}`（需 `k.add(f.obj)`）；`k.waves({ n, r0, dr, arc, concept })` 同心弧（Wi-Fi）。
- 發光：`k.glow(obj, conceptKey, strength)`、`k.unglow(obj)`（被選取或正在變化的概念才發光，光會灑在紙上）。帶文字的模型不要發強光。
- 概念色鍵：定義在 `src/content/chapter.js` 的 `concepts`。其他區分用淡彩。

## 世界規則（不脫書）

- 每個物件都要有支撐或附著點：放在紙面、模型上、支架或細桿上。不放懸空無依的物件（衛星用細桿或軌道環支撐、雲朵用支柱等）。
- 示範才用得到的物件（題卡、測試樣本、讀數的小牌子）在示範走到那一步時才出現，`demoEnd` 收掉；模型升起時不自動生成。
- 原書用了比喻時，要從示範鏡頭一眼認得出來。

## 動畫工具

- `k.tween(target, {prop: v}, sec, ease)` 回傳 Promise；`k.stop(target)` 停掉它；`k.along(obj, curve, sec)` 沿曲線移動，`k.stop(obj.position)` 或對同一物件再下一次移動就會停下；`k.wait(sec)`；`k.onUpdate((dt, t) => {})` 每格更新。
- `k.plaque({ w, h, lines })`：立在模型旁的小牌子，顯示示範過程中會變的讀數；`plaque.userData.set(['等待時間 6 毫秒', { text: '平均 5', bold: true, color: '#9a3b2a' }])` 更新文字。字會自動縮到放得下，所以牌子要夠大、行數要少（每行字高 ≈ h ÷ 行數 ÷ 1.4，字太長還會再縮）：示範每一步牌子上的字在畫面上不能小於 16 px，驗收腳本會量。
- `k.teacher`：是否開啟教師註解（教師版資料預設隱藏）。
- `k.interact(obj, { click(point), drag })` 仍可用，但老師上課不會去點模型，不要把任何要讓學生看到的內容放在「點了才出現」的互動裡。

## 示範 `demo`

陣列，每步：`{ say, cam: { subject, az, el, pad, after }, do: (k) => Promise|void, hold, ask }`。

老師點一下紙籤，示範就整段自動播放：每一步先執行 `do`，等它回傳的 Promise 完成、鏡頭停妥，再停留一段時間讓老師講解，然後自動換下一步；最後一步停留完自動結束。老師可以按空白鍵或點桌卡暫停，用 ← → 手動換步，按 Esc 結束，所以每一步仍然要能從任意步跳入。

- `say`：寫在桌卡上的一句說明，取自原書文字；必要的補充要短。停留時間依字數計算（每 5 個字 1 秒，最少 4 秒、最多 12 秒）。
- `hold`：這一步動畫做完後要停留的秒數，只在預設值不合適時才寫（例如要讓學生數一數畫面上的東西）。
- `ask: true`：這一步是「先預測」的提問，`say` 寫問題與選項（例如 `'先預測：哪一種排程的平均等待時間最短？ FCFS、SJF 還是 PS？'`），停留 10 秒讓全班回答；**下一步**揭曉，`say` 以「答案：」開頭並說明原因，`do` 演出結果。提問步驟的 `do` 只擺好題目的情境，不要先露出答案。
- `do` 是「設定這一步的狀態」（可動畫過去），必須可從任意步跳入（按 ← 會直接呼叫前一步的 do）。
- **`do` 裡有動畫就要回傳 Promise，而且這個 Promise 一定要結束**。自動播放靠它判斷動畫做完了沒；回傳一個永遠不結束的 Promise，示範會卡在那一步（引擎 30 秒後強制往下走，驗收腳本會判定未通過）。持續性的動畫（流動的封包、轉動的風扇）用 `k.flow().start()`、`k.onUpdate` 啟動後直接回傳，不要 `await` 它。
- 用 `k.onUpdate` 自己推進的過程（計時、甘特圖、流動）要用實際經過的時間（`performance.now()`）計算進度，不要累加每格的 `dt`：畫面更新慢的電腦上每格的 `dt` 有上限，累加起來會比實際時間慢，一步就拖得很長。
- 一步的動畫不要太長（建議 8 秒內）。一個情境要演比較久時拆成幾步，每一步有自己的 `say`。
- 老師可能在動畫跑到一半時就按下一步、上一步或結束，自動播放也可能在你沒預期的時候被打斷。每個 `do` 和 `demoEnd` 開頭要先讓還在進行的動畫失效，例如用一個遞增的代數：動畫的每一段 `await` 之後檢查代數是否改變，改變了就不再往下做。否則上一步殘留的動畫會把這一步的狀態改掉，鏡頭取景也會跟著錯。驗收腳本會用連續快按來測試。
- `cam.subject`：要完整入鏡的物件（陣列或回傳陣列的函式），預設整個圖；`az` 水平角（0＝從讀者方向看）、`el` 仰角（90＝俯視）、`pad` 邊界倍率（1.05–1.3；小於 1 會被當成 1）；`after:true` 等 do 的 Promise 完成後才取景（鏡頭要等物件就位才動時用）。沒有設 `after` 時，鏡頭先依目前的範圍取景，do 回傳的 Promise 完成後會再取景一次。
- 有上下、前後、內外層的模型，選每一層都看得見的角度（不能只靠俯視）；剖面就真的把外殼切開或掀開。
- 步數依內容決定，最後一個有內容的步驟就是結束（不另加結束步）。`demoEnd(k)` 還原狀態。示範時同跨頁其他模型會自動降回紙面。

### 把過程、因果、數量變化演出來

課文有過程、因果或數量變化時，示範不能只是逐一指認零件，要把變化演給學生看：

- 選兩到三組**對比的情境**排成連續的步驟（例如同一批程序先用 FCFS 排、再用 SJF 排；記憶體夠用時與不夠用時），讓學生看到「條件一變，結果怎麼跟著變」。
- 情境的結果要**照真實規則逐步計算**出來（把計算寫成函式，示範的每個情境呼叫它），不是寫死的動畫；數據盡量取自書中，書中沒有的數據在 `say` 裡標明「數值為示意」。
- 過程中會變的數值（等待時間、使用率、完成的份數）用 `k.plaque` 立在模型旁，跟著動畫更新。
- 適合的地方加一組「先預測 → 揭曉」（`ask` 步驟），一段示範最多一組。

## 測試（每個代理用自己的輸出資料夾，不要寫入本章資料夾的 app.js）

```bash
export NODE_MODULES=<安裝了 package.json 所列套件的 node_modules>
cd <本章資料夾>
SKIP_FONTS=1 FIGS=fig5-3,tab5-1 OUTDIR=<你的暫存資料夾>/build node tools/build.mjs
ROOT=<你的暫存資料夾>/build node tools/shot.mjs <測試腳本.mjs> <截圖資料夾>
```

測試腳本：`export async function run({ page, shot, eval: ev, wait }) { … }`。`?fast` 模式下開書與翻頁瞬間完成。除錯介面 `window.book`：
`goto(頁碼)`、`spread(i)`、`fig(id)`（instance：`.api`、`.kit`、`.root`）、`figs()`（這個跨頁的圖與各自紙籤在畫面上的位置）、`demo(id)`、`pause(true)`、`next()`、`prev()`、`endDemo()`、`demoInfo()`（`{ id, i, n, paused, phase, hold, stuck }`）、`holdOf(id, i)`、`settle()`（等鏡頭停下）、`view('stereo'|'top'|'low')`、`home()`、`teacher(true)`、`answers(true)`、`cam()`、`pages()`、`overflow()`、`app`。

看每一步的畫面：`await ev(() => window.book.demo('fig5-3')); await ev(() => window.book.pause(true));`，之後每次 `next()`、等 `demoInfo().phase !== 'busy'` 與 `settle()` 再截圖。`?fast` 模式下動畫瞬間完成、停留時間縮短，所以還要用正常速度（`Q= node tools/shot.mjs …`）不暫停地播一次，確認每一步的動畫看得清楚、時間合理。

除錯介面只用來跳到要看的狀態。紙籤和鍵盤要用 `page.mouse.click`（位置取自 `figs()` 的 `tab`）、`page.keyboard` 真的操作一次，因為有些錯誤只有真實輸入才會出現。

字型子集只含目前原始碼用到的字，新字在測試時會用系統字型代替，最後完整建置時會補上。內嵌字型沒有的符號（例如 ✕、⟲、☐）不要用，改用字型裡有的字（×、□）或畫成向量圖示；完整建置時會列出這類字。
