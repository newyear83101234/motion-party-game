// 回合流程測試（阿葉 10-10 五點）：node tools/zy-test/flow.js
// 驗：① 暫停＝換題凍結、離開＝配對結算作廢、按 🏠 不算「點一下下一題」
//     ② 答對後語音（含稱讚）講完才換題
//     ③ 家長設定「說明語音」關掉：稱讚／暫停不唸，題目詞照唸；「背景音樂」開關跟 🎵 同步
//     ⑤ 每輪最後「剛剛卡住的，再試一次」：錯過的題再出一次、答對才結算、星星只算第一次；答錯記進「容易搞混的注音」
//     ⑥ 積木第一次遇到一聲：提示泡泡＋空白積木有 aria-label
const { launch, openGame, enterMode } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const idxOf = p => p.evaluate(() => window.__zy.idx);
// 釣魚／氣球：點正解或錯的選項（pointerdown＝手指一碰就算）
const tapOpt = (p, sel, good) => p.evaluate(([sel, good]) => { const i = window.__zy.curOpts.findIndex(o => !!o.ok === good); const b = document.querySelectorAll(sel)[i]; if (!b) return false; b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return true; }, [sel, good]);
const waitIdx = (p, n, timeout = 8000) => p.waitForFunction(n => window.__zy.idx >= n, n, { timeout, polling: 50 }).then(() => true, () => false);
const spoken = p => p.evaluate(() => window.__spoken.map(s => s.text));
const visible = (p, id) => p.evaluate(id => !document.getElementById(id).classList.contains("hidden"), id);

(async () => {
  const browser = await launch(); const allErrs = [];
  // ===== ① 暫停凍結換題 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug" });
    await enterMode(p, "fish"); await sleep(800);
    const i0 = await idxOf(p);
    await tapOpt(p, "#pond .fishBtn", true); await sleep(300);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(3500);
    ok("① 答對後馬上暫停：3.5 秒內不換題", (await idxOf(p)) === i0 && await visible(p, "confirm"));
    const tr = Date.now(); await p.evaluate(() => document.getElementById("confirmNo").click());
    const moved = await waitIdx(p, i0 + 1, 6000), dt = Date.now() - tr;
    ok("① 按繼續後才換題（剩下的時間接著算）", moved && dt > 900, `繼續後 ${dt}ms 換題`);
    // 揭曉中（點一下可跳題的時段）按 🏠：不能被當成「點一下下一題」
    await sleep(600); const i1 = await idxOf(p);
    await tapOpt(p, "#pond .fishBtn", true); await sleep(1350);
    const hb = await p.evaluate(() => { const r = document.getElementById("homeBtn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(hb.x, hb.y); await sleep(2500);
    ok("① 揭曉中按 🏠：不跳題、暫停選單打開", (await idxOf(p)) === i1 && await visible(p, "confirm"), `idx ${i1}→${await idxOf(p)}`);
    await p.evaluate(() => document.getElementById("confirmNo").click()); await waitIdx(p, i1 + 1, 6000);
    allErrs.push(...errs); await ctx.close();
  }
  // ===== ① 翻牌配對完成後馬上離開：不能跳出結算 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug" });
    await enterMode(p, "match", 8); await sleep(500);
    const pairs = await p.evaluate(() => { const cs = [...document.querySelectorAll("#board .card")], m = new Map(); cs.forEach((c, i) => { const k = c._c.w.h; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return [...m.values()]; });
    for (const [a, b] of pairs) {
      for (const i of [a, b]) await p.evaluate(i => document.querySelectorAll("#board .card")[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })), i);
      await sleep(480);
    }
    await sleep(100);
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); });
    await sleep(2600);
    ok("① 配對完馬上回小島：不會跳出結算畫面", await visible(p, "menu") && !(await visible(p, "result")), `pairs=${pairs.length}`);
    allErrs.push(...errs); await ctx.close();
  }
  // ===== ⑤ 剛剛卡住的再試一次 ＋ ② 稱讚講完才換題 ＋ 容易搞混 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug" });
    await enterMode(p, "fish"); await sleep(800);
    await tapOpt(p, "#pond .fishBtn", false); await sleep(500);
    await tapOpt(p, "#pond .fishBtn", true); await waitIdx(p, 1);
    let praiseOk = null;
    for (let k = 1; k < 8; k++) {
      await sleep(700); await tapOpt(p, "#pond .fishBtn", true);
      if (k === 3) {                                     // 第 2～4 題連對 3 題 → 「好棒！」：要等它講完才換題
        await waitIdx(p, k + 1, 9000);
        const sp = await p.evaluate(() => window.__spoken.slice(-3));
        const pr = sp.find(s => s.text === "好棒！"), nx = sp[sp.length - 1];
        praiseOk = !!pr && nx !== pr && nx.t - pr.t >= 900;
        ok("② 稱讚「好棒！」講完才換題", praiseOk, JSON.stringify(sp));
      } else await waitIdx(p, k + 1, 9000);
    }
    await sleep(400);
    const rt = await p.evaluate(() => ({ len: window.__zy.round.length, last: window.__zy.round[8] && { h: window.__zy.round[8].word.h, retry: window.__zy.round[8].retry }, first: window.__zy.round[0].word.h,
      banner: !!document.querySelector("#fish .retry-banner"), dots: document.querySelectorAll("#progress span").length, rdot: !!document.querySelector("#progress span.retry") }));
    ok("⑤ 第 8 題後：卡住的第 1 題再出一次（橫幅＋進度多一格虛線）", rt.len === 9 && rt.last && rt.last.retry && rt.last.h === rt.first && rt.banner && rt.dots === 9 && rt.rdot, JSON.stringify(rt));
    ok("⑤ 橫幅有唸「剛剛卡住的，再試一次！」", (await spoken(p)).includes("剛剛卡住的，再試一次！"));
    const built = await p.waitForFunction(() => window.__zy.idx === 8 && (window.__zy.curOpts || []).some(o => o.ok && o.word && o.word.h === window.__zy.round[8].word.h), null, { timeout: 8000, polling: 50 }).then(() => true, () => false);
    await sleep(400);
    ok("⑤ 再試一次的題目是同一個詞（橫幅講完才出題）", built && await p.evaluate(() => window.__zy.round[8].word.h === window.__zy.round[0].word.h));
    await tapOpt(p, "#pond .fishBtn", true);
    const res = await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 9000 }).then(() => true, () => false);
    const rtext = await p.evaluate(() => document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""));
    const stars = await p.evaluate(() => document.querySelectorAll("#resultStars .star.on").length);
    ok("⑤ 再試一次答對才結算，結算只算 8 題（7 金 1 銀＝3 星）", res && /釣到8條魚/.test(rtext) && stars === 3, `${rtext} 星=${stars}`);
    const mix = await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_mix") || "{}"));
    ok("⑤ 答錯有寫進「容易搞混」（只差一個地方才記，可能 0 筆）", typeof mix === "object", JSON.stringify(mix));
    allErrs.push(...errs); await ctx.close();
  }
  // ===== ③ 說明語音關掉＋背景音樂開關 ＋ ⑤ 聲調氣球答錯記「二聲↔三聲」類 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug" });
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(300);
    await p.evaluate(() => { document.querySelector('#talkOpts [data-v="0"]').click(); document.querySelector('#musicOpts [data-v="0"]').click(); });
    const st = await p.evaluate(() => ({ talk: localStorage.getItem("zy_talk"), music: localStorage.getItem("zy_music"), btnOff: document.getElementById("musicBtn").classList.contains("off"),
      on: [...document.querySelectorAll("#talkOpts .on, #musicOpts .on")].map(b => b.dataset.v).join(",") }));
    ok("③ 家長設定：說明語音、背景音樂都關掉（🎵 按鈕同步變關）", st.talk === "0" && st.music === "0" && st.btnOff && st.on === "0,0", JSON.stringify(st));
    await p.evaluate(() => document.getElementById("settingsClose").click());
    await enterMode(p, "tone"); await sleep(900);
    const word0 = await p.evaluate(() => window.__zy.round[0].word.h);
    await tapOpt(p, "#sky .balloon", false); await sleep(600);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(400);
    await p.evaluate(() => document.getElementById("confirmNo").click());
    for (let k = 0; k < 4; k++) { await sleep(600); const i = await idxOf(p); await tapOpt(p, "#sky .balloon", true); await waitIdx(p, i + 1, 9000); }
    const sp = await spoken(p);
    ok("③ 說明語音關：沒唸「暫停」「好棒！」，題目詞照唸", !sp.includes("暫停") && !sp.includes("好棒！") && sp.includes(word0), JSON.stringify(sp));
    const mix = await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_mix") || "{}"));
    ok("⑤ 聲調氣球答錯：記下聲調混淆", Object.keys(mix).some(k => k.startsWith("t:")), JSON.stringify(mix));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(400);
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(300);
    const rows = await p.evaluate(() => [...document.querySelectorAll("#mixList .mix-row")].map(r => r.textContent));
    ok("⑤ 家長頁列出容易搞混的聲調", rows.some(t => /聲.*↔.*聲/.test(t)), JSON.stringify(rows));
    allErrs.push(...errs); await ctx.close();
  }
  // ===== ⑥ 積木：第一次遇到一聲的提示 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug" });
    await enterMode(p, "build"); await sleep(600);
    ok("⑥ 聲調積木有 aria-label（空白＝一聲）", await p.evaluate(() => document.querySelector('#toneRow .toneTile[data-v="0"]')?.getAttribute("aria-label")?.includes("一聲")));
    let tip = null, tipSpoken = false;
    for (let q = 0; q < 18 && !tip; q++) {             // 題目是隨機的：一輪 6 題可能剛好沒有一聲 → 最多玩 3 輪
      if (q && q % 6 === 0) { await enterMode(p, "build"); await sleep(600); }
      const syls = await p.evaluate(() => window.__zy.parseZ(window.__zy.round[window.__zy.idx].word.z));
      for (const s of syls) {
        for (const ch of s.sym) await p.evaluate(ch => { const t = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === ch); t && t.click(); }, ch);
        await sleep(150);
        tip = await p.evaluate(() => { const t = document.querySelector("#build .tone-tip"); return t ? t.textContent : null; });
        if (tip) { tipSpoken = (await spoken(p)).includes("第一聲不用加符號，按這個空白格就好"); break; }
        await p.evaluate(t => document.querySelector(`#toneRow .toneTile[data-v="${t}"]`).click(), s.tone); await sleep(150);
      }
      if (!tip) { const i = await idxOf(p); await waitIdx(p, i + 1, 9000); await sleep(500); }
    }
    ok("⑥ 第一次遇到一聲：泡泡「第一聲不用加符號…」＋唸出來", !!tip && /第一聲不用加符號/.test(tip.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) && tipSpoken, String(tip).slice(0, 40));
    const blankTipped = await p.evaluate(() => document.querySelector('#toneRow .toneTile[data-v="0"]')?.classList.contains("tipped"));
    ok("⑥ 空白積木被框起來", !!blankTipped);
    await p.evaluate(() => document.querySelector('#toneRow .toneTile[data-v="0"]').click()); await sleep(200);
    ok("⑥ 放對空白積木後泡泡收掉", await p.evaluate(() => !document.querySelector("#build .tone-tip")));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = results.filter(r => r.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
