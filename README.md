# SKILL.md Collections

存放我撰寫與維護的 Skills。每個 Skill 使用獨立資料夾，集中管理 `SKILL.md` 與相關文件、腳本及素材。

## 資料夾結構

每個 Skill 的資料夾直接放在 repository 根目錄，資料夾名稱即為 Skill 名稱。以下為結構示意：

```text
skill.md-collections/
├── README.md
├── skill-name/
│   ├── SKILL.md
│   ├── references/
│   │   └── guide.md
│   ├── scripts/
│   │   └── example.py
│   └── assets/
│       └── template.txt
└── another-skill/
    └── SKILL.md
```

| 路徑 | 用途 |
| --- | --- |
| `<skill-name>/SKILL.md` | Skill 的名稱、用途、適用情境與操作指引 |
| `<skill-name>/references/` | 補充說明、參考文件與範例 |
| `<skill-name>/scripts/` | Skill 使用的腳本與工具 |
| `<skill-name>/assets/` | 範本、圖片與其他素材 |

每個 Skill 必須包含 `SKILL.md`；其他子資料夾依實際需要建立。

## 新增 Skill

1. 在根目錄建立以 Skill 名稱命名的資料夾，使用小寫英文字母、數字與連字號，例如 `meeting-notes`。
2. 在資料夾內新增 `SKILL.md`，使用以下基本格式：

   ```markdown
   ---
   name: meeting-notes
   description: 將會議逐字稿整理成摘要、決策與待辦事項；適用於使用者要求整理會議紀錄時。
   ---

   # Meeting Notes

   ## 操作流程

   1. 閱讀使用者提供的會議逐字稿。
   2. 整理討論重點與已確認的決策。
   3. 列出待辦事項、負責人與期限；缺少的資訊標註為待確認。

   ## 輸出格式

   依序輸出會議摘要、決策與待辦事項。
   ```

3. 將相關文件與素材放入同一個 Skill 資料夾，並在 `SKILL.md` 使用相對路徑引用，例如 `[參考說明](references/guide.md)`。
4. 提交新增的 Skill 資料夾。

## 撰寫原則

- `name` 與資料夾名稱保持一致。
- `description` 說明 Skill 能做什麼，以及何時應使用。
- 操作指引使用明確步驟，寫清楚輸入、輸出與必要條件。
- 詳細參考資料放在 `references/`，並從 `SKILL.md` 連結。
- 腳本需要的執行環境、相依套件與使用方式記錄於該 Skill 的文件。
- 提交前檢查文件連結與腳本，並確認內容不含密碼、API 金鑰或個人機密資料。
