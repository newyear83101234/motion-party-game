// 音符接接樂（11-01 v8 音樂島露天音樂台；js/zhuyin-catch.js＋主程式接線）測試：node tools/zy-test/catch-game.js
// 驗：從卡片選單（?no3d）進接接樂；五級各玩一局（用 __zy.catch.debug.catchNote 接住對的／錯的）；錯接不扣東西；接滿 10 顆才結束；
//     Lv1–2 不限時、Lv3 起整局沙漏（蓋滿＝最多 2 星）；Lv4 聽音題（旗子放圖、🔊 時音符停住）；Lv5 換目標前清場；暫停選單開著音符停住；
//     對的和錯的不會在同一條路線上；星數規則（錯接 ≤1 3 星、≤3 2 星、其他 1 星）；結算回選單；家長頁有紀錄；沒有錯誤、旁注音沒漏字。
// 第 8 段（11-01 櫻木實測後改版）：判定照畫面量（底部碰到鼓面就接、中心過鼓面半顆不算、左右用像素：對的寬錯的窄、同時碰兩顆只接最近的）、
//     出生點在旗子下面、泡泡上的字放得下、接對金色符號飛上旗子＋鼓壓扁＋咚、錯接跳出真正的符號並往上彈、漏 3 顆後 cg-glow、
//     Lv2 示範泡泡、結算前重播（♪ 一顆一顆亮、詞排一排跳）、只認第一根手指、Lv4 🔊 用滑鼠／觸控真點；不唸答案、只唸規則。
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。截圖存到 ZY_SHOTS（預設 %TEMP%\zy-catch）。
const path = require("path"), fs = require("fs");
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&no3d";
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-catch");
fs.mkdirSync(SHOTS, { recursive: true });
const st = p => p.evaluate(() => window.__zy.catch && window.__zy.catch.state());
// 等畫面上有一顆「對的」（good=true）或「錯的」音符，接住它；回傳有沒有接到
async function grab(p, good, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await p.evaluate(g => { const s = window.__zy.catch.state(); if (!s || s.done) return null; const i = s.notes.findIndex(n => n.good === g); return i >= 0 ? window.__zy.catch.debug.catchNote(i) : false; }, good);
    if (r === null) return false;
    if (r) return true;
    await sleep(120);
  }
  return false;
}
// 對錯不同路線：取樣期間任何一刻、任何一條路線，不會同時有對的和錯的音符
let laneBad = [];
async function laneCheck(p) {
  const s = await st(p); if (!s) return;
  for (let k = 0; k < 5; k++) { const ns = s.notes.filter(n => n.lane === k); if (ns.some(n => n.good) && ns.some(n => !n.good)) laneBad.push(JSON.stringify(ns)); }
}
const resultOn = p => p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
const resultStars = p => p.evaluate(() => document.querySelectorAll("#resultStars .star.on").length);
const strip = s => (s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const park = p => p.evaluate(() => window.__zy.catch.debug.moveDrum(-1));   // 鼓移到畫面外：音符不會自己掉進鼓裡（只算測試用 catchNote 接的）
// ---- 第 8 段用 ----
const ready = p => p.waitForFunction(() => { const s = window.__zy.catch.state(); return s && s.busy === 0 && !s.demo && !s.done; }, null, { timeout: 15000 }).then(() => true, () => false);   // 旗子放大／示範都結束了
const solo = p => p.evaluate(() => { const d = window.__zy.catch.debug; d.noSpawn(true); d.clear(); });   // 不自動生音符、清場（一次只測一顆）
const geoOf = p => p.evaluate(() => window.__zy.catch.debug.geo());
// 在 lane 放一顆（底部離鼓面 ahead 像素；給 cy＝直接放在那個中心高度），鼓中心放在離它 dx 像素的地方，等它被接到或掉過鼓面
// drumFirst=false：鼓先放畫面外，音符放好 0.12 秒後才滑過去（驗「碰到鼓面以後滑過去也接得到」）
function dropAt(p, o) {
  return p.evaluate(async ({ good, lane, dx, ahead = 24, cy, drumFirst = true }) => {
    const c = window.__zy.catch, d = c.debug, g = d.geo(), n0 = d.events().length, x = (lane + 0.5) / 5;
    d.moveDrum(drumFirst ? x + dx / g.w : -1);
    const nt = d.drop({ good, lane, y: (cy !== undefined ? cy : g.face - g.r - ahead) / g.h });
    if (!drumFirst) { await new Promise(r => setTimeout(r, 120)); d.moveDrum(x + dx / g.w); }
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      await new Promise(r => setTimeout(r, 30));
      const ev = d.events();
      if (ev.length > n0) { const f = document.querySelector(".cg-fly"); return { caught: true, ev: ev[ev.length - 1], g, drumAnim: document.querySelector(".cg-drum-in").getAnimations().length, fly: f ? f.textContent : null, sym: c.state().target.sym }; }
      const me = c.state().notes.find(n => n.lane === lane && n.h === nt.h && n.good === good);
      if (!me || me.y * g.h > g.face + g.r + 3) return { caught: false, g, y: me && me.y };
    }
    return { caught: null, g };
  }, o);
}
const spokenOf = p => p.evaluate(() => (window.__spoken || []).map(s => s.text));

(async () => {
  const browser = await launch();
  const { ctx, p, errs } = await openGame(browser, { stickers: 45, stars: 12, query: Q });
  await p.evaluate(() => window.__zy.setWallet(9));
  // ===== 0. 卡片選單有接接樂、40 張貼紙才開 =====
  const card = await p.evaluate(() => { const c = document.querySelector(".mode-card[data-mode=catch]"); return c && { locked: c.classList.contains("locked"), label: c.querySelector(".label").textContent }; });
  ok("卡片選單有「接接樂」卡、45 張貼紙沒鎖", !!card && !card.locked && strip(card.label) === "接接樂", JSON.stringify(card));
  // ===== 1. Lv1：開頭是某個符號、不限時；先錯接一顆（不扣東西）、對的接 9 顆還沒結束、第 10 顆才結束 =====
  await enterMode(p, "catch", { lv: 1 });
  ok("Lv1：進到接接樂畫面（mode＝catch、🔊 提示鈕藏著、上面的題目進度點藏著）", await p.evaluate(() => window.__zy.mode === "catch" && document.getElementById("speakBtn").classList.contains("hidden") && document.getElementById("progress").classList.contains("hidden")));
  await p.waitForFunction(() => window.__zy.catch && window.__zy.catch.state() && window.__zy.catch.state().notes.length > 0, null, { timeout: 10000 }).catch(() => {});
  let s = await st(p);
  const flag1 = strip(await p.evaluate(() => document.querySelector(".cg-flag").textContent));
  ok("Lv1：目標是「開頭是 ㄅ…」（聲母）、沒有沙漏", s && s.lv === 1 && s.target.kind === "first" && /^[ㄅ-ㄙ]$/.test(s.target.sym) && s.hg === 0 && await p.evaluate(() => document.querySelector(".cg-hg").classList.contains("hidden")), JSON.stringify({ s, flag1 }));
  await p.screenshot({ path: path.join(SHOTS, "catch-lv1-1180x820.png") }); await park(p);   // 鼓移到畫面外：音符不會自己掉進鼓裡（只算測試用 catchNote 接的）
  const before = await p.evaluate(() => ({ stars: window.__zy.homeStars, wallet: window.__zy.wallet, stickers: document.getElementById("menuStickers").textContent }));
  const gotBad = await grab(p, false);
  s = await st(p);
  const after = await p.evaluate(() => ({ stars: window.__zy.homeStars, wallet: window.__zy.wallet, stickers: document.getElementById("menuStickers").textContent }));
  ok("錯接一顆：wrong＋1、caught 不變、星星／錢包／貼紙都沒扣", gotBad && s.wrong === 1 && s.caught === 0 && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ s, before, after }));
  for (let i = 0; i < 9; i++) { await laneCheck(p); await grab(p, true); }
  s = await st(p);
  ok("接到 9 顆對的：還沒結束（一局＝接滿 10 顆）", s && s.caught === 9 && !s.done && await p.evaluate(() => window.__zy.mode === "catch" && document.getElementById("result").classList.contains("hidden")), JSON.stringify(s));
  await p.evaluate(() => window.__zy.catch.debug.age(600));   // Lv1 不限時：玩很久也不會變慢星
  s = await st(p); ok("Lv1 不限時：玩了 10 分鐘也不算沙漏蓋滿", s && !s.late, JSON.stringify(s));
  await grab(p, true);
  s = await st(p); ok("第 10 顆：這一局結束", s && s.done && s.caught === 10, JSON.stringify(s));
  ok("結束後進結算", await resultOn(p));
  await sleep(600);
  ok("Lv1 錯接 1 顆＝3 星、結算寫「接到 10 個音符！」", (await resultStars(p)) === 3 && strip(await p.evaluate(() => document.getElementById("resultText").textContent)) === "接到10個音符！", String(await resultStars(p)));
  await sleep(3500); await p.screenshot({ path: path.join(SHOTS, "catch-result-1180x820.png") });
  const lv1 = await p.evaluate(() => window.__zy.lv.catch);
  ok("Lv1 拿 3 星 → 開 Lv2（等級存在 zy{n}_lv）", lv1 && lv1.max === 2 && lv1.st[1] === 3, JSON.stringify(lv1));
  // ===== 2. Lv2：結尾押韻、不限時；錯接 3 顆＝2 星 =====
  await enterMode(p, "catch", { lv: 2 });
  await p.waitForFunction(() => window.__zy.catch.state() && !window.__zy.catch.state().done, null, { timeout: 8000 }).catch(() => {}); await park(p);
  s = await st(p);
  ok("Lv2：目標是「結尾是…」、不限時", s && s.lv === 2 && s.target.kind === "last" && s.hg === 0, JSON.stringify(s));
  for (let i = 0; i < 3; i++) await grab(p, false);
  for (let i = 0; i < 10; i++) { await laneCheck(p); await grab(p, true); }
  ok("Lv2 結算", await resultOn(p)); await sleep(600);
  ok("Lv2 錯接 3 顆＝2 星", (await resultStars(p)) === 2, String(await resultStars(p)));
  // ===== 3. Lv3：整局沙漏（看得到）；錯接 4 顆＝1 星 =====
  await enterMode(p, "catch", { lv: 3 });
  await p.waitForFunction(() => window.__zy.catch.state() && !window.__zy.catch.state().done, null, { timeout: 8000 }).catch(() => {}); await park(p);
  s = await st(p);
  ok("Lv3：有整局金星沙漏（75 秒、看得到）", s && s.lv === 3 && s.hg > 0 && await p.evaluate(() => !document.querySelector(".cg-hg").classList.contains("hidden")), JSON.stringify(s));
  for (let i = 0; i < 4; i++) await grab(p, false);
  for (let i = 0; i < 10; i++) { await laneCheck(p); await grab(p, true); }
  ok("Lv3 結算", await resultOn(p)); await sleep(600);
  ok("Lv3 錯接 4 顆＝1 星（全部都接拿不到高星）", (await resultStars(p)) === 1, String(await resultStars(p)));
  // ===== 4. Lv4：聽音題（旗子放圖、不放注音）；按 🔊 音符停住；沙漏蓋滿＝最多 2 星（遊戲照玩） =====
  await enterMode(p, "catch", { lv: 4 });
  await p.waitForFunction(() => window.__zy.catch.state() && window.__zy.catch.state().notes.length >= 2, null, { timeout: 10000 }).catch(() => {}); await park(p);
  s = await st(p);
  const f4 = await p.evaluate(() => ({ pic: !!document.querySelector(".cg-flag .cg-flag-pic"), sym: !!document.querySelector(".cg-flag .cg-flag-sym") }));
  ok("Lv4：聽音題（有目標詞、旗子是圖＋🔊、沒有大大的注音）", s && s.lv === 4 && !!s.target.word && f4.pic && !f4.sym, JSON.stringify({ s, f4 }));
  await p.screenshot({ path: path.join(SHOTS, "catch-lv4-1180x820.png") });
  await p.evaluate(() => document.querySelector(".cg-flag-pic").click());
  const y0 = await st(p); await sleep(900); const y1 = await st(p);
  ok("Lv4：按旗子的 🔊（再聽）→ 音符全部停住", y0 && y1 && y0.notes.length && y0.notes.every(a => { const b = y1.notes.find(n => n.h === a.h && n.lane === a.lane); return !b || Math.abs(b.y - a.y) < 0.005; }), JSON.stringify({ y0: y0 && y0.notes, y1: y1 && y1.notes }));
  await p.evaluate(() => window.__zy.catch.debug.age(200)); await sleep(1300);   // 🔊 的 1.8 秒停住過了，沙漏才會重畫
  s = await st(p); ok("Lv4：玩超過沙漏時間 → 沙漏蓋滿（變銀色），遊戲照玩", s && s.late && !s.done && await p.evaluate(() => document.querySelector(".cg-hg").classList.contains("late")), JSON.stringify(s));
  for (let i = 0; i < 10; i++) { await laneCheck(p); await grab(p, true); }
  ok("Lv4 結算", await resultOn(p)); await sleep(600);
  ok("Lv4 沒接錯但沙漏蓋滿＝2 星", (await resultStars(p)) === 2, String(await resultStars(p)));
  // ===== 5. Lv5：中間換目標（先清場、停 2 秒再翻旗子）；暫停選單開著音符停住 =====
  await enterMode(p, "catch", { lv: 5 });
  await p.waitForFunction(() => window.__zy.catch.state() && window.__zy.catch.state().notes.length >= 2, null, { timeout: 10000 }).catch(() => {}); await park(p);
  // 暫停：🏠 → 暫停選單 → 音符不動；按「繼續玩」再動
  await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
  const pz0 = await st(p); await sleep(1200); const pz1 = await st(p);
  ok("暫停選單開著：音符全部停住", await p.evaluate(() => !document.getElementById("confirm").classList.contains("hidden")) && pz0.notes.length > 0 && pz0.notes.every(a => { const b = pz1.notes.find(n => n.h === a.h && n.lane === a.lane); return b && Math.abs(b.y - a.y) < 0.002; }), JSON.stringify({ a: pz0.notes, b: pz1.notes }));
  await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(900);
  const pz2 = await st(p);
  ok("按「繼續玩」：音符接著往下掉", pz2.notes.some(b => { const a = pz1.notes.find(n => n.h === b.h && n.lane === b.lane); return a && b.y > a.y + 0.01; }), JSON.stringify(pz2.notes));
  const t5 = (await st(p)).target;
  for (let i = 0; i < 4; i++) { await laneCheck(p); await grab(p, true); }
  await p.waitForFunction(() => window.__zy.catch.state().notes.length > 0, null, { timeout: 8000 }).catch(() => {});
  await grab(p, true);                                     // 第 5 顆：換目標
  const sw0 = await st(p); await sleep(450); const sw1 = await st(p);
  ok("Lv5 接到第 5 顆：畫面上的音符馬上清空（剛剛對的不會突然變錯）", sw0.swapped && sw0.notes.length === 0 && sw1.notes.length === 0, JSON.stringify({ sw0, sw1 }));
  await sleep(900); const sw2 = await st(p);
  ok("Lv5：停一下才翻旗子、換成另一種目標（開頭↔結尾）", sw2.target.kind !== t5.kind && sw2.notes.length === 0, JSON.stringify({ t5, t: sw2.target, n: sw2.notes.length }));
  const big5 = await p.evaluate(() => { const f = document.querySelector(".cg-flag"); return { big: f.classList.contains("cg-big"), tf: f.style.transform, pos: f.querySelector(".cg-pos") && f.querySelector(".cg-pos").textContent }; });
  ok("Lv5 換目標：新旗子在畫面中間放大（旗子上有 ㄉ＿＿／＿＿ㄠ 小圖示）", big5.big && /scale/.test(big5.tf) && big5.pos === sw2.target.sym, JSON.stringify(big5));
  await sleep(1500);
  ok("Lv5 換目標：1 秒後旗子回到上面、貓頭鷹說「換題目囉！」", await p.evaluate(() => { const f = document.querySelector(".cg-flag"); return !f.classList.contains("cg-big") && !f.style.transform; }) && (await spokenOf(p)).includes("換題目囉！"), JSON.stringify(await spokenOf(p)));
  for (let i = 0; i < 5; i++) { await laneCheck(p); await grab(p, true); }
  ok("Lv5 結算", await resultOn(p)); await sleep(600);
  ok("Lv5 全對、沒超時＝3 星", (await resultStars(p)) === 3, String(await resultStars(p)));
  ok("五局取樣：對的和錯的音符從來沒有在同一條路線上", laneBad.length === 0, laneBad.slice(0, 3).join(" | "));
  // ===== 6. 結算回選單、家長頁有紀錄 =====
  await sleep(3500);
  await p.evaluate(() => document.getElementById("menuBtn").click()); await sleep(800);
  ok("結算按「回小島」→ 回選單、mode 清空、接接樂停了", await p.evaluate(() => !document.getElementById("menu").classList.contains("hidden") && window.__zy.mode === null && (!window.__zy.catch.state() || window.__zy.catch.state().done)));
  await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(400);
  const row = await p.evaluate(() => { const r = [...document.querySelectorAll("#statsModes .st-row")].find(x => x.textContent.includes("接接樂")); return r ? r.textContent.replace(/\s/g, "") : null; });
  ok("家長頁「玩了什麼」有接接樂、5 次", !!row && /接接樂5次/.test(row), String(row));
  await p.evaluate(() => document.getElementById("settingsClose").click());
  ok("最佳星數記在 best.catch（3 星）", await p.evaluate(() => window.__zyB.best.catch === 3));
  ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
  ok("沒有錯誤", errs.length === 0, errs.join(" | "));
  await ctx.close();
  // ===== 7. 各種畫面大小：旗子、音符進度、沙漏、左上 🏠🎵 不疊在一起 =====
  for (const [w, h] of [[820, 1180], [1180, 820], [1024, 768], [768, 1024]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 45, query: Q });
    for (const lv of [3, 4]) {                             // Lv4 的旗子（圖＋🔊＋「跟它押韻」）最寬；Lv3 有沙漏
      await enterMode(p, "catch", { lv });
      await p.waitForFunction(() => window.__zy.catch.state() && window.__zy.catch.state().notes.length >= 2, null, { timeout: 10000 }).catch(() => {});
      await sleep(600);                                    // 旗子翻面動畫（0.5 秒）跑完再量
      const L = await p.evaluate(() => { const r = s => { const q = document.querySelector(s).getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom].map(Math.round); }; return { flag: r(".cg-flag"), prog: r(".cg-prog"), hg: r(".cg-hg"), home: r("#homeBtn"), music: r("#musicBtn"), W: innerWidth }; });
      const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      ok(`${w}×${h} Lv${lv}：旗子／音符進度／沙漏／左上 🏠🎵 互不重疊、都在畫面內`, !hit(L.flag, L.prog) && !hit(L.flag, L.hg) && !hit(L.prog, L.hg) && ![L.flag, L.prog, L.hg].some(x => hit(x, L.home) || hit(x, L.music)) && [L.flag, L.prog, L.hg].every(x => x[0] >= 0 && x[2] <= L.W), JSON.stringify(L));
      if (w === 820 || w === 1180) await p.screenshot({ path: path.join(SHOTS, `catch-lv${lv}-${w}x${h}.png`) });
    }
    ok(`${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 8. 11-01 櫻木實測後改版（橫式 1180×820＋直式 820×1180 各跑一輪；截圖 catch2-*.png） =====
  for (const [w, h] of [[1180, 820], [820, 1180]]) {
    const T = `${w}×${h}`, F = `${w}x${h}`, portrait = h > w;
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 45, query: Q });
    const words = await p.evaluate(() => import("./js/zhuyin-words.js").then(m => m.WORDS.map(x => x.h)));
    // ---- 開局：旗子在中間放大 1 秒、這段時間不掉音符 ----
    await enterMode(p, "catch", { lv: 1 });
    const pr0 = await p.evaluate(() => { const f = document.querySelector(".cg-flag"); return { big: f.classList.contains("cg-big"), tf: f.style.transform, n: window.__zy.catch.state().notes.length }; });
    ok(`${T} 開局：旗子先在畫面中間放大、音符還沒開始掉`, pr0.big && /scale/.test(pr0.tf) && pr0.n === 0, JSON.stringify(pr0));
    ok(`${T} 開局：放大完回到上面、開始掉音符`, await ready(p) && await p.evaluate(() => !document.querySelector(".cg-flag").classList.contains("cg-big")));
    const g = await geoOf(p);
    const dom = await p.evaluate(() => { const R = s => document.querySelector(s).getBoundingClientRect(), S = R(".cg-stage"), Tp = R(".cg-drum-top"), D = R(".cg-drum");
      const ui = [".cg-flag", ".cg-prog", ".cg-hg"].map(s => document.querySelector(s)).filter(e => !e.classList.contains("hidden")).map(e => e.getBoundingClientRect().bottom - S.top);
      return { face: Tp.top - S.top, half: D.width / 2, ui: Math.max(...ui) }; });
    ok(`${T} 鼓面高度、鼓半寬是量畫面來的（跟鼓的實際位置差 ≤1px）`, Math.abs(g.face - dom.face) <= 1 && Math.abs(g.half - dom.half) <= 1 && g.r > 40, JSON.stringify({ g, dom }));
    ok(`${T} 出生點在旗子／進度／沙漏下面（音符一出來就整顆看得到）`, g.spawn - g.r >= dom.ui - 1, JSON.stringify({ spawnTop: g.spawn - g.r, ui: dom.ui }));
    // ---- 泡泡上的字：一、兩個字的詞都放得進泡泡、旁注音 ≥18px（1180×820／820×1180 的 vmin 一樣） ----
    const fit = await p.evaluate(async () => {
      const { WORDS } = await import("./js/zhuyin-words.js"), stage = document.querySelector(".cg-stage"), out = { n: 0, minZ: 99, worst: 0, worstW: "", hanPx: {} };
      for (const wd of WORDS.filter(x => [...x.h].length <= 2)) {
        const e = document.createElement("div"); e.className = "cg-note l" + [...wd.h].length; e.style.cssText = "transform: translate(300px, 300px); animation: none";
        e.innerHTML = `<span class="cg-em">${wd.e}</span><span class="cg-han">${wd.h}</span>`; stage.appendChild(e); await new Promise(r => setTimeout(r, 0));
        const er = e.getBoundingClientRect(), hn = e.querySelector(".cg-han"), hr = hn.getBoundingClientRect(), cx = er.left + er.width / 2, cy = er.top + er.height / 2, R = er.width / 2;
        const lh = parseFloat(getComputedStyle(hn).fontSize), padY = (hr.height - lh) / 2;   // 量字身（不含行高多出來的上下空白）
        const far = Math.max(...[[hr.left, hr.top + padY], [hr.right, hr.top + padY], [hr.left, hr.bottom - padY], [hr.right, hr.bottom - padY]].map(([x, y]) => Math.hypot(x - cx, y - cy))) / R;
        const ac = e.querySelector(".ac[data-z]"), zs = ac ? parseFloat(getComputedStyle(ac, "::after").fontSize) : 0;
        out.n++; out.minZ = Math.min(out.minZ, zs); if (far > out.worst) { out.worst = +far.toFixed(3); out.worstW = wd.h; } out.hanPx["l" + [...wd.h].length] = lh; e.remove();
      }
      return out;
    });
    ok(`${T} 泡泡上的字：一、兩個字的詞（${fit.n} 個）字身都在泡泡外框以內、旁注音 ≥18px（國字 ${fit.hanPx.l1}／${fit.hanPx.l2}px）`, fit.n > 100 && fit.worst <= 1.0 && fit.minZ >= 17.9, JSON.stringify(fit));
    // ---- 判定：底部碰到鼓面就接到（不是中心碰到）；中心過鼓面半顆就不算；碰到以後滑過去也接得到 ----
    await solo(p);
    const j1 = await dropAt(p, { good: true, lane: 2, dx: 0, ahead: 30 });
    ok(`${T} 底部碰到鼓面就算接到（接到那一格：底部－鼓面 ＝ ${j1.ev && (j1.ev.bottom - j1.ev.face).toFixed(1)}px，一格掉 ${j1.ev && j1.ev.step}px）`, j1.caught && j1.ev.bottom - j1.ev.face >= 0 && j1.ev.bottom - j1.ev.face <= j1.ev.step + 1, JSON.stringify(j1));
    ok(`${T} 接到對的：鼓壓扁、咚、目標符號金色飛出來`, j1.caught && j1.drumAnim > 0 && j1.fly === j1.sym && await p.evaluate(() => window.__zy.catch.debug.dongs() >= 1), JSON.stringify({ drumAnim: j1.drumAnim, fly: j1.fly, sym: j1.sym }));
    await sleep(900);
    ok(`${T} 飛到旗子上就收掉`, await p.evaluate(() => !document.querySelector(".cg-fly")));
    // 出生點往下移了，落到鼓面的總時間不變：Lv1 從出生到底部碰到鼓面＝fall×FALL_FRAC（6.2×0.87/1.15≈4.69 秒；用遊戲內時間量）
    await solo(p);
    const ft = await p.evaluate(async () => {
      const c = window.__zy.catch, d = c.debug, M = await import("./js/zhuyin-catch.js?v=1"), n0 = d.events().length;
      d.moveDrum(0.5); const e0 = c.state().elapsed; d.drop({ good: true, lane: 2 });
      const t0 = performance.now(); while (performance.now() - t0 < 9000 && d.events().length === n0) await new Promise(r => setTimeout(r, 30));
      const ev = d.events()[n0]; return { sec: ev ? +(ev.t - e0).toFixed(2) : null, want: +(M.LV[1].fall * M.FALL_FRAC).toFixed(2) };
    });
    ok(`${T} 從出生到碰到鼓面 ${ft.sec} 秒（要 ${ft.want} 秒＝舊版從畫面外掉到判定點的時間）`, ft.sec !== null && Math.abs(ft.sec - ft.want) <= 0.12, JSON.stringify(ft));
    await solo(p);
    const j2 = await dropAt(p, { good: true, lane: 2, dx: 0, cy: g.face + g.r * 1.1 });
    ok(`${T} 中心已經超過鼓面半顆：鼓就在下面也不算（讓它掉下去）`, j2.caught === false, JSON.stringify(j2));
    await solo(p);
    const j3 = await dropAt(p, { good: true, lane: 2, dx: 0, cy: g.face, drumFirst: false });
    ok(`${T} 音符半顆沉到鼓面下時把鼓滑過去：接得到`, j3.caught === true, JSON.stringify(j3));
    // ---- 左右用像素：對的＝鼓半寬＋半徑×0.35；錯的＝鼓半寬－半徑×0.2 ----
    await solo(p);
    const k1 = await dropAt(p, { good: true, lane: 1, dx: g.half * 0.95 });
    await solo(p);
    const k2 = await dropAt(p, { good: true, lane: 3, dx: g.half + g.r * 0.3 });
    await solo(p);
    const k3 = await dropAt(p, { good: true, lane: 3, dx: g.half + g.r * 0.45 });
    ok(`${T} 對的從鼓外緣落下（離鼓中心 ${Math.round(g.half * 0.95)}px＝半寬內；舊判定只有 ±${Math.round(0.085 * w)}px）接得到、超出鼓緣一點點（+0.3 半徑）也接得到、再遠（+0.45）接不到`, k1.caught === true && k2.caught === true && k3.caught === false, JSON.stringify({ k1: k1.caught, k2: k2.caught, k3: k3.caught, lim: k1.ev && k1.ev.lim }));
    await solo(p);
    const b1 = await dropAt(p, { good: false, lane: 1, dx: g.half - g.r * 0.1 });
    await solo(p);
    const w0 = (await st(p)).wrong;
    const b2 = await dropAt(p, { good: false, lane: 1, dx: g.half * 0.5 });
    ok(`${T} 錯的判定窄一點：在鼓邊緣滑過（半寬－0.1 半徑）不會誤接、正中間落下才算接到`, b1.caught === false && b2.caught === true && (await st(p)).wrong === w0 + 1, JSON.stringify({ b1: b1.caught, b2: b2.caught, lim: b2.ev && b2.ev.lim }));
    // ---- 同時碰到兩顆：只接離鼓中心最近的那顆（直式路線窄才會發生：相鄰兩條路線都在鼓的範圍內） ----
    if (portrait) {
      await solo(p);
      const two = await p.evaluate(async () => {
        const c = window.__zy.catch, d = c.debug, g = d.geo(), gap = g.w / 5, n0 = d.events().length, y = (g.face - g.r - 25) / g.h;
        d.moveDrum((2.5 * gap - gap * 0.37) / g.w);         // 離路線 2 是 0.37 格、離路線 1 是 0.63 格（都在對的判定範圍內）
        const a = d.drop({ good: true, lane: 1, y }), b = d.drop({ good: true, lane: 2, y });
        const t0 = performance.now(); while (performance.now() - t0 < 4000) { await new Promise(r => setTimeout(r, 40)); if (!c.state().notes.length) break; if (c.state().notes.every(n => n.y * g.h > g.face + g.r)) break; }
        return { ev: d.events().slice(n0), a, b, near: 0.37 * gap, far: 0.63 * gap, lim: g.half + g.r * 0.35 };
      });
      ok(`${T} 同一格同時碰到兩顆（${Math.round(two.near)}px／${Math.round(two.far)}px，判定範圍 ${Math.round(two.lim)}px）：只接最近的那顆`, two.ev.length === 1 && two.ev[0].lane === 2 && two.ev[0].others === 1, JSON.stringify(two));
    }
    // ---- 錯接：泡泡上面跳出它「真正的」開頭／結尾符號（灰色、放大），泡泡往上彈開，停 0.8 秒 ----
    await solo(p); await park(p);
    const wr = await p.evaluate(async () => {
      const c = window.__zy.catch, d = c.debug, g = d.geo(), M = await import("./js/zhuyin-catch.js?v=1"), { WORDS } = await import("./js/zhuyin-words.js");
      const nt = d.drop({ good: false, lane: 1, y: (g.spawn + g.face) / 2 / g.h }); await new Promise(r => setTimeout(r, 350));   // 冒出來的放大動畫（0.3 秒）跑完再量
      const e = [...document.querySelectorAll(".cg-note")].pop(), y0 = e.getBoundingClientRect().top;
      const i = c.state().notes.findIndex(n => !n.good && n.h === nt.h); d.catchNote(i); window.__wrT = performance.now();
      const s = c.state(), wd = WORDS.find(x => x.h === nt.h), real = s.target.kind === "first" ? M.firstSym(wd.z) : M.lastSym(wd.z);
      await new Promise(r => setTimeout(r, 380));
      const lab = e.querySelector(".cg-real");
      return { h: nt.h, kind: s.target.kind, sym: s.target.sym, real, shown: lab && lab.textContent, color: lab && getComputedStyle(lab).color, fs: lab && parseFloat(getComputedStyle(lab).fontSize), rise: y0 - e.getBoundingClientRect().top, r: g.r, miss: e.classList.contains("cg-miss") };
    });
    await p.screenshot({ path: path.join(SHOTS, `catch2-wrong-${F}.png`) });
    const wr2 = await p.evaluate(async () => {                // 彈開 0.3 秒＋停 0.8 秒：接到後第 1.05 秒還整顆看得到
      const dt = performance.now() - window.__wrT; if (dt < 1050) await new Promise(r => setTimeout(r, 1050 - dt));
      const e = document.querySelector(".cg-note.cg-miss"); return { at: Math.round(performance.now() - window.__wrT), lab: !!(e && e.querySelector(".cg-real")), op: e ? +getComputedStyle(e).opacity : 0 };
    });
    await sleep(700);
    const wr3 = await p.evaluate(() => ({ gone: !document.querySelector(".cg-note.cg-miss"), at: Math.round(performance.now() - window.__wrT) }));
    ok(`${T} 錯接：泡泡上面跳出它真正的${wr.kind === "first" ? "開頭" : "結尾"}符號（${wr.h}→${wr.shown}，旗子是 ${wr.sym}）、灰色、大字`, wr.shown === wr.real && wr.real !== wr.sym && (c => c.length >= 3 && Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3)) <= 40)((wr.color || "").match(/\d+/g) || []) && wr.fs >= 60, JSON.stringify(wr));
    ok(`${T} 錯接：泡泡往上彈開（${Math.round(wr.rise)}px）、停 0.8 秒讓小孩對照（第 ${wr2.at}ms 還看得到）、之後收掉`, wr.miss && wr.rise > wr.r * 0.5 && wr2.lab && wr2.at <= 1095 && wr2.op > 0.95 && wr3.gone, JSON.stringify({ wr, wr2, wr3 }));
    // ---- 連續漏掉 3 顆對的 → 之後對的發光（cg-glow），接到一顆就恢復 ----
    await solo(p);
    const gl = await p.evaluate(async () => {
      const c = window.__zy.catch, d = c.debug, g = d.geo(), m0 = c.state().miss;
      for (const lane of [0, 2, 4]) d.drop({ good: true, lane, y: (g.face + g.r * 1.2) / g.h });   // 已經掉過鼓面：很快掉出畫面
      const t0 = performance.now(); while (performance.now() - t0 < 5000 && c.state().miss < 3) await new Promise(r => setTimeout(r, 50));
      const miss = c.state().miss, a = d.drop({ good: true, lane: 2 }), b = d.drop({ good: false, lane: 0 });
      const glowGood = [...document.querySelectorAll(".cg-note.good")].pop().classList.contains("cg-glow"), glowBad = document.querySelectorAll(".cg-note:not(.good).cg-glow").length;
      d.catchNote(c.state().notes.findIndex(n => n.good)); d.clear();
      d.drop({ good: true, lane: 3 }); const after = [...document.querySelectorAll(".cg-note.good")].pop().classList.contains("cg-glow");
      return { m0, miss, glowGood, glowBad, after, missAfter: c.state().miss };
    });
    ok(`${T} 連續漏掉 3 顆對的：下一顆對的發光（cg-glow）、錯的不發光；接到一顆就不發光了`, gl.miss >= 3 && gl.glowGood && gl.glowBad === 0 && !gl.after && gl.missAfter === 0, JSON.stringify(gl));
    // ---- 只認第一根手指（兄弟姊妹指螢幕不動鼓；第一根放開後還按著的那根接手） ----
    await solo(p);
    const fg = await p.evaluate(() => {
      const st = document.querySelector(".cg-stage"), r = st.getBoundingClientRect(), c = window.__zy.catch, y = r.top + r.height * 0.9, X = () => Math.round(c.state().drumX * r.width);
      const fire = (type, id, x) => st.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 21, clientX: r.left + x, clientY: y, bubbles: true, cancelable: true }));
      const W = r.width, out = [];
      fire("pointerdown", 21, W * 0.3); out.push(X());
      fire("pointerdown", 22, W * 0.8); out.push(X());
      fire("pointermove", 22, W * 0.85); out.push(X());
      fire("pointermove", 21, W * 0.4); out.push(X());
      fire("pointerup", 21, W * 0.4); fire("pointermove", 22, W * 0.7); out.push(X());
      fire("pointerup", 22, W * 0.7); fire("pointermove", 22, W * 0.2); out.push(X());
      return { out, want: [0.3, 0.3, 0.3, 0.4, 0.7, 0.7].map(k => Math.round(W * k)) };
    });
    ok(`${T} 只認第一根手指：第二根手指按下／移動鼓不動；第一根放開後第二根才接手`, fg.out.every((v, i) => Math.abs(v - fg.want[i]) <= 1), JSON.stringify(fg));
    // ---- 規則（不是答案）：這次開機第一次玩「開頭」唸一次；整局沒唸過任何一個詞 ----
    await p.waitForFunction(() => (window.__spoken || []).some(s => s.text === "接住開頭是這個注音的音符！"), null, { timeout: 6000 }).catch(() => {});
    const sp1 = await spokenOf(p);
    ok(`${T} 第一局開始唸一次規則「接住開頭是這個注音的音符！」、沒有唸任何一個詞（看注音的題目不唸答案）`, sp1.filter(t => t === "接住開頭是這個注音的音符！").length === 1 && !sp1.some(t => words.includes(t)), JSON.stringify(sp1));
    // ---- Lv1 截圖：正常玩的樣子 ----
    await p.evaluate(() => { const d = window.__zy.catch.debug; d.clear(); d.noSpawn(false); d.moveDrum(0.5); });
    await p.waitForFunction(() => { const s = window.__zy.catch.state(); return s.notes.length >= 2 && s.notes.some(n => n.y > 0.4); }, null, { timeout: 12000 }).catch(() => {});
    await p.screenshot({ path: path.join(SHOTS, `catch2-lv1-${F}.png`) });
    // ---- 接滿 10 顆 → 結算前重播：♪ 一顆一顆亮、鼓跟著跳、接到的 10 個詞排一排跟著彈 ----
    await park(p);
    for (let i = 0; i < 12 && !(await st(p)).done; i++) await grab(p, true);
    await p.evaluate(() => window.__zy.catch.debug.moveDrum(0.5));   // 鼓拉回畫面中間（截圖看得到鼓跟著跳）
    const rp = [];
    for (const at of [150, 1700, 3900]) {
      await sleep(Math.max(0, at - (rp.length ? rp[rp.length - 1].at : 0)));
      rp.push({ at, ...(await p.evaluate(() => ({ on: document.querySelectorAll(".cg-prog i.on").length, row: document.querySelectorAll(".cg-row .cg-row-w").length, drum: document.querySelector(".cg-drum-in").getAnimations().length, bop: [...document.querySelectorAll(".cg-row .cg-row-w")].filter(e => e.getAnimations().length).length }))) });
      if (at === 1700) await p.screenshot({ path: path.join(SHOTS, `catch2-replay-${F}.png`) });
    }
    ok(`${T} 結算前重播：接到的 10 個詞排一排、♪ 跟著音一顆一顆重新亮（${rp.map(r => r.on).join("→")}）`, rp[0].row === 10 && rp[0].on <= 1 && rp[1].on >= 3 && rp[1].on <= 8 && rp[2].on === 10, JSON.stringify(rp));
    ok(`${T} 結算前重播：鼓跟著跳、詞跟著彈`, rp.some(r => r.drum > 0) && rp.some(r => r.bop > 0), JSON.stringify(rp));
    ok(`${T} 重播完進結算`, await resultOn(p));
    // ---- Lv2：開局示範泡泡（兩個字、第一個字的結尾＝目標的那種），最後一個符號閃 2 次，示範完才開始掉 ----
    await enterMode(p, "catch", { lv: 2 });
    await p.waitForFunction(() => document.querySelector(".cg-demo.cg-flash"), null, { timeout: 8000 }).catch(() => {});
    await sleep(380);
    await p.screenshot({ path: path.join(SHOTS, `catch2-lv2demo-${F}.png`) });
    const dm = await p.evaluate(async () => {
      const c = window.__zy.catch, s = c.state(), M = await import("./js/zhuyin-catch.js?v=1"), last = document.querySelector(".cg-demo-last");
      return { demo: s.demo, sym: s.target.sym, n: s.notes.length, shown: last && last.textContent, iter: last && getComputedStyle(last).animationIterationCount, anim: last && getComputedStyle(last).animationName,
        head: s.demo && M.lastSym(M.sylls(s.demo.z)[0]), flagCmp: document.querySelector(".cg-flag").classList.contains("cg-cmp"), han: document.querySelector(".cg-demo .cg-han").textContent };
    });
    ok(`${T} Lv2 開局示範：兩個字的詞（${dm.han}）、整個詞的注音排開、最後一個符號（${dm.shown}）閃 2 次、旗子的 ${dm.sym} 一起閃`, !!dm.demo && [...dm.demo.h].length === 2 && dm.shown === dm.demo.last && dm.iter === "2" && dm.anim === "cgFlash" && dm.flagCmp, JSON.stringify(dm));
    ok(`${T} Lv2 示範挑會騙人的那種（第一個字的結尾＝目標 ${dm.sym}，整個詞的結尾不是）、示範時不掉音符`, dm.demo && dm.demo.trap && dm.head === dm.sym && dm.demo.last !== dm.sym && dm.n === 0, JSON.stringify(dm));
    ok(`${T} Lv2 示範完才開始掉音符`, await ready(p) && await p.waitForFunction(() => window.__zy.catch.state().notes.length > 0, null, { timeout: 6000 }).then(() => true, () => false) && await p.evaluate(() => !document.querySelector(".cg-demo")));
    ok(`${T} Lv2 第一次玩「結尾」：唸規則「接住結尾是這個注音的音符！」`, (await spokenOf(p)).includes("接住結尾是這個注音的音符！"), JSON.stringify(await spokenOf(p)));
    // ---- Lv4：🔊 用滑鼠（橫式）／觸控（直式）真點：有唸、音符停住、鼓不跳到旗子那裡 ----
    await enterMode(p, "catch", { lv: 4 });
    await ready(p);
    await p.waitForFunction(() => window.__zy.catch.state().notes.length >= 2, null, { timeout: 10000 }).catch(() => {});
    await sleep(900);
    await p.screenshot({ path: path.join(SHOTS, `catch2-lv4-${F}.png`) });
    const bx = await p.evaluate(() => { window.__spoken = []; window.__zy.catch.debug.moveDrum(0.5); const r = document.querySelector(".cg-flag-pic").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, word: window.__zy.catch.state().target.word }; });
    await sleep(1900);                                       // 開題那次的停住過了
    const a0 = await st(p);
    if (!portrait) await p.mouse.click(bx.x, bx.y);
    else {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bx.x, y: bx.y, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bx.x + 3, y: bx.y + 2, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    }
    await sleep(150); const a1 = await st(p); await sleep(800); const a2 = await st(p);
    const said = await spokenOf(p);
    ok(`${T} Lv4 ${portrait ? "手指觸控" : "滑鼠"}真點旗子的 🔊：唸「${bx.word}」、鼓沒有跑到旗子那裡`, said.includes(bx.word) && Math.abs(a1.drumX - 0.5) < 0.001 && Math.abs(a2.drumX - 0.5) < 0.001, JSON.stringify({ said, d0: a0.drumX, d1: a1.drumX, d2: a2.drumX }));
    ok(`${T} Lv4 真點 🔊 後音符全部停住`, a1.notes.length > 0 && a1.notes.every(n => { const b = a2.notes.find(q => q.h === n.h && q.lane === n.lane); return !b || Math.abs(b.y - n.y) < 0.004; }), JSON.stringify({ a1: a1.notes, a2: a2.notes }));
    // 11-03：每次重開一局乾淨的 Lv4 再抽（遊戲會先避開最近掉過的 6 個詞；接著上面那局抽，ㄩ 組只有 4 個能用、最近又掉過 2 個時只剩 2 種＝假失敗）。重開 12 局，多題目組都驗到
    const pws = await p.evaluate(() => { const c = window.__zy.catch, d = c.debug, out = []; for (let k = 0; k < 12; k++) { c.start(4); d.noSpawn(true); const word = c.state().target.word, hs = new Set(); for (let i = 0; i < 40; i++) { const n = d.drop({ good: true, lane: i % 5 }); if (n) hs.add(n.h); d.clear(); } out.push({ word, hs: [...hs] }); } return out; });
    const pwBad = pws.filter(pw => pw.hs.length < 3 || pw.hs.includes(pw.word));
    ok(`${T} Lv4：唸的那個詞本身不會掉下來（不然看旗子上的圖就接得到）、對的音符至少 3 種（12 局：${pws.map(pw => pw.word).join("、")}）`, pwBad.length === 0, JSON.stringify(pwBad.length ? pwBad : pws.slice(0, 2)));
    ok(`${T}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  console.log(`\n${out.filter(l => l.startsWith("PASS")).length}/${out.filter(l => /^(PASS|FAIL)/.test(l)).length} PASS　截圖：${SHOTS}`);
  process.exitCode = out.some(l => l.startsWith("FAIL")) ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
