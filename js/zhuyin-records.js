// 注音小島 v8 音符唱片行（docs/zhuyin-v8-plan.md §4；借鏡 Tack Lin《開工吧！社畜人生！》的唱片行，改成練注音的版本）
// 三種唱片：🎤 兒歌唱片（「兒歌接唱」唱完一首就送；第三批才有）、🏅 紀念唱片（做到一件事就送那首配樂）、🎼 店裡賣的（用「我的星星」買）。
// 唱片牆點一張 → 唱片滑到唱盤上轉、試聽 10 秒 → 有了就能「▶ 聽整首」「🏝️ 當小島音樂」；店裡賣的「⭐8 買下來」要點另一顆「✔ 買」確認（防連點，跟花園小舖一樣）。
// 小島音樂：選一張＝回小島就放這張（每座島都是）；🔀 隨機；🏝️ 原本的（每座島自己的）。家長頁可以鎖成「原本的」。放唱片時小島上的寵物跟著跳舞（hub）。
// 遊戲中照樣放各遊戲自己的音樂（主程式 menuBgmKey 才看這裡）。
// 11-01 櫻木：「▶ 聽整首」＝收起唱片牆、回小島放這首、寵物跟著跳（看得到才有意思）；小島上出現「♪ 正在放《歌名》 ⏹」膠囊（#recNow，可以按停）。
//   放完（整首歌＝<audio> ended；一般曲＝放一輪約 60 秒）、進遊戲（nav）、換島、再開唱片牆＝回到原本該放的小島音樂。正在放哪首：nowKey()（主程式 menuBgmKey 先看這個）。

import { MY_SONGS, registerSongs } from "./zhuyin-mysongs.js?v=1";   // 🎧 我的歌（阿葉 11-01 指定的整首歌；主程式開頁 REC.registerSongs(A) 登記給音訊引擎）
export { registerSongs };

// bgm＝audio/bgm 的鍵（我的歌是 "my:id"＝整首歌串流）；memo＝紀念唱片要做到的事（主程式 conds() 給 true/false）；how＝還沒拿到時唱片牆寫的小字；by＝我的歌的歌手
// 四種：mine 我的歌（一開始就有，排最前面）、memo 紀念、shop 店裡賣的
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
];
export const REC_BY_ID = Object.fromEntries(RECORDS.map(r => [r.id, r]));
// 阿葉 11-01 原話：「唱片可以不用星星 想換音樂就可以換」→ 全部唱片一開始就有（不用買、紀念唱片也不用先做到）。
// 想改回「紀念唱片要做到、店裡的要用星星買」：FREE 改 false（買／補發的程式都還在；測試網址加 recshop＝用舊規則測那段程式）。
export const FREE = !/[?&]recshop\b/.test(location.search);
export const GIFT_REC = "r_island";                       // 花園買留聲機送的那張
export const PREVIEW_MS = 10000;
export const TIMES = { round: 60000, wholeMax: 7 * 60000, danceRound: 30, danceWhole: 60, waitPoll: 150 };   // 聽整首：一般曲放一輪 60 秒、整首歌最多 7 分鐘（ended 沒來的保險）；寵物跳 30／60 秒；⏳ 每 0.15 秒查一次（測試可以改小）
export const LINES = {
  hello: "歡迎光臨音符唱片行！", pick: "點一張唱片聽聽看！", got: "拿到新唱片了！", set: "回小島就會放這首歌喔！",
  rand: "回小島會隨機放一首喔！", orig: "回小島放原本的音樂喔！", poor: "還差 N 顆星星！",   // poor：N 換成還差幾顆（數字）；紀念唱片沒拿到＝直接唸那張的 how（不識字的小孩聽得懂要做什麼）
  gift: "送你一張唱片！點留聲機就能聽歌喔！", now: "正在放", stop: "停止播放",
  mute: "音樂關著喔，請大人到設定打開！",   // 音樂開關關著時點唱片（里維 11-01）   // 花園小舖第一次買到留聲機（主程式 homeUI 的 onBuy）
};
export const LOCK_TEXT = "家長設定：小島放原本的音樂";   // 家長鎖開著：唱片牆「小島音樂」那一列只寫這行（不唸）
// 存檔 zy{n}_rec：{ own [唱片 id], pick 小島音樂（唱片 id｜"rand"｜""＝原本的）, seen [看過「拿到新唱片」的] }
export function cleanRec(d) {
  const out = { own: [], pick: "", seen: [] }; if (!d || typeof d !== "object") d = {};
  const ok = id => typeof id === "string" && Object.hasOwn(REC_BY_ID, id);   // 備份碼手改成 "__proto__" 之類也不會被當成唱片
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

// ---------- 唱片牆畫面 ----------
// api：{ rec() 存檔, wallet() pay(n) save(), play(name), talk(text), bgm(key) 放這首（循環）, restore() 回到選單該放的, dance(sec), conds(), locked() 家長鎖, onSing()?, onClose(),
//        once(key|null) 這首放完就停（整首歌）, loading(key) 還沒出聲, preload(key) 先下載＋解密, onSongEnd(fn) 整首歌放完, place() 現在在哪座島, musicOn() }
export function createRecords(api) {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const box = el("div", "overlay rc-shop hidden"); box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "音符唱片行");
  box.innerHTML = '<div class="rc-panel"><div class="rc-head"><img class="rc-dj" src="IMAGE/zhuyin/pets/koala.webp" alt=""><span class="rc-title">🎶 音符唱片行</span><span class="rc-wallet">⭐<b>0</b></span><button class="pk-x rc-x" type="button" aria-label="離開">✕</button></div>' +
    '<div class="rc-body"><div class="rc-deck"><div class="rc-table"><div class="rc-vinyl"><span class="rc-label"></span></div><i class="rc-arm"></i></div><div class="rc-now"></div>' +
    '<div class="rc-acts"><button class="big-btn rc-play hidden" type="button">▶ 聽整首</button><button class="big-btn alt rc-set hidden" type="button">🏝️ 當小島音樂</button><button class="big-btn rc-buy hidden" type="button"></button><button class="big-btn rc-buy-go hidden" type="button">✔ 買</button></div>' +
    '<div class="rc-isle"><span>小島音樂：</span><button class="rc-orig" type="button">🏝️ 原本的</button><button class="rc-rand" type="button">🔀 隨機</button></div><div class="rc-lock hidden"></div></div><div class="rc-wall"></div></div>' +
    '<button class="big-btn rc-sing hidden" type="button">🎤 幫 DJ 修唱片</button></div>';
  document.body.appendChild(box);
  const wall = box.querySelector(".rc-wall"), vinyl = box.querySelector(".rc-vinyl"), labelEl = box.querySelector(".rc-label");
  // 小島上的「♪ 正在放《歌名》 ⏹」膠囊：放在貼紙那排（.menu-bottom）裡、浮在它旁邊（橫式在上面、直式在下面；css/zhuyin-records.css）；整顆都能按＝停
  const pill = el("button", "rc-np hidden"); pill.type = "button"; pill.id = "recNow";
  pill.innerHTML = '<span class="rc-np-ico" aria-hidden="true">♪</span><span class="rc-np-t"></span><span class="rc-np-x" aria-hidden="true">⏹</span>';
  (document.querySelector("#menu > .menu-bottom") || document.body).appendChild(pill);
  let sel = null, previewT = 0, buyAt = 0, buying = false, playing = null, npT = 0, waitT = 0, waiting = false;
  const dances = [];                                     // 測試用：叫過幾次 dance(秒)
  const dance = s => { dances.push(s); if (dances.length > 20) dances.shift(); api.dance(s); };
  pill.onclick = () => { api.play("tap"); endNow(false); };
  if (api.onSongEnd) api.onSongEnd(k => { if (np && np.key === k) endNow(false); });   // 整首歌放完＝回到原本的小島音樂
  box.querySelector(".rc-x").onclick = () => { api.play("tap"); close(); };
  box.querySelector(".rc-sing").onclick = () => { api.play("select"); close(); api.onSing && api.onSing(); };
  box.querySelector(".rc-play").onclick = () => { if (!sel) return; api.play("select"); playFull(sel); };
  const locked = () => !!(api.locked && api.locked());   // 家長鎖：小島只放原本的音樂（選了也沒用 → 這幾顆藏起來）
  box.querySelector(".rc-set").onclick = () => { if (!sel || locked()) return; const R = api.rec(); R.pick = sel; api.save(); api.play("ok"); api.talk(LINES.set); render(); };
  box.querySelector(".rc-orig").onclick = () => { if (locked()) return; const R = api.rec(); R.pick = ""; api.save(); api.play("tap"); api.talk(LINES.orig); render(); };
  box.querySelector(".rc-rand").onclick = () => { if (locked()) return; const R = api.rec(); if (!R.own.length) return; R.pick = "rand"; api.save(); api.play("tap"); api.talk(LINES.rand); render(); };
  box.querySelector(".rc-buy").onclick = () => { const r = REC_BY_ID[sel]; if (!r || r.kind !== "shop") return; if (api.wallet() < r.price) { api.play("tap"); api.talk(LINES.poor.replace("N", String(r.price - api.wallet()))); return; } buying = true; buyAt = performance.now(); api.play("select"); render(); };   // 錢不夠：直接講還差幾顆（數字）
  box.querySelector(".rc-buy-go").onclick = () => {
    const r = REC_BY_ID[sel], R = api.rec(); if (!buying || !r || performance.now() - buyAt < 400) return;   // 跟第一下隔 0.4 秒才算（防連點）
    if (api.wallet() < r.price || R.own.includes(r.id)) { buying = false; render(); return; }
    api.pay(r.price); R.own.push(r.id); buying = false; api.save(); api.play("coin"); api.talk(LINES.got); render();
  };
  function render() {
    const R = api.rec(); box.querySelector(".rc-wallet b").textContent = String(api.wallet());
    wall.innerHTML = "";
    for (const r of RECORDS) {
      const have = R.own.includes(r.id), c = el("button", "rc-rec" + (have ? " have" : "") + (sel === r.id ? " sel" : "") + (R.pick === r.id ? " on" : "")); c.type = "button"; c.dataset.id = r.id;
      const v = el("span", "rc-disc"); v.style.setProperty("--c", r.color); v.appendChild(el("span", "rc-disc-e", r.e)); c.appendChild(v);
      c.appendChild(el("span", "rc-name", r.name));
      c.appendChild(el("span", "rc-how", have ? (R.pick === r.id ? "🏝️ 小島在放" : r.by || "") : r.kind === "shop" ? `⭐${r.price}` : r.how));
      c.onclick = () => pick(r.id); wall.appendChild(c);
    }
    const r = REC_BY_ID[sel], have = r && R.own.includes(r.id);
    box.querySelector(".rc-now").textContent = r ? r.name : LINES.pick;
    showLabel(); vinyl.style.setProperty("--c", r ? r.color : "#888");
    const lk = locked();
    box.querySelector(".rc-play").classList.toggle("hidden", !have);
    box.querySelector(".rc-set").classList.toggle("hidden", !have || R.pick === sel || lk);
    box.querySelector(".rc-isle").classList.toggle("hidden", lk); const lt = box.querySelector(".rc-lock"); lt.classList.toggle("hidden", !lk); if (lk && lt.textContent !== LOCK_TEXT) lt.textContent = LOCK_TEXT;
    const canBuy = r && !have && r.kind === "shop", b = box.querySelector(".rc-buy");
    b.classList.toggle("hidden", !canBuy || buying); if (canBuy) { b.textContent = `⭐${r.price} 買下來`; b.classList.toggle("poor", api.wallet() < r.price); }
    box.querySelector(".rc-buy-go").classList.toggle("hidden", !canBuy || !buying);
    box.querySelector(".rc-orig").classList.toggle("on", !R.pick); box.querySelector(".rc-rand").classList.toggle("on", R.pick === "rand");
    box.querySelector(".rc-sing").classList.toggle("hidden", !api.onSing);
  }
  function showLabel() { const r = REC_BY_ID[sel]; const t = waiting ? "⏳" : r ? r.e : "🎵"; if (labelEl.textContent !== t) labelEl.textContent = t; }   // 唱盤中間：還沒出聲＝⏳
  function pick(id) {
    sel = id; buying = false; api.play("pop"); render();
    const r = REC_BY_ID[id]; if (!r) return;
    if (r.kind === "mine" && api.preload) api.preload(r.bgm);   // 我的歌：點了就先下載＋解密（第一次要幾 MB）
    if (!api.rec().own.includes(id) && r.kind === "memo") api.talk(r.how);   // 沒拿到的紀念唱片：直接講要做什麼（「泡泡過一關就送你」）
    listen(id);                                         // 唱片滑到唱盤上轉：試聽 10 秒
  }
  function listen(id) {                                 // 試聽 10 秒（「▶ 聽整首」走 playFull）
    const r = REC_BY_ID[id]; if (!r || !r.bgm) return;
    if (api.musicOn && !api.musicOn()) api.talk(LINES.mute);   // 音樂開關關著：放了也聽不到，先說一聲（不然小孩以為壞了）
    clearTimeout(previewT); playing = id; api.bgm(r.bgm); vinyl.classList.remove("spin"); void vinyl.offsetWidth; vinyl.classList.add("spin");
    watchLoad();
    previewT = setTimeout(() => { if (playing === id) { playing = null; vinyl.classList.remove("spin"); stopWait(); api.restore(); } }, PREVIEW_MS);
  }
  // 「還沒開始出聲」（第一次點我的歌要先下載幾 MB 再解密）：唱盤中間換成 ⏳、唱片先不轉；出聲就換回來
  function watchLoad() {
    stopWait();
    const step = () => {
      const r = REC_BY_ID[playing], w = !!(r && api.loading && api.loading(r.bgm));
      if (w !== waiting) { waiting = w; vinyl.classList.toggle("wait", w); showLabel(); }
      if (!w && waitT) { clearInterval(waitT); waitT = 0; }
    };
    step(); if (waiting) waitT = setInterval(step, TIMES.waitPoll);
  }
  function stopWait() { clearInterval(waitT); waitT = 0; if (waiting) { waiting = false; vinyl.classList.remove("wait"); showLabel(); } }
  // 「▶ 聽整首」：收起唱片牆、回小島放這首、寵物跟著跳（整首歌跳到歌結束、最多 60 秒；一般 60 秒循環曲跳 30 秒）、出現「♪ 正在放」膠囊
  function playFull(id) {
    const r = REC_BY_ID[id]; if (!r || !r.bgm || !api.rec().own.includes(id)) return;
    if (api.musicOn && !api.musicOn()) { api.talk(LINES.mute); return; }   // 音樂關著：回小島也聽不到 → 留在唱片牆
    const whole = r.kind === "mine";
    hide(); api.onClose && api.onClose();
    np = { id, key: r.bgm, whole, place: api.place ? api.place() : null };
    if (api.once) api.once(whole ? r.bgm : null);       // 整首歌：放完就停（不循環）→ onSongEnd 回到原本的
    api.bgm(r.bgm);
    dance(whole ? TIMES.danceWhole : TIMES.danceRound);
    clearTimeout(npT); npT = setTimeout(() => endNow(false), whole ? TIMES.wholeMax : TIMES.round);   // 一般曲放一輪（約 60 秒）；整首歌是保險（ended 沒來）
    pill.querySelector(".rc-np-t").textContent = `${LINES.now}《${r.name}》`; pill.setAttribute("aria-label", `${LINES.stop}《${r.name}》`);
    pill.classList.remove("hidden"); placePill();
  }
  // 直式：膠囊在貼紙那排下面，靠右／靠左挑蓋到小島浮標（.hub-tag）比較少的那邊（3D 鏡頭擺位不知道有這顆膠囊）
  function placePill() {
    pill.classList.remove("at-l");
    if (!matchMedia("(orientation: portrait)").matches || !document.querySelector(".hub-tag")) return;
    const cover = () => { const q = pill.getBoundingClientRect(); let a = 0;
      for (const t of document.querySelectorAll(".hub-tag")) { const b = t.getBoundingClientRect(); if (b.width < 2) continue; const s = getComputedStyle(t); if (s.display === "none" || s.visibility === "hidden") continue;
        const w = Math.min(q.right, b.right) - Math.max(q.left, b.left), h = Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top); if (w > 0 && h > 0) a += w * h; }
      return a; };
    const right = cover(); pill.classList.add("at-l"); if (cover() >= right) pill.classList.remove("at-l");
  }
  // 結束「聽整首」：silent＝主程式要換畫面／換島（音樂交給接下來的畫面），不然放回原本該放的小島音樂
  function endNow(silent) {
    if (!np) return false;
    const was = np; np = null; clearTimeout(npT); pill.classList.add("hidden");
    if (was.whole && api.once) api.once(null);          // 同一首如果也是小島音樂：照常循環
    dance(0);
    if (!silent) api.restore();
    return true;
  }
  function atPlace(p) { if (np && np.place && p && p !== np.place) endNow(true); }   // 主程式 onPlace：換到別座島＝結束（接著放那座島的音樂）；同一座島（解鎖、更新）不算
  function open() {
    endNow(false);                                      // 「聽整首」放到一半又開唱片牆：先回到原本的小島音樂
    const R = api.rec(), got = grantMemos(R, api.conds()); if (got.length) api.save();   // 舊存檔已經做到的紀念唱片：第一次進來一起補發
    sel = null; buying = false; render(); box.classList.remove("hidden"); api.talk(got.length ? LINES.got : LINES.hello);
  }
  function hide() { clearTimeout(previewT); stopWait(); box.classList.add("hidden"); vinyl.classList.remove("spin"); buying = false; playing = null; }
  function close(silent) {                              // silent：主程式換畫面（nav）時收掉，音樂交給接下來的畫面（不先放回選單音樂再換一次）
    if (silent) endNow(true);                           // 進遊戲／換畫面：「聽整首」也結束（唱片牆沒開也要）
    if (box.classList.contains("hidden")) return;
    hide();
    if (!silent) { api.restore(); const R = api.rec(); dance(R.pick && !(api.locked && api.locked()) ? 15 : 0); }   // 回小島：有選小島音樂＝寵物跟著新音樂跳 15 秒；沒選＝停掉
    api.onClose && api.onClose();
  }
  return { open, close, endNow, atPlace, isOpen: () => !box.classList.contains("hidden"), render,
    debug: { get sel() { return sel; }, get buying() { return buying; }, get waiting() { return waiting; }, get np() { return np ? { ...np } : null; }, dances, box, pill } };
}
