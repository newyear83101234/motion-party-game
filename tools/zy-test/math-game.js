// 數學島兩款接進主程式的整合測試（11-10 v10；docs/zhuyin-math-plan.md §5）：node tools/zy-test/math-game.js
// 驗：新存檔 0 張貼紙就能玩兩款（卡片沒鎖）；從卡片選單（?no3d）真的進去、用模組掛鉤一題一題答到結算；
//     星星由模組算（全對 3 星、錯 4 題 1 星）→ 結算文字、最佳紀錄 best、五級徽章升級（zy{n}_lv）、存檔重開讀回；
//     主程式的 💬 朗讀鈕在數學遊戲藏起來（模組有自己的 🔊）；暫停時題目不前進；回小島＝模組停掉；家長頁有紀錄；旁注音沒漏字；沒有錯誤。
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。
const path = require("path"), fs = require("fs");
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&no3d";
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-math-game");
fs.mkdirSync(SHOTS, { recursive: true });
const strip = s => String(s || "").replace(/[\sㄅ-ㄩˊˇˋ˙]/g, "");
const resultOn = (p, ms = 20000) => p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: ms }).then(() => true, () => false);
const resultStars = p => p.evaluate(() => document.querySelectorAll("#resultStars .star.on").length);
const resultText = p => p.evaluate(() => { const r = document.getElementById("resultText"); const c = r.cloneNode(true); c.querySelectorAll("rt").forEach(x => x.remove()); return c.textContent; });

// 一題一題答到結算：wrongAt＝這幾題（0 起）先答錯一次（之後照示範點對）
async function playRound(p, m, wrongAt = []) {
  const t0 = Date.now(), done = new Set();
  while (Date.now() - t0 < 150000) {
    if (await p.evaluate(() => !document.getElementById("result").classList.contains("hidden"))) return true;
    const r = await p.evaluate(([m, wrongAt, done]) => {
      if (m === "fruit") {
        const F = window.__zyFruit, s = F && F.state(); if (!s || !s.q) return "wait";
        if (s.phase === "input" || s.phase === "forced") {
          if (s.phase === "input" && wrongAt.includes(s.i) && !done.includes(s.i)) { F.answerWrong(); return "wrong:" + s.i; }
          F.answer(s.q.ans); return "ans";
        }
        F.skip(); return "skip";
      }
      const H = window.__zyHop, s = H && H.state(); if (!s || !s.q) return "wait";
      if (!H.ready()) return "wait";
      if (s.phase === "ask" && wrongAt.includes(s.i) && !done.includes(s.i)) {
        // 答錯：挑一片不是答案、不是青蛙站的、不是起點隔壁（隔壁第一次只提示不算錯）、也不是「把起點算進去」的那片
        const bad = [...Array(11).keys()].filter(n => n !== s.q.ans && n !== s.frogAt && Math.abs(n - s.frogAt) !== 1 && Math.abs(n - s.q.ans) !== 1);
        if (s.q.ask === "b") { const v = s.q.choices.find(x => x !== s.q.ans && x !== s.q.ans + 1); H.choose(v != null ? v : s.q.choices.find(x => x !== s.q.ans)); }
        else H.tapPad(bad[0]);
        return "wrong:" + s.i;
      }
      H.right(); return "ans";
    }, [m, wrongAt, [...done]]);
    if (r.startsWith("wrong:")) done.add(+r.slice(6));
    await sleep(r === "skip" ? 60 : 200);
  }
  return false;
}

(async () => {
  const browser = await launch();
  try {
    // ===== 1. 新存檔 0 張貼紙：兩款卡片都沒鎖、進得去 =====
    const { ctx, p, errs } = await openGame(browser, { stickers: 0, query: Q });
    const lk = await p.evaluate(() => ["fruit", "hop"].map(m => { const c = document.querySelector(`.mode-card[data-mode=${m}]`); return { m, there: !!c, locked: !!c && (c.classList.contains("locked") || c.disabled) }; }));
    ok("新存檔 0 張貼紙：水果籃、跳荷葉兩張卡都在、都沒鎖（一開始就能玩）", lk.every(x => x.there && !x.locked), JSON.stringify(lk));

    for (const m of ["fruit", "hop"]) {
      const T = m === "fruit" ? "水果籃" : "跳荷葉";
      await enterMode(p, m, { lv: 1 });
      const s0 = await p.waitForFunction(m => { const s = (m === "fruit" ? window.__zyFruit : window.__zyHop)?.state(); return s && s.q ? s : null; }, m, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
      ok(`${T}：從選單進去、模組載好、第一題出來（Lv1、10 題）`, !!s0 && s0.lv === 1 && (s0.n || s0.total) === 10, JSON.stringify(s0 && { lv: s0.lv, n: s0.n || s0.total, q: s0.q }));
      ok(`${T}：主程式的 💬 朗讀鈕藏起來（模組算式卡上有自己的 🔊）`, await p.evaluate(() => document.getElementById("speakBtn").classList.contains("hidden")));
      ok(`${T}：左上 🏠 在、遊戲畫面在 #${m}Root 裡`, await p.evaluate(m => !document.getElementById("homeBtn").classList.contains("hidden") && document.getElementById(m + "Root").children.length > 0, m));
      if (m === "fruit") {
        // 暫停：🏠 → 確認框開著時遊戲不前進
        await p.waitForFunction(() => window.__zyFruit.state().phase === "input", null, { timeout: 20000 }).catch(() => {});
        await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
        const a = await p.evaluate(() => { const s = window.__zyFruit.state(); return { i: s.i, phase: s.phase, conf: !document.getElementById("confirm").classList.contains("hidden") }; });
        await sleep(1500);
        const b = await p.evaluate(() => { const s = window.__zyFruit.state(); return { i: s.i, phase: s.phase }; });
        ok("暫停（🏠 確認框開著）：題目不前進", a.conf && a.i === b.i && a.phase === b.phase, JSON.stringify({ a, b }));
        await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(300);
      }
      const fin = await playRound(p, m, []);
      ok(`${T} Lv1：一題一題答到底 → 結算`, fin && await resultOn(p));
      await sleep(700);
      ok(`${T} Lv1 全部第一次就答對＝3 星、結算寫「算完10題！」`, (await resultStars(p)) === 3 && strip(await resultText(p)) === "算完10題！", `${await resultStars(p)} ${strip(await resultText(p))}`);
      const run = await p.evaluate(() => window.__zy.mathRun);
      ok(`${T}：主程式收到 onWin（right 10、wrong 0、total 10、lv 1）`, run && run.right === 10 && run.wrong === 0 && run.total === 10 && run.lv === 1, JSON.stringify(run));
      const lv = await p.evaluate(m => window.__zy.lv[m], m);
      ok(`${T}：Lv1 拿 3 星 → 開 Lv2（五級徽章，存在 zy{n}_lv）`, lv && lv.max === 2 && lv.st[1] === 3, JSON.stringify(lv));
      ok(`${T}：最佳紀錄 best.${m}＝3`, await p.evaluate(m => window.__zyB.best[m] === 3, m));
      await p.screenshot({ path: path.join(SHOTS, `result-${m}.png`) });
      // 錯 4 題（第一次答錯，之後照示範點對）＝第一次就對 6 題 → 1 星
      await enterMode(p, m, { lv: 1 });
      await p.waitForFunction(m => { const s = (m === "fruit" ? window.__zyFruit : window.__zyHop)?.state(); return s && s.q && s.i === 0; }, m, { timeout: 15000 }).catch(() => {});
      const fin2 = await playRound(p, m, [1, 3, 5, 7]);
      ok(`${T} 錯 4 題：照樣玩完（不會輸）→ 結算`, fin2 && await resultOn(p));
      await sleep(700);
      const run2 = await p.evaluate(() => window.__zy.mathRun);
      ok(`${T} 錯 4 題：right 6、wrong 4 → 1 星（best 還是 3）`, run2 && run2.right === 6 && run2.wrong === 4 && (await resultStars(p)) === 1 && await p.evaluate(m => window.__zyB.best[m] === 3, m), JSON.stringify(run2) + " 星 " + await resultStars(p));
      // 回小島：模組停掉、mode 清空
      await p.evaluate(() => document.getElementById("menuBtn").click()); await sleep(800);
      const back = await p.evaluate(m => ({ menu: !document.getElementById("menu").classList.contains("hidden"), mode: window.__zy.mode, scr: document.getElementById(m).classList.contains("hidden") }), m);
      ok(`${T}：結算按「回小島」→ 回選單、mode 清空、遊戲畫面收起來`, back.menu && back.mode === null && back.scr, JSON.stringify(back));
    }
    // ===== 1b. 11-14 一年級 6～10 級（docs/zhuyin-math-plan.md §7）：第 5 級 3 星開第 6 級、介紹卡分兩頁、第 10 級玩到結算、最高就是 10 =====
    for (const m of ["fruit", "hop"]) {
      const T = m === "fruit" ? "水果籃" : "跳荷葉", hook = m === "fruit" ? "__zyFruit" : "__zyHop";
      const waitQ = () => p.waitForFunction(h => { const s = window[h]?.state(); return s && s.q && s.i === 0; }, hook, { timeout: 15000 }).catch(() => {});
      await enterMode(p, m, { lv: 5 }); await waitQ();
      ok(`${T} Lv5 全對 → 結算`, (await playRound(p, m, [])) && await resultOn(p));
      await p.waitForFunction(() => { const d = document.getElementById("lvUp"); return d && !d.classList.contains("hidden"); }, null, { timeout: 20000 }).catch(() => {});
      const up = await p.evaluate(m => ({ lv: window.__zy.lv[m], txt: (() => { const d = document.getElementById("lvUp"); if (!d || d.classList.contains("hidden")) return ""; const c = d.cloneNode(true); c.querySelectorAll("rt").forEach(x => x.remove()); return c.textContent.replace(/\s/g, ""); })() }), m);
      ok(`${T}：第 5 級 3 星 → 開第 6 級（畫面寫「第6級打開了」）`, up.lv.max === 6 && up.lv.st[5] === 3 && /第6級打開了/.test(up.txt), JSON.stringify(up));
      await p.evaluate(() => { document.getElementById("lvUp")?.classList.add("hidden"); document.getElementById("menuBtn").click(); }); await sleep(700);
      // 介紹卡：10 級分兩頁
      await p.evaluate(m => { window.__zy.setLv(m, 10); window.__zy.showPick(m); }, m); await sleep(300);
      const pg = () => p.evaluate(() => ({ lvs: [...document.querySelectorAll("#pkLv .lv-pick[data-lv]")].map(b => +b.dataset.lv), on: +(document.querySelector("#pkLv .lv-pick.on")?.dataset.lv || 0), sw: !!document.querySelector("#pkLv .lv-page"),
        fit: (() => { const r = document.getElementById("pkLv").getBoundingClientRect(), c = document.getElementById("pick").getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1; })() }));
      const p2 = await pg();
      ok(`${T} 介紹卡：最高 10 級時先看到 6～10、亮的是 10、有翻頁鈕、沒超出卡片`, p2.lvs.join() === "6,7,8,9,10" && p2.on === 10 && p2.sw && p2.fit, JSON.stringify(p2));
      await p.screenshot({ path: path.join(SHOTS, `pick10-${m}.png`) });
      await p.evaluate(() => document.querySelector("#pkLv .lv-page").click()); await sleep(200);
      const p1 = await pg();
      ok(`${T} 介紹卡：翻頁 → 1～5，這次要玩的級沒被改掉（還是 10）`, p1.lvs.join() === "1,2,3,4,5" && p1.sw && p1.fit && await p.evaluate(m => window.__zy.lvRec(m).cur === 10, m), JSON.stringify(p1));
      await p.evaluate(() => window.__zy.hidePick && window.__zy.hidePick()); await sleep(200);
      await enterMode(p, m, { lv: 10 }); await waitQ();
      const s10 = await p.evaluate(h => { const s = window[h].state(); return { lv: s.lv, q: s.q }; }, hook);
      ok(`${T} Lv10：進得去、題目是一年級的（${m === "fruit" ? "二位數" : "跳著數 step 2／5／10"}）`, s10.lv === 10 && (m === "fruit" ? s10.q.a >= 10 : [2, 5, 10].includes(s10.q.step)), JSON.stringify(s10));
      await sleep(1500); await p.screenshot({ path: path.join(SHOTS, `lv10-${m}.png`) });
      ok(`${T} Lv10 全對 → 結算 3 星`, (await playRound(p, m, [])) && await resultOn(p) && (await sleep(700), (await resultStars(p)) === 3));
      await sleep(6000);                                 // 等結算動畫跑完：這時候如果會跳「第 11 級打開了」早就跳了
      const top = await p.evaluate(m => ({ lv: window.__zy.lv[m], run: window.__zy.mathRun, up: (() => { const d = document.getElementById("lvUp"); return !!d && !d.classList.contains("hidden"); })() }), m);
      ok(`${T}：第 10 級 3 星 → 最高還是 10（沒有第 11 級）、st[10]＝3、onWin lv 10`, top.lv.max === 10 && top.lv.st[10] === 3 && top.run.lv === 10 && !top.up, JSON.stringify(top));
      await p.evaluate(() => document.getElementById("menuBtn").click()); await sleep(700);
    }
    // ===== 2. 存檔重開讀回：等級、最佳紀錄（測試的 enterMode 會把最高級設回 Lv1，所以跟重開前比：一樣就是讀回來了；Lv1 拿 3 星會開 Lv2 上面已驗）=====
    const pre = await p.evaluate(() => ({ lvF: window.__zy.lv.fruit, lvH: window.__zy.lv.hop }));
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(400);
    const rb = await p.evaluate(() => ({ lvF: window.__zy.lv.fruit, lvH: window.__zy.lv.hop, bF: window.__zyB.best.fruit, bH: window.__zyB.best.hop }));
    ok("重開網頁：兩款的等級紀錄（跟重開前一樣）與最佳 3 星都讀得回來", JSON.stringify(rb.lvF) === JSON.stringify(pre.lvF) && JSON.stringify(rb.lvH) === JSON.stringify(pre.lvH) && rb.lvF.st[1] === 3 && rb.bF === 3 && rb.bH === 3, JSON.stringify({ rb, pre }));
    // ===== 3. 家長頁：玩了什麼有兩款、各 4 次（1b 又各玩 2 局） =====
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(500);
    const rows = await p.evaluate(() => [...document.querySelectorAll("#statsModes .st-row")].map(x => x.textContent.replace(/\s/g, "")).filter(t => /水果籃|跳荷葉/.test(t)));
    ok("家長頁「玩了什麼」有水果籃、跳荷葉各 4 次", rows.some(t => /水果籃4次/.test(t)) && rows.some(t => /跳荷葉4次/.test(t)), JSON.stringify(rows));
    await p.evaluate(() => document.getElementById("settingsClose").click());
    ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(`\n${fails ? "❌" : "✅"} 數學島整合：${out.length - fails}/${out.length}`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.log(out.join("\n")); console.error(e); process.exit(1); });
