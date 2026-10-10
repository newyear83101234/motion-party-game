// ===================== 注音小島（注音小遊戲 v3）=====================
// 目標玩家：5 歲、已會拼讀注音的小孩。純手指點、無命制。
// 八個模式：釣魚 / 點餐 / 積木 / 尋寶 / 翻牌 / 聲調氣球 / 打地鼠 / 跳跳蛙（後兩個 2026-10-10 加）。長期動力：貼紙圖鑑（每個詞一張貼紙）＋星星罐孵蛋（解鎖朋友）。
// 設計依據：櫻木花道（遊戲設計）＋寧次（UI/UX）2026-09-09 審查報告；規格見 memory project-zhuyin-game.md
import { WORDS, PHRASES, CATS, FRIENDS } from "./zhuyin-words.js";
import { startAnnotate, missing as zMissing } from "./zhuyin-ann.js";
startAnnotate();                                      // 畫面上每個國字自動加注音（阿葉 10-10）

const TONES = ["", "ˊ", "ˇ", "ˋ", "˙"];
const TONE_TILE = ["", "ˊ", "ˇ", "ˋ", "˙"];        // 積木盤上的聲調：一聲＝空白積木（阿葉要求）
const MODES = {                                     // 每模式：題數、解鎖需要的貼紙數、嚮導開場語、背景音樂
  fish:  { rounds: 8, need: 0,  intro: "聽聲音，點對的魚！",         bgm: "island" },
  order: { rounds: 8, need: 0,  intro: "看注音，把東西拿給客人！",     bgm: "island" },
  build: { rounds: 6, need: 0,  intro: "把注音積木放進格子裡！",       bgm: "calm" },
  hunt:  { rounds: 8, need: 5,  intro: "看注音，找找東西在哪裡！",     bgm: "island" },
  match: { rounds: 1, need: 10, intro: "翻翻看，找到相同的！",         bgm: "calm" },
  tone:  { rounds: 8, need: 15, intro: "聽聲音，戳對的氣球！",         bgm: "island" },
  whack: { rounds: 6, need: 20, intro: "聽聲音，敲對的地鼠！",         bgm: "island" },   // 阿葉 10-10：再加兩個關卡
  frog:  { rounds: 5, need: 25, intro: "聽聲音，跳到對的荷葉上！",     bgm: "calm" },
};
const PRAISE = ["好棒！", "哇！", "就是它！", "太厲害了！", "你好會拼喔！"];
const EGG_STARS = 10;                               // 星星罐滿幾顆孵一顆蛋

// ---------- 注音解析與繪製 ----------
function parseZ(z) {
  return z.split(" ").map(s => { const last = s[s.length - 1], t = TONES.indexOf(last); return t > 0 ? { sym: s.slice(0, -1), tone: t } : { sym: s, tone: 0 }; });
}
function zToStr(syls) { return syls.map(s => s.sym + TONES[s.tone]).join(" "); }
// 直排 DOM：每音節一欄，聲調在右側（輕聲 ˙ 在頂上）；傳 han 時每欄下方加對應國字
function renderZ(syls, han) {
  const wrap = document.createElement("div"); wrap.className = "zy" + (han ? " hz" : "");
  syls.forEach((s, i) => {
    const col = document.createElement("div"); col.className = "syl n" + Math.min(4, s.sym.length) + (s.sym.length === 1 ? " one" : "");
    for (const ch of s.sym) { const b = document.createElement("b"); b.textContent = ch; col.appendChild(b); }
    // 聲調類別：k2=ˊ k3=ˇ k4=ˋ（CSS 用向量圖畫在最後一個符號右上方）、light=˙（頂上）
    if (s.tone) { const t = document.createElement("span"); t.className = "tone " + (s.tone === 4 ? "light" : "k" + (s.tone + 1)); t.textContent = TONES[s.tone]; col.appendChild(t); }
    if (han) { const h = document.createElement("div"); h.className = "han"; h.textContent = han[i] || ""; col.appendChild(h); }
    wrap.appendChild(col);
  });
  return wrap;
}

// ---------- 工具 ----------
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }   // 回傳有沒有真的寫進去（空間滿／被擋會 false）

// ---------- 存檔（localStorage；三個存檔位＝家裡三個小朋友各玩各的，阿葉 10-10「可以做存檔跟重新開始」）----------
// 每個存檔位的鍵：zy{1..3}_stickers / _stars / _eggs / _intro / _last_mode / _resume / _match_size
// 全家共用：zy_slot（目前是誰）、zy_music、zy_hint_wait
export const SLOTS = [{ e: "🐻", name: "小熊" }, { e: "🐰", name: "小兔" }, { e: "🐱", name: "小貓" }];
let slot = Math.min(3, Math.max(1, (lsGet("zy_slot", 1) | 0) || 1));
const K = k => `zy${slot}_${k}`;
(function migrateOldSave() {                          // 舊版（還沒有存檔位）的進度整包搬進存檔 1
  if (lsGet("zy1_stars", null) !== null || (lsGet("zy_stars", null) === null && lsGet("zy_stickers", null) === null)) return;
  const old = { stickers: lsGet("zy_stickers", {}), stars: lsGet("zy_stars", 0), eggs: lsGet("zy_eggs", 0), last: lsGet("zy_last_mode", "fish") };
  const intro = {}; for (const m of Object.keys(MODES)) if (lsGet("zy_intro_" + m, 0)) intro[m] = 1;
  const ok = lsSet("zy1_stickers", old.stickers) && lsSet("zy1_stars", old.stars) && lsSet("zy1_eggs", old.eggs) && lsSet("zy1_intro", intro) && lsSet("zy1_last_mode", old.last);
  if (!ok) return;                                    // 沒寫成功就留著舊的，下次再搬
  lsSet("zy_legacy_bak", old);                        // 舊資料留一份備查；搬完刪舊鍵，否則「清除重來」後重新整理又會被搬回來（里維 10-10）
  for (const k of ["zy_stickers", "zy_stars", "zy_eggs", "zy_last_mode", ...Object.keys(MODES).map(m => "zy_intro_" + m)]) { try { localStorage.removeItem(k); } catch (e) {} }
})();
const save = { music: lsGet("zy_music", 1), hintWait: lsGet("zy_hint_wait", 20) };   // hintWait：家長設定幾秒沒動作讓「🔊 提示」閃（0＝關閉）；遊戲永遠不自己唸答案
function loadSlot(n) {
  slot = n; lsSet("zy_slot", n);
  save.stickers = lsGet(K("stickers"), {});           // { 國字: 1 } 第一次一次答對就貼上
  save.stars = lsGet(K("stars"), 0);                  // 累積星星（罐子）
  save.eggs = lsGet(K("eggs"), 0);                    // 孵過幾顆蛋 → FRIENDS[4 + eggs] 以前都解鎖
  save.intro = lsGet(K("intro"), {});                 // 哪些模式聽過開場語
  save.matchSize = lsGet(K("match_size"), 8);         // 翻牌上次選的張數
}
loadSlot(slot);
const persist = () => [lsSet(K("stickers"), save.stickers), lsSet(K("stars"), save.stars), lsSet(K("eggs"), save.eggs), lsSet(K("intro"), save.intro), lsSet(K("match_size"), save.matchSize), lsSet("zy_music", save.music), lsSet("zy_hint_wait", save.hintWait)].every(Boolean);
const slotSummary = n => ({ stickers: Object.keys(lsGet(`zy${n}_stickers`, {})).length, stars: lsGet(`zy${n}_stars`, 0) });
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // 請瀏覽器不要自動清掉存檔
// 備份碼：把目前存檔包成一串文字（換平板或瀏覽器被清掉時可以還原）
function exportCode() { const d = { v: 1, s: Object.keys(save.stickers), st: save.stars, eg: save.eggs }; return "ZY1:" + btoa(unescape(encodeURIComponent(JSON.stringify(d)))); }
// 回傳 "ok"／"bad"（不是備份碼）／"fail"（寫不進瀏覽器）。從 LINE 複製常夾換行空白 → 先拿掉；只收詞庫裡有的詞、星星設上限
function importCode(code) {
  const m = String(code || "").replace(/\s+/g, "").match(/^ZY1:([A-Za-z0-9+/=]+)$/); if (!m || m[1].length > 20000) return "bad";
  let d; try { d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { return "bad"; }
  if (!d || !Array.isArray(d.s)) return "bad";
  const valid = new Set(WORDS.map(w => w.h));
  save.stickers = Object.fromEntries(d.s.filter(h => valid.has(h)).map(h => [h, 1]));
  save.stars = Math.min(99999, Math.max(0, Math.floor(+d.st) || 0)); save.eggs = Math.max(0, Math.min(FRIENDS.length - 4, Math.floor(+d.eg) || 0));
  return persist() ? "ok" : "fail";
}
function clearSlot() { for (const k of ["stickers", "stars", "eggs", "intro", "last_mode", "resume", "match_size", "whack_up"]) { try { localStorage.removeItem(K(k)); } catch (e) {} } loadSlot(slot); }
const stickerCount = () => Object.keys(save.stickers).length;
const friends = () => FRIENDS.slice(0, Math.min(FRIENDS.length, 4 + save.eggs));

// ---------- 音效 / 音樂 / 語音 ----------
const SFX = {}; for (const n of ["ok", "ng", "tap", "select", "win", "pop", "flip", "sticker"]) { SFX[n] = new Audio(`MUSIC/zy_${n}.mp3`); }
SFX.party = new Audio(); SFX.party.preload = "none"; SFX.party.src = "MUSIC/zy_bgm_party.mp3"; SFX.party.volume = 0.45;   // 結算用 Suno 生的 7 秒慶祝 jingle
// 背景音樂 preload="none"：開頁不下載，第一次播放才抓（之前開頁就吃掉 3.7MB，是載入慢的主因）
const BGM = {}; for (const k of ["island", "calm"]) { const a = new Audio(); a.preload = "none"; a.src = `MUSIC/zy_bgm_${k}.mp3`; a.loop = true; a.volume = 0.3; BGM[k] = a; }
let curBgm = null, ducked = false;
function play(name, rate = 1) { const a = SFX[name]; if (!a) return; try { a.__played = true; a.muted = false; a.currentTime = 0; a.playbackRate = rate; a.play().catch(() => {}); } catch (e) {} }
function playBgm(key) {
  const b = BGM[key] || BGM.island;
  if (curBgm && curBgm !== b) { curBgm.pause(); }
  curBgm = b; if (save.music) b.play().catch(() => {});
}
function toggleMusic() { save.music = save.music ? 0 : 1; persist(); if (save.music) { if (curBgm) curBgm.play().catch(() => {}); } else if (curBgm) curBgm.pause(); $("musicBtn").classList.toggle("off", !save.music); }
function duck(on) { ducked = on; for (const b of Object.values(BGM)) b.volume = on ? 0.1 : 0.3; }   // TTS 講話時壓低音樂（聽力題的關鍵）
let zhVoice = null;
function loadVoice() { const vs = speechSynthesis.getVoices(); zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null; }
if ("speechSynthesis" in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
function say(text, rate = 0.85, onEnd) {
  if (!("speechSynthesis" in window)) { if (onEnd) setTimeout(onEnd, 300); return; }
  try {
    speechSynthesis.cancel(); duck(true); let done = false;
    const fin = () => { if (done) return; done = true; duck(false); if (onEnd) onEnd(); };
    const u = new SpeechSynthesisUtterance(text); u.lang = "zh-TW"; u.rate = rate; if (zhVoice) u.voice = zhVoice;
    u.onend = u.onerror = fin; speechSynthesis.speak(u);
    setTimeout(() => { if (!speechSynthesis.speaking) fin(); }, Math.max(2500, text.length * 450));   // 語音引擎沒回 onend 時的保險
  } catch (e) { duck(false); if (onEnd) onEnd(); }
}
function queueSay(text) {                              // 等目前這句唸完再唸（稱讚不能蓋掉學習詞）；中途換畫面就作廢
  const tok = navToken; let tries = 0;
  const t = setInterval(() => { tries++; if (tok !== navToken) { clearInterval(t); return; } if (!("speechSynthesis" in window) || !speechSynthesis.speaking || tries > 25) { clearInterval(t); say(text); } }, 200);
}
function stopSpeech() { try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {} duck(false); }
// iOS Safari：語音與每個音效元件都要在「手指點擊當下」解鎖一次，之後等圖載完才出聲也不會被吞掉
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return; audioUnlocked = true;
  try { if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
  for (const a of Object.values(SFX)) {
    if (a.__played) continue;                          // 這次點擊本來就要播的音效，不要去靜音它
    try { a.muted = true; const pr = a.play(); const done = () => { if (!a.__played) { a.pause(); a.currentTime = 0; } a.muted = false; };
      if (pr) pr.then(done).catch(() => { a.muted = false; }); else done(); } catch (e) { a.muted = false; }
  }
}
function burst(target, n = 10, emoji = "⭐") {
  const r = target.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, fx = $("fx");
  for (let i = 0; i < n; i++) {
    const s = el("span", "", pick([emoji, "✨", emoji])); const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = 12 + rnd(12);
    s.style.left = cx + "px"; s.style.top = cy + "px"; s.style.setProperty("--dx", Math.cos(a) * d + "vmin"); s.style.setProperty("--dy", Math.sin(a) * d + "vmin");
    fx.appendChild(s); setTimeout(() => s.remove(), 1000);
  }
}
function confetti(n = 60) {
  const fx = $("fx");
  for (let i = 0; i < n; i++) {
    const s = el("span", "cf", pick(["🎉", "⭐", "🌟", "🎊", "💛", "💙"])); s.style.left = Math.random() * 100 + "vw"; s.style.top = "-8vh";
    s.style.animationDelay = Math.random() * 1.2 + "s"; s.style.animationDuration = 2 + Math.random() * 1.5 + "s"; fx.appendChild(s); setTimeout(() => s.remove(), 4000);
  }
}

// ---------- 預載：每個畫面只抓自己要的圖，第二次進入直接從快取來 ----------
const IMG = n => `IMAGE/zhuyin/${n}${n.startsWith("bg_") && matchMedia("(orientation: portrait)").matches ? "_p" : ""}.webp`;   // 直式背景用 _p（跟 CSS 一致，才不會抓兩份）
const ASSETS = {
  menu: ["bg_map", "guide_owl"], album: ["bg_album"], result: ["bg_map"],
  fish: ["bg_pond", "fish"], build: ["bg_blocks"], hunt: ["bg_park"], match: ["bg_table", "card_back", "card_back_orange"], tone: ["bg_sky", "balloon", "balloon_blue", "balloon_green", "balloon_yellow"],
  whack: ["bg_garden", "hole", "mole_up_body", "mole_hit_body"], frog: ["bg_frog", "frog_sit", "frog_jump", "lilypad", "lilypad_flower", "stone"],
  order: () => ["bg_shop", ...friends().map(f => f.id)],
  hatch: () => ["egg", ...(FRIENDS[4 + save.eggs] ? [FRIENDS[4 + save.eggs].id] : [])],
};
const imgCache = new Map();
function loadImg(name) {
  const src = IMG(name); if (imgCache.has(src)) return imgCache.get(src);
  const pr = new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; });
  pr.done = false; pr.then(() => { pr.done = true; }); imgCache.set(src, pr); return pr;
}
const assetsOf = k => { const a = ASSETS[k]; return typeof a === "function" ? a() : (a || []); };
function preload(k) { for (const n of assetsOf(k)) loadImg(n); }                 // 背景偷偷抓，不擋畫面
// 導覽代號：每次換畫面 +1。等圖片的非同步流程回來時代號不同＝小孩已經點去別的地方，這次作廢
let navToken = 0, loadingOwner = 0;
function nav() { const tok = ++navToken; qToken++; if (loadingOwner) { loadingOwner = 0; showLoading(false); } return tok; }   // qToken++：上一題「答對後自動下一題」的計時器一起作廢
async function ensure(k, tok) {                                                   // 要用了：沒抓完就顯示讀取動畫等它
  const prs = assetsOf(k).map(loadImg); if (prs.every(x => x.done)) return;
  const t = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);   // 150ms 內抓完就不閃讀取畫面
  await Promise.race([Promise.all(prs), new Promise(r => setTimeout(r, 6000))]);   // 網路再慢最多等 6 秒
  clearTimeout(t); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }   // 只有自己打開的讀取畫面才由自己關
}
function showLoading(on) { $("loading").classList.toggle("hidden", !on); }

// ---------- 3D 選單小島（js/zhuyin-hub3d.js）----------
// 選單要用時才動態載入 Three.js＋模型；網址加 ?no3d、沒有 WebGL、載入失敗或 8 秒內沒好 → 退回原本卡片選單（遊戲照常玩）
let hub = null;
function hasWebGL() {                                 // Three.js r163 起只支援 WebGL2；探測完把 context 還回去（iPad 同時能開的 context 有限）
  try { const gl = document.createElement("canvas").getContext("webgl2"); if (!gl) return false; const x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); return true; } catch (e) { return false; }
}
function importHub() {
  const url = "./zhuyin-hub3d.js?v=2";
  if (window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap")) return import(url);
  return new Promise((ok, no) => {                    // 舊 iPad（iOS 16.3 以前）不支援 importmap → 補 es-module-shims 再載
    const s = document.createElement("script"); s.src = "IMAGE/zy3d/vendor/es-module-shims/es-module-shims.js";
    s.onload = () => window.importShim ? window.importShim(new URL(url, import.meta.url).href).then(ok, no) : no(new Error("no importShim")); s.onerror = no; document.head.appendChild(s);
  });
}
function hubFail(why) { console.warn("[hub3d] 退回卡片選單：", why); hub = null; document.body.classList.remove("hub3d"); document.body.classList.add("hub-off"); }
function initHub() {
  if (/[?&]no3d\b/.test(location.search) || !hasWebGL()) { document.body.classList.add("hub-off"); return Promise.resolve(null); }   // hub-off：卡片選單才顯示背景圖
  let settled = false;                                 // （Three.js 已由 zhuyin.html 的 modulepreload 跟頁面一起開始抓）
  const ready = importHub().then(m => m.createHub({ host: $("menu"), friends: () => friends(), onFriend: f => { play("tap"); say(f.name); }, onFail: hubFail, newbie: () => stickerCount() === 0 }))
    .then(h => { if (settled) { h.dispose(); return null; } settled = true; hub = h; document.body.classList.add("hub3d"); return h; },
      e => { if (!settled) { settled = true; hubFail(e && e.message || e); } return null; });
  const late = new Promise(r => setTimeout(() => { if (!settled) { settled = true; hubFail("逾時"); } r(null); }, 8000));
  return Promise.race([ready, late]);
}

// ---------- 畫面切換 / 嚮導 ----------
let mode = null, round = [], idx = 0, results = [], locked = false, wrongThisQ = 0, combo = 0, earned = [], idleTimer = null, roundStars = 0, qToken = 0;
const READING = new Set(["order", "hunt"]);          // 看注音自己讀的模式：題目完全不出聲，按提示才唸
function showScreen(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== id);
  const inGame = id in MODES; $("speakBtn").classList.toggle("hidden", !inGame || id === "match");
  $("speakLabel").textContent = READING.has(id) ? "提示" : "再聽"; $("speakBtn").classList.remove("pulse");
  $("settingsBtn").classList.toggle("hidden", id !== "menu"); $("playerBtn").classList.toggle("hidden", id !== "menu");
  $("progress").classList.toggle("hidden", !inGame || id === "match");
  $("guide").classList.toggle("hidden", id !== "menu");
  if (hub) { if (id === "menu") hub.show(); else hub.hide(); }   // 3D 小島只在選單畫面渲染（省電）
}
function guideSay(text, speak = true) { $("guideText").textContent = text; if (speak) say(text); }
function armIdle() {                                   // 家長設定秒數沒動作 → 只讓「🔊 提示」閃，不出聲
  clearIdle(); if (!save.hintWait || mode === "match") return;
  idleTimer = setTimeout(() => { if (locked || !mode) return; hintPulse(true); }, save.hintWait * 1000);
}
function hintPulse(on) { $("speakBtn").classList.toggle("pulse", on); }
let introUntil = 0;                                    // 第一次玩的開場語還在講：題目語音排在後面，不打斷它
function askSay(t) { if (Date.now() < introUntil) queueSay(t); else say(t); }
function clearIdle() { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; }
function speakPrompt() { const q = round[idx]; if (!q) return; say(mode === "order" ? "我要" + q.word.h : q.word.h); }
// 小孩按「🔊 提示」：唸題目；已經錯 2 次的話，順便讓正確答案晃一下（幫忙只在他開口要的時候給）
function useHint() {
  hintPulse(false); if (locked || !mode) return; speakPrompt(); armIdle();
  if (mode === "whack" && wq) wq.pauseUntil = performance.now() + 1500;   // 按再聽：1.5 秒內不冒新地鼠，讓他專心聽
  if (wrongThisQ < 2) return;
  if (mode === "build") { buildHint(); return; }
  if (mode === "whack" || mode === "frog") { gameHint(); return; }
  const map = { fish: ["#pond", ".fishBtn"], order: ["#shelf", ".item"], hunt: ["#scene", ".obj"], tone: ["#sky", ".balloon"] }[mode];
  if (map && curOpts) hintCorrect(document.querySelector(map[0]), map[1], curOpts);
}
let curOpts = null;                                    // 目前題目的選項（提示時找正解用）
function drawProgress() {
  const p = $("progress"); p.innerHTML = ""; const n = MODES[mode].rounds; if (n <= 1) { p.classList.add("hidden"); return; } p.classList.remove("hidden");
  for (let i = 0; i < n; i++) { const s = el("span"); if (results[i] === "gold") s.className = "gold"; else if (results[i] === "silver") s.className = "silver"; if (i === idx) s.classList.add("cur"); p.appendChild(s); }
}

// ---------- 出題 ----------
// 干擾項：level 1 同音節數隨機；level 2 優先同聲母/韻母；level 3 混入「同音不同聲調」假詞
function makeOptions(target, level, pool, count = 4) {
  const ts = parseZ(target.z), n = ts.length;
  const same = pool.filter(w => w !== target && parseZ(w.z).length === n);
  const near = same.filter(w => { const s = parseZ(w.z); return s.some((x, i) => x.sym[0] === ts[i].sym[0] || x.sym.slice(-1) === ts[i].sym.slice(-1)); });
  const opts = [{ syls: ts, word: target, ok: true }], used = new Set([target.z]);
  if (level >= 3) { const alt = toneVariant(ts, [], true); if (!used.has(zToStr(alt))) { used.add(zToStr(alt)); opts.push({ syls: alt, word: null, ok: false, toneFake: true }); } }
  for (const w of shuffle([...(level >= 2 && near.length >= 2 ? near : same)])) { if (opts.length >= count) break; if (used.has(w.z)) continue; used.add(w.z); opts.push({ syls: parseZ(w.z), word: w, ok: false }); }
  for (const w of shuffle([...pool])) { if (opts.length >= count) break; if (w === target || used.has(w.z)) continue; used.add(w.z); opts.push({ syls: parseZ(w.z), word: w, ok: false }); }
  return shuffle(opts);
}
// 櫻木 10-10 兩個陷阱不能拿來當假牌：
//  ① 三聲變調：ㄌㄠˇ ㄏㄨˇ 唸起來是ㄌㄠˊ，前一個ˇ改成ˊ＝小孩照耳朵聽到的點反而被判錯
//  ② 輕聲：桃子的ㄗ˙ 改成ㄗˇ，正好是小孩學過的「子」→ 輕聲音節一律不改
function toneVariant(ts, exclude = [], noZero = false) {   // 改一個音節的聲調（noZero=假詞不用一聲，否則畫面上沒符號可提示）
  const can = ts.map((s, i) => i).filter(i => ts[i].tone !== 4); if (!can.length) return ts.map(s => ({ ...s }));
  for (let tries = 0; tries < 30; tries++) {
    const i = pick(can), alt = ts.map(s => ({ ...s })); let nt; do { nt = noZero ? 1 + rnd(3) : rnd(4); } while (nt === alt[i].tone);
    if (nt === 1 && ts[i].tone === 2 && ts[i + 1]?.tone === 2) continue;
    alt[i].tone = nt; alt.diffAt = i;
    const key = zToStr(alt); if (!exclude.includes(key)) return alt;
  }
  return ts.map(s => ({ ...s }));
}
// 題序：由短到長；優先「還沒貼紙」的詞（每回合都有新貼紙可拿）
function makeRound(pool, m) {
  const key = new Map(pool.map(w => [w, (save.stickers[w.h] ? 1 : 0) + Math.random()]));   // 沒貼紙的排前面（key 只算一次，排序才穩）
  const bySyl = k => pool.filter(w => parseZ(w.z).length === k).sort((a, b) => key.get(a) - key.get(b));
  const plan = m === "build" || m === "whack" ? [[1, 3], [2, 3]] : m === "tone" ? [[1, 5], [2, 3]] : m === "frog" ? [[2, 4], [3, 1]] : [[1, 3], [2, 4], [3, 1]];
  let seq = []; for (const [k, c] of plan) seq.push(...bySyl(k).slice(0, c));
  const n = MODES[m].rounds; while (seq.length < n) seq.push(pick(pool)); seq = seq.slice(0, n);
  const LV = { whack: [1, 1, 2, 2, 3, 3], frog: [1, 1, 2, 2, 3] }[m];   // 新遊戲照設計稿逐題給難度（共用公式會跳過 level 2）
  return seq.map((w, i) => ({ word: w, level: LV ? LV[i] : i < 3 ? 1 : i < n - 2 ? 2 : 3 }));
}

// ---------- 回合流程 ----------
// resume：上次沒玩完的回合（每題開始前自動存），回選單時可以「▶ 繼續」
const findWord = h => WORDS.find(w => w.h === h) || PHRASES.find(w => w.h === h) || null;
function saveResume() {
  if (!mode || mode === "match" || idx >= MODES[mode].rounds) { lsSet(K("resume"), null); return; }
  lsSet(K("resume"), { mode, idx, results, combo, earned: earned.map(w => w.h), words: round.map(q => [q.word.h, q.level]), t: Date.now() });
}
function getResume() {
  const r = lsGet(K("resume"), null);
  if (!r || !MODES[r.mode] || !Array.isArray(r.words) || r.idx >= r.words.length || Date.now() - r.t > 14 * 864e5) return null;
  return r;
}
async function startMode(m, resume) {
  if (stickerCount() < MODES[m].need) { play("select"); guideSay(`再收集 ${MODES[m].need - stickerCount()} 張貼紙就可以玩囉！`); return; }
  const tok = nav(); stopSpeech(); introUntil = 0; clearIdle(); locked = true;
  // 音樂與開場語在「點下去的當下」就開始（iOS 要求在點擊裡啟動聲音；圖片載入時也不會一片安靜）
  playBgm(MODES[m].bgm);
  if (!save.intro[m]) { save.intro[m] = 1; persist(); introUntil = Date.now() + 6000; say(MODES[m].intro, 0.85, () => { introUntil = 0; }); }
  await ensure(m, tok);
  if (tok !== navToken) return;                        // 等圖的時候小孩已經點去別的地方
  lsSet(K("last_mode"), m);
  mode = m; idx = 0; results = []; combo = 0; earned = []; locked = false; wrongThisQ = 0;
  const pool = m === "order" ? WORDS.filter(w => w.c === "food") : WORDS;
  round = m === "match" ? [] : makeRound(pool, m);
  if (resume) {                                        // 接著上次的題目、從上次那題開始
    const rw = resume.words.map(([h, level]) => ({ word: findWord(h), level })).filter(q => q.word);
    if (rw.length === round.length) { round = rw; idx = resume.idx; results = resume.results || []; combo = resume.combo || 0; earned = (resume.earned || []).map(findWord).filter(Boolean); }
  }
  showScreen(m);
  nextQ();
  setTimeout(() => { preload("result"); try { SFX.party.load(); } catch (e) {} }, 2500);   // 玩的時候偷偷準備結算要用的
}
function nextQ() {
  clearIdle();
  if (mode !== "match" && idx >= MODES[mode].rounds) return showResult();
  saveResume();                                       // 每題開始前存一次：關掉平板也能從這題繼續
  wrongThisQ = 0; locked = false; curOpts = null; hintPulse(false); drawProgress();
  ({ fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone, whack: buildWhack, frog: buildFrog })[mode](round[idx]);
  armIdle();
}
// 答對：金星（一次對）/ 銀星（錯過再對）；連對加速音效＋更多星星；每 3 連對隨機一句稱讚
function correct(target, onDone, { tolerate = 0, holdMs = 500, autoMs = 1800 } = {}) {   // holdMs：多久後點一下可以跳下一題（打地鼠/青蛙拉長，免得連打把揭曉跳掉）
  locked = true; clearIdle(); hintPulse(false);
  const gold = wrongThisQ <= tolerate; results[idx] = gold ? "gold" : "silver";
  if (gold) { combo++; const w = round[idx]?.word; if (w && !save.stickers[w.h] && !PHRASES.includes(w)) { save.stickers[w.h] = 1; earned.push(w); persist(); } } else combo = 0;
  play("ok", 1 + Math.min(combo, 3) * 0.08); burst(target, 10 + Math.min(combo, 4) * 5);
  if (combo > 0 && combo % 3 === 0) setTimeout(() => queueSay(pick(PRAISE)), 800);
  if (onDone) onDone(); drawProgress();
  const token = ++qToken;                              // 這一題的代號：舊題的計時器不能跳過新題
  const adv = () => { document.removeEventListener("pointerdown", adv, true); if (token !== qToken) return; qToken++; idx++; nextQ(); };
  setTimeout(() => { if (locked && token === qToken) document.addEventListener("pointerdown", adv, true); }, holdMs);   // 鎖定中再點一下＝直接下一題
  setTimeout(() => { if (locked && token === qToken) adv(); }, autoMs);
}
function wrong(elm) {
  wrongThisQ++; combo = 0; play("ng");
  elm.classList.remove("ng"); void elm.offsetWidth; elm.classList.add("ng"); setTimeout(() => elm.classList.add("dim"), 400);
  armIdle(); if (wrongThisQ >= 2) hintPulse(true);      // 錯 2 次：提示按鈕閃，引導他按
}

// ---------- 釣魚 ----------
function buildFish(q) {
  const p = $("fishPrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const pond = $("pond"); pond.innerHTML = "";
  const opts = makeOptions(q.word, q.level, WORDS), W = pond.clientWidth, H = pond.clientHeight, portrait = matchMedia("(orientation: portrait)").matches;   // 跟 CSS 同一套直橫判斷（3:4 iPad 以前會算錯而疊在一起）
  const vm = Math.min(innerWidth, innerHeight) / 100, bw = (portrait ? 40 : 30) * vm, bh = (portrait ? 34 : 32) * vm;   // 魚＋下方注音標籤的總高
  opts.forEach((o, i) => {
    const b = el("button", "fishBtn"); b.appendChild(el("div", "fishImg"));
    const lab = el("div", "zlabel"), z = renderZ(o.syls), maxLen = Math.max(...o.syls.map(x => x.sym.length));
    z.style.fontSize = (o.syls.length >= 3 ? 3.8 : o.syls.length === 2 ? (maxLen >= 3 ? 4.2 : 4.8) : (maxLen >= 3 ? 5 : 6)) + "vmin"; lab.appendChild(z); b.appendChild(lab);
    let x, y; if (portrait) { x = (i % 2) * (W / 2) + (W / 2 - bw) / 2; y = Math.floor(i / 2) * (H / 2) + (H / 2 - bh) / 2; } else { x = i * (W / 4) + (W / 4 - bw) / 2; y = (H - bh) / 2 + (i % 2 ? 0.1 : -0.1) * H; }
    b.style.left = Math.max(0, x) + "px"; b.style.top = Math.max(0, y) + "px";
    b.onclick = () => {
      if (locked) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); if (o.toneFake) { const d = o.syls.diffAt ?? 0, t = b.querySelectorAll(".syl")[d]?.querySelector(".tone"); if (t) t.classList.add("hint"); } }
    };
    pond.appendChild(b);
  });
  curOpts = opts; askSay(q.word.h);
}
function hintCorrect(container, sel, opts) {         // 第二次錯：正解輕輕搖晃當提示
  const nodes = [...container.querySelectorAll(sel)]; const i = opts.findIndex(o => o.ok); if (nodes[i]) { nodes[i].classList.add("wiggle"); setTimeout(() => nodes[i].classList.remove("wiggle"), 1500); }
}

// ---------- 點餐（真正練「看注音→懂意思」：不自動唸，錯 1 次或閒置才唸）----------
function buildOrder(q) {
  const cust = $("customer"); cust.src = `IMAGE/zhuyin/${pick(friends()).id}.webp`; cust.className = "customer";
  const bubble = $("bubble"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z)));
  const shelf = $("shelf"); shelf.innerHTML = "";
  const foods = WORDS.filter(w => w.c === "food"), opts = makeOptions(q.word, Math.min(q.level, 2), foods).filter(o => o.word);
  for (const o of opts) {
    const it = el("button", "item"); it.textContent = o.word.e;   // 只有圖：國字＋注音會直接洩漏答案，答對後泡泡才揭曉
    it.onclick = () => {
      if (locked) return;
      if (o.ok) { it.classList.add("ok"); correct(it, () => { cust.classList.add("happy"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z), q.word.h)); say(q.word.h + "，謝謝你！"); }); }
      else { wrong(it); cust.classList.remove("no"); void cust.offsetWidth; cust.classList.add("no"); }
    };
    shelf.appendChild(it);
  }
  curOpts = opts;
}

// ---------- 積木（即時判定：放對亮綠、放錯彈回；符號填滿的音節才亮聲調格）----------
const ALL_SYMS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ";
let bq = null;
function buildBuild(q) {
  const p = $("buildPrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const syls = parseZ(q.word.z), need = syls.flatMap(s => [...s.sym]);
  const extra = 1 + q.level, pool = shuffle([...ALL_SYMS].filter(c => !need.includes(c))).slice(0, extra);
  const slotsEl = $("slots"); slotsEl.innerHTML = ""; bq = { syls, slots: [], toneSlots: [] };
  syls.forEach(s => {
    const g = el("div", "sylSlot"), col = el("div", "col"), arr = [];
    for (let i = 0; i < s.sym.length; i++) { const d = el("div", "slot"); col.appendChild(d); arr.push(d); }
    const ts = el("div", "slot toneSlot off"); g.appendChild(col); g.appendChild(ts); slotsEl.appendChild(g); bq.slots.push(arr); bq.toneSlots.push(ts);
  });
  const tray = $("tray"); tray.innerHTML = "";
  for (const c of shuffle([...need.map(c => ({ t: "s", v: c })), ...pool.map(c => ({ t: "s", v: c }))])) { const b = el("button", "tile", c.v); b.dataset.v = c.v; b.onclick = () => placeSym(b); tray.appendChild(b); }
  const toneRow = $("toneRow"); toneRow.innerHTML = ""; toneRow.classList.add("hidden");
  [0, 1, 2, 3, 4].forEach(t => { const b = el("button", "tile toneTile" + (t ? " tv" + (t + 1) : ""), TONE_TILE[t]); b.dataset.v = t; b.onclick = () => placeTone(b); toneRow.appendChild(b); });   // tv2~tv5：跟題目同一套向量聲調圖
  markCur(); askSay(q.word.h);
}
function buildHint() {                                // 按提示且已錯 2 次：晃「下一個該放的」積木
  const e = emptySlots()[0];
  if (e) { const want = bq.syls[e[0]].sym[e[1]]; const tb = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === want); if (tb) { tb.classList.add("wiggle"); setTimeout(() => tb.classList.remove("wiggle"), 1500); } return; }
  const i = bq.syls.findIndex((s, k) => bq.toneSlots[k].classList.contains("open"));
  if (i >= 0) { const tb = [...document.querySelectorAll("#toneRow .tile")].find(t => +t.dataset.v === bq.syls[i].tone); if (tb) { tb.classList.add("wiggle"); setTimeout(() => tb.classList.remove("wiggle"), 1500); } }
}
function emptySlots() { const out = []; bq.syls.forEach((s, i) => bq.slots[i].forEach((d, j) => { if (!d.dataset.v) out.push([i, j, d]); })); return out; }
function markCur() { document.querySelectorAll("#slots .slot.cur").forEach(d => d.classList.remove("cur")); const e = emptySlots()[0]; if (e) e[2].classList.add("cur"); }
function placeSym(b) {
  if (locked || b.classList.contains("used")) return;
  const empties = emptySlots(); if (!empties.length) return;
  const hit = empties.find(([i, j]) => bq.syls[i].sym[j] === b.dataset.v);   // 放到任一空格的正解（小孩先拼第二個音節也算對）
  if (hit) { const d = hit[2]; d.dataset.v = b.dataset.v; d.textContent = b.dataset.v; d.classList.remove("bad", "cur"); d.classList.add("good"); b.classList.add("used"); play("tap", 1.1); }
  else {
    wrongThisQ++; combo = 0; play("ng"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); const d = empties[0][2]; d.classList.remove("bad"); void d.offsetWidth; d.classList.add("bad");
    if (wrongThisQ >= 2) hintPulse(true);
  }
  markCur(); refreshToneRow(); armIdle();
}
function refreshToneRow() {                          // 有音節符號填滿且還沒聲調 → 顯示聲調積木、該格亮起
  let anyOpen = false;
  bq.syls.forEach((s, i) => { const full = bq.slots[i].every(d => d.dataset.v); const ts = bq.toneSlots[i]; if (full && ts.dataset.v === undefined) { ts.classList.remove("off"); ts.classList.add("open"); anyOpen = true; } else ts.classList.remove("open"); });
  $("toneRow").classList.toggle("hidden", !anyOpen);
  if (!anyOpen && bq.syls.every((s, i) => bq.toneSlots[i].dataset.v !== undefined)) finishBuild();
}
function placeTone(b) {
  if (locked) return;
  const i = bq.syls.findIndex((s, k) => bq.toneSlots[k].classList.contains("open")); if (i < 0) return;
  const ts = bq.toneSlots[i], v = +b.dataset.v;
  if (v === bq.syls[i].tone) { ts.dataset.v = v; ts.textContent = TONE_TILE[v]; if (v) ts.classList.add("tv" + (v + 1)); ts.classList.remove("bad"); ts.classList.add("good"); play("tap", 1.2); }
  else { wrongThisQ++; combo = 0; play("ng"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); ts.classList.remove("bad"); void ts.offsetWidth; ts.classList.add("bad");
    if (wrongThisQ >= 2) hintPulse(true); }
  refreshToneRow(); armIdle();
}
function finishBuild() {
  const q = round[idx];
  correct($("slots"), () => { $("buildPrompt").appendChild(el("span", "han", q.word.h)); say(q.word.h); }, { tolerate: 1 });   // 錯 ≤1 次仍算金星
}

// ---------- 尋寶（場景 8 個東西，泡泡只給注音、不唸；後段用「顏色＋東西」短語）----------
function buildHunt(q) {
  const scene = $("scene"); scene.innerHTML = "";
  const bubble = $("huntBubble"); bubble.innerHTML = "";
  let target = q.word, objs;
  if (q.level >= 3) {                                // 短語題：目標＋它的顏色配對＋6 個其他詞
    target = pick(PHRASES); q.word = target; const pairE = target.pair;
    const others = shuffle(WORDS.filter(w => w.e !== target.e && w.e !== pairE)).slice(0, 6);
    objs = shuffle([{ e: target.e, ok: true }, { e: pairE, ok: false }, ...others.map(w => ({ e: w.e, ok: false }))]);
  } else { const others = shuffle(WORDS.filter(w => w !== q.word && w.e !== q.word.e)).slice(0, 7); objs = shuffle([{ e: q.word.e, ok: true }, ...others.map(w => ({ e: w.e, ok: false }))]); }
  bubble.appendChild(renderZ(parseZ(target.z)));
  const cols = 4, rows = 2;                          // 4×2 格點＋隨機抖動，不重疊
  objs.forEach((o, i) => {
    const b = el("button", "obj", o.e); const c = i % cols, r = Math.floor(i / cols);
    const portrait = innerHeight > innerWidth, jx = portrait ? 2 : 6;
    b.style.left = (5 + c * 23 + Math.random() * jx) + "%"; b.style.top = (8 + r * 44 + Math.random() * 12) + "%";
    b.onclick = () => {
      if (locked) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(target.z), target.h)); say("找到了，" + target.h); $("bag").textContent = "🎒 " + (results.filter(Boolean).length); }); }
      else wrong(b);
    };
    scene.appendChild(b);
  });
  curOpts = objs;
}

// ---------- 翻牌配對（注音卡 ↔ 圖卡；8／16／24 張可選）----------
// 圖卡翻開只有圖（有國字＋注音就變成比對符號、不用讀），配對成功才揭曉國字＋注音
let mq = null;
// 依畫面大小算幾欄幾列：比的是「注音字能多大」（寧次 10-10），卡片寬高比可在 0.78～1.35 之間伸縮，每列都排滿
function layoutBoard(n) {
  const sec = $("match"), board = $("board"), top = sec.querySelector(".topbar").offsetHeight, vm = Math.min(innerWidth, innerHeight) / 100;
  const W = sec.clientWidth * 0.95, H = (sec.clientHeight - top) * 0.94; let best = null;
  for (let cols = 2; cols <= n; cols++) {
    if (n % cols) continue;                            // 每列都排滿才好看、好記位置
    const rows = n / cols, gap = Math.min(W, H) * (n > 8 ? 0.015 : 0.03);
    let w = (W - gap * (cols - 1)) / cols, h = (H - gap * (rows - 1)) / rows;
    if (w / h > 1.35) w = h * 1.35; else if (w / h < 0.78) h = w / 0.78;
    const zf = Math.min(w * 0.82 / 4.4, h * 0.75 / 3.4, 5.5 * vm);   // 雙音節注音約 4.4em 寬、三個符號直排約 3.4em 高
    if (!best || zf > best.zf + 0.5 || (zf > best.zf - 0.5 && w * h > best.w * best.h)) best = { cols, w, h, gap, zf };
  }
  board.style.setProperty("--cols", best.cols); board.style.setProperty("--cw", best.w + "px"); board.style.setProperty("--ch", best.h + "px"); board.style.setProperty("--gap", best.gap + "px");
  board.style.setProperty("--zf", best.zf + "px");
  board.style.setProperty("--ef", Math.min(best.w, best.h) * 0.55 + "px");
}
function buildMatch() {
  const board = $("board"); board.innerHTML = "";
  const pairs = (MATCH_SIZES.find(s => s.n === save.matchSize) || MATCH_SIZES[0]).n / 2;
  const key = new Map(WORDS.map(w => [w, (save.stickers[w.h] ? 1 : 0) + Math.random()]));
  // 圖卡選詞：排除看圖猜不出來的（顏色、人物、動作、水/杯子/積木/玩具/湯/嘴巴）與三音節；
  // 同一盤同一個圖不重複；8/16 張時不放共用音節的詞（熊＋熊貓、雞＋小雞會讓小孩搞混）
  const words = [], seenE = new Set(), seenSyl = new Set();
  for (const w of WORDS.filter(w => parseZ(w.z).length <= 2 && !MATCH_EXCLUDE.has(w.h)).sort((a, b) => key.get(a) - key.get(b))) {
    const syl = w.z.split(" "); if (seenE.has(w.e)) continue; if (pairs < 12 && syl.some(x => seenSyl.has(x))) continue;
    seenE.add(w.e); syl.forEach(x => seenSyl.add(x)); words.push(w); if (words.length >= pairs) break;
  }
  const cards = shuffle(words.flatMap(w => [{ w, kind: "z" }, { w, kind: "e" }]));
  mq = { open: [], matched: 0, miss: 0, words, busy: false, pairs, hold: null };
  board.className = "board n" + cards.length; layoutBoard(cards.length);
  for (const c of cards) {
    const card = el("button", "card k" + c.kind); const inner = el("div", "inner"); const back = el("div", "face back"); const front = el("div", "face front");   // kz＝注音卡（藍背）、ke＝圖卡（橘背）
    if (c.kind === "z") { const z = renderZ(parseZ(c.w.z)); front.appendChild(z); } else { front.appendChild(el("div", "em", c.w.e)); }
    inner.appendChild(back); inner.appendChild(front); card.appendChild(inner); card._c = c;
    card.onclick = () => flip(card); board.appendChild(card);
  }
}
function flip(card) {
  if (mq.hold) { mq.hold(); return; }                 // 錯配停留中：點任何一張牌＝提早蓋回
  if (mq.busy || card.classList.contains("up") || card.classList.contains("done")) return;
  // 兩色卡背：已經翻開一張，第二張又點到同色 → 只晃一下＋另一色的牌閃一下提醒，不算錯
  if (mq.open.length === 1 && mq.open[0]._c.kind === card._c.kind) {
    card.classList.remove("wiggle"); void card.offsetWidth; card.classList.add("wiggle"); play("tap", 0.8);
    const other = card._c.kind === "z" ? ".card.ke" : ".card.kz";
    document.querySelectorAll(other + ":not(.done):not(.up)").forEach(c => { c.classList.remove("glow"); void c.offsetWidth; c.classList.add("glow"); });
    setTimeout(() => card.classList.remove("wiggle"), 700); return;
  }
  card.classList.add("up"); play("flip"); mq.open.push(card); armIdle();
  if (mq.open.length < 2) return;
  const [a, b] = mq.open; mq.busy = true;
  if (a._c.w === b._c.w && a._c.kind !== b._c.kind) {
    setTimeout(() => { a.classList.add("done"); b.classList.add("done"); play("ok", 1 + Math.min(mq.matched, 6) * 0.06); burst(b, 12); say(a._c.w.h); mq.matched++; mq.open = []; mq.busy = false;
      const pic = a._c.kind === "e" ? a : b; pic.querySelector(".front").appendChild(el("div", "han", a._c.w.h));   // 配對成功才揭曉國字（自動加注音）
      const w = a._c.w; if (!save.stickers[w.h]) { save.stickers[w.h] = 1; earned.push(w); persist(); }   // 配對成功＝讀對了，直接貼貼紙
      if (mq.matched === mq.pairs) finishMatch(); }, 350);
  } else {
    mq.miss++;
    let done = false;                                  // 錯配：停 0.9 秒（16/24 張 1.2 秒，可以點一下提早蓋回）；蓋回的牌背留腳印
    const back = () => { if (done) return; done = true; mq.hold = null; a.classList.remove("up"); b.classList.remove("up"); a.classList.add("seen"); b.classList.add("seen"); play("ng"); mq.open = []; mq.busy = false; };
    setTimeout(() => { if (!done && mq.pairs > 4) mq.hold = back; }, 450);
    setTimeout(back, mq.pairs > 4 ? 1200 : 900);
  }
}
// 翻牌圖卡不收的詞（櫻木 B4：看圖猜不出、或圖意會偏）
const MATCH_EXCLUDE = new Set(["紅色", "黃色", "藍色", "綠色", "爸爸", "媽媽", "爺爺", "奶奶", "寶寶", "醫生", "警察", "老師",
  "跑步", "游泳", "睡覺", "唱歌", "跳舞", "笑", "哭", "水", "杯子", "積木", "玩具", "湯", "嘴巴"]);
function finishMatch() {
  clearIdle(); locked = true; results = ["gold"]; combo = 0;
  const th = { 4: [4, 8], 8: [10, 18], 12: [16, 28] }[mq.pairs] || [mq.pairs, mq.pairs * 2];   // 櫻木 B1：3 星／2 星的錯配上限
  results[0] = mq.miss <= th[0] ? "gold" : "silver"; mq.stars = mq.miss <= th[0] ? 3 : mq.miss <= th[1] ? 2 : 1;
  persist(); setTimeout(() => say("全部找到了！"), 900); setTimeout(showResult, 1800);
}

// ---------- 聲調氣球（同一組符號、四種聲調，戳對的爆）----------
function buildTone(q) {
  const p = $("tonePrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const sky = $("sky"); sky.innerHTML = "";
  const ts = parseZ(q.word.z), opts = [{ syls: ts, ok: true }], used = [zToStr(ts)];
  while (opts.length < 4) { const alt = toneVariant(ts, used); const k = zToStr(alt); if (used.includes(k)) break; used.push(k); opts.push({ syls: alt, ok: false }); }
  shuffle(opts).forEach((o, i) => {
    const b = el("button", "balloon c" + i); b.appendChild(el("div", "balloonImg")); b.appendChild(el("div", "bstring"));
    const lab = el("div", "zlabel"), z = renderZ(o.syls), ml = Math.max(...ts.map(x => x.sym.length)); z.style.fontSize = (ts.length >= 2 ? (ml >= 3 ? 4.2 : 5) : (ml >= 3 ? 5.4 : 6.5)) + "vmin"; lab.appendChild(z); b.appendChild(lab);
    b.style.left = (4 + i * 24) + "%"; b.style.animationDelay = (-i * 0.7) + "s";
    b.onclick = () => {
      if (locked) return;
      if (o.ok) { b.classList.add("ok"); play("pop"); correct(b, () => { p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else wrong(b);
    };
    sky.appendChild(b);
  });
  curOpts = opts; askSay(q.word.h);
}

// ---------- 共用：干擾注音來源 ----------
// 1 音節：所有詞拆出來的音節（不含輕聲）；2 音節：雙音節詞的整串注音
const _sylCache = {};
function sylPool(nSyl) {
  if (_sylCache[nSyl]) return _sylCache[nSyl];
  return (_sylCache[nSyl] = nSyl === 1 ? [...new Set(WORDS.flatMap(w => w.z.split(" ")).filter(s => !s.endsWith("˙")))]
    : [...new Set(WORDS.filter(w => w.z.split(" ").length === nSyl).map(w => w.z))]);
}
const firstSym = p => p[0].sym[0], lastSym = p => p[p.length - 1].sym.slice(-1);
// level 1：聲母、韻母都不同；level 2：同聲母或同韻母；level 3：再多一張改聲調的假牌
function pickDistractors(target, level, n, exclude = []) {
  const ts = parseZ(target), bare = ts.map(s => s.sym).join(" ");
  const pool = sylPool(ts.length).filter(z => z !== target && !exclude.includes(z) && parseZ(z).map(s => s.sym).join(" ") !== bare);   // 只差聲調的留給 level 3，前段不出（太難）
  const f = firstSym(ts), l = lastSym(ts);
  let cand = level <= 1 ? pool.filter(z => { const p = parseZ(z); return firstSym(p) !== f && lastSym(p) !== l; })
    : pool.filter(z => { const p = parseZ(z); return firstSym(p) === f || lastSym(p) === l; });
  if (cand.length < n) cand = cand.concat(shuffle(pool.filter(z => !cand.includes(z))));
  const out = shuffle([...cand]).slice(0, n);
  if (level >= 3 && n > 0) { const alt = zToStr(toneVariant(ts, [target, ...exclude], true)); if (alt !== target && !exclude.includes(alt)) out[0] = alt; }
  return out;
}

// ---------- 注音打地鼠（櫻木 A1：一眼認出整個音節的速度）----------
// 目標卡只放圖、開題唸一次；地鼠舉注音牌冒出來，敲中正確的 3 次換下一個目標。
// 探頭時間依小孩表現自動調整並記在存檔（不同小孩各自的速度）；正解縮回去沒敲不算錯；
// 敲錯後點不動 0.5→1→1.5 秒（連錯遞增，防亂敲）；連續 5 下敲對＝那一下變金色大爆炸（敲中後才出現，不先標記答案）。
// 洞 3×2＝6 個（設計稿 3×3，平板上注音牌會太小；最多 3 隻同時冒出＝每欄最多 1 隻，上下不會互相擋）
const WH = { hits: 3, holes: 6, cols: 3, upS: [2.2, 4.5], upD: [2.8, 5.0] };
let wq = null, whackRun = 0;                           // whackRun：跨目標累計的連續敲對數
function layoutField() {
  const f = $("field"); if (!f || !f.firstChild) return; const r = f.firstChild.getBoundingClientRect();
  f.style.setProperty("--cw", r.width + "px"); f.style.setProperty("--ch", r.height + "px");
}
function buildWhack(q) {
  if (wq) cancelAnimationFrame(wq.raf);
  if (idx === 0) whackRun = 0;
  const ts = parseZ(q.word.z);
  const pic = $("whackPic"); pic.innerHTML = ""; pic.appendChild(el("div", "tem", q.word.e));
  const dots = $("whackDots"); dots.innerHTML = ""; for (let i = 0; i < WH.hits; i++) dots.appendChild(el("span"));
  const field = $("field"); field.innerHTML = ""; const cells = [];
  for (let i = 0; i < WH.holes; i++) {
    const c = el("div", "wcell"); c.appendChild(el("div", "whole"));
    const win = el("div", "wwin"), m = el("button", "mole"), sign = el("div", "zlabel wsign");
    m.appendChild(sign); m.appendChild(el("div", "mbody")); win.appendChild(m); c.appendChild(win); field.appendChild(c);
    const cell = { mole: m, sign, state: "down", ok: false, until: 0, last: -1e9 };
    m.addEventListener("pointerdown", e => { e.preventDefault(); whackTap(cell); });   // 手指一碰就算（onclick 要放開才觸發，慢 0.1-0.3 秒）
    cells.push(cell);
  }
  layoutField();
  const up = Object.assign({ s: 3.5, d: 4.2 }, lsGet(K("whack_up"), {})), now = performance.now();
  wq = { q, ts, target: q.word.z, distract: pickDistractors(q.word.z, q.level, 5), cells, hits: 0, up, upKey: ts.length >= 2 ? "d" : "s",
    lastOkSeen: now, nextSpawn: now + 900, lockUntil: 0, pauseUntil: 0, fast: 0, missOk: 0, wrongRun: 0, lastWrongAt: -1e9, hintNext: false, tok: navToken, raf: 0, done: false };
  askSay(q.word.h);
  wq.raf = requestAnimationFrame(whackLoop);
}
function whackLoop(now) {
  const s = wq; if (!s || s.tok !== navToken || mode !== "whack" || s.done) return;
  s.raf = requestAnimationFrame(whackLoop);
  // 時間凍結：暫停選單開著＝整段凍結；切去別的 App／鎖屏時瀏覽器根本不跑這裡，回來第一格的大空檔也當暫停
  // （用真實間隔，120Hz iPad 也不會凍過頭；不凍的話回來全部地鼠同時縮回，還會被誤判「沒敲到」把探頭時間調長）
  const dt = now - (s.t0 || now), paused = document.hidden || !$("confirm").classList.contains("hidden"); s.t0 = now;
  const frozen = paused ? dt : Math.max(0, dt - 100);
  if (frozen > 0) { for (const c of s.cells) if (c.state === "up") c.until += frozen; s.nextSpawn += frozen; s.lastOkSeen += frozen; s.lockUntil += frozen; s.pauseUntil += frozen; }
  if (paused) return;
  for (const c of s.cells) if (c.state === "up" && now >= c.until) moleDown(c, now, true);
  const vis = s.cells.filter(c => c.state === "up" || c.state === "hit"), okVis = vis.some(c => c.ok && c.state === "up");
  if (okVis) s.lastOkSeen = now;
  if (now >= s.nextSpawn && now >= s.pauseUntil && vis.length < (idx < 4 ? 2 : 3)) {   // 櫻木：第 5 題才同時 3 隻（雙音節剛出現那題先別一起加難）
    const busyCol = new Set(s.cells.map((c, i) => c.state !== "down" ? i % WH.cols : -1));
    const free = s.cells.filter((c, i) => c.state === "down" && now - c.last >= 600 && !busyCol.has(i % WH.cols));
    if (free.length) moleUp(pick(free), !okVis && (s.hintNext || now - s.lastOkSeen > 2000 || Math.random() < 0.45), now);
    s.nextSpawn = now + (idx < 4 ? 1000 + Math.random() * 400 : 800 + Math.random() * 400);
  }
}
function moleUp(c, ok, now) {
  const s = wq; c.ok = ok; const z = ok ? s.target : pick(s.distract);
  c.sign.innerHTML = ""; const zz = renderZ(parseZ(z)); zz.style.fontSize = (s.ts.length >= 2 ? 4 : 5) + "vmin"; c.sign.appendChild(zz);
  c.state = "up"; c.until = now + s.up[s.upKey] * 1000; c.mole.className = "mole up";
  if (ok && s.hintNext) { s.hintNext = false; c.mole.classList.add("hinted"); c.until += 1500; }   // 按了提示才冒的正解：金框＋多待 1.5 秒
}
function moleDown(c, now, timeout) {
  if (timeout && c.ok && c.state === "up") { wq.fast = 0; if (++wq.missOk >= 2) { adjustUp(+0.4); wq.missOk = 0; } }   // 正解連續 2 次沒敲到 → 探頭久一點
  c.state = "down"; c.last = now; c.ok = false; c.mole.className = "mole";
}
function adjustUp(d) { const s = wq, k = s.upKey, [lo, hi] = k === "d" ? WH.upD : WH.upS; s.up[k] = Math.min(hi, Math.max(lo, Math.round((s.up[k] + d) * 100) / 100)); lsSet(K("whack_up"), s.up); }
function whackTap(c) {
  const s = wq, now = performance.now();
  if (!s || !c.mole.isConnected || s.done || locked || c.state !== "up" || now < s.lockUntil) return;   // isConnected：同一下點擊已經換題（舊地鼠被拿掉）就不算
  armIdle();
  if (c.ok) {
    s.missOk = 0; s.wrongRun = 0;
    // 連續 2 次很快敲中 → 探頭短一點；最近 2 秒內有敲錯（亂拍）不算「很快」，免得亂拍把難度壓到最難還存進存檔
    if (c.until - now >= 1500 && now - s.lastWrongAt > 2000) { if (++s.fast >= 2) { adjustUp(-0.2); s.fast = 0; } } else s.fast = 0;
    s.hits++; const gold = ++whackRun % 5 === 0;
    c.state = "hit"; c.mole.className = "mole up hit" + (gold ? " golden" : "");
    if (gold) { play("sticker"); burst(c.mole, 22, "🌟"); } else { play("pop", 1 + s.hits * 0.1); burst(c.mole, 9); }
    $("whackDots").children[s.hits - 1]?.classList.add("on");
    setTimeout(() => { if (c.state === "hit") moleDown(c, performance.now(), false); }, 450);
    if (s.hits >= WH.hits) {
      s.done = true; cancelAnimationFrame(s.raf);
      for (const o of s.cells) if (o !== c && o.state === "up") moleDown(o, now, false);
      correct($("whackPic"), () => { $("whackPic").appendChild(renderZ(s.ts, s.q.word.h)); say(s.q.word.h); }, { tolerate: 1, holdMs: 1200, autoMs: 2200 });   // 連打中的小孩別一下就把揭曉跳掉
    }
  } else {
    wrongThisQ++; combo = 0; whackRun = 0; s.wrongRun++; s.lastWrongAt = now; s.lockUntil = now + 500 * Math.min(3, s.wrongRun); play("ng");
    c.mole.classList.add("nope"); setTimeout(() => moleDown(c, performance.now(), false), 350);
    if (wrongThisQ >= 2) hintPulse(true);
  }
}

// ---------- 注音跳跳蛙（櫻木 A2：聽整個詞→切成音節→依序找出每個音節的注音）----------
// 起點→每個音節一排荷葉（第 1 個詞 2 片，之後 3 片）→終點石頭（詞的圖）。跳錯：荷葉沉下去、青蛙不動；沒有時限。
// 位置用「第幾排、第幾片」記，轉平板（直↔橫）時重新換算，不用重出題
let fq = null, frogStreak = 0;                          // frogStreak：跨詞累計連續跳對（每跳高半音）
function fpos(i, j = 0, n = 1) {                       // i：0＝起點荷葉、1..k＝音節排、k+1＝石頭；j/n：這排第幾片／共幾片
  const s = fq, t = i / (s.k + 1), off = (j - (n - 1) / 2) * (s.portrait ? 31 : 27);
  return s.portrait ? { x: 50 + off, y: 88 - t * 74 } : { x: 10 + t * 78, y: 56 + off };
}
function fplace(e) { const p = fpos(...e._lp); e.style.left = p.x + "%"; e.style.top = p.y + "%"; }
function relayoutFrog() {
  const s = fq; if (!s) return; const pt = matchMedia("(orientation: portrait)").matches; if (pt === s.portrait) return;
  s.portrait = pt; for (const e of $("river").children) if (e._lp) fplace(e);
}
function frogLive(s) { return s && s === fq && s.tok === navToken && mode === "frog"; }   // 跳到一半回選單／重新開始：舊的計時器作廢
function buildFrog(q) {
  const ts = parseZ(q.word.z), k = ts.length, river = $("river"); river.innerHTML = ""; if (idx === 0) frogStreak = 0;
  fq = { q, ts, k, step: 0, frog: null, stone: null, portrait: matchMedia("(orientation: portrait)").matches, cols: [], busy: false, lockUntil: 0, okAt: -1e9, slapped: false, tok: navToken };
  const start = el("div", "pad start"); start._lp = [0]; fplace(start); river.appendChild(start);
  const stone = el("div", "fstone"); stone._lp = [k + 1]; fplace(stone); stone.appendChild(el("div", "fpic", q.word.e)); river.appendChild(stone);
  const frog = el("div", "frog"); frog._lp = [0]; fplace(frog); river.appendChild(frog);
  fq.frog = frog; fq.stone = stone;
  showPads(); askSay(q.word.h);
}
function showPads() {
  const s = fq, i = s.step, target = zToStr([s.ts[i]]), n = idx === 0 ? 2 : 3, level = round[idx].level;
  const own = s.ts.map(x => zToStr([x]));              // 干擾排除這個詞自己的任何音節
  const avoid = s.ts[i].tone === 2 && s.ts[i + 1]?.tone === 2 ? [s.ts[i].sym + "ˊ"] : [];   // 三聲變調唸出來的樣子不能當假牌
  // level 3＝順序陷阱（櫻木）：把同一個詞的下一個（最後一排用前一個）音節放進來，練「依序」
  const other = own[i + 1] ?? own[i - 1], trap = level >= 3 && other && other !== target;
  const dis = trap ? [other, ...pickDistractors(target, 2, n - 2, [...own, ...avoid])] : pickDistractors(target, level, n - 1, [...own, ...avoid]);
  const opts = shuffle([{ z: target, ok: true }, ...dis.map(z => ({ z, ok: false }))]);
  s.cols = [];
  opts.forEach((o, j) => {
    const pad = el("button", "pad enter"); pad._lp = [i + 1, j, opts.length]; fplace(pad);
    const lab = el("div", "zlabel"), z = renderZ(parseZ(o.z)); z.style.fontSize = "4.6vmin"; lab.appendChild(z); pad.appendChild(lab);
    pad.addEventListener("pointerdown", e => { e.preventDefault(); padTap(pad, o); });
    $("river").appendChild(pad); s.cols.push({ pad, o });
  });
  curOpts = opts;
}
function frogJump(lp, done) {
  const s = fq, f = s.frog; f.classList.remove("jump"); void f.offsetWidth; f.classList.add("jump"); f._lp = lp; fplace(f);
  f.classList.toggle("onstone", lp[0] === s.k + 1);
  setTimeout(() => { if (!frogLive(s)) return; f.classList.remove("jump"); if (done) done(); }, 460);
}
function padTap(pad, o) {
  const s = fq, now = performance.now(); if (!s || !pad.isConnected || !frogLive(s) || locked || pad.classList.contains("sink")) return;   // 里維 10-10：「再點一下換題」跟荷葉同一下點擊時，舊荷葉不能推進新題
  if (s.busy) { if (!o.ok && now - s.okAt < 150 && !s.slapped) { s.slapped = true; wrongThisQ++; } return; }   // 整個手掌拍下去（正解剛好先算到）：還是記一次錯
  if (now < s.lockUntil) return;                       // 跳錯後 0.8 秒全部荷葉點不動（亂點不會因為錯的沉掉就一定過）
  armIdle();
  if (o.ok) {
    s.busy = true; s.okAt = now; s.slapped = false; frogStreak = Math.min(8, frogStreak + 1); hintPulse(false);
    frogJump(pad._lp, () => {
      pad.classList.remove("enter"); pad.classList.add("bloom"); play("pop", Math.pow(2, frogStreak / 12)); burst(pad, 16);   // 跳對特效要比掉水大很多（防故意跳水）
      for (const c of s.cols) if (c.pad !== pad) c.pad.classList.add("gone");
      setTimeout(() => {
        if (!frogLive(s)) return;
        for (const c of s.cols) if (c.pad !== pad) c.pad.remove();
        s.step++;
        if (s.step >= s.k) frogJump([s.k + 1], finishFrog); else { s.busy = false; showPads(); }
      }, 350);
    });
  } else {
    wrongThisQ++; combo = 0; frogStreak = 0; s.lockUntil = now + 800; play("ng"); burst(pad, 4, "💧"); pad.classList.add("sink");
    const rv = $("river"); rv.classList.add("hold"); setTimeout(() => rv.classList.remove("hold"), 800);
    s.cols = s.cols.filter(c => c.pad !== pad); setTimeout(() => pad.remove(), 650);
    if (wrongThisQ >= 2) hintPulse(true);
  }
}
function finishFrog() {
  const s = fq, w = el("div", "fword"); w.appendChild(el("div", "fwe", s.q.word.e)); w.appendChild(renderZ(s.ts, s.q.word.h)); $("river").appendChild(w);
  correct(s.stone, () => say(s.q.word.h), { tolerate: s.k >= 3 ? 1 : 0, holdMs: 1200, autoMs: 2200 });
}
// 提示（已錯 2 次再按）：地鼠＝正確那隻金框＋晃一下＋多待 1.5 秒（沒冒出來就讓下一隻是正解）；青蛙＝正確荷葉晃一下
function wiggle(e) { if (!e) return; e.classList.remove("wiggle"); void e.offsetWidth; e.classList.add("wiggle"); setTimeout(() => e.classList.remove("wiggle"), 1500); }
function gameHint() {
  if (mode === "whack" && wq && !wq.done) { const c = wq.cells.find(c => c.ok && c.state === "up"); if (c) { wiggle(c.sign); c.mole.classList.add("hinted"); c.until += 1500; } else { wq.hintNext = true; wq.nextSpawn = 0; } }
  if (mode === "frog" && fq && !fq.busy) wiggle(fq.cols.find(c => c.o.ok)?.pad);
}

// ---------- 結算：先「啪」貼新貼紙，再給星，星星罐滿了孵蛋 ----------
function showResult() {
  clearIdle(); locked = false; lsSet(K("resume"), null);
  const n = MODES[mode].rounds, golds = results.filter(r => r === "gold").length, any = results.filter(Boolean).length;
  roundStars = mode === "match" ? (mq?.stars || 2) : golds >= n - 1 ? 3 : golds >= Math.ceil(n / 2) ? 2 : 1;
  showScreen("result"); play("party"); duck(true); setTimeout(() => duck(false), 7000); confetti();
  $("resultStars").innerHTML = ""; $("resultStickers").innerHTML = ""; $("resultText").textContent = mode === "match" ? "全部配對成功！" : mode === "fish" ? `釣到 ${any} 條魚！` : mode === "hunt" ? `找到 ${any} 個寶物！` : mode === "tone" ? `戳破 ${any} 顆氣球！` : mode === "whack" ? `敲到 ${any * WH.hits} 隻地鼠！` : mode === "frog" ? `青蛙過了 ${any} 條河！` : `完成 ${any} 題！`;
  for (let i = 0; i < 3; i++) { const s = el("span", "star" + (i < roundStars ? " on" : ""), i < roundStars ? "⭐" : "☆"); s.style.animationDelay = (0.3 + i * 0.3) + "s"; $("resultStars").appendChild(s); }
  earned.forEach((w, i) => { const st = stickerNode(w, true); st.style.animationDelay = (1.2 + i * 0.35) + "s"; $("resultStickers").appendChild(st); setTimeout(() => play("sticker"), 1200 + i * 350); });
  if (earned.length) setTimeout(() => say(`拿到 ${earned.length} 張新貼紙！`), 1300);
  save.stars += roundStars; persist(); updateJar();
  $("hatchHint").classList.toggle("hidden", save.stars < (save.eggs + 1) * EGG_STARS || 4 + save.eggs >= FRIENDS.length);
}
// 貼紙：圖＋國字（國字旁邊自動加注音）
function stickerNode(w, fresh) { const s = el("div", "sticker" + (fresh ? " fresh" : "") + (w.h.length >= 3 ? " long" : "")); s.appendChild(el("div", "em", w.e)); s.appendChild(el("div", "hz", w.h)); return s; }

// ---------- 星星罐 / 孵蛋 ----------
function updateJar() {
  const inJar = save.stars - save.eggs * EGG_STARS, canHatch = inJar >= EGG_STARS && 4 + save.eggs < FRIENDS.length;
  for (const j of document.querySelectorAll(".jarFill")) j.style.height = Math.min(100, inJar / EGG_STARS * 100) + "%";
  for (const t of document.querySelectorAll(".jarText")) t.textContent = `${Math.min(inJar, EGG_STARS)}/${EGG_STARS}`;
  for (const b of document.querySelectorAll(".jarBtn")) b.classList.toggle("ready", canHatch);
}
let hatching = false;                                 // 孵蛋進行中：連點不會扣兩顆蛋
async function tryHatch() {
  if (hatching) return;
  const inJar = save.stars - save.eggs * EGG_STARS;
  if (inJar < EGG_STARS) { guideSay(`再 ${EGG_STARS - inJar} 顆星星就可以孵蛋囉！`); return; }
  if (4 + save.eggs >= FRIENDS.length) { guideSay("朋友都孵出來了，好厲害！"); return; }
  hatching = true; const tok = navToken;
  await ensure("hatch", tok);
  if (tok !== navToken) { hatching = false; return; }   // 等圖時小孩離開了：蛋不扣
  const f = FRIENDS[4 + save.eggs]; save.eggs++; persist(); updateJar();
  const ov = $("hatch"); ov.classList.remove("hidden"); $("hatchEgg").className = "hatchEgg shake"; $("hatchFriend").classList.add("hidden"); $("hatchName").textContent = ""; $("hatchClose").classList.add("hidden");
  play("tap"); say("蛋要孵出來了！");
  setTimeout(() => { $("hatchEgg").className = "hatchEgg gone"; const img = $("hatchFriend"); img.src = `IMAGE/zhuyin/${f.id}.webp`; img.classList.remove("hidden"); $("hatchName").textContent = f.name + "來了！"; $("hatchClose").classList.remove("hidden"); play("win"); confetti(40); say(f.name + "來了，會來店裡買東西喔！"); }, 2200);
}

// ---------- 貼紙圖鑑 ----------
async function openAlbum(cat) {
  const tok = nav(); await ensure("album", tok); if (tok !== navToken) return;
  showScreen("album"); cat = cat || CATS[0].id;
  const tabs = $("albumTabs"); tabs.innerHTML = "";
  for (const c of CATS) { const got = WORDS.filter(w => w.c === c.id && save.stickers[w.h]).length, all = WORDS.filter(w => w.c === c.id).length; const t = el("button", "tab" + (c.id === cat ? " on" : ""), `${c.icon} ${got}/${all}`); t.onclick = () => { play("select"); openAlbum(c.id); }; tabs.appendChild(t); }
  const grid = $("albumGrid"); grid.innerHTML = "";
  for (const w of WORDS.filter(w => w.c === cat)) {
    if (save.stickers[w.h]) { const s = stickerNode(w); s.onclick = () => say(w.h); grid.appendChild(s); }
    else { const s = el("div", "sticker empty"); s.appendChild(el("div", "em", w.e)); grid.appendChild(s); }
  }
  $("albumCount").textContent = `${stickerCount()} / ${WORDS.length}`;
}

// ---------- 選單 ----------
function renderMenu() {
  for (const card of document.querySelectorAll(".mode-card")) {
    const m = card.dataset.mode, need = MODES[m].need, lockedM = stickerCount() < need;
    card.classList.toggle("locked", lockedM); const lk = card.querySelector(".lock"); if (lk) lk.textContent = lockedM ? `🔒 ${need} 📒` : "";   // 卡片變窄（8 個模式）：用圖示代替「張貼紙」三個字
  }
  $("menuStickers").textContent = `${stickerCount()}`; updateJar();
  $("playerBtn").textContent = SLOTS[slot - 1].e;
  const r = getResume(), rb = $("resumeBtn");          // 上次沒玩完 → 大大的「▶ 繼續」
  rb.classList.toggle("hidden", !r);
  if (r) { const icon = document.querySelector(`.mode-card[data-mode=${r.mode}] .big`)?.textContent || "▶"; const label = document.querySelector(`.mode-card[data-mode=${r.mode}] .label`)?.textContent || ""; rb.textContent = `▶️ 繼續玩${label} ${icon} ${r.idx + 1}/${r.words.length}`; }
  const total = stickerCount(); guideSay(total === 0 ? "你好！快來選遊戲玩吧！" : total < 5 ? "再收集幾張貼紙，就能開新遊戲喔！" : pick(["今天要玩哪個呢？", "貼紙越來越多了！", "來釣魚還是去尋寶？"]), false);
  if (hub) hub.refresh();                              // 3D 小島跟著卡片更新：鎖頭、朋友、鏡頭擺位
}
let menuPrefetch = null;
function goMenu() {
  nav(); stopSpeech(); introUntil = 0;                 // 作廢所有等圖中的導覽、停掉還沒講完的語音
  mode = null; clearIdle(); locked = false; showScreen("menu"); playBgm("island"); renderMenu();
  clearTimeout(menuPrefetch);                         // 選單停 2 秒 → 預抓上次玩的那關（第一次玩＝釣魚），星星罐快滿就預抓孵蛋
  menuPrefetch = setTimeout(() => { preload(lsGet(K("last_mode"), "fish")); const inJar = save.stars - save.eggs * EGG_STARS; if (inJar >= EGG_STARS - 3) preload("hatch"); }, 2000);
}
function askHome() {                                  // 遊戲中按 🏠：休息選單（繼續／重新開始／回小島），左上是拇指位置，誤觸率高
  if (!mode || $("menu").classList.contains("hidden") === false) { goMenu(); return; }
  clearIdle(); $("confirm").classList.remove("hidden"); say("暫停");
}
// 換人玩：三個存檔位（小熊／小兔／小貓），各有各的貼紙、星星、朋友
function openPlayers() {
  const list = $("playerList"); list.innerHTML = "";
  SLOTS.forEach((p, i) => {
    const n = i + 1, s = slotSummary(n), b = el("button", "player" + (n === slot ? " on" : ""));
    b.appendChild(el("div", "pe", p.e)); b.appendChild(el("div", "pn", p.name)); b.appendChild(el("div", "ps", `📒 ${s.stickers}　⭐ ${s.stars}`));
    b.onclick = () => { play("select"); loadSlot(n); $("players").classList.add("hidden"); goMenu(); guideSay(`${p.name}，歡迎回來！`); };
    list.appendChild(b);
  });
  $("players").classList.remove("hidden");
}
// 翻牌：先選張數（阿葉 10-10：多一倍、兩倍以上的卡牌選難度）
const MATCH_SIZES = [{ n: 8, label: "簡單", stars: "⭐" }, { n: 16, label: "普通", stars: "⭐⭐" }, { n: 24, label: "困難", stars: "⭐⭐⭐" }];
function openMatchPick() {
  const box = $("matchSizes"); box.innerHTML = "";
  for (const s of MATCH_SIZES) {
    const b = el("button", "msize" + (s.n === save.matchSize ? " on" : ""));
    b.appendChild(el("div", "mn", `🃏 ${s.n}`)); b.appendChild(el("div", "ml", s.label)); b.appendChild(el("div", "ms", s.stars));
    b.onclick = () => { play("select"); save.matchSize = s.n; persist(); $("matchPick").classList.add("hidden"); startMode("match"); };
    box.appendChild(b);
  }
  $("matchPick").classList.remove("hidden");
}

// ---------- 綁定 ----------
for (const b of document.querySelectorAll(".mode-card")) {
  b.addEventListener("pointerdown", () => preload(b.dataset.mode));   // 手指一碰就開始抓，放開時多半已經好了
  b.onclick = () => { play("select"); if (b.dataset.mode === "match" && stickerCount() >= MODES.match.need) openMatchPick(); else startMode(b.dataset.mode); };
}
$("homeBtn").onclick = () => { if ($("album").classList.contains("hidden") === false || $("result").classList.contains("hidden") === false) goMenu(); else askHome(); };
$("confirmYes").onclick = () => { $("confirm").classList.add("hidden"); goMenu(); };
$("confirmNo").onclick = () => { $("confirm").classList.add("hidden"); armIdle(); };
$("confirmRestart").onclick = () => { $("confirm").classList.add("hidden"); play("select"); lsSet(K("resume"), null); startMode(mode); };
$("resumeBtn").onclick = () => { const r = getResume(); if (!r) return; play("select"); if (r.mode === "match") startMode("match"); else startMode(r.mode, r); };
$("playerBtn").onclick = () => { play("select"); openPlayers(); };
$("matchPickClose").onclick = () => { play("select"); $("matchPick").classList.add("hidden"); };
// 家長設定：存檔（備份碼／還原／清除重來＝按兩次才清，避免小孩誤觸）
let resetArmed = 0;
function saveMsg(t) { $("saveMsg").textContent = t; }
$("backupBtn").onclick = async () => {
  const code = exportCode(), ta = $("saveCode"); ta.classList.remove("hidden"); ta.value = code; ta.select();
  try { await navigator.clipboard.writeText(code); saveMsg("✅ 備份碼已複製，貼到 LINE 或備忘錄存起來。"); } catch (e) { saveMsg("請長按上面的備份碼，選「拷貝」存起來。"); }
};
$("restoreBtn").onclick = () => {
  const ta = $("saveCode");
  if (ta.classList.contains("hidden") || !ta.value.trim() || ta.value.trim() === exportCode()) { ta.classList.remove("hidden"); ta.value = ""; ta.focus(); saveMsg("把備份碼貼在上面的框框，再按一次「還原」。"); return; }
  const r = importCode(ta.value);
  if (r === "ok") { saveMsg(`✅ 已還原到 ${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}：貼紙 ${stickerCount()} 張、星星 ${save.stars} 顆。`); renderMenu(); }
  else if (r === "fail") { loadSlot(slot); saveMsg("❌ 瀏覽器存不進去（可能是無痕模式或空間滿了），進度沒有改變。"); }
  else saveMsg("❌ 這不是正確的備份碼（要以 ZY1: 開頭）。");
};
$("resetBtn").onclick = () => {
  const b = $("resetBtn");
  if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); b.classList.add("armed"); b.textContent = "⚠️ 再按一次確定"; saveMsg(`會清除 ${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name} 的全部貼紙、星星和朋友。`); setTimeout(() => { b.classList.remove("armed"); b.textContent = "🗑️ 清除重來"; }, 4000); return; }
  resetArmed = 0; clearSlot(); b.classList.remove("armed"); b.textContent = "🗑️ 清除重來"; saveMsg(`已清除，${SLOTS[slot - 1].name}從頭開始。`); renderMenu();
};
$("musicBtn").onclick = toggleMusic; $("musicBtn").classList.toggle("off", !save.music);
$("speakBtn").onclick = useHint;
// 家長設定：提示等待時間
function renderSettings() { for (const b of document.querySelectorAll("#hintOpts button")) b.classList.toggle("on", +b.dataset.v === save.hintWait); }
$("settingsBtn").onclick = () => { play("select"); renderSettings(); $("setSlotName").textContent = `${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}`; $("saveCode").classList.add("hidden"); saveMsg(""); $("settings").classList.remove("hidden"); };
for (const b of document.querySelectorAll("#hintOpts button")) b.onclick = () => { save.hintWait = +b.dataset.v; persist(); play("tap"); renderSettings(); };
$("settingsClose").onclick = () => { play("select"); $("settings").classList.add("hidden"); };
$("againBtn").onclick = () => { play("select"); startMode(mode); };
$("menuBtn").onclick = () => { play("select"); goMenu(); };
$("albumBtn").onclick = () => { play("select"); openAlbum(); };
$("resultAlbumBtn").onclick = () => { play("select"); openAlbum(); };
$("albumBack").onclick = () => { play("select"); goMenu(); };
for (const b of document.querySelectorAll(".jarBtn")) b.onclick = () => { play("select"); tryHatch(); };
$("hatchClose").onclick = () => { hatching = false; $("hatch").classList.add("hidden"); if (mode && !$("result").classList.contains("hidden")) $("hatchHint").classList.add("hidden"); else renderMenu(); };
$("guide").onclick = () => say($("guideText").textContent);
// 第一次觸碰就起音樂。goMenu() 開頁時已經設好 curBgm，但那時瀏覽器擋自動播放 → 這裡要補播（原本 !curBgm 判斷讓它永遠不播）
document.addEventListener("pointerdown", () => { if (!save.music) return; if (!curBgm) playBgm("island"); else if (curBgm.paused) curBgm.play().catch(() => {}); }, { once: true });
for (const ev of ["touchend", "click"]) document.addEventListener(ev, unlockAudio, { capture: true, once: true });   // iOS：第一次點擊解鎖語音與音效
window.addEventListener("resize", () => { if (mode === "fish" && !locked) buildFish(round[idx]); if (mode === "match" && mq) layoutBoard(mq.pairs * 2); if (mode === "whack") layoutField(); if (mode === "frog") relayoutFrog(); });
// 開頁：讀取畫面蓋著，等貓頭鷹＋3D 小島（小島最多等 8 秒）；3D 模式選單背景被小島蓋住 → 退回卡片選單時才等背景圖
(async () => {
  const cap = p => Promise.race([p, new Promise(r => setTimeout(r, 6000))]), h = initHub();
  await Promise.all([h, cap(loadImg("guide_owl"))]);
  if (!hub) await cap(Promise.all(assetsOf("menu").map(loadImg)));
  goMenu(); showLoading(false); $("startGate").classList.remove("hidden");
})();
$("startBtn").onclick = () => {                         // 開始玩：這一下點擊同時解鎖聲音、開音樂、貓頭鷹打招呼
  $("startGate").classList.add("hidden"); play("select");
  if (save.music && curBgm) curBgm.play().catch(() => {});
  setTimeout(() => say($("guideText").textContent), 300);
};
if (location.search.includes("debug")) window.__zy = { renderZ, parseZ, WORDS, stickerNode, zMissing, get wq() { return wq; }, get fq() { return fq; }, get idx() { return idx; }, get results() { return results; }, get wrong() { return wrongThisQ; }, get mode() { return mode; }, get round() { return round; }, get curOpts() { return curOpts; }, toneVariant, pickDistractors, zToStr };   // 測試用（tools/zy-test）
