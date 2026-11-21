// 中英混排排版器：行內標記解析、禁則斷行、左右對齊、逐字繪製
import { FONT, INK, CONCEPT, PEN } from './config.js';

const NO_START = new Set('，。、；：？！）」』】〉》〕…％,.;:?!)]}%·・～’”〞﹚﹜﹞」'.split(''));
const NO_END = new Set('（「『【〈《〔([{‘“〝﹙﹛﹝'.split(''));
const LATIN = /[A-Za-z0-9@#$&*+=\-_.\/'’:%~^<>|\\]/;

export function parseRich(str, base = {}) {
  const runs = [];
  const re = /\{([^{}|]+)\|([^{}]+)\}/g;
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) runs.push({ text: str.slice(last, m.index), style: { ...base } });
    const st = { ...base };
    for (const a of m[2].split(',')) {
      const [k, v] = a.trim().split('=');
      if (k === 'b') { st.weight = 700; st.color = st.keyColor || '#7d2a1e'; st.b = true; }
      else if (k === 'c') { st.weight = 700; st.concept = v; st.color = CONCEPT[v]?.color || INK; }
      else if (k === 'g') st.gloss = v;
      else if (k === 'sup') st.sup = true;
      else if (k === 't') { st.teacher = true; st.font = 'hand'; st.color = PEN; }
      else if (k === 'u') st.under = true;
      else if (k === 'k') { st.weight = 700; st.color = '#2b4f7a'; }
      else if (k === 'i') st.italic = true;
    }
    runs.push({ text: m[1], style: st });
    last = re.lastIndex;
  }
  if (last < str.length) runs.push({ text: str.slice(last), style: { ...base } });
  return runs;
}

export function fontCss(st, size) {
  const fam = FONT[st.font || 'serif'];
  return `${st.italic ? 'italic ' : ''}${st.weight || 400} ${size}px ${fam}`;
}

const wcache = new Map();
function charW(ctx, ch, css) {
  const k = css + '\u0000' + ch;
  let w = wcache.get(k);
  if (w === undefined) { ctx.font = css; w = ctx.measureText(ch).width; wcache.set(k, w); }
  return w;
}

// 把 runs 切成字元陣列（含樣式），再組成不可斷的群組
function toChars(runs) {
  const out = [];
  for (const r of runs) for (const ch of Array.from(r.text)) out.push({ ch, st: r.style });
  return out;
}

function isCJK(ch) { return /[⺀-鿿豈-﫿＀-￯　-〿]/.test(ch); }

function groupChars(chars) {
  // 1) 拉丁字串、數字合成一個單位；空白單獨成一個可斷點
  const units = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (c.ch === '\n') { units.push({ chars: [c], br: true }); i++; continue; }
    if (c.ch === ' ') { units.push({ chars: [c], space: true }); i++; continue; }
    if (LATIN.test(c.ch)) {
      const u = { chars: [] };
      while (i < chars.length && LATIN.test(chars[i].ch)) u.chars.push(chars[i++]);
      units.push(u); continue;
    }
    units.push({ chars: [c] }); i++;
  }
  // 2) 禁則：行首禁用的標點黏到前一單位；行尾禁用的開括號黏到後一單位
  const g = [];
  let pendingOpen = null;
  for (const u of units) {
    if (u.br || u.space) { if (pendingOpen) { g.push(pendingOpen); pendingOpen = null; } g.push(u); continue; }
    const first = u.chars[0].ch;
    if (u.chars.length === 1 && NO_END.has(first)) {
      pendingOpen = pendingOpen ? { chars: pendingOpen.chars.concat(u.chars) } : { chars: u.chars.slice() };
      continue;
    }
    let cur = pendingOpen ? { chars: pendingOpen.chars.concat(u.chars) } : { chars: u.chars.slice() };
    pendingOpen = null;
    if (NO_START.has(first) && g.length && !g[g.length - 1].br && !g[g.length - 1].space) {
      const prev = g[g.length - 1];
      prev.chars = prev.chars.concat(cur.chars);
      continue;
    }
    g.push(cur);
  }
  if (pendingOpen) g.push(pendingOpen);
  return g;
}

/**
 * 排版
 * opts: { width, size, lineH, indent(px), tracking(px), align:'justify'|'left'|'center', hang(px 後續行縮排) }
 * 回傳 { lines:[{y, items:[{ch,x,w,st}] , w}], height }
 */
export function layout(ctx, runs, opts) {
  const { width, size } = opts;
  const lineH = opts.lineH || size * 1.7;
  const tracking = opts.tracking ?? size * 0.08;
  const chars = toChars(runs);
  const groups = groupChars(chars);
  const measure = (c) => {
    const sz = c.st.sup ? size * 0.6 : (c.st.size || size);
    const w = charW(ctx, c.ch, fontCss(c.st, sz));
    return c.ch === ' ' ? w : w + tracking * (c.st.size ? c.st.size / size : 1);
  };
  for (const g of groups) { g.w = 0; for (const c of g.chars) { c.w = measure(c); g.w += c.w; } }

  const lines = [];
  let line = [], lw = 0, first = true;
  const avail = () => width - (first ? (opts.indent || 0) : (opts.hang || 0));
  const flush = (last) => {
    while (line.length && line[line.length - 1].space) { lw -= line[line.length - 1].w; line.pop(); }
    lines.push({ groups: line, w: lw, last, first });
    line = []; lw = 0; first = false;
  };
  for (const g of groups) {
    if (g.br) { flush(true); continue; }
    if (g.space && line.length === 0) continue;
    if (lw + g.w > avail() + 0.01 && line.length) {
      flush(false);
      if (g.space) continue;
    }
    if (g.w > avail() && !line.length) {
      // 過長單位（網址等）：逐字斷開
      for (const c of g.chars) {
        if (lw + c.w > avail() && line.length) flush(false);
        line.push({ chars: [c], w: c.w }); lw += c.w;
      }
      continue;
    }
    line.push(g); lw += g.w;
  }
  if (line.length || !lines.length) flush(true);

  const out = [];
  let y = 0;
  for (const L of lines) {
    const x0 = L.first ? (opts.indent || 0) : (opts.hang || 0);
    const room = width - x0;
    let gap = 0, x = x0;
    const align = opts.align || 'justify';
    if (align === 'justify' && !L.last && L.groups.length > 1) gap = (room - L.w) / (L.groups.length - 1);
    if (align === 'center') x = x0 + (room - L.w) / 2;
    if (align === 'right') x = x0 + (room - L.w);
    const items = [];
    for (const g of L.groups) {
      for (const c of g.chars) { items.push({ ch: c.ch, x, w: c.w, st: c.st }); x += c.w; }
      x += gap;
    }
    out.push({ y, items, w: L.w });
    y += lineH;
  }
  return { lines: out, height: lines.length * lineH, lineH };
}

/**
 * 繪製排好的行；layers：{ teacher:boolean }
 * 回傳詞條矩形 [{id, x,y,w,h}]
 */
export function drawLayout(ctx, lay, x0, y0, opts, layers = {}) {
  const size = opts.size;
  const gloss = [];
  const tracking = opts.tracking ?? size * 0.08;
  ctx.textBaseline = 'alphabetic';
  for (const L of lay.lines) {
    const base = y0 + L.y + size * 0.88 + ((lay.lineH - size) * 0.35);
    let gcur = null;
    for (const it of L.items) {
      const st = it.st;
      const sz = st.sup ? size * 0.6 : (st.size || size);
      const yy = st.sup ? base - size * 0.45 : base;
      if (st.gloss) {
        if (gcur && gcur.id === st.gloss && Math.abs(gcur.x + gcur.w - (x0 + it.x)) < sz * 2) gcur.w = x0 + it.x + it.w - gcur.x;
        else { gcur = { id: st.gloss, x: x0 + it.x, y: y0 + L.y, w: it.w, h: lay.lineH }; gloss.push(gcur); }
      } else gcur = null;
      if (st.teacher && !layers.teacher) continue;
      if (it.ch === ' ' || it.ch === '　') continue;
      ctx.font = fontCss(st, sz);
      ctx.fillStyle = st.color || opts.color || INK;
      ctx.fillText(it.ch, x0 + it.x, yy);
      if (st.under) {
        ctx.fillRect(x0 + it.x, base + size * 0.18, it.w, Math.max(1, size * 0.06));
      }
    }
  }
  return gloss;
}

export function measureWidth(ctx, str, st, size, tracking = 0) {
  let w = 0;
  for (const ch of Array.from(str)) w += charW(ctx, ch, fontCss(st, size)) + tracking;
  return w;
}
