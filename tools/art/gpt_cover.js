// ChatGPT 網頁生圖（常駐 Chrome 9222）：node gpt.js <jobs.json> [對話網址]
// jobs.json：[{ id, prompt, ref? }]；一個對話依序生，圖存 gpt/<id>.png；自己開新視窗、只關自己開的分頁
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const OUT = path.join(__dirname, "gpt"); fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(__dirname, "gpt.log");
const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + " " + a.join(" "); console.log(s); fs.appendFileSync(LOG, s + "\n"); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IMG_SEL = 'img[alt^="已產生圖像"], img[alt^="Generated image"], img[alt^="已生成"], img[alt*="產生的圖"]';

const ED = '[contenteditable=true][aria-label], #prompt-textarea';
async function genCount(p) {   // 新版 DOM（11-01）：生成圖＝正方形、≥512 的 img；停止鈕看 aria-label
  return p.evaluate(() => { const ims = [...document.querySelectorAll("main img, img")].filter(i => i.naturalWidth >= 512 && Math.abs(i.naturalWidth - i.naturalHeight) < 8 && !/blur/.test(getComputedStyle(i).filter));
    const srcs = [...new Set(ims.map(i => i.src))]; const last = ims[ims.length - 1];
    return { n: srcs.length, last: srcs[srcs.length - 1] || null, alt: last ? (last.alt || "").slice(0, 40) : "", stop: !![...document.querySelectorAll("button")].find(b => /停止|Stop/i.test(b.getAttribute("aria-label") || "") || b.getAttribute("data-testid") === "stop-button") }; });
}
async function upload(p, file) {
  if (!fs.existsSync(file)) throw new Error("參考圖不存在 " + file);
  const inputs = await p.$$('input[type="file"]');
  let pick = null;
  for (const h of inputs) { const acc = (await h.getAttribute("accept")) || ""; if (acc === "image/*") { pick = h; break; } }
  pick = pick || inputs[0]; if (!pick) throw new Error("找不到上傳欄");
  await pick.setInputFiles(file); await sleep(6000);
}
async function typeSend(p, text) {
  await p.click(ED); await p.keyboard.insertText(text); await sleep(800);
  const SEND = 'button[aria-label="傳送"], #composer-submit-button, button[data-testid="send-button"]';
  for (let i = 0; i < 60; i++) { const ok = await p.evaluate(sel => { const b = document.querySelector(sel); return b && !b.disabled && b.getAttribute("aria-disabled") !== "true"; }, SEND); if (ok) break; await sleep(1000); }
  await p.click(SEND);
}
async function waitImage(p, n0, convUrl) {
  const t0 = Date.now(); let lastReload = Date.now(), prev = null;
  while (Date.now() - t0 < 7 * 60000) {
    await sleep(8000);
    let c; try { c = await genCount(p); } catch (e) { c = { n: 0 }; }
    if (c.n > n0 && !c.stop) { if (c.last === prev) { log("  圖 alt：", c.alt); return c.last; } prev = c.last; continue; }
    if (Date.now() - lastReload > 70000) {   // 背景分頁不一定會更新畫面：定時重新整理拿伺服器的結果
      lastReload = Date.now(); const u = convUrl() || p.url();
      if (/\/c\/local/.test(u)) { log("  對話網址還是暫時的，先不重新整理"); continue; }
      log("  重新整理", u.replace(/\/c\/(.{8}).*/, "/c/$1…")); try { await p.goto(u, { waitUntil: "domcontentloaded", timeout: 60000 }); } catch (e) { log("  goto 失敗", e.message.slice(0, 80)); }
      await sleep(5000);
    }
  }
  return null;
}
async function grab(p, src, file) {
  const b64 = await p.evaluate(async src => { const r = await fetch(src, { credentials: "include" }); const b = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }, src);
  fs.writeFileSync(file, Buffer.from(b64, "base64")); return fs.statSync(file).size;
}
async function rename(p, title) {
  const id = (p.url().match(/\/c\/([\w-]+)/) || [])[1]; if (!id) return "no-id";
  return p.evaluate(async ([id, title]) => { try { const s = await (await fetch("/api/auth/session")).json(); const r = await fetch("/backend-api/conversation/" + id, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.accessToken }, body: JSON.stringify({ title }) }); return r.status; } catch (e) { return "err " + e.message; } }, [id, title]);
}

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); let conv = process.argv[3] || null;
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const cdp = await browser.newBrowserCDPSession();
  const before = new Set(ctx.pages());
  await cdp.send("Target.createTarget", { url: "about:blank", newWindow: true });
  let p = null; for (let i = 0; i < 30 && !p; i++) { await sleep(300); p = ctx.pages().find(x => !before.has(x)) || null; }
  if (!p) throw new Error("開不出自己的分頁");
  try {
    await p.goto(conv || "https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForSelector(ED, { timeout: 60000 }); await sleep(2500);
    if (await p.$('[data-testid="login-button"]')) throw new Error("ChatGPT 沒登入");
    let first = !conv;
    for (const j of jobs) {
      const file = path.join(OUT, j.id + ".png");
      if (fs.existsSync(file) && !j.force) { log(j.id, "已存在，跳過"); continue; }
      const n0 = (await genCount(p)).n;
      if (process.env.GRAB_FIRST && j === jobs[0] && n0 > 0) { const c = await genCount(p); await sleep(1500); const sz = await grab(p, c.last, file); log(j.id, "對話裡已有圖，直接抓", sz, "bytes"); continue; }
      if (j.ref) { log(j.id, "上傳參考圖"); await upload(p, j.ref); }
      await typeSend(p, j.prompt); log(j.id, "已送出，等圖…");
      const real = u => /\/c\/(?!local)[\w-]{20,}/.test(u);
      for (let i = 0; i < 45 && !real(p.url()); i++) await sleep(1000);
      if (real(p.url())) conv = p.url(); else log("  還沒拿到正式對話網址：", p.url().slice(0, 40));
      if (first && conv) { await sleep(3000); log("  改名", await rename(p, "克勞德-GAME")); first = false; }
      const src = await waitImage(p, n0, () => conv);
      if (!src) { log(j.id, "逾時沒拿到圖"); continue; }
      await sleep(2000);
      const sz = await grab(p, src, file); log(j.id, "存檔", sz, "bytes");
    }
    log("對話", conv ? conv.replace(/\/c\/(.{8}).*/, "/c/$1…") : "?");
    fs.writeFileSync(path.join(__dirname, "gpt-conv-" + path.basename(process.argv[2]) + ".txt"), conv || "");
  } finally {
    await p.close().catch(() => {});
  }
  process.exit(0);   // 不呼叫 browser.close()：只斷線離開，不碰共用瀏覽器的其他分頁
  {
  }
})().catch(e => { log("FATAL", e.message); process.exit(1); });
