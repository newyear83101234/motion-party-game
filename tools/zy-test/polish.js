// 拋光 A 組（遊戲手感）測試：node tools/zy-test/polish.js
// 驗：音效 preservesPitch=false（BGM 保留）、連對音高照大調音階往上爬、pointerdown 一碰就算、答對當下進度點立刻變金、
//     揭曉後 1.2 秒內點畫面不會跳題、翻錯不播 ng、積木可以用拖的放對（拖到格子外＝滑回去不算錯、拖錯＝照舊算錯）、
//     驚喜題觸發後下一題正常、可戳小東西點了不計錯也不會跳題、地鼠鎖定中點了不算錯、連對 3 題徽章、
//     點餐食物飛到客人嘴邊、尋寶背包「n/8」、第一次玩 6 秒沒動作有示範手指、沒有 [polish] 警告
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEL = { fish: "#pond .fishBtn", order: "#shelf .item", hunt: "#scene .obj", tone: "#sky .balloon" };
// 手指一碰：只派 pointerdown（沒有 pointerup／click）
const answer = (p, m, right) => p.evaluate(({ right, sel }) => { const o = window.__zy.curOpts; const i = o.findIndex(x => !!x.ok === right);
  document.querySelectorAll(sel)[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); }, { right, sel: SEL[m] });
// 監看所有 <audio>.play()：記下檔名、播放速度、preservesPitch
const spy = p => p.evaluate(() => { window.__sfx = []; if (HTMLMediaElement.prototype.__spied) return; const orig = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.__spied = true;
  HTMLMediaElement.prototype.play = function () { window.__sfx.push({ f: (this.src || "").split("/").pop(), rate: +this.playbackRate.toFixed(4), pp: this.preservesPitch, vol: this.volume }); return orig.apply(this, arguments); }; });
const sfx = p => p.evaluate(() => window.__sfx);
const clearSfx = p => p.evaluate(() => { window.__sfx = []; });
const nextIdx = (p, n, t = 5000) => p.waitForFunction(n => window.__zy.idx === n, n, { timeout: t });

(async () => {
  const browser = await launch(); const warns = [];
  const open = async opt => { const g = await openGame(browser, { stickers: 40, query: "debug", ...opt }); g.p.on("console", m => { if (/\[polish\]/.test(m.text())) warns.push(m.text().slice(0, 160)); }); await spy(g.p); return g; };
  // ===== 1. 釣魚：音高、一碰就算、進度點變金、揭曉停留、驚喜題、小生物 =====
  {
    const { ctx, p, errs } = await open();
    await enterMode(p, "fish"); await clearSfx(p);
    // pointerdown 一碰就算 ＋ 進度點當下變金（同一個 evaluate 裡、沒有等任何動畫）
    const now = await p.evaluate(sel => { const o = window.__zy.curOpts, i = o.findIndex(x => x.ok), idx = window.__zy.idx;
      document.querySelectorAll(sel)[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true }));
      const dot = document.getElementById("progress").children[idx];
      return { res: window.__zy.results[idx], cls: dot.className, bg: getComputedStyle(dot).backgroundColor }; }, SEL.fish);
    ok("pointerdown 一碰就算（沒有 pointerup／click）", now.res === "gold", JSON.stringify(now));
    ok("答對當下進度點立刻變金（黃底）", /gold/.test(now.cls) && now.bg === "rgb(255, 213, 74)", JSON.stringify(now));
    const s1 = await sfx(p), okS = s1.find(x => x.f === "zy_ok.mp3");
    ok("音效 preservesPitch=false（音高會跟著速度變）", okS && okS.pp === false, JSON.stringify(okS));
    // 揭曉停留：0.6 秒點畫面不會跳題，1.4 秒點才會
    await sleep(600); await p.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await sleep(100); const still = await p.evaluate(() => window.__zy.idx);
    ok("揭曉後 1.2 秒內點畫面不會跳題（holdMs ≥1200）", still === 0, "idx=" + still);
    await sleep(700); await p.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await nextIdx(p, 1, 2000).then(() => ok("揭曉 1.2 秒後點一下＝下一題", true), () => ok("揭曉 1.2 秒後點一下＝下一題", false));
    // 連對第 2、3 題：ok 音照大調 Re、Mi；第 3 題連對有徽章
    await sleep(400); await clearSfx(p);
    await answer(p, "fish", true); await nextIdx(p, 2); await sleep(400);
    await answer(p, "fish", true); await sleep(250);
    const rates = (await sfx(p)).filter(x => x.f === "zy_ok.mp3").map(x => x.rate);
    ok("連對音高照大調音階往上爬（Re、Mi）", rates.length === 2 && Math.abs(rates[0] - 2 ** (2 / 12)) < 0.01 && Math.abs(rates[1] - 2 ** (4 / 12)) < 0.01, JSON.stringify(rates));
    const badge = await p.evaluate(() => document.querySelector(".combo-badge")?.textContent || "");
    ok("連對 3 題：頂上落下「連續 3 題！」徽章", badge.includes("3") && badge.includes("連續"), badge);
    await nextIdx(p, 3, 5000); await sleep(400);
    // 答錯過再答對＝銀星、ok 回到 Do
    await clearSfx(p); await answer(p, "fish", false); await sleep(450); await answer(p, "fish", true); await sleep(200);
    const s2 = await sfx(p);
    ok("答錯 ng 音量 0.5、錯過再對 ok 回到 Do", s2.find(x => x.f === "zy_ng.mp3")?.vol === 0.5 && s2.find(x => x.f === "zy_ok.mp3")?.rate === 1, JSON.stringify(s2));
    await nextIdx(p, 4, 5000); await sleep(500);
    // 可戳小東西：叫出來 → 不擋選項 → 點了不算錯、不碰提示、不會變成跳題
    await p.evaluate(() => { window.__crit = window.__zyPolish.spawnCritter(); }); await sleep(600);   // 等「冒出來」的彈入動畫跑完（一開始是縮成 0 的）
    const cr = await p.evaluate(() => { const c = window.__crit; if (!c) return null; const r = c.getBoundingClientRect();
      const hit = [...document.querySelectorAll("#pond .fishBtn, #fishPrompt")].some(e => { const q = e.getBoundingClientRect(); return r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top; });
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit }; });
    ok("小生物出現、沒擋到選項和題目卡", !!cr && !cr.hit, JSON.stringify(cr));
    if (cr) {
      const w0 = await p.evaluate(() => ({ wrong: window.__zy.wrong, res: window.__zy.results[window.__zy.idx], pulse: document.getElementById("speakBtn").classList.contains("pulse") }));
      await clearSfx(p); await p.mouse.click(cr.x, cr.y); await sleep(250);
      const w1 = await p.evaluate(() => ({ wrong: window.__zy.wrong, res: window.__zy.results[window.__zy.idx], pulse: document.getElementById("speakBtn").classList.contains("pulse") }));
      const s3 = await sfx(p);
      ok("戳小生物：不計錯、不出答錯音、有叫一聲", JSON.stringify(w0) === JSON.stringify(w1) && !s3.some(x => x.f === "zy_ng.mp3") && s3.some(x => x.f === "zy_pop.mp3"), JSON.stringify({ w0, w1, s3 }));
      // 答對後揭曉中戳小生物：不能變成「點一下換下一題」
      await answer(p, "fish", true); const i0 = await p.evaluate(() => window.__zy.idx); await sleep(1300);
      const still2 = await p.evaluate(() => document.querySelector("#fish .critter:not(.bye)"));
      if (still2) { await p.mouse.click(cr.x, cr.y); await sleep(150); }
      ok("揭曉中戳小生物不會跳題", !still2 || (await p.evaluate(() => window.__zy.idx)) === i0, still2 ? "" : "（小生物已離開，略過）");
      await nextIdx(p, i0 + 1, 5000);
    }
    for (let k = 0; k < 4; k++) await p.evaluate(() => window.__zyPolish.spawnCritter());
    ok("同一個畫面小生物最多 2 隻", (await p.evaluate(() => document.querySelectorAll("#fish .critter:not(.bye)").length)) <= 2);
    // 驚喜題：強制下一題觸發 → 金光＋金魚，下一題照常出題、照常判定
    await sleep(400);
    const before = await p.evaluate(() => window.__zy.idx);
    await p.evaluate(() => window.__zyPolish.force()); await answer(p, "fish", true); await sleep(120);
    const sp = await p.evaluate(() => ({ flash: !!document.querySelector("#fx .goldflash"), golden: !!document.querySelector("#pond .fishBtn.golden") }));
    ok("驚喜題：金光＋金魚", sp.flash && sp.golden, JSON.stringify(sp));
    await nextIdx(p, before + 1, 5000); await sleep(500);
    const nq = await p.evaluate(() => ({ n: document.querySelectorAll("#pond .fishBtn").length, golden: document.querySelectorAll("#pond .fishBtn.golden").length, locked: window.__zy.results[window.__zy.idx] }));
    await answer(p, "fish", true); await sleep(150);
    const r2 = await p.evaluate(() => window.__zy.results[window.__zy.idx]);
    ok("驚喜題後下一題正常（4 條魚、可以答、金星）", nq.n === 4 && nq.golden === 0 && nq.locked === undefined && r2 === "gold", JSON.stringify({ nq, r2 }));
    ok("最多 1 題驚喜（同一局再答對不會再觸發）", await p.evaluate(() => window.__zyPolish.pz.surprise === true && window.__zyPolish.pz.force === false));
    ok("釣魚段沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 翻牌：翻錯不播 ng、配對成功揭曉國字、計數膠囊 =====
  {
    const { ctx, p, errs } = await open();
    await enterMode(p, "match", 8); await clearSfx(p);
    const tap = (a) => p.evaluate(a => { const cs = [...document.querySelectorAll("#board .card")]; cs[a].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); }, a);
    const pair = await p.evaluate(() => { const cs = [...document.querySelectorAll("#board .card")]; const z = cs.findIndex(c => c._c.kind === "z"); const e = cs.findIndex(c => c._c.kind === "e" && c._c.w !== cs[z]._c.w); const m = cs.findIndex(c => c._c.kind === "e" && c._c.w === cs[z]._c.w); return { z, e, m }; });
    await tap(pair.z); await sleep(100); await tap(pair.e); await sleep(1100);
    const s = await sfx(p);
    ok("翻錯不播 ng（蓋回時播 flip 0.85）", !s.some(x => x.f === "zy_ng.mp3") && s.some(x => x.f === "zy_flip.mp3" && Math.abs(x.rate - 0.85) < 0.01), JSON.stringify(s));
    ok("翻牌頂上有配對計數「0/4」", (await p.evaluate(() => document.querySelector("#match .mcount")?.textContent || "")).includes("0/4"));
    await tap(pair.z); await sleep(100); await tap(pair.m); await sleep(1000);
    const m = await p.evaluate(({ z, m }) => { const cs = [...document.querySelectorAll("#board .card")]; return { done: cs[z].classList.contains("done") && cs[m].classList.contains("done"), han: !!cs[m].querySelector(".front .han"), cnt: document.querySelector("#match .mcount").textContent }; }, pair);
    ok("配對成功：兩張完成、圖卡揭曉國字、計數 1/4", m.done && m.han && m.cnt.includes("1/4"), JSON.stringify(m));
    ok("單音節注音卡有放大（--zf1 > --zf）", await p.evaluate(() => { const b = document.getElementById("board"); return parseFloat(b.style.getPropertyValue("--zf1")) > parseFloat(b.style.getPropertyValue("--zf")); }));
    ok("翻牌段沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 積木：拖曳放對、拖到外面滑回去、拖錯照舊算錯、點一下照舊 =====
  {
    const { ctx, p, errs } = await open();
    await enterMode(p, "build"); await sleep(600);
    const info = () => p.evaluate(() => { const z = window.__zy.round[window.__zy.idx].word.z, want = z[0], slot = document.querySelector("#slots .slot.cur"), r = slot.getBoundingClientRect();
      const tiles = [...document.querySelectorAll("#tray .tile:not(.used)")], good = tiles.find(t => t.dataset.v === want), bad = tiles.find(t => !z.includes(t.dataset.v));
      const c = e => { const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; };
      return { want, slot: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, good: good && c(good), bad: bad && c(bad), badV: bad && bad.dataset.v }; });
    const drag = async (a, b) => { await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let k = 1; k <= 6; k++) { await p.mouse.move(a.x + (b.x - a.x) * k / 6, a.y + (b.y - a.y) * k / 6); } await p.mouse.up(); await sleep(350); };
    let I = await info();
    // 拖到畫面最左邊（格子外）：滑回托盤、不算錯
    await drag(I.good, { x: 20, y: 410 });
    const o1 = await p.evaluate(v => ({ used: [...document.querySelectorAll("#tray .tile")].find(t => t.dataset.v === v).classList.contains("used"), wrong: window.__zy.wrong, filled: document.querySelectorAll("#slots .slot.good").length }), I.want);
    ok("拖到格子外放開＝滑回托盤、不算錯", !o1.used && o1.wrong === 0 && o1.filled === 0, JSON.stringify(o1));
    // 拖錯的積木放到格子上：照舊算一次錯
    if (I.bad) { await drag(I.bad, I.slot); ok("拖錯的積木放上格子＝照舊算一次錯、積木回托盤", (await p.evaluate(() => window.__zy.wrong)) === 1 && !(await p.evaluate(v => [...document.querySelectorAll("#tray .tile")].find(t => t.dataset.v === v).classList.contains("used"), I.badV))); }
    // 拖對
    I = await info(); await drag(I.good, I.slot);
    const o2 = await p.evaluate(v => { const s = [...document.querySelectorAll("#slots .slot:not(.toneSlot)")][0]; return { v: s.dataset.v, good: s.classList.contains("good"), used: [...document.querySelectorAll("#tray .tile")].find(t => t.dataset.v === v && t.classList.contains("used")) !== undefined, wrong: window.__zy.wrong }; }, I.want);
    ok("積木可以用拖的放對（格子填上、積木用掉、不多算錯）", o2.v === I.want && o2.good && o2.used && o2.wrong === (I.bad ? 1 : 0), JSON.stringify(o2));
    // 點一下照舊：點下一個該放的積木
    const z = await p.evaluate(() => window.__zy.round[window.__zy.idx].word.z);
    const nxt = await p.evaluate(() => { const e = document.querySelector("#slots .slot.cur"); if (!e) return null; const z = window.__zy.round[window.__zy.idx].word.z.split(" ").map(s => s.replace(/[ˊˇˋ˙]/g, "")).join(""); const filled = [...document.querySelectorAll("#slots .slot:not(.toneSlot)")].filter(d => d.dataset.v).length; const want = z[filled]; const t = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === want); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, want }; });
    if (nxt) { await p.mouse.click(nxt.x, nxt.y); await sleep(300); ok("積木點一下照舊能放", (await p.evaluate(() => document.querySelectorAll("#slots .slot.good:not(.toneSlot)").length)) === 2, JSON.stringify(nxt)); }
    else ok("積木點一下照舊能放", true, "（單符號音節，第一格已填完，改由聲調格接手，略過）" + z);
    ok("積木段沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4. 點餐／尋寶：食物飛到客人嘴邊再嚼、背包 n/8 =====
  {
    const { ctx, p, errs } = await open();
    await enterMode(p, "order"); await sleep(500);
    await answer(p, "order", true); await sleep(150);
    const fly = await p.evaluate(() => !!document.querySelector("#fx .flyer:not(.txt)"));
    await sleep(600);
    ok("點餐：食物飛向客人、到了客人嚼東西", fly && await p.evaluate(() => document.getElementById("customer").classList.contains("chew")));
    await enterMode(p, "hunt"); await sleep(500);
    ok("尋寶：背包一開始「0/8」", (await p.evaluate(() => document.getElementById("bag").textContent)).includes("0/8"));
    await answer(p, "hunt", true); await sleep(900);
    ok("尋寶：東西飛進背包後「1/8」", (await p.evaluate(() => document.getElementById("bag").textContent)).includes("1/8"), await p.evaluate(() => document.getElementById("bag").textContent));
    ok("點餐／尋寶段沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 5. 地鼠：敲錯鎖定中點了不算錯、牌子變灰 =====
  {
    const { ctx, p, errs } = await open();
    await enterMode(p, "whack");
    const tapMole = i => p.evaluate(i => window.__zy.wq.cells[i].mole.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })), i);
    const bad = await p.waitForFunction(() => { const s = window.__zy.wq; const i = s.cells.findIndex(c => !c.ok && c.state === "up"); return i >= 0 ? i + 1 : false; }, null, { timeout: 9000, polling: 50 }).then(h => h.jsonValue()).then(i => i - 1);
    await tapMole(bad); await sleep(60);
    const lockState = await p.evaluate(() => ({ lock: document.getElementById("field").classList.contains("lock"), wrong: window.__zy.wrong }));
    // 敲錯那隻 0.35 秒內還探著頭（state 還是 up）、鎖定 0.5 秒 → 馬上再敲一次＝鎖定中的點擊（有其他冒著的也一起敲）
    const again = await p.evaluate(b => { const s = window.__zy.wq, ids = s.cells.map((c, i) => c.state === "up" ? i : -1).filter(i => i >= 0); return { up: ids, still: s.cells[b].state }; }, bad);
    for (const i of again.up) await tapMole(i);
    const after = await p.evaluate(b => ({ wrong: window.__zy.wrong, meh: window.__zy.wq.cells[b].mole.classList.contains("meh"), hits: window.__zy.wq.hits }), bad);
    ok("地鼠：敲錯後鎖定（牌子變灰）、鎖定中再敲不算錯也不算分、會晃一下", lockState.lock && lockState.wrong === 1 && again.up.length >= 1 && after.wrong === 1 && after.hits === 0 && after.meh, JSON.stringify({ lockState, again, after }));
    ok("地鼠段沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 6. 第一次玩：第 1 題 6 秒沒動作 → 示範手指指著正確答案（不幫他答） =====
  {
    const { ctx, p, errs } = await open();
    await p.evaluate(() => localStorage.setItem("zy1_intro", JSON.stringify({ order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1 })));
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(300); await spy(p);
    await enterMode(p, "fish"); await sleep(6600);
    const d = await p.evaluate(() => { const f = document.querySelector("#fx .demo-finger"); if (!f) return null; const fr = f.getBoundingClientRect(), i = window.__zy.curOpts.findIndex(o => o.ok), t = document.querySelectorAll("#pond .fishBtn")[i].getBoundingClientRect();
      return { near: Math.abs(fr.left + fr.width / 2 - (t.left + t.width / 2)) < t.width * 0.6 && fr.top > t.top - 40 && fr.top < t.bottom, res: window.__zy.results[0] }; });
    ok("第一次玩：6 秒沒動作出現示範手指、指著正確的魚、沒有幫他答", !!d && d.near && d.res === undefined, JSON.stringify(d));
    await answer(p, "fish", true); await sleep(100);
    ok("示範過那題自己答對照算金星", (await p.evaluate(() => window.__zy.results[0])) === "gold");
    await enterMode(p, "fish"); await sleep(6600);
    ok("第二次玩不再示範", !(await p.evaluate(() => document.querySelector("#fx .demo-finger"))));
    ok("示範段沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  ok("沒有 [polish] 裝飾錯誤警告", warns.length === 0, warns.join(" | "));
  await browser.close();
  console.log(out.join("\n")); const f = out.filter(r => r.startsWith("FAIL")).length; console.log(f ? `${f} FAILED / ${out.length}` : `ALL PASS (${out.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.log(out.join("\n")); console.error("FATAL", e.message); process.exit(1); });
