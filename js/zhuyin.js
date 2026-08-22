// ===================== 注音小遊戲（釣魚 + 點餐）=====================
// 目標玩家：5 歲、已會拼讀的小孩。純手指點、無命制、10 題一回合給星星。
// 詞庫：h=國字、z=注音(音節空白分隔、聲調符號在音節尾、一聲不寫)、e=表情圖、c=類別(food 可當點餐商品)

const WORDS = [
  // 動物
  { h: "貓", z: "ㄇㄠ", e: "🐱", c: "animal" }, { h: "狗", z: "ㄍㄡˇ", e: "🐶", c: "animal" },
  { h: "魚", z: "ㄩˊ", e: "🐟", c: "animal" }, { h: "鳥", z: "ㄋㄧㄠˇ", e: "🐦", c: "animal" },
  { h: "牛", z: "ㄋㄧㄡˊ", e: "🐮", c: "animal" }, { h: "馬", z: "ㄇㄚˇ", e: "🐴", c: "animal" },
  { h: "羊", z: "ㄧㄤˊ", e: "🐑", c: "animal" }, { h: "豬", z: "ㄓㄨ", e: "🐷", c: "animal" },
  { h: "雞", z: "ㄐㄧ", e: "🐔", c: "animal" }, { h: "鴨", z: "ㄧㄚ", e: "🦆", c: "animal" },
  { h: "兔子", z: "ㄊㄨˋ ㄗ˙", e: "🐰", c: "animal" }, { h: "老虎", z: "ㄌㄠˇ ㄏㄨˇ", e: "🐯", c: "animal" },
  { h: "獅子", z: "ㄕ ㄗ˙", e: "🦁", c: "animal" }, { h: "大象", z: "ㄉㄚˋ ㄒㄧㄤˋ", e: "🐘", c: "animal" },
  { h: "猴子", z: "ㄏㄡˊ ㄗ˙", e: "🐵", c: "animal" }, { h: "熊", z: "ㄒㄩㄥˊ", e: "🐻", c: "animal" },
  { h: "蛇", z: "ㄕㄜˊ", e: "🐍", c: "animal" }, { h: "青蛙", z: "ㄑㄧㄥ ㄨㄚ", e: "🐸", c: "animal" },
  { h: "蝴蝶", z: "ㄏㄨˊ ㄉㄧㄝˊ", e: "🦋", c: "animal" }, { h: "蜜蜂", z: "ㄇㄧˋ ㄈㄥ", e: "🐝", c: "animal" },
  { h: "企鵝", z: "ㄑㄧˋ ㄜˊ", e: "🐧", c: "animal" }, { h: "烏龜", z: "ㄨ ㄍㄨㄟ", e: "🐢", c: "animal" },
  // 食物（點餐商品）
  { h: "蘋果", z: "ㄆㄧㄥˊ ㄍㄨㄛˇ", e: "🍎", c: "food" }, { h: "香蕉", z: "ㄒㄧㄤ ㄐㄧㄠ", e: "🍌", c: "food" },
  { h: "西瓜", z: "ㄒㄧ ㄍㄨㄚ", e: "🍉", c: "food" }, { h: "草莓", z: "ㄘㄠˇ ㄇㄟˊ", e: "🍓", c: "food" },
  { h: "葡萄", z: "ㄆㄨˊ ㄊㄠˊ", e: "🍇", c: "food" }, { h: "橘子", z: "ㄐㄩˊ ㄗ˙", e: "🍊", c: "food" },
  { h: "蛋糕", z: "ㄉㄢˋ ㄍㄠ", e: "🍰", c: "food" }, { h: "麵包", z: "ㄇㄧㄢˋ ㄅㄠ", e: "🍞", c: "food" },
  { h: "牛奶", z: "ㄋㄧㄡˊ ㄋㄞˇ", e: "🥛", c: "food" }, { h: "餅乾", z: "ㄅㄧㄥˇ ㄍㄢ", e: "🍪", c: "food" },
  { h: "糖果", z: "ㄊㄤˊ ㄍㄨㄛˇ", e: "🍬", c: "food" }, { h: "冰淇淋", z: "ㄅㄧㄥ ㄑㄧˊ ㄌㄧㄣˊ", e: "🍦", c: "food" },
  { h: "飯", z: "ㄈㄢˋ", e: "🍚", c: "food" }, { h: "麵", z: "ㄇㄧㄢˋ", e: "🍜", c: "food" },
  { h: "蛋", z: "ㄉㄢˋ", e: "🥚", c: "food" }, { h: "水", z: "ㄕㄨㄟˇ", e: "💧", c: "food" },
  { h: "茶", z: "ㄔㄚˊ", e: "🍵", c: "food" }, { h: "披薩", z: "ㄆㄧ ㄙㄚˋ", e: "🍕", c: "food" },
  { h: "漢堡", z: "ㄏㄢˋ ㄅㄠˇ", e: "🍔", c: "food" }, { h: "壽司", z: "ㄕㄡˋ ㄙ", e: "🍣", c: "food" },
  { h: "玉米", z: "ㄩˋ ㄇㄧˇ", e: "🌽", c: "food" }, { h: "紅蘿蔔", z: "ㄏㄨㄥˊ ㄌㄨㄛˊ ㄅㄛ˙", e: "🥕", c: "food" },
  { h: "熱狗", z: "ㄖㄜˋ ㄍㄡˇ", e: "🌭", c: "food" }, { h: "水餃", z: "ㄕㄨㄟˇ ㄐㄧㄠˇ", e: "🥟", c: "food" },
  { h: "果汁", z: "ㄍㄨㄛˇ ㄓ", e: "🧃", c: "food" }, { h: "甜甜圈", z: "ㄊㄧㄢˊ ㄊㄧㄢˊ ㄑㄩㄢ", e: "🍩", c: "food" },
  // 東西 / 自然
  { h: "車子", z: "ㄔㄜ ㄗ˙", e: "🚗", c: "thing" }, { h: "飛機", z: "ㄈㄟ ㄐㄧ", e: "✈️", c: "thing" },
  { h: "船", z: "ㄔㄨㄢˊ", e: "⛵", c: "thing" }, { h: "火車", z: "ㄏㄨㄛˇ ㄔㄜ", e: "🚂", c: "thing" },
  { h: "球", z: "ㄑㄧㄡˊ", e: "⚽", c: "thing" }, { h: "書", z: "ㄕㄨ", e: "📖", c: "thing" },
  { h: "花", z: "ㄏㄨㄚ", e: "🌸", c: "thing" }, { h: "樹", z: "ㄕㄨˋ", e: "🌳", c: "thing" },
  { h: "太陽", z: "ㄊㄞˋ ㄧㄤˊ", e: "☀️", c: "thing" }, { h: "月亮", z: "ㄩㄝˋ ㄌㄧㄤˋ", e: "🌙", c: "thing" },
  { h: "星星", z: "ㄒㄧㄥ ㄒㄧㄥ", e: "⭐", c: "thing" }, { h: "雨", z: "ㄩˇ", e: "🌧️", c: "thing" },
  { h: "雪", z: "ㄒㄩㄝˇ", e: "❄️", c: "thing" }, { h: "房子", z: "ㄈㄤˊ ㄗ˙", e: "🏠", c: "thing" },
  { h: "帽子", z: "ㄇㄠˋ ㄗ˙", e: "🧢", c: "thing" }, { h: "鞋子", z: "ㄒㄧㄝˊ ㄗ˙", e: "👟", c: "thing" },
  { h: "手", z: "ㄕㄡˇ", e: "✋", c: "thing" }, { h: "眼睛", z: "ㄧㄢˇ ㄐㄧㄥ", e: "👀", c: "thing" },
  { h: "氣球", z: "ㄑㄧˋ ㄑㄧㄡˊ", e: "🎈", c: "thing" }, { h: "禮物", z: "ㄌㄧˇ ㄨˋ", e: "🎁", c: "thing" },
  { h: "鑰匙", z: "ㄧㄠˋ ㄕ˙", e: "🔑", c: "thing" }, { h: "雨傘", z: "ㄩˇ ㄙㄢˇ", e: "☂️", c: "thing" },
  { h: "電話", z: "ㄉㄧㄢˋ ㄏㄨㄚˋ", e: "📞", c: "thing" }, { h: "時鐘", z: "ㄕˊ ㄓㄨㄥ", e: "⏰", c: "thing" },
];
const TONES = ["", "ˊ", "ˇ", "ˋ", "˙"];
const ROUNDS = 10;
const CUSTOMERS = ["🐻", "🐰", "🐱", "🐶", "🐼", "🦊", "🐸", "🐨"];

// ---------- 注音解析與繪製 ----------
// "ㄆㄧㄥˊ ㄍㄨㄛˇ" → [{sym:"ㄆㄧㄥ", tone:2}, {sym:"ㄍㄨㄛ", tone:3}]
function parseZ(z) {
  return z.split(" ").map(s => {
    const last = s[s.length - 1], t = TONES.indexOf(last);
    return t > 0 ? { sym: s.slice(0, -1), tone: t } : { sym: s, tone: 0 };
  });
}
function zToStr(syls) { return syls.map(s => s.sym + TONES[s.tone]).join(" "); }
// 畫成直排 DOM：每音節一欄，聲調在右側（輕聲 ˙ 在頂上）；傳 han 時每欄下方加對應國字
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

// 音效：沿用現有遊戲的 mp3；TTS 用瀏覽器內建 zh-TW 語音唸國字（iOS 需在使用者點擊後才肯出聲）
const sfxOk = new Audio("MUSIC/sfx_correct.mp3"), sfxNg = new Audio("MUSIC/sfx_hurt.mp3");
function play(a) { try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {} }
let zhVoice = null;
function loadVoice() {
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
function say(text, rate = 0.85) {
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "zh-TW"; u.rate = rate; if (zhVoice) u.voice = zhVoice;
    speechSynthesis.speak(u);
  } catch (e) {}
}
// 星星噴發特效（在被點的元素中心）
function burst(el, emoji = "⭐") {
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, fx = $("fx");
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("span"); s.textContent = emoji;
    const a = (i / 10) * Math.PI * 2, d = 12 + rnd(10);
    s.style.left = cx + "px"; s.style.top = cy + "px";
    s.style.setProperty("--dx", Math.cos(a) * d + "vmin"); s.style.setProperty("--dy", Math.sin(a) * d + "vmin");
    fx.appendChild(s); setTimeout(() => s.remove(), 1000);
  }
}
function showScreen(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== id);
  $("speakBtn").classList.toggle("hidden", id !== "fish" && id !== "order");
}
function drawProgress(el, results) {
  el.innerHTML = "";
  for (let i = 0; i < ROUNDS; i++) { const s = document.createElement("span"); if (results[i] === true) s.className = "ok"; else if (results[i] === false) s.className = "ng"; el.appendChild(s); }
}

// ---------- 出題：選干擾項 ----------
// level 1：隨便挑音節數相同的別詞；level 2：優先同聲母/同韻母的相近詞；level 3：混入「同音不同聲調」的假詞（專練聲調）
function makeOptions(target, level, pool) {
  const ts = parseZ(target.z), n = ts.length;
  const same = pool.filter(w => w !== target && parseZ(w.z).length === n);
  const near = same.filter(w => { const s = parseZ(w.z); return s.some((x, i) => x.sym[0] === ts[i].sym[0] || x.sym.slice(-1) === ts[i].sym.slice(-1)); });
  const opts = [{ syls: ts, word: target, ok: true }];
  const used = new Set([target.z]);
  if (level >= 3) {                                   // 聲調假詞：改一個音節的聲調
    const i = rnd(n), alt = ts.map(s => ({ ...s }));
    let nt; do { nt = 1 + rnd(3); } while (nt === alt[i].tone); alt[i].tone = nt;
    if (!used.has(zToStr(alt))) { used.add(zToStr(alt)); opts.push({ syls: alt, word: null, ok: false }); }
  }
  const src = shuffle([...(level >= 2 && near.length >= 2 ? near : same)]);
  for (const w of src) { if (opts.length >= 4) break; if (used.has(w.z)) continue; used.add(w.z); opts.push({ syls: parseZ(w.z), word: w, ok: false }); }
  for (const w of shuffle([...pool])) { if (opts.length >= 4) break; if (w === target || used.has(w.z)) continue; used.add(w.z); opts.push({ syls: parseZ(w.z), word: w, ok: false }); }
  return shuffle(opts);
}
// 一回合的題目序列：由短到長、難度隨題號上升
function makeRound(pool) {
  const bySyl = k => shuffle(pool.filter(w => parseZ(w.z).length === k));
  const seq = [...bySyl(1).slice(0, 3), ...bySyl(2).slice(0, 5), ...bySyl(3).slice(0, 2)];
  while (seq.length < ROUNDS) seq.push(pick(pool));
  return seq.slice(0, ROUNDS).map((w, i) => ({ word: w, level: i < 3 ? 1 : i < 7 ? 2 : 3 }));
}

// ---------- 回合狀態 ----------
let mode = "fish", round = [], idx = 0, results = [], locked = false, wrongThisQ = false;
function startMode(m) {
  mode = m; idx = 0; results = []; locked = false;
  round = makeRound(m === "order" ? WORDS.filter(w => w.c === "food") : WORDS);
  showScreen(m); nextQ();
}
function nextQ() {
  if (idx >= ROUNDS) return showResult();
  wrongThisQ = false; locked = false;
  if (mode === "fish") buildFish(round[idx]); else buildOrder(round[idx]);
}
function answered(ok, el, onDone) {
  if (locked) return;
  if (ok) {
    locked = true; results[idx] = !wrongThisQ; play(sfxOk); burst(el); el.classList.add("ok");
    for (const o of el.parentElement.children) if (o !== el) o.classList.add("dim");
    onDone(); setTimeout(() => { idx++; nextQ(); }, 1600);
  } else {
    wrongThisQ = true; play(sfxNg); el.classList.remove("ng"); void el.offsetWidth; el.classList.add("ng");
    setTimeout(() => el.classList.add("dim"), 400);             // 錯的選項變淡，留下來再選（不扣命）
  }
}

// ---------- 釣魚：看圖+聽音 → 點對的注音魚 → 揭曉國字 ----------
function buildFish(q) {
  drawProgress($("fishProgress"), results);
  const p = $("fishPrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const pond = $("pond"); pond.innerHTML = "";
  const opts = makeOptions(q.word, q.level, WORDS);
  const W = pond.clientWidth, H = pond.clientHeight, portrait = H > W * 0.9;
  const vm = Math.min(innerWidth, innerHeight) / 100, bw = 26 * vm, bh = 30 * vm;
  opts.forEach((o, i) => {
    const b = document.createElement("button"); b.className = "fishBtn"; b.appendChild(renderZ(o.syls));
    let x, y;                                                  // 橫式 1 排 4 隻（高低錯開）；直式 2×2
    if (portrait) { x = (i % 2) * (W / 2) + (W / 2 - bw) / 2; y = Math.floor(i / 2) * (H / 2) + (H / 2 - bh) / 2; }
    else { x = i * (W / 4) + (W / 4 - bw) / 2; y = (H - bh) / 2 + (i % 2 ? 0.08 : -0.08) * H; }
    b.style.left = x + "px"; b.style.top = y + "px";
    b.onclick = () => answered(o.ok, b, () => {
      const h = document.createElement("span"); h.className = "han"; h.textContent = q.word.h; p.appendChild(h); say(q.word.h);
    });
    pond.appendChild(b);
  });
  say(q.word.h);
}

// ---------- 點餐：客人說注音（不給字）→ 從貨架拿對的商品 → 揭曉國字 ----------
function buildOrder(q) {
  drawProgress($("orderProgress"), results);
  const cust = $("customer"); cust.textContent = pick(CUSTOMERS); cust.className = "customer";
  const bubble = $("bubble"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z)));
  const shelf = $("shelf"); shelf.innerHTML = "";
  const foods = WORDS.filter(w => w.c === "food");
  const opts = makeOptions(q.word, Math.min(q.level, 2), foods).filter(o => o.word); // 貨架要有實物，不放聲調假詞
  for (const o of opts) {
    const it = document.createElement("button"); it.className = "item";
    it.textContent = o.word.e; const h = document.createElement("div"); h.className = "han"; h.textContent = o.word.h; it.appendChild(h);
    it.onclick = () => {
      if (!o.ok && !locked) { cust.classList.remove("no"); void cust.offsetWidth; cust.classList.add("no"); }
      answered(o.ok, it, () => {
        cust.classList.add("happy"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z), q.word.h)); say(q.word.h + "，謝謝你！");
      });
    };
    shelf.appendChild(it);
  }
  say("我要" + q.word.h);   // 也唸出來：拼不出來時仍有線索，降低挫折
}

// ---------- 結算 ----------
function showResult() {
  const n = results.filter(Boolean).length, stars = n >= 9 ? 3 : n >= 6 ? 2 : 1;
  $("resultStars").textContent = "⭐".repeat(stars) + "☆".repeat(3 - stars);
  $("resultText").textContent = `答對 ${n} 題！` + (stars === 3 ? "太厲害了！" : stars === 2 ? "很棒喔！" : "再試一次！");
  showScreen("result"); play(sfxOk); say(stars === 3 ? "太厲害了" : stars === 2 ? "很棒喔" : "加油，再試一次");
  try { const k = "zy_best_" + mode; if (n > (+localStorage.getItem(k) || 0)) localStorage.setItem(k, n); } catch (e) {}
}

// ---------- 綁定 ----------
for (const b of document.querySelectorAll(".mode-card")) b.onclick = () => startMode(b.dataset.mode);
$("againBtn").onclick = () => startMode(mode);
$("menuBtn").onclick = () => showScreen("menu");
$("homeBtn").onclick = () => { if ($("menu").classList.contains("hidden")) showScreen("menu"); else location.href = "index.html"; };
$("speakBtn").onclick = () => { const w = round[idx]?.word; if (w) say(mode === "order" ? "我要" + w.h : w.h); };
showScreen("menu");
