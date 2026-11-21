// 紙的質感：讓書頁像真的紙，而不是均勻的色塊。
// drawPaper 把斑駁、細顆粒和彎曲的纖維畫進頁面貼圖（文字之後才印上去，所以不影響文字銳利度）；
// paperBump 產生可平鋪的凹凸貼圖，讓紙面對窗光有細微的明暗反應。
import * as THREE from 'three';
import { PAPER } from './config.js';

const rng = (seed) => { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// 在 ctx 目前的座標系（單位：pt）畫一張 w×h 的紙。seed 相同時結果相同。
export const PAGE_BASE = '#f2ead9'; // 書頁底色：比介面的紙色略灰，接近未塗布的書紙
export function drawPaper(ctx, w, h, seed = 1, base = PAGE_BASE) {
  const rnd = rng(seed * 9973 + 17);
  ctx.save();
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // 1. 大範圍斑駁：紙漿厚薄不均造成的深淺
  const blobs = Math.round((w * h) / 5200);
  for (let i = 0; i < blobs; i++) {
    const x = rnd() * w, y = rnd() * h, r = 22 + rnd() * 85;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.55;
    g.addColorStop(0, dark ? 'rgba(138,112,76,0.075)' : 'rgba(255,252,244,0.10)');
    g.addColorStop(1, dark ? 'rgba(138,112,76,0)' : 'rgba(255,252,244,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 2. 細顆粒
  const grains = Math.round((w * h) / 130);
  for (let i = 0; i < grains; i++) {
    const x = rnd() * w, y = rnd() * h, r = 0.25 + rnd() * 0.5;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,96,60,0.07)' : 'rgba(255,253,247,0.10)';
    ctx.fillRect(x, y, r, r);
  }
  // 3. 彎曲的纖維：一道亮線，旁邊貼著一道暗線，看起來像壓在紙裡的細絲
  const fibers = Math.round((w * h) / 520);
  ctx.lineCap = 'round';
  for (let i = 0; i < fibers; i++) {
    const x = rnd() * w, y = rnd() * h, len = 7 + rnd() * 16, a = rnd() * Math.PI * 2;
    const bend = (rnd() < 0.5 ? -1 : 1) * (2 + rnd() * 6);
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const cx = (x + ex) / 2 - Math.sin(a) * bend, cy = (y + ey) / 2 + Math.cos(a) * bend;
    const lw = 0.28 + rnd() * 0.34, strong = rnd() < 0.3;
    ctx.lineWidth = lw; ctx.strokeStyle = `rgba(112,90,58,${strong ? 0.34 : 0.2})`;
    ctx.beginPath(); ctx.moveTo(x + 0.3, y + 0.3); ctx.quadraticCurveTo(cx + 0.3, cy + 0.3, ex + 0.3, ey + 0.3); ctx.stroke();
    ctx.strokeStyle = `rgba(255,252,243,${strong ? 0.8 : 0.55})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
  }
  ctx.restore();
}

// 一小塊紙，給桌卡這類 HTML 紙片當背景用（CSS background-image）
let cssUrl = null;
export function paperCssUrl() {
  if (cssUrl) return cssUrl;
  const cv = document.createElement('canvas'); cv.width = 720; cv.height = 480;
  const ctx = cv.getContext('2d'); ctx.scale(2, 2);
  drawPaper(ctx, 360, 240, 77, '#f4ecd9');
  cssUrl = `url(${cv.toDataURL('image/jpeg', 0.9)})`;
  return cssUrl;
}

// 可平鋪的凹凸貼圖：細顆粒加纖維。回傳 THREE.CanvasTexture
let bump = null;
export function paperBump() {
  if (bump) return bump;
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const rnd = rng(4242);
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, N, N);
  const wrap = (fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); } };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * N, y = rnd() * N, r = 40 + rnd() * 90, up = rnd() < 0.5;
    wrap(() => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, up ? 'rgba(160,160,160,0.5)' : 'rgba(96,96,96,0.5)'); g.addColorStop(1, 'rgba(128,128,128,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] + (rnd() - 0.5) * 26; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const x = rnd() * N, y = rnd() * N, len = 10 + rnd() * 28, a = rnd() * Math.PI * 2, bend = (rnd() - 0.5) * 16;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const cx = (x + ex) / 2 - Math.sin(a) * bend, cy = (y + ey) / 2 + Math.cos(a) * bend;
    wrap(() => { ctx.lineWidth = 0.8 + rnd() * 0.8; ctx.strokeStyle = 'rgba(205,205,205,0.55)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke(); });
  }
  bump = new THREE.CanvasTexture(cv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(3, 4); bump.anisotropy = 4;
  return bump;
}
