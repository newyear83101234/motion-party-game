// v7 寵物進化測試：node tools/zy-test/evolve.js（ZY_URL 指到本機伺服器；EVO_SHOTS=資料夾 → 順便存截圖）
// 驗：能量滿 → 選單「✨ 進化！」膠囊、貓頭鷹「小象好像要進化了！」、3D 小島那隻在路上走＋頭上 ✨；
//     點了 → 演出（暗場→蓄力→浮起→旋轉→剪影→字幕「小象進化——」→白光 7.9 秒左右→亮相＋「閃耀小象！」→太棒了）、四個音效鍵都有叫、
//     關掉 → 存檔 done／seen、膠囊收起來、小島上那隻變進化型（1.15×1.15 倍、光環、星星、加亮）；
//     第二次（seen）→ 點一下跳過直接爆開；減少動態 → calm、不轉；
//     能量來源：第 3 級 3 星＋今天第一次餵點心＝+15（結算膠囊）、暖身局不算、爬塔新樓層／守塔怪（接點）；
//     圖鑑：能量條（夥伴 40/100）、進化卡（金色、閃耀小象、徽記）、家長頁有規則與能量；備份碼帶 evo
const path = require("path"), fs = require("fs");
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (n, c, i = "") => { const l = `${c ? "PASS" : "FAIL"}  ${n}${i !== "" ? "  — " + i : ""}`; out.push(l); if (process.env.EVO_LIVE) console.log(l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.EVO_SHOTS || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + ".png") }); };
const rw = p => p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rewards") || "null"));
const base = (extra = {}) => ({
  pets: { bear: { stage: 2, t: 30 }, bunny: { stage: 2, t: 30 }, cat: { stage: 3, t: 120 }, fox: { stage: 2, t: 30 }, elephant: { stage: 3, t: 130 }, dino: { stage: 3, t: 140 } },
  partner: "elephant", coins: 0, gold: 0, jarCoins: 0, treats: 0, decor: [], stamps: 0, stampDay: "", pity: { rare: 0, ssr: 0 }, catBonus: [], pulls: 0, closet: ["hat", "bow"], wear: {},
  evo: { e: { elephant: 100, cat: 40 }, done: [], day: "", tb: -1, seen: 0 }, ...extra });
// 換存檔內容 → 重新整理 → 開始畫面 → 選單
async function seed(p, rewards) {
  await p.evaluate(r => localStorage.setItem("zy1_rewards", JSON.stringify(r)), rewards);
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await p.evaluate(() => { window.__spoken = []; window.__sfx = []; });
  await sleep(400);
}
const phaseOf = p => p.evaluate(() => { const o = document.querySelector(".evo-ov"); return o ? o.dataset.phase : null; });
const waitPhase = (p, ph, ms = 15000) => p.waitForFunction(ph => { const o = document.querySelector(".evo-ov"); return o && o.dataset.phase === ph; }, ph, { timeout: ms, polling: 30 }).then(() => true, () => false);

(async () => {
  const browser = await launch(); const allErrs = [];
  // ======== 1. 第一次進化（完整演出）：橫式 1180×820 ========
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 60, stars: 0, query: "debug" });
    await seed(p, base());
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).catch(() => {});
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.evo("elephant") && window.__hub3d.evo("elephant").tag, null, { timeout: 25000 }).catch(() => {});
    const btn = await p.evaluate(() => { const b = document.getElementById("evoBtn"); return { shown: !b.classList.contains("hidden"), pet: b.dataset.pet, img: b.querySelector("img").getAttribute("src") }; });
    ok("能量滿：選單出現「✨ 進化！」膠囊（小象）", btn.shown && btn.pet === "elephant" && /elephant\.webp$/.test(btn.img), JSON.stringify(btn));
    await p.waitForFunction(() => /小象好像要進化了/.test(document.getElementById("guideText").textContent), null, { timeout: 4000 }).catch(() => {});
    ok("貓頭鷹提醒「小象好像要進化了！」（字＋語音）", await p.evaluate(() => /小象好像要進化了/.test(document.getElementById("guideText").textContent) && window.__spoken.some(s => s.text === "小象好像要進化了！")), await p.evaluate(() => document.getElementById("guideText").textContent));
    const h0 = await p.evaluate(() => window.__hub3d.evo("elephant"));
    ok("3D 小島：小象 ready、在路上走、頭上有 ✨、還不是進化型（超級 1.15）", h0 && h0.ready && h0.walking && h0.visible && !!h0.tag && !h0.evo && Math.abs(h0.scale - 1.15) < 0.01 && !h0.fx, JSON.stringify(h0));
    ok("3D 小島：其他（沒滿的）沒有 ✨", await p.evaluate(() => { const c = window.__hub3d.evo("cat"); return c && !c.ready && !c.tag; }));
    await shot(p, "0-menu-ready");
    // 點小島上的小象＝看進化（跟點 ✨ 一樣）
    await p.evaluate(() => window.__hub3d.tapPet("elephant"));
    const ovUp = await p.waitForFunction(() => document.querySelector(".evo-ov"), null, { timeout: 5000 }).then(() => true, () => false);
    ok("點小島上能量滿的寵物＝開始進化演出", ovUp);
    ok("演出一開始就存檔（已進化、能量清掉）", await rw(p).then(r => r.evo.done.includes("elephant") && !("elephant" in r.evo.e)));
    const t0 = Date.now(), seen = [];
    const track = async (ph, after, name) => { const got = await waitPhase(p, ph); seen.push(ph + "@" + ((Date.now() - t0) / 1000).toFixed(1)); if (after) await sleep(after); if (name) await shot(p, name); return got; };
    await track("charge"); await track("rise", 700, "1-charge");
    ok("旋轉中（rotateY 在變）", await track("spin", 900) && await p.evaluate(async () => { const a = document.querySelector(".evo-pet").style.transform; await new Promise(r => setTimeout(r, 120)); return a !== document.querySelector(".evo-pet").style.transform && /rotateY/.test(a); }));
    await track("sil", 1300, "2-spin-silhouette");
    ok("字幕「小象進化——」出現＋配音", await p.evaluate(() => { const c = document.querySelector(".evo-cap"); return c.classList.contains("on") && c.textContent === "小象進化——" && window.__spoken.some(s => s.text === "小象進化——"); }));
    ok("剪影：發光的白色剪影疊上來", await p.evaluate(() => document.querySelector(".evo-pet").classList.contains("sil") && getComputedStyle(document.querySelector(".evo-sil")).opacity > 0.5));
    await waitPhase(p, "burst"); seen.push("burst@" + ((Date.now() - t0) / 1000).toFixed(1)); await sleep(120); await shot(p, "3-white-burst");
    ok("白光爆開（flash 亮著）", await p.evaluate(() => +getComputedStyle(document.querySelector(".evo-flash")).opacity > 0.6), await p.evaluate(() => getComputedStyle(document.querySelector(".evo-flash")).opacity));
    await track("reveal", 1300, "4-reveal");
    ok("亮相：新外型＋徽記＋橫幅「閃耀小象！」＋配音", await p.evaluate(() => document.querySelector(".evo-pet").classList.contains("new") && document.querySelector(".evo-banner").classList.contains("on") && document.querySelector(".evo-banner").textContent === "閃耀小象！" && window.__spoken.some(s => s.text === "閃耀小象！")));
    await track("done", 500, "4b-done");
    const sfx = await p.evaluate(() => (window.__sfx || []).map(s => s.name));
    ok("音樂／音效鍵都有叫：evolve、ev_charge、ev_burst、ev_sparkle", ["evolve", "ev_charge", "ev_burst", "ev_sparkle"].every(k => sfx.includes(k)), sfx.filter(n => /^ev/.test(n)).join(","));
    ok("時間軸：暗場→…→done 依序；爆開約在開始後 8 秒（含暗場 0.65 秒＋載入）", seen.join(" ").includes("burst") && /burst@(8|9)\./.test(seen.join(" ")), seen.join(" "));
    ok("第一次：沒有跳過鈕", await p.evaluate(() => !document.querySelector(".evo-skip")));
    await p.evaluate(() => document.querySelector(".evo-ok").click());
    await p.waitForFunction(() => !document.querySelector(".evo-ov"), null, { timeout: 3000 }).catch(() => {});
    ok("按太棒了：演出收掉", await p.evaluate(() => !document.querySelector(".evo-ov") && !window.__zyEvo.busy));
    const r1 = await rw(p);
    ok("存檔：elephant 已進化、seen＝1", r1.evo.done.includes("elephant") && r1.evo.seen === 1, JSON.stringify(r1.evo));
    ok("膠囊收起來（沒有別隻滿）", await p.evaluate(() => document.getElementById("evoBtn").classList.contains("hidden")));
    await p.waitForFunction(() => { const e = window.__hub3d.evo("elephant"); return e && e.evo && e.fx; }, null, { timeout: 8000 }).catch(() => {});
    const h1 = await p.evaluate(() => window.__hub3d.evo("elephant"));
    ok("3D 小島：小象變進化型（1.15×1.15≈1.32 倍、光環／星星、身體加亮、✨ 拿掉）", h1 && h1.evo && !h1.ready && Math.abs(h1.scale - 1.3225) < 0.01 && h1.fx && h1.bright > 0 && !h1.tag, JSON.stringify(h1));
    if (SHOTS) { await p.evaluate(() => window.__hub3d.petFocus("elephant", 3.4)); await sleep(1500); await shot(p, "5-island-evolved"); }
    ok("3D 小島回來了（有在畫）", await p.evaluate(async () => { const f = window.__hub3d.frames; await new Promise(r => setTimeout(r, 600)); return window.__hub3d.frames > f; }));
    // 圖鑑
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(800);
    await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(900);
    const al = await p.evaluate(() => { const card = id => [...document.querySelectorAll("#albumGrid .pet-card")].find(c => c.querySelector(".pc-img").getAttribute("src").includes("/" + id + ".webp"));
      const e = card("elephant"), c = card("cat"), b = card("bunny");
      return { eEvo: e.classList.contains("evo"), eName: e.querySelector(".pc-n").textContent, eBadge: !!e.querySelector(":scope > .evo-badge"), eStage: e.querySelectorAll(".pc-s")[0].textContent,
        cBar: c.querySelector(".pc-evo-bar b") && c.querySelector(".pc-evo-bar b").textContent, cGoal: !!c.querySelector(".pc-evo-goal img"), bBar: !!b.querySelector(".pc-evo") }; });
    ok("圖鑑：進化卡（金色、閃耀小象、星星徽記、進化・夥伴）", al.eEvo && al.eName === "閃耀小象" && al.eBadge && /進化・夥伴/.test(al.eStage), JSON.stringify(al));
    ok("圖鑑：超級的小貓有能量條 40/100＋進化剪影；長大的小兔沒有", al.cBar === "💫 40/100" && al.cGoal && !al.bBar, JSON.stringify(al));
    await shot(p, "6-album-landscape");
    if (SHOTS) { await p.evaluate(() => [...document.querySelectorAll("#albumGrid .pet-card")].find(c => c.querySelector(".pc-img").getAttribute("src").includes("/elephant.webp")).scrollIntoView({ block: "center" })); await sleep(500); await shot(p, "6b-album-evolved-card"); }
    // 家長頁
    await p.evaluate(() => document.getElementById("albumBack").click()); await sleep(600);
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(400);
    const par = await p.evaluate(() => document.getElementById("rwEvo").textContent);
    ok("家長頁：進化規則（+10／+5／+2／+40）＋已進化：閃耀小象", /\+10/.test(par) && /\+5/.test(par) && /\+2/.test(par) && /\+40/.test(par) && /已進化：閃耀小象/.test(par), par.slice(0, 80) + "…");
    const code = await p.evaluate(() => { const c = window.__zyB.exportCode(); const d = window.__zyB.readCode(c); return d && d.slots[0] && d.slots[0].rewards && d.slots[0].rewards.evo; });
    ok("備份碼帶 evo（讀回來 done 有小象）", code && code.done.includes("elephant") && code.seen === 1, JSON.stringify(code));
    await p.evaluate(() => document.getElementById("settingsClose").click());
    // ======== 2. 能量來源：第 3 級 3 星＋今天第一次餵點心 ========
    await seed(p, base({ partner: "cat", evo: { e: { cat: 40 }, done: ["elephant"], day: "", tb: -1, seen: 1 } }));
    await enterMode(p, "tone", { lv: 3 }); await sleep(600);
    for (let k = 0; k < 10; k++) {
      if (await p.evaluate(() => !document.getElementById("result").classList.contains("hidden"))) break;
      await p.evaluate(() => { const i = window.__zy.curOpts.findIndex(o => o.ok); const b = document.querySelectorAll("#sky .balloon")[i]; if (b) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); });
      await p.waitForFunction(k => window.__zy.idx > k || !document.getElementById("result").classList.contains("hidden"), k, { timeout: 9000 }).catch(() => {}); await sleep(450);
    }
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 9000 }).catch(() => {});
    await sleep(400); await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(900);
    const strip = (await p.evaluate(() => document.querySelector(".rw-strip")?.textContent || "")).replace(/\s/g, "");
    const r2 = await rw(p);
    ok("第 3 級 3 星＋今天第一次餵點心：能量 40 → 55、結算膠囊「進化能量 +15」", r2.evo.e.cat === 55 && /進化能量\+15/.test(strip), `${r2.evo.e.cat} ${strip}`);
    // 爬塔接點：第一次對＝只記樓層；之後新樓層每層 +2；第一次打倒守塔怪 +40
    const tw = await p.evaluate(() => {
      localStorage.setItem("zy1_tower", JSON.stringify({ best: 7 }));
      const E = window.__zyEvo, R = () => JSON.parse(localStorage.getItem("zy1_rewards")).evo;
      E.towerStore({ best: 7 }); const a = { ...R() };
      E.towerStore({ best: 10 }); localStorage.setItem("zy1_tower", JSON.stringify({ best: 10 })); const b = R();
      E.towerGive({ coins: 1 }); const c = R();
      E.towerStore({ best: 10 }); const d = R();
      return { tb0: a.tb, e0: a.e.cat, tb1: b.tb, e1: b.e.cat, e2: c.e.cat, e3: d.e.cat };
    });
    ok("爬塔：第一次只記樓層（7）；到 10 層 +6；打倒守塔怪 +40；同樓層再存不重複給", tw.tb0 === 7 && tw.e0 === 55 && tw.tb1 === 10 && tw.e1 === 61 && tw.e2 === 100 && tw.e3 === 100, JSON.stringify(tw));
    await p.evaluate(() => { document.getElementById("menuBtn").click(); }); await sleep(900);
    ok("能量滿了（爬塔）回小島：膠囊出現（小貓）", await p.evaluate(() => !document.getElementById("evoBtn").classList.contains("hidden") && document.getElementById("evoBtn").dataset.pet === "cat"));
    // ======== 3. 第二次：可以跳過 ========
    await p.evaluate(() => { window.__sfx = []; document.getElementById("evoBtn").click(); });
    await waitPhase(p, "rise", 6000);
    ok("第二次：有跳過鈕", await p.evaluate(() => !!document.querySelector(".evo-skip")));
    await sleep(500);
    const tSkip = Date.now();
    await p.evaluate(() => document.querySelector(".evo-ov").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })));
    const burstFast = await waitPhase(p, "burst", 1500);
    ok("點一下跳過：馬上白光爆開（<1.5 秒）、data-skipped", burstFast && await p.evaluate(() => document.querySelector(".evo-ov").dataset.skipped === "1"), ((Date.now() - tSkip) / 1000).toFixed(2) + " 秒");
    await waitPhase(p, "done", 6000);
    ok("跳過後照樣亮相「閃耀小貓！」", await p.evaluate(() => document.querySelector(".evo-banner").textContent === "閃耀小貓！"));
    await p.evaluate(() => document.querySelector(".evo-ok").click()); await sleep(600);
    ok("小貓也進化了", (await rw(p)).evo.done.includes("cat"));
    allErrs.push(...errs); await ctx.close();
  }
  // ======== 4. 減少動態＋直式 820×1180 ========
  {
    const ctx0 = null;
    const { ctx, p, errs } = await openGame(browser, { w: 820, h: 1180, stickers: 60, query: "debug" });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await seed(p, base({ evo: { e: { elephant: 100, cat: 40 }, done: ["dino"], day: "", tb: -1, seen: 0 }, partner: "cat" }));
    await sleep(800);
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(800);
    await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(900);
    await shot(p, "7-album-portrait");
    if (SHOTS) { await p.evaluate(() => [...document.querySelectorAll("#albumGrid .pet-card")].find(c => c.querySelector(".pc-img").getAttribute("src").includes("/dino.webp")).scrollIntoView({ block: "center" })); await sleep(500); await shot(p, "7b-album-portrait-ready-evolved"); await p.evaluate(() => document.getElementById("albumGrid").scrollTo(0, 0)); }
    ok("直式圖鑑：滿的那隻（小象，不是夥伴）也有能量條＝「✨ 進化！」", await p.evaluate(() => { const e = [...document.querySelectorAll("#albumGrid .pet-card")].find(c => c.querySelector(".pc-img").getAttribute("src").includes("/elephant.webp")); return e && e.querySelector(".pc-evo.full") && /進化/.test(e.querySelector(".pc-evo-bar b").textContent); }));
    // 從圖鑑點「✨ 進化！」
    await p.evaluate(() => { const e = [...document.querySelectorAll("#albumGrid .pet-card")].find(c => c.querySelector(".pc-img").getAttribute("src").includes("/elephant.webp")); e.querySelector(".pc-evo").click(); });
    const calm = await p.waitForFunction(() => document.querySelector(".evo-ov.calm"), null, { timeout: 5000 }).then(() => true, () => false);
    ok("減少動態：演出是 calm 版", calm);
    await waitPhase(p, "sil", 8000); await sleep(400);
    ok("減少動態：不旋轉（rotateY 0）", await p.evaluate(() => /rotateY\(0(\.0)?deg\)/.test(document.querySelector(".evo-pet").style.transform)), await p.evaluate(() => document.querySelector(".evo-pet").style.transform));
    await shot(p, "8-calm-portrait-sil");
    await waitPhase(p, "reveal", 9000); await sleep(1000); await shot(p, "9-calm-portrait-reveal");
    await waitPhase(p, "done", 5000);
    await p.evaluate(() => document.querySelector(".evo-ok").click()); await sleep(900);
    ok("從圖鑑進化完：回到圖鑑、小象是進化卡", await p.evaluate(() => !document.getElementById("album").classList.contains("hidden") && [...document.querySelectorAll("#albumGrid .pet-card.evo")].some(c => c.querySelector(".pc-img").getAttribute("src").includes("/elephant.webp"))));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  for (const l of out) console.log(l);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = out.filter(l => l.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${out.length}` : `\nALL PASS (${out.length})`);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
