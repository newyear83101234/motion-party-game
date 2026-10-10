// 驗收 js/zhuyin-voice.js：headless Chromium 開 tools/voice/voice-test.html，真的解碼＋播放，檢查 onEnd、拆句、打斷、退回、__spoken 紀錄。
// 用法：node tools/voice/test_voice_module.js   （需要 http://127.0.0.1:8765 在專案根目錄開著）
const path = require("path");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const fs = require("fs");
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.VT_URL || "http://127.0.0.1:8765/tools/voice/voice-test.html";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const p = await browser.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + " " + m.text().slice(0, 200)); });
  p.on("response", r => { if (r.status() >= 400) errs.push("HTTP " + r.status() + " " + r.url()); });
  await p.addInitScript(() => { window.__spoken = []; });
  await p.goto(URL); await p.evaluate(() => window.V ? V.voiceReady : new Promise(r => setTimeout(r, 1500)));
  await p.waitForFunction(() => window.V); await p.evaluate(() => V.voiceReady);
  const man = await p.evaluate(() => fetch("../../voice/gemini_d/manifest.json").then(r => r.json()));
  console.log("manifest 句數", Object.keys(man.files).length);

  // 1. 還沒解鎖：回傳 false（呼叫端會退回 speechSynthesis）
  check(await p.evaluate(() => V.voiceSay("好棒！")) === false, "解鎖前 voiceSay 回傳 false");
  await p.click("#unlock");
  check(await p.evaluate(() => V.voiceSay("這句不存在的話") === false), "沒有音檔的句子回傳 false");

  // 2. 播幾句：回傳 true、onEnd 有回呼、播放時間≈音檔長度（證明真的解碼＋播完，不是保險計時器收尾）
  const say = (text) => p.evaluate(text => new Promise(res => {
    const t0 = performance.now(); let r = null;
    r = V.voiceSay(text, { onEnd: () => res({ r, ms: Math.round(performance.now() - t0), speakingAfter: V.voiceSpeaking() }) });
    if (!r) res({ r, ms: 0 });
    setTimeout(() => res({ r, ms: -1, timeout: true }), 12000);
  }), text);
  // 冷啟動（沒預載、要現抓現解碼）：onEnd 一定會來，時間＝下載解碼＋音長，給寬一點
  { const d = man.durations[man.files["你好！快來選遊戲玩吧！"]]; const r = await say("你好！快來選遊戲玩吧！");
    check(r.r === true && r.ms > d * 1000 - 100 && r.ms < d * 1000 + 2500, `冷啟動「你好！快來選遊戲玩吧！」onEnd ${r.ms}ms（音檔 ${d}s）`); }
  const list = ["聽聲音，點對的魚！", "好棒！", "你好會拼喔！", "蝸牛", "拿到 3 張新貼紙！", "我要蘋果", "小熊，歡迎回來！"];
  await p.evaluate(l => V.voicePreload(l), list);   // 先預載，下面量的是純播放時間
  for (const text of list) {
    const f = man.files[text]; const d = man.durations[f];
    const r = await say(text);
    check(r.r === true && r.ms > 0 && Math.abs(r.ms / 1000 - d) < 0.6 && r.speakingAfter === false,
      `「${text}」回傳 ${r.r}、onEnd ${r.ms}ms（音檔 ${d}s）`);
  }
  // 3. 拆句：「找到了，紅色的蘋果」＝「找到了！」＋「紅色的蘋果」
  { const d = man.durations[man.files["找到了！"]] + man.durations[man.files["紅色的蘋果"]] + 0.12;
    const r = await say("找到了，紅色的蘋果");
    check(r.r === true && Math.abs(r.ms / 1000 - d) < 0.7, `拆句「找到了，紅色的蘋果」onEnd ${r.ms}ms（預期約 ${d.toFixed(2)}s）`); }
  // 4. 打斷：播第二句時，第一句的 onEnd 要被呼叫；voiceStop 也會呼叫 onEnd
  const intr = await p.evaluate(() => new Promise(res => {
    const log = [];
    V.voiceSay("聽聲音，點對的魚！", { onEnd: () => log.push("first-end") });
    setTimeout(() => { V.voiceSay("好棒！", { onEnd: () => { log.push("second-end"); res(log); } }); log.push("second-start"); }, 300);
  }));
  check(intr.join(",") === "first-end,second-start,second-end", "打斷順序：" + intr.join(" → "));
  const stop = await p.evaluate(() => new Promise(res => {
    let ended = false; V.voiceSay("你好！快來選遊戲玩吧！", { onEnd: () => { ended = true; } });
    setTimeout(() => { const sp = V.voiceSpeaking(); V.voiceStop(); res({ sp, ended, after: V.voiceSpeaking() }); }, 400);
  }));
  check(stop.sp === true && stop.ended === true && stop.after === false, "voiceStop：播放中 speaking=true，停止後呼叫 onEnd、speaking=false");
  // 5. 預載
  const pre = await p.evaluate(() => { const before = V.voiceStats.decoded; return V.voicePreload(["老虎", "長頸鹿", "企鵝", "不存在"]).then(() => V.voiceStats.decoded - before); });
  check(pre === 3, "voicePreload 解碼 3 句（不存在的略過）：" + pre);
  // 6. __spoken 紀錄格式
  const sp = await p.evaluate(() => window.__spoken);
  check(sp.length >= 9 && sp.every(x => typeof x.t === "number" && typeof x.text === "string") && sp.some(x => x.text === "找到了，紅色的蘋果"),
    `__spoken 紀錄 ${sp.length} 筆，格式 {t,text}，拆句記原字串`);
  const st = await p.evaluate(() => V.voiceStats);
  console.log("stats", JSON.stringify(st));
  check(st.failed === 0 && st.timeouts === 0, "沒有解碼失敗、沒有靠保險計時器收尾");
  // 7. manifest 每個檔都抓得到、解得開
  const all = await p.evaluate(async () => {
    const m = await fetch("../../voice/gemini_d/manifest.json").then(r => r.json());
    const ctx = new AudioContext(); const bad = []; let n = 0;
    for (const [t, f] of Object.entries(m.files)) {
      try { const ab = await fetch("../../voice/gemini_d/" + f).then(r => r.arrayBuffer()); const b = await ctx.decodeAudioData(ab); if (!(b.duration > 0.1)) bad.push(t); n++; }
      catch (e) { bad.push(t + "：" + e.message); }
    }
    return { n, bad };
  });
  check(all.bad.length === 0, `manifest 全部 ${all.n} 句都能解碼（失敗 ${all.bad.length}）` + (all.bad.length ? "：" + all.bad.slice(0, 5).join("、") : ""));
  check(errs.length === 0, "頁面沒有錯誤／警告" + (errs.length ? "：" + errs.slice(0, 5).join(" | ") : ""));
  await browser.close();
  console.log(fails ? `\n${fails} 項失敗` : "\n全部通過");
  process.exit(fails ? 1 : 0);
})();
