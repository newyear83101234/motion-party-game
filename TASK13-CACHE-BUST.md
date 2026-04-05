# TASK13 — 修復快取問題

## 問題描述

1. `index.html` 本地檔案被截斷（630 bytes，正常應為 941 bytes），需要先還原
2. 瀏覽器會快取 JS 模組，導致修改程式碼後重新整理頁面看不到最新變化

## 修改步驟

### 步驟 1：還原被截斷的 index.html

```bash
git checkout -- index.html
```

### 步驟 2：修改 index.html 的 script 載入方式

找到目前的：
```html
<script type="module" src="js/main.js?v=22"></script>
```

整段替換為：
```html
<script>
  // 動態載入 main.js，用時間戳破壞快取，確保每次都取得最新版本
  const s = document.createElement('script');
  s.type = 'module';
  s.src = 'js/main.js?v=' + Date.now();
  document.body.appendChild(s);
</script>
```

這樣每次開啟頁面，`main.js` 的 URL 都不一樣，瀏覽器不會使用快取。

### 步驟 3：驗證

1. 確認 `index.html` 檔案完整（包含 `<video>`、`<canvas>`、`<div id="status">`、`<script>` 等標籤）
2. 確認語法正確
3. commit 並 push

## 注意

以後每次修改 JS 檔案後，不再需要手動更新版本號，`Date.now()` 會自動處理。
