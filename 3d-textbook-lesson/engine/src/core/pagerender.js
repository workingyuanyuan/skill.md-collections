// 把一頁的內容區塊排進 Canvas（單位 pt，貼圖解析度 TEX_SCALE）
import { PT_W, PT_H, TEX_SCALE, INK, VERMILION, PEN, PAPER, FONT, CONCEPT, TAB } from './config.js';
import { drawPaper } from './paperfx.js';
import { parseRich, layout, drawLayout, fontCss, measureWidth } from './typeset.js';
import { FLOATS } from '../content/floats.js';
import { CHAPTER } from '../content/chapter.js';

const X0 = 57, X1 = 538, TOP = 70, BOTTOM = 750;
// 沒有圖說可以依附時，紙籤貼在圖表旁的頁邊：先試書口那一側，放不下才放書溝側
function sideTab(x, y, w, leftPage) {
  const R = x + w + 2, L = x - 2 - TAB.w;
  const okR = R + TAB.w <= PT_W - 1, okL = L >= 1;
  const px = leftPage ? (okL ? L : okR ? R : 1) : (okR ? R : okL ? L : PT_W - 1 - TAB.w);
  return { x: px, y, w: TAB.w, h: TAB.h };
}
const BODY = { size: 11, lineH: 19.6, tracking: 1.15 };
const SMALL = { size: 9.6, lineH: 16, tracking: 0.6 };

const optLetter = (i) => `(${'ABCDEFG'[i]})`;
const optStr = (opts) => opts.map((o, i) => optLetter(i) + o).join('　');
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// 手繪感的墨線（輕微抖動）
function inkRect(ctx, x, y, w, h, lw = 0.8, color = INK) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  ctx.beginPath();
  const j = (s) => Math.sin(s * 12.9898) * 0.25;
  ctx.moveTo(x, y + j(x)); ctx.lineTo(x + w, y + j(y)); ctx.lineTo(x + w + j(w), y + h); ctx.lineTo(x, y + h + j(h)); ctx.closePath();
  ctx.stroke(); ctx.restore();
}

function text(ctx, s, x, y, st, size, color = INK, align = 'left') {
  ctx.font = fontCss(st, size); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y); ctx.textAlign = 'left';
}

// 循環箭頭圖示（原書條列符號）
function bulletIcon(ctx, x, y, color = '#2b6c8f') {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.beginPath();
  ctx.arc(x, y, 3.6, Math.PI * 0.15, Math.PI * 1.75); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 3.9, y - 3.6); ctx.lineTo(x + 3.5, y - 0.6); ctx.lineTo(x + 0.9, y - 2.2); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}

export class PageRenderer {
  constructor(pages) {
    this.pages = pages;
    this.measureCanvas = document.createElement('canvas');
    this.mctx = this.measureCanvas.getContext('2d');
  }

  /**
   * state: { teacher:boolean, revealed:Set<string>, allAns:boolean }
   * 回傳 { canvas, figs:{id:{x,y,w,h}}, tables:{id:{x,y,w,h,block}}, gloss:[...], hot:[...], overflow }
   */
  // 內容超出版面時，逐步壓縮行距（最多 10%）
  render(num, state, canvas) {
    let res;
    for (this.vs = 1; this.vs >= 0.895; this.vs -= 0.015) {
      res = this.renderOnce(num, state, canvas);
      canvas = res.canvas;
      if (!res.overflow) break;
    }
    res.vs = this.vs;
    this.vs = 1;
    return res;
  }

  renderOnce(num, state, canvas) {
    const page = this.pages[num] || { blocks: [] };
    canvas = canvas || document.createElement('canvas');
    canvas.width = Math.round(PT_W * TEX_SCALE); canvas.height = Math.round(PT_H * TEX_SCALE);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
    this.paper(ctx, num);
    const out = { canvas, figs: {}, tables: {}, gloss: [], hot: [], overflow: 0, notes: [] };
    if (!page) return out;
    const left = num % 2 === 0;
    const env = { ctx, num, state, out, left, tcount: 0 };
    const blocks = page.blocks || [];
    const summary = blocks.some((b) => b.t === 'sumHead' || b.t === 'sumChapter' || b.t === 'sumItem');
    if (summary) { ctx.fillStyle = 'rgba(214,150,150,0.10)'; ctx.fillRect(X0 - 8, 66, X1 - X0 + 16, 680); }
    this.header(ctx, num, left);
    this.footer(ctx, num, left);
    let y = TOP;
    const noteBlocks = blocks.filter((b) => b.t === 'note');
    let bottom = BOTTOM;
    // 頁底註：由下往上排
    if (noteBlocks.length) {
      const lays = noteBlocks.map((b) => this.noteLayout(b));
      const total = lays.reduce((a, l) => a + l.h + 2, 0);
      let ny = 770 - total;
      bottom = ny - 5;
      for (const l of lays) { this.noteDraw(env, l, ny); ny += l.h + 2; }
    }
    env.bottom = bottom;
    y = this.flow(env, blocks.filter((b) => b.t !== 'note'), X0, X1 - X0, y, 'p' + num);
    if (y > bottom + 1) out.overflow = y - bottom;
    return out;
  }

  paper(ctx, num) {
    drawPaper(ctx, PT_W, PT_H, num);
    // 書溝陰影（印在紙上的漸層，讓紙更像紙）
    const left = num % 2 === 0;
    const g = ctx.createLinearGradient(left ? PT_W : 0, 0, left ? PT_W - 40 : 40, 0);
    g.addColorStop(0, 'rgba(90,70,40,0.16)'); g.addColorStop(1, 'rgba(90,70,40,0)');
    ctx.fillStyle = g; ctx.fillRect(left ? PT_W - 40 : 0, 0, 40, PT_H);
  }

  header(ctx, num, left) {
    const st = { font: 'sans', weight: 400 };
    if (left) text(ctx, CHAPTER.book, X0 + 22, 44, st, 11.5, INK);
    else text(ctx, CHAPTER.header || `${CHAPTER.label}　${CHAPTER.title}`, X1 - 22, 44, st, 11.5, INK, 'right');
    ctx.strokeStyle = INK; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(X0, 52); ctx.lineTo(X1, 52); ctx.stroke(); ctx.globalAlpha = 1;
  }

  footer(ctx, num, left) {
    const x = left ? 40 : PT_W - 40, y = 757;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(x, y - 3.5, 11, 0, Math.PI * 2); ctx.stroke();
    text(ctx, String(num), x, y, { font: 'serif' }, 9.5, INK, 'center');
  }

  noteLayout(b) {
    const runs = parseRich(b.text, { font: 'sans', size: 8.4 });
    const lay = layout(this.mctx, runs, { width: X1 - X0 - 26, size: 8.4, lineH: 12.5, tracking: 0.3, align: 'left' });
    return { b, lay, h: lay.height };
  }
  noteDraw(env, l, y) {
    const { ctx } = env;
    text(ctx, l.b.mark || '註', X0, y + 9.5, { font: 'sans', weight: 700 }, 8.4, VERMILION);
    const g = drawLayout(ctx, l.lay, X0 + 26, y, { size: 8.4, tracking: 0.3 }, env.state);
    env.out.gloss.push(...g);
  }

  // 依序排放區塊，回傳新的 y
  flow(env, blocks, x, w, y, path) {
    blocks.forEach((b, i) => { y = this.block(env, b, x, w, y, `${path}.${i}`); });
    return y;
  }

  para(env, str, x, w, y, o = {}) {
    const base = { font: o.font || 'serif', weight: o.weight || 400, color: o.color, keyColor: o.keyColor };
    const size = o.size || BODY.size;
    const runs = parseRich(str, base);
    const lay = layout(env.ctx, runs, { width: w, size, lineH: (o.lineH || BODY.lineH) * (this.vs || 1), tracking: o.tracking ?? BODY.tracking, indent: o.indent ?? 0, hang: o.hang || 0, align: o.align });
    if (!o.measureOnly) {
      const g = drawLayout(env.ctx, lay, x, y, { size, tracking: o.tracking ?? BODY.tracking, color: o.color }, env.state);
      env.out.gloss.push(...g);
    }
    return lay.height;
  }

  revealed(env, id) { return env.state.allAns || env.state.revealed.has(id); }

  // 答案格：預設空白，點擊後朱筆寫上
  ansSlot(env, id, x, y, w, h, ans, size = 11) {
    env.out.hot.push({ type: 'ans', id, x, y, w, h });
    const { ctx } = env;
    if (this.revealed(env, id)) {
      text(ctx, ans, x + w / 2, y + h * 0.78, { font: 'hand', weight: 500 }, size * 1.15, PEN, 'center');
    } else {
      ctx.save(); ctx.setLineDash([1.5, 1.8]); ctx.strokeStyle = 'rgba(28,36,51,0.45)'; ctx.lineWidth = 0.6;
      rr(ctx, x + 0.5, y + 1, w - 1, h - 2, 2); ctx.stroke(); ctx.restore();
    }
  }

  block(env, b, x, w, y, id) {
    const { ctx, state, out } = env;
    if (b.t === 'exam' || b.t === 'teacher' || b.t === 'teacherTable') {
      const f = FLOATS[`${env.num}:${env.tcount++}`];
      if (f) {
        if (state.teacher) {
          ctx.save(); ctx.fillStyle = 'rgba(246,239,224,0.92)'; ctx.fillRect(f[0] - 3, f[1] - 2, f[2] + 6, Math.min(f[3] + 4, 140)); ctx.restore();
          if (b.t === 'exam') this.exam(env, b, f[0], f[2], f[1], id, true);
          else if (b.t === 'teacherTable') this.teacherTable(env, { ...b, w: f[2] }, f[0], f[2], f[1]);
          else this.block(env, { ...b, t: 'teacherFlow' }, f[0], f[2], f[1], id);
        }
        return y;
      }
      if (b.t === 'teacher') b = { ...b, t: 'teacherFlow' };
    }
    switch (b.t) {
      case 'space': return y + (b.h || 8);
      case 'chapterBanner': return this.banner(env, b);
      case 'h1': {
        y += 12;
        text(ctx, b.num, x, y + 18, { font: 'sans', weight: 700 }, 19, VERMILION);
        const nw = measureWidth(ctx, b.num, { font: 'sans', weight: 700 }, 19) + 16;
        text(ctx, b.text, x + nw, y + 18, { font: 'serif', weight: 700 }, 19, INK);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(x, y + 25); ctx.lineTo(x + w, y + 25); ctx.stroke(); ctx.globalAlpha = 1;
        return y + 36;
      }
      case 'h2': {
        y += 8;
        text(ctx, b.num, x, y + 15, { font: 'sans', weight: 700 }, 15.5, VERMILION);
        const nw = measureWidth(ctx, b.num, { font: 'sans', weight: 700 }, 15.5) + 13;
        text(ctx, b.text, x + nw, y + 15, { font: 'serif', weight: 700 }, 15.5, INK);
        return y + 27;
      }
      case 'h3box': {
        y += 4;
        const tw = measureWidth(ctx, b.text, { font: 'sans', weight: 700 }, 13) + 14;
        ctx.fillStyle = 'rgba(80,140,150,0.10)'; ctx.fillRect(x, y, tw, 22);
        inkRect(ctx, x, y, tw, 22, 0.8);
        text(ctx, b.text, x + 7, y + 16, { font: 'sans', weight: 700 }, 13, INK);
        return y + 30;
      }
      case 'p': {
        const h = this.para(env, b.text, x, w, y, { indent: BODY.size * 2 + BODY.tracking * 2 });
        return y + h + 4;
      }
      case 'bullets': {
        for (let it of b.items) {
          if (!it.startsWith('{')) it = it.replace(/^([^：（{]{2,12})(（[^）]*）)?：/, (m0, a, c) => `{${a}|b,k=1}${c || ''}：`);
          bulletIcon(ctx, x + 12, y + 12);
          const h = this.para(env, it, x + 24, w - 24, y);
          y += h + 3;
        }
        return y + 2;
      }
      case 'example': {
        y += 4;
        ctx.fillStyle = '#4a5f8a'; ctx.beginPath(); ctx.arc(x + 20, y + 10, 8, 0, Math.PI * 2); ctx.fill();
        text(ctx, '例', x + 20, y + 14, { font: 'sans', weight: 700 }, 10.5, PAPER, 'center');
        text(ctx, b.title, x + 36, y + 14.5, { font: 'sans', weight: 700 }, 12, INK);
        y += 22;
        const h = this.para(env, b.text, x + 36, w - 36, y, { indent: BODY.size * 2 + BODY.tracking * 2 });
        return y + h + 6;
      }
      case 'fig': {
        const fy = b.src && b.src.bbox ? Math.max(y, b.src.bbox[1]) : y;
        const fx = b.src && b.src.bbox && !b.inRow ? b.src.bbox[0] : x;
        const fw = b.src && b.src.bbox && !b.inRow ? (b.src.bbox[2] - b.src.bbox[0]) : w;
        const r = { x: fx, y: fy, w: fw, h: b.h, id: b.id };
        out.figs[b.id] = r;
        let yy = fy + b.h + 4;
        const capSt = { font: 'sans', weight: 400 };
        if (b.caption && b.capPos === 'left') {
          // 原書：圖說在圖框左下角（圖框內），不另佔高度
          const cap = b.caption + ' ▶';
          text(ctx, cap, fx + 4, fy + b.h - 4, capSt, 9.2, INK, 'left');
          r.capY = fy + b.h - 14; r.capLeft = true;
          r.tab = { x: fx + 4 + ctx.measureText(cap).width + TAB.gap, y: fy + b.h - 7.3 - TAB.h / 2, w: TAB.w, h: TAB.h };
          return fy + b.h + 6;
        }
        if (b.caption) {
          // 圖說和「示範」紙籤排成一組，一起置中在圖的下方；圖太窄時不超出版心
          const cap = '▲ ' + b.caption;
          ctx.font = fontCss(capSt, 9.2);
          const cw = ctx.measureText(cap).width, total = cw + TAB.gap + TAB.w;
          const x0 = Math.max(X0, Math.min(X1 - total, fx + fw / 2 - total / 2));
          text(ctx, cap, x0, yy + 9, capSt, 9.2, INK, 'left');
          r.capY = yy; r.capBox = { x: x0, y: yy, w: cw, h: 12 };
          r.tab = { x: x0 + cw + TAB.gap, y: yy + 5.7 - TAB.h / 2, w: TAB.w, h: TAB.h };
          yy += 15;
        } else r.tab = sideTab(fx, fy + b.h - TAB.h, fw, env.left); // 沒有圖說的圖：紙籤貼在圖旁的頁邊，對齊圖的下緣
        return yy + 4;
      }
      case 'table': return this.table(env, b, x, w, y, id);
      case 'exam': return this.exam(env, b, x, w, y, id);
      case 'tip': {
        const pad = 9;
        const h = this.para(env, b.text, x + pad, w - pad * 2, y, { measureOnly: true, font: 'sans', size: 9.8, lineH: 16, tracking: 0.4 });
        const H = h + 30;
        ctx.save(); ctx.translate(x + w / 2, y + H / 2); ctx.rotate(-0.012); ctx.translate(-(x + w / 2), -(y + H / 2));
        ctx.shadowColor = 'rgba(60,40,10,0.25)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#f7e9a0'; ctx.fillRect(x, y, w, H); ctx.shadowColor = 'transparent';
        // 翹起的角
        ctx.fillStyle = '#e6d488'; ctx.beginPath(); ctx.moveTo(x + w, y + H - 12); ctx.lineTo(x + w - 12, y + H); ctx.lineTo(x + w, y + H); ctx.closePath(); ctx.fill();
        text(ctx, 'TIP', x + pad, y + 17, { font: 'hand', weight: 500 }, 14, VERMILION);
        this.para(env, b.text, x + pad, w - pad * 2, y + 24, { font: 'sans', size: 9.8, lineH: 16, tracking: 0.4 });
        ctx.restore();
        return y + H + 8;
      }
      case 'dict': {
        const pad = 8;
        const h = this.para(env, b.text, x + pad, w - pad * 2, y, { measureOnly: true, font: 'sans', size: 9.8, lineH: 16, tracking: 0.4 });
        const H = h + 36;
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, w, H);
        inkRect(ctx, x, y, w, H, 0.8);
        ctx.fillStyle = 'rgba(70,110,160,0.12)'; ctx.fillRect(x + 1, y + 1, w - 2, 24);
        text(ctx, b.term, x + pad, y + 18, { font: 'sans', weight: 700 }, 13, INK);
        text(ctx, '電腦小辭典', x + w - pad, y + 17, { font: 'sans', weight: 700 }, 9, '#3d5f8a', 'right');
        this.para(env, b.text, x + pad, w - pad * 2, y + 30, { font: 'sans', size: 9.8, lineH: 16, tracking: 0.4 });
        return y + H + 8;
      }
      case 'teacherFlow': {
        if (b.title) { text(ctx, (state.teacher ? '⊕' : ''), x, y + 12, { font: 'hand' }, 11, PEN); }
        const runs = (b.title ? `{⊕${b.title}|t}` + (b.text ? '\n' : '') : '') + (b.text ? `{${b.text.replace(/[{}]/g, '')}|t}` : '');
        const h = this.para(env, runs, x, w, y, { font: 'hand', size: 10.5, lineH: 15.5, tracking: 0.3, align: 'left', color: PEN });
        return y + h + 3;
      }
      case 'teacherTable': return this.teacherTable(env, b, x, w, y);
      case 'practice': return this.practice(env, b, x, w, y, id);
      case 'exBanner': {
        y += 2;
        ctx.fillStyle = 'rgba(60,120,130,0.16)'; ctx.fillRect(x, y, w, 30); inkRect(ctx, x, y, w, 30, 0.9);
        text(ctx, b.text, x + w / 2, y + 21.5, { font: 'serif', weight: 700 }, 17, INK, 'center');
        return y + 40;
      }
      case 'exHead': {
        y += 4;
        text(ctx, '／／ ' + b.text + ' ／／', x + 6, y + 13, { font: 'sans', weight: 700 }, 12, '#2c6a73');
        return y + 21;
      }
      case 'q': return this.question(env, b, x, w, y, id);
      case 'reading': {
        y += 2;
        text(ctx, '▲', x, y + 12, { font: 'sans' }, 9, INK);
        const hl = this.para(env, b.lead, x + 14, w - 14, y, { font: 'sans', size: 10.2, lineH: 16, tracking: 0.4 });
        y += hl + 3;
        const pad = 8;
        const h = this.para(env, b.passage, x + pad, w - pad * 2, y + pad, { measureOnly: true, font: 'sans', size: 10, lineH: 16.5, tracking: 0.4, indent: 20 });
        ctx.fillStyle = 'rgba(110,170,150,0.14)'; ctx.fillRect(x, y, w, h + pad * 2);
        this.para(env, b.passage, x + pad, w - pad * 2, y + pad, { font: 'sans', size: 10, lineH: 16.5, tracking: 0.4, indent: 20 });
        return y + h + pad * 2 + 6;
      }
      case 'practiceOpen': {
        const lab = `${b.n}.`;
        text(ctx, lab, x + 4, y + 12, { font: 'sans' }, 10.2, INK);
        const h = this.para(env, b.q, x + 22, w - 22, y, { font: 'sans', size: 10.2, lineH: 16.5, tracking: 0.4 });
        y += h + 2;
        this.ansSlot(env, id, x + 22, y, 30, 16, b.ans || '略', 10);
        return y + 22;
      }
      case 'classify': {
        // 多元練習題的分類填空：題目、多欄的選項清單、多欄的「類別：＿＿」答案格
        const st = { font: 'sans' }, size = 10.2, lh = 17 * (this.vs || 1);
        text(ctx, `${b.n}.`, x + 4, y + 12.5, st, size, INK);
        y += this.para(env, b.q, x + 22, w - 22, y, { font: 'sans', size, lineH: 16.5, tracking: 0.4, align: 'left' }) + 6;
        const oc = b.optCols || 4, ow = (w - 22) / oc;
        (b.opts || []).forEach((o, i) => text(ctx, o, x + 22 + (i % oc) * ow, y + 12.5 + Math.floor(i / oc) * lh, st, size, INK));
        y += Math.ceil((b.opts || []).length / oc) * lh + 6;
        const bc = b.blankCols || 2, bw = (w - 22) / bc;
        (b.blanks || []).forEach((bl, i) => {
          const bx = x + 22 + (i % bc) * bw, by = y + Math.floor(i / bc) * (lh + 5);
          text(ctx, bl.label, bx, by + 12.5, st, size, INK);
          const lw = measureWidth(ctx, bl.label, st, size) + 2;
          ctx.fillStyle = INK; ctx.fillRect(bx + lw, by + 15.5, bw - lw - 14, 0.6);
          this.ansSlot(env, `${id}.${i}`, bx + lw, by - 1, bw - lw - 14, 16, bl.ans, size);
        });
        return y + Math.ceil((b.blanks || []).length / bc) * (lh + 5) + 6;
      }
      case 'sumHead': {
        y -= 4;
        ctx.fillStyle = '#e9b84a'; ctx.beginPath(); ctx.arc(x + 12, y + 12, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
        text(ctx, b.text || '重點整理', x + 26, y + 18, { font: 'sans', weight: 700 }, 14, INK);
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 26, y + 23); ctx.lineTo(x + w, y + 23); ctx.stroke();
        return y + 32;
      }
      case 'sumChapter': {
        y += 4;
        text(ctx, b.text, x + 4, y + 14, { font: 'sans', weight: 700 }, 13, '#2c5a8a');
        return y + 22;
      }
      case 'sumItem': {
        text(ctx, '♣', x + 6, y + 12.5, { font: 'sans' }, 9, VERMILION);
        const h = this.para(env, b.text, x + 20, w - 20, y, { font: 'sans', size: 10.2, lineH: 16.2, tracking: 0.35, keyColor: '#9a2f22' });
        y += h + 2;
        for (const s of b.sub || []) {
          ctx.fillStyle = VERMILION; ctx.beginPath(); ctx.arc(x + 26, y + 8, 1.8, 0, Math.PI * 2); ctx.fill();
          const hs = this.para(env, s, x + 34, w - 34, y, { font: 'sans', size: 10.2, lineH: 16.2, tracking: 0.35, keyColor: '#9a2f22' });
          y += hs + 2;
        }
        return y + 3;
      }
      case 'row': {
        const gap = b.gap ?? 12;
        const total = b.cols.reduce((a, c) => a + c.w, 0);
        let cx = x, maxY = y;
        const avail = w - gap * (b.cols.length - 1);
        b.cols.forEach((c, ci) => {
          const cw = avail * c.w / total;
          const blocks = c.blocks.map((bb) => (bb.t === 'fig' ? { ...bb, inRow: true } : bb));
          const ey = this.flow(env, blocks, cx, cw, y, `${id}.c${ci}`);
          maxY = Math.max(maxY, ey);
          cx += cw + gap;
        });
        return maxY;
      }
      case 'more': {
        text(ctx, 'MORE ▶', x + w, Math.max(y + 10, env.bottom - 2), { font: 'sans', weight: 700 }, 9, '#8a8a8a', 'right');
        return y + 14;
      }
      default:
        console.warn('未知區塊', b.t);
        return y;
    }
  }

  // 章首：素紙上的墨色排版，不鋪色塊。上方照常有頁首，章號是墨線空心大字，引言首字放大佔兩行，引言下方一條淡線收尾
  banner(env, b) {
    const { ctx } = env;
    const serif = { font: 'serif', weight: 700 };
    text(ctx, 'Chapter', 44, 77, { ...serif, italic: true }, 17, INK);
    ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(44, 83); ctx.lineTo(130, 83); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.font = fontCss({ ...serif, italic: true }, 86); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(28,36,51,0.08)'; ctx.fillText(b.num, 40, 160); ctx.strokeText(b.num, 40, 160); ctx.restore();
    // 標題兩行：第二行往右縮排；太長時縮小字級，不超出版心
    const fit = (str, x) => { ctx.font = fontCss(serif, 33); return Math.min(33, 33 * (X1 - x) / ctx.measureText(str).width); };
    const ts = Math.min(fit(b.title[0], 184), b.title[1] ? fit(b.title[1], 210) : 33);
    text(ctx, b.title[0], 184, 118, serif, ts, INK);
    if (b.title[1]) text(ctx, b.title[1], 210, 164, serif, ts, INK);
    // 引言：首字放大，其餘排在首字右邊
    const chars = Array.from(b.intro);
    const opt = { size: 10.8, lineH: 19, tracking: 0.9 };
    const rest = chars.slice(1).join('');
    const h = this.para(env, rest, 126, X1 - 126, 190, { ...opt, measureOnly: true });
    text(ctx, chars[0], 76, 224, serif, 40, INK);
    this.para(env, rest, 126, X1 - 126, 190, opt);
    const rule = Math.max(236, 190 + h + 6);
    ctx.save(); ctx.strokeStyle = INK; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(X0, rule); ctx.lineTo(X1, rule); ctx.stroke(); ctx.restore();
    return rule + 10;
  }

  table(env, b, x, w, y, id) {
    const { ctx, state, out } = env;
    y += 4;
    let tab;
    if (b.caption) {
      // 表說和「示範」紙籤排成一組，一起置中在表的上方
      const cap = '▼ ' + b.caption, capSt = { font: 'sans' };
      ctx.font = fontCss(capSt, 9.2);
      const cw = ctx.measureText(cap).width, total = cw + TAB.gap + TAB.w;
      const x0 = Math.max(X0, Math.min(X1 - total, x + w / 2 - total / 2));
      text(ctx, cap, x0, y + 10, capSt, 9.2, INK, 'left');
      tab = { x: x0 + cw + TAB.gap, y: y + 6.7 - TAB.h / 2, w: TAB.w, h: TAB.h };
      y += 16;
    } else tab = sideTab(x, y + 1, w, env.left); // 沒有表說的表：紙籤貼在表旁的頁邊，對齊表的上緣
    const L = this.tableLayout(b, w, env);
    const r = { x, y, w, h: L.h, id: b.id, block: b, layout: L, tab };
    out.tables[b.id] = r;
    this.tableDraw(ctx, b, L, x, y, state, env);
    return y + L.h + 8;
  }

  // 表格版面：欄寬、列高、儲存格排版（3D 立體表格共用）
  tableLayout(b, w, env) {
    const ctx = this.mctx;
    const hasHead = !!(b.cols && b.cols.length);
    const nCols = Math.max(hasHead ? b.cols.length : 0, ...b.rows.map((r) => r.length));
    const ws = b.widths || Array.from({ length: nCols }, () => 1);
    const tot = ws.reduce((a, c) => a + c, 0);
    const colW = ws.map((c) => (w * c) / tot);
    const size = b.size || 9.8;
    const all = hasHead ? [b.cols, ...b.rows] : b.rows;
    const merged = new Map(); // key r,c -> [rs,cs]
    const covered = new Set();
    for (const [r, c, rs, cs] of b.merge || []) {
      merged.set(r + ',' + c, [rs, cs]);
      for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (i !== r || j !== c) covered.add(i + ',' + j);
    }
    const cells = [];
    const rowH = all.map(() => size * 1.45 + 3.5);
    all.forEach((row, ri) => {
      for (let ci = 0; ci < nCols; ci++) {
        if (covered.has(ri + ',' + ci)) continue;
        const [rs, cs] = merged.get(ri + ',' + ci) || [1, 1];
        let cw = 0; for (let j = ci; j < ci + cs; j++) cw += colW[j];
        const str = row[ci] ?? '';
        const st = { font: 'sans', weight: hasHead && ri === 0 ? 700 : 400 };
        const lay = layout(ctx, parseRich(String(str), st), { width: cw - 8, size, lineH: size * 1.4, tracking: 0.2, align: 'center' });
        const need = lay.height + 4;
        if (rs === 1) rowH[ri] = Math.max(rowH[ri], need);
        cells.push({ r: ri, c: ci, rs, cs, w: cw, lay, head: hasHead && ri === 0, teacher: (b.teacherCols || []).includes(ci) });
      }
    });
    const rowY = []; let acc = 0;
    rowH.forEach((h, i) => { rowY[i] = acc; acc += h; });
    const colX = []; let ax = 0;
    colW.forEach((cw, i) => { colX[i] = ax; ax += cw; });
    for (const c of cells) {
      c.x = colX[c.c]; c.y = rowY[c.r];
      let h = 0; for (let i = c.r; i < c.r + c.rs; i++) h += rowH[i];
      c.h = h;
    }
    return { cells, rowH, rowY, colW, colX, h: acc, w, size };
  }

  tableDraw(ctx, b, L, x, y, state, env) {
    const size = L.size;
    for (const c of L.cells) {
      if (c.teacher && !state.teacher) continue;
      const cx = x + c.x, cy = y + c.y;
      if (c.head) { ctx.fillStyle = c.teacher ? 'rgba(181,48,42,0.08)' : 'rgba(28,36,51,0.08)'; ctx.fillRect(cx, cy, c.w, c.h); }
      ctx.strokeStyle = c.teacher ? PEN : INK; ctx.lineWidth = 0.6; ctx.strokeRect(cx, cy, c.w, c.h);
      const g = drawLayout(ctx, c.lay, cx + 4, cy + (c.h - c.lay.height) / 2, { size, tracking: 0.2, color: c.teacher ? PEN : INK }, { ...state, teacher: true });
      if (env) env.out.gloss.push(...g);
    }
  }

  // 單一儲存格繪製到獨立 canvas（3D 立體表格用）
  cellCanvas(b, c, L, state, scale = 4) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(c.w * scale); cv.height = Math.ceil(c.h * scale);
    const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = c.head ? '#e9e2d2' : PAPER; ctx.fillRect(0, 0, c.w, c.h);
    drawLayout(ctx, c.lay, 4, (c.h - c.lay.height) / 2, { size: L.size, tracking: 0.2, color: c.teacher ? PEN : INK }, { ...state, teacher: true });
    return cv;
  }

  exam(env, b, x, w, y, id, floated) {
    const { ctx, state } = env;
    if (!state.teacher && !floated) {
      // 預留空間，內容隱藏
      const h = this.examHeight(env, b, w);
      return y + h + 6;
    }
    const tagW = 58;
    const h = this.examHeight(env, b, w);
    ctx.strokeStyle = PEN; ctx.lineWidth = 0.7; ctx.strokeRect(x + tagW, y, w - tagW, h);
    text(ctx, '統測這樣考', x, y + 11, { font: 'sans', weight: 700 }, 9, PEN);
    ctx.fillStyle = PEN; ctx.fillRect(x, y + 13, 50, 0.6);
    // ( ? )num.
    const ax = x + tagW + 4;
    text(ctx, '(', ax, y + 13, { font: 'serif' }, 10, PEN);
    this.ansSlot(env, id, ax + 4, y + 1, 16, 15, b.ans, 10);
    text(ctx, `)${b.num}.`, ax + 21, y + 13, { font: 'serif' }, 10, PEN);
    const body = b.q + (b.opts ? '　' + optStr(b.opts) : '') + `　[${b.year}]`;
    this.para(env, body, ax + 44, w - tagW - 52, y + 1, { size: 9.6, lineH: 14.5, tracking: 0.3, color: PEN, align: 'left' });
    return y + h + 6;
  }
  examHeight(env, b, w) {
    const body = b.q + (b.opts ? '　' + optStr(b.opts) : '') + `　[${b.year}]`;
    return this.para(env, body, 0, w - 58 - 52, 0, { measureOnly: true, size: 9.6, lineH: 14.5, tracking: 0.3 }) + 3;
  }

  teacherTable(env, b, x, w, y) {
    const { ctx, state } = env;
    const tb = { cols: b.cols, rows: b.rows, widths: b.widths, size: 9.4 };
    const tw = Math.min(w, b.w || w);
    let hTitle = 0;
    if (b.title) hTitle = this.para(env, b.title, x, tw, y, { measureOnly: true, font: 'hand', size: 10.2, lineH: 15 });
    const L = this.tableLayout(tb, tw);
    if (state.teacher) {
      if (b.title) this.para(env, `{⊕${b.title}|t}`, x, tw, y, { font: 'hand', size: 10.2, lineH: 15, align: 'left' });
      const yy = y + hTitle + 2;
      for (const c of L.cells) {
        ctx.strokeStyle = PEN; ctx.lineWidth = 0.6; ctx.strokeRect(x + c.x, yy + c.y, c.w, c.h);
        if (c.head || (!b.cols?.length && c.c === 0)) { ctx.fillStyle = 'rgba(181,48,42,0.08)'; ctx.fillRect(x + c.x, yy + c.y, c.w, c.h); }
        drawLayout(ctx, c.lay, x + c.x + 4, yy + c.y + (c.h - c.lay.height) / 2, { size: L.size, color: PEN }, { teacher: true });
      }
    }
    return y + hTitle + 2 + L.h + 6;
  }

  practice(env, b, x, w, y, id) {
    const { ctx } = env;
    y += 6;
    // 標籤
    ctx.fillStyle = '#e8a33a'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 58, y); ctx.lineTo(x + 66, y + 11); ctx.lineTo(x + 58, y + 22); ctx.lineTo(x, y + 22); ctx.closePath(); ctx.fill();
    text(ctx, '節練習', x + 6, y + 16, { font: 'serif', weight: 700 }, 13, INK);
    const top = y + 26;
    let yy = top + 6;
    const pad = 12;
    const items = b.items.map((it, i) => ({ it, i }));
    const draw = (dry) => {
      let cy = top + 6;
      for (const { it, i } of items) {
        const qid = `${id}.${i}`;
        const hasBlank = /＿＿/.test(it.q);
        if (!hasBlank) {
          if (!dry) this.ansSlot(env, qid, x + pad, cy, 22, 16, it.ans, 10.5);
          if (!dry) text(ctx, `${i + 1}.`, x + pad + 26, cy + 12.5, { font: 'sans' }, 10.2, INK);
          const qs = it.q + (it.opts ? '\n' + optStr(it.opts) : '');
          const h = this.para(env, qs, x + pad + 42, w - pad * 2 - 42, cy, { font: 'sans', size: 10.2, lineH: 16.5, tracking: 0.35, align: 'left', measureOnly: dry });
          cy += h + 6;
        } else {
          if (!dry) text(ctx, `${i + 1}.`, x + pad + 26, cy + 12.5, { font: 'sans' }, 10.2, INK);
          const [pre, post] = it.q.split('＿＿');
          const preW = measureWidth(ctx, pre, { font: 'sans' }, 10.2, 0.35);
          if (!dry) {
            text(ctx, pre, x + pad + 42, cy + 12.5, { font: 'sans' }, 10.2, INK);
            ctx.fillStyle = INK; ctx.fillRect(x + pad + 42 + preW, cy + 15, 70, 0.6);
            this.ansSlot(env, qid, x + pad + 42 + preW, cy - 1, 70, 16, it.ans, 10.5);
          }
          const h = this.para(env, post, x + pad + 42, w - pad * 2 - 42, cy, { font: 'sans', size: 10.2, lineH: 16.5, tracking: 0.35, indent: preW + 74, align: 'left', measureOnly: dry });
          cy += h + 6;
        }
      }
      return cy;
    };
    const endY = draw(true);
    ctx.fillStyle = 'rgba(247,236,150,0.45)'; ctx.fillRect(x, top, w, endY - top + 4);
    draw(false);
    return endY + 12;
  }

  question(env, b, x, w, y, id) {
    const { ctx, state } = env;
    const size = 10.2, lh = 16.5 * (this.vs || 1), tr = 0.35;
    if (b.tag) {
      ctx.fillStyle = 'rgba(60,120,130,0.18)'; ctx.fillRect(x - 30, y + 2, 24, 12);
      text(ctx, b.tag, x - 18, y + 11.5, { font: 'sans', weight: 700 }, 7.5, '#2c6a73', 'center');
    }
    if (b.star && state.teacher) text(ctx, '*', x - 2, y + 13, { font: 'sans' }, 10, PEN);
    this.ansSlot(env, id, x + 4, y, 22, 16, b.ans, size);
    text(ctx, `${b.n}.`, x + 30, y + 12.5, { font: 'sans' }, size, INK);
    if (b.year && /[^0-9]/.test(b.year)) b = { ...b, q: b.q + `　[${b.year}]` };
    const qx = x + 48, qw = w - 48;
    let h = this.para(env, b.q, qx, qw, y, { font: 'sans', size, lineH: lh, tracking: tr, align: 'left' });
    let yy = y + h;
    const opts = (b.opts || []).map((o, i) => optLetter(i) + o);
    const cols = b.optCols || 4;
    if (opts.length) {
      if (cols >= 4 && !b.inline) {
        const s = opts.join('　');
        const hh = this.para(env, s, qx, qw, yy, { font: 'sans', size, lineH: lh, tracking: tr, align: 'left' });
        yy += hh;
      } else if (cols === 1 && b.explain) {
        // 選項單欄、詳解在右側（原書版面）
        const ow = qw * 0.36, top = yy;
        for (const o of opts) yy += this.para(env, o, qx, ow, yy, { font: 'sans', size, lineH: lh, tracking: tr, align: 'left' });
        const show = this.revealed(env, id);
        const he = this.para(env, b.explain, qx + ow + 4, qw - ow - 4, top, { font: 'hand', size: 9.6, lineH: 13.6, tracking: 0.2, color: PEN, align: 'left', measureOnly: !show });
        yy = Math.max(yy, top + he);
        b = { ...b, explain: null };
      } else {
        const cw = qw / cols;
        for (let i = 0; i < opts.length; i += cols) {
          let rowH = lh;
          for (let j = 0; j < cols && i + j < opts.length; j++) {
            const hh = this.para(env, opts[i + j], qx + j * cw, cw - 6, yy, { font: 'sans', size, lineH: lh, tracking: tr, align: 'left' });
            rowH = Math.max(rowH, hh);
          }
          yy += rowH;
        }
      }
    }
    if (b.explain) {
      const show = this.revealed(env, id);
      const hh = this.para(env, b.explain, qx + 8, qw - 8, yy + 2, { font: 'hand', size: 9.8, lineH: 14, tracking: 0.2, color: PEN, align: 'left', measureOnly: !show });
      yy += hh + 2;
    }
    return yy + 6;
  }
}
