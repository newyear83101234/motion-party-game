// ===================== 注音小島：音符接接樂（v8 音樂島露天音樂台；docs/zhuyin-v8-plan.md §5）=====================
// 天上落下音符泡泡，每顆裝一個詞（圖＋國字，國字旁自動注音）；上方旗子寫目標「開頭是 ㄇ」或「結尾是 ㄠ」（旗子上有小圖示 ㄇ＿＿／＿＿ㄠ）。
// 手指在畫面上左右滑，大鼓就跑到手指正上方（只認第一根手指）；音符「底部碰到鼓面」就算接到：
//   對的＝咚＋彈出旋律的下一個音（《兩隻老虎》《小星星》老曲調，沒有版權）、目標符號從泡泡放大、金色飛到旗子上；
//   錯的＝噗、泡泡往上彈開變灰，上面跳出它「真正的」開頭／結尾符號停 0.8 秒（不扣東西、不唸答案）；
//   對的沒接到＝掉下去就算了；連續漏掉 3 顆對的 → 之後對的音符發光（cg-glow），接到一顆就恢復。
// 一局＝接滿 10 顆對的（旋律剛好完整）；結算前整首重播，進度 ♪ 一顆一顆亮、鼓跟著跳、接到的 10 個詞排一排跟著彈。
// 看注音的遊戲：詞不出聲；只有 Lv4 是聽音題（開題唸一次那個詞，旗子放它的圖、不放注音；🔊 再聽，聽的時候音符全部停住）。
// 開局：旗子先在畫面中間放大 1 秒再回到上面；每種目標（開頭／結尾）這次開機第一次玩時唸一次規則（規則、不是答案）。
// Lv2 開局先放一顆示範泡泡（兩個字的詞，挑「第一個字的結尾＝目標」的那種最會騙人的），整個詞的注音排開、最後一個符號閃 2 次。
// 星星：3 星＝錯接 ≤1、2 星＝錯接 ≤3、其他 1 星；Lv3 起整局一個金星沙漏（只決定 3 星能不能拿，不扣、不會結束遊戲）。
// 公平：同一時間，對的和錯的不會掉在同一條路線上（躲不開＝小孩會怪自己）。Lv1–2 不限時。
//
// 介面（主程式照這個接）：createCatchGame(root, api) → { start(lv), stop(), sayCurrent(), relayout(), state(), debug }
//   api：say(text) talk(text) play(name, rate) later(fn, ms)＝gLater（暫停凍結） paused() words（WORDS） audio()＝{ ctx, out }（Web Audio，彈旋律）
//        onWin({ lv, stars, wrong, caught, late })

export const NEED = 10;                                  // 一局接滿幾顆對的
export const LANES = 5;
export const WMAX = 2;                                   // 泡泡裝得下的詞長：三個字的詞＋旁注音塞不進 19vmin 的泡泡（字會小到看不清）→ 這個遊戲不出
const TONE = /[ˊˇˋ˙]/g;
const INITIALS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ";
// 一個字的注音 → 去掉聲調；「最後一個符號」＝押韻看的那個（ㄧㄠ→ㄠ）；只有聲母的音節（ㄕ、ㄗ…）跟輕聲字不拿來押韻
export const sylls = z => z.split(" ");
export const firstSym = z => z.replace(TONE, "")[0];
export function lastSym(z) {
  const s = sylls(z), last = s[s.length - 1];
  if (last.includes("˙")) return null;                  // 輕聲（兔子、獅子）
  const t = last.replace(TONE, ""); if (t.length === 1 && INITIALS.includes(t)) return null;   // 只有聲母（老師的師）
  return t[t.length - 1];
}
// 目標：{ kind: "first"|"last", sym, word?（Lv4 聽音題念的詞） }；詞要 ≥ 5 個才當目標（夠接 10 顆不太重複）
export function targets(words, kind, { oneSyl = false } = {}) {
  const by = {};
  for (const w of words) {
    if (oneSyl && w.z.includes(" ")) continue;
    const k = kind === "first" ? firstSym(w.z) : lastSym(w.z);
    if (!k || (kind === "first" && !INITIALS.includes(k))) continue;   // 沒有聲母的詞（鴨 ㄧㄚ、魚 ㄩ）不當「開頭是」的目標
    (by[k] = by[k] || []).push(w);
  }
  return Object.entries(by).filter(([, ws]) => ws.length >= (oneSyl ? 3 : 5)).map(([sym, ws]) => ({ kind, sym, words: ws }));
}
// 聽音題（Lv4）不用的混淆組：ㄣ/ㄥ、ㄢ/ㄤ（台灣口音與合成語音常聽不出）
const CONFUSE = { "ㄣ": "ㄥ", "ㄥ": "ㄣ", "ㄢ": "ㄤ", "ㄤ": "ㄢ" };
export function matches(t, w) { return t.kind === "first" ? firstSym(w.z) === t.sym : lastSym(w.z) === t.sym; }
// 干擾詞：不符合目標；Lv4 起優先「開頭一樣但結尾不同」；聽音題排除聽不出差別的那組
export function distractors(words, t, lv, prompt) {
  let pool = words.filter(w => !matches(t, w) && (t.kind === "first" || lastSym(w.z)));
  if (t.kind === "last" && lv >= 4) pool = pool.filter(w => lastSym(w.z) !== CONFUSE[t.sym]);
  if (lv >= 4 && prompt) { const same = pool.filter(w => firstSym(w.z) === firstSym(prompt.z)); if (same.length >= 2) return [...same, ...same, ...pool]; }   // 開頭一樣的多抽一點
  return pool;
}
// 五個等級：kind 目標種類、fall 速度旋鈕（出生到碰到鼓面＝fall×FALL_FRAC 秒）、max 同時幾顆、drift 左右飄、listen 聽音題、swap 中間換目標、hg 整局沙漏秒數（0＝不限時）
export const LV = {
  1: { kind: "first", fall: 6.2, max: 3, gap: 1.5, drift: 0, hg: 0 },   // 一個字的詞太少（每組 ≤6）→ 兩個字的也放（開頭＝最左邊那個符號，好找）
  2: { kind: "last", fall: 5.8, max: 3, gap: 1.4, drift: 0, hg: 0 },
  3: { kind: "last", fall: 4.8, max: 4, gap: 1.15, drift: 0.6, hg: 75 },
  4: { kind: "last", fall: 5.2, max: 4, gap: 1.25, drift: 0.3, hg: 80, listen: true },
  5: { kind: "mix", fall: 4.6, max: 4, gap: 1.1, drift: 0.6, hg: 75, swap: 5 },
};
export const FALL_FRAC = 0.87 / 1.15;                   // 出生到「底部碰到鼓面」的秒數＝fall×這個（＝舊版從 y=-0.12 掉到舊判定點的時間；出生點移到旗子下面，總時間不變，Lv1 約 4.7 秒）
export const GOOD_W = 0.35, BAD_W = 0.2;                // 左右判定（像素）：對的＝鼓半寬＋音符半徑×0.35；錯的＝鼓半寬－音符半徑×0.2（錯的窄一點，小孩滑過去比較不會誤接）
export const starsOf = (wrong, late) => Math.min(late ? 2 : 3, wrong <= 1 ? 3 : wrong <= 3 ? 2 : 1);
// 旋律（老曲調，沒有版權）：C 大調，半音數（0＝Do）
const SONGS = [
  { name: "兩隻老虎", notes: [0, 2, 4, 0, 0, 2, 4, 0, 4, 5], end: [7, 4, 5, 7] },
  { name: "小星星", notes: [0, 0, 7, 7, 9, 9, 7, 5, 5, 4], end: [4, 2, 2, 0] },
];
const RULE = { first: "接住開頭是這個注音的音符！", last: "接住結尾是這個注音的音符！" };   // 說的是規則、不是答案（聽音題 Lv4 開題自己唸詞，不另外唸規則）

export function createCatchGame(root, api) {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  root.innerHTML = "";
  const stage = el("div", "cg-stage"), flag = el("div", "cg-flag"), prog = el("div", "cg-prog"), drum = el("div", "cg-drum"), strip = el("div", "cg-strip", "👆 手指在這裡左右滑");
  drum.innerHTML = '<span class="cg-drum-in"><span class="cg-drum-top"></span><span class="cg-drum-body">🥁</span></span>';   // 壓扁／跳的動畫做在 cg-drum-in（外框 cg-drum 的位置大小不變，量鼓面用它）
  const drumIn = drum.firstChild, drumTop = drumIn.firstChild;
  const hgBox = el("div", "cg-hg hidden"); hgBox.setAttribute("aria-hidden", "true"); hgBox.innerHTML = '<span class="cg-hg-ico">⏳</span><span class="cg-hg-bar"><b></b></span>';   // Lv3 起整局一個金星沙漏：沙子蓋滿以前接滿＝可以拿 3 星（蓋滿了變銀色，遊戲照玩）
  stage.append(flag, prog, hgBox, drum, strip); root.appendChild(stage);
  const WL = (api.words || []).filter(w => [...w.h].length <= WMAX);   // 這個遊戲用的詞（一、兩個字）
  let run = null, raf = 0, last = 0, starts = 0, dongs = 0;
  const ruleSaid = new Set();                            // 這次開機唸過哪種規則（開頭／結尾各唸一次）
  const W = () => stage.clientWidth || innerWidth, H = () => stage.clientHeight || innerHeight;
  // ---------- 量畫面：鼓面高度、鼓半寬、音符半徑、上方介面（旗子／進度／沙漏）的底邊（relayout、start、畫面大小變了都重量） ----------
  const geo = { w: 0, h: 0, face: 0, half: 0, r: 0, top: 0, spawn: 0, path: 1, dirty: true };
  function measure() {
    const w = W(), h = H(), sr = stage.getBoundingClientRect(), dr = drum.getBoundingClientRect();
    const pr = el("div", "cg-note"); pr.style.visibility = "hidden"; stage.appendChild(pr); const r = pr.offsetWidth / 2 || Math.min(w, h) * 0.095; pr.remove();
    let top = 0; for (const e of [flag, prog, hgBox]) if (!e.classList.contains("hidden") && e.offsetHeight) top = Math.max(top, e.offsetTop + e.offsetHeight);   // offset 不受動畫 transform 影響（旗子放大中也量得準）
    const face = dr.height ? dr.top - sr.top + drumTop.offsetTop : h * 0.64;
    let spawn = top + r + h * 0.012, path = face - r - spawn;
    if (path < h * 0.2) { path = h * 0.2; spawn = face - r - path; }   // 很扁的畫面：保底落一段
    Object.assign(geo, { w, h, face, half: (dr.width || w * 0.18) / 2, r, top, spawn, path, dirty: !dr.height || !sr.height });
  }
  // ---------- 鼓：只認第一根手指；手指在畫面任何地方，鼓就跑到手指正上方 ----------
  let drumX = 0.5, finger = null; const downs = new Set();
  const setDrum = x => { drumX = x; drum.style.left = (x * 100).toFixed(2) + "%"; };
  const moveTo = e => { if (!run || run.done) return; const r = stage.getBoundingClientRect(); setDrum(Math.min(0.94, Math.max(0.06, (e.clientX - r.left) / r.width))); };
  stage.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;               // 按鈕（Lv4 旗子的 🔊）不抓指標，不然 click 會被改派給舞台（里維 11-01）；按鈕自己也 stopPropagation
    downs.add(e.pointerId); if (finger !== null) return;  // 第二根手指（兄弟姊妹指螢幕）不動鼓
    finger = e.pointerId; try { stage.setPointerCapture(e.pointerId); } catch (er) {} moveTo(e);
  });
  stage.addEventListener("pointermove", e => {
    if (finger === null && downs.has(e.pointerId)) { finger = e.pointerId; try { stage.setPointerCapture(e.pointerId); } catch (er) {} }   // 第一根放開了：還按著的那根接手
    if (e.pointerId === finger) moveTo(e);
  });
  const lift = e => { downs.delete(e.pointerId); if (e.pointerId === finger) finger = null; };
  stage.addEventListener("pointerup", lift); stage.addEventListener("pointercancel", lift);
  // ---------- 聲音：旋律（木琴感：三角波＋快速衰減）、咚（低頻鼓聲，掃頻正弦波） ----------
  function note(semi, t0 = 0, dur = 0.45, vol = 0.32) {
    const A = api.audio && api.audio(); if (!A || !A.ctx) return;
    const ac = A.ctx, t = ac.currentTime + t0, f = 523.25 * Math.pow(2, semi / 12);
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.out || ac.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function dong() {
    dongs++; const A = api.audio && api.audio(); if (!A || !A.ctx) { api.play("tap", 0.8); return; }   // 沒有 Web Audio：退回原本的 tap 音效
    const ac = A.ctx, t = ac.currentTime, out = A.out || ac.destination;
    for (const [type, f0, f1, vol, dur] of [["sine", 150, 55, 0.6, 0.24], ["triangle", 320, 120, 0.18, 0.06]]) {   // 低頻的「咚」＋一點點鼓皮的「啪」
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.03);
    }
  }
  // ---------- 小動畫（Web Animations；元素位置由程式寫 transform） ----------
  const tf = (x, y, s = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s})`;
  const anim = (e, kf, o) => { try { return e.animate(kf, o); } catch (er) { return null; } };
  const squash = () => anim(drumIn, [{ transform: "scale(1, 1)" }, { transform: "scale(1.14, 0.8)", offset: 0.4 }, { transform: "scale(1, 1)" }], { duration: 120, easing: "ease-out" });   // 接到：鼓壓扁再彈回
  const jump = () => anim(drumIn, [{ transform: "translateY(0) scale(1, 1)" }, { transform: "translateY(-2.6vmin) scale(0.95, 1.06)", offset: 0.45 }, { transform: "translateY(0) scale(1.1, 0.88)", offset: 0.8 }, { transform: "translateY(0) scale(1, 1)" }], { duration: 250, easing: "ease-out" });
  const bop = e => anim(e, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-2.4vmin) scale(1.15)", offset: 0.4 }, { transform: "translateY(0) scale(1)" }], { duration: 260, easing: "ease-out" });
  // ---------- 旗子 ----------
  function setFlag() {
    const t = run.t; flag.innerHTML = ""; flag.classList.remove("cg-cmp");
    const pos = el("span", "cg-pos " + t.kind); pos.setAttribute("aria-hidden", "true");   // 小圖示：ㄉ＿＿（開頭）／＿＿ㄠ（結尾）；聽音題＝最後一格亮著、不放注音
    for (let i = 0; i < 3; i++) { const on = t.kind === "first" ? i === 0 : i === 2; pos.appendChild(el("i", on ? "on" : "", on && !t.listen ? t.sym : "")); }
    const k = el("span", "cg-flag-k"); k.append(el("span", "cg-flag-t", t.listen ? "跟它押韻" : t.kind === "first" ? "開頭是" : "結尾是"), pos);
    if (t.listen) {
      const b = el("button", "cg-flag-pic"); b.type = "button"; b.append(el("span", "cg-pic", t.word.e), el("span", "cg-say", "🔊"));
      b.addEventListener("pointerdown", e => e.stopPropagation());   // 按 🔊 鼓不跳到旗子那裡
      b.onclick = () => sayPrompt(); flag.append(k, b);
    } else flag.append(k, el("b", "cg-flag-sym", t.sym));
  }
  // 旗子先在畫面中間放大 hold 毫秒再回到上面（開局、Lv5 換目標）；這段時間音符不掉、沙漏不走
  function presentFlag(R, hold = 1000) {
    R.busy++; flag.style.transition = "none"; flag.style.transform = ""; flag.classList.add("cg-big");
    requestAnimationFrame(() => {                         // 等旁注音加好（旗子寬度定了）再量
      if (run !== R) return;
      const sr = stage.getBoundingClientRect(), fr = flag.getBoundingClientRect();
      const dx = sr.left + sr.width / 2 - (fr.left + fr.width / 2), dy = sr.top + sr.height * 0.4 - (fr.top + fr.height / 2);
      const s = Math.min(1.45, (sr.width * 0.92) / Math.max(1, fr.width));
      flag.style.transition = "transform 0.35s cubic-bezier(.2,1.3,.4,1)"; flag.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})`;
    });
    api.later(() => { if (run !== R) return; flag.style.transition = "transform 0.35s ease-in"; flag.style.transform = ""; }, 350 + hold);
    api.later(() => { if (run !== R) return; flag.classList.remove("cg-big"); flag.style.transition = ""; R.busy--; }, 350 + hold + 380);
  }
  function sayPrompt() { if (!run || !run.t.listen) return; run.hold = performance.now() + 1800; api.say(run.t.word.h); }   // 聽的時候音符全部停住（1.8 秒）
  function pickTarget(kind, lv, avoid) {
    const L = LV[lv];
    let list = targets(WL, kind, { oneSyl: !!L.oneSyl }); if (avoid) list = list.filter(t => t.sym !== avoid);
    if (L.listen) list = list.filter(t => t.words.length >= 5);
    const t = list[Math.floor(Math.random() * list.length)];
    const out = { kind, sym: t.sym, words: t.words, listen: !!L.listen };
    if (L.listen) out.word = t.words[Math.floor(Math.random() * t.words.length)];
    return out;
  }
  function start(lv = 1) {
    stop(); lv = LV[lv] ? lv : 1; const L = LV[lv];
    const kind = L.kind === "mix" ? (Math.random() < 0.5 ? "first" : "last") : L.kind;
    run = { lv, L, t: pickTarget(kind, lv), notes: [], caught: 0, wrong: 0, miss: 0, got: [], ev: [], spawnAt: 0.8, elapsed: 0, done: false, hold: 0, busy: 0,
      song: SONGS[(lv - 1) % SONGS.length], swapped: false, recent: [], demo: null, noSpawn: false };
    prog.innerHTML = ""; for (let i = 0; i < NEED; i++) prog.appendChild(el("i", "", "♪"));
    setDrum(0.5); setFlag();
    hgBox.classList.toggle("hidden", !L.hg); hgBox.classList.remove("late"); hgBox.style.setProperty("--p", "0");
    measure(); geo.dirty = true;                         // 第一格再量一次（旁注音加好、畫面確定顯示以後）
    const R = run; starts++;
    presentFlag(R, 1000);
    if (R.t.listen) api.later(() => { if (run === R) sayPrompt(); }, 600);
    else if (!ruleSaid.has(kind)) { ruleSaid.add(kind); api.later(() => { if (run === R && !R.done) api.talk(RULE[kind]); }, starts === 1 ? 4200 : 400); }   // 第一次開這個遊戲：主程式可能正在唸開場語，晚一點再唸（不然會把它切掉）
    if (lv === 2) api.later(() => { if (run === R) demo(R); }, 1700);   // 旗子回到上面前一刻接上示範（中間不會漏掉一格空檔）
    last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf); raf = 0; if (run) { for (const n of run.notes) n.el.remove(); run.done = true; } run = null; hgBox.classList.add("hidden");
    stage.querySelectorAll(".cg-fx, .cg-note").forEach(e => e.remove());
    flag.style.transition = ""; flag.style.transform = ""; flag.classList.remove("cg-big", "cg-cmp");
  }
  // ---------- Lv2 示範泡泡：兩個字的詞，整個詞的注音排開、最後一個符號閃 2 次（跟旗子的符號一起閃，讓小孩對照） ----------
  function demoWord(t) {
    const two = WL.filter(w => [...w.h].length === 2 && lastSym(w.z)), head = w => lastSym(sylls(w.z)[0]);
    const trap = two.filter(w => head(w) === t.sym && lastSym(w.z) !== t.sym);   // 最會騙人的：第一個字的結尾＝目標（跳舞：跳 ㄊㄧㄠ，可是整個詞結尾是 ㄨ）
    const pos = two.filter(w => lastSym(w.z) === t.sym && head(w) !== t.sym);
    const L = trap.length ? trap : pos.length ? pos : t.words; return L[Math.floor(Math.random() * L.length)] || null;
  }
  function demo(R) {
    const w = demoWord(R.t); if (!w) return;
    R.busy++;
    const sy = sylls(w.z).map(s => s.replace(TONE, "")), ls = lastSym(w.z), trap = ls !== R.t.sym;
    const box = el("div", "cg-demo cg-fx"), b = el("div", "cg-note cg-demo-note l" + Math.min(WMAX, [...w.h].length)), zr = el("div", "cg-demo-z");
    b.append(el("span", "cg-em", w.e), el("span", "cg-han", w.h));
    sy.forEach((s, si) => { const g = el("span", "cg-demo-syl"); [...s].forEach((c, ci) => g.appendChild(el("span", si === sy.length - 1 && ci === s.length - 1 ? "cg-demo-last" : "", c))); zr.appendChild(g); });
    box.append(b, zr); stage.appendChild(box);
    R.demo = { h: w.h, z: w.z, last: ls, trap };
    api.later(() => { if (run === R) { box.classList.add("cg-flash"); flag.classList.add("cg-cmp"); } }, 450);   // 閃 2 次（CSS 動畫 2 輪 × 0.8 秒）
    api.later(() => { if (run === R) { box.classList.add(trap ? "cg-out" : "cg-ok"); flag.classList.remove("cg-cmp"); } }, 2150);   // 結尾不一樣＝變灰飄走（跟錯接一樣）；一樣＝金色掉進鼓
    api.later(() => { box.remove(); if (run === R) { R.demo = null; R.busy--; } }, 2750);
  }
  // ---------- 生音符：路線空著才放；對的約一半；同一時間對／錯不在同一條路線；出生點在上方介面下面 ----------
  function laneFree(k) { return !run.notes.some(n => n.lane === k && !n.gone && n.y * geo.h - geo.spawn < geo.r * 2.2); }
  function pickWord(good) {
    const pool = good ? run.t.words.filter(w => !run.t.word || w.h !== run.t.word.h) : distractors(WL, run.t, run.lv, run.t.word);   // Lv4：唸的那個詞本身不掉（旗子上有它的圖，看圖就接得到＝不用聽）
    const fresh = pool.filter(w => !run.recent.includes(w.h)), src = fresh.length ? fresh : pool;
    return src[Math.floor(Math.random() * src.length)] || null;
  }
  function addNote(w, good, lane, y) {
    const e = el("div", "cg-note l" + Math.min(WMAX, [...w.h].length) + (good ? " good" : "") + (good && run.miss >= 3 ? " cg-glow" : ""));   // 連續漏掉 3 顆對的：對的發光，接到一顆就恢復
    e.append(el("span", "cg-em", w.e), el("span", "cg-han", w.h)); stage.insertBefore(e, drum);   // 畫在鼓後面：沒接到的從鼓後面掉下去
    const n = { el: e, w, good, lane, y, x0: (lane + 0.5) / LANES, x: (lane + 0.5) / LANES, ph: Math.random() * 6, gone: false, passed: false, skip: false };
    run.notes.push(n); place(n); return n;
  }
  function place(n) {
    n.x = n.x0 + (run.L.drift ? Math.sin(run.elapsed * 1.3 + n.ph) * 0.05 * run.L.drift : 0);
    n.el.style.transform = `translate(${(n.x * geo.w).toFixed(1)}px, ${(n.y * geo.h).toFixed(1)}px) translate(-50%, -50%)`;
  }
  function spawn() {
    const free = []; for (let k = 0; k < LANES; k++) if (laneFree(k)) free.push(k);
    if (!free.length || run.notes.filter(n => !n.gone).length >= run.L.max) return false;
    const wantGood = run.notes.filter(n => !n.gone && n.good).length === 0 || Math.random() < 0.5;
    const w = pickWord(wantGood); if (!w) return false;
    const ok = free.filter(k => !run.notes.some(n => n.lane === k && !n.gone && n.good !== wantGood)); if (!ok.length) return false;   // 這一條路線上還有「另一種」的音符就換一條
    run.recent = [...run.recent.slice(-5), w.h];
    addNote(w, wantGood, ok[Math.floor(Math.random() * ok.length)], geo.spawn / geo.h);
    return true;
  }
  function frame(ms) {
    raf = requestAnimationFrame(frame); if (!run || run.done) return;
    const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0; last = ms;
    if ((api.paused && api.paused()) || run.busy > 0 || performance.now() < run.hold) return;   // 暫停選單／旗子放大／示範／聽音題：全部停住
    const w = W(), h = H(); if (geo.dirty || geo.w !== w || geo.h !== h) measure();
    run.elapsed += dt;
    if (run.L.hg) { hgBox.style.setProperty("--p", Math.min(1, run.elapsed / run.L.hg).toFixed(3)); hgBox.classList.toggle("late", run.elapsed > run.L.hg); }
    if (!run.noSpawn) { run.spawnAt -= dt; if (run.spawnAt <= 0) { if (spawn()) run.spawnAt = run.L.gap * (0.8 + Math.random() * 0.4); else run.spawnAt = 0.25; } }
    const { r, face, half } = geo, step = geo.path / (FALL_FRAC * run.L.fall) * dt, cands = [];
    for (const n of run.notes) {
      if (n.gone) continue;
      n.y += (n.passed ? step * 3 : step) / h;            // 掉過鼓面的加速掉下去
      place(n);
      const cy = n.y * h;
      if (!n.passed) {
        if (cy > face + r) { n.passed = true; n.el.classList.add("cg-past"); }   // 中心超過鼓面半顆音符（＝半徑）：接不到了
        else if (cy + r >= face) {                        // 底部碰到鼓面：看左右
          const dx = Math.abs(n.x - drumX) * w, lim = n.good ? half + r * GOOD_W : half - r * BAD_W;
          if (dx < lim) { if (!n.skip) cands.push({ n, dx, lim, bottom: cy + r }); } else n.skip = false;
        }
      }
      if (cy > h + r + 4) { n.gone = true; n.el.remove(); if (n.good) run.miss++; }   // 對的掉出畫面＝漏掉一顆
    }
    if (cands.length) {                                   // 同一格碰到兩顆：只接離鼓中心最近的那顆（其他的這次滑過去不算，離開鼓的範圍才重新算）
      cands.sort((a, b) => a.dx - b.dx); for (const c of cands.slice(1)) c.n.skip = true;
      const c = cands[0]; run.ev.push({ good: c.n.good, h: c.n.w.h, lane: c.n.lane, t: +run.elapsed.toFixed(2), bottom: +c.bottom.toFixed(1), face: +face.toFixed(1), dx: +c.dx.toFixed(1), lim: +c.lim.toFixed(1), step: +step.toFixed(2), others: cands.length - 1 });
      catchNote(c.n);
    }
    run.notes = run.notes.filter(n => !n.gone || n.el.isConnected);
  }
  function catchNote(n) {
    n.gone = true; const e = n.el, cx = n.x * geo.w, cy = n.y * geo.h;
    squash();
    if (n.good) {
      const i = run.caught++; run.miss = 0; run.got.push(n.w);
      note(run.song.notes[i % run.song.notes.length]); dong();
      e.classList.add("cg-got"); anim(e, [{ transform: tf(cx, cy), opacity: 1 }, { transform: tf(cx, geo.face + geo.r * 0.2, 0.35), opacity: 0 }], { duration: 240, easing: "ease-in", fill: "forwards" }); setTimeout(() => e.remove(), 260);
      flySym(cx, cy);
      prog.children[i] && prog.children[i].classList.add("on");
      if (run.L.swap && run.caught === run.L.swap && !run.swapped) swapTarget();
      if (run.caught >= NEED) finish();
    } else {
      run.wrong++; api.play("ng", 0.5); e.classList.add("cg-miss");
      const real = run.t.kind === "first" ? firstSym(n.w.z) : lastSym(n.w.z);   // 它真正的開頭／結尾（灰色、放大，跟旗子對照；不出聲）
      if (real) e.appendChild(el("span", "cg-real", real));
      const up = cy - geo.r * 0.9;                       // 往上彈開（0.3 秒）→ 停 0.8 秒 → 淡掉（0.3 秒）
      anim(e, [{ transform: tf(cx, cy), opacity: 1, easing: "ease-out" }, { transform: tf(cx, up - geo.r * 0.15), opacity: 1, offset: 0.15, easing: "ease-in-out" }, { transform: tf(cx, up), opacity: 1, offset: 0.214 }, { transform: tf(cx, up), opacity: 1, offset: 0.786, easing: "ease-in" }, { transform: tf(cx, up - geo.r * 0.3), opacity: 0 }], { duration: 1400, fill: "forwards" });   // 緩動寫在每一段（整體 easing 會把「停住」那段也壓縮掉）
      setTimeout(() => e.remove(), 1450);
    }
  }
  function flySym(cx, cy) {                               // 接到對的：目標符號從泡泡放大、金色飛到旗子上
    const tgt = flag.querySelector(".cg-flag-sym, .cg-flag-pic"); if (!tgt) return;
    const sr = stage.getBoundingClientRect(), tr = tgt.getBoundingClientRect(), tx = tr.left - sr.left + tr.width / 2, ty = tr.top - sr.top + tr.height / 2;
    const f = el("div", "cg-fly cg-fx", run.t.sym); stage.appendChild(f);
    const a = anim(f, [{ transform: tf(cx, cy, 0.5), opacity: 1 }, { transform: tf(cx, cy - geo.r * 1.1, 1.7), opacity: 1, offset: 0.32 }, { transform: tf(tx, ty, 0.8), opacity: 0.3 }], { duration: 760, easing: "ease-in-out", fill: "forwards" });
    const done = () => { if (!f.isConnected) return; f.remove(); anim(tgt, [{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 300 }); };
    if (a) a.onfinish = done; setTimeout(done, 900);
  }
  function swapTarget() {                               // Lv5：先清場、停一下、翻旗子（在中間放大 1 秒再回去）；剛剛對的不會突然變錯
    const R = run; R.swapped = true; R.busy++;
    for (const n of R.notes) if (!n.gone) { n.gone = true; n.el.classList.add("cg-fade"); setTimeout(() => n.el.remove(), 400); }
    api.later(() => {
      if (run !== R || R.done) return;
      const k = R.t.kind === "first" ? "last" : "first"; R.t = pickTarget(k, R.lv, R.t.sym);
      for (const n of R.notes) if (!n.gone) { n.gone = true; n.el.remove(); }   // 翻旗子時再清一次（保險）
      setFlag(); api.play("flip"); api.talk("換題目囉！"); presentFlag(R, 1000); R.busy--;
    }, 900);
  }
  function finish() {
    const R = run; R.done = true; const late = !!R.L.hg && R.elapsed > R.L.hg, r = { lv: R.lv, stars: starsOf(R.wrong, late), wrong: R.wrong, caught: R.caught, late };
    for (const n of R.notes) if (!n.gone) n.el.remove();
    const s = R.song, seq = [...s.notes, ...s.end], T0 = 0.35, STEP = 0.28;
    seq.forEach((k, i) => note(k, T0 + i * STEP, 0.4, 0.26));   // 整首重播一次（音用 Web Audio 時鐘排，節拍才穩）
    const row = el("div", "cg-row cg-fx"); for (const w of R.got) { const c = el("span", "cg-row-w"); c.append(el("span", "cg-row-em", w.e), el("span", "cg-row-han", w.h)); row.appendChild(c); } stage.appendChild(row);
    for (const p of prog.children) p.classList.remove("on");   // 進度的 ♪ 跟著每個音重新一顆一顆亮
    seq.forEach((k, i) => api.later(() => {
      if (run !== R) return; jump();
      if (i < NEED) { const p = prog.children[i]; if (p) { p.classList.remove("on"); void p.offsetWidth; p.classList.add("on"); } if (row.children[i]) bop(row.children[i]); }
      else { for (const p of prog.children) bop(p); for (const c of row.children) bop(c); }   // 尾聲：全部一起跳
    }, Math.round((T0 + i * STEP) * 1000)));
    api.later(() => { try { api.onWin(r); } catch (e) { console.warn("[catch]", e); } }, 600 + seq.length * 280);
  }
  const noteState = n => ({ h: n.w.h, good: n.good, lane: n.lane, y: +n.y.toFixed(3), x: +n.x.toFixed(4), glow: n.el.classList.contains("cg-glow") });
  return {
    start, stop, sayCurrent: sayPrompt,
    relayout() { measure(); if (run) for (const n of run.notes) if (!n.gone) place(n); },
    state: () => run ? { lv: run.lv, caught: run.caught, wrong: run.wrong, target: { kind: run.t.kind, sym: run.t.sym, word: run.t.word && run.t.word.h }, notes: run.notes.filter(n => !n.gone).map(noteState),
      elapsed: run.elapsed, hg: run.L.hg, late: !!run.L.hg && run.elapsed > run.L.hg, swapped: run.swapped, done: run.done, miss: run.miss, busy: run.busy, demo: run.demo, drumX } : null,
    debug: { catchNote: i => { const n = run && run.notes.filter(q => !q.gone)[i]; if (n) catchNote(n); return !!n; }, moveDrum: x => setDrum(x),
      age: s => { if (run) run.elapsed += s; return run ? run.elapsed : 0; },   // 測試用：讓這一局「已經玩了 s 秒」（驗沙漏）
      geo: () => ({ ...geo }), events: () => run ? run.ev.slice() : [], finger: () => finger, dongs: () => dongs,
      noSpawn: on => { if (run) run.noSpawn = !!on; }, clear: () => { if (run) { for (const n of run.notes) { n.gone = true; n.el.remove(); } run.notes = []; } },
      drop: ({ good = true, lane = 2, y } = {}) => { if (!run) return null; const w = pickWord(good); if (!w) return null; const n = addNote(w, good, lane, y === undefined ? geo.spawn / geo.h : y); return noteState(n); } },   // 測試用：在指定路線／高度放一顆
  };
}
