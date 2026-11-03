// v8 我的家測試（10-31；docs/zhuyin-v8-plan.md §3）：node tools/zy-test/home.js
// 驗：新存檔＝今天開工（base＝現在的星星、帳篷、浮標在主島、錢包還沒出現、花園小舖鎖著）；點房子＝房子卡片（我的家・帳篷、🔒 布置花園）；
//     拿到 12 顆星（重新整理）＝回小島自動播升級演出 → 小木屋、錢包膠囊出現、星星罐不寫⭐數字；
//     布置花園：送一個紅色花圃、鏡頭拉近、格子白圈（6 格）；拿起來點格子＝擺好（3D 也有）；
//     買：第一下只跳確認、0.4 秒內點「✔ 買」不算、之後才算（錢包扣、手上拿著）、當天可以原價退；錢不夠＝不跳確認、寫「還差」；
//     換位置（拿起來再放）；「✔ 好了」收起來、重新整理還在；信箱一天一封（紅旗立起→看過放下、再點說看過了）；
//     備份碼有我的家、還原回來一樣；沒有錯誤、旁注音沒漏字
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&night=0&weather=sunny";
const ready = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy && window.__zy.homeUI, null, { timeout: 60000 }).then(() => sleep(1500));
const H = p => p.evaluate(() => window.__hub3d.home());
const S = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.homeSave)));
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains("hidden") && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().width > 0; }, sel);
const txt = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel);
const shelf = (p, id) => p.click(`.hg-item[data-id=${id}]`);
const slot = (p, i) => p.evaluate(i => window.__hub3d.tapHome({ k: "slot", i }), i);

(async () => {
  const b = await launch();
  try {
    const { p, errs } = await openGame(b, { w: 1180, h: 820, stickers: 20, stars: 0, query: Q, homeHi: false });   // 新存檔的我的家
    await ready(p);
    // ---- 新存檔：今天開工 ----
    let s = await S(p), h = await H(p);
    ok("新存檔有我的家（base＝0、看過第 1 級）", s.base === 0 && s.lv === 1, JSON.stringify({ base: s.base, lv: s.lv }));
    ok("3D：帳篷（第 1 級）、前院 6 格", h.lv === 1 && h.cap === 6, JSON.stringify(h));
    ok("我的家浮標在主島看得到", !!h.tag, JSON.stringify(h.tag));
    ok("錢包還沒出現（花園、陀螺都還沒開）", !(await vis(p, "#walletBtn")));
    await p.evaluate(() => window.__hub3d.tapHome({ k: "house" })); await sleep(600);
    ok("點房子＝房子卡片", await vis(p, ".hm-card"));
    ok("卡片寫「我的家・帳篷」", (await txt(p, ".hm-c-name")).replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "").includes("我的家・帳篷"), await txt(p, ".hm-c-name"));
    ok("布置花園還鎖著", await p.evaluate(() => document.querySelector(".hm-c-go").classList.contains("off")));
    await p.click(".hm-c-x"); await sleep(300);

    // ---- 拿到 12 顆星：回小島播升級演出 → 小木屋 ----
    await p.evaluate(() => localStorage.setItem("zy1_stars", "12"));
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
    await ready(p);
    await p.waitForFunction(() => window.__hub3d.home().lv === 2, null, { timeout: 25000 }).catch(() => {});
    await sleep(2500);
    h = await H(p); s = await S(p);
    ok("升級演出播完：3D 變小木屋", h.lv === 2, JSON.stringify(h));
    ok("存檔記住看過第 2 級", s.lv === 2, String(s.lv));
    ok("錢包膠囊出現", await vis(p, "#walletBtn"));
    ok("星星罐不寫⭐數字（只有錢包是⭐＋數字）", await p.evaluate(() => getComputedStyle(document.querySelector(".jarBtn:not(#hatchHint) .jarStar")).display === "none"));
    const wallet0 = await p.evaluate(() => window.__zy.wallet);
    ok("錢包數字＝我的星星", (await txt(p, "#walletN")) === String(wallet0), `${await txt(p, "#walletN")} / ${wallet0}`);

    // ---- 布置花園 ----
    await p.evaluate(() => window.__zy.setWallet(10));
    await p.evaluate(() => window.__hub3d.tapHome({ k: "house" })); await sleep(700);
    ok("卡片的布置花園打開了", await p.evaluate(() => !document.querySelector(".hm-c-go").classList.contains("off")));
    await p.click(".hm-c-go"); await sleep(1500);
    ok("花園小舖出現", await vis(p, ".hm-garden"));
    h = await H(p); s = await S(p);
    ok("鏡頭拉近、布置模式", h.edit === true, JSON.stringify({ edit: h.edit }));
    ok("格子白圈 6 個", h.marks === 6, String(h.marks));
    ok("第一次送一個紅色花圃", s.own.fl_red === 1 && s.gift === 1, JSON.stringify(s.own));
    ok("上面的按鈕、狀態列、貓頭鷹藏起來", !(await vis(p, "#hudL")) && !(await vis(p, "#statusBar")) && !(await vis(p, ".menu-bottom")));   // 11-01：貼紙那排搬到頂端狀態列
    ok("貨架 16 件（11-01 加留聲機）", await p.evaluate(() => document.querySelectorAll(".hg-item").length === 16));
    await shelf(p, "fl_red"); await sleep(250);
    ok("點倉庫裡有的＝直接拿起來（不跳買）", await p.evaluate(() => window.__zy.homeUI.debug.held === "fl_red" && document.querySelector(".hg-buy").classList.contains("hidden")));
    h = await H(p); ok("拿著東西：空格子一閃一閃", h.placing === true && h.marks === 6, JSON.stringify({ placing: h.placing, marks: h.marks }));
    await slot(p, 0); await sleep(500);
    s = await S(p); h = await H(p);
    ok("點格子＝擺好（存檔）", s.yard[0] === "fl_red", JSON.stringify(s.yard));
    ok("3D 第 0 格是紅色花圃", h.yard[0] === "fl_red", JSON.stringify(h.yard));

    // ---- 買：確認要點另一顆鈕、隔 0.4 秒 ----
    await p.evaluate(() => { document.querySelector(".hg-item[data-id=sunflower]").click(); document.querySelector(".hg-buy-go").click(); });   // 同一瞬間連點兩下（5 歲常連點）
    ok("0.4 秒內點「✔ 買」不算", (await p.evaluate(() => window.__zy.wallet)) === 10 && !(await S(p)).own.sunflower);
    ok("第一下只跳確認泡泡", await vis(p, ".hg-buy"));
    ok("確認列寫錢包從幾顆變幾顆", (await txt(p, ".hg-buy-s")).replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "").includes("⭐10→⭐5"), await txt(p, ".hg-buy-s"));
    await sleep(500); await p.evaluate(() => document.querySelector(".hg-buy-go").click()); await sleep(300);
    s = await S(p);
    ok("買到：錢包 10→5、擁有向日葵、手上拿著", (await p.evaluate(() => window.__zy.wallet)) === 5 && s.own.sunflower === 1 && (await p.evaluate(() => window.__zy.homeUI.debug.held)) === "sunflower", JSON.stringify({ own: s.own }));
    ok("錢包膠囊／貨架上方數字跟著變", (await txt(p, ".hg-wallet b")) === "5");
    ok("剛買完不給退（連點「✔ 買」不會變退貨）", !(await vis(p, ".hg-refund")));
    ok("手上拿著＝有「✕ 放回去」", await vis(p, ".hg-cancel"));
    await slot(p, 1); await sleep(300); await slot(p, 1); await sleep(300);
    ok("從格子拿起今天買的＝可以退", await vis(p, ".hg-refund") && (await p.evaluate(() => window.__zy.homeUI.debug.from)) === 1);
    await p.click(".hg-refund"); await sleep(300); s = await S(p);
    ok("退回：錢包 5→10、向日葵沒了", (await p.evaluate(() => window.__zy.wallet)) === 10 && !s.own.sunflower && s.yard[1] === null, JSON.stringify({ own: s.own, yard: s.yard }));
    // 錢不夠
    await p.evaluate(() => window.__zy.setWallet(2)); await shelf(p, "fl_yellow"); await sleep(250);
    ok("錢不夠＝不跳確認", !(await vis(p, ".hg-buy")));
    ok("錢不夠＝寫還差幾顆", (await txt(p, ".hg-item[data-id=arch] .hg-price")).replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "").includes("還差18顆"), await txt(p, ".hg-item[data-id=arch] .hg-price"));
    ok("錢包不會變負", (await p.evaluate(() => window.__zy.wallet)) === 2);
    // 換位置：拿起第 0 格、放到第 3 格
    await slot(p, 0); await sleep(250);
    ok("點有東西的格子＝拿起來", (await p.evaluate(() => window.__zy.homeUI.debug.held)) === "fl_red" && (await S(p)).yard[0] === null);
    await shelf(p, "fl_red"); await sleep(300); s = await S(p);
    ok("再點同一件的貨架卡＝放回原本那格", s.yard[0] === "fl_red" && !(await p.evaluate(() => window.__zy.homeUI.debug.held)), JSON.stringify(s.yard));
    await slot(p, 0); await sleep(250); await slot(p, 3); await sleep(400); s = await S(p);
    ok("換到第 3 格", s.yard[3] === "fl_red" && s.yard[0] === null, JSON.stringify(s.yard));
    await slot(p, 3); await sleep(250);
    ok("拿著東西", (await p.evaluate(() => window.__zy.homeUI.debug.held)) === "fl_red");
    await p.click(".hg-done"); await sleep(1200);
    ok("「✔ 好了」收起來", !(await vis(p, ".hm-garden")) && (await H(p)).edit === false);
    s = await S(p); ok("拿著東西按「好了」＝放回原本那格（不會不見）", s.yard[3] === "fl_red", JSON.stringify(s.yard));
    ok("收起來後上面的按鈕回來", await vis(p, "#hudL"));

    // ---- 信箱 ----
    h = await H(p); ok("今天的信還沒看＝紅旗立起來", h.mailUp === true);
    ok("有新信＝🏠 浮標有 ✉️", await p.evaluate(() => document.querySelector(".hub-tag.home").classList.contains("mail")));
    await p.evaluate(() => window.__hub3d.tapHome({ k: "mail" })); await sleep(700);
    ok("點信箱＝信打開", await vis(p, ".hm-letter"));
    ok("信有內容", (await txt(p, ".hm-l-text")).length > 5, await txt(p, ".hm-l-text"));
    await p.click(".hm-l-ok"); await sleep(400); h = await H(p);
    ok("看過＝紅旗放下", h.mailUp === false);
    await sleep(500); await p.evaluate(() => { window.__spoken = []; window.__hub3d.tapHome({ k: "mail" }); }); await sleep(700);
    ok("再點信箱＝不再打開信", !(await vis(p, ".hm-letter")));

    // ---- 重新整理還在、備份碼 ----
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
    await ready(p); h = await H(p);
    ok("重新整理：小木屋、第 3 格紅色花圃還在", h.lv === 2 && h.yard[3] === "fl_red", JSON.stringify({ lv: h.lv, yard: h.yard }));
    const code = await p.evaluate(() => window.__zyB.exportCode());
    const r = await p.evaluate(c => { const d = window.__zyB.readCode(c); return d && d.slots[0] && d.slots[0].home; }, code);
    ok("備份碼帶著我的家", !!r && r.yard[3] === "fl_red" && r.own.fl_red === 1, JSON.stringify(r && r.yard));
    await p.evaluate(() => { localStorage.removeItem("zy1_home"); });
    const res = await p.evaluate(c => window.__zyB.importCode(c), code);
    s = await S(p);
    ok("還原備份碼＝我的家回來", res === "ok" && s.yard[3] === "fl_red" && s.lv === 2, JSON.stringify({ res, yard: s.yard, lv: s.lv }));
    const miss = await p.evaluate(() => [...window.__zy.zMissing]);
    ok("國字都有注音", !miss.length, miss.join(""));
    ok("沒有錯誤", !errs.length, errs.slice(0, 3).join(" | "));
    await p.context().close();
  } catch (e) { out.push("FAIL  例外：" + (e && e.message || e)); }
  await b.close();
  console.log(out.join("\n"));
  const f = out.filter(x => x.startsWith("FAIL")).length;
  console.log(`\n${out.length - f}/${out.length} 通過`);
  process.exit(f ? 1 : 0);
})();
