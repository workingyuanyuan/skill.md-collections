# 頁面內容格式（src/content/pages.js）

`export const PAGES = { 88: {...}, 89: {...}, ... }`，鍵是原書頁碼，範圍要和 `chapter.js` 的 `firstPage`、`lastPage` 一致。

書是一個跨頁一個跨頁翻的，所以 `firstPage` 必須是左頁（偶數頁碼）、`lastPage` 必須是右頁（奇數頁碼）。本章從右頁開始或在左頁結束時，把範圍往外多算一頁，那一頁不用寫進 `PAGES`，會顯示成空白頁。

區塊類型是依《數位科技概論（上）》的版面元素做的。換成其他書時，先對照 PDF 找出這本書反覆出現的版面元素；現有類型不夠用時，在 `src/core/pagerender.js` 增加新的類型，並補進下表。

每頁：`{ blocks: [ ... ] }`。排版器由上而下排放區塊；頁首（書名／章名、頁碼）由程式自動加上，不寫在內容裡。
座標單位：頁寬 595pt、頁高 794pt；內文欄 x 由 57pt 到 538pt（寬 481pt），y 由 70pt 到 750pt，原點在頁面左上角。區塊高度由排版器計算，圖的高度由 `h` 指定（pt）。

## 行內標記（所有 text 字串）

- `{文字|b}`：原書紅色粗體關鍵詞。
- `{文字|c=KEY}`：概念色關鍵詞（粗體、概念色）。KEY 定義在 `chapter.js` 的 `concepts`。
- `{文字|g=ID}`：放大鏡詞條（ID 對應 GLOSSARY）。可與 b、c 併用：`{作業系統|b,g=os}`。
- `{文字|sup}`：上標（如 註、註1）。
- `{文字|t}`：教師版紅字註解（行內），預設隱藏。
- `{文字|u}`：底線（教師版畫線）。
- 換行：`\n`（僅在原書強制換行處使用，如題目選項分行）。

## 區塊類型

| t | 欄位 | 說明 |
| --- | --- | --- |
| `chapterBanner` | `num`, `title:[行1,行2?]`, `intro` | 章首（本章第一頁）：素紙上的墨色排版，不鋪色塊；章號是墨線空心大字，章名太長會自動縮小字級。intro 的第一字放大佔兩行，引言行數越多章首越高。 |
| `h1` | `num`, `text` | 節標題，如 5-1。 |
| `h2` | `num`, `text` | 小節，如 5-2.1。 |
| `h3box` | `text` | 方框小標（系統保護、網路控管）。 |
| `p` | `text` | 段落（首行縮排兩字）。 |
| `bullets` | `items:[text]` | 原書 ↻ 條列。 |
| `example` | `title`, `text` | 「例」案例框。 |
| `fig` | `id`, `h`, `caption`, `src:{page, bbox:[x0,y0,x1,y1]}`, `labels?:[text]`, `capPos?:'below'|'left'` | 立體圖佔位；`src.bbox` 是原圖在 PDF 頁面上的範圍（pt）：圖的左右位置與寬度取自它（放在 `row` 裡的圖除外），上緣放在 `bbox` 的 y，但上方的內容如果已經排到更下面，圖就接在內容之後；`labels` 照抄原圖中的文字，供圖模組使用；`capPos:'left'` 把圖說放進圖框內的左側，不另佔高度；caption 含圖號，如 `圖5-1  系統平台的運作流程－以Google地圖的運作為例`。 |
| `table` | `id`, `caption?`, `cols:[...]`, `rows:[[...]]`, `widths:[比例]`, `teacherCols?:[欄索引]`, `merge?:[[r,c,rs,cs]]` | 可升起的表格；`rows` 的儲存格為字串（可含行內標記）；`merge` 合併儲存格（列、欄、跨列、跨欄，索引含表頭列 0）。 |
| `exam` | `num`, `ans`, `year`, `q`, `opts:[...]` | 統測這樣考框（教師版）。ans 預設隱藏。 |
| `tip` | `text` | TIP 便利貼。 |
| `dict` | `term`, `text` | 電腦小辭典。 |
| `note` | `mark`, `text` | 頁底註（mark：`註`、`註1`…）。 |
| `teacher` | `text`, `title?` | 教師版紅字註解區塊（預設隱藏）。 |
| `teacherTable` | `title`, `cols`, `rows` | 教師版紅字小表（預設隱藏）。 |
| `practice` | `items:[{ans, q, opts?}]` | 節練習（填充題 opts 省略，q 內用 `＿＿` 表示空格）。 |
| `exBanner` | `text` | 「本章習題」橫幅。 |
| `exHead` | `text` | 選擇題／情境素養題／多元練習題 小標。 |
| `q` | `n`, `ans`, `q`, `opts:[...]`, `optCols:1|2|4`, `tag?`, `star?`, `explain?` | 習題；`tag` 為左側節別標記（5-2、5-3）；`star` 教師版星號；`explain` 教師版詳解（隨答案顯示）。 |
| `reading` | `lead`, `passage` | 閱讀題組（▲ 閱讀下文…＋底色短文）。 |
| `practiceOpen` | `n`, `q`, `ans` | 多元練習題（ans 如「略」）。 |
| `classify` | `n`, `q`, `opts:[...]`, `optCols`, `blanks:[{label, ans}]`, `blankCols` | 多元練習題的分類填空：多欄的選項清單，下方每個類別一個答案格。 |
| `sumHead` | `text` | 重點整理標題列。 |
| `sumChapter` | `text` | 重點整理章標，如 `第 3 章　系統平台的組成架構－硬體`。 |
| `sumItem` | `text`, `sub?:[text]` | 重點整理條目（♣），sub 為 ● 子項。 |
| `row` | `cols:[{w, blocks:[...]}]`, `gap?` | 左右並排；w 為比例。 |
| `space` | `h` | 垂直空白（pt）。 |
| `more` | – | 頁尾 MORE ▶。 |

## GLOSSARY

`export const GLOSSARY = { ID: { term, def, example? } }`：放大鏡說明卡。定義只能取自本章或本書文字，不增補知識點。

## 浮動區塊（src/content/floats.js）

`exam`、`teacher`、`teacherTable` 在原書中常疊在頁邊或課文旁。在 `floats.js` 以「頁碼:序號」為鍵（序號從 0 起算，依 `blocks` 裡出現的順序，只算這三種區塊，放在 `row` 裡的也算）、`[x, y, 寬, 高]`（pt，取自 PDF）為值，區塊就會放在那個位置，不佔內文的高度。

## 版面溢出

排版器在內容超出下邊界時會先自動縮小行距；仍然超出時，`window.book.overflow()` 會回報該頁超出的 pt 數，`tools/check.mjs` 會判定為未通過。圖的位置固定在原書的位置，所以修正方式是調整該頁圖的高度 `h`、把教師版區塊改成浮動，或把圖說放進圖框內（`capPos:'left'`）。不要刪減原書文字。
