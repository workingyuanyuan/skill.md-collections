// 全書共用的尺寸、色彩與字型設定（各章相同，不要改；章節資料寫在 content/chapter.js）
import { CHAPTER } from '../content/chapter.js';
export const PT_W = 595.276, PT_H = 793.701;      // PDF 頁面尺寸（pt）
export const PAGE_W = 1.5, PAGE_H = PAGE_W * PT_H / PT_W; // 世界單位
export const WPT = PAGE_W / PT_W;                  // 每 pt 的世界長度
export const TEX_SCALE = 3.0;                      // 頁面貼圖：每 pt 像素
export const BLOCK_H = 0.1;                        // 書頁堆高度
export const BOARD_T = 0.028;                      // 書板厚度
export const PAPER_Y = BOARD_T + BLOCK_H;          // 紙面高度
export const FIRST_PAGE = CHAPTER.firstPage, LAST_PAGE = CHAPTER.lastPage;
// 「示範」紙籤在頁面上的大小（pt）：排版（pagerender.js）留位置，figures.js 依此做出立體的紙片
export const TAB = { w: 54, h: 20, gap: 7 }; // 寬度要放得進頁邊（版心外側留白 57pt）
// 示範自動播放的節奏：每一步停留秒數的倍率（1＝預設；講得慢就調大）。可在 content/chapter.js 用 demoPace 指定
export const DEMO_PACE = CHAPTER.demoPace ?? 1;

export const PAPER = '#f6efe0';
export const INK = '#1c2433';
export const VERMILION = '#9a3b2a';
export const PEN = '#b5302a';      // 教師朱筆
export const PAPER_RGB = [0xf6 / 255, 0xef / 255, 0xe0 / 255];

// 概念色：課文關鍵詞、模型、選取發光共用（定義在 content/chapter.js）
export const CONCEPT = CHAPTER.concepts;
// 淡彩（非概念色）
export const WASH = {
  paper: '#f6efe0', grey: '#d9d4c7', blue: '#bcd3e6', green: '#cfe3c4', yellow: '#f2e2a8',
  rose: '#efc9c4', violet: '#d9cfe8', sand: '#e8d6b4', teal: '#bfe0dc', slate: '#c9ced8',
};

export const FONT = {
  serif: '"NSerif", serif',
  sans: '"NSans", sans-serif',
  hand: '"WKai", cursive',
};
