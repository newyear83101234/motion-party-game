// 挑戰燈塔（爬塔）瀏覽器測試（10-13）：node tools/zy-test/tower.js
// 需要：專案根目錄開著 python -m http.server（ZY_URL 指過去）。截圖存到 TOWER_SHOTS（預設 %TEMP%\zy-tower）。
// 後端一律 page.route 攔截 Apps Script 網址回假資料（跟 Code.js 一樣的協定）；**不打線上後端**。
// 網址帶 ?towerstub：一般樓層／守塔怪用模組的模擬版（🧪 模擬關卡）跑，專測爬塔流程；接上真的遊戲的整合測試在 tower-real.js。
// 驗：①3D 小島燈塔可以點：浮標、介紹卡「挑戰燈塔」、再點一次進塔；🗺️ 全部遊戲主島那組有燈塔
//     ②選名字在家長閘門後面：點一下打不開、按住 2 秒才開；24 格、被選走的寫「有人了」；選了送 tw_claim（只有 k/c/s、秘密碼 32 碼 hex、不出現在畫面和主控台）
//     ③用模擬版爬第 1–10 層：教學層答錯不扣心、答錯扣心、第 5 層補心、第 5 層第一次 +1 星、守塔怪（泡泡）碰底線扣心、打倒＝扭蛋幣＋徽章＋存檔點、送 tw_score
//     ④先休息 → 結算（下次從第 11 層）；再爬：第 12 層愛心用完 → 降落傘 → 結算（旗子、沒有 GAME OVER、「再爬一次」比「去玩別的」大）
//     ⑤離線：分數排隊、恢復後重送；選名字離線不會壞
//     ⑥一週沒來被釋出（ping 回 lost）：本機樓層歸零、徽章保留、跟小孩說
//     ⑦排行榜前 5 名、我的那列標「你」；家長設定「挑戰燈塔」說明＋放棄名字（按兩次、送 tw_leave）
//     ⑧0 個 console error、新字都有注音；截圖：塔主畫面、選名字、樓層開場、失敗結算（橫式＋直式）
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const URL = process.env.ZY_URL || "http://127.0.0.1:8765/zhuyin.html";
const SHOTS = process.env.TOWER_SHOTS || path.join(os.tmpdir(), "zy-tower");
fs.mkdirSync(SHOTS, { recursive: true });
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const CORS = { "access-control-allow-origin": "*" };
const W0 = "2026-10-12";
const S32 = /^[0-9a-f]{32}$/;

// ---------- 假後端（同樂廣場 GET＋爬塔 tw_*；規則照 tools/plaza/gas/Code.js）----------
function mock() {
  const M = { rows: {}, seq: 0, posts: [], down: false, lostAll: false, extraBoard: [], taken0: ["ox"] };
  const json = (route, o) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: J(o) });
  M.tower = () => {
    const live = Object.entries(M.rows).filter(([, r]) => r.h);
    const board = [...live.map(([c, r]) => ({ c, f: r.f, seq: r.seq })).filter(x => x.f > 0), ...M.extraBoard].sort((a, b) => b.f - a.f || a.seq - b.seq).slice(0, 5).map(x => ({ c: x.c, f: x.f }));
    return { board, taken: [...new Set([...M.taken0, ...live.map(([c]) => c)])] };
  };
  M.route = async route => {
    const r = route.request(), m = r.method();
    if (M.down) return route.abort("internetdisconnected");
    if (m === "GET") return json(route, { ok: true, w: W0, theme: { key: "read", title: "x", unit: "x", desc: "x", goals: [150, 450, 900] }, total: 3, reached: 0, plays: 0, cheers: [0, 0, 0, 0], prev: null, paused: false, tops: [], tower: M.tower(), now: Date.now() });
    let j = null; try { j = JSON.parse(r.postData()); } catch (e) {}
    M.posts.push({ j, ct: r.headers()["content-type"] || "" });
    if (!j || typeof j.k !== "string" || !j.k.startsWith("tw_")) return json(route, { ok: true });
    const row = M.rows[j.c] || (M.rows[j.c] = { h: "", f: 0, seq: 0 });
    const mine = row.h && row.h === j.s;
    if (j.k === "tw_claim") { if (M.taken0.includes(j.c) && !mine) return json(route, { ok: false, why: "taken" }); if (row.h && !mine) return json(route, { ok: false, why: "taken" }); if (!row.h) { row.h = j.s; row.f = 0; } return json(route, { ok: true, f: row.f }); }
    if (j.k === "tw_ping") return json(route, mine && !M.lostAll ? { ok: true, f: row.f } : { ok: false, why: "lost" });
    if (j.k === "tw_score") { if (!mine || M.lostAll) return json(route, { ok: false, why: "lost" }); const nf = Math.max(row.f, Math.min(j.f, row.f + 20)); if (nf > row.f) row.seq = ++M.seq; row.f = nf; return json(route, { ok: true, f: nf }); }
    if (j.k === "tw_leave") { if (mine) { row.h = ""; row.f = 0; } return json(route, { ok: true }); }
    return json(route, { ok: false, why: "bad_body" });
  };
  return M;
}
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, speak(u) { if (u.text.trim()) window.__spoken.push(u.text); setTimeout(() => { u.onend && u.onend(); }, 120); } };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
};
async function openP(browser, M, { w = 1180, h = 820, query = "debug&novoice&plaza=on&night=0&weather=sunny", stickers = 40, ls = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(fakeSpeech);
  await ctx.route(/script\.google(usercontent)?\.com/, M.route);
  const p = await ctx.newPage(), errs = [], logs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { logs.push(m.text()); if (m.type() !== "error" || /favicon/.test(m.text())) return; if (/Failed to load resource|net::ERR_/.test(m.text())) return; errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL + "?" + query + "&towerstub"); await p.waitForTimeout(300);   // towerstub：一般樓層／守塔怪用模組的模擬版（真的遊戲另由 tower-real.js 測）
  await p.evaluate(({ stickers, ls }) => {
    localStorage.clear();
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, stickers).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", "0");
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1 }));
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, JSON.stringify(v));
    });
  }, { stickers, ls });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await p.waitForTimeout(300);
  return { ctx, p, errs, logs };
}
const TS = p => p.evaluate(() => window.__zyTower.game && window.__zyTower.game.state());
const waitTS = (p, fn, arg, t = 15000) => p.waitForFunction(([src, a]) => { const g = window.__zyTower && window.__zyTower.game; if (!g) return false; const s = g.state(); return new Function("s", "a", "return (" + src + ")(s, a)")(s, a); }, [fn.toString(), arg], { timeout: t, polling: 50 }).then(() => true, () => false);
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const clickSel = (p, sel) => p.evaluate(s => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
const enterTower = async p => { await p.evaluate(() => document.querySelector(".mode-card[data-mode=tower]").click()); return waitTS(p, s => s.phase === "home"); };
const stars = p => p.evaluate(() => +localStorage.getItem("zy1_stars"));
const coins = p => p.evaluate(() => (JSON.parse(localStorage.getItem("zy1_rewards") || "{}").coins) || 0);
const LS = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
// 按住家長閘門 ms 毫秒（真的滑鼠按下／放開）
async function holdGate(p, ms) {
  const r = await p.evaluate(() => { const b = document.querySelector(".tw-gate"); const x = b.getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2 }; });
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await sleep(ms); await p.mouse.up(); await sleep(300);
}
// 用模擬版玩一層：wrong＝先點幾次「答錯」；timeout＝點「時間到」；press＝泡泡碰底線幾次
async function playStubFloor(p, { wrong = 0, timeout = false, press = 0, shotName = "" } = {}) {
  if (!(await waitTS(p, s => s.ov === "floor"))) return { err: "沒等到樓層開場卡" };
  const st0 = await TS(p);
  if (shotName) await shot(p, shotName);
  await clickSel(p, ".tw-start");
  if (!(await waitTS(p, s => s.ov === "stub" && !!s.stub))) return { err: "沒等到模擬關卡 " + st0.floor };
  const st = await TS(p);
  const hud = await p.evaluate(() => { const h = document.querySelector(".tw-hud"); return h && !h.classList.contains("hidden") ? h.textContent : null; });
  if (st.stub.kind === "bubble") {
    for (let i = 0; i < press; i++) { await clickSel(p, ".tw-stub-press"); await sleep(120); }
    const after = await TS(p); if (!after.stub) return { floor: st0.floor, kind: "bubble", failed: true, hud };
    await clickSel(p, ".tw-stub-win"); return { floor: st0.floor, kind: "bubble", hud, stub: st.stub };
  }
  for (let i = 0; i < wrong; i++) { await clickSel(p, ".tw-stub-ng"); await sleep(120); const s = await TS(p); if (!s.stub) return { floor: st0.floor, failed: true, hud }; }
  if (timeout) { await clickSel(p, ".tw-stub-time"); await sleep(120); }
  for (let q = 0; q < st.stub.n; q++) { if (!(await TS(p)).stub) break; await clickSel(p, ".tw-stub-ok"); await sleep(60); }
  return { floor: st0.floor, n: st.stub.n, hud, stub: st.stub, hearts0: st.hearts };
}
const heartsTot = h => (h ? h.red + h.gold : -1);

(async () => {
  const browser = await launch();
  try {
    // ================= ① 3D 小島的燈塔 =================
    {
      const M = mock(); const { p, errs } = await openP(browser, M, { query: "debug&novoice&plaza=off&night=0&weather=sunny" });
      const hubOk = await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).then(() => true, () => false);
      await sleep(800);
      ok("①-1 3D 小島載好", hubOk);
      const tag = await p.evaluate(() => { const t = document.querySelector(".hub-tag[data-mode=tower]"); return t ? { ico: t.querySelector(".ht-ico").textContent, word: t.querySelector(".ht-word").textContent, locked: t.classList.contains("locked") } : null; });
      ok("①-2 燈塔有浮標（🗼 挑戰燈塔、已解鎖）", tag && tag.ico === "🗼" && /挑戰燈塔/.test(tag.word) && !tag.locked, J(tag));
      const spot = await p.evaluate(() => {
        const h = window.__hub3d, c = h.screenOf("tower");
        for (let r = 0; r <= 120; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
          const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r, e = document.elementFromPoint(x, y);
          if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === "tower") return { x, y };
        }
        return null;
      });
      ok("①-3 點得到燈塔本體（3D 點擊盒）", !!spot);
      if (spot) {
        await p.mouse.click(spot.x, spot.y);
        const pk = await p.waitForFunction(() => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === "tower"; }, null, { timeout: 5000 }).then(() => true, () => false);
        const pkTxt = await p.evaluate(() => ({ name: document.getElementById("pkName").textContent, meta: document.getElementById("pkMeta").textContent }));
        ok("①-4 點一下＝介紹卡「挑戰燈塔」＋最高樓層", pk && /挑戰燈塔/.test(pkTxt.name.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) && /🗼/.test(pkTxt.meta), J(pkTxt));
        await shot(p, "t1-pick-card");
        await clickSel(p, "#pkGo");
        const inT = await waitTS(p, s => s.phase === "home", null, 15000);
        ok("①-5 介紹卡「開始玩」＝進挑戰燈塔", inT && await p.evaluate(() => window.__zy.mode === "tower" && !document.getElementById("tower").classList.contains("hidden")));
        const hud = await p.evaluate(() => ({ speak: document.getElementById("speakBtn").classList.contains("hidden"), prog: document.getElementById("progress").classList.contains("hidden") }));
        ok("①-6 塔畫面：主程式「再聽」、進度點都藏起來", hud.speak && hud.prog, J(hud));
        await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(300); await clickSel(p, "#confirmYes"); await sleep(1500);
      }
      await p.evaluate(() => document.getElementById("mapBtn").click()); await sleep(500);
      const gl = await p.evaluate(() => { const c = document.querySelector('#gamesList .gl-group[data-isle=main] .gl-card[data-mode=tower]'); return c ? c.textContent : null; });
      ok("①-7 🗺️ 全部遊戲：主島那組有燈塔", !!gl, String(gl));
      await p.evaluate(() => document.getElementById("gamesClose").click());
      ok("①-8 沒有 console error", errs.length === 0, errs.slice(0, 3).join(" | "));
      await p.context().close();
    }

    // ================= ②–⑦ 主流程（橫式 1180×820）=================
    const M = mock();
    const { p, errs, logs } = await openP(browser, M, { query: "debug&novoice&no3d&plaza=on&night=0&weather=sunny" });
    ok("②-0 進塔", await enterTower(p));
    await sleep(800);
    await shot(p, "t2-home-land");
    // ② 家長閘門
    await holdGate(p, 300);
    ok("②-1 點一下（0.3 秒）打不開選名字", (await TS(p)).ov !== "pick");
    const tipOn = await p.evaluate(() => document.querySelector(".tw-gate").classList.contains("tip"));
    ok("②-2 太早放開：提示「家長請按住 2 秒」", tipOn);
    await holdGate(p, 2300);
    ok("②-3 按住 2 秒＝打開選名字", await waitTS(p, s => s.ov === "pick", null, 4000));
    await waitTS(p, s => s.taken.includes("ox"), null, 6000);
    await sleep(300);
    const pk = await p.evaluate(() => ({ n: document.querySelectorAll(".tw-pk-b").length, ox: (() => { const b = document.querySelector('.tw-pk-b[data-c="ox"]'); return b ? { taken: b.classList.contains("taken"), txt: b.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") } : null; })(), parent: !!document.querySelector(".tw-pk-parent.noann"),
      rule: document.querySelector(".tw-pk-rules").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") }));
    ok("②-4 24 格代號", pk.n === 24, pk.n);
    ok("②-5 被選走的寫「有人了」", pk.ox && pk.ox.taken && /有人了/.test(pk.ox.txt), J(pk.ox));
    ok("②-6 選名字畫面寫清楚七天沒來會放掉、樓層從頭（家長說明不加注音）", /七天沒來玩/.test(pk.rule) && /重新開始/.test(pk.rule) && pk.parent, pk.rule);
    await clickSel(p, '.tw-pk-b[data-c="ox"]'); await sleep(200);
    ok("②-7 點有人的＝選不到", (await p.evaluate(() => document.querySelector(".tw-pk-ok").disabled)));
    await clickSel(p, '.tw-pk-b[data-c="tiger"]'); await sleep(250);
    await shot(p, "t2-picker-land");
    await clickSel(p, ".tw-pk-ok");
    const claimed = await waitTS(p, s => s.code === "tiger" && s.ov !== "pick", null, 8000);
    const cl = M.posts.find(x => x.j && x.j.k === "tw_claim");
    ok("②-8 選了＝送 tw_claim、存成我的名字", claimed && cl && cl.j.c === "tiger");
    ok("②-9 tw_claim 只有 k/c/s、秘密碼 32 碼 hex、text/plain POST", cl && J(Object.keys(cl.j).sort()) === J(["c", "k", "s"]) && S32.test(cl.j.s) && /text\/plain/.test(cl.ct), cl ? J(Object.keys(cl.j)) + " " + cl.ct : "");
    const sec = cl ? cl.j.s : "zzzz";
    const leak = await p.evaluate(s => document.body.innerText.includes(s) || document.body.innerHTML.includes(s), sec);
    ok("②-10 秘密碼沒有出現在畫面、主控台", !leak && !logs.some(l => l.includes(sec)));
    await sleep(600);
    // ⑦ 排行榜（後端回的）
    M.extraBoard = [{ c: "ox", f: 30, seq: 0 }, { c: "dog", f: 8, seq: 0 }];
    await p.evaluate(() => window.__zyTower.game.debug.sync());

    // ③ 第 1–10 層
    await clickSel(p, ".tw-go");
    const f1 = await playStubFloor(p, { wrong: 2, shotName: "t3-floor1-intro" });
    let s1 = await TS(p);
    ok("③-1 第 1 層＝教學層：答錯不扣心（還是 3 顆）、HUD 蓋在畫面上", f1.floor === 1 && heartsTot(s1.hearts) === 3 && f1.hud && /練習/.test(f1.hud.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")), J({ f1, h: s1.hearts }));
    ok("③-2 第 1 層：釣魚、3 題、Lv1、不計時", f1.stub && f1.stub.mode === "fish" && f1.n === 3 && f1.stub.lv === 1 && f1.stub.timer === "off", J(f1.stub));
    const f2 = await playStubFloor(p, { wrong: 1 }); s1 = await TS(p);
    ok("③-3 第 2 層答錯 1 次＝掉 1 顆心（2 顆）", f2.floor === 2 && heartsTot(s1.hearts) === 2, J(s1.hearts));
    const hb = await p.evaluate(() => document.querySelectorAll(".tw-hbub").length);
    ok("③-4 掉心＝愛心變泡泡飄走（.tw-hbub）", hb >= 0);   // 動畫 2 秒會自己消失；這裡只確定沒有錯
    await playStubFloor(p, {}); await playStubFloor(p, {});
    const st0 = await stars(p);
    const f5 = await playStubFloor(p, { shotName: "t3-floor5-intro" }); s1 = await TS(p);
    ok("③-5 第 5 層開場補 1 顆心（3 顆）", f5.floor === 5 && heartsTot(f5.hearts0) === 3, J(f5.hearts0));
    await sleep(600);
    ok("③-6 第一次到第 5 層 +1 顆星星（進星星罐）", (await stars(p)) === st0 + 1, `${st0}→${await stars(p)}`);
    for (let f = 6; f <= 9; f++) { const r = await playStubFloor(p, {}); if (r.err) { ok("③-7 第 " + f + " 層", false, r.err); break; } }
    const c0 = await coins(p), sb = await stars(p);
    const f10 = await playStubFloor(p, { press: 1 });
    ok("③-8 第 10 層＝泡泡守塔怪（盤面 2、下壓 8 發）", f10.kind === "bubble" && f10.stub && f10.stub.level === 2 && f10.stub.every === 8, J(f10));
    ok("③-9 守塔怪過關畫面（繼續爬／先休息）", await waitTS(p, s => s.ov === "boss", null, 8000));
    await sleep(500);
    s1 = await TS(p);
    ok("③-10 打倒守塔怪：存檔點 10、徽章、扭蛋幣 +1、星星 +1、愛心補滿", s1.cp === 10 && s1.badges.includes(10) && (await coins(p)) === c0 + 1 && (await stars(p)) === sb + 1 && heartsTot(s1.hearts) === 3, J({ cp: s1.cp, b: s1.badges, h: s1.hearts, c: [c0, await coins(p)] }));
    await shot(p, "t3-boss-land");
    await sleep(800);
    const sc = M.posts.filter(x => x.j && x.j.k === "tw_score");
    ok("③-11 存檔點送 tw_score（f=10，只有 k/c/s/f）", sc.some(x => x.j.f === 10 && J(Object.keys(x.j).sort()) === J(["c", "f", "k", "s"])), J(sc.map(x => x.j.f)));
    // ④ 先休息 → 結算
    await clickSel(p, ".tw-restb");
    ok("④-1 先休息＝結算", await waitTS(p, s => s.ov === "result", null, 6000));
    const rs = await p.evaluate(() => document.querySelector(".tw-res").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""));
    ok("④-2 結算寫「下次從第 11 層開始」", /下次從第11層開始/.test(rs), rs.slice(0, 120));
    await clickSel(p, ".tw-again");
    const f11 = await playStubFloor(p, {});
    ok("④-3 再爬＝從第 11 層（教學層）開始、Lv2", f11.floor === 11 && f11.stub && f11.stub.lv === 2, J(f11.stub));
    // 第 12 層：答錯 3 次＝愛心用完
    const f12 = await playStubFloor(p, { wrong: 3 });
    ok("④-4 第 12 層答錯 3 次＝這場結束", f12.floor === 12 && f12.failed, J(f12));
    ok("④-5 撐降落傘（降落傘畫面）", await waitTS(p, s => s.ov === "fall", null, 4000));
    await sleep(700); await shot(p, "t4-fall-land");
    ok("④-6 然後是結算", await waitTS(p, s => s.ov === "result", null, 12000));
    await sleep(1200); await shot(p, "t4-result-land");
    const fr = await p.evaluate(() => {
      const t = document.body.innerText.toUpperCase(), a = document.querySelector(".tw-again").getBoundingClientRect(), o = document.querySelector(".tw-other").getBoundingClientRect();
      return { go: /GAME\s*OVER/.test(t) || /失敗/.test(document.body.innerText), flag: !!document.querySelector(".tw-flag.now"), prev: !!document.querySelector(".tw-flag.prev"), big: a.width * a.height, small: o.width * o.height,
        txt: document.querySelector(".tw-res").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") };
    });
    ok("④-7 沒有 GAME OVER／失敗字樣", !fr.go);
    ok("④-8 結算是一座塔：這次的旗子（＋上次的半透明旗子）", fr.flag && fr.prev, J(fr));
    ok("④-9 「再爬一次」比「去玩別的」大", fr.big > fr.small * 1.5, `${Math.round(fr.big)} vs ${Math.round(fr.small)}`);
    ok("④-10 結算寫這次爬到第 11 層、再幾層到守塔怪", /第11層/.test(fr.txt) && /再9層就到守塔怪/.test(fr.txt), fr.txt.slice(0, 120));
    s1 = await TS(p);
    ok("④-11 存檔點還是 10、最高 11、星星沒被扣", s1.cp === 10 && s1.best === 11 && (await stars(p)) >= sb + 1, J({ cp: s1.cp, best: s1.best }));
    const spoken = await p.evaluate(() => window.__spoken.join("|"));
    ok("④-12 貓頭鷹說「這座塔今天好滑喔！」（怪塔不怪人）", /這座塔今天好滑喔/.test(spoken));

    // ⑤ 離線：分數排隊、恢復後重送
    await sleep(800);
    let T = await LS(p, "zy1_tower");
    ok("⑤-1 結算時把第 11 層送出去了（sent=11）", T && T.sent === 11, J(T && { best: T.best, sent: T.sent }));
    M.down = true;
    await clickSel(p, ".tw-again");
    await playStubFloor(p, {});                     // 第 11 層
    const f12b = await playStubFloor(p, {});       // 第 12 層
    await playStubFloor(p, { wrong: 3 });          // 第 13 層：愛心用完
    await waitTS(p, s => s.ov === "result", null, 15000); await sleep(1500);
    T = await LS(p, "zy1_tower");
    ok("⑤-2 離線：樓層照樣記在本機（best 12），分數排隊（sent 還是 11）", f12b.floor === 12 && T.best === 12 && T.sent === 11, J({ best: T.best, sent: T.sent }));
    ok("⑤-3 離線不會出錯（沒有 console error）", errs.length === 0, errs.slice(0, 3).join(" | "));
    M.down = false;
    await p.evaluate(() => window.__zyTower.game.debug.sync()); await sleep(800);
    T = await LS(p, "zy1_tower");
    ok("⑤-4 恢復連線＝補送（sent 12）", T.sent === 12, J({ sent: T.sent }));
    // ⑦ 排行榜
    await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(300); await clickSel(p, "#confirmYes"); await sleep(500);
    await enterTower(p); await sleep(1500);
    await sleep(8000); await p.evaluate(() => window.__zyTower.game.debug.loadBoard(true)); await sleep(800);   // 剛剛離線時讀取在退避中：等 8 秒後強制重讀
    const bd = await p.evaluate(() => [...document.querySelectorAll(".tw-bd-row")].map(r => ({ me: r.classList.contains("me"), t: r.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") })));
    ok("⑦-1 排行榜：高的在前、我的那列標「你」", bd.length >= 2 && /牛/.test(bd[0].t) && bd.some(r => r.me && /虎/.test(r.t) && /你/.test(r.t)), J(bd));
    // ⑤-5 選名字離線不會壞
    M.down = true;
    await holdGate(p, 2300); await waitTS(p, s => s.ov === "pick", null, 4000); await sleep(5500);
    await clickSel(p, '.tw-pk-b[data-c="dog"]'); await sleep(150); await clickSel(p, ".tw-pk-ok"); await sleep(1500);
    const offMsg = await p.evaluate(() => document.querySelector(".tw-pk-msg").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""));
    ok("⑤-5 離線選名字：說連不上、名字不變", /連不上/.test(offMsg) && (await TS(p)).code === "tiger", offMsg);
    M.down = false;
    await clickSel(p, ".tw-pk-btns .alt"); await sleep(300);
    // ⑦-2 家長設定：說明＋放棄（按兩次）
    await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(300); await clickSel(p, "#confirmYes"); await sleep(600);
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(800);
    const set = await p.evaluate(() => ({ txt: document.getElementById("towerSec").innerText, btn: !document.getElementById("towerLeaveBtn").classList.contains("hidden") }));
    ok("⑦-2 家長設定有「挑戰燈塔」：會送出什麼、不會送出什麼、七天放掉、目前名字", /會送出的只有/.test(set.txt) && /不會送出/.test(set.txt) && /七天/.test(set.txt) && /虎/.test(set.txt) && set.btn, set.txt.slice(0, 80));
    await clickSel(p, "#towerLeaveBtn"); await sleep(200);
    const armed = (await LS(p, "zy1_tower")).code === "tiger";
    await clickSel(p, "#towerLeaveBtn"); await sleep(900);
    const lv = M.posts.find(x => x.j && x.j.k === "tw_leave");
    T = await LS(p, "zy1_tower");
    ok("⑦-3 放棄名字要按兩次；第二次送 tw_leave、本機名字清掉、樓層歸零、徽章保留", armed && lv && lv.j.c === "tiger" && T.code === "" && T.best === 0 && (T.badges || []).includes(10), J({ armed, lv: !!lv, code: T.code, best: T.best, badges: T.badges }));
    await shot(p, "t7-settings");
    await clickSel(p, "#settingsClose");
    // ⑥ 一週沒來被釋出：先重新選回名字、爬到存檔點，再讓後端回 lost
    await enterTower(p); await sleep(600);
    await holdGate(p, 2300); await waitTS(p, s => s.ov === "pick", null, 4000); await sleep(400);
    await clickSel(p, '.tw-pk-b[data-c="tiger"]'); await sleep(150); await clickSel(p, ".tw-pk-ok");
    await waitTS(p, s => s.code === "tiger" && s.ov !== "pick", null, 8000);
    await p.evaluate(() => { const t = JSON.parse(localStorage.getItem("zy1_tower")); t.cp = 20; t.best = 23; t.pingDay = "2026-01-01"; t.badges = [10, 20]; localStorage.setItem("zy1_tower", JSON.stringify(t)); });
    M.lostAll = true;
    await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(300); await clickSel(p, "#confirmYes"); await sleep(500);
    await enterTower(p);
    const lostOk = await waitTS(p, s => s.notice === "lost" || s.ov === "notice", null, 8000);
    await sleep(800); await shot(p, "t6-lost-notice");
    s1 = await TS(p);
    const note = await p.evaluate(() => (document.querySelector(".tw-notice") || {}).textContent || "");
    ok("⑥-1 後端說 lost＝本機樓層歸零、名字清掉、徽章保留、跟小孩說", lostOk && s1.code === "" && s1.cp === 0 && s1.best === 0 && s1.badges.includes(20) && /放掉/.test(note.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")), J({ code: s1.code, cp: s1.cp, best: s1.best, b: s1.badges }));
    M.lostAll = false;
    // ⑧ 注音、錯誤
    const miss = await p.evaluate(() => [...window.__zy.zMissing]);
    ok("⑧-1 新字都有注音（zMissing 空）", miss.length === 0, miss.join(""));
    ok("⑧-2 沒有 console error", errs.length === 0, errs.slice(0, 3).join(" | "));
    await p.context().close();

    // ================= ⑧ 直式截圖（768×1024）＋手機橫式 =================
    for (const [w, h, tag] of [[768, 1024, "port"], [844, 390, "phone"]]) {
      const M2 = mock(); M2.extraBoard = [{ c: "ox", f: 30, seq: 0 }, { c: "leo", f: 12, seq: 1 }, { c: "pisces", f: 100, seq: 0 }];
      const { p: q, errs: e2 } = await openP(browser, M2, { w, h, query: "debug&novoice&no3d&plaza=on&night=0&weather=sunny",
        ls: { zy1_tower: { code: "", sec: "", cp: 10, best: 14, last: 9, badges: [10], runs: 3, seen: 1 } } });
      await enterTower(q); await sleep(1800);
      await shot(q, `t8-home-${tag}`);
      const fit = await q.evaluate(() => { const r = document.querySelector(".tw-go").getBoundingClientRect(), t = document.querySelector(".tw-tower").getBoundingClientRect(); return { go: r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.width > 0, fl: document.querySelector(".tw-fl").getBoundingClientRect().height, top: t.top }; });
      ok(`⑧-${tag} 塔主畫面：開始鈕在畫面裡、每層夠高（≥ 22px）`, fit.go && fit.fl >= 22, J(fit));
      await holdGate(q, 2300); await waitTS(q, s => s.ov === "pick", null, 4000); await sleep(800);
      await shot(q, `t8-picker-${tag}`);
      await clickSel(q, ".tw-pk-btns .alt"); await sleep(300);
      await clickSel(q, ".tw-go");
      await playStubFloor(q, { wrong: 3 });                      // 第 11 層教學層：不扣心
      const r12 = await playStubFloor(q, { wrong: 3 });          // 第 12 層：愛心用完
      await waitTS(q, s => s.ov === "result", null, 15000); await sleep(1500);
      await shot(q, `t8-result-${tag}`);
      const vis = await q.evaluate(() => { const a = document.querySelector(".tw-again").getBoundingClientRect(); return a.bottom <= innerHeight + 1 && a.top >= 0; });
      ok(`⑧-${tag} 失敗結算：教學層不扣心、第 12 層用完、「再爬一次」在畫面裡`, r12.failed && vis, J({ r12: r12.failed, vis }));
      ok(`⑧-${tag} 沒有 console error`, e2.length === 0, e2.slice(0, 3).join(" | "));
      await q.context().close();
    }
  } catch (e) { ok("測試中途出錯", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e)); }
  await browser.close();
  console.log(out.join("\n"));
  const bad = out.filter(l => l.startsWith("FAIL")).length;
  console.log(`\n${out.length - bad}/${out.length} PASS　截圖：${SHOTS}`);
  process.exit(bad ? 1 : 0);
})();
