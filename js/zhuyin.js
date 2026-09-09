// ===================== 注音小島（注音小遊戲 v3）=====================
// 目標玩家：5 歲、已會拼讀注音的小孩。純手指點、無命制。
// 六個模式：釣魚 / 點餐 / 積木 / 尋寶 / 翻牌 / 聲調氣球。長期動力：貼紙圖鑑（每個詞一張貼紙）＋星星罐孵蛋（解鎖朋友）。
// 設計依據：櫻木花道（遊戲設計）＋寧次（UI/UX）2026-09-09 審查報告；規格見 memory project-zhuyin-game.md
import { WORDS, PHRASES, CATS, FRIENDS } from "./zhuyin-words.js";

const TONES = ["", "ˊ", "ˇ", "ˋ", "˙"];
const TONE_TILE = ["", "ˊ", "ˇ", "ˋ", "˙"];        // 積木盤上的聲調：一聲＝空白積木（阿葉要求）
const MODES = {                                     // 每模式：題數、解鎖需要的貼紙數、嚮導開場語、背景音樂
  fish:  { rounds: 8, need: 0,  intro: "聽聲音，點對的魚！",         bgm: "island" },
  order: { rounds: 8, need: 0,  intro: "看注音，把東西拿給客人！",     bgm: "island" },
  build: { rounds: 6, need: 0,  intro: "把注音積木放進格子裡！",       bgm: "calm" },
  hunt:  { rounds: 8, need: 5,  intro: "看注音，找找東西在哪裡！",     bgm: "island" },
  match: { rounds: 1, need: 10, intro: "翻翻看，找到一樣的！",         bgm: "calm" },
  tone:  { rounds: 8, need: 15, intro: "聽聲音，戳對的氣球！",         bgm: "island" },
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
    const col = document.createElement("div"); col.className = "syl" + (s.sym.length === 1 ? " one" : "");
    for (const ch of s.sym) { const b = document.createElement("b"); b.textContent = ch; col.appendChild(b); }
    if (s.tone) { const t = document.createElement("span"); t.className = "tone" + (s.tone === 4 ? " light" : ""); t.textContent = TONES[s.tone]; col.appendChild(t); }
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
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// ---------- 存檔（全部 localStorage）----------
const save = {
  stickers: lsGet("zy_stickers", {}),   // { 國字: 1 } 第一次一次答對就貼上
  stars: lsGet("zy_stars", 0),          // 累積星星（罐子）
  eggs: lsGet("zy_eggs", 0),            // 孵過幾顆蛋 → FRIENDS[4 + eggs] 以前都解鎖
  music: lsGet("zy_music", 1),
};
const persist = () => { lsSet("zy_stickers", save.stickers); lsSet("zy_stars", save.stars); lsSet("zy_eggs", save.eggs); lsSet("zy_music", save.music); };
const stickerCount = () => Object.keys(save.stickers).length;
const friends = () => FRIENDS.slice(0, Math.min(FRIENDS.length, 4 + save.eggs));

// ---------- 音效 / 音樂 / 語音 ----------
const SFX = {}; for (const n of ["ok", "ng", "tap", "select", "win", "pop", "flip", "sticker"]) { SFX[n] = new Audio(`MUSIC/zy_${n}.mp3`); }
SFX.party = new Audio("MUSIC/zy_bgm_party.mp3"); SFX.party.volume = 0.45;   // 結算用 Suno 生的 7 秒慶祝 jingle
const BGM = { island: new Audio("MUSIC/zy_bgm_island.mp3"), calm: new Audio("MUSIC/zy_bgm_calm.mp3") };
for (const b of Object.values(BGM)) { b.loop = true; b.volume = 0.3; }
let curBgm = null, ducked = false;
function play(name, rate = 1) { const a = SFX[name]; if (!a) return; try { a.currentTime = 0; a.playbackRate = rate; a.play().catch(() => {}); } catch (e) {} }
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
function queueSay(text) {                              // 等目前這句唸完再唸（稱讚不能蓋掉學習詞）
  let tries = 0; const t = setInterval(() => { tries++; if (!("speechSynthesis" in window) || !speechSynthesis.speaking || tries > 25) { clearInterval(t); say(text); } }, 200);
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

// ---------- 畫面切換 / 嚮導 ----------
let mode = null, round = [], idx = 0, results = [], locked = false, wrongThisQ = 0, combo = 0, earned = [], idleTimer = null, roundStars = 0, qToken = 0;
function showScreen(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== id);
  const inGame = id in MODES; $("speakBtn").classList.toggle("hidden", !inGame || id === "match");
  $("progress").classList.toggle("hidden", !inGame || id === "match");
  $("guide").classList.toggle("hidden", id !== "menu");
}
function guideSay(text, speak = true) { $("guideText").textContent = text; if (speak) say(text); }
function armIdle() {                                   // 8 秒沒動作 → 重唸題目＋喇叭鈕脈動
  clearIdle(); idleTimer = setTimeout(() => { if (locked || !mode) return; speakPrompt(); $("speakBtn").classList.add("pulse"); setTimeout(() => $("speakBtn").classList.remove("pulse"), 2500); armIdle(); }, mode === "hunt" ? 12000 : 8000);
}
function clearIdle() { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; }
function speakPrompt() { const q = round[idx]; if (!q) return; say(mode === "order" ? "我要" + q.word.h : mode === "hunt" ? "找一找，" + q.word.h : q.word.h); }
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
function toneVariant(ts, exclude = [], noZero = false) {   // 改一個音節的聲調（不含輕聲；noZero=假詞不用一聲，否則畫面上沒符號可提示）
  for (let tries = 0; tries < 20; tries++) {
    const i = rnd(ts.length), alt = ts.map(s => ({ ...s })); let nt; do { nt = noZero ? 1 + rnd(3) : rnd(4); } while (nt === alt[i].tone); alt[i].tone = nt; alt.diffAt = i;
    const key = zToStr(alt); if (!exclude.includes(key)) return alt;
  }
  return ts.map(s => ({ ...s }));
}
// 題序：由短到長；優先「還沒貼紙」的詞（每回合都有新貼紙可拿）
function makeRound(pool, m) {
  const key = new Map(pool.map(w => [w, (save.stickers[w.h] ? 1 : 0) + Math.random()]));   // 沒貼紙的排前面（key 只算一次，排序才穩）
  const bySyl = k => pool.filter(w => parseZ(w.z).length === k).sort((a, b) => key.get(a) - key.get(b));
  const plan = m === "build" ? [[1, 3], [2, 3]] : m === "tone" ? [[1, 5], [2, 3]] : [[1, 3], [2, 4], [3, 1]];
  let seq = []; for (const [k, c] of plan) seq.push(...bySyl(k).slice(0, c));
  const n = MODES[m].rounds; while (seq.length < n) seq.push(pick(pool)); seq = seq.slice(0, n);
  return seq.map((w, i) => ({ word: w, level: i < 3 ? 1 : i < n - 2 ? 2 : 3 }));
}

// ---------- 回合流程 ----------
function startMode(m) {
  if (stickerCount() < MODES[m].need) { play("select"); guideSay(`再收集 ${MODES[m].need - stickerCount()} 張貼紙就可以玩囉！`); return; }
  mode = m; idx = 0; results = []; combo = 0; earned = []; locked = false; wrongThisQ = 0;
  const pool = m === "order" ? WORDS.filter(w => w.c === "food") : WORDS;
  round = m === "match" ? [] : makeRound(pool, m);
  playBgm(MODES[m].bgm); showScreen(m);
  const introKey = "zy_intro_" + m;
  if (!lsGet(introKey, 0)) { lsSet(introKey, 1); say(MODES[m].intro, 0.85, () => setTimeout(nextQ, 250)); } else setTimeout(nextQ, 300);
}
function nextQ() {
  clearIdle();
  if (mode !== "match" && idx >= MODES[mode].rounds) return showResult();
  wrongThisQ = 0; locked = false; drawProgress();
  ({ fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone })[mode](round[idx]);
  armIdle();
}
// 答對：金星（一次對）/ 銀星（錯過再對）；連對加速音效＋更多星星；每 3 連對隨機一句稱讚
function correct(target, onDone, { tolerate = 0 } = {}) {
  locked = true; clearIdle();
  const gold = wrongThisQ <= tolerate; results[idx] = gold ? "gold" : "silver";
  if (gold) { combo++; const w = round[idx]?.word; if (w && !save.stickers[w.h] && !PHRASES.includes(w)) { save.stickers[w.h] = 1; earned.push(w); persist(); } } else combo = 0;
  play("ok", 1 + Math.min(combo, 3) * 0.08); burst(target, 10 + Math.min(combo, 4) * 5);
  if (combo > 0 && combo % 3 === 0) setTimeout(() => queueSay(pick(PRAISE)), 800);
  if (onDone) onDone(); drawProgress();
  const token = ++qToken;                              // 這一題的代號：舊題的計時器不能跳過新題
  const adv = () => { document.removeEventListener("pointerdown", adv, true); if (token !== qToken) return; qToken++; idx++; nextQ(); };
  setTimeout(() => { if (locked && token === qToken) document.addEventListener("pointerdown", adv, true); }, 500);   // 鎖定中再點一下＝直接下一題
  setTimeout(() => { if (locked && token === qToken) adv(); }, 1800);
}
function wrong(elm) {
  wrongThisQ++; combo = 0; play("ng");
  elm.classList.remove("ng"); void elm.offsetWidth; elm.classList.add("ng"); setTimeout(() => elm.classList.add("dim"), 400);
  armIdle();
}

// ---------- 釣魚 ----------
function buildFish(q) {
  const p = $("fishPrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const pond = $("pond"); pond.innerHTML = "";
  const opts = makeOptions(q.word, q.level, WORDS), W = pond.clientWidth, H = pond.clientHeight, portrait = H > W * 0.9;
  const vm = Math.min(innerWidth, innerHeight) / 100, bw = (portrait ? 40 : 36) * vm, bh = bw / 1.5;
  opts.forEach((o, i) => {
    const b = el("button", "fishBtn"); const z = renderZ(o.syls), maxLen = Math.max(...o.syls.map(x => x.sym.length));
    z.style.fontSize = (o.syls.length >= 3 ? 3.8 : o.syls.length === 2 ? (maxLen >= 3 ? 4.2 : 4.8) : (maxLen >= 3 ? 5 : 6)) + "vmin"; b.appendChild(z);
    let x, y; if (portrait) { x = (i % 2) * (W / 2) + (W / 2 - bw) / 2; y = Math.floor(i / 2) * (H / 2) + (H / 2 - bh) / 2; } else { x = i * (W / 4) + (W / 4 - bw) / 2; y = (H - bh) / 2 + (i % 2 ? 0.1 : -0.1) * H; }
    b.style.left = x + "px"; b.style.top = y + "px";
    b.onclick = () => {
      if (locked) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); if (o.toneFake) { const d = o.syls.diffAt ?? 0, t = b.querySelectorAll(".syl")[d]?.querySelector(".tone"); if (t) t.classList.add("hint"); say(q.word.h); } if (wrongThisQ >= 2) hintCorrect(pond, ".fishBtn", opts); }
    };
    pond.appendChild(b);
  });
  say(q.word.h);
}
function hintCorrect(container, sel, opts) {         // 第二次錯：正解輕輕搖晃當提示
  const nodes = [...container.querySelectorAll(sel)]; const i = opts.findIndex(o => o.ok); if (nodes[i]) { nodes[i].classList.add("wiggle"); setTimeout(() => nodes[i].classList.remove("wiggle"), 1500); }
}

// ---------- 點餐（真正練「看注音→懂意思」：不自動唸，錯 1 次或閒置才唸）----------
function buildOrder(q) {
  const cust = $("customer"); cust.src = `IMAGE/zhuyin/${pick(friends()).id}.png`; cust.className = "customer";
  const bubble = $("bubble"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z)));
  const shelf = $("shelf"); shelf.innerHTML = "";
  const foods = WORDS.filter(w => w.c === "food"), opts = makeOptions(q.word, Math.min(q.level, 2), foods).filter(o => o.word);
  for (const o of opts) {
    const it = el("button", "item"); it.textContent = o.word.e; it.appendChild(el("div", "han", o.word.h));
    it.onclick = () => {
      if (locked) return;
      if (o.ok) { it.classList.add("ok"); correct(it, () => { cust.classList.add("happy"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z), q.word.h)); say(q.word.h + "，謝謝你！"); }); }
      else { wrong(it); cust.classList.remove("no"); void cust.offsetWidth; cust.classList.add("no"); say("我要" + q.word.h); if (wrongThisQ >= 2) hintCorrect(shelf, ".item", opts); }
    };
    shelf.appendChild(it);
  }
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
  [0, 1, 2, 3, 4].forEach(t => { const b = el("button", "tile toneTile", TONE_TILE[t]); b.dataset.v = t; b.onclick = () => placeTone(b); toneRow.appendChild(b); });
  markCur(); say(q.word.h);
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
    if (wrongThisQ >= 2) { const want = bq.syls[empties[0][0]].sym[empties[0][1]]; const tb = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === want); if (tb) { tb.classList.add("wiggle"); setTimeout(() => tb.classList.remove("wiggle"), 1500); } }
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
  if (v === bq.syls[i].tone) { ts.dataset.v = v; ts.textContent = TONE_TILE[v]; ts.classList.remove("bad"); ts.classList.add("good"); play("tap", 1.2); }
  else { wrongThisQ++; combo = 0; play("ng"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); ts.classList.remove("bad"); void ts.offsetWidth; ts.classList.add("bad");
    if (wrongThisQ >= 2) { const tb = [...document.querySelectorAll("#toneRow .tile")].find(t => +t.dataset.v === bq.syls[i].tone); if (tb) { tb.classList.add("wiggle"); setTimeout(() => tb.classList.remove("wiggle"), 1500); } } }
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
      else { wrong(b); if (wrongThisQ >= 2) { say(target.h); hintCorrect(scene, ".obj", objs); } }
    };
    scene.appendChild(b);
  });
}

// ---------- 翻牌配對（4 對：注音卡 ↔ 圖＋國字卡）----------
let mq = null;
function buildMatch() {
  const board = $("board"); board.innerHTML = "";
  const key = new Map(WORDS.map(w => [w, (save.stickers[w.h] ? 1 : 0) + Math.random()]));
  const words = WORDS.filter(w => parseZ(w.z).length <= 2).sort((a, b) => key.get(a) - key.get(b)).slice(0, 4);   // 優先沒貼紙的詞
  const cards = shuffle(words.flatMap(w => [{ w, kind: "z" }, { w, kind: "e" }]));
  mq = { open: [], matched: 0, miss: 0, words, busy: false };
  for (const c of cards) {
    const card = el("button", "card"); const inner = el("div", "inner"); const back = el("div", "face back"); const front = el("div", "face front");
    if (c.kind === "z") { const z = renderZ(parseZ(c.w.z)); front.appendChild(z); } else { front.textContent = c.w.e; front.appendChild(el("div", "han", c.w.h)); }
    inner.appendChild(back); inner.appendChild(front); card.appendChild(inner); card._c = c;
    card.onclick = () => flip(card); board.appendChild(card);
  }
}
function flip(card) {
  if (mq.busy || card.classList.contains("up") || card.classList.contains("done")) return;
  card.classList.add("up"); play("flip"); mq.open.push(card); armIdle();
  if (mq.open.length < 2) return;
  const [a, b] = mq.open; mq.busy = true;
  if (a._c.w === b._c.w && a._c.kind !== b._c.kind) {
    setTimeout(() => { a.classList.add("done"); b.classList.add("done"); play("ok", 1 + mq.matched * 0.08); burst(b, 12); say(a._c.w.h); mq.matched++; mq.open = []; mq.busy = false;
      const w = a._c.w; if (!save.stickers[w.h]) { save.stickers[w.h] = 1; earned.push(w); persist(); }   // 配對成功＝讀對了，直接貼貼紙
      if (mq.matched === 4) finishMatch(); }, 350);
  } else { mq.miss++; setTimeout(() => { a.classList.remove("up"); b.classList.remove("up"); play("ng"); mq.open = []; mq.busy = false; }, 900); }
}
function finishMatch() {
  clearIdle(); locked = true; results = ["gold"]; combo = 0;
  results[0] = mq.miss <= 4 ? "gold" : "silver";
  persist(); setTimeout(() => say("全部找到了！"), 900); setTimeout(showResult, 1800);
}

// ---------- 聲調氣球（同一組符號、四種聲調，戳對的爆）----------
function buildTone(q) {
  const p = $("tonePrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const sky = $("sky"); sky.innerHTML = "";
  const ts = parseZ(q.word.z), opts = [{ syls: ts, ok: true }], used = [zToStr(ts)];
  while (opts.length < 4) { const alt = toneVariant(ts, used); const k = zToStr(alt); if (used.includes(k)) break; used.push(k); opts.push({ syls: alt, ok: false }); }
  shuffle(opts).forEach((o, i) => {
    const b = el("button", "balloon c" + i); const z = renderZ(o.syls); const ml = Math.max(...ts.map(x => x.sym.length)); z.style.fontSize = (ts.length >= 2 ? (ml >= 3 ? 4.4 : 5.5) : (ml >= 3 ? 5.6 : 7.5)) + "vmin"; b.appendChild(z);   // 三符號音節縮小才塞得進白圓
    b.style.left = (4 + i * 24) + "%"; b.style.animationDelay = (-i * 0.7) + "s";
    b.onclick = () => {
      if (locked) return;
      if (o.ok) { b.classList.add("ok"); play("pop"); correct(b, () => { p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); say(q.word.h); if (wrongThisQ >= 2) hintCorrect(sky, ".balloon", opts); }
    };
    sky.appendChild(b);
  });
  say(q.word.h);
}

// ---------- 結算：先「啪」貼新貼紙，再給星，星星罐滿了孵蛋 ----------
function showResult() {
  clearIdle(); locked = false;
  const n = MODES[mode].rounds, golds = results.filter(r => r === "gold").length, any = results.filter(Boolean).length;
  roundStars = n === 1 ? (results[0] === "gold" ? 3 : 2) : golds >= n - 1 ? 3 : golds >= Math.ceil(n / 2) ? 2 : 1;
  showScreen("result"); play("party"); duck(true); setTimeout(() => duck(false), 7000); confetti();
  $("resultStars").innerHTML = ""; $("resultStickers").innerHTML = ""; $("resultText").textContent = mode === "match" ? "全部配對成功！" : mode === "fish" ? `釣到 ${any} 條魚！` : mode === "hunt" ? `找到 ${any} 個寶物！` : mode === "tone" ? `戳破 ${any} 顆氣球！` : `完成 ${any} 題！`;
  for (let i = 0; i < 3; i++) { const s = el("span", "star" + (i < roundStars ? " on" : ""), i < roundStars ? "⭐" : "☆"); s.style.animationDelay = (0.3 + i * 0.3) + "s"; $("resultStars").appendChild(s); }
  earned.forEach((w, i) => { const st = stickerNode(w, true); st.style.animationDelay = (1.2 + i * 0.35) + "s"; $("resultStickers").appendChild(st); setTimeout(() => play("sticker"), 1200 + i * 350); });
  if (earned.length) setTimeout(() => say(`拿到 ${earned.length} 張新貼紙！`), 1300);
  save.stars += roundStars; persist(); updateJar();
  $("hatchHint").classList.toggle("hidden", save.stars < (save.eggs + 1) * EGG_STARS || 4 + save.eggs >= FRIENDS.length);
}
function stickerNode(w, fresh) { const s = el("div", "sticker" + (fresh ? " fresh" : "")); s.appendChild(el("div", "em", w.e)); const z = renderZ(parseZ(w.z)); z.style.fontSize = "3vmin"; s.appendChild(z); s.appendChild(el("div", "hz", w.h)); return s; }

// ---------- 星星罐 / 孵蛋 ----------
function updateJar() {
  const inJar = save.stars - save.eggs * EGG_STARS, canHatch = inJar >= EGG_STARS && 4 + save.eggs < FRIENDS.length;
  for (const j of document.querySelectorAll(".jarFill")) j.style.height = Math.min(100, inJar / EGG_STARS * 100) + "%";
  for (const t of document.querySelectorAll(".jarText")) t.textContent = `${Math.min(inJar, EGG_STARS)}/${EGG_STARS}`;
  for (const b of document.querySelectorAll(".jarBtn")) b.classList.toggle("ready", canHatch);
}
function tryHatch() {
  const inJar = save.stars - save.eggs * EGG_STARS;
  if (inJar < EGG_STARS) { guideSay(`再 ${EGG_STARS - inJar} 顆星星就可以孵蛋囉！`); return; }
  if (4 + save.eggs >= FRIENDS.length) { guideSay("朋友都孵出來了，好厲害！"); return; }
  const f = FRIENDS[4 + save.eggs]; save.eggs++; persist(); updateJar();
  const ov = $("hatch"); ov.classList.remove("hidden"); $("hatchEgg").className = "hatchEgg shake"; $("hatchFriend").classList.add("hidden"); $("hatchName").textContent = ""; $("hatchClose").classList.add("hidden");
  play("tap"); say("蛋要孵出來了！");
  setTimeout(() => { $("hatchEgg").className = "hatchEgg gone"; const img = $("hatchFriend"); img.src = `IMAGE/zhuyin/${f.id}.png`; img.classList.remove("hidden"); $("hatchName").textContent = f.name + "來了！"; $("hatchClose").classList.remove("hidden"); play("win"); confetti(40); say(f.name + "來了，會來店裡買東西喔！"); }, 2200);
}

// ---------- 貼紙圖鑑 ----------
function openAlbum(cat) {
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
    card.classList.toggle("locked", lockedM); const lk = card.querySelector(".lock"); if (lk) lk.textContent = lockedM ? `🔒 ${need} 張貼紙` : "";
  }
  $("menuStickers").textContent = `${stickerCount()}`; updateJar();
  const total = stickerCount(); guideSay(total === 0 ? "你好！選一個遊戲來玩吧！" : total < 5 ? "再收集幾張貼紙，就能開新遊戲喔！" : pick(["今天要玩哪一個呢？", "貼紙越來越多了！", "來釣魚還是去尋寶？"]), false);
}
function goMenu() { mode = null; clearIdle(); locked = false; showScreen("menu"); playBgm("island"); renderMenu(); }
function askHome() {                                  // 遊戲中按 🏠 要確認（左上是拇指位置，誤觸率高）
  if (!mode || $("menu").classList.contains("hidden") === false) { goMenu(); return; }
  $("confirm").classList.remove("hidden"); say("要回去嗎？");
}

// ---------- 綁定 ----------
for (const b of document.querySelectorAll(".mode-card")) b.onclick = () => { play("select"); startMode(b.dataset.mode); };
$("homeBtn").onclick = () => { if ($("album").classList.contains("hidden") === false || $("result").classList.contains("hidden") === false) goMenu(); else askHome(); };
$("confirmYes").onclick = () => { $("confirm").classList.add("hidden"); goMenu(); };
$("confirmNo").onclick = () => { $("confirm").classList.add("hidden"); armIdle(); };
$("musicBtn").onclick = toggleMusic; $("musicBtn").classList.toggle("off", !save.music);
$("speakBtn").onclick = () => { $("speakBtn").classList.remove("pulse"); speakPrompt(); };
$("againBtn").onclick = () => { play("select"); startMode(mode); };
$("menuBtn").onclick = () => { play("select"); goMenu(); };
$("albumBtn").onclick = () => { play("select"); openAlbum(); };
$("resultAlbumBtn").onclick = () => { play("select"); openAlbum(); };
$("albumBack").onclick = () => { play("select"); goMenu(); };
for (const b of document.querySelectorAll(".jarBtn")) b.onclick = () => { play("select"); tryHatch(); };
$("hatchClose").onclick = () => { $("hatch").classList.add("hidden"); if (mode && !$("result").classList.contains("hidden")) $("hatchHint").classList.add("hidden"); else renderMenu(); };
$("guide").onclick = () => say($("guideText").textContent);
document.addEventListener("pointerdown", () => { if (!curBgm) playBgm("island"); }, { once: true });   // 第一次觸碰就起音樂
window.addEventListener("resize", () => { if (mode === "fish" && !locked) buildFish(round[idx]); });
goMenu();
