// 詞句小偵探接進主程式的測試（10-12）：node tools/zy-test/detective-game.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 DETECTIVE_GAME_SHOTS（預設 %TEMP%\zy-detective-game）。
// 驗：①小島 → 彩虹島 → 偵探社浮標（🕵️、剛開放＝展開「新 偵探社」）→ 點 3D 建築進遊戲（主程式「再聽」藏起來、沒有進度點、calm 音樂、小島停止渲染）
//     ②第一次玩：教學句只唸一次（模組唸，主程式不重複）
//     ③完整玩一回合（第一題先答錯一次）→ 答對時點心＋同樂廣場讀字週 → 結算：找到 N 句話、星數＝模組算的、唸 WIN_TALK、點心膠囊
//     ④存檔 zy1_detective＝{seen, best}、個人紀錄；重開仍在；備份碼還原仍在
//     ⑤第二次（卡片選單進）：不唸教學、直接念題目
//     ⑥玩到一半按 🏠 回小島：畫面收乾淨、之後沒有殘留語音／延遲回呼（fired 不再增加）
//     ⑦結算畫面版面（10-12 bug）：獎勵膠囊在左上（不是跑到最下面）、一顆一顆膠囊（國字不是各自一顆泡泡）、1024×768／768×1024／844×390 都在畫面裡、按鈕不被擋
//     ⑧0 個 console error、新字都有注音
const { launch, openGame } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const SHOTS = process.env.DETECTIVE_GAME_SHOTS || path.join(os.tmpdir(), "zy-detective-game");
fs.mkdirSync(SHOTS, { recursive: true });
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const strip = s => String(s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const Q = "debug&novoice&night=0&weather=sunny";
const INTRO = "仔細聽，選出你聽到的那一句！", WIN = "全部找到了，你是厲害的小偵探！";
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const hubReady = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).then(() => sleep(600));
const spoken = p => p.evaluate(() => window.__spoken.map(s => s.text));
const want = p => p.evaluate(() => window.__zyAudio ? window.__zyAudio.debug().want : "?");
const LS = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const DS = p => p.evaluate(() => window.__zy.detective && window.__zy.detective.state());
const inGame = p => p.waitForFunction(() => window.__zy.mode === "detective" && !document.getElementById("detective").classList.contains("hidden") && window.__zy.detective && window.__zy.detective.state(), null, { timeout: 20000 }).then(() => true, () => false);
const phase = (p, ph, t = 15000) => p.waitForFunction(ph => { const s = window.__zy.detective && window.__zy.detective.state(); return s && s.phase === ph; }, ph, { timeout: t, polling: 30 }).then(() => true, () => false);
const resultOn = p => p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 20000 }).then(() => true, () => false);
const finishResult = async p => { await sleep(900); await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(900); };
const spot = (p, m) => p.evaluate(m => {
  const h = window.__hub3d, c = h.screenOf(m);
  for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
    const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r, e = document.elementFromPoint(x, y);
    if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === m) return { x, y };
  }
  return null;
}, m);
// 10-12 介紹卡：點一下建築＝開介紹卡（貓頭鷹唸名字），介紹卡開著再點同一棟＝開始 → 這裡的「點 3D 建築進遊戲」都是點兩下；
// 第二下之前把唸過的話清掉（後面驗「進遊戲後唸了什麼」，不算介紹卡唸的名字）
const pickOn = (p, m) => p.waitForFunction(m => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === m && window.__hub3d.sel() === m; }, m, { timeout: 5000 }).then(() => true, () => false);
const tap3d = async (p, m) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (!s) { await sleep(500); continue; }
  await p.mouse.click(s.x, s.y); if (!(await pickOn(p, m))) continue; await sleep(900); const s2 = await spot(p, m); if (!s2) continue;
  await p.evaluate(() => { if (window.__spoken) window.__spoken = []; }); await p.mouse.click(s2.x, s2.y); return s2; } return null; };
// 玩完一回合：第一題先點錯一張（wrongFirst），其餘直接點答案；每題答對後按「下一題／完成」
async function playRound(p, wrongFirst) {
  const total = (await DS(p)).total;
  for (let q = 0; q < total; q++) {
    if (!(await phase(p, "ask"))) return { err: "沒等到題目 " + q };
    if (wrongFirst && q === 0) { await p.evaluate(() => { const g = window.__zy.detective, s = g.state(); g.debug.tap([0, 1, 2].find(i => i !== s.answer)); }); await sleep(800); }
    await p.evaluate(() => { const g = window.__zy.detective; g.debug.tap(g.state().answer); });
    if (!(await p.waitForFunction(() => window.__zy.detective.state().nextShown, null, { timeout: 8000, polling: 30 }).then(() => true, () => false))) return { err: "下一題沒出來 " + q };
    await sleep(200); await p.evaluate(() => document.querySelector(".dt-next").click());
  }
  return { total };
}
async function reopen(p) {
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await sleep(300); await p.evaluate(() => { window.__spoken = []; });
}
// 結算畫面版面：獎勵膠囊（.rw-strip）在左上、在畫面裡；膠囊一顆一顆（國字的 span.ac 沒有膠囊底色）；不蓋到按鈕、星星、標題
const resultLayout = p => p.evaluate(() => {
  const R = e => { const r = e.getBoundingClientRect(); return { x0: Math.round(r.left), y0: Math.round(r.top), x1: Math.round(r.right), y1: Math.round(r.bottom) }; };
  const st = document.querySelector("#result .rw-strip"), inV = r => r.x0 >= 0 && r.y0 >= 0 && r.x1 <= innerWidth && r.y1 <= innerHeight;
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const pills = st ? [...st.children] : [], acBg = st ? [...st.querySelectorAll(".rw-pill .ac")].filter(e => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)").length : -1;
  const keep = ["resultText", "resultStars", "resultBtns", "hatchHint"].map(id => ({ id, r: R(document.getElementById(id)) }));
  const kids = [...document.querySelectorAll("#resultStickers > *")].map(R), stickers = document.getElementById("resultStickers");
  return { has: !!st, pos: st ? getComputedStyle(st).position : null, strip: st ? R(st) : null, pills: pills.length, pillCls: pills.every(e => e.classList.contains("rw-pill")), acBg,
    stripIn: st ? inV(R(st)) : false, covers: st ? keep.filter(k => hit(R(st), k.r)).map(k => k.id) : [], allIn: keep.every(k => inV(k.r)) && kids.every(inV), off: keep.filter(k => !inV(k.r)).map(k => k.id).concat(kids.filter(r => !inV(r)).length ? ["stickers"] : []),
    btnsVsStickers: kids.some(r => hit(r, R(document.getElementById("resultBtns")))), W: innerWidth, H: innerHeight, stH: R(stickers) };
});

(async () => {
  const browser = await launch(); const allErrs = [];
  const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 8, query: Q });   // 40 張：彩虹島開了；stars 8＝結算後星星罐滿 → 扭蛋幣膠囊
  await hubReady(p);

  // ① 小島 → 彩虹島 → 偵探社
  await p.evaluate(() => document.getElementById("rainbowBtn").click()); await sleep(3800);
  const tag = await p.evaluate(() => { const t = document.querySelector(".hub-tag[data-mode=detective]"); return t && { rb: t.classList.contains("rb"), fresh: t.classList.contains("fresh"), open: t.classList.contains("open"), ico: t.querySelector(".ht-ico").textContent, word: t.querySelector(".ht-word").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), disp: getComputedStyle(t).display, locked: t.classList.contains("locked") }; });
  ok("① 彩虹島上有偵探社浮標：🕵️「偵探社」、沒鎖、平常收成圓形圖示（10-12 晚起沒有「新」）", tag && tag.rb && !tag.fresh && !tag.open && tag.ico === "🕵️" && tag.word === "偵探社" && tag.disp !== "none" && !tag.locked, J(tag));
  const rbInfo = await p.evaluate(() => window.__hub3d.rainbow()), g = await p.evaluate(() => window.__hub3d.graph());
  ok("① 偵探社蓋好了、門口接到路網（彩虹島沒有斷頭路、整個路網連通）", rbInfo.ready.includes("detective") && rbInfo.doors.includes("detective") && rbInfo.deadEnds.length === 0 && g.components === 1, J({ ready: rbInfo.ready, doors: rbInfo.doors, dead: rbInfo.deadEnds, comp: g.components }));
  await shot(p, "detective-island");
  await p.evaluate(() => { window.__spoken = []; });
  const sd = await tap3d(p, "detective");
  const in1 = await inGame(p);
  const ui = await p.evaluate(() => ({ speak: document.getElementById("speakBtn").classList.contains("hidden"), prog: document.getElementById("progress").classList.contains("hidden"), home: getComputedStyle(document.getElementById("homeBtn")).visibility, kids: document.getElementById("detectiveRoot").children.length, hub: window.__hub3d.running }));
  ok("① 點 3D 偵探社兩下（介紹卡 → 開始）→ 進遊戲", !!sd && in1, J({ sd, in1 }));
  ok("① 主程式「再聽」藏起來（偵探上面自己有 🔊）、沒有進度點、🏠 在、3D 小島停止渲染", ui.speak && ui.prog && ui.home !== "hidden" && ui.kids > 0 && !ui.hub, J(ui));
  ok("① 偵探音樂（calm）", (await want(p)) === "calm", await want(p));
  // ② 教學只唸一次
  await phase(p, "ask"); await sleep(1500);
  const sp1 = await spoken(p);
  ok("② 第一次玩：教學句只唸一次（模組唸），接著念題目", sp1.filter(t => t === INTRO).length === 1 && sp1[0] === INTRO && sp1.length >= 2, J(sp1));
  await shot(p, "detective-play");

  // ③ 完整一回合（第一題錯一次）
  const pend0 = await LS(p, "zy_plaza_pending");
  const pr = await playRound(p, true);
  const r3 = await resultOn(p);
  const treats = await p.evaluate(() => window.__zy.roundTreats);
  await finishResult(p);
  const res = await p.evaluate(() => ({ text: document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), stars: document.querySelectorAll("#resultStars .star.on").length, again: document.getElementById("againBtn").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""),
    note: document.querySelector("#resultStickers .all-done") && document.querySelector("#resultStickers .all-done").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), run: window.__zy.detectiveRun, pills: [...document.querySelectorAll("#result .rw-pill")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }));
  const n = pr.total || 0;
  ok("③ 完整玩一回合 → 結算畫面", !pr.err && r3 && n >= 2, J(pr));
  ok("③ 結算：找到 N 句話、星數＝模組算的（依實際題數 n：n<5 最多 1 星；n=5 且第一題錯一次＝2 星）、「再玩」", res.text.includes(`找到${n}句話`) && res.run && res.stars === res.run.stars && res.stars === (n < 5 ? 1 : 2) && res.again.includes("再玩"), J(res));
  ok("③ 結算小字：一次就聽對 N−1 句", res.note === `一次就聽對${n - 1}句！`, res.note);
  ok("③ 點心＝答對題數＋2，膠囊有「點心 +N」", treats === n + 2 && res.pills.some(t => t.includes(`點心+${n + 2}`)), J({ treats, pills: res.pills }));
  const sp3 = await spoken(p);
  ok("③ 結算唸 WIN_TALK", sp3.includes(WIN), J(sp3.slice(-4)));
  const pend1 = await LS(p, "zy_plaza_pending"), wk = pend1 && Object.keys(pend1)[0], rd = c => (c && wk && c[wk] && c[wk].read) || 0;
  ok("③ 同樂廣場：每答對一題記一次讀字（+N）", rd(pend1) - rd(pend0) === n, J({ pend0, pend1 }));
  await shot(p, "detective-result");
  // ⑦ 結算版面（三種尺寸）
  for (const [w, h] of [[1024, 768], [768, 1024], [844, 390], [1180, 820]]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(500);
    const L = await resultLayout(p);
    ok(`⑦ 結算 ${w}×${h}：獎勵膠囊絕對定位在左上、在畫面裡、一顆一顆（國字沒有各自一顆泡泡）、不蓋標題／星星／按鈕`, L.has && L.pos === "absolute" && L.stripIn && L.pills >= 2 && L.pillCls && L.acBg === 0 && L.covers.length === 0 && L.strip.y0 < h / 2, J(L));
    ok(`⑦ 結算 ${w}×${h}：標題、星星、按鈕、星星罐都在畫面裡`, L.allIn, J(L.off));
    await shot(p, `result-${w}x${h}`);
  }
  await p.setViewportSize({ width: 1180, height: 820 }); await sleep(400);
  // ④ 存檔
  const dt = await LS(p, "zy1_detective"), best = await LS(p, "zy1_best"), B = n < 5 ? 1 : 2;   // 不到 5 題最多 1 星
  ok("④ 存檔 zy1_detective＝{seen:[題目 id], best}、個人紀錄 best.detective＝結算星數", dt && Array.isArray(dt.seen) && dt.seen.length === n && dt.best === B && best && best.detective === B, J({ dt, best }));

  // ⑤ 第二次（卡片選單進）：不唸教學
  await p.evaluate(() => { window.__spoken = []; document.getElementById("menuBtn").click(); }); await sleep(800);
  await p.evaluate(() => { window.__spoken = []; document.querySelector(".mode-card[data-mode=detective]").click(); });
  const in5 = await inGame(p); await phase(p, "ask"); await sleep(1200);
  const sp5 = await spoken(p), s5 = await DS(p);
  ok("⑤ 卡片選單進：第二次不唸教學、直接念題目", in5 && !sp5.includes(INTRO) && sp5[0] === s5.say, J({ sp5, say: s5 && s5.say }));
  // ⑥ 玩到一半回小島：沒有殘留
  await p.evaluate(() => { const gg = window.__zy.detective; gg.debug.tap(gg.state().answer); }); await sleep(300);
  await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(300);
  const paused = await p.evaluate(() => !document.getElementById("confirm").classList.contains("hidden"));
  await p.evaluate(() => document.getElementById("confirmYes").click()); await sleep(500);
  const f0 = await p.evaluate(() => ({ fired: window.__zy.detective.debug.fired(), sp: window.__spoken.length }));
  await sleep(3500);
  const f1 = await p.evaluate(() => ({ fired: window.__zy.detective.debug.fired(), sp: window.__spoken.length, st: window.__zy.detective.state(), kids: document.getElementById("detectiveRoot").children.length, mode: window.__zy.mode, resume: !document.getElementById("resumeBtn").classList.contains("hidden") }));
  const lateSpoken = (await spoken(p)).slice(f0.sp);
  ok("⑥ 玩到一半 🏠 → 暫停選單 → 回小島：畫面收乾淨、不留「繼續玩」", paused && f1.mode === null && f1.st === null && f1.kids === 0 && !f1.resume, J(f1));
  ok("⑥ 離開後 3.5 秒：沒有延遲回呼、沒有再念任何偵探的句子", f1.fired === f0.fired && !lateSpoken.some(t => t === s5.say || t === WIN || /小偵探|找到了|聽得好仔細/.test(t)), J({ f0, f1: f1.fired, lateSpoken }));
  // ④ 重開、備份碼
  await reopen(p);
  const dv = await p.evaluate(() => window.__zy.detectiveSave);
  ok("④ 重開頁面：偵探存檔還在", dv.best === B && dv.seen.length === n, J(dv));
  const code = await p.evaluate(() => window.__zyB.exportCode());
  await p.evaluate(() => localStorage.removeItem("zy1_detective")); await reopen(p);
  const gone = (await p.evaluate(() => window.__zy.detectiveSave)).best === 0;
  const ir = await p.evaluate(c => window.__zyB.importCode(c), code); await reopen(p);
  const dv2 = await p.evaluate(() => window.__zy.detectiveSave);
  ok("④ 備份碼帶偵探進度：刪掉後還原回來", gone && ir === "ok" && dv2.best === B && J(dv2.seen) === J(dv.seen), J({ gone, ir, dv2 }));
  const rd2 = await p.evaluate(() => { const d = window.__zyB.readCode(window.__zyB.exportCode()); return d && d.slots[0] && d.slots[0].detective; });
  ok("④ 備份碼讀回來的偵探資料是乾淨格式", rd2 && rd2.best === B && Array.isArray(rd2.seen), J(rd2));
  const miss = await p.evaluate(() => [...window.__zy.zMissing].join(""));
  ok("⑧ 新字都有注音（zMissing 空）", miss === "", miss);
  allErrs.push(...errs); await ctx.close();

  // ⑨ 結算版面：一般模式拿到很多新貼紙（釣魚 8 題全對＝8 張新貼紙）＋獎勵膠囊 → 三種尺寸都在畫面裡、膠囊不蓋東西
  {
    const { ctx: c9, p: q, errs: e9 } = await openGame(browser, { w: 1024, h: 768, stickers: 20, stars: 8, query: Q + "&no3d" });
    await q.evaluate(() => { document.querySelector(".mode-card[data-mode=fish]").click(); });
    await q.waitForFunction(() => window.__zy.mode === "fish" && window.__zy.curOpts, null, { timeout: 15000 });
    for (let k = 0; k < 8; k++) {
      await q.waitForFunction(k => window.__zy.idx === k && window.__zy.curOpts && !document.getElementById("fish").classList.contains("hidden"), k, { timeout: 15000, polling: 50 }).catch(() => {});
      await sleep(250);
      await q.evaluate(() => { const i = window.__zy.curOpts.findIndex(o => o.ok); const b = document.querySelectorAll("#pond .fishBtn")[i]; b && b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); });
      await q.waitForFunction(k => window.__zy.idx > k || !document.getElementById("result").classList.contains("hidden"), k, { timeout: 15000, polling: 50 }).catch(() => {});
    }
    const r9 = await resultOn(q); await finishResult(q);
    const nSt = await q.evaluate(() => document.querySelectorAll("#resultStickers .sticker").length);
    ok("⑨ 釣魚 8 題全對 → 結算有 8 張新貼紙", r9 && nSt === 8, String(nSt));
    for (const [w, h] of [[1024, 768], [768, 1024], [844, 390]]) {
      await q.setViewportSize({ width: w, height: h }); await sleep(600);
      const L = await resultLayout(q);
      ok(`⑨ 8 張新貼紙 ${w}×${h}：膠囊在上面一排不蓋東西、標題／星星／8 張貼紙／按鈕／星星罐全在畫面裡、貼紙不壓按鈕`, L.has && L.pos === "absolute" && L.pillCls && L.acBg === 0 && L.covers.length === 0 && L.allIn && !L.btnsVsStickers, J({ covers: L.covers, off: L.off, strip: L.strip, st: L.stH, bvs: L.btnsVsStickers }));
      await shot(q, `result-8stickers-${w}x${h}`);
    }
    allErrs.push(...e9); await c9.close();
  }
  await browser.close();
  ok("⑧ 全程 0 個 console error", allErrs.length === 0, allErrs.join(" | ").slice(0, 400));
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL / ${out.length}` : `\nALL PASS (${out.length})`);
  console.log("截圖：" + SHOTS);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
