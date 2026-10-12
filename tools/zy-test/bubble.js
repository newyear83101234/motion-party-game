// 泡泡救援灣（js/zhuyin-bubble.js）測試：node tools/zy-test/bubble.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 BB_SHOTS（預設 %TEMP%\zy-bubble）。
// 驗：①求解器 50 關（5 區）都救得完（每關 BB_SEEDS 種亂數，含天花板下壓；印出發射數與 par）①b 下壓／石頭／Boss 往上退的純模擬
//     ①c 天花板下壓（小燈、快降抖動、降完預測＝實際、碰底線＝onFull）、石頭泡泡、Boss 模式（onPress、退 2 排、不給星星）
//     ②瞄準預測＝實際落點、消除、掉落、救出、onWin 參數
//     ③前 3 關示範（開場、4 秒沒動作、換一顆提示）④暫停不收操作 ⑤onFull ⑥stop() 清乾淨、重開不報錯、飛行中 stop 不殘留
//     ⑦50 關用介面實際打完 ⑧四種 iPad 尺寸版面（放得下、不重疊、按鈕夠大、不捲動）⑨國字都有注音 ⑩全程 0 個 console error
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/bubble-lab.html";
const SHOTS = process.env.BB_SHOTS || path.join(os.tmpdir(), "zy-bubble");
const SEEDS = +(process.env.BB_SEEDS || 40);
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];

async function open(browser, w, h, q = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push(`[${w}x${h}] PAGEERR ${e.message}`); });
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 160)); allErrs.push(`[${w}x${h}] CONSOLE ${m.text().slice(0, 160)}`); } });
  await p.goto(LAB + "?mute=1" + (q ? "&" + q : ""));
  await p.waitForFunction(() => window.__bb && window.__bb.ready, null, { timeout: 15000 });
  return { ctx, p, errs };
}
const S = p => p.evaluate(() => window.__bb.game.state());
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const waitIdle = (p, t = 15000) => p.waitForFunction(() => { const s = window.__bb.game.state(); return s && (!s.busy || s.won || s.full); }, null, { timeout: t, polling: 30 });
// 用「最好的一發」打一發：要換就先換，回傳 { pred, fired }
const playBest = p => p.evaluate(() => { const g = window.__bb.game, b = g.debug.bestShot(); if (b.swap) g.debug.swap(); g.debug.aim(b.angle); const pred = g.debug.predict().cell; const fired = g.debug.fire(); return { b, pred, fired }; });
// 真的手指操作（Playwright 滑鼠＝pointer 事件）：單位座標 → 螢幕座標
async function pointAt(p, ux, uy) { return p.evaluate(([x, y]) => { const f = document.querySelector(".bb-field").getBoundingClientRect(), u = f.width / 16; return [f.left + x * u, f.top + y * u]; }, [ux, uy]); }

(async () => {
  const browser = await launch();

  // ===== ① 求解器：每關多種亂數都要救得完，par 要 ≥ 求解器的 75 百分位 =====
  {
    const { ctx, p } = await open(browser, 1180, 820, "clean=1");
    const rows = await p.evaluate(N => {
      const m = window.__bb.mod, out = [];
      m.LEVELS.forEach((def, i) => {
        const runs = []; let fails = 0, swaps = 0;
        let dropsN = 0;
        for (let s = 1; s <= N; s++) { const r = m.solveLevel(i, { seed: s * 7919 + i }); if (!r.win) fails++; runs.push(r.shots); swaps += r.swaps; dropsN += r.drops; }
        runs.sort((a, b) => a - b);
        const g = m.bubbleSim.parseLevel(def);
        let stones = 0; for (const row of g) for (const v of row) if (v === m.bubbleSim.STONE) stones++;
        out.push({ i, syms: m.bubbleSim.present(g).length, pen: m.bubbleSim.penguinsLeft(g), min: runs[0], med: runs[Math.floor(N / 2)], p75: runs[Math.floor(N * 0.75)], max: runs[N - 1], fails, par: def.par, swaps,
          drop: def.drop || 0, drops: +(dropsN / N).toFixed(2), stones, h: def.rows.length, teach: !!def.teach });
      });
      return out;
    }, SEEDS);
    console.log(`\n求解器（每關 ${SEEDS} 種亂數；發射數＝最少/中位/75%/最多；下壓＝每幾發降一排／平均降幾次）`);
    console.log("關卡 | 符號 | 企鵝 | 石頭 | 高 | 發射數            | par | 下壓    | 失敗");
    for (const r of rows) console.log(`${String(r.i + 1).padStart(4)} | ${r.syms}    | ${r.pen}    | ${String(r.stones).padEnd(4)} | ${String(r.h).padEnd(2)} | ${r.min}/${r.med}/${r.p75}/${r.max}`.padEnd(54) + `| ${String(r.par).padEnd(3)} | ${(r.drop ? r.drop + "／" + r.drops : "—").padEnd(7)} | ${r.fails}`);
    ok("求解器：50 關全部救得完（0 次失敗，含天花板下壓）", rows.length === 50 && rows.every(r => r.fails === 0), rows.filter(r => r.fails).map(r => "L" + (r.i + 1)).join(","));
    ok("求解器：par ≥ 75 百分位（略寬鬆），且不超過 75 百分位 +2（星星不會太好拿）", rows.every(r => r.par >= r.p75 && r.par <= r.p75 + 2), rows.map(r => `L${r.i + 1}:${r.p75}≤${r.par}`).join(" "));
    ok("關卡：第 1 區前 3 關兩種符號、1 隻企鵝；第 4 關起三種符號；企鵝 1→3", rows.slice(0, 3).every(r => r.syms === 2 && r.pen === 1) && rows.slice(3, 10).every(r => r.syms === 3) && rows[9].pen === 3);
    ok("關卡：第 2 區 11～13 關三種符號、14 關起四種；第 3 區全是三種符號；每區第 1 關 1 隻動物＋一發解決", rows.slice(10, 13).every(r => r.syms === 3) && rows.slice(13, 20).every(r => r.syms === 4) && rows.slice(20, 30).every(r => r.syms === 3) && rows[10].pen === 1 && rows[20].pen === 1 && rows[10].max === 1 && rows[20].max === 1);
    ok("關卡：每區的動物隻數從 1 長到 3 以上（第 2 區 1→3、第 3 區 1→4）、par 區內大致往上", rows[19].pen === 3 && rows[29].pen === 4 && rows[19].par >= rows[10].par + 4 && rows[29].par >= rows[20].par + 4);
    // v6 第 4、5 區
    const z4 = rows.slice(30, 40), z5 = rows.slice(40, 50);
    ok("第 4 區（31～40）：三種符號、沒有石頭、每關都會下壓（31、32 教學少幾發，33～35 8 發、36～40 7 發）、動物 1→≥4", z4.length === 10 && z4.every(r => r.syms === 3 && r.stones === 0 && r.drop > 0) && z4.slice(2, 5).every(r => r.drop === 8) && z4.slice(5).every(r => r.drop === 7) && z4[0].pen === 1 && z4[9].pen >= 4 && z4[0].teach,
      z4.map(r => `L${r.i + 1}:${r.drop}`).join(" "));
    ok("第 5 區（41～50）：42 關起四種符號、每關都有石頭、每關都會下壓（41～45 7 發、46～50 6 發）、動物 1→≥4、第 41 關是石頭教學（一發就解）", z5.length === 10 && z5.every(r => r.drop > 0 && r.stones > 0) && z5.slice(1).every(r => r.syms === 4) && z5.slice(0, 5).every(r => r.drop === 7) && z5.slice(5).every(r => r.drop === 6) && z5[0].pen === 1 && z5[9].pen >= 4 && z5[0].teach && z5[0].max === 1,
      z5.map(r => `L${r.i + 1}:${r.syms}種/${r.stones}石/${r.drop}`).join(" "));
    ok("難度由易到難：第 4、5 區後一半 par 平均 > 前一半、第 5 區後段（46～50）par ≥ 第 30 關、第 50 關 par 是全部最高", z4.length === 10 && z5.length === 10 && [z4, z5].every(z => z.slice(5).reduce((a, r) => a + r.par, 0) > z.slice(0, 5).reduce((a, r) => a + r.par, 0)) && z5.slice(5).every(r => r.par >= rows[29].par) && rows[49].par === Math.max(...rows.map(r => r.par)),
      rows.slice(30).map(r => r.par).join(","));
    ok("符號：第 1 區只用ㄅㄆㄇ、第 2 區只用ㄉㄊㄋㄌ、第 3 區只用ㄍㄎㄏ、第 4 區只用ㄐㄑㄒ、第 5 區只用ㄓㄔㄕㄖ", await p.evaluate(() => { const m = window.__bb.mod, sets = [["ㄅㄆㄇ", 0], ["ㄉㄊㄋㄌ", 10], ["ㄍㄎㄏ", 20], ["ㄐㄑㄒ", 30], ["ㄓㄔㄕㄖ", 40]];
      return sets.every(([syms, from]) => { for (let i = from; i < from + 10; i++) { const g = m.bubbleSim.parseLevel(m.LEVELS[i]); for (const v of m.bubbleSim.present(g)) if (!syms.includes(m.SYMS[v])) return false; } return true; }); }));

    // ===== ①b 純模擬：天花板下壓、石頭、Boss 往上退 =====
    const sim = await p.evaluate(() => {
      const m = window.__bb.mod, S = m.bubbleSim, out = {};
      // 下壓：top+1、直直往上打的落點跟著往下、碰底線判定
      const g = S.parseLevel({ rows: ["11......", " 2......"] });
      const up0 = S.trace(g, Math.PI / 2).cell, y0 = S.trace(g, Math.PI / 2).y;
      S.lower(g);
      const up1 = S.trace(g, Math.PI / 2).cell, y1 = S.trace(g, Math.PI / 2).y;
      out.lower = { top: g.top, up0, up1, dy: +(y1 - y0).toFixed(3) };
      const tall = S.parseLevel({ rows: Array.from({ length: 11 }, (_, r) => (r & 1 ? "1......" : "1.......")) });   // 第 0～10 列（底下那顆在第 10 列）
      out.touch = [S.touching(tall), (S.lower(tall), S.touching(tall)), (S.lower(tall), S.touching(tall))];   // 降 1 排＝第 11 列（還沒碰）、降 2 排＝第 12 列（碰到）
      // 石頭：同色三顆消掉時旁邊的石頭不會破；跟天花板斷開才掉（掉落清單裡有石頭）；場上只剩石頭＝動物自己飛出來
      const st = S.parseLevel({ rows: ["11......", " X......", "XA......"] });   // 石頭掛在一對ㄅ下面、動物掛在石頭下面
      const r1 = S.resolve(st, 0, 2, 0);   // 第 0 列第 2 格補一顆ㄅ（跟 11 連成三顆）
      out.stone = { popped: r1.popped.length, droppedStones: r1.dropped.filter(d => d[2] === S.STONE).length, rescued: r1.rescued.map(x => x[2]).join(","), left: S.penguinsLeft(st) };
      const st2 = S.parseLevel({ rows: ["X1X.....", " XA....."] });
      const r2 = S.resolve(st2, 0, 3, 1);  // 打一顆ㄆ在旁邊：沒消掉；場上還有ㄆ → 動物還困著
      out.stoneKeep = { popped: r2.popped.length, left: S.penguinsLeft(st2), present: S.present(st2).length };
      out.present = S.present(S.parseLevel({ rows: ["X.X.....", " XA....."] })).length;
      // Boss 往上退：天花板降過 3 排 → 退 2 排＝top 1；只降 1 排 → 最上面 2 列被收走、其餘往上搬（奇偶不變）、困在那兩列的動物算救出
      const b = S.parseLevel({ rows: ["1.......", " 2......", "A3......", " 1......"] }); b.top = 3;
      const o1 = S.raise(b, 2);
      out.raiseTop = { top: b.top, gone: o1.gone.length, row0: b[0].join("") };
      const c = S.parseLevel({ rows: ["1.......", " 2......", "A3......", " 1......"] }); c.top = 1;
      const o2 = S.raise(c, 2);
      out.raiseAbsorb = { top: c.top, gone: o2.gone.length, freed: o2.freed.length, len0: c[0].length, len1: c[1].length, row0: c[0].slice(0, 2).join(","), left: S.penguinsLeft(c) };
      // 求解器：天花板每 1 發就降，盤面又高 → 救不完（full），證明求解器真的有在模擬下壓
      out.solveDrop = m.solveLevel(0, { def: { rows: ["1.2.3.1.", " 2.3.1..", "3.1.2.3.", " 1.2.3..", "2.3.1.2.", " 3.1.2..", "1.2.3.1.", " 2.3.1..", "3.1.2.3.", " A......"] }, drop: 1, seed: 3 });
      return out;
    });
    ok("模擬：天花板降一排＝top+1，往上打的落點 y 跟著往下 √3（格子列號不變）", sim.lower.top === 1 && sim.lower.up0 && sim.lower.up1 && sim.lower.up0[0] === sim.lower.up1[0] && Math.abs(sim.lower.dy - Math.sqrt(3)) < 0.01, JSON.stringify(sim.lower));
    ok("模擬：最下面一顆在第 10 列 → 降 1 排沒碰、降 2 排碰到底線", JSON.stringify(sim.touch) === "[false,false,true]", JSON.stringify(sim.touch));
    ok("模擬：石頭泡泡不會被同色消掉、跟天花板斷開才掉下來（動物一起掉＝救出）", sim.stone.popped === 3 && sim.stone.droppedStones === 2 && sim.stone.rescued === "fall" && sim.stone.left === 0, JSON.stringify(sim.stone));
    ok("模擬：石頭不算符號（發射佇列不會出石頭）；沒消掉時動物還困著", sim.present === 0 && sim.stoneKeep.popped === 0 && sim.stoneKeep.left === 1, JSON.stringify({ present: sim.present, keep: sim.stoneKeep }));
    ok("模擬：Boss 往上退 2 排——天花板降過 ≥2 排就收回天花板（盤面不動）", sim.raiseTop.top === 1 && sim.raiseTop.gone === 0 && sim.raiseTop.row0.startsWith("0"), JSON.stringify(sim.raiseTop));
    ok("模擬：Boss 往上退 2 排——天花板只降 1 排：最上面 2 列收進天花板、其餘上搬 2 列（列的格數不變）、那兩列的動物算救出", sim.raiseAbsorb.top === 1 && sim.raiseAbsorb.gone === 2 && sim.raiseAbsorb.freed === 0 && sim.raiseAbsorb.len0 === 8 && sim.raiseAbsorb.len1 === 7 && sim.raiseAbsorb.left === 1, JSON.stringify(sim.raiseAbsorb));
    ok("模擬：求解器會模擬下壓（又高又每發都降的盤面救不完、回報 full）", sim.solveDrop.full === true && sim.solveDrop.win === false && sim.solveDrop.drops >= 1, JSON.stringify(sim.solveDrop));
    await ctx.close();
  }

  // ===== ①c 介面：天花板下壓（第 31 關）、石頭（第 41 關）、Boss 模式 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&seed=3&lv=31");
    await sleep(400);
    let s = await S(p);
    const lamps0 = await p.evaluate(() => ({ n: document.querySelectorAll(".bb-ceil .bb-lamp").length, on: document.querySelectorAll(".bb-ceil .bb-lamp.on").length, vis: !document.querySelector(".bb-ceil").hidden, img: document.querySelector(".bb-pen img").src.split("/").pop() }));
    ok("第 31 關：天花板有小燈（數量＝drop、全亮）、救小象", lamps0.vis && lamps0.n === s.drop && lamps0.on === s.drop && s.drop > 0 && s.top === 0 && lamps0.img === "elephant.webp", JSON.stringify({ lamps0, drop: s.drop }));
    await shot(p, "v6_L31_start");
    // 每發換一個這區沒有的符號（ㄅ→ㄆ→ㄇ，永遠湊不成三顆＝不會救到），看小燈一顆一顆熄、剩一顆時天花板抖、全熄就降一排
    const seen = [];
    for (let k = 0; k < s.drop; k++) {
      await p.evaluate(k => { const g = window.__bb.game, sy = ["ㄅ", "ㄆ", "ㄇ"][k % 3]; g.debug.setQueue(sy, sy); g.debug.aim(Math.PI / 2); g.debug.fire(); }, k);
      await waitIdle(p); await sleep(k === s.drop - 1 ? 700 : 80);
      const z = await p.evaluate(() => ({ st: window.__bb.game.state(), on: document.querySelectorAll(".bb-ceil .bb-lamp.on").length, warn: document.querySelector(".bb-ceil").classList.contains("bb-warn"), tf: getComputedStyle(document.querySelector(".bb-layer")).transform }));
      seen.push({ shots: z.st.shots, left: z.st.left, on: z.on, warn: z.warn, top: z.st.top, tf: z.tf, won: z.st.won });
      if (z.st.won || z.st.full) break;
      if (k === s.drop - 2) await shot(p, "v6_L31_warn");
    }
    const last = seen[seen.length - 1], pre = seen[seen.length - 2];
    ok("下壓：每發熄一盞燈；剩最後一盞時天花板抖；全熄＝天花板降一排（泡泡層往下移）、小燈重新全亮", !last.won && pre && pre.on === 1 && pre.warn && last.top === 1 && last.on === s.drop && !last.warn && last.tf !== "none" && seen.slice(0, -1).every((x, k) => x.on === s.drop - 1 - k), JSON.stringify(seen));
    const talks = await p.evaluate(() => window.__bb.calls.talk.slice());
    ok("下壓：第一次降下來貓頭鷹說明「小燈都熄掉，就會往下降」", talks.some(t => /小燈都熄掉/.test(t)), JSON.stringify(talks));
    await shot(p, "v6_L31_dropped");
    // 降下來之後：瞄準線預測＝實際落點（落點的畫面 y 含天花板下降）
    const r = await playBest(p); await waitIdle(p);
    s = await S(p);
    ok("下壓後：發射落點＝瞄準線預測", r.pred && s.last && s.last.cell[0] === r.pred[0] && s.last.cell[1] === r.pred[1], JSON.stringify({ pred: r.pred, last: s.last && s.last.cell }));
    // 碰底線：一般關＝onFull（這關重來）。12 排的盤面（最下面在第 11 列）降一排就碰到
    await p.evaluate(() => { window.__bb.calls.full.length = 0; const rows = []; for (let r = 0; r < 12; r++) rows.push(r & 1 ? "2121212" : "12121212"); rows[5] = " 21A1212"; window.__bb.game.debug.load({ rows, drop: 3, syms: "ㄐㄑㄒ" }, 30); });
    await sleep(150);
    const dn = await p.evaluate(() => window.__bb.game.debug.dropNow()); await sleep(900);
    s = await S(p);
    const full1 = await p.evaluate(() => window.__bb.calls.full.slice());
    ok("下壓碰到底線（一般關）：呼叫 onFull、場地變暗、不能再發射", dn && s.full && s.top === 1 && full1.length === 1 && await p.evaluate(() => !!document.querySelector(".bb-wrap.bb-isfull") && window.__bb.game.debug.fire() === false), JSON.stringify({ dn, full: s.full, top: s.top, low: s.low, full1 }));
    // 第 41 關：石頭教學
    await p.evaluate(() => { window.__bb.calls.talk.length = 0; window.__bb.game.start(40); }); await sleep(1500);
    s = await S(p);
    const st41 = await p.evaluate(() => ({ stones: document.querySelectorAll(".bb-layer .bb-stone").length, sym: [...document.querySelectorAll(".bb-layer .bb-stone")].some(e => e.textContent.trim()), img: document.querySelector(".bb-pen img").src.split("/").pop(), lamps: document.querySelectorAll(".bb-ceil .bb-lamp").length }));
    ok("第 41 關：有石頭泡泡（灰色、沒有符號）、救小獅子、開場示範＋貓頭鷹講石頭", st41.stones === s.stones && s.stones > 0 && !st41.sym && st41.img === "lion.webp" && s.demo && (await p.evaluate(() => window.__bb.calls.talk.join("|"))).includes("石頭"), JSON.stringify({ st41, demo: s.demo }));
    await shot(p, "v6_L41_teach");
    const r41 = await playBest(p); await p.waitForFunction(() => window.__bb.calls.win.length > 0, null, { timeout: 8000 }).catch(() => {});
    s = await S(p);
    const w41 = await p.evaluate(() => window.__bb.calls.win.slice(-1)[0]);
    ok("第 41 關：一發打掉支撐點，石頭籠子整個掉下來、小獅子救出、3 星", s.last && s.last.popped === 3 && s.last.fall === 1 && w41 && w41.level === 40 && w41.stars === 3, JSON.stringify({ last: s.last, w41 }));
    // 星星：3 星＝≤par、2 星＝≤par+2（v6 從 +3 收緊）、再多＝1 星。par 1 的盤面先亂打 k 發（換這區沒有的符號，不會消）再救
    const starOf = async k => {
      await p.evaluate(() => { window.__bb.calls.win.length = 0; window.__bb.game.debug.load({ par: 1, rows: ["11......", " A......"], syms: "ㄐㄑㄒ" }, 30); }); await sleep(120);
      for (let j = 0; j < k; j++) { await p.evaluate(j => { const g = window.__bb.game, sy = ["ㄅ", "ㄆ", "ㄇ"][j % 3]; g.debug.setQueue(sy, sy); g.debug.aim(Math.PI / 2 - 0.5 + j * 0.3); g.debug.fire(); }, j); await waitIdle(p); }
      await p.evaluate(() => { const g = window.__bb.game; g.debug.setQueue("ㄐ", "ㄐ"); const b = g.debug.bestShot(); g.debug.aim(b.angle); g.debug.fire(); });
      await p.waitForFunction(() => window.__bb.calls.win.length > 0, null, { timeout: 8000 }).catch(() => {});
      const w = await p.evaluate(() => window.__bb.calls.win[0] || null); return w && `${w.shots}發${w.stars}★`;
    };
    const stv = [await starOf(0), await starOf(2), await starOf(3)];
    ok("星星：3 星＝≤par、2 星＝≤par+2（v6 從 +3 收緊）、par+3＝1 星", stv.join(",") === "1發3★,3發2★,4發1★", stv.join(","));
    // ===== Boss 模式：碰底線不重來（onPress）、整片往上退 2 排、接著玩；救完不給星星 =====
    // (a) 天花板只降了 1 排就碰底線：最上面兩列收進天花板、其餘瞬間對齊後往上滑
    await p.evaluate(() => { const c = window.__bb.calls; c.full.length = 0; c.press.length = 0; c.win.length = 0; const rows = []; for (let r = 0; r < 12; r++) rows.push(r & 1 ? "2121212" : "12121212"); rows[6] = "121A1212"; window.__bb.game.debug.load({ rows, syms: "ㄐㄑㄒ" }, 30, { boss: true, drop: 2 }); });
    await sleep(200);
    s = await S(p);
    ok("Boss：狀態 boss、drop 照呼叫者給的（2）、關卡號碼不顯示（🗼）、沒有示範", s.boss && s.drop === 2 && !s.demo && await p.evaluate(() => document.querySelector(".bb-lvl").textContent.includes("🗼")), JSON.stringify({ boss: s.boss, drop: s.drop, lvl: await p.evaluate(() => document.querySelector(".bb-lvl").textContent) }));
    await p.evaluate(() => window.__bb.game.debug.dropNow()); await sleep(1900);
    const ba = await S(p), pa = await p.evaluate(() => window.__bb.calls.press.slice());
    ok("Boss（天花板只降 1 排）：碰底線 → onPress、不呼叫 onFull、最上面兩列收進天花板、整片往上退 2 排（最下面回到第 10 列）、可以接著打", pa.length === 1 && pa[0].presses === 1 && ba.presses === 1 && ba.top === 1 && ba.low === 10 && !ba.full && !ba.busy && ba.penguinsLeft === 1 && await p.evaluate(() => !document.querySelector(".bb-wrap.bb-isfull") && window.__bb.calls.full.length === 0),
      JSON.stringify({ top: ba.top, low: ba.low, busy: ba.busy, full: ba.full, presses: pa }));
    // (b) 天花板降了 3 排才碰底線：天花板往回收 2 排
    await p.evaluate(() => { const c = window.__bb.calls; c.press.length = 0; const rows = []; for (let r = 0; r < 10; r++) rows.push(r & 1 ? "2121212" : "12121212"); rows[5] = " 21A1212"; window.__bb.game.debug.load({ rows, syms: "ㄐㄑㄒ" }, 30, { boss: true, drop: 2 }); });
    await sleep(200);
    const tops = [];
    for (let k = 0; k < 3; k++) { await p.evaluate(() => window.__bb.game.debug.dropNow()); await sleep(k === 2 ? 1900 : 900); const z = await S(p); tops.push(`${z.top}/${z.low}`); }
    const bb = await S(p), pb = await p.evaluate(() => window.__bb.calls.press.slice());
    ok("Boss（天花板降 3 排）：第 3 次碰底線 → onPress、天花板收回 2 排（top 3→1、最下面第 10 列）、盤面不變、可以接著打", tops.join(",") === "1/10,2/11,1/10" && pb.length === 1 && bb.presses === 1 && !bb.busy && !bb.full && bb.penguinsLeft === 1,
      JSON.stringify({ tops, pb }));
    await shot(p, "v6_boss_after_press");
    // Boss 救完：onWin 帶 boss/presses、星星 0、橫幅沒有星星
    await p.evaluate(() => window.__bb.game.debug.load({ rows: ["11......", " A......"], syms: "ㄐㄑㄒ" }, 30, { boss: true, drop: 8 })); await sleep(150);
    await p.evaluate(() => { const g = window.__bb.game; g.debug.setQueue("ㄐ", "ㄐ"); const b = g.debug.bestShot(); g.debug.aim(b.angle); g.debug.fire(); });
    await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000 }); await sleep(300);
    const bannerStars = await p.evaluate(() => document.querySelectorAll(".bb-banner .bb-banner-stars").length);
    await p.waitForFunction(() => window.__bb.calls.win.length > 0, null, { timeout: 8000 });
    const bw = await p.evaluate(() => window.__bb.calls.win.slice(-1)[0]);
    ok("Boss 救完：onWin 有 boss:true、presses、stars 0；過關橫幅不顯示星星", bw.boss === true && bw.stars === 0 && bw.presses === 0 && bannerStars === 0, JSON.stringify({ bw, bannerStars }));
    ok("①c：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ② 第 1 關：示範、手指瞄準、預測＝實際、消除、救出、onWin =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&seed=5&lv=1");
    await sleep(1300);
    let s = await S(p);
    ok("示範：第 1 關開場就出金色示範線＋手指", s.demo === "line" && await p.evaluate(() => document.querySelector(".bb-finger.on") && document.querySelector(".bb-gold") && document.querySelector(".bb-ring.on") ? true : false));
    await shot(p, "land_L1_demo");
    // 手指瞄準：點一下、拖一下，放開不會發射
    const [x0, y0] = await pointAt(p, 3, 8), [x1, y1] = await pointAt(p, 12, 6);
    const aim0 = s.aim;
    await p.mouse.move(x0, y0); await p.mouse.down(); await sleep(50);
    s = await S(p); const aimA = s.aim;
    ok("瞄準：小孩一開始瞄準示範就收起來", s.demo === "" && !(await p.evaluate(() => !!document.querySelector(".bb-finger.on"))));
    await p.mouse.move(x1, y1, { steps: 5 }); await sleep(50);
    const aimB = (await S(p)).aim;
    await p.mouse.up(); await sleep(100);
    s = await S(p);
    ok("瞄準：點左邊轉向左、拖到右邊轉向右、放開不發射", aimA > Math.PI / 2 && aimB < Math.PI / 2 && aimA !== aim0 && s.shots === 0 && !s.busy, `aim ${(aimA * 57.3).toFixed(0)}° → ${(aimB * 57.3).toFixed(0)}°`);
    // 點到水平線以下 → 角度夾在 10° 以上
    const [x2, y2] = await pointAt(p, 15.5, 24.9);
    await p.mouse.click(x2, y2); await sleep(50);
    const aimLow = (await S(p)).aim;
    ok("瞄準：限制在水平線上方 10° 以上", Math.abs(aimLow - 10 * Math.PI / 180) < 1e-6, (aimLow * 57.3).toFixed(1) + "°");
    // 4 秒沒動作 → 示範又出來
    await sleep(4400);
    ok("示範：4 秒沒動作又出現", (await S(p)).demo === "line");
    // 最好的一發：預測落點＝實際落點
    const r = await playBest(p);
    ok("發射：fire() 回傳的落點＝瞄準線預測", r.fired && r.pred && r.fired[0] === r.pred[0] && r.fired[1] === r.pred[1], JSON.stringify(r.pred));
    await p.waitForFunction(() => window.__bb.game.state().last, null, { timeout: 5000, polling: 20 });
    await sleep(260);
    await shot(p, "land_L1_pop");
    s = await S(p);
    ok("發射：實際黏住的格子＝預測、同符號 ≥3 消除、旁邊企鵝救出", s.last.cell[0] === r.pred[0] && s.last.cell[1] === r.pred[1] && s.last.popped >= 3 && s.last.rescued === 1 && s.last.near === 1, JSON.stringify(s.last));
    await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000, polling: 30 });
    await sleep(450);
    await shot(p, "land_L1_win");
    await p.waitForFunction(() => window.__bb.calls.win.length > 0, null, { timeout: 8000 });
    await sleep(1200);
    const wins = await p.evaluate(() => window.__bb.calls.win);
    ok("過關：onWin 只呼叫一次、參數正確", wins.length === 1 && wins[0].level === 0 && wins[0].shots === 1 && wins[0].par === 2 && wins[0].stars === 3 && wins[0].rescued === 1, JSON.stringify(wins));
    ok("音效：有破泡泡、救出、過關聲", await p.evaluate(() => ["pop", "sticker", "win"].every(n => window.__bb.calls.play.includes(n))));
    ok("語音：開場唸目前這顆符號", await p.evaluate(() => window.__bb.calls.say[0] === "ㄅ"), JSON.stringify(await p.evaluate(() => window.__bb.calls.say.slice(0, 3))));

    // ===== 第 2 關：打掉上面那對 → 下面整串掉下來（企鵝掉下來＝救出）=====
    await p.evaluate(() => window.__bb.game.start(1)); await sleep(200);
    const r2 = await playBest(p);
    await waitIdle(p);
    s = await S(p);
    ok("掉落：打掉支撐點，下面的泡泡和企鵝一起掉（掉下來＝救出）", s.last && s.last.dropped >= 1 && s.last.fall === 1 && s.last.cell[0] === r2.pred[0] && s.last.cell[1] === r2.pred[1], JSON.stringify(s.last));

    // ===== 第 3 關：開場拿到沒用的ㄇ → 示範是「點泡泡換一顆」=====
    await p.evaluate(() => { window.__bb.calls.say.length = 0; window.__bb.game.start(2); }); await sleep(1300);
    s = await S(p);
    ok("示範：第 3 關開場提示換一顆（手指在目前這顆）", s.demo === "swap" && s.cur === "ㄇ" && await p.evaluate(() => document.querySelector(".bb-cur.bb-hint") ? true : false));
    await shot(p, "land_L3_swapdemo");
    const [cx, cy] = await pointAt(p, 8, (await p.evaluate(() => window.__bb.game.debug.geom.SHOOT_Y)));
    await p.mouse.click(cx, cy); await sleep(150);
    s = await S(p);
    ok("換一顆：點目前這顆＝跟下一顆交換、唸出新符號、不算發射、示範改成瞄準線", s.cur === "ㄅ" && s.next === "ㄇ" && s.shots === 0 && s.demo === "line" && await p.evaluate(() => window.__bb.calls.say.slice(-1)[0] === "ㄅ"));

    // ===== ④ 暫停：不接受瞄準、發射、交換 =====
    await p.evaluate(() => window.__bb.setPaused(true));
    const before = await S(p);
    const [x3, y3] = await pointAt(p, 2, 5);
    await p.mouse.click(x3, y3); await sleep(50);
    const pr = await p.evaluate(() => ({ fire: window.__bb.game.debug.fire(), swap: window.__bb.game.debug.swap() }));
    const after = await S(p);
    ok("暫停：點場地不轉向、按發射／交換都沒反應", pr.fire === false && pr.swap === false && after.aim === before.aim && after.shots === before.shots && after.cur === before.cur);
    // 暫停中按發射鈕（真的點）
    const fb = await p.evaluate(() => { const r = document.querySelector(".bb-fire").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.click(fb[0], fb[1]); await sleep(100);
    ok("暫停：點大發射鈕也不發射", (await S(p)).shots === before.shots);
    await p.evaluate(() => window.__bb.setPaused(false));
    await p.mouse.click(fb[0], fb[1]); await sleep(60);
    ok("繼續：點大發射鈕會發射", (await S(p)).shots === before.shots + 1);
    await waitIdle(p);

    // ===== ⑤ onFull：盤面塞滿到底線，再射一發 =====
    await p.evaluate(() => {
      const rows = []; for (let r = 0; r < 12; r++) { let t = ""; const n = r & 1 ? 7 : 8; for (let c = 0; c < n; c++) { const f = (((c - Math.floor(r / 2) - r) % 3) + 3) % 3; t += r === 0 && c === 0 ? "A" : "123"[f]; } rows.push(t); }
      window.__bb.calls.full.length = 0; window.__bb.game.debug.load({ par: 3, rows });
    });
    await sleep(100);
    const fullShot = await p.evaluate(() => { const g = window.__bb.game; g.debug.setQueue("ㄆ", "ㄆ"); g.debug.aim(Math.PI / 2); return { pred: g.debug.predict().cell, fired: g.debug.fire() }; });
    await waitIdle(p); await sleep(150);
    s = await S(p);
    const fullCalls = await p.evaluate(() => window.__bb.calls.full);
    ok("onFull：泡泡落到底線就呼叫、場地變暗、不再接受發射", fullShot.pred[0] === 12 && fullCalls.length === 1 && fullCalls[0].level === 0 && s.full && await p.evaluate(() => document.querySelector(".bb-wrap.bb-isfull") && window.__bb.game.debug.fire() === false), JSON.stringify({ pred: fullShot.pred, fullCalls }));
    await shot(p, "land_full");

    // ===== ⑥ stop() 清乾淨；飛行中 stop 不殘留；重開不報錯 =====
    await p.evaluate(() => window.__bb.game.stop());
    ok("stop()：root 清空、拿掉 class", await p.evaluate(() => document.getElementById("bbRoot").children.length === 0 && !document.getElementById("bbRoot").classList.contains("bb-root") && window.__bb.game.state() === null));
    await p.evaluate(() => { window.__bb.calls.win.length = 0; const g = window.__bb.game; g.start(0); const b = g.debug.bestShot(); g.debug.aim(b.angle); g.debug.fire(); });
    await sleep(150);
    await p.evaluate(() => window.__bb.game.stop());
    await sleep(2500);
    ok("stop()：飛行中離開，之後的計時器全部作廢（沒有 onWin、沒有殘留 DOM）", await p.evaluate(() => window.__bb.calls.win.length === 0 && document.getElementById("bbRoot").children.length === 0));
    await p.evaluate(() => window.__bb.game.start(4)); await sleep(200);
    s = await S(p);
    ok("stop() 後重新 start 正常", s && s.level === 4 && s.shots === 0 && await p.evaluate(() => document.querySelectorAll("#bbRoot .bb-wrap").length === 1));
    ok("第 1 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑦ 50 關用介面實際打完（計時器快 6 倍）：每發預測＝實際、onWin 參數 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&fast=6&seed=11");
    const table = [];
    for (let i = 0; i < 50; i++) {
      await p.evaluate(i => { window.__bb.calls.win.length = 0; window.__bb.game.start(i); }, i);
      await sleep(80);
      let mism = 0, n = 0;
      while (n < 40) {
        const s0 = await S(p); if (s0.won || s0.full) break;
        const r = await playBest(p); n++;
        await waitIdle(p);
        const s1 = await S(p);
        if (!s1.last || s1.last.cell[0] !== r.pred[0] || s1.last.cell[1] !== r.pred[1]) mism++;
      }
      await p.waitForFunction(() => window.__bb.calls.win.length > 0 || window.__bb.game.state().full, null, { timeout: 8000 }).catch(() => {});
      const w = await p.evaluate(() => window.__bb.calls.win[0] || null), s = await S(p);
      const starsOk = w && w.stars === (w.shots <= w.par ? 3 : w.shots <= w.par + 2 ? 2 : 1);
      table.push({ lv: i + 1, shots: w && w.shots, par: w && w.par, stars: w && w.stars, rescued: w && w.rescued, need: s.need, mism, ok: !!(w && w.level === i && w.rescued === s.need && starsOk && mism === 0) });
    }
    console.log("\n介面實打（貪婪一步、不前瞻）：" + table.map(t => `L${t.lv}:${t.shots}發${"★".repeat(t.stars || 0)}`).join(" "));
    ok("介面實打：50 關都過關（第 4、5 區含天花板下壓）、onWin 參數正確、星星照 par 算、每一發落點都＝預測", table.every(t => t.ok), JSON.stringify(table.filter(t => !t.ok)));
    ok("第 2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑧ 版面：四種 iPad 尺寸 × 第 1/5/10/11/14/20/21/30/31/40/41/50 關 =====
  for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [768, 1024]]) {
    const { ctx, p, errs } = await open(browser, w, h, "clean=1&seed=2");
    for (const lv of [0, 4, 9, 10, 13, 19, 20, 29, 30, 39, 40, 49]) {
      await p.evaluate(lv => window.__bb.game.start(lv), lv); await sleep(120);
      const m = await p.evaluate(() => {
        const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const q = s => document.querySelector(s);
        const f = R(q(".bb-field")), goal = R(q(".bb-goal")), fire = R(q(".bb-fire")), bub = R(q(".bb-layer .bb-b"));
        const btns = ["homeBtn", "musicBtn", "settingsBtn"].map(id => R(document.getElementById(id)));
        const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
        const inView = a => a.l >= -1 && a.t >= -1 && a.r <= innerWidth + 1 && a.b <= innerHeight + 1;
        // 場地外框（box-shadow 0.32u）也要在畫面內
        const u = f.w / 16, fo = { l: f.l - 0.32 * u, t: f.t - 0.32 * u, r: f.r + 0.32 * u, b: f.b + 0.32 * u };
        const slots = [...document.querySelectorAll(".bb-slot")].map(R), inGoal = a => a.l >= goal.l - 1 && a.r <= goal.r + 1 && a.t >= goal.t - 1 && a.b <= goal.b + 1;   // v6：救 5 隻的關，動物小格子不能跑出目標框、鑽到發射鈕底下
        return { inView: [fo, goal, fire].every(inView), overlap: hit(f, goal) || hit(f, fire) || hit(goal, fire) || slots.some(s => !inGoal(s) || hit(s, fire)), btnHit: btns.some(b => hit(b, fo) || hit(b, goal) || hit(b, fire)),
          fireW: fire.w / Math.min(innerWidth, innerHeight) * 100, bubble: bub.w, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          aria: q(".bb-fire").getAttribute("aria-label") };
      });
      ok(`版面 ${w}×${h} 第 ${lv + 1} 關：場地／目標／發射鈕都在畫面內、互不重疊、不擋主程式圓鈕、不捲動`, m.inView && !m.overlap && !m.btnHit && !m.scroll, JSON.stringify(m));
      ok(`版面 ${w}×${h} 第 ${lv + 1} 關：發射鈕 ≥18vmin、有 aria-label、泡泡夠大`, m.fireW >= 18 && m.aria === "發射" && m.bubble >= 50, `發射鈕 ${m.fireW.toFixed(1)}vmin、泡泡直徑 ${m.bubble.toFixed(0)}px`);
    }
    // relayout：轉向後重算
    if (w === 1180) {
      const f0 = await p.evaluate(() => document.querySelector(".bb-field").getBoundingClientRect().width);
      await p.setViewportSize({ width: 820, height: 1180 }); await p.evaluate(() => window.__bb.game.relayout()); await sleep(100);
      const m2 = await p.evaluate(() => ({ fw: document.querySelector(".bb-field").getBoundingClientRect().width, port: !!document.querySelector(".bb-wrap.bb-port") }));
      ok("relayout()：橫轉直重算尺寸、換直式排法", m2.port && Math.abs(m2.fw - f0) > 5, JSON.stringify({ f0, ...m2 }));
    }
    ok(`版面 ${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑨ 國字都有注音（開主程式的自動注音，字典沒收的字＝0、遊戲裡沒有裸國字）=====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&ann=1&seed=4");
    await p.waitForFunction(() => window.__bb.ann, null, { timeout: 8000 });
    const res = [];
    for (const lv of [0, 9, 10, 20, 29, 30, 40, 49]) {
      await p.evaluate(lv => window.__bb.game.start(lv), lv); await sleep(150);
      const b = await playBest(p); await waitIdle(p);
      if (lv === 0) await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000 });
      await sleep(300);
      res.push(await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.getElementById("bbRoot"), NodeFilter.SHOW_TEXT);
        while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (/[㐀-鿿]/.test(n.data) && !(e && e.closest(".ac[data-z]"))) out.push(n.data.trim()); } return out; }));
    }
    const missing = await p.evaluate(() => [...window.__bb.ann.missing]);
    ok("注音：遊戲畫面的國字全部自帶注音（不靠字典）", res.every(x => x.length === 0) && missing.length === 0, JSON.stringify({ bare: res, missing }));
    ok("第 4 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑩ 截圖：橫式＋直式 × 第 1/5/10 關、瞄準線（含反彈）、示範、消除中、過關一刻 =====
  for (const [w, h, tag] of [[1180, 820, "land"], [820, 1180, "port"]]) {
    const { ctx, p, errs } = await open(browser, w, h, "clean=1&seed=7");
    await p.evaluate(() => window.__bb.game.start(0)); await sleep(1300);
    await shot(p, `${tag}_1_L1_demo`);
    await p.evaluate(() => window.__bb.game.start(4)); await sleep(300);
    await shot(p, `${tag}_2_L5`);
    // 找一個在場地中段撞牆反彈、反彈後還飛一段（> 4 單位）的角度
    const bounce = await p.evaluate(() => { const g = window.__bb.game; let best = null;
      for (let d = 100; d <= 160; d++) { g.debug.aim(d * Math.PI / 180); const pr = g.debug.predict(), q = pr.pts;
        if (q.length >= 3 && q[1][1] > 8 && q[1][1] < 18 && Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]) > 4) { best = d; break; } }
      g.debug.aim((best || 120) * Math.PI / 180); return Object.assign(g.debug.predict(), { deg: best }); });
    await sleep(150);
    ok(`截圖 ${tag}：瞄準線含牆壁反彈`, bounce.pts.length >= 3, `${bounce.deg}°，轉折點 ${bounce.pts.length - 2} 個，落點 ${bounce.cell}`);
    await shot(p, `${tag}_3_L5_aim_bounce`);
    await p.evaluate(() => window.__bb.game.start(9)); await sleep(300);
    await shot(p, `${tag}_4_L10`);
    // 消除中：第 7 關拿ㄆ打支撐點（一發掉一大串＋企鵝飛出來）
    await p.evaluate(() => { const g = window.__bb.game; g.start(6); g.debug.setQueue("ㄆ", "ㄅ"); });
    await sleep(200);
    const k = await playBest(p);
    await p.waitForFunction(() => window.__bb.game.state().last, null, { timeout: 5000, polling: 20 });
    await sleep(380);
    await shot(p, `${tag}_5_L7_pop`);
    await sleep(520);
    await shot(p, `${tag}_5b_L7_drop_rescue`);
    const s7 = await S(p);
    ok(`截圖 ${tag}：第 7 關打支撐點一發救出 2 隻、掉一大串`, s7.last.rescued === 2 && s7.last.dropped >= 10, JSON.stringify(s7.last));
    await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000, polling: 30 });
    await sleep(500);
    await shot(p, `${tag}_6_L7_win`);
    ok(`截圖 ${tag}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    // 第 2～5 區：開場（含示範）、中段盤面、最難一關、救出動物的圖有載到、符號顏色各不相同
    for (const [lv, name] of [[10, "L11"], [13, "L14"], [14, "L15"], [19, "L20"], [20, "L21"], [24, "L25"], [29, "L30"], [30, "L31"], [34, "L35"], [39, "L40"], [40, "L41"], [44, "L45"], [49, "L50"]]) {
      await p.evaluate(lv => window.__bb.game.start(lv), lv); await sleep([10, 20, 30, 40].includes(lv) ? 1300 : 350);
      await shot(p, `${tag}_z_${name}`);
      const info = await p.evaluate(() => { const bs = [...document.querySelectorAll(".bb-layer .bb-b:not(.bb-pen):not(.bb-stone)")]; const col = {};
        bs.forEach(b => { const sym = b.textContent, c = getComputedStyle(b).getPropertyValue("--c").trim(); (col[sym] = col[sym] || new Set()).add(c); });
        const img = document.querySelector(".bb-layer .bb-pen img");
        return { cols: Object.fromEntries(Object.entries(col).map(([k, v]) => [k, [...v].join("/")])), img: img ? img.naturalWidth : -1, src: img ? img.src.split("/").pop() : "" }; });
      const colors = Object.values(info.cols), oneEach = Object.values(info.cols).every(c => !c.includes("/"));
      ok(`第 ${lv + 1} 關：每個符號固定一種顏色、同一關內各符號顏色不重複、救的動物圖有載到`, oneEach && new Set(colors).size === colors.length && info.img > 0, JSON.stringify(info));
      if (lv === 10) ok(`第 11 關救小螃蟹（crab.webp）、第 21 關救小鯨魚（whale.webp）`, info.src === "crab.webp", info.src);
      if (lv === 20) ok(`第 21 關救小鯨魚`, info.src === "whale.webp", info.src);
      if (lv === 30) ok(`第 31 關救小象（elephant.webp）`, info.src === "elephant.webp", info.src);
      if (lv === 40) ok(`第 41 關救小獅子（lion.webp）`, info.src === "lion.webp", info.src);
    }
    await ctx.close();
  }

  await browser.close();
  ok("全程 0 個 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
  console.log("\n" + results.join("\n"));
  const fails = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS　截圖：${SHOTS}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
