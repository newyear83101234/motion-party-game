// 選單介面清爽化測試（10-11）：node tools/zy-test/hud.js
// 驗：上方家長按鈕（🏠🎵／🐻換人⚙️）收在「⋯」把手裡——開始玩先展開 4 秒再收、點把手展開、8 秒沒碰自動收回、有在按會重新計時、點別的地方收起、
//     收起來位置照樣佔著（3D 小島避開）、⚙️ 按住 2 秒照樣開、🐻 換人照樣開；遊戲裡 🏠🎵 跟以前一樣（左上 2／16vmin、沒有把手）；
//     貓頭鷹：不出聲的話看字時間＋4 秒收起、點一下馬上收、點探頭彈出來再講一次、唸完 4 秒收、有新的話（guideSay／天氣直接改字）自動彈出；
//     星星罐有幣：整顆膠囊沒有動畫（不放大）、只有幣圖示在跳、星星和數字不動；🏙️ 白底、圖示不晃，有新東西才有 NEW＋輕跳；
//     橫式／直式／手機直式：上方兩排、繼續玩、膠囊、換人小字互不重疊也都在畫面內；沒有錯誤
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&night=0&weather=sunny";
const ready = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 20000 }).then(() => sleep(500), () => {});
// 看得到＝visibility 不是 hidden、opacity > 0.9（收放動畫 0.2 秒，量之前都有等）
const shown = (p, id) => p.evaluate(id => { const e = document.getElementById(id), s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.9; }, id);
const isOpen = (p, side) => p.evaluate(s => document.getElementById("hud" + s).classList.contains("open"), side);
const folded = p => p.evaluate(() => document.getElementById("guide").classList.contains("fold"));
const center = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const FOLD = ["homeBtn", "musicBtn", "playerBtn", "playerTag", "settingsBtn"];

(async () => {
  const browser = await launch();
  // ===== 1. 橫式 iPad：把手收放、閒置自動收、家長鎖、換人 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 64, stars: 47, query: Q });
    const t0 = Date.now();   // 開始玩之後約 0.3 秒
    await sleep(250);
    const tour = await p.evaluate(() => ({ L: document.getElementById("hudL").classList.contains("open"), R: document.getElementById("hudR").classList.contains("open") }));
    ok("開始玩後第一次進選單：左右兩組先展開", tour.L && tour.R, JSON.stringify(tour));
    ok("展開時 🏠🎵🐻換人⚙️ 都看得到", (await Promise.all(FOLD.map(id => shown(p, id)))).every(Boolean));
    let closedAt = 0; while (Date.now() - t0 < 8000) { if (!(await isOpen(p, "L")) && !(await isOpen(p, "R"))) { closedAt = Date.now() - t0 + 300; break; } await sleep(150); }
    ok("約 4 秒後自己收起來（只剩把手）", closedAt > 3500 && closedAt < 5000, closedAt + "ms");
    await ready(p); await sleep(300);
    const st = await p.evaluate(ids => ids.map(id => { const e = document.getElementById(id), s = getComputedStyle(e), r = e.getBoundingClientRect(); return { id, vis: s.visibility, w: Math.round(r.width) }; }), FOLD);
    ok("收起來：家長按鈕看不到，但位置還佔著（3D 小島擺浮標照樣避開）", st.every(x => x.vis === "hidden" && x.w > 10), JSON.stringify(st));
    ok("收起來：🏙️ 新市區、兩個把手、貼紙、星星罐看得到", (await shown(p, "townBtn")) && (await shown(p, "townTag")) && (await shown(p, "hudLBtn")) && (await shown(p, "hudRBtn")) && (await shown(p, "albumBtn")) && await p.evaluate(() => getComputedStyle(document.querySelector("#menu .jarBtn")).visibility === "visible"));
    // 點把手展開（真的用滑鼠點）
    let c = await center(p, "#hudLBtn"); await p.mouse.click(c.x, c.y); await sleep(300);
    ok("點左邊把手：左邊展開（🏠🎵 出現）、右邊不動", (await isOpen(p, "L")) && !(await isOpen(p, "R")) && (await shown(p, "homeBtn")) && (await shown(p, "musicBtn")));
    ok("展開時把手 aria-expanded=true", await p.evaluate(() => document.getElementById("hudLBtn").getAttribute("aria-expanded") === "true"));
    await sleep(6200);
    ok("展開 6.5 秒還開著", await isOpen(p, "L"));
    await sleep(2200);
    ok("閒置約 8 秒自動收回", !(await isOpen(p, "L")), "");
    // 有在按：重新計 8 秒
    c = await center(p, "#hudLBtn"); await p.mouse.click(c.x, c.y); await sleep(5000);
    await p.evaluate(() => document.getElementById("musicBtn").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await sleep(5000);
    ok("展開中有碰按鈕：重新計時（碰完 5 秒還開著）", await isOpen(p, "L"));
    // 再點一次把手＝收起來
    c = await center(p, "#hudLBtn"); await p.mouse.click(c.x, c.y); await sleep(300);
    ok("再點一次把手：收起來", !(await isOpen(p, "L")));
    // 點畫面別的地方＝收起來
    c = await center(p, "#hudRBtn"); await p.mouse.click(c.x, c.y); await sleep(300);
    await p.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    ok("點畫面其他地方：收起來", !(await isOpen(p, "R")));
    // 家長鎖照舊：展開 → 按住 ⚙️ 2 秒才開
    c = await center(p, "#hudRBtn"); await p.mouse.click(c.x, c.y); await sleep(300);
    const g = await center(p, "#settingsBtn");
    await p.mouse.move(g.x, g.y); await p.mouse.down(); await sleep(1000);
    ok("⚙️ 按住 1 秒：進度環在跑、還沒開", await p.evaluate(() => document.getElementById("settingsBtn").classList.contains("holding") && document.getElementById("settings").classList.contains("hidden")));
    await sleep(1300);
    ok("⚙️ 按住 2 秒：打開家長設定", await p.evaluate(() => !document.getElementById("settings").classList.contains("hidden")));
    await p.mouse.up(); await p.evaluate(() => document.getElementById("settingsClose").click()); await sleep(300);
    // 🐻 換人照舊（滑鼠點頭像、點「換人」小字）
    if (!(await isOpen(p, "R"))) { c = await center(p, "#hudRBtn"); await p.mouse.click(c.x, c.y); await sleep(300); }
    c = await center(p, "#playerBtn"); await p.mouse.click(c.x, c.y); await sleep(300);
    ok("展開後點 🐻：開換人", await p.evaluate(() => !document.getElementById("players").classList.contains("hidden")));
    await p.evaluate(() => document.getElementById("players").classList.add("hidden"));
    if (!(await isOpen(p, "R"))) { c = await center(p, "#hudRBtn"); await p.mouse.click(c.x, c.y); await sleep(300); }
    c = await center(p, "#playerTag"); await p.mouse.click(c.x, c.y); await sleep(300);
    ok("展開後點「換人」小字：開換人", await p.evaluate(() => !document.getElementById("players").classList.contains("hidden")));
    const pl = await p.evaluate(() => { document.querySelectorAll("#playerList .player")[0].click(); return 1; }); await sleep(500);
    ok("選人回到選單：上方兩組收起來", pl && !(await isOpen(p, "L")) && !(await isOpen(p, "R")));
    // 星星罐（有 4 枚幣）：整顆不放大、只有幣圖示跳、星星和數字不動
    const jar = await p.evaluate(() => { const b = document.querySelector("#menu .jarBtn"), an = e => e.getAnimations().map(a => a.animationName || "?");
      return { ready: b.classList.contains("ready"), pill: an(b), pillTf: getComputedStyle(b).transform, scale: getComputedStyle(b).scale, coin: an(b.querySelector(".eg-ico")), text: an(b.querySelector(".jarText")), jarIco: an(b.querySelector(".jar")), egg: b.querySelector(".egg").textContent }; });
    ok("星星罐有幣：亮起來、顯示 🪙4", jar.ready && jar.egg === "🪙4", JSON.stringify(jar));
    ok("星星罐有幣：整顆膠囊沒有動畫、沒有放大", jar.pill.length === 0 && jar.pillTf === "none" && (jar.scale === "none" || jar.scale === "1"), JSON.stringify(jar));
    ok("星星罐有幣：只有幣圖示在跳，星星／數字／罐子不動", jar.coin.join() === "softHop" && jar.text.length === 0 && jar.jarIco.length === 0, JSON.stringify(jar));
    // 🏙️ 新市區鈕：白底、圖示不晃；有新東西才 NEW＋輕跳
    const town = await p.evaluate(() => { const b = document.getElementById("townBtn"), i = b.querySelector(".nav-ico"); return { bg: getComputedStyle(b).backgroundColor, ico: i.getAnimations().length, badge: getComputedStyle(b, "::after").content }; });
    ok("🏙️ 白底（跟其他圓鈕一樣）、圖示不晃、沒有 NEW", /^rgba?\(255, 255, 255/.test(town.bg) && town.ico === 0 && (town.badge === "none" || town.badge === "normal"), JSON.stringify(town));
    const town2 = await p.evaluate(() => { const b = document.getElementById("townBtn"); b.classList.add("news"); return new Promise(r => requestAnimationFrame(() => r({ ico: b.querySelector(".nav-ico").getAnimations().map(a => a.animationName), badge: getComputedStyle(b, "::after").content, bg: getComputedStyle(b, "::after").backgroundColor }))); });
    ok("🏙️ 有新東西：NEW 小紅標＋圖示輕跳", town2.badge.includes("NEW") && town2.bg === "rgb(255, 93, 93)" && town2.ico.includes("navNudge"), JSON.stringify(town2));
    await p.evaluate(() => document.getElementById("townBtn").classList.remove("news"));
    // 遊戲裡：🏠🎵 跟以前一樣、沒有把手
    await enterMode(p, "fish");
    const gm = await p.evaluate(() => { const v = Math.min(innerWidth, innerHeight) / 100, R = id => document.getElementById(id).getBoundingClientRect(), vis = id => getComputedStyle(document.getElementById(id)).visibility;
      return { home: [R("homeBtn").left / v, R("homeBtn").top / v].map(x => +x.toFixed(1)), music: [R("musicBtn").left / v, R("musicBtn").top / v].map(x => +x.toFixed(1)), hv: vis("homeBtn"), mv: vis("musicBtn"),
        handles: ["hudLBtn", "hudRBtn"].map(id => getComputedStyle(document.getElementById(id)).display), speak: getComputedStyle(document.getElementById("speakBtn")).display }; });
    ok("遊戲裡：🏠 在左上 (2,2)vmin、🎵 在 (16,2)vmin、看得到；把手不見；🔊 提示在", Math.abs(gm.home[0] - 2) < 0.2 && Math.abs(gm.home[1] - 2) < 0.2 && Math.abs(gm.music[0] - 16) < 0.2 && gm.hv === "visible" && gm.mv === "visible" && gm.handles.every(d => d === "none") && gm.speak !== "none", JSON.stringify(gm));
    c = await center(p, "#homeBtn"); await p.mouse.click(c.x, c.y); await sleep(300);
    ok("遊戲裡點 🏠：跳暫停", await p.evaluate(() => !document.getElementById("confirm").classList.contains("hidden")));
    await p.evaluate(() => document.getElementById("confirmYes").click()); await sleep(800);
    ok("回選單：家長按鈕收著", !(await isOpen(p, "L")) && !(await shown(p, "homeBtn")));
    ok("沒有錯誤（把手段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 貓頭鷹：看字時間後收、點一下收、點探頭再講一次、新的話自動彈出 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 64, stars: 47, query: Q });
    ok("開始玩：貓頭鷹和對話框在", !(await folded(p)) && (await shown(p, "guideText")));
    await ready(p);
    await p.evaluate(() => window.__hub3d.events(false));   // 關掉新市區隨機失火／生病（不然貓頭鷹會突然插話「失火了」，蓋掉要驗的那句）
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(100);   // 選單上按 🏠＝重畫選單 → 貓頭鷹說一句不出聲的招呼（從這裡開始計時）
    const txt = await p.evaluate(() => document.getElementById("guideText").textContent);
    const readMs = 4000 + 150 * txt.length + 4000;   // 不出聲：看字 4 秒＋每字 0.15 秒，再 4 秒
    await sleep(readMs - 1500 - 100);
    ok(`不出聲的話：看字時間內還在（${(readMs / 1000).toFixed(1)} 秒才收）`, !(await folded(p)), txt);
    await sleep(1500 + 900);
    const f = await p.evaluate(() => { const t = document.getElementById("guideText"), s = getComputedStyle(t); return { fold: document.getElementById("guide").classList.contains("fold"), text: t.textContent, vis: s.visibility, peek: getComputedStyle(document.getElementById("owlPeek")).visibility }; });
    ok("時間到：對話框收起、縮成右下角探頭；字還留在 #guideText（用 class 藏）", f.fold && f.text === txt && f.vis === "hidden" && f.peek === "visible", JSON.stringify(f));
    const pk = await p.evaluate(() => { const r = document.getElementById("owlPeek").getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, w: r.width, h: r.height }; });
    ok("探頭在右下角、夠大好點（≥44px）", Math.abs(pk.right) < 2 && Math.abs(pk.bottom) < 2 && pk.w >= 44 && pk.h >= 44, JSON.stringify(pk));
    // 點探頭：彈出來再講一次
    await p.evaluate(() => { window.__spoken = []; });
    let c = await center(p, "#owlPeek"); await p.mouse.click(c.x, c.y); await sleep(500);
    const said = await p.evaluate(() => window.__spoken.map(s => s.text));
    ok("點探頭：貓頭鷹彈出來、再講一次最後那句", !(await folded(p)) && (await shown(p, "guideText")) && said.includes(txt), JSON.stringify(said));
    // 講完 4 秒收（假語音 0.25 秒講完）
    await sleep(2800);
    ok("唸完不到 4 秒：還在", !(await folded(p)));
    await sleep(1800);
    ok("唸完 4 秒：收起來", await folded(p));
    // 點探頭 → 顯示中點貓頭鷹＝馬上收
    c = await center(p, "#owlPeek"); await p.mouse.click(c.x, c.y); await sleep(400);
    c = await center(p, "#guide > img"); await p.mouse.click(c.x, c.y); await sleep(150);
    ok("顯示中點貓頭鷹：馬上收起來", await folded(p));
    c = await center(p, "#owlPeek"); await p.mouse.click(c.x, c.y); await sleep(400);
    c = await center(p, "#guideText"); await p.mouse.click(c.x, c.y); await sleep(150);
    ok("顯示中點對話框：馬上收起來", await folded(p));
    // 有新的話自動彈出：guideSay（點星星罐沒幣的情況用換人回來的招呼）、天氣直接改字
    await p.evaluate(() => { document.getElementById("playerBtn").click(); }); await sleep(200);
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[0].click()); await sleep(400);
    ok("有新的話（guideSay）：自動彈出來", !(await folded(p)) && (await p.evaluate(() => document.getElementById("guideText").textContent)).includes("歡迎回來"), await p.evaluate(() => document.getElementById("guideText").textContent));
    c = await center(p, "#guide > img"); await p.mouse.click(c.x, c.y); await sleep(150);
    await p.evaluate(() => { document.getElementById("guideText").textContent = "下雨了！滴答滴答！"; }); await sleep(300);   // 跟天氣播報一樣：程式直接改 #guideText
    ok("別的地方直接改字（天氣播報）：也會自動彈出來", !(await folded(p)) && (await p.evaluate(() => document.getElementById("guideText").textContent)).includes("下雨"), await p.evaluate(() => document.getElementById("guideText").textContent));
    // 彈窗開著不算時間
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(9000 + 150 * 10);
    ok("家長設定開著的時候不會收", !(await folded(p)));
    await p.evaluate(() => document.getElementById("settingsClose").click());
    ok("沒有錯誤（貓頭鷹段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 橫式（含繼續玩）／直式 iPad／手機直式／4:3：互不重疊、都在畫面內 =====
  for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"], [390, 844, "M"], [1024, 768, "43"]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 64, stars: 47, query: Q });
    await p.evaluate(() => import("./js/zhuyin-words.js").then(({ WORDS }) => { localStorage.setItem("zy1_resume", JSON.stringify({ mode: "fish", idx: 2, results: [3, 3], combo: 2, earned: [], words: WORDS.slice(0, 10).map(x => [x.h, 1]), t: Date.now() })); }));
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(400);   // 選單上按 🏠＝重畫選單（繼續玩出現）
    await ready(p);
    const r = await p.evaluate(() => {
      const ids = ["#hudLBtn", "#hudRBtn", "#townBtn", "#townTag", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#resumeBtn", "#menu > .menu-bottom", "#guide > img", "#guideText", "#owlPeek"];
      const box = ids.map(s => { const e = document.querySelector(s); const q = e.getBoundingClientRect(); return { s, q, on: getComputedStyle(e).display !== "none" && q.width > 0 }; }).filter(x => x.on);
      const bad = [], out = [];
      for (let i = 0; i < box.length; i++) {
        const a = box[i].q; if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push(box[i].s);
        for (let j = i + 1; j < box.length; j++) { const b = box[j].q;
          if ((box[i].s === "#townBtn" && box[j].s === "#townTag") || (box[i].s.startsWith("#guide") && box[j].s === "#owlPeek") || (box[i].s === "#guideText" && box[j].s === "#owlPeek")) continue;   // 新市區小字故意黏在圓鈕後面；探頭就在貓頭鷹的位置
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) bad.push(box[i].s + "×" + box[j].s); }
      }
      const tags = []; for (const tg of document.querySelectorAll(".hub-tag:not(.civic)")) { const q = tg.getBoundingClientRect(); for (const x of box) { const b = x.q; if (q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top) tags.push(tg.dataset.mode + "×" + x.s); } }
      return { bad, out, tags, resume: !document.getElementById("resumeBtn").classList.contains("hidden") };
    });
    ok(`${t} ${w}×${h}：繼續玩有出現`, r.resume);
    ok(`${t} ${w}×${h}：上方兩排／繼續玩／膠囊／換人小字／貓頭鷹互不重疊、都在畫面內`, r.bad.length === 0 && r.out.length === 0, JSON.stringify(r));
    ok(`${t} ${w}×${h}：浮標沒被任何按鈕擋到（收起來的也算位置）`, r.tags.length === 0, r.tags.join(","));
    ok(`${t} 沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})();
