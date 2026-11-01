// 跑跑大冒險 v2 單獨測試（11-01 老闆試玩後改版：看圖選注音、兩個選項、一局 30 道門）：node tools/zy-test/run-unit.js [long|onlylong]
// 用獨立試玩頁 tools/zy-test/run-harness.html（不經過主程式），靠 window.__zyRun 掛鉤操作。需要：專案根目錄開著 python -m http.server 8765。
// 一次只開一個 3D 頁面（這台電腦同時開太多 3D headless 會互搶當掉）。截圖存到 RUN_SHOTS（預設 %TEMP%\zy-run-shots）。
// 驗：①開局（夥伴模型、WebGL 1 個）②換跑道：鍵盤、滑 40px、點左半邊、點注音卡；正常速度 0.2 秒內滑到
//     ③每道門兩個選項（左右跑道）＋中間花叢；兩張注音卡、字 ≥40px；上方大圖；開題時不念（api.say 沒被呼叫）、沒有 🔊
//     ④答對：onAnswer ok、加速衝刺（boost、風線）、這時才念那個詞 ⑤答錯：跌倒（fall、速度掉到 0、再慢慢追回）、念正確的詞、不扣東西
//     ⑥停在中間＝撞花叢跌倒、算答錯（got=null）、提醒點卡 ⑦連錯兩題：下一題讀題多 1 秒 ⑧暫停時不前進
//     ⑨讀題時間：第 1 道 ≈ 6 秒、第 30 道 ≈ 2.6 秒（不選）⑩第一次玩：手指示範點卡、第 1 題多 1 秒
//     ⑪30 道門 → 終點 → 「答對 N 題！」→ onEnd(finished、total 30、score＝答對、zone 7、record)；從頭到尾沒有呼叫 onZone
//     ⑫夥伴模型載不到 → 退回小貓 ⑬stop() 之後沒有殘留 rAF、WebGL 收乾淨、不再呼叫 api ⑭截圖：橫／直 × 第 1、15、28 題＋終點（左上角空著）
//     ⑮全程沒有 console 錯誤；long：玩久模擬（答對八成跑完 30 道要幾分鐘，只記錄）
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const SHOTS = process.env.RUN_SHOTS || path.join(os.tmpdir(), "zy-run-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = "http://127.0.0.1:8765/tools/zy-test/run-harness.html";
const out = []; const ok = (name, cond, info = "") => { const l = `${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`; out.push(l); console.log(l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LONG = process.argv.includes("long"), ONLY_LONG = process.argv.includes("onlylong");
const allErrs = [];

// fakePic：題目大圖（IMAGE/zhuyin/pic/*.webp，GPT 生的，還在做）先拿一張現成的圖頂替，測「有圖時顯示圖」
async function open(b, q, w = 1180, h = 820, { fakePic = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); const errs = [], picReq = [];
  if (fakePic) await ctx.route("**/IMAGE/zhuyin/pic/*.webp", r => r.fulfill({ path: path.join(__dirname, "../../IMAGE/zhuyin/coin.webp"), contentType: "image/webp" }));
  p.on("request", r => { if (/\/IMAGE\/zhuyin\/pic\//.test(r.url())) picReq.push(r.url()); });
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  // 題目大圖還沒放進來時的 404 是預期的（模組會退回表情符號）；其他 console 錯誤都算
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text()) && !(/Failed to load resource/.test(m.text()) && /\/IMAGE\/zhuyin\/pic\//.test((m.location() || {}).url || ""))) errs.push("CONSOLE " + m.text().slice(0, 200)); });
  await p.goto(`${BASE}?${q}`);
  await p.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 30000 });
  return { ctx, p, errs, picReq, close: async () => { allErrs.push(...errs.map(e => `[${q}] ${e}`)); await ctx.close(); } };
}
const S = p => p.evaluate(() => window.__zyRun.state());
const C = p => p.evaluate(() => window.__lab.calls);
const until = (p, fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
const running = p => until(p, () => { const s = window.__zyRun.state(); return s && s.phase === "run"; }, null, 30000);
const rowOn = (p, ms = 60000) => until(p, () => { const s = window.__zyRun.state(); return s && s.row; }, null, ms);
const nextOn = (p, ms = 30000) => until(p, () => { const s = window.__zyRun.state(); return s && s.phase === "run" && (s.row || s.next); }, null, ms);
// 答一道門，等這道門真的結算（passed +1）才回來（11-01：只等 0.12 秒時，偶爾下一個答案還送到同一道門，下一道門沒人答＝撞花叢；過門後夥伴會跑回中間，不能靠上一題的跑道）
const answer = async (p, good) => {
  await nextOn(p); const n0 = await p.evaluate(() => window.__zyRun.state().passed);
  const l = await p.evaluate(g => window.__zyRun.answer(g), good);
  await until(p, n => window.__zyRun.state().passed > n || window.__zyRun.state().phase !== "run", n0, 8000).catch(() => {});
  await sleep(60); return l;
};
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
// 在頁面裡量：門出現（row 有了）到撞上（row 沒了）用了幾秒遊戲時間（不點卡）
const measureRow = p => p.evaluate(() => new Promise(res => {
  let t0 = null, T = null, i = null;
  const tick = () => { const s = window.__zyRun.state(); if (!s) return res(null);
    if (t0 === null && s.row) { t0 = s.clock; T = s.row.T; i = s.row.i; }
    if (t0 !== null && !s.row) return res({ measured: +(s.clock - t0).toFixed(2), T: +T.toFixed(2), i });
    requestAnimationFrame(tick); };
  tick();
}));
// 我的畫面元素有沒有壓到左上角（主程式的 🏠🎵：約 31vmin × 15vmin）
const cornerFree = p => p.evaluate(() => { const vm = Math.min(innerWidth, innerHeight) / 100, R = { r: 31 * vm, b: 15 * vm };
  return [...document.querySelectorAll(".run-prog, .run-piccard:not(.run-off), .run-hud, .run-card:not(.run-off), .run-big:not(.run-off)")].every(e => { const r = e.getBoundingClientRect(); return !r.width || r.left >= R.r || r.top >= R.b; }); });

(async () => {
  const b = await launch();
  try {
    if (!ONLY_LONG) {
      // ===== A. 開局、換跑道、看圖不念題、答對衝刺、答錯跌倒、撞花叢（正常速度 1 倍） =====
      { const { p, close } = await open(b, "seed=11&speed=1");
        ok("A1 開局進到跑步", await running(p));
        let s = await S(p); const st0 = await p.evaluate(() => window.__zyRun.stats());
        ok("A1 一局 30 道門、WebGL 1 個、夥伴模型載好（小貓）", s.total === 30 && st0.live === 1 && s.pet && !s.pet.temp && /cat\.glb$/.test(s.pet.url || ""), `total=${s.total} ctx=${JSON.stringify(st0)} pet=${JSON.stringify(s.pet)}`);
        await p.keyboard.press("ArrowRight"); await sleep(200); s = await S(p);
        ok("A2 鍵盤 → 換跑道，0.2 秒內滑到", s.lane === 2 && Math.abs(s.petX - 2.6) < 0.3, `lane=${s.lane} petX=${s.petX}`);
        await p.mouse.move(700, 420); await p.mouse.down(); await p.mouse.move(660, 422, { steps: 4 }); await p.mouse.up(); await sleep(220); s = await S(p);
        ok("A2 往左滑 40px＝換一條", s.lane === 1 && Math.abs(s.petX) < 0.3, `lane=${s.lane} petX=${s.petX}`);
        await p.mouse.click(160, 420); await sleep(220); s = await S(p);
        ok("A2 點畫面左半邊＝往左一條", s.lane === 0, `lane=${s.lane}`);
        ok("A3 第一道門出現", await rowOn(p, 20000));
        s = await S(p); let calls = await C(p); await sleep(450);
        const cards = await p.evaluate(() => window.__zyRun.cards()), pic = await p.evaluate(() => window.__zyRun.pic());
        ok("A3 兩個選項、門在左右跑道（中間花叢）、注音卡 2 張", s.row.options.length === 2 && JSON.stringify(s.row.lanes) === "[0,2]" && cards.filter(c => c.on).length === 2, `options=${JSON.stringify(s.row.options)} lanes=${JSON.stringify(s.row.lanes)}`);
        ok("A3 注音卡字 ≥40px、卡在左右兩邊", cards.every(c => c.fs >= 40) && cards[0].rect.x + cards[0].rect.width / 2 < 590 && cards[1].rect.x + cards[1].rect.width / 2 > 590, cards.map(c => Math.round(c.fs)).join("/"));
        ok("A3 上方大圖：有 GPT 圖就顯示圖（IMAGE/zhuyin/pic/），沒有才退回表情符號；沒有國字", pic.on && (pic.img ? /\/zhuyin\/pic\/.+\.webp$/.test(pic.img) : pic.text === s.row.pic && pic.fs >= 80) && !/[一-鿿]/.test(pic.text), `${pic.text} ${Math.round(pic.fs)}px img=${pic.img}`);
        ok("A3 開題不念題：api.say 沒被呼叫、沒有 🔊 鈕", calls.say.length === 0 && (await p.evaluate(() => !document.querySelector(".run-say") && ![...document.querySelectorAll("#runRoot button")].some(x => x.textContent.includes("🔊")))), `say=${JSON.stringify(calls.say)}`);
        const r2 = cards[1].rect; await p.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2); await sleep(150); s = await S(p);
        ok("A3 點右邊的注音卡＝夥伴換到右邊", s.lane === 2 && s.row && s.row.chose !== null, `lane=${s.lane} chose=${s.row && s.row.chose}`);
        // 答對：衝刺＋這時才念那個詞
        const q1 = s.row;
        await p.evaluate(() => window.__zyRun.answer(true)); await sleep(150); s = await S(p); calls = await C(p);
        ok("A4 答對：onAnswer ok、right 1、第 2 題", calls.answer.length === 1 && calls.answer[0].ok && s.right === 1 && s.passed === 1, JSON.stringify(calls.answer));
        ok("A4 答對：加速衝刺（boost、風線、速度 > 原速）", s.boost && s.v > s.vz && (await p.evaluate(() => document.querySelector(".run-wind").classList.contains("run-on"))), `boost=${s.boost} v=${s.v} vz=${s.vz}`);
        ok("A4 答對後才念那個詞（say＝q.say）", calls.say.length === 1 && calls.say[0] === q1.say, `${JSON.stringify(calls.say)} ${q1.pic}`);
        await sleep(1300); s = await S(p);
        ok("A4 衝刺約 1 秒就結束", !s.boost, `boost=${s.boost}`);
        // 答錯：跌倒、念正確的詞、不扣東西
        await nextOn(p); const c0 = (await S(p)).coins;
        await p.evaluate(() => window.__zyRun.answer(false)); await sleep(300); s = await S(p); calls = await C(p);
        const last = calls.answer.slice(-1)[0];
        ok("A5 答錯：onAnswer ok=false、wrong 1、題目照走", last.ok === false && typeof last.got === "string" && s.wrong === 1 && s.passed === 2 && s.phase === "run", JSON.stringify(last));
        ok("A5 答錯：跌倒（fall）、速度掉到 0、不扣金幣", s.fall && s.v < 1 && s.coins === c0, `fall=${s.fall} v=${s.v} coins ${c0}→${s.coins}`);
        ok("A5 答錯：念正確的詞", calls.say.slice(-1)[0] === last.say, JSON.stringify(calls.say.slice(-2)));
        await sleep(1150); s = await S(p); const vUp = s.v; await sleep(500); const s2 = await S(p);
        ok("A5 1.2 秒後爬起來、速度慢慢追回", !s.fall && s.recovering && s2.v > vUp && s2.v < s2.vz + 0.01, `fall=${s.fall} v ${vUp}→${s2.v}（原速 ${s2.vz.toFixed(1)}）`);
        // 停在中間＝撞花叢
        await nextOn(p);
        await p.evaluate(() => window.__zyRun.answer("mid")); await sleep(900); s = await S(p);
        for (let k = 0; k < 10; k++) { calls = await C(p); if (calls.talk.some(t => /注音卡/.test(t))) break; await sleep(300); }   // 提醒排在念正確的詞後面（11-01：只等 0.9 秒偶爾還沒念到）
        const mid = calls.answer.slice(-1)[0];
        ok("A6 停在中間＝撞花叢跌倒、算答錯（got=null）", mid.ok === false && mid.got === null && s.crashes === 1 && s.wrong === 2, JSON.stringify(mid));
        ok("A6 撞花叢：念正確的詞＋提醒點卡", calls.say.slice(-1)[0] === mid.say && calls.talk.some(t => /注音卡/.test(t)), JSON.stringify(calls.talk));
        // 連錯兩題 → 下一題讀題多 1 秒
        s = await S(p); await until(p, () => window.__zyRun.state().next || window.__zyRun.state().row, null, 5000); s = await S(p);
        const nx = s.next || s.row, base = 6.0 - 3.4 * nx.i / 29;
        ok("A7 連錯兩題：下一題讀題多 1 秒", s.easy > 0 && Math.abs(nx.T - (base + 1)) < 0.01, `easy=${s.easy} T=${nx.T.toFixed(2)}（一般 ${base.toFixed(2)}）`);
        // 暫停
        await sleep(1500);
        await p.evaluate(() => window.__lab.setPaused(true)); await sleep(100); const d0 = (await S(p)).dist; await sleep(600); const d1 = (await S(p)).dist;
        await p.evaluate(() => window.__lab.setPaused(false)); await sleep(500); const d2 = (await S(p)).dist;
        ok("A8 暫停時不前進、繼續會走", d1 === d0 && d2 > d1, `${d0} → ${d1} → ${d2}`);
        ok("A8 左上角空著（🏠🎵 的位置沒有我的東西）", await cornerFree(p));
        // stop()
        await p.evaluate(() => window.__lab.game.stop()); await sleep(300);
        const f0 = await p.evaluate(() => window.__zyRun.stats()); await sleep(600); const f1 = await p.evaluate(() => window.__zyRun.stats());
        ok("A13 stop()：state null、rAF 停了、WebGL 0 個、畫布拿掉", (await S(p)) === null && f1.frames === f0.frames && f1.live === 0 && (await p.evaluate(() => document.querySelectorAll("#runRoot canvas").length)) === 0, `frames ${f0.frames}→${f1.frames} live=${f1.live}`);
        const apiAfter = await p.evaluate(async () => { const n = JSON.stringify(window.__lab.calls).length; await new Promise(r => setTimeout(r, 2500)); return JSON.stringify(window.__lab.calls).length - n; });
        ok("A13 stop() 之後不再呼叫任何 api", apiAfter === 0, `多了 ${apiAfter} 字`);
        await close(); }

      // ===== B. 讀題時間（遊戲時間；加速 6 倍量）：第 1 道 ≈ 6 秒、第 30 道 ≈ 2.6 秒 =====
      { const { p, close } = await open(b, "seed=12&speed=6");
        await running(p);
        const m1 = await measureRow(p);
        ok("B1 第 1 道：門出現到撞上 ≈ 6 秒（不選）", m1 && m1.i === 0 && Math.abs(m1.measured - 6) < 0.3, JSON.stringify(m1));
        await sleep(600); await p.evaluate(() => window.__zyRun.setGate(29));
        const m30 = await measureRow(p);
        ok("B2 第 30 道：≈ 2.6 秒（不選）", m30 && m30.i === 29 && Math.abs(m30.measured - 2.6) < 0.3, JSON.stringify(m30));
        await close(); }
      // ===== C. 第一次玩：手指示範點左右注音卡 → 預備出發 → 第 1 題多 1 秒 =====
      { const { p, close } = await open(b, "seed=13&speed=3&intro=1");
        await until(p, () => window.__zyRun.state() && window.__zyRun.state().phase === "intro", null, 10000);
        const demo = await p.evaluate(() => ({ cards: window.__zyRun.cards().filter(c => c.on).length, finger: !document.querySelector(".run-finger").classList.contains("run-off") }));
        const talk0 = (await C(p)).talk;
        ok("C1 教學：兩張注音卡＋手指示範、念「看圖片，跑進對的注音門！」", demo.cards === 2 && demo.finger && talk0.includes("看圖片，跑進對的注音門！"), JSON.stringify({ ...demo, talk0 }));
        ok("C1 教學完 → 開跑", await running(p));
        await rowOn(p); const s = await S(p);
        ok("C2 第一次玩的第 1 題多 1 秒（7 秒）", Math.abs(s.row.T - 7) < 0.01, `T=${s.row.T}`);
        await close(); }

      // ===== D. 30 道門 → 終點 → 「答對 N 題！」→ onEnd =====
      for (const [best, rec] of [[50, false], [0, true]]) {
        const { p, close } = await open(b, `seed=15&speed=6&best=${best}`);
        await running(p);
        let wrong = 0;
        for (let k = 0; k < 30; k++) { const good = k % 7 !== 3; if (!good) wrong++; await answer(p, good); await sleep(60); }
        ok(`D1 第 30 道門 → 終點 → onEnd（最高紀錄 ${best}）`, await until(p, () => window.__lab.calls.end.length === 1, null, 20000));
        const r = (await C(p)).end[0] || {}, calls = await C(p);
        const keys = ["finished", "total", "right", "wrong", "score", "ms", "coins", "words", "zone", "zonesCleared", "record"];
        ok("D1 r：finished、total 30、score＝答對題數、zone 7、跑完 8 種風景", r.finished === true && r.total === 30 && r.right === 30 - wrong && r.wrong === wrong && r.score === r.right && r.zone === 7 && r.zonesCleared === 8, JSON.stringify(r));
        ok(`D1 r.record＝${rec}（答對 ${r.right} 題 vs 最高 ${best}）`, r.record === rec && keys.every(k => k in r) && Array.isArray(r.words) && r.words.length > 0, keys.filter(k => !(k in r)).join(",") || `words=${(r.words || []).length}`);
        ok("D1 從頭到尾沒有呼叫 onZone、念「跑到終點了！好厲害！」", calls.zone.length === 0 && calls.talk.includes("跑到終點了！好厲害！"), JSON.stringify({ zone: calls.zone.length, talk: calls.talk.slice(-2) }));
        const bigTxt = await p.evaluate(() => document.querySelector(".run-big").innerText.replace(/\s+/g, " "));
        ok("D1 終點大字「答對 N 題！」", bigTxt.includes(`答對 ${r.right} 題！`) && (!rec || bigTxt.includes("新紀錄")), bigTxt);
        await close();
      }

      // ===== G. 題目大圖：有圖時顯示圖（白底圓角卡、彈出來）；下一題的圖先預載 =====
      { const { p, close, picReq } = await open(b, "seed=19&speed=2", 1180, 820, { fakePic: true });
        await running(p); await rowOn(p); await sleep(700);
        const s = await S(p), pic = await p.evaluate(() => window.__zyRun.pic()), vm = 8.2;
        ok("G1 有圖：大圖用 <img>（q.img）、載得到、大小約 22–28vmin", pic.on && pic.img && /IMAGE\/zhuyin\/pic\/.+\.webp$/.test(pic.img) && pic.imgW > 0 && pic.rect.width >= 22 * vm && pic.rect.width <= 28 * vm, `img=${pic.img} 寬 ${Math.round(pic.rect.width)}px imgW=${pic.imgW} 題目 ${s.row.say}`);
        await shot(p, "pic-img-1180x820");
        await p.evaluate(() => window.__zyRun.answer(true)); await until(p, () => window.__zyRun.state().next, null, 5000); await sleep(200);
        const nx = (await S(p)).next;
        ok("G2 下一題的圖在門出現前就先抓了（預載）", nx && nx.img && picReq.some(u => u === nx.img), `next=${nx && nx.img} 已抓 ${picReq.length} 張`);
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
        const w = await p.evaluate(() => window.__zyRun.world && window.__zyRun.world());
        ok("E2 3D 統計（draw call／三角形／幾何／貼圖）", !!w && w.calls < 80, JSON.stringify(w));
        await close(); }

      // ===== F. 截圖：橫／直 × 第 1、15、28 題＋終點 =====
      for (const [w, h] of [[1180, 820], [820, 1180]]) {
        for (const g of [1, 15, 28]) {
          const { p, close } = await open(b, `seed=${20 + g}&clean=1&gate=${g}`, w, h);
          await rowOn(p, 30000); await sleep(2600);
          const s = await S(p); await shot(p, `q${g}-${w}x${h}`);
          const cards = (await p.evaluate(() => window.__zyRun.cards())).filter(c => c.on), pic = await p.evaluate(() => window.__zyRun.pic());
          const inView = cards.every(c => c.rect.x >= 0 && c.rect.x + c.rect.width <= w && c.rect.y + c.rect.height <= h);
          const lr = cards.length === 2 && cards[0].rect.x + cards[0].rect.width <= cards[1].rect.x && cards[0].rect.x + cards[0].rect.width / 2 < w / 2 && cards[1].rect.x + cards[1].rect.width / 2 > w / 2;
          ok(`F 截圖 第 ${g} 題 ${w}×${h}：大圖、兩張卡左右對齊、字 ≥40px、左上角空著`, s.row && s.row.i === g - 1 && pic.on && inView && lr && cards.every(c => c.fs >= 40) && (await cornerFree(p)),
            `${s.row ? s.row.pic + " " + s.row.answer + "／" + s.row.options.join("、") : "沒有門"} 級 ${s.row && s.row.tier} fs=${cards.map(c => Math.round(c.fs)).join("/")} 圖 ${Math.round(pic.fs)}px`);
          await close();
        }
        const { p, close } = await open(b, "seed=31&clean=1&speed=3&gate=30", w, h);
        await rowOn(p, 30000); await answer(p, true);
        await until(p, () => !document.querySelector(".run-big").classList.contains("run-off"), null, 15000); await sleep(700);
        await shot(p, `finish-${w}x${h}`); ok(`F 截圖 終點 ${w}×${h}`, await cornerFree(p)); await close();
      }
    }

    // ===== H. 玩久模擬：答對八成跑完 30 道要幾分鐘（自動駕駛，加速 8 倍跑，算正常速度的分鐘數；只記錄、不設目標） =====
    if (LONG || ONLY_LONG) {
      for (const [seed, think, label] of [[41, "1.2,2.6", "會讀的小孩（1.2–2.6 秒點卡）"], [42, "3,5", "慢慢讀的小孩（3–5 秒才點）"]]) {
        const { p, close } = await open(b, `seed=${seed}&speed=8&auto=0.8&think=${think}`);
        const t0 = Date.now();
        const done = await until(p, () => window.__lab.calls.end.length >= 1, null, 240000);
        const r = (await C(p)).end[0];
        ok(`H 玩久模擬・${label}：30 道門跑完 ${r ? (r.ms / 60000).toFixed(1) : "?"} 分鐘`, done && r && r.finished,
          r ? `答對 ${r.right} 錯 ${r.wrong}（${Math.round(r.right / 30 * 100)}%）金幣 ${r.coins}（實際 ${Math.round((Date.now() - t0) / 1000)} 秒）` : "沒跑完");
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
