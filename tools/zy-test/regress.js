// 注音小島回歸測試：node tools/zy-test/regress.js
// 驗：語音規則（看注音的模式不出聲、聽力模式只唸題目一次、提示按鈕）、閒置／答錯 2 次提示閃、
//     畫面上每個國字都有注音、存檔位切換／備份還原／清除、繼續玩、翻牌 8/12/16/20/24 排版（v6 等級）、魚與氣球標籤不重疊
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 等選項進場動畫（拋光 A9：縮放＋位移，一個接一個）跑完再量位置，不然量到的是動畫中的框（最多等 2 秒；無限循環的漂浮動畫不算）
const settle = p => p.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running" || a.effect.getComputedTiming().endTime === Infinity), null, { timeout: 2000, polling: 50 }).catch(() => {});
const bareHan = p => p.evaluate(() => { const r = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (!/[㐀-鿿]/.test(n.data) || !e || e.closest("script,style,.noann,.zy,.ac,.hidden,textarea")) continue; r.push(n.data.trim().slice(0, 10)); } return r; });
const spoken = p => p.evaluate(() => window.__spoken.map(s => s.text));
const clearSpoken = p => p.evaluate(() => { window.__spoken = []; });
// 點目前題目的正確選項（魚／點餐／尋寶／氣球：DOM 順序＝curOpts 順序）
const SEL = { fish: "#pond .fishBtn", order: "#shelf .item", hunt: "#scene .obj", tone: "#sky .balloon" };
// 選項改成手指一碰（pointerdown）就判定（拋光 A2）→ 測試也派 PointerEvent，不用 element.click()
const answer = (p, m, right) => p.evaluate(({ m, right, sel }) => { const o = window.__zy.curOpts; const i = o.findIndex(x => !!x.ok === right); document.querySelectorAll(sel)[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); }, { m, right, sel: SEL[m] });
const overlaps = (p, sel) => p.evaluate(sel => { const r = [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect()); let n = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) n++; } return n; }, sel);

(async () => {
  const browser = await launch();
  // ===== 1. 語音規則 ＋ 注音覆蓋（橫式）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 12, query: "debug" });
    ok("選單：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    for (const m of ["order", "hunt"]) {
      await enterMode(p, m); await sleep(1200);
      ok(`${m}：看注音模式開題完全不出聲`, (await spoken(p)).length === 0, (await spoken(p)).join("/"));
      await p.evaluate(() => document.getElementById("speakBtn").click()); await sleep(200);
      const w = await p.evaluate(() => window.__zy.round[window.__zy.idx].word.h);
      ok(`${m}：按提示才唸題目`, (await spoken(p)).some(t => t.includes(w)), (await spoken(p)).join("/"));
      ok(`${m}：沒有漏注音的國字`, (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    }
    for (const m of ["fish", "build", "tone", "whack", "frog"]) {
      await enterMode(p, m); await sleep(1200);
      const w = await p.evaluate(() => window.__zy.round[window.__zy.idx].word.h), s = await spoken(p);
      ok(`${m}：聽力模式開題只唸題目一次`, s.length === 1 && s[0] === w, s.join("/"));
      ok(`${m}：沒有漏注音的國字`, (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    }
    // 答錯 2 次 → 提示閃；按提示 → 正解晃
    await enterMode(p, "fish"); await clearSpoken(p);
    await answer(p, "fish", false); await sleep(450); await answer(p, "fish", false); await sleep(200);
    ok("釣魚：答錯 2 次提示按鈕閃", await p.evaluate(() => document.getElementById("speakBtn").classList.contains("pulse")));
    ok("釣魚：答錯不會自己唸答案", (await spoken(p)).length === 0, (await spoken(p)).join("/"));
    await p.evaluate(() => document.getElementById("speakBtn").click()); await sleep(100);
    ok("釣魚：錯 2 次後按提示＝正解晃一下", await p.evaluate(() => { const i = window.__zy.curOpts.findIndex(o => o.ok); return document.querySelectorAll("#pond .fishBtn")[i].classList.contains("wiggle"); }));
    // 繼續玩：答 2 題 → 回小島 → 繼續＝第 3 題
    await enterMode(p, "fish");
    for (let k = 0; k < 2; k++) { await answer(p, "fish", true); await p.waitForFunction(n => window.__zy.idx === n, k + 1, { timeout: 4000 }); await sleep(200); }
    await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(200);
    ok("暫停選單有三個按鈕", await p.evaluate(() => ["confirmNo", "confirmRestart", "confirmYes"].every(id => document.getElementById(id).offsetParent)));
    ok("暫停選單：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => document.getElementById("confirmYes").click()); await sleep(400);
    const rb = await p.evaluate(() => document.getElementById("resumeBtn").textContent);
    ok("繼續玩按鈕顯示第 3/8 題", rb.includes("3/8"), rb);
    await p.evaluate(() => document.getElementById("resumeBtn").click()); await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 5000 }); await sleep(300);
    ok("繼續玩從第 3 題接著", await p.evaluate(() => window.__zy.idx === 2 && window.__zy.results.filter(Boolean).length === 2));
    // 重新開始
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmRestart").click(); }); await sleep(800);
    ok("重新開始＝從第 1 題", await p.evaluate(() => window.__zy.idx === 0 && window.__zy.results.length === 0));
    // 結算 / 圖鑑 / 設定 / 換人 / 翻牌選張數 的注音
    await enterMode(p, "match", 8);
    await p.evaluate(() => { const cs = [...document.querySelectorAll("#board .card")]; const by = new Map(); for (const c of cs) { const k = c._c.w.h; by.set(k, [...(by.get(k) || []), c]); } window.__pairs = [...by.values()]; });
    for (let i = 0; i < 4; i++) { await p.evaluate(i => { const tap = e => e.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); const [a, b] = window.__pairs[i]; tap(a); tap(b); }, i); await sleep(450); }
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 5000 }); await sleep(1500);
    ok("結算：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    ok("翻牌 8 張全對＝3 星", await p.evaluate(() => document.querySelectorAll("#resultStars .star.on").length === 3));
    await p.evaluate(() => document.getElementById("resultAlbumBtn").click()); await sleep(600);
    ok("圖鑑：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => document.getElementById("albumBack").click()); await sleep(400);
    for (const [btn, name] of [["settingsBtn", "家長設定"], ["playerBtn", "換人玩"]]) {
      await p.evaluate(b => document.getElementById(b).click(), btn); await sleep(300);
      ok(`${name}：沒有漏注音的國字`, (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
      await p.evaluate(() => { for (const id of ["settings", "players"]) document.getElementById(id).classList.add("hidden"); });
    }
    await p.evaluate(() => { window.__zy.setLv("match", 1); document.querySelector(".mode-card[data-mode=match]").click(); }); await sleep(800);   // v6：張數改由等級決定，點卡片直接開始（不再跳選張數）
    ok("翻牌：點卡片直接開始（Lv1＝8 張）", await p.evaluate(() => !document.getElementById("match").classList.contains("hidden") && document.getElementById("matchPick").classList.contains("hidden") && document.querySelectorAll("#board .card").length === 8));
    ok("翻牌畫面：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(300);
    ok("讀音字典沒有缺字", (await p.evaluate(() => [...window.__zy.zMissing])).length === 0, (await p.evaluate(() => [...window.__zy.zMissing])).join(""));
    ok("沒有錯誤（語音／注音段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 閒置提示（設成 1 秒方便測）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    await p.evaluate(() => localStorage.setItem("zy_hint_wait", "1")); await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"));
    await enterMode(p, "order"); await clearSpoken(p); await sleep(1600);
    ok("閒置：提示按鈕閃、但不出聲", await p.evaluate(() => document.getElementById("speakBtn").classList.contains("pulse")) && (await spoken(p)).length === 0, (await spoken(p)).join("/"));
    await ctx.close();
  }
  // ===== 3. 存檔位 / 備份 / 清除 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 7, query: "debug" });
    const cnt = () => p.evaluate(() => document.getElementById("menuStickers").textContent);
    ok("存檔 1：40 張貼紙", (await cnt()) === "40");
    await p.evaluate(() => document.getElementById("playerBtn").click()); await sleep(200);
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[1].click()); await sleep(400);
    ok("換到存檔 2（小兔）：0 張、按鈕變 🐰", (await cnt()) === "0" && (await p.evaluate(() => document.getElementById("playerBtn").textContent)) === "🐰");
    await p.evaluate(() => document.getElementById("playerBtn").click()); await sleep(200);
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[0].click()); await sleep(400);
    ok("換回存檔 1：40 張還在", (await cnt()) === "40");
    // 備份 → 清除（按兩次）→ 還原
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(200);
    await p.evaluate(() => document.getElementById("backupBtn").click()); await sleep(200);
    const code = await p.evaluate(() => document.getElementById("saveCode").value);
    ok("備份碼產生（ZY2: 開頭＝三位一起，B6）", code.startsWith("ZY2:"), code.slice(0, 12) + "…");
    await p.evaluate(() => document.getElementById("resetBtn").click()); await sleep(100);
    ok("清除按第 1 次只是警告", (await cnt()) === "40" && await p.evaluate(() => document.getElementById("resetBtn").classList.contains("armed")));
    await p.evaluate(() => document.getElementById("resetBtn").click()); await sleep(200);
    ok("清除按第 2 次＝清掉", (await cnt()) === "0");
    await p.evaluate(c => { const ta = document.getElementById("saveCode"); ta.classList.remove("hidden"); ta.value = c; document.getElementById("restoreBtn").click(); document.getElementById("restoreBtn").click(); }, code); await sleep(200);   // ZY2：第 1 下說明會蓋掉哪幾位、第 2 下才還原
    ok("貼備份碼還原＝40 張、7 顆星", (await cnt()) === "40" && (await p.evaluate(() => localStorage.getItem("zy1_stars"))) === "7");
    await p.evaluate(c => { const ta = document.getElementById("saveCode"); ta.value = "亂打的"; document.getElementById("restoreBtn").click(); }); await sleep(100);
    ok("亂打的備份碼＝拒絕、存檔不變", (await cnt()) === "40" && (await p.evaluate(() => document.getElementById("saveMsg").textContent)).includes("❌"));
    // 舊版存檔搬家
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem("zy_stickers", JSON.stringify({ "貓": 1, "狗": 1 })); localStorage.setItem("zy_stars", "9"); });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"));
    ok("舊版存檔自動搬進存檔 1", (await cnt()) === "2" && (await p.evaluate(() => localStorage.getItem("zy1_stars"))) === "9");
    ok("搬完舊鍵刪掉、留 zy_legacy_bak", await p.evaluate(() => localStorage.getItem("zy_stars") === null && !!localStorage.getItem("zy_legacy_bak")));
    // 里維 #1：清除重來 → 重新整理 → 舊進度不能復活
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.getElementById("resetBtn").click(); document.getElementById("resetBtn").click(); });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"));
    ok("清除重來後重新整理＝還是 0 張（舊資料不復活）", (await cnt()) === "0");
    // 里維 #4／#11：備份碼夾換行仍可還原；不在詞庫的詞與超大星星數被擋
    const evil = "ZY1:" + Buffer.from(JSON.stringify({ v: 1, s: ["貓", "狗", "假詞", "<b>"], st: 5e12, eg: 99 })).toString("base64");
    const wrapped = evil.slice(0, 10) + "\n " + evil.slice(10);
    await p.evaluate(c => { document.getElementById("settingsBtn").click(); const ta = document.getElementById("saveCode"); ta.classList.remove("hidden"); ta.value = c; document.getElementById("restoreBtn").click(); }, wrapped); await sleep(200);
    const ev = await p.evaluate(() => ({ st: JSON.parse(localStorage.getItem("zy1_stickers")), stars: +localStorage.getItem("zy1_stars"), eggs: +localStorage.getItem("zy1_eggs"), msg: document.getElementById("saveMsg").textContent }));
    ok("備份碼夾換行可還原、只收詞庫的詞、星星有上限", Object.keys(ev.st).join() === "貓,狗" && ev.stars === 99999 && ev.eggs <= 8 && ev.msg.includes("✅"), JSON.stringify(ev));
    ok("沒有錯誤（存檔段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4. 排版：翻牌 8/12/16/20/24（v6 等級 Lv1–5）排滿、不超出畫面；魚／氣球標籤不重疊（橫、直、4:3）=====
  for (const [W, H, tag] of [[1180, 820, "橫"], [820, 1180, "直"], [1024, 768, "4:3"]]) {
    const { ctx, p, errs } = await openGame(browser, { w: W, h: H, stickers: 40, query: "debug" });
    for (const n of [8, 12, 16, 20, 24]) {
      await enterMode(p, "match", n); await settle(p);
      const r = await p.evaluate(() => { const cs = [...document.querySelectorAll("#board .card")].map(c => c.getBoundingClientRect()); const rows = new Map(); for (const b of cs) rows.set(Math.round(b.top), (rows.get(Math.round(b.top)) || 0) + 1);
        return { n: cs.length, rows: [...rows.values()], inside: cs.every(b => b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1), han: document.querySelectorAll("#board .card .han").length, w: Math.round(cs[0].width) }; });
      ok(`${tag} 翻牌 ${n}：張數對、每列排滿、都在畫面內、圖卡沒國字`, r.n === n && new Set(r.rows).size === 1 && r.inside && r.han === 0, JSON.stringify(r));
    }
    for (const [m, sel] of [["fish", "#pond .zlabel"], ["tone", "#sky .zlabel"]]) {
      let worst = 0; for (let k = 0; k < 3; k++) { await enterMode(p, m); await settle(p); worst = Math.max(worst, await overlaps(p, sel)); }
      ok(`${tag} ${m}：注音標籤互不重疊（抽 3 題）`, worst === 0, "重疊對數 " + worst);
    }
    ok(`${tag} 沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n")); const f = out.filter(r => r.startsWith("FAIL")).length; console.log(f ? `${f} FAILED / ${out.length}` : `ALL PASS (${out.length})`);
})().catch(e => { console.log(out.join("\n")); console.error("FATAL", e.message); process.exit(1); });
