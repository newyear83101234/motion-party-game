// 打地鼠／跳跳蛙行為測試：node tools/zy-test/newmodes.js
// 驗：敲對 3 次換目標、敲錯鎖 0.5 秒、暫停時地鼠時間凍結、整回合結算文字；
//     青蛙跳對前進、跳錯荷葉沉、轉向重排、跳到一半回選單不報錯、繼續玩從第 3 題接著
const { launch, openGame, enterMode } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 等某隻地鼠冒出來（ok＝要正確的還是錯的），回傳牠的格子編號
async function waitMole(p, wantOk, timeout = 9000) {
  return p.waitForFunction(w => { const s = window.__zy.wq; if (!s) return false; const i = s.cells.findIndex(c => c.ok === w && c.state === "up"); return i >= 0 ? i + 1 : false; }, wantOk, { timeout, polling: 50 }).then(h => h.jsonValue()).then(i => i - 1);
}
const tapMole = (p, i) => p.evaluate(i => window.__zy.wq.cells[i].mole.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })), i);
const tapPad = (p, wantOk) => p.evaluate(w => { const c = window.__zy.fq.cols.find(c => c.o.ok === w); if (!c) return false; c.pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return true; }, wantOk);
// 畫面上沒加注音的國字（.noann／.zy 裡的除外）
const bareHan = p => p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (!/[㐀-鿿]/.test(n.data) || !e || e.closest("script,style,.noann,.zy,.ac,.hidden,textarea")) continue; out.push(n.data.trim().slice(0, 12)); } return out; });

(async () => {
  const browser = await launch();
  // ===== 打地鼠 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    await enterMode(p, "whack");
    ok("地鼠：進得去、有 6 個洞", await p.evaluate(() => document.querySelectorAll("#field .wcell").length === 6 && window.__zy.mode === "whack"));
    ok("地鼠：開題唸目標詞（聽力模式）", await p.evaluate(() => window.__spoken.length >= 1 && window.__zy.WORDS.some(w => w.h === window.__spoken[0].text)), JSON.stringify(await p.evaluate(() => window.__spoken.map(s => s.text))));
    // 敲錯 → 0.5 秒內敲對不算
    const bad = await waitMole(p, false);
    await tapMole(p, bad);
    const w1 = await p.evaluate(() => window.__zy.wrong);
    ok("地鼠：敲錯計 1 次", w1 === 1, "wrong=" + w1);
    // 暫停凍結：記下一隻冒著的地鼠的剩餘時間，暫停 1.5 秒後剩餘時間要差不多
    const good0 = await waitMole(p, true);
    const left0 = await p.evaluate(i => window.__zy.wq.cells[i].until - performance.now(), good0);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(1500);
    const left1 = await p.evaluate(i => window.__zy.wq.cells[i].until - performance.now(), good0);
    const stillUp = await p.evaluate(i => window.__zy.wq.cells[i].state === "up", good0);
    await p.evaluate(() => document.getElementById("confirmNo").click());
    ok("地鼠：暫停時時間凍結", stillUp && Math.abs(left1 - left0) < 400, `暫停前剩 ${Math.round(left0)}ms，暫停 1.5 秒後剩 ${Math.round(left1)}ms`);
    // 切去別的 App 回來（模擬：主執行緒卡 2 秒＝這段沒有畫面更新）→ 地鼠不能全部當成逾時
    const g2 = await waitMole(p, true);
    const l0 = await p.evaluate(i => window.__zy.wq.cells[i].until - performance.now(), g2);
    await p.evaluate(() => { const t = performance.now(); while (performance.now() - t < 2000) {} }); await sleep(100);
    const l1 = await p.evaluate(i => ({ left: window.__zy.wq.cells[i].until - performance.now(), up: window.__zy.wq.cells[i].state === "up" }), g2);
    ok("地鼠：畫面停 2 秒回來，地鼠不會被當成沒敲到", l1.up && l1.left > l0 - 600, `停前剩 ${Math.round(l0)}ms，回來剩 ${Math.round(l1.left)}ms`);
    await sleep(600);                                  // 等過鎖定
    // 敲對 3 次 → 換題
    for (let k = 0; k < 3; k++) { const g = await waitMole(p, true); await tapMole(p, g); await sleep(80); }
    const r0 = await p.evaluate(() => ({ dots: document.querySelectorAll("#whackDots .on").length, res: window.__zy.results[0], han: document.querySelector("#whackPic .zy") !== null }));
    ok("地鼠：敲對 3 次＝完成目標、揭曉注音＋國字", r0.dots === 3 && r0.han && r0.res === "gold", JSON.stringify(r0) + "（錯 1 次仍金星＝容錯 1）");
    // 其餘 5 個目標全部敲對
    await p.waitForFunction(() => window.__zy.idx === 1, null, { timeout: 4000 });
    for (let t = 1; t < 6; t++) {
      for (let k = 0; k < 3; k++) { const g = await waitMole(p, true, 12000); await tapMole(p, g); await sleep(60); }
      if (t < 5) await p.waitForFunction(n => window.__zy.idx === n, t + 1, { timeout: 4000 });
    }
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 6000 });
    const rt = await p.evaluate(() => document.getElementById("resultText").textContent);
    ok("地鼠：結算文字", rt.includes("18"), rt);
    const up = await p.evaluate(() => localStorage.getItem("zy1_whack_up"));
    ok("地鼠：探頭時間有依表現存進存檔", !!up, up);
    ok("地鼠：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 跳跳蛙 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    await enterMode(p, "frog");
    const f0 = await p.evaluate(() => ({ k: window.__zy.fq.k, pads: window.__zy.fq.cols.length, word: window.__zy.fq.q.word.h }));
    ok("青蛙：第 1 題 2 片荷葉", f0.pads === 2, JSON.stringify(f0));
    ok("青蛙：開題唸整個詞", await p.evaluate(w => window.__spoken.some(s => s.text === w), f0.word));
    // 跳錯 → 荷葉沉、青蛙不動
    const frogPos0 = await p.evaluate(() => window.__zy.fq.frog.style.left + "," + window.__zy.fq.frog.style.top);
    await tapPad(p, false); await sleep(100);
    await tapPad(p, true); await sleep(200);               // 跳錯後 0.8 秒內點正解不算（亂點不能一路點過）
    ok("青蛙：跳錯後 0.8 秒內點正解被擋", await p.evaluate(() => window.__zy.fq.step === 0 && !window.__zy.fq.busy));
    await sleep(600);
    const af = await p.evaluate(() => ({ pads: window.__zy.fq.cols.length, sunk: document.querySelectorAll("#river .pad.sink").length, frog: window.__zy.fq.frog.style.left + "," + window.__zy.fq.frog.style.top, wrong: window.__zy.wrong }));
    ok("青蛙：跳錯＝荷葉沉掉、青蛙不動、計 1 錯", af.pads === 1 && af.frog === frogPos0 && af.wrong === 1, JSON.stringify(af));
    await sleep(200);
    // 轉向：橫 → 直，物件重新排
    await p.setViewportSize({ width: 820, height: 1180 }); await sleep(400);
    const rot = await p.evaluate(() => ({ portrait: window.__zy.fq.portrait, frogLeft: window.__zy.fq.frog.style.left }));
    ok("青蛙：轉直式後重排（起點在中間）", rot.portrait && rot.frogLeft === "50%", JSON.stringify(rot));
    await p.setViewportSize({ width: 1180, height: 820 }); await sleep(400);
    // 把這題跳完
    for (let s = 0; s < 4 && await p.evaluate(() => window.__zy.fq.step < window.__zy.fq.k); s++) { await tapPad(p, true); await sleep(950); }
    await p.waitForFunction(() => window.__zy.results[0], null, { timeout: 4000 });
    const r0 = await p.evaluate(() => ({ res: window.__zy.results[0], word: !!document.querySelector("#river .fword .zy"), bloom: document.querySelectorAll("#river .pad.bloom").length }));
    ok("青蛙：跳到石頭＝揭曉、2 音節錯 1 次＝銀星", r0.word && r0.res === "silver" && r0.bloom === f0.k, JSON.stringify(r0));
    await p.waitForFunction(() => window.__zy.idx === 1, null, { timeout: 4000 }); await sleep(300);
    // 第 2 題全對 → 第 3 題時回選單 → 應該能「繼續玩」
    ok("青蛙：第 2 題起 3 片荷葉", await p.evaluate(() => window.__zy.fq.cols.length === 3));
    for (let s = 0; s < 4 && await p.evaluate(() => window.__zy.fq.step < window.__zy.fq.k); s++) { await tapPad(p, true); await sleep(950); }
    await p.waitForFunction(() => window.__zy.idx === 2, null, { timeout: 5000 }); await sleep(300);
    // 跳到一半按回小島
    await tapPad(p, true); await sleep(100);
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(1500);
    const st = await p.evaluate(() => ({ menu: !document.getElementById("menu").classList.contains("hidden"), mode: window.__zy.mode, resume: document.getElementById("resumeBtn").textContent, hidden: document.getElementById("resumeBtn").classList.contains("hidden") }));
    ok("青蛙：跳到一半回小島＝乾淨回選單", st.menu && st.mode === null, JSON.stringify(st));
    ok("青蛙：選單出現「繼續玩」第 3 題", !st.hidden && st.resume.includes("3/5"), st.resume);
    await p.evaluate(() => document.getElementById("resumeBtn").click());
    await p.waitForFunction(() => window.__zy.mode === "frog", null, { timeout: 5000 }); await sleep(400);
    ok("青蛙：繼續玩從第 3 題接著", await p.evaluate(() => window.__zy.idx === 2 && window.__zy.results[0] === "silver" && window.__zy.results[1] === "gold"));
    // 櫻木 10-10：難度表、聲調陷阱、跳錯鎖定
    ok("青蛙：5 題難度＝1,1,2,2,3", await p.evaluate(() => window.__zy.round.map(q => q.level).join() === "1,1,2,2,3"));
    const trap = await p.evaluate(() => { const z = window.__zy, bad = []; const P = s => z.renderZ ? s : s;
      for (let k = 0; k < 300; k++) {
        const a = z.zToStr(z.toneVariant([{ sym: "ㄌㄠ", tone: 2 }, { sym: "ㄏㄨ", tone: 2 }], [], k % 2 === 0)); if (a === "ㄌㄠˊ ㄏㄨˇ") bad.push(a);
        const b = z.toneVariant([{ sym: "ㄊㄠ", tone: 1 }, { sym: "ㄗ", tone: 4 }], [], k % 2 === 0); if (b[1].tone !== 4) bad.push(z.zToStr(b));
        const d = z.pickDistractors("ㄌㄠˇ", 3, 2, ["ㄌㄠˇ", "ㄏㄨˇ", "ㄌㄠˊ"]); if (d.includes("ㄌㄠˊ")) bad.push("frog:" + d.join("/"));
      } return bad.slice(0, 5); });
    ok("聲調假牌不碰三聲變調（老虎）與輕聲（桃子）", trap.length === 0, trap.join(" "));
    for (const m of ["frog"]) ok(`注音：${m} 畫面沒有漏加注音的國字`, (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    ok("注音：讀音字典沒有缺字", (await p.evaluate(() => [...window.__zy.zMissing])).length === 0, (await p.evaluate(() => [...window.__zy.zMissing])).join(""));
    ok("青蛙：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join("\n")); console.log(results.filter(r => r.startsWith("FAIL")).length ? "SOME FAILED" : "ALL PASS");
})().catch(e => { console.log(results.join("\n")); console.error("FATAL", e.message); process.exit(1); });
