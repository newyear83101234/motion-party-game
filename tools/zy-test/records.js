// 音符唱片行（11-01 v8 音樂島；js/zhuyin-records.js＋主程式接線）測試：node tools/zy-test/records.js
// 11-03 v4 阿葉原話：「背景音樂可以在原本首頁下方播放那邊，點下去就能跳出唱片可以選擇，不用再特別去音樂島」「選擇每一個唱片只要播放該歌曲的副歌」
//   「如果選擇唱片時遇到失火了這類的講話音效，看一下怎麼做調整」「切過去時就要馬上換音樂」；問「選好唱片之後下次進小島放什麼」→ 阿葉選「回到原本的遊戲音樂」。
//   唱片牆（全螢幕轉盤，三個標籤 🎧 我的歌 7 首／🏅 紀念 6／🎼 配樂 3；🔀 隨機拿掉）：一打開就放中間那張、轉到中間 0.12 秒就換、我的歌一打開就全部先下載；
//   「✓ 就聽這首」／✕＝收起來、繼續放；「🏝️ 原本的音樂」＝停掉、收起來。唱片＝當下放一次：我的歌＝副歌片段（放完就停）、配樂放 ROUND 秒，放完／進遊戲／重開網頁＝原本的遊戲音樂。
//   小島上的迷你播放器 #recNow 一直都在：沒在放＝小顆「換音樂」（點了＝開唱片牆）；在放＝唱片小圖＋歌名＋⏮ ⏹ ⏭（≤440×60，寧次 11-01）；家長鎖＝收起來、正在放的停掉。
//   唱片牆開著／正在放唱片：3D 小島的隨機事件（失火、寵物生病：講話＋警笛）晚 20 秒（hub opts.quiet）。
// 驗：開唱片牆（主程式 openRecords；迷你播放器；介紹卡「💿 進唱片行」；前院留聲機 homeItemTap）；紀念唱片補發（假存檔：貼紙 25、陀螺 rank 1、泡泡有星）；
//     店裡賣的要點兩下、隔 0.4 秒才算；錢不夠買不了；沒拿到的不放；家長鎖；留聲機送唱片；備份碼保留 rc（pick 一律空）；換畫面（nav）收掉唱片牆、唱片停；
//     副歌每次從頭放、放完回原本的；⏳ 下載中（.bin 故意延遲 1.5 秒）；預載好之後換歌很快；各尺寸版面互不重疊、在畫面內；沒有錯誤、旁注音沒漏字。
// 封面圖 IMAGE/zhuyin/rec/<id>.webp：測試一律攔下來（假圖＝回 200 壞資料，會觸發 onerror 但不會在 console 留 404；要測「有圖」的那幾張回一張真的小圖）。
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。截圖存到 ZY_SHOTS（預設 %TEMP%\zy-records）。
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&no3d&night=0&recshop";   // recshop＝用「紀念要做到、店裡要買」的舊規則測補發／買的程式（11-01 阿葉改成全部唱片一開始就有，見第 0 段）
const QF = "debug&novoice&no3d&night=0";           // 免費（現在的規則）
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-records");
fs.mkdirSync(SHOTS, { recursive: true });
const strip = s => (s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const MINE = ["my_soyeon", "my_ateez", "my_jay", "my_hero", "my_eyes", "my_smile", "my_maruko"];   // 我的歌（kind mine：一開始就有、排最前面；my_eyes 11-01、my_smile／my_maruko 11-03 阿葉加的）
const ALL = 16;                                     // 7 我的歌＋6 紀念＋3 店裡的
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// 封面圖：have＝這幾張回真的小圖，其他回壞資料（＝圖還沒做好／載入失敗）
const covers = (ctx, have = []) => ctx.route("**/IMAGE/zhuyin/rec/**", r => { const id = (r.request().url().match(/rec\/(\w+)\.webp/) || [])[1];
  return have.includes(id) ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.fulfill({ status: 200, contentType: "image/webp", body: "x" }); });
const wallOn = p => p.evaluate(() => window.__zy.recUI.isOpen() && !document.querySelector(".rc-shop").classList.contains("hidden"));
const rec = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.recSave)));
const dbg = p => p.evaluate(() => { const d = window.__zy.recUI.debug; return { tab: d.tab, cur: d.cur, sel: d.sel, ids: d.ids, playing: d.playing, waiting: d.waiting, label: d.label() }; });
const bgm = p => p.evaluate(() => window.__zy.bgmNow());
const npId = p => p.evaluate(() => (window.__zy.recUI.debug.np || {}).id || null);
const lastDance = p => p.evaluate(() => window.__zy.recUI.debug.dances.slice(-1)[0]);
const tabTo = (p, k) => p.evaluate(k => document.querySelector(`.rc-tab[data-k=${k}]`).click(), k);
// 點某張唱片：先換到它的標籤、點它（旁邊那張＝轉到中間；中間那張＝馬上放），等 wait 毫秒（轉到中間停 0.12 秒才換）
const pickRec = async (p, id, wait = 400) => {
  await p.evaluate(id => { const k = window.__zy.REC.TABS.find(t => t.ids.includes(id)).k; if (window.__zy.recUI.debug.tab !== k) document.querySelector(`.rc-tab[data-k=${k}]`).click(); document.querySelector(`.rc-rec[data-id=${id}]`).click(); }, id);
  await sleep(wait);
};
const btn = (p, cls) => p.evaluate(c => { const b = document.querySelector(".rc-shop " + c); return b ? { shown: !b.classList.contains("hidden") && getComputedStyle(b).display !== "none", text: b.textContent, dis: !!b.disabled } : null; }, cls);
const click = (p, cls) => p.evaluate(c => document.querySelector(".rc-shop " + c).click(), cls);
const spoken = p => p.evaluate(() => window.__spoken.map(x => x.text));
const clearSpoken = p => p.evaluate(() => { window.__spoken = []; });
const center = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const txt = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel).then(strip);
const setLock = (p, on) => p.evaluate(v => { document.getElementById("settingsBtn").click(); document.querySelector(`#bgmLockOpts .opt[data-v='${v}']`).click(); document.getElementById("settingsClose").click(); }, on ? 1 : 0);
// 唱片牆版面：標題、✕、標籤、唱片（中間＋兩旁）、名字、小字、音波、按鈕、原本的、家長鎖、DJ、泡泡、箭頭 互不重疊（唱片之間、箭頭壓唱片是設計）；
// 中間和兩旁各一張、其他元素都在畫面內；看得到的按鈕都 ≥ 44px
const wallCheck = () => {
  const vis = e => !!e && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().width > 1;
  const items = [], add = (name, e, inV = true) => { if (vis(e)) items.push({ name, q: e.getBoundingClientRect(), inV }); }, $ = s => document.querySelector(".rc-shop " + s);
  add("標題", $(".rc-title")); add("錢包", $(".rc-wallet")); add("✕", $(".rc-x")); add("標籤", $(".rc-tabs"));
  const cur = window.__zy.recUI.debug.cur;
  document.querySelectorAll(".rc-shop .rc-rec").forEach((d, i) => { if (+getComputedStyle(d).opacity > 0.5) add("唱片" + i, d, Math.abs(i - cur) <= 1); });
  add("名字", $(".rc-now")); add("小字", $(".rc-sub")); add("音波", $(".rc-wave"));
  for (const b of document.querySelectorAll(".rc-shop .rc-acts > button")) add("鈕" + (b.className.match(/rc-[\w-]+/) || [""])[0], b);
  add("原本的", $(".rc-isle")); add("家長鎖", $(".rc-lock")); add("DJ", $(".rc-djfig"));
  if ($(".rc-bub").textContent) add("泡泡", $(".rc-bub"));
  for (const a of document.querySelectorAll(".rc-shop .rc-arr")) add("箭頭", a);
  const disc = n => n.startsWith("唱片"), bad = [], out = [];
  for (const it of items) { const q = it.q; if (it.inV && (q.left < -1 || q.top < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1)) out.push(it.name); }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if ((disc(a.name) || a.name === "箭頭") && (disc(b.name) || b.name === "箭頭")) continue;
    if (a.q.left < b.q.right - 1 && a.q.right > b.q.left + 1 && a.q.top < b.q.bottom - 1 && a.q.bottom > b.q.top + 1) bad.push(a.name + "×" + b.name);
  }
  const small = [...document.querySelectorAll(".rc-shop button")].filter(b => vis(b) && +getComputedStyle(b).opacity > 0.5).map(b => [b, b.getBoundingClientRect()]).filter(([, q]) => q.width < 43.5 || q.height < 43.5).map(([b]) => b.className);
  return { bad, out, small, n: items.length };
};
const wallOk = r => !r.bad.length && !r.out.length && !r.small.length;
// 小島上的迷你播放器：看得到、在畫面內、≥44px、看得到的鈕各 ≥44px 不互疊、歌名沒被切；不跟上方按鈕／狀態列／貓頭鷹／進化膠囊重疊
const npCheck = () => {
  const e = document.getElementById("recNow"), q = e.getBoundingClientRect(), hit = [];
  for (const s of ["#hudLBtn", "#hudRBtn", "#navBtn", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#mapBtn", "#plazaBtn", "#statusBar", "#resumeBtn", "#albumBtn", "#menu .jarBtn", "#walletBtn", "#evoBtn", "#guide > img", "#guideText", "#owlPeek"]) {
    const o = document.querySelector(s); if (!o || getComputedStyle(o).display === "none" || getComputedStyle(o).visibility === "hidden") continue; const b = o.getBoundingClientRect(); if (b.width < 1) continue;
    if (q.left < b.right - 1 && q.right > b.left + 1 && q.top < b.bottom - 1 && q.bottom > b.top + 1) hit.push(s); }
  const bs = [...e.querySelectorAll("button")].filter(b => getComputedStyle(b).display !== "none").map(b => b.getBoundingClientRect()); let bo = false;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].right > bs[j].left + 1 && bs[i].left < bs[j].right - 1) bo = true;
  const t = e.querySelector(".rc-np-t");
  return { shown: !e.classList.contains("hidden") && getComputedStyle(e).display !== "none", inV: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight, h: Math.round(q.height), w: Math.round(q.width),
    small: bs.filter(b => b.width < 43.5 || b.height < 43.5).length, bo, cut: t.scrollHeight > t.clientHeight + 2, hit, mode: e.dataset.mode, nBtn: bs.length,
    name: e.querySelector(".rc-np-name").textContent, mid: e.querySelector(".rc-np-mid").textContent, aria: e.querySelector(".rc-np-open").getAttribute("aria-label"),
    spin: getComputedStyle(e.querySelector(".rc-np-disc")).animationName, rect: [q.left, q.top, q.right, q.bottom].map(Math.round) };
};
const npS = p => p.evaluate(npCheck);
// 直式上方：🧭 去哪裡、🗺️、家長按鈕、繼續玩、頂端狀態列（貼紙、🎪…） 互不重疊、都在畫面內（🎪 在狀態列裡 不算；11-01 起地點鈕收進 🧭）
const topCheck = () => { const ids = ["#hudLBtn", "#hudRBtn", "#navBtn", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#resumeBtn", "#statusBar", "#menu > .menu-bottom", "#mapBtn", "#plazaBtn"];
  const box = ids.map(s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { s, q, on: getComputedStyle(e).display !== "none" && q.width > 0 }; }).filter(x => x && x.on);
  const skip = new Set(["#statusBar|#plazaBtn"]), bad = [], out = [];
  for (let i = 0; i < box.length; i++) { const a = box[i].q; if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push(box[i].s);
    for (let j = i + 1; j < box.length; j++) { const b = box[j].q; if (skip.has(box[i].s + "|" + box[j].s) || skip.has(box[j].s + "|" + box[i].s)) continue;
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) bad.push(box[i].s + "×" + box[j].s); } }
  return { bad, out, words: [...document.querySelectorAll("#navPanel .nav-row")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }; };

(async () => {
  const browser = await launch();
  // ===== 0. 全部唱片一開始就有（阿葉 11-01）；三個標籤；一打開就放中間那張；換標籤＝馬上放那組第一張；DJ 第一次教怎麼轉；「✓ 就聽這首」 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 5, stars: 0, query: QF }); await covers(ctx);
    const R0 = await rec(p);
    ok(`免費：新存檔一開始 ${ALL} 張唱片全部都有（我的歌＋紀念＋店裡的）`, R0.own.length === ALL && MINE.every(id => R0.own.includes(id)) && ["r_town", "r_calm", "r_night"].every(id => R0.own.includes(id)), JSON.stringify(R0));
    const T = await p.evaluate(() => window.__zy.REC.TABS.map(t => [t.k, t.ids]));
    ok("三個標籤：🎧 我的歌 7 首（11-03 拿掉 🔀 隨機）、🏅 紀念唱片 6 張、🎼 小島配樂 3 張", JSON.stringify(T.map(t => t[1].length)) === "[7,6,3]" && JSON.stringify(T[0][1]) === JSON.stringify(MINE), JSON.stringify(T));
    ok("我的歌新加的兩首：你笑起來真好看（萌妞贊隊 😊）、稍息立正站好（櫻桃小丸子 🍒）", await p.evaluate(() => { const R = window.__zy.REC.REC_BY_ID; return R.my_smile.name === "你笑起來真好看" && R.my_smile.by === "萌妞贊隊" && R.my_smile.e === "😊" && R.my_maruko.name === "稍息立正站好" && R.my_maruko.by === "櫻桃小丸子" && R.my_maruko.e === "🍒" && R.my_maruko.bgm === "my:my_maruko"; }));
    ok("小島上放原本的音樂（island）", (await bgm(p)) === "island");
    await clearSpoken(p);
    ok("免費：openRecords → 唱片牆打開", (await p.evaluate(() => window.__zy.openRecords())) && await wallOn(p));
    await sleep(400);
    let d = await dbg(p);
    ok("一打開：停在我的歌第一首（SOYEON）、馬上就放它（不用先轉）", d.tab === "mine" && d.sel === "my_soyeon" && d.cur === 0 && d.playing === "my_soyeon" && (await bgm(p)) === "my:my_soyeon", JSON.stringify(d));
    ok("DJ 泡泡＝「歡迎光臨音符唱片行！」、也有唸", (await txt(p, ".rc-bub")) === "歡迎光臨音符唱片行！" && (await spoken(p)).includes("歡迎光臨音符唱片行！"), JSON.stringify(await spoken(p)));
    ok("唱片牆上的唱片數：我的歌標籤 7 張", JSON.stringify(d.ids) === JSON.stringify(MINE) && (await p.evaluate(() => document.querySelectorAll(".rc-shop .rc-rec").length)) === 7);
    await sleep(2700);
    ok("第一次開店、沒動轉盤：2.6 秒後 DJ 教「轉到中間就會先聽一小段喔！」（泡泡＋唸）", (await txt(p, ".rc-bub")) === "轉到中間就會先聽一小段喔！" && (await spoken(p)).includes("轉到中間就會先聽一小段喔！"), JSON.stringify(await spoken(p)));
    for (const [k, n, first, key] of [["memo", 6, "r_rainbow", "rainbow"], ["shop", 3, "r_island", "island"], ["mine", 7, "my_soyeon", "my:my_soyeon"]]) {
      await tabTo(p, k); await sleep(350); d = await dbg(p);
      ok(`換標籤「${k}」：轉盤換成那組 ${n} 張、從第一張（${first}）開始、馬上放那張、標籤亮起來`, d.tab === k && d.ids.length === n && d.cur === 0 && d.sel === first && d.playing === first && (await bgm(p)) === key && (await p.evaluate(k => document.querySelector(`.rc-tab[data-k=${k}]`).classList.contains("rc-cur") && document.querySelectorAll(".rc-tab.rc-cur").length === 1, k)), JSON.stringify({ d, b: await bgm(p) }));
    }
    await pickRec(p, "r_calm");
    ok("免費：店裡那張（安靜時光）＝有「✓ 就聽這首」、小字「小島配樂」，沒有「買下來」；已經在放", (await btn(p, ".rc-go")).shown && strip((await btn(p, ".rc-go")).text) === "✓就聽這首" && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-buy-go")).shown && (await txt(p, ".rc-sub")) === "小島配樂" && (await bgm(p)) === "calm");
    ok("免費：錢包膠囊不出現（不用買）", !(await btn(p, ".rc-wallet")).shown);
    ok("舊的「▶ 聽整首」「🏝️ 當小島音樂」「✓ 小島正在放」鈕都沒了", await p.evaluate(() => !document.querySelector(".rc-play, .rc-set, .rc-on, .rc-pinb")));
    await clearSpoken(p); const st0 = await p.evaluate(() => window.__zyAudio.debug().stats.bgmStarts);
    await click(p, ".rc-go"); await sleep(300);
    ok("「✓ 就聽這首」：唱片牆收起來、小島繼續放安靜時光（沒重放）、寵物跳 30 秒、DJ 說「回小島就會放這首歌喔！」", !(await wallOn(p)) && (await bgm(p)) === "calm" && (await npId(p)) === "r_calm" && (await lastDance(p)) === 30 && (await spoken(p)).includes("回小島就會放這首歌喔！") && (await p.evaluate(() => window.__zyAudio.debug().stats.bgmStarts)) === st0, JSON.stringify(await spoken(p)));
    await p.evaluate(() => window.__zy.openRecords()); await clearSpoken(p); await sleep(2900);
    d = await dbg(p);
    ok("第二次開店：不再教一次（這次開頁教過了）；停在正在放的那張（🎼 安靜時光）、繼續放", !(await spoken(p)).includes("轉到中間就會先聽一小段喔！") && d.sel === "r_calm" && d.tab === "shop" && (await bgm(p)) === "calm", JSON.stringify({ sp: await spoken(p), d }));
    ok("免費：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 0b. 轉盤操作（真的用滑鼠）：撥一下＝放開就換那首、點旁邊那張轉到中間＝馬上換、‹ ›、點中間那張（已經在放）不重來、連按只換最後那張 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: QF }); await covers(ctx);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(500);
    const t0 = await center(p, ".rc-title"); await p.mouse.click(t0.x, t0.y); await sleep(200);   // 真的點一下：解鎖聲音
    const u = await p.evaluate(() => { const d = document.querySelector(".rc-shop .rc-rec"); return d.offsetWidth * 0.62 * parseFloat(getComputedStyle(document.querySelector(".rc-shop")).getPropertyValue("--sp")); });
    const c0 = await center(p, ".rc-rec.rc-mid");
    await p.mouse.move(c0.x, c0.y); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(c0.x - (u * 1.05 * i) / 10, c0.y); await sleep(25); }
    await sleep(200); const bDrag = await bgm(p); await p.mouse.up(); await sleep(350);
    let d = await dbg(p);
    ok("手指往左撥一張：拖著的時候還放 SOYEON；放開＝中間換成 BAD、0.35 秒內就換成放 BAD（中間那張在轉）", bDrag === "my:my_soyeon" && d.sel === "my_ateez" && d.cur === 1 && d.playing === "my_ateez" && (await bgm(p)) === "my:my_ateez" && await p.evaluate(() => document.querySelector(".rc-rec.rc-mid").classList.contains("rc-spin")), JSON.stringify({ d, bDrag, u }));
    ok("名字「BAD」、小字是歌手「ATEEZ」、音波條在跳", (await txt(p, ".rc-now")) === "BAD" && (await txt(p, ".rc-sub")) === "ATEEZ" && await p.evaluate(() => document.querySelector(".rc-shop").classList.contains("rc-live") && getComputedStyle(document.querySelector(".rc-wave i")).animationName === "rcWave"));
    const nb = await p.evaluate(() => { const q = document.querySelector(".rc-rec[data-id=my_jay]").getBoundingClientRect(); return { x: q.left + q.width * 0.75, y: q.top + q.height / 2 }; });
    await p.mouse.click(nb.x, nb.y); await sleep(300); d = await dbg(p);
    ok("點右邊那張（女兒殿下）：轉到中間、0.3 秒內換成放女兒殿下", d.sel === "my_jay" && d.cur === 2 && (await bgm(p)) === "my:my_jay", JSON.stringify(d));
    const pv = await center(p, ".rc-prev"); await p.mouse.click(pv.x, pv.y); await sleep(300);
    ok("按 ‹：轉回 BAD、也馬上換回 BAD", (await dbg(p)).sel === "my_ateez" && (await bgm(p)) === "my:my_ateez");
    await sleep(300); const s0 = await p.evaluate(() => window.__zyAudio.debug().stats.bgmStarts);
    const cm = await center(p, ".rc-rec.rc-mid"); await p.mouse.click(cm.x, cm.y); await sleep(300);
    ok("點中間那張（已經在放）：不重放", (await bgm(p)) === "my:my_ateez" && (await p.evaluate(() => window.__zyAudio.debug().stats.bgmStarts)) === s0);
    const nx = await center(p, ".rc-next"); for (let i = 0; i < 8; i++) { await p.mouse.click(nx.x, nx.y); await sleep(50); }
    await sleep(600); d = await dbg(p); const s1 = await p.evaluate(() => window.__zyAudio.debug().stats.bgmStarts);
    ok("連按 › 八下：停在最後一張（稍息立正站好）、› 變灰；中間經過的不會每張都響（只換最後那張）", d.sel === "my_maruko" && d.cur === 6 && (await bgm(p)) === "my:my_maruko" && s1 - s0 <= 2 && await p.evaluate(() => document.querySelector(".rc-next").disabled && !document.querySelector(".rc-prev").disabled), JSON.stringify({ d, starts: s1 - s0 }));
    await p.keyboard.press("ArrowLeft"); await sleep(350);
    ok("鍵盤 ←：往回一張（你笑起來真好看）、馬上放", (await dbg(p)).sel === "my_smile" && (await bgm(p)) === "my:my_smile");
    ok("轉盤操作：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1. 舊存檔：紀念唱片第一次進唱片行一起補發（recshop：舊規則）；買；沒拿到的不放；「🏝️ 原本的音樂」；家長鎖；備份碼；nav；清除重來 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 25, stars: 30, query: Q }); await covers(ctx);
    await p.evaluate(() => { localStorage.setItem("zy1_tops", JSON.stringify({ stars: 20, freeUsed: 1, rank: 1 })); localStorage.setItem("zy1_bubble", JSON.stringify({ lv: 1, stars: { 0: 2 } })); });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(400);
    await clearSpoken(p);
    ok("開頁：只有 7 首我的歌（一開始就有）；紀念唱片要進唱片行才補發", JSON.stringify((await rec(p)).own) === JSON.stringify(MINE), JSON.stringify(await rec(p)));
    ok("openRecords → 唱片牆打開", (await p.evaluate(() => window.__zy.openRecords())) && await wallOn(p));
    await sleep(300);
    let R = await rec(p);
    ok("補發：彩虹島（25 張 ≥ 20）、對戰（陀螺 rank 1）、泡泡（過過一關）；歸仁區（< 30）、配送、寵物不送", ["r_rainbow", "r_battle", "r_bubble", ...MINE].every(id => R.own.includes(id)) && !["r_town", "r_road", "r_evolve"].some(id => R.own.includes(id)) && R.own.length === MINE.length + 3, JSON.stringify(R));
    ok("補發有存進 zy1_rec", await p.evaluate(n => (JSON.parse(localStorage.getItem("zy1_rec")) || {}).own.length === n, MINE.length + 3));
    ok("DJ 說「拿到新唱片了！」（泡泡也是）", (await spoken(p)).includes("拿到新唱片了！") && (await txt(p, ".rc-bub")) === "拿到新唱片了！", JSON.stringify(await spoken(p)));
    ok("recshop：錢包膠囊在標題旁邊", (await btn(p, ".rc-wallet")).shown && strip((await btn(p, ".rc-wallet")).text) === "⭐20");
    ok(`唱片 ${ALL} 張（沒有音樂島主題曲 r_music；寵物那張叫「寵物」、放 dress）`, await p.evaluate(n => window.__zy.REC.RECORDS.length === n && !window.__zy.REC.REC_BY_ID.r_music && window.__zy.REC.REC_BY_ID.r_evolve.name === "寵物" && window.__zy.REC.REC_BY_ID.r_evolve.bgm === "dress", ALL));
    await tabTo(p, "memo"); await sleep(300);
    const memo = await p.evaluate(() => [...document.querySelectorAll(".rc-shop .rc-rec")].map(c => ({ id: c.dataset.id, have: c.classList.contains("have") })));
    ok("🏅 紀念唱片標籤：拿到的亮、沒拿到的灰（歸仁區）", memo.length === 6 && memo.find(m => m.id === "r_rainbow").have && !memo.find(m => m.id === "r_town").have && await p.evaluate(() => getComputedStyle(document.querySelector(".rc-rec[data-id=r_town] .rc-lab")).filter.includes("grayscale")), JSON.stringify(memo));
    ok("彩虹島（拿到了）在中間：小字「紀念唱片」、在放", (await dbg(p)).sel === "r_rainbow" && (await txt(p, ".rc-sub")) === "紀念唱片" && (await bgm(p)) === "rainbow");
    ok("🎤 鈕藏著（兒歌接唱第三批才做）", !(await btn(p, ".rc-sing")).shown);
    await clearSpoken(p); await pickRec(p, "r_town");
    ok("轉到沒拿到的紀念唱片（歸仁區）：不放（繼續放彩虹島）、沒有「✓ 就聽這首」／買的鈕", (await bgm(p)) === "rainbow" && !(await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_town]").classList.contains("rc-spin"))) && !(await btn(p, ".rc-go")).shown && !(await btn(p, ".rc-buy")).shown, String(await bgm(p)));
    ok("沒拿到的紀念唱片：小字寫條件、語音直接講「開放歸仁區就送你」（不識字的小孩也懂）", (await txt(p, ".rc-sub")) === "開放歸仁區就送你" && (await spoken(p)).includes("開放歸仁區就送你"), JSON.stringify(await spoken(p)));
    // 買店裡的：錢包 20 顆
    await p.evaluate(() => window.__zy.setWallet(20)); await pickRec(p, "r_calm", 300);
    ok("店裡的唱片（沒買）：「⭐8 買下來」、小字「小島配樂・⭐8」、不放", strip((await btn(p, ".rc-buy")).text) === "⭐8買下來" && (await btn(p, ".rc-buy")).shown && (await txt(p, ".rc-sub")) === "小島配樂・⭐8" && (await bgm(p)) !== "calm");
    await click(p, ".rc-buy"); await click(p, ".rc-buy-go");   // 同一瞬間連點兩下
    ok("連點兩下（不到 0.4 秒）：不會買", !(await rec(p)).own.includes("r_calm") && (await p.evaluate(() => window.__zy.wallet)) === 20 && (await btn(p, ".rc-buy-go")).shown);
    await sleep(450); await click(p, ".rc-buy-go"); await sleep(300);
    R = await rec(p);
    ok("隔 0.4 秒再按「✔ 買」：買到了、錢包 20 → 12、存檔", R.own.includes("r_calm") && (await p.evaluate(() => window.__zy.wallet)) === 12 && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rec")).own.includes("r_calm")), JSON.stringify(R));
    ok("買到之後：馬上放、有「✓ 就聽這首」、沒有買的鈕、唱片亮起來", (await bgm(p)) === "calm" && (await btn(p, ".rc-go")).shown && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-buy-go")).shown && await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_calm]").classList.contains("have")));
    // 錢不夠
    await p.evaluate(() => window.__zy.setWallet(5)); await clearSpoken(p); await pickRec(p, "r_night", 300);
    await click(p, ".rc-buy"); await sleep(500); await click(p, ".rc-buy-go");
    ok("錢不夠（5 顆、要 8 顆）：按「買下來」說「還差 3 顆星星！」（數字）、不會出「✔ 買」、錢包不變", !(await rec(p)).own.includes("r_night") && (await p.evaluate(() => window.__zy.wallet)) === 5 && !(await btn(p, ".rc-buy-go")).shown && (await spoken(p)).includes("還差 3 顆星星！"), JSON.stringify(await spoken(p)));
    ok("1180×820 recshop（錢包、買下來）：唱片牆元素互不重疊、在畫面內、按鈕 ≥44px", wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
    // 原本的音樂
    await pickRec(p, "r_rainbow", 300);
    ok("「🏝️ 原本的音樂」在放唱片時不亮", (await bgm(p)) === "rainbow" && !(await p.evaluate(() => document.querySelector(".rc-orig").classList.contains("on"))));
    await click(p, ".rc-orig"); await sleep(300);
    ok("按「🏝️ 原本的音樂」：停掉唱片、唱片牆收起來、放主島原本的 island", !(await wallOn(p)) && (await bgm(p)) === "island" && !(await npId(p)));
    // 家長鎖
    await p.evaluate(() => window.__zy.openRecords()); await sleep(350);
    ok("再開唱片牆：停在剛剛放過的那張（彩虹島）、馬上放", (await dbg(p)).sel === "r_rainbow" && (await bgm(p)) === "rainbow");
    await click(p, ".rc-go"); await sleep(300);
    ok("（就聽這首）小島上在放彩虹島", (await bgm(p)) === "rainbow" && (await npId(p)) === "r_rainbow");
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(300);
    const so = await p.evaluate(() => ({ has: !!document.querySelector("#bgmLockOpts"), on: document.querySelector("#bgmLockOpts .opt.on")?.dataset.v }));
    ok("家長頁 🎵 段有「小島只放原本的音樂」開關、預設關", so.has && so.on === "0", JSON.stringify(so));
    await p.evaluate(() => document.querySelector("#bgmLockOpts .opt[data-v='1']").click()); await sleep(300);
    await p.evaluate(() => document.getElementById("bgmLockOpts").scrollIntoView({ block: "center" })); await sleep(200);
    await p.screenshot({ path: path.join(SHOTS, "records-settings-lock-1180x820.png") });
    ok("開鎖：存成 zy_bgm_lock＝1、按鈕亮「開」", await p.evaluate(() => localStorage.getItem("zy_bgm_lock") === "1" && document.querySelector("#bgmLockOpts .opt.on").dataset.v === "1" && window.__zy.bgmLock === 1));
    ok("開鎖：正在放的唱片停掉、放回原本的 island", (await bgm(p)) === "island" && !(await npId(p)));
    await p.evaluate(() => document.getElementById("settingsClose").click()); await sleep(300);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_battle", 350);
    const lk = await p.evaluate(() => ({ isle: !document.querySelector(".rc-isle").classList.contains("hidden"), lock: document.querySelector(".rc-lock").classList.contains("hidden") ? "" : document.querySelector(".rc-lock").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") }));
    ok("鎖著的唱片牆：「✓ 就聽這首」藏起來、寫一行「家長設定：小島放原本的音樂」；「原本的音樂」還在；轉到照樣會放（試聽）", lk.isle && lk.lock === "家長設定：小島放原本的音樂" && !(await btn(p, ".rc-go")).shown && (await bgm(p)) === "battle", JSON.stringify(lk));
    ok("鎖著的唱片牆：元素互不重疊、在畫面內", wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
    await click(p, ".rc-x"); await sleep(300);
    ok("鎖著：關掉唱片牆＝唱片停掉、放回 island；小島上沒有迷你播放器", (await bgm(p)) === "island" && !(await npId(p)) && !(await npS(p)).shown);
    ok("備份碼不帶 zy_bgm_lock（全家共用的家長設定，跟背景音樂開關一樣）", await p.evaluate(() => !/bgm_lock|bgmLock/.test(atob(window.__zyB.exportCode().slice(4)))));
    await setLock(p, false); await sleep(800);
    ok("關鎖：迷你播放器又出來（小顆「換音樂」）", (await npS(p)).shown && (await npS(p)).mode === "idle" && strip((await npS(p)).name) === "換音樂", JSON.stringify(await npS(p)));
    // 備份碼：rc 跟著走（11-03 起不存小島音樂：pick 一律空）
    const code = await p.evaluate(() => window.__zyB.exportCode());
    const dec = await p.evaluate(c => window.__zyB.readCode(c), code);
    ok("備份碼 ZY2 帶 rc（唱片）；pick 一律空（沒有小島音樂設定了）", dec && dec.slots[0].rec && dec.slots[0].rec.own.includes("r_calm") && dec.slots[0].rec.pick === "", JSON.stringify(dec && dec.slots[0].rec));
    const evil = "ZY2:" + Buffer.from(JSON.stringify({ v: 2, p: [{ s: ["貓"], st: 1, rc: { own: ["r_town", "r_hack", 5], pick: "r_town", seen: "x" } }] })).toString("base64");
    const ev = await p.evaluate(c => window.__zyB.readCode(c), evil);
    ok("備份碼 rc 清洗：不認得的唱片丟掉、pick 丟掉、7 首我的歌一定在", ev && JSON.stringify(ev.slots[0].rec) === JSON.stringify({ own: ["r_town", ...MINE], pick: "", seen: [] }), JSON.stringify(ev && ev.slots[0].rec));
    await p.evaluate(() => { localStorage.removeItem("zy1_rec"); });
    const res = await p.evaluate(c => window.__zyB.importCode(c), code);
    R = await rec(p);
    ok("還原備份碼：唱片都回來", res === "ok" && R.own.includes("r_calm") && R.own.includes("r_rainbow"), JSON.stringify({ res, R }));
    // 換畫面（nav）收掉唱片牆；唱片牆開著不開介紹卡
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    await p.evaluate(() => window.__zy.showPick("fish")); await sleep(200);
    ok("唱片牆開著：介紹卡不會跳出來", await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")));
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 10000 }).catch(() => {});
    ok("唱片牆開著時開始一局（nav）：唱片牆收掉、唱片停、放遊戲的音樂", !(await wallOn(p)) && (await p.evaluate(() => window.__zy.mode)) === "fish" && !(await npId(p)));
    ok("遊戲中：迷你播放器不出現", !(await npS(p)).shown);
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(600);
    ok("從遊戲回小島：放原本的遊戲音樂（island）", (await bgm(p)) === "island");
    // 清除重來：這位的唱片清掉；家長鎖（全家共用）留著
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='1']").click(); document.getElementById("resetBtn").click(); document.getElementById("resetBtn").click(); document.getElementById("settingsClose").click(); }); await sleep(400);
    ok("清除重來：zy1_rec 清掉、只剩 7 首我的歌；家長鎖 zy_bgm_lock 還在", await p.evaluate(m => localStorage.getItem("zy1_rec") === null && JSON.stringify(window.__zy.recSave.own) === JSON.stringify(m) && localStorage.getItem("zy_bgm_lock") === "1" && window.__zy.bgmLock === 1, MINE), JSON.stringify(await p.evaluate(() => ({ ls: localStorage.getItem("zy1_rec"), own: window.__zy.recSave.own }))));
    ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("沒有錯誤（補發／買／原本的／家長鎖）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 留聲機：花園小舖買了送一張唱片（只送一次、一台）；點留聲機＝開唱片牆；介紹卡「💿 進唱片行」=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, stars: 60, query: Q }); await covers(ctx);
    await p.evaluate(() => { const h = window.__zy.homeSave; h.lv = 2; h.base = 0; h.gift = 1; window.__zy.setWallet(30); }); await sleep(200);   // 房子已經是小木屋（花園小舖開了）
    await p.evaluate(() => window.__zy.homeUI.openGarden()); await sleep(400);
    ok("花園小舖有留聲機（⭐12）", strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price")?.textContent)) === "⭐12");
    await clearSpoken(p);
    await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone]").click()); await sleep(450);
    await p.evaluate(() => document.querySelector(".hg-buy-go").click()); await sleep(300);
    let R = await rec(p);
    ok("買到留聲機：送一張唱片（小島 r_island）、錢包 30 → 18、說「送你一張唱片！」", R.own.includes("r_island") && (await p.evaluate(() => window.__zy.wallet)) === 18 && (await spoken(p)).some(t => t.startsWith("送你一張唱片")) && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rec")).own.includes("r_island")), JSON.stringify({ R, sp: await spoken(p) }));
    await p.evaluate(() => document.querySelector(".hg-done").click()); await sleep(300);
    await p.evaluate(() => window.__zy.homeUI.openGarden()); await sleep(300);
    ok("留聲機只能有一台（貨架寫「買滿了」、再點不會出「✔ 買」）", strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price").textContent)) === "買滿了" || strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price").textContent)).startsWith("可以放"), strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price").textContent)));
    await p.evaluate(() => window.__zy.homeItemTap("gramophone")); await sleep(200);
    ok("布置花園中點留聲機：不開唱片牆", !(await wallOn(p)));
    await p.evaluate(() => document.querySelector(".hg-done").click()); await sleep(300);
    await p.evaluate(() => window.__zy.homeItemTap("gramophone")); await sleep(300);
    ok("點前院的留聲機（不在布置）：打開唱片牆", await wallOn(p));
    await sleep(400);
    ok("1180×820：唱片牆元素互不重疊、在畫面內", wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
    await click(p, ".rc-x"); await sleep(300);
    const own0 = (await rec(p)).own.length;
    await p.evaluate(() => { const h = window.__zy.homeSave; h.own.gramophone = 0; delete h.own.gramophone; h.yard = h.yard.map(x => x === "gramophone" ? null : x); window.__zy.setWallet(30); });
    await p.evaluate(() => window.__zy.homeUI.openGarden()); await sleep(300);
    await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone]").click()); await sleep(450); await p.evaluate(() => document.querySelector(".hg-buy-go").click()); await sleep(300);
    ok("（退掉再買一次）已經有那張唱片＝不再送（唱片數不變）", (await rec(p)).own.length === own0);
    await p.evaluate(() => document.querySelector(".hg-done").click()); await sleep(300);
    // 介紹卡（卡片選單沒有 3D：直接呼叫 showPick）
    await clearSpoken(p);
    await p.evaluate(() => window.__zy.showPick("records", {})); await sleep(300);
    const pk = await p.evaluate(() => ({ name: document.getElementById("pkName").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), go: document.getElementById("pkGo").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), meta: document.getElementById("pkMeta").textContent, lock: document.getElementById("pkLock").textContent, lv: !document.getElementById("pkLv") || document.getElementById("pkLv").classList.contains("hidden") }));
    ok(`唱片行介紹卡：名字「音符唱片行」、大按鈕「💿 進唱片行」、寫有幾張唱片（共 ${ALL} 張）、沒有等級徽章、沒鎖（45 張）`, pk.name === "音符唱片行" && pk.go === "💿進唱片行" && new RegExp(`💿 \\d+／${ALL}`).test(pk.meta) && !pk.lock && pk.lv, JSON.stringify(pk));
    ok("貓頭鷹唸「音符唱片行！」", (await spoken(p)).includes("音符唱片行！"), JSON.stringify(await spoken(p)));
    await p.evaluate(() => document.getElementById("pkGo").click()); await sleep(300);
    ok("按「💿 進唱片行」：介紹卡收起來、唱片牆打開", await wallOn(p) && await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")));
    await click(p, ".rc-x"); await sleep(300);
    await p.evaluate(() => window.__zy.showPick("fish", {})); await sleep(200);
    ok("換別的介紹卡：大按鈕變回「▶️ 開始玩」", strip(await p.evaluate(() => document.getElementById("pkGo").textContent)) === "▶️開始玩");
    await p.evaluate(() => document.getElementById("pkClose").click());
    ok("留聲機／介紹卡：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 25 張：唱片行介紹卡鎖著；各尺寸唱片牆（三個標籤、最長的歌名、最長的 DJ 泡泡）互不重疊、在畫面內 =====
  {
    const { ctx, p } = await openGame(browser, { stickers: 25, query: Q });
    await p.evaluate(() => window.__zy.showPick("records", {})); await sleep(300);
    ok("25 張：唱片行介紹卡鎖著、寫「再收集 15 張貼紙」、沒有大按鈕", await p.evaluate(() => document.getElementById("pick").classList.contains("locked") && document.getElementById("pkLock").textContent.includes("再收集 15 張貼紙") && getComputedStyle(document.getElementById("pkGo")).display === "none"));
    await p.evaluate(() => document.getElementById("pkClose").click());
    await ctx.close();
    for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [768, 1024], [390, 844]]) {
      const P = await openGame(browser, { w, h, stickers: 45, query: QF }); await covers(P.ctx);
      await P.p.evaluate(() => window.__zy.openRecords()); await sleep(3000);   // 等 DJ 教轉盤（泡泡比招呼長）
      const bad = [];
      for (const k of ["memo", "shop", "mine"]) { await tabTo(P.p, k); await sleep(450); const r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push(k + ":" + JSON.stringify(r)); }
      for (const id of ["my_eyes", "my_smile"]) { await pickRec(P.p, id, 500); const r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push(id + ":" + JSON.stringify(r)); }
      await P.p.evaluate(() => { document.querySelector(".rc-bub").textContent = window.__zy.REC.LINES.mute; }); await sleep(200);   // 最長的 DJ 台詞
      const r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push("泡泡最長:" + JSON.stringify(r));
      ok(`${w}×${h}：唱片牆（三個標籤、最長歌名、最長泡泡）元素互不重疊、中間＋兩旁唱片和按鈕都在畫面內、按鈕 ≥44px`, bad.length === 0, bad.join(" ‖ "));
      const sz = await P.p.evaluate(() => { const m = document.querySelector(".rc-rec.rc-mid").getBoundingClientRect(); return Math.round(m.width); });
      ok(`${w}×${h}：中間那張唱片夠大（≥ 150px）`, sz >= 150, String(sz));
      if (w === 820 || w === 390) await P.p.screenshot({ path: path.join(SHOTS, `records-wall-${w}x${h}.png`) });
      ok(`${w}×${h}：沒有錯誤`, P.errs.length === 0, P.errs.join(" | "));
      await P.ctx.close();
    }
  }
  // ===== 4. 放唱片（11-03）：迷你播放器點開唱片牆；我的歌一打開全部先下載；⏳；預載好換歌很快；「✓ 就聽這首」；⏹；副歌每次從頭、放完回原本的；
  //          配樂放一輪；進遊戲／重開網頁＝原本的（阿葉選「回到原本的遊戲音樂」）；音樂關著 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: QF }); await covers(ctx);
    const bins = []; p.on("request", r => { const m = r.url().match(/audio\/songs\/(\w+)\.bin/); if (m) bins.push(m[1]); });
    await ctx.route("**/audio/songs/*.bin*", async r => { await sleep(1500); await r.continue(); });   // 下載慢一點：看得到 ⏳
    const S = () => p.evaluate(() => { const z = window.__zy, d = window.__zyAudio.debug(), pl = document.getElementById("recNow");
      return { wall: z.recUI.isOpen(), bgm: z.bgmNow(), np: z.recUI.debug.np, dance: z.recUI.debug.dances.slice(-1)[0], loading: d.loading,
        play: d.stream.find(s => s.key && s.key === d.cur) || null, pill: !pl.classList.contains("hidden") && getComputedStyle(pl).display !== "none", mode: pl.dataset.mode,
        text: pl.querySelector(".rc-np-t").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), mid: pl.querySelector(".rc-np-mid").textContent, aria: pl.querySelector(".rc-np-open").getAttribute("aria-label"),
        btns: [...pl.querySelectorAll(".rc-np-b")].filter(b => getComputedStyle(b).display !== "none").length, menuKey: z.menuBgmKey() }; });
    const playing = (ms = 15000) => p.waitForFunction(() => { const d = window.__zyAudio.debug(); return !d.loading && d.stream.some(s => s.key === d.cur && !s.paused); }, null, { timeout: ms }).then(() => true, () => false);
    const stopBtn = () => p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click());
    let s = await S();
    ok("迷你播放器 #recNow 在 #menu > .menu-bottom 裡、小島上一直都在：沒在放＝小顆「換音樂」（沒有 ⏮⏹⏭）", await p.evaluate(() => document.getElementById("recNow").parentNode.matches("#menu > .menu-bottom")) && s.pill && s.mode === "idle" && s.text === "換音樂" && s.btns === 0 && s.aria === "換音樂", JSON.stringify(s));
    await p.evaluate(() => document.querySelector("#recNow .rc-np-open").scrollIntoView({ block: "center" })); await sleep(150);   // 卡片選單（沒有 3D）比畫面長：播放器在下面，先捲過去
    const pc = await center(p, "#recNow .rc-np-open"); await p.mouse.click(pc.x, pc.y); await sleep(250);   // 真的點：也順便解鎖聲音（iOS 規則一樣）
    s = await S(); const d0 = await dbg(p);
    ok("點迷你播放器：打開唱片牆（不用去音樂島）、停在我的歌第一首、馬上要放它", s.wall && d0.sel === "my_soyeon" && s.bgm === "my:my_soyeon", JSON.stringify({ s, d0 }));
    await sleep(150);
    ok("一打開：我的歌 7 首全部先下載", MINE.every(id => bins.includes(id)), JSON.stringify(bins));
    const w1 = await p.evaluate(() => ({ lab: window.__zy.recUI.debug.label(), wait: document.querySelector(".rc-rec.rc-mid").classList.contains("rc-wait"), loading: window.__zyAudio.debug().loading }));
    ok("第一次放（還在下載＋解密）：中間那張換成 ⏳、先不轉", w1.lab === "⏳" && w1.wait && w1.loading, JSON.stringify(w1));
    const ok1 = await playing(); await sleep(400);
    const w2 = await p.evaluate(() => { const m = document.querySelector(".rc-rec.rc-mid"); return { lab: window.__zy.recUI.debug.label(), wait: m.classList.contains("rc-wait"), spin: m.classList.contains("rc-spin") }; });
    ok("開始出聲：⏳ 拿掉（換回 💼）、唱片在轉", ok1 && w2.lab === "💼" && !w2.wait && w2.spin, JSON.stringify({ ok1, w2 }));
    await sleep(1500);   // 其他幾首也下載好了
    const tA = Date.now(); await pickRec(p, "my_jay", 0);
    const okJ = await p.waitForFunction(() => { const d = window.__zyAudio.debug(); return d.cur === "my:my_jay" && !d.loading && d.stream.some(s => s.key === d.cur && !s.paused && s.t > 0); }, null, { timeout: 3000, polling: 20 }).then(() => true, () => false);   // 女兒殿下真的開始出聲（不是上一首還在放）
    const msJ = Date.now() - tA;
    ok("預載好之後轉到女兒殿下：不到 0.9 秒就在放（阿葉「切過去時就要馬上換音樂」）", okJ && msJ < 900 && (await bgm(p)) === "my:my_jay", `${msJ} ms`);
    const dur = await p.evaluate(() => window.__zyAudio.streamEl().duration);
    ok("副歌片段：長度 20～60 秒（不是整首歌）", dur >= 20 && dur <= 60, String(dur));
    await clearSpoken(p); await click(p, ".rc-go"); await sleep(500);
    s = await S();
    ok("「✓ 就聽這首」：唱片牆收起來、小島繼續放女兒殿下（放完就停、不循環）、寵物跳 30 秒、選單音樂也是這首", !s.wall && s.bgm === "my:my_jay" && s.np && s.np.song && s.dance === 30 && s.play && !s.play.loop && s.menuKey === "my:my_jay", JSON.stringify(s));
    ok("迷你播放器展開：女兒殿下＋⏮ ⏹ ⏭（讀屏「正在放：女兒殿下，換音樂」）", s.pill && s.mode === "np" && s.text === "女兒殿下" && s.mid === "⏹" && s.btns === 3 && s.aria === "正在放：女兒殿下，換音樂", JSON.stringify(s));
    await sleep(2500);
    await stopBtn(); await sleep(1000);
    s = await S();
    ok("按 ⏹：回原本的小島音樂（island）、播放器縮回「換音樂」、寵物停", s.bgm === "island" && !s.np && s.pill && s.mode === "idle" && s.dance === 0, JSON.stringify(s));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300); await playing(); await sleep(300);
    s = await S(); const d1 = await dbg(p);
    ok("再開唱片牆：停在剛剛放過的女兒殿下、一打開就放、從副歌開頭放（不接著上次）", d1.sel === "my_jay" && s.bgm === "my:my_jay" && s.play && s.play.t < 1.5, JSON.stringify({ d1, play: s.play }));
    await click(p, ".rc-go"); await sleep(300); await playing();
    await p.evaluate(() => { const e = window.__zyAudio.streamEl(); e.currentTime = e.duration - 1.2; });
    await p.waitForFunction(() => !window.__zy.recUI.debug.np, null, { timeout: 8000 }).catch(() => {}); await sleep(300);
    s = await S();
    ok("副歌放完（audio ended）：回原本的小島音樂、播放器縮回、寵物停（阿葉 11-01「放完之後就變成原本遊戲的背景音樂」）", s.bgm === "island" && !s.np && s.mode === "idle" && s.dance === 0, JSON.stringify(s));
    // 配樂（會循環的）：放一輪就回原本的
    await p.evaluate(() => { window.__zy.REC.TIMES.round = 1500; window.__zy.openRecords(); }); await sleep(200); await pickRec(p, "r_rainbow", 300); await click(p, ".rc-go"); await sleep(300);
    const sA = await S(); await sleep(2000); s = await S();
    ok("配樂（彩虹島）放一輪（測試改 1.5 秒）：自己回原本的小島音樂、播放器縮回", sA.bgm === "rainbow" && sA.mode === "np" && sA.text === "彩虹島" && s.bgm === "island" && !s.np && s.mode === "idle" && s.dance === 0, JSON.stringify({ sA, s }));
    await p.evaluate(() => { window.__zy.REC.TIMES.round = 45000; window.__zy.openRecords(); }); await sleep(200); await pickRec(p, "r_rainbow", 300); await click(p, ".rc-go"); await sleep(300);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 10000 }).catch(() => {}); await sleep(500);
    s = await S();
    ok("放到一半進遊戲：唱片停、放遊戲自己的音樂、播放器不見", !s.np && s.bgm !== "rainbow" && !s.pill, JSON.stringify(s));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(800);
    s = await S();
    ok("從遊戲回小島：放原本的遊戲音樂（island；阿葉 11-03 選的）、播放器是小顆「換音樂」", s.bgm === "island" && !s.np && s.pill && s.mode === "idle", JSON.stringify(s));
    // 重開網頁：舊存檔的「小島音樂」設定丟掉、放原本的
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_smile", 300); await click(p, ".rc-go"); await sleep(300);
    await p.evaluate(() => localStorage.setItem("zy1_rec", JSON.stringify({ own: [], pick: "my_jay", seen: [] })));   // 11-01 的舊存檔：小島音樂＝女兒殿下
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(600);
    s = await S();
    ok("重開網頁：放原本的音樂（island）、舊存檔的小島音樂設定丟掉（pick 空）、播放器小顆", s.bgm === "island" && !s.np && (await rec(p)).pick === "" && s.mode === "idle", JSON.stringify({ s, R: await rec(p) }));
    // 音樂關著：打開唱片牆不放、說一聲；「✓ 就聽這首」留在唱片牆
    await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(300); await clearSpoken(p);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(400);
    s = await S();
    ok("音樂關著：打開唱片牆不放（沒有正在放的）、DJ 說「音樂關著喔」", s.wall && !s.np && (await spoken(p)).some(t => t.startsWith("音樂關著喔")), JSON.stringify({ s, sp: await spoken(p) }));
    await pickRec(p, "my_jay", 300); await pickRec(p, "my_hero", 300);
    ok("音樂關著：再撥兩張也只說一次「音樂關著喔」（里維 11-03：撥一張講一次太吵）", (await spoken(p)).filter(t => t.startsWith("音樂關著喔")).length === 1, JSON.stringify(await spoken(p)));
    await click(p, ".rc-go"); await sleep(300);
    ok("音樂關著：按「✓ 就聽這首」不收唱片牆、泡泡寫「音樂關著喔」", (await wallOn(p)) && !(await npId(p)) && (await txt(p, ".rc-bub")).startsWith("音樂關著喔"));
    await click(p, ".rc-x"); await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(300);
    // 11-03 里維：唱片放到一半開圖鑑（nav、圖鑑自己不換音樂）＝先換回選單音樂（不然唱片放完圖鑑裡就沒聲音）
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_eyes", 300); await click(p, ".rc-go"); await sleep(300);
    const bAl = await bgm(p); await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(1000);
    ok("唱片放到一半開圖鑑：唱片停、換回選單音樂（island）", bAl === "my:my_eyes" && !(await npId(p)) && (await bgm(p)) === "island" && await p.evaluate(() => !document.getElementById("album").classList.contains("hidden")), JSON.stringify({ bAl, np: await npId(p), b: await bgm(p) }));
    ok("旁注音沒漏字（播放器、還差幾顆）", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("放唱片：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4b. 迷你播放器：小顆「換音樂」的樣子、⏮ ⏹ ⏭ 換唱片、✕ 關牆繼續放；家長鎖；封面圖（有圖＝圓形封面、壞掉＝退回 emoji）；prefers-reduced-motion =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: QF }); await covers(ctx, ["my_jay", "r_rainbow"]);
    const npb = sel => p.evaluate(c => document.querySelector("#recNow " + c).click(), sel);
    await p.evaluate(() => document.getElementById("recNow").scrollIntoView({ block: "center" })); await sleep(150);   // 卡片選單（沒有 3D）比畫面長：播放器在下面（3D 小島的位置在第 5 段驗）
    let n = await npS(p);
    ok("沒在放唱片：小顆「換音樂」：唱片中間 🎵、不轉、沒有 ⏮⏹⏭、≥44px、≤440 寬、在畫面內", n.shown && n.mode === "idle" && strip(n.name) === "換音樂" && n.nBtn === 1 && n.spin === "none" && n.h >= 44 && n.w <= 440 && !n.small && n.inV && await p.evaluate(() => document.querySelector("#recNow .rc-np-lab .rc-e").textContent === "🎵"), JSON.stringify(n));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    const cv = await p.evaluate(() => { const lab = id => document.querySelector(`.rc-rec[data-id=${id}] .rc-lab`), im = id => lab(id).querySelector("img.rc-cover");
      return { jay: !!im("my_jay") && im("my_jay").naturalWidth > 0 && lab("my_jay").classList.contains("rc-has-cover") && getComputedStyle(lab("my_jay").querySelector(".rc-e")).visibility === "hidden" && getComputedStyle(im("my_jay")).objectFit === "cover" && getComputedStyle(im("my_jay")).borderRadius === "50%",
        hero: !im("my_hero") && !lab("my_hero").classList.contains("rc-has-cover") && lab("my_hero").querySelector(".rc-e").textContent === "🦸‍♂️", src: window.__zy.REC.REC_BY_ID.my_jay.cover }; });
    ok("封面圖：女兒殿下有圖＝圓形裁切的封面、emoji 藏起來；英雄爸爸圖壞掉＝拿掉 img、退回 emoji＋顏色", cv.jay && cv.hero && cv.src === "IMAGE/zhuyin/rec/my_jay.webp", JSON.stringify(cv));
    ok("每張唱片都有 cover＝IMAGE/zhuyin/rec/<id>.webp", await p.evaluate(() => window.__zy.REC.RECORDS.every(r => r.cover === `IMAGE/zhuyin/rec/${r.id}.webp`)));
    await pickRec(p, "my_hero", 300);
    ok("封面壞掉的英雄爸爸轉到中間：看得到 emoji 🦸‍♂️＋顏色", await p.evaluate(() => { const l = document.querySelector(".rc-rec.rc-mid .rc-lab"), e = l.querySelector(".rc-e"); return l.closest(".rc-rec").dataset.id === "my_hero" && getComputedStyle(e).visibility === "visible" && e.getBoundingClientRect().width > 10 && getComputedStyle(l).backgroundColor === "rgb(95, 180, 255)"; }));
    await pickRec(p, "my_jay", 300); await click(p, ".rc-go"); await sleep(600);
    n = await npS(p);
    ok("放女兒殿下：迷你播放器展開（女兒殿下／⏹）、唱片小圖是封面、在轉", n.shown && n.mode === "np" && strip(n.name) === "女兒殿下" && n.mid === "⏹" && n.spin === "rcSpin" && await p.evaluate(() => document.querySelector("#recNow .rc-np-lab").classList.contains("rc-has-cover")), JSON.stringify(n));
    ok("迷你播放器（卡片選單）：≥44px、≤440×60、鈕 ≥44px 不互疊、歌名沒被切（擺在哪由 .menu-bottom 管；3D 小島的位置在第 5 段驗）", n.h >= 44 && n.h <= 60 && n.w <= 440 && n.nBtn === 4 && !n.small && !n.bo && !n.cut, JSON.stringify(n));
    await npb(".rc-np-next"); await sleep(400);
    ok("⏭：馬上換放下一首（英雄爸爸）、寵物跳 30 秒、播放器跟著換", (await npId(p)) === "my_hero" && (await bgm(p)) === "my:my_hero" && (await lastDance(p)) === 30 && strip((await npS(p)).name) === "英雄爸爸");
    await npb(".rc-np-next"); await sleep(250);
    ok("⏭：看著我的眼睛說（長歌名：換行不切字）", (await npId(p)) === "my_eyes" && !(await npS(p)).cut && strip((await npS(p)).name) === "看著我的眼睛說", JSON.stringify(await npS(p)));
    await npb(".rc-np-next"); await npb(".rc-np-next"); await npb(".rc-np-next"); await sleep(250);
    ok("⏭ 到我的歌最後一首之後：接著是紀念唱片第一張（彩虹島）", (await npId(p)) === "r_rainbow" && (await bgm(p)) === "rainbow");
    for (let i = 0; i < 7; i++) { await npb(".rc-np-prev"); await sleep(120); }
    ok("⏮ 七下：回到 SOYEON（我的歌第一首）", (await npId(p)) === "my_soyeon");
    await npb(".rc-np-prev"); await sleep(250);
    ok("⏮：從第一張繞到最後一張（晚安）", (await npId(p)) === "r_night" && (await bgm(p)) === "night");
    // 家長鎖：正在放的停掉、播放器不見；關鎖又出來（小顆）
    await setLock(p, true); await sleep(700);
    ok("家長鎖開著：正在放的唱片停掉、播放器不見", !(await npS(p)).shown && (await bgm(p)) === "island" && !(await npId(p)));
    await setLock(p, false); await sleep(700);
    ok("關鎖：播放器又出來（小顆）", (await npS(p)).shown && (await npS(p)).mode === "idle");
    // 小顆點下去＝開唱片牆；✕ 關牆＝剛剛轉到的那張繼續放
    await npb(".rc-np-open"); await sleep(400);
    ok("小顆「換音樂」點下去＝打開唱片牆、停在剛剛放過的晚安、馬上放", (await wallOn(p)) && (await dbg(p)).sel === "r_night" && (await bgm(p)) === "night");
    await pickRec(p, "r_calm", 300); await click(p, ".rc-x"); await sleep(400);
    n = await npS(p);
    ok("✕ 關掉唱片牆：剛剛轉到的那張繼續放（安靜時光）、播放器展開、寵物跳", !(await wallOn(p)) && (await npId(p)) === "r_calm" && (await bgm(p)) === "calm" && n.mode === "np" && strip(n.name) === "安靜時光" && (await lastDance(p)) === 30, JSON.stringify(n));
    await npb(".rc-np-mid"); await sleep(400);
    ok("⏹：停掉唱片、放原本的 island、播放器縮回「換音樂」", (await bgm(p)) === "island" && !(await npId(p)) && (await npS(p)).mode === "idle");
    // prefers-reduced-motion：DJ 不點頭、唱片不轉、音波不跳
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_calm");
    const rm = await p.evaluate(() => ({ dj: getComputedStyle(document.querySelector(".rc-djfig")).animationName, vin: getComputedStyle(document.querySelector(".rc-rec.rc-mid .rc-vin")).animationName, spin: document.querySelector(".rc-rec.rc-mid").classList.contains("rc-spin"), wave: getComputedStyle(document.querySelector(".rc-wave i")).animationName }));
    ok("prefers-reduced-motion：DJ 不點頭、正在放的唱片不轉、音波條不跳", rm.dj === "none" && rm.vin === "none" && rm.spin && rm.wave === "none", JSON.stringify(rm));
    ok("迷你播放器／封面：沒有錯誤、旁注音沒漏字", errs.length === 0 && (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, errs.join(" | ") + JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    await ctx.close();
  }
  // ===== 5. 3D 小島：小顆播放器的位置；點它開唱片牆（三個標籤截圖）；唱片牆開著／正在放＝小島事件（失火、生病）晚 20 秒、停掉之後照常；
  //          就聽這首＝寵物真的在跳、播放器不擋按鈕（橫／直）；換島＝繼續放 =====
  for (const [w, h, t] of [[1180, 820, "L"], [1024, 768, "L4"], [820, 1180, "P"], [390, 844, "M"]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 45, query: "debug&novoice&night=0&weather=sunny" }); await covers(ctx);
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).catch(() => {}); await sleep(600);
    await p.evaluate(() => window.__hub3d.events(false));
    let pc = await npS(p);
    ok(`${t} ${w}×${h}：小島上一開始就有小顆「換音樂」：在畫面內、≥44px、不擋別的按鈕／狀態列／貓頭鷹`, pc.shown && pc.mode === "idle" && pc.inV && pc.h >= 44 && !pc.small && pc.hit.length === 0, JSON.stringify(pc));
    if (t === "L" || t === "P" || t === "M") await p.screenshot({ path: path.join(SHOTS, `island-player-idle-${w}x${h}.png`) });
    const c0 = await center(p, "#recNow .rc-np-open"); await p.mouse.click(c0.x, c0.y); await sleep(400);
    ok(`${t}：點小顆「換音樂」＝打開唱片牆`, await wallOn(p));
    if (t === "L") for (const k of ["mine", "memo", "shop"]) {   // 唱片牆三個標籤（橫式）截圖
      await tabTo(p, k); await sleep(250); await p.evaluate(k => document.querySelectorAll(".rc-shop .rc-rec")[k === "mine" ? 2 : 1].click(), k); await sleep(1200);
      ok(`L 3D 小島霧化背景：「${k}」標籤唱片牆元素互不重疊、在畫面內`, wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
      await p.screenshot({ path: path.join(SHOTS, `wall-${k}-${w}x${h}.png`) });
    }
    if (t === "P") { await pickRec(p, "my_jay", 1200); await p.screenshot({ path: path.join(SHOTS, `wall-mine-${w}x${h}.png`) }); }
    ok(`${t} ${w}×${h}：唱片牆背景是霧化的小島（backdrop-filter blur）`, await p.evaluate(() => /blur/.test(getComputedStyle(document.querySelector(".rc-shop")).backdropFilter || getComputedStyle(document.querySelector(".rc-shop")).webkitBackdropFilter || "")));
    const ev = async () => { await p.evaluate(() => window.__hub3d.eventSoon()); await sleep(600); return p.evaluate(() => ({ in: window.__hub3d.eventIn(), fires: window.__hub3d.town().fires, open: window.__hub3d.town().open })); };
    let q = await ev();
    ok(`${t}：唱片牆開著＝小島事件（失火、寵物生病）先不出、晚 20 秒（阿葉「選唱片時遇到失火了這類的講話」）`, q.open && q.fires === 0 && q.in > 15000 && q.in <= 20000, JSON.stringify(q));
    await pickRec(p, "my_jay", 300); await p.waitForFunction(() => !window.__zyAudio.debug().loading, null, { timeout: 15000 }).catch(() => {});
    await click(p, ".rc-go"); await sleep(1200);
    const d = await p.evaluate(() => ({ dancing: window.__hub3d.dancing(), bgm: window.__zy.bgmNow(), wall: window.__zy.recUI.isOpen() }));
    ok(`${t} ${w}×${h}：就聽這首＝唱片牆收起來、3D 小島上的寵物在跳（hub.dance 約 30 秒）`, !d.wall && d.bgm === "my:my_jay" && d.dancing > 25, JSON.stringify(d));
    q = await ev();
    ok(`${t}：唱片牆關了、還在放唱片＝事件也先不出`, q.fires === 0 && q.in > 15000, JSON.stringify(q));
    pc = await npS(p);
    ok(`${t} ${w}×${h}：放唱片的迷你播放器在畫面內、≥44px、鈕 ≥44px、歌名沒被切、≤440×60（寧次 11-01）、不跟上方按鈕／狀態列／貓頭鷹重疊`, pc.shown && pc.mode === "np" && pc.inV && pc.h >= 44 && pc.h <= 60 && pc.w <= 440 && !pc.small && !pc.bo && !pc.cut && pc.hit.length === 0, JSON.stringify(pc));
    if (t === "L" || t === "P" || t === "M") await p.screenshot({ path: path.join(SHOTS, `island-player-np-${w}x${h}.png`) });
    await p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click()); await sleep(600);
    ok(`${t}：按 ⏹＝寵物停下來、回原本的音樂`, (await p.evaluate(() => window.__hub3d.dancing())) === 0 && (await p.evaluate(() => window.__zy.bgmNow())) === "island");
    q = await ev();
    ok(`${t}：停掉唱片之後：事件照常出（下一次排到 50 秒以後）`, q.in > 40000, JSON.stringify(q));
    await p.evaluate(() => window.__hub3d.events(false));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_eyes", 300); await click(p, ".rc-go"); await sleep(900);
    pc = await npS(p);
    ok(`${t} ${w}×${h}：最長歌名（看著我的眼睛說）：播放器在畫面內、歌名換兩行沒被切、≤440×60、不擋別的按鈕`, pc.shown && pc.mode === "np" && pc.inV && !pc.small && !pc.bo && !pc.cut && pc.h <= 60 && pc.w <= 440 && pc.hit.length === 0, JSON.stringify(pc));
    await p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click()); await sleep(300);
    if (t === "L") {
      await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_rainbow", 300); await click(p, ".rc-go"); await sleep(500);
      await p.evaluate(() => window.__hub3d.goPlace("music")); await sleep(1500);
      const g = await p.evaluate(() => ({ np: (window.__zy.recUI.debug.np || {}).id, bgm: window.__zy.bgmNow(), mode: document.getElementById("recNow").dataset.mode }));
      ok("放唱片放到一半換島（音樂島）：繼續放那張（彩虹島）、播放器還在", g.np === "r_rainbow" && g.bgm === "rainbow" && g.mode === "np", JSON.stringify(g));
      await p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click()); await sleep(600);
      ok("音樂島上按 ⏹：放音樂島原本的音樂（dress）", (await p.evaluate(() => window.__zy.bgmNow())) === "dress");
    }
    ok(`${t} 沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 6. 直式上方按鈕（櫻木 11-01：音樂島時 🗺️ 疊在貼紙上、「回小島」被切掉）：主島／音樂島／彩虹島／歸仁區 × 有鎖頭／繼續玩，互不重疊、都在畫面內 =====
  for (const [w, h, st, rs] of [[820, 1180, 45, 0], [820, 1180, 25, 1], [768, 1024, 25, 0], [390, 844, 25, 0], [390, 844, 25, 1]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: st, stars: 30, query: "debug&novoice&night=0&weather=sunny" });
    if (rs) { await p.evaluate(() => import("./js/zhuyin-words.js").then(({ WORDS }) => { localStorage.setItem("zy1_resume", JSON.stringify({ mode: "fish", idx: 2, results: [3, 3], combo: 2, earned: [], words: WORDS.slice(0, 10).map(x => [x.h, 1]), t: Date.now() })); }));
      await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(400); }
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).catch(() => {}); await sleep(500);
    await p.evaluate(() => window.__hub3d.events(false));
    const bad = [];
    for (const pl of ["main", "music", "rainbow", "town"]) {
      await p.evaluate(pl => window.__hub3d.goPlace(pl), pl); await sleep(2600);
      const r = await p.evaluate(topCheck);
      if (r.bad.length || r.out.length) bad.push(pl + ":" + JSON.stringify(r));
      if (pl === "music" && w === 820 && st === 45) await p.screenshot({ path: path.join(SHOTS, "music-isle-top-820x1180.png") });
    }
    ok(`直式 ${w}×${h}（貼紙 ${st}${st < 30 ? "：歸仁區、音樂島鎖著" : ""}${rs ? "、有繼續玩" : ""}）：四座島的上方按鈕互不重疊、都在畫面內`, bad.length === 0, bad.join(" ‖ "));
    ok(`直式 ${w}×${h} 貼紙 ${st}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  console.log(`\n${out.filter(l => l.startsWith("PASS")).length}/${out.length} PASS　截圖：${SHOTS}`);
  process.exitCode = out.some(l => l.startsWith("FAIL")) ? 1 : 0;
})().catch(e => { console.log(out.join("\n")); console.error(e); process.exit(1); });   // 中途出錯：先印出已經跑完的結果，再直接結束（瀏覽器還開著，不 exit 會一直掛著）
