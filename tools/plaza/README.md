# 小島同樂廣場後端（Google Apps Script）

注音小島「小島同樂廣場（全島合作目標）」的後端。規格：`docs/zhuyin-plaza-spec.md`。2026-10-11 建立。

| 東西 | 位置 |
|---|---|
| 試算表「注音小島同樂廣場」（存資料、阿葉可直接看/改） | https://docs.google.com/spreadsheets/d/1NEctJcl4y_zvyFQ5l0GbMYc_GZTrDRmoK2B8LR7SZkw/edit |
| 綁定的 Apps Script 編輯器 | https://script.google.com/d/1vvdZUzWn4IUuwfmw_fuK294mp8a17P7SHMnvtPZv2u-jpXZ0pxXlG5Bs/edit |
| 網頁應用程式網址（前端用） | 見 `config.json` 的 `webAppUrl` |
| 程式 | `gas/Code.js`、`gas/appsscript.json`（clasp 專案設定在 `.clasp.json`） |
| 本機測試 | `node tools/plaza/test-core.mjs` |
| 線上冒煙測試（授權後） | `node tools/plaza/smoke.mjs`（會真的加 3；`--read-only` 只讀） |

## 第一次授權（阿葉要做一次，約 2 分鐘）

程式要讀寫那張試算表，Google 規定要由試算表的主人（阿葉）親自按一次「允許」。Claude 不能代按。

1. 用電腦的 Chrome（登入 newyear8310@gmail.com）打開這個網址：
   https://script.google.com/d/1vvdZUzWn4IUuwfmw_fuK294mp8a17P7SHMnvtPZv2u-jpXZ0pxXlG5Bs/edit
   （或者打開試算表 → 上方選單「擴充功能」→「Apps Script」，是同一個地方。）
2. 畫面上方工具列有一個下拉選單（裡面寫著一個名字，例如 `doGet`），點開，選 **`setup`**。
3. 按旁邊的 **「▷ 執行」**。
4. 跳出「需要授權」的視窗 → 按 **「審查權限」**。
5. 選你的帳號 newyear8310@gmail.com。
6. 如果出現 **「Google 尚未驗證這個應用程式」**：
   按左下角小字 **「進階」** → 再按最下面 **「前往『注音小島同樂廣場』（不安全）」**。
   （會這樣是因為這是你自己的程式、沒有送 Google 審核，不是病毒。它只能碰這一張試算表。）
7. 看到權限說明（大意是「查看及管理已安裝這個應用程式的試算表」）→ 按 **「允許」**。
8. 畫面下方的「執行記錄」出現「執行完畢」就完成了。打開試算表，應該會看到「說明」「主題表」「本週」三個分頁。
9. 跟 Claude 說「同樂廣場授權好了」，Claude 會跑 `smoke.mjs` 確認網址能用。

授權前，網頁應用程式網址會回「存取遭拒」（HTTP 403），這是正常的。
（2026-10-11 已用另一個不需要授權的測試小程式確認：這個帳號的「任何人匿名可用」網頁應用程式可以正常開；所以 403 只是在等授權。）

## 架構

```
遊戲（iPad 網頁） ──GET──▶ 網頁應用程式 doGet ──讀──▶ 試算表（主題表、本週、說明）
                 ──POST─▶ 網頁應用程式 doPost ─加總─▶ 試算表「本週」那一週的那一列
```

- 網頁應用程式：執行身分＝阿葉（USER_DEPLOYING）、存取＝任何人含匿名（ANYONE_ANONYMOUS）。
- 授權範圍只有 `spreadsheets.currentonly`（只能碰綁定的這一張試算表）。
- 週次：台北時間（UTC+8）**週一 00:00 換週**；週 key＝該週週一日期 `YYYY-MM-DD`。
- 主題：「主題表」有寫那週就用（逐欄覆寫），沒寫就固定輪替 救援 rescue → 送貨 deliver → 釣魚 fish → 讀字 read → 收集 star，從 2026-10-12 那週開始。

### 讀取 GET
回應範例：
```json
{"ok":true,"w":"2026-10-19",
 "theme":{"key":"deliver","title":"送貨週","unit":"件","desc":"大家一起在彩虹配送站送出貨物","goals":[40,120,240]},
 "total":40,"reached":1,"plays":12,"cheers":[3,10,0,2],
 "prev":{"w":"2026-10-12","theme":{"key":"rescue","title":"救援週","unit":"隻","desc":"…","goals":[50,150,300]},"total":182,"reached":2},
 "paused":false,"now":1792000000000}
```
- `reached`：0＝還沒、1＝銅、2＝銀、3＝金。`prev` 是上一週結果；上一週早於 2026-10-12 時為 `null`。
- `paused`：暫停中仍可讀，前端可顯示「廣場休息中」。
- 快取 30 秒（數字最多慢 30 秒）。`now` 是伺服器現在時間（毫秒），前端可用來校正 iPad 時鐘。

### 送出 POST
- body 是 **text/plain** 的 JSON（避免 CORS 預檢）：`{"w":"2026-10-12","k":"goal","n":3}`，**只能有這三個欄位**，多一個就拒收。
- `k` 種類與 `n` 範圍（整數）：`goal` 本週主題貢獻 1..30、`play` 開始一局 1..10、`cheer1`..`cheer4` 四種加油貼紙 1..3。
- `w` 必須是伺服器算出的「本週」。**換週寬限**：週一 00:00 之後 10 分鐘內，仍接受「上一週」的送出，算進上一週那一列（跨週邊界玩完的那一局不掉）；下一週永遠不收（前端應以 GET 回來的 `w` 為準，不要用 iPad 時鐘自己算）。
- 回應：`{"ok":true}` 或 `{"ok":false,"why":"..."}`

| why | 意思 | 前端怎麼辦 |
|---|---|---|
| bad_body / bad_json / bad_kind / bad_n | 格式錯 | 丟掉，不重送 |
| bad_week | 週次不對（多半是上週的舊資料） | 丟掉 |
| paused | 阿葉按了緊急暫停 | 丟掉或留著，之後再試 |
| rate | 全站這一分鐘太多（超過 1500 次） | 留著，下次再送 |
| busy | 等鎖超過 8 秒 | 留著，下次再送 |
| no_sheet / auth / server | 後端問題 | 留著，下次再送 |

- 遞增用 LockService 鎖住「讀那一列→加→寫回」，不會因同時送出而遺失。
- 全站每分鐘上限 1500 次（CacheService 計數，不分來源，因為我們本來就不知道來源）。

## 隱私設計（送什麼、不送什麼）

- **送出的只有**：週次、種類、數量（例如「2026-10-12 這週、救援、3」）。
- **沒有**：裝置 ID、token、暱稱、個人成績、時間軌跡。Apps Script 的請求物件本來就沒有 IP 和標頭，程式結構上拿不到 IP。
- **試算表只存每週加總**，每週一列；唯一的時間是那一列的「最後更新（到分鐘）」。
- **不寫任何 log**：程式裡沒有 console/Logger；`exceptionLogging` 設成 `NONE`（錯誤不送到 Google Cloud 記錄）。
- Apps Script 平台本身會在編輯器的「執行作業」頁記下「哪個函式、幾點跑、成功或失敗」，不含請求內容或 IP（這是 Google 平台層，關不掉）。
- 讀取 GET 是公開的（任何人都能看到全島加總），這是刻意的：內容本來就是匿名總數。

## 怎麼改主題 / 目標

直接改試算表的「主題表」分頁（最多 1 分鐘生效；遊戲畫面最多再慢 30 秒）：

| 週次（週一日期） | 主題代號 | 標題（可空） | 單位（可空） | 銅 | 銀 | 金 | 說明（可空） |
|---|---|---|---|---|---|---|---|
| 2026-10-19 | fish |  |  | 60 | 180 | 360 |  |

- 主題代號只能填 `rescue` `deliver` `fish` `read` `star`；填錯就用當週的輪替主題。
- 銅銀金要是由小到大的正整數；填錯或空白就用該主題的預設值（救援 50/150/300、送貨 40/120/240、釣魚 60/180/360、讀字 150/450/900、收集 100/300/600）。
- 週次填非週一的日期會自動歸到那週的週一；同一週寫兩列以下面那列為準。
- 表上沒寫的週，照輪替自動帶。setup 已先填好 2026-10-12 起 5 週（＝預設值）。
- 已經結束的週不要再改（「上週結果」的銅銀金判定用的是主題表現在的值）。
- 目標調整原則（規格 §3）：之後依上週實際量的 70–80% 調。

## 緊急暫停

試算表「說明」分頁的「緊急暫停」打勾（命名範圍 `PAUSE`）→ 立刻不收任何送出（遊戲照常可以玩，只是不加總）；GET 仍可讀，並回 `paused:true`（最多慢 30 秒）。取消打勾就恢復。

## 改程式後重新部署（網址不變）

```bash
cd tools/plaza
node test-core.mjs                 # 先過本機測試
clasp push                         # 上傳程式
clasp deploy -i AKfycbxhCOnt4XBkdl7zkXbF6gH8jrl7Yx1U7I_xPNy9ByGkIc8u6BQG0jE2ZBNCqEVB3R5qtg -d "說明這次改了什麼"
node smoke.mjs --read-only         # 確認線上正常
```
- 一定要用 `-i` 指定同一個 deploymentId，網址才不會變（不加 `-i` 會開一個新網址）。
- 只 `clasp push` 不 deploy，線上版本不會變。
- 如果改了 `appsscript.json` 的 `oauthScopes`，阿葉要再照「第一次授權」做一次。

## 測試

- `node tools/plaza/test-core.mjs`：用 node vm 載入 `gas/Code.js`，假的 SpreadsheetApp/LockService/CacheService/ContentService/Utilities。涵蓋：台北週一 00:00 換週（含 UTC 週日 16:00、跨年、三年窮舉）、主題輪替與覆寫、各種越界/非整數/錯種類/錯週/多欄位拒收、換週寬限、暫停、每分鐘上限（含鎖內二次檢查）、併發遞增不遺失（有鎖 vs 無鎖對照組）、出錯時鎖一定釋放、doGet 格式與快取、上週銅銀金判定、試算表把週次轉成日期時仍找得到同一列、拿不到試算表時的錯誤碼、程式裡沒有 log、manifest 設定。
- `node tools/plaza/smoke.mjs`：線上實打（授權後才能跑）。

## 已知風險 / 待確認

1. **網頁應用程式裡拿不拿得到「目前試算表」**：Google 官方文件寫綁定腳本在網頁應用程式情境下 `getActiveSpreadsheet()` 不可用，但社群普遍回報可用。若授權後 smoke 測試回 `{"ok":false,"why":"no_sheet"}`：把 `appsscript.json` 的 scope 改成 `https://www.googleapis.com/auth/spreadsheets`（程式已內建改用試算表 ID 開啟的備援），`clasp push`＋`clasp deploy -i …`，阿葉再授權一次（同意畫面會變成「所有試算表」，範圍比較大）。
2. **寫入速度**：每次送出要排隊拿鎖，一秒大約只能處理幾筆。前端要「一局結束合併送一次」、`busy` 時留著下次送。
3. **防灌只擋得到「單次加很大」與「全站爆量」**；有人寫程式慢慢灌擋不住，後果只是目標提早達成（規格已接受）。
4. **CORS**：預期 GET 與 text/plain POST 都能從 GitHub Pages 讀到回應（Apps Script 轉址到 googleusercontent 會帶 `Access-Control-Allow-Origin: *`）；要在前端開工時用瀏覽器實測一次。
5. 2026-10-11 測試時在阿葉的雲端硬碟留下一個不需要的小專案「plaza-probe-暫時測試可刪」（已取消部署、網址已失效；clasp 沒有刪檔權限）。可以直接在雲端硬碟刪掉。
