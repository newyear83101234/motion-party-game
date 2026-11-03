// 注音小島 v8 音符唱片行（docs/zhuyin-v8-plan.md §4；借鏡 Tack Lin《開工吧！社畜人生！》唱片行「選擇專輯」一排唱片左右轉的呈現，畫面、角色都用我們自己的）
// 三種唱片：🎧 我的歌（阿葉指定的整首歌，一開始就有）、🏅 紀念唱片（做到一件事就送那首配樂）、🎼 小島配樂（店裡賣的，用「我的星星」買）。
// 11-01 v3 唱片牆＝全螢幕轉盤（阿葉批准的示意圖 scratchpad/recmock）：背景是霧化變暗的小島；上面三個標籤；中間一排黑膠，正中間最大、外圈發光，兩旁變小往後斜；
//   手指左右撥（放開吸到最近一張）、點旁邊那張＝轉到中間、‹ › 鈕；轉到中間停 0.6 秒＝自動試聽 10 秒（下載中 ⏳）；下面名字＋一行小字＋音波條＋「▶ 聽整首」「🏝️ 當小島音樂」＋小顆「🏝️ 原本的音樂」；
//   左下角戴粉紅耳機的無尾熊 DJ 跟著拍子點頭，旁邊對話泡泡＝DJ 正在說的話（api.talk 照常唸）。家長鎖開著：「當小島音樂」「原本的」藏起來，改一行 LOCK_TEXT。
// 小島音樂：選一張＝回小島就放這張（每座島都是）；「🔀 隨機」是我的歌標籤的第一張；「🏝️ 原本的音樂」＝每座島自己的。遊戲中照樣放各遊戲自己的音樂（主程式 menuBgmKey 才看這裡）。
// 「▶ 聽整首」＝收起唱片牆、回小島放這首、寵物跟著跳；放完（整首歌＝<audio> ended；一般曲＝放一輪約 60 秒）、進遊戲（nav）、換島、再開唱片牆＝回到原本該放的小島音樂。正在放哪首：nowKey()。
// 小島上的迷你播放器（#recNow，掛在 #menu > .menu-bottom 停靠列裡）：小島音樂是唱片、或正在「聽整首」時出現：唱片小圖＋歌名＋⏮ ⏸ ⏭（聽整首時中間是 ⏹）；約 440×60（寧次 11-01：4:3 iPad 才跟進化膠囊排得進一排）。

import { MY_SONGS, registerSongs } from "./zhuyin-mysongs.js?v=3";   // 🎧 我的歌（阿葉 11-01 指定的整首歌；主程式開頁 REC.registerSongs(A) 登記給音訊引擎）
export { registerSongs };

// bgm＝audio/bgm 的鍵（我的歌是 "my:id"＝整首歌串流）；memo＝紀念唱片要做到的事（主程式 conds() 給 true/false）；how＝還沒拿到時寫的小字；by＝我的歌的歌手
// cover＝唱片中間圓形貼紙的封面圖（IMAGE/zhuyin/rec/<id>.webp，另外做；還沒有／載入失敗＝退回 emoji＋顏色）
export const RECORDS = [
  ...MY_SONGS.map(s => ({ id: s.id, kind: "mine", name: s.name, by: s.by, e: s.e, bgm: s.bgm, color: s.color })),
  { id: "r_rainbow", kind: "memo", name: "彩虹島", e: "🌈", bgm: "rainbow", memo: "rainbow", how: "開放彩虹島就送你", color: "#ff8fb1" },
  { id: "r_town", kind: "memo", name: "歸仁區", e: "🏙️", bgm: "town", memo: "town", how: "開放歸仁區就送你", color: "#5fb4ff" },
  // （音樂島主題曲 r_music 第三批才有 bgm 檔：Suno 11/3 額度重置後再加回來）
  { id: "r_bubble", kind: "memo", name: "泡泡", e: "🫧", bgm: "bubble", memo: "bubble", how: "泡泡過一關就送你", color: "#7fd0e8" },
  { id: "r_road", kind: "memo", name: "配送", e: "🚚", bgm: "road", memo: "road", how: "送完一次貨就送你", color: "#ffb84d" },
  { id: "r_battle", kind: "memo", name: "對戰", e: "🌀", bgm: "battle", memo: "battle", how: "陀螺打贏一次就送你", color: "#ff6f6f" },
  { id: "r_evolve", kind: "memo", name: "寵物", e: "🐾", bgm: "dress", memo: "evolve", how: "寵物進化就送你", color: "#ffd166" },   // 進化曲（evolve）22 秒不循環、playBgm 會退回 island → 放可以循環的服裝店那首
  { id: "r_island", kind: "shop", name: "小島", e: "🏝️", bgm: "island", price: 8, color: "#7fd77a" },
  { id: "r_calm", kind: "shop", name: "安靜時光", e: "🍃", bgm: "calm", price: 8, color: "#9bd8b0" },
  { id: "r_night", kind: "shop", name: "晚安", e: "🌙", bgm: "night", price: 8, color: "#6f7ff2" },
].map(r => ({ ...r, cover: r.cover || "IMAGE/zhuyin/rec/" + r.id + ".webp" }));
export const REC_BY_ID = Object.fromEntries(RECORDS.map(r => [r.id, r]));
export const RAND = { id: "rand", kind: "mine", name: "隨機", e: "🔀", color: "#9be7ff" };   // 「🔀 隨機」：我的歌標籤的第一張（不是真的唱片：沒有 bgm、不進 own）
// 三個標籤（唱片牆、迷你播放器 ⏮⏭ 都照這個順序）
export const TABS = [
  { k: "mine", t: "🎧 我的歌", ids: [RAND.id, ...RECORDS.filter(r => r.kind === "mine").map(r => r.id)] },
  { k: "memo", t: "🏅 紀念唱片", ids: RECORDS.filter(r => r.kind === "memo").map(r => r.id) },
  { k: "shop", t: "🎼 小島配樂", ids: RECORDS.filter(r => r.kind === "shop").map(r => r.id) },
];
// 阿葉 11-01 原話：「唱片可以不用星星 想換音樂就可以換」→ 全部唱片一開始就有（不用買、紀念唱片也不用先做到）。
// 想改回「紀念唱片要做到、店裡的要用星星買」：FREE 改 false（買／補發的程式都還在；測試網址加 recshop＝用舊規則測那段程式）。
export const FREE = !/[?&]recshop\b/.test(location.search);
export const GIFT_REC = "r_island";                       // 花園買留聲機送的那張
export const PREVIEW_MS = 10000;
export const TIMES = { round: 60000, wholeMax: 7 * 60000, danceRound: 30, danceWhole: 60, waitPoll: 150, settle: 600, tip: 2600, npPoll: 500 };   // 聽整首：一般曲放一輪 60 秒、整首歌最多 7 分鐘（ended 沒來的保險）；寵物跳 30／60 秒；⏳ 每 0.15 秒查一次；轉到中間停 0.6 秒才試聽；第一次開店 2.6 秒後 DJ 教怎麼轉；迷你播放器每 0.5 秒對一次狀態（測試可以改小）
export const LINES = {
  hello: "歡迎光臨音符唱片行！", pick: "點一張唱片聽聽看！", got: "拿到新唱片了！", set: "回小島就會放這首歌喔！",
  rand: "回小島會隨機放一首喔！", orig: "回小島放原本的音樂喔！", poor: "還差 N 顆星星！",   // poor：N 換成還差幾顆（數字）；紀念唱片沒拿到＝直接唸那張的 how（不識字的小孩聽得懂要做什麼）
  gift: "送你一張唱片！點留聲機就能聽歌喔！", stop: "停止播放",   // gift：花園小舖第一次買到留聲機（主程式 homeUI 的 onBuy）
  mute: "音樂關著喔，請大人到設定打開！",   // 音樂開關關著時點唱片（里維 11-01）
  tip: "轉到中間就會先聽一小段喔！",   // 這次開頁第一次進唱片行：招呼完 2.6 秒、小孩還沒動轉盤就教一次
};
export const TEXT = { memo: "紀念唱片", shop: "小島配樂", rand: "每次回小島換首歌", isle: "小島音樂", whole: "聽整首", pause: "停掉唱片，放原本的音樂" };   // 畫面上的小字（唱片名字下面那行；迷你播放器的讀屏標籤）
export const LOCK_TEXT = "家長設定：小島放原本的音樂";   // 家長鎖開著：唱片牆「當小島音樂」「原本的音樂」藏起來，只寫這行（不唸）
// 存檔 zy{n}_rec：{ own [唱片 id], pick 小島音樂（唱片 id｜"rand"｜""＝原本的）, seen [看過「拿到新唱片」的] }
export function cleanRec(d) {
  const out = { own: [], pick: "", seen: [] }; if (!d || typeof d !== "object") d = {};
  const ok = id => typeof id === "string" && Object.prototype.hasOwnProperty.call(REC_BY_ID, id);   // 不用 Object.hasOwn：Safari 15.4 以前沒有（舊 iPad 載存檔就當掉）   // 備份碼手改成 "__proto__" 之類也不會被當成唱片
  if (Array.isArray(d.own)) out.own = [...new Set(d.own.filter(ok))];
  for (const r of RECORDS) if ((FREE || r.kind === "mine") && !out.own.includes(r.id)) out.own.push(r.id);   // 我的歌一開始就有；FREE＝全部唱片一開始就有（阿葉 11-01）
  if (d.pick === "rand" || (typeof d.pick === "string" && out.own.includes(d.pick))) out.pick = d.pick;
  if (Array.isArray(d.seen)) out.seen = [...new Set(d.seen.filter(id => REC_BY_ID[id]))];
  return out;
}
// 紀念唱片：做到了就加進 own（回傳這次新拿到的）。conds＝{ rainbow, town, music, bubble, road, battle, evolve } 布林
export function grantMemos(rec, conds) {
  const got = [];
  for (const r of RECORDS) if (r.kind === "memo" && conds[r.memo] && !rec.own.includes(r.id)) { rec.own.push(r.id); got.push(r.id); }
  return got;
}
// 回小島要放哪首（null＝原本的）；rand＝隨機一張有的
export function islandBgm(rec, locked) {
  if (locked || !rec.pick) return null;
  if (rec.pick === "rand") { const own = rec.own.filter(id => REC_BY_ID[id] && REC_BY_ID[id].bgm); return own.length ? REC_BY_ID[own[Math.floor(Math.random() * own.length)]].bgm : null; }
  return REC_BY_ID[rec.pick] ? REC_BY_ID[rec.pick].bgm : null;
}

// ---------- 「▶ 聽整首」正在小島上放的那首 ----------
let np = null;                                            // { id, key, whole 整首歌, place 開始時在哪座島 }
export const nowKey = () => (np ? np.key : null);         // 主程式 menuBgmKey()：正在「聽整首」＝回小島／換日夜都繼續放這首

// ---------- 封面圖（唱片中間的圓形貼紙）----------
const noCover = new Set();                                // 這次開頁載入失敗過的封面：不再要一次（圖還沒做好時只會各 404 一次）
function coverInto(lab, r) {                              // lab 裡一直有 .rc-e（emoji）墊底；封面載好才把 emoji 藏起來（.rc-has-cover）
  const old = lab.querySelector("img");
  if (old && old.dataset.id === (r && r.id)) return;
  if (old) old.remove();
  lab.classList.remove("rc-has-cover");
  if (!r || !r.cover || noCover.has(r.id)) return;
  const im = new Image(); im.className = "rc-cover"; im.alt = ""; im.decoding = "async"; im.draggable = false; im.dataset.id = r.id;
  im.onload = () => { if (im.isConnected) lab.classList.add("rc-has-cover"); };
  im.onerror = () => { noCover.add(r.id); im.remove(); lab.classList.remove("rc-has-cover"); };   // 還沒有圖／壞掉＝退回 emoji＋顏色
  im.src = r.cover; lab.appendChild(im);
}
const recOf = id => (id === RAND.id ? RAND : REC_BY_ID[id] || null);
const tabOf = id => (id === RAND.id ? "mine" : REC_BY_ID[id] ? REC_BY_ID[id].kind : "mine");
let tipped = false;                                       // 這次開頁 DJ 教過「轉到中間就會先聽一小段」了

// ---------- 唱片牆畫面 ----------
// api：{ rec() 存檔, wallet() pay(n) save(), play(name), talk(text), bgm(key) 放這首（循環）, restore() 回到選單該放的, dance(sec), conds(), locked() 家長鎖, onSing()?, onClose(),
//        once(key|null) 這首放完就停（整首歌）, loading(key) 還沒出聲, preload(key) 先下載＋解密, onSongEnd(fn) 整首歌放完, place() 現在在哪座島, musicOn() }
export function createRecords(api) {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const setText = (e, t) => { if (e.textContent !== t) e.textContent = t; };   // 一樣就不動（旁注音不用重排）
  const locked = () => !!(api.locked && api.locked());   // 家長鎖：小島只放原本的音樂（選了也沒用 → 這幾顆藏起來）
  const bars = Array.from({ length: 24 }, (_, i) => `<i style="--i:${i};--h:${(0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + 0.4))).toFixed(2)}"></i>`).join("");
  const box = el("div", "overlay rc-shop hidden"); box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "音符唱片行");
  box.innerHTML = '<div class="rc-stage">' +
      '<div class="rc-head"><span class="rc-title">🎶 音符唱片行</span><span class="rc-wallet' + (FREE ? " hidden" : "") + '">⭐<b>0</b></span></div>' +
      '<div class="rc-tabs" role="tablist">' + TABS.map(t => `<button class="rc-tab" type="button" role="tab" data-k="${t.k}">${t.t}</button>`).join("") + "</div>" +
      '<div class="rc-flow"><div class="rc-ring"></div><button class="rc-arr rc-prev" type="button" aria-label="上一張">‹</button><button class="rc-arr rc-next" type="button" aria-label="下一張">›</button></div>' +
      '<div class="rc-info"><div class="rc-now"></div><div class="rc-sub"></div><div class="rc-wave" aria-hidden="true">' + bars + "</div></div>" +
      '<div class="rc-acts"><button class="big-btn rc-play hidden" type="button">▶ 聽整首</button><button class="big-btn alt rc-set hidden" type="button">🏝️ 當小島音樂</button>' +
        '<button class="big-btn rc-on hidden" type="button" disabled>✓ 小島正在放</button><button class="big-btn rc-buy hidden" type="button"></button><button class="big-btn rc-buy-go hidden" type="button">✔ 買</button></div>' +
      '<div class="rc-isle"><button class="rc-orig" type="button">🏝️ 原本的音樂</button></div><div class="rc-lock hidden"></div>' +
      '<button class="big-btn rc-sing hidden" type="button">🎤 幫 DJ 修唱片</button></div>' +
    '<button class="pk-x rc-x" type="button" aria-label="離開">✕</button>' +
    '<div class="rc-djbox"><span class="rc-djfig" aria-hidden="true"><img class="rc-dj" src="IMAGE/zhuyin/pets/koala.webp" alt=""><i class="rc-phones"></i><i class="rc-cup rc-cup-l"></i><i class="rc-cup rc-cup-r"></i></span><span class="rc-bub"></span></div>';
  document.body.appendChild(box);
  const $ = s => box.querySelector(s);
  const flow = $(".rc-flow"), ring = $(".rc-ring"), bub = $(".rc-bub");
  // 小島上的迷你播放器：掛在 #menu > .menu-bottom（底部中間停靠列，置中／堆疊由它管；外觀在 css/zhuyin-records.css）
  const pill = el("div", "rc-np hidden"); pill.id = "recNow"; pill.setAttribute("role", "group"); pill.setAttribute("aria-label", TEXT.isle);
  pill.innerHTML = '<span class="rc-np-disc" aria-hidden="true"><span class="rc-np-lab"><span class="rc-e"></span></span></span>' +
    '<span class="rc-np-txt"><span class="rc-np-t"><span class="rc-np-name"></span></span></span>' +
    '<button class="rc-np-b rc-np-prev" type="button" aria-label="上一首">⏮</button><button class="rc-np-b rc-np-mid" type="button"></button><button class="rc-np-b rc-np-next" type="button" aria-label="下一首">⏭</button>';
  (document.querySelector("#menu > .menu-bottom") || document.body).appendChild(pill);
  const npLab = pill.querySelector(".rc-np-lab");

  let tab = "", list = [], discs = [], cur = 0, pos = 0, sel = null;
  let previewT = 0, settleT = 0, tipT = 0, waitT = 0, npT = 0, buyAt = 0;
  let buying = false, playing = null, waiting = false, drag = null, noClickUntil = 0;
  let done = false, lastRec = null, lastOnMenu = document.body.classList.contains("on-menu"), npKey = "";   // done＝當小島音樂的那首整首歌放完一次了（主程式 recDone：這段選單改放原本的 → 播放器收起來）
  const dances = [];                                     // 測試用：叫過幾次 dance(秒)
  const dance = s => { dances.push(s); if (dances.length > 20) dances.shift(); api.dance(s); };
  const isOpen = () => !box.classList.contains("hidden");
  const owned = id => id === RAND.id || api.rec().own.includes(id);
  const commit = () => { done = false; api.save(); };   // 改了唱片設定：主程式 save() 也把 recDone／隨機清掉 → 我的歌再放一次
  function say(t) { cancelTip(); setText(bub, t); bub.classList.remove("rc-pop"); void bub.offsetWidth; bub.classList.add("rc-pop"); api.talk(t); }   // DJ 說話：泡泡＋唸出來
  function cancelTip() { clearTimeout(tipT); tipT = 0; }

  // ----- 轉盤 -----
  function buildDiscs() {                               // 換標籤才重做唱片（其他時候只改 class）
    ring.innerHTML = "";
    discs = list.map((r, i) => {
      const c = el("button", "rc-rec"); c.type = "button"; c.dataset.id = r.id; c.setAttribute("aria-label", r.name);
      const vin = el("span", "rc-vin"), lab = el("span", "rc-lab"); lab.style.setProperty("--c", r.color);
      lab.appendChild(el("span", "rc-e", r.e)); coverInto(lab, r); vin.appendChild(lab); c.appendChild(vin);
      c.appendChild(el("span", "rc-pinb", "🏝️"));       // 小島正在放這張
      c.onclick = () => tapDisc(i); ring.appendChild(c); return c;
    });
  }
  // 每張的位置：d＝離中間幾張（拖曳中是小數）。x 以唱片直徑 --S 為單位（直式 --sp 再縮）；兩旁變小、往後斜、越遠越暗，3 張外淡出
  function layout(p, anim) {
    ring.classList.toggle("rc-snap", !!anim);
    discs.forEach((c, i) => {
      const d = i - p, a = Math.abs(d), sg = Math.sign(d);
      const x = sg * (a <= 1 ? a * 0.62 : 0.62 + (a - 1) * 0.48), s = a <= 1 ? 1 - 0.28 * a : Math.max(0.36, 0.72 - 0.2 * (a - 1));
      const ry = -sg * (a <= 1 ? 26 * a : Math.min(44, 26 + 12 * (a - 1))), op = a <= 2.2 ? 1 : Math.max(0, 1 - (a - 2.2) / 0.6);
      c.style.transform = `translateX(calc(var(--S) * var(--sp) * ${x.toFixed(4)})) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;
      c.style.opacity = String(+op.toFixed(3)); c.style.zIndex = String(100 - Math.round(a * 10));
      c.style.filter = a > 0.05 ? `brightness(${(1 - Math.min(a, 2.5) * 0.14).toFixed(3)})` : "";
      c.style.visibility = op <= 0.01 ? "hidden" : ""; c.style.pointerEvents = op < 0.5 ? "none" : "";
    });
  }
  function goTo(i, sound = true) {
    if (!list.length) return;
    i = Math.max(0, Math.min(list.length - 1, i));
    const moved = i !== cur; cur = i; pos = i; layout(pos, true);
    if (moved) { if (sound) api.play("pop"); onCenter(); } else render();
  }
  function onCenter(noPreview) {                        // 換了中間那張：停 0.6 秒才試聽（撥過去的不會每張都響）
    sel = list[cur] ? list[cur].id : null; buying = false; cancelTip(); render();
    clearTimeout(settleT); settleT = noPreview ? 0 : setTimeout(settle, TIMES.settle);
  }
  function settle() {
    settleT = 0; const r = recOf(sel); if (!r || !isOpen()) return;
    if (!r.bgm) { if (playing) stopPreview(true); return; }   // 🔀 隨機：沒有單一首可以試聽 → 剛剛的試聽停掉
    if (playing === r.id) return;
    if (r.kind === "mine" && api.preload) api.preload(r.bgm);   // 我的歌：先下載＋解密（第一次要幾 MB）
    if (!api.rec().own.includes(r.id) && r.kind === "memo") say(r.how);   // 沒拿到的紀念唱片：直接講要做什麼（「泡泡過一關就送你」）
    listen(r.id);
  }
  function tapDisc(i) {
    if (performance.now() < noClickUntil) return;       // 剛拖完放開的那一下不算點
    if (i !== cur) { goTo(i); return; }                  // 點旁邊那張＝轉到中間
    cancelTip(); clearTimeout(settleT); settle();        // 點中間那張＝馬上試聽
  }
  function setTab(k, i, noPreview) {                    // 換標籤＝轉盤換成那組
    if (k !== tab || !discs.length) { tab = k; list = TABS.find(t => t.k === k).ids.map(recOf); buildDiscs(); }
    cur = Math.max(0, Math.min(list.length - 1, i)); pos = cur; layout(pos, false);
    spinSync(); labelSync(); onCenter(noPreview);
  }
  // 手指左右撥：拖曳跟著手指轉，放開吸到最近一張（甩得快多轉一張）；動不到 8px＝點（交給 click）
  const unit = () => { const w = discs[0] ? discs[0].offsetWidth : 200, sp = parseFloat(getComputedStyle(box).getPropertyValue("--sp")) || 1; return Math.max(30, w * 0.62 * sp); };
  flow.addEventListener("pointerdown", e => {
    if (drag || e.button > 0 || !list.length || e.target.closest(".rc-arr")) return;   // 第二根手指不搶第一根的撥動
    drag = { id: e.pointerId, x0: e.clientX, p0: pos, moved: false, lx: e.clientX, lt: e.timeStamp, v: 0, u: unit() };
  });
  flow.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved) { if (Math.abs(dx) < 8) return; drag.moved = true; try { flow.setPointerCapture(e.pointerId); } catch (er) {} cancelTip(); clearTimeout(settleT); }
    const dt = e.timeStamp - drag.lt; if (dt > 0) drag.v = (e.clientX - drag.lx) / dt; drag.lx = e.clientX; drag.lt = e.timeStamp;
    pos = Math.max(-0.45, Math.min(list.length - 0.55, drag.p0 - dx / drag.u)); layout(pos, false);
  });
  const dragEnd = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; if (!d.moved) return;
    noClickUntil = performance.now() + 350;
    const v = e.timeStamp - d.lt > 120 ? 0 : d.v;        // 停住才放開＝不甩
    const to = Math.round(Math.max(0, Math.min(list.length - 1, pos - (v * 140) / d.u)));
    if (to === cur) { pos = cur; layout(pos, true); onCenter(); } else goTo(to);   // 拖了又放回原位：一樣重新等 0.6 秒試聽
  };
  flow.addEventListener("pointerup", dragEnd); flow.addEventListener("pointercancel", dragEnd);
  $(".rc-prev").onclick = () => goTo(cur - 1);
  $(".rc-next").onclick = () => goTo(cur + 1);
  document.addEventListener("keydown", e => { if (!isOpen() || e.altKey || e.ctrlKey || e.metaKey) return; if (e.key === "ArrowLeft") goTo(cur - 1); else if (e.key === "ArrowRight") goTo(cur + 1); });
  for (const b of box.querySelectorAll(".rc-tab")) b.onclick = () => { if (b.dataset.k === tab) return; api.play("pop"); setTab(b.dataset.k, 0); };

  // ----- 按鈕 -----
  $(".rc-x").onclick = () => { api.play("tap"); close(); };
  $(".rc-sing").onclick = () => { api.play("select"); close(); api.onSing && api.onSing(); };
  $(".rc-play").onclick = () => { if (!sel || sel === RAND.id) return; api.play("select"); playFull(sel); };
  $(".rc-set").onclick = () => {
    if (!sel || locked() || !owned(sel)) return; const R = api.rec(); if (sel === RAND.id && !R.own.length) return;
    R.pick = sel; commit(); api.play("ok"); say(sel === RAND.id ? LINES.rand : LINES.set); render(); npSync(true);
  };
  $(".rc-orig").onclick = () => { if (locked()) return; const R = api.rec(); R.pick = ""; commit(); api.play("tap"); say(LINES.orig); render(); npSync(true); };
  $(".rc-buy").onclick = () => { const r = REC_BY_ID[sel]; if (!r || r.kind !== "shop") return; if (api.wallet() < r.price) { api.play("tap"); say(LINES.poor.replace("N", String(r.price - api.wallet()))); return; } buying = true; buyAt = performance.now(); api.play("select"); render(); };   // 錢不夠：直接講還差幾顆（數字）
  $(".rc-buy-go").onclick = () => {
    const r = REC_BY_ID[sel], R = api.rec(); if (!buying || !r || performance.now() - buyAt < 400) return;   // 跟第一下隔 0.4 秒才算（防連點）
    if (api.wallet() < r.price || R.own.includes(r.id)) { buying = false; render(); return; }
    api.pay(r.price); R.own.push(r.id); buying = false; commit(); api.play("coin"); say(LINES.got); render();
  };
  function subOf(r, have) {                             // 名字下面那行小字
    if (r.id === RAND.id) return TEXT.rand;
    if (r.kind === "mine") return r.by || "";
    if (r.kind === "memo") return have ? TEXT.memo : r.how;
    return have ? TEXT.shop : `${TEXT.shop}・⭐${r.price}`;
  }
  function render() {
    const R = api.rec(), lk = locked(), r = recOf(sel), have = !!r && owned(r.id), isRec = !!r && r.id !== RAND.id;
    $(".rc-wallet b").textContent = String(api.wallet());
    for (const b of box.querySelectorAll(".rc-tab")) { const on = b.dataset.k === tab; b.classList.toggle("rc-cur", on); b.setAttribute("aria-selected", on ? "true" : "false"); }
    discs.forEach((c, i) => { const id = c.dataset.id; c.classList.toggle("have", owned(id)); c.classList.toggle("rc-mid", i === cur); c.classList.toggle("rc-pin", !lk && R.pick === id); });
    setText($(".rc-now"), r ? r.name : LINES.pick); setText($(".rc-sub"), r ? subOf(r, have) : "");
    const canSet = have && !lk && (isRec || R.own.length > 0);
    $(".rc-play").classList.toggle("hidden", !(isRec && have));
    $(".rc-set").classList.toggle("hidden", !canSet || R.pick === sel);
    $(".rc-on").classList.toggle("hidden", !canSet || R.pick !== sel);   // 已經是小島音樂：「✓ 小島正在放」不能按
    $(".rc-isle").classList.toggle("hidden", lk); const lt = $(".rc-lock"); lt.classList.toggle("hidden", !lk); if (lk) setText(lt, LOCK_TEXT);
    const canBuy = isRec && !have && r.kind === "shop", b = $(".rc-buy");
    b.classList.toggle("hidden", !canBuy || buying); if (canBuy) { setText(b, `⭐${r.price} 買下來`); b.classList.toggle("poor", api.wallet() < r.price); }
    $(".rc-buy-go").classList.toggle("hidden", !canBuy || !buying);
    $(".rc-orig").classList.toggle("on", !R.pick);
    $(".rc-sing").classList.toggle("hidden", !api.onSing);
    $(".rc-prev").disabled = cur <= 0; $(".rc-next").disabled = cur >= list.length - 1;
  }
  function spinSync(restart) {                          // 正在試聽的那張在轉（中間發光那張；撥走了就換下一張接手）
    for (const c of discs) { const on = c.dataset.id === playing; if (on && restart) { c.classList.remove("rc-spin"); void c.offsetWidth; } c.classList.toggle("rc-spin", on); }
    box.classList.toggle("rc-live", !!playing);
  }
  function labelSync() {                                // 還沒出聲（下載＋解密中）：那張中間換成 ⏳、先不轉
    for (const c of discs) { const id = c.dataset.id, w = waiting && id === playing, e = c.querySelector(".rc-e"); c.classList.toggle("rc-wait", w); setText(e, w ? "⏳" : recOf(id).e); }
  }
  function listen(id) {                                 // 試聽 10 秒（「▶ 聽整首」走 playFull）
    const r = REC_BY_ID[id]; if (!r || !r.bgm) return;
    if (api.musicOn && !api.musicOn()) say(LINES.mute);   // 音樂開關關著：放了也聽不到，先說一聲（不然小孩以為壞了）
    clearTimeout(previewT); playing = id; api.bgm(r.bgm); spinSync(true);
    watchLoad();
    previewT = setTimeout(() => { if (playing === id) stopPreview(true); }, PREVIEW_MS);
  }
  function stopPreview(restore) { clearTimeout(previewT); previewT = 0; const was = playing; playing = null; stopWait(); spinSync(); if (was && restore) api.restore(); }
  function watchLoad() {                                // 第一次點我的歌要先下載幾 MB 再解密：⏳ 直到出聲
    stopWait();
    const step = () => {
      const r = REC_BY_ID[playing], w = !!(r && api.loading && api.loading(r.bgm));
      if (w !== waiting) { waiting = w; labelSync(); }
      if (!w && waitT) { clearInterval(waitT); waitT = 0; }
    };
    step(); if (waiting) waitT = setInterval(step, TIMES.waitPoll);
  }
  function stopWait() { clearInterval(waitT); waitT = 0; if (waiting) { waiting = false; labelSync(); } }

  // ----- 「▶ 聽整首」：收起唱片牆、回小島放這首、寵物跟著跳（整首歌跳到歌結束、最多 60 秒；一般 60 秒循環曲跳 30 秒）、迷你播放器中間變 ⏹ -----
  function playFull(id) {
    const r = REC_BY_ID[id]; if (!r || !r.bgm || !api.rec().own.includes(id)) return;
    if (api.musicOn && !api.musicOn()) { say(LINES.mute); return; }   // 音樂關著：回小島也聽不到 → 留在唱片牆
    const whole = r.kind === "mine";
    if (isOpen()) { hide(); api.onClose && api.onClose(); }   // 迷你播放器 ⏮⏭（唱片牆沒開）直接換歌
    clearTimeout(npT);
    np = { id, key: r.bgm, whole, place: api.place ? api.place() : null };
    if (api.once) api.once(whole ? r.bgm : null);       // 整首歌：放完就停（不循環）→ onSongEnd 回到原本的
    api.bgm(r.bgm);
    dance(whole ? TIMES.danceWhole : TIMES.danceRound);
    npT = setTimeout(() => endNow(false), whole ? TIMES.wholeMax : TIMES.round);   // 一般曲放一輪（約 60 秒）；整首歌是保險（ended 沒來）
    npSync(true);
  }
  // 結束「聽整首」：silent＝主程式要換畫面／換島（音樂交給接下來的畫面），不然放回原本該放的小島音樂
  function endNow(silent) {
    if (!np) return false;
    const was = np; np = null; clearTimeout(npT);
    if (was.whole && api.once) api.once(null);          // 同一首如果也是小島音樂：照常循環
    dance(0);
    if (!silent) api.restore();
    npSync(true);
    return true;
  }
  const isPick = k => { const R = api.rec(); return !locked() && !!R.pick && (R.pick === RAND.id ? /^my:/.test(k) : (REC_BY_ID[R.pick] || {}).bgm === k); };
  if (api.onSongEnd) api.onSongEnd(k => {               // 整首歌放完：聽整首＝回原本的；當小島音樂那首放完一次＝主程式改放原本的 → 播放器收起來
    if (np) {
      if (np.key !== k) return;
      if (isPick(k)) { done = true; endNow(true); return; }   // 聽整首的剛好就是小島音樂那首：不先 restore（會重播一次），交給主程式 islandSongEnded 換回原本的（里維 11-01）
      endNow(false); return;
    }
    if (isPick(k)) { done = true; npSync(true); }        // 牆開著也要記（不然關牆後播放器還寫「正在放」）
  });
  function atPlace(p) { if (np && np.place && p && p !== np.place) endNow(true); }   // 主程式 onPlace：換到別座島＝結束（接著放那座島的音樂）；同一座島（解鎖、更新）不算

  // ----- 小島上的迷你播放器 -----
  // 出現：正在「聽整首」（中間 ⏹）或 小島音樂是唱片（pick 有值、沒家長鎖、那首整首歌還沒放完一次；中間 ⏸）
  // ⏮⏭＝照唱片牆順序換上一張／下一張（跳過隨機、只算有的）：聽整首中＝聽那張；不然＝那張當小島音樂。⏸＝停掉唱片、回原本的小島音樂
  function npSync(force) {
    const R = api.rec(), onMenu = document.body.classList.contains("on-menu");
    if (R !== lastRec) { lastRec = R; done = false; }   // 換人
    if (onMenu && !lastOnMenu) done = false;            // 從遊戲回小島：主程式 recDone 也清掉了 → 我的歌再放一次
    lastOnMenu = onMenu;
    const mode = np ? "np" : !locked() && R.pick && !done ? "pick" : "", id = np ? np.id : R.pick, on = !api.musicOn || api.musicOn();
    const key = `${mode}|${id}|${on}`; if (!force && key === npKey) return; npKey = key;
    const r = mode ? recOf(id) : null;
    if (!r) { pill.classList.add("hidden"); pill.dataset.mode = ""; return; }
    setText(pill.querySelector(".rc-np-name"), r.name); pill.dataset.sub = mode === "np" ? TEXT.whole : TEXT.isle; pill.setAttribute("aria-label", `${pill.dataset.sub}：${r.name}`);   // 「聽整首／小島音樂」不印出來（中間 ⏹／⏸ 看得出），給讀屏
    npLab.style.setProperty("--c", r.color); setText(npLab.querySelector(".rc-e"), r.e); coverInto(npLab, r);
    const mid = pill.querySelector(".rc-np-mid"); setText(mid, mode === "np" ? "⏹" : "⏸");
    mid.setAttribute("aria-label", mode === "np" ? `${LINES.stop}《${r.name}》` : TEXT.pause);
    pill.dataset.mode = mode; pill.classList.toggle("rc-np-still", !on); pill.classList.remove("hidden");
  }
  function npStep(dir) {
    api.play("tap");
    const R = api.rec(), ids = TABS.flatMap(t => t.ids).filter(id => REC_BY_ID[id] && REC_BY_ID[id].bgm && R.own.includes(id)); if (!ids.length) return;
    let i = ids.indexOf(np ? np.id : R.pick);
    i = i < 0 ? (dir > 0 ? 0 : ids.length - 1) : (i + dir + ids.length) % ids.length;
    if (np) { playFull(ids[i]); return; }
    if (locked()) return;
    R.pick = ids[i]; commit(); api.restore(); dance(15); npSync(true);   // 換小島音樂＝寵物跟著新音樂跳 15 秒（跟關唱片牆一樣）
  }
  pill.querySelector(".rc-np-prev").onclick = () => npStep(-1);
  pill.querySelector(".rc-np-next").onclick = () => npStep(1);
  pill.querySelector(".rc-np-mid").onclick = () => {
    api.play("tap");
    if (np) { endNow(false); return; }                   // ⏹：停「聽整首」
    const R = api.rec(); if (locked() || !R.pick) return;
    R.pick = ""; commit(); api.restore(); dance(0); api.talk(LINES.orig); npSync(true);   // ⏸：停掉唱片、回原本的小島音樂（播放器收起來）
  };
  setInterval(() => npSync(false), TIMES.npPoll);        // 家長鎖、換人、從遊戲回來、音樂開關都在別的畫面改：每 0.5 秒對一次（一樣就不動）
  new MutationObserver(() => { const on = document.body.classList.contains("on-menu"); if (on && !lastOnMenu) { done = false; npSync(true); } lastOnMenu = on; })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });   // 從遊戲回小島（on-menu 又加上）：一局很短也抓得到（輪詢 0.5 秒可能剛好錯過）

  function open() {
    const was = np ? np.id : null;
    endNow(false);                                      // 「聽整首」放到一半又開唱片牆：先回到原本的小島音樂
    const R = api.rec(), got = grantMemos(R, api.conds()); if (got.length) commit();   // 舊存檔已經做到的紀念唱片：第一次進來一起補發
    const at = was || (R.pick === RAND.id || REC_BY_ID[R.pick] ? R.pick : null), t = at ? tabOf(at) : "mine", ids = TABS.find(x => x.k === t).ids;
    const i = at ? Math.max(0, ids.indexOf(at)) : Math.min(1, ids.length - 1);   // 停在小島正在放的那張；沒有＝我的歌第一首（第一張是 🔀 隨機）
    buying = false; playing = null;
    box.classList.remove("hidden"); setTab(t, i, true); // 開店不自動試聽（小島音樂照放；轉了才試聽）
    say(got.length ? LINES.got : LINES.hello);
    if (!tipped) { tipped = true; tipT = setTimeout(() => { tipT = 0; if (isOpen()) say(LINES.tip); }, TIMES.tip); }
    npSync(true);
  }
  function hide() { clearTimeout(previewT); clearTimeout(settleT); settleT = 0; cancelTip(); stopWait(); box.classList.add("hidden"); buying = false; playing = null; drag = null; spinSync(); }
  function close(silent) {                              // silent：主程式換畫面（nav）時收掉，音樂交給接下來的畫面（不先放回選單音樂再換一次）
    if (silent) endNow(true);                           // 進遊戲／換畫面：「聽整首」也結束（唱片牆沒開也要）
    if (!isOpen()) return;
    hide();
    if (!silent) { api.restore(); const R = api.rec(); dance(R.pick && !locked() ? 15 : 0); }   // 回小島：有選小島音樂＝寵物跟著新音樂跳 15 秒；沒選＝停掉
    api.onClose && api.onClose();
    npSync(true);
  }
  return { open, close, endNow, atPlace, isOpen, render,
    debug: { get sel() { return sel; }, get buying() { return buying; }, get waiting() { return waiting; }, get np() { return np ? { ...np } : null; }, get tab() { return tab; }, get cur() { return cur; },
      get ids() { return list.map(r => r.id); }, get playing() { return playing; }, get done() { return done; }, label: () => { const c = discs[cur]; return c ? c.querySelector(".rc-e").textContent : ""; }, dances, box, pill } };
}
