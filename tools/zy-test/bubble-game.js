// 泡泡救援灣接進主程式的測試：node tools/zy-test/bubble-game.js
// 驗：從選單（3D 小島）進得去、第 1 關一發過關 → 結算「救出 N 隻小企鵝」＋「下一關」、存檔 lv 前進、下一關接著玩、
//     暫停時不能發射、回選單再點＝先選關（過過的有星星、沒到的鎖著）、歸仁區按鈕／小島浮標數、沒有錯誤
const { launch, openGame, enterMode } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vis = (p, id) => p.evaluate(id => !document.getElementById(id).classList.contains("hidden"), id);
// 照引擎算的最好一發打（需要換球就先換）
async function bestFire(p) {
  return p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); if (!b) return null; if (b.swap) g.debug.swap(); g.debug.aim(b.angle); return { fired: g.debug.fire(), b }; });
}
(async () => {
  const browser = await launch(); const allErrs = [];
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    ok("小島上有 10 個遊戲浮標（多了泡泡）", (await p.evaluate(() => document.querySelectorAll(".hub-tag:not(.civic):not(.rb)").length)) === 10);   // .rb＝彩虹島的浮標（10-12）
    ok("🏙️ 歸仁區按鈕在選單上", await vis(p, "townBtn"));
    await enterMode(p, "bubble");
    const ready = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 0, null, { timeout: 15000 }).then(() => true, () => false);
    ok("從選單進得去、是第 1 關", ready && await vis(p, "bubble"));
    ok("泡泡畫面：沒有進度點、有「再聽」", await p.evaluate(() => document.getElementById("progress").classList.contains("hidden") && !document.getElementById("speakBtn").classList.contains("hidden")));
    // 暫停中不能發射
    await sleep(600);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
    const pf = await p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); g.debug.aim(b.angle); return g.debug.fire(); });
    ok("暫停中按發射沒反應", pf === false, String(pf));
    await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(300);
    // 小孩常按住發射口的泡泡往上拉：要算瞄準，不能變成換球（里維 10-11）
    const cc = await p.evaluate(() => { const r = document.querySelector("#bubble .bb-cur").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const c0 = await p.evaluate(() => window.__zy.bubble.state().cur);
    await p.mouse.move(cc[0], cc[1]); await p.mouse.down(); await p.mouse.move(cc[0] - 70, cc[1] - 140, { steps: 6 }); await p.mouse.up(); await sleep(250);
    const c1 = await p.evaluate(() => window.__zy.bubble.state().cur);
    ok("按住發射口的泡泡往上拖＝瞄準（不會換球）", c0 === c1, `${c0} → ${c1}`);
    // 第 1 關：最好的一發
    let shots = 0; while (shots < 6 && !(await vis(p, "result"))) { const r = await bestFire(p); shots++; await sleep(2500); if (!r) break; }
    const res = await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false);
    const rt = await p.evaluate(() => ({ text: document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), stars: document.querySelectorAll("#resultStars .star.on").length, again: document.getElementById("againBtn").textContent, save: JSON.parse(localStorage.getItem("zy1_bubble") || "null") }));
    ok("第 1 關過關 → 結算畫面", res, `發射 ${shots} 次`);
    ok("結算：救出小企鵝、有星星、按鈕是「下一關」", /救出1隻小企鵝/.test(rt.text) && rt.stars >= 1 && rt.again.includes("下一關"), JSON.stringify(rt));
    ok("存檔：下一關＝第 2 關、第 1 關有星星", rt.save && rt.save.lv === 1 && rt.save.stars["0"] >= 1, JSON.stringify(rt.save));
    await sleep(3500);                                  // 等結算演完（按鈕淡入）
    await p.evaluate(() => document.getElementById("againBtn").click());
    const l2 = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 1 && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    ok("按「下一關」→ 第 2 關", l2);
    // 回選單再點泡泡＝先選關
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(600);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click()); await sleep(400);
    const pick = await p.evaluate(() => ({ open: !document.getElementById("bubblePick").classList.contains("hidden"), n: document.querySelectorAll("#bubbleLevels .bb-lv").length,
      openLv: [...document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)")].length, next: document.querySelector("#bubbleLevels .bb-lv.next .n")?.textContent, star1: document.querySelector("#bubbleLevels .bb-lv .s")?.textContent }));
    ok("再點泡泡：先選關（這區 10 關、開了 2 關、下一關＝2、第 1 關有星）", pick.open && pick.n === 10 && pick.openLv === 2 && pick.next === "2" && pick.star1.includes("⭐"), JSON.stringify(pick));
    const tabs0 = await p.evaluate(() => [...document.querySelectorAll("#bubbleZones .bb-ztab")].map(b => ({ t: b.querySelector(".zs").textContent, on: b.classList.contains("on"), locked: b.classList.contains("locked"), img: b.querySelector("img").src.split("/").pop(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })));
    ok("區頁籤（v6 五區）：ㄅㄆㄇ／ㄉㄊㄋㄌ／ㄍㄎㄏ／ㄐㄑㄒ／ㄓㄔㄕㄖ，第 1 區亮著、後四區鎖頭、各自的動物圖、點擊區 ≥ 56px", tabs0.length === 5 && tabs0.map(t => t.t).join("|") === "ㄅㄆㄇ|ㄉㄊㄋㄌ|ㄍㄎㄏ|ㄐㄑㄒ|ㄓㄔㄕㄖ" && tabs0[0].on && !tabs0[0].locked && tabs0.slice(1).every(t => t.locked) && tabs0.map(t => t.img).join() === "cust_penguin.webp,crab.webp,whale.webp,elephant.webp,lion.webp" && tabs0.every(t => t.h >= 56 && t.w >= 56), JSON.stringify(tabs0));
    const tabFit = await p.evaluate(() => { const d = document.querySelector("#bubblePick .dialog").getBoundingClientRect(), ts = [...document.querySelectorAll("#bubbleZones .bb-ztab")].map(b => b.getBoundingClientRect()); return { inside: ts.every(r => r.left >= d.left - 1 && r.right <= d.right + 1), oneRow: new Set(ts.map(r => Math.round(r.top))).size === 1, sym: [...document.querySelectorAll("#bubbleZones .bb-ztab .zs")].every(z => z.scrollWidth <= z.clientWidth + 1) }; });
    ok("區頁籤：5 個排成一排、都在對話框裡、符號字沒有被切到", tabFit.inside && tabFit.oneRow && tabFit.sym, JSON.stringify(tabFit));
    await p.evaluate(() => { window.__spoken = []; document.querySelectorAll("#bubbleZones .bb-ztab")[1].click(); }); await sleep(300);
    const lockHint = await p.evaluate(() => ({ tab: window.__zy.bubbleTab, first: document.querySelector("#bubbleLevels .bb-lv .n").textContent, spoken: (window.__spoken || []).map(x => x.text).join("|"), shake: document.querySelectorAll("#bubbleZones .bb-ztab")[1].classList.contains("shake") }));
    ok("點鎖住的區：不切換、有提示（說話＋晃一下）", lockHint.tab === 0 && lockHint.first === "1" && /先把前面的關卡都過完/.test(lockHint.spoken) && lockHint.shake, JSON.stringify(lockHint));
    await p.evaluate(() => document.querySelectorAll("#bubbleLevels .bb-lv")[0].click());
    const l1 = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 0 && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    ok("選第 1 關可以重玩", l1);
    // 鎖著：貼紙不夠的新存檔
    allErrs.push(...errs); await ctx.close();
  }
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 10, query: "debug" });
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click()); await sleep(500);
    ok("貼紙不夠（10 張）：泡泡進不去", await p.evaluate(() => !document.getElementById("menu").classList.contains("hidden") && document.getElementById("bubble").classList.contains("hidden")));
    ok("歸仁區沒開：按鈕寫「歸仁區 🔒」", (await p.evaluate(() => document.getElementById("townTag").textContent)).includes("🔒"));
    allErrs.push(...errs); await ctx.close();
  }
  // ===== 3 區 30 關：舊存檔升級、第 10 關 → 下一關進第 11 關、分頁切換 =====
  const withSave = async (save, vp) => {
    const o = await openGame(browser, { stickers: 40, query: "debug", w: vp ? vp[0] : 1180, h: vp ? vp[1] : 820 });
    await o.p.evaluate(sv => localStorage.setItem("zy1_bubble", JSON.stringify(sv)), save);
    await o.p.reload(); await o.p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await o.p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(400);
    return o;
  };
  const openPick = async p => { await p.evaluate(() => { window.__spoken = []; document.querySelector(".mode-card[data-mode=bubble]").click(); }); await p.waitForFunction(() => !document.getElementById("bubblePick").classList.contains("hidden"), null, { timeout: 8000 }); await sleep(250); };
  const levelOf = p => p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 }).then(() => p.evaluate(() => window.__zy.bubble.state().level), () => -1);
  const resText = p => p.evaluate(() => document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""));
  const playOut = async (p, max) => { let n = 0; while (n < max && !(await vis(p, "result"))) { const r = await bestFire(p); n++; await sleep(2600); if (!r) break; } await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 10000 }).catch(() => {}); return n; };
  {
    // 舊存檔：只有 10 關、全通（lv=9, all=1）→ 升級後停在第 2 區、第 11 關是「下一關」
    const stars = { 0: 3, 1: 3, 2: 3, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 1, 9: 2 };
    const { ctx, p, errs } = await withSave({ lv: 9, stars, all: 1 });
    await openPick(p);
    const mig = await p.evaluate(() => ({ lv: window.__zy.bubbleSave.lv, all: window.__zy.bubbleSave.all, n: window.__zy.bubbleN }));
    const up = await p.evaluate(() => ({ tab: window.__zy.bubbleTab, tabs: [...document.querySelectorAll("#bubbleZones .bb-ztab")].map(b => (b.classList.contains("on") ? "on" : "") + (b.classList.contains("locked") ? "lock" : "")).join(","),
      nums: [...document.querySelectorAll("#bubbleLevels .bb-lv .n")].map(x => x.textContent).join(","), next: document.querySelector("#bubbleLevels .bb-lv.next .n")?.textContent, open: document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)").length }));
    ok("舊存檔（lv=9、all=1）升級：lv 變 10、清掉 all、共 50 關", mig.lv === 10 && !mig.all && mig.n === 50, JSON.stringify(mig));
    ok("升級後打開選關：自動停在第 2 區（11～20）、第 11 關是黃框「下一關」、其他關鎖著、第 3～5 區鎖著", up.tab === 1 && up.tabs === ",on,lock,lock,lock" && up.nums === "11,12,13,14,15,16,17,18,19,20" && up.next === "11" && up.open === 1, JSON.stringify(up));
    await p.evaluate(() => document.querySelectorAll("#bubbleZones .bb-ztab")[0].click()); await sleep(200);
    const back = await p.evaluate(() => ({ tab: window.__zy.bubbleTab, nums: [...document.querySelectorAll("#bubbleLevels .bb-lv .n")].map(x => x.textContent).join(","), open: document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)").length, stars: document.querySelector("#bubbleLevels .bb-lv .s").textContent }));
    ok("切回第 1 區：1～10 關全開、有星星", back.tab === 0 && back.nums === "1,2,3,4,5,6,7,8,9,10" && back.open === 10 && back.stars.includes("⭐"), JSON.stringify(back));
    await p.evaluate(() => document.querySelectorAll("#bubbleZones .bb-ztab")[1].click()); await sleep(200);
    await p.evaluate(() => document.querySelector("#bubbleLevels .bb-lv.next").click());
    const lv11 = await levelOf(p);
    const z2 = await p.evaluate(() => ({ counts: Object.entries(window.__zy.bubble.state().counts).filter(e => e[1] > 0).map(e => e[0]).join(""), img: document.querySelector(".bb-pen img").src.split("/").pop(), imgOk: document.querySelector(".bb-pen img").naturalWidth > 0 }));
    ok("第 11 關進得去：符號ㄉㄊㄋ、被困的是小螃蟹（圖有載到）", lv11 === 10 && z2.counts === "ㄉㄊㄋ" && z2.img === "crab.webp" && z2.imgOk, JSON.stringify(z2));
    const shots = await playOut(p, 6);
    const rt = await p.evaluate(() => ({ again: document.getElementById("againBtn").textContent, save: JSON.parse(localStorage.getItem("zy1_bubble")) }));
    const txt = await resText(p);
    ok("第 11 關過關：結算寫「救出 1 隻小螃蟹」、存檔 lv 前進到第 12 關", /救出1隻小螃蟹/.test(txt) && rt.again.includes("下一關") && rt.save.lv === 11 && !rt.save.all, JSON.stringify(rt) + " " + txt + " shots " + shots);
    allErrs.push(...errs); await ctx.close();
  }
  {
    // 第 10 關過關 → 「下一關」進第 11 關（跨區）；進度 lv=9
    const { ctx, p, errs } = await withSave({ lv: 9, stars: { 0: 3 } });
    await openPick(p);
    const t = await p.evaluate(() => ({ tab: window.__zy.bubbleTab, tabs: [...document.querySelectorAll("#bubbleZones .bb-ztab")].map(b => b.classList.contains("locked")).join(",") }));
    ok("lv=9（還沒通第 10 關）：停在第 1 區、第 2 區起鎖著", t.tab === 0 && t.tabs === "false,true,true,true,true", JSON.stringify(t));
    await p.evaluate(() => document.querySelectorAll("#bubbleLevels .bb-lv")[9].click());
    const l10 = await levelOf(p);
    const shots = await playOut(p, 14);
    const r10 = await p.evaluate(() => ({ again: document.getElementById("againBtn").textContent, save: JSON.parse(localStorage.getItem("zy1_bubble")) }));
    const txt = await resText(p);
    ok("第 10 關過關：存檔 lv=10（第 2 區解鎖）、按鈕「下一關」、救出小企鵝", l10 === 9 && r10.save.lv === 10 && !r10.save.all && r10.again.includes("下一關") && /小企鵝/.test(txt), JSON.stringify(r10) + " " + txt + " shots " + shots);
    await sleep(3500);
    await p.evaluate(() => document.getElementById("againBtn").click());
    const n11 = await levelOf(p);
    ok("按「下一關」→ 進第 2 區第 1 關（第 11 關）", n11 === 10, String(n11));
    allErrs.push(...errs); await ctx.close();
  }
  {
    // v5 的全通存檔（30 關版 lv=29, all=1）→ v6 升級：lv 變 30、清掉 all、停在第 4 區、第 31 關黃框；第 4 區救小象、天花板有小燈
    const { ctx, p, errs } = await withSave({ lv: 29, stars: { 29: 3 }, all: 1 });
    await openPick(p);
    const mig = await p.evaluate(() => ({ lv: window.__zy.bubbleSave.lv, all: window.__zy.bubbleSave.all }));
    const t = await p.evaluate(() => ({ tab: window.__zy.bubbleTab, tabs: [...document.querySelectorAll("#bubbleZones .bb-ztab")].map(b => (b.classList.contains("on") ? "on" : "") + (b.classList.contains("locked") ? "lock" : "")).join(","), nums: [...document.querySelectorAll("#bubbleLevels .bb-lv .n")].map(x => x.textContent).join(","), next: document.querySelector("#bubbleLevels .bb-lv.next .n")?.textContent, open: document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)").length }));
    ok("v5 全通存檔（lv=29、all=1）升級：lv 變 30、清掉 all", mig.lv === 30 && !mig.all, JSON.stringify(mig));
    ok("升級後選關：停在第 4 區（31～40）、第 31 關黃框、第 5 區鎖著", t.tab === 3 && t.tabs === ",,,on,lock" && t.nums === "31,32,33,34,35,36,37,38,39,40" && t.next === "31" && t.open === 1, JSON.stringify(t));
    await p.evaluate(() => document.querySelectorAll("#bubbleZones .bb-ztab")[2].click()); await sleep(200);
    await p.evaluate(() => document.querySelectorAll("#bubbleLevels .bb-lv")[0].click());
    const l21 = await levelOf(p);
    const z3 = await p.evaluate(() => ({ counts: Object.keys(window.__zy.bubble.state().counts).join(""), img: document.querySelector(".bb-pen img").src.split("/").pop(), lamps: document.querySelectorAll("#bubble .bb-ceil .bb-lamp").length }));
    ok("第 21 關（舊區照玩）：符號ㄍㄎㄏ、被困的是小鯨魚、沒有天花板小燈", l21 === 20 && z3.counts === "ㄍㄎㄏ" && z3.img === "whale.webp" && z3.lamps === 0, JSON.stringify(z3));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(600);
    await openPick(p);
    await p.evaluate(() => document.querySelector("#bubbleLevels .bb-lv.next").click());
    const l31 = await levelOf(p);
    await sleep(1500);
    const z4 = await p.evaluate(() => { const s = window.__zy.bubble.state(); return { counts: Object.keys(s.counts).join(""), drop: s.drop, img: document.querySelector(".bb-pen img").src.split("/").pop(), imgOk: document.querySelector(".bb-pen img").naturalWidth > 0, lamps: document.querySelectorAll("#bubble .bb-ceil .bb-lamp.on").length, spoken: (window.__spoken || []).map(x => x.text).join("|") }; });
    ok("第 31 關：符號ㄐㄑㄒ、救小象（圖有載到）、天花板小燈全亮、貓頭鷹說天花板會降下來", l31 === 30 && z4.counts === "ㄐㄑㄒ" && z4.img === "elephant.webp" && z4.imgOk && z4.drop > 0 && z4.lamps === z4.drop && /天花板會慢慢降下來/.test(z4.spoken), JSON.stringify(z4));
    allErrs.push(...errs); await ctx.close();
  }
  {
    // v6 全通（lv=49, all=1）：停在第 5 區、五區全開、沒有黃框；第 41 關救小獅子、有石頭
    const { ctx, p, errs } = await withSave({ lv: 49, stars: {}, all: 1 });
    await openPick(p);
    const t = await p.evaluate(() => ({ tab: window.__zy.bubbleTab, locked: [...document.querySelectorAll("#bubbleZones .bb-ztab")].filter(b => b.classList.contains("locked")).length, nums: [...document.querySelectorAll("#bubbleLevels .bb-lv .n")].map(x => x.textContent).join(","), next: document.querySelectorAll("#bubbleLevels .bb-lv.next").length, all: window.__zy.bubbleSave.all }));
    ok("v6 全通存檔：停在第 5 區（41～50）、五區都開、沒有黃框、all 保留", t.tab === 4 && t.locked === 0 && t.nums === "41,42,43,44,45,46,47,48,49,50" && t.next === 0 && t.all === 1, JSON.stringify(t));
    await p.evaluate(() => document.querySelectorAll("#bubbleLevels .bb-lv")[0].click());
    const l41 = await levelOf(p);
    const z5 = await p.evaluate(() => ({ stones: window.__zy.bubble.state().stones, img: document.querySelector(".bb-pen img").src.split("/").pop(), stoneEls: document.querySelectorAll("#bubble .bb-stone").length }));
    ok("第 41 關：救小獅子、有石頭泡泡", l41 === 40 && z5.img === "lion.webp" && z5.stones > 0 && z5.stoneEls === z5.stones, JSON.stringify(z5));
    allErrs.push(...errs); await ctx.close();
  }
  {
    // 壞存檔（v5 審查 里維⚠️5）：stars 不是物件、lv 是字串 → 開頁不丟錯、讀進來就清洗、選關畫面正常
    const { ctx, p, errs } = await withSave({ lv: "3", stars: null });
    const sv = await p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.bubbleSave)));
    ok("壞存檔（stars:null、lv:\"3\"）：讀進來就清洗成 { lv:3, stars:{} }", sv.lv === 3 && sv.stars && typeof sv.stars === "object" && !Array.isArray(sv.stars) && Object.keys(sv.stars).length === 0 && !sv.all, JSON.stringify(sv));
    await openPick(p);
    const pk = await p.evaluate(() => ({ n: document.querySelectorAll("#bubbleLevels .bb-lv").length, open: document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)").length, next: document.querySelector("#bubbleLevels .bb-lv.next .n")?.textContent,
      stars: [...document.querySelectorAll("#bubbleLevels .bb-lv .s")].map(x => x.textContent).join(""), tabs: document.querySelectorAll("#bubbleZones .bb-ztab").length }));
    ok("壞存檔：選關畫面正常（5 個分區、10 格、前 4 關開、第 4 關黃框、沒有亂冒星星）", pk.tabs === 5 && pk.n === 10 && pk.open === 4 && pk.next === "4" && !pk.stars.includes("⭐"), JSON.stringify(pk));
    const sv2 = await withSave({ lv: 2, stars: "oops" }).then(async o => { await openPick(o.p); const r = { n: await o.p.evaluate(() => document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)").length), errs: o.errs.slice() }; await o.ctx.close(); return r; });
    ok("壞存檔（stars 是字串）：選關照樣開、前 3 關可玩、沒有錯誤", sv2.n === 3 && sv2.errs.length === 0, JSON.stringify(sv2));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = results.filter(r => r.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
