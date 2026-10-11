// 寵物換裝接進主程式的測試（10-12）：node tools/zy-test/dress-game.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 DRESS_GAME_SHOTS（預設 %TEMP%\zy-dress-game）。
// 驗：①小島上的寵物照存檔穿（超級預設皇冠＋披風、玩家自選優先、寶寶頭上空著＝小芽）
//     ②圖鑑「動物朋友」分頁有「👗 換裝」→ 開換裝（開夥伴、3D 小島停止渲染、換裝音樂、上方按鈕收起來）
//     ③穿脫會存檔；沒拿到的格子角落有 🚚／扭蛋膠囊圖、點了用說的 ④「穿好了」回圖鑑、音樂換回來、WebGL 釋放
//     ⑤卡片右上角 👗 開那一隻 ⑥回小島：寵物身上真的掛著剛穿的 ⑦彩虹島服裝店（貼紙 ≥20）→ 換裝 → 關掉還在彩虹島、身上換好
//     ⑧扭蛋抽到配件：顯示配件圖＋「拿到X了！」、不會變成點心、存進衣櫃 ⑨家長頁機率＝RW.oddsText()（跟 GACHA_ODDS 一致）
//     ⑩重開頁面穿著還在 ⑪備份碼還原後穿著還在 ⑫?no3d 也能從圖鑑換裝 ⑬全程 0 個 console error、新字都有注音
const { launch, openGame } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const SHOTS = process.env.DRESS_GAME_SHOTS || path.join(os.tmpdir(), "zy-dress-game");
fs.mkdirSync(SHOTS, { recursive: true });
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&night=0&weather=sunny";
const allErrs = [];
const J = x => JSON.stringify(x);

// 存檔：小熊（夥伴，長大）、小兔（寶寶）、小貓（超級、沒選＝預設）、小狐狸（長大）、小狗（超級、自己選帽子＋脫掉披風）
const SEED = { pets: { bear: 2, bunny: 1, cat: 3, fox: 2, dog: 3 }, extra: ["wings", "flower_crown"], wear: { dog: { head: "hat", back: null } } };
async function seed(p, s = SEED) {
  await p.evaluate(async s => {
    const RW = await import("./js/zhuyin-rewards.js?v=2");   // 跟主程式同一個 ?v（同一份模組）
    const rw = RW.migrate({ rewards: JSON.parse(localStorage.getItem("zy1_rewards") || "null") || undefined });
    rw.pets = {}; for (const [id, st] of Object.entries(s.pets)) rw.pets[id] = { stage: st, t: st === 3 ? 120 : st === 2 ? 30 : 0 };
    rw.partner = "bear"; for (const id of s.extra || []) RW.giveWear(rw, id);
    rw.wear = JSON.parse(JSON.stringify(s.wear || {}));
    if (s.coins != null) rw.coins = s.coins;
    if (s.decorAll) rw.decor = RW.DECOR.map(d => d.id);
    rw.pity = { rare: 0, ssr: 0 };
    localStorage.setItem("zy1_rewards", JSON.stringify(rw));
  }, s);
  await reopen(p);
}
async function reopen(p) {
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await sleep(300); await p.evaluate(() => { window.__spoken = []; });
}
const hubReady = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).then(() => sleep(600));
const worn = (p, id) => p.evaluate(id => window.__hub3d && window.__hub3d.worn(id), id);
// 等到這隻身上掛的配件＝want（排序後）
const waitWorn = (p, id, want, ms = 15000) => p.waitForFunction(([id, w]) => { const r = window.__hub3d && window.__hub3d.worn(id); return r && r.items.join() === w; }, [id, [...want].sort().join()], { timeout: ms }).then(() => true, () => false);
const DS = p => p.evaluate(() => window.__zy.dress ? window.__zy.dress.debug.state() : null);
const dReady = p => p.evaluate(() => window.__zy.dress && window.__zy.dress.debug.ready());
const rwSave = p => p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rewards") || "null"));
const spoken = p => p.evaluate(() => window.__spoken.map(s => s.text));
const want = p => p.evaluate(() => window.__zyAudio ? window.__zyAudio.debug().want : "?");
const shot = (p, name, clip) => p.screenshot({ path: path.join(SHOTS, name + ".png"), ...(clip ? { clip } : {}) });
// 3D 小島：找點得到某棟建築的螢幕座標（跟 rainbow.js 一樣）
const spot = (p, m) => p.evaluate(m => {
  const h = window.__hub3d, c = h.screenOf(m);
  for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
    const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r, e = document.elementFromPoint(x, y);
    if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === m) return { x, y };
  }
  return null;
}, m);
const tap3d = async (p, m) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (s) { await p.mouse.click(s.x, s.y); return s; } await sleep(500); } return null; };
const dressOpen = p => p.waitForFunction(() => !document.getElementById("dress").classList.contains("hidden") && window.__zy.dress && window.__zy.dress.debug.state().open, null, { timeout: 15000 }).then(() => true, () => false);
const glCount = () => { window.__gl = { made: 0, lost: 0 }; const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { const had = this.__glc; const c = g.call(this, t, ...a); if (c && /webgl/.test(t) && !had) { this.__glc = c; window.__gl.made++; this.addEventListener("webglcontextlost", () => { window.__gl.lost++; }, { once: true }); } return c; }; };

(async () => {
  const browser = await launch();
  // ===== A. 主流程（1180×820，貼紙 40 張＝彩虹島開著）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: Q });
    await ctx.addInitScript(glCount);
    await seed(p); await hubReady(p);
    // ① 小島上的穿著
    const w1 = await Promise.all([waitWorn(p, "cat", ["crown", "cape"]), waitWorn(p, "dog", ["hat"]), waitWorn(p, "bunny", ["baby_tuft"]), waitWorn(p, "bear", [])]);
    ok("① 小島：超級小貓沒選＝皇冠＋披風", w1[0], J(await worn(p, "cat")));
    ok("① 小島：超級小狗自己選了帽子、脫掉披風 → 只有帽子（玩家自選優先）", w1[1], J(await worn(p, "dog")));
    ok("① 小島：寶寶小兔頭上空著＝小芽；小熊沒穿＝空", w1[2] && w1[3], J([await worn(p, "bunny"), await worn(p, "bear")]));

    // ② 圖鑑 → 動物朋友 → 👗 換裝
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(900);
    ok("② 貼紙分頁：沒有「換裝」鈕", await p.evaluate(() => document.getElementById("dressBtn").classList.contains("hidden")));
    await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(700);
    const ab = await p.evaluate(() => { const b = document.getElementById("dressBtn"), r = b.getBoundingClientRect(); return { vis: !b.classList.contains("hidden") && r.width > 0, h: Math.round(r.height), badges: document.querySelectorAll("#albumGrid .pet-card .pc-dress").length, inView: r.right <= innerWidth && r.top >= 0 }; });
    ok("② 動物朋友分頁：右上有「👗 換裝」（≥56px 高、在畫面內）、5 張收集到的卡都有 👗 小鈕", ab.vis && ab.h >= 56 && ab.inView && ab.badges === 5, J(ab));
    // 寧次 10-12：白字配粉底只有 1.9:1 → 深莓紅字 #7a1f45（5.2:1）、拿掉字陰影
    const bc = await p.evaluate(() => { const cs = getComputedStyle(document.getElementById("dressBtn")); return { color: cs.color, bg: cs.backgroundColor, shadow: cs.textShadow }; });
    const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (Math.max(lum(bc.color), lum(bc.bg)) + 0.05) / (Math.min(lum(bc.color), lum(bc.bg)) + 0.05);
    ok("② 「👗 換裝」鈕：深莓紅字、對比 ≥4.5、沒有字陰影", bc.color === "rgb(122, 31, 69)" && cr >= 4.5 && bc.shadow === "none", J({ ...bc, cr: +cr.toFixed(2) }));
    await shot(p, "album-pets");
    await p.click("#dressBtn");
    const op = await dressOpen(p); await dReady(p); await sleep(400);
    let s = await DS(p);
    const env = await p.evaluate(() => ({ hubRun: window.__hub3d.running, onDress: document.body.classList.contains("on-dress"), hud: getComputedStyle(document.getElementById("hudL")).display, album: document.getElementById("album").classList.contains("hidden"), from: window.__zy.dressFrom, canv: document.querySelectorAll("#dress canvas").length }));
    ok("② 開換裝：畫面打開、預設夥伴小熊、寵物列 5 隻（照圖鑑順序）", op && s.pet === "bear" && s.pets.join() === "bear,bunny,cat,fox,dog", J(s && { pet: s.pet, pets: s.pets }));
    ok("② 開換裝：3D 小島停止渲染、圖鑑收起來、上方 🏠🎵 收起來、3D 預覽有畫面", !env.hubRun && env.onDress && env.hud === "none" && env.album && env.canv === 1 && s.gl && s.frames > 0, J({ ...env, gl: s.gl, frames: s.frames }));
    ok("② 開換裝：放換裝音樂", (await want(p)) === "dress", await want(p));

    // ③ 穿：翅膀（背上）＋花圈（頭上）；沒拿到的皇冠點了只說話
    await p.click('.dr-item[data-id="wings"]'); await dReady(p);
    await p.click('.dr-item[data-id="flower_crown"]'); await dReady(p);
    s = await DS(p); let sv = await rwSave(p);
    ok("③ 穿翅膀＋花圈：3D 預覽掛上、存檔 wear.bear 寫進去", s.worn.join() === "flower_crown,wings" && sv.wear.bear && sv.wear.bear.back === "wings" && sv.wear.bear.head === "flower_crown", J({ worn: s.worn, save: sv.wear.bear }));
    const tiles = await p.evaluate(() => { const g = id => { const t = document.querySelector(`.dr-item[data-id="${id}"]`), e = t.querySelector(".dr-get"), cap = e && e.querySelector("img"); return { lock: t.classList.contains("lock"), icons: e ? e.textContent + (cap ? "[" + cap.src.split("/").pop() + "]" : "") : "", vis: e ? getComputedStyle(e).display !== "none" : false, txt: /[㐀-鿿]/.test(t.textContent), old: !!t.querySelector(".dr-hint") }; };
      return { crown: g("crown"), cape: g("cape"), hat: g("hat"), wings: g("wings") }; });
    ok("③ 沒拿到的格子：皇冠角落 🚚＋扭蛋膠囊圖（不再用 🎰）、披風只有 🚚；拿到的（帽子、翅膀）不顯示；格子裡不放字", tiles.crown.lock && tiles.crown.vis && tiles.crown.icons === "🚚[capsule_blue.webp]" && tiles.cape.icons === "🚚" && tiles.cape.vis && !tiles.hat.vis && !tiles.wings.vis && !tiles.crown.old && !Object.values(tiles).some(t => t.txt), J(tiles));
    await p.evaluate(() => { window.__spoken = []; });
    await p.click('.dr-item[data-id="crown"]'); await sleep(300);
    await p.click('.dr-item[data-id="cape"]'); await sleep(300);
    const sp3 = await spoken(p); sv = await rwSave(p);
    ok("③ 點沒拿到的：說「送貨或扭蛋…」（皇冠）、「去送貨…」（披風），沒有穿上", sp3.includes("送貨或扭蛋，都可以拿到喔！") && sp3.includes("去送貨，就可以拿到喔！") && sv.wear.bear.head === "flower_crown" && !sv.wear.bear.side, J(sp3));
    await shot(p, "dress-1180x820");

    // ④ 穿好了 → 回圖鑑
    await p.click(".dr-done"); await sleep(1200);
    const back = await p.evaluate(() => ({ album: !document.getElementById("album").classList.contains("hidden"), pets: document.getElementById("albumGrid").classList.contains("pet-grid"), dress: document.getElementById("dress").classList.contains("hidden"), kids: document.getElementById("dress").children.length, onDress: document.body.classList.contains("on-dress"), from: window.__zy.dressFrom, gl: window.__gl }));
    ok("④ 穿好了：回到圖鑑動物朋友分頁、換裝畫面清空、WebGL 釋放", back.album && back.pets && back.dress && back.kids === 0 && !back.onDress && back.from === "" && back.gl.lost >= 1, J(back));
    ok("④ 音樂換回小島的", ["island", "night", "rainbow", "town"].includes(await want(p)), await want(p));

    // ⑤ 小貓卡片右上角 👗 → 直接開小貓（超級：皇冠＋披風打勾、沒擁有也能穿）
    const partner0 = (await rwSave(p)).partner;
    await p.evaluate(() => { const c = [...document.querySelectorAll("#albumGrid .pet-card")].find(x => x.querySelector(".pc-n") && x.querySelector(".pc-n").textContent.includes("貓")); c.querySelector(".pc-dress").click(); });
    await dressOpen(p); await dReady(p); s = await DS(p);
    ok("⑤ 卡片 👗：開的是小貓、超級預設皇冠＋披風、夥伴沒有被換掉", s.pet === "cat" && s.worn.join() === "cape,crown" && (await rwSave(p)).partner === partner0, J({ pet: s.pet, worn: s.worn, partner: (await rwSave(p)).partner }));
    await p.click(".dr-done"); await sleep(900);

    // ⑥ 回小島：小熊身上真的有翅膀＋花圈
    await p.evaluate(() => document.getElementById("albumBack").click()); await sleep(800);
    const w6 = await waitWorn(p, "bear", ["flower_crown", "wings"]);
    ok("⑥ 回小島：3D 小島上的小熊穿著花圈＋翅膀（場景裡掛在牠身上）", w6 && (await p.evaluate(() => window.__hub3d.running)), J(await worn(p, "bear")));

    // ⑦ 彩虹島服裝店
    await p.evaluate(() => document.getElementById("rainbowBtn").click()); await sleep(3600);
    ok("⑦ 飛到彩虹島", (await p.evaluate(() => window.__hub3d.rainbow().place)) === "rainbow");
    const sr = await tap3d(p, "dress");
    const op7 = await dressOpen(p); await dReady(p);
    ok("⑦ 點服裝店 → 打開換裝畫面（夥伴小熊）、3D 小島停止渲染、換裝音樂", !!sr && op7 && (await DS(p)).pet === "bear" && !(await p.evaluate(() => window.__hub3d.running)) && (await want(p)) === "dress", J({ sr, op7 }));
    await p.click('.dr-item[data-id="hat"]'); await dReady(p);   // 頭上：花圈 → 帽子
    await p.click('.dr-pet[data-id="fox"]'); await dReady(p);
    await p.click('.dr-item[data-id="bow"]'); await dReady(p);  // 小狐狸：蝴蝶結
    await p.click(".dr-done"); await sleep(1200);
    const st7 = await p.evaluate(() => ({ menu: !document.getElementById("menu").classList.contains("hidden"), place: window.__hub3d.rainbow().place, run: window.__hub3d.running, guide: !document.getElementById("guide").classList.contains("hidden"), rb: !document.getElementById("rainbowBtn").classList.contains("hidden") }));
    ok("⑦ 穿好了：回到小島選單、還在彩虹島（沒有被送回主島）、小島繼續渲染", st7.menu && st7.place === "rainbow" && st7.run && st7.guide && st7.rb, J(st7));
    ok("⑦ 音樂換回彩虹島的", (await want(p)) === "rainbow", await want(p));
    const w7 = await Promise.all([waitWorn(p, "bear", ["hat", "wings"]), waitWorn(p, "fox", ["bow"])]);
    ok("⑦ 小島上：小熊換成帽子＋翅膀、小狐狸戴蝴蝶結", w7[0] && w7[1], J([await worn(p, "bear"), await worn(p, "fox")]));
    // 服裝店浮標也開得了
    const ts = await p.evaluate(() => window.__hub3d.tagRect("dress")); await p.mouse.click((ts.x0 + ts.x1) / 2, (ts.y0 + ts.y1) / 2);
    ok("⑦ 點服裝店浮標 → 也打開換裝", await dressOpen(p));
    await dReady(p); await p.click(".dr-done"); await sleep(900);

    // ⑨ 家長頁機率
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(500);
    const od = await p.evaluate(async () => {
      const RW = await import("./js/zhuyin-rewards.js?v=2"), O = RW.GACHA_ODDS, pc = x => Math.round(x * 100) + "%";
      const lines = [...document.querySelectorAll("#rwOdds > div")].map(d => d.textContent), all = lines.join("");
      const need = [pc(O.common.rate), pc(O.rare.rate), pc(O.ssr.rate), ...O.common.decor.map(id => RW.DECOR.find(d => d.id === id).name), ...O.common.wear.map(id => RW.WEAR_BY_ID[id].name), ...O.ssr.pets.map(id => RW.PET[id].name),
        `第 ${O.pity.rare} 次一定稀有`, `第 ${O.pity.ssr} 次一定超稀有`, `點心 ${O.dupTreats} 個`, `+${O.common.otherwise.amount}`, `${O.rare.pets.length} 隻`];
      const lead = lines.slice(0, 4).map(s => (s.match(/^(\d+)%/) || [])[1]).join();   // 寧次 10-12：每一項的實際機率放段首（35／35／25／5）
      return { same: J(lines) === J(RW.oddsText()), miss: need.filter(t => !all.includes(t)), old: document.getElementById("settings").textContent.includes("超稀有（金色，小恐龍／小鯨魚／彩虹小龍）5%") || all.includes("一半機會"), n: lines.length, lead };
      function J(x) { return JSON.stringify(x); }
    });
    ok("⑨ 家長頁機率＝RW.oddsText()、數字和名單都跟 GACHA_ODDS 一致、各項實際百分比放段首（35／35／25／5）、舊的「一半機會」寫法拿掉了", od.same && od.miss.length === 0 && !od.old && od.n === 6 && od.lead === "35,35,25,5", J(od));
    await p.evaluate(() => document.getElementById("settingsClose").click()); await sleep(300);

    // ⑩ 重開頁面：穿著還在
    await reopen(p); await hubReady(p);
    const w10 = await Promise.all([waitWorn(p, "bear", ["hat", "wings"]), waitWorn(p, "fox", ["bow"]), waitWorn(p, "cat", ["crown", "cape"])]);
    ok("⑩ 重開頁面：小熊帽子＋翅膀、小狐狸蝴蝶結、小貓皇冠＋披風都還在", w10.every(Boolean), J([await worn(p, "bear"), await worn(p, "fox"), await worn(p, "cat")]));

    // ⑪ 備份碼：匯出 → 把穿著弄掉 → 還原 → 重開還在
    const code = await p.evaluate(() => window.__zyB.exportCode());
    await p.evaluate(() => { const r = JSON.parse(localStorage.getItem("zy1_rewards")); r.wear = {}; r.closet = ["hat", "bow"]; localStorage.setItem("zy1_rewards", JSON.stringify(r)); });
    await reopen(p); await hubReady(p);
    const gone = await waitWorn(p, "bear", []);
    const res = await p.evaluate(c => window.__zyB.importCode(c), code);
    await reopen(p); await hubReady(p);
    sv = await rwSave(p);
    const w11 = await waitWorn(p, "bear", ["hat", "wings"]);
    ok("⑪ 備份碼還原：穿著與衣櫃回來（存檔＋小島）", gone && res === "ok" && sv.wear.bear.head === "hat" && sv.wear.bear.back === "wings" && sv.closet.includes("wings") && w11, J({ gone, res, wear: sv.wear.bear, closet: sv.closet }));

    // 截圖：小島上 3 隻穿不同配件的寵物特寫（小熊 帽子＋翅膀、小貓 皇冠＋披風、小狐狸 蝴蝶結；另外給小狗花圈＋背包）
    await p.evaluate(() => { const r = JSON.parse(localStorage.getItem("zy1_rewards")); for (const id of ["party_hat", "backpack", "flower", "cape_rainbow"]) if (!r.closet.includes(id)) r.closet.push(id); r.wear.fox = { head: "party_hat", side: "flower", back: "backpack" }; r.wear.dog = { head: "flower_crown", back: "cape_rainbow" }; localStorage.setItem("zy1_rewards", JSON.stringify(r)); });
    await reopen(p); await hubReady(p);
    await Promise.all([waitWorn(p, "bear", ["hat", "wings"]), waitWorn(p, "fox", ["party_hat", "flower", "backpack"]), waitWorn(p, "dog", ["flower_crown", "cape_rainbow"]), waitWorn(p, "cat", ["crown", "cape"])]);
    await p.evaluate(() => { window.__hub3d.tags(false); document.getElementById("guide").classList.add("hidden"); });
    const crops = [];
    for (const id of ["bear", "fox", "dog", "cat"]) {
      await p.evaluate(id => window.__hub3d.petFocus(id, 4.2), id); await sleep(900);
      const c = await p.evaluate(id => window.__hub3d.petScreen(id), id);
      if (!c) continue;
      const clip = { x: Math.max(0, Math.min(1180 - 300, c.x - 150)), y: Math.max(0, Math.min(820 - 300, c.y - 175)), width: 300, height: 300 };
      await shot(p, "island-pet-" + id, clip); crops.push(id);
    }
    ok("截圖：小島寵物特寫（4 隻）", crops.length === 4, crops.join());
    allErrs.push(...errs); await ctx.close();
  }

  // ===== B. 扭蛋抽到配件（固定亂數：普通獎 → 給東西 → 池子裡唯一沒拿到的派對帽）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: Q });
    const RWs = { ...SEED, coins: 1, decorAll: true, extra: ["wings", "flower_crown", "crown", "flower", "backpack"] };
    await seed(p, RWs); await hubReady(p);
    await p.evaluate(() => document.querySelector("#menu .jarBtn").click());
    await p.waitForFunction(() => !document.getElementById("gacha").classList.contains("hidden"), null, { timeout: 10000 }).catch(() => {});
    await sleep(400); await p.evaluate(() => { window.__spoken = []; });
    await p.evaluate(() => { const q = [0.9, 0.1, 0.0], orig = Math.random; Math.random = () => (q.length ? q.shift() : orig()); document.getElementById("gachaGo").click(); setTimeout(() => { Math.random = orig; }, 0); });
    await p.waitForFunction(() => document.getElementById("gachaCap").classList.contains("drop"), null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => document.getElementById("gachaCap").click());
    await p.waitForFunction(() => !document.getElementById("gachaPrize").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
    await sleep(700);
    const g = await p.evaluate(() => { const b = document.getElementById("gachaPrize"), i = b.querySelector("img"); return { img: i ? i.getAttribute("src") : "", ok: i ? i.complete && i.naturalWidth > 0 : false, text: b.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), cap: ["common", "rare", "ssr"].find(t => document.getElementById("gachaCap").className.includes(t)) || document.getElementById("gachaCap").className }; });
    const sv = await rwSave(p), sp = await spoken(p);
    ok("⑧ 扭蛋抽到配件：顯示派對帽的圖、「拿到派對帽了！」", g.img === "IMAGE/zhuyin/wear_party_hat.webp" && g.ok && g.text.includes("拿到派對帽了！"), J(g));
    ok("⑧ 不是點心：沒有「點心」字樣、點心數沒變、配件存進衣櫃", !g.text.includes("點心") && sv.closet.includes("party_hat") && sv.treats === 0 && sv.coins === 0, J({ closet: sv.closet, treats: sv.treats, coins: sv.coins }));
    ok("⑧ 唸「拿到派對帽了！」", sp.includes("拿到派對帽了！"), J(sp));
    await shot(p, "gacha-wear");
    await p.evaluate(() => document.getElementById("gachaClose").click()); await sleep(400);
    // 抽到的派對帽：換裝畫面裡能穿
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(800);
    await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(600);
    await p.click("#dressBtn"); await dressOpen(p); await dReady(p);
    ok("⑧ 換裝畫面：派對帽變成可以穿的", await p.evaluate(() => !document.querySelector('.dr-item[data-id="party_hat"]').classList.contains("lock")));
    await p.click(".dr-done"); await sleep(600);
    allErrs.push(...errs); await ctx.close();
  }

  // ===== C. 換裝畫面截圖：直式 768×1024（含旁注音檢查）＋ iPad 橫式 1024×768 =====
  for (const [w, h] of [[768, 1024], [1024, 768]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 40, query: Q });
    await seed(p); await hubReady(p);
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(800);
    await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(600);
    if (w < h) await shot(p, `album-pets-${w}x${h}`);
    await p.click("#dressBtn"); await dressOpen(p); await dReady(p);
    await p.click('.dr-item[data-id="wings"]'); await dReady(p); await sleep(2600);   // 等轉到看得到背上、碎片散掉
    const L = await p.evaluate(() => { const r = e => e.getBoundingClientRect(), inV = b => b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5;
      const t = [...document.querySelectorAll(".dr-item")].map(r);
      return { portrait: document.querySelector(".dress").classList.contains("portrait"), tiles: t.every(inV), min: Math.round(Math.min(...t.map(b => b.width))), done: inV(r(document.querySelector(".dr-done"))), miss: [...window.__zy.zMissing].join("") }; });
    ok(`${w}×${h}：換裝畫面版面（直式判斷、格子都在畫面內 ≥56px）`, L.portrait === (h > w) && L.tiles && L.done && L.min >= 56, J(L));
    ok(`${w}×${h}：新字都有注音（zMissing 空）`, L.miss === "", L.miss);
    await shot(p, `dress-${w}x${h}`);
    await p.click(".dr-done"); await sleep(500);
    ok(`${w}×${h}：0 個 console error`, errs.length === 0, errs.join(" | ").slice(0, 300));
    allErrs.push(...errs); await ctx.close();
  }

  // ===== D. ?no3d：卡片選單也能從圖鑑換裝 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug&novoice&no3d" });
    await seed(p);
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(800);
    await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(600);
    await p.click("#dressBtn");
    const op = await dressOpen(p); await dReady(p);
    await p.click('.dr-item[data-id="wings"]'); await dReady(p);
    await p.click(".dr-done"); await sleep(700);
    const st = await p.evaluate(() => ({ album: !document.getElementById("album").classList.contains("hidden"), wear: JSON.parse(localStorage.getItem("zy1_rewards")).wear.bear }));
    ok("⑫ ?no3d：圖鑑 → 換裝 → 穿翅膀 → 回圖鑑、存檔有", op && st.album && st.wear && st.wear.back === "wings", J(st));
    ok("⑫ ?no3d：0 個 console error", errs.length === 0, errs.join(" | ").slice(0, 300));
    allErrs.push(...errs); await ctx.close();
  }

  await browser.close();
  ok("⑬ 全程 0 個 console error", allErrs.length === 0, allErrs.join(" | ").slice(0, 400));
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL / ${out.length}` : `\nALL PASS (${out.length})`);
  console.log("截圖：" + SHOTS);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
