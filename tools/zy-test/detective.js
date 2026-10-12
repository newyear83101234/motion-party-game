// 詞句小偵探（js/zhuyin-detective.js）測試：node tools/zy-test/detective.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 DT_SHOTS（預設 %TEMP%\zy-detective）。
// 實驗頁用 ?fake=1 假語音：照主程式 say() 的行為（開口前先停前一句），記錄每段話的開始／被打斷／講完（window.__dt.V.log）。
// （2026-10-12 題庫 2→13 題（≥5）：一回合依實際題數 N 跑；星星規則 全題庫＝原規則、?bank=2 只剩 2 題＝最多 1★）
// 驗：①題庫規則（3 選項、say＝正確、長度相近、念起來三個都不一樣、讀音表、關鍵字、隨機位置、星星規則）
//     ②一回合自動通關（真的點擊）：onWin 參數（全對 3★／錯 1 題 2★／錯 2 題 1★）、5 題回合
//     ③快速連點不重複計分、答對後不能改答案 ④重聽：不換題、不洗牌、不疊播（隔 0.35 秒按 5 次只有最後一段在播）、300ms 內連點只算一次、沒有 stopVoice 也一樣
//     ⑤答錯：不公布答案、不自動重念題目、說「按喇叭，再聽一次喔！」、講完 🔊 閃＋手指點 🔊（每答錯一次再來）、剩下的卡把不一樣的那段用中性色框起來（每張都框）、可以再選
//     ⑥stop()：語音停、5 秒內沒有任何延遲回呼／語音／音效
//     ⑪換題（10-12 里維必修）：答對後 0.15 秒／下一題鈕一出來就按 → 5 秒內新題卡片沒有任何差異底線／黃底／重念、沒有舊句子的語音
//     ⑦暫停：不收點擊、教學句被「暫停」打斷後繼續會念題目；家長關掉說明語音也照樣出題
//     ⑧四種尺寸版面＋截圖＋字級（國字 px／注音 px）、轉向 relayout ⑨國字都有注音 ⑩0 個 console error
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/detective-lab.html";
const SHOTS = process.env.DT_SHOTS || path.join(os.tmpdir(), "zy-detective");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !info ? "" : "  — " + info}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];

async function open(browser, w, h, q = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push(`[${w}x${h}] PAGEERR ${e.message}`); });
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 200)); allErrs.push(`[${w}x${h}] CONSOLE ${m.text().slice(0, 200)}`); } });
  await p.goto(LAB + "?fake=1&mute=1&clean=1" + (q ? "&" + q : ""));
  await p.waitForFunction(() => window.__dt && window.__dt.ready, null, { timeout: 15000 });
  return { ctx, p, errs };
}
const S = p => p.evaluate(() => window.__dt.game.state());
const waitPhase = (p, ph, t = 15000) => p.waitForFunction(ph => { const s = window.__dt.game.state(); return s && s.phase === ph; }, ph, { timeout: t, polling: 20 });
const waitQuiet = (p, t = 15000) => p.waitForFunction(() => !window.__dt.V.cur, null, { timeout: t, polling: 20 });   // 沒有人在講話
async function fresh(p, opts = {}) {   // 重新開始一回合、等到可以作答（題目句講完）
  await p.evaluate(o => { const d = window.__dt; d.calls.say.length = d.calls.talk.length = d.calls.play.length = d.calls.win.length = 0; d.calls.stop = 0; d.game.start(o); }, opts);
  await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
}
const card = i => `.dt-card[data-i="${i}"]`;
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
async function answer(p, wrongFirst) {   // 用真的點擊答一題（wrongFirst＝先點錯幾張）
  const s = await S(p); const wrongs = [0, 1, 2].filter(i => i !== s.answer).slice(0, wrongFirst);
  for (const i of wrongs) { await p.click(card(i)); await sleep(720); }
  await p.click(card(s.answer));
  await p.waitForFunction(() => window.__dt.game.state().nextShown, null, { timeout: 8000, polling: 20 });
}

(async () => {
  const browser = await launch();

  // ===== ① 題庫 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4");
    const r = await p.evaluate(async () => {
      const m = window.__dt.mod, { readRun, missing } = await import("/js/zhuyin-ann.js?v=6");
      const read = s => readRun(s.replace(/[^㐀-鿿]/g, "")).join(" ");
      const same = [], nulls = [];
      for (const q of m.BANK) { const rs = q.options.map(read); if (new Set(rs).size !== q.options.length) same.push(q.id); q.options.forEach(o => { if (readRun(o).some(x => !x)) nulls.push(o); }); }
      const en = m.BANK.filter(q => q.enabled), dr = m.BANK.filter(q => !q.enabled);
      const reads = Object.fromEntries(en.flatMap(q => q.options).map(o => [o, read(o)]));
      const keys = Object.fromEntries(m.BANK.map(q => [q.id, m.keysOf(q)[0].join(",")]));
      // 400 個種子（等級 1–4 輪流，Lv1–2 取 3 張卡、Lv3–4 取 4 張卡）：每題的正確答案在前三個位置都出現過、題目順序兩種都出現過
      const pos = {}, firsts = new Set();
      for (let s = 1; s <= 400; s++) { const rd = m.pickRound(m.BANK, m.ROUND_N, m.rng(s), { lv: 1 + (s % 4) }); firsts.add(rd[0].id); rd.forEach(q => { (pos[q.id] = pos[q.id] || new Set()).add(q.order.indexOf(0)); }); }
      const all5 = m.pickRound(m.BANK.map(q => ({ ...q, enabled: true })), m.ROUND_N, m.rng(3));
      const st = [m.starsFor(2, 2), m.starsFor(1, 2), m.starsFor(0, 2), m.starsFor(5, 5), m.starsFor(4, 5), m.starsFor(3, 5), m.starsFor(0, 5), m.starsFor(4, 4)].join("");
      const lens = m.BANK.map(q => q.options.map(o => [...o].length)).map(a => Math.max(...a) - Math.min(...a));
      return { bankN: m.BANK.length, bad: m.checkBank(m.BANK), en: en.map(q => q.id), drafts: dr.length, draftOff: dr.every(q => q.enabled === false), same, nulls, reads, keys,
        pos: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, [...v].sort().join("")])), firsts: [...firsts].sort().join(), all5: all5.length, all5uniq: new Set(all5.map(q => q.id)).size, st, maxLenDiff: Math.max(...lens), missing: [...missing] };
    });
    ok("題庫：checkBank 沒有問題（3 個選項、say＝正確選項、不只差標點、長度差 ≤1、每個錯誤選項都有差異字、有寫 enabled）", r.bad.length === 0 && r.maxLenDiff <= 1, JSON.stringify(r.bad));
    ok("題庫：全部啟用（≥5 題，現為 14 歌詞題＋30 生活句；含 smile、eyes）、id 不重複、沒有草稿", r.en.length >= 5 && r.en.length === r.bankN && new Set(r.en).size === r.en.length && r.en.includes("smile") && r.en.includes("eyes") && r.drafts === 0, JSON.stringify({ en: r.en, drafts: r.drafts }));
    ok("題庫：每題所有選項（3～6 個）念起來都不一樣（注音字典比對，含草稿）、沒有查不到讀音的字", r.same.length === 0 && r.nulls.length === 0 && r.missing.length === 0, JSON.stringify(r));
    const WANT = {
      "你笑起來真好看": "ㄋㄧˇ ㄒㄧㄠˋ ㄑㄧˇ ㄌㄞˊ ㄓㄣ ㄏㄠˇ ㄎㄢˋ", "你看起來真好笑": "ㄋㄧˇ ㄎㄢˋ ㄑㄧˇ ㄌㄞˊ ㄓㄣ ㄏㄠˇ ㄒㄧㄠˋ", "你笑起來真好笑": "ㄋㄧˇ ㄒㄧㄠˋ ㄑㄧˇ ㄌㄞˊ ㄓㄣ ㄏㄠˇ ㄒㄧㄠˋ",
      "你看著我的眼睛說": "ㄋㄧˇ ㄎㄢˋ ㄓㄜ˙ ㄨㄛˇ ㄉㄜ˙ ㄧㄢˇ ㄐㄧㄥ ㄕㄨㄛ", "你看著我的眼睛唱": "ㄋㄧˇ ㄎㄢˋ ㄓㄜ˙ ㄨㄛˇ ㄉㄜ˙ ㄧㄢˇ ㄐㄧㄥ ㄔㄤˋ", "你看著我的眼神說": "ㄋㄧˇ ㄎㄢˋ ㄓㄜ˙ ㄨㄛˇ ㄉㄜ˙ ㄧㄢˇ ㄕㄣˊ ㄕㄨㄛ",
    };
    const wrongRead = Object.keys(WANT).filter(k => r.reads[k] !== WANT[k]).map(k => `${k}=${r.reads[k]}`);
    ok("讀音：兩題 6 個選項逐字對（看著＝ㄎㄢˋ ㄓㄜ˙、好看＝ㄏㄠˇ ㄎㄢˋ、好笑＝ㄏㄠˇ ㄒㄧㄠˋ、看起來＝ㄎㄢˋ ㄑㄧˇ ㄌㄞˊ）", wrongRead.length === 0, wrongRead.join(" | "));
    console.log("\n讀音表（啟用的題目）：\n" + Object.entries(r.reads).map(([k, v]) => `  ${k}　${v}`).join("\n"));
    ok("關鍵字（自動算差異）：smile＝笑、看（位置 1、6）；eyes＝睛、說（位置 6、7）", r.keys.smile === "1,6" && r.keys.eyes === "6,7", JSON.stringify(r.keys));
    ok("隨機：400 個種子（等級 1–4）裡，每題正確答案在前三個位置都出現過、第一題不固定（≥8 種不同的題當開場）", Object.keys(r.pos).length === r.bankN && Object.values(r.pos).every(v => v.startsWith("012")) && r.firsts.split(",").length >= 8, JSON.stringify({ pos: r.pos, firsts: r.firsts }));
    ok("回合：題庫夠的時候一回合 5 題、不重複", r.all5 === 5 && r.all5uniq === 5, JSON.stringify(r));
    ok("星星：5 題回合 全對 3★、錯 1 題 2★、錯 2 題以上 1★；啟用不到 5 題（2 題、4 題）全對也只有 1★（不變成刷星星捷徑）", r.st === "11132111", r.st);
    ok("第 1 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ② 一回合自動通關（真的點擊；題數 N 從 state().total／畫面「第 x/N 題」讀）=====
  // wrongs[k]＝第 k 題先點錯幾張。回傳整回合的題號、按鈕字、onWin、結算橫幅
  async function playRound(p, wrongs) {
    await fresh(p);
    const s0 = await S(p), N = s0.total, ids = s0.ids, progs = [], labels = [];
    for (let k = 0; k < N; k++) {
      await waitPhase(p, "ask"); await waitQuiet(p);
      progs.push(await p.evaluate(() => document.querySelector(".dt-prog-t").textContent));
      await answer(p, wrongs[k] || 0);
      labels.push(await p.evaluate(() => document.querySelector(".dt-next").textContent));
      if (k < N - 1) await p.click(".dt-next"); else { var winBefore = await p.evaluate(() => window.__dt.calls.win.length); await p.click(".dt-next"); }
    }
    await waitPhase(p, "done");
    const banner = await p.evaluate(() => { const b = document.querySelector(".dt-banner"); return b ? b.textContent + "｜" + document.querySelector(".dt-prog-t").textContent : ""; });
    await p.waitForFunction(() => window.__dt.calls.win.length > 0, null, { timeout: 8000 });
    await sleep(800);
    const wins = await p.evaluate(() => window.__dt.calls.win.slice());
    return { N, ids, progs, labels, winBefore, banner, wins };
  }
  const roundOk = (r, N, star, ft, corr) => r.N === N && r.ids.length === N && new Set(r.ids).size === N && r.winBefore === 0 && r.wins.length === 1 && r.wins[0].total === N && r.wins[0].correct === corr && r.wins[0].stars === star && r.wins[0].firstTry === ft;
  const shape = r => r.progs.every((t, k) => t.startsWith(`第 ${k + 1}/${r.N} 題`)) && r.labels.every((l, k) => (k < r.N - 1 ? l.includes("下一題") : l.includes("完成"))) && r.banner.includes("全部找到了") && r.banner.endsWith(`第 ${r.N}/${r.N} 題`);
  const sum = r => JSON.stringify((({ stars, correct, firstTry, total }) => ({ stars, correct, firstTry, total }))(r.wins[0]));
  // (a) 全題庫＝原規則（一回合 5 題）：全對 3★、錯 1 題 2★、錯 2 題 1★
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&seed=7");
    const runs = [];
    for (const w of [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [2, 0, 1, 0, 0]]) runs.push({ w, ...(await playRound(p, w)) });
    const exp = [[3, 5], [2, 4], [1, 3]];
    ok("自動通關（全題庫、一回合 5 題）：onWin 只呼叫一次、在結算演出之後；全對 3★、錯 1 題 2★、錯 2 題 1★；5 題不重複", runs.every((r, k) => roundOk(r, 5, exp[k][0], exp[k][1], 5)), JSON.stringify(runs.map(r => ({ w: r.wins, before: r.winBefore, ids: r.ids }))));
    console.log("\nonWin（全題庫）：" + runs.map(r => sum(r)).join("　"));
    ok("題號＋按鈕字（5 題）：第 1/5 … 第 5/5 題；前 4 題「下一題 ➜」、最後一題「完成 ⭐」；結算橫幅「全部找到了！」", runs.every(shape), JSON.stringify(runs.map(r => [r.progs, r.labels, r.banner])));
    ok("onWin items：每題的 id 與答錯次數（5 題）", runs[1].wins[0].items.map(x => x.misses).join() === "1,0,0,0,0" && runs[2].wins[0].items.map(x => x.misses).join() === "2,0,1,0,0" && runs[1].wins[0].items.map(x => x.id).join() === runs[1].ids.join(), JSON.stringify(runs.map(r => r.wins[0].items)));
    ok("第 2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // (b) 題庫只剩 2 題（?bank=2）：最多 1★
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&seed=7&bank=2");
    const runs = [];
    for (const w of [[0, 0], [1, 0], [2, 1]]) runs.push({ w, ...(await playRound(p, w)) });
    const exp = [[1, 2], [1, 1], [1, 0]];   // 只啟用 2 題：最多 1★
    ok("自動通關（題庫只剩 2 題）：一回合 2 題；全對也只有 1★（不到 5 題最多 1★）、錯 1 題 1★、兩題都錯過 1★；onWin 一次", runs.every((r, k) => roundOk(r, 2, exp[k][0], exp[k][1], 2)), JSON.stringify(runs.map(r => ({ w: r.wins, before: r.winBefore }))));
    console.log("onWin（2 題題庫）：" + runs.map(r => sum(r)).join("　"));
    ok("題號＋按鈕字（2 題）：第 1/2 題 → 第 2/2 題；「下一題 ➜」→「完成 ⭐」；結算橫幅「全部找到了！」", runs.every(shape), JSON.stringify(runs.map(r => [r.progs, r.labels, r.banner])));
    ok("onWin items（2 題）：每題的答錯次數", runs[1].wins[0].items.map(x => x.misses).join() === "1,0" && runs[2].wins[0].items.map(x => x.misses).join() === "2,1", JSON.stringify(runs.map(r => r.wins[0].items)));
    ok("第 2b 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // 5 題回合（intro:false；?all=1 與 全題庫相同）
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&seed=3&all=1&intro=0");
    await waitPhase(p, "ask");
    for (let k = 0; k < 5; k++) {
      await waitPhase(p, "ask");
      await p.evaluate(() => { const g = window.__dt.game; g.debug.tap(g.state().answer); });
      await p.waitForFunction(() => window.__dt.game.state().nextShown, null, { timeout: 8000, polling: 20 });
      await p.click(".dt-next");
    }
    await p.waitForFunction(() => window.__dt.calls.win.length > 0, null, { timeout: 8000 });
    const w = await p.evaluate(() => window.__dt.calls.win[0]);
    ok("每回合 5 題（題庫夠時）：onWin total 5、全對 3★；intro:false 不念教學句", w.total === 5 && w.correct === 5 && w.stars === 3 && !(await p.evaluate(() => window.__dt.calls.talk.includes("仔細聽，選出你聽到的那一句！"))), JSON.stringify(w));
    ok("第 2b 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ③ 快速連點 ／ ④ 重聽 ／ ⑤ 答錯 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=3&seed=5");
    // ③-1 同一張錯的卡連點 10 次（同步，一個事件迴圈內）→ 只算 1 次錯
    await fresh(p);
    let s = await S(p); const [wa, wb] = [0, 1, 2].filter(i => i !== s.answer);
    await p.evaluate(i => { const c = document.querySelector(`.dt-card[data-i="${i}"]`); for (let k = 0; k < 10; k++) c.click(); }, wa);
    s = await S(p);
    ok("連點同一張錯的卡 10 次：只記 1 次錯、題目沒解開", s.qWrong === 1 && s.misses === 1 && s.phase === "ask", JSON.stringify(s));
    // ③-2 輕搖時間內亂點不同張（錯→對→錯…10 下）→ 只有第一下算
    await sleep(750);
    await p.evaluate(([a, b]) => { for (let k = 0; k < 10; k++) document.querySelector(`.dt-card[data-i="${k % 2 ? a : b}"]`).click(); }, [s.answer, wb]);
    s = await S(p);
    ok("連點不同張 10 次（錯、對交錯）：只有第一下算（第 2 次錯），對的那下在輕搖時間內不算", s.qWrong === 2 && s.correct === 0 && s.phase === "ask", JSON.stringify(s));
    // ③-3 對的卡連點 10 次（Playwright 一次送 10 個 click）→ 只算 1 題
    await sleep(750);
    await p.click(card(s.answer), { clickCount: 10, delay: 0 });
    s = await S(p);
    ok("對的卡連點 10 次：答對只算 1 次（correct 1、firstTry 0）", s.correct === 1 && s.firstTry === 0 && s.phase === "solved", JSON.stringify(s));
    // ③-4 答對後再點別張：不能改答案
    const before = await p.evaluate(() => [...document.querySelectorAll(".dt-card")].map(c => c.className).join("|"));
    for (const i of [wa, wb, wa]) await p.evaluate(i => document.querySelector(`.dt-card[data-i="${i}"]`).click(), i);
    await p.click(card(wa), { force: true }).catch(() => {});
    const after = await p.evaluate(() => [...document.querySelectorAll(".dt-card")].map(c => c.className).join("|")), s2 = await S(p);
    ok("答對後再點別張卡：狀態、分數、卡片樣子都不變", s2.correct === 1 && s2.firstTry === 0 && s2.misses === 2 && after === before, JSON.stringify({ s2, before, after }));
    // 新的一題：對的卡一開始就連點 10 次 → firstTry 1
    await fresh(p); s = await S(p);
    await p.evaluate(i => { const c = document.querySelector(`.dt-card[data-i="${i}"]`); for (let k = 0; k < 10; k++) c.click(); }, s.answer);
    s = await S(p);
    ok("一開始就把對的卡連點 10 次：correct 1、firstTry 1（不會多算）", s.correct === 1 && s.firstTry === 1, JSON.stringify(s));

    // ④ 重聽：連點（300ms 內）只算一次（防抖）；隔 0.35 秒按 5 次＝5 次重聽、不疊播
    await fresh(p); s = await S(p);
    const nRapid = await p.evaluate(() => window.__dt.V.log.length);
    await p.evaluate(() => { const b = document.querySelector(".dt-listen"); for (let k = 0; k < 5; k++) b.click(); });   // 同一瞬間 5 下
    const rapid = await p.evaluate(n => ({ replays: window.__dt.game.state().replays, said: window.__dt.V.log.length - n }), nRapid);
    ok("🔊 連點 5 下（300ms 內）：只重聽 1 次（防抖，句子不會被剪碎）", rapid.replays === 1 && rapid.said === 1, JSON.stringify(rapid));
    await waitQuiet(p); await fresh(p); s = await S(p);
    const n0 = await p.evaluate(() => window.__dt.V.log.length);
    for (let k = 0; k < 5; k++) { await p.click(".dt-listen", { delay: 0 }); if (k < 4) await sleep(350); }
    const v = await p.evaluate(n0 => { const d = window.__dt; return { log: d.V.log.slice(n0).map(x => ({ kind: x.kind, text: x.text, how: x.how, t0: x.t0, end: x.end })), cur: d.V.cur && d.V.cur.text, curId: d.V.cur && d.V.cur.id, lastId: d.V.log[d.V.log.length - 1].id, playing: document.querySelector(".dt-listen").classList.contains("dt-playing") }; }, n0);
    const s3 = await S(p);
    ok("重聽 5 次（隔 0.35 秒）：同一題、選項順序不變（不洗牌）、replays 5", s3.qid === s.qid && s3.order.join() === s.order.join() && s3.replays === 5, JSON.stringify({ s, s3 }));
    ok("重聽 5 次：5 段都是題目句，前 4 段被打斷（模組先 stopVoice）、只有最後一段在播；🔊 鈕顯示播放中", v.log.length === 5 && v.log.every(x => x.kind === "say" && x.text === s.say) && v.log.slice(0, 4).every(x => x.how === "cut" || x.how === "stop") && v.cur === s.say && v.curId === v.lastId && v.playing, JSON.stringify(v));
    const overlap = v.log.slice(1).some((x, k) => v.log[k].end > x.t0 + 0.5);
    ok("重聽 5 次：任兩段時間不重疊（前一段結束 ≤ 下一段開始）", !overlap, JSON.stringify(v.log.map(x => [Math.round(x.t0), Math.round(x.end)])));
    await waitQuiet(p); await sleep(1500);
    const n1 = await p.evaluate(() => window.__dt.V.log.length), s4 = await S(p);
    ok("重聽後：被打斷那幾段晚到的回呼沒有引發別的話（講完就安靜）、題目沒變、🔊 鈕停止動畫", n1 === n0 + 5 && s4.qid === s.qid && s4.order.join() === s.order.join() && !(await p.evaluate(() => document.querySelector(".dt-listen").classList.contains("dt-playing"))), JSON.stringify({ n0, n1 }));

    // ⑤ 答錯
    await fresh(p); s = await S(p);
    const say0 = await p.evaluate(() => window.__dt.calls.say.length);
    const wi = [0, 1, 2].find(i => i !== s.answer);
    await p.click(card(wi)); await sleep(120);
    const RETRY = "按喇叭，再聽一次喔！";
    const wr = await p.evaluate(ans => ({ wrongCls: [...document.querySelectorAll(".dt-card.dt-wrong")].map(c => +c.dataset.i), right: document.querySelectorAll(".dt-card.dt-right, .dt-card.dt-out").length,
      keys: document.querySelectorAll(".dt-c.dt-key, .dt-c.dt-diff").length, nudge: document.querySelector(".dt-listen").classList.contains("dt-nudge"), point: document.querySelector(".dt-listen").classList.contains("dt-point"), lens: !!document.querySelector(".dt-lens"),
      talk: window.__dt.calls.talk.slice(-1)[0], bubble: document.querySelector(".dt-bubble").textContent, next: !document.querySelector(".dt-next").classList.contains("dt-hide"),
      ansCls: document.querySelector(`.dt-card[data-i="${ans}"]`).className, talking: window.__dt.V.cur && window.__dt.V.cur.text }), s.answer);
    // 剩下兩張卡：彼此不一樣的字（照 diffPos 算）都框起來、點錯那張沒有框；框是中性藍灰（不是綠／紅）
    const hint = await p.evaluate(wi => {
      const d = window.__dt, g = d.game.state(), q = d.mod.BANK.find(x => x.id === g.qid), opt = i => q.options[g.order[i]];
      const cards = [...document.querySelectorAll(".dt-card")], got = cards.map(c => [...c.querySelectorAll(".dt-c.dt-hint")].map(e => +e.dataset.k).sort((a, b) => a - b).join());
      const left = [0, 1, 2].filter(i => i !== wi), want = [0, 1, 2].map(i => (i === wi ? "" : d.mod.diffPos(opt(i), opt(left.find(j => j !== i))).sort((a, b) => a - b).join()));
      const e = document.querySelector(".dt-c.dt-hint"), cs = e ? getComputedStyle(e) : null, rgb = cs ? (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number) : [];
      const runs = cards.map(c => c.querySelectorAll(".dt-c.dt-hint.hs").length + "/" + c.querySelectorAll(".dt-c.dt-hint.he").length);
      return { got, want, bg: cs && cs.backgroundColor, shadow: cs && cs.boxShadow, neutral: rgb.length >= 3 && rgb[2] >= rgb[0] && rgb[2] >= rgb[1] && rgb[1] - rgb[0] < 40, runs };
    }, wi);
    await shot(p, "wrong_hint_before_point");
    const pointed = await p.waitForFunction(() => document.querySelector(".dt-listen").classList.contains("dt-point"), null, { timeout: 4000, polling: 20 }).then(() => true, () => false);
    const pt = await p.evaluate(() => ({ nudge: document.querySelector(".dt-listen").classList.contains("dt-nudge"), talking: window.__dt.V.cur && window.__dt.V.cur.text, hand: !!document.querySelector(".dt-listen .dt-hand") }));
    await sleep(300);
    const handOp = await p.evaluate(() => +getComputedStyle(document.querySelector(".dt-hand")).opacity);
    await shot(p, "wrong_point");
    await sleep(2300);
    const sayAfter = await p.evaluate(n => window.__dt.calls.say.slice(n), say0), off = await p.evaluate(() => !document.querySelector(".dt-listen").classList.contains("dt-point"));
    ok("答錯：那張卡變淡、沒有任何卡變綠、沒有關鍵字高亮、沒有放大鏡、沒有下一題、正確卡沒被標記", wr.wrongCls.join() === String(wi) && wr.right === 0 && wr.keys === 0 && !wr.lens && !wr.next && wr.ansCls.trim() === "dt-card dt-deal", JSON.stringify(wr));
    ok("答錯：輕聲說「按喇叭，再聽一次喔！」（talk）、對話框同一句；還在講的時候 🔊 先不閃、手指還沒出來", wr.talk === RETRY && wr.bubble === RETRY && wr.talking === RETRY && !wr.nudge && !wr.point, JSON.stringify(wr));
    ok("答錯：講完 → 🔊 閃＋手指點 🔊（看得到）；約 2 秒後手指收起來", pointed && pt.nudge && !pt.talking && pt.hand && handOp > 0.3 && off, JSON.stringify({ pointed, pt, handOp, off }));
    ok("答錯：之後 3 秒內沒有自動念題目（阿葉規則：要孩子自己按 🔊）", sayAfter.length === 0, JSON.stringify(sayAfter));
    ok("答錯：剩下兩張卡「彼此不一樣的字」都框起來、點錯那張不框（不透露哪張對）；連在一起的字一段一個框", hint.got.join("|") === hint.want.join("|") && hint.want.filter(Boolean).length === 2 && hint.runs.every((r, i) => i === wi ? r === "0/0" : r.split("/")[0] === r.split("/")[1] && +r.split("/")[0] >= 1), JSON.stringify(hint));
    ok("答錯：框是中性藍灰色（不是綠／紅）", hint.neutral && /rgba?\(84, 104, 140/.test(hint.shadow || ""), JSON.stringify({ bg: hint.bg, shadow: hint.shadow }));
    const s5 = await S(p);
    ok("答錯後：同一題、不洗牌、可以再選", s5.qid === s.qid && s5.order.join() === s.order.join() && s5.phase === "ask", JSON.stringify(s5));
    await p.click(".dt-listen"); await sleep(100);
    ok("答錯後按 🔊：念的是題目句、🔊 停止閃、沒有手指", (await p.evaluate(() => window.__dt.calls.say.slice(-1)[0])) === s.say && !(await p.evaluate(() => { const l = document.querySelector(".dt-listen").classList; return l.contains("dt-nudge") || l.contains("dt-point"); })));
    await waitQuiet(p);
    await p.click(card(s.answer)); await sleep(1700);
    const sv = await p.evaluate(() => ({ keys: [...document.querySelectorAll(".dt-card.dt-right .dt-c.dt-key")].map(e => e.textContent).join(""), say: window.__dt.calls.say.slice(-1)[0], talk: window.__dt.calls.talk.slice(-1)[0], next: !document.querySelector(".dt-next").classList.contains("dt-hide"), diff: document.querySelectorAll(".dt-card.dt-out .dt-c.dt-diff").length, hints: document.querySelectorAll(".dt-c.dt-hint").length }));
    ok("答對：綠框卡上的關鍵字高亮、稱讚一句後再念一次正確句子、出現下一題按鈕、錯誤選項的差異字畫底線、答錯時的提示框收掉", sv.keys.length >= 1 && sv.say === s.say && /答對了|找到了|仔細/.test(sv.talk) && sv.next && sv.diff >= 2 && sv.hints === 0, JSON.stringify(sv));
    // 再答錯一次：手指再出來一次；只剩一張卡＝沒得比、不框
    await fresh(p); s = await S(p);
    const [w1, w2] = [0, 1, 2].filter(i => i !== s.answer);
    await p.click(card(w1));
    const p1 = await p.waitForFunction(() => document.querySelector(".dt-listen").classList.contains("dt-point"), null, { timeout: 4000, polling: 20 }).then(() => true, () => false);
    await p.waitForFunction(() => !document.querySelector(".dt-listen").classList.contains("dt-point"), null, { timeout: 4000, polling: 20 }).catch(() => {});
    await p.click(card(w2));
    const p2 = await p.waitForFunction(() => document.querySelector(".dt-listen").classList.contains("dt-point"), null, { timeout: 4000, polling: 20 }).then(() => true, () => false);
    const two = await p.evaluate(() => ({ hints: document.querySelectorAll(".dt-c.dt-hint").length, qWrong: window.__dt.game.state().qWrong, talk: window.__dt.calls.talk.slice(-1)[0] }));
    ok("再答錯一次：再說一次、手指再點一次 🔊；只剩一張卡＝不框", p1 && p2 && two.hints === 0 && two.qWrong === 2 && two.talk === RETRY, JSON.stringify({ p1, p2, two }));
    ok("第 3–5 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ④-2 沒有提供 api.stopVoice：一樣不疊播
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=3&seed=5&nostop=1");
    await fresh(p); const s = await S(p);
    const n0 = await p.evaluate(() => window.__dt.V.log.length);
    for (let k = 0; k < 5; k++) { await p.click(".dt-listen", { delay: 0 }); if (k < 4) await sleep(350); }   // 隔 0.35 秒（300ms 內連點會被防抖合成一次）
    const v = await p.evaluate(n0 => ({ log: window.__dt.V.log.slice(n0).map(x => x.how), cur: window.__dt.V.cur && window.__dt.V.cur.text }), n0);
    await waitQuiet(p); await sleep(1200);
    const n1 = await p.evaluate(() => window.__dt.V.log.length);
    ok("沒有 api.stopVoice（只靠主程式 say() 先停前一句＋模組代號）：隔 0.35 秒按 5 次只有最後一段在播、講完沒有多出來的話", v.log.slice(0, 4).every(h => h === "cut") && v.cur === s.say && n1 === n0 + 5, JSON.stringify({ v, n0, n1 }));
    ok("第 4-2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑪ 換題：上一題排著的延遲回呼不能畫到新題、不能念舊句（10-12 里維必修）=====
  // 真實速度（fast=1）。A：答對後 0.15 秒就換題（debug.next）；B：下一題鈕一出來（0.7 秒）就按。換題後 5 秒內每 40ms 看一次新題。
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=1&seed=7&intro=0");
    const res = [];
    for (const how of ["0.15 秒", "鈕一出來"]) {
      await fresh(p, { intro: false });
      const s0 = await S(p);
      await p.click(card(s0.answer));
      if (how === "0.15 秒") { await sleep(150); await p.evaluate(() => { window.__tNext = performance.now(); window.__dt.game.debug.next(); }); }
      else { await p.waitForFunction(() => window.__dt.game.state().nextShown, null, { timeout: 4000, polling: 10 }); await p.evaluate(() => { window.__tNext = performance.now(); document.querySelector(".dt-next").click(); }); }
      const f0 = await p.evaluate(() => window.__dt.game.debug.fired());
      const seen = await p.evaluate(async () => {
        const o = { diff: 0, key: 0, reading: 0, right: 0, lens: 0, next: 0, pulse: 0, hint: 0, phases: [], qids: [] }, t0 = performance.now();
        while (performance.now() - t0 < 5000) {
          const s = window.__dt.game.state();
          if (!o.qids.includes(s.qid)) o.qids.push(s.qid);
          if (!o.phases.includes(s.phase)) o.phases.push(s.phase);
          if (s.phase === "wait" || s.phase === "ask") {
            o.diff = Math.max(o.diff, document.querySelectorAll(".dt-c.dt-diff").length);
            o.key = Math.max(o.key, document.querySelectorAll(".dt-c.dt-key").length);
            o.hint = Math.max(o.hint, document.querySelectorAll(".dt-c.dt-hint").length);
            o.reading = Math.max(o.reading, document.querySelectorAll(".dt-card.dt-reading").length);
            o.right = Math.max(o.right, document.querySelectorAll(".dt-card.dt-right, .dt-card.dt-out").length);
            o.lens = Math.max(o.lens, document.querySelectorAll(".dt-lens").length);
            if (s.nextShown) o.next++;
            if (document.querySelector(".dt-next.dt-pulse")) o.pulse++;
          }
          await new Promise(r => setTimeout(r, 40));
        }
        return o;
      });
      const s1 = await S(p);
      const log = await p.evaluate(() => window.__dt.V.log.filter(x => x.t0 >= window.__tNext).map(x => ({ kind: x.kind, text: x.text })));
      res.push({ how, s0: s0.say, s1: s1.say, q1: s1.qid, seen, log, f0 });
    }
    for (const r of res) {
      ok(`⑪ 換題（${r.how}）：新題 5 秒內卡片沒有任何差異底線／黃底關鍵字／提示框／綠框／放大鏡／重念動畫、沒有下一題鈕`, r.s0 !== r.s1 && r.seen.qids.length === 1 && r.seen.diff + r.seen.key + r.seen.hint + r.seen.right + r.seen.lens + r.seen.reading + r.seen.next + r.seen.pulse === 0, JSON.stringify(r.seen));
      ok(`⑪ 換題（${r.how}）：換題後只念新題目句、沒有舊句子（也沒有舊題的稱讚／重念）`, r.log.length >= 1 && r.log.every(x => x.kind === "say" && x.text === r.s1) && !r.log.some(x => x.text === r.s0), JSON.stringify({ old: r.s0, now: r.s1, log: r.log }));
    }
    // C：0.15 秒換題、新題一發牌就秒答 → 舊題 2.6 秒的「再念一次」不能把舊句子念出來、不能在新題的綠框卡上放重念動畫
    {
      await fresh(p, { intro: false });
      const s0 = await S(p);
      await p.click(card(s0.answer)); await sleep(150);
      await p.evaluate(() => { window.__tNext = performance.now(); window.__dt.game.debug.next(); });
      await waitPhase(p, "ask");
      await p.evaluate(() => { const g = window.__dt.game; g.debug.tap(g.state().answer); });
      await sleep(4000);
      const s1 = await S(p);
      const log = await p.evaluate(() => window.__dt.V.log.filter(x => x.t0 >= window.__tNext).map(x => ({ kind: x.kind, text: x.text })));
      ok("⑪ 換題後新題秒答：舊題排著的重念沒有念出舊句子；新題照常稱讚＋重念新句子", s1.phase === "solved" && s1.say !== s0.say && !log.some(x => x.text === s0.say) && log.some(x => x.kind === "say" && x.text === s1.say), JSON.stringify({ old: s0.say, now: s1.say, log }));
    }
    ok("⑪ 換題：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑥ stop() =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=1&seed=9");
    const snap = () => p.evaluate(() => { const d = window.__dt; return { say: d.calls.say.length, talk: d.calls.talk.length, play: d.calls.play.length, win: d.calls.win.length, vlog: d.V.log.length, fired: d.game.debug.fired(), cur: d.V.cur ? d.V.cur.text : null, kids: document.getElementById("detectiveRoot").children.length, cls: document.getElementById("detectiveRoot").className }; });
    const cases = [];
    // A：答對的當下（稱讚在講、重念／下一題／放大鏡都還在排）
    await fresh(p); let s = await S(p);
    await p.click(card(s.answer)); await sleep(120);
    let pre = await snap(); await p.evaluate(() => window.__dt.game.stop()); let a = await snap(); await sleep(5000); let b = await snap();
    cases.push({ name: "答對後", pre, a, b });
    // B：教學句還在講（題目還沒念）
    await p.evaluate(() => window.__dt.game.start()); await sleep(200);
    pre = await snap(); await p.evaluate(() => window.__dt.game.stop()); a = await snap(); await sleep(5600); b = await snap();
    cases.push({ name: "教學中", pre, a, b });
    // C：題目句播到一半
    await p.evaluate(() => window.__dt.game.start({ intro: false })); await waitPhase(p, "ask"); await sleep(150);
    pre = await snap(); await p.evaluate(() => window.__dt.game.stop()); a = await snap(); await sleep(5000); b = await snap();
    cases.push({ name: "念題中", pre, a, b });
    // D：結算橫幅（onWin 還在排）
    await p.evaluate(() => window.__dt.game.start({ intro: false })); await waitPhase(p, "ask");
    const nQ = (await S(p)).total;
    for (let k = 0; k < nQ; k++) { await waitPhase(p, "ask"); await p.evaluate(() => { const g = window.__dt.game; g.debug.tap(g.state().answer); }); await p.waitForFunction(() => window.__dt.game.state().nextShown, null, { timeout: 8000 }); await p.click(".dt-next"); }
    await waitPhase(p, "done"); await sleep(200);
    pre = await snap(); await p.evaluate(() => window.__dt.game.stop()); a = await snap(); await sleep(5000); b = await snap();
    cases.push({ name: "結算中", pre, a, b });
    const still = c => ["say", "talk", "play", "win", "vlog", "fired"].every(k => c.a[k] === c.b[k]);
    ok("stop()：當下就沒有聲音在播（答對後／教學中／念題中）、畫面清空", cases.slice(0, 3).every(c => c.pre.cur && c.a.cur === null) && cases.every(c => c.a.kids === 0 && !c.a.cls), JSON.stringify(cases.map(c => [c.name, c.pre.cur, c.a.cur, c.a.kids])));
    ok("stop() 之後等 5 秒：沒有任何語音、音效、延遲回呼、onWin 再觸發（4 種時機）", cases.every(still), JSON.stringify(cases.filter(c => !still(c))));
    await p.evaluate(() => window.__dt.game.start({ intro: false })); await waitPhase(p, "ask");
    ok("stop() 後重新 start 正常、只有一份畫面", (await S(p)).phase === "ask" && await p.evaluate(() => document.querySelectorAll("#detectiveRoot .dt-wrap").length === 1));
    ok("第 6 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑦ 暫停、說明語音關閉 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=2&seed=4");
    await fresh(p); let s = await S(p);
    await p.evaluate(() => window.__dt.setPaused(true));
    await p.evaluate(i => { document.querySelector(`.dt-card[data-i="${i}"]`).click(); document.querySelector(".dt-listen").click(); }, s.answer);
    let s2 = await S(p);
    ok("暫停中：點卡片、點 🔊 都不算", s2.phase === "ask" && s2.correct === 0 && s2.replays === 0, JSON.stringify(s2));
    await p.evaluate(() => window.__dt.setPaused(false));
    // 教學句講到一半按暫停（主程式會說「暫停」打斷它）→ 繼續後要接著念題目
    await p.evaluate(() => { const d = window.__dt; d.calls.say.length = 0; d.game.start(); }); await sleep(150);
    await p.evaluate(() => window.__dt.setPaused(true)); await sleep(3500);
    const midPause = await S(p);
    await p.evaluate(() => window.__dt.setPaused(false));
    await waitPhase(p, "ask", 9000).catch(() => {});
    s2 = await S(p);
    ok("教學句被暫停打斷：暫停中不會開始念題，繼續後會念題目", midPause.phase === "intro" && s2.phase === "ask" && (await p.evaluate(() => window.__dt.calls.say.slice()))[0] === s2.say, JSON.stringify({ midPause: midPause.phase, s2 }));
    ok("第 7 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=2&seed=4&talk=0");
    await waitPhase(p, "ask", 3000).catch(() => {});
    const s = await S(p);
    ok("家長關掉說明語音（talk 直接回呼）：馬上開始念題目", s.phase === "ask" && (await p.evaluate(() => window.__dt.calls.say[0])) === s.say, JSON.stringify(s));
    ok("第 7b 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑧ 版面＋截圖＋字級 =====
  const fontLog = [];
  for (const [w, h, tag] of [[1024, 768, "ipad_land"], [768, 1024, "ipad_port"], [1366, 1024, "ipadpro_land"], [844, 390, "phone_land"]]) {
    const { ctx, p, errs } = await open(browser, w, h, "fast=2&seed=2");
    await waitPhase(p, "intro").catch(() => {}); await sleep(300); await shot(p, `${tag}_1intro`);
    await waitPhase(p, "ask"); await sleep(700);
    const measure = () => p.evaluate(() => {
      const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      const inView = a => a.l >= -0.5 && a.t >= -0.5 && a.r <= innerWidth + 0.5 && a.b <= innerHeight + 0.5;
      const vm = Math.min(innerWidth, innerHeight) / 100;
      const cards = [...document.querySelectorAll(".dt-card")].map(c => { const s = c.querySelector(".dt-sent"), ac = s.querySelector(".ac[data-z]"), cr = R(c), sr = R(s);
        return { ...cr, fit: sr.l >= cr.l + 1 && sr.r <= cr.r - 1 && sr.t >= cr.t && sr.b <= cr.b, fs: parseFloat(getComputedStyle(s).fontSize), zy: parseFloat(getComputedStyle(ac, "::after").fontSize) }; });
      const ui = { listen: R(document.querySelector(".dt-listen")), prog: R(document.querySelector(".dt-prog")), bubble: R(document.querySelector(".dt-bubble")), dog: R(document.querySelector(".dt-dog")) };
      const nx = document.querySelector(".dt-next"); if (!nx.classList.contains("dt-hide")) ui.next = R(nx);
      cards.forEach((c, i) => { ui["card" + i] = c; });
      const hud = [R(document.getElementById("homeBtn")), R(document.getElementById("musicBtn"))];
      const names = Object.keys(ui), over = [];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(ui[names[i]], ui[names[j]])) over.push(names[i] + "×" + names[j]);
      const hudHit = names.filter(n => hud.some(hb => hit(hb, ui[n])));
      const small = ["listen", "next", "card0", "card1", "card2"].filter(n => ui[n] && (ui[n].w < 56 || ui[n].h < 56));
      const bubbleFs = parseFloat(getComputedStyle(document.querySelector(".dt-bubble")).fontSize), listenFs = parseFloat(getComputedStyle(document.querySelector(".dt-listen")).fontSize);
      return { vm: +vm.toFixed(2), over, hudHit, small, out: names.filter(n => !inView(ui[n])), fit: cards.every(c => c.fit), fs: Math.min(...cards.map(c => c.fs)), zy: +Math.min(...cards.map(c => c.zy)).toFixed(1),
        cardH: Math.round(Math.min(...cards.map(c => c.h))), next: !!ui.next, cardW: Math.round(Math.min(...cards.map(c => c.w))), bubbleFs, listenFs, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    });
    const m1 = await measure(); await shot(p, `${tag}_2ask`);
    const s = await S(p); const wi = [0, 1, 2].find(i => i !== s.answer);
    await p.click(card(wi)); await sleep(900); await shot(p, `${tag}_3wrong`);
    await p.click(card(s.answer)); await sleep(1900);
    const m2 = await measure(); await shot(p, `${tag}_4solved`);
    const ipad = Math.min(w, h) >= 700;
    fontLog.push(`${w}×${h}：國字 ${m1.fs}px（${(m1.fs / m1.vm).toFixed(1)}vmin）、注音 ${m1.zy}px；卡片 ${m1.cardW}×${m1.cardH}px；對話框 ${m1.bubbleFs.toFixed(1)}px、🔊 鈕字 ${m1.listenFs.toFixed(1)}px`);
    ok(`版面 ${w}×${h}：三張卡、🔊、題號、小狗、對話框都在畫面內、互不重疊、不壓到主程式 🏠🎵、不捲動`, !m1.over.length && !m1.hudHit.length && !m1.out.length && !m1.scroll, JSON.stringify(m1));
    ok(`版面 ${w}×${h}（答對後）：下一題按鈕也在畫面內、不壓到卡片與 🏠🎵`, m2.next && !m2.over.length && !m2.hudHit.length && !m2.out.length, JSON.stringify(m2));
    ok(`字級 ${w}×${h}：整句一行放進卡片；${ipad ? "國字 ≥35.3px、注音 ≥13.4px" : "國字 ≥4.6vmin"}；對話框、🔊 字 ≥4.6vmin`, m1.fit && (ipad ? m1.fs >= 35.3 && m1.zy >= 13.4 : m1.fs >= 4.6 * m1.vm - 0.1) && m1.bubbleFs >= 4.6 * m1.vm - 0.1 && m1.listenFs >= 4.6 * m1.vm - 0.1, JSON.stringify(m1));
    ok(`點擊區 ${w}×${h}：三張卡 ≥ 72px 高、🔊 與下一題 ≥ 56px`, !m1.small.length && !m2.small.length && m1.cardH >= 72, JSON.stringify({ small: m1.small, cardH: m1.cardH }));
    // 題庫（含草稿）最長的那題也要一行放得下、字級照樣達標
    const longest = await p.evaluate(() => { const B = window.__dt.mod.BANK, len = q => Math.max(...q.options.map(o => [...o].length)); const q = B.slice().sort((a, b) => len(b) - len(a))[0];
      window.__dt.api.bank = [{ ...q, enabled: true }]; window.__dt.game.start({ intro: false }); return { id: q.id, n: len(q) }; });
    await waitPhase(p, "ask"); await sleep(600);
    const m3 = await measure(); await shot(p, `${tag}_5long`);
    fontLog.push(`   └ 題庫最長句（${longest.id}，${longest.n} 字）：國字 ${m3.fs}px、注音 ${m3.zy}px`);
    ok(`版面 ${w}×${h}：題庫最長句（${longest.n} 字）也是一行放進卡片、字級達標`, m3.fit && !m3.over.length && (ipad ? m3.fs >= 35.3 && m3.zy >= 13.4 : m3.fs >= 4.6 * m3.vm - 0.1), JSON.stringify(m3));
    if (w === 1024) {   // 轉向：橫 → 直
      await p.evaluate(() => { window.__dt.api.bank = null; window.__dt.game.start({ intro: false }); }); await waitPhase(p, "ask"); await sleep(500);
      const o0 = (await S(p)).order.join();
      await p.setViewportSize({ width: 768, height: 1024 }); await sleep(400);
      const m4 = await measure(), L = await p.evaluate(() => window.__dt.game.debug.layout()), o1 = (await S(p)).order.join();
      ok("轉向（1024×768 → 768×1024）：relayout 改成直式、整句仍放得下、不重疊、選項順序不變", !L.land && m4.fit && !m4.over.length && !m4.hudHit.length && o0 === o1, JSON.stringify({ L, m4, o0, o1 }));
      await shot(p, "rotate_to_port");
    }
    ok(`版面 ${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  console.log("\n選項字級（DOM 實測）：\n  " + fontLog.join("\n  "));

  // ===== ⑨ 國字都有注音 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=2&seed=6");
    const bare = () => p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.getElementById("detectiveRoot"), NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (/[㐀-鿿]/.test(n.data) && !(e && e.closest(".ac[data-z]"))) out.push(n.data.trim()); } return out; });
    const res = [];
    await waitPhase(p, "intro").catch(() => {}); res.push(await bare());
    await waitPhase(p, "ask"); await waitQuiet(p); res.push(await bare());
    let s = await S(p); await p.click(card([0, 1, 2].find(i => i !== s.answer))); await sleep(300); res.push(await bare());
    await sleep(500); await p.click(card(s.answer)); await sleep(1800); res.push(await bare());
    for (let k = 1; k < s.total; k++) {   // 其餘題（題數讀 state().total）：每題答對、按下一題；最後一題答對後停在「完成」鈕前檢查
      await p.click(".dt-next"); await waitPhase(p, "ask"); s = await S(p); await p.click(card(s.answer));
      await p.waitForFunction(() => window.__dt.game.state().nextShown, null, { timeout: 8000 });
    }
    res.push(await bare());
    await p.click(".dt-next"); await waitPhase(p, "done"); await sleep(1000); res.push(await bare()); await shot(p, "ipad_land_6finish");
    const missing = await p.evaluate(async () => [...(await import("/js/zhuyin-ann.js?v=6")).missing]);
    ok("注音：教學、作答、答錯、答對、最後一題、結算畫面的國字全部有注音（沒有裸國字、字典沒漏字）", res.every(x => x.length === 0) && missing.length === 0, JSON.stringify({ bare: res.filter(x => x.length), missing }));
    const dict = fs.readFileSync(path.join(__dirname, "../../js/zhuyin-ui.js"), "utf8");
    const zchar = JSON.parse(dict.match(/export const ZCHAR = (\{.*?\});/)[1]), zdict = JSON.parse(dict.match(/export const ZDICT = (\{.*?\});/)[1]);
    const lack = [];
    for (const f of ["zhuyin-detective.js", "zhuyin-detective-bank.js"]) {
      const src = fs.readFileSync(path.join(__dirname, "../../js", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/console\.warn\([^\n]*?\)/g, "");
      for (const c of new Set(src.match(/[㐀-鿿]/g) || [])) if (!zchar[c]) lack.push(c);
    }
    const bankRuns = [...fs.readFileSync(path.join(__dirname, "../../js/zhuyin-detective-bank.js"), "utf8").matchAll(/^\s+\{ id: .*?options: \[([^\]]+)\]/gm)].flatMap(m => [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]));
    const notWhole = bankRuns.filter(o => !zdict[o]);
    ok("注音字典：兩個新檔用到的國字全部收進 ZCHAR；題庫每個選項整句都在 ZDICT（讀音照上下文）", lack.length === 0 && notWhole.length === 0, JSON.stringify({ lack, notWhole }));
    ok("第 9 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  await browser.close();
  ok("全程 0 個 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
  console.log("\n" + results.join("\n"));
  const fails = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS　截圖：${SHOTS}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
