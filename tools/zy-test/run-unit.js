// 跑跑大冒險 單獨測試（11-01）：node tools/zy-test/run-unit.js [long]
// 用獨立試玩頁 tools/zy-test/run-harness.html（不經過主程式），靠 window.__zyRun 掛鉤操作。需要：專案根目錄開著 python -m http.server 8765。
// 一次只開一個 3D 頁面（這台電腦同時開太多 3D headless 會互搶當掉）。截圖存到 RUN_SHOTS（預設 %TEMP%\zy-run-shots）。
// 驗：①開局（夥伴模型、WebGL 1 個）②換跑道：鍵盤、滑 40px、點左半邊、點注音卡；正常速度 0.2 秒內滑到 ③讀題時間：第 1 級 4.5 秒、第 6 級 8.5 秒（不選）；
//     門一出現世界放慢、點卡 0.5 秒後回原速 ④答對（onAnswer ok、＋連對）⑤答錯（旅程：不扣心、金幣灑出去、念正解）⑥過區（onZone、星星罐、大字、休息一下鈕）
//     ⑦暫停時不前進 ⑧加速跑完 2 區以上（自動駕駛）⑨休息一下 → onEnd(rest) ⑩第 1 圈第 8 區跑完 → onEnd(finished) ⑪第 2 圈：3 顆心、扣到 0 → onEnd
//     ⑫onEnd 欄位齊全 ⑬夥伴模型載不到 → 退回小貓 ⑭stop() 之後沒有殘留 rAF、WebGL 收乾淨 ⑮截圖：橫／直 × 第 1、5、7 區＋收尾 ⑯全程沒有 console 錯誤
//     long：玩久模擬（80% 答對、正常速度換算）第 1 圈跑完要幾分鐘（目標 8–11 分鐘）
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const SHOTS = process.env.RUN_SHOTS || path.join(os.tmpdir(), "zy-run-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = "http://127.0.0.1:8765/tools/zy-test/run-harness.html";
const out = []; const ok = (name, cond, info = "") => { const l = `${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`; out.push(l); console.log(l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LONG = process.argv.includes("long"), ONLY_LONG = process.argv.includes("onlylong");
const allErrs = [];

async function open(b, q, w = 1180, h = 820) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 200)); });
  await p.goto(`${BASE}?${q}`);
  await p.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 30000 });
  return { ctx, p, errs, close: async () => { allErrs.push(...errs.map(e => `[${q}] ${e}`)); await ctx.close(); } };
}
const S = p => p.evaluate(() => window.__zyRun.state());
const until = (p, fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
const running = p => until(p, () => { const s = window.__zyRun.state(); return s && s.phase === "run"; }, null, 30000);
const rowOn = (p, ms = 60000) => until(p, () => { const s = window.__zyRun.state(); return s && s.row; }, null, ms);
const nextOn = (p, ms = 30000) => until(p, () => { const s = window.__zyRun.state(); return s && s.phase === "run" && (s.row || s.next); }, null, ms);
const answer = async (p, good) => { await nextOn(p); const l = await p.evaluate(g => window.__zyRun.answer(g), good); await sleep(120); return l; };
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
// 在頁面裡量：門出現（row 有了）到撞上（row 沒了）用了幾秒遊戲時間；choose＝出現後幾秒（遊戲時間）點哪條跑道的卡
const measureRow = (p, choose) => p.evaluate(choose => new Promise(res => {
  let t0 = null, sawSlow = false, vz = 0, chosen = false, tChose = null, vBack = null;
  const tick = () => {
    const s = window.__zyRun.state(); if (!s) return res(null);
    if (t0 === null && s.row) { t0 = s.clock; vz = s.vz; }
    if (t0 !== null && s.row) {
      if (s.v < vz * 0.8) sawSlow = true;
      if (choose && !chosen && s.clock - t0 >= choose.at) { chosen = true; tChose = s.clock; window.__zyRun.lane(choose.lane); }
      if (chosen && vBack === null && s.v >= vz * 0.95) vBack = s.clock - tChose;
    }
    if (t0 !== null && !s.row) return res({ T: s.clock - t0, sawSlow, vz, vBack, tier: null });
    requestAnimationFrame(tick);
  };
  tick();
}), choose);

(async () => {
  const b = await launch();
  try {
    if (!ONLY_LONG) {
      // ===== A. 開局、換跑道、答對答錯、過區、休息一下（第 1 區，正常速度 1 倍） =====
      { const { p, close } = await open(b, "seed=11&speed=1");
        ok("A1 開局進到跑步", await running(p));
        let s = await S(p); const st0 = await p.evaluate(() => window.__zyRun.stats());
        ok("A1 旅程模式、沒有愛心、WebGL 1 個", s.mode === "trip" && s.hearts === 0 && st0.live === 1, `mode=${s.mode} hearts=${s.hearts} ctx=${JSON.stringify(st0)}`);
        ok("A1 夥伴模型載好（預設小貓）", s.pet && !s.pet.temp && /cat\.glb$/.test(s.pet.url || ""), JSON.stringify(s.pet));
        await p.keyboard.press("ArrowRight"); await sleep(200); s = await S(p);
        ok("A2 鍵盤 → 換跑道，0.2 秒內滑到", s.lane === 2 && Math.abs(s.petX - 2.6) < 0.3, `lane=${s.lane} petX=${s.petX}`);
        await p.mouse.move(700, 420); await p.mouse.down(); await p.mouse.move(660, 422, { steps: 4 }); await p.mouse.up(); await sleep(220); s = await S(p);
        ok("A2 往左滑 40px＝換一條", s.lane === 1 && Math.abs(s.petX) < 0.3, `lane=${s.lane} petX=${s.petX}`);
        await p.mouse.click(160, 420); await sleep(220); s = await S(p);
        ok("A2 點畫面左半邊＝往左一條", s.lane === 0, `lane=${s.lane}`);
        // 第 1 區：2 個門（左右），中間花叢；點卡＝換到那條、0.5 秒後回原速
        ok("A3 第一排門出現", await rowOn(p, 20000));
        s = await S(p); const cards = await p.evaluate(() => window.__zyRun.cards());
        ok("A3 第 1 區只有 2 個門（左右）、注音卡 2 張", s.row.options.length === 2 && JSON.stringify(s.row.lanes) === "[0,2]" && cards.filter(c => c.on).length === 2, `lanes=${JSON.stringify(s.row.lanes)} cards=${cards.map(c => c.on).join()}`);
        ok("A3 注音卡字至少 40px", cards.filter(c => c.on).every(c => c.fs >= 40), cards.map(c => c.fs).join(","));
        ok("A3 念題目（say＝q.say）", (await p.evaluate(() => window.__lab.calls.say.slice(-1)[0])) === s.row.say, s.row.say);
        await sleep(600);                                      // 卡片滑進來（0.35 秒）之後再量位置
        const r2 = (await p.evaluate(() => window.__zyRun.cards()))[2].rect; await p.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2); await sleep(150); s = await S(p);
        ok("A3 點右邊的注音卡＝夥伴換到右邊", s.lane === 2 && s.row && s.row.chose !== null, `lane=${s.lane} chose=${s.row && s.row.chose}`);
        // 答對：直接讓這排撞上
        const before = await S(p);
        await p.evaluate(() => window.__zyRun.answer(true)); await sleep(250); s = await S(p);
        let calls = await p.evaluate(() => window.__lab.calls);
        ok("A4 答對：onAnswer ok、right 1、門數 1", calls.answer.length === 1 && calls.answer[0].ok && s.right === 1 && s.gates === 1, JSON.stringify(calls.answer));
        // 答錯（旅程）：不扣心、金幣灑出去、念正解、出題核心有收到
        await sleep(400);
        const c0 = (await S(p)).coins; await nextOn(p);
        const lane = await p.evaluate(() => window.__zyRun.answer(false)); await sleep(200); s = await S(p); calls = await p.evaluate(() => window.__lab.calls);
        const lastQ = calls.answer.slice(-1)[0];
        ok("A5 答錯：onAnswer ok=false、wrong 1、旅程不扣心", lastQ && lastQ.ok === false && s.wrong === 1 && s.hearts === 0 && s.phase === "run", JSON.stringify(lastQ));
        ok("A5 答錯：金幣灑出去一些（最多 5）", s.coins === Math.max(0, c0 - 5) || (c0 < 5 && s.coins === 0), `前 ${c0} 後 ${s.coins}`);
        ok("A5 答錯：念正解（say＝這題答案的音）", calls.say.slice(-1)[0] !== undefined && s.spoken.slice(-1)[0].how === "say", JSON.stringify(s.spoken.slice(-2)));
        ok("A5 答錯：停一下（世界速度 0）", s.v < 1, `v=${s.v}`);
        // 暫停：不前進
        await sleep(1900);
        await p.evaluate(() => window.__lab.setPaused(true)); await sleep(100); const d0 = (await S(p)).dist; await sleep(600); const d1 = (await S(p)).dist;
        await p.evaluate(() => window.__lab.setPaused(false)); await sleep(500); const d2 = (await S(p)).dist;
        ok("A7 暫停時不前進、繼續會走", d1 === d0 && d2 > d1, `${d0} → ${d1} → ${d2}`);
        // 過區：再答對 6 題 → 第 8 個門＝過區
        for (let k = 0; k < 6; k++) await answer(p, true);
        await until(p, () => window.__lab.calls.zone.length >= 1, null, 8000);
        s = await S(p); calls = await p.evaluate(() => window.__lab.calls);
        ok("A6 第 8 個門＝過區：onZone({zone:1})、區域 1、門數歸 0", calls.zone.length === 1 && calls.zone[0].zone === 1 && s.zone === 1 && s.gates === 0, JSON.stringify(calls.zone));
        ok("A6 過區：星星飛進罐子（stars 1）、休息一下鈕開著", s.stars === 1 && s.restOpen, `stars=${s.stars} rest=${s.restOpen}`);
        const banner = await p.evaluate(() => { const b = document.querySelector(".run-banner"); return { on: !b.classList.contains("run-off"), t: b.querySelector(".run-banner-t").textContent, rest: !document.querySelector(".run-rest").classList.contains("run-off") }; });
        ok("A6 大字「🌲 森林」＋休息一下鈕", banner.on && /森林/.test(banner.t) && banner.rest, JSON.stringify(banner));
        await sleep(1000); await shot(p, "zoneup-1180x820");
        // 休息一下 → 收尾 → onEnd(rest)
        await p.evaluate(() => window.__zyRun.rest());
        ok("A9 休息一下 → onEnd", await until(p, () => window.__lab.calls.end.length === 1, null, 8000));
        const r = (await p.evaluate(() => window.__lab.calls.end))[0] || {};
        const keys = ["zone", "zonesCleared", "score", "coins", "right", "wrong", "ms", "words", "record", "finished", "rest"];
        ok("A9 r.rest=true、finished=false、zone=1、過了 1 區", r.rest === true && r.finished === false && r.zone === 1 && r.zonesCleared === 1, JSON.stringify(r));
        ok("A12 onEnd 欄位齊全", keys.every(k => k in r) && Array.isArray(r.words) && r.score > 0 && r.ms > 0, keys.filter(k => !(k in r)).join(",") || "全部都有");
        // stop()：沒有殘留 rAF、WebGL 收乾淨
        await p.evaluate(() => window.__lab.game.stop()); await sleep(300);
        const f0 = await p.evaluate(() => window.__zyRun.stats()); await sleep(600); const f1 = await p.evaluate(() => window.__zyRun.stats());
        ok("A14 stop()：state null、rAF 停了、WebGL 0 個、畫布拿掉", (await S(p)) === null && f1.frames === f0.frames && f1.live === 0 && (await p.evaluate(() => document.querySelectorAll("#runRoot canvas").length)) === 0, `frames ${f0.frames}→${f1.frames} live=${f1.live}`);
        const apiAfter = await p.evaluate(async () => { const n = JSON.stringify(window.__lab.calls).length; await new Promise(r => setTimeout(r, 2500)); return JSON.stringify(window.__lab.calls).length - n; });
        ok("A14 stop() 之後不再呼叫任何 api", apiAfter === 0, `多了 ${apiAfter} 字`);
        await close(); }

      // ===== B. 讀題時間（遊戲時間；加速 6 倍量）：第 1 級 4.5 秒、第 6 級 8.5 秒；點卡 0.5 秒後回原速 =====
      { const { p, close } = await open(b, "seed=12&speed=6");
        await running(p);
        const m1 = await measureRow(p, null);
        ok("B1 第 1 級：門出現到撞上 ≈ 4.5 秒（不選）", m1 && Math.abs(m1.T - 4.5) < 0.3, JSON.stringify(m1));
        await sleep(300); const sk = await S(p), tk = await p.evaluate(() => window.__lab.calls.talk);
        ok("B1 第 1 區兩個門、夥伴待在中間：從花叢跳過去（不算答題、不算門）＋提醒點卡", sk.skips === 1 && sk.gates === 0 && sk.right + sk.wrong === 0 && (await p.evaluate(() => window.__lab.calls.answer.length)) === 0 && tk.some(t => /注音卡/.test(t)), `skips=${sk.skips} gates=${sk.gates} talk=${JSON.stringify(tk)}`);
        await close(); }
      { const { p, close } = await open(b, "seed=13&speed=6&zone=7");
        await running(p);
        const s0 = await S(p);
        const m6 = await measureRow(p, null);
        ok("B2 第 6 級（兩個字）：≈ 8.5 秒、慢動作（速度掉到原速 8 成以下）", m6 && Math.abs(m6.T - 8.5) < 0.35 && m6.sawSlow, JSON.stringify(m6) + ` tier(next)=${s0.next && s0.next.tier}`);
        await nextOn(p); await rowOn(p);
        const s1 = await S(p); const right = s1.row.lanes[s1.row.options.indexOf(s1.row.answer)];
        const m6b = await measureRow(p, { at: 1.5, lane: right });
        ok("B3 點卡 0.5 秒後回原速、比較早撞上", m6b && m6b.vBack !== null && m6b.vBack < 1.4 && m6b.T < 8.0, JSON.stringify(m6b));
        await close(); }

      // ===== C. 第 2 圈＝挑戰：3 顆心、跑錯扣 1、扣到 0 → 收尾 → onEnd(finished=false) =====
      { const { p, close } = await open(b, "seed=14&speed=6&zone=9&best=999999");
        await running(p); let s = await S(p);
        ok("C1 第 2 圈：挑戰模式、3 顆心、愛心顯示", s.mode === "dare" && s.hearts === 3 && s.zone === 8 && (await p.evaluate(() => !document.querySelector(".run-hearts").classList.contains("run-off"))), `mode=${s.mode} hearts=${s.hearts}`);
        await answer(p, false); s = await S(p);
        ok("C2 跑錯扣 1 心", s.hearts === 2, `hearts=${s.hearts}`);
        await sleep(400); await answer(p, false); await sleep(400); await answer(p, false);
        ok("C3 心用完 → 收尾（小地圖）→ onEnd", await until(p, () => window.__lab.calls.end.length === 1, null, 10000));
        const r = (await p.evaluate(() => window.__lab.calls.end))[0] || {};
        ok("C3 r.finished=false、rest=false、zone=8、wrong=3、沒破紀錄", r.finished === false && r.rest === false && r.zone === 8 && r.wrong === 3 && r.record === false, JSON.stringify(r));
        const mapTxt = await p.evaluate(() => document.querySelector(".run-end").innerText.replace(/\s+/g, " "));
        ok("C3 收尾：小地圖、說跑到哪、用門數說差多少（沒有「結束／輸」）", /你跑到沙灘了/.test(mapTxt) && /再 \d+ 個門就到森林/.test(mapTxt) && !/結束|輸/.test(mapTxt), mapTxt.slice(0, 80));
        await close(); }

      // ===== D. 第 1 圈第 8 區跑完 → 彩虹橋大結局 → onEnd(finished) =====
      { const { p, close } = await open(b, "seed=15&speed=6&zone=8");
        await running(p);
        for (let k = 0; k < 8; k++) { await answer(p, true); await sleep(150); }
        ok("D1 第 8 區第 8 個門 → 大結局 → onEnd", await until(p, () => window.__lab.calls.end.length === 1, null, 12000));
        const r = (await p.evaluate(() => window.__lab.calls.end))[0] || {}, s = await p.evaluate(() => window.__lab.calls);
        ok("D1 r.finished=true、zone=7、過了 1 區、沒有呼叫 onZone", r.finished === true && r.rest === false && r.zone === 7 && r.zonesCleared === 1 && s.zone.length === 0, JSON.stringify(r));
        ok("D1 大結局念「跑完全部八區了」", s.talk.some(t => /跑完全部/.test(t)), JSON.stringify(s.talk.slice(-3)));
        await close(); }

      // ===== E. 夥伴模型載不到 → 退回小貓（不會卡住） =====
      { const { p, close, errs } = await open(b, "seed=16&speed=6&pet=nope_not_here");
        ok("E1 夥伴模型 404 → 還是開得起來", await running(p));
        const s = await S(p);
        ok("E1 退回小貓", s.pet && !s.pet.temp && /cat\.glb$/.test(s.pet.url || ""), JSON.stringify(s.pet));
        errs.length = 0;                                       // 404 的那一行 console error 是預期的
        await close(); }
      { const { p, close } = await open(b, "seed=17&speed=6&pet=dog");
        await running(p); const s = await S(p);
        ok("E2 選了別的夥伴（dog）就用 dog", s.pet && /dog\.glb$/.test(s.pet.url || ""), JSON.stringify(s.pet));
        await close(); }

      // ===== F. 加速 6 倍、自動駕駛跑完 2 區以上 =====
      { const { p, close } = await open(b, "seed=18&speed=6&auto=1&think=0.8,1.6");
        const t0 = Date.now();
        const okZ = await until(p, () => window.__lab.calls.zone.length >= 2, null, 150000);
        const s = await S(p);
        ok("F1 加速 6 倍＋自動駕駛：跑完 2 區以上", okZ, `zone=${s && s.zone} gates=${s && s.gates} 遊戲 ${s && Math.round(s.ms / 1000)} 秒（實際 ${Math.round((Date.now() - t0) / 1000)} 秒）coins=${s && s.coins}`);
        const w = await p.evaluate(() => window.__zyRun.world && window.__zyRun.world());
        ok("F1 3D 統計（draw call／三角形／幾何／貼圖）", !!w && w.calls < 80, JSON.stringify(w));
        await close(); }

      // ===== G. 截圖：橫／直 × 第 1、5、7 區＋收尾前（第 2 圈） =====
      for (const [w, h] of [[1180, 820], [820, 1180]]) {
        for (const [zone, tag] of [[1, "z1"], [5, "z5"], [7, "z7"]]) {
          const { p, close } = await open(b, `seed=${20 + zone}&clean=1&zone=${zone}`, w, h);
          await running(p); await rowOn(p, 30000); await sleep(2600);
          const s = await S(p); await shot(p, `${tag}-${w}x${h}`);
          const cards = await p.evaluate(() => window.__zyRun.cards());
          const on = cards.filter(c => c.on), inView = on.every(c => c.rect.x >= 0 && c.rect.x + c.rect.width <= w && c.rect.y + c.rect.height <= h);
          let overlap = false; for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) { const a = on[i].rect, c = on[j].rect; if (a.x < c.x + c.width && c.x < a.x + a.width) overlap = true; }
          ok(`G 截圖 ${tag} ${w}×${h}：第 ${zone} 區、第 ${s.row ? s.row.tier : "?"} 級、卡片在畫面內不重疊、字 ≥40px`, inView && !overlap && on.every(c => c.fs >= 40), `${s.row ? s.row.answer : ""} fs=${on.map(c => Math.round(c.fs)).join("/")}`);
          await close();
        }
        const { p, close } = await open(b, "seed=31&clean=1&speed=4&zone=9&best=999999", w, h);
        await running(p); for (let k = 0; k < 3; k++) { await answer(p, false); await sleep(300); }
        await until(p, () => document.querySelector(".run-end") && !document.querySelector(".run-end").classList.contains("run-off"), null, 8000); await sleep(500);
        await shot(p, `end-${w}x${h}`); await close();
      }
    }

    // ===== H. 玩久模擬：第 1 圈跑完要多久（80% 答對、自動駕駛 1.2–2.6 秒後點卡；加速 8 倍跑，算正常速度的分鐘數） =====
    if (LONG || ONLY_LONG) {
      for (const [seed, think, label] of [[41, "1.2,2.6", "會讀的小孩（1.2–2.6 秒點卡）"], [42, "3,5", "慢慢讀的小孩（3–5 秒才點）"]]) {
        const { p, close } = await open(b, `seed=${seed}&speed=8&auto=0.8&think=${think}`);
        const t0 = Date.now();
        const done = await until(p, () => window.__lab.calls.end.length >= 1, null, 330000);
        const r = (await p.evaluate(() => window.__lab.calls.end))[0], s = await S(p);
        const min = r ? r.ms / 60000 : (s ? s.ms / 60000 : 0);
        ok(`H 玩久模擬・${label}：第 1 圈跑完 ${min.toFixed(1)} 分鐘（目標 8–11）`, done && r && r.finished && min >= 8 && min <= 11.5,
          r ? `過 ${r.zonesCleared} 區 對 ${r.right} 錯 ${r.wrong}（${Math.round(r.right / (r.right + r.wrong) * 100)}%）金幣 ${r.coins} 距離 ${r.score} 公尺（實際 ${Math.round((Date.now() - t0) / 1000)} 秒）` : `沒跑完：${JSON.stringify(s && { zone: s.zone, gates: s.gates, ms: s.ms })}`);
        await close();
      }
    }
  } finally {
    ok("全程沒有 console 錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
    await b.close();
    const fails = out.filter(l => l.startsWith("FAIL")).length;
    console.log(`\n${out.length - fails}/${out.length} PASS　截圖：${SHOTS}`);
    process.exit(fails ? 1 : 0);
  }
})().catch(e => { console.error(e); process.exit(1); });
