// 注音小島宣傳片 v2（阿葉 10-11：照《開工吧！社畜人生！》宣傳片的節奏——斜色條逐字彈入的開場、放射光標題揭幕、
//   斜色塊掃過的轉場＋大章節號、▶▶ 快轉看日夜、片尾「即將推出」預告；參考影片 IMAGE/_src/iso/ref/videos/）
// 用法：node tools/promo/make_promo.js [輸出.mp4] [--keep] [--portrait＝直式 720×1280（IG Reels／Shorts）]
//       偶發「截圖卡死」會直接失敗 → 重跑：for i in 1 2 3 4; do node tools/promo/make_promo.js && break; done
// 做法：headless Chromium 1280×720 ＋ CDP 虛擬時間逐格截圖 30fps（3D 算得慢也一樣順）
//       → 疊字用頁面裡的 DOM（#promo，class noann＝不自動加注音）→ ffmpeg 合成：背景音樂＋音效（咻、啵、答對、蓋章…照事件時間點疊上）
// 需要：本機伺服器 python -m http.server 8765（專案根目錄）、ffmpeg
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const { launch } = require("../zy-test/lib");
const ROOT = path.resolve(__dirname, "../..");
const PORTRAIT = process.argv.includes("--portrait"), VW = PORTRAIT ? 720 : 1280, VH = PORTRAIT ? 1280 : 720;
const OUTARG = process.argv.slice(2).find(a => !a.startsWith("--"));   // 參數順序不拘（--portrait 放前面也行）
const OUTMP4 = OUTARG ? path.resolve(OUTARG) : path.join(ROOT, "promo", PORTRAIT ? "zhuyin-island-promo-vertical.mp4" : "zhuyin-island-promo.mp4");
const FR = path.join(os.tmpdir(), PORTRAIT ? "zy_promo_frames_p" : "zy_promo_frames");
const URL = (process.env.ZY_URL || "http://127.0.0.1:8765/zhuyin.html") + "?debug&weather=sunny&novoice&night=0&clock=day";   // 宣傳片固定白天開場（日夜那段由腳本控制）
const FPS = 30, DT = 1000 / FPS;
const NAVY = "#1d3954", TEAL = "#12707a", YEL = "#f6c445";

const CSS = `
#promo { position: fixed; inset: 0; z-index: 100000; pointer-events: none; overflow: hidden; font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; }
#promo * { box-sizing: border-box; }
/* 錄開場／標題時把遊戲介面藏起來（畫面乾淨） */
body.pclean .round-btn, body.pclean .player-tag, body.pclean #menu .pill, body.pclean .jarBtn, body.pclean #guide, body.pclean .hub-tag, body.pclean #townTag,
body.pclean [class*="hud"], body.pclean [id*="hud"], body.pclean [class*="dock"] { visibility: hidden !important; }
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
#promo .chap .bar span { width: 4vmin; height: 1.1vmin; border-radius: 1vmin; background: #d6e2ea; }
#promo .chap .bar span.on { background: ${YEL}; }
@keyframes pcIn { 0% { opacity: 0; translate: -50% -4vmin; } 100% { opacity: 1; translate: -50% 0; } }
/* 說明小膠囊 */
#promo .pill { position: absolute; left: 3vmin; bottom: 4vmin; display: flex; align-items: center; gap: 1.6vmin; background: #fff; border-radius: 6vmin; padding: 1.5vmin 3.4vmin 1.5vmin 2vmin;
  box-shadow: 0 0.8vmin 0 #b9c6d6, 0 1.6vmin 3vmin rgba(20,50,80,0.3); animation: ppIn 0.4s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .pill .e { font-size: 6vmin; line-height: 1; }
#promo .pill .t { font-size: 4.4vmin; font-weight: 900; color: ${NAVY}; }
#promo .pill .t small { font-size: 3.4vmin; color: #556; font-weight: 700; margin-left: 1.2vmin; }
#promo .pill.right { left: auto; right: 3vmin; }
@keyframes ppIn { 0% { opacity: 0; translate: -6vmin 0; } 100% { opacity: 1; translate: 0 0; } }
/* 斜放黃色大標語（場景中間用） */
#promo .banner { position: absolute; left: 50%; top: 40%; translate: -50% -50%; rotate: -4deg; background: ${YEL}; border-radius: 2.4vmin; padding: 2.4vmin 6vmin 2.6vmin;
  box-shadow: 0 1.4vmin 0 #c99a1d, 0 3vmin 6vmin rgba(20,50,80,0.35); text-align: center; animation: pbIn 0.5s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .banner b { display: block; font-size: 8.4vmin; font-weight: 900; color: #fff; line-height: 1.1; letter-spacing: 0.5vmin; -webkit-text-stroke: 1.1vmin ${NAVY}; paint-order: stroke fill; }
#promo .banner i { display: block; font-style: normal; margin-top: 1vmin; font-size: 4.4vmin; font-weight: 900; color: ${NAVY}; }
#promo .banner.low { top: 72%; } #promo .banner.out { animation: pbOut 0.32s ease-in both; }
@keyframes pbIn { 0% { opacity: 0; scale: 0.5; } 100% { opacity: 1; scale: 1; } }
@keyframes pbOut { 0% { opacity: 1; scale: 1; } 100% { opacity: 0; scale: 0.85; } }
/* ▶▶ 快轉徽章 */
#promo .ff { position: absolute; right: 3vmin; top: 11vmin; display: flex; align-items: center; gap: 1.4vmin; background: ${YEL}; color: ${NAVY}; font-weight: 900; font-size: 6vmin;
  border-radius: 3vmin; padding: 1.2vmin 3vmin; box-shadow: 0 1vmin 0 #c99a1d; animation: pbIn 0.4s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .ff small { font-size: 3.6vmin; } #promo .ff .clk { font-size: 3.8vmin; background: #fff; border-radius: 2vmin; padding: 0.4vmin 1.4vmin; }
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
/* 即將推出 */
#promo .soonBg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 30%, #2f5d8a 0, #13263f 70%); animation: peIn 0.3s ease-out both; }
#promo .soonBg::after { content: ""; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(255,255,255,0.8) 0 0.25vmin, transparent 0.35vmin); background-size: 9vmin 9vmin; opacity: 0.35; }
#promo .soonT { position: absolute; left: 50%; top: 9%; translate: -50% 0; white-space: nowrap; font-size: 11vmin; font-weight: 900; color: ${YEL}; -webkit-text-stroke: 1.3vmin ${NAVY}; paint-order: stroke fill;
  text-shadow: 0 1vmin 0 #0b1a2c; animation: pbIn 0.45s cubic-bezier(.2,1.5,.4,1) both; }
#promo .cards { position: absolute; left: 50%; top: 52%; translate: -50% -50%; display: flex; gap: 4vmin; perspective: 120vmin; }
#promo .scard { width: 34vmin; background: #fff; border-radius: 3vmin; padding: 2.6vmin 2vmin 2.2vmin; text-align: center; box-shadow: 0 1.4vmin 0 #b9c6d6, 0 3vmin 5vmin rgba(0,0,0,0.35);
  animation: flipIn 0.55s cubic-bezier(.2,1.3,.4,1) both; animation-delay: calc(var(--i) * 220ms + 250ms); }
#promo .scard .pic { position: relative; height: 23vmin; display: grid; place-items: center; background: #e8f1f8; border-radius: 2vmin; overflow: hidden; }
#promo .scard .pic img, #promo .scard .pic .em { filter: brightness(0) saturate(0); opacity: 0.82; }
#promo .scard .pic img { height: 16vmin; } #promo .scard .pic .em { font-size: 13vmin; line-height: 1; }
#promo .scard .pic .q { position: absolute; right: 1.2vmin; top: 0.6vmin; font-size: 6vmin; font-weight: 900; color: ${YEL}; -webkit-text-stroke: 0.8vmin ${NAVY}; paint-order: stroke fill; }
#promo .scard .lb { margin-top: 1.6vmin; font-size: 4.4vmin; font-weight: 900; color: ${NAVY}; white-space: nowrap; }
@keyframes flipIn { 0% { opacity: 0; transform: rotateY(90deg) translateY(4vmin); } 100% { opacity: 1; transform: rotateY(0) translateY(0); } }
#promo .stamp { position: absolute; left: 50%; top: 84%; translate: -50% -50%; rotate: -6deg; white-space: nowrap; background: #ff5d5d; color: #fff; font-size: 8vmin; font-weight: 900; border-radius: 2vmin; padding: 1vmin 4.4vmin;
  border: 0.8vmin solid #fff; box-shadow: 0 1.2vmin 0 #b83a3a; animation: stampIn 0.32s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes stampIn { 0% { opacity: 0; scale: 3; } 100% { opacity: 1; scale: 1; } }
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
  #promo .cbig { top: 30vmin; } #promo .cbig .n { font-size: 15vmin; } #promo .cbig .t { font-size: 6.4vmin; }
  #promo .chap { top: 22vmin; } #promo .pill { bottom: 30vmin; } #promo .ff { top: 40vmin; }
  #promo .banner { top: 36%; } #promo .banner b { font-size: 7vmin; }
  #promo .plate { width: 90vw; height: 30vmin; } #promo .ttl { font-size: 17vmin; }
  #promo .cards { flex-direction: column; gap: 2.6vmin; top: 53%; } #promo .scard { width: 62vmin; display: grid; grid-template-columns: 22vmin 1fr; align-items: center; gap: 3vmin; padding: 2vmin; }
  #promo .scard .pic { height: 18vmin; } #promo .scard .lb { margin: 0; text-align: left; font-size: 5vmin; }
  #promo .soonT { top: 15%; } #promo .stamp { top: 87%; }
  #promo .eplate { top: 34%; } #promo .ettl { top: 32%; } #promo .etag { top: 47%; font-size: 4.6vmin; } #promo .erow { top: 54%; } #promo .esm { top: 70%; }
}
`;
// 頁面裡的疊字小工具
const OVERLAY = () => {
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
    cbig(n, t, s) { this.clear(".cbig"); mk("cbig", `<span class="n">0${n}</span><span class="t">${t}</span><span class="s">${s}</span>`); },
    cbigOut() { root.querySelectorAll(".cbig").forEach(b => b.classList.add("out")); },
    chap(n, t) { this.clear(".chap"); mk("chap", `<span class="n">0${n}</span><span class="t">${t}</span><span class="bar">${[1, 2, 3, 4, 5].map(k => `<span class="${k <= n ? "on" : ""}"></span>`).join("")}</span>`); },
    pill(e, t, sub, right) { this.clear(".pill"); mk("pill" + (right ? " right" : ""), `<span class="e">${e}</span><span class="t">${t}${sub ? `<small>${sub}</small>` : ""}</span>`); },
    banner(t, sub, cls) { this.clear(".banner"); mk("banner" + (cls ? " " + cls : ""), `<b>${t}</b>${sub ? `<i>${sub}</i>` : ""}`); },
    bannerOut() { root.querySelectorAll(".banner").forEach(b => b.classList.add("out")); },
    ff(clock) { let d = root.querySelector(".ff"); if (!d) d = mk("ff", `▶▶ <span>×5</span><small>快轉</small><span class="clk"></span>`); d.querySelector(".clk").textContent = clock; },
    // 標題揭幕
    logo(newText) {
      this.clear(".stage"); const s = mk("stage", `<div class="sun"></div><div class="sunGlow"></div><div class="plate"></div><div class="ttl">${chars("注音小島")}</div>
        <div class="lsub">聽一聽・點一點・玩著玩著就會注音</div>${newText ? `<div class="newp"><b>NEW</b>${newText}</div>` : ""}`);
      const P = innerWidth < innerHeight;
      const props = P ? [["guide_owl", 6, 20, 0.55], ["egg_rare", 72, 16, 0.7], ["balloon", 6, 80, 0.85], ["pets/bunny", 76, 82, 1.0], ["coin_gold", 84, 26, 1.1]]
        : [["guide_owl", 6, 8, 0.55], ["egg_rare", 82, 10, 0.7], ["balloon", 9, 56, 0.85], ["pets/bunny", 84, 52, 1.0], ["coin_gold", 9, 80, 1.1], ["pets/penguin", 82, 78, 1.2]];
      for (const [n, x, y, dl] of props) { const im = document.createElement("img"); im.className = "prop"; im.src = img(n); im.style.left = x + "%"; im.style.top = y + "%"; im.style.animationDelay = `${dl}s, ${dl + 0.55}s`; s.appendChild(im); }
      const blocks = P ? [["ㄅ", "#ff7a59", 30, 15, 0.95], ["ㄆ", "#5bb8f5", 46, 12, 1.05], ["ㄇ", "#7bd36b", 62, 15, 1.15]] : [["ㄅ", "#ff7a59", 30, 11, 0.95], ["ㄆ", "#5bb8f5", 44, 7, 1.05], ["ㄇ", "#7bd36b", 58, 11, 1.15]];
      for (const [t, c, x, y, dl] of blocks) { const b = mk("blk", t, s); b.style.background = c; b.style.left = x + "%"; b.style.top = y + "%"; b.style.animationDelay = dl + "s"; }
      for (const [x, y, dl] of [[18, 30, 0.2], [76, 34, 0.5], [40, 78, 0.8], [88, 74, 0.35], [52, 6, 0.65]]) { const k = mk("spk", "✦", s); k.style.left = x + "%"; k.style.top = y + "%"; k.style.animationDelay = dl + "s"; }
    },
    // 片尾預告：即將推出
    soon(items) {
      this.clear(); mk("soonBg", ""); mk("soonT", "即將推出");
      const c = mk("cards", items.map(([pic, lb], i) => `<div class="scard" style="--i:${i}"><div class="pic">${pic.startsWith("em:") ? `<span class="em">${pic.slice(3)}</span>` : `<img src="${img(pic)}">`}<span class="q">?</span></div><div class="lb">${lb}</div></div>`).join(""));
    },
    stamp(t) { mk("stamp", t); },
    end() {
      this.clear(); const s = mk("stage", `<div class="sun"></div><div class="sunGlow"></div><div class="plate eplate"></div><div class="ttl ettl">${chars("注音小島")}</div>
        <div class="etag">聽一聽、點一點，玩著玩著就會注音</div>
        <div class="erow"><span>🎮 九個小遊戲</span><span>🐣 28 隻動物朋友</span><span>🏙️ 小鎮越蓋越大</span><span>🌙 日夜天氣會變</span></div>
        <div class="esm"><span>平板、手機瀏覽器打開就能玩・不用下載</span></div>`);
    },
  };
};

// 預覽模式（--preview 輸出資料夾）：不跑遊戲，只把各種疊字特效單獨拍成截圖，檢查樣子用
async function preview(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launch(); const pg = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
  await pg.goto((process.env.ZY_URL || "http://127.0.0.1:8765/zhuyin.html").replace(/zhuyin\.html.*$/, "IMAGE/"));
  await pg.evaluate(() => { document.body.innerHTML = ""; const b = document.createElement("base"); b.href = "/"; document.head.appendChild(b); document.body.style.cssText = "margin:0;background:linear-gradient(#5fb0dc,#3f97c9)"; });
  await pg.addStyleTag({ content: CSS }); await pg.evaluate(OVERLAY);
  const snap = async (name, fn, wait) => { await pg.evaluate(() => __promo.clear()); await pg.evaluate(fn); await pg.waitForTimeout(wait); await pg.screenshot({ path: path.join(dir, name + ".jpg"), quality: 85, type: "jpeg" }); };
  await snap("1-kin", () => { __promo.vig(true); __promo.kin("還在逼孩子背注音？", "navy", { left: -3, top: 16, rot: -4 }, [2]); }, 120);
  await snap("2-kin-done", () => { __promo.vig(true); __promo.kin("不如蓋一座小島", "yel", { left: -2, top: 44, rot: 3 }, [3]); }, 1300);
  await snap("3-logo-mid", () => __promo.logo("新市區開幕・扭蛋機・日夜天氣"), 700);
  await snap("4-logo", () => __promo.logo("新市區開幕・扭蛋機・日夜天氣"), 2600);
  await snap("5-wipe", () => __promo.wipe(), 500);
  await snap("6-cbig", () => { __promo.cbig(1, "九個小遊戲", "聽一聽、點一點"); __promo.chap(1, "九個小遊戲"); __promo.pill("🎣", "釣魚", "聽聲音，點對的魚"); __promo.ff("19:40"); }, 900);
  await snap("7-soon", () => { __promo.soon([["pets/bunny", "寵物換裝"], ["cust_penguin", "更多泡泡關卡"], ["em:🏝️", "新的小島"]]); __promo.stamp("敬請期待！"); }, 1800);
  await snap("8-end", () => __promo.end(), 2200);
  await browser.close(); console.log("預覽：" + dir);
}

(async () => {
  const pv = process.argv.indexOf("--preview"); if (pv > 0) return preview(path.resolve(process.argv[pv + 1] || "promo-preview"));
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true }); fs.mkdirSync(path.dirname(OUTMP4), { recursive: true });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(() => {
    const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, speak(u) { setTimeout(() => u.onend && u.onend(), 300); } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // 遊戲音效換成靜音假物件（影片的音效由 ffmpeg 另外疊）：<audio> 載入時 Chrome 會暫停虛擬時間，少一個變因
    window.Audio = class { constructor(src) { Object.assign(this, { src: src || "", paused: true, currentTime: 0, volume: 1, muted: false, loop: false, playbackRate: 1, preload: "auto" }); } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() {} addEventListener() {} removeEventListener() {} };
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => cb(performance.now()));   // 虛擬時間：rAF 的時間戳跟 performance.now 一致
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL); await p.waitForTimeout(400);
  await p.evaluate(() => {
    localStorage.clear();
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, 64).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", "47"); localStorage.setItem("zy1_eggs", "4");
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, bubble: 1 }));
      localStorage.setItem("zy1_bubble", JSON.stringify({ lv: 9, stars: { 0: 3, 1: 3, 2: 3, 3: 2, 4: 3, 5: 2 } }));
      const pets = {}; for (const id of ["bear", "bunny", "cat", "fox", "panda", "penguin", "frog", "lion", "dog", "koala"]) pets[id] = { stage: 2, t: 30 };
      localStorage.setItem("zy1_rewards", JSON.stringify({ pets, partner: "bear", coins: 3, gold: 0, jarCoins: 4, treats: 60, decor: ["flower_arch", "statue_owl"], stamps: 3, stampDay: "", pity: { rare: 4, ssr: 0 }, catBonus: [], pulls: 4 }));
      localStorage.setItem("zy1_hello", "1"); localStorage.setItem("zy_hint_wait", "0"); localStorage.setItem("zy1_tone1tip", "1");
    });
  });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
  await p.evaluate(() => document.getElementById("startBtn").click());
  await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weather, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: CSS }); await p.evaluate(OVERLAY);
  await p.evaluate(() => { window.__hub3d.events(false); document.getElementById("guide").style.visibility = "hidden"; });
  // 預先載入宣傳片用到的圖（不然揭幕那一格圖還沒到）
  await p.evaluate(() => Promise.all(["guide_owl", "egg_rare", "balloon", "pets/bunny", "pets/penguin", "coin_gold", "pets/cat", "cust_penguin"].map(n => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = `IMAGE/zhuyin/${n}.webp`; }))));

  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const within = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r("TIMEOUT"), ms))]);
  const step = ms => within(new Promise(res => { cdp.once("Emulation.virtualTimeBudgetExpired", () => res("ok")); cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms }); }), 15000);
  // CDP 截圖不吃 deviceScaleFactor：PROMO_SCALE=1.5 才是 1080p，但帶 clip 在虛擬時間下常卡到逾時 → 預設 720p 不帶 clip
  let F = 0, last = null, diag = false; const SC = +process.env.PROMO_SCALE || 1;
  const SHOT = SC > 1 ? { format: "jpeg", quality: 92, clip: { x: 0, y: 0, width: VW, height: VH, scale: SC } } : { format: "jpeg", quality: 92 };
  // 心跳點：左上角 2px、幾乎透明，每格換一點點顏色 → 畫面一定有東西要重畫
  const beat = () => p.evaluate(f => { let d = document.getElementById("promoBeat"); if (!d) { d = document.createElement("div"); d.id = "promoBeat"; d.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;z-index:100001;pointer-events:none"; document.body.appendChild(d); } d.style.background = `rgba(${f % 2 ? 1 : 0},0,0,0.01)`; }, F);
  const shot = async () => {
    await beat();
    const pr = cdp.send("Page.captureScreenshot", SHOT);
    let s = await within(pr, 8000);
    if (s === "TIMEOUT" && !diag) {   // 第一次卡住：記錄頁面活著沒
      diag = true;
      const probe = () => within(p.evaluate(() => ({ now: Math.round(performance.now()), anims: document.getAnimations().length, mode: window.__zy.mode, idx: window.__zy.idx })), 4000);
      const a = await probe(), st = await step(16), b = await probe();
      console.log("診斷", F, JSON.stringify({ a, step: st, b }));
    }
    for (let k = 0; s === "TIMEOUT" && k < 5; k++) { await p.evaluate(k => { document.getElementById("promoBeat").style.background = `rgba(0,${k % 2},0,0.01)`; }, k); await step(16); s = await within(pr, 1000); if (s !== "TIMEOUT") console.log(`截圖卡住，放行 ${k + 1} 小步後出來`, F); }
    // 偶發卡死（10-11 實測：同一支腳本有時整片順、有時卡在不同場景，一卡就救不回）→ 直接失敗，外面重跑一次通常就過
    if (s === "TIMEOUT") throw new Error(`截圖卡死在第 ${F} 格，請重跑`);
    const buf = s && s.data ? Buffer.from(s.data, "base64") : last; if (!buf) throw new Error("截圖失敗");
    last = buf; fs.writeFileSync(path.join(FR, `f${String(F++).padStart(5, "0")}.jpg`), buf);
  };
  const rec = async (n, each) => { for (let i = 0; i < n; i++) { if (each) await each(i); await step(DT); await shot(); } };
  const E = (fn, arg) => p.evaluate(fn, arg);
  // 不錄的準備時間：虛擬時間往前走、真實時間也等一下（讓圖片／模型下載完）
  const prep = async (cond, arg, max = 60) => { for (let i = 0; i < max; i++) { await step(250); await p.waitForTimeout(60); if (!cond || await p.evaluate(cond, arg)) return true; } return false; };
  const hideGuide = () => E(() => { window.__hub3d.events(false); const g = document.getElementById("guide"); if (g) g.style.visibility = "hidden"; });
  const toMenu = async () => { await E(() => { if (!document.getElementById("menu").classList.contains("hidden")) return; document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click(); }); await prep(() => !document.getElementById("menu").classList.contains("hidden")); await hideGuide(); await prep(null, null, 4); };
  const tapOk = (sel) => E(sel => { const o = window.__zy.curOpts || []; const i = o.findIndex(x => x.ok); const b = document.querySelectorAll(sel)[i]; b && b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); }, sel);
  // 音效時間軸：事件發生的那一格記下來，最後 ffmpeg 照時間點疊上
  const SFX = []; const sfx = (k, dt = 0, vol = 1) => SFX.push({ k, t: F / FPS + dt, vol });
  // 轉場：斜色塊掃進來蓋住（錄 10 格）→ 做場景切換（不錄）→ 掃開（錄 12 格）
  const wipeIn = async () => { await E(() => __promo.wipe()); sfx("whoosh"); await rec(10); };
  const wipeOut = async () => { await E(() => __promo.wipeOut()); await rec(13); await E(() => __promo.clear(".wipe")); };
  const t0 = Date.now(), lap = n => console.log(`${n}：到第 ${F} 格（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  const has = fn => E(fn).catch(() => false);

  // ===== 0 開場：三句斜色條，各配一個小島特寫（推鏡） =====
  await E(() => { __promo.clean(true); __promo.vig(true); });
  const KIN = PORTRAIT
    ? [["還在逼孩子背注音？", "navy", { left: -3, top: 30, rot: -5 }, "order", [2]], ["不如蓋一座小島", "yel", { left: -2, top: 44, rot: 3 }, "fish", [3]], ["讓孩子 玩著玩著就會！", "teal", { left: -4, top: 58, rot: -4 }, "tone", [4, 5, 6, 7]]]
    : [["還在逼孩子背注音？", "navy", { left: -3, top: 16, rot: -4 }, "order", [2]], ["不如蓋一座小島", "yel", { left: -2, top: 44, rot: 3 }, "fish", [3]], ["讓孩子 玩著玩著就會！", "teal", { left: -3, top: 62, rot: -4 }, "tone", [4, 5, 6, 7]]];
  for (const [txt, col, pos, focus, small] of KIN) {
    await E(f => window.__hub3d.focus(f, 1.9), focus); await prep(null, null, 2);
    await rec(40, async i => {
      await E(([f, z]) => window.__hub3d.focus(f, z), [focus, 1.9 + i * 0.006]);
      if (i === 2) { await E(([t, c, ps, sm]) => __promo.kin(t, c, ps, sm), [txt, col, pos, small]); sfx("whoosh", 0, 0.6); sfx("pop", 0.18, 0.7); }
    });
  }
  await E(() => __promo.clear(".kin")); lap("開場");

  // ===== 1 標題揭幕：放射光＋底板＋逐字彈出＋道具 =====
  await rec(105, async i => {
    if (i === 0) { await E(() => { __promo.vig(false); __promo.logo("新市區開幕・扭蛋機・日夜天氣"); }); sfx("pop", 0, 0.9); sfx("sparkle", 0.35); sfx("pop", 0.95, 0.6); sfx("pop", 1.7, 0.8); }
  });
  await wipeIn();
  await E(() => { __promo.clear(".stage"); __promo.clean(false); window.__hub3d.cam(1, 0, 0); }); await prep(null, null, 4);
  await wipeOut(); lap("標題");

  // ===== 2 九個小遊戲 =====
  await rec(40, async i => {
    await E(z => window.__hub3d.cam(z, 0, 0), 1.0 + i * 0.002);
    if (i === 0) { await E(() => __promo.cbig(1, "九個小遊戲", "聽一聽、點一點")); sfx("pop"); }
    if (i === 32) await E(() => __promo.cbigOut());
  });
  await E(() => { __promo.clear(".cbig"); __promo.chap(1, "九個小遊戲"); });
  const GAMES = [
    ["fish", "🎣", "釣魚", "聽聲音，點對的魚", "#pond .fishBtn"], ["order", "🍔", "點餐", "看注音，拿對的食物", "#shelf .item"], ["tone", "🎈", "氣球", "聽聲調，戳對的氣球", "#sky .balloon"],
    ["hunt", "🔍", "尋寶", "看注音，找出寶物", "#scene .obj"], ["build", "🧩", "積木", "把注音拼起來"], ["whack", "🔨", "地鼠", "聽聲音，敲對的地鼠"], ["frog", "🐸", "青蛙", "一個音節跳一片荷葉"], ["match", "🃏", "翻牌", "注音配圖卡"]];
  for (const [m, e, name, sub, sel] of GAMES) {
    await E(m => { const c = document.querySelector(`.mode-card[data-mode=${m}]`); c.click(); if (m === "match") setTimeout(() => document.querySelector("#matchSizes .msize")?.click(), 50); }, m);
    await prep(m => !document.getElementById(m).classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden") && (m === "match" ? document.querySelectorAll("#board .card").length > 0 : true), m);
    await prep(null, null, 3);
    await E(([e, n, s]) => __promo.pill(e, n, s), [e, name, sub]);
    await rec(m === "build" || m === "match" ? 40 : 30, async i => {
      if (sel && i === 8) { await tapOk(sel); sfx("ok", 0.03, 0.7); }
      if (m === "whack" && i >= 3 && i % 3 === 0) { const hit = await E(() => { const s = window.__zy.wq; const c = s && s.cells.find(c => c.ok && c.state === "up"); if (c) { c.mole.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return true; } return false; }); if (hit) sfx("tap", 0, 0.6); }
      if (m === "frog" && (i === 6 || i === 22)) { await E(() => { const c = window.__zy.fq && window.__zy.fq.cols.find(c => c.o.ok); if (c) c.pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); }); sfx("pop", 0, 0.6); }
      if (m === "build" && i >= 3 && i % 4 === 0) { await E(() => { const q = window.__zy.round[window.__zy.idx], ss = window.__zy.parseZ(q.word.z); for (const s of ss) { for (const ch of s.sym) { const t = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === ch); if (t) { t.click(); return; } } const tt = document.querySelector(`#toneRow .toneTile[data-v="${s.tone}"]`); const open = document.querySelector("#slots .toneSlot.open"); if (open && tt) { tt.click(); return; } } }); sfx("tap", 0, 0.5); }
      if (m === "match" && (i === 5 || i === 20)) { await E(k => { const cs = [...document.querySelectorAll("#board .card:not(.done)")]; if (!cs.length) return; const w = cs[0]._c.w.h, pair = cs.filter(c => c._c.w.h === w); pair.forEach((c, j) => setTimeout(() => c.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })), j * 120)); }, i); sfx("flip", 0, 0.7); sfx("flip", 0.12, 0.7); }
    });
    await toMenu();
  }
  lap("小遊戲");

  // ===== 3 泡泡救援灣 =====
  await wipeIn();
  await E(() => { __promo.clear(".pill"); __promo.clear(".chap"); document.querySelector(".mode-card[data-mode=bubble]").click(); });
  await prep(() => !document.getElementById("bubblePick").classList.contains("hidden"));
  await E(() => document.querySelectorAll("#bubbleLevels .bb-lv")[6].click());
  await prep(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 6 && !document.getElementById("bubble").classList.contains("hidden"));
  await prep(null, null, 6);
  // 發射的泡泡是隨機的，不一定有「一發掉一大片」的打法 → 每種符號都試算，挑救最多的那顆放上去
  const best = await E(() => {
    const d = window.__zy.bubble.debug; let top = null;
    for (const s of ["ㄅ", "ㄆ", "ㄇ"]) { d.setQueue(s, s); const b = d.bestShot(); const sc = b ? b.rescued * 100 + b.dropped * 10 + b.popped : -1; if (!top || sc > top.sc) top = { s, b, sc }; }
    d.setQueue(top.s, top.s === "ㄅ" ? "ㄆ" : "ㄅ"); return top.b;
  });
  console.log("泡泡最佳一發", JSON.stringify(best));
  await wipeOut();
  await rec(170, async i => {   // 「全部救出」後 2.6 秒會進結算畫面：在那之前結束
    if (i === 0) { await E(() => __promo.cbig(2, "泡泡救援灣", "瞄準支撐點，一發救一大片")); sfx("pop"); }
    if (i === 30) await E(() => __promo.cbigOut());
    if (i === 38) await E(() => { __promo.clear(".cbig"); __promo.chap(2, "泡泡救援灣"); __promo.pill("🐧", "泡泡救援灣", "三顆一樣就破、救出小企鵝"); });
    if (i <= 40) await E(a => window.__zy.bubble.debug.aim(a), Math.PI / 2 + (best.angle - Math.PI / 2) * Math.min(1, i / 36));
    if (i === 46) { await E(() => window.__zy.bubble.debug.fire()); sfx("pop", 0, 0.9); }
    if (i === 70) sfx("win", 0, 0.8);
  });
  await E(() => __promo.clear()); await toMenu(); lap("泡泡");

  // ===== 4 天氣與日夜：▶▶ 快轉看一天（真實 30 分鐘＝小島一天） =====
  await wipeIn();
  const canLight = await has(() => !!(window.__zy.weatherFx && window.__zy.weatherFx.setLight));
  await E(() => { window.__hub3d.cam(1.02, 0, 0); window.__zy.setWeather("sunny"); });
  await prep(null, null, 6);
  await wipeOut();
  // 日夜曲線（0＝白天 → 黃昏 → 晚上 → 清晨 → 白天），搭配天氣
  const lightAt = u => {   // u：0–1
    const ramp = (a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
    const dusk = ramp(0.22, 0.34) * (1 - ramp(0.4, 0.5));
    const night = ramp(0.36, 0.48) * (1 - ramp(0.7, 0.8));
    const dawn = ramp(0.68, 0.76) * (1 - ramp(0.84, 0.92));
    const h = (8 + u * 24) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
    return { dusk, night, dawn, clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
  };
  const N4 = 240;
  await rec(N4, async i => {
    const u = i / N4, L = lightAt(u);
    await E(z => window.__hub3d.cam(z, 0, 0), 1.02 + i * 0.0004);
    if (i === 0) { await E(() => __promo.cbig(3, "天氣與日夜", "真實 30 分鐘＝小島一天")); sfx("pop"); }
    if (i === 30) await E(() => __promo.cbigOut());
    if (i === 38) await E(() => { __promo.clear(".cbig"); __promo.chap(3, "天氣與日夜"); });
    if (canLight) await E(([L]) => { window.__zy.weatherFx.setLight({ night: L.night, dusk: L.dusk, dawn: L.dawn }); document.body.classList.toggle("night", L.night > 0.5); }, [L]);
    else if (i === 100 || i === 190) await E(n => window.__zy.weatherFx && window.__zy.weatherFx.setNight(n), i === 100);
    if (i % 3 === 0 && i >= 40) await E(c => __promo.ff(c), L.clock);
    if (i === 40) sfx("whoosh", 0, 0.5);
    if (i === 40) { await E(() => { window.__zy.setWeather("rain"); __promo.pill("🌧️", "下雨了", "滴答滴答", true); }); }
    if (i === 78) await E(() => __promo.pill("🌇", "黃昏", "天空變橘色", true));
    if (i === 100) await E(() => window.__zy.setWeather("cloudy"));
    if (i === 112) await E(() => __promo.pill("🌙", "晚上", "路燈亮了、螢火蟲飛", true));
    if (i === 172) await E(() => __promo.pill("🌅", "清晨", "早安！", true));
    if (i === 196) { await E(() => { window.__zy.setWeather("sunny"); __promo.pill("☀️", "又是新的一天", "", true); }); sfx("sparkle", 0, 0.6); }
  });
  await E(() => { __promo.clear(); document.body.classList.remove("night"); if (window.__zy.weatherFx && window.__zy.weatherFx.setLight) window.__zy.weatherFx.setLight({ night: 0, dusk: 0, dawn: 0 }); else if (window.__zy.weatherFx) window.__zy.weatherFx.setNight(false, { instant: true }); });
  lap("天氣日夜");

  // ===== 5 海洋與新市區：小魚跳出水面、海鷗飛過 → 鏡頭飛過橋，消防車、警車出動 =====
  await wipeIn();
  const canOcean = await has(() => !!(window.__zy.oceanFx && window.__zy.oceanFx.jump));
  await E(() => window.__hub3d.focus("fish", 1.75)); await prep(null, null, 6);
  await wipeOut();
  await rec(230, async i => {
    if (i < 80) await E(z => window.__hub3d.focus("fish", z), 1.75 + i * 0.003);
    if (i === 0) { await E(() => __promo.cbig(4, "海洋與新市區", "小魚、海鷗、消防車")); sfx("pop"); }
    if (i === 30) await E(() => __promo.cbigOut());
    if (i === 38) await E(() => { __promo.clear(".cbig"); __promo.chap(4, "海洋與新市區"); __promo.pill("🐟", "海裡有小魚", "海鷗在天上飛", true); });
    if (canOcean && (i === 24 || i === 52)) { await E(() => window.__zy.oceanFx.jump()); sfx("pop", 0.5, 0.5); }
    if (i === 82) { await E(() => { __promo.clear(".pill"); window.__hub3d.goPlace("town"); }); sfx("whoosh", 0, 0.7); }
    if (i === 130) { await E(() => window.__hub3d.tapCivic("police")); }
    if (i === 140) { await E(() => window.__hub3d.tapCivic("fire")); }
    if (i === 146) { await E(() => __promo.banner("警察局・消防局・醫院・學校", "收集貼紙，小鎮越蓋越大")); sfx("pop", 0, 0.8); }
    if (i === 216) await E(() => __promo.bannerOut());
  });
  await E(() => { __promo.clear(); window.__hub3d.goPlace("main"); }); lap("海洋新市區");

  // ===== 6 扭蛋機：星星換扭蛋幣 → 轉一轉 → 膠囊 → 點蛋孵出新朋友 =====
  await wipeIn();
  await prep(null, null, 6);
  await E(() => document.querySelector("#menu .jarBtn").click());
  await prep(() => !document.getElementById("gacha").classList.contains("hidden"));
  await wipeOut();
  await rec(200, async i => {
    if (i === 0) { await E(() => __promo.cbig(5, "扭蛋機", "收集 28 隻動物朋友")); sfx("pop"); }
    if (i === 26) await E(() => __promo.cbigOut());
    if (i === 32) await E(() => { __promo.clear(".cbig"); __promo.chap(5, "扭蛋機・動物朋友"); });
    if (i === 6) { await E(() => document.getElementById("gachaGo").click()); sfx("select"); }
    if (i === 56) { await E(() => document.getElementById("gachaCap").click()); sfx("pop"); }
    if (i === 84 || i === 104 || i === 124) { await E(() => { const e = document.getElementById("hatchEgg"); e && e.click(); }); sfx("tap", 0, 0.8); }
    if (i === 128) sfx("win");
    if (i === 132) await E(() => __promo.pill("🐣", "28 隻動物朋友", "點心餵牠，從寶寶長大", true));
  });
  await E(() => { __promo.clear(); document.getElementById("hatchClose")?.click(); document.getElementById("gacha").classList.add("hidden"); });
  lap("扭蛋");

  // ===== 7 即將推出（阿葉 10-11：「未來概念」＝預告之後的新內容） =====
  await wipeIn();
  await E(() => __promo.soon([["pets/bunny", "寵物換裝"], ["cust_penguin", "更多泡泡關卡"], ["em:🏝️", "新的小島"]]));
  await prep(null, null, 2);
  await wipeOut();
  await rec(140, async i => {
    if (i === 0) sfx("pop", 0, 0.8);
    if (i === 8 || i === 15 || i === 22) sfx("flip", 0, 0.8);
    if (i === 70) { await E(() => __promo.stamp("敬請期待！")); sfx("thump"); sfx("sparkle", 0.1, 0.6); }
  });
  lap("即將推出");

  // ===== 8 片尾卡 =====
  await wipeIn();
  await E(() => __promo.end()); await prep(null, null, 2);
  await wipeOut();
  await rec(110, async i => { if (i === 0) { sfx("pop", 0.3, 0.8); sfx("sparkle", 0.6, 0.7); } });
  lap("片尾");
  await browser.close();
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));
  console.log("功能：日夜光線", canLight ? "新版" : "舊版退回", "／海洋外掛", canOcean ? "有" : "沒有");

  // ===== 合成：30fps 影格＋背景音樂（淡入淡出）＋音效 =====
  const dur = F / FPS, bgm = path.join(ROOT, "music", "zy_bgm_island.mp3"), SD = path.join(FR, "sfx");
  fs.mkdirSync(SD, { recursive: true });
  const synth = (name, filter, d) => { const out = path.join(SD, name + ".wav"); const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-t", String(d), out], { encoding: "utf8" }); if (r.status !== 0) throw new Error("合成音效失敗 " + name + r.stderr); return out; };
  const FILES = {
    whoosh: synth("whoosh", "anoisesrc=d=0.5:c=pink:r=44100:a=0.7,highpass=f=500,lowpass=f=5000,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.3", 0.5),
    thump: synth("thump", "sine=f=80:r=44100:d=0.35,volume=2.2,afade=t=out:st=0.05:d=0.3", 0.35),
    pop: path.join(ROOT, "music", "zy_pop.mp3"), ok: path.join(ROOT, "music", "zy_ok.mp3"), win: path.join(ROOT, "music", "zy_win.mp3"), sparkle: path.join(ROOT, "music", "zy_sticker.mp3"),
    select: path.join(ROOT, "music", "zy_select.mp3"), flip: path.join(ROOT, "music", "zy_flip.mp3"), tap: path.join(ROOT, "music", "zy_tap.mp3"),
  };
  const used = [...new Set(SFX.map(s => s.k))].filter(k => FILES[k] && fs.existsSync(FILES[k]));
  const args = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FR, "f%05d.jpg"), "-stream_loop", "-1", "-i", bgm];
  used.forEach(k => args.push("-i", FILES[k]));
  const fc = [`[1:a]afade=t=in:st=0:d=1,afade=t=out:st=${(dur - 2).toFixed(2)}:d=2,volume=0.75[bg]`]; const mixIn = ["[bg]"];
  used.forEach((k, ui) => {
    const ev = SFX.filter(s => s.k === k && s.t < dur - 0.2); if (!ev.length) return;
    const labs = ev.map((_, j) => `[${k}${j}]`).join("");
    fc.push(`[${ui + 2}:a]aresample=44100,asplit=${ev.length}${labs}`);
    ev.forEach((s, j) => { const ms = Math.max(0, Math.round(s.t * 1000)); fc.push(`[${k}${j}]adelay=${ms}|${ms},volume=${(s.vol * 0.9).toFixed(2)}[${k}e${j}]`); mixIn.push(`[${k}e${j}]`); });
  });
  fc.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:duration=first:normalize=0,alimiter=limit=0.95[a]`);
  args.push("-filter_complex", fc.join(";"), "-map", "0:v", "-map", "[a]", "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", OUTMP4);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) { console.error("ffmpeg 失敗", r.stderr.slice(0, 2000)); process.exit(1); }
  console.log(`完成：${OUTMP4}（${F} 格、${dur.toFixed(1)} 秒、音效 ${SFX.length} 個）`);
  if (!process.argv.includes("--keep")) fs.rmSync(FR, { recursive: true, force: true });
})().catch(e => { console.error("FATAL", e.stack || e.message); process.exit(1); });
