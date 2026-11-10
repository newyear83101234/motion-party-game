// ===================== 注音小島：🍎 水果籃算算看（v10 數學島水果攤；docs/zhuyin-math-plan.md §2、§4）=====================
// 一局 10 題（出題一律 js/zhuyin-math-core.js makeRound("fruit", lv)）。畫面：上面算式卡（🔊 再念一次）、中間籃子（十格框＝上下兩排各 5 格，
// 水果從左上一格一格放）、左邊小猴子（手上一盤＝拿走的水果）、右邊果汁機（10 顆進度點）、下面三顆大答案鈕；Lv5 籃子下面多一顆「👀 偷看」。
// 加法：籃子先放 a 顆（一顆顆、音一顆比一顆高）→ 再一顆顆掉進 b 顆。減法：籃子 a 顆 → 小猴子跳過來拿走 b 顆到手上（看得到），籃子那幾格變空（不留殘影）。
// 輸入時機：最後一顆放好（猴子拿完）才能按答案鈕；一按就打斷語音（api.stopVoice）。回饋、示範期間全部鎖住（連點不算錯，示範也點不掉）。
// 數數幫手：籃子裡的水果可以一顆顆點（猴子手上的不算），點到的跳出 1、2、3…並念出來。
// 答對：籃子跳一下、水果發亮、念 eqText（一定念）；第一次就答對＝right，一顆水果飛進果汁機。連對 3 題猴子翻跟斗。
// 答錯第 1 次：那顆鈕搖一搖變灰，念「我們一起數數看」，籃子裡的水果自動一顆顆亮起來數一次。
// 答錯第 2 次：另一顆錯的也變灰，只剩正確那顆發亮，要小孩自己點了才過（念整句）。
// Lv5：先放的 a 顆看 3 秒後蓋上布（整個籃子），加法的 b 顆掉在布上面（看得到）、減法猴子從布下拿走 b 顆（手上看得到）；「👀 偷看」不限次、每次掀開 1.5 秒、不扣分。
// 結算：猴子跳到果汁機打出一大杯果汁（果汁機裡的水果數＝答對題數），之後 api.onWin({ lv, stars, right, wrong, total })。
//
// 介面（主程式照這個接）：createFruitGame(root, api) → { start(lv, { intro }), stop(), sayCurrent(), relayout(), state(), debug }
//   start 的 intro＝第一次玩：模組先念 LINES.intro 再出第一題（主程式把 fruit 放進 SELF_INTRO、不另外念 MODES.intro 時用）
//   api：say(text, onEnd)（題目／數數／算式，一定念）talk(text, onEnd)（說明、鼓勵，家長可關）stopVoice() play(name, rate)
//        later(fn, ms)（所有計時器都用它）paused() onWin({ lv, stars, right, wrong, total })；可選 seed（測試固定亂數）
//   onEnd 可能不會來 → 每句話都有自己的保險計時（字數估算）。
// 語音：說出口的字串全部固定、可列舉（voiceLines() 列出全部，給 tools/voice/build_lines.py 預錄用）。
// 圖片（主對話用 ChatGPT 生）：IMAGE/zhuyin/math/fruit_*.webp、monkey.webp、blender.webp、juice.webp；讀不到一律換 emoji。
// 測試掛鉤：window.__zyFruit（state／answer／tapFruit／tapHand／peek／skip／play／round／events，見檔尾）。

import { makeRound, makeChoices, eqText, numZh, qtyZh, starsOf, N_DEFAULT } from "./zhuyin-math-core.js?v=1";

// 只用說「顆」的圓水果（櫻木 11-10：一題一種）
export const FRUITS = [
  { id: "apple", name: "蘋果", img: "fruit_apple", emo: "🍎" },
  { id: "orange", name: "橘子", img: "fruit_orange", emo: "🍊" },
  { id: "strawberry", name: "草莓", img: "fruit_strawberry", emo: "🍓" },
  { id: "peach", name: "桃子", img: "fruit_peach", emo: "🍑" },
  { id: "lemon", name: "檸檬", img: "fruit_lemon", emo: "🍋" },
];
const PIC = { monkey: { img: "monkey", emo: "🐒" }, blender: { img: "blender", emo: "🥤" }, juice: { img: "juice", emo: "🧃" } };

// ---------- 台詞（全部固定；模組只會念這些） ----------
export const LINES = {
  intro: "數數看籃子裡有幾顆水果，按對的數字！",           // talk：第一次玩（start(lv, { intro: true })），念完才出第一題
  ask: "有幾顆？",                                       // say：縮短版，加法最後一顆落下後
  askLeft: "還剩幾顆？",                                 // say：縮短版，減法猴子拿完後
  none: "籃子空空的，一顆都沒有！",                       // say：答錯示範數數時籃子是 0 顆（全部拿走）
  count: "我們一起數數看",                               // talk：答錯第 1 次
  glow: "點點看發亮的那一顆！",                           // talk：答錯第 2 次
  cover: "蓋起來囉！忘記了可以按偷看。",                   // talk：Lv5 每局第一次蓋布
  juice: "果汁打好囉！",                                 // talk：結算
};
// 題目句（say）：每局前 2 題念完整句＝[開頭句, 完整動作句]；之後縮短＝[短動作句, 問句]。數量一律 qtyZh（量詞前念「兩」）
export const openLine = (n, F) => `籃子裡有${qtyZh(n)}顆${F.name}`;
export const actLine = (q, full) => q.op === "+"
  ? (full ? `又掉進${qtyZh(q.b)}顆，現在有幾顆？` : `又掉進${qtyZh(q.b)}顆！`)
  : (full ? `小猴子拿走${qtyZh(q.b)}顆，籃子裡還剩幾顆？` : `小猴子拿走${qtyZh(q.b)}顆！`);
export const askLine = q => (q.op === "+" ? LINES.ask : LINES.askLeft);
export const countLine = n => numZh(n);                 // 數數：一、二、三…（算式念法，「二」不是「兩」）
export const qLines = (q, F, full) => (full ? [openLine(q.a, F), actLine(q, true)] : [actLine(q, false), askLine(q)]);
// 全部可能念的字串（預錄清單）：say＝一定念的、talk＝家長可關的
export function voiceLines() {
  const say = new Set(), talk = new Set([LINES.intro, LINES.count, LINES.glow, LINES.cover, LINES.juice]);
  for (const F of FRUITS) for (let n = 1; n <= 10; n++) say.add(openLine(n, F));
  for (let b = 1; b <= 10; b++) {
    if (b <= 9) { say.add(actLine({ op: "+", b }, true)); say.add(actLine({ op: "+", b }, false)); }
    say.add(actLine({ op: "-", b }, true)); say.add(actLine({ op: "-", b }, false));
  }
  say.add(LINES.ask); say.add(LINES.askLeft); say.add(LINES.none);
  for (let n = 1; n <= 10; n++) say.add(countLine(n));
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) {
    if (a + b <= 10) say.add(eqText({ op: "+", a, b, c: a + b }));
    if (b <= a) say.add(eqText({ op: "-", a, b, c: a - b }));
  }
  return { say: [...say], talk: [...talk] };
}

// 時間（毫秒；動畫的部分 prefers-reduced-motion 時縮短）
const T = { first: 350, place: 270, settle: 450, view: 3000, cover: 450, drop: 440, hop: 340, take: 420, back: 320, ready: 220,
  after: 500, clear: 380, count: 760, lock: 500, peek: 1500, endHop: 700, endJuice: 1100, endWin: 2600 };
const rateUp = n => +(0.7 + 0.075 * n).toFixed(3);        // 籃子裡第 n 顆：音一顆比一顆高（拿走時用剩下的顆數＝往下降）
const mulberry = s => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// 圖片：讀過一次失敗就記住，之後直接用 emoji（少發 404）
const IMG_OK = {};
const imgUrl = name => new URL(`../IMAGE/zhuyin/math/${name}.webp`, import.meta.url).href;

export function createFruitGame(root, api) {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const anim = (e, kf, o) => { try { return e.animate(kf, o); } catch (er) { return null; } };
  const RM = (() => { try { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } })();
  const mv = ms => Math.round(RM ? ms * 0.5 : ms);         // 動畫用的時間（減少動態時縮短）
  const now = () => performance.now();
  const later = (fn, ms) => api.later(fn, ms);
  function pic(p, cls) {                                  // 圖片（讀不到換 emoji）
    const box = el("span", "fr-pic " + (cls || ""));
    const emo = () => { box.textContent = ""; box.appendChild(el("span", "fr-emo", p.emo)); };
    if (IMG_OK[p.img] === false) { emo(); return box; }
    const im = new Image(); im.alt = ""; im.draggable = false; im.decoding = "async";
    im.onload = () => { IMG_OK[p.img] = true; };
    im.onerror = () => { IMG_OK[p.img] = false; emo(); };
    im.src = imgUrl(p.img); box.appendChild(im); return box;
  }

  let run = null, starts = 0;                            // 這一局（stop 後＝null）、開了幾局（固定亂數用）
  // ---------- 畫面 ----------
  root.innerHTML = "";
  const stage = el("div", "fr-stage noselect");
  const eq = el("div", "fr-eq"), eqT = el("div", "fr-eq-t noann"), sayBtn = el("button", "fr-say", "🔊");
  sayBtn.type = "button"; sayBtn.setAttribute("aria-label", "再念一次"); eq.append(eqT, sayBtn);
  const mk = el("div", "fr-mk"), mkPic = pic(PIC.monkey, "fr-mk-pic"), hand = el("div", "fr-hand fr-empty");
  const slots = []; for (let i = 0; i < 10; i++) { const s = el("span", "fr-slot"); hand.appendChild(s); slots.push(s); }
  mk.append(mkPic, hand);
  const bkCol = el("div", "fr-bkcol"), bk = el("div", "fr-bk"), frame = el("div", "fr-frame"), cloth = el("div", "fr-cloth fr-off");
  const cells = []; for (let i = 0; i < 10; i++) { const c = el("div", "fr-cell"); frame.appendChild(c); cells.push(c); }
  frame.appendChild(cloth); bk.appendChild(frame);
  const peekBtn = el("button", "fr-peek fr-hide"); peekBtn.type = "button"; peekBtn.append(el("span", "fr-peek-i", "👀"), el("span", "fr-peek-t", "偷看"));
  bkCol.append(bk, peekBtn);
  const jc = el("div", "fr-jc"), jcPic = pic(PIC.blender, "fr-jc-pic"), dots = el("div", "fr-dots");
  const dotEls = []; for (let i = 0; i < N_DEFAULT; i++) { const d = el("span", "fr-dot"); dots.appendChild(d); dotEls.push(d); }
  jc.append(jcPic, dots);
  const ans = el("div", "fr-ans noann"), btns = [];
  for (let i = 0; i < 3; i++) { const b = el("button", "fr-btn"); b.type = "button"; b.disabled = true; ans.appendChild(b); btns.push(b); b.addEventListener("click", () => choose(+b.dataset.v, b)); }
  stage.append(eq, mk, bkCol, jc, ans); root.appendChild(stage);
  sayBtn.addEventListener("click", () => sayCurrent());
  peekBtn.addEventListener("click", () => peek());
  frame.addEventListener("click", e => { const f = e.target.closest && e.target.closest(".fr-fruit"); if (f && frame.contains(f)) tapFruitEl(f); });

  // ---------- 版面：量舞台大小 → 格子大小 --c（橫式：猴子｜籃子｜果汁機；直式：猴子＋果汁機一排、籃子、答案鈕） ----------
  function layout() {
    const r = stage.getBoundingClientRect(), w = r.width || innerWidth, h = r.height || innerHeight;
    const tall = h > w * 1.05;
    let c = tall ? Math.min(w * 0.14, h * 0.072) : Math.min(h * 0.105, w * 0.07);
    if (!tall && h < 600 && run && run.lv === 5) c = Math.min(c, h * 0.092);   // Lv5 籃子下面多一排「偷看」：很扁的畫面（手機橫放）縮一點
    stage.classList.toggle("fr-tall", tall);
    stage.style.setProperty("--c", Math.max(24, c).toFixed(1) + "px");
  }
  try { new ResizeObserver(() => layout()).observe(stage); } catch (e) {}

  // ---------- 一局的狀態 ----------
  const rndOf = () => (typeof api.seed === "number" ? mulberry(api.seed * 7919 + starts) : Math.random);
  const live = (R, st) => run === R && !R.done && R.step === st;
  function emit(kind, text, cb) {                         // 念一句（記到事件表給測試看）
    if (run) run.ev.push({ i: run.i, k: kind, text, t: Math.round(now()) });
    try { (kind === "talk" && api.talk ? api.talk : api.say)(text, cb); } catch (e) { if (cb) later(cb, 0); }
  }
  const stopVoice = () => { try { if (api.stopVoice) api.stopVoice(); } catch (e) {} };
  // 等一下（本局計時器；skip() 會讓這一步剩下的等待全部變 0）
  function wait(R, st, ms) {
    return new Promise(res => {
      const done = () => { R.pend.delete(done); res(); };
      R.pend.add(done); later(done, R.fast === st ? 0 : Math.max(0, ms));
    });
  }
  // 念一句並等它念完（onEnd 或字數估算的保險計時，先到先算；至少 min 毫秒）
  function speak(R, st, kind, text, min = 0) {
    return new Promise(res => {
      let fired = false; const t0 = now();
      const done = () => { if (fired) return; fired = true; R.pend.delete(done); res(); };
      R.pend.add(done);
      emit(kind, text, () => { if (fired) return; const left = min - (now() - t0); if (left > 20 && R.fast !== st) later(done, left); else done(); });
      later(done, R.fast === st ? 0 : Math.max(min, 600 + 300 * [...text].length) + 600);
    });
  }

  // ---------- 小動畫 ----------
  const cpx = () => parseFloat(getComputedStyle(stage).getPropertyValue("--c")) || 60;
  const rectC = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  function flyFrom(e, from, dur, easing = "cubic-bezier(.3,.7,.35,1)") {   // FLIP：元素已經在終點，從 from 的位置飛過來
    const to = rectC(e); if (!to.w) return null;
    const dx = from.x - to.x, dy = from.y - to.y, s = from.w ? from.w / to.w : 1;
    return anim(e, [{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})` }, { transform: "none" }], { duration: mv(dur), easing });
  }
  const bounce = e => anim(e, [{ transform: "none" }, { transform: "translateY(-14%) scale(1.12)", offset: 0.4 }, { transform: "none" }], { duration: mv(260), easing: "ease-out" });
  const shake = e => anim(e, [{ transform: "translateX(0)" }, { transform: "translateX(-12%)" }, { transform: "translateX(10%)" }, { transform: "translateX(-7%)" }, { transform: "translateX(4%)" }, { transform: "translateX(0)" }], { duration: mv(420), easing: "ease-out" });

  function fruitEl(F) { const f = el("div", "fr-fruit"); f.appendChild(pic(F, "")); f.dataset.f = F.id; return f; }
  function placeFruit(R, k, how) {                        // 第 k 格放一顆（how：pop＝開局放好、drop＝從上面掉進來）
    const f = fruitEl(R.F); f.dataset.k = k; if (how === "drop" && R.covered) f.classList.add("fr-top");   // Lv5 加法：b 顆掉在布上面（看得到）
    cells[k].appendChild(f); R.cells[k] = f;
    const c = cpx();
    if (how === "drop") anim(f, [{ transform: `translateY(${(-2.4 * c).toFixed(1)}px)`, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: "translateY(0) scale(1.1, 0.88)", offset: 0.8 }, { transform: "none", opacity: 1 }], { duration: mv(380), easing: "cubic-bezier(.45,0,.8,.6)" });
    else anim(f, [{ transform: `translateY(${(-0.5 * c).toFixed(1)}px) scale(0.3)`, opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.7 }, { transform: "none", opacity: 1 }], { duration: mv(300), easing: "ease-out" });
    api.play("pop", rateUp(basketCount(R))); R.ev.push({ i: R.i, k: "put", n: k, t: Math.round(now()) });
  }
  function takeFruit(R, k, j) {                           // 第 k 格那顆被猴子拿到手上第 j 個位置（籃子那格直接變空，不留殘影）
    const src = R.cells[k]; if (!src) return;
    const from = rectC(src); src.remove(); R.cells[k] = null;
    const f = fruitEl(R.F); f.classList.add("fr-mini"); slots[j].appendChild(f); R.hand.push(f); hand.classList.remove("fr-empty");
    flyFrom(f, from, 360);
    api.play("pop", rateUp(basketCount(R))); R.ev.push({ i: R.i, k: "take", n: k, t: Math.round(now()) });
  }
  const basketCount = R => R.cells.filter(Boolean).length;
  const basketFruits = R => R.cells.filter(Boolean);
  function hop(R, toward, back) {                         // 猴子跳過去（toward＝元素）／跳回來
    if (R.hopAnim) { try { R.hopAnim.cancel(); } catch (e) {} R.hopAnim = null; }
    if (back) { const d = R.hopD || { x: 0, y: 0 }; anim(mk, [{ transform: `translate(${d.x}px, ${d.y}px)` }, { transform: `translate(${(d.x / 2).toFixed(1)}px, ${(d.y / 2 - cpx() * 0.5).toFixed(1)}px)`, offset: 0.5 }, { transform: "none" }], { duration: mv(300), easing: "ease-in-out" }); R.hopD = null; return; }
    const a = rectC(mk), b = rectC(toward), c = cpx();
    let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1, go = Math.max(0, Math.min(L - (a.w + b.w) * 0.38, c * 1.6));   // 跳到旁邊、不蓋住目標
    dx = +(dx / L * go).toFixed(1); dy = +(dy / L * go).toFixed(1); R.hopD = { x: dx, y: dy };
    R.hopAnim = anim(mk, [{ transform: "none" }, { transform: `translate(${(dx / 2).toFixed(1)}px, ${(dy / 2 - c * 0.7).toFixed(1)}px)`, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: mv(320), easing: "ease-in-out", fill: "forwards" });
    api.play("whoosh");
  }
  function flip(R) {                                      // 連對 3 題：猴子翻一個跟斗
    R.flips++; R.ev.push({ i: R.i, k: "flip" }); api.play("ev_sparkle");
    anim(mkPic, [{ transform: "none" }, { transform: "translateY(-45%) rotate(-180deg)", offset: 0.45 }, { transform: "translateY(-10%) rotate(-340deg)", offset: 0.8 }, { transform: "rotate(-360deg)" }], { duration: mv(800), easing: "ease-in-out" });
  }
  function setCover(R, on) {
    R.covered = !!on; if (!on) { R.peeking = false; R.peekTok++; }
    cloth.classList.toggle("fr-off", !on); cloth.classList.remove("fr-peeking");
    peekBtn.classList.toggle("fr-off", !on);
  }
  // 加減等號用畫的（css .fr-plus／.fr-minus／.fr-eqs：一樣寬、一樣粗；字型裡的「－」常常只有「＋」一半寬，剛學減法分不出來）。
  // 符號字還留在裡面（藏起來）：textContent 照樣是「3＋2＝？」
  const OPS = { "+": ["fr-plus", "＋"], "-": ["fr-minus", "－"], "=": ["fr-eqs", "＝"] };
  const opEl = o => { const s = el("span", "fr-op " + OPS[o][0]); s.appendChild(el("i", "", OPS[o][1])); return s; };
  function setEq(q, shown) {                              // 算式卡（阿拉伯數字＋＋－＝，不加注音）；shown＝答對後把 ？ 換成答案
    eqT.textContent = "";
    eqT.append(el("span", "fr-n", String(q.a)), opEl(q.op === "+" ? "+" : "-"), el("span", "fr-n", String(q.b)), opEl("="),
      el("b", "fr-q" + (shown ? " fr-qa" : ""), shown ? String(q.ans) : "？"));
  }
  function setBtns(R, mode) {                             // mode：wait＝還不能按（灰掉、disabled）、on＝可以按
    const ch = R.q.choices || makeChoices(R.q.ans);
    btns.forEach((b, i) => { b.dataset.v = ch[i]; b.textContent = String(ch[i]); b.classList.remove("fr-x", "fr-ok", "fr-glow"); b.disabled = mode === "wait"; b.classList.toggle("fr-wait", mode === "wait"); });
  }
  function clearBadges(R) { for (const f of basketFruits(R)) { delete f.dataset.n; f.classList.remove("fr-lit"); const n = f.querySelector(".fr-num"); if (n) n.remove(); } R.counted = 0; }
  function badge(f, n) { let b = f.querySelector(".fr-num"); if (!b) { b = el("span", "fr-num"); f.appendChild(b); } b.textContent = String(n); f.dataset.n = n; anim(b, [{ transform: "scale(0.2)" }, { transform: "scale(1.25)", offset: 0.6 }, { transform: "none" }], { duration: mv(260), easing: "ease-out" }); }
  function clearBoard(R) {
    for (const c of cells) c.textContent = ""; for (const s of slots) s.textContent = "";
    R.cells = Array(10).fill(null); R.hand = []; R.counted = 0; hand.classList.add("fr-empty");
    for (const f of stage.querySelectorAll(".fr-fx")) f.remove();
  }

  // ---------- 開局 ----------
  function start(lv = 1, { intro = false } = {}) {       // intro＝第一次玩：先念 LINES.intro（主程式把 fruit 放進 SELF_INTRO 時用）
    stop(); lv = Math.min(5, Math.max(1, Math.floor(+lv) || 1)); starts++;
    const rnd = rndOf();
    begin(lv, makeRound("fruit", lv, N_DEFAULT, rnd), rnd, intro);
  }
  function normRound(list) { return list.map(x => { const c = x.op === "+" ? x.a + x.b : x.a - x.b; return { op: x.op, a: x.a, b: x.b, c, ask: "c", ans: c, choices: x.choices || makeChoices(c) }; }); }
  function begin(lv, round, rnd, intro = false) {
    run = { lv, round, rnd, i: 0, q: null, F: null, right: 0, wrong: 0, wrongQ: 0, streak: 0, flips: 0, step: 0, fast: -1, pend: new Set(), phase: "start", done: false,
      cells: Array(10).fill(null), hand: [], counted: 0, covered: false, peeking: false, peeks: 0, peekTok: 0, coverSaid: false, full: false, results: [], ev: [], ignored: 0, juice: 0, lastF: null, hopD: null, hopAnim: null, won: null };
    const R = run;
    stage.classList.toggle("fr-lv5", lv === 5); stage.classList.remove("fr-end"); peekBtn.classList.toggle("fr-hide", lv !== 5);
    for (const d of dotEls) { d.className = "fr-dot"; d.textContent = ""; }
    clearBoard(R); setCover(R, false); layout();
    const st = ++R.step;
    if (intro) { R.phase = "intro"; speak(R, st, "talk", LINES.intro, 800).then(() => { if (live(R, st)) question(R); }); }
    else later(() => { if (live(R, st)) question(R); }, 250);
  }
  function stop() {
    if (run) { run.done = true; run.pend.clear(); run = null; }
    stage.classList.remove("fr-end"); stopAnims(); for (const c of cells) c.textContent = ""; for (const s of slots) s.textContent = ""; hand.classList.add("fr-empty");
    cloth.classList.add("fr-off"); peekBtn.classList.add("fr-off");
    for (const f of stage.querySelectorAll(".fr-fx")) f.remove();
    for (const d of dotEls) { d.className = "fr-dot"; d.textContent = ""; }
    btns.forEach(b => { b.disabled = true; b.classList.add("fr-wait"); b.classList.remove("fr-x", "fr-ok", "fr-glow"); });
  }
  function stopAnims() { try { for (const e of [mk, mkPic, jcPic, bk]) for (const a of e.getAnimations()) a.cancel(); } catch (e) {} }

  // ---------- 一題 ----------
  function question(R) {
    const st = ++R.step; R.q = R.round[R.i]; R.wrongQ = 0; R.full = R.i < 2; R.phase = "build";
    const pool = FRUITS.filter(f => f !== R.lastF); R.F = pool[Math.floor(R.rnd() * pool.length)]; R.lastF = R.F;   // 一題一種、不跟上一題同一種
    clearBoard(R); setCover(R, false); setEq(R.q, false); setBtns(R, "wait");
    dotEls.forEach((d, k) => d.classList.toggle("fr-cur", k === R.i));
    build(R, st);
  }
  async function build(R, st) {
    const q = R.q, full = R.full;
    const openP = full ? speak(R, st, "say", openLine(q.a, R.F)) : null;   // 前 2 題：「籃子裡有三顆蘋果」邊念邊放
    await wait(R, st, T.first); if (!live(R, st)) return;
    for (let k = 0; k < q.a; k++) { placeFruit(R, k, "pop"); await wait(R, st, mv(T.place)); if (!live(R, st)) return; }
    if (R.lv === 5) {                                     // 心算：先看 3 秒再蓋布
      await wait(R, st, T.view - mv(T.place)); if (!live(R, st)) return;
      setCover(R, true); api.play("whoosh"); R.ev.push({ i: R.i, k: "cover", t: Math.round(now()) });
      await wait(R, st, T.cover); if (!live(R, st)) return;
      if (!R.coverSaid) { R.coverSaid = true; await speak(R, st, "talk", LINES.cover); if (!live(R, st)) return; }
    }
    if (openP) { await openP; if (!live(R, st)) return; }
    await wait(R, st, full ? 250 : T.settle); if (!live(R, st)) return;
    const actP = speak(R, st, "say", actLine(q, full));  // 動作句跟動畫同時
    if (q.op === "+") {
      for (let j = 0; j < q.b; j++) { placeFruit(R, q.a + j, "drop"); await wait(R, st, mv(T.drop)); if (!live(R, st)) return; }
    } else {
      hop(R, bk); await wait(R, st, mv(T.hop)); if (!live(R, st)) return;
      for (let j = 0; j < q.b; j++) { takeFruit(R, q.a - 1 - j, j); await wait(R, st, mv(T.take)); if (!live(R, st)) return; }   // 從最後一格往前拿：剩下的還是從左上排起
      hop(R, null, true); await wait(R, st, mv(T.back)); if (!live(R, st)) return;
    }
    await wait(R, st, T.ready); if (!live(R, st)) return;
    R.phase = "input"; setBtns(R, "on"); R.ev.push({ i: R.i, k: "ready", t: Math.round(now()) });   // 最後一顆放好：現在才能按
    if (!full) { await actP; if (live(R, st) && R.phase === "input") emit("say", askLine(q)); }   // 縮短版：動作句念完再問「有幾顆？」（已經按了就不問）
  }

  // ---------- 作答 ----------
  function choose(v, b) {
    const R = run; if (!R || R.done) return "nogame";
    if (R.phase !== "input" && R.phase !== "forced") { R.ignored++; return "locked"; }   // 放水果中／回饋／示範：鎖住（連點不算錯）
    if (!b || b.disabled || b.classList.contains("fr-x")) { R.ignored++; return "dead"; }
    if (R.phase === "forced" && v !== R.q.ans) { R.ignored++; return "dead"; }
    stopVoice();                                          // 一按就打斷語音
    if (v === R.q.ans) { right(R, b); return "right"; }
    wrong(R, b); return "wrong";
  }
  async function right(R, b) {
    const st = ++R.step, q = R.q, first = R.wrongQ === 0, i = R.i; R.phase = "feedback";
    if (first) { R.right++; R.streak++; } else R.streak = 0;
    R.results.push({ op: q.op, a: q.a, b: q.b, c: q.c, first, wrongQ: R.wrongQ });
    b.classList.remove("fr-glow"); b.classList.add("fr-ok"); bounce(b);
    setEq(q, true); setCover(R, false);
    anim(bk, [{ transform: "none" }, { transform: "translateY(-6%) scale(1.03, 0.97)", offset: 0.35 }, { transform: "translateY(0) scale(0.98, 1.02)", offset: 0.7 }, { transform: "none" }], { duration: mv(420), easing: "ease-out" });   // 籃子跳一下
    for (const f of basketFruits(R)) f.classList.add("fr-glow");
    api.play("ok");
    const sp = speak(R, st, "say", eqText(q), 1200);   // 「三加二等於五」一定念
    if (first) juiceIn(R, i); else dotEls[i].classList.add("fr-help");
    if (first && R.streak % 3 === 0) flip(R);
    await sp; if (!live(R, st)) return;
    await wait(R, st, T.after); if (!live(R, st)) return;
    next(R);
  }
  function juiceIn(R, i) {                                // 一顆水果飛進果汁機（進度點 i 變成那種水果）
    const d = dotEls[i], src = basketFruits(R)[basketCount(R) - 1] || bk;
    const from = rectC(src); d.textContent = ""; const f = fruitEl(R.F); f.classList.add("fr-mini"); d.appendChild(f); d.classList.add("fr-on"); R.juice++;
    flyFrom(f, from, 650, "cubic-bezier(.4,0,.3,1)"); later(() => { if (run === R) { api.play("coin"); anim(jcPic, [{ transform: "none" }, { transform: "rotate(-6deg) scale(1.06)", offset: 0.3 }, { transform: "rotate(5deg)", offset: 0.65 }, { transform: "none" }], { duration: mv(380) }); } }, mv(600));
  }
  async function wrong(R, b) {
    const st = ++R.step; R.wrong++; R.wrongQ++; R.streak = 0;
    b.classList.add("fr-x"); b.disabled = true; shake(b); api.play("ng");
    R.ev.push({ i: R.i, k: "wrong", v: +b.dataset.v, n: R.wrongQ });
    if (R.wrongQ === 1) {                                 // 第 1 次：一起數數看（籃子裡的水果一顆顆亮起來）
      R.phase = "demo"; setCover(R, false); clearBadges(R);
      await speak(R, st, "talk", LINES.count, 500); if (!live(R, st)) return;
      const fr = basketFruits(R);
      if (!fr.length) { await speak(R, st, "say", LINES.none, 900); if (!live(R, st)) return; }
      for (let k = 0; k < fr.length; k++) {
        fr[k].classList.add("fr-lit"); badge(fr[k], k + 1); bounce(fr[k]); R.counted = k + 1;
        await speak(R, st, "say", countLine(k + 1), T.count); if (!live(R, st)) return;
      }
      R.ev.push({ i: R.i, k: "demo", n: fr.length });
      await wait(R, st, 400); if (!live(R, st)) return;
      for (const f of fr) f.classList.remove("fr-lit");
      R.phase = "input";
    } else {                                              // 第 2 次：只剩正確那顆發亮，要自己點了才過
      R.phase = "feedback";
      for (const x of btns) { if (+x.dataset.v === R.q.ans) x.classList.add("fr-glow"); else { x.classList.add("fr-x"); x.disabled = true; } }
      emit("talk", LINES.glow);
      await wait(R, st, T.lock); if (!live(R, st)) return;
      R.phase = "forced";
    }
  }
  async function next(R) {
    const st = ++R.step; R.phase = "next";
    dotEls[R.i].classList.remove("fr-cur");
    for (const f of [...basketFruits(R), ...R.hand]) anim(f, [{ opacity: 1 }, { opacity: 0, transform: "scale(0.6)" }], { duration: mv(300), fill: "forwards" });
    await wait(R, st, T.clear); if (!live(R, st)) return;
    R.i++;
    if (R.i >= R.round.length) { finish(R); return; }
    question(R);
  }
  // 結算果汁放哪：算式卡、答案鈕、（空的）籃子都收掉了 → 放在籃子那一格（橫式：算式卡頂～答案鈕底、猴子和果汁機中間；
  // 直式：猴子＋果汁機那排下面～畫面底），放不下就整杯縮小（k），不壓到猴子、果汁機、不出畫面。位置用版面上的位置算（offset*：不受猴子跳的動畫影響）
  function placeJuice(box) {
    const lay = e => ({ l: e.offsetLeft, t: e.offsetTop, r: e.offsetLeft + e.offsetWidth, b: e.offsetTop + e.offsetHeight });
    const W = stage.clientWidth, H = stage.clientHeight, m = Math.max(8, cpx() * 0.15);
    const M = lay(mk), J = lay(jc), E = lay(eq), A = lay(ans), B = lay(bkCol);
    const tall = stage.classList.contains("fr-tall"), w = box.offsetWidth || 1, h = box.offsetHeight || 1;
    const x0 = tall ? m : M.r + m, x1 = tall ? W - m : J.l - m;
    const y0 = Math.max(m, tall ? Math.max(M.b, J.b) + m : E.t);
    let y1 = Math.min(H - m, Math.max(A.b, B.b));
    if (y1 - y0 < h) y1 = Math.min(H - m, y0 + h);           // 不夠高：往下多用一點空白（下面沒東西了）
    const k = Math.min(1, (x1 - x0) / w, (y1 - y0) / h);
    box.style.left = ((x0 + x1) / 2).toFixed(1) + "px"; box.style.top = ((y0 + y1) / 2).toFixed(1) + "px";
    box.style.transform = `translate(-50%, -50%) scale(${k.toFixed(3)})`;
    return k;
  }
  async function finish(R) {                              // 結算：猴子跳到果汁機、打出一大杯果汁（算式卡、答案鈕、空籃子收掉）
    const st = ++R.step; R.phase = "end"; clearBoard(R); setCover(R, false);
    btns.forEach(b => { b.disabled = true; b.classList.add("fr-wait"); });
    stage.classList.add("fr-end");
    hop(R, jc); anim(jcPic, [{ transform: "none" }, { transform: "rotate(-8deg)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-8deg)" }, { transform: "rotate(8deg)" }, { transform: "none" }], { duration: mv(900) });
    await wait(R, st, T.endHop); if (!live(R, st)) return;
    api.play("whoosh");
    await wait(R, st, T.endJuice - T.endHop); if (!live(R, st)) return;
    const box = el("div", "fr-juice fr-fx"), cup = pic(PIC.juice, "fr-juice-pic"), row = el("div", "fr-juice-row");
    for (const d of dotEls) if (d.classList.contains("fr-on")) row.appendChild(d.firstChild.cloneNode(true));
    row.style.setProperty("--n", String(Math.max(1, Math.min(5, row.children.length))));   // 跟籃子一樣一排 5 顆
    box.style.setProperty("--s", (0.75 + 0.025 * R.right).toFixed(3)); box.append(cup, row); stage.appendChild(box);
    const k = placeJuice(box), sc = f => `translate(-50%, -50%) scale(${(k * f).toFixed(3)})`;
    anim(box, [{ transform: sc(0.2), opacity: 0 }, { transform: sc(1.1), opacity: 1, offset: 0.7 }, { transform: sc(1), opacity: 1 }], { duration: mv(450), easing: "ease-out" });
    api.play("win"); emit("talk", LINES.juice);
    hop(R, null, true);
    await wait(R, st, T.endWin); if (!live(R, st)) return;
    R.done = true; R.phase = "done";
    const r = { lv: R.lv, stars: starsOf(R.right, R.round.length), right: R.right, wrong: R.wrong, total: R.round.length }; R.won = r;
    try { api.onWin(r); } catch (e) { console.warn("[fruit]", e); }
  }

  // ---------- 數數幫手、偷看、再念一次 ----------
  function tapFruitEl(f) {
    const R = run; if (!R || (R.phase !== "input" && R.phase !== "forced")) return 0;
    if (!f.isConnected || !R.cells.includes(f)) return 0;           // 只數籃子裡的（猴子手上的不算）
    if (R.covered && !R.peeking && !f.classList.contains("fr-top")) return 0;   // 蓋著布的看不到
    let n = +f.dataset.n || 0;
    if (!n) { n = ++R.counted; badge(f, n); }
    bounce(f); api.play("tap", rateUp(n)); emit("say", countLine(n)); R.ev.push({ i: R.i, k: "tap", n });
    return n;
  }
  function peek() {
    const R = run; if (!R || R.done || !R.covered) return false;
    R.peeks++; R.peeking = true; cloth.classList.add("fr-peeking"); api.play("select"); R.ev.push({ i: R.i, k: "peek", t: Math.round(now()) });
    const me = ++R.peekTok;
    later(() => { if (run === R && R.peekTok === me && R.covered) { R.peeking = false; cloth.classList.remove("fr-peeking"); } }, T.peek);   // 每次掀開 1.5 秒
    return true;
  }
  async function sayCurrent() {                           // 💬／🔊：再念一次題目（念完整句）
    const R = run; if (!R || R.done || (R.phase !== "input" && R.phase !== "forced")) return false;
    const st = R.step; stopVoice();
    await speak(R, st, "say", openLine(R.q.a, R.F)); if (!live(R, st)) return true;
    emit("say", actLine(R.q, true)); return true;
  }

  // ---------- 測試掛鉤 ----------
  const glowV = () => { const b = btns.find(x => x.classList.contains("fr-glow")); return b ? +b.dataset.v : null; };
  function state() {
    const R = run; if (!R) return null;
    return { lv: R.lv, i: R.i, n: R.round.length, q: R.q && { op: R.q.op, a: R.q.a, b: R.q.b, c: R.q.c, ans: R.q.ans, choices: R.q.choices.slice() }, fruit: R.F && R.F.id,
      phase: R.phase, full: R.full, basket: basketCount(R), hand: R.hand.length, cells: R.cells.map(Boolean), covered: R.covered, peeking: R.peeking, peeks: R.peeks,
      wrongQ: R.wrongQ, right: R.right, wrong: R.wrong, streak: R.streak, flips: R.flips, juice: R.juice, ignored: R.ignored, done: R.done, won: R.won,
      enabled: btns.filter(b => !b.disabled && !b.classList.contains("fr-x") && (R.phase === "input" || (R.phase === "forced" && +b.dataset.v === R.q.ans))).map(b => +b.dataset.v),
      grey: btns.filter(b => b.classList.contains("fr-x")).map(b => +b.dataset.v), glow: glowV(),
      badges: R.cells.filter(Boolean).map(f => +f.dataset.n || 0), lit: R.cells.filter(Boolean).filter(f => f.classList.contains("fr-lit")).length, results: R.results.slice() };
  }
  const debug = {
    answer: v => { const b = btns.find(x => +x.dataset.v === v); return b ? choose(v, b) : "nobtn"; },
    answerWrong: () => { const R = run; if (!R) return "nogame"; const b = btns.find(x => +x.dataset.v !== R.q.ans && !x.classList.contains("fr-x")); return b ? choose(+b.dataset.v, b) : "nobtn"; },
    tapFruit: i => { const R = run; const f = R && basketFruits(R)[i]; return f ? tapFruitEl(f) : 0; },
    tapHand: i => { const R = run; const f = R && R.hand[i]; return f ? tapFruitEl(f) : 0; },
    peek, skip: () => { const R = run; if (!R) return false; R.fast = R.step; for (const d of [...R.pend]) d(); return true; },
    play: (lv, list) => { stop(); lv = Math.min(5, Math.max(1, lv | 0 || 1)); starts++; const rnd = rndOf(); begin(lv, list ? normRound(list) : makeRound("fruit", lv, N_DEFAULT, rnd), rnd); return true; },
    round: () => (run ? run.round.map(q => ({ op: q.op, a: q.a, b: q.b, c: q.c, ans: q.ans, choices: q.choices.slice() })) : null),
    events: () => (run ? run.ev.slice() : []),
    layout: () => ({ c: cpx(), tall: stage.classList.contains("fr-tall") }),
  };
  const api_ = { start, stop, sayCurrent, relayout: layout, state, debug };
  window.__zyFruit = { state, ...debug, game: api_ };
  return api_;
}
