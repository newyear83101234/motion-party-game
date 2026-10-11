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
async function launch() { return chromium.launch({ headless: true, executablePath: findShell() }); }
// 開一頁、清存檔、塞進度（n 張貼紙＝詞庫前 n 個詞）、聽過全部開場語
async function openGame(browser, { w = 1180, h = 820, stickers = 20, stars = 0, eggs = 0, query = "", fakeSpeech = true } = {}) {
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
  await p.evaluate(({ stickers, stars, eggs }) => {
    localStorage.clear();
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, stickers).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", String(stars)); localStorage.setItem("zy1_eggs", String(eggs));
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1 }));
    });
  }, { stickers, stars, eggs });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });   // 開始畫面
  await p.waitForTimeout(300);
  if (fakeSpeech) await p.evaluate(() => { window.__spoken = []; });   // 開始畫面的招呼語不算在測試裡
  return { ctx, p, errs };
}
// 從選單進某個模式（翻牌會先跳選張數，size 指定）
async function enterMode(p, m, size) {
  await p.evaluate(() => { for (const id of ["confirm", "players", "matchPick", "settings"]) document.getElementById(id)?.classList.add("hidden"); });
  if (await p.evaluate(() => document.getElementById("menu").classList.contains("hidden"))) {
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click(); }); await p.waitForTimeout(300);
  }
  await p.evaluate(mm => { window.__spoken && (window.__spoken = []); document.querySelector(`.mode-card[data-mode=${mm}]`).click(); }, m);
  if (m === "match") { await p.waitForTimeout(200); await p.evaluate(n => { const b = [...document.querySelectorAll("#matchSizes .msize")].find(x => x.textContent.includes(String(n))); (b || document.querySelector("#matchSizes .msize")).click(); }, size || 8); }
  await p.waitForFunction(mm => !document.getElementById(mm).classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), m, { timeout: 15000 });
  await p.waitForTimeout(500);
}
// 選單上方的家長按鈕（左＝🏠🎵、右＝🐻換人⚙️）平常收在「⋯」把手裡（10-11）：要量它們、用滑鼠點它們之前先展開（已展開就不動）
async function hudOpen(p, side) {
  await p.evaluate(s => { const b = document.getElementById("hud" + s); if (b && !b.classList.contains("open")) document.getElementById("hud" + s + "Btn").click(); }, side);
  await p.waitForTimeout(300);   // 淡入 0.2 秒
}
module.exports = { launch, openGame, enterMode, hudOpen, URL, STICK20 };
