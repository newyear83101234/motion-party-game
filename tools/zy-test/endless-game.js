// 11-01 跑跑大冒險／小魚長大記：從主程式真的進遊戲玩（不用 stub）——開局、答題記貼紙與容易搞混、過區存打卡點、
// 休息一下＝結算（星星進罐子、存檔）、再玩從打卡點接著、跑完第 1 圈＝大結局＋下次介紹卡變「🔥 挑戰第 2 圈」、離開回小島動畫收乾淨
// 跑法：node tools/zy-test/endless-game.js [run|grow]（預設兩款都跑；要先開本機伺服器）；截圖存 %TEMP%\zy-endless-game\
// 兩款模組的測試掛鉤不一樣（跑跑 window.__zyRun、小魚 window.__zyGrow），下面 AD 把差異包起來
const path = require("path"), fs = require("fs");
const { launch, openGame, enterMode } = require("./lib");
const OUT = path.join(process.env.TEMP || ".", "zy-endless-game"); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { if (cond) pass++; else fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + info)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AD = {
  run: { hook: "__zyRun", live: "s && s.phase === 'run'", clock: "clock", rest: "restOpen",
    clearZone: () => { window.__zyRun.setZone(0); window.__zyRun.auto(0.9); }, cleared: "s.zonesCleared >= 1",
    finish: () => { window.__zyRun.setZone(7); window.__zyRun.auto(1); } },
  grow: { hook: "__zyGrow", live: "s && !s.ended && !s.over && s.task", clock: "t", rest: "restOn",
    clearZone: () => { window.__zyGrow.setZone(0); window.__zyGrow.noPreds(true); }, cleared: "s.zone >= 1",
    finish: () => { window.__zyGrow.setZone(7); window.__zyGrow.noPreds(true); }, evolve: true },
};
const want = process.argv.slice(2).filter(a => AD[a]);
const MODES = want.length ? want : ["run", "grow"];
async function kick(p, m) {
  if (!AD[m].evolve) return;
  for (let k = 0; k < 40; k++) { await sleep(400); if (await p.evaluate(() => window.__zyGrow.evolve())) return; }
}
const st = (p, m) => p.evaluate(h => window[h] && window[h].state(), AD[m].hook);
const sv = p => p.evaluate(() => JSON.parse(localStorage.getItem("zy1_endless") || "null"));
const until = (p, m, cond, ms = 60000) => p.waitForFunction(([h, c]) => { const s = window[h] && window[h].state(); return !!s && new Function("s", "return " + c)(s); }, [AD[m].hook, cond], { timeout: ms, polling: 250 });

async function one(b, m) {
  const A = AD[m], H = A.hook;
  const { p, errs, ctx } = await openGame(b, { w: 1180, h: 820, stickers: 40, stars: 0, query: "debug&no3d&endlessspeed=6" });
  // ① 進遊戲
  await enterMode(p, m);
  await until(p, m, A.live, 30000);
  const ui = await p.evaluate(mm => ({ sec: !document.getElementById(mm).classList.contains("hidden"), speak: document.getElementById("speakBtn").classList.contains("hidden"),
    root: document.getElementById(mm + "Root").children.length > 0, home: !!document.getElementById("homeBtn").offsetParent }), m);
  ok(`${m}：進得去（畫面、主程式「再聽」鈕藏起來、🏠 在）`, ui.sec && ui.speak && ui.root && ui.home, JSON.stringify(ui));
  // ② 第 7 區（兩個字的詞）答對 3 題、答錯 1 題
  await p.evaluate(h => window[h].setZone(6), H); await sleep(600);
  for (let k = 0; k < 3; k++) { await p.evaluate(h => window[h].answer(true), H); await sleep(1500); }
  await p.evaluate(h => window[h].answer(false), H); await sleep(1500);
  const s1 = await st(p, m), run1 = await p.evaluate(() => window.__zy.endlessRun);
  ok(`${m}：答題有回報（答對 ≥3、答錯 ≥1；第 1 圈沒有心）`, s1.right >= 3 && s1.wrong >= 1 && !s1.hearts, JSON.stringify({ right: s1.right, wrong: s1.wrong, hearts: s1.hearts }));
  ok(`${m}：答對的詞記成練過的詞（結算用）`, (run1.words || []).length >= 1, JSON.stringify((run1.words || []).map(w => w.h)));
  // ③ 回第 1 區、過一區 → 打卡點 at 存起來
  await p.evaluate(A.clearZone); await kick(p, m);
  await until(p, m, A.cleared, 120000).catch(() => {});
  await sleep(800);
  const z = await sv(p);
  ok(`${m}：過區＝打卡點存起來（at ≥ 1、go=1）`, z && z[m] && z[m].at >= 1 && z[m].go === 1, JSON.stringify(z && z[m]));
  // ④ 休息一下＝結算
  // 「休息一下」只在過區後出現約 3 秒（加速 6 倍＝真實 0.5 秒）：看到就在同一次輪詢裡按（小魚再進化一次製造下一個過區）
  let rested = false;
  for (let k = 0; k < 3 && !rested; k++) {
    if (k) await kick(p, m);
    rested = await p.waitForFunction(([h, key]) => { const g = window[h], s = g && g.state(); return !!(s && s[key] && g.rest()); }, [H, A.rest], { timeout: 90000, polling: 30 }).then(() => true).catch(() => false);
  }
  ok(`${m}：過區畫面有「休息一下」而且按得到`, rested === true, String(rested));
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 30000 }).catch(() => {});
  await sleep(3500);
  const res = await p.evaluate(() => ({ shown: !document.getElementById("result").classList.contains("hidden"), text: document.getElementById("resultText").textContent, stars: +localStorage.getItem("zy1_stars"),
    on: document.querySelectorAll("#resultStars .star.on").length }));
  const z2 = await sv(p);
  ok(`${m}：休息一下 → 結算畫面（${res.text}）`, res.shown && (m === "run" ? /跑了 \d+ 公尺！/ : /長成.+了！/).test(res.text), JSON.stringify(res));
  ok(`${m}：星星進罐子（至少 1）、三格星星至少 1 顆亮`, res.stars >= 1 && res.on >= 1, JSON.stringify(res));
  ok(`${m}：存檔 plays=1、best>0、at＝停下來那區、go=1`, z2[m].plays === 1 && z2[m].best > 0 && z2[m].at >= 1 && z2[m].go === 1, JSON.stringify(z2[m]));
  await p.screenshot({ path: path.join(OUT, `${m}-result.png`) });
  // ⑤ 再玩＝從打卡點接著
  const at = z2[m].at;
  await p.evaluate(() => document.getElementById("againBtn").click());
  await until(p, m, A.live, 30000).catch(() => {}); await sleep(600);
  const s3 = await st(p, m);
  ok(`${m}：再玩＝從打卡點（第 ${at + 1} 區）接著`, s3 && s3.zone === at, JSON.stringify({ zone: s3 && s3.zone, at }));
  // ⑥ 第 8 區走完＝大結局
  await p.evaluate(A.finish); await kick(p, m);
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 240000 }).catch(() => {});
  await sleep(3500);
  const fin = await p.evaluate(() => ({ text: document.getElementById("resultText").textContent, on: document.querySelectorAll("#resultStars .star.on").length }));
  const z3 = await sv(p);
  ok(`${m}：走完第 1 圈＝大結局結算（${fin.text}）`, (m === "run" ? /跑完全部 8 區了！/ : /長成魚王了！/).test(fin.text) && fin.on >= 1, JSON.stringify(fin));
  ok(`${m}：大結局後存 done=1、at=8（第 2 圈）、go=0（預設重新走旅程）`, z3[m].done === 1 && z3[m].at === 8 && z3[m].go === 0, JSON.stringify(z3[m]));
  await p.screenshot({ path: path.join(OUT, `${m}-finale-result.png`) });
  // ⑦ 結算畫面時遊戲已經不再前進；回小島後也停
  const c1 = await st(p, m); await sleep(800); const c2 = await st(p, m);
  ok(`${m}：結算畫面時遊戲時間不再走（省電）`, !c1 || !c2 || c1[A.clock] === c2[A.clock], JSON.stringify([c1 && c1[A.clock], c2 && c2[A.clock]]));
  await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(400);
  await p.evaluate(() => document.getElementById("confirmYes")?.click()); await sleep(1200);
  const s4 = await st(p, m); await sleep(800); const s5 = await st(p, m);
  ok(`${m}：回小島後引擎停了`, !s4 || !s5 || s4[A.clock] === s5[A.clock], JSON.stringify([s4 && s4[A.clock], s5 && s5[A.clock]]));
  // ⑧ 選「🔥 挑戰第 2 圈」（go=1）＝從第 2 圈開始、有 3 顆心
  await p.evaluate(mm => { const r = JSON.parse(localStorage.getItem("zy1_endless")); r[mm].go = 1; localStorage.setItem("zy1_endless", JSON.stringify(r)); }, m);
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(500);
  await enterMode(p, m);
  await until(p, m, A.live, 30000).catch(() => {});
  const s6 = await st(p, m);
  ok(`${m}：選了「🔥 挑戰第 2 圈」＝從第 9 區（第 2 圈）開始、有 3 顆心`, s6 && s6.zone === 8 && s6.hearts === 3, JSON.stringify({ zone: s6 && s6.zone, hearts: s6 && s6.hearts }));
  await p.screenshot({ path: path.join(OUT, `${m}-loop2.png`) });
  const bad = errs.filter(e => !/favicon/.test(e));
  ok(`${m}：沒有主控台錯誤`, bad.length === 0, bad.slice(0, 3).join(" | "));
  await ctx.close();
}
(async () => {
  const b = await launch();
  try { for (const m of MODES) await one(b, m); } finally { await b.close(); }
  console.log(`\n${pass} PASS / ${fail} FAIL　截圖：${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
