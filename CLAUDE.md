\# 體感派對遊戲 — 專案指引



> 此檔案供 Claude Code 自動載入，作為專案的持續性背景知識。



\## 專案簡介



開發一款類似「超雞派對（Party Fowl）」的體感互動派對遊戲。透過手機／平板的前置鏡頭，使用 MediaPipe 即時偵測玩家身體姿態，讓玩家用身體動作操控遊戲。



\## 技術棧



\- 前端：純 HTML5 + Canvas + ES Modules（無打包工具）

\- 姿態偵測：@mediapipe/tasks-vision 的 PoseLandmarker（透過 jsDelivr CDN 載入）

\- 音效：Web Audio API

\- 部署：Netlify 或 Vercel（靜態站台）



\## 開發原則



1\. 先跑起來再美化 — Phase 1 完成前不要花時間在 UI 美化上

2\. 手機優先 — 所有功能先在手機端確認可行

3\. 效能敏感 — 鏡頭解析度 640x480、requestAnimationFrame 驅動

4\. 模組化 — 每個遊戲是獨立模組，共用遊戲引擎介面

5\. 中文註解 — 所有程式碼註解使用繁體中文



\## 開發規格



詳細規格書請參考 SPEC.md

