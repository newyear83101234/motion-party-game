// 挑戰燈塔 × 真的遊戲 整合測試：node tools/zy-test/tower-real.js（10-13 v6 合併後）
// tower.js 用模擬關卡測爬塔流程；這支測「爬塔模組 → 主程式 playFloor（分身 A）／playBubbleBoss（分身 B）」真的接得起來：
//   ① 第 1 層＝真的釣魚：三題答完 → 回到塔、下一層開場卡；塔沒有被 nav() 停掉
//   ② 真的樓層答錯 → 扣心（教學層以外）
//   ③ 🏠 暫停選單「離開挑戰」→ 這場結束、回到塔畫面、沒有 GAME OVER
//   ④ 第 10 層＝真的泡泡守塔怪：泡泡畫面開起來、愛心 HUD 還在；離開挑戰 → 回塔
//   ⑤ 沒有 console 錯誤
// 需要：專案根目錄開著 python -m http.server（ZY_URL 指過去）。後端關掉（plaza=off），不打線上。
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const SEL = { fish: "#pond .fishBtn", order: "#shelf .item", hunt: "#scene .obj", tone: "#sky .balloon" };
const tapEl = "e => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }))";
const answer = (p, m, right) => p.evaluate(({ right, sel, tap }) => { const T = eval(tap); const o = window.__zy.curOpts; if (!o) return false; const i = o.findIndex(x => (!!x.ok === right) && !x.taken); const e = document.querySelectorAll(sel)[i]; if (!e) return false; T(e); return true; }, { right, sel: SEL[m], tap: tapEl });
const TS = p => p.evaluate(() => window.__zyTower && window.__zyTower.game && window.__zyTower.game.state());
const waitTS = (p, fn, t = 15000) => p.waitForFunction(src => { const g = window.__zyTower && window.__zyTower.game; if (!g) return false; return new Function("s", "return (" + src + ")(s)")(g.state()); }, fn.toString(), { timeout: t }).then(() => true, () => false);
const clickSel = (p, sel) => p.evaluate(s => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
const vis = (p, id) => p.evaluate(id => { const e = document.getElementById(id); return !!e && !e.classList.contains("hidden"); }, id);
const heartsTot = h => (h ? h.red + h.gold : -1);
const curMode = p => p.evaluate(() => window.__zy && window.__zy.mode);

async function leaveViaPause(p) {                       // 🏠 → 暫停選單「離開挑戰」
  await p.evaluate(() => { const b = document.querySelector("#homeBtn, .home-btn, [data-act=home]"); if (b) b.click(); });
  await sleep(500);
  const shown = await vis(p, "confirm");
  const label = await p.evaluate(() => (document.getElementById("confirmYes") || {}).textContent || "");
  await clickSel(p, "#confirmYes"); await sleep(800);
  return { shown, label };
}

(async () => {
  const browser = await launch();
  const { ctx, p } = await openGame(browser, { stickers: 40, query: "debug&novoice&no3d&plaza=off&night=0&weather=sunny" });
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|net::ERR_/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.evaluate(() => localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, tower: 1 })));

  // 進塔
  await p.evaluate(() => document.querySelector(".mode-card[data-mode=tower]").click());
  ok("進塔：塔的主畫面", await waitTS(p, s => s.phase === "home"));
  const plan1 = await p.evaluate(() => window.__zyTower.game.debug.plan(1));
  await clickSel(p, ".tw-go");
  ok("出發：第 1 層開場卡", await waitTS(p, s => s.ov === "floor" && s.floor === 1), J(await TS(p)));
  await clickSel(p, ".tw-start");

  // ① 第 1 層＝真的遊戲
  const m1 = plan1.mode || (plan1.steps && plan1.steps[0] && plan1.steps[0].mode);
  const inGame = await p.waitForFunction(m => window.__zy && window.__zy.mode === m && window.__zy.curOpts, m1, { timeout: 12000 }).then(() => true, () => false);
  ok(`① 第 1 層開真的遊戲（${m1}），不是模擬關卡`, inGame && !(await TS(p)).stub, J({ m1, mode: await curMode(p), st: await TS(p) }));
  ok("① 遊戲中愛心 HUD 蓋在畫面上", (await TS(p)).hud === true);
  const n1 = await p.evaluate(() => window.__zy.round.length);
  ok("① 第 1 層題數＝3", n1 === 3, n1);
  if (SEL[m1]) {
    for (let k = 0; k < n1; k++) {
      await p.waitForFunction(k => window.__zy.idx === k && window.__zy.curOpts, k, { timeout: 8000 }).catch(() => {});
      await answer(p, m1, true); await sleep(1700);
    }
  }
  const back = await waitTS(p, s => s.phase !== "idle" && s.ov === "floor" && s.floor === 2, 20000);
  const st2 = await TS(p);
  ok("① 答完：回到塔、第 2 層開場卡（塔沒有被 nav() 停掉）", back && (await vis(p, "tower")) && (await curMode(p)) === "tower", J({ st2, mode: await curMode(p) }));

  // ② 第 2 層：答錯扣心
  const plan2 = await p.evaluate(() => window.__zyTower.game.debug.plan(2));
  const m2 = plan2.mode || (plan2.steps && plan2.steps[0] && plan2.steps[0].mode);
  const h0 = heartsTot(st2.hearts);
  await clickSel(p, ".tw-start");
  await p.waitForFunction(m => window.__zy && window.__zy.mode === m, m2, { timeout: 12000 }).catch(() => {});
  if (SEL[m2]) {
    await p.waitForFunction(() => window.__zy.curOpts, null, { timeout: 8000 }).catch(() => {});
    await answer(p, m2, false); await sleep(600);
    const h1 = heartsTot((await TS(p)).hearts);
    ok(`② 第 2 層（${m2}）答錯 → 掉 1 顆心`, h1 === h0 - 1, J({ h0, h1 }));
  } else {
    ok(`② 第 2 層是 ${m2}（測試不會自動答這種，跳過扣心檢查）`, true);
  }

  // ③ 🏠 離開挑戰
  const lv = await leaveViaPause(p);
  ok("③ 暫停選單在爬塔局顯示「離開挑戰」", lv.shown && /離開/.test(lv.label.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")), J(lv));
  const endOk = await waitTS(p, s => s.phase !== "run" && s.ov !== "floor", 12000);
  const txt = await p.evaluate(() => document.getElementById("tower").innerText);
  ok("③ 離開後回到塔畫面、mode＝tower", endOk && (await vis(p, "tower")) && (await curMode(p)) === "tower", J({ st: await TS(p), mode: await curMode(p) }));
  ok("③ 沒有 GAME OVER 字樣", !/GAME\s*OVER/i.test(txt));
  // ④ 第 10 層＝真的泡泡守塔怪（測試捷徑：存檔點設成 9 → 結算的「再爬一次」從第 10 層開始）
  await p.evaluate(() => { const T = window.__zyTower.game.debug.T; T.cp = 9; });
  await clickSel(p, ".tw-again");
  const at10 = await waitTS(p, s => s.ov === "floor", 10000);
  const f10 = (await TS(p)).floor;
  if (at10 && f10 === 10) {
    await clickSel(p, ".tw-start");
    const bub = await p.waitForFunction(() => window.__zy && window.__zy.mode === "bubble" && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    ok("④ 第 10 層開真的泡泡（守塔怪）", bub, J({ mode: await curMode(p), st: await TS(p) }));
    ok("④ 守塔怪時愛心 HUD 還在", (await TS(p)).hud === true);
    const lv2 = await leaveViaPause(p);
    ok("④ 泡泡守塔怪的暫停選單也是「離開挑戰」", /離開/.test(lv2.label.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")), J(lv2));
    const end2 = await waitTS(p, s => s.phase !== "run", 12000);
    ok("④ 離開守塔怪 → 回到塔畫面、mode＝tower", end2 && (await vis(p, "tower")) && (await curMode(p)) === "tower", J({ st: await TS(p), mode: await curMode(p) }));
  } else {
    ok("④ 第 10 層（存檔點 9 的測試捷徑沒生效）", false, J({ at10, f10 }));
  }

  ok("⑤ 沒有錯誤", errs.length === 0, errs.slice(0, 4).join(" | "));
  await ctx.close(); await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
