// 詞句小偵探「等級」測試（10-13，js/zhuyin-detective.js）：node tools/zy-test/detective-levels.js
// 需要：專案根目錄開著 python -m http.server <埠>，並設 ZY_BASE=http://127.0.0.1:<埠>。截圖存到 DT_SHOTS（預設 %TEMP%\zy-detective-lv）。
// 驗：①生活句題庫（≥24 句、5–10 字、每題 ≥3 個備用錯誤選項、念起來都不同、不只差 ㄣ/ㄥ ㄢ/ㄤ ㄓ/ㄗ ㄕ/ㄙ ㄔ/ㄘ 等聽不出的組、≥8 題可進 Lv5、每級都湊得出 5 題）
//     ②等級參數（Lv1–2 三張卡、Lv3–5 四張卡；差的字數 3/2/2/1/1；Lv1–4 最多 1 個「只差聲調」、Lv5 錯誤選項全部只差聲調；沒玩過的題優先）
//     ③升級規則 advanceLevel（3★ 升、最高級連續 3 次 2★ 升、1★ 斷掉連續、低級不升、Lv5 封頂、舊存檔清洗）
//     ④真的玩：選等級畫面（五色徽章、沒開的鎖住、預設最高級、點鎖住的不會選、按開始才出題）、Lv4 四張卡、差異框規則（Lv1–2 每次、Lv3–4 一次、Lv5 不框）、
//       升級橫幅＋onWin(lv, up)、Lv5 整回合、四張卡在四種尺寸不重疊（截圖）、0 個 console error
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/detective-lab.html";
const SHOTS = process.env.DT_SHOTS || path.join(os.tmpdir(), "zy-detective-lv");
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
const waitQuiet = (p, t = 15000) => p.waitForFunction(() => !window.__dt.V.cur, null, { timeout: t, polling: 20 });
async function fresh(p, opts = {}) {
  await p.evaluate(o => { const d = window.__dt; d.calls.say.length = d.calls.talk.length = d.calls.play.length = d.calls.win.length = 0; d.calls.stop = 0; d.game.start(o); }, opts);
  if (!opts.pick) { await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60); }
}
const card = i => `.dt-card[data-i="${i}"]`;
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
async function answer(p, wrongFirst) {
  const s = await S(p); const wrongs = [...Array(s.n).keys()].filter(i => i !== s.answer).slice(0, wrongFirst);
  for (const i of wrongs) { await p.click(card(i)); await sleep(720); }
  await p.click(card(s.answer));
  await p.waitForFunction(() => window.__dt.game.state().nextShown, null, { timeout: 8000, polling: 20 });
}
async function playRound(p, wrongs = []) {
  const s0 = await S(p), N = s0.total;
  for (let k = 0; k < N; k++) { await waitPhase(p, "ask"); await waitQuiet(p); await answer(p, wrongs[k] || 0); await p.click(".dt-next"); }
  await waitPhase(p, "done");
  await p.waitForFunction(() => window.__dt.calls.win.length > 0, null, { timeout: 12000 });
  return p.evaluate(() => window.__dt.calls.win[0]);
}

(async () => {
  const browser = await launch();

  // ===== ① 生活句題庫 + ② 等級參數（純邏輯，在試玩頁裡跑，注音字典是真的）=====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4");
    const r = await p.evaluate(async () => {
      const m = window.__dt.mod, { readRun, missing } = await import("/js/zhuyin-ann.js?v=8");
      const han = s => s.replace(/[^㐀-鿿]/g, ""), strip = z => (z ? z.replace(/[ˊˇˋ˙]$/, "") : z);
      const lives = m.BANK.filter(q => q.lv), songs = m.BANK.filter(q => !q.lv);
      const conf = (x, y) => { const sw = z => z.replace(/^(ㄓ|ㄗ|ㄕ|ㄙ|ㄔ|ㄘ|ㄋ|ㄌ|ㄈ|ㄏ|ㄖ)/, a => ({ ㄗ: "ㄓ", ㄙ: "ㄕ", ㄘ: "ㄔ", ㄌ: "ㄋ", ㄏ: "ㄈ", ㄖ: "ㄌ" }[a] || a)).replace(/(ㄣ|ㄥ|ㄢ|ㄤ)$/, a => ({ ㄥ: "ㄣ", ㄤ: "ㄢ" }[a] || a)); return x !== y && sw(x) === sw(y); };
      const rows = lives.map(q => {
        const A = [...han(q.options[0])], ra = readRun(A.join("")), wr = q.options.slice(1).map(o => { const B = [...han(o)], rb = readRun(B.join(""));
          return { o, same: ra.join(" ") === rb.join(" "), conf: A.length === B.length && A.some((c, i) => c !== B[i] && ra[i] && rb[i] && conf(strip(ra[i]), strip(rb[i]))), tone: m.toneOnly(q.options[0], o), d: A.filter((c, i) => c !== B[i]).length }; });
        return { id: q.id, lv: q.lv, len: A.length, nWrong: wr.length, same: wr.filter(x => x.same).map(x => x.o), conf: wr.filter(x => x.conf).map(x => x.o), tone: wr.filter(x => x.tone).length, nonTone: wr.filter(x => !x.tone).length, ascii: /[A-Za-z0-9]/.test(q.options.join("")) };
      });
      // 每一級湊得出 5 題（不重複）
      const pool = lv => m.pickRound(m.BANK, 99, m.rng(1), { lv }).length;
      // ② 參數：每級跑 200 個種子
      const stat = {};
      for (let lv = 1; lv <= 5; lv++) {
        const S = { n: new Set(), toneMax: 0, d: [], badFirst: 0, toneAll: true, rounds: 0, nonDistinct: 0 };
        for (let sd = 1; sd <= 200; sd++) {
          const rd = m.pickRound(m.BANK, 5, m.rng(sd), { lv }); S.rounds++;
          for (const q of rd) {
            S.n.add(q.options.length); const wr = q.options.slice(1); const tn = wr.filter(o => m.toneOnly(q.options[0], o)).length;
            S.toneMax = Math.max(S.toneMax, tn); if (tn !== wr.length) S.toneAll = false;
            if (q.lv) wr.forEach(o => { const A = [...q.options[0]], B = [...o]; S.d.push(A.filter((c, i) => c !== B[i]).length); });
            if (q.options[0] !== q.say) S.badFirst++; if (q.order.length !== q.options.length) S.badFirst++;
          }
        }
        stat[lv] = { n: [...S.n].join(","), toneMax: S.toneMax, toneAll: S.toneAll, dAvg: S.d.length ? +(S.d.reduce((a, b) => a + b, 0) / S.d.length).toFixed(2) : null, badFirst: S.badFirst, pool: pool(lv) };
      }
      // 沒玩過的優先：把 lv1 題池裡除了 5 題以外都標玩過 → 這 5 題一定被抽到
      const lv1ids = m.pickRound(m.BANK, 99, m.rng(5), { lv: 1 }).map(q => q.id), keep = lv1ids.slice(0, 5);
      const seenAll = lv1ids.filter(id => !keep.includes(id)), got = m.pickRound(m.BANK, 5, m.rng(9), { lv: 1, seen: seenAll }).map(q => q.id);
      const LV = m.LV.slice(1).map(l => ({ opts: l.opts, dif: l.dif, hint: l.hint, tone: !!l.tone, color: l.color }));
      return { rows, nSongs: songs.length, missing: [...missing], bad: m.checkBank(m.BANK), stat, keep, got, LV };
    });
    const rows = r.rows;
    ok("生活句題庫：≥24 句、都有 lv 標註（1–4）、id 不重複、checkBank 沒有問題", rows.length >= 24 && rows.every(x => x.lv >= 1 && x.lv <= 4) && new Set(rows.map(x => x.id)).size === rows.length && r.bad.length === 0, JSON.stringify({ n: rows.length, bad: r.bad }));
    console.log(`\n生活句 ${rows.length} 句（lv1 ${rows.filter(x => x.lv === 1).length}／lv2 ${rows.filter(x => x.lv === 2).length}／lv3 ${rows.filter(x => x.lv === 3).length}／lv4 ${rows.filter(x => x.lv === 4).length}）、歌詞題 ${r.nSongs}`);
    ok("生活句：每句 5–10 個國字、沒有英數字", rows.every(x => x.len >= 5 && x.len <= 10 && !x.ascii), JSON.stringify(rows.filter(x => x.len < 5 || x.len > 10 || x.ascii).map(x => x.id)));
    ok("生活句：每題至少 3 個備用錯誤選項（才湊得出 4 張卡）、每個備用選項跟正確句念起來都不同（注音字典）", rows.every(x => x.nWrong >= 3) && rows.every(x => !x.same.length) && !r.missing.length, JSON.stringify(rows.filter(x => x.nWrong < 3 || x.same.length).map(x => [x.id, x.same])) + " missing:" + r.missing.join(""));
    ok("生活句：錯誤選項不只差 ㄣ/ㄥ、ㄢ/ㄤ、ㄓ/ㄗ、ㄕ/ㄙ、ㄔ/ㄘ（也不差 ㄋ/ㄌ、ㄈ/ㄏ、ㄖ/ㄌ：台灣口音聽不出）", rows.every(x => !x.conf.length), JSON.stringify(rows.filter(x => x.conf.length).map(x => [x.id, x.conf])));
    const t5 = rows.filter(x => x.tone >= 3);
    ok("生活句：≥8 題有 3 個以上「同音只差聲調」的選項（Lv5 用；例：買／賣、媽／馬、糖／湯）", t5.length >= 8, `${t5.length} 題：${t5.map(x => x.id).join(",")}`);
    ok("生活句：每題至少有 2 個「不是只差聲調」的備用選項（Lv1–4 最多 1 個只差聲調）— 只差聲調的組以外的題", rows.filter(x => x.tone < 3).every(x => x.nonTone >= 3) && rows.filter(x => x.tone >= 3).every(x => x.nonTone >= 2), JSON.stringify(rows.filter(x => x.nonTone < 2).map(x => x.id)));
    console.log("等級參數（200 個種子）：" + JSON.stringify(r.stat));
    const st = r.stat;
    ok("等級參數：Lv1–2 三個選項、Lv3–5 四個選項（每題）", st[1].n === "3" && st[2].n === "3" && st[3].n === "4" && st[4].n === "4" && st[5].n === "4", JSON.stringify(Object.values(st).map(x => x.n)));
    ok("等級參數：Lv1–4 每題最多 1 個「只差聲調」的錯誤選項；Lv5 的錯誤選項全部只差聲調", [1, 2, 3, 4].every(l => st[l].toneMax <= 1) && st[5].toneAll === true, JSON.stringify({ toneMax: [1, 2, 3, 4].map(l => st[l].toneMax), lv5: st[5].toneAll }));
    ok("等級參數：差的字數越高級越少（生活句錯誤選項平均差幾個字 Lv1 > Lv2 > Lv3 > Lv4 > Lv5，Lv1 ≥ 1.9、Lv4 ≤ 1.5（用「同位置不同字」數））", st[1].dAvg > st[2].dAvg && st[2].dAvg > st[3].dAvg && st[3].dAvg > st[4].dAvg && st[4].dAvg > st[5].dAvg && st[1].dAvg >= 1.9 && st[4].dAvg <= 1.5, JSON.stringify([1, 2, 3, 4, 5].map(l => st[l].dAvg)));
    ok("等級參數：每一級都湊得出 5 題以上（Lv1 24、Lv5 ≥8）；回傳的題目 say＝options[0]、卡片順序長度對", [1, 2, 3, 4, 5].every(l => st[l].pool >= 5) && st[5].pool >= 8 && [1, 2, 3, 4, 5].every(l => st[l].badFirst === 0), JSON.stringify(Object.values(st).map(x => [x.pool, x.badFirst])));
    ok("沒玩過的優先：題池裡只剩 5 題沒玩過 → 那 5 題一定抽到", JSON.stringify([...r.keep].sort()) === JSON.stringify([...r.got].sort()), JSON.stringify({ keep: r.keep, got: r.got }));
    ok("等級表：選項 3/3/4/4/4、差字 3/2/2/1/1、差異框 full/full/once/once/none、只有 Lv5 要求只差聲調、五個顏色都不同", JSON.stringify(r.LV.map(l => [l.opts, l.dif, l.hint, l.tone])) === JSON.stringify([[3, 3, "full", false], [3, 2, "full", false], [4, 2, "once", false], [4, 1, "once", false], [4, 1, "none", true]]) && new Set(r.LV.map(l => l.color)).size === 5, JSON.stringify(r.LV));
    ok("第 1 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ③ 升級規則（純函式）=====
  {
    const { ctx, p } = await open(browser, 800, 600, "fast=4");
    const r = await p.evaluate(() => {
      const m = window.__dt.mod, A = m.advanceLevel, c = m.cleanLv;
      const o = {};
      o.up3 = A({ max: 1 }, 1, 3); o.star2 = A({ max: 1 }, 1, 2);
      let rec = c({ max: 2 }); const seq = []; for (const s of [2, 2, 2]) { const x = A(rec, 2, s); seq.push([x.up, x.rec.max, x.rec.two]); rec = x.rec; }
      o.three2 = seq;
      const b = A(A(c({ max: 2 }), 2, 2).rec, 2, 1); o.reset = [b.up, b.rec.two];
      o.low = A({ max: 4, cur: 4 }, 2, 3); o.cap = A({ max: 5, cur: 5 }, 5, 3); o.keepBest = A({ max: 3, st: { 3: 3 } }, 3, 2).rec.st[3];
      o.clean = [c(null), c({ max: 9, cur: 99, st: { 2: 7, 9: 1, x: 2 }, two: 9 }), c({ max: 3, cur: 0 })];
      return o;
    });
    ok("升級：最高級拿 3★ 就升下一級（第 1 級→2，cur 跟著變）；2★ 不升但記連續 1 次", r.up3.up && r.up3.rec.max === 2 && r.up3.rec.cur === 2 && r.up3.rec.st[1] === 3 && !r.star2.up && r.star2.rec.two === 1, JSON.stringify([r.up3, r.star2]));
    ok("升級：最高級連續 3 次 2★ 也升（防卡死），升了連續歸零", JSON.stringify(r.three2) === JSON.stringify([[false, 2, 1], [false, 2, 2], [true, 3, 0]]), JSON.stringify(r.three2));
    ok("升級：1★ 讓連續 2★ 歸零；玩比最高級低的級不升（只記最佳星數）；Lv5 封頂；最佳星數不會被較低的蓋掉", JSON.stringify(r.reset) === "[false,0]" && !r.low.up && r.low.rec.max === 4 && r.low.rec.st[2] === 3 && !r.cap.up && r.cap.rec.max === 5 && r.keepBest === 3, JSON.stringify([r.reset, r.low, r.cap, r.keepBest]));
    ok("存檔清洗 cleanLv：沒資料＝Lv1；max 夾 1–5、cur 夾 1–max、st 只留 1–5 級的 1–3 星、two 夾 0–2", JSON.stringify(r.clean[0]) === '{"max":1,"cur":1,"st":{},"two":0}' && r.clean[1].max === 5 && r.clean[1].cur === 5 && JSON.stringify(r.clean[1].st) === '{"2":3}' && r.clean[1].two === 2 && r.clean[2].max === 3 && r.clean[2].cur === 3, JSON.stringify(r.clean));
    await ctx.close();
  }

  // ===== ④ 真的玩 =====
  // (a) 選等級畫面
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&seed=3&levels=3&pick=1");
    await sleep(300);
    const s0 = await S(p);
    const info = await p.evaluate(() => ({ btns: [...document.querySelectorAll(".dt-lvb-pick")].map(b => ({ lv: b.dataset.lv, lock: b.classList.contains("dt-lock"), sel: b.classList.contains("dt-sel"), txt: b.textContent, bg: getComputedStyle(b).backgroundColor, dis: b.getAttribute("aria-disabled") })), go: !!document.querySelector(".dt-go"), cards: document.querySelectorAll(".dt-card:not(.dt-hide)").length }));
    ok("選等級畫面：五顆圓形徽章（1–5）、開到第 3 級＝前三顆可按、後兩顆鎖住（🔒、灰色）、預設選第 3 級、有「開始」鈕、還沒出題（phase pick）", s0.phase === "pick" && info.btns.length === 5 && info.btns.map(b => b.lock).join() === "false,false,false,true,true" && info.btns[2].sel && info.btns.filter(b => b.sel).length === 1 && info.btns[3].txt.includes("🔒") && info.go && info.cards === 0, JSON.stringify(info));
    ok("選等級畫面：五色互不相同（綠藍紫橘金）、徽章裡是數字不是星星", new Set(info.btns.slice(0, 3).map(b => b.bg)).size === 3 && info.btns.slice(0, 3).every(b => /^[123]/.test(b.txt) && !b.txt.includes("★")), JSON.stringify(info.btns));
    await sleep(900); await shot(p, "pick");
    await p.click('.dt-lvb-pick[data-lv="5"]', { force: true }); await sleep(120);
    ok("點鎖住的徽章：不會選到（還是第 3 級）、不會開始", (await p.evaluate(() => document.querySelector(".dt-lvb-pick.dt-sel").dataset.lv)) === "3" && (await S(p)).phase === "pick");
    await p.click('.dt-lvb-pick[data-lv="2"]'); await sleep(80);
    ok("點第 2 級：選到第 2 級", (await p.evaluate(() => document.querySelector(".dt-lvb-pick.dt-sel").dataset.lv)) === "2");
    await p.click(".dt-go");
    await waitPhase(p, "ask"); await waitQuiet(p);
    const s1 = await S(p);
    const tag = await p.evaluate(() => { const t = document.querySelector(".dt-lvtag"); return { txt: t.textContent, show: !t.classList.contains("dt-hide"), pick: !!document.querySelector(".dt-pick"), cards: document.querySelectorAll(".dt-card").length }; });
    ok("按「開始」：用第 2 級出題（3 張卡）、選等級畫面收掉、上面顯示等級徽章 2", s1.lv === 2 && s1.n === 3 && tag.txt === "2" && tag.show && !tag.pick && tag.cards === 3, JSON.stringify({ s1: { lv: s1.lv, n: s1.n }, tag }));
    ok("第 4a 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // (b) Lv4：四張卡、差異框只出一次；Lv1：三張卡、框每次出；Lv5：全部只差聲調、不框
  for (const lv of [1, 4, 5]) {
    const { ctx, p, errs } = await open(browser, 1024, 768, `fast=4&seed=${lv + 10}&lv=${lv}`);
    await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
    const s = await S(p);
    const cardsN = await p.evaluate(() => document.querySelectorAll(".dt-card").length);
    const tone = lv === 5 ? await p.evaluate(() => { const m = window.__dt.mod, st = window.__dt.game.state(); return st.options.slice(1).every(o => m.toneOnly(st.options[0], o)); }) : null;
    ok(`Lv${lv}：${lv >= 3 ? 4 : 3} 張卡（畫面上的 .dt-card 數量＝state().n）${lv === 5 ? "、錯誤選項全部只差聲調" : ""}`, s.lv === lv && s.n === (lv >= 3 ? 4 : 3) && cardsN === s.n && s.options.length === s.n && (lv !== 5 || tone === true), JSON.stringify({ lv: s.lv, n: s.n, cardsN, options: s.options, tone }));
    if (lv === 4) await shot(p, "lv4_ask");
    // 連續答錯到只剩 1 張：Lv1 框 1 次（第 1 次錯剩 2 張框；第 2 次剩 1 張不框）；Lv4 第 1 次錯框（hintN 1）、第 2 次錯不再框（hintN 仍 1）；Lv5 從不框
    const wrongs = [...Array(s.n).keys()].filter(i => i !== s.answer);
    const hints = [], frames = [];
    for (let k = 0; k < Math.min(2, wrongs.length); k++) {
      await p.click(card(wrongs[k])); await sleep(900);
      const t = await S(p); hints.push(t.hintN); frames.push(await p.evaluate(() => document.querySelectorAll(".dt-c.dt-hint").length));
    }
    if (lv === 4) await shot(p, "lv4_wrong");
    const exp = lv === 5 ? [0, 0] : lv === 4 ? [1, 1] : [1, 1];
    ok(`Lv${lv}：答錯後的差異框 ${lv === 5 ? "不出現（0 次、畫面上 0 個框）" : lv === 4 ? "只出一次（第 2 次答錯不再框；hintN 1→1）" : "照舊（第 1 次答錯剩 2 張卡就框；第 2 次剩 1 張不框）"}`,
      JSON.stringify(hints) === JSON.stringify(exp) && (lv === 5 ? frames.every(f => f === 0) : frames[0] > 0), JSON.stringify({ hints, frames }));
    if (lv === 4) {                                 // Lv4 再比：Lv2（同樣 3 張卡、full）第 1 次錯 hintN=1，Lv3/4 是 once。用同一個測試方式在 Lv4 驗證「第 2 次錯、仍有 ≥2 張卡可比」時沒有新增框
      ok("Lv4：第 2 次答錯時還有 2 張卡可以比（Lv1–2 會再框一次），這裡沒有再框＝每題只框一次", wrongs.length >= 2 && hints[1] === 1);
    }
    ok(`第 4b-${lv} 段：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // (c) Lv3 同樣是 once：用 4 張卡，第 2 次答錯時剩 2 張卡（Lv1–2 的 full 會再框）
  {
    const { ctx, p } = await open(browser, 1024, 768, "fast=4&seed=21&lv=3");
    await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
    const s = await S(p), wr = [...Array(s.n).keys()].filter(i => i !== s.answer);
    await p.click(card(wr[0])); await sleep(900); const h1 = (await S(p)).hintN;
    await p.click(card(wr[1])); await sleep(900); const h2 = (await S(p)).hintN;
    ok("Lv3：4 張卡，第 1 次答錯框一次（hintN 1）、第 2 次答錯（還剩 2 張）不再框（仍 1）", s.n === 4 && h1 === 1 && h2 === 1, JSON.stringify({ n: s.n, h1, h2 }));
    await ctx.close();
  }
  // (d) 整回合：Lv4、api.levels 最高級 4 → 全對 3★ → onWin 帶 lv=4、up=true，橫幅有「第 5 級打開了！」；主程式用同一個 advanceLevel
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&seed=5&lv=4&levels=4&pick=0");
    await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
    const w = await playRound(p, [0, 0, 0, 0, 0]);
    await sleep(500);
    const ban = await p.evaluate(() => ({ up: !!document.querySelector(".dt-banner-up"), txt: (document.querySelector(".dt-banner-up") || {}).textContent, newT: (document.querySelector(".dt-banner-new") || {}).textContent, talk: window.__dt.calls.talk.slice(-2), rec: window.__dt.lvRec.rec }));
    ok("Lv4 全對：onWin 帶 lv:4、up:true；橫幅顯示「第 5 級打開了！」＋新東西「只差聲調！」；說「新的一級打開了！」；存檔紀錄 max=5", w.lv === 4 && w.up === true && w.stars === 3 && ban.up && /5/.test(ban.txt) && /只差聲調/.test(ban.newT) && ban.talk.includes("新的一級打開了！") && ban.rec.max === 5 && ban.rec.st[4] === 3, JSON.stringify({ w: { lv: w.lv, up: w.up, stars: w.stars }, ban }));
    ok("第 4d 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // (e) 沒升級：Lv2（max 4）全對 → up false、橫幅沒有升級字樣
  {
    const { ctx, p } = await open(browser, 1024, 768, "fast=4&seed=6&lv=2&levels=4");
    await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
    const w = await playRound(p, [1, 0, 0, 0, 0]); await sleep(300);
    const up = await p.evaluate(() => !!document.querySelector(".dt-banner-up"));
    ok("玩低一點的級（Lv2、最高級 4）：up:false、沒有升級橫幅；2★ 也不升", w.lv === 2 && w.up === false && !up && w.stars === 2, JSON.stringify({ lv: w.lv, up: w.up, stars: w.stars, up }));
    await ctx.close();
  }
  // (f) Lv5 整回合真的點擊通關（四張卡、全部只差聲調）
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=4&seed=8&lv=5");
    await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
    const w = await playRound(p, [0, 0, 0, 0, 0]);
    ok("Lv5 整回合：5 題全對通關、3★、lv:5、up:false（封頂）", w.lv === 5 && w.total === 5 && w.stars === 3 && w.up === false, JSON.stringify({ lv: w.lv, total: w.total, stars: w.stars, up: w.up }));
    ok("第 4f 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // (g) 沒有等級資料（api.levels 沒給）：照舊 Lv1、不升級、不出選等級畫面也能玩
  {
    const { ctx, p } = await open(browser, 1024, 768, "fast=4&seed=2");
    await waitPhase(p, "ask"); await waitQuiet(p); await sleep(60);
    const s = await S(p); const w = await playRound(p, [0, 0, 0, 0, 0]);
    ok("沒給 api.levels：直接 Lv1（3 張卡）、全對 3★、up:false（舊的接法照樣能玩）", s.lv === 1 && s.n === 3 && w.lv === 1 && w.up === false && w.stars === 3, JSON.stringify({ lv: s.lv, n: s.n, w: { lv: w.lv, up: w.up } }));
    await ctx.close();
  }
  // (h) 四種尺寸：Lv4（四張卡）不重疊、都在畫面內、卡片 ≥ 56px 高、字級夠；Lv4 最長句一行放得下
  for (const [w, h, tag] of [[1024, 768, "ipad_land"], [768, 1024, "ipad_port"], [1366, 1024, "ipadpro_land"], [844, 390, "phone_land"]]) {
    const { ctx, p, errs } = await open(browser, w, h, "fast=2&seed=4&lv=4");
    await waitPhase(p, "ask"); await sleep(700);
    const m = await p.evaluate(() => {
      const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      const vm = Math.min(innerWidth, innerHeight) / 100;
      const cs = [...document.querySelectorAll(".dt-card")].map(c => { const s = c.querySelector(".dt-sent"), a = s.querySelector(".ac[data-z]"); return { ...R(c), sr: R(s), fs: parseFloat(getComputedStyle(s).fontSize), zy: parseFloat(getComputedStyle(a, "::after").fontSize) }; });
      const over = []; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (hit(cs[i], cs[j])) over.push(i + "×" + j);
      const ui = [".dt-listen", ".dt-prog", ".dt-bubble", ".dt-dog"].map(q => R(document.querySelector(q))), hud = [R(document.getElementById("homeBtn")), R(document.getElementById("musicBtn"))];
      const uiOver = ui.some(u => cs.some(c => hit(u, c))), hudOver = cs.some(c => hud.some(x => hit(x, c)));
      return { vm, n: cs.length, over, uiOver, hudOver, inView: cs.every(c => c.l >= -0.5 && c.t >= -0.5 && c.r <= innerWidth + 0.5 && c.b <= innerHeight + 0.5), fit: cs.every(c => c.sr.l >= c.l + 1 && c.sr.r <= c.r - 1 && c.sr.t >= c.t && c.sr.b <= c.b), minH: Math.round(Math.min(...cs.map(c => c.h))), fs: Math.min(...cs.map(c => c.fs)), zy: Math.min(...cs.map(c => c.zy)) };
    });
    await shot(p, `${tag}_lv4`);
    const ipad = Math.min(w, h) >= 700;
    ok(`Lv4 版面 ${w}×${h}：四張卡互不重疊、不壓到 🔊／題號／小狗／對話框／🏠🎵、都在畫面內、整句一行放進卡片`, m.n === 4 && !m.over.length && !m.uiOver && !m.hudOver && m.inView && m.fit, JSON.stringify(m));
    ok(`Lv4 字級 ${w}×${h}：${ipad ? "國字 ≥ 35px、注音 ≥ 13px" : "國字 ≥ 4.2vmin"}；卡片 ≥ 56px 高（點得到）`, (ipad ? m.fs >= 35 && m.zy >= 13 : m.fs >= 4.2 * m.vm - 0.1) && m.minH >= 56, JSON.stringify({ fs: m.fs, zy: m.zy, minH: m.minH, vm: m.vm }));
    ok(`第 4h-${tag} 段：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // (i) 暫停／stop：選等級畫面停在 pick 時 stop() 乾淨（沒有留下畫面或回呼）
  {
    const { ctx, p } = await open(browser, 1024, 768, "fast=4&levels=2&pick=1");
    await sleep(200); await p.evaluate(() => window.__dt.game.stop()); await sleep(1500);
    const left = await p.evaluate(() => ({ pick: !!document.querySelector(".dt-pick"), wrap: !!document.querySelector(".dt-wrap"), st: window.__dt.game.state() }));
    ok("選等級畫面中 stop()：畫面清空、state 為 null、沒有留下回呼", !left.pick && !left.wrap && left.st === null, JSON.stringify(left));
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter(r => r.startsWith("FAIL"));
  console.log("\n" + results.join("\n"));
  if (allErrs.length) console.log("\nconsole 錯誤：\n" + allErrs.join("\n"));
  console.log(`\n詞句小偵探等級測試：${results.length - fails.length} PASS／${fails.length} FAIL；console 錯誤 ${allErrs.length} 個。截圖：${SHOTS}`);
  process.exit(fails.length || allErrs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
