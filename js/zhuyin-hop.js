// ===================== 注音小島：🐸 青蛙跳荷葉（v10 數學島荷花池；docs/zhuyin-math-plan.md §3、§4）=====================
// mode id「hop」（跟注音遊戲「跳跳蛙 frog」是兩回事：class 一律 hop- 開頭、測試掛鉤 window.__zyHop）。
// 畫面：池塘上一排荷葉 0～10（荷葉下面寫數字＝數字路徑），青蛙站的那片下面標「起點」；上方算式卡＝算式＋🔊＋腳印（跳數計數器）；
//   右上（直式：算式卡下面）一排 10 隻蜻蜓＝進度（吃到一隻亮一隻）。荷葉上不畫跳的弧線（會洩答案）。
// 一局 10 題（出題一律 js/zhuyin-math-core.js 的 makeRound("hop", lv)）：
//   Lv1～4 點荷葉回答「會停在哪一片」；Lv5 問「要往前跳幾下」，用三顆數字鈕回答（蜻蜓一開始就停在終點 c）。
//   題目一出現就能點；點青蛙站的那片不算作答；回饋／示範期間全部鎖住（連點不算錯）。
//   每局第一題：念完題目，手指 👇 一片一片跳到青蛙最後停的那片點一下（＝示範題，小孩還是要自己點）。
//   b ≥ 2 時點到起點隔壁那片（像下棋一片一片點）：每局第一次只提示（念「點青蛙最後停的那一片喔」）、不算錯。
//   答對：青蛙一下一下跳過去，每跳念一個數（Lv1～4 念荷葉號碼「五、六、七」；Lv5 念跳了幾下「一、二、三」）、
//         腳印跳一下熄一個（Lv5 是跳一下亮一個）；蜻蜓飛到那片被吃掉；念 eqText「四加三等於七」（一定念，念完才換題）。
//   答錯：把起點算進去（加法點 ans−1、減法點 ans＋1；Lv5 按 b＋1）＝念「青蛙站的這片不算，跳出去才算一下」＋起點牌閃一下；
//         其他錯＝那片沉一下（Lv5 那顆鈕搖一搖變灰），念「我們一起跳跳看」。兩種都接著青蛙慢慢示範跳過去、正確那片（那顆鈕）發亮，
//         小孩點它才過（只有第一次就答對才算 right；示範後點錯不算第二次錯，只讓發亮的那片晃一下）。
//   連對 3 題：青蛙空翻一下。結算：青蛙吃到肚子圓滾滾、打個嗝 → onWin。
//
// 介面（主程式照這個接）：createHopGame(root, api) → { start(lv), stop(), sayCurrent(), relayout(), state(), debug }
//   api：say(text, onEnd)（題目／數數／算式，一定念；onEnd 可能不會來 → 都有保險計時）、talk(text, onEnd)（說明，家長可關）、stopVoice()、
//        play(name, rate)（音效；rate 調音高：往前跳一下比一下高、往回跳一下比一下低）、later(fn, ms)（所有計時器都用它）、paused()、
//        onWin({ lv, stars, right, wrong, total })；選用：speed（測試加速倍率，正式＝1）、rnd（測試用固定亂數）
//   wrong＝答錯幾題（每題最多算 1 次：答錯就示範，示範後只剩「點對」這一步）。
// 左上留給主程式的 🏠🎵（2／16vmin、12vmin 大，排到 28vmin）：上方算式列從 30vmin 起排（css .hop-bar）。畫面上的中文字（起點、把手機橫過來）由主程式自動加注音。
// 算式卡放不下一排（iPad 橫放）就排兩排（算式 🔊 ／ 腳印）：layout() 用最寬的題目量（fitBar）。加減等號用 CSS 畫（一樣寬、一樣粗）。

import { makeRound, makeChoices, eqText, eqShow, numZh, qtyZh, starsOf, pool, N_DEFAULT } from "./zhuyin-math-core.js?v=1";

export const PADS = 11;                                  // 荷葉 0～10
// 模組會念的固定台詞（tools/voice/build_lines.py 收；不要在別處寫死台詞字串）
export const LINES = {
  notStart: "青蛙站的這片不算，跳出去才算一下",           // 把起點算進去的錯
  howTo: "點青蛙最後停的那一片喔",                         // 第一題手指示範／第一次點起點隔壁
  howToNum: "數數看要跳幾下，再點下面的數字",              // Lv5 第一題手指示範
  together: "我們一起跳跳看",                               // 其他錯 → 示範
  tapGlow: "點發亮的那一片喔",                              // 示範後點了別片（每題最多念一次）
  tapGlowNum: "點發亮的那個數字喔",                         // Lv5 示範後按了別顆（每題最多念一次）
  full: "青蛙吃得飽飽的！",                                 // 結算：肚子圓滾滾、打嗝
};
// 會變的句型（全部可列舉：allSpoken() 列出這個遊戲可能念的每一句，給預錄用）
const dirZh = q => (q.op === "+" ? "往前" : "往回");
export const qFull = q => (q.ask === "b" ? `青蛙在${numZh(q.a)}，蜻蜓在${numZh(q.c)}，要往前跳幾下？` : `青蛙在${numZh(q.a)}，${dirZh(q)}跳${qtyZh(q.b)}下，會停在哪一片？`);   // 每局前 2 題、🔊 重聽
export const qShort = q => (q.ask === "b" ? "要往前跳幾下？" : `${dirZh(q)}跳${qtyZh(q.b)}下！`);   // 第 3 題起
export const countZh = n => numZh(n);                    // 每跳一下念一個數（荷葉號碼／跳了幾下，都念「二」）
export function allSpoken() {
  const out = new Set(Object.values(LINES));
  for (let n = 0; n <= 10; n++) out.add(countZh(n));
  for (let lv = 1; lv <= 5; lv++) for (const f of pool("hop", lv)) {
    const q = { ...f, ask: lv === 5 ? "b" : "c" };
    out.add(qFull(q)); out.add(qShort(q)); out.add(eqText(q));
  }
  return [...out];
}

const FLY_SRC = new URL("../IMAGE/zhuyin/math/dragonfly.webp", import.meta.url).href;   // 蜻蜓圖（還沒生好＝用 🪰）
const FLY_EMOJI = "🪰";
// 時間（毫秒，正式速度；測試 api.speed 會整體加速）
const TM = { jump: 620, demo: 1000, fade: 220, flyTo: 650, eat: 320, gap: 450, flip: 820, fstep: 560, full: 2300 };
const TM_RM = { jump: 380, demo: 650, fade: 120, flyTo: 380, eat: 200, gap: 300, flip: 420, fstep: 360, full: 1600 };   // prefers-reduced-motion：動畫縮短

export function createHopGame(root, api) {
  const SPD = Math.max(0.1, +api.speed || 1);
  const rnd = typeof api.rnd === "function" ? api.rnd : Math.random;
  const reduce = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();
  const D = reduce ? TM_RM : TM;
  const T = ms => Math.max(0, ms / SPD);
  const later = (fn, ms) => (api.later ? api.later(fn, ms) : setTimeout(fn, ms));
  const say = (t, cb) => { try { api.say(t, cb); } catch (e) { console.warn("[hop] say", e); } };
  const talk = (t, cb) => { try { (api.talk || api.say)(t, cb); } catch (e) { console.warn("[hop] talk", e); } };
  const play = (n, r) => { try { if (api.play) api.play(n, r); } catch (e) {} };
  const hush = () => { try { if (api.stopVoice) api.stopVoice(); } catch (e) {} };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const anim = (e, kf, o) => { try { return e.animate(kf, o); } catch (er) { return null; } };
  const cancelAnims = e => { try { for (const a of e.getAnimations()) a.cancel(); } catch (er) {} };
  const px = v => v.toFixed(1) + "px";

  // ---------- 蜻蜓圖：先試載一次，載得到才換成圖（載不到一直用 🪰，console 只會有一筆 404） ----------
  let flyImgOk = false; const flyIcons = new Set();
  const toImg = s => { if (s.querySelector("img")) return; s.textContent = ""; const i = new Image(); i.src = FLY_SRC; i.alt = ""; i.draggable = false; s.appendChild(i); };
  const flyIcon = cls => { const s = el("span", "hop-fly-ico" + (cls ? " " + cls : "")); if (flyImgOk) toImg(s); else { s.textContent = FLY_EMOJI; flyIcons.add(s); } return s; };
  { const p = new Image(); p.onload = () => { flyImgOk = true; for (const s of flyIcons) toImg(s); flyIcons.clear(); }; p.onerror = () => {}; p.src = FLY_SRC; }
  { const p = new Image(); p.src = new URL("../IMAGE/zhuyin/frog_jump.webp", import.meta.url).href; }   // 跳起來的圖先抓好（第一次跳不會閃）

  // ---------- 畫面 ----------
  root.innerHTML = "";
  const stage = el("div", "hop-stage");
  stage.style.setProperty("--spd", String(SPD));
  const bar = el("div", "hop-bar");                      // 上方：算式卡＋進度（left 從 118px 起，不碰 🏠）
  const card = el("div", "hop-card"), eqBox = el("span", "hop-eq"), feet = el("span", "hop-feet");
  const sayBtn = el("button", "hop-say", "🔊"); sayBtn.type = "button"; sayBtn.setAttribute("aria-label", "再聽一次");
  sayBtn.addEventListener("click", () => sayCurrent());
  card.append(eqBox, feet, sayBtn);                     // 橫式：算式｜腳印｜🔊；直式：算式 🔊 ／ 腳印（CSS grid）
  const prog = el("div", "hop-prog"); prog.setAttribute("aria-hidden", "true");
  bar.append(card, prog);
  const row = el("div", "hop-row");
  const pads = [];
  for (let n = 0; n < PADS; n++) {
    const b = el("button", "hop-pad"); b.type = "button"; b.dataset.n = String(n); b.setAttribute("aria-label", String(n));
    b.append(el("span", "hop-leaf"), el("span", "hop-num", String(n)));
    b.addEventListener("click", () => onPad(n));
    pads.push(b); row.appendChild(b);
  }
  const startTag = el("div", "hop-starttag", "起點");
  const frog = el("div", "hop-frog"), frogFx = el("div", "hop-frog-fx"), frogImg = el("div", "hop-frog-img");
  frogFx.appendChild(frogImg); frog.appendChild(frogFx);
  const burp = el("div", "hop-burp hop-hide", "💨");
  const fly = el("div", "hop-fly"), flyIn = el("div", "hop-fly-in"); flyIn.appendChild(flyIcon()); fly.appendChild(flyIn);
  const choices = el("div", "hop-choices hop-hide");
  const finger = el("div", "hop-finger hop-hide", "👇"); finger.setAttribute("aria-hidden", "true");
  const rot = el("div", "hop-rotate hop-hide"); rot.append(el("div", "hop-rot-ico", "📱"), el("div", "hop-rot-t", "把手機橫過來"));
  stage.append(row, startTag, frog, burp, fly, choices, finger, bar, rot);
  root.appendChild(stage);
  for (let i = 0; i < N_DEFAULT; i++) { const d = el("i", "hop-dot"); d.appendChild(flyIcon()); prog.appendChild(d); }

  // ---------- 量畫面、排版（start、relayout 都重排；荷葉寬 u＝畫面寬 ÷ 11，太擠就縮；u < 44px＝手機直放 → 請他橫過來） ----------
  const geo = { W: 0, H: 0, vmin: 0, u: 0, x0: 0, padTop: 0, padW: 0, padH: 0, badgeH: 0, tagH: 0, frogW: 0, frogH: 0, flyS: 0, cb: 0, chTop: 0, skyTop: 0, skyBot: 0, rot: false, minBtn: 64 };
  function dims(u, lv5, minBtn, vmin) {
    const padW = u * 0.92, padH = padW * 403 / 460, frogW = u * 0.88, frogH = frogW * 440 / 335, flyS = Math.max(28, u * 0.62);
    const badgeH = Math.max(22, u * 0.5), tagH = Math.max(20, u * 0.42);
    const cb = lv5 ? Math.max(minBtn, Math.min(u * 1.05, vmin * 18)) : 0;
    return { padW, padH, frogW, frogH, flyS, badgeH, tagH, cb, sky: lv5 ? u * 0.25 : Math.max(u * 0.85, flyS * 1.35), frogAbove: frogH - padH * 0.5, gapC: lv5 ? u * 0.3 : 0 };
  }
  // 算式卡排一排（算式｜腳印｜🔊）放得下嗎：用最寬的內容（「5 ＋ 5 ＝ 10」露出答案＋5 個腳印）量一次，放不下（iPad 橫放）就排兩排（.hop-stack：算式 🔊 ／ 腳印）；
  // 直放一律兩排。上方列的高度也用這個最寬的內容量（每題卡片一樣大：荷葉不會因為題目不同跟著移動），量完把卡片內容放回去。
  function fitBar() {
    const keepEq = [...eqBox.childNodes], keepFeet = [...feet.childNodes];
    setEq({ op: "+", a: 5, b: 5, c: 10, ans: 10, ask: "c" }, true);
    feet.replaceChildren(...Array.from({ length: 5 }, () => el("span", "hop-foot on", "🐾")));
    let stack = true;
    try { stack = matchMedia("(orientation: portrait)").matches; } catch (e) { stack = stage.clientHeight > stage.clientWidth; }
    stage.classList.remove("hop-stack");
    if (!stack) stack = card.offsetWidth + (parseFloat(getComputedStyle(bar).columnGap) || 0) + prog.offsetWidth > bar.clientWidth - 2;
    stage.classList.toggle("hop-stack", stack);
    const br = bar.getBoundingClientRect();
    eqBox.replaceChildren(...keepEq); feet.replaceChildren(...keepFeet);
    return br;
  }
  function layout() {
    const sr = stage.getBoundingClientRect(), W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight, vmin = Math.min(W, H) / 100;
    const br = fitBar(), topB = br.height ? br.bottom - sr.top : vmin * 16;
    const lv5 = !!(run && run.lv === 5), minBtn = W >= 700 && H >= 560 ? 64 : 44;
    let u = Math.min((W - 2 * Math.max(8, vmin * 1.5)) / PADS, 150), d = dims(u, lv5, minBtn, vmin), need = 0;
    for (let k = 0; k < 40; k++) {
      d = dims(u, lv5, minBtn, vmin);
      need = topB + d.sky + d.frogAbove + d.padH + d.badgeH + d.tagH + d.gapC + d.cb + Math.max(8, vmin * 2);
      if (need <= H || u <= 30) break;
      u *= 0.96;
    }
    const minTop = topB + d.sky + d.frogAbove, padTop = minTop + Math.max(0, H - need) * 0.5;
    Object.assign(geo, { W, H, vmin, u, x0: (W - u * PADS) / 2, padTop, ...d, chTop: padTop + d.padH + d.badgeH + d.tagH + d.gapC, skyTop: topB + u * 0.08, skyBot: padTop - d.frogAbove - u * 0.06, rot: u < 44, minBtn });
    const S = stage.style;
    for (const [k, v] of [["u", u], ["padW", d.padW], ["padH", d.padH], ["badgeH", d.badgeH], ["tagH", d.tagH], ["frogW", d.frogW], ["frogH", d.frogH], ["flyS", d.flyS], ["cb", d.cb]]) S.setProperty("--" + k, px(v));
    const lift = u * 0.3;                                  // 荷葉的按鈕往上多 0.3u（點到青蛙腳邊也算點那片）
    pads.forEach((b, n) => { Object.assign(b.style, { left: px(geo.x0 + n * u), top: px(padTop - lift), width: px(u), height: px(lift + d.padH + d.badgeH) }); });
    rot.classList.toggle("hop-hide", !geo.rot);
    if (run) {
      cancelAnims(frog); if (run.frogAt != null) placeFrog(run.frogAt); if (run.q) placeTag(run.q.a);
      choices.style.top = px(geo.chTop);
      placeFlyNow();
      if (run.fingerOn) hideFinger(run);
    }
  }
  const padX = n => geo.x0 + (n + 0.5) * geo.u;          // 第 n 片的中心 x
  const frogXY = n => ({ x: padX(n) - geo.frogW / 2, y: geo.padTop + geo.padH * 0.5 - geo.frogH });
  function placeFrog(n) { const p = frogXY(n); frog.style.left = px(p.x); frog.style.top = px(p.y); }
  function placeTag(n) { startTag.style.left = px(padX(n) - geo.u * 0.47); startTag.style.top = px(geo.padTop + geo.padH + geo.badgeH + geo.u * 0.03); startTag.style.width = px(geo.u * 0.94); }

  // ---------- 一局的狀態 ----------
  let run = null;
  const L = (R, fn, ms) => later(() => { if (run === R && !R.done) fn(); }, T(ms));   // 本局計時器：換局／stop 之後就不跑
  const LQ = (R, fn, ms) => { const qi = R.i; L(R, () => { if (R.i === qi) fn(); }, ms); };   // 這一題的計時器：換題（含 skip）之後就不跑
  function sayW(R, text, cb, isTalk) {                    // 念完才往下（onEnd 不一定會來：保險計時）
    let fired = false; const fin = () => { if (fired) return; fired = true; if (run === R && !R.done) cb(); };
    (isTalk ? talk : say)(text, fin);
    L(R, fin, 900 + [...text].length * 300);
  }

  function setFacing(dir) { frogImg.style.setProperty("--face", String(dir)); }
  function jumpFrog(R, to, dur) {                        // 從現在那片跳到 to（FLIP：先放到終點，再從起點的位移畫一道弧）
    if (R.fadeQ) fadeIn(R);                              // 換題的淡入還沒做完就點對了：先把青蛙放好再跳
    const a = frogXY(R.frogAt), b = frogXY(to); R.frogAt = to;
    cancelAnims(frog); placeFrog(to); frogImg.classList.add("jump");
    const dx = a.x - b.x, arc = geo.u * (reduce ? 0.25 : 0.6);
    anim(frog, [{ transform: `translate(${px(dx)}, 0px)` }, { transform: `translate(${px(dx / 2)}, ${px(-arc)})`, offset: 0.5 }, { transform: "translate(0px, 0px)" }], { duration: T(dur * 0.85), easing: "ease-in-out" });
    L(R, () => frogImg.classList.remove("jump"), dur * 0.85);
  }
  const bounce = (e, k = 1) => anim(e, [{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${px(-geo.u * 0.18 * k)}) scale(1.06)`, offset: 0.4 }, { transform: "translateY(0) scale(1)" }], { duration: T(320), easing: "ease-out" });

  // ---------- 算式卡、腳印 ----------
  // 加減等號用畫的（css .hop-plus／.hop-minus／.hop-eqs：一樣寬、一樣粗；字型裡的「－」常常只有「＋」一半寬，剛學減法分不出來）。
  // 符號字還留在裡面（藏起來）：textContent 照樣是「4＋3＝？」
  const OPS = { "+": ["hop-plus", "＋"], "-": ["hop-minus", "－"], "=": ["hop-eqs", "＝"] };
  const opEl = o => { const s = el("span", "hop-op " + OPS[o][0]); s.appendChild(el("i", "", OPS[o][1])); return s; };
  function setEq(q, reveal) {                             // 4 ＋ 3 ＝ ？（Lv5：4 ＋ ？ ＝ 7）；reveal＝把 ？ 換成答案（亮色）
    eqBox.innerHTML = "";
    const toks = q.ask === "b" ? [q.a, "+", "?", "=", q.c] : [q.a, q.op === "+" ? "+" : "-", q.b, "=", "?"];
    for (const t of toks) {
      if (t === "?") eqBox.appendChild(el("b", reveal ? "hop-ans" : "hop-unk", reveal ? String(q.ans) : "？"));
      else if (typeof t === "number") eqBox.appendChild(el("span", "hop-n", String(t)));
      else eqBox.appendChild(opEl(t));
    }
  }
  function setFeet(R, n, lit) {                           // n 個腳印，前 lit 個亮著；Lv5 還沒跳＝一個「？」
    feet.innerHTML = ""; R.feetN = n; R.feetOn = lit;
    if (!n) { feet.appendChild(el("span", "hop-foot hop-qm", "？")); return; }
    for (let k = 0; k < n; k++) feet.appendChild(el("span", "hop-foot" + (k < lit ? " on" : ""), "🐾"));
  }
  function footStep(R, k) {                               // 第 k 跳（1 起）：Lv1～4 熄一個（從右邊熄）；Lv5 亮一個
    if (R.q.ask === "b") { if (R.feetN !== R.q.b) setFeet(R, R.q.b, 0); const f = feet.children[k - 1]; if (f) f.classList.add("on"); R.feetOn = k; }
    else { const f = feet.children[R.q.b - k]; if (f) f.classList.remove("on"); R.feetOn = R.q.b - k; }
  }

  // ---------- 蜻蜓：Lv1～4 在水面上空飛來飛去（不靠近答案那片的固定位置）；Lv5 一開始停在終點 ----------
  const flyPos = { x: 0, y: 0 };
  function setFly(x, y, dur) {
    if (Math.abs(x - flyPos.x) > 2) flyIn.style.setProperty("--fd", x < flyPos.x ? "-1" : "1");
    flyPos.x = x; flyPos.y = y;
    fly.style.transitionDuration = `${T(dur).toFixed(0)}ms, ${T(250).toFixed(0)}ms`;
    fly.style.transform = `translate(${px(x - geo.flyS / 2)}, ${px(y - geo.flyS / 2)})`;
  }
  const perchXY = n => ({ x: padX(n) + geo.u * 0.2, y: geo.padTop + geo.padH * 0.42 });   // 停在荷葉右前方
  const mouthXY = () => { const p = frogXY(run.frogAt); return { x: p.x + geo.frogW * 0.5, y: p.y + geo.frogH * 0.45 }; };
  function randSky() {
    const yTop = geo.skyTop + geo.flyS * 0.6, yBot = Math.max(yTop, geo.skyBot - geo.flyS * 0.5), y = yTop + rnd() * (yBot - yTop);
    const xMin = y < geo.vmin * 14 + geo.flyS * 0.6 ? geo.vmin * 30 + geo.flyS * 0.6 : geo.flyS, xMax = geo.W - geo.flyS;   // 左上 🏠🎵 那一塊（排到 28vmin、高到 14vmin）不飛進去
    return { x: xMin + rnd() * Math.max(10, xMax - xMin), y };
  }
  function wander(R, tok) {                              // tok：每隻蜻蜓自己一條飛行迴圈（換題換新的一隻，舊的迴圈自己停）
    if (run !== R || R.fly.mode !== "wander" || R.flyTok !== tok) return;
    const p = randSky(); setFly(p.x, p.y, 1500);
    L(R, () => wander(R, tok), 1500 + rnd() * 500);
  }
  function placeFlyNow() {                                // relayout：蜻蜓立刻回到該在的地方
    const R = run; if (!R) return;
    if (R.fly.mode === "perch") { const p = perchXY(R.fly.at); setFly(p.x, p.y, 0); }
    else if (R.fly.mode === "hover") { const p = mouthXY(); setFly(p.x, p.y - geo.frogH * 0.55, 0); }
    else if (R.fly.mode === "wander") { const p = randSky(); setFly(p.x, p.y, 0); }
  }
  function newFly(R) {                                    // 每題一隻新的蜻蜓（淡入）
    fly.classList.remove("hop-eaten");
    if (R.q.ask === "b") { R.fly = { mode: "perch", at: R.q.c }; const p = perchXY(R.q.c); setFly(p.x, p.y, 0); }
    else { R.fly = { mode: "wander", at: null }; const p = randSky(); setFly(p.x, p.y, 0); const tok = R.flyTok = (R.flyTok || 0) + 1; L(R, () => wander(R, tok), 300); }
    fly.classList.remove("hop-hide");
  }
  function eat(R, cb) {                                   // 蜻蜓飛到青蛙嘴邊 → 吃掉 → 進度亮一隻
    const m = mouthXY(); R.fly = { mode: "to", at: R.frogAt };
    setFly(m.x, m.y, D.flyTo);
    L(R, () => {
      fly.classList.add("hop-eaten"); R.fly = { mode: "gone", at: R.frogAt };
      anim(frogFx, [{ transform: "scale(1, 1)" }, { transform: "scale(1.16, 0.9)", offset: 0.4 }, { transform: "scale(1, 1)" }], { duration: T(D.eat), easing: "ease-out" });
      play("pop", 1.15);
      const d = prog.children[R.eaten]; if (d) d.classList.add("on"); R.eaten++;
      L(R, cb, D.eat);
    }, D.flyTo);
  }

  // ---------- 手指示範（每局第一題） ----------
  function fingerAt(x, y) { finger.style.left = px(x - geo.u * 0.35); finger.style.top = px(y - geo.u * 0.95); }
  const fingerPad = n => ({ x: padX(n), y: geo.padTop + geo.padH * 0.45 });
  function hideFinger(R) { if (R) R.fingerOn = false; cancelAnims(finger); finger.classList.add("hop-hide"); finger.classList.remove("tap"); }
  function fingerDemo(R) {
    if (run !== R || R.phase !== "ask" || R.lock || R.tapsQ || R.fingerDone) return;
    R.fingerDone = true; R.fingerN++; R.fingerOn = true;
    const q = R.q, dir = q.op === "+" ? 1 : -1, n = Math.abs(q.c - q.a), st = D.fstep;
    let at = q.a; const p0 = fingerPad(at); fingerAt(p0.x, p0.y);
    finger.classList.remove("hop-hide", "tap");
    for (let k = 1; k <= n; k++) LQ(R, () => {
      if (!R.fingerOn) return;
      const from = fingerPad(at); at = q.a + dir * k; const to = fingerPad(at); fingerAt(to.x, to.y);
      anim(finger, [{ transform: `translate(${px(from.x - to.x)}, 0px)` }, { transform: `translate(${px((from.x - to.x) / 2)}, ${px(-geo.u * (reduce ? 0.15 : 0.45))})`, offset: 0.5 }, { transform: "translate(0px, 0px)" }], { duration: T(st * 0.8), easing: "ease-in-out" });
    }, st * k);
    LQ(R, () => {
      if (!R.fingerOn) return;
      if (q.ask === "b") {                               // Lv5：跳到蜻蜓那裡以後，移到下面的數字鈕（不點特定那顆）
        const cr = choices.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        fingerAt(cr.left - sr.left + cr.width / 2, cr.top - sr.top + geo.u * 0.2);
        if (!R.numHinted) talk(LINES.howToNum);          // 小孩點荷葉時已經念過了就不重念
      } else talk(LINES.howTo);
      finger.classList.add("tap");                       // 點兩下（CSS 動畫）
    }, st * (n + 1));
    LQ(R, () => { if (R.fingerOn) hideFinger(R); }, st * (n + 1) + 2400);
  }

  // ---------- 題目 ----------
  function buildChoices(R) {
    choices.innerHTML = ""; const q = R.q;
    if (q.ask !== "b") { choices.classList.add("hop-hide"); return; }
    for (const v of q.choices) {
      const b = el("button", "hop-ch", String(v)); b.type = "button"; b.dataset.v = String(v);
      b.addEventListener("click", () => onChoice(v)); choices.appendChild(b);
    }
    choices.style.top = px(geo.chTop); choices.classList.remove("hop-hide");
  }
  function startQ(R) {
    const q = R.q = R.qs[R.i];
    Object.assign(R, { phase: "ask", lock: false, wrongQ: 0, tapsQ: 0, nagged: false, fingerDone: R.i !== 0, glow: null, reading: true, numHinted: false, numHintQ: false });
    for (const b of pads) b.classList.remove("glow", "sink", "shake", "start", "dim");
    pads[q.a].classList.add("start");
    setEq(q, false);
    setFeet(R, q.ask === "b" ? 0 : q.b, q.ask === "b" ? 0 : q.b);
    burp.classList.add("hop-hide");
    const first = R.frogAt == null; R.frogAt = q.a; R.facing = q.op === "-" ? -1 : 1;
    if (first) { placeFrog(q.a); setFacing(R.facing); placeTag(q.a); }
    else {                                                // 青蛙「噗」一下換到新的起點（不用跳的：不然會像在數格子）
      cancelAnims(frog); frog.classList.add("hop-out"); R.fadeQ = true;
      LQ(R, () => { if (R.fadeQ) fadeIn(R); }, D.fade);
    }
    startTag.classList.remove("pulse");
    buildChoices(R); newFly(R);
    R.sayText = R.i < 2 ? qFull(q) : qShort(q);
    const qi = R.i;
    sayW(R, R.sayText, () => {
      if (R.i !== qi) return;
      R.reading = false;
      if (R.numHintQ) { R.numHintQ = false; if (R.phase === "ask" && !R.lock) say(LINES.howToNum); }   // Lv5 念題目時就點了荷葉：題目念完才提示（不打斷題目）
      if (R.i === 0) fingerDemo(R);
    });
  }
  function fadeIn(R) { R.fadeQ = false; placeFrog(R.q.a); setFacing(R.facing); placeTag(R.q.a); frog.classList.remove("hop-out"); }
  function next(R) { R.i++; if (R.i >= R.qs.length) finishRound(R); else startQ(R); }

  // 跳 from → to：每一下念一個數、配一個音（往前升、往回降）、腳印熄一個（Lv5 亮一個）
  function hops(R, dur, cb) {
    const q = R.q, dir = q.op === "+" ? 1 : -1, n = Math.abs(q.c - R.frogAt), from = R.frogAt;
    for (let k = 1; k <= n; k++) LQ(R, () => {
      const at = from + dir * k; jumpFrog(R, at, dur);
      play("pop", dir > 0 ? Math.min(1.8, 0.9 + 0.1 * k) : Math.max(0.5, 1.1 - 0.09 * k));
      say(countZh(q.ask === "b" ? k : at)); R.counted.push(q.ask === "b" ? k : at);
      footStep(R, k);
    }, dur * (k - 1));
    LQ(R, cb, dur * n + 120);
  }
  function revealAndEq(R, cb) {                          // 算式露出答案、念整句（一定念）
    setEq(R.q, true);
    sayW(R, eqText(R.q), cb);
  }
  function afterEq(R) {
    if (R.wrongQ === 0 && R.streak > 0 && R.streak % 3 === 0) {   // 連對 3 題：空翻
      R.flips++; play("whoosh", 1.1);
      const f = -360 * R.facing;
      anim(frogFx, reduce ? [{ transform: "translateY(0)" }, { transform: `translateY(${px(-geo.u * 0.3)})`, offset: 0.5 }, { transform: "translateY(0)" }]
        : [{ transform: "translateY(0px) rotate(0deg)" }, { transform: `translateY(${px(-geo.u * 0.9)}) rotate(${f / 2}deg)`, offset: 0.5 }, { transform: `translateY(0px) rotate(${f}deg)` }], { duration: T(D.flip), easing: "ease-in-out" });
      L(R, () => next(R), D.flip + D.gap);
    } else L(R, () => next(R), D.gap);
  }
  function correct(R) {                                   // 第一次就對（或 Lv5 第一次就按對）
    R.lock = true; R.phase = "busy"; hush();
    if (R.wrongQ === 0) { R.right++; R.streak++; }
    R.counted = [];
    if (R.q.ask === "b") markChoice(R.q.ans, "ok");
    hops(R, D.jump, () => eat(R, () => revealAndEq(R, () => afterEq(R))));
  }
  function wrongAns(R, startErr, target) {               // target：點錯的荷葉或數字鈕
    R.lock = true; R.phase = "busy"; hush();
    R.wrong++; R.wrongQ++; R.streak = 0; play("ng", 0.9);
    if (target) { target.classList.remove("sink", "shake"); void target.offsetWidth; target.classList.add(R.q.ask === "b" ? "shake" : "sink"); }
    if (R.q.ask === "b" && target) target.classList.add("dim");
    if (startErr) { startTag.classList.remove("pulse"); void startTag.offsetWidth; startTag.classList.add("pulse"); }
    sayW(R, startErr ? LINES.notStart : LINES.together, () => demo(R), !startErr);   // 11-10 里維：「起點不算」是這款的關鍵教學句 → 用 say（家長關掉說明語音也照念）
  }
  function demo(R) {                                      // 青蛙慢慢示範跳過去 → 正確那片（那顆鈕）發亮 → 等小孩點
    R.counted = [];
    hops(R, D.demo, () => {
      if (R.q.ask === "b") { R.fly = { mode: "hover", at: R.q.c }; const m = mouthXY(); setFly(m.x, m.y - geo.frogH * 0.55, 400); }
      R.phase = "must"; R.lock = false; R.glow = R.q.ans;
      if (R.q.ask === "b") for (const b of choices.children) { const ok = +b.dataset.v === R.q.ans; b.classList.toggle("glow", ok); b.classList.toggle("dim", !ok); }
      else pads[R.q.ans].classList.add("glow");
    });
  }
  function mustDone(R) {                                  // 示範後小孩點對了：蜻蜓被吃掉、念整句（不算 right）
    R.lock = true; R.phase = "busy"; hush();
    for (const b of pads) b.classList.remove("glow"); for (const b of choices.children) b.classList.remove("glow");
    if (R.q.ask === "b") markChoice(R.q.ans, "ok");
    bounce(frogFx, 0.8);
    L(R, () => eat(R, () => revealAndEq(R, () => afterEq(R))), 200);
  }
  function nag(R, target) {                               // 示範後點了別的：發亮的那個晃一下（不算錯）；每題最多念一次
    if (target) { target.classList.remove("shake"); void target.offsetWidth; target.classList.add("shake"); }
    play("tap", 0.8);
    if (!R.nagged) { R.nagged = true; talk(R.q.ask === "b" ? LINES.tapGlowNum : LINES.tapGlow); }
  }
  function numHint(R) {                                   // Lv5 點了荷葉：三顆數字鈕一起跳一下；每題第一次念「數數看要跳幾下，再點下面的數字」（say：一定念；不算錯）
    R.numHints++; play("tap", 0.9);
    if (R.phase === "must") { nag(R, [...choices.children].find(b => +b.dataset.v === R.q.ans)); return; }   // 示範後：發亮的那顆晃一下（念「點發亮的那個數字喔」）
    for (const b of choices.children) bounce(b, 0.8);
    if (R.numHinted) return;
    R.numHinted = true;
    if (R.reading) R.numHintQ = true;                    // 題目還在念：念完再提示（不打斷題目）
    else say(LINES.howToNum);
  }
  function markChoice(v, cls) { for (const b of choices.children) if (+b.dataset.v === v) b.classList.add(cls); }

  // ---------- 小孩點荷葉／數字鈕 ----------
  function onPad(n) {
    const R = run; if (!R || R.done || R.over) return;
    if (R.lock || R.phase === "busy") { R.ignored++; return; }   // 回饋／示範中：不算
    const q = R.q;
    if (q.ask === "b") { R.ignored++; numHint(R); return; }   // Lv5 用數字鈕回答：點荷葉不算，數字鈕跳一下提示
    if (R.phase === "must") { if (n === q.ans) mustDone(R); else nag(R, pads[q.ans]); return; }
    if (n === R.frogAt) { R.ignored++; bounce(frogFx, 0.5); return; }   // 青蛙站的那片：不算作答
    hideFinger(R); R.tapsQ++;
    if (n === q.ans) { correct(R); return; }
    const dir = q.op === "+" ? 1 : -1;
    if (q.b >= 2 && n === q.a + dir && !R.neighborUsed) {   // 像下棋一片一片點：每局第一次只提示
      R.neighborUsed = true; R.lock = true; hush();
      pads[n].classList.remove("shake"); void pads[n].offsetWidth; pads[n].classList.add("shake"); play("tap", 0.9);
      sayW(R, LINES.howTo, () => { R.lock = false; }, true);
      return;
    }
    wrongAns(R, n === q.ans - dir, pads[n]);              // 把起點算進去：加法點 ans−1、減法點 ans＋1
  }
  function onChoice(v) {
    const R = run; if (!R || R.done || R.over || R.q.ask !== "b") return;
    if (R.lock || R.phase === "busy") { R.ignored++; return; }
    const btn = [...choices.children].find(b => +b.dataset.v === v);
    if (R.phase === "must") { if (v === R.q.ans) mustDone(R); else nag(R, [...choices.children].find(b => +b.dataset.v === R.q.ans)); return; }
    hideFinger(R); R.tapsQ++;
    if (v === R.q.ans) { correct(R); return; }
    wrongAns(R, v === R.q.b + 1, btn);                    // 把起點也數進去：多一下
  }

  // ---------- 結算：肚子圓滾滾、打個嗝 ----------
  function finishRound(R) {
    R.over = true; R.phase = "end"; R.lock = true;
    choices.classList.add("hop-hide"); fly.classList.add("hop-hide"); R.fly = { mode: "gone", at: null };
    frogFx.classList.add("hop-full");
    L(R, () => {
      burp.classList.remove("hop-hide");
      // 嗝冒在嘴巴前面；停在最右邊（第 9、10 片）／最左邊會被切掉 → 改放另一側（動畫最後放大 1.5 倍：左右各多出 1/4 寬）
      const m = mouthXY(), w = burp.offsetWidth || geo.u * 0.75, off = geo.frogW * 0.15, edge = 4, fits = x => x - w * 0.25 >= edge && x + w * 1.25 <= geo.W - edge;
      let x = R.facing > 0 ? m.x + off : m.x - off - w;
      if (!fits(x)) { const o = R.facing > 0 ? m.x - off - w : m.x + off; if (fits(o)) x = o; }
      x = Math.max(edge + w * 0.25, Math.min(geo.W - edge - w * 1.25, x));
      burp.style.left = px(x); burp.style.top = px(m.y - geo.u * 0.5);
      play("pop", 0.5); bounce(frogFx, 0.6);
      talk(LINES.full);
    }, 600);
    const r = { lv: R.lv, stars: starsOf(R.right, R.qs.length), right: R.right, wrong: R.wrong, total: R.qs.length };
    R.result = r;
    L(R, () => { R.done = true; try { api.onWin(r); } catch (e) { console.warn("[hop]", e); } }, D.full);
  }

  // ---------- 開局／停 ----------
  function begin(lv, qs) {
    stop();
    lv = lv >= 1 && lv <= 5 ? Math.floor(lv) : 1;
    run = { lv, qs, i: 0, q: null, right: 0, wrong: 0, streak: 0, flips: 0, eaten: 0, frogAt: null, facing: 1, phase: "ask", lock: false, over: false, done: false,
      neighborUsed: false, ignored: 0, numHints: 0, fingerN: 0, fingerOn: false, fingerDone: false, fly: { mode: "gone", at: null }, feetN: 0, feetOn: 0, counted: [], tapsQ: 0, wrongQ: 0, sayText: "", result: null };
    frogFx.classList.remove("hop-full"); frog.classList.remove("hop-out"); fly.classList.remove("hop-eaten");
    for (const d of prog.children) d.classList.remove("on");
    stage.classList.toggle("hop-lv5", lv === 5);
    layout();
    startQ(run);
  }
  function start(lv = 1) { const L5 = lv >= 1 && lv <= 5 ? Math.floor(lv) : 1; begin(L5, makeRound("hop", L5, N_DEFAULT, rnd)); }
  function stop() {
    const R = run; if (R) R.done = true; run = null;
    hideFinger(null); cancelAnims(frog); cancelAnims(frogFx); cancelAnims(fly);
    choices.classList.add("hop-hide"); burp.classList.add("hop-hide");
  }
  function sayCurrent() {                                 // 💬／🔊 再念一次題目（整句）；換題中、念算式時不念（不打斷「四加三等於七」）
    const R = run; if (!R || R.over || !R.q || R.phase === "busy" || R.lock) return;
    say(qFull(R.q));
  }

  const rect = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  function state() {
    const R = run; if (!R) return null; const q = R.q;
    return { lv: R.lv, i: R.i, total: R.qs.length, phase: R.phase, lock: R.lock, over: R.over, done: R.done,
      q: q && { op: q.op, a: q.a, b: q.b, c: q.c, ask: q.ask, ans: q.ans, choices: q.choices ? q.choices.slice() : null },
      right: R.right, wrong: R.wrong, streak: R.streak, flips: R.flips, eaten: R.eaten, frogAt: R.frogAt, facing: R.facing,
      feetN: R.feetN, feetOn: R.feetOn, neighborUsed: R.neighborUsed, ignored: R.ignored, numHints: R.numHints, fingerN: R.fingerN, fingerOn: R.fingerOn,
      glow: R.glow, fly: { ...R.fly }, counted: R.counted.slice(), sayText: R.sayText, eq: eqBox.textContent, result: R.result, rot: geo.rot, u: +geo.u.toFixed(1) };
  }
  // 測試掛鉤（只給測試用）
  const debug = {
    geo: () => ({ ...geo }),
    startWith(lv, facts) {                                // 指定題目開一局：facts＝[{ op, a, b }]（不足 10 題就照給的題數）
      const L5 = lv === 5;
      begin(lv, facts.map(f => { const c = f.op === "+" ? f.a + f.b : f.a - f.b, ans = L5 ? f.b : c; return { op: f.op, a: f.a, b: f.b, c, ask: L5 ? "b" : "c", ans, choices: L5 ? (f.choices || makeChoices(ans, rnd, 1, 9)) : null }; }));
    },
    skip() {                                              // 這題直接算答對、換下一題（不跑動畫；整合測試快轉用）
      const R = run; if (!R || R.over || !ready()) return false;   // 只在等小孩作答時（動畫跑一半不能跳）
      if (R.wrongQ === 0) { R.right++; R.streak++; }
      const d = prog.children[R.eaten]; if (d) d.classList.add("on"); R.eaten++;
      R.lock = true; R.phase = "busy"; hush(); next(R); return true;
    },
    rects: () => ({ stage: rect(stage), bar: rect(bar), card: rect(card), prog: rect(prog), pads: pads.map(rect), leaves: pads.map(b => rect(b.firstChild)), frog: rect(frog), tag: rect(startTag), choices: [...choices.children].map(rect), say: rect(sayBtn), rot: !rot.classList.contains("hop-hide") }),
  };
  const ready = () => !!(run && !run.over && !run.lock && (run.phase === "ask" || run.phase === "must"));
  const tapPad = n => { pads[n].click(); return state(); };
  const choose = v => { const b = [...choices.children].find(x => +x.dataset.v === v); if (b) b.click(); return !!b; };
  window.__zyHop = Object.assign(window.__zyHop || {}, {
    state, ready, tapPad, choose,
    answer: v => (run && run.q && run.q.ask === "b" ? choose(v) : tapPad(v)),   // 用荷葉或數字鈕回答 v
    right: () => { if (run && run.q) window.__zyHop.answer(run.q.ans); return state(); },   // 點正確答案
    skip: debug.skip, startWith: debug.startWith, geo: debug.geo, rects: debug.rects,
  });
  return { start, stop, sayCurrent, relayout: layout, state, debug };
}
