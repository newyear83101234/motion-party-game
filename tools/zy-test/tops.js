// 注音戰鬥陀螺（js/zhuyin-tops*.js）測試：node tools/zy-test/tops.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 TP_SHOTS（預設 %TEMP%\zy-tops-shots）。
// 驗：①語法、加成名稱兩邊一致、隨機靈感拼得出來、GAS 版公式跟前端一樣、戰力上限與分佈
//     ②用真的按鍵拼出四句例句、破音字候選、不合法音節搖一下、輕聲退回、拼了沒按聲調按確定＝一聲
//     ③同一句兩次載入戰力一樣（Node／兩個分頁）④對戰確定性（同兩句 3 次、A 打 B＝B 打 A、介面實打兩次 onWin 一樣）
//     ⑤券：沒券擋住、打字中離開不扣券、下場扣 1 張、第一次免費 ⑥stop() 後沒有 rAF／later／語音殘留、開關 5 次沒有 WebGL 洩漏
//     ⑦送出：可能進前 5 的才送、黑名單不送、太弱不送 ⑧暫停：遊戲時鐘凍結 ⑨三種尺寸×四個畫面截圖＋按鍵 ≥56px＋國字都有注音 ⑩0 個 console error
//     10-12 櫻木／里維改善：A1 候選點一下就確定、選字中按注音＝先確定 A2 灰鍵 A3 候選排序（三聲變調、兒童常用字、emoji）A4 🎲 填空引導
//     A5 沒券存成陀螺蛋＋集點卡、有券先問孵蛋 B6 第一次免費挑會贏的、輸了換對手、避開打過的 B7 只有第 1 回合倒數、4-5 回合 2 倍速、點畫面加油
//     B8 戰力長條＋等級 B9 加成發光＋對戰強化（確定性）C10 變身出錯 onFail C11 火花顏色 C12 字典逾時 C13 gauge 快取 C14 import 版號 C15 結算降像素比
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os"), vm = require("vm"), cp = require("child_process");
const { pathToFileURL } = require("url");
const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/tops-lab.html";
const SHOTS = process.env.TP_SHOTS || path.join(os.tmpdir(), "zy-tops-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];
const PHRASES = [["宇宙強爸爸", "ㄩˇ ㄓㄡˋ ㄑㄧㄤˊ ㄅㄚˋ ㄅㄚ˙"], ["超級賽亞人", "ㄔㄠ ㄐㄧˊ ㄙㄞˋ ㄧㄚˋ ㄖㄣˊ"], ["努力小紅帽", "ㄋㄨˇ ㄌㄧˋ ㄒㄧㄠˇ ㄏㄨㄥˊ ㄇㄠˋ"], ["紅色翹翹板", "ㄏㄨㄥˊ ㄙㄜˋ ㄑㄧㄠˋ ㄑㄧㄠˋ ㄅㄢˇ"]];

async function open(browser, w, h, q = "", { initScript } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  if (initScript) await ctx.addInitScript(initScript);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push(`[${w}x${h}] PAGEERR ${e.message}`); });
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 200)); allErrs.push(`[${w}x${h}] CONSOLE ${m.text().slice(0, 200)}`); } });
  await p.goto(LAB + "?mute=1&clean=1&home=clear" + (q ? "&" + q : ""));
  await p.waitForFunction(() => window.__tp && window.__tp.ready, null, { timeout: 20000 });
  await sleep(150);
  return { ctx, p, errs };
}
const S = p => p.evaluate(() => window.__tp.game.state());
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const key = (p, k) => p.click(`.tp-key[data-k="${k}"]`, { timeout: 4000 });
// 用鍵盤拼一個音節（符號＋聲調；一聲按「一聲」鍵），不確定
async function typeSyl(p, syl) {
  const t = "ˊˇˋ˙".includes(syl.slice(-1)) ? syl.slice(-1) : "1", base = t === "1" ? syl : syl.slice(0, -1);
  for (const c of base) await key(p, c);
  await key(p, t);
}
// 拼一個字並選好、確定（候選字不在這頁就按 ▶）
async function typeChar(p, ch, syl) {
  await typeSyl(p, syl);
  for (let i = 0; i < 12; i++) { if (await p.$(`.tp-cand[data-ch="${ch}"]`)) break; if (!(await p.$(".tp-next:not(.tp-hide)"))) break; await p.click(".tp-next"); }
  const c = await p.$(`.tp-cand[data-ch="${ch}"]`); if (!c) return false;
  await c.click();
  if ((await S(p)).cands.length) await key(p, "ok");          // 點了沒選中的＝選取，再按確定（點已選取的那個＝直接確定）
  return true;
}
const waitPhase = (p, ph, t = 20000) => p.waitForFunction(ph => { const s = window.__tp.game.state(); return s && s.phase === ph; }, ph, { timeout: t, polling: 50 });
const waitWin = (p, n = 1, t = 120000) => p.waitForFunction(n => window.__tp.calls.win.length >= n, n, { timeout: t, polling: 100 });
async function playToEnd(p, n = 1) {                          // 下場 → 開戰 → ⏩ → 等 onWin
  await p.click(".tp-go", { timeout: 4000 });
  await p.waitForFunction(() => { const b = document.querySelector(".tp-fight"); return b && !b.disabled && window.__tp.game.state().phase === "morph"; }, null, { timeout: 30000, polling: 50 });
  await p.click(".tp-fight", { timeout: 4000 });
  await p.evaluate(() => window.__tp.game.debug.fast(true));
  await waitWin(p, n);
}

(async () => {
  // ===== ① 靜態（Node） =====
  for (const f of ["js/zhuyin-tops.js", "js/zhuyin-tops-power.js", "js/zhuyin-tops-sim.js"]) {
    let okc = true, err = "";
    try { cp.execSync(`node --input-type=module --check`, { input: fs.readFileSync(path.join(ROOT, f)), stdio: ["pipe", "pipe", "pipe"] }); } catch (e) { okc = false; err = String(e.stderr || e).slice(0, 200); }
    ok(`語法：${f}`, okc, err);
  }
  const P = await import(pathToFileURL(path.join(ROOT, "js/zhuyin-tops-power.js")).href);
  const SIMM = await import(pathToFileURL(path.join(ROOT, "js/zhuyin-tops-sim.js")).href);
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "js/zhuyin-tops-dict.json"), "utf8")), D = P.decodeDict(raw);
  const gz = require("zlib").gzipSync(fs.readFileSync(path.join(ROOT, "js/zhuyin-tops-dict.json")), { level: 9 }).length;
  ok("字典：4000–5000 字、gzip ≤150KB", D.n >= 4000 && D.n <= 5000 && gz <= 150 * 1024, `${D.n} 字、${D.syl.length} 個音節、gzip ${(gz / 1024).toFixed(1)} KB`);
  // tops.js 不能在 Node 直接 import（要 three）→ 用文字解析出 INSPIRE／BONUS_TEXT
  const tsrc = fs.readFileSync(path.join(ROOT, "js/zhuyin-tops.js"), "utf8");
  const INSP = [...tsrc.matchAll(/\["([㐀-鿿]{5})", "([ㄅ-ㄩˊˇˋ˙ ]+)"\]/g)].map(m => [m[1], m[2]]);
  const BT = Object.fromEntries([...tsrc.split("export const BONUS_TEXT = {")[1].split("};")[0].matchAll(/(\w+): "([^"]+)"/g)].map(m => [m[1], m[2]]));
  ok("加成名稱：BONUS_TEXT 跟 TOPS_BONUS 一樣（配音、注音都用這份）", Object.keys(P.BONUS).every(k => P.BONUS[k].name === BT[k]) && Object.keys(BT).length === Object.keys(P.BONUS).length);
  const badInsp = INSP.filter(([h, z]) => { const zs = z.split(" "); return zs.length !== 5 || [...h].some((c, i) => !P.candidates(D, zs[i]).includes(c)) || P.phraseIssue(h, D); });
  ok("隨機靈感：≥20 句、每個字都能用它的注音拼出來、可以上全島榜", INSP.length >= 20 && !badInsp.length, `${INSP.length} 句；拼不出：${badInsp.map(x => x[0]).join("、")}`);
  // GAS 版：同一份公式（vm 跑 .gs）
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "tools/tops/gas/TopsPower.gs"), "utf8") + fs.readFileSync(path.join(ROOT, "tools/tops/gas/TopsDict.gs"), "utf8"), ctx);
  let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const sample = Array.from({ length: 300 }, () => Array.from({ length: 5 }, () => D.chars[Math.floor(rnd() * D.n)]).join("")).concat(PHRASES.map(x => x[0]), ["幹嘛小紅帽", "=宇宙強爸", "爸爸爸爸爸", "媽媽的拖鞋", "他媽的怪獸"]);
  const gasDiff = sample.filter(ph => JSON.stringify(vm.runInContext(`JSON.stringify([topsPowerOf(${JSON.stringify(ph)}, topsDict()), topsPhraseIssue(${JSON.stringify(ph)}, topsDict())])`, ctx)) !== JSON.stringify(JSON.stringify([P.powerOf(ph, D), P.phraseIssue(ph, D)])));
  ok("GAS 版（tools/tops/gas/*.gs）：305 句戰力與審查結果跟前端完全一樣", gasDiff.length === 0, gasDiff.slice(0, 3).join("、"));
  ok("黑名單：「他媽的怪獸」擋、「媽媽的拖鞋」不擋（媽媽先拿掉再比對）、公式開頭擋、表外字擋", P.phraseIssue("他媽的怪獸", D) === "blocked" && P.phraseIssue("媽媽的拖鞋", D) === null && P.phraseIssue("=宇宙強爸", D) === "formula" && P.phraseIssue("宇宙強爸𠀀", D) !== null);
  // 戰力分佈
  const totals = Array.from({ length: 20000 }, () => P.powerOf(Array.from({ length: 5 }, () => D.chars[Math.floor(rnd() * 3000)]).join(""), D).total).sort((a, b) => a - b);
  const q = x => totals[Math.floor(x * (totals.length - 1))];
  const in3065 = totals.filter(x => x >= 3000 && x <= 6500).length / totals.length, ge8 = totals.filter(x => x >= 8000).length / totals.length;
  console.log(`\n戰力分佈（字頻前 3000 字隨機 2 萬句）：p5 ${q(0.05)}、p25 ${q(0.25)}、中位 ${q(0.5)}、p75 ${q(0.75)}、p95 ${q(0.95)}、最高 ${totals[totals.length - 1]}；3000–6500 佔 ${(in3065 * 100).toFixed(1)}%、≥8000 佔 ${(ge8 * 100).toFixed(2)}%`);
  ok("戰力分佈：常見 3000–6500（≥85%）、8000 以上稀有（<0.5%）、上限 9999（亂數組合沒有 9999）", in3065 >= 0.85 && ge8 < 0.005 && totals[totals.length - 1] < 9999, `${(in3065 * 100).toFixed(1)}%／${(ge8 * 100).toFixed(2)}%`);
  const capP = "蘭曇曇鰻鐮", capV = P.powerOf(capP, D);
  ok("上限：刻意湊出來的最強組合封頂 9999、不會超過", capV.total === 9999 && capV.sum + capV.bonuses.reduce((a, b) => a + b.value, 0) > 9999, `${capP} 原始 ${capV.sum}＋加成 → ${capV.total}`);
  const ex = PHRASES.map(([h]) => { const r = P.powerOf(h, D); return `${h} ${r.total}（${r.bonuses.map(b => b.name.replace("！", "")).join("、") || "無加成"}）`; });
  console.log("例句戰力：" + ex.join("　"));
  // 對戰確定性（Node 端）
  const team = ph => ({ p: ph, stats: [...ph].map(c => P.statsOf(c, D)) });
  const sig = m => JSON.stringify({ w: m.winner, s: m.score, r: m.rounds.map(r => [r.winner, r.how, r.sim.n, r.sim.hits.length, Array.from(r.sim.f.slice(-6)).map(v => v.toFixed(12))]) });
  const mA = [0, 1, 2].map(() => sig(SIMM.simulateMatch(team("宇宙強爸爸"), team("超級賽亞人"))));
  const mB = SIMM.simulateMatch(team("超級賽亞人"), team("宇宙強爸爸")), mA0 = SIMM.simulateMatch(team("宇宙強爸爸"), team("超級賽亞人"));
  ok("對戰確定性（Node）：同兩句跑 3 次每步位置都一樣；A 打 B＝B 打 A（勝負對調）", mA[0] === mA[1] && mA[1] === mA[2] && mB.rounds.every((r, i) => r.how === mA0.rounds[i].how && r.winner !== mA0.rounds[i].winner) && mB.winner !== mA0.winner,
    `宇宙強爸爸 vs 超級賽亞人：${mA0.winner === "a" ? "宇宙強爸爸" : "超級賽亞人"} 勝 ${mA0.score.join(":")}（${mA0.rounds.map(r => r.winner + r.how).join(" ")}）`);
  // 物理統計（大樣本）：回合長度 ≤12 秒、三種結束方式都會出現、強的比較常贏但不是穩贏
  { const how = {}; let fav = 0, favN = 0, maxN = 0;
    for (let t = 0; t < 1500; t++) { const a = D.chars[Math.floor(rnd() * 3000)], b = D.chars[Math.floor(rnd() * 3000)], sa = P.statsOf(a, D), sb = P.statsOf(b, D), r = SIMM.simRound(sa, sb, P.hashStr(a + b + t));
      how[r.end.how] = (how[r.end.how] || 0) + 1; maxN = Math.max(maxN, r.n); const pa = P.charPower(sa), pb = P.charPower(sb); if (Math.abs(pa - pb) > 300) { favN++; if ((pa > pb) === (r.end.loser === 1)) fav++; } }
    ok("對戰物理：每回合 ≤12 秒、撞出場／停下來／時間到都會發生、單字戰力多 300 的勝率 65–90%", maxN <= 720 && how.out > 50 && how.stop > 300 && how.time > 20 && fav / favN > 0.65 && fav / favN < 0.9,
      `撞出場 ${how.out}、停下來 ${how.stop}、時間到 ${how.time}（1500 回合）；強方勝率 ${(fav / favN * 100).toFixed(0)}%`); }

  const browser = await launch();

  // ===== ② 打字（真的按鍵） =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4");
    const got = [];
    for (const [h, z] of PHRASES) {
      await p.evaluate(() => window.__tp.game.start());
      await p.waitForFunction(() => window.__tp.game.state().phase === "type", null, { timeout: 15000 });
      const zs = z.split(" "); let okAll = true;
      for (let i = 0; i < 5; i++) okAll = (await typeChar(p, h[i], zs[i])) && okAll;
      const s = await S(p); got.push(s.slots.map(x => x ? x.ch : "_").join(""));
    }
    ok("鍵盤：四句例句都能用注音鍵盤逐字拼出來（宇宙強爸爸的第二個爸＝ㄅㄚ˙）", got.join() === PHRASES.map(x => x[0]).join(), got.join("、"));
    await shot(p, "1024x768_type_filled");
    // 破音字
    await p.evaluate(() => window.__tp.game.start()); await waitPhase(p, "type");
    const poly = {};
    for (const syl of ["ㄓㄨㄥˋ", "ㄔㄨㄥˊ", "ㄒㄧㄥˊ", "ㄏㄤˊ", "ㄔㄤˊ", "ㄓㄤˇ", "ㄌㄜˋ", "ㄩㄝˋ", "ㄑㄧˊ"]) { await typeSyl(p, syl); poly[syl] = (await S(p)).cands.slice(0, 12).join(""); await key(p, "back"); await key(p, "back"); await key(p, "back"); await key(p, "back"); }
    const has = (syl, c) => poly[syl] && poly[syl].includes(c);
    ok("破音字：候選依讀音列（重：ㄓㄨㄥˋ／ㄔㄨㄥˊ；行：ㄒㄧㄥˊ／ㄏㄤˊ；長：ㄔㄤˊ／ㄓㄤˇ；樂：ㄌㄜˋ／ㄩㄝˋ；期＝台灣讀音 ㄑㄧˊ）",
      has("ㄓㄨㄥˋ", "重") && has("ㄔㄨㄥˊ", "重") && has("ㄒㄧㄥˊ", "行") && has("ㄏㄤˊ", "行") && has("ㄔㄤˊ", "長") && has("ㄓㄤˇ", "長") && has("ㄌㄜˋ", "樂") && has("ㄩㄝˋ", "樂") && has("ㄑㄧˊ", "期"), JSON.stringify(poly));
    // 不合法音節：ㄅㄩˊ → 沒有候選、搖一下、說「這個拼不出字喔」
    await p.evaluate(() => { window.__tp.calls.talk.length = 0; });
    await typeSyl(p, "ㄅㄩˊ");
    const bad = await p.evaluate(() => ({ s: window.__tp.game.state(), shake: !!document.querySelector(".tp-shake"), talk: window.__tp.calls.talk.slice() }));
    ok("不合法音節（ㄅㄩ）：不出候選、輕輕搖一下、說「這個拼不出字喔」", bad.s.cands.length === 0 && bad.shake && bad.talk.some(t => t.includes("拼不出字")), JSON.stringify({ c: bad.s.cands.length, shake: bad.shake }));
    for (let i = 0; i < 4; i++) await key(p, "back");
    // 拼了沒按聲調直接按確定＝一聲
    await key(p, "ㄅ"); await key(p, "ㄚ"); await key(p, "ok");
    const one = await S(p);
    ok("拼了沒按聲調就按「確定」＝一聲（ㄅㄚ → 八、巴…）", one.cands.includes("八") && one.tone === "1", one.cands.slice(0, 5).join(""));
    await key(p, "ok");
    const conf = await S(p);
    ok("再按確定＝把選取的字放進格子、換下一格", conf.slots[0] && conf.slots[0].ch === one.cands[0] && conf.cur === 1, JSON.stringify(conf.slots[0]));
    await key(p, "back");
    const del = await S(p);
    ok("⌫ 沒在拼的時候＝刪掉前一格", !del.slots[0] && del.cur === 0);
    // ===== 10-12 櫻木 A1：選字陷阱 =====
    await typeSyl(p, "ㄇㄠ");
    const c1 = await S(p), pickI = Math.min(2, c1.cands.length - 1), pickCh = c1.cands[pickI];
    await p.click(`.tp-cand[data-i="${pickI}"]`);
    const a1 = await S(p);
    ok("A1 候選字點一下就確定（點第 3 個也一樣，不用再按確定）", a1.slots[0] && a1.slots[0].ch === pickCh && a1.cur === 1 && a1.cands.length === 0, JSON.stringify({ pickCh, s: a1.slots[0], cur: a1.cur }));
    await typeSyl(p, "ㄅㄚˋ");
    const c2 = await S(p), prevCh = c2.cands[c2.sel];
    await key(p, "ㄇ");                                            // 選字中直接按下一個注音
    const a1b = await S(p);
    ok("A1 選字中按注音鍵＝先確定預覽的字，再開始拼下一格", a1b.slots[1] && a1b.slots[1].ch === prevCh && a1b.cur === 2 && a1b.comp === "ㄇ" && a1b.cands.length === 0, JSON.stringify({ prevCh, s: a1b.slots[1], cur: a1b.cur, comp: a1b.comp }));
    await key(p, "back"); await key(p, "back"); await key(p, "back"); await key(p, "back");
    // ===== A2：拼不出的鍵變灰 =====
    const g0 = await S(p);
    await key(p, "ㄅ");
    const g1 = await p.evaluate(() => ({ s: window.__tp.game.state(), dimU: document.querySelector('.tp-key[data-k="ㄩ"]').classList.contains("tp-dim"), dimA: document.querySelector('.tp-key[data-k="ㄚ"]').classList.contains("tp-dim") }));
    await key(p, "ㄩ"); await sleep(60);
    const g2 = await p.evaluate(() => ({ s: window.__tp.game.state(), shake: document.querySelector('.tp-key[data-k="ㄩ"]').classList.contains("tp-shake") }));
    ok("A2 灰鍵：沒拼東西時聲調鍵全灰；按了ㄅ之後ㄩ變灰（ㄅㄩ 拼不出字）、ㄚ沒灰；按灰鍵只輕搖、組合不變", ["1", "ˊ", "ˇ", "ˋ", "˙"].every(t => g0.keysOff.includes(t)) && g1.dimU && !g1.dimA && g1.s.keysOff.includes("ㄩ") && g2.s.comp === "ㄅ" && g2.shake && g2.s.greyTaps >= 1,
      JSON.stringify({ off0: g0.keysOff.join(""), off1: g1.s.keysOff.join(""), comp: g2.s.comp, shake: g2.shake }));
    await key(p, "back");
    await key(p, "ㄩ"); await key(p, "ㄥ");
    const g3 = await S(p);
    ok("A2 拼出音節後聲調鍵都可以按（這個聲調沒有字也照樣列別的聲調——三聲變調，見 A3）", ["1", "ˊ", "ˇ", "ˋ", "˙"].every(t => !g3.keysOff.includes(t)), JSON.stringify({ off: g3.keysOff.join("") }));
    await key(p, "back"); await key(p, "back"); await key(p, "back");
    // ===== A3：候選字排序（同聲調→其他聲調；兒童常用字優先；emoji） =====
    await typeSyl(p, "ㄩㄥˊ");
    const o1 = await S(p), yi = o1.cands.indexOf("勇");
    const ownN = o1.candZ.filter(z => z === "ㄩㄥˊ").length;
    ok("A3 三聲變調：拼 ㄩㄥˊ 也找得到「勇」（排在 ㄩㄥˊ 的字後面、帶自己的注音 ㄩㄥˇ）", yi >= ownN && o1.candZ[yi] === "ㄩㄥˇ" && o1.candZ.slice(0, ownN).every(z => z === "ㄩㄥˊ"), JSON.stringify({ yi, ownN, first: o1.cands.slice(0, 8).join("") }));
    for (let i = 0; i < 12 && !(await p.$('.tp-cand[data-ch="勇"]')); i++) { if (!(await p.$(".tp-next:not(.tp-hide)"))) break; await p.click(".tp-next"); }
    await p.click('.tp-cand[data-ch="勇"]');
    const o1b = await S(p);
    ok("A3 選了別的聲調的字：格子存它自己的注音（勇＝ㄩㄥˇ）", o1b.slots[0] && o1b.slots[0].ch === "勇" && o1b.slots[0].z === "ㄩㄥˇ", JSON.stringify(o1b.slots[0]));
    await key(p, "back");
    await typeSyl(p, "ㄇㄠ");
    const o2 = await p.evaluate(() => ({ s: window.__tp.game.state(), emo: (document.querySelector('.tp-cand[data-ch="貓"] .tp-emo') || {}).textContent || "" }));
    const kidOk = await p.evaluate(cands => cands.slice(0, 3).filter(c => window.__tp.mod.isKidChar(c)).length, o2.s.cands);
    const kidAll = await p.evaluate(cands => cands.map(c => window.__tp.mod.isKidChar(c)), o2.s.cands);
    const ownK = kidAll.slice(0, o2.s.candZ.filter(z => z === "ㄇㄠ").length), sorted = ownK.every((k, i) => !i || ownK[i - 1] || !k);   // 同聲調那段：常用字（true）都在非常用字（false）前面
    ok("A3 兒童常用字排前面（ㄇㄠ：貓在前 3 個；同聲調裡常用字都在非常用字前面）、具體名詞附 emoji（貓🐱）", o2.s.cands.slice(0, 3).includes("貓") && kidOk >= 1 && sorted && o2.emo === "🐱", JSON.stringify({ first: o2.s.cands.slice(0, 6).join(""), emo: o2.emo, ownK }));
    await key(p, "back"); await key(p, "back"); await key(p, "back");
    await shot(p, "1024x768_type_greykeys");
    // 按鍵大小（三種尺寸在 ⑨ 再量）
    ok("第 2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== A4：🎲 填空引導 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&tickets=3");
    await p.evaluate(() => { window.__tp.game.debug.resetInspire(); window.__tp.calls.talk.length = 0; });
    await p.click(".tp-inspire"); await sleep(150);
    const d1 = await S(p);
    const ph1 = d1.slots.map(x => x && x.ch).join("");
    ok("A4 第一次按 🎲＝整句幫你填好（先知道好玩）、唸出這句（內建詞句有預錄：「宇宙強爸爸！」）", d1.slots.every(Boolean) && !d1.guide && d1.spoken.includes(ph1 + "！"), JSON.stringify({ ph1, spoken: d1.spoken.slice(-2) }));
    const n0 = d1.spoken.length;
    await p.click(".tp-inspire"); await sleep(150);
    const d2 = await p.evaluate(() => { const s = window.__tp.game.state(); const glow = [...document.querySelectorAll(".tp-key.tp-guide")].map(e => e.dataset.k); return { s, glow, fill: !document.querySelector(".tp-fillall").classList.contains("tp-off") }; });
    const ph2 = d2.s.slots.slice(0, 4).map(x => x && x.ch).join("") + d2.s.guideCh, said2 = d2.s.spoken.slice(n0);
    ok("A4 之後按 🎲＝填前 4 個字、第 5 格空著；下一個該按的鍵在發光；有「全部幫我填」；唸出整句＋「跟著發亮的按鍵」", d2.s.slots.slice(0, 4).every(Boolean) && !d2.s.slots[4] && d2.s.cur === 4 && d2.glow.length === 1 && d2.glow[0] === d2.s.guide.key && d2.fill && said2[0] === ph2 + "！" && said2.some(t => t.includes("發亮")),
      JSON.stringify({ ph2, glow: d2.glow, said2 }));
    await shot(p, "1024x768_guide_glow");
    const seq = [];
    for (let k = 0; k < 10; k++) {
      const s = await S(p); if (!s.guide) break; const g = s.guide; seq.push(g.cand != null ? "cand" : g.key);
      if (k === 2) await shot(p, "1024x768_guide_glow2");
      if (g.key === "ok" || g.cand != null) await key(p, "ok"); else await key(p, g.key);
    }
    const d3 = await S(p);
    ok("A4 照著發光的鍵按（聲母→介音→韻母→聲調→確定）就拼出第 5 個字、句子完成", d3.slots.every(Boolean) && d3.slots.map(x => x.ch).join("") === ph2 && !d3.guide && seq[seq.length - 1] === "cand", JSON.stringify({ seq, got: d3.slots.map(x => x.ch).join("") }));
    // 全部幫我填
    await p.click(".tp-inspire"); await sleep(120);
    const d4 = await S(p);
    await p.click(".tp-fillall"); await sleep(80);
    const d5 = await S(p);
    ok("A4「全部幫我填」：直接補上第 5 個字", !d4.slots[4] && d5.slots.every(Boolean) && d5.slots[4].ch === d4.guideCh && !d5.guide, JSON.stringify({ want: d4.guideCh, got: d5.slots[4] }));
    ok("A4 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ③ 同一句兩次載入戰力一樣 =====
  {
    const pages = [];
    for (let k = 0; k < 2; k++) pages.push(await open(browser, 800, 600, "fast=4"));
    const list = PHRASES.map(x => x[0]).concat(sample.slice(0, 40));
    const res = await Promise.all(pages.map(({ p }) => p.evaluate(list => import("../../js/zhuyin-tops-power.js").then(P => { const D = window.__tp.game.debug.dict(); return list.map(ph => P.powerOf(ph, D).total); }), list)));
    const node = list.map(ph => P.powerOf(ph, D).total);
    ok("戰力：同一句在兩次載入（兩個分頁）＋ Node 算出來完全一樣", JSON.stringify(res[0]) === JSON.stringify(res[1]) && JSON.stringify(res[0]) === JSON.stringify(node), list.slice(0, 4).map((ph, i) => ph + " " + node[i]).join("、"));
    // ④ 瀏覽器裡的對戰確定性（3 次）＋跟 Node 一樣
    const bs = await pages[0].p.evaluate(() => import("../../js/zhuyin-tops-sim.js").then(async M => { const P = await import("../../js/zhuyin-tops-power.js"), D = window.__tp.game.debug.dict();
      const team = ph => ({ p: ph, stats: [...ph].map(c => P.statsOf(c, D)) });
      const sig = m => JSON.stringify({ w: m.winner, s: m.score, r: m.rounds.map(r => [r.winner, r.how, r.sim.n, r.sim.hits.length, Array.from(r.sim.f.slice(-6)).map(v => v.toFixed(12))]) });
      return [0, 1, 2].map(() => sig(M.simulateMatch(team("宇宙強爸爸"), team("超級賽亞人")))); }));
    ok("對戰確定性（瀏覽器）：同兩句對戰 3 次每回合勝負、結束方式、最後位置都一樣，也跟 Node 一樣", bs[0] === bs[1] && bs[1] === bs[2] && bs[0] === mA[0]);
    for (const { ctx } of pages) await ctx.close();
  }

  // ===== ④-2 介面實打兩次：同一句對同一隊，onWin 的回合結果一樣 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=6&opp=" + encodeURIComponent("超級賽亞人"));
    const runs = [];
    await p.evaluate(() => { window.__slowSeen = 0; setInterval(() => { const s = window.__tp.game.state(); if (s && s.round && s.round.slow) window.__slowSeen++; }, 15); });
    for (let k = 0; k < 2; k++) {
      await p.evaluate(() => window.__tp.game.start({ opponent: { p: "超級賽亞人" } })); await waitPhase(p, "type");
      await p.evaluate(() => window.__tp.game.debug.setPhrase("宇宙強爸爸"));
      await playToEnd(p, k + 1);
      const w = await p.evaluate(k => window.__tp.calls.win[k], k);
      runs.push(JSON.stringify({ win: w.win, score: w.score, rounds: w.rounds, power: w.power }));
    }
    ok("對戰確定性（介面實打 2 次）：宇宙強爸爸 vs 超級賽亞人 每回合勝負與最終結果一樣", runs[0] === runs[1], runs[0].slice(0, 160));
    ok("最後一擊慢動作：決勝回合的最後一下有慢動作", (await p.evaluate(() => window.__slowSeen)) > 3);
    ok("第 4-2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑤ 券 =====
  {
    // A5（10-12 櫻木）沒券、不是第一次 → 照樣進打字畫面；「下場！」變「存成蛋！」→ 存成陀螺蛋（最多 3 顆）、顯示 15 格集點卡；不扣券
    const a = await open(browser, 1024, 768, "fast=4&tickets=0&stars=8&eggs=clear");
    const s0 = await S(a.p), goT = await a.p.evaluate(() => document.querySelector(".tp-go-t").textContent);
    ok("A5 沒券：照樣進打字畫面（陀螺蛋模式），下場鈕寫「存成蛋！」、說明打好的句子會變成陀螺蛋", s0.phase === "type" && s0.eggMode && goT === "存成蛋！" && s0.spoken.some(t => t.includes("陀螺蛋")), JSON.stringify({ ph: s0.phase, egg: s0.eggMode, goT }));
    const eggPh = ["宇宙強爸爸", "超級賽亞人", "努力小紅帽", "紅色翹翹板"], eggSaved = [];
    for (const ph of eggPh) {
      if ((await S(a.p)).phase !== "type") { await a.p.click(".tp-msg-card .tp-again"); await waitPhase(a.p, "type"); }
      await a.p.evaluate(ph => window.__tp.game.debug.setPhrase(ph), ph); await a.p.click(".tp-go"); await sleep(150);
      eggSaved.push(await a.p.evaluate(() => ({ s: window.__tp.game.state(), lit: document.querySelectorAll(".tp-msg-card .tp-star.tp-lit").length, all: document.querySelectorAll(".tp-msg-card .tp-star").length })));
      if (eggSaved.length === 1) await shot(a.p, "1024x768_egg_saved");
    }
    const e1 = eggSaved[0], eN = eggSaved[eggSaved.length - 1];
    ok("A5 存成陀螺蛋：畫面「陀螺蛋存好了！拿到陀螺券就能孵出來」＋15 格集點卡亮 8 格；不扣券", e1.s.phase === "egg" && e1.s.eggs.length === 1 && e1.s.eggs[0].p === "宇宙強爸爸" && e1.lit === 8 && e1.all === 15 && (await a.p.evaluate(() => window.__tp.calls.useTicket)) === 0 && e1.s.spoken.some(t => t.includes("陀螺蛋存好了")), JSON.stringify({ eggs: e1.s.eggs, lit: e1.lit }));
    ok("A5 陀螺蛋最多 3 顆（存第 4 顆擠掉最舊的）、每顆帶注音", eN.s.eggs.length === 3 && eN.s.eggs.map(e => e.p).join() === eggPh.slice(1).join() && eN.s.eggs.every(e => e.z.length === 5), JSON.stringify(eN.s.eggs.map(e => e.p)));
    await a.p.click(".tp-msg-card .tp-home"); await sleep(100);
    ok("A5 蛋畫面按 🏝️ → 回小島（onExit noticket）", (await a.p.evaluate(() => window.__tp.calls.exit)).some(e => e.why === "noticket"));
    // 有券又有蛋：開局先問要不要孵蛋 → 點蛋＝直接下場（扣 1 張）；打完那顆蛋用掉
    await a.p.evaluate(() => { window.__tp.setTickets(1); window.__tp.game.start(); });
    await waitPhase(a.p, "eggs");
    const ep = await a.p.evaluate(() => ({ n: document.querySelectorAll(".tp-egg-btn").length, first: document.querySelector(".tp-egg-btn").dataset.p, spoken: window.__tp.game.state().spoken }));
    await shot(a.p, "1024x768_egg_pick");
    await a.p.click(`.tp-egg-btn[data-p="${ep.first}"]`);
    await waitPhase(a.p, "morph");
    const hatch = await S(a.p);
    ok("A5 有券又有蛋：開局先問「要孵出來對戰嗎」（列出 3 顆、最新的在最上面）→ 點蛋直接下場、扣 1 張券", ep.n === 3 && ep.first === "紅色翹翹板" && ep.spoken.some(t => t.includes("孵出來對戰")) && hatch.phrase === "紅色翹翹板" && (await a.p.evaluate(() => window.__tp.calls.useTicket)) === 1, JSON.stringify({ ep, ph: hatch.phrase }));
    await a.p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 30000 }); await a.p.click(".tp-fight");
    await a.p.evaluate(() => window.__tp.game.debug.fast(true)); await waitWin(a.p, 1);
    const afterH = await S(a.p);
    ok("A5 孵出來打完：那顆蛋用掉（剩 2 顆）", afterH.eggs.length === 2 && !afterH.eggs.some(e => e.p === "紅色翹翹板"), JSON.stringify(afterH.eggs.map(e => e.p)));
    ok("A5 段：沒有錯誤", a.errs.length === 0, a.errs.join(" | "));
    await a.ctx.close();
    // 有券：打字打一半離開 → 不扣券；下場 → 扣 1 張
    const b = await open(browser, 1024, 768, "fast=6&tickets=2");
    await typeChar(b.p, "宇", "ㄩˇ"); await typeChar(b.p, "宙", "ㄓㄡˋ");
    await b.p.evaluate(() => window.__tp.game.stop());
    const u1 = await b.p.evaluate(() => ({ use: window.__tp.calls.useTicket, t: window.__tp.api.tickets() }));
    await b.p.evaluate(() => window.__tp.game.start()); await waitPhase(b.p, "type");
    await b.p.click(".tp-inspire"); await b.p.click(".tp-go");
    await waitPhase(b.p, "morph");
    const u2 = await b.p.evaluate(() => ({ use: window.__tp.calls.useTicket, t: window.__tp.api.tickets() }));
    ok("券：打字階段離開不扣券；按「下場！」才扣 1 張", u1.use === 0 && u1.t === 2 && u2.use === 1 && u2.t === 1, JSON.stringify({ u1, u2 }));
    await b.ctx.close();
    // 第一次免費：沒券也能玩，下場時 useTicket（主程式記 freeUsed）
    const c = await open(browser, 1024, 768, "fast=6&tickets=0&first=1");
    const s1 = await S(c.p);
    await c.p.click(".tp-inspire"); await c.p.click(".tp-go"); await waitPhase(c.p, "morph");
    const u3 = await c.p.evaluate(() => ({ use: window.__tp.calls.useTicket, first: window.__tp.api.firstFree() }));
    ok("券：第一次免費（沒券也能進來、下場時通知主程式用掉免費那次）", s1.phase === "type" && u3.use === 1 && u3.first === false, JSON.stringify(u3));
    await c.ctx.close();
  }

  // ===== ⑥ stop() 收乾淨＋開關 5 次沒有 WebGL 洩漏 =====
  {
    const rafWrap = () => { const orig = window.requestAnimationFrame.bind(window); window.__rafRuns = 0; window.requestAnimationFrame = cb => orig(t => { window.__rafRuns++; cb(t); }); };
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&tickets=99", { initScript: rafWrap });
    const ctx0 = await p.evaluate(() => window.__tp.mod.CTX.made);
    for (let k = 0; k < 5; k++) {
      await p.evaluate(() => window.__tp.game.start()); await waitPhase(p, "type");
      await p.click(".tp-inspire"); await p.click(".tp-go"); await waitPhase(p, "morph");
      if (k % 2) { await p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 20000 }); await p.click(".tp-fight"); await waitPhase(p, "battle"); await sleep(400); }
      await p.evaluate(() => window.__tp.game.stop());
    }
    const c = await p.evaluate(() => ({ ...window.__tp.mod.CTX }));
    ok("開關 5 次（含進對戰中途離開）：建了 5 個 WebGL context、全部釋放（live＝0）", c.made - ctx0 === 5 && c.live === 0, JSON.stringify(c));
    // 對戰中 stop：之後沒有 rAF、沒有新的語音、later 回呼作廢、DOM 清掉
    await p.evaluate(() => window.__tp.game.start()); await waitPhase(p, "type");
    await p.click(".tp-inspire"); await p.click(".tp-go"); await waitPhase(p, "morph");
    await p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 20000 }); await p.click(".tp-fight"); await waitPhase(p, "battle"); await sleep(300);
    const before = await p.evaluate(() => { window.__tp.game.stop(); return { raf: window.__rafRuns, talk: window.__tp.calls.talk.length, play: window.__tp.calls.play.length, pending: window.__tp.timers.size }; });
    await sleep(2500);
    const after = await p.evaluate(() => ({ raf: window.__rafRuns, talk: window.__tp.calls.talk.length, play: window.__tp.calls.play.length, pending: window.__tp.timers.size, dom: !!document.querySelector(".tp-wrap"), st: window.__tp.game.state(), dbgRaf: window.__tp.game.debug.raf(), live: window.__tp.mod.CTX.live }));
    ok("stop()（對戰中）：之後 0 次 rAF、0 句新語音、0 個新音效、later 回呼作廢（pending 只減不增）、DOM 與 WebGL 都清掉",
      after.raf === before.raf && after.talk === before.talk && after.play === before.play && after.pending <= before.pending && !after.dom && after.st === null && after.dbgRaf === 0 && after.live === 0, JSON.stringify({ before, after: { ...after, st: undefined } }));
    ok("第 6 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑦ 送出全島榜 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=6&tickets=99");
    const cases = [];
    const hi = INSP.map(x => x[0]).concat(["鯨魚霸王龍", "龍龍超級鬥"]).map(ph => [ph, P.powerOf(ph, D).total]).filter(([ph]) => !P.phraseIssue(ph, D)).sort((a, b) => b[1] - a[1])[0][0];
    // 自由打的句子（不在任何清單）：強的會送、黑名單不送、太弱不送
    const free = "鬱鬱龍霸王", blocked = "白癡大怪獸", weak = "力了人八十";
    for (const [ph, label] of [[free, "自由輸入（強）"], [blocked, "含黑名單"], [weak, "太弱（進不了前 5）"]]) {
      await p.evaluate(() => window.__tp.game.start()); await waitPhase(p, "type");
      await p.evaluate(ph => window.__tp.game.debug.setPhrase(ph), ph);
      const n0 = await p.evaluate(() => window.__tp.calls.submit.length), w0 = await p.evaluate(() => window.__tp.calls.win.length);
      await playToEnd(p, w0 + 1); await sleep(300);
      const sub = await p.evaluate(n0 => window.__tp.calls.submit.slice(n0), n0);
      cases.push({ ph, label, power: P.powerOf(ph, D).total, issue: P.phraseIssue(ph, D), sent: sub.length, payload: sub[0] || null });
    }
    const [cf, cb, cw] = cases;
    ok("送出：自由輸入、戰力能進前 5 的會呼叫 onSubmit（只送詞句＋戰力）", cf.sent === 1 && cf.payload.p === free && Object.keys(cf.payload).join() === "p,power", JSON.stringify(cf));
    ok("送出：含黑名單的不送（照樣能玩、進我家排行）", cb.sent === 0 && cb.issue === "blocked", JSON.stringify(cb));
    ok("送出：太弱進不了前 5 的不送（永遠不離開裝置）", cw.sent === 0 && cw.power < 3618, JSON.stringify(cw));
    const st = await p.evaluate(() => document.querySelector(".tp-rstatus") && document.querySelector(".tp-rstatus").textContent);
    const homeOk = await p.evaluate(() => { const w = window.__tp.calls.win; const h = w[w.length - 1].home; return h.length >= 1 && h.every((e, i, a) => !i || a[i - 1].power >= e.power); });
    ok("結算：我家排行照戰力排、onWin 帶更新後的前 5 名", homeOk);
    // 待審核：stub 回 { pending:true } → 顯示「審核後就會上榜喔！」（用強的那句再打一次）
    await p.evaluate(() => window.__tp.game.start()); await waitPhase(p, "type");
    await p.evaluate(ph => window.__tp.game.debug.setPhrase(ph), "鬱鬱霸王龍");
    const w1 = await p.evaluate(() => window.__tp.calls.win.length); await playToEnd(p, w1 + 1);
    await p.waitForFunction(() => document.querySelector(".tp-rstatus") && /審核/.test(document.querySelector(".tp-rstatus").textContent), null, { timeout: 15000 }).catch(() => {});
    const pend = await p.evaluate(() => document.querySelector(".tp-rstatus") && document.querySelector(".tp-rstatus").textContent);
    ok("送出後待審核：送出的那台顯示「審核後就會上榜喔！」", /審核後就會上榜喔/.test(pend || ""), pend);
    ok("第 7 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑧ 暫停 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=2&tickets=9");
    await p.click(".tp-inspire"); await p.click(".tp-go"); await waitPhase(p, "morph");
    await p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 20000 }); await p.click(".tp-fight");
    await p.waitForFunction(() => { const s = window.__tp.game.state(); return s.round && s.round.stage === "fight"; }, null, { timeout: 20000 });
    const a = await p.evaluate(() => { window.__tp.setPaused(true); return window.__tp.game.state().clock; });
    await sleep(800);
    const b = await p.evaluate(() => window.__tp.game.state().clock);
    await p.evaluate(() => window.__tp.setPaused(false)); await sleep(400);
    const c = await p.evaluate(() => window.__tp.game.state().clock);
    ok("暫停：遊戲時鐘（對戰播放、排程）凍結，繼續後接著走", Math.abs(b - a) < 0.05 && c > b + 0.2, `暫停前 ${a.toFixed(2)}、暫停 0.8 秒後 ${b.toFixed(2)}、繼續後 ${c.toFixed(2)}`);
    ok("第 8 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== B6–B9、C10–C15（10-12 櫻木／里維改善） =====
  {
    // B9（Node）：加成的字＝哪幾個、對戰能力 +N、戰力不變、加成後的對戰仍然確定性且 A 打 B＝B 打 A
    const pw = P.powerOf("紅色翹翹板", D), hits = SIMM.bonusHits(pw), bs = SIMM.boostStats(pw.perChar.map(c => c.stats), hits);
    const okHits = JSON.stringify(hits) === JSON.stringify({ double: [2, 3], tone: [1, 2, 3], color: [0] });
    const okBoost = bs[0][3] === Math.min(99, pw.perChar[0].stats[3] + SIMM.BOOST.color[1]) && bs[2][1] === Math.min(99, pw.perChar[2].stats[1] + SIMM.BOOST.double[1]) && bs[2][0] === Math.min(99, pw.perChar[2].stats[0] + SIMM.BOOST.tone[1]) && JSON.stringify(bs[4]) === JSON.stringify(pw.perChar[4].stats);
    const pw2 = P.powerOf("熊貓愛跳舞", D), h2 = SIMM.bonusHits(pw2);
    ok("B9 加成的字：紅色翹翹板＝疊字[翹翹]、同聲調[色翹翹]、顏色[紅]；熊貓愛跳舞有動物[熊貓]；對戰能力照 BOOST 加（上限 99）、沒加成的字不變", okHits && okBoost && JSON.stringify(h2.animal) === "[0,1]", JSON.stringify({ hits, h2 }));
    const bteam = ph => { const w = P.powerOf(ph, D); return { p: ph, stats: SIMM.boostStats(w.perChar.map(c => c.stats), SIMM.bonusHits(w)) }; };
    const sA = [0, 1, 2].map(() => sig(SIMM.simulateMatch(bteam("紅色翹翹板"), bteam("熊貓愛跳舞")))), sB = SIMM.simulateMatch(bteam("熊貓愛跳舞"), bteam("紅色翹翹板")), sA0 = SIMM.simulateMatch(bteam("紅色翹翹板"), bteam("熊貓愛跳舞"));
    ok("B9 加成後的對戰：同兩句 3 次一模一樣、A 打 B＝B 打 A；戰力（power.js）不受影響", sA[0] === sA[1] && sA[1] === sA[2] && sB.winner !== sA0.winner && sB.rounds.every((r, i) => r.how === sA0.rounds[i].how) && pw.total === 5289, `紅色翹翹板 ${pw.total}`);
    // C14（靜態）：import 網址版號一致
    const simSrc = fs.readFileSync(path.join(ROOT, "js/zhuyin-tops-sim.js"), "utf8"), mainSrc = fs.readFileSync(path.join(ROOT, "js/zhuyin.js"), "utf8");
    const imp = s => [...s.matchAll(/from "\.\/(zhuyin-tops-[\w-]+\.js[^"]*)"/g)].map(m => m[1]);
    ok("C14 tops.js 與 sim.js 對 power.js 的 import 網址完全一樣（?v=1）、tops.js 對 sim.js ?v=1、字典 ?v=1；主程式 import tops.js?v=1",
      imp(tsrc).includes("zhuyin-tops-power.js?v=1") && imp(simSrc).join() === "zhuyin-tops-power.js?v=1" && imp(tsrc).includes("zhuyin-tops-sim.js?v=1") && /DICT_URL = ROOT \+ "js\/zhuyin-tops-dict\.json\?v=1"/.test(tsrc) && mainSrc.includes('"./zhuyin-tops.js?v=1"') && mainSrc.includes('"./zhuyin-tops-dict.json?v=1"'), JSON.stringify({ tops: imp(tsrc), sim: imp(simSrc) }));
    ok("C13 paintGauges 不再每格 querySelector（用 paintTeams 快取的 E.gfill）", /function paintGauges[\s\S]{0,200}E\.gfill/.test(tsrc) && !/function paintGauges\(S\) \{[^}]*querySelector/.test(tsrc));
    // KID_EXTRA 有收配送站商品／禮物、寵物名
    const dsrc = fs.readFileSync(path.join(ROOT, "js/zhuyin-deliver.js"), "utf8"), rsrc = fs.readFileSync(path.join(ROOT, "js/zhuyin-rewards.js"), "utf8");
    const need = [...dsrc.split("export const GOODS = {")[1].split("};")[0].matchAll(/h: "([^"]+)"/g), ...dsrc.split("export const GIFTS = {")[1].split("};")[0].matchAll(/h: "([^"]+)"/g), ...rsrc.split("export const PETS = [")[1].split("];")[0].matchAll(/name: "([^"]+)"|"([㐀-鿿]+)"\]/g)].map(m => m[1] || m[2]).join("");
    const extra = (tsrc.match(/KID_EXTRA = "([^"]+)"/) || [])[1] || "", miss = [...new Set(need)].filter(c => !extra.includes(c));
    ok("A3 兒童常用字：KID_EXTRA 有收配送站商品、禮物、寵物名的每個字", !miss.length && need.length > 40, miss.join(""));
  }
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=6&tickets=9&first=1");
    // B6a 第一次免費那場：挑小孩會贏的對手（弱句子也贏）
    await p.evaluate(() => window.__tp.game.debug.setPhrase("力了人八十"));
    await p.click(".tp-go"); await waitPhase(p, "morph");
    await p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 30000 });
    const vs = await p.evaluate(() => ({ s: window.__tp.game.state(), fills: [...document.querySelectorAll(".tp-pw-fill")].map(e => +getComputedStyle(e).getPropertyValue("--w")), tiers: [...document.querySelectorAll(".tp-vs-info .tp-tier")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")), nums: [...document.querySelectorAll(".tp-pw-n")].map(e => +e.textContent) }));
    const tierOf = v => v >= 6200 ? "彩虹陀螺" : v >= 5200 ? "金陀螺" : v >= 4200 ? "銀陀螺" : "銅陀螺";
    ok("B8 對戰前兩隊戰力長條並排（長短照戰力比例）＋等級徽章＋數字", vs.fills.length === 2 && vs.nums[0] === vs.s.power && vs.nums[1] === vs.s.opp.power && Math.abs(vs.fills[0] / vs.fills[1] - vs.nums[0] / vs.nums[1]) < 0.01 && vs.tiers.length === 2 && vs.tiers.every((t, i) => t.endsWith(tierOf(vs.nums[i]))), JSON.stringify(vs.fills.concat(vs.tiers, vs.nums)));
    await p.click(".tp-fight"); await p.evaluate(() => window.__tp.game.debug.fast(true)); await waitWin(p, 1);
    const w1 = await p.evaluate(() => window.__tp.calls.win[0]), s1 = await S(p);
    ok("B6a 第一次免費那場：先把候選對手都模擬一遍、挑會贏的（力了人八十 2035 也贏）", s1.isFree && s1.oppWhy === "free" && w1.win === true, JSON.stringify({ opp: w1.opponent, score: w1.score, why: s1.oppWhy }));
    // B6b 輸了：換個對手再打（不扣券、不用重打字、每張券限一次）；B6c 同一句再下場避開打過的
    await p.evaluate(() => window.__tp.game.start({ opponent: { p: "愛睡覺的貓" } })); await waitPhase(p, "type");
    await p.evaluate(() => window.__tp.game.debug.setPhrase("力了人八十"));
    const u0 = await p.evaluate(() => window.__tp.calls.useTicket);
    await playToEnd(p, 2);
    await p.waitForFunction(() => document.querySelector(".tp-rpanel"), null, { timeout: 20000 }); await sleep(300);
    const l1 = await p.evaluate(() => ({ s: window.__tp.game.state(), btn: !!document.querySelector(".tp-rematch"), w: window.__tp.calls.win[1] }));
    await shot(p, "1024x768_lose_rematch");
    await p.click(".tp-rematch");
    await p.waitForFunction(() => { const s = window.__tp.game.state(); return s.phase === "morph" && !document.querySelector(".tp-fight").disabled; }, null, { timeout: 30000 });
    const r1 = await S(p);
    await p.click(".tp-fight"); await p.evaluate(() => window.__tp.game.debug.fast(true)); await waitWin(p, 3);
    await p.waitForFunction(() => document.querySelector(".tp-rpanel"), null, { timeout: 20000 }); await sleep(200);
    const r2 = await p.evaluate(() => ({ s: window.__tp.game.state(), btn: !!document.querySelector(".tp-rematch"), use: window.__tp.calls.useTicket, w: window.__tp.calls.win[2] }));
    ok("B6b 輸了 → 有「換個對手再打」→ 不扣券、不用重打字（同一句）、換一個沒打過的對手", !l1.w.win && l1.btn && l1.s.canRematch && r1.phase === "morph" && r1.phrase === "力了人八十" && r1.opp.p !== "愛睡覺的貓" && r2.use === u0 + 1 && r2.w.phrase === "力了人八十", JSON.stringify({ lost: l1.w.score, opp2: r1.opp, use: [u0, r2.use], why: r1.oppWhy }));
    ok("B6b 換對手那場也挑會贏的（安慰）；同一張券用過一次就不再出現「換個對手再打」", r1.oppWhy === "rematch" && (r2.w.win || !r2.btn) && !r2.s.canRematch && r2.s.rematchUsed, JSON.stringify({ win2: r2.w.win, btn: r2.btn }));
    // B6c 同一句再下場（不指定對手）：避開打過的（這次開頁打過的＋存檔最近紀錄）
    const before = await p.evaluate(() => window.__tp.game.debug.fought().filter(e => e.p === "力了人八十").map(e => e.o));
    await p.evaluate(() => window.__tp.game.start()); await waitPhase(p, "type");
    await p.evaluate(() => window.__tp.game.debug.setPhrase("力了人八十")); await p.click(".tp-go"); await waitPhase(p, "morph");
    await p.waitForFunction(() => window.__tp.game.state().opp, null, { timeout: 30000 });
    const c1 = await S(p);
    ok("B6c 同一句再下場：對手避開打過的（" + before.join("、") + "）", before.length >= 3 && !before.includes(c1.opp.p), JSON.stringify({ before, now: c1.opp.p }));
    // 存檔的最近紀錄（leaderboard().recent）：重新開頁（記憶體清空）也避得開
    await p.goto(LAB + "?mute=1&clean=1&fast=6&tickets=9");
    await p.waitForFunction(() => window.__tp && window.__tp.ready, null, { timeout: 20000 });
    await p.evaluate(() => window.__tp.game.debug.setPhrase("力了人八十")); await p.click(".tp-go"); await waitPhase(p, "morph");
    await p.waitForFunction(() => window.__tp.game.state().opp, null, { timeout: 30000 });
    const c2 = await S(p), rec = await p.evaluate(() => JSON.parse(localStorage.getItem("zy_tops_lab_recent") || "[]").filter(e => e.p === "力了人八十").map(e => e.o));
    ok("B6c 重新開頁：用存檔的最近對戰紀錄（leaderboard().recent）照樣避開", rec.length >= 3 && !rec.includes(c2.opp.p), JSON.stringify({ rec, now: c2.opp.p }));
    ok("B6 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    // B7 縮短＋加油；B9 加成發光／金色光圈；C11 火花有顏色；C15 結算降像素比
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push("[B7] PAGEERR " + e.message); });
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 200)); allErrs.push("[B7] CONSOLE " + m.text().slice(0, 200)); } });
    const runMatch = async (cheers, label) => {
      await p.goto(LAB + "?mute=1&clean=1&home=clear&fast=3&tickets=9&opp=" + encodeURIComponent("熊貓愛跳舞"));
      await p.waitForFunction(() => window.__tp && window.__tp.ready, null, { timeout: 20000 });
      await p.evaluate(() => { window.__bn = []; window.__speeds = new Set(); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains("tp-bn") && window.__bn.push(n.textContent)))).observe(document.querySelector(".tp-banner"), { childList: true });
        setInterval(() => { const s = window.__tp.game.state(); if (s && s.round && s.round.stage === "fight") window.__speeds.add(s.round.i + ":" + s.round.speed); }, 20); });
      await p.evaluate(() => window.__tp.game.debug.setPhrase("紅色翹翹板")); await p.click(".tp-go");
      await p.waitForFunction(() => window.__tp.game.state().glowed >= 6, null, { timeout: 30000 });   // 紅色翹翹板：疊字 2＋同聲調 3＋顏色 1 顆
      await sleep(250);
      const glow = await p.evaluate(() => ({ cards: document.querySelectorAll(".tp-card.tp-glow").length, boosts: [...document.querySelectorAll(".tp-boost")].map(e => e.textContent), w: window.__tp.game.debug.world() }));
      if (label) await shot(p, "1024x768_bonus_glow");
      await p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 30000 }); await sleep(400);
      if (label) await shot(p, "1024x768_vs_bars");
      await p.click(".tp-fight");
      await p.waitForFunction(() => { const s = window.__tp.game.state(); return s.round && s.round.stage === "fight"; }, null, { timeout: 30000 });
      const pr1 = await p.evaluate(() => window.__tp.game.debug.world().pr);
      let sp = null;
      if (cheers) {
        for (let k = 0; k < cheers; k++) { await p.mouse.click(300 + k * 60, 420); await sleep(40); }
        sp = await p.evaluate(() => ({ w: window.__tp.game.debug.world(), cheers: window.__tp.game.state().cheers, txt: [...document.querySelectorAll(".tp-cheer")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")), gold: window.__tp.game.debug.world().gold }));
        if (label) await shot(p, "1024x768_battle_cheer");
      }
      await waitWin(p, 1, 180000);
      await p.waitForFunction(() => document.querySelector(".tp-rpanel"), null, { timeout: 30000 }); await sleep(300);
      const end = await p.evaluate(() => ({ w: window.__tp.calls.win[0], pr: window.__tp.game.debug.world().pr, bn: window.__bn.slice(), speeds: [...window.__speeds], s: window.__tp.game.state() }));
      return { glow, pr1, sp, end };
    };
    const A = await runMatch(6, true), B = await runMatch(0, false);
    const cnt = t => A.end.bn.filter(x => x.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") === t).length, rounds = A.end.w.score[0] + A.end.w.score[1];
    ok("B7 只有第 1 回合 3-2-1 倒數，之後直接「發射！」（每回合都有發射）", cnt("3") === 1 && cnt("2") === 1 && cnt("1") === 1 && cnt("發射！") === rounds && A.end.s.countdown === 1, JSON.stringify({ rounds, bn: A.end.bn.map(x => x.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }));
    const sp45 = A.end.speeds.filter(x => +x.split(":")[0] >= 3), sp13 = A.end.speeds.filter(x => +x.split(":")[0] < 3);
    ok("B7 第 4、5 回合預設 2 倍速（第 1–3 回合 1 倍）", sp13.every(x => x.endsWith(":1")) && sp45.every(x => x.endsWith(":2")) && (rounds < 4 || sp45.length >= 1), JSON.stringify(A.end.speeds));
    ok("B7 點畫面加油：冒火花、跳出「加油！」字、歡呼；純表演——有沒有加油，同一場結果完全一樣", A.sp.cheers === 6 && A.sp.w.sparks > 0 && A.sp.txt.some(t => /加油|衝啊|好棒/.test(t)) && JSON.stringify(A.end.w.rounds) === JSON.stringify(B.end.w.rounds) && A.end.w.win === B.end.w.win, JSON.stringify({ c: A.sp.cheers, sparks: A.sp.w.sparks, txt: A.sp.txt, same: JSON.stringify(A.end.w.rounds) === JSON.stringify(B.end.w.rounds) }));
    ok("C11 火花有顏色（顏色緩衝有更新，不再全黑）", A.sp.w.sparkColor > 0.3, String(A.sp.w.sparkColor));
    ok("B9 加成徽章跳出時：觸發的陀螺發光跳一下、能力卡標出對戰加了什麼（⚔️+10 這種）、換金色光圈", A.glow.cards >= 1 && A.glow.boosts.length >= 4 && A.glow.w.gold.includes("me:紅") && A.glow.w.gold.includes("me:翹"), JSON.stringify(A.glow));
    ok("B9 對戰中：有加成的陀螺（兩隊都算）帶金色光圈", (A.sp.gold || []).length >= 1, JSON.stringify(A.sp.gold));
    ok("C15 結算期間 3D 像素比降到 1（對戰中是 2）", A.pr1 === 2 && A.end.pr === 1, JSON.stringify({ battle: A.pr1, result: A.end.pr }));
    // C10 enterMorph 出錯 → onFail({why:"morph"})
    await p.goto(LAB + "?mute=1&clean=1&home=clear&fast=3&tickets=9");
    await p.waitForFunction(() => window.__tp && window.__tp.ready, null, { timeout: 20000 });
    await p.evaluate(() => { window.__tp.game.debug.breakMorph(); window.__tp.game.debug.setPhrase("宇宙強爸爸"); });
    await p.evaluate(() => { window.__warns = []; const w = console.warn; console.warn = (...a) => { window.__warns.push(a.join(" ")); w.apply(console, a); }; });
    await p.click(".tp-go"); await sleep(400);
    const mf = await p.evaluate(() => ({ fail: window.__tp.calls.fail.slice(), warns: window.__warns.filter(x => x.includes("[tops]")) }));
    ok("C10 變身流程出錯（enterMorph reject）＝catch 住、console.warn、onFail({why:\"morph\"})（主程式會回小島並退券）", mf.fail.some(f => f.why === "morph") && mf.warns.length >= 1, JSON.stringify(mf));
    ok("B7–C15 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    // C12 字典 fetch 逾時（攔截字典請求不回應）→ onFail("dict")
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await ctx.route(/zhuyin-tops-dict\.json/, () => { /* 永遠不回應 */ });
    const p = await ctx.newPage(); const t0 = Date.now();
    await p.goto(LAB + "?mute=1&clean=1&home=clear&dictms=1500");
    const got = await p.waitForFunction(() => window.__tp && window.__tp.calls.fail.length > 0, null, { timeout: 15000 }).then(() => true, () => false);
    const f = await p.evaluate(() => window.__tp && window.__tp.calls.fail.slice());
    ok("C12 字典載不到（卡住不回）：逾時中止 → onFail({why:\"dict\"})（正式 15 秒、測試 1.5 秒）", got && f.some(x => x.why === "dict") && Date.now() - t0 < 12000, JSON.stringify({ f, ms: Date.now() - t0 }));
    await ctx.close();
  }

  // ===== ⑨ 三種尺寸 × 四個畫面截圖＋版面 =====
  const missingAll = new Set();
  for (const [w, h] of [[1024, 768], [768, 1024], [844, 390]]) {
    const { ctx, p, errs } = await open(browser, w, h, "fast=3&tickets=9&ann=1");
    await p.waitForFunction(() => window.__tp.ann, null, { timeout: 8000 }).catch(() => {});
    const tag = `${w}x${h}`;
    await typeSyl(p, "ㄩˇ"); await sleep(400);
    const kb = await p.evaluate(() => { const r = [...document.querySelectorAll(".tp-key, .tp-cand, .tp-slot, .tp-go, .tp-inspire, .tp-boardbtn")].map(e => e.getBoundingClientRect()).filter(r => r.width);
      return { minW: Math.min(...r.map(x => x.width)), minH: Math.min(...r.map(x => x.height)), maxR: Math.max(...r.map(x => x.right)), maxB: Math.max(...r.map(x => x.bottom)), candFont: parseFloat(getComputedStyle(document.querySelector(".tp-cand")).fontSize), keyFont: parseFloat(getComputedStyle(document.querySelector(".tp-key")).fontSize) }; });
    ok(`${tag} 打字：按鍵／候選字／字格 ≥56px（手機字格 ≥52）、都在畫面內、候選字 ≥28px`, kb.minW >= (h < 520 ? 52 : 56) && kb.minH >= (h < 520 ? 52 : 56) && kb.maxR <= w + 0.5 && kb.maxB <= h + 0.5 && kb.candFont >= 28, JSON.stringify(kb));
    await shot(p, `${tag}_1_type`);
    await key(p, "ok");
    await p.click(".tp-inspire"); await sleep(300); await p.click(".tp-go");
    await p.waitForFunction(() => !document.querySelector(".tp-fight").disabled, null, { timeout: 25000 }); await sleep(500);
    const mo = await p.evaluate(() => { const r = [...document.querySelectorAll(".tp-card, .tp-fight, .tp-vs-info")].map(e => e.getBoundingClientRect()); return { maxR: Math.max(...r.map(x => x.right)), maxB: Math.max(...r.map(x => x.bottom)), minL: Math.min(...r.map(x => x.left)), fight: document.querySelector(".tp-fight").getBoundingClientRect().height }; });
    ok(`${tag} 變身：能力卡、對手、開戰鈕都在畫面內、開戰鈕 ≥56px`, mo.maxR <= w + 0.5 && mo.maxB <= h + 0.5 && mo.minL >= -0.5 && mo.fight >= 56, JSON.stringify(mo));
    await shot(p, `${tag}_2_morph`);
    await p.click(".tp-fight");
    await p.waitForFunction(() => { const s = window.__tp.game.state(); return s.round && s.round.stage === "fight"; }, null, { timeout: 20000 });
    await sleep(1600);
    const hud = await p.evaluate(() => { const r = [...document.querySelectorAll(".tp-team, .tp-score, .tp-ff")].map(e => e.getBoundingClientRect()); const me = document.querySelector(".tp-team.tp-me").getBoundingClientRect(), sc = document.querySelector(".tp-score").getBoundingClientRect(), op = document.querySelector(".tp-team.tp-opp").getBoundingClientRect();
      return { maxR: Math.max(...r.map(x => x.right)), ff: document.querySelector(".tp-ff").getBoundingClientRect().width, overlap: (me.right > sc.left && me.top < sc.bottom && me.bottom > sc.top) || (op.left < sc.right && op.top < sc.bottom && op.bottom > sc.top) }; });
    ok(`${tag} 對戰：兩隊與比分不重疊、⏩ ≥56px`, !hud.overlap && hud.ff >= 56 && hud.maxR <= w + 0.5, JSON.stringify(hud));
    await shot(p, `${tag}_3_battle`);
    await p.evaluate(() => window.__tp.game.debug.fast(true));
    await waitWin(p, 1);
    await p.waitForFunction(() => document.querySelector(".tp-rpanel"), null, { timeout: 15000 }); await sleep(700);
    const re = await p.evaluate(() => { const r = document.querySelector(".tp-rpanel").getBoundingClientRect(), b = [...document.querySelectorAll(".tp-rbtns .tp-btn")].map(e => e.getBoundingClientRect()); return { r: [r.left, r.top, r.right, r.bottom], btn: Math.min(...b.map(x => x.height)), scroll: document.querySelector(".tp-rpanel").scrollHeight > document.querySelector(".tp-rpanel").clientHeight + 2 }; });
    ok(`${tag} 結算：面板在畫面內、不用捲動、按鈕 ≥56px`, re.r[0] >= -0.5 && re.r[1] >= -0.5 && re.r[2] <= w + 0.5 && re.r[3] <= h + 0.5 && !re.scroll && re.btn >= 56, JSON.stringify(re));
    await shot(p, `${tag}_4_result`);
    const miss = await p.evaluate(() => window.__tp.ann ? [...window.__tp.ann.missing] : ["(沒載到注音模組)"]);
    miss.forEach(c => missingAll.add(c));
    ok(`${tag}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  ok("國字都有注音：四個畫面走完，自動注音的字典沒有缺字（候選字／詞句另用字典資料自己標）", missingAll.size === 0, [...missingAll].join(""));

  await browser.close();
  ok("全部：0 個 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
  console.log("\n" + results.join("\n"));
  const fails = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS　截圖：${SHOTS}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
