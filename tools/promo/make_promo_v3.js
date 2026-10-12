// 注音小島宣傳片 v3（10-12）：v2 片尾預告的「寵物換裝／更多泡泡關卡／新的小島」全部上線了，再加上彩虹配送站、注音戰鬥陀螺、
//   詞句小偵探、同樂廣場、新的音樂音效 → 這一版逐段秀出來。v2 腳本（make_promo.js）保留不動。
// 結構：開場三句斜色條 → 標題揭幕 → 01 三座小島（主島→彩虹橋→彩虹島→歸仁區→拉遠看三座島）→ 02 彩虹配送站 → 03 寵物換裝
//       → 04 注音戰鬥陀螺（鍵盤拼「宇宙強爸爸」→變身→決勝回合慢動作）→ 05 詞句小偵探 → 06 泡泡新區（螃蟹、鯨魚）＋同樂廣場
//       → 「上次說的即將推出」三張卡翻成彩色＋「全部上線！」蓋章 → 片尾卡
// 用法：node tools/promo/make_promo_v3.js [輸出.mp4] [--portrait] [--keep]
//       測試：--only 段名,段名（open logo isles deliver dress tops detective bubble plaza live end）只錄那幾段；--noenc 不合成影片（只留影格）
//             --preview 資料夾＝不跑遊戲，只拍疊字特效截圖
//       偶發「畫面卡死」會直接失敗 → 重跑
// 做法跟 v2 一樣：headless Chromium＋CDP 虛擬時間＋逐格下令畫面（beginFrame）30fps；疊字用頁面 DOM（#promo）；
//   v3 新增：遊戲自己的音效照實際發生的那一格疊上（音訊引擎 window.__sfx 測試掛勾記下名稱、速度、音量；AudioContext 換成沒有＝頁面不出聲）
//   同樂廣場的進度數字是示意資料（攔截後端網址回假資料、也不送出任何東西給正式後端）
// 需要：本機伺服器 python -m http.server 8765（專案根目錄）、ffmpeg
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { launch } = require("../zy-test/lib");
const ROOT = path.resolve(__dirname, "../..");
const ARGV = process.argv.slice(2), VAL_OPTS = ["--only", "--preview"];
const flag = n => ARGV.includes(n), opt = n => { const i = ARGV.indexOf(n); return i >= 0 ? ARGV[i + 1] : null; };
const PORTRAIT = flag("--portrait"), VW = PORTRAIT ? 720 : 1280, VH = PORTRAIT ? 1280 : 720;
const OUTARG = ARGV.find((a, i) => !a.startsWith("--") && !VAL_OPTS.includes(ARGV[i - 1]));
const OUTMP4 = OUTARG ? path.resolve(OUTARG) : path.join(ROOT, "promo", PORTRAIT ? "zhuyin-island-promo-v3-vertical.mp4" : "zhuyin-island-promo-v3.mp4");
const FR = path.join(os.tmpdir(), PORTRAIT ? "zy_promo3_frames_p" : "zy_promo3_frames");
const ONLY = (opt("--only") || "").split(",").filter(Boolean), RUN = s => !ONLY.length || ONLY.includes(s);
const BASE = (process.env.ZY_URL || "http://127.0.0.1:8765/zhuyin.html");
const URL = BASE + "?debug&weather=sunny&novoice&night=0&clock=day&plaza=on";   // plaza=on：同樂廣場要連線（後端網址被 page.route 攔下來回假資料）
const FPS = 30, DT = 1000 / FPS;
const NAVY = "#1d3954", TEAL = "#12707a", YEL = "#f6c445";
const NCHAP = 6;

const CSS = `
#promo { position: fixed; inset: 0; z-index: 100000; pointer-events: none; overflow: hidden; font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; }
#promo * { box-sizing: border-box; }
/* 錄開場／標題時把遊戲介面藏起來（畫面乾淨） */
body.pclean .round-btn, body.pclean .player-tag, body.pclean #menu .pill, body.pclean .jarBtn, body.pclean #guide, body.pclean .hub-tag, body.pclean #townTag, body.pclean #rainbowTag,
body.pclean [class*="hud"], body.pclean [id*="hud"], body.pclean [class*="dock"] { visibility: hidden !important; }
body.pnoguide #guide, body.pnoguide #guide * { visibility: hidden !important; }   /* 貓頭鷹整段藏起來（宣傳片不需要它講話） */
/* 暗角 */
#promo .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(10,28,48,0.5) 100%); }
/* 開場斜色條：色條滑進來，字一個一個從大彈到定位 */
#promo .kin { position: absolute; display: flex; align-items: center; gap: 0.2vmin; white-space: nowrap; padding: 2.2vmin 6vmin 2.4vmin 7vmin; border-radius: 1.4vmin;
  font-weight: 900; font-size: 10.4vmin; letter-spacing: 0.3vmin; color: #fff; box-shadow: 0 1.3vmin 0 rgba(0,0,0,0.22), 0 2.4vmin 4vmin rgba(0,0,0,0.25);
  animation: kinBand 0.34s cubic-bezier(.15,.9,.3,1) both; transform-origin: left center; }
#promo .kin.navy { background: ${NAVY}; } #promo .kin.teal { background: ${TEAL}; }
#promo .kin.yel { background: ${YEL}; } #promo .kin.yel .c { -webkit-text-stroke: 1.3vmin ${NAVY}; paint-order: stroke fill; }
#promo .kin .c { display: inline-block; text-shadow: 0 0.5vmin 0 rgba(0,0,0,0.25); animation: kinChar 0.42s cubic-bezier(.2,1.5,.35,1) both; animation-delay: calc(var(--i) * 55ms + 140ms); }
#promo .kin .c.sm { font-size: 0.62em; align-self: center; }
#promo .kin .sp { width: 2.4vmin; }
@keyframes kinBand { 0% { translate: -110% 0; } 100% { translate: 0 0; } }
@keyframes kinChar { 0% { opacity: 0; scale: 3.2; translate: 0 -0.2em; } 45% { opacity: 1; } 100% { opacity: 1; scale: 1; translate: 0 0; } }
/* 轉場：三塊斜色塊從右掃到全蓋住，再往左掃開 */
#promo .wipe { position: absolute; inset: 0; }
#promo .wipe i { position: absolute; top: -20%; bottom: -20%; transform: skewX(-16deg); }
#promo .wipe i:nth-child(1) { left: -35%; width: 95%; background: ${NAVY}; }
#promo .wipe i:nth-child(2) { left: 45%; width: 95%; background: ${TEAL}; }
#promo .wipe i:nth-child(3) { left: 118%; width: 32%; background: ${YEL}; }
#promo .wipe.cover i { animation: wpIn 0.3s cubic-bezier(.3,0,.2,1) both; } #promo .wipe.cover i:nth-child(2) { animation-delay: 0.04s; } #promo .wipe.cover i:nth-child(3) { animation-delay: 0.08s; }
#promo .wipe.reveal i { animation: wpOut 0.36s cubic-bezier(.5,0,.3,1) both; } #promo .wipe.reveal i:nth-child(2) { animation-delay: 0.05s; } #promo .wipe.reveal i:nth-child(3) { animation-delay: 0.1s; }
@keyframes wpIn { 0% { translate: 160vw 0; } 100% { translate: 0 0; } }
@keyframes wpOut { 0% { translate: 0 0; } 100% { translate: -170vw 0; } }
/* 快門閃一下（同一段裡跳接用） */
#promo .flash { position: absolute; inset: 0; background: #fff; animation: flashOut 0.28s ease-out both; }
@keyframes flashOut { 0% { opacity: 0.85; } 100% { opacity: 0; } }
/* 大章節號：黃色 01＋白標籤＋青色小字 */
#promo .cbig { position: absolute; left: 4vmin; top: 13vmin; display: grid; grid-template-columns: auto auto; align-items: center; column-gap: 2vmin; row-gap: 0.6vmin; animation: cbIn 0.4s cubic-bezier(.2,1.4,.4,1) both; }
#promo .cbig .n { grid-row: span 2; font-size: 21vmin; font-weight: 900; line-height: 0.9; color: ${YEL}; -webkit-text-stroke: 1.6vmin ${NAVY}; paint-order: stroke fill; letter-spacing: -0.6vmin; }
#promo .cbig .t { justify-self: start; background: #fff; color: ${NAVY}; font-size: 7.8vmin; font-weight: 900; border-radius: 1.6vmin; padding: 0.8vmin 2.6vmin; box-shadow: 0 0.9vmin 0 rgba(0,0,0,0.18); white-space: nowrap; }
#promo .cbig .s { justify-self: start; background: ${TEAL}; color: #fff; font-size: 4.4vmin; font-weight: 900; border-radius: 1.2vmin; padding: 0.6vmin 2vmin; white-space: nowrap; animation: cbIn 0.35s 0.18s cubic-bezier(.2,1.4,.4,1) both; }
#promo .cbig.out { animation: cbOut 0.3s ease-in both; }
@keyframes cbIn { 0% { opacity: 0; translate: -8vmin 0; scale: 0.8; } 100% { opacity: 1; translate: 0 0; scale: 1; } }
@keyframes cbOut { 0% { opacity: 1; } 100% { opacity: 0; translate: -6vmin 0; } }
/* 上方章節進度膠囊 */
#promo .chap { position: absolute; left: 50%; top: 2.6vmin; translate: -50% 0; display: flex; align-items: center; gap: 2vmin; background: rgba(255,255,255,0.96); border-radius: 6vmin;
  padding: 1.2vmin 2.8vmin 1.2vmin 1.4vmin; box-shadow: 0 0.8vmin 2.4vmin rgba(20,50,80,0.25); animation: pcIn 0.45s ease-out both; }
#promo .chap .n { background: ${NAVY}; color: #fff; font-weight: 900; font-size: 3.6vmin; border-radius: 4vmin; padding: 0.5vmin 1.8vmin; }
#promo .chap .t { color: ${NAVY}; font-weight: 900; font-size: 4.2vmin; white-space: nowrap; }
#promo .chap .bar { display: flex; gap: 0.8vmin; margin-left: 1vmin; }
#promo .chap .bar span { width: 3.4vmin; height: 1.1vmin; border-radius: 1vmin; background: #d6e2ea; }
#promo .chap .bar span.on { background: ${YEL}; }
@keyframes pcIn { 0% { opacity: 0; translate: -50% -4vmin; } 100% { opacity: 1; translate: -50% 0; } }
/* 說明小膠囊（預設左下；.right＝右下；.top＝章節膠囊下面） */
#promo .pill { position: absolute; left: 3vmin; bottom: 4vmin; display: flex; align-items: center; gap: 1.6vmin; background: #fff; border-radius: 6vmin; padding: 1.5vmin 3.4vmin 1.5vmin 2vmin;
  box-shadow: 0 0.8vmin 0 #b9c6d6, 0 1.6vmin 3vmin rgba(20,50,80,0.3); animation: ppIn 0.4s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .pill .e { font-size: 6vmin; line-height: 1; }
#promo .pill .t { font-size: 4.4vmin; font-weight: 900; color: ${NAVY}; }
#promo .pill .t small { font-size: 3.4vmin; color: #556; font-weight: 700; margin-left: 1.2vmin; }
#promo .pill.right { left: auto; right: 3vmin; }
#promo .pill.top { left: 50%; bottom: auto; top: 13vmin; translate: -50% 0; animation-name: ppInT; }
@keyframes ppIn { 0% { opacity: 0; translate: -6vmin 0; } 100% { opacity: 1; translate: 0 0; } }
@keyframes ppInT { 0% { opacity: 0; translate: -50% -3vmin; } 100% { opacity: 1; translate: -50% 0; } }
/* 斜放黃色大標語（場景中間用） */
#promo .banner { position: absolute; left: 50%; top: 40%; translate: -50% -50%; rotate: -4deg; background: ${YEL}; border-radius: 2.4vmin; padding: 2.4vmin 6vmin 2.6vmin;
  box-shadow: 0 1.4vmin 0 #c99a1d, 0 3vmin 6vmin rgba(20,50,80,0.35); text-align: center; animation: pbIn 0.5s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .banner b { display: block; font-size: 8.4vmin; font-weight: 900; color: #fff; line-height: 1.1; letter-spacing: 0.5vmin; -webkit-text-stroke: 1.1vmin ${NAVY}; paint-order: stroke fill; }
#promo .banner i { display: block; font-style: normal; margin-top: 1vmin; font-size: 4.4vmin; font-weight: 900; color: ${NAVY}; }
#promo .banner.low { top: 72%; } #promo .banner.out { animation: pbOut 0.32s ease-in both; }
@keyframes pbIn { 0% { opacity: 0; scale: 0.5; } 100% { opacity: 1; scale: 1; } }
@keyframes pbOut { 0% { opacity: 1; scale: 1; } 100% { opacity: 0; scale: 0.85; } }
/* ▶▶ 快轉徽章 */
#promo .ff { position: absolute; right: 3vmin; top: 11vmin; display: flex; align-items: center; gap: 1.4vmin; background: ${YEL}; color: ${NAVY}; font-weight: 900; font-size: 5vmin;
  border-radius: 3vmin; padding: 1vmin 2.6vmin; box-shadow: 0 1vmin 0 #c99a1d; animation: pbIn 0.3s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .ff small { font-size: 3.4vmin; }
/* 標題揭幕：放射光＋青色底板＋逐字彈出＋道具彈進來＋NEW 膠囊 */
#promo .stage { position: absolute; inset: 0; overflow: hidden; animation: peIn 0.25s ease-out both; }
#promo .sun { position: absolute; left: 50%; top: 50%; width: 260vmax; height: 260vmax; translate: -50% -50%;
  background: repeating-conic-gradient(from 0deg, #2b9fe0 0deg 9deg, #46b5ee 9deg 18deg); animation: sunSpin 14s linear infinite; }
#promo .sunGlow { position: absolute; inset: 0; background: radial-gradient(circle at 50% 46%, rgba(255,255,255,0.55) 0, rgba(255,255,255,0) 42%), radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(8,40,80,0.35) 100%); }
@keyframes sunSpin { to { rotate: 360deg; } }
#promo .plate { position: absolute; left: 50%; top: 46%; width: min(78vw, 112vmin); height: 34vmin; translate: -50% -50%; background: #3fc7c2; border-radius: 9vmin 6vmin 10vmin 7vmin / 8vmin 9vmin 7vmin 10vmin;
  box-shadow: 0 2vmin 0 #23938f, 0 4vmin 8vmin rgba(10,40,70,0.35); animation: squash 0.55s cubic-bezier(.2,1.2,.4,1) both; }
@keyframes squash { 0% { scale: 0 0; } 55% { scale: 1.14 0.86; } 75% { scale: 0.95 1.06; } 100% { scale: 1 1; } }
#promo .ttl { position: absolute; left: 50%; top: 44%; translate: -50% -50%; display: flex; white-space: nowrap; font-size: 19vmin; font-weight: 900; line-height: 1; }
#promo .ttl .c { display: inline-block; -webkit-text-stroke: 2vmin ${NAVY}; paint-order: stroke fill; text-shadow: 0 1.4vmin 0 ${NAVY};
  animation: ttlPop 0.5s cubic-bezier(.2,1.7,.35,1) both; animation-delay: calc(var(--i) * 90ms + 300ms); }
#promo .ttl .c:nth-child(1), #promo .ttl .c:nth-child(2) { color: ${YEL}; } #promo .ttl .c:nth-child(3), #promo .ttl .c:nth-child(4) { color: #fff; }
@keyframes ttlPop { 0% { opacity: 0; scale: 0.2; rotate: -20deg; } 60% { opacity: 1; } 100% { opacity: 1; scale: 1; rotate: 0deg; } }
#promo .lsub { position: absolute; left: 50%; top: 63%; translate: -50% 0; white-space: nowrap; background: ${NAVY}; color: #fff; font-weight: 900; font-size: 4.6vmin; border-radius: 3vmin; padding: 1vmin 3.4vmin;
  animation: subIn 0.4s 0.85s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes subIn { 0% { opacity: 0; translate: -50% 3vmin; } 100% { opacity: 1; translate: -50% 0; } }
#promo .newp { position: absolute; left: 50%; top: 76%; translate: -50% 0; display: flex; gap: 1.4vmin; align-items: center; white-space: nowrap; background: #fff; color: ${NAVY}; font-weight: 900; font-size: 3.8vmin;
  border-radius: 3vmin; padding: 0.8vmin 2.6vmin 0.8vmin 0.8vmin; box-shadow: 0 0.8vmin 0 rgba(0,0,0,0.15); animation: subIn 0.4s 1.7s cubic-bezier(.2,1.5,.4,1) both; }
#promo .newp b { background: #ff5d5d; color: #fff; border-radius: 2vmin; padding: 0.4vmin 1.6vmin; font-size: 3.2vmin; }
#promo .prop { position: absolute; width: 15vmin; height: auto; filter: drop-shadow(0 1.2vmin 1.4vmin rgba(10,40,70,0.35)); animation: propIn 0.55s cubic-bezier(.2,1.6,.4,1) both, bob 2.2s ease-in-out infinite alternate; }
@keyframes propIn { 0% { opacity: 0; scale: 0; } 100% { opacity: 1; scale: 1; } }
@keyframes bob { from { translate: 0 0; } to { translate: 0 -1.4vmin; } }
#promo .blk { position: absolute; width: 10vmin; height: 10vmin; display: grid; place-items: center; border-radius: 2vmin; font-size: 6.4vmin; font-weight: 900; color: #fff; box-shadow: 0 1vmin 0 rgba(0,0,0,0.2);
  animation: propIn 0.5s cubic-bezier(.2,1.6,.4,1) both; }
#promo .spk { position: absolute; color: #fff7c2; font-size: 6vmin; text-shadow: 0 0 2vmin #fff; animation: twk 0.9s ease-in-out infinite alternate; }
@keyframes twk { from { opacity: 0.2; scale: 0.6; rotate: 0deg; } to { opacity: 1; scale: 1.15; rotate: 40deg; } }
/* 「上次說的即將推出」→ 三張剪影卡翻成彩色 → 全部上線！ */
#promo .soonBg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 30%, #2f5d8a 0, #13263f 70%); animation: peIn 0.3s ease-out both; }
#promo .soonBg::after { content: ""; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(255,255,255,0.8) 0 0.25vmin, transparent 0.35vmin); background-size: 9vmin 9vmin; opacity: 0.35; }
#promo .soonT { position: absolute; left: 50%; top: 9%; translate: -50% 0; white-space: nowrap; font-size: 9vmin; font-weight: 900; color: #fff; -webkit-text-stroke: 1.2vmin ${NAVY}; paint-order: stroke fill;
  text-shadow: 0 1vmin 0 #0b1a2c; animation: pbIn 0.45s cubic-bezier(.2,1.5,.4,1) both; }
#promo .soonT em { font-style: normal; color: ${YEL}; }
#promo .cards { position: absolute; left: 50%; top: 50%; translate: -50% -50%; display: flex; gap: 4vmin; perspective: 120vmin; }
#promo .scard { position: relative; width: 34vmin; background: #fff; border-radius: 3vmin; padding: 2.6vmin 2vmin 2.2vmin; text-align: center; box-shadow: 0 1.4vmin 0 #b9c6d6, 0 3vmin 5vmin rgba(0,0,0,0.35);
  animation: flipIn 0.55s cubic-bezier(.2,1.3,.4,1) both; animation-delay: calc(var(--i) * 220ms + 250ms); }
#promo .scard .pic { position: relative; height: 23vmin; display: grid; place-items: center; background: #e8f1f8; border-radius: 2vmin; overflow: hidden; transition: background 0.4s; transition-delay: calc(var(--i) * 260ms); }
#promo .scard .pic img, #promo .scard .pic .em { filter: brightness(0) saturate(0); opacity: 0.82; transition: filter 0.45s, opacity 0.45s, scale 0.45s cubic-bezier(.2,1.6,.4,1); transition-delay: calc(var(--i) * 260ms); }
#promo .scard .pic img { height: 16vmin; } #promo .scard .pic .em { font-size: 13vmin; line-height: 1; }
#promo .scard .pic .q, #promo .scard .pic .ok { position: absolute; right: 1.2vmin; top: 0.6vmin; font-size: 6vmin; font-weight: 900; -webkit-text-stroke: 0.8vmin ${NAVY}; paint-order: stroke fill; transition: opacity 0.2s, scale 0.35s cubic-bezier(.2,1.8,.4,1); transition-delay: calc(var(--i) * 260ms); }
#promo .scard .pic .q { color: ${YEL}; } #promo .scard .pic .ok { color: #5fd16a; opacity: 0; scale: 2.4; }
#promo .scard .lb { position: relative; margin-top: 1.6vmin; height: 5.6vmin; font-size: 4.4vmin; font-weight: 900; color: ${NAVY}; white-space: nowrap; }
#promo .scard .lb span { position: absolute; left: 0; right: 0; top: 0; transition: opacity 0.25s; transition-delay: calc(var(--i) * 260ms); }
#promo .scard .lb .b { opacity: 0; color: #12707a; }
#promo .cards.on .scard .pic { background: #fff4c9; }
#promo .cards.on .scard .pic img, #promo .cards.on .scard .pic .em { filter: none; opacity: 1; scale: 1.08; }
#promo .cards.on .scard .pic .q { opacity: 0; } #promo .cards.on .scard .pic .ok { opacity: 1; scale: 1; }
#promo .cards.on .scard .lb .a { opacity: 0; } #promo .cards.on .scard .lb .b { opacity: 1; }
@keyframes flipIn { 0% { opacity: 0; transform: rotateY(90deg) translateY(4vmin); } 100% { opacity: 1; transform: rotateY(0) translateY(0); } }
#promo .stamp { position: absolute; left: 50%; top: 82%; translate: -50% -50%; rotate: -6deg; white-space: nowrap; background: #ff5d5d; color: #fff; font-size: 8vmin; font-weight: 900; border-radius: 2vmin; padding: 1vmin 4.4vmin;
  border: 0.8vmin solid #fff; box-shadow: 0 1.2vmin 0 #b83a3a; animation: stampIn 0.32s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes stampIn { 0% { opacity: 0; scale: 3; } 100% { opacity: 1; scale: 1; } }
#promo .more { position: absolute; left: 0; right: 0; top: 92%; translate: 0 -50%; text-align: center; white-space: nowrap; font-size: 4.2vmin; font-weight: 900; color: #fff; text-shadow: 0 0.5vmin 0 #0b1a2c; animation: upIn 0.4s both; }
/* 片尾卡 */
#promo .eplate { top: 36%; }
#promo .ettl { top: 34%; }
#promo .etag { position: absolute; left: 0; right: 0; top: 55%; text-align: center; white-space: nowrap; font-size: 5.2vmin; font-weight: 900; color: #fff; text-shadow: 0 0.6vmin 0 ${NAVY}; animation: upIn 0.4s 0.5s both; }
#promo .erow { position: absolute; left: 4vw; right: 4vw; top: 66%; display: flex; gap: 1.6vmin; justify-content: center; flex-wrap: wrap; animation: upIn 0.4s 0.8s both; }
#promo .erow span { background: #fff; color: ${NAVY}; font-weight: 900; font-size: 3.6vmin; border-radius: 4vmin; padding: 1vmin 2.4vmin; box-shadow: 0 0.6vmin 0 rgba(0,0,0,0.15); white-space: nowrap; }
#promo .esm { position: absolute; left: 0; right: 0; top: 82%; text-align: center; animation: upIn 0.4s 1.1s both; }
#promo .esm span { display: inline-block; background: ${NAVY}; color: #fff; font-size: 3.6vmin; font-weight: 900; border-radius: 3vmin; padding: 1vmin 3vmin; white-space: nowrap; }
@keyframes upIn { 0% { opacity: 0; translate: 0 3vmin; } 100% { opacity: 1; translate: 0 0; } }
@keyframes peIn { 0% { opacity: 0; } 100% { opacity: 1; } }
@media (orientation: portrait) {
  #promo .kin { font-size: 7.6vmin; padding: 2vmin 4vmin 2.2vmin 5vmin; }
  #promo .cbig { top: 46vmin; } #promo .cbig .n { font-size: 15vmin; } #promo .cbig .t { font-size: 6.4vmin; }
  #promo .chap { top: 46vmin; } #promo .pill { bottom: 30vmin; } #promo .pill.top { top: 58vmin; } #promo .ff { top: 58vmin; } #promo .pill.lonly { display: none; } #promo .pill.pmid { left: 50%; bottom: auto; top: 64%; translate: -50% 0; animation-name: ppInT; }
  #promo .banner { top: 36%; } #promo .banner b { font-size: 7vmin; }
  #promo .plate { width: 90vw; height: 30vmin; } #promo .ttl { font-size: 17vmin; }
  #promo .soonT { top: 13%; font-size: 7.4vmin; }
  #promo .cards { flex-direction: column; gap: 2.6vmin; top: 50%; } #promo .scard { width: 66vmin; display: grid; grid-template-columns: 22vmin 1fr; align-items: center; gap: 3vmin; padding: 2vmin; }
  #promo .scard .pic { height: 18vmin; } #promo .scard .lb { margin: 0; text-align: left; font-size: 5vmin; height: 6.4vmin; }
  #promo .stamp { top: 81%; } #promo .more { top: 88%; }
  #promo .eplate { top: 34%; } #promo .ettl { top: 32%; } #promo .etag { top: 47%; font-size: 4.6vmin; } #promo .erow { top: 54%; } #promo .esm { top: 70%; }
}
`;
// 頁面裡的疊字小工具
const OVERLAY = (NCHAP) => {
  const root = document.createElement("div"); root.id = "promo"; root.className = "noann"; document.body.appendChild(root);
  const mk = (cls, html, parent = root) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
  const chars = (s, cls = "c") => [...s].map((ch, i) => ch === " " ? `<span class="sp"></span>` : `<span class="${cls}" style="--i:${i}">${ch}</span>`).join("");
  const img = n => `IMAGE/zhuyin/${n}.webp`;
  window.__promo = {
    clear(sel) { root.querySelectorAll(sel || ":scope > *").forEach(x => x.remove()); },
    clean(on) { document.body.classList.toggle("pclean", on); },
    vig(on) { this.clear(".vig"); if (on) mk("vig", ""); },
    // 開場斜色條：pos＝{ left, top, rot }（百分比／度），small＝要變小的字的索引
    kin(text, color, pos, small = []) {
      this.clear(".kin");
      const d = mk("kin " + color, [...text].map((ch, i) => ch === " " ? `<span class="sp"></span>` : `<span class="c${small.includes(i) ? " sm" : ""}" style="--i:${i}">${ch}</span>`).join(""));
      d.style.left = pos.left + "%"; d.style.top = pos.top + "%"; d.style.rotate = pos.rot + "deg";
    },
    wipe() { this.clear(".wipe"); mk("wipe cover", "<i></i><i></i><i></i>"); },
    wipeOut() { const w = root.querySelector(".wipe"); if (w) { w.className = "wipe reveal"; } },
    flash() { this.clear(".flash"); mk("flash", ""); },
    cbig(n, t, s) { this.clear(".cbig"); mk("cbig", `<span class="n">0${n}</span><span class="t">${t}</span><span class="s">${s}</span>`); },
    cbigOut() { root.querySelectorAll(".cbig").forEach(b => b.classList.add("out")); },
    chap(n, t) { this.clear(".chap"); mk("chap", `<span class="n">0${n}</span><span class="t">${t}</span><span class="bar">${Array.from({ length: NCHAP }, (_, k) => `<span class="${k < n ? "on" : ""}"></span>`).join("")}</span>`); },
    pill(e, t, sub, pos) { this.clear(".pill"); mk("pill" + (pos ? " " + pos : ""), `<span class="e">${e}</span><span class="t">${t}${sub ? `<small>${sub}</small>` : ""}</span>`); },
    banner(t, sub, cls) { this.clear(".banner"); mk("banner" + (cls ? " " + cls : ""), `<b>${t}</b>${sub ? `<i>${sub}</i>` : ""}`); },
    bannerOut() { root.querySelectorAll(".banner").forEach(b => b.classList.add("out")); },
    ff(on, txt) { this.clear(".ff"); if (on) mk("ff", `▶▶ <small>${txt || "快轉"}</small>`); },
    // 標題揭幕
    logo(newText) {
      this.clear(".stage"); const s = mk("stage", `<div class="sun"></div><div class="sunGlow"></div><div class="plate"></div><div class="ttl">${chars("注音小島")}</div>
        <div class="lsub">聽一聽・點一點・玩著玩著就會注音</div>${newText ? `<div class="newp"><b>NEW</b>${newText}</div>` : ""}`);
      const P = innerWidth < innerHeight;
      const props = P ? [["guide_owl", 6, 20, 0.55], ["wear_crown", 72, 16, 0.7], ["pets/crab", 6, 80, 0.85], ["pets/bunny", 76, 82, 1.0], ["goods_watermelon", 84, 26, 1.1]]
        : [["guide_owl", 6, 8, 0.55], ["wear_crown", 82, 10, 0.7], ["pets/crab", 9, 56, 0.85], ["pets/bunny", 84, 52, 1.0], ["goods_watermelon", 9, 80, 1.1], ["pets/whale", 82, 78, 1.2]];
      for (const [n, x, y, dl] of props) { const im = document.createElement("img"); im.className = "prop"; im.src = img(n); im.style.left = x + "%"; im.style.top = y + "%"; im.style.animationDelay = `${dl}s, ${dl + 0.55}s`; s.appendChild(im); }
      const blocks = P ? [["ㄅ", "#ff7a59", 30, 15, 0.95], ["ㄆ", "#5bb8f5", 46, 12, 1.05], ["ㄇ", "#7bd36b", 62, 15, 1.15]] : [["ㄅ", "#ff7a59", 30, 11, 0.95], ["ㄆ", "#5bb8f5", 44, 7, 1.05], ["ㄇ", "#7bd36b", 58, 11, 1.15]];
      for (const [t, c, x, y, dl] of blocks) { const b = mk("blk", t, s); b.style.background = c; b.style.left = x + "%"; b.style.top = y + "%"; b.style.animationDelay = dl + "s"; }
      for (const [x, y, dl] of [[18, 30, 0.2], [76, 34, 0.5], [40, 78, 0.8], [88, 74, 0.35], [52, 6, 0.65]]) { const k = mk("spk", "✦", s); k.style.left = x + "%"; k.style.top = y + "%"; k.style.animationDelay = dl + "s"; }
    },
    // 上次說的「即將推出」：剪影卡（items＝[[圖, 之前的字, 上線後的字]]）→ live() 翻成彩色＋打勾＋換字
    soon(items) {
      this.clear(); mk("soonBg", ""); mk("soonT", "上次說的<em>「即將推出」</em>");
      mk("cards", items.map(([pic, a, b], i) => `<div class="scard" style="--i:${i}"><div class="pic">${pic.startsWith("em:") ? `<span class="em">${pic.slice(3)}</span>` : `<img src="${img(pic)}">`}<span class="q">?</span><span class="ok">✔</span></div><div class="lb"><span class="a">${a}</span><span class="b">${b}</span></div></div>`).join(""));
    },
    live() { const c = root.querySelector(".cards"); if (c) c.classList.add("on"); },
    stamp(t) { mk("stamp", t); },
    more(t) { mk("more", t); },
    end() {
      this.clear(); mk("stage", `<div class="sun"></div><div class="sunGlow"></div><div class="plate eplate"></div><div class="ttl ettl">${chars("注音小島")}</div>
        <div class="etag">聽一聽、點一點，玩著玩著就會注音</div>
        <div class="erow"><span>🎮 12 個小遊戲</span><span>🏝️ 三座小島</span><span>🐣 28 隻動物朋友</span><span>👗 寵物換裝</span></div>
        <div class="esm"><span>平板、手機瀏覽器打開就能玩・不用下載</span></div>`);
    },
  };
};
const LOGO_NEW = "彩虹島開幕・戰鬥陀螺・小偵探";
const SOON = [["pets/bunny", "寵物換裝", "10 件衣服配件"], ["cust_penguin", "更多泡泡關卡", "泡泡 30 關"], ["em:🏝️", "新的小島", "彩虹島開幕"]];

// 預覽模式（--preview 輸出資料夾）：不跑遊戲，只把各種疊字特效單獨拍成截圖，檢查樣子用
async function preview(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launch(); const pg = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
  await pg.goto(BASE.replace(/zhuyin\.html.*$/, "IMAGE/"));
  await pg.evaluate(() => { document.body.innerHTML = ""; const b = document.createElement("base"); b.href = "/"; document.head.appendChild(b); document.body.style.cssText = "margin:0;background:linear-gradient(#5fb0dc,#3f97c9)"; });
  await pg.addStyleTag({ content: CSS }); await pg.evaluate(OVERLAY, NCHAP);
  const tag = PORTRAIT ? "P" : "L";
  const snap = async (name, fn, wait, arg) => { await pg.evaluate(() => __promo.clear()); await pg.evaluate(fn, arg); await pg.waitForTimeout(wait); await pg.screenshot({ path: path.join(dir, `ov-${tag}-${name}.jpg`), quality: 85, type: "jpeg" }); };
  await snap("1-kin", () => { __promo.vig(true); __promo.kin("上次說的「即將推出」", "navy", { left: -3, top: 16, rot: -4 }, [4, 9]); }, 1300);
  await snap("2-logo", t => __promo.logo(t), 2600, LOGO_NEW);
  await snap("3-cbig", () => { __promo.cbig(4, "注音戰鬥陀螺", "拼 5 個字變陀螺"); __promo.chap(4, "注音戰鬥陀螺"); __promo.pill("🌀", "注音戰鬥陀螺", "字不一樣，陀螺就不一樣"); __promo.ff(true, "快轉"); }, 900);
  await snap("4-pilltop", () => { __promo.chap(6, "泡泡新區・同樂廣場"); __promo.pill("🎪", "同樂廣場", "全島一起合作", "top"); }, 900);
  await snap("5-soon", s => __promo.soon(s), 1600, SOON);
  await snap("6-live", s => { __promo.soon(s); setTimeout(() => { __promo.live(); __promo.stamp("全部上線！"); __promo.more("還有更多驚喜，等你來發現！"); }, 1200); }, 2900, SOON);
  await snap("7-end", () => __promo.end(), 2200);
  await browser.close(); console.log("預覽：" + dir);
}

module.exports = { CSS, OVERLAY };   // 測試／除錯用（被 require 時不錄）
if (require.main === module) (async () => {
  if (opt("--preview")) return preview(path.resolve(opt("--preview")));
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true }); fs.mkdirSync(path.dirname(OUTMP4), { recursive: true });
  // 同樂廣場假後端（示意資料）：本週＝救援週 168 隻（銀牌已達成，小島放煙火），不送任何東西出去
  const PZ = await import(pathToFileURL(path.join(ROOT, "js/zhuyin-plaza.js")).href);
  const W = PZ.weekKeyOf(Date.now()), GOALS = [50, 150, 300];
  const PZDATA = { ok: true, w: W, theme: { key: "rescue", title: "x", unit: "x", desc: "x", goals: GOALS }, total: 168, plays: 345, cheers: [45, 18, 12, 9],
    prev: { w: PZ.addWeeks(W, -1), theme: { key: "star", title: "x", unit: "x", desc: "x", goals: [100, 300, 600] }, total: 320, reached: 2 }, paused: false, reached: PZ.levelOf(168, GOALS) };

  // 逐格下令畫面（--enable-begin-frame-control）：瀏覽器不自己出畫面，由這支程式每一格下令畫（HeadlessExperimental.beginFrame 直接回傳截圖）
  const browser = await launch(["--enable-begin-frame-control", "--run-all-compositor-stages-before-draw", "--disable-threaded-animation", "--disable-threaded-scrolling", "--disable-checker-imaging", "--disable-new-content-rendering-timeout"]);
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: +process.env.PROMO_SCALE || 1 });
  const CORS = { "access-control-allow-origin": "*" };
  await ctx.route(/script\.google(usercontent)?\.com/, r => r.request().method() === "GET"
    ? r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ ...PZDATA, now: Date.now() }) })
    : r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: '{"ok":true}' }));
  await ctx.addInitScript(() => {
    const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, speak(u) { setTimeout(() => u.onend && u.onend(), 300); } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // 頁面不出聲：沒有 AudioContext＝音訊引擎安靜略過（影片的聲音由 ffmpeg 另外疊）；window.__sfx＝音訊引擎的測試掛勾，記下每個音效
    window.AudioContext = undefined; window.webkitAudioContext = undefined; window.__sfx = [];
    window.Audio = class { constructor(src) { Object.assign(this, { src: src || "", paused: true, currentTime: 0, volume: 1, muted: false, loop: false, playbackRate: 1, preload: "auto" }); } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() {} addEventListener() {} removeEventListener() {} };
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => cb(performance.now()));   // 虛擬時間：rAF 的時間戳跟 performance.now 一致
  });
  const p = await ctx.newPage(); const errs = [], warns = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); if (m.type() === "warning") warns.push(m.text().slice(0, 200)); });
  const within = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r("TIMEOUT"), ms))]);
  const cdp = await ctx.newCDPSession(p);
  const bf = shot => within(cdp.send("HeadlessExperimental.beginFrame", shot ? { interval: DT, screenshot: { format: "jpeg", quality: 92 } } : { interval: DT }), 15000);
  let pumping = true; const pump = (async () => { while (pumping) { await bf(false).catch(() => {}); await new Promise(r => setTimeout(r, 40)); } })();   // 準備階段：一直打幀（不然 rAF 不會跑、3D 不會畫）
  await p.goto(URL); await p.waitForTimeout(400);
  await p.evaluate(W => {
    localStorage.clear();
    localStorage.setItem("zy_plaza_seen", JSON.stringify({ w: W, key: "rescue", intro: 1, lv: 2, total: 0, cw: W, clv: 2 }));   // 同樂廣場：本週看過了（🎪 不掛「新」、貓頭鷹不宣布），打開時數字從 0 滾上去
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
      const s = {}; WORDS.slice(0, 64).forEach(w => s[w.h] = 1); S("zy1_stickers", s);
      localStorage.setItem("zy1_stars", "47"); localStorage.setItem("zy1_eggs", "4");
      const all = ["fish", "order", "build", "hunt", "match", "tone", "whack", "frog", "bubble", "deliver", "detective", "tops"];
      S("zy1_intro", Object.fromEntries(all.map(m => [m, 1])));
      S("zy1_seen", Object.fromEntries([...all, "dress", "gacha"].map(m => [m, 1])));   // 都去過＝浮標收成圓形圖示（10-12 浮標精簡後的樣子）
      const bs = {}; for (let i = 0; i < 29; i++) bs[i] = i % 4 === 3 ? 2 : 3; S("zy1_bubble", { lv: 29, stars: bs });   // 30 關都開（挑關要能點到第 3 區任何一關）
      S("zy1_deliver", { lv: 7, stars: { 0: 3, 1: 3, 2: 3, 3: 2, 4: 3, 5: 3, 6: 2 } });
      S("zy1_tops", { tickets: 3, starsBank: 6, freeUsed: 1, best: null, home: [], history: [] });
      const pets = {}; for (const id of ["bear", "bunny", "cat", "fox", "panda", "penguin", "frog", "lion", "dog", "koala", "crab", "whale"]) pets[id] = { stage: 2, t: 30 };
      const closet = ["hat", "bow", "crown", "flower_crown", "party_hat", "flower", "cape", "wings", "backpack", "cape_rainbow"];
      const wear = { bear: { head: "party_hat" }, cat: { side: "bow" }, fox: { back: "cape" }, panda: { head: "hat" }, penguin: { head: "crown" }, dog: { back: "backpack" }, koala: { head: "flower_crown" } };
      S("zy1_rewards", { pets, partner: "bunny", coins: 3, gold: 0, jarCoins: 4, treats: 60, decor: ["flower_arch", "statue_owl"], stamps: 3, stampDay: "", pity: { rare: 4, ssr: 0 }, catBonus: [], pulls: 4, closet, wear });
      localStorage.setItem("zy1_hello", "1"); localStorage.setItem("zy_hint_wait", "0"); localStorage.setItem("zy1_tone1tip", "1");
    });
  }, W);
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 60000, polling: 200 });
  await p.evaluate(() => document.getElementById("startBtn").click());
  await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weather, null, { timeout: 60000, polling: 200 });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: CSS }); await p.evaluate(OVERLAY, NCHAP);
  await p.evaluate(() => { window.__hub3d.events(false); document.body.classList.add("pnoguide"); });
  // 預先載入宣傳片用到的圖（不然揭幕那一格圖還沒到）
  await p.evaluate(() => Promise.all(["guide_owl", "wear_crown", "pets/crab", "pets/bunny", "pets/whale", "goods_watermelon", "cust_penguin"].map(n => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = `IMAGE/zhuyin/${n}.webp`; }))));
  // 遊戲模組先載好（網址照 js/zhuyin.js 寫的 ?v=，才會是同一份模組）：虛擬時間開始後才第一次 import 大檔，會讀到半截（SyntaxError: Unexpected end of input）
  const LAZY = [...new Set((fs.readFileSync(path.join(ROOT, "js/zhuyin.js"), "utf8").match(/"\.\/zhuyin-(?:bubble|deliver|detective|dress|tops)\.js\?v=\d+"/g) || []).map(s => s.slice(3, -1)))];
  const lz = await p.evaluate(list => Promise.all(list.map(u => import("./js/" + u).then(() => u + " ok", e => u + " 失敗 " + e.message))), LAZY);
  console.log("預先載入模組：", lz.join("、"));

  pumping = false; await pump;
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const step = ms => within(new Promise(res => { cdp.once("Emulation.virtualTimeBudgetExpired", () => res("ok")); cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms }); }), 15000);
  let F = 0, last = null, GAMESFX = false;
  // 音效時間軸：事件發生的那一格記下來，最後 ffmpeg 照時間點疊上（k＝檔名或別名、vol、rate）
  const SFX = []; const sfx = (k, dt = 0, vol = 1, rate = 1) => SFX.push({ k, t: F / FPS + dt, vol, rate, src: "promo" });
  // 心跳點：左上角 2px、幾乎透明，每格換一點點顏色 → 每一格一定有東西要重畫（beginFrame 沒變化就不給截圖）；順便收走這一格遊戲發出的音效
  const beat = () => p.evaluate(f => {
    let d = document.getElementById("promoBeat"); if (!d) { d = document.createElement("div"); d.id = "promoBeat"; d.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;z-index:100001;pointer-events:none"; document.body.appendChild(d); }
    d.style.background = `rgba(${f % 2 ? 1 : 0},0,0,0.01)`;
    return Array.isArray(window.__sfx) ? window.__sfx.splice(0).filter(e => e.bus === "sfx").map(e => [e.name, e.vol, e.rate]) : [];
  }, F);
  const takeSfx = list => { if (GAMESFX) for (const [k, vol, rate] of list) SFX.push({ k, t: F / FPS, vol, rate, src: "game" }); };
  const shot = async () => {
    takeSfx(await beat());
    const r = await bf(true);
    if (r === "TIMEOUT") throw new Error(`畫面卡死在第 ${F} 格，請重跑`);
    const buf = r && r.screenshotData ? Buffer.from(r.screenshotData, "base64") : last; if (!buf) throw new Error("第一格沒有畫面");
    last = buf; fs.writeFileSync(path.join(FR, `f${String(F++).padStart(5, "0")}.jpg`), buf);
  };
  // 跳過的格（快轉時丟掉的那幾格）：一樣推時間、一樣畫（rAF 要跑），只是不存；這幾格的音效算到下一張存下來的格
  const skip = async (drop) => { const ev = await beat(); if (!drop) takeSfx(ev); const r = await bf(false); if (r === "TIMEOUT") throw new Error(`畫面卡死（跳過的格，第 ${F} 格附近），請重跑`); };
  // rec(n, each, keep)：錄 n 格；keep(i)＝false 的格不存（快轉）
  const rec = async (n, each, keep) => { for (let i = 0; i < n; i++) { if (each) await each(i); await step(DT); if (!keep || keep(i)) await shot(); else await skip(); } };
  // recUntil(cond, max, each, keep)：錄到 cond 成立（每格檢查）或 max 格；回傳錄了幾格（含跳過的）
  const recUntil = async (cond, max, each, keep) => { let i = 0; for (; i < max; i++) { if (await p.evaluate(cond).catch(() => false)) break; if (each) await each(i); await step(DT); if (!keep || keep(i)) await shot(); else await skip(); } return i; };
  const E = (fn, arg) => p.evaluate(fn, arg);
  // 不錄的準備時間：虛擬時間往前走、真實時間也等一下（讓圖片／模型下載完）；這段時間遊戲發出的音效丟掉
  const prep = async (cond, arg, max = 60) => {
    let ok = false;
    for (let i = 0; i < max; i++) { await step(250); await bf(false); await p.waitForTimeout(40); if (!cond || await p.evaluate(cond, arg).catch(() => false)) { ok = true; break; } }
    await E(() => { if (Array.isArray(window.__sfx)) window.__sfx.length = 0; });
    return ok;
  };
  const must = async (what, cond, arg, max) => {
    if (await prep(cond, arg, max)) return;
    const diag = await E(() => ({ mode: window.__zy.mode, loading: !document.getElementById("loading").classList.contains("hidden"), menu: !document.getElementById("menu").classList.contains("hidden"),
      overlays: [...document.querySelectorAll(".overlay:not(.hidden)")].map(o => o.id), deliver: window.__zy.deliver && window.__zy.deliver.state() && (({ task, ready }) => ({ task, ready }))(window.__zy.deliver.state()),
      tops: window.__zy.tops && window.__zy.tops.state() && window.__zy.tops.state().phase, dress: window.__zy.dress && window.__zy.dress.debug.state().open, guide: document.getElementById("guideText").textContent })).catch(e => "diag 失敗 " + e.message);
    console.log("診斷", JSON.stringify(diag)); if (warns.length) console.log("警告：\n" + warns.slice(-12).join("\n")); if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));
    await beat(); const r = await bf(true); if (r && r.screenshotData) fs.writeFileSync(path.join(FR, "fail.jpg"), Buffer.from(r.screenshotData, "base64"));
    throw new Error("等不到：" + what);
  };
  const hideGuide = () => E(() => { window.__hub3d.events(false); const g = document.getElementById("guide"); if (g) g.style.visibility = "hidden"; });
  // 回選單（遊戲中＝🏠＋確定；換裝＝穿好了；廣場＝回去；選關對話框收起來）
  const toMenu = async () => {
    await E(() => {
      if (window.__zy.dressFrom) { document.querySelector("#dress .dr-done")?.click(); return; }
      if (!document.getElementById("plaza").classList.contains("hidden")) document.querySelector("#plaza .pz-close")?.click();
      for (const id of ["deliverPick", "bubblePick"]) document.getElementById(id).classList.add("hidden");
      if (!document.getElementById("menu").classList.contains("hidden")) return;
      document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click();
    });
    await must("回到選單", () => !document.getElementById("menu").classList.contains("hidden") && !window.__zy.mode && !window.__zy.dressFrom, null, 80);
    await hideGuide(); await prep(null, null, 4);
  };
  // 轉場：斜色塊掃進來蓋住（錄 10 格）→ 做場景切換（不錄）→ 掃開（錄 13 格）
  const wipeIn = async () => { await E(() => __promo.wipe()); sfx("whoosh", 0, 0.7); await rec(10); };
  const wipeOut = async () => { await E(() => __promo.wipeOut()); await rec(13); await E(() => __promo.clear(".wipe")); };
  const t0 = Date.now(), lap = n => console.log(`${n}：到第 ${F} 格（${(F / FPS).toFixed(1)} 秒，花了 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  const cover = async fn => { await wipeIn(); await E(() => __promo.clear(":scope > :not(.wipe)")); await fn(); await wipeOut(); };   // 蓋住 → 換場景 → 掃開
  const cbigSeq = (i, n, t, s, chapT) => i === 0 ? E(([n, t, s]) => __promo.cbig(n, t, s), [n, t, s]).then(() => sfx("pop")) : i === 30 ? E(() => __promo.cbigOut()) : i === 38 ? E(([n, c]) => { __promo.clear(".cbig"); if (c) __promo.chap(n, c); }, [n, chapT]) : null;   // chapT＝null：遊戲畫面上方有遊戲自己的介面，不放章節膠囊

  // ===== 0 開場：三句斜色條，各配一個新地方的特寫（推鏡） =====
  if (RUN("open")) {
    await E(() => { __promo.clean(true); __promo.vig(true); });
    const KIN = PORTRAIT
      ? [["上次說的「即將推出」", "navy", { left: -3, top: 30, rot: -5 }, "deliver", [4, 9]], ["全部上線了！", "yel", { left: -2, top: 44, rot: 3 }, "dress", []], ["還多了 好多新玩法！", "teal", { left: -4, top: 58, rot: -4 }, "tops", []]]
      : [["上次說的「即將推出」", "navy", { left: -3, top: 16, rot: -4 }, "deliver", [4, 9]], ["全部上線了！", "yel", { left: -2, top: 44, rot: 3 }, "dress", []], ["還多了 好多新玩法！", "teal", { left: -3, top: 62, rot: -4 }, "tops", []]];
    for (const [txt, col, pos, focus, small] of KIN) {
      await E(f => window.__hub3d.focus(f, 1.9), focus); await prep(null, null, 2);
      await rec(38, async i => {
        await E(([f, z]) => window.__hub3d.focus(f, z), [focus, 1.9 + i * 0.006]);
        if (i === 2) { await E(([t, c, ps, sm]) => __promo.kin(t, c, ps, sm), [txt, col, pos, small]); sfx("whoosh", 0, 0.5); sfx("pop", 0.18, 0.6); }
      });
    }
    await E(() => __promo.clear(".kin")); lap("開場");
  }

  // ===== 1 標題揭幕：放射光＋底板＋逐字彈出＋道具 =====
  if (RUN("logo")) {
    await E(() => __promo.clean(true));
    await rec(100, async i => {
      if (i === 0) { await E(t => { __promo.vig(false); __promo.logo(t); }, LOGO_NEW); sfx("pop", 0, 0.9); sfx("star", 0.35, 0.8); sfx("pop", 0.95, 0.6); sfx("sticker", 1.7, 0.8); }
    });
    lap("標題");
  }
  GAMESFX = true;   // 之後遊戲自己的音效照實際時間疊上

  // ===== 01 三座小島：主島 → 推過彩虹橋 → 彩虹島 → 歸仁區 → 拉遠看三座島 =====
  if (RUN("isles")) {
    await cover(async () => {
      await E(() => { __promo.clear(".stage"); __promo.vig(false); __promo.clean(false); window.__hub3d.goPlace("main"); window.__hub3d.cam(1, 0, 0); });
      await prep(null, null, 8); await hideGuide();
    });
    // 彩虹島在主島西邊：先算出鏡頭對準配送站的平移量，再一格一格推過去（經過彩虹橋）
    const tgt = await E(() => { const h = window.__hub3d; h.focus("deliver", 0.9); const l = h.lod(); h.cam(1, 0, 0); return [l.px, l.py]; });
    const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    await rec(268, async i => {
      await cbigSeq(i, 1, "三座小島", "主島・彩虹島・歸仁區", "三座小島");
      if (i >= 32 && i < 96) { const u = ease((i - 32) / 64); await E(([z, x, y]) => window.__hub3d.cam(z, x, y), [1 - 0.12 * u, tgt[0] * u, tgt[1] * u]); }
      if (i === 46) await E(() => __promo.pill("🌈", "走過彩虹橋", "", "right"));
      if (i === 96) { await E(() => window.__hub3d.goPlace("rainbow")); }
      if (i === 102) { await E(() => __promo.pill("🏠", "彩虹島", "配送站・服裝店・偵探社", "right")); sfx("pop", 0, 0.5); }
      if (i === 148) { await E(() => window.__hub3d.goPlace("town")); sfx("whoosh", 0, 0.5); }
      if (i === 158) { await E(() => __promo.pill("🏙️", "歸仁區", "新的陀螺競技場", "right")); sfx("pop", 0, 0.5); }
      if (i === 200) { await E(() => { window.__hub3d.goPlace("main"); __promo.clear(".pill"); }); sfx("whoosh", 0, 0.5); }
      if (i >= 224) { const u = ease(Math.min(1, (i - 224) / 34)); await E(z => window.__hub3d.cam(z, 0, 0), 1 - 0.5 * u); }
      if (i === 232) { await E(() => __promo.pill("🗺️", "手指一捏", "三座島一次看", "right")); sfx("pop", 0, 0.5); }
    });
    await E(() => __promo.clear()); lap("三座小島");
  }

  // ===== 02 彩虹配送站：任務 5（三張訂單＋吊橋）：裝貨 → 放下吊橋 → 開車送貨（▶▶ 兩倍速）→ 謝謝你！→ 全部送到了 =====
  if (RUN("deliver")) {
    await cover(async () => {
      await toMenu();
      await E(() => { __promo.clean(false); document.querySelector(".mode-card[data-mode=deliver]").click(); });
      await must("配送站選關", () => !document.getElementById("deliverPick").classList.contains("hidden"));
      await E(() => document.querySelectorAll("#deliverLevels .bb-lv")[4].click());
      await must("配送站場景", () => window.__zy.mode === "deliver" && window.__zy.deliver && window.__zy.deliver.state() && window.__zy.deliver.state().ready, null, 240);
      await prep(null, null, 3);
    });
    await E(() => { window.__dvAuto = null; });
    let fast = false, wonAt = -1;
    const keep = i => !fast || i % 4 === 0;   // 卡車在路上開＝四倍速
    const n = await recUntil(() => window.__dvEnd === true, 900, async i => {
      await cbigSeq(i, 2, "彩虹配送站", "裝貨、開車、送到家", null);
      if (i === 6) await E(() => { window.__dvAuto = window.__zy.deliver.debug.autoPlay(160); });
      const s = await E(() => { const s = window.__zy.deliver.state(); return s && { driving: s.driving, won: s.won }; });
      if (s && s.won && wonAt < 0) wonAt = i;
      const want = !!(s && s.driving) && wonAt < 0 && i > 40;
      if (want !== fast) { fast = want; await E(f => __promo.ff(f, "四倍速"), fast); }
      if (wonAt >= 0 && i - wonAt > 46) await E(() => { window.__dvEnd = true; });
    }, keep);
    console.log("配送站：", n, "格（含快轉丟掉的）、過關在", wonAt);
    await E(() => { __promo.clear(); window.__dvEnd = false; }); lap("配送站");
  }

  // ===== 03 寵物換裝：彩虹島服裝店 → 小兔試穿皇冠、彩虹披風、小花、翅膀、派對帽 =====
  if (RUN("dress")) {
    const ITEMS = ["crown", "cape_rainbow", "flower", "wings", "party_hat"];
    await cover(async () => {
      await toMenu();
      await E(() => { __promo.clean(false); window.__hub3d.goPlace("rainbow"); });
      await prep(null, null, 10); await hideGuide();
      await E(() => document.querySelector(".hub-tag[data-mode=dress]").click());
      await must("換裝畫面", () => window.__zy.dress && window.__zy.dress.debug.state().open && window.__zy.dress.debug.state().gl, null, 160);
      // 先把要穿的配件都穿一次（模型下載好），再全部脫掉
      const ready = async () => { await E(() => { window.__drReady = null; window.__zy.dress.debug.ready().then(v => { window.__drReady = v; }); }); await prep(() => window.__drReady !== null, null, 60); };
      for (const id of ITEMS) { await E(id => window.__zy.dress.debug.tapItem(id), id); await ready(); }
      await E(() => { const d = window.__zy.dress.debug, w = d.state().wear; for (const s of ["head", "side", "back"]) if (w[s]) d.tapItem(w[s]); });
      await prep(() => window.__zy.dress.debug.state().worn.length === 0, null, 40); await prep(null, null, 10);
    });
    await rec(160, async i => {
      await cbigSeq(i, 3, "寵物換裝", "10 件衣服配件", null);
      const k = [12, 40, 68, 96, 124].indexOf(i); if (k >= 0) await E(id => window.__zy.dress.debug.tapItem(id), ITEMS[k]);
      if (i === 50) await E(() => __promo.pill("🎁", "送貨、扭蛋拿新衣服", "穿好就在小島上走來走去", "lonly"));
    });
    await E(() => __promo.clear()); lap("換裝");
  }

  // ===== 04 注音戰鬥陀螺：注音鍵盤拼「宇宙強爸爸」→ 下場變身 → 對戰（中間回合跳過）→ 決勝回合慢動作 → 你贏了 =====
  if (RUN("tops")) {
    await cover(async () => {
      await toMenu();
      await E(() => { __promo.clean(false); document.querySelector(".mode-card[data-mode=tops]").click(); });
      await must("陀螺打字畫面", () => window.__zy.mode === "tops" && window.__zy.tops && window.__zy.tops.state() && window.__zy.tops.state().phase === "type", null, 240);
      await prep(null, null, 8);
    });
    // 打字小幫手：照目前狀態按下一個鍵（符號 → 聲調 → 選字），一次一個動作；回傳 "done"＝五個字都好了
    const typeStep = () => E(() => {
      const P = "宇宙強爸爸", Z = ["ㄩˇ", "ㄓㄡˋ", "ㄑㄧㄤˊ", "ㄅㄚˋ", "ㄅㄚ˙"], root = document.getElementById("tops"), g = window.__zy.tops, s = g.state();
      if (s.slots.every(Boolean)) return "done";
      const i = s.cur, ch = P[i], z = Z[i], tones = "ˊˇˋ˙", tone = tones.includes(z.slice(-1)) ? z.slice(-1) : "1", base = tone === "1" ? z : z.slice(0, -1);
      const key = k => { const b = root.querySelector(`.tp-key[data-k="${k}"]`); if (b) b.click(); return "key " + k; };
      if (s.cands.length) {
        const j = s.cands.indexOf(ch); if (j < 0) return key("back");
        const btns = [...root.querySelectorAll(".tp-cands .tp-cand")], b = btns.find(x => x.getAttribute("aria-label") === ch);
        if (!b) { const nx = root.querySelector(".tp-next"); if (nx) nx.click(); return "page"; }
        b.click(); return s.sel === j ? "pick " + ch : "sel " + ch;
      }
      if (s.comp !== base.slice(0, s.comp.length) || s.comp.length > base.length) return key("back");
      if (s.comp.length < base.length) return key(base[s.comp.length]);
      return key(tone);
    });
    let typed = false, morphAt = -1, ffOn = false;
    await recUntil(() => window.__zy.tops.state().phase === "morph" && !document.querySelector(".tp-fight")?.disabled, 420, async i => {
      await cbigSeq(i, 4, "注音戰鬥陀螺", "拼 5 個字變陀螺", null);
      if (!typed && i >= 14 && i % 2 === 0) { const r = await typeStep(); if (r === "done") { typed = true; morphAt = i + 12; } }
      if (i === morphAt) await E(() => window.__zy.tops.debug.go());
      if (morphAt > 0 && i === morphAt + 80 && !ffOn) { ffOn = true; await E(() => __promo.ff(true, "三倍速")); }
    }, i => morphAt < 0 || i < morphAt + 80 || i % 3 === 0);   // 五顆陀螺一顆一顆變出來＝一倍速；戰力數字、加成那一段三倍速
    await E(() => __promo.ff(false));
    // 開戰：第 1 回合（回合字卡、3 2 1 兩倍速 → 發射一倍速）→ 中間回合不錄 → 決勝回合從最後一擊前 0.7 秒開始 → 慢動作 → 你贏了
    await E(() => window.__zy.tops.debug.fight());
    const M = await E(() => { const m = window.__zy.tops.debug.match(); return m && { winner: m.winner, score: m.score, rounds: m.rounds.map(r => ({ w: r.winner, n: r.n, how: r.how })), flip: m.flip }; });
    const vs = await E(() => window.__zy.tops.state());
    if (!M) throw new Error("陀螺：沒有開戰（phase＝" + (vs && vs.phase) + "）");
    // 決勝回合＝哪一方先拿到第 3 回合的那一回合（對戰結果開戰時就算好了，"a"＝我）
    let dec = -1; { let a = 0, b = 0; for (let k = 0; k < M.rounds.length; k++) { if (M.rounds[k].w === "a") a++; else b++; if (a === 3 || b === 3) { dec = k; break; } } }
    console.log("陀螺：", vs.phrase, vs.power, "對手", JSON.stringify(vs.opp), "回合", JSON.stringify(M.rounds), "決勝第", dec + 1, "回合", M.winner === "a" ? "（我贏）" : "（⚠ 我輸了）");
    await rec(96, async i => { if (i === 48) await E(() => __promo.pill("⚔️", "一對一對戰", "撞出場、轉最久就贏", "top")); if (i === 80) await E(() => __promo.clear(".pill")); }, i => i >= 78 || (i >= 48 && i % 2 === 0));
    const sc = () => E(() => window.__zy.tops.state());
    if (dec > 0) {
      await E(() => window.__zy.tops.debug.fast(true));
      let guard = 0;
      for (;;) {   // 跳過中間的回合（遊戲時鐘快轉、畫面不存）到決勝回合的字卡
        const s = await sc(); if (!s || s.phase !== "battle" || (s.round && s.round.i === dec)) break;
        await step(DT); await skip(true); if (++guard > 4000) throw new Error("陀螺：等不到決勝回合");
      }
      await E(() => window.__zy.tops.debug.fast(false));
      // 一倍速時遊戲時鐘每格 1/30 秒＝模擬 2 步；慢動作從 end.k−48 步開始（≈ n−48）→ 開打後再跳過 (n−48)/2 − 20 格
      const skipN = Math.max(0, Math.floor((M.rounds[dec].n - 48) / 2) - 12); let j = 0;
      for (;;) {
        const s = await sc(); if (!s || s.phase !== "battle") break;
        if (s.round && s.round.stage === "fight" && j++ >= skipN) break;
        await step(DT); await skip(true); if (++guard > 6000) throw new Error("陀螺：等不到決勝回合的最後一擊");
      }
      await E(() => { __promo.flash(); __promo.pill("🔥", "決勝回合", "最後一擊！", "top"); });
    }
    let slowSeen = false, slowEnd = -1, endAt = -1;
    await recUntil(() => window.__promoTopsEnd === true, 600, async i => {
      const s = await sc(); const slow = !!(s && s.round && s.round.slow);
      if (slow && !slowSeen) { slowSeen = true; await E(() => __promo.clear(".pill")); }
      if (slowSeen && !slow && slowEnd < 0) { slowEnd = i; await E(() => __promo.ff(true, "三倍速")); }
      if (endAt < 0 && s && s.phase === "result") { endAt = i; await E(() => __promo.ff(false)); }
      if (endAt >= 0 && i - endAt > 38) await E(() => { window.__promoTopsEnd = true; });
    }, i => slowEnd < 0 || endAt >= 0 || i % 3 === 0);   // 慢動作完 → 回合字卡三倍速 → 「你贏了」一倍速
    await E(() => __promo.clear()); lap("陀螺");
  }

  // ===== 05 詞句小偵探：聽一句話 → 三張只差幾個字的卡 → 點對的那張（綠框＋放大鏡照亮關鍵字） =====
  if (RUN("detective")) {
    await cover(async () => {
      await toMenu();
      await E(() => { __promo.clean(false); document.querySelector(".mode-card[data-mode=detective]").click(); });
      await must("偵探畫面", () => window.__zy.mode === "detective" && window.__zy.detective && window.__zy.detective.state(), null, 160);
      await prep(null, null, 2);
    });
    let askAt = -1;
    await recUntil(() => window.__promoDetEnd === true, 260, async i => {
      await cbigSeq(i, 5, "詞句小偵探", "三句只差幾個字，聽出是哪句", null);
      const s = await E(() => window.__zy.detective.state());
      if (askAt < 0 && s && s.phase === "ask") askAt = Math.max(i, 10);
      if (askAt >= 0 && i === askAt + 36) { await E(() => { const g = window.__zy.detective; g.debug.tap(g.state().answer); }); }
      if (askAt >= 0 && i === askAt + 100) await E(() => { window.__promoDetEnd = true; });
    });
    console.log("偵探：題目出現在第", askAt, "格");
    await E(() => __promo.clear()); lap("偵探");
  }

  // ===== 06 泡泡新區：第 2 區救螃蟹（ㄉㄊㄋㄌ）、第 3 區救鯨魚（ㄍㄎㄏ）＋同樂廣場 =====
  // 挑關：每一區試每一關、每種符號，挑「一發救最多」的那關（關卡表改了也照樣挑得到）
  const bubbleGo = async (zone) => {
    await toMenu();
    await E(() => { __promo.clean(false); document.querySelector(".mode-card[data-mode=bubble]").click(); });
    await must("泡泡選關", () => !document.getElementById("bubblePick").classList.contains("hidden"));
    await E(z => document.querySelectorAll("#bubbleZones .bb-ztab")[z].click(), zone); await prep(null, null, 1);
    await E(() => document.querySelectorAll("#bubbleLevels .bb-lv")[0].click());
    await must("泡泡關卡", z => window.__zy.mode === "bubble" && window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === z * 10 && !document.getElementById("bubble").classList.contains("hidden"), zone, 120);
    const pick = await E(z => {
      const g = window.__zy.bubble, d = g.debug; let top = null;
      for (let L = z * 10; L < z * 10 + 10; L++) {
        g.start(L); const syms = Object.keys(g.state().counts);
        for (const s of syms) { d.setQueue(s, s); const b = d.bestShot(); if (!b) continue; const sc = b.rescued * 100 + b.dropped * 10 + b.popped; if (!top || sc > top.sc) top = { L, s, sc, b }; }
      }
      return top;
    }, zone);
    await toMenu();
    await E(() => document.querySelector(".mode-card[data-mode=bubble]").click());
    await must("泡泡選關", () => !document.getElementById("bubblePick").classList.contains("hidden"));
    await E(z => document.querySelectorAll("#bubbleZones .bb-ztab")[z].click(), zone); await prep(null, null, 1);
    await E(L => document.querySelectorAll("#bubbleLevels .bb-lv")[L % 10].click(), pick.L);
    await must("泡泡關卡", L => window.__zy.mode === "bubble" && window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === L && !document.getElementById("bubble").classList.contains("hidden"), pick.L, 120);
    await prep(null, null, 6);
    const best = await E(s => { const d = window.__zy.bubble.debug; d.setQueue(s, s); return d.bestShot(); }, pick.s);
    console.log(`泡泡第 ${zone + 1} 區：第 ${pick.L + 1} 關、射「${pick.s}」`, JSON.stringify(best));
    return best;
  };
  const shoot = (best, i, at) => {
    if (i <= at - 6) return E(a => window.__zy.bubble.debug.aim(a), Math.PI / 2 + (best.angle - Math.PI / 2) * Math.min(1, i / (at - 10)));
    if (i === at) return E(() => window.__zy.bubble.debug.fire());
  };
  if (RUN("bubble")) {
    let best = null;
    await cover(async () => { best = await bubbleGo(1); });
    await rec(100, async i => {
      await cbigSeq(i, 6, "泡泡新區", "泡泡 30 關，救螃蟹、救鯨魚", null);
      await shoot(best, i, 46);
      if (i === 48) await E(() => __promo.pill("🦀", "ㄉㄊㄋㄌ 救小螃蟹", "", "pmid"));
    });
    await wipeIn(); await E(() => __promo.clear(":scope > :not(.wipe)"));
    best = await bubbleGo(2);
    await wipeOut();
    await rec(80, async i => {
      await shoot(best, i, 22);
      if (i === 4) await E(() => __promo.pill("🐳", "ㄍㄎㄏ 救小鯨魚", "", "pmid"));
    });
    await E(() => __promo.clear(".pill")); lap("泡泡");
  }
  // 同樂廣場：小島上先說「全島一起合作」→ 🎪 打開 → 本週救援週，全島一起救了幾隻（數字滾上去、進度條長出來）
  //   （白天放煙火幾乎看不到，10-12 試過；卡片打開時整個畫面都是卡片，說明膠囊在打開前講完）
  if (RUN("plaza")) {
    await cover(async () => {
      await toMenu();
      await E(() => { __promo.clean(false); window.__hub3d.goPlace("main"); window.__hub3d.cam(1.05, 0, 0); });
      await prep(null, null, 6); await hideGuide();
    });
    await rec(104, async i => {
      if (i === 0) { await E(() => __promo.pill("🎪", "同樂廣場", "全島小朋友一起合作", "right")); sfx("pop", 0, 0.5); }
      if (i === 30) await E(() => { __promo.clear(".pill"); document.getElementById("plazaBtn").click(); });
    });
    await E(() => __promo.clear()); lap("同樂廣場");
  }

  // ===== 上次說的「即將推出」→ 全部上線！ =====
  if (RUN("live")) {
    await cover(async () => {
      await toMenu();
      await E(s => __promo.soon(s), SOON);
      await prep(null, null, 2);
    });
    await rec(124, async i => {
      if (i === 0) sfx("pop", 0, 0.7);
      if (i === 8 || i === 15 || i === 22) sfx("flip", 0, 0.7);
      if (i === 34) { await E(() => __promo.live()); sfx("star", 0, 0.8); sfx("star", 0.26, 0.8); sfx("star", 0.52, 0.8); }
      if (i === 58) { await E(() => __promo.stamp("全部上線！")); sfx("thump"); sfx("sticker", 0.1, 0.7); }
      if (i === 78) { await E(() => __promo.more("還有更多驚喜，等你來發現！")); sfx("pop", 0, 0.5); }
    });
    lap("全部上線");
  }

  // ===== 片尾卡 =====
  if (RUN("end")) {
    await cover(async () => { await E(() => __promo.end()); await prep(null, null, 2); });
    await rec(105, async i => { if (i === 0) { sfx("pop", 0.3, 0.8); sfx("sticker", 0.6, 0.7); } });
    lap("片尾");
  }
  await browser.close();
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));
  fs.writeFileSync(path.join(FR, "sfx.json"), JSON.stringify(SFX));
  if (flag("--noenc")) { console.log(`只留影格：${FR}（${F} 格、${(F / FPS).toFixed(1)} 秒、音效 ${SFX.length} 個）`); return; }
  encode(F, SFX);
  if (!flag("--keep")) fs.rmSync(FR, { recursive: true, force: true });
})().catch(e => { console.error("FATAL", e.stack || e.message); process.exit(1); });

// ===== 合成：30fps 影格＋背景音樂（island.mp3，照循環點接長、淡入淡出）＋音效（遊戲的＋疊字的） =====
function encode(F, SFX) {
  const dur = F / FPS, SD = path.join(FR, "sfx"); fs.mkdirSync(SD, { recursive: true });
  const synth = (name, filter, d) => { const out = path.join(SD, name + ".wav"); const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-t", String(d), out], { encoding: "utf8" }); if (r.status !== 0) throw new Error("合成音效失敗 " + name + r.stderr); return out; };
  const A = n => path.join(ROOT, "audio", "sfx", n + ".mp3");
  const FILES = {
    thump: synth("thump", "sine=f=80:r=44100:d=0.35,volume=2.2,afade=t=out:st=0.05:d=0.3", 0.35),
    clash: synth("clash", "anoisesrc=d=0.2:c=white:r=44100:a=0.5,highpass=f=2200,lowpass=f=9000,afade=t=out:st=0.01:d=0.18", 0.2),
  };
  for (const f of fs.readdirSync(path.join(ROOT, "audio", "sfx"))) if (f.endsWith(".mp3")) FILES[f.slice(0, -4)] = A(f.slice(0, -4));
  // 遊戲裡有叫、但音效清單沒有的名字（陀螺的按鍵、碰撞…）：換成相近的音效；其他不認得的略過
  const ALIAS = { key: ["tap", 0.5], toneKey: ["tap", 0.6], pick: ["select", 0.6], go: ["whoosh", 0.6], launch: ["whoosh", 0.6], clash: ["clash", 0.7], out: ["thump", 1], topple: ["thump", 0.7], roundWin: ["ok", 0.8], roundLose: ["ng", 0.5], bad: ["ng", 0.5], sparkle: ["sticker", 1] };
  const ev = [], lastAt = {};
  for (const s of SFX.slice().sort((a, b) => a.t - b.t)) {
    let k = s.k, vol = s.vol;
    if (ALIAS[k] && !fs.existsSync(A(k))) { k = ALIAS[k][0]; vol *= ALIAS[s.k][1]; }
    if (!FILES[k] || s.t > dur - 0.15) continue;
    if (lastAt[k] !== undefined && s.t - lastAt[k] < 0.06) continue;   // 同一個音效 60ms 內只留一個（連打不會疊成一團）
    lastAt[k] = s.t; ev.push({ k, t: s.t, vol: vol * (s.src === "game" ? 0.6 : 0.75), rate: +s.rate || 1 });
  }
  const used = [...new Set(ev.map(e => e.k))];
  const bgm = path.join(ROOT, "audio", "bgm", "island.mp3"), LOOP0 = 0.5, LOOP1 = 62.199184;   // audio/manifest.json 的 loopStart／loopEnd
  const args = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FR, "f%05d.jpg"), "-i", bgm, "-i", bgm];
  used.forEach(k => args.push("-i", FILES[k]));
  const fc = [`[1:a]aresample=44100,aformat=channel_layouts=stereo,atrim=start=0:end=${LOOP1},asetpts=N/SR/TB[b1]`, `[2:a]aresample=44100,aformat=channel_layouts=stereo,atrim=start=${LOOP0}:end=${LOOP1},asetpts=N/SR/TB[b2]`,
    `[b1][b2]concat=n=2:v=0:a=1,atrim=start=0:end=${dur.toFixed(3)},afade=t=in:st=0:d=0.8,afade=t=out:st=${(dur - 2.2).toFixed(2)}:d=2.2,volume=1.0[bg]`];
  const mixIn = ["[bg]"];
  used.forEach((k, ui) => {
    const es = ev.filter(e => e.k === k), labs = es.map((_, j) => `[s${ui}_${j}]`).join("");
    fc.push(`[${ui + 3}:a]aresample=44100,aformat=channel_layouts=stereo,asplit=${es.length}${labs}`);
    es.forEach((e, j) => {
      const ms = Math.max(0, Math.round(e.t * 1000)), rate = Math.max(0.5, Math.min(2, e.rate));
      fc.push(`[s${ui}_${j}]${Math.abs(rate - 1) > 0.01 ? `asetrate=${Math.round(44100 * rate)},aresample=44100,` : ""}adelay=${ms}|${ms},volume=${e.vol.toFixed(3)}[e${ui}_${j}]`); mixIn.push(`[e${ui}_${j}]`);
    });
  });
  fc.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:duration=first:normalize=0,alimiter=limit=0.89:level=false[a]`);
  const script = path.join(FR, "filter.txt"); fs.writeFileSync(script, fc.join(";\n"));
  args.push("-/filter_complex", script, "-map", "0:v", "-map", "[a]", "-t", dur.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", OUTMP4);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) { console.error("ffmpeg 失敗", (r.stderr || "").slice(0, 2000)); process.exit(1); }
  console.log(`完成：${OUTMP4}（${F} 格、${dur.toFixed(1)} 秒、音效 ${ev.length} 個：${used.join(" ")}）`);
}
module.exports.encode = encode;
