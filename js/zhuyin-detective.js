// ===================== 注音小島：詞句小偵探 =====================
// 規格（GPT 擬、阿葉 10-12 認可）：用自然說話的語氣念出一句耳熟能詳的歌詞，孩子從三個只差幾個字的句子裡，
// 選出剛剛聽到的那一句。不唱歌、不加旋律、不是單字測驗。
// 流程：進入 → 簡短語音教學 → 念題目 → 選答案 → 回饋 → 「下一題」→ … → 結算。每回合 5 題（題庫不夠就全出、順序隨機）。
//   - 重聽不限次、不倒數、不扣生命。🔊 連點 300ms 內只算一次（不會把句子剪碎）。
//   - 答錯（10-12 櫻木建議）：卡片輕搖變淡、輕聲「按喇叭，再聽一次喔！」、不公布答案、可以再選別張；
//     講完 🔊 閃＋一隻手指點 🔊（約 2 秒，每答錯一次再來一次）；剩下還沒點錯的卡，把「彼此不一樣的那一段」用中性藍灰色淡淡框起來
//     （剩下的每張都框、不透露哪張對）。阿葉規則：遊戲不自動唸答案——答錯後不會自己再念題目，要孩子自己按 🔊。
//   - 答對：卡片綠框、關鍵詞（跟錯誤選項不同的字）放大鏡一個一個照亮、稱讚一句後再念一次正確句子；按「下一題」才繼續。
//   - 正確答案的位置每題隨機，但同一題重聽、答錯都不重新洗牌。點卡片＝作答（不先念那張卡）。
//   - 星星照「一次就答對的題數」：全對 3★、錯 1 題 2★、其餘 1★（答錯不扣分）。
//     但啟用的題目不到 5 題（一回合不到 ROUND_N 題）時一回合最多 1★：見 starsFor()。
//
// 介面（主程式照這個接）：
//   createDetectiveGame(root, api) → { start(opts), stop(), sayCurrent(), relayout(), state(), debug }
//   api：say(text, rate, onEnd)  題目句、答對後重念（題目／答案類，不受「說明語音」開關影響）
//        talk(text, onEnd)       教學、再聽一次、稱讚（說明類；家長關掉說明語音時主程式直接回呼 onEnd）
//        play(name)              音效：flip tap ok ng pop select star win（名稱不存在要安靜略過）
//        later(fn, ms)           ＝主程式 gLater（暫停選單凍得住）；stop() 後舊的回呼一律作廢
//        paused()                暫停中＝不收點擊、不接下一段話
//        onWin({ stars, correct, firstTry, total, items })   演出完才呼叫（items＝每題 { id, misses }，存檔用）
//        可選：onCorrect({ id, misses })  每答對一題當下呼叫（主程式：點心 +1、同樂廣場讀字週 +1）
//        可選：stopVoice()  停掉正在講的話（主程式的 stopSpeech）。沒給也不會疊播：主程式的 say() 開口前本來就會停前一句；
//                          模組自己用代號（vtok）忽略被打斷那句晚到的 onEnd。
//              preload(texts)  預先下載這回合要念的句子（主程式的 voicePreload）
//              seed（測試用：固定亂數）、bank（測試用：換一份題庫）、mascotImg（偵探小狗的圖；預設 IMAGE/zhuyin/pets/dog.webp）
//   start({ intro })：intro:false＝不念教學句（主程式自己唸過開場語時用）
//
// 國字都自己附注音（js/zhuyin-ann.js 的 readRun＋js/zhuyin-ui.js 字典；新句子要跑 tools/build_zhuyin_ui.py）。
// ⚠ zhuyin-ann.js 的 ?v 要跟 zhuyin.js 的 import 一樣（升版號時兩邊一起改，才會是同一份模組）。
import { readRun } from "./zhuyin-ann.js?v=8";
import { BANK } from "./zhuyin-detective-bank.js?v=1";

export { BANK };
export const ROUND_N = 5;
// 會念出來的台詞（都登記在 tools/voice/build_lines.py「10-12 詞句小偵探」）；ask 只顯示在對話框、不念
export const LINES = {
  intro: "仔細聽，選出你聽到的那一句！",
  retry: "按喇叭，再聽一次喔！",                 // 10-12 櫻木：答錯後不自動重念題目，改請孩子自己按 🔊（配音 id dt_retry 要重錄）
  praise: ["答對了，小偵探！", "找到了！就是這句！", "你聽得好仔細！"],   // 每一小句 ≤4 字：對話框一行一小句，不會剩一個字掉下去
  ask: "你聽到哪句呢？",
};
// 對話框顯示用：「|」＝建議換行的地方（字跟 LINES.intro 一樣，只是排版）
const SHOW = { [LINES.intro]: "仔細聽，|選出你聽到的|那一句！" };
// 結算畫面主程式唸的那句（照 BUBBLE_WIN_TALK／DELIVER_WIN_TALK 的做法）
export const WIN_TALK = "全部找到了，你是厲害的小偵探！";
const UI = { listen: "再聽一次", next: "下一題", done: "完成", banner: "全部找到了！" };

// 國字範圍 U+3400–U+9FFF（跟 zhuyin-ann.js、tools/build_zhuyin_ui.py 一樣）；用字碼組出來，原始碼裡不放範圍兩端的怪字（不然字典工具會把它們當成畫面文字收進去）
const HAN_SET = "[" + String.fromCharCode(0x3400) + "-" + String.fromCharCode(0x9fff) + "]";
const HAN = new RegExp(HAN_SET);
const hanRuns = () => new RegExp(HAN_SET + "+", "g");
const PUNCT = /[\s，。！？、,.!?…～~「」『』：；]/g;
const TONE = { "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5 };

// ---------- 純邏輯（測試會直接呼叫） ----------
export function rng(seed) {                         // mulberry32：給了 seed 就固定（測試用）
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// a 的哪些位置不在 a、b 的最長共同子序列裡（＝跟 b 不一樣的字；調換順序也抓得到）
export function diffPos(a, b) {
  const A = [...a], B = [...b], n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const keep = new Set(); let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { keep.add(i); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return A.map((_, k) => k).filter(k => !keep.has(k) && HAN.test(A[k]));
}
// 每個選項的關鍵字位置：正確選項＝跟任一錯誤選項不同的字；錯誤選項＝跟正確選項不同的字。題庫有寫 keys 就用題庫的。
export function keysOf(q) {
  const out = q.options.map((o, i) => (i === 0 ? [...new Set(q.options.slice(1).flatMap(w => diffPos(o, w)))].sort((x, y) => x - y) : diffPos(o, q.options[0])));
  for (const k of q.keys || []) if (Array.isArray(k) && k.length > 1) out[k[0]] = k.slice(1);
  return out;
}
// 題庫規則檢查（念起來一不一樣要靠注音字典，在 tools/zy-test/detective.js 檢查）
export function checkBank(bank = BANK) {
  const bad = [], ids = new Set();
  for (const q of bank) {
    const tag = q.id || "?";
    if (!q.id || ids.has(q.id)) bad.push(`${tag}：id 空的或重複`); ids.add(q.id);
    if (!Array.isArray(q.options) || q.options.length !== 3) { bad.push(`${tag}：選項要剛好 3 個`); continue; }
    if (q.say !== q.options[0]) bad.push(`${tag}：say 要跟 options[0] 一樣`);
    const ns = q.options.map(o => o.replace(PUNCT, ""));
    if (new Set(ns).size !== 3) bad.push(`${tag}：選項只差標點或完全一樣`);
    const lens = ns.map(o => [...o].length);
    if (Math.max(...lens) - Math.min(...lens) > 1) bad.push(`${tag}：選項長度差太多（${lens.join("/")}）`);
    const ks = keysOf(q);
    if (!ks[0].length || ks.slice(1).some(k => !k.length)) bad.push(`${tag}：找不到差異字`);
    if (typeof q.enabled !== "boolean") bad.push(`${tag}：要寫 enabled: true／false`);
  }
  return bad;
}
// 一回合：題庫裡 enabled 的題目隨機挑 n 題（不夠就全出），每題的卡片順序在這裡就決定好（重聽、答錯都不變）
export function pickRound(bank, n, rnd) {
  return shuffle(bank.filter(q => q.enabled), rnd).slice(0, n).map(q => ({ ...q, order: shuffle([0, 1, 2], rnd), keys: keysOf(q) }));
}
// 星星照「一次就答對的題數」：全對 3★、只錯 1 題 2★、其餘 1★
// 例外（10-12 櫻木建議）：啟用的題目不到 ROUND_N（5）題、一回合只有 total < 5 題時，最多 1★（全對也 1★）。
//   原因：題庫第一版只啟用 2 題，同兩句聽兩次就背起來了；照原規則每次都穩拿 3★，偵探社會變成「刷星星」的捷徑
//   （星星會換陀螺券、餵星星罐），也蓋過其他遊戲的節奏。題庫啟用到 5 題以上就自動回到原規則。
export function starsFor(firstTry, total) {
  if (total < ROUND_N) return 1;
  const miss = total - firstTry; return miss <= 0 ? 3 : miss === 1 ? 2 : 1;
}

// ---------- 自己附注音 ----------
function acChar(ch, syl) {
  const s = document.createElement("span"); s.className = "ac"; s.textContent = ch;
  if (!syl) return s;
  const t = TONE[syl[syl.length - 1]] || 0, sym = t ? syl.slice(0, -1) : syl;
  s.dataset.z = sym; s.classList.add("n" + Math.min(4, sym.length)); if (t) s.classList.add("t" + t);
  return s;
}
function zh(text) {                                 // 一般字串：國字逐字加注音，其他（數字、表情符號）原樣
  const f = document.createDocumentFragment(), re = hanRuns(); let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) f.appendChild(document.createTextNode(text.slice(last, m.index)));
    const r = readRun(m[0]), chars = [...m[0]], end = m.index + m[0].length;
    const punct = (text.slice(end).match(/^[，。！？、]+/) || [""])[0];
    chars.forEach((ch, i) => {
      const s = acChar(ch, r[i]);
      if (i < chars.length - 1 || !punct) { f.appendChild(s); return; }
      const nb = document.createElement("span"); nb.className = "dt-nb";   // 句尾的字跟後面的標點黏在一起（「！」不會自己掉到下一行）
      nb.appendChild(s); nb.appendChild(document.createTextNode(punct)); f.appendChild(nb);
    });
    last = end + punct.length;
  }
  if (last < text.length) f.appendChild(document.createTextNode(text.slice(last)));
  return f;
}

// ===================== 畫面＋操作 =====================
export function createDetectiveGame(root, api) {
  let run = 0;                 // 每次 start/stop 換號：舊的 later 回呼看到號碼不同就作廢
  let vtok = 0;                // 每說一句話換號：被打斷的那句晚到的 onEnd 看到號碼不同就不理
  let fired = 0;               // 真的執行到的延遲回呼數（測試用：stop() 之後不能再增加）
  let st = null, D = null, praiseK = 0;
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const later = (fn, ms, q) => { const my = run; const go = () => { if (my === run && st && (q === undefined || st.qtok === q)) { fired++; fn(); } }; if (api.later) api.later(go, ms); else setTimeout(go, ms); };
  // 綁「這一題」的延遲回呼（10-12 里維必修）：beginQ 換題就 st.qtok++，上一題排著的（重念、差異底線、下一題鈕、放大鏡…）一律作廢。
  //   不然孩子 1.5 秒內按「下一題」，舊題的回呼會在新題的卡片（同一批 DOM）畫出差異底線＝洩漏提示、或用舊句子蓋掉新題語音。
  const laterQ = (fn, ms) => later(fn, ms, st ? st.qtok : -1);
  const play = n => { try { if (api.play) api.play(n); } catch (e) { /* 音效失敗不影響遊戲 */ } };
  const paused = () => { try { return !!(api.paused && api.paused()); } catch (e) { return false; } };
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  const restart = (e, cls) => { if (!e) return; e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); };
  const mascot = api.mascotImg || new URL("../IMAGE/zhuyin/pets/dog.webp", import.meta.url).href;

  // ---------- 語音：同時只有一段 ----------
  function stopVoice() { if (api.stopVoice) { try { api.stopVoice(); } catch (e) { /* 主程式出錯也不影響 */ } } }
  function hush() { vtok++; if (st) { st.voice = null; setPlaying(false); } stopVoice(); }
  // kind：q＝題目句（say，🔊 鈕會動）、say＝答對後重念、talk＝說明類。then：講完（沒被打斷、沒暫停）才做
  function speak(kind, text, then) {
    if (!st) return;
    hush();
    const my = vtok, s = st;
    s.voice = { kind, text };
    if (kind === "q") setPlaying(true);
    const done = () => {
      if (my !== vtok || s !== st) return;           // 已經換下一句、或已經 stop()
      s.voice = null; if (kind === "q") setPlaying(false);
      if (then && !paused()) then();
    };
    try {
      if (kind === "talk" && api.talk) api.talk(text, done); else api.say(text, undefined, done);
    } catch (e) { console.warn("[detective] 語音失敗", e); done(); }
    // 保險：引擎沒回 onEnd（舊 iPad、背景分頁）時，🔊 鈕也不能一直動
    if (kind === "q") later(() => { if (my === vtok && st.voice && st.voice.kind === "q") { st.voice = null; setPlaying(false); } }, 1500 + [...text].length * 380);
  }
  function setPlaying(v) { if (!D) return; D.listen.classList.toggle("dt-playing", !!v); D.dog.classList.toggle("dt-listening", !!v); }

  // ---------- DOM ----------
  function build() {
    root.classList.add("dt-root");
    const wrap = mk("div", "dt-wrap", root);
    const bg = mk("div", "dt-bg", wrap); bg.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 6; i++) { const p = mk("i", "dt-paw", bg); p.style.setProperty("--i", i); }
    const head = mk("div", "dt-head", wrap);
    const listen = mk("button", "dt-listen", head); listen.type = "button"; listen.setAttribute("aria-label", UI.listen);
    const spk = mk("span", "dt-spk", listen); spk.setAttribute("aria-hidden", "true");
    mk("span", "dt-spk-ic", spk, "🔊"); mk("i", "dt-wave w1", spk); mk("i", "dt-wave w2", spk);
    mk("i", "dt-hand", spk, "👆");                     // 答錯後指著 🔊 的手指（平常看不到；.dt-point 時點兩下）
    mk("span", "dt-listen-t", listen).appendChild(zh(UI.listen));
    const prog = mk("div", "dt-prog", head); prog.setAttribute("role", "status");
    const progT = mk("span", "dt-prog-t", prog);
    const dots = mk("span", "dt-dots", prog);
    const side = mk("div", "dt-side", wrap);
    const bubble = mk("div", "dt-bubble", side); bubble.setAttribute("aria-live", "polite");
    const dog = mk("div", "dt-dog", side); dog.setAttribute("aria-hidden", "true");   // 偵探小狗：寵物圖＋CSS 畫的格紋偵探帽＋放大鏡
    const din = mk("div", "dt-dog-in", dog);
    const img = mk("img", "dt-dog-img", din); img.src = mascot; img.alt = ""; img.draggable = false;
    mk("i", "dt-hat", din); mk("i", "dt-glass", din);
    const next = mk("button", "dt-next dt-hide", side); next.type = "button";
    const board = mk("div", "dt-board", wrap);
    const cards = [0, 1, 2].map(i => {
      const c = mk("button", "dt-card dt-hide", board); c.type = "button"; c.dataset.i = String(i);
      mk("i", "dt-clip", c).setAttribute("aria-hidden", "true");
      mk("span", "dt-sent noann", c);
      mk("i", "dt-check", c, "✔").setAttribute("aria-hidden", "true");
      return c;
    });
    const fx = mk("div", "dt-fx", wrap);
    D = { wrap, head, listen, prog, progT, dots, side, bubble, dog, next, board, cards, fx, lens: null };
    on(listen, "click", () => replay(true));
    on(next, "click", () => goNext());
    cards.forEach((c, i) => on(c, "click", () => onCard(i)));
  }
  function teardown() {
    while (offs.length) offs.pop()();
    if (D) { D.wrap.remove(); D = null; }
    root.classList.remove("dt-root");
  }

  // ---------- 版面：橫式＝左邊偵探小狗、右邊三張卡；直式＝上面三張卡、下面小狗＋下一題 ----------
  function relayout() {
    if (!D || !st) return;
    const rc = root.getBoundingClientRect();
    const W = rc.width || innerWidth, H = rc.height || innerHeight, vm = Math.min(W, H) / 100;
    const land = W >= H * 1.1;
    D.wrap.classList.toggle("dt-land", land); D.wrap.classList.toggle("dt-port", !land);
    D.wrap.style.setProperty("--vm", vm + "px");
    // 句子字級：國字至少 fOk（約 5.2vmin）。一行放不下就把「太長的題目」換成兩行（在詞的邊界、三張卡同一斷點），字不縮小。
    //   T＝超過 T 個字的題目換兩行；從不換行（T＝最長）開始往下試，第一個字級夠大的就用；都不夠就取字級最大的
    const br = D.board.getBoundingClientRect(), cs = getComputedStyle(D.cards[0]);
    const gap = parseFloat(getComputedStyle(D.board).rowGap) || 0;
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) * 2;
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) * 2;
    const cardH = Math.min((br.height - 2 * gap) / 3, parseFloat(cs.maxHeight) || Infinity);
    const info = st.round.map(q => { const lens = q.options.map(o => [...o].length), b = brkOf(q); return { len: Math.max(...lens), line2: Math.max(b, Math.max(...lens) - b) }; });
    const fitF = T => {
      const wraps = info.some(x => x.len > T), maxLine = Math.max(...info.map(x => (x.len > T ? x.line2 : x.len)));
      return Math.max(12, Math.floor(Math.min((br.width - padX) / (maxLine * 1.72 + 0.3), (cardH - padY) / (wraps ? 2.4 : 1.3), 10.5 * vm)));
    };
    const fOk = 5.2 * vm; let T = Math.max(...info.map(x => x.len)), f = fitF(T);
    if (f < fOk) { let bestT = T, bestF = f; for (let t = T - 1; t >= 3; t--) { const ft = fitF(t); if (ft >= fOk) { bestT = t; bestF = ft; break; } if (ft > bestF) { bestT = t; bestF = ft; } } T = bestT; f = bestF; }
    D.cards.forEach(c => c.querySelector(".dt-sent").classList.toggle("dt-two", info[st.qi] ? info[st.qi].len > T : false));
    D.wrap.style.setProperty("--dt-f", f + "px");
    // 偵探小狗的大小：橫式看左欄剩多少高、直式看下排高度
    const sr = D.side.getBoundingClientRect();
    const dog = land ? Math.min(28 * vm, sr.width * 0.8, sr.height * 0.42) : Math.min(25 * vm, sr.width * 0.3);
    D.wrap.style.setProperty("--dog", Math.max(48, Math.floor(dog)) + "px");
    D.f = f; D.land = land;
    if (D.lens && st.phase === "solved") placeLens(st.lensAt);
  }

  // ---------- 一題 ----------
  const cur = () => (st ? st.round[st.qi] : null);
  function renderProg() {
    D.progT.textContent = ""; D.progT.appendChild(zh(`第 ${Math.min(st.qi, st.total - 1) + 1}/${st.total} 題`));   // 結算時 qi＝total，題號停在最後一題
    D.dots.textContent = "";
    st.round.forEach((q, i) => mk("i", i < st.qi ? (st.items[i] && st.items[i].misses === 0 ? "dt-gold" : "dt-silver") : i === st.qi ? "dt-now" : "", D.dots));
  }
  function setBubble(text, cls) {
    D.bubble.textContent = "";
    const show = SHOW[text] || text;
    const parts = show.includes("|") ? show.split("|") : show.match(/[^，！？]+[，！？]*/g) || [show];
    for (const part of parts) mk("span", "dt-ph", D.bubble).appendChild(zh(part));   // 一個短句一塊：換行換在標點後面，不會剩一個字掉到下一行（不用 lookbehind：舊 iPad 不支援）
    D.bubble.className = "dt-bubble" + (cls ? " " + cls : "");
    restart(D.bubble, "dt-pop");
  }
  // 長句換兩行的斷點（第幾個字開始第二行）：題庫有寫 br 就用；沒寫就找最接近中間的位置（避開標點前、第一行至少 2 字）。三張卡共用同一個斷點
  function brkOf(q) {
    if (typeof q.br === "number") return q.br;
    const t = [...q.say], n = t.length; let best = Math.round(n / 2);
    for (let d = 0; d < n; d++) for (const i of [Math.round(n / 2) - d, Math.round(n / 2) + d]) if (i >= 2 && i <= n - 2 && !/[，。！？、]/.test(t[i])) return i;
    return best;
  }
  // 句子：每個字包一層 .dt-c（關鍵字高亮要連注音一起框住）；讀音整段一起查（看著／好看要靠上下文）
  function sentenceInto(el, text, keys, brk) {
    el.textContent = "";
    const chars = [...text], read = new Array(chars.length).fill(null), re = hanRuns(); let m;
    while ((m = re.exec(text))) { const r = readRun(m[0]), at = [...text.slice(0, m.index)].length; [...m[0]].forEach((_, i) => { read[at + i] = r[i]; }); }
    chars.forEach((ch, k) => {
      if (k === brk) mk("span", "dt-brk", el);          // 兩行時的斷點（平常 display:none；relayout 決定這題要不要換行）
      if (!HAN.test(ch)) { el.appendChild(document.createTextNode(ch)); return; }
      const w = mk("span", "dt-c", el); w.dataset.k = String(k);
      if (keys && keys.includes(k)) w.dataset.key = "1";
      w.appendChild(acChar(ch, read[k]));
    });
  }
  function beginQ() {
    const q = cur();
    st.qtok++;                                         // 上一題還排著的 laterQ 回呼全部作廢
    st.phase = "wait"; st.qWrong = 0; st.cool = false; st.reread = false; st.lensAt = -1;
    renderProg();
    D.next.classList.add("dt-hide"); D.next.classList.remove("dt-pulse");
    D.listen.classList.remove("dt-nudge", "dt-point");
    if (D.lens) { D.lens.remove(); D.lens = null; }
    D.cards.forEach((c, i) => {
      const opt = q.order[i];
      c.className = "dt-card dt-hide"; c.disabled = false; c.removeAttribute("aria-disabled");   // 上一題答錯的卡留下的「不能點」要清掉
      c.dataset.opt = String(opt);                     // 測試用（不影響畫面：三張卡長得一模一樣）
      sentenceInto(c.querySelector(".dt-sent"), q.options[opt], q.keys[opt], brkOf(q));
      c.setAttribute("aria-label", q.options[opt]);
    });
    relayout();
  }
  function ask() {
    if (!st || (st.phase !== "wait" && st.phase !== "intro")) return;
    st.phase = "ask"; D.wrap.classList.remove("dt-introing");
    D.cards.forEach((c, i) => { c.classList.remove("dt-hide"); c.style.setProperty("--d", i * 90 + "ms"); restart(c, "dt-deal"); });
    play("flip");
    setBubble(LINES.ask);
    speak("q", cur().say);
  }
  function replay(fromBtn) {
    if (!st || paused()) return;
    // 防抖（10-12 里維建議）：300ms 內再按＝同一下（不疊播本來就做到了，但連點會把句子一直剪掉重來）
    const t = performance.now(); if (t - st.tapAt < 300) return; st.tapAt = t;
    if (st.phase === "intro") { ask(); return; }          // 教學還在講就按 🔊：直接念題目
    if (st.phase !== "ask" && st.phase !== "solved") return;
    st.replays++;
    if (st.phase === "solved") st.reread = true;          // 答對後自己按了重聽：保險計時就不再多念一次
    if (fromBtn) restart(D.listen, "dt-press");
    D.listen.classList.remove("dt-nudge", "dt-point");
    st.pointed = st.missTok;                            // 已經自己按了：這次答錯的「手指點 🔊」就不用再出來
    speak("q", cur().say);
  }
  function onCard(i) {
    if (!st || st.phase !== "ask" || st.cool || paused()) return;
    const c = D.cards[i]; if (c.classList.contains("dt-wrong")) return;
    if (cur().order[i] === 0) solve(i); else miss(i);
  }
  function miss(i) {
    const c = D.cards[i];
    st.qWrong++; st.misses++;
    st.cool = true; laterQ(() => { st.cool = false; }, 650);   // 輕搖的時間內不收點擊（亂點三張不會一下子全點完）
    c.classList.add("dt-wrong"); c.setAttribute("aria-disabled", "true"); restart(c, "dt-shake");
    play("ng");
    restart(D.dog, "dt-tilt");
    setBubble(LINES.retry, "dt-soft");
    D.listen.classList.remove("dt-nudge", "dt-point");
    hintDiff();                                         // 剩下的卡：彼此不一樣的那一段淡淡框起來（每張都框，不透露哪張對）
    // 不公布答案、也不自己重念題目（阿葉規則）：講完「按喇叭，再聽一次喔！」才讓 🔊 閃＋手指點 🔊，請孩子自己按
    const mt = ++st.missTok;
    const point = () => {
      if (!st || st.missTok !== mt || st.pointed === mt || st.phase !== "ask") return;
      st.pointed = mt; restart(D.listen, "dt-nudge"); restart(D.listen, "dt-point");
      laterQ(() => { if (st.missTok === mt) D.listen.classList.remove("dt-point"); }, 2200);   // 手指點兩下（約 2 秒）就收起來；下次答錯再來
    };
    speak("talk", LINES.retry, point);
    laterQ(point, 1500 + [...LINES.retry].length * 380);   // 保險：說明語音的 onEnd 沒來（舊 iPad、被排隊）也會指
  }
  // 剩下（還沒點錯）的卡：每張跟其他剩下的卡比，不一樣的字標 .dt-hint（連在一起的一段＝一個框：頭尾加 hs／he）
  function hintDiff() {
    const q = cur(), left = D.cards.map((c, i) => i).filter(i => !D.cards[i].classList.contains("dt-wrong"));
    D.cards.forEach(c => c.querySelectorAll(".dt-c.dt-hint").forEach(e => e.classList.remove("dt-hint", "hs", "he")));
    if (left.length < 2) return;                          // 只剩一張：沒得比（不框）
    for (const i of left) {
      const me = q.options[q.order[i]], pos = new Set(left.filter(j => j !== i).flatMap(j => diffPos(me, q.options[q.order[j]])));
      const box = D.cards[i].querySelector(".dt-sent");
      for (const k of pos) {
        const e = box.querySelector(`.dt-c[data-k="${k}"]`); if (!e) continue;
        e.classList.add("dt-hint");
        if (!pos.has(k - 1)) e.classList.add("hs");
        if (!pos.has(k + 1)) e.classList.add("he");
      }
    }
  }
  function solve(i) {
    const q = cur(), c = D.cards[i];
    st.phase = "solved"; st.correct++;
    if (st.qWrong === 0) st.firstTry++;
    st.items[st.qi] = { id: q.id, misses: st.qWrong };
    try { if (api.onCorrect) api.onCorrect({ id: q.id, misses: st.qWrong }); } catch (e) { /* 主程式的事（點心、同樂廣場），出錯不影響遊戲 */ }
    renderProg();
    play("ok");
    c.classList.add("dt-right"); restart(c, "dt-win");
    D.cards.forEach((o, k) => { if (k !== i) { o.classList.add("dt-out"); o.disabled = true; } });
    D.listen.classList.remove("dt-nudge", "dt-point");
    D.cards.forEach(o => o.querySelectorAll(".dt-c.dt-hint").forEach(e => e.classList.remove("dt-hint", "hs", "he")));   // 答錯時的提示框收掉（改成答對的黃底＋差異底線）
    restart(D.dog, "dt-hop");
    const praise = LINES.praise[praiseK++ % LINES.praise.length];
    setBubble(praise, "dt-good");
    sweepKeys(c);
    // 稱讚一句 → 再念一次正確句子（講完或保險時間到，誰先誰做）；以下延遲回呼都綁這一題（laterQ）：換題就作廢
    const reread = () => { if (st.phase === "solved" && !st.reread) { st.reread = true; c.classList.add("dt-reading"); speak("say", q.say, () => { c.classList.remove("dt-reading"); D.next.classList.add("dt-pulse"); }); } };
    speak("talk", praise, reread);
    laterQ(reread, 2600);
    laterQ(() => { if (st.phase === "solved") { D.next.textContent = ""; D.next.appendChild(zh(st.qi + 1 >= st.total ? UI.done : UI.next)); mk("span", "dt-next-ar", D.next, st.qi + 1 >= st.total ? "⭐" : "➜"); D.next.classList.remove("dt-hide"); restart(D.next, "dt-in"); } }, 700);
    laterQ(() => D.cards.forEach((o, k) => { if (k !== i) o.querySelectorAll(".dt-c[data-key]").forEach(e => e.classList.add("dt-diff")); }), 1500);   // 錯誤選項不一樣的字也畫底線（看出差在哪）
  }
  // 放大鏡一個一個照亮關鍵字
  function sweepKeys(card) {
    const ks = [...card.querySelectorAll(".dt-c[data-key]")];
    if (!ks.length) return;
    D.lens = mk("i", "dt-lens", D.fx); D.lens.setAttribute("aria-hidden", "true");
    ks.forEach((e, n) => laterQ(() => { e.classList.add("dt-key"); st.lensAt = +e.dataset.k; placeLens(st.lensAt); play("pop"); }, 250 + n * 420));
    laterQ(() => { if (D.lens) D.lens.classList.add("dt-lens-off"); }, 250 + ks.length * 420 + 700);
  }
  function placeLens(k) {
    if (!D || !D.lens || k < 0) return;
    const card = D.cards.find(c => c.classList.contains("dt-right")); if (!card) return;
    const e = card.querySelector(`.dt-c[data-k="${k}"]`); if (!e) return;
    const wr = D.wrap.getBoundingClientRect(), er = e.getBoundingClientRect();
    D.lens.style.setProperty("--x", er.left + er.width * 0.32 - wr.left + "px");
    D.lens.style.setProperty("--y", er.top + er.height / 2 - wr.top + "px");
    D.lens.style.setProperty("--s", Math.max(er.height, er.width * 0.7) * 1.45 + "px");
    D.lens.classList.add("dt-lens-on");
  }
  function goNext() {
    if (!st || st.phase !== "solved" || paused()) return;
    play("select");
    hush();
    st.qi++;
    if (st.qi >= st.total) { finish(); return; }
    beginQ();
    laterQ(ask, 380);
  }
  function finish() {
    st.phase = "done";
    D.next.classList.add("dt-hide");
    renderProg();
    const stars = starsFor(st.firstTry, st.total);
    st.win = { stars, correct: st.correct, firstTry: st.firstTry, total: st.total, items: st.items.slice() };
    const bn = mk("div", "dt-banner", D.fx);
    mk("div", "dt-banner-ic", bn, "🔍");
    mk("div", "dt-banner-t", bn).appendChild(zh(UI.banner));
    const sr = mk("div", "dt-banner-stars", bn);
    for (let i = 0; i < 3; i++) { const s = mk("span", i < stars ? "on" : "", sr, "★"); s.style.setProperty("--d", 300 + i * 260 + "ms"); }
    play("win");
    for (let i = 0; i < stars; i++) later(() => play("star"), 300 + i * 260);
    for (let i = 0; i < 16; i++) { const q = mk("i", "dt-conf c" + (i % 4), D.fx); q.style.left = (6 + (i * 59) % 88) + "%"; q.style.setProperty("--d", (i * 83) % 700 + "ms"); q.addEventListener("animationend", () => q.remove(), { once: true }); }
    restart(D.dog, "dt-hop");
    later(() => { if (!st.winSent) { st.winSent = true; api.onWin(st.win); } }, 2000);
  }

  // ---------- 公開介面 ----------
  function start(opts = {}) {
    stop();
    run++;
    const rnd = typeof api.seed === "number" ? rng(api.seed) : Math.random;
    const round = pickRound(api.bank || BANK, ROUND_N, rnd);
    if (!round.length) { console.warn("[detective] 題庫沒有啟用的題目"); return; }
    st = { round, total: round.length, qi: 0, phase: "wait", correct: 0, firstTry: 0, misses: 0, replays: 0, items: [], voice: null, qWrong: 0, cool: false, reread: false, lensAt: -1, winSent: false, win: null,
      qtok: 0, tapAt: -1e9, missTok: 0, pointed: 0 };   // qtok：第幾題的代號（laterQ 用）；tapAt：上次按 🔊（防抖）；missTok／pointed：第幾次答錯、手指指過了沒
    build(); beginQ();
    if (api.preload) { try { api.preload([LINES.intro, LINES.retry, ...LINES.praise, ...round.map(q => q.say)]); } catch (e) { /* 預載失敗沒關係 */ } }
    if (opts.intro !== false) {
      st.phase = "intro"; D.wrap.classList.add("dt-introing");   // 教學時卡片區是空的：橫式對話框往右放大（CSS）
      setBubble(LINES.intro);
      speak("talk", LINES.intro, ask);
      laterQ(ask, 5200);                                   // 保險：教學句的 onEnd 沒來（被排隊、引擎沒回）也會開始念題目
    } else laterQ(ask, 500);
  }
  function stop() {
    run++;
    if (st && st.voice) hush(); else vtok++;              // 自己正在講才停（不去打斷主程式自己的話）
    teardown();
    st = null;
  }
  function state() {
    if (!st) return null;
    const q = cur();
    return {
      phase: st.phase, qi: st.qi, total: st.total, qid: q ? q.id : null, say: q ? q.say : null, order: q ? q.order.slice() : [],
      answer: q ? q.order.indexOf(0) : -1, wrong: D ? D.cards.map((c, i) => (c.classList.contains("dt-wrong") ? i : -1)).filter(i => i >= 0) : [],
      qWrong: st.qWrong, correct: st.correct, firstTry: st.firstTry, misses: st.misses, replays: st.replays,
      voice: st.voice ? { ...st.voice } : null, nextShown: !!(D && !D.next.classList.contains("dt-hide")),
      keys: q ? q.keys[0].slice() : [], won: st.phase === "done", win: st.win, ids: st.round.map(r => r.id),
    };
  }
  const debug = {
    tap: i => onCard(i),
    next: () => goNext(),
    fired: () => fired,
    vtok: () => vtok,
    layout: () => (D ? { f: D.f, land: D.land } : null),
  };
  return { start, stop, sayCurrent: () => replay(false), relayout, state, debug };
}
