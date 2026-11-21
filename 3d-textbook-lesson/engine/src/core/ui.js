// 紙張樣式介面：工具列、目錄、示範桌卡、懸停虛線框、詞條說明卡
import { SPREADS } from './book.js';
import { VIEWS } from './camera.js';
import { PaperLayer, DeskCard, PAPER_CSS } from './paper3d.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};

// 「？」打開的操作說明；點一下說明本身就關閉
const HELP = `<h3>操作說明</h3>
翻頁：點書口（頁面外側）、快速左右滑動、方向鍵、PageUp／PageDown（簡報筆）；「目錄」可跳到各節。<br>
視角：拖曳小幅環視，放手回正；工具列切換立體、俯視、低角度。<br>
距離：滾輪（朝游標處）、＋／－鍵或工具列按鈕；雙擊頁面拉近聚焦，再雙擊回復；Esc 回到預設距離。<br>
示範：點圖說旁的「示範」紙籤，或按 Enter 示範這個跨頁的下一張圖；書上會立起桌卡寫出每一步。<br>
示範中：空白鍵或點桌卡暫停／繼續，→／PageDown 換下一步，←／PageUp 回上一步，Esc 結束。<br>
答案：點題目的空白括號或底線顯示答案；工具列「答案」「教師註解」顯示這個跨頁的全部答案與註解。<br>
放大鏡：開啟後滑鼠停在文字上放大閱讀，關鍵詞旁出現說明卡；觸控裝置長按。　（點此關閉）`;

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.buildToolbar();
    this.buildCard();
    this.hoverBox = h('div', { class: 'hoverbox' });
    this.card = h('div', { class: 'gcard' });
    this.root.append(this.hoverBox, this.card);
    this.toc = null;
  }

  btn(label, title, fn, cls = '') { return h('button', { class: 'pbtn ' + cls, title, onclick: (e) => { e.currentTarget.blur(); fn(e); } }, label); }

  buildToolbar() {
    const a = this.app;
    this.pageLbl = h('span', { class: 'pagelbl' }, '');
    this.help = h('div', { class: 'help paper', onclick: () => this.help.classList.remove('open'), html: HELP });
    const views = Object.entries(VIEWS).map(([k, v]) => {
      const b = this.btn(v.name, '閱讀視角：' + v.name, () => { a.rig.setView(k); this.syncViews(); }, 'seg');
      b.dataset.view = k; return b;
    });
    this.viewBtns = views;
    this.magBtn = this.btn('放大鏡', '放大鏡（滑鼠停在文字上；觸控長按）', () => { a.stage.mag.on = !a.stage.mag.on; this.magBtn.classList.toggle('on', a.stage.mag.on); if (!a.stage.mag.on) this.hideCard(); });
    this.ansBtn = this.btn('答案', '顯示／隱藏本跨頁所有答案', () => a.toggleAllAnswers());
    this.teachBtn = this.btn('教師註解', '顯示／隱藏教師版註解', () => a.toggleTeacher());
    // 內嵌字型沒有迴轉箭頭，用向量圖示，離線或換電腦都一樣
    this.homeBtn = this.btn('', '回到預設距離（Esc）', () => { a.rig.home(); this.syncViews(); });
    this.homeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M5.2 9.2A7.4 7.4 0 1 1 4.6 12"/><path d="M4.2 4.4l.9 5 5-.9"/></svg>';
    const tb = h('div', { class: 'toolbar' },
      this.btn('◀', '上一頁（← / PageUp）', () => a.turn(-1), 'nav'),
      this.pageLbl,
      this.btn('▶', '下一頁（→ / PageDown）', () => a.turn(1), 'nav'),
      h('span', { class: 'sep' }),
      this.btn('目錄', '章節目錄', () => this.toggleToc()),
      h('span', { class: 'sep' }),
      ...views,
      h('span', { class: 'sep' }),
      this.btn('－', '拉遠（-）', () => a.rig.zoomBy(1.18)),
      this.homeBtn,
      this.btn('＋', '拉近（+）', () => a.rig.zoomBy(1 / 1.18)),
      h('span', { class: 'sep' }),
      this.magBtn, this.ansBtn, this.teachBtn,
      this.btn('全螢幕', '全螢幕（F）', () => a.fullscreen()),
      this.btn('？', '操作說明', () => { this.closeMenus(); this.help.classList.toggle('open'); }),
    );
    this.toolbar = tb;
    this.root.append(tb, this.help);
    this.syncViews();
  }

  syncViews() { for (const b of this.viewBtns) b.classList.toggle('on', b.dataset.view === this.app.rig.view); }

  setPage(i) {
    const [l, r] = SPREADS[i];
    this.pageLbl.textContent = typeof l === 'number' ? `p.${l}｜${r}` : '扉頁';
    this.help.classList.remove('open');
    this.closeMenus();
  }
  setToggles() {
    this.ansBtn.classList.toggle('on', !!this.app.state.allAns);
    this.teachBtn.classList.toggle('on', !!this.app.state.teacher);
  }

  closeMenus() { if (this.toc) { this.toc.remove(); this.toc = null; } }

  toggleToc() {
    if (this.toc) { this.toc.remove(); this.toc = null; return; }
    this.help.classList.remove('open');
    const a = this.app;
    const items = a.tocItems();
    const box = h('div', { class: 'toc paper' }, h('div', { class: 'toc-h' }, '目錄'));
    for (const it of items) {
      box.append(h('button', { class: 'toc-i lv' + it.lv, onclick: () => { this.closeMenus(); a.gotoPage(it.page); } }, h('span', {}, it.text), h('span', { class: 'toc-p' }, String(it.page))));
    }
    this.toc = box; this.root.append(box);
  }

  // ---------- 示範桌卡 ----------
  buildCard() {
    const a = this.app;
    this.paper = new PaperLayer(a.stage);
    a.stage.paper = this.paper;
    this.deskCard = new DeskCard(this.paper, a.stage);
    const el = this.deskCard.el;
    // 桌卡上沒有按鈕：點一下暫停，再點一下繼續
    el.addEventListener('click', () => a.figures.togglePause());
    el.addEventListener('wheel', (e) => { e.preventDefault(); a.rig.zoomBy(Math.exp(e.deltaY * 0.0012), a.ndc(e)); }, { passive: false });
  }

  // 示範進行時，書上立起桌卡寫出這一步的說明
  demoState(d) {
    if (!d || d.i < 0) { this.deskCard.hide(); return; }
    const steps = d.inst.api.demo;
    this.deskCard.show(d.i, steps.length, steps[d.i].say, d.paused);
  }

  update() {
    this.deskCard.place(this.app.stage.camera);
  }

  // ---------- 懸停框、說明卡 ----------
  showHover(rect) {
    const b = this.hoverBox;
    if (!rect) { b.style.display = 'none'; return; }
    b.style.display = 'block';
    b.style.left = rect.x + 'px'; b.style.top = rect.y + 'px'; b.style.width = rect.w + 'px'; b.style.height = rect.h + 'px';
  }
  showCard(g, x, y) {
    const c = this.card;
    if (!g) { this.hideCard(); return; }
    c.innerHTML = '';
    c.append(h('div', { class: 'gt' }, g.term), h('div', { class: 'gd' }, g.def));
    if (g.example) c.append(h('div', { class: 'ge' }, '例：' + g.example));
    c.style.display = 'block';
    const W = this.app.stage.w;
    const r = this.app.stage.mag.r;
    let left = x + r + 16;
    if (left + 320 > W) left = x - r - 16 - 320;
    c.style.left = Math.max(8, left) + 'px'; c.style.top = Math.max(8, y - 60) + 'px';
  }
  hideCard() { this.card.style.display = 'none'; }
}

export const CSS = PAPER_CSS + /* css */`
:root{ --paper:#f6efe0; --ink:#1c2433; --verm:#9a3b2a; --pen:#b5302a; }
html,body{margin:0;height:100%;overflow:hidden;background:#2a1d14;font-family:"NSans",sans-serif;color:var(--ink);}
#app{position:fixed;inset:0;}
#app canvas{display:block;width:100%;height:100%;touch-action:none;}
#ui{position:fixed;inset:0;pointer-events:none;}
#ui > *{pointer-events:auto;}
.paper{background:var(--paper);border:2px solid var(--ink);border-radius:6px;box-shadow:0 6px 18px rgba(20,10,0,.35), inset 0 0 30px rgba(140,110,60,.12);}
/* 按鈕是襯線字的紙鍵：圓角、墨色粗框，下緣一道墨影像立起的鍵帽，按下時沉下去 */
.pbtn{font:700 17px "NSerif",serif;color:var(--ink);background:var(--paper);border:2px solid var(--ink);border-radius:7px;padding:5px 11px;cursor:pointer;outline-offset:3px;box-shadow:0 2px 0 rgba(28,36,51,.55);transition:transform .08s;white-space:nowrap;flex:none;}
.pbtn:hover,.pbtn:focus-visible{outline:2px dashed var(--ink);}
.pbtn:active{transform:translateY(2px);box-shadow:none;}
.pbtn.on{background:var(--ink);color:var(--paper);}
.pbtn.nav{font-size:18px;padding:5px 13px;}
.pbtn:disabled{opacity:.4;cursor:default;outline:none;}
.toolbar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:5px;padding:7px 10px;white-space:nowrap;background:rgba(246,239,224,.96);border:2px solid var(--ink);border-radius:12px;box-shadow:0 6px 22px rgba(0,0,0,.35);}
.toolbar .sep{flex:none;width:2px;height:26px;background:rgba(28,36,51,.25);margin:0 2px;}
.pagelbl{min-width:92px;text-align:center;font:700 19px "NSerif",serif;}
.help{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(640px,calc(100vw - 30px));padding:18px 22px;display:none;font:500 17px/1.7 "NSerif",serif;border-radius:12px;cursor:pointer;}
.help.open{display:block;}
.help h3{margin:0 0 6px;font-size:21px;}
.popmenu{position:fixed;bottom:72px;left:50%;transform:translateX(-50%);padding:10px;display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow:auto;}
.pbtn.wide{text-align:left;font-size:17px;}
.toc{position:fixed;bottom:72px;left:50%;transform:translateX(-50%);width:min(560px,92vw);max-height:70vh;overflow:auto;padding:12px 14px;}
.toc-h{font:700 22px "NSerif",serif;margin-bottom:8px;border-bottom:1.5px solid var(--ink);padding-bottom:6px;}
.toc-i{display:flex;justify-content:space-between;width:100%;background:none;border:none;font:500 18px "NSerif",serif;color:var(--ink);padding:5px 4px;cursor:pointer;text-align:left;}
.toc-i:hover{outline:2px dashed var(--ink);}
.toc-i.lv2{padding-left:26px;font-size:16px;}
.toc-p{color:var(--verm);font-family:"NSans",sans-serif;}
.hoverbox{position:fixed;display:none;border:2px dashed var(--ink);border-radius:6px;pointer-events:none!important;box-shadow:0 0 0 2px rgba(246,239,224,.6);}
.gcard{position:fixed;display:none;width:320px;padding:12px 14px;background:var(--paper);border:2px solid var(--ink);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:none!important;font-size:17px;line-height:1.55;}
.gt{font:700 20px "NSerif",serif;border-bottom:1.5px solid var(--ink);margin-bottom:6px;}
.ge{margin-top:6px;color:#2b4f7a;}
.loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:var(--paper);font:500 22px "NSerif",serif;}
`;
