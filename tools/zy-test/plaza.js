// 小島同樂廣場（10-12，js/zhuyin-plaza.js）測試：node tools/zy-test/plaza.js
// 後端一律用 page.route 攔截 Apps Script 網址回假資料（不碰正式後端）。驗：
//  ⓪ 週次算法跟後端 tools/plaza/gas/Code.js 一模一樣（三年逐小時＋每個週一 00:00 前後 1 毫秒）、分批、資料檢查
//  ① 讀字週：玩一局釣魚 → 結算小字「＋8」→ 合併送出（只有 {w,k,n,i} 四欄、text/plain、沒有預檢）→ 待送清空、自己的貢獻記在本機
//  ② 收集週（星星）、救援週（泡泡救出幾隻）各實際玩一局
//  ③ 送失敗會留著重送（500／busy；同一筆用同一個 i 重送）、回應掉了（後端其實加了）重送只加一次、bad_week 丟掉、超過 10 拆批、每 30 秒自動送
//  ④ 家長關掉：零請求、🎪 收起來、待送清掉；再打開會讀
//  ⑤ 加油貼紙：點一下聽、再按一次送、每天 3 張、隔天重算
//  ⑥ 慶祝：銅＝氣球、銀＝煙火、金＝獎盃；貓頭鷹「大家一起做到了！」；換週介紹主題、裝飾收掉、上週記進本機紀錄
//  ⑦ 換週寬限：週一 00:05 上週的照送、00:15 丟掉
//  ⑧ 離線（500／逾時）、?no3d：遊戲照常、廣場顯示「連不上」、沒有程式錯誤
//  ⑨ 🎪 位置：橫式／直式／手機／4:3（含繼續玩）不跟其他按鈕重疊、浮標不被擋
//  ⑩ 本機／自動化瀏覽器沒加 ?plaza=on：完全不連線
//  ⑪ 壞資料：zy_plaza_hist 不是陣列、後端回的 reached／prev.reached 不在 0–3 → 不出錯（壞的回應當沒讀到）
const path = require("path"), fs = require("fs"), vm = require("vm");
const { pathToFileURL } = require("url");
const { launch, URL } = require("./lib");
const ROOT = path.resolve(__dirname, "../..");
const out = []; const ok = (name, cond, info = "") => { out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = o => JSON.stringify(o);
const strip = s => String(s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const CORS = { "access-control-allow-origin": "*" };
const GOALS = { rescue: [50, 150, 300], deliver: [40, 120, 240], fish: [60, 180, 360], read: [150, 450, 900], star: [100, 300, 600] };

let PZ;   // js/zhuyin-plaza.js（node 直接 import 純函式）
const theme = key => ({ key, title: "x", unit: "x", desc: "x", goals: GOALS[key].slice() });
// 假後端：跟 Code.js 一樣的回應格式；POST 照週次規則收（本週；換週後 10 分鐘內收上週）
function mock(W, key = "read", total = 100) {
  const M = { gmode: "ok", pmode: "ok", log: [], posts: [], gets: 0, nowFn: null, prevTotals: {}, ids: new Set(), dup: 0,
    d: { ok: true, w: W, theme: theme(key), total, plays: 0, cheers: [0, 0, 0, 0], prev: null, paused: false } };
  const json = (route, o) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: J(o) });
  M.route = async route => {
    const r = route.request(), m = r.method(); M.log.push(m + " " + r.url().slice(0, 60));
    if (m === "GET") {
      M.gets++;
      if (M.gmode === "500") return route.fulfill({ status: 500, headers: CORS, body: "oops" });
      if (M.gmode === "timeout") return route.abort("timedout");
      return json(route, { ...M.d, reached: "badReached" in M ? M.badReached : PZ.levelOf(M.d.total, M.d.theme.goals), now: M.nowFn ? M.nowFn() : Date.now() });
    }
    if (m === "POST") {
      const body = r.postData(), ct = r.headers()["content-type"] || ""; let j = null; try { j = JSON.parse(body); } catch (e) {}
      M.posts.push({ body, ct, j, mode: M.pmode });
      if (M.pmode === "500") return route.fulfill({ status: 500, headers: CORS, body: "oops" });
      if (M.pmode !== "ok" && M.pmode !== "lost") return json(route, { ok: false, why: M.pmode });
      if (j && j.i && M.ids.has(j.i)) { M.dup++; return json(route, { ok: true }); }   // 跟後端一樣：同一個 i 看過＝回 ok、不再加
      if (j && j.i) M.ids.add(j.i);
      const now = M.nowFn ? M.nowFn() : Date.now(), cur = PZ.weekKeyOf(now);
      if (!j || j.w !== M.d.w) {
        if (j && M.d.prev && j.w === M.d.prev.w && j.w === PZ.addWeeks(cur, -1) && now - PZ.weekStartMs(cur) < 10 * 60e3) { M.prevTotals[j.k] = (M.prevTotals[j.k] || 0) + j.n; return json(route, { ok: true }); }
        return json(route, { ok: false, why: "bad_week" });
      }
      if (j.k === "goal") M.d.total += j.n; else if (j.k === "play") M.d.plays += j.n; else M.d.cheers[+j.k.slice(5) - 1] += j.n;
      if (M.pmode === "lost") return route.fulfill({ status: 500, headers: CORS, body: "oops" });   // 後端其實加了、只是回應掉了
      return json(route, { ok: true });
    }
    M.log.push("UNEXPECTED " + m);
    return route.fulfill({ status: 204, headers: CORS, body: "" });
  };
  return M;
}
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, speak(u) { if (u.text.trim()) window.__spoken.push(u.text); setTimeout(() => { u.onend && u.onend(); }, 150); } };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
};
// 開一頁：先掛好攔截再載入；清存檔、塞貼紙（stickers 張）、ls＝額外塞的 localStorage
async function openP(browser, M, { w = 1180, h = 820, query = "debug&plaza=on", stickers = 40, ls = {}, start = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(fakeSpeech);
  await ctx.route(/script\.google(usercontent)?\.com/, M.route);
  const p = await ctx.newPage(), errs = [], netErrs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() !== "error" || /favicon/.test(m.text())) return; if (/Failed to load resource|net::ERR_/.test(m.text())) netErrs.push(m.text().slice(0, 120)); else errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL + (query ? "?" + query : "")); await p.waitForTimeout(300);
  await p.evaluate(({ stickers, ls }) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, JSON.stringify(v));
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, stickers).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", "0");
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, bubble: 1, deliver: 1 }));
    });
  }, { stickers, ls });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
  if (start) { await p.evaluate(() => document.getElementById("startBtn").click()); await p.waitForTimeout(300); }
  return { ctx, p, errs, netErrs };
}
const LS = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const vis = (p, id) => p.evaluate(id => { const e = document.getElementById(id); return !!e && !e.classList.contains("hidden") && getComputedStyle(e).display !== "none"; }, id);
const waitFor = (fn, ms = 8000) => new Promise(res => { const t0 = Date.now(); const tick = () => { if (fn()) res(true); else if (Date.now() - t0 > ms) res(false); else setTimeout(tick, 100); }; tick(); });
const tapOpt = (p, sel) => p.evaluate(sel => { const i = (window.__zy.curOpts || []).findIndex(o => !!o.ok); const b = document.querySelectorAll(sel)[i]; if (!b) return false; b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return true; }, sel);
const resultOn = p => p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 20000 }).then(() => true, () => false);
// 釣魚整局全對（8 題）→ 結算
async function playFish(p) {
  await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
  await p.waitForFunction(() => window.__zy.mode === "fish" && !document.getElementById("fish").classList.contains("hidden") && document.querySelectorAll("#pond .fishBtn").length > 0, null, { timeout: 15000 });
  for (let k = 0; k < 14; k++) {
    if (await p.evaluate(() => !document.getElementById("result").classList.contains("hidden"))) break;
    const i0 = await p.evaluate(() => window.__zy.idx);
    await p.waitForFunction(() => !!window.__zy.curOpts && document.querySelectorAll("#pond .fishBtn").length > 0, null, { timeout: 8000 }).catch(() => {});
    await sleep(250); await tapOpt(p, "#pond .fishBtn");
    await p.waitForFunction(i0 => window.__zy.idx > i0 || !document.getElementById("result").classList.contains("hidden"), i0, { timeout: 12000, polling: 100 }).catch(() => {});
  }
  return resultOn(p);
}
async function skipResult(p) { await sleep(900); await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(600); }
const goMenu = p => p.evaluate(() => document.getElementById("menuBtn").click()).then(() => sleep(500));
const bodyOk = post => !!post.j && J(Object.keys(post.j).sort()) === J(["i", "k", "n", "w"]) && /^[a-z0-9]{6,16}$/.test(post.j.i) && /^text\/plain/.test(post.ct);

(async () => {
  PZ = await import(pathToFileURL(path.join(ROOT, "js/zhuyin-plaza.js")).href);
  const browser = await launch(); const allErrs = [];
  const W = PZ.weekKeyOf(Date.now());
  // ===== ⓪ 純邏輯：跟後端同一套算法 =====
  {
    const sb = {}; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(ROOT, "tools/plaza/gas/Code.js"), "utf8"), sb);
    let bad = 0, n = 0;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 3600e3) { n++; if (sb.weekKeyOf_(t) !== PZ.weekKeyOf(t)) bad++; }
    let wk = "2026-01-05", edges = 0;
    for (let i = 0; i < 160; i++, wk = PZ.addWeeks(wk, 1)) { const s = PZ.weekStartMs(wk); for (const d of [-1, 0, 1]) { edges++; if (sb.weekKeyOf_(s + d) !== PZ.weekKeyOf(s + d)) bad++; } if (PZ.weekStartMs(wk) !== sb.weekStartMs_(wk) || PZ.addWeeks(wk, -1) !== sb.addWeeks_(wk, -1)) bad++; }
    ok("⓪ 週次算法＝後端（三年逐小時＋160 個週一 00:00 前後 1 毫秒）", bad === 0, `${n}+${edges} 點，不同 ${bad}`);
    ok("⓪ 台北週一 00:00 換週：UTC 週日 15:59:59.999→上週、16:00→新的一週", PZ.weekKeyOf(Date.UTC(2026, 9, 18, 15, 59, 59, 999)) === "2026-10-12" && PZ.weekKeyOf(Date.UTC(2026, 9, 18, 16)) === "2026-10-19");
    ok("⓪ 跨年：2027-01-03 台北 23:59 還是 12-28 那週、01-04 00:00 換週", PZ.weekKeyOf(Date.UTC(2027, 0, 3, 15, 59)) === "2026-12-28" && PZ.weekKeyOf(Date.UTC(2027, 0, 3, 16)) === "2027-01-04");
    ok("⓪ 每日貼紙的「今天」用台北日期", PZ.dayKeyOf(Date.UTC(2026, 9, 12, 15, 59)) === "2026-10-12" && PZ.dayKeyOf(Date.UTC(2026, 9, 12, 16)) === "2026-10-13");
    ok("⓪ 上限跟後端一樣（goal 10／play 10／cheer 3）、四張貼紙文字一樣、五個主題一樣", J(PZ.N_MAX) === J(sb.PLAZA.N_MAX) && J(PZ.CHEERS.map(c => c.t)) === J(sb.PLAZA.CHEERS) && J(PZ.KINDS.slice().sort()) === J(sb.PLAZA.ROTATION.slice().sort()));
    const sp = PZ.splitPosts("2026-10-12", { read: 45, rescue: 9, play: 12, cheer2: 5 }, "read");
    ok("⓪ 合併後拆批：讀 45＝10×4＋5、玩 12＝10＋2、貼紙 5＝3＋2，非主題的不送", J(sp.map(x => [x.k, x.n])) === J([["goal", 10], ["goal", 10], ["goal", 10], ["goal", 10], ["goal", 5], ["play", 10], ["play", 2], ["cheer2", 3], ["cheer2", 2]]), J(sp));
    ok("⓪ 主題還不知道：只送玩幾局／貼紙", J(PZ.splitPosts("2026-10-12", { read: 4, play: 1 }, null).map(x => x.k)) === J(["play"]));
    const good = { ok: true, w: W, theme: theme("read"), total: 3, reached: 0, plays: 1, cheers: [0, 0, 0, 0], prev: null, paused: false, now: 1 };
    ok("⓪ 回應檢查：好的收、壞的（主題亂填、cheers 少一格、ok:false）不收", PZ.validData(good) && !PZ.validData({ ...good, theme: { ...good.theme, key: "zzz" } }) && !PZ.validData({ ...good, cheers: [0, 0, 0] }) && !PZ.validData({ ok: false, why: "server" }));
    const pv = { w: PZ.addWeeks(W, -1), theme: theme("star"), total: 320, reached: 2 };
    ok("⓪ 回應檢查（里維建議 6）：reached／prev.reached 不在 0–3（7、-1、1.5、\"2\"、沒有）＝壞資料；0–3 都收", [0, 1, 2, 3].every(v => PZ.validData({ ...good, reached: v, prev: { ...pv, reached: v } })) && [7, -1, 1.5, "2", undefined, null].every(v => !PZ.validData({ ...good, reached: v }) && !PZ.validData({ ...good, prev: { ...pv, reached: v } })) && !PZ.validData({ ...good, prev: "x" }));
    ok("⓪ 段數：100→0、150→1、899→2、900→3", PZ.levelOf(100, [150, 450, 900]) === 0 && PZ.levelOf(150, [150, 450, 900]) === 1 && PZ.levelOf(899, [150, 450, 900]) === 2 && PZ.levelOf(900, [150, 450, 900]) === 3);
  }
  // ===== ① 讀字週：玩一局釣魚 =====
  {
    const M = mock(W, "read", 100);
    const { ctx, p, errs } = await openP(browser, M);
    const got = await waitFor(() => M.gets >= 1, 6000);
    ok("① 開始玩後讀一次這週進度（GET）", got, `gets=${M.gets}`);
    await p.waitForFunction(t => (window.__spoken || []).some(x => (typeof x === "string" ? x : x.text) === t), PZ.LINES.intro.read, { timeout: 8000 }).catch(() => {});   // 排在打招呼後面講
    const i1 = await p.evaluate(() => ({ info: window.__zy.plaza.info(), guide: document.getElementById("guideText").textContent, spoken: window.__spoken.map(x => typeof x === "string" ? x : x.text), btn: getComputedStyle(document.getElementById("plazaBtn")).display, news: document.getElementById("plazaBtn").classList.contains("news") }));
    ok("① 讀到：讀字週、還沒到銅、🎪 看得到而且有小紅標", i1.info.key === "read" && i1.info.lv === 0 && i1.btn !== "none" && i1.news, J(i1.info));
    ok("① 第一次讀到這週：貓頭鷹介紹本週主題", strip(i1.guide).includes("讀字週") && i1.spoken.includes(PZ.LINES.intro.read), J({ g: strip(i1.guide), s: i1.spoken.slice(-3) }));
    M.posts.length = 0;
    const fin = await playFish(p);
    ok("① 釣魚 8 題全對 → 結算", fin);
    await skipResult(p);
    const note = await p.evaluate(() => { const e = document.querySelector("#result > .pz-note"); if (!e) return null; const r = e.getBoundingClientRect(), j = document.getElementById("hatchHint").getBoundingClientRect(), b = document.getElementById("resultBtns").getBoundingClientRect(), hit = (a, c) => a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
      return { t: e.textContent, inView: r.left >= 0 && r.bottom <= innerHeight + 1 && r.width > 0, jar: hit(r, j), btns: hit(r, b), pos: getComputedStyle(e).position }; });
    ok("① 結算左下小字：「🎪 ＋8 已經算進大家的進度囉！」、在畫面內、不壓到星星罐和按鈕", note && strip(note.t).includes("＋8已經算進大家的進度囉") && note.inView && !note.jar && !note.btns && note.pos === "absolute", J(note));
    const sent = await waitFor(() => M.posts.length >= 2, 8000);
    const posts = M.posts.map(x => x.j);
    ok("① 結算後合併送出：讀字＋8（一筆）、開始一局＋1", sent && posts.some(j => j && j.k === "goal" && j.n === 8 && j.w === W) && posts.some(j => j && j.k === "play" && j.n === 1) && posts.length === 2, J(posts));
    ok("① 送出的內容只有 {w,k,n} 三欄、Content-Type text/plain、沒有 CORS 預檢", M.posts.every(bodyOk) && !M.log.some(l => /^OPTIONS|UNEXPECTED/.test(l)), J(M.posts.map(x => [x.ct, x.body])));
    await sleep(500);
    const pend = await LS(p, "zy_plaza_pending"), mine = await LS(p, "zy_plaza_mine");
    ok("① 送完待送清空", !pend || Object.keys(pend).length === 0, J(pend));
    ok("① 自己的貢獻只記在本機（讀 8、釣魚 8、星星 3）", mine && mine.w === W && mine.s["1"].read === 8 && mine.s["1"].fish === 8 && mine.s["1"].star === 3, J(mine));
    await goMenu(p);
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(2200);
    const card = await p.evaluate(() => ({ open: !document.getElementById("plaza").classList.contains("hidden"), num: document.querySelector(".pz-num").textContent, mine: document.querySelector(".pz-mine").textContent, name: document.querySelector(".pz-name").textContent, news: document.getElementById("plazaBtn").classList.contains("news") }));
    ok("① 打開廣場：大家 108 題（100＋8）、你這週幫忙了 8 題、讀字週", card.open && card.num === "108" && strip(card.mine).includes("你這週幫忙了8題") && strip(card.name) === "讀字週", J(card));
    ok("① 打開看過 → 🎪 小紅標消失", !card.news);
    ok("① 沒有錯誤", errs.length === 0, errs.join(" | ")); allErrs.push(...errs);
    await ctx.close();
  }
  // ===== ② 收集週（星星）、救援週（泡泡）=====
  {
    const M = mock(W, "star", 10);
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(800); M.posts.length = 0;
    await playFish(p); await skipResult(p);
    const stars = await p.evaluate(() => document.querySelectorAll("#resultStars .star.on").length);
    await waitFor(() => M.posts.some(x => x.j && x.j.k === "goal"), 8000);
    const g = M.posts.map(x => x.j).filter(j => j && j.k === "goal");
    ok("② 收集週：送出的是結算拿到的星星數", stars >= 1 && g.length === 1 && g[0].n === stars, J({ stars, g }));
    allErrs.push(...errs); ok("② 收集週沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    const M = mock(W, "rescue", 10);
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(800); M.posts.length = 0;
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click());
    const ready = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 20000 }).then(() => true, () => false);
    let shots = 0; while (ready && shots < 8 && !(await vis(p, "result"))) { const r = await p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); if (!b) return null; if (b.swap) g.debug.swap(); g.debug.aim(b.angle); return g.debug.fire(); }); shots++; await sleep(2500); if (r === null) break; }
    const won = await resultOn(p); await skipResult(p);
    const rescued = await p.evaluate(() => { const m = document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "").match(/救出(\d+)隻/); return m ? +m[1] : 0; });
    await waitFor(() => M.posts.some(x => x.j && x.j.k === "goal"), 8000);
    const g = M.posts.map(x => x.j).filter(j => j && j.k === "goal");
    ok("② 救援週：泡泡過關 → 送出的是救出的動物數", won && rescued >= 1 && g.length === 1 && g[0].n === rescued, J({ shots, rescued, g }));
    allErrs.push(...errs); ok("② 救援週沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ③ 送失敗重送、bad_week 丟掉、合併、拆批、每 30 秒自動送 =====
  {
    const M = mock(W, "read", 0);
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(600);
    const P = (fn, arg) => p.evaluate(fn, arg);
    M.pmode = "500"; M.posts.length = 0;
    await P(() => { window.__zy.plaza.add("read", 5); });
    const r1 = await P(() => window.__zy.plaza.flush());
    const pend1 = await LS(p, "zy_plaza_pending"), inf1 = await LS(p, "zy_plaza_inflight");
    ok("③ 後端 500：送失敗 → 那一筆留在「送出中」（讀 5、帶 i），不會不見", r1 === false && M.posts.length === 1 && Array.isArray(inf1) && inf1.length === 1 && inf1[0].k === "goal" && inf1[0].n === 5 && inf1[0].i === M.posts[0].j.i && !(pend1 && pend1[W] && pend1[W].read), J({ r1, pend1, inf1, posts: M.posts.map(x => x.j) }));
    M.pmode = "busy";
    await P(() => { window.__zy.plaza.debug.S.back = 0; });
    const r2 = await P(() => window.__zy.plaza.flush());
    ok("③ 後端 busy：也留著；重送用同一個 i、同樣的數量", r2 === false && M.posts.length === 2 && M.posts[1].j.i === M.posts[0].j.i && M.posts[1].j.n === 5 && (await LS(p, "zy_plaza_inflight")).length === 1, J(M.posts.map(x => x.j)));
    M.pmode = "ok"; const t0 = M.d.total;
    await P(() => { window.__zy.plaza.add("read", 3); window.__zy.plaza.debug.S.back = 0; });
    const r3 = await P(() => window.__zy.plaza.flush());
    const okPosts = M.posts.filter(x => x.mode === "ok").map(x => x.j);
    ok("③ 恢復後：先用同一個 i 重送卡住的 5，再送新的 3（新的 i）；合計只加 8", r3 === true && okPosts.length === 2 && okPosts[0].n === 5 && okPosts[0].i === M.posts[0].j.i && okPosts[1].n === 3 && okPosts[1].i !== okPosts[0].i && M.d.total === t0 + 8, J({ okPosts, total: M.d.total }));
    ok("③ 送完待送、送出中都清空", Object.keys((await LS(p, "zy_plaza_pending")) || {}).length === 0 && (await LS(p, "zy_plaza_inflight")) === null);
    // 回應掉了（後端其實加了、前端收到 500）：重送同一個 i → 後端認得、不再加
    M.pmode = "lost"; M.posts.length = 0; const t1 = M.d.total, dup0 = M.dup;
    await P(() => { window.__zy.plaza.add("read", 4); });
    const r5 = await P(() => window.__zy.plaza.flush());
    M.pmode = "ok"; await P(() => { window.__zy.plaza.debug.S.back = 0; });
    const r6 = await P(() => window.__zy.plaza.flush());
    ok("③ 回應掉了（後端已加 4、前端以為失敗）→ 同一個 i 重送 → 只加一次（合計 +4）、送出中清空", r5 === false && r6 === true && M.posts.length === 2 && M.posts[0].j.i === M.posts[1].j.i && M.d.total === t1 + 4 && M.dup === dup0 + 1 && (await LS(p, "zy_plaza_inflight")) === null, J({ posts: M.posts.map(x => x.j), total: M.d.total, t1, dup: M.dup }));
    // 送出中＝還沒確定送到：廣場上的數字照樣算進去（不會倒退）；重新整理後也接著送
    await P(() => window.__zy.plaza.refresh(true));      // 先讀一次後端現在的合計（顯示＝後端合計＋待送＋送出中）
    M.pmode = "500"; M.posts.length = 0;
    await P(() => { window.__zy.plaza.add("read", 6); window.__zy.plaza.debug.S.back = 0; });
    await P(() => window.__zy.plaza.flush());
    const shown = await P(() => window.__zy.plaza.debug.view().total);
    ok("③ 送出中的 6 也算進顯示的數字（後端 " + M.d.total + "＋6）", shown === M.d.total + 6, J({ shown, total: M.d.total }));
    M.pmode = "ok"; const iLost = M.posts[0].j.i, t2 = M.d.total; M.posts.length = 0;
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
    await p.evaluate(() => document.getElementById("startBtn").click());
    await p.evaluate(() => { window.__zy.plaza.debug.S.back = 0; return window.__zy.plaza.flush(); });
    ok("③ 重新整理後：送出中的那筆用同一個 i 接著送、合計 +6", M.posts.some(x => x.j && x.j.i === iLost && x.j.n === 6) && M.d.total === t2 + 6 && (await LS(p, "zy_plaza_inflight")) === null, J({ posts: M.posts.map(x => x.j), total: M.d.total, t2 }));
    M.posts.length = 0;
    await P(() => { window.__zy.plaza.add("read", 45); });
    await P(() => window.__zy.plaza.flush());
    ok("③ 一次 45 → 拆成 10＋10＋10＋10＋5（後端一次最多 10）、每筆 i 都不一樣", J(M.posts.map(x => x.j.n)) === J([10, 10, 10, 10, 5]) && new Set(M.posts.map(x => x.j.i)).size === 5 && M.posts.every(bodyOk), J(M.posts.map(x => x.j)));
    M.pmode = "bad_week"; M.posts.length = 0;
    await P(() => { window.__zy.plaza.add("read", 2); });
    const r4 = await P(() => window.__zy.plaza.flush());
    ok("③ 後端說 bad_week：丟掉不重送（待送、送出中都清掉）", M.posts.length === 1 && Object.keys((await LS(p, "zy_plaza_pending")) || {}).length === 0 && (await LS(p, "zy_plaza_inflight")) === null, J({ r4, pend: await LS(p, "zy_plaza_pending") }));
    M.pmode = "ok"; M.posts.length = 0;
    await P(() => { window.__zy.plaza.add("read", 2); });
    const auto = await waitFor(() => M.posts.length >= 1, 33000);
    ok("③ 沒有主動送：30 秒內自動合併送出", auto && M.posts[0].j.n === 2, J(M.posts.map(x => x.j)));
    allErrs.push(...errs); ok("③ 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ④ 家長關掉：零請求 =====
  {
    const M = mock(W, "read", 160);
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(1500);
    const before = await p.evaluate(() => window.__hub3d ? window.__hub3d.cele().lv : -1);
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); });
    await sleep(300);
    const sec = await p.evaluate(() => { const s = document.getElementById("plazaSec"); return s ? s.textContent : ""; });
    ok("④ 家長頁有「同樂廣場」說明：送什麼（週次、主題、數量）、不送什麼（名字、裝置代號、個人成績、位置）", ["週次", "主題", "數量", "名字", "裝置代號", "個人成績", "位置"].every(w => sec.includes(w)) && await p.evaluate(() => document.querySelector("#plazaOpts .opt.on")?.dataset.v === "1"));
    await p.evaluate(() => { window.__zy.plaza.add("read", 3); document.querySelector('#plazaOpts .opt[data-v="0"]').click(); document.getElementById("settingsClose").click(); });
    await sleep(400); M.log.length = 0;
    const off = await p.evaluate(() => ({ btn: getComputedStyle(document.getElementById("plazaBtn")).display, pend: localStorage.getItem("zy_plaza_pending"), cache: localStorage.getItem("zy_plaza_cache"), on: localStorage.getItem("zy_plaza_on"), cele: window.__hub3d ? window.__hub3d.cele().lv : -1 }));
    ok("④ 關掉：🎪 收起來、待送和讀過的數字都清掉、小島慶祝收掉", off.btn === "none" && off.pend === null && off.cache === null && off.on === "0" && off.cele === 0 && before === 1, J({ off, before }));
    await playFish(p); await skipResult(p); await goMenu(p);
    const tried = await p.evaluate(async () => { const z = window.__zy.plaza; z.add("read", 4); const a = await z.refresh(true), b = await z.flush(), c = z.open(); return { a, b, c }; });
    await sleep(3000);
    ok("④ 關掉後玩一局＋硬叫讀取／送出／打開：零請求", M.log.length === 0 && tried.a === null && tried.b === false && tried.c === false, J({ log: M.log, tried }));
    ok("④ 關掉後也不記待送", (await p.evaluate(() => localStorage.getItem("zy_plaza_pending"))) === null);
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector('#plazaOpts .opt[data-v="1"]').click(); document.getElementById("settingsClose").click(); });
    const back = await waitFor(() => M.gets >= 2, 5000);
    ok("④ 再打開：馬上讀一次、🎪 回來", back && (await p.evaluate(() => getComputedStyle(document.getElementById("plazaBtn")).display)) !== "none");
    allErrs.push(...errs); ok("④ 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ⑤ 加油貼紙 =====
  {
    const M = mock(W, "read", 30); M.d.cheers = [5, 0, 2, 1];
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(1500);
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(1200);
    const tap = i => p.evaluate(i => document.querySelectorAll(".pz-stk")[i].click(), i);
    const st = () => p.evaluate(() => ({ left: window.__zy.plaza.cheerLeft(), armed: [...document.querySelectorAll(".pz-stk")].map(b => b.classList.contains("armed")), cnt: [...document.querySelectorAll(".pz-pn")].map(n => n.textContent), spoken: window.__spoken.slice(-3).map(x => typeof x === "string" ? x : x.text), used: document.querySelector(".plaza-card").classList.contains("used"), leftText: document.querySelector(".pz-left").textContent }));
    await p.evaluate(() => { window.__spoken = []; });
    await tap(0); await sleep(300); const a = await st();
    ok("⑤ 點一下：唸貼紙內容、亮起「再按一次送出」、還沒送", a.armed[0] && a.spoken.includes("我來玩了！") && a.left === 3 && a.cnt[0] === "×5", J(a));
    await tap(0); await sleep(900); const b = await st();
    ok("⑤ 再按一次：送出（今天剩 2 張）、牆上數字 ×5→×6", !b.armed[0] && b.left === 2 && b.cnt[0] === "×6", J(b));
    await tap(1); await sleep(200); await tap(1); await sleep(400); await tap(2); await sleep(200); await tap(2); await sleep(900);
    const c = await st();
    ok("⑤ 送滿 3 張：今天送完了（貼紙變灰、顯示明天再來送）", c.left === 0 && c.used && strip(c.leftText).includes("明天再來送"), J(c));
    await p.evaluate(() => { window.__spoken = []; });
    await tap(3); await sleep(200); await tap(3); await sleep(500);
    const d = await st(), pend = await LS(p, "zy_plaza_pending");
    ok("⑤ 第 4 張：不送、說「今天的貼紙送完了，明天再來送！」", d.cnt[3] === "×1" && d.spoken.includes(PZ.LINES.used) && !(pend && pend[W] && pend[W].cheer4), J({ d, pend }));
    await waitFor(() => M.posts.filter(x => x.j && /^cheer/.test(x.j.k)).length >= 3, 8000);
    const ch = M.posts.map(x => x.j).filter(j => j && /^cheer/.test(j.k)).map(j => j.k + ":" + j.n).sort();
    ok("⑤ 送出：cheer1／cheer2／cheer3 各 1（每台每天 3 張）", J(ch) === J(["cheer1:1", "cheer2:1", "cheer3:1"]) && M.posts.every(bodyOk), J(ch));
    await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("zy_plaza_cheer")); c.d = "2000-01-01"; localStorage.setItem("zy_plaza_cheer", JSON.stringify(c)); });
    ok("⑤ 隔天：又可以送 3 張", (await p.evaluate(() => window.__zy.plaza.cheerLeft())) === 3);
    allErrs.push(...errs); ok("⑤ 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ⑥ 慶祝＋換週 =====
  {
    const M = mock(W, "read", 100);
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(1800);
    const cele = () => p.evaluate(() => window.__hub3d ? window.__hub3d.cele() : null);
    const say = () => p.evaluate(() => ({ g: document.getElementById("guideText").textContent, s: window.__spoken.map(x => typeof x === "string" ? x : x.text), news: document.getElementById("plazaBtn").classList.contains("news") }));
    const c0 = await cele();
    const calls = async () => { let m = 1e9; for (let i = 0; i < 6; i++) { m = Math.min(m, await p.evaluate(() => window.__hub3d.stats().calls)); await sleep(150); } return m; };   // 寵物走來走去會讓 draw call 跳：取最小值
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 20000 }).catch(() => {}); await sleep(1500);   // 建築模型都載完、整島合併後再量
    await p.evaluate(() => window.__hub3d.events(false));   // 10-12：關掉隨機失火／生病（貓頭鷹會說「失火了！」蓋掉要檢查的對話框）
    const calls0 = await calls();
    ok("⑥ 還沒到銅：小島沒有慶祝裝飾", c0 && c0.lv === 0 && c0.balloons === 0 && !c0.trophy, J(c0));
    await p.evaluate(() => { window.__spoken = []; });
    M.d.total = 160; await p.evaluate(() => window.__zy.plaza.refresh(true)); await sleep(1500);
    const c1 = await cele(), s1 = await say();
    ok("⑥ 到銅：小島飄氣球（30 顆）", c1.lv === 1 && c1.balloons === 30 && !c1.trophy, J(c1));
    ok("⑥ 第一次看到銅：貓頭鷹「大家一起做到了！」＋連放煙火、🎪 小紅標", strip(s1.g).includes("大家一起做到了") && s1.s.includes(PZ.LINES.reached[1]) && c1.fw && s1.news, J({ g: strip(s1.g), s: s1.s }));
    await p.evaluate(() => { window.__spoken = []; }); await p.evaluate(() => window.__zy.plaza.refresh(true)); await sleep(800);
    ok("⑥ 同一段不重複宣布", !(await say()).s.some(t => t.includes("大家一起做到了")));
    M.d.total = 460; await p.evaluate(() => window.__zy.plaza.refresh(true)); await sleep(1200);
    const c2 = await cele();
    ok("⑥ 到銀：氣球＋煙火", c2.lv === 2 && c2.balloons === 30 && c2.fw, J(c2));
    M.d.total = 950; await p.evaluate(() => window.__zy.plaza.refresh(true)); await sleep(1200);
    await p.waitForFunction(l => window.__spoken.some(x => (typeof x === "string" ? x : x.text) === l), PZ.LINES.reached[3], { timeout: 6000, polling: 100 }).catch(() => {});   // 10-12：宣布句排在銀牌那句後面（700ms＋等前一句講完），headless 每秒約 8 格時實測 2～3.7 秒才講
    const c3 = await cele(), s3 = await say();
    ok("⑥ 到金：主島中央金色獎盃（氣球、煙火也在）", c3.lv === 3 && c3.trophy && c3.balloons === 30 && c3.fw && s3.s.includes(PZ.LINES.reached[3]), J(c3));
    const calls3 = await calls();
    ok("⑥ 效能：金段全開（氣球＋煙火＋獎盃）只多 ≤ 12 個 draw call", calls3 - calls0 <= 12, J({ calls0, calls3 }));
    // 換週：伺服器時間到下週一 00:01、主題換救援、上週結果 950（金）
    const W2 = PZ.addWeeks(W, 1);
    M.d = { ok: true, w: W2, theme: theme("rescue"), total: 0, plays: 0, cheers: [0, 0, 0, 0], prev: { w: W, theme: theme("read"), total: 950, reached: 3 }, paused: false };
    M.nowFn = () => PZ.weekStartMs(W2) + 60e3;
    await p.evaluate(() => { window.__spoken = []; }); await p.evaluate(() => window.__zy.plaza.refresh(true)); await sleep(1500);
    await p.waitForFunction(l => window.__spoken.some(x => (typeof x === "string" ? x : x.text) === l), PZ.LINES.intro.rescue, { timeout: 6000, polling: 100 }).catch(() => {});   // 同上：排隊的介紹句可能晚 2～3 秒
    const c4 = await cele(), s4 = await say(), hist = await LS(p, "zy_plaza_hist");
    ok("⑥ 換週：慶祝裝飾收掉、貓頭鷹介紹本週主題（救援週）", c4.lv === 0 && !c4.trophy && c4.balloons === 0 && strip(s4.g).includes("救援週") && s4.s.includes(PZ.LINES.intro.rescue), J({ c4, g: strip(s4.g) }));
    ok("⑥ 上週結果記在本機（讀字週、金、950、你幫了多少）", Array.isArray(hist) && hist.some(h => h.w === W && h.lv === 3 && h.total === 950 && h.key === "read"), J(hist));
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(1500);
    const prevT = await p.evaluate(() => document.querySelector(".pz-prev").textContent);
    ok("⑥ 廣場卡片：上週讀字週大家拿到金牌", strip(prevT).includes("上週讀字週") && strip(prevT).includes("金牌"), strip(prevT));
    allErrs.push(...errs); ok("⑥ 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ⑦ 換週寬限 =====
  {
    const W1 = PZ.addWeeks(W, 1), W0 = W;
    const M = mock(W1, "deliver", 0); M.d.prev = { w: W0, theme: theme("read"), total: 10, reached: 0 };
    M.nowFn = () => PZ.weekStartMs(W1) + 5 * 60e3;   // 週一 00:05
    const { ctx, p, errs } = await openP(browser, M, { ls: { zy_plaza_pending: { [W0]: { read: 4, fish: 9, play: 2 } } } });
    await waitFor(() => M.gets >= 1, 6000); await sleep(800);
    await p.evaluate(() => { window.__zy.plaza.debug.S.back = 0; return window.__zy.plaza.flush(); });
    await waitFor(() => M.posts.length >= 2, 5000);
    const ps = M.posts.map(x => x.j).filter(Boolean);
    ok("⑦ 週一 00:05：上週沒送完的照送（w＝上週、只送上週主題的讀字 4＋玩 2）", ps.length === 2 && ps.every(j => j.w === W0) && ps.some(j => j.k === "goal" && j.n === 4) && ps.some(j => j.k === "play" && j.n === 2) && M.prevTotals.goal === 4, J(ps));
    M.posts.length = 0; M.nowFn = () => PZ.weekStartMs(W1) + 15 * 60e3;   // 週一 00:15
    await p.evaluate(w0 => { localStorage.setItem("zy_plaza_pending", JSON.stringify({ [w0]: { read: 3 } })); }, W0);
    await p.evaluate(() => window.__zy.plaza.refresh(true));
    await p.evaluate(() => { window.__zy.plaza.debug.S.back = 0; return window.__zy.plaza.flush(); }); await sleep(600);
    ok("⑦ 週一 00:15：超過寬限的上週待送丟掉、不送", M.posts.length === 0 && Object.keys((await LS(p, "zy_plaza_pending")) || {}).length === 0, J({ posts: M.posts.map(x => x.j), pend: await LS(p, "zy_plaza_pending") }));
    allErrs.push(...errs); ok("⑦ 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ⑧ 離線（500／逾時）、?no3d =====
  for (const gm of ["500", "timeout"]) {
    const M = mock(W, "read", 0); M.gmode = gm; M.pmode = "500";
    const { ctx, p, errs, netErrs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(1500);
    await p.evaluate(() => { window.__spoken = []; document.getElementById("plazaBtn").click(); }); await sleep(1500);
    const c = await p.evaluate(() => ({ name: document.querySelector(".pz-name").textContent, desc: document.querySelector(".pz-desc").textContent, nodata: document.querySelector(".plaza-card").classList.contains("nodata"), s: window.__spoken.map(x => typeof x === "string" ? x : x.text) }));
    ok(`⑧ 後端 ${gm}：廣場顯示「連不上／等一下再看大家的進度」、說「連不上，等一下再看！」`, c.nodata && strip(c.name) === "連不上" && strip(c.desc).includes("等一下再看") && c.s.includes(PZ.LINES.offline), J(c));
    await p.evaluate(() => document.querySelector(".pz-close").click()); await sleep(300);
    const fin = await playFish(p);
    ok(`⑧ 後端 ${gm}：遊戲照常玩完一局`, fin);
    await skipResult(p);
    ok(`⑧ 後端 ${gm}：結算沒有「已經算進大家」小字（從沒連上、不知道主題）`, !(await p.evaluate(() => !!document.querySelector("#result .pz-note"))));
    ok(`⑧ 後端 ${gm}：沒有程式錯誤（只有瀏覽器記的連線失敗 ${netErrs.length} 則）`, errs.length === 0, errs.join(" | "));
    allErrs.push(...errs);
    await ctx.close();
  }
  {
    const M = mock(W, "read", 20);
    const { ctx, p, errs } = await openP(browser, M, { query: "debug&plaza=on&no3d" });
    await waitFor(() => M.gets >= 1, 6000); await sleep(800);
    const b = await p.evaluate(() => ({ inBottom: !!document.querySelector("#menu > .menu-bottom > #plazaBtn"), disp: getComputedStyle(document.getElementById("plazaBtn")).display, hub: document.body.classList.contains("hub-off") }));
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(1200);
    ok("⑧ ?no3d（卡片選單）：🎪 在下面那排、點了打開廣場", b.inBottom && b.disp !== "none" && b.hub && await vis(p, "plaza"), J(b));
    ok("⑧ ?no3d：沒有錯誤", errs.length === 0, errs.join(" | ")); allErrs.push(...errs);
    await ctx.close();
  }
  // ===== ⑨ 🎪 位置 =====
  for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"], [390, 844, "M"], [1024, 768, "43"]]) {
    const M = mock(W, "read", 20);
    const { ctx, p, errs } = await openP(browser, M, { w, h, stickers: 64 });
    await p.evaluate(() => import("./js/zhuyin-words.js").then(({ WORDS }) => { localStorage.setItem("zy1_resume", JSON.stringify({ mode: "fish", idx: 2, results: [3, 3], combo: 2, earned: [], words: WORDS.slice(0, 10).map(x => [x.h, 1]), t: Date.now() })); }));
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(2500);
    await p.waitForFunction(() => !window.__hub3d || window.__hub3d.fitOk, null, { timeout: 8000 }).catch(() => {});
    await sleep(600);
    const r = await p.evaluate(() => {
      const me = document.getElementById("plazaBtn"), q = me.getBoundingClientRect(), ids = ["#hudLBtn", "#hudRBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#resumeBtn", "#albumBtn", "#menu .menu-bottom .jarBtn", "#guide > img", "#guideText", "#owlPeek"];
      const hit = [], inView = q.left >= -1 && q.top >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1 && q.width > 20;
      for (const s of ids) { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === "none") continue; const b = e.getBoundingClientRect(); if (b.width < 1) continue; if (q.left < b.right - 1 && q.right > b.left + 1 && q.top < b.bottom - 1 && q.bottom > b.top + 1) hit.push(s); }
      const tags = []; for (const tg of document.querySelectorAll(".hub-tag:not(.civic):not(.rb)")) { if (getComputedStyle(tg).visibility === "hidden") continue; const b = tg.getBoundingClientRect(); if (q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top) tags.push(tg.dataset.mode); }
      return { where: me.parentNode.id || me.parentNode.className, rect: [q.left, q.top, q.width, q.height].map(Math.round), inView, hit, tags, resume: !document.getElementById("resumeBtn").classList.contains("hidden") };
    });
    ok(`⑨ ${t} ${w}×${h}：🎪 在畫面內、不跟其他按鈕／貓頭鷹重疊、浮標沒被擋（繼續玩有出現）`, r.inView && r.hit.length === 0 && r.tags.length === 0 && r.resume, J(r));
    ok(`⑨ ${t} 沒有錯誤`, errs.length === 0, errs.join(" | ")); allErrs.push(...errs);
    await ctx.close();
  }
  // ===== ⑩ 沒加 ?plaza=on（本機／自動化瀏覽器）：完全不連線 =====
  {
    const M = mock(W, "read", 20);
    const { ctx, p, errs } = await openP(browser, M, { query: "debug" });
    await sleep(2500);
    await p.evaluate(() => { window.__zy.plaza.add("read", 2); document.getElementById("plazaBtn").click(); return window.__zy.plaza.flush(); });
    await sleep(1500);
    ok("⑩ 本機測試沒加 ?plaza=on：零請求（不灌正式後端）", M.log.length === 0 && (await p.evaluate(() => window.__zy.plaza.debug.netOK)) === false, J(M.log));
    allErrs.push(...errs); ok("⑩ 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ⑪ 壞資料（里維建議 6）=====
  for (const bad of [{ x: 1 }, "abc", 5, [null, "x", { w: PZ.addWeeks(W, -1), mine: "zzz" }]]) {
    // zy_plaza_hist 被弄壞（不是陣列／裡面有怪東西）＋後端有上週結果 → 打開廣場要畫「上週」那欄，不能出錯
    const M = mock(W, "read", 20); M.d.prev = { w: PZ.addWeeks(W, -1), theme: theme("star"), total: 320, reached: 2 };
    const { ctx, p, errs } = await openP(browser, M, { ls: { zy_plaza_hist: bad } });
    await waitFor(() => M.gets >= 1, 6000); await sleep(800);
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(1200);
    const c = await p.evaluate(() => ({ open: !document.getElementById("plaza").classList.contains("hidden"), prev: document.querySelector(".pz-prev") && document.querySelector(".pz-prev").textContent, nodata: document.querySelector(".plaza-card").classList.contains("nodata") }));
    ok(`⑪ zy_plaza_hist 壞掉（${J(bad)}）：打開廣場照常、上週結果照常顯示、沒有錯誤`, c.open && !c.nodata && strip(c.prev).includes("上週收集週") && errs.length === 0, J({ c, errs }));
    allErrs.push(...errs); await ctx.close();
  }
  for (const [tag, set] of [["reached 7", M => { M.badReached = 7; }], ["prev.reached 9", M => { M.d.prev = { w: PZ.addWeeks(W, -1), theme: theme("star"), total: 320, reached: 9 }; }], ["reached -1", M => { M.badReached = -1; }]]) {
    // 後端回的段數不在 0–3 → 整份當沒讀到（不拿 MEDALS[7] 去畫）：廣場顯示「連不上」、小島不掛慶祝、沒有錯誤
    const M = mock(W, "read", 20); set(M);
    const { ctx, p, errs } = await openP(browser, M);
    await waitFor(() => M.gets >= 1, 6000); await sleep(800);
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(1200);
    const c = await p.evaluate(() => ({ nodata: document.querySelector(".plaza-card").classList.contains("nodata"), name: document.querySelector(".pz-name").textContent, lv: window.__zy.plaza.info().lv, cache: localStorage.getItem("zy_plaza_cache") }));
    ok(`⑪ 後端回 ${tag}：當壞資料（不存快取、廣場顯示連不上、小島沒有慶祝）、沒有錯誤`, c.nodata && strip(c.name) === "連不上" && c.lv === 0 && c.cache === null && errs.length === 0, J({ c, errs }));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
