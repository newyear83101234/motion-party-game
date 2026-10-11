// 寵物換裝（js/zhuyin-dress.js）測試：node tools/zy-test/dress.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 DRESS_SHOTS（預設 %TEMP%\zy-dress）。
// 驗：①開啟（3D 預覽在跑、預設寵物）②選寵物（說名字）③穿／同部位替換／再點脫下（存檔、音效、說配件名、3D 掛上／拿掉）
//     ④沒擁有的點了只提示（不穿、不存、抖一下、說「去送貨…」；格子角落 🚚／扭蛋膠囊小圖示；格子不放字、點了預覽區跳大字名牌）⑤超級寵物預設皇冠＋披風、寶寶頭上小芽（戴帽子就換掉）
//     ⑮WebGL 被系統收走：馬上還回來＝照舊 3D、3 秒沒回來＝退回圖片版、收走中關掉＝計時清掉
//     ⑥點寵物會跳、左右拖會轉 ⑦閒置提示 ⑧「穿好了」關閉：onClose 一次、隱藏、停 rAF、canvas 拿掉
//     ⑨重複開關 20 次沒有 WebGL context 洩漏（建立數＝釋放數、沒有 Too many active WebGL contexts）⑩開到一半馬上關不報錯
//     ⑪沒有 WebGL 的圖片版也能穿脫 ⑫三種 iPad 尺寸＋16:9 版面（格子 ≥56px、不超出畫面、預覽與衣櫃不重疊）⑬國字都有注音 ⑭全程 0 個 console error
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/dress-lab.html";
const SHOTS = process.env.DRESS_SHOTS || path.join(os.tmpdir(), "zy-dress");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];

// WebGL context 計數：每建立一個 webgl/webgl2 context 記一筆；收到 webglcontextlost 記一筆
const COUNT_GL = () => {
  window.__gl = { made: 0, lost: 0 };
  const g = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) {
    const had = this.__glc; const c = g.call(this, t, ...a);
    if (c && /webgl/.test(t) && !had) { this.__glc = c; window.__gl.made++; this.addEventListener("webglcontextlost", () => { window.__gl.lost++; }, { once: true }); }
    return c;
  };
};
async function open(browser, w, h, q = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(COUNT_GL);
  const p = await ctx.newPage(); const errs = [], warns = [];
  p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push(`[${w}x${h}] PAGEERR ${e.message}`); });
  p.on("console", m => {
    if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 160)); allErrs.push(`[${w}x${h}] CONSOLE ${m.text().slice(0, 160)}`); }
    if (m.type() === "warning") warns.push(m.text());
  });
  await p.goto(LAB + "?mute=1" + (q ? "&" + q : ""));
  await p.waitForFunction(() => window.__dress && window.__dress.ready, null, { timeout: 15000 });
  await p.evaluate(() => window.__dress.dress.debug.ready());
  return { ctx, p, errs, warns };
}
const S = p => p.evaluate(() => window.__dress.dress.debug.state());
const C = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__dress.calls)));
const ready = p => p.evaluate(() => window.__dress.dress.debug.ready());
const clickTile = (p, id) => p.click(`.dr-item[data-id="${id}"]`);
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });

(async () => {
  const browser = await launch(["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);

  // ===== ①～⑧ 主要操作（1024×768，一開始只有 4 隻起始寵物、衣櫃只有帽子＋蝴蝶結）=====
  {
    const { ctx, p, errs, warns } = await open(browser, 1024, 768);
    let s = await S(p);
    await sleep(500); const s2 = await S(p);
    ok("① 開啟：預設第一隻（小熊）、3D 預覽在跑", s.open && s.pet === "bear" && s.gl && s.raf && s2.frames > s.frames && s.pets.join() === "bear,bunny,cat,fox", JSON.stringify({ pet: s.pet, frames: [s.frames, s2.frames], pets: s.pets }));
    let c = await C(p);
    ok("① 開啟：說「幫寵物換衣服吧！」", c.talk.includes("幫寵物換衣服吧！"), c.talk.join("|"));
    ok("① 衣櫃 10 格、三組（頭上 4／旁邊 2／背上 4），起始只有帽子、蝴蝶結能穿", await p.evaluate(() => {
      const g = [...document.querySelectorAll(".dr-group")].map(x => x.querySelectorAll(".dr-item").length).join();
      const free = [...document.querySelectorAll(".dr-item:not(.lock)")].map(x => x.dataset.id).sort().join();
      return g === "4,2,4" && free === "bow,hat";
    }));

    // ② 選寵物：點寵物列的小貓
    await p.click('.dr-pet[data-id="cat"]'); await ready(p);
    s = await S(p); c = await C(p);
    ok("② 選寵物：換成小貓、說名字、名牌換字", s.pet === "cat" && c.say.includes("小貓") && (await p.textContent(".dr-name")).includes("貓"), JSON.stringify(c.say));
    // 小貓在試玩頁是超級階段 → 沒設定時預設皇冠＋披風（沒擁有也能穿）
    ok("⑤ 超級寵物：沒設定＝皇冠＋披風，3D 有掛上、格子打勾", JSON.stringify(s.wear) === JSON.stringify({ head: "crown", side: null, back: "cape" }) && s.worn.join() === "cape,crown" && await p.evaluate(() => document.querySelector('.dr-item[data-id="crown"]').classList.contains("on") && !document.querySelector('.dr-item[data-id="crown"]').classList.contains("lock")), JSON.stringify(s));
    await p.click('.dr-pet[data-id="bear"]'); await ready(p);

    // ③ 穿：帽子
    const save0 = (await C(p)).save;
    await clickTile(p, "hat"); await ready(p);
    s = await S(p); c = await C(p);
    ok("③ 穿上帽子：存檔、wear 音效、說「帽子」、3D 掛上、格子打勾、跳一下、冒彩色碎片", s.wear.head === "hat" && c.save === save0 + 1 && c.play.includes("wear") && c.say.includes("帽子") && s.worn.join() === "hat" && s.jumping && s.fx > 0 && await p.evaluate(() => document.querySelector('.dr-item[data-id="hat"]').classList.contains("on")), JSON.stringify({ s, save: c.save }));
    ok("③ 存檔內容：rw.wear.bear.head＝hat", await p.evaluate(() => window.__dress.rw.wear.bear.head === "hat"));
    // 寧次 10-12：格子不放字 → 點了預覽區跳大字名牌（≥4.6vmin、有注音的字級底線）約 2 秒
    const wn = await p.evaluate(() => { const e = document.querySelector(".dr-wn"), cs = getComputedStyle(e); return { text: e.textContent, show: e.classList.contains("show"), fs: parseFloat(cs.fontSize), vmin: Math.min(innerWidth, innerHeight) / 100, color: cs.color, inTile: [...document.querySelectorAll(".dr-item")].filter(t => /[㐀-鿿]/.test(t.textContent)).length }; });
    ok("③ 點配件：預覽區跳出大字名牌「帽子」（≥4.6vmin、紫字）；格子裡沒有國字", wn.show && wn.text === "帽子" && wn.fs >= 4.6 * wn.vmin - 0.1 && wn.color === "rgb(106, 74, 168)" && wn.inTile === 0, JSON.stringify(wn));
    // 同部位替換：給皇冠再點皇冠
    await p.evaluate(() => window.__dress.RW.giveWear(window.__dress.rw, "crown"));
    await clickTile(p, "crown"); await ready(p);
    s = await S(p);
    ok("③ 同部位替換：帽子→皇冠（3D 只剩皇冠、帽子格子取消打勾）", s.wear.head === "crown" && s.worn.join() === "crown" && await p.evaluate(() => !document.querySelector('.dr-item[data-id="hat"]').classList.contains("on")), JSON.stringify(s));
    // 不同部位並存：蝴蝶結
    await clickTile(p, "bow"); await ready(p);
    s = await S(p);
    ok("③ 不同部位並存：皇冠＋蝴蝶結", s.worn.join() === "bow,crown" && s.wear.side === "bow", JSON.stringify(s.worn));
    // 再點＝脫下
    const pops0 = (await C(p)).play.filter(x => x === "pop").length;
    await clickTile(p, "crown"); await ready(p);
    s = await S(p); c = await C(p);
    ok("③ 再點一次＝脫下（pop 音效、3D 拿掉、存檔 null）", s.wear.head === null && s.worn.join() === "bow" && c.play.filter(x => x === "pop").length === pops0 + 1 && await p.evaluate(() => window.__dress.rw.wear.bear.head === null), JSON.stringify(s));

    // ④ 沒擁有的：翅膀（只能送貨）、小花（送貨或扭蛋）
    const before = await C(p), w0 = JSON.stringify((await S(p)).wear);
    await clickTile(p, "wings"); await sleep(80);
    const shook = await p.evaluate(() => document.querySelector('.dr-item[data-id="wings"]').classList.contains("shake"));
    const wnL = await p.evaluate(() => { const e = document.querySelector(".dr-wn"); return { text: e.textContent, show: e.classList.contains("show"), lock: e.classList.contains("lock"), color: getComputedStyle(e).color }; });
    ok("④ 點沒拿到的：名牌照樣跳出來（翅膀），灰紫字 #6b6380", wnL.show && wnL.text === "翅膀" && wnL.lock && wnL.color === "rgb(107, 99, 128)", JSON.stringify(wnL));
    await clickTile(p, "flower"); await ready(p);
    c = await C(p); s = await S(p);
    ok("④ 沒擁有的點了只提示：不穿、不存檔、格子抖一下", JSON.stringify(s.wear) === w0 && c.save === before.save && shook && !c.play.slice(before.play.length).includes("wear"), JSON.stringify(s.wear));
    ok("④ 提示語：翅膀＝「去送貨…」、小花＝「送貨或扭蛋…」", c.talk.includes("去送貨，就可以拿到喔！") && c.talk.includes("送貨或扭蛋，都可以拿到喔！"), c.talk.slice(-2).join("|"));
    // 寧次 10-12：🎰（賭博意象）換成遊戲自己的藍色扭蛋膠囊圖；圖示放大到格子 ×0.24
    const ic = await p.evaluate(() => {
      const w = document.querySelector('.dr-item[data-id="wings"]'), f = document.querySelector('.dr-item[data-id="flower"]'), h = document.querySelector('.dr-item[data-id="hat"]');
      const vis = e => !!e && getComputedStyle(e).display !== "none", cap = f.querySelector(".dr-get .dr-gi-g img"), t = w.getBoundingClientRect().width;
      const truck = w.querySelector(".dr-gi-d"), capR = cap ? cap.getBoundingClientRect() : null;
      return { lock: w.classList.contains("lock"), wv: vis(w.querySelector(".dr-get")), wt: w.querySelector(".dr-get").textContent, ft: f.querySelector(".dr-get").textContent, cap: cap ? cap.src.split("/").pop() : "", capOk: !!(cap && cap.complete && cap.naturalWidth > 0),
        hatHidden: !vis(h.querySelector(".dr-get")), slot: !document.querySelector(".dr-hint") && getComputedStyle(w.querySelector(".dr-pic img")).filter.includes("brightness"), slot777: document.getElementById("dress").textContent.includes("🎰"),
        tile: Math.round(t), truckFs: parseFloat(getComputedStyle(truck).fontSize), capW: capR ? Math.round(capR.width) : 0 };
    });
    ok("④ 沒擁有的格子顯示剪影＋角落小圖示（🚚 送貨拿得到、藍色扭蛋膠囊＝扭蛋抽得到，不再用 🎰）、圖示 ≥ 格子 ×0.24", ic.lock && ic.wv && ic.wt === "🚚" && ic.ft === "🚚" && ic.cap === "capsule_blue.webp" && ic.capOk && ic.hatHidden && ic.slot && !ic.slot777
      && ic.truckFs >= ic.tile * 0.24 - 0.5 && ic.capW >= ic.tile * 0.24 - 0.5, JSON.stringify(ic));
    const wn1 = (await S(p)).wname; await sleep(2300); const wn2 = (await S(p)).wname;
    ok("④ 名牌最後一次點的是小花、約 2 秒後收起來", wn1 === "小花" && wn2 === "", JSON.stringify({ wn1, wn2 }));

    // ⑤ 寶寶：小兔改成寶寶 → 頭上小芽；戴帽子就換掉小芽
    await p.evaluate(() => { window.__dress.rw.pets.bunny.stage = 1; });
    await p.click('.dr-pet[data-id="bunny"]'); await ready(p);
    s = await S(p);
    const tuft = s.worn.join() === "baby_tuft";
    await clickTile(p, "hat"); await ready(p); s = await S(p);
    ok("⑤ 寶寶頭上空著＝小芽；戴帽子後小芽換成帽子", tuft && s.worn.join() === "hat", JSON.stringify(s.worn));

    // ⑥ 點寵物會跳（真的用滑鼠點畫布中間）；左右拖會轉
    await sleep(900);
    const cv = await p.$(".dr-cv"), bb = await cv.boundingBox();
    const play0 = (await C(p)).play.length;
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height * 0.55);
    await sleep(60); s = await S(p);
    ok("⑥ 點寵物：跳一下＋tap 音效", s.jumping && (await C(p)).play.slice(play0).includes("tap"), JSON.stringify({ jumping: s.jumping }));
    const a0 = (await S(p)).angle;
    await p.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.5); await p.mouse.down();
    for (let k = 1; k <= 8; k++) { await p.mouse.move(bb.x + bb.width * 0.3 + k * 25, bb.y + bb.height * 0.5); await sleep(16); }
    await p.mouse.up();
    const a1 = (await S(p)).angle;
    ok("⑥ 手指左右拖：寵物跟著轉（拖 200px ≈ 2.4 弧度）", Math.abs(a1 - a0) > 1.8, `${a0.toFixed(2)} → ${a1.toFixed(2)}`);
    await shot(p, "dress-1024x768-play");

    // ⑧ 穿好了：關閉
    await p.evaluate(() => { window.__oldCv = document.querySelector(".dr-cv"); });
    await p.click(".dr-done"); await sleep(150);
    s = await S(p); c = await C(p);
    const dom = await p.evaluate(() => ({ hidden: document.getElementById("dress").classList.contains("hidden"), cv: document.querySelectorAll("canvas").length, kids: document.getElementById("dress").children.length, oldCv: [window.__oldCv.width, window.__oldCv.height].join("x") }));
    ok("⑧ 關掉後舊畫布縮成 1×1（Safari 放掉背景緩衝）", dom.oldCv === "1x1", dom.oldCv);
    const gl = await p.evaluate(() => window.__gl);
    ok("⑧ 穿好了：onClose 一次、畫面隱藏、停 rAF、canvas 拿掉、WebGL 釋放", c.close === 1 && !s.open && !s.gl && !s.raf && dom.hidden && dom.cv === 0 && dom.kids === 0 && gl.made === gl.lost, JSON.stringify({ close: c.close, dom, gl }));
    ok("⑧ 關掉後存檔的穿著還在（下次打開照舊）", await p.evaluate(() => JSON.stringify(window.__dress.RW.wearOf(window.__dress.rw, "bear")) === JSON.stringify({ head: null, side: "bow", back: null })));
    ok("全程沒有 three.js 警告", !warns.some(w => /THREE/.test(w)), warns.filter(w => /THREE/.test(w)).join("|").slice(0, 200));
    ok("①～⑧ 0 個 console error", errs.length === 0, errs.join(" | ").slice(0, 300));
    await ctx.close();
  }

  // ===== ⑦ 閒置提示（計時器快 40 倍）=====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "fast=40");
    await sleep(600);
    let c = await C(p);
    const idle0 = c.talk.includes("點一下衣服，幫牠穿上！");
    await clickTile(p, "hat"); await ready(p); await sleep(700);
    c = await C(p);
    ok("⑦ 閒置提示：還沒穿過＝「點一下衣服…」、穿過之後＝「換一件試試看！」（各一次）", idle0 && c.talk.includes("換一件試試看！") && c.talk.filter(t => t === "點一下衣服，幫牠穿上！").length === 1, c.talk.join("|"));
    await clickTile(p, "bow"); await sleep(200);
    c = await C(p);
    ok("⑦ 穿第 2 件會稱讚一次（好可愛／好漂亮／好帥）", c.talk.some(t => ["好可愛！", "好漂亮喔！", "好帥喔！"].includes(t)), c.talk.join("|"));
    ok("⑦ 0 個 console error", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑨ 重複開關 20 次（每次都穿脫一件）：WebGL context 不洩漏；⑩ 開到一半馬上關 =====
  {
    const { ctx, p, errs, warns } = await open(browser, 1024, 768, "pets=all&closet=all");
    const res = await p.evaluate(async () => {
      const d = window.__dress.dress, out = [];
      for (let i = 0; i < 20; i++) {
        d.close(); d.open(["dog", "dino", "whale", "bunny", "dragon"][i % 5]);
        await d.debug.ready();
        d.debug.tapItem(["wings", "backpack", "cape_rainbow", "party_hat", "flower_crown"][i % 5]);   // 同一隻第二輪再點＝脫下
        out.push(await d.debug.ready() ? 1 : 0);                                                         // 3D 掛的配件＝存檔的穿著
      }
      d.close();
      for (let i = 0; i < 5; i++) { d.open("dino"); d.close(); }   // ⑩ 模型還在載入就關掉
      for (let k = 0; k < 50 && window.__gl.lost < window.__gl.made; k++) await new Promise(r => setTimeout(r, 100));   // webglcontextlost 是非同步事件，最多等 5 秒
      return { out, gl: window.__gl, canvases: document.querySelectorAll("canvas").length, close: window.__dress.calls.close };
    });
    ok("⑨ 開關 20 次：每次都建立 1 個 WebGL、關掉都釋放（建立數＝釋放數）", res.gl.made === res.gl.lost && res.gl.made >= 26 && res.canvases === 0, JSON.stringify(res.gl) + " canvases=" + res.canvases);
    ok("⑨ 沒有「Too many active WebGL contexts」警告", !warns.some(w => /Too many active WebGL/i.test(w)));
    ok("⑨ 每次穿／脫之後 3D 都跟存檔一致", res.out.every(n => n === 1), res.out.join(","));
    ok("⑩ 開到一半馬上關：不報錯、onClose 次數正確（26 次）", errs.length === 0 && res.close === 26, `close=${res.close} ${errs.join("|").slice(0, 200)}`);
    await ctx.close();
  }

  // ===== ⑪ 沒有 WebGL：圖片版預覽也能穿脫 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "nogl=1");
    const s0 = await S(p);
    await clickTile(p, "hat"); await sleep(200);
    const s = await S(p);
    const fb = await p.evaluate(() => ({ pet: !!document.querySelector(".dr-fb-pet"), wear: [...document.querySelectorAll(".dr-fb-wear img")].map(i => i.src.split("/").pop()) }));
    ok("⑪ 沒有 WebGL：顯示寵物圖片、穿上帽子後下面多一個帽子小圖", !s0.gl && fb.pet && s.wear.head === "hat" && fb.wear.join() === "wear_hat.webp", JSON.stringify(fb));
    await p.click(".dr-done"); await sleep(100);
    ok("⑪ 0 個 console error", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑮ WebGL 被系統收走（里維 10-12）：馬上還回來＝照舊 3D；3 秒沒回來＝退回圖片版照樣能穿；收走中關掉＝計時清掉 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768);
    const lose = () => p.evaluate(() => { const x = document.querySelector(".dr-cv").getContext("webgl2").getExtension("WEBGL_lose_context"); window.__lc = x; x.loseContext(); });
    await lose(); await sleep(400);
    const a0 = await S(p);
    await p.evaluate(() => window.__lc.restoreContext()); await sleep(3400);
    const a1 = await S(p), a1cv = await p.evaluate(() => document.querySelectorAll(".dr-cv").length);
    await sleep(400); const a2 = await S(p);
    ok("⑮ 收走 0.4 秒就還回來：等待中仍是 3D、還回來後取消計時、3 秒後還是 3D 而且繼續畫", a0.gl && a0.lostWait && a1.gl && !a1.lostWait && !a1.fb && a1cv === 1 && a2.frames > a1.frames, JSON.stringify({ a0: [a0.gl, a0.lostWait], a1: [a1.gl, a1.lostWait, a1.fb, a1cv], frames: [a1.frames, a2.frames] }));
    await lose(); await sleep(1500);
    const b0 = await S(p);
    await sleep(2000);
    const b1 = await S(p), cvs = await p.evaluate(() => document.querySelectorAll("canvas").length);
    await clickTile(p, "hat"); await sleep(250);
    const b2 = await S(p), fbw = await p.evaluate(() => [...document.querySelectorAll(".dr-fb-wear img")].map(i => i.src.split("/").pop()).join());
    ok("⑮ 收走 3 秒沒回來：退回圖片版（canvas 拿掉、停 rAF）、照樣可以穿帽子", b0.gl && !b0.fb && !b1.gl && !b1.raf && b1.fb && cvs === 0 && b2.wear.head === "hat" && fbw === "wear_hat.webp", JSON.stringify({ b0: [b0.gl, b0.fb], b1: [b1.gl, b1.raf, b1.fb, cvs], wear: b2.wear, fbw }));
    // 收走中馬上關：「3 秒後退回」的計時要清掉（不會在關掉的畫面上冒出圖片版）
    await p.evaluate(() => { const d = window.__dress.dress; d.close(); d.open("bear"); }); await p.evaluate(() => window.__dress.dress.debug.ready());
    await lose(); await p.evaluate(() => window.__dress.dress.close()); await sleep(3500);
    const c1 = await p.evaluate(() => ({ hidden: document.getElementById("dress").classList.contains("hidden"), kids: document.getElementById("dress").children.length, open: window.__dress.dress.debug.state().open }));
    ok("⑮ 收走中關掉：計時清掉，3 秒後畫面還是空的、沒報錯", c1.hidden && c1.kids === 0 && !c1.open && errs.length === 0, JSON.stringify({ c1, errs }));
    await ctx.close();
  }

  // ===== ⑫ 版面：iPad 橫式 4:3（1024×768、1366×1024）、直式 768×1024、16:9 1280×720 ＋ ⑬ 國字都有注音 =====
  for (const [w, h, pet] of [[1024, 768, "cat"], [1366, 1024, "bunny"], [768, 1024, "dino"], [1280, 720, "whale"]]) {
    const { ctx, p, errs } = await open(browser, w, h, `pets=all&ann=1&pet=${pet}`);
    // 有拿到的、沒拿到的都要有：給一半配件、穿兩件
    await p.evaluate(() => { const R = window.__dress.RW, rw = window.__dress.rw; ["crown", "wings", "flower_crown", "backpack"].forEach(i => R.giveWear(rw, i)); });
    await clickTile(p, "flower_crown"); await clickTile(p, "wings"); await ready(p); await sleep(1600);
    const L = await p.evaluate(() => {
      const r = e => e.getBoundingClientRect();
      const tiles = [...document.querySelectorAll(".dr-item")].map(r), pets = [...document.querySelectorAll(".dr-pet")].map(r), done = r(document.querySelector(".dr-done"));
      const stage = r(document.querySelector(".dr-stage")), closet = [...document.querySelectorAll(".dr-group")].map(r);
      const inView = b => b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5;
      const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const textOver = [...document.querySelectorAll(".dr-item .dr-in")].filter(e => e.scrollWidth > e.parentElement.clientWidth + 1).length;
      return { minTile: Math.min(...tiles.map(b => Math.min(b.width, b.height))), minPet: Math.min(...pets.map(b => Math.min(b.width, b.height))), done: [done.width, done.height],
        tilesIn: tiles.every(inView), doneIn: inView(done), stageIn: inView(stage), stageVsCloset: closet.some(c => overlap(c, stage)), groupsOverlap: closet.some((a, i) => closet.some((b, j) => i < j && overlap(a, b))),
        scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, textOver, stageWH: [Math.round(stage.width), Math.round(stage.height)],
        missing: window.__dress.ann ? [...window.__dress.ann.missing].join("") : "?", portrait: document.querySelector(".dress").classList.contains("portrait") };
    });
    ok(`⑫ ${w}×${h}：格子 ≥56px、寵物鈕 ≥56px、穿好了 ≥56px 高`, L.minTile >= 56 && L.minPet >= 56 && L.done[1] >= 56, `tile=${L.minTile.toFixed(0)} pet=${L.minPet.toFixed(0)} done=${L.done.map(Math.round).join("x")}`);
    ok(`⑫ ${w}×${h}：全部在畫面內、預覽和衣櫃不重疊、三組不重疊、不捲動、配件名沒擠出格子`, L.tilesIn && L.doneIn && L.stageIn && !L.stageVsCloset && !L.groupsOverlap && !L.scroll && L.textOver === 0, JSON.stringify(L));
    ok(`⑫ ${w}×${h}：直式／橫式版面判斷正確、預覽夠大（短邊 ≥ 30vmin）`, L.portrait === (h > w) && Math.min(...L.stageWH) >= Math.min(w, h) * 0.3, JSON.stringify({ portrait: L.portrait, stage: L.stageWH }));
    ok(`⑬ ${w}×${h}：國字都有注音（zhuyin-ui.js 字典沒缺字）`, L.missing === "", "缺：" + L.missing);
    // 寧次 10-12：有注音的字 ≥4.6vmin（分組標題、點了跳出來的名牌）；最長的「彩虹披風」名牌（加注音）整個在預覽區裡、不壓到寵物名牌
    await clickTile(p, "cape_rainbow"); await sleep(450);
    const F = await p.evaluate(() => {
      const vmin = Math.min(innerWidth, innerHeight) / 100, r = e => e.getBoundingClientRect(), fs = e => parseFloat(getComputedStyle(e).fontSize);
      const wn = document.querySelector(".dr-wn"), st = r(document.querySelector(".dr-stage")), b = r(wn), nm = r(document.querySelector(".dr-name"));
      const zy = wn.querySelector(".ac[data-z]"), zfs = zy ? parseFloat(getComputedStyle(zy, "::after").fontSize) : 0;
      return { vmin: +vmin.toFixed(2), gt: Math.min(...[...document.querySelectorAll(".dr-gt")].map(fs)), wn: fs(wn), wnZy: +zfs.toFixed(1), text: wn.textContent, show: wn.classList.contains("show"),
        inStage: b.left >= st.left - 0.5 && b.right <= st.right + 0.5 && b.top >= st.top - 0.5 && b.bottom <= st.bottom + 0.5, hitName: b.left < nm.right && nm.left < b.right && b.top < nm.bottom && nm.top < b.bottom,
        noTileText: [...document.querySelectorAll(".dr-item")].every(t => !/[㐀-鿿]/.test(t.textContent)) };
    });
    ok(`⑫ ${w}×${h}：分組標題、名牌 ≥4.6vmin；「彩虹披風」名牌在預覽區內、不壓寵物名牌；格子不放字`, F.gt >= 4.6 * F.vmin - 0.1 && F.wn >= 4.6 * F.vmin - 0.1 && F.show && F.text === "彩虹披風" && F.inStage && !F.hitName && F.noTileText, JSON.stringify(F));
    ok(`⑭ ${w}×${h}：0 個 console error`, errs.length === 0, errs.join(" | "));
    await shot(p, `dress-${w}x${h}`);
    await ctx.close();
  }

  await browser.close();
  for (const l of results) console.log(l);
  const bad = results.filter(l => l.startsWith("FAIL")).length;
  console.log(bad ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
  console.log("截圖：" + SHOTS);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
