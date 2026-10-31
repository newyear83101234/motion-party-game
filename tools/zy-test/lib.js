// 注音小島測試共用：獨立 headless Chromium（不碰共用瀏覽器）
// 需要：全域安裝的 @playwright/mcp（內含 playwright）＋ ms-playwright 的 chromium_headless_shell
const path = require("path");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const fs = require("fs");
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.ZY_URL || "http://127.0.0.1:8765/zhuyin.html";
const STICK20 = ["貓","狗","魚","鳥","牛","馬","羊","豬","雞","鴨","兔子","老虎","獅子","大象","猴子","熊","蛇","青蛙","蝴蝶","蜜蜂"];
// 10-31 測試改用顯示卡畫 3D：headless 預設是 CPU 軟體算圖（SwiftShader，每秒約 20 格），改走 d3d11 顯示卡約 56 格、開頁快一倍，截圖一樣正常。
// 只在「tools/zy-test 裡的測試」且呼叫端沒指定算圖方式時加（宣傳片逐格錄製、dress.js 指定 swiftshader、render3d 出美術圖都不動）；
// ZY_GPU=0 退回軟體算圖（顯示卡驅動出問題、或要跟舊截圖比對時），ZY_GPU=1 讓非測試腳本也用顯示卡
const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];
const IS_TEST = !!(require.main && /[\\/]zy-test[\\/]/.test(require.main.filename));
async function launch(args = []) {   // args：宣傳片用 --enable-begin-frame-control 等
  const pick = args.some(a => /^--(use-angle|use-gl|enable-begin-frame-control)\b/.test(a)) ? false : process.env.ZY_GPU ? process.env.ZY_GPU === "1" : IS_TEST;
  return chromium.launch({ headless: true, executablePath: findShell(), args: pick ? [...args, ...GPU_ARGS] : args });
}
// 開一頁、清存檔、塞進度（n 張貼紙＝詞庫前 n 個詞）、聽過全部開場語
// homeHi：我的家第一天的「這是你的家！」算聽過（10-31：不然它會在貓頭鷹沒講話時插進來，蓋掉測試要看的台詞；要測新存檔的我的家傳 false）
async function openGame(browser, { w = 1180, h = 820, stickers = 20, stars = 0, eggs = 0, query = "", fakeSpeech = true, homeHi = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  if (fakeSpeech) await ctx.addInitScript(() => {
    window.__spoken = [];
    const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null,
      speak(u) { if (u.text.trim()) window.__spoken.push({ t: Math.round(performance.now()), text: u.text }); setTimeout(() => { u.onend && u.onend(); }, 250); } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL + (query ? "?" + query : "")); await p.waitForTimeout(300);
  await p.evaluate(({ stickers, stars, eggs, homeHi }) => {
    localStorage.clear();
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, stickers).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", String(stars)); localStorage.setItem("zy1_eggs", String(eggs));
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1 }));
      if (homeHi) localStorage.setItem("zy1_home", JSON.stringify({ base: stars, hi: 1 }));   // base＝現在的星星＝今天開工（不會一開就播升級演出）
    });
  }, { stickers, stars, eggs, homeHi });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });   // 開始畫面
  await p.waitForTimeout(300);
  if (fakeSpeech) await p.evaluate(() => { window.__spoken = []; });   // 開始畫面的招呼語不算在測試裡
  return { ctx, p, errs };
}
// 從選單進某個模式。v6 起每個遊戲有難度等級 Lv1–5：測試預設一律玩 Lv1（＝原本的玩法；前面拿 3 星升級了也拉回 1），
// opt 可以是數字（翻牌張數 8/12/16/20/24 → 對應 Lv1–5，原本的「選張數」畫面已經拿掉）或 { size, lv }
async function enterMode(p, m, opt) {
  const o = typeof opt === "object" && opt ? opt : { size: opt };
  const lv = o.lv || (m === "match" && o.size ? Math.max(1, Math.min(5, (o.size / 2 - 2) / 2)) : 1);
  await p.evaluate(() => { for (const id of ["confirm", "players", "matchPick", "settings", "lvUp"]) document.getElementById(id)?.classList.add("hidden"); });
  if (await p.evaluate(() => document.getElementById("menu").classList.contains("hidden"))) {
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click(); }); await p.waitForTimeout(300);
  }
  await p.evaluate(([mm, l]) => { if (window.__zy && window.__zy.setLv) window.__zy.setLv(mm, l); }, [m, lv]);
  await p.evaluate(mm => { window.__spoken && (window.__spoken = []); document.querySelector(`.mode-card[data-mode=${mm}]`).click(); }, m);
  await p.waitForFunction(mm => !document.getElementById(mm).classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), m, { timeout: 15000 });
  await p.waitForTimeout(500);
}
// 選單上方的家長按鈕（左＝🏠🎵、右＝🐻換人⚙️）平常收在「⋯」把手裡（10-11）：要量它們、用滑鼠點它們之前先展開（已展開就不動）
async function hudOpen(p, side) {
  await p.evaluate(s => { const b = document.getElementById("hud" + s); if (b && !b.classList.contains("open")) document.getElementById("hud" + s + "Btn").click(); }, side);
  await p.waitForTimeout(300);   // 淡入 0.2 秒
}
module.exports = { launch, openGame, enterMode, hudOpen, URL, STICK20 };
