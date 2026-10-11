// ===================== 注音小島（注音小遊戲 v3）=====================
// 目標玩家：5 歲、已會拼讀注音的小孩。純手指點、無命制。
// 八個模式：釣魚 / 點餐 / 積木 / 尋寶 / 翻牌 / 聲調氣球 / 打地鼠 / 跳跳蛙（後兩個 2026-10-10 加）。長期動力：貼紙圖鑑（每個詞一張貼紙）＋星星罐孵蛋（解鎖朋友）。
// 設計依據：櫻木花道（遊戲設計）＋寧次（UI/UX）2026-09-09 審查報告；規格見 memory project-zhuyin-game.md
import { WORDS, PHRASES, CATS, FRIENDS } from "./zhuyin-words.js";
import { startAnnotate, missing as zMissing } from "./zhuyin-ann.js?v=4";
import { voiceUnlock, voiceSay, voiceStop, voiceSpeaking, voicePreload, voiceCtx } from "./zhuyin-voice.js?v=3";
import * as RW from "./zhuyin-rewards.js?v=1";   // 獎勵系統（扭蛋機）純邏輯
import { createClock } from "./zhuyin-clock.js?v=1";   // 日夜時鐘（真實 30 分鐘＝小島一天）
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
  bubble: { rounds: 1, need: 30, intro: "發射泡泡，救出小企鵝！",       bgm: "island" },   // 阿葉 10-11：泡泡救援灣（GPT 提案）
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

// ---------- 拋光：共用動畫 ----------
// A 組「遊戲手感」（docs/zhuyin-polish-backlog.md A1–A20）。這一段只管「表現」：答對／答錯／金銀星／提示時機／存檔規則都沒動。
// 裝飾出錯不能卡住遊戲 → 呼叫點一律包 PZ()（只 console.warn；tools/zy-test/polish.js 會檢查沒有 [polish] 警告）
const PZ = fn => { try { return fn(); } catch (e) { console.warn("[polish]", (e && e.message) || e); return undefined; } };
const pzVm = () => Math.min(innerWidth, innerHeight) / 100;
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];                // A1：連對一題升一個音（大調 Do Re Mi Fa So La Si Do）
const stepRate = k => 2 ** (MAJOR[Math.max(0, Math.min(k, 7))] / 12);
document.addEventListener("touchstart", () => {}, { passive: true });   // A2：iOS Safari 要有 touchstart 監聽，:active 才會在手指按下時亮
// A2：手指一碰就算（pointerdown，不等放開）；鍵盤 Enter／空白鍵送出的 click（detail 0）照樣能用
function onTap(e, fn) {
  let last = -1e9;
  e.addEventListener("pointerdown", ev => { if (ev.button > 0) return; last = performance.now(); fn(ev); });
  e.addEventListener("click", ev => { if (ev.detail === 0 && performance.now() - last > 800) fn(ev); });
}
const rectOf = t => (t.getBoundingClientRect ? t.getBoundingClientRect() : { left: t.x, top: t.y, width: 0, height: 0 });
const ctr = (r, at = [0.5, 0.5]) => ({ x: r.left + r.width * at[0], y: r.top + r.height * at[1] });
// A8：把 src 的分身沿弧線飛到 target（元素或 {x,y}）、縮到 scale；回傳 Promise（飛到就 resolve，中途換畫面也會 resolve）
//   text：飛的是一個字／emoji（不複製 src）；hide：飛的時候把原本那個藏起來；from：起點改用這個框（拖曳放開的位置）
function flyTo(src, target, { dur = 550, scale = 0.3, lift = 10, text, at, hide = false, from } = {}) {
  return new Promise(done => {
    const v = pzVm(), a = from || rectOf(src), p0 = ctr(a), p1 = ctr(rectOf(target), at);
    let g;
    if (text !== undefined) { const s = 7 * v; g = el("div", "flyer txt", text); g.style.cssText = `left:${p0.x - s / 2}px;top:${p0.y - s / 2}px;width:${s}px;height:${s}px;font-size:${6 * v}px`; }
    else {
      g = src.cloneNode(true); g.removeAttribute("id"); g.classList.remove("ok", "ng", "dim", "used", "wiggle", "bounce", "lifted", "hinted", "enter", "golden");
      g.classList.add("flyer"); g.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    }
    $("fx").appendChild(g); if (hide) src.style.visibility = "hidden";
    const dx = p1.x - p0.x, dy = p1.y - p0.y, sm = (1 + scale) / 2 + 0.12;
    let fin = false; const end = () => { if (fin) return; fin = true; g.remove(); done(); };
    const an = g.animate([{ transform: "translate(0px, 0px) scale(1)", easing: "ease-out" },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift * v}px) scale(${sm})`, offset: 0.5, easing: "ease-in" },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], { duration: dur, fill: "forwards" });
    an.onfinish = end; setTimeout(end, dur + 400);
  });
}
// 噴碎片（A7）：glyphs＝字／emoji，或 colors＝色塊；往外噴、再受重力往下掉
function fxSpray(target, n, { glyphs, colors, size = 4.5, dist = 13, grav = 16, dur = 750 } = {}) {
  const c = ctr(rectOf(target)), v = pzVm(), fx = $("fx");
  for (let i = 0; i < n; i++) {
    const s = el("i", "shard");
    if (glyphs) { s.textContent = pick(glyphs); s.style.fontSize = size * v + "px"; }
    else { const w = size * v * (0.55 + Math.random() * 0.6); s.style.width = w + "px"; s.style.height = w * (0.6 + Math.random() * 0.6) + "px"; s.style.background = pick(colors); s.style.borderRadius = i % 2 ? "50%" : 0.25 * w + "px"; }
    s.style.left = c.x + "px"; s.style.top = c.y + "px"; fx.appendChild(s);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = dist * v * (0.6 + Math.random() * 0.6), ex = Math.cos(ang) * d, ey = Math.sin(ang) * d * 0.8, r = rnd(540) - 270;
    s.animate([{ transform: "translate(-50%, -50%) scale(0.6)", opacity: 1 },
      { transform: `translate(calc(-50% + ${ex * 0.65}px), calc(-50% + ${ey * 0.65 - 3 * v}px)) rotate(${r / 2}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${ex}px), calc(-50% + ${ey + grav * v}px)) rotate(${r}deg) scale(0.85)`, opacity: 0 }],
      { duration: dur + rnd(250), easing: "cubic-bezier(.25,.6,.5,1)", fill: "forwards" });
    setTimeout(() => s.remove(), dur + 400);
  }
}
function fxRing(target, { color = "#fff", size = 26, dur = 120, at } = {}) {   // 擴散的光圈（氣球破的白閃、魚的水花）
  const c = ctr(rectOf(target), at), w = size * pzVm(), s = el("i", "ring");
  s.style.cssText = `left:${c.x - w / 2}px;top:${c.y - w / 2}px;width:${w}px;height:${w}px;border-color:${color}`; $("fx").appendChild(s);
  s.animate([{ transform: "scale(0.3)", opacity: 1 }, { transform: "scale(1.4)", opacity: 0 }], { duration: dur, easing: "ease-out", fill: "forwards" });
  setTimeout(() => s.remove(), dur + 200);
}
function fxMark(target, text, { dur = 800, at = [0.5, 0.1], rise = 7, cls = "", dx = 0 } = {}) {   // 從 target 冒出來往上飄（愛心、問號、皇冠）
  const c = ctr(rectOf(target), at), v = pzVm(), s = el("i", "mark " + cls, text);
  s.style.left = c.x + dx * v + "px"; s.style.top = c.y + "px"; $("fx").appendChild(s);
  s.animate([{ transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 }, { transform: "translate(-50%, -80%) scale(1.15)", opacity: 1, offset: 0.25 },
    { transform: `translate(-50%, calc(-50% - ${rise * v}px)) scale(1)`, opacity: rise ? 0 : 1 }], { duration: dur, easing: "ease-out", fill: "forwards" });
  setTimeout(() => s.remove(), dur + 200);
}
function fxFlash() { const s = el("i", "goldflash"); $("fx").appendChild(s); s.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { opacity: 0 }], { duration: 400, fill: "forwards" }); setTimeout(() => s.remove(), 600); }

const pz = { tok: -1, surprise: false, force: false, placed: 0, from: null, demoT: 0, critT: 0 };   // surprise：這一局用過驚喜題了；placed：這題放對幾格（積木音階）
let firstPlay = null;                                    // A20：這個模式第一次玩（startMode 設；第 1 題 6 秒沒動作就示範）
const OPT_SEL = { fish: "#pond .fishBtn", order: "#shelf .item", hunt: "#scene .obj", tone: "#sky .balloon", build: "#tray .tile", match: "#board .card" };
const PROMPT_ID = { fish: "fishPrompt", tone: "tonePrompt", build: "buildPrompt", order: "orderBubble", hunt: "huntBubble", whack: "whackPic" };
const BURST = { fish: "💧", order: "💖", build: "🧱", whack: "💫", tone: "✨" };   // A7：每個遊戲自己的答對特效（burst 換主題）
const BALLOON_C = ["#ff5d5d", "#4a90ff", "#4cc764", "#ffcf33"];                  // 跟 balloon / _blue / _green / _yellow 同色
const SURPRISE = new Set(["fish", "tone", "order", "frog"]);
const optEls = () => [...document.querySelectorAll(OPT_SEL[mode] || "#none")];
// 每題開始（nextQ 出完題後）：選項進場、最後一題衝刺、場景小生物、第一次玩的示範
function polishQ() {
  if (pz.tok !== navToken) { pz.tok = navToken; pz.surprise = false; PZ(critterRound); }   // 新的一局
  pz.placed = 0; pz.from = null;
  PZ(critterCheck); PZ(optionsIn); PZ(polishSprint); PZ(demoArm);
}
// A9：選項進場（縮小→放大回彈＋淡入，一個接一個 70ms）：魚從左右游進、氣球從下面升上來、食物掉進貨架；題目卡 0.25 秒翻面進場
function optionsIn() {
  const v = pzVm(), gap = mode === "match" ? 22 : 70;
  optEls().forEach((e, i) => {
    const r = e.getBoundingClientRect(), left = r.left + r.width / 2 < innerWidth / 2;
    const from = mode === "fish" ? `${(left ? -45 : 45) * v}px 0px` : mode === "tone" ? `0px ${45 * v}px` : mode === "order" ? `0px ${-20 * v}px` : "0px 0px";
    e.animate([{ translate: from, scale: 0.5, opacity: 0 }, { translate: "0px 0px", scale: 1.08, opacity: 1, offset: 0.7 }, { translate: "0px 0px", scale: 1, opacity: 1 }],
      { duration: mode === "fish" || mode === "tone" ? 450 : 350, delay: i * gap, easing: "ease-out", fill: "backwards" });
  });
  const pc = $(PROMPT_ID[mode]);
  if (pc) pc.animate([{ transform: "perspective(80vmin) rotateX(85deg)", opacity: 0 }, { transform: "perspective(80vmin) rotateX(0deg)", opacity: 1 }], { duration: 250, easing: "ease-out" });
}
// A9：答對時錯的選項退場（魚游走、氣球飄走、其他淡掉），正解獨佔畫面
function optionsOut(okEl) {
  const v = pzVm();
  for (const e of optEls()) {
    if (e === okEl) continue;
    const r = e.getBoundingClientRect(), left = r.left + r.width / 2 < innerWidth / 2, op = getComputedStyle(e).opacity;
    const [to, o, d] = mode === "fish" ? [`${(left ? -70 : 70) * v}px ${3 * v}px`, 0, 700] : mode === "tone" ? [`0px ${-80 * v}px`, 0, 1100] : ["0px 0px", 0.25, 400];
    e.animate([{ translate: "0px 0px", opacity: op }, { translate: to, opacity: o }], { duration: d, delay: 150, easing: mode === "tone" ? "ease-in" : "ease-in-out", fill: "forwards" });
  }
}
// A6：題目卡框轉綠 0.8 秒；揭曉國字後卡片變寬／變高用過渡（量最後大小要等自動注音加完＝下一個 microtask）
function promptBefore() { const p = $(PROMPT_ID[mode]); return p && p.offsetParent ? { p, w: p.offsetWidth, h: p.offsetHeight } : null; }
function promptAfter(pre) {
  if (!pre) return; const { p, w, h } = pre;
  p.classList.remove("solved"); void p.offsetWidth; p.classList.add("solved"); clearTimeout(p._solvedT); p._solvedT = setTimeout(() => p.classList.remove("solved"), 800);
  queueMicrotask(() => PZ(() => {
    const w1 = p.offsetWidth, h1 = p.offsetHeight; if (Math.abs(w1 - w) < 2 && Math.abs(h1 - h) < 2) return;
    p.animate([{ width: w + "px", height: h + "px" }, { width: w1 + "px", height: h1 + "px" }], { duration: 320, easing: "cubic-bezier(.2,1.25,.4,1)" });
  }));
}
// 答對後的表現（correct() 在 onDone、drawProgress 之後呼叫）
function polishCorrect(target, gold, pre) {
  const m = mode, tok = navToken, p = $("progress"), dot = p.children[idx], v = pzVm();
  if (dot && !p.classList.contains("hidden")) flyTo(target, dot, { text: gold ? "⭐" : "✨", dur: 500, scale: 0.55, lift: 8 });   // A5：一顆星從答案飛到那格
  promptAfter(pre);                                                                        // A6
  if (m === "fish" || m === "tone" || m === "order" || m === "hunt") optionsOut(target);    // A9
  if (gold && [3, 5, 8].includes(combo) && MODES[m].rounds > 1) PZ(() => comboBadge(combo));  // A12
  const sur = !pz.surprise && SURPRISE.has(m) && (pz.force || Math.random() < 0.12);       // A17：每局最多 1 題、約 12%、只在答對後
  if (sur) { pz.surprise = true; pz.force = false; }
  if (m === "fish") { fxSpray(target, 8, { glyphs: ["💧"], size: 4, dist: 11, grav: 14 }); fxRing(target, { color: "rgba(255,255,255,0.9)", size: 24, dur: 380, at: [0.5, 0.3] }); }
  else if (m === "tone") {                                // A7：氣球破成 10 片同色碎片＋0.12 秒白閃圈（注音牌掉下去是 CSS）
    const img = target.querySelector(".balloonImg") || target, ci = +((target.className.match(/\bc(\d)\b/) || [])[1] || 0);
    setTimeout(() => { fxSpray(img, 10, { colors: sur ? BALLOON_C : [BALLOON_C[ci]], size: 4, dist: 15, grav: 20, dur: 650 }); fxRing(img, { size: 22, dur: 120 }); }, sur ? 550 : 0);
  }
  else if (m === "order") {                               // A8：食物飛到客人嘴邊 → 嚼兩下＋pop×2＋飄 3 顆愛心
    const cust = $("customer");
    flyTo(target, cust, { at: [0.5, 0.42], hide: true, dur: 550, scale: 0.35 }).then(() => {
      if (tok !== navToken) return;
      cust.classList.remove("chew", "enter", "no"); void cust.offsetWidth; cust.classList.add("chew"); play("pop", 1.15); setTimeout(() => play("pop", 1.3), 260);
      for (let k = 0; k < 3; k++) setTimeout(() => fxMark(cust, "💖", { at: [0.5, 0.25], dx: (k - 1) * 6, rise: 10, dur: 1000 }), k * 150);
    });
  }
  else if (m === "hunt") {                                // A8：東西飛進背包 → 背包彈一下、數字「3/8」
    const bag = $("bag");
    flyTo(target, bag, { hide: true, dur: 600, scale: 0.3 }).then(() => {
      bag.textContent = `🎒 ${results.slice(0, MODES.hunt.rounds).filter(Boolean).length}/${MODES.hunt.rounds}`; bag.classList.remove("got"); void bag.offsetWidth; bag.classList.add("got"); if (tok === navToken) play("pop", 1.4);
    });
  }
  else if (m === "build") [...document.querySelectorAll("#slots .slot")].forEach((d, i) => setTimeout(() => { d.classList.remove("hop2"); void d.offsetWidth; d.classList.add("hop2"); }, 250 + i * 80));   // A8：拼完各格依序跳
  if (sur) PZ(() => polishSurprise(m, target));
  const n = MODES[m].rounds; if (n > 1 && idx === n - 1) setTimeout(() => { if (curBgm) curBgm.playbackRate = 1; }, 1200);   // A19 衝刺結束
}
// A12：連對 3、5、8 題：頂上落下「連續 N 題！」徽章（0.45 秒彈入、停 1.2 秒收回），收回時進度膠囊亮金 0.6 秒
//   徽章落在進度膠囊上（蓋住膠囊一下），不要蓋到正在揭曉國字的題目卡
function comboBadge(n) {
  const p = $("progress"), pr = p.getBoundingClientRect(), v = pzVm(), b = el("div", "combo-badge", `連續 ${n} 題！`);
  b.style.top = Math.max(0.5 * v, pr.top - 1.2 * v) + "px"; document.body.appendChild(b);
  const up = `-50% ${-(pr.bottom + 22 * v)}px`;
  b.animate([{ translate: up, easing: "cubic-bezier(.2,1.5,.4,1)" }, { translate: "-50% 0px", offset: 0.21 }, { translate: "-50% 0px", offset: 0.79, easing: "ease-in" }, { translate: up }], { duration: 2100, fill: "forwards" });
  setTimeout(() => b.remove(), 2200);
  setTimeout(() => { p.classList.remove("glow"); void p.offsetWidth; p.classList.add("glow"); setTimeout(() => p.classList.remove("glow"), 650); }, 1650);
}
// A17：驚喜題（不預告、不改難度）：全螢幕金光 0.4 秒＋sticker 音＋30 顆星；金魚／彩虹氣球／戴皇冠的客人／金荷葉
function polishSurprise(m, target) {
  fxFlash(); setTimeout(() => play("sticker"), 150); burst(target, 30, "🌟");
  if (m === "fish") target.classList.add("golden");
  else if (m === "tone") target.classList.add("rainbow");
  else if (m === "order") fxMark($("customer"), "👑", { at: [0.5, 0.02], rise: 0, dur: 1700, cls: "crown" });
  else if (m === "frog") document.querySelectorAll("#river .pad.bloom").forEach(d => d.classList.add("goldpad"));
}
// A19：最後一題衝刺：BGM 快 6%（BGM 保留原本音高）、進度最後一格閃
function polishSprint() {
  const n = MODES[mode].rounds, last = n > 1 && idx === n - 1;
  if (curBgm) curBgm.playbackRate = last ? 1.06 : 1;
  if (last && $("progress").lastElementChild) $("progress").lastElementChild.classList.add("final");
}
// A15：注音標籤固定寬高、字縮放塞進去（一個符號的ㄩˇ不會扁寬、三個音節不會擠出框）
function fitZ(box, z, max) {
  const v = pzVm(); z.style.fontSize = max * v + "px";
  const cs = getComputedStyle(box), iw = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ih = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.min(1, iw / (z.offsetWidth || 1), ih / (z.offsetHeight || 1));
  if (k < 1) z.style.fontSize = max * v * k * 0.97 + "px";
}
// A3：翻牌配對成功＝兩張一起放大＋金框，閃光從注音卡飛到圖卡（0.3 秒）再揭曉國字
function pairFx(a, b, reveal) {
  for (const c of [a, b]) { c.classList.remove("pairHit"); void c.offsetWidth; c.classList.add("pairHit"); setTimeout(() => c.classList.remove("pairHit"), 650); }
  const z = a._c.kind === "z" ? a : b, pic = z === a ? b : a;
  flyTo(z, pic, { text: "✨", dur: 300, scale: 1.3, lift: 5 }).then(reveal, reveal);
  PZ(() => matchCount(true));
  return true;
}
function matchCount(bump) {   // A14：翻牌頂上的配對計數膠囊「3/12」
  const top = $("match").querySelector(".topbar"); if (!top || !mq) return;
  let c = top.querySelector(".mcount"); if (!c) { c = el("div", "mcount"); top.appendChild(c); }
  c.textContent = `🃏 ${mq.matched}/${mq.pairs}`;
  if (bump) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
}
// A8：積木拖曳：按住拿起、跟著手指，放開時看手指底下是哪一格 → 交給 placeSym／placeTone 判定（規則不變）；沒拖動＝點一下（照舊）
function dragTile(b, tone) {
  const place = pref => (tone ? placeTone(b) : placeSym(b, pref));
  let st = null, last = -1e9;
  b.addEventListener("pointerdown", e => {
    if (e.button > 0 || st || locked || b.classList.contains("used")) return;
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, drag: false }; last = performance.now();
    try { b.setPointerCapture(e.pointerId); } catch (er) {}
  });
  b.addEventListener("pointermove", e => {
    if (!st || e.pointerId !== st.id) return;
    st.dx = e.clientX - st.x; st.dy = e.clientY - st.y;
    if (!st.drag) {
      if (Math.hypot(st.dx, st.dy) < 1.5 * pzVm() || locked) return; st.drag = true; b.classList.add("lifted");
      for (const a of b.getAnimations()) if (!(window.CSSAnimation && a instanceof CSSAnimation) && !(window.CSSTransition && a instanceof CSSTransition)) a.finish();   // 進場動畫還沒跑完就拿起來：先結束它，積木才會跟著手指
    }
    b.style.translate = `${st.dx}px ${st.dy}px`;
  });
  const back = s => b.animate([{ translate: `${s.dx}px ${s.dy}px` }, { translate: "0px 0px" }], { duration: 220, easing: "ease-out" });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null; last = performance.now();
    const r = b.getBoundingClientRect(); b.classList.remove("lifted"); b.style.translate = "";
    if (!s.drag) { if (!cancel) place(); return; }
    const slot = cancel || locked ? undefined : dropSlot(e.clientX, e.clientY, tone);
    if (slot === undefined) { back(s); return; }          // 放在格子外：滑回托盤，不算錯
    const w0 = wrongThisQ; pz.from = r; place(slot); pz.from = null;
    if (wrongThisQ > w0) back(s);                         // 放錯：照舊算一次錯（placeSym 判的），積木滑回托盤
  };
  b.addEventListener("pointerup", e => end(e, false));
  b.addEventListener("pointercancel", e => end(e, true));
  b.addEventListener("lostpointercapture", e => end(e, true));
  b.addEventListener("click", e => { if (e.detail === 0 && performance.now() - last > 800) place(); });
  return true;
}
// 拖曳放開的位置：落在某格（多 2.5vmin 寬容）＝那一格；落在題目盤上但不在空格＝null（照點一下判定）；盤外＝undefined（滑回去）
function dropSlot(x, y, tone) {
  const pd = 2.5 * pzVm(), inR = (r, q = pd) => x >= r.left - q && x <= r.right + q && y >= r.top - q && y <= r.bottom + q;
  const hit = [...document.querySelectorAll(tone ? "#slots .toneSlot" : "#slots .slot:not(.toneSlot)")].find(d => inR(d.getBoundingClientRect()));
  if (hit) return tone || hit.dataset.v ? null : hit;
  return inR($("slots").getBoundingClientRect(), 0) ? null : undefined;
}
function tileLand(b, d) {   // A8：積木 0.22 秒飛進格子、格子彈 1.15
  const from = pz.from; pz.from = null; d.classList.add("landing");
  flyTo(b, d, { dur: 220, scale: d.offsetWidth / (b.offsetWidth || 1), lift: 3, from }).then(() => { d.classList.remove("landing", "pop"); void d.offsetWidth; d.classList.add("pop"); });
}
function fxRipple(lp) {     // A4：青蛙落地水波（0.3→1.6，0.5 秒）
  const r = el("div", "ripple"); r._lp = lp; fplace(r); const rv = $("river"); rv.insertBefore(r, rv.firstChild); setTimeout(() => r.remove(), 600);
}
// A18：可以戳的場景小生物：每 20–40 秒出現一隻（最多 2 隻），待 11–15 秒；不擋選項，戳了叫一聲翻一圈，不算答錯
const CRIT = { fish: ["🦆", "🐢"], hunt: ["🦋", "🐿️"], tone: ["🐦", "🦋"], whack: ["🐞", "🐌"], frog: ["🦆", "🐢"], order: ["🐭"], build: ["🐞"] };
function critterRound() {
  clearTimeout(pz.critT); document.querySelectorAll(".critter").forEach(c => c.remove());
  const tok = navToken, m = mode; if (!CRIT[m]) return;
  const next = () => { pz.critT = setTimeout(() => { if (tok !== navToken || mode !== m) return; PZ(spawnCritter); next(); }, 20000 + rnd(20000)); };
  next();
}
function busyRects() {     // 小生物不能放的地方：選項、題目卡、頂上的按鈕和進度、各遊戲的場地
  const v = pzVm(), sel = [OPT_SEL[mode], PROMPT_ID[mode] && "#" + PROMPT_ID[mode], "#progress", "#speakBtn", "#homeBtn", "#musicBtn", ".mcount", "#field .wcell", "#field .wwin", "#river > *", "#customer", "#slots", "#whackDots"].filter(Boolean).join(",");
  const rs = [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
  if (mode === "build") { const t = $("tray").getBoundingClientRect(); rs.push({ left: 0, right: innerWidth, top: t.top, bottom: innerHeight }); }   // 托盤以下（聲調積木那排之後才出現）
  if (mode === "frog" && fq) {                           // 還沒出現的荷葉排也要讓開
    const rv = $("river").getBoundingClientRect(), w = 22 * v, h = 17.6 * v;
    for (let i = 0; i <= fq.k + 1; i++) for (let j = 0; j < 3; j++) { const p = fpos(i, j, 3); const x = rv.left + rv.width * p.x / 100, y = rv.top + rv.height * p.y / 100; rs.push({ left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 }); }
  }
  return rs;
}
function spawnCritter() {
  const m = mode, sec = m && $(m); if (!CRIT[m] || !sec || sec.classList.contains("hidden")) return null;
  if (sec.querySelectorAll(".critter:not(.bye)").length >= 2) return null;
  const v = pzVm(), S = 11 * v, M = 4 * v, sr = sec.getBoundingClientRect(), busy = busyRects(), others = [...sec.querySelectorAll(".critter")].map(c => c.getBoundingClientRect());
  const free = (x, y) => busy.every(r => x + S + M < r.left || x - M > r.right || y + S + M < r.top || y - M > r.bottom) && others.every(r => Math.hypot(r.left - x, r.top - y) > S * 1.6);
  let pos = null;
  for (let k = 0; k < 80 && !pos; k++) { const x = sr.left + 2 * v + Math.random() * (sr.width - S - 4 * v), y = sr.top + 15 * v + Math.random() * (sr.height - S - 17 * v); if (free(x, y)) pos = { x, y }; }
  if (!pos) return null;
  const c = el("div", "critter", pick(CRIT[m])); c.style.left = pos.x - sr.left + "px"; c.style.top = pos.y - sr.top + "px";
  sec.appendChild(c); setTimeout(() => byeCritter(c), 11000 + rnd(4000));
  return c;
}
function byeCritter(c) { if (!c.isConnected || c.classList.contains("bye")) return; c.classList.add("bye"); setTimeout(() => c.remove(), 550); }
function critterCheck() {  // 換題後選項位置變了（尋寶每題亂排）：會擋到的小生物先離開
  const sec = mode && $(mode); if (!sec) return; const cs = sec.querySelectorAll(".critter:not(.bye)"); if (!cs.length) return; const busy = busyRects();
  for (const c of cs) { const r = c.getBoundingClientRect(); if (busy.some(b => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)) byeCritter(c); }
}
// 戳小生物：在 window 捕獲階段就攔下來 → 不會變成「再點一下換下一題」、不碰閒置計時、不算答錯
window.addEventListener("pointerdown", e => {
  const c = e.target && e.target.closest ? e.target.closest(".critter") : null; if (!c) return;
  e.stopPropagation(); e.preventDefault(); if (c.classList.contains("bye")) return;
  play("pop", 1.5 + Math.random() * 0.3);
  c.animate([{ transform: "rotateY(0deg) translateY(0px)" }, { transform: "rotateY(180deg) translateY(-3vmin)", offset: 0.5 }, { transform: "rotateY(360deg) translateY(0px)" }], { duration: 600, easing: "ease-in-out" });
}, true);
// A20：某模式第一次玩、第 1 題 6 秒沒動作 → 手指示範點一次正確答案（只示範、不幫他答，這題照算金星）；積木示範拖曳
function demoArm() {
  clearTimeout(pz.demoT); document.querySelectorAll(".demo-finger").forEach(d => d.remove());
  if (idx !== 0 || !firstPlay || firstPlay !== mode) return;
  firstPlay = null; const tok = navToken, m = mode;
  const stop = () => { clearTimeout(pz.demoT); document.removeEventListener("pointerdown", stop, true); };
  document.addEventListener("pointerdown", stop, true);
  pz.demoT = setTimeout(() => { document.removeEventListener("pointerdown", stop, true); PZ(() => showDemo(tok, m, 0)); }, 6000);
}
function demoTarget(m) {
  if (m === "frog") { const c = fq && fq.cols.find(c => c.o.ok); return c ? c.pad : null; }
  if (m === "whack") { const c = wq && wq.cells.find(c => c.ok && c.state === "up"); return c ? c.mole : null; }
  if (m === "match") return document.querySelector("#board .card.kz:not(.up):not(.done)");
  const i = curOpts ? curOpts.findIndex(o => o.ok) : -1; return i >= 0 ? optEls()[i] || null : null;
}
function showDemo(tok, m, tries) {
  if (tok !== navToken || mode !== m || idx !== 0 || locked) return;
  if (m === "build") { demoDrag(); return; }
  const t = demoTarget(m);
  if (!t) { if (tries < 20) pz.demoT = setTimeout(() => PZ(() => showDemo(tok, m, tries + 1)), 300); return; }   // 地鼠：等正確那隻冒出來
  const c = ctr(t.getBoundingClientRect()), v = pzVm(), f = el("div", "demo-finger"); f.appendChild(el("span", "", "👆"));
  f.style.left = c.x - 4.5 * v + "px"; f.style.top = c.y - 0.5 * v + "px"; $("fx").appendChild(f);
  for (const at of [960, 1660]) setTimeout(() => { if (t.isConnected) t.animate([{ scale: 1 }, { scale: 0.9 }, { scale: 1 }], { duration: 260 }); }, at);
  const stop = () => { f.remove(); document.removeEventListener("pointerdown", stop, true); };
  document.addEventListener("pointerdown", stop, true); setTimeout(stop, 3300);
}
function demoDrag() {     // 積木：手指拿著正確的積木拖到格子（半透明分身跟著動）
  const e = emptySlots()[0]; if (!e) return; const want = bq.syls[e[0]].sym[e[1]];
  const tile = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === want); if (!tile) return;
  const a = tile.getBoundingClientRect(), b = e[2].getBoundingClientRect(), v = pzVm(), c = ctr(a);
  const g = tile.cloneNode(true); g.classList.add("flyer", "ghost"); g.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
  const f = el("div", "demo-finger drag"); f.appendChild(el("span", "", "👆")); f.style.left = c.x - 4.5 * v + "px"; f.style.top = c.y - 0.5 * v + "px";
  $("fx").appendChild(g); $("fx").appendChild(f);
  const dx = b.left + b.width / 2 - c.x, dy = b.top + b.height / 2 - c.y, go = `translate(${dx}px, ${dy}px)`;
  const kf = [{ transform: "translate(0px, 0px)" }, { transform: "translate(0px, 0px)", offset: 0.25 }, { transform: go, offset: 0.75 }, { transform: go }];
  f.animate(kf, { duration: 2600, easing: "ease-in-out", fill: "forwards" });
  g.animate([{ transform: "translate(0px, 0px)", opacity: 0 }, { transform: "translate(0px, 0px) scale(1.12)", opacity: 0.8, offset: 0.25 }, { transform: go + " scale(1.12)", opacity: 0.8, offset: 0.75 }, { transform: go, opacity: 0 }], { duration: 2600, easing: "ease-in-out", fill: "forwards" });
  const stop = () => { f.remove(); g.remove(); document.removeEventListener("pointerdown", stop, true); };
  document.addEventListener("pointerdown", stop, true); setTimeout(stop, 2700);
}
if (location.search.includes("debug")) window.__zyPolish = { pz, stepRate, spawnCritter: () => PZ(spawnCritter), force() { pz.surprise = false; pz.force = true; }, get firstPlay() { return firstPlay; } };   // 測試用（tools/zy-test/polish.js）

// ---------- 存檔（localStorage；三個存檔位＝家裡三個小朋友各玩各的，阿葉 10-10「可以做存檔跟重新開始」）----------
// 每個存檔位的鍵：zy{1..3}_stickers / _stars / _eggs / _intro / _last_mode / _resume / _match_size / _best（各模式最佳星數）/ _hello（貓頭鷹自我介紹過）
// 全家共用：zy_slot（目前是誰）、zy_music、zy_hint_wait、zy_last_backup（上次按「備份全部」的時間，ms）、zy_ld_total（上次開頁載入幾個檔，讀取進度條用）
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
const save = { music: lsGet("zy_music", 1), hintWait: lsGet("zy_hint_wait", 20), talk: lsGet("zy_talk", 1) };   // talk：說明語音開關（家長設定，全家共用）   // hintWait：家長設定幾秒沒動作讓「🔊 提示」閃（0＝關閉）；遊戲永遠不自己唸答案
function loadSlot(n) {
  slot = n; lsSet("zy_slot", n);
  save.stickers = lsGet(K("stickers"), {});           // { 國字: 1 } 第一次一次答對就貼上
  save.stars = lsGet(K("stars"), 0);                  // 累積星星（罐子）
  save.eggs = lsGet(K("eggs"), 0);                    // 孵過幾顆蛋 → FRIENDS[4 + eggs] 以前都解鎖
  save.intro = lsGet(K("intro"), {});                 // 哪些模式聽過開場語
  save.matchSize = lsGet(K("match_size"), 8);         // 翻牌上次選的張數（新存檔預設 8＝簡單）
  save.best = lsGet(K("best"), {});                   // 個人紀錄（B14）：{ 模式: 最佳星數 }
  save.bubble = lsGet(K("bubble"), { lv: 0, stars: {} });   // 泡泡救援灣：lv＝下一關（0 起算）、stars＝每關最佳星數
  save.mix = lsGet(K("mix"), {});
  save.rw = RW.migrate({ eggs: save.eggs, rewards: lsGet(K("rewards"), null) });   // 扭蛋幣、寵物、點心、集章卡…（docs/zhuyin-rewards-spec.md）；舊的 eggs 自動搬成已收集的朋友
  RW.creditJar(save.rw, save.stars); lsSet(K("rewards"), save.rw);   // 搬家結果馬上存（不等下一次 persist）                     // 容易混淆的注音／聲調：{ "ㄅ|ㄆ": 次數, "t:1|2": 次數 }（家長頁顯示）
}
loadSlot(slot);
const persist = () => [lsSet(K("stickers"), save.stickers), lsSet(K("stars"), save.stars), lsSet(K("eggs"), save.eggs), lsSet(K("intro"), save.intro), lsSet(K("match_size"), save.matchSize), lsSet(K("best"), save.best), lsSet(K("bubble"), save.bubble), lsSet(K("rewards"), save.rw), lsSet("zy_music", save.music), lsSet("zy_hint_wait", save.hintWait), lsSet("zy_talk", save.talk)].every(Boolean);
const slotSummary = n => ({ stickers: Object.keys(lsGet(`zy${n}_stickers`, {})).length, stars: lsGet(`zy${n}_stars`, 0) });
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // 請瀏覽器不要自動清掉存檔
// 備份碼（B6）：ZY2＝三個存檔位一次包起來（換平板或瀏覽器被清掉時可以還原）；舊的 ZY1（只有一位）照樣能還原到目前這一位
const b64enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const b64dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));
const slotRaw = n => { const g = (k, d) => lsGet(`zy${n}_${k}`, d); return { s: Object.keys(g("stickers", {}) || {}), st: g("stars", 0), eg: g("eggs", 0), b: g("best", {}), i: Object.keys(g("intro", {}) || {}), m: g("match_size", 8), rw: g("rewards", null) }; };
// 備份碼裡的一位 → 乾淨的存檔資料：只收詞庫有的詞、只收認得的模式、數字有上下限（不是正確格式就回 null）
function cleanSlot(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.s)) return null;
  const valid = new Set(WORDS.map(w => w.h)), modes = Object.keys(MODES), num = (v, hi) => Math.min(hi, Math.max(0, Math.floor(+v) || 0));
  const best = {}; if (d.b && typeof d.b === "object") for (const m of modes) { const v = num(d.b[m], 3); if (v) best[m] = v; }
  const intro = {}; if (Array.isArray(d.i)) for (const m of d.i) if (modes.includes(m)) intro[m] = 1;
  return { stickers: Object.fromEntries(d.s.filter(h => typeof h === "string" && valid.has(h)).map(h => [h, 1])), stars: num(d.st, 99999), eggs: num(d.eg, FRIENDS.length - 4),
    best, intro, matchSize: [8, 16, 24].includes(+d.m) ? +d.m : 8, rewards: d.rw ? RW.cleanRewards(d.rw) : null };
}
const slotHasData = c => !!c && (Object.keys(c.stickers).length > 0 || c.stars > 0 || c.eggs > 0);
function exportCode() { return "ZY2:" + b64enc({ v: 2, hw: save.hintWait, p: [1, 2, 3].map(slotRaw) }); }   // 同樣的進度＝同樣的碼（還原鈕靠這個判斷「框裡只是剛備份的碼」）
// 讀備份碼（還不寫入）：從 LINE 複製常夾換行空白 → 先拿掉。回傳 null＝不是備份碼；{ v:1, slots:[一位] }／{ v:2, slots:[三位或 null], hw }
function readCode(code) {
  const m = String(code || "").replace(/\s+/g, "").match(/^ZY([12]):([A-Za-z0-9+/=]+)$/); if (!m || m[2].length > (m[1] === "1" ? 20000 : 60000)) return null;
  let d; try { d = b64dec(m[2]); } catch (e) { return null; }
  if (m[1] === "1") { const c = cleanSlot(d); return c ? { v: 1, slots: [c] } : null; }
  if (!d || !Array.isArray(d.p) || d.p.length > 3) return null;
  const slots = [0, 1, 2].map(i => cleanSlot(d.p[i])); if (!slots.some(Boolean)) return null;
  return { v: 2, slots, hw: [0, 10, 20, 30].includes(+d.hw) ? +d.hw : null };
}
// 寫入：回傳 "ok"／"bad"（不是備份碼）／"fail"（寫不進瀏覽器，進度不變）
// ZY1＝蓋掉目前這一位的貼紙、星星、朋友（舊版只備份這三樣）；ZY2＝備份裡「有進度」的那幾位整位蓋掉，空的那位不動
function importCode(code) {
  const r = readCode(code); if (!r) return "bad";
  if (r.v === 1) { const c = r.slots[0]; save.stickers = c.stickers; save.stars = c.stars; save.eggs = c.eggs; save.rw = RW.migrate({ eggs: c.eggs }); RW.creditJar(save.rw, save.stars); return persist() ? "ok" : "fail"; }   // 舊碼沒有獎勵資料：照孵過的蛋重新搬家
  const keys = ["stickers", "stars", "eggs", "best", "intro", "match_size", "resume", "hello", "rewards"], snap = {};
  for (let n = 1; n <= 3; n++) for (const k of keys) { try { snap[`zy${n}_${k}`] = localStorage.getItem(`zy${n}_${k}`); } catch (e) {} }
  let ok = true;
  r.slots.forEach((c, i) => {
    if (!slotHasData(c)) return;
    const n = i + 1, w = (k, v) => { ok = lsSet(`zy${n}_${k}`, v) && ok; };
    w("stickers", c.stickers); w("stars", c.stars); w("eggs", c.eggs); w("best", c.best); w("intro", c.intro); w("match_size", c.matchSize); w("hello", 1);
    if (c.rewards) w("rewards", c.rewards); else { try { localStorage.removeItem(`zy${n}_rewards`); } catch (e) {} }   // 舊備份碼沒有獎勵資料：照 eggs 重新搬家
    try { localStorage.removeItem(`zy${n}_resume`); } catch (e) {}   // 這台平板上「沒玩完的那一回合」跟還原的進度對不上 → 丟掉
  });
  if (ok && r.hw !== null) { save.hintWait = r.hw; ok = lsSet("zy_hint_wait", r.hw); }
  if (!ok) for (const [k, v] of Object.entries(snap)) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }   // 寫一半失敗：整批放回原狀
  loadSlot(slot); return ok ? "ok" : "fail";
}
function clearSlot() { for (const k of ["stickers", "stars", "eggs", "intro", "last_mode", "resume", "match_size", "whack_up", "best", "hello", "mix", "bubble", "rewards"]) { try { localStorage.removeItem(K(k)); } catch (e) {} } loadSlot(slot); }
// 新存檔第一次進來（B8）：貓頭鷹先自我介紹；已經有進度的舊存檔不會突然被介紹
function helloText() {
  if (lsGet(K("hello"), 0)) return null; lsSet(K("hello"), 1);
  return stickerCount() === 0 && !save.stars ? "你好！我是貓頭鷹老師！" : null;
}
const stickerCount = () => Object.keys(save.stickers).length;
const friends = () => FRIENDS.filter(f => save.rw.pets[RW.FRIEND_PET[f.id]]);   // 點餐的客人：已經收集的那幾位朋友

// ---------- 音效 / 音樂 / 語音 ----------
const SFX = {}; for (const n of ["ok", "ng", "tap", "select", "win", "pop", "flip", "sticker"]) { const a = SFX[n] = new Audio(`MUSIC/zy_${n}.mp3`); a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = false; }   // A1：音效改 playbackRate 時音高真的跟著變（BGM 不改，保留音高）
SFX.ng.volume = 0.5;                                    // A10：答錯音小聲一點（怪遊戲不怪小孩）
SFX.party = new Audio(); SFX.party.preload = "none"; SFX.party.src = "MUSIC/zy_bgm_party.mp3"; SFX.party.volume = 0.45;   // 結算用 Suno 生的 7 秒慶祝 jingle
// 背景音樂 preload="none"：開頁不下載，第一次播放才抓（之前開頁就吃掉 3.7MB，是載入慢的主因）
const BGM = {}; for (const k of ["island", "calm"]) { const a = new Audio(); a.preload = "none"; a.src = `MUSIC/zy_bgm_${k}.mp3`; a.loop = true; a.volume = 0.3; BGM[k] = a; }
let curBgm = null, ducked = false;
function play(name, rate = 1) { const a = SFX[name]; if (!a) return; try { a.__played = true; a.muted = false; a.currentTime = 0; a.playbackRate = rate; a.play().catch(() => {}); } catch (e) {} }
function playBgm(key) {
  const b = BGM[key] || BGM.island;
  if (curBgm && curBgm !== b) { curBgm.pause(); }
  curBgm = b; b.playbackRate = 1; if (save.music) b.play().catch(() => {});   // 速度歸零：最後一題衝刺（A19）加快過
}
function setMusic(on) { save.music = on ? 1 : 0; persist(); if (save.music) { if (curBgm) curBgm.play().catch(() => {}); } else if (curBgm) curBgm.pause(); $("musicBtn").classList.toggle("off", !save.music); if (typeof wxAudio === "function") wxAudio(); }
function toggleMusic() {                               // B10：關掉＝白底＋紅斜線；切換時彈一下＋tap 音
  setMusic(!save.music); const b = $("musicBtn"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); play("tap");
}
function duck(on) { ducked = on; for (const b of Object.values(BGM)) b.volume = on ? 0.1 : 0.3; }   // TTS 講話時壓低音樂（聽力題的關鍵）
let zhVoice = null;
function loadVoice() { const vs = speechSynthesis.getVoices(); zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null; }
if ("speechSynthesis" in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
// 先用 Gemini 預錄的真人語音（js/zhuyin-voice.js，阿葉 10-10「語調太像機械音」）；沒錄到的句子才退回瀏覽器語音
function say(text, rate = 0.85, onEnd) {
  voiceStop();                                         // 先停前一句預錄（它的 onEnd 會 duck(false)），之後才壓音樂
  let vdone = false; const vfin = () => { if (vdone) return; vdone = true; duck(false); if (onEnd) onEnd(); };
  if (voiceSay(text, { onEnd: vfin })) {               // 不傳 rate：預錄是自然語速，改 rate 連音高一起變
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
    duck(true); return;
  }
  if (!("speechSynthesis" in window)) { if (onEnd) setTimeout(onEnd, 300); return; }
  try {
    speechSynthesis.cancel(); duck(true); let done = false;
    const fin = () => { if (done) return; done = true; duck(false); if (onEnd) onEnd(); };
    const u = new SpeechSynthesisUtterance(text); u.lang = "zh-TW"; u.rate = rate; if (zhVoice) u.voice = zhVoice;
    u.onend = u.onerror = fin; speechSynthesis.speak(u);
    setTimeout(() => { if (!speechSynthesis.speaking) fin(); }, Math.max(2500, text.length * 450));   // 語音引擎沒回 onend 時的保險
  } catch (e) { duck(false); if (onEnd) onEnd(); }
}
const pendingSays = new Set();                         // 排隊中、還沒開口的句子（答對後要等它們也講完才換題）
const engineTalking = () => voiceSpeaking() || ("speechSynthesis" in window && speechSynthesis.speaking);
const talking = () => engineTalking() || pendingSays.size > 0;
function queueSay(text) {                              // 等目前這句唸完再唸（稱讚不能蓋掉學習詞）；中途換畫面就作廢
  const tok = navToken, me = {}; let tries = 0; pendingSays.add(me);
  const t = setInterval(() => { tries++; if (tok !== navToken) { clearInterval(t); pendingSays.delete(me); return; } if (!engineTalking() || tries > 25) { clearInterval(t); pendingSays.delete(me); say(text); } }, 200);
}
// 說明語音（貓頭鷹說明、開場語、稱讚、暫停、結算）：家長設定可以關；題目與答案的唸音一律用 say()，不受影響（阿葉 10-10 ③）
function talk(text, onEnd) { if (save.talk) say(text, 0.85, onEnd); else if (onEnd) setTimeout(onEnd, 0); }
function queueTalk(text) { if (save.talk) queueSay(text); }
function stopSpeech() { voiceStop(); try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {} duck(false); }
// iOS Safari：語音與每個音效元件都要在「手指點擊當下」解鎖一次，之後等圖載完才出聲也不會被吞掉
let audioUnlocked = false;
function unlockAudio() {
  voiceUnlock();                                       // 預錄語音的 AudioContext（每次都要能 resume：iOS 切背景後會被暫停）
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
// 彩帶（B2）：五色圓角紙片 3D 翻飛 2.2–3.2 秒。host＝放哪一層：結算放 #resultCf（在字後面、不蓋字），孵蛋放特效層
const PAPER = ["#ff7a7a", "#ffc233", "#4fb0ff", "#5ccf6a", "#b07cff"];
function confetti(n = 45, host = $("fx")) {
  for (let i = 0; i < n; i++) {
    const s = el("span", "paper"), dur = 2.2 + Math.random();
    s.style.left = (Math.random() * 100).toFixed(1) + "%"; s.style.background = pick(PAPER);
    s.style.setProperty("--ax", (Math.random() * 2 - 1).toFixed(2)); s.style.setProperty("--ay", (Math.random() * 2 - 1).toFixed(2));
    s.style.setProperty("--sx", (Math.random() * 16 - 8).toFixed(1) + "vmin"); s.style.setProperty("--rt", ((Math.random() < 0.5 ? -1 : 1) * (540 + rnd(720))) + "deg");
    s.style.animationDuration = dur.toFixed(2) + "s"; s.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s";
    host.appendChild(s); setTimeout(() => s.remove(), (dur + 1.4) * 1000);
  }
}

// ---------- 預載：每個畫面只抓自己要的圖，第二次進入直接從快取來 ----------
const IMG = n => `IMAGE/zhuyin/${n}${n.startsWith("bg_") && matchMedia("(orientation: portrait)").matches ? "_p" : ""}.webp`;   // 直式背景用 _p（跟 CSS 一致，才不會抓兩份）
const ASSETS = {
  menu: ["bg_map", "guide_owl"], album: ["bg_album"], result: ["bg_map"],
  fish: ["bg_pond", "fish"], build: ["bg_blocks"], hunt: ["bg_park"], match: ["bg_table", "card_back", "card_back_orange"], tone: ["bg_sky", "balloon", "balloon_blue", "balloon_green", "balloon_yellow"],
  whack: ["bg_garden", "hole", "mole_up_body", "mole_hit_body"], bubble: ["cust_penguin"], frog: ["bg_frog", "frog_sit", "frog_jump", "lilypad", "lilypad_flower", "stone"],
  order: () => ["bg_shop", ...friends().map(f => f.id)],
  hatch: () => ["egg", "egg_rare", "egg_ssr"], gacha: ["gacha_machine", "capsule_blue", "capsule_purple", "capsule_gold"],
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
function nav() { const tok = ++navToken; qToken++; gClear(); pendingSays.clear(); if (bubbleGame) PZ(() => bubbleGame.stop()); if (loadingOwner) { loadingOwner = 0; showLoading(false); } return tok; }   // qToken++＋gClear：上一局還沒到的換題、結算、稱讚全部作廢
// 同一局的計時器（阿葉 10-10 ①）：換題、配對結算、延遲的稱讚都走這裡 → 暫停選單開著＝凍結（剩下的時間留著）、回小島／重新開始＝全部作廢
const gameT = new Set(); let gamePaused = false, pausedAt = 0, pausedTotal = 0;
const gNow = () => (gamePaused ? pausedAt : performance.now()) - pausedTotal;   // 本局時鐘：暫停的時間不算
function gArm(t) { t.id = setTimeout(() => { gameT.delete(t); t.fn(); }, Math.max(0, t.due - gNow())); }
function gLater(fn, ms) { const t = { fn, due: gNow() + ms, id: 0 }; gameT.add(t); if (!gamePaused) gArm(t); return t; }
function gPause() { if (gamePaused) return; pausedAt = performance.now(); gamePaused = true; for (const t of gameT) clearTimeout(t.id); }
function gResume() { if (!gamePaused) return; pausedTotal += performance.now() - pausedAt; gamePaused = false; for (const t of gameT) gArm(t); }
function gClear() { for (const t of gameT) clearTimeout(t.id); gameT.clear(); if (gamePaused) { pausedTotal += performance.now() - pausedAt; gamePaused = false; } }
function setLoadProgress(f) { const i = $("ldFill"); if (i) i.style.width = Math.max(4, Math.min(100, f * 100)).toFixed(1) + "%"; }   // 讀取進度條（B12）
async function ensure(k, tok) {                                                   // 要用了：沒抓完就顯示讀取動畫等它
  const prs = assetsOf(k).map(loadImg); if (prs.every(x => x.done)) return;
  const tick = () => { if (tok === navToken) setLoadProgress(prs.filter(x => x.done).length / prs.length); };   // 進度＝這個畫面的圖已到幾張／共幾張
  tick(); for (const x of prs) x.then(tick);
  const t = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);   // 150ms 內抓完就不閃讀取畫面
  await Promise.race([Promise.all(prs), new Promise(r => setTimeout(r, 6000))]);   // 網路再慢最多等 6 秒
  clearTimeout(t); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }   // 只有自己打開的讀取畫面才由自己關
}
function showLoading(on) { $("loading").classList.toggle("hidden", !on); }

// ---------- 3D 選單小島（js/zhuyin-hub3d.js）----------
// 島上走的寵物：[{ id, glb, stage, name }]（獎勵系統做好後改讀存檔裡的 pets）
const PET_GLB = { cust_bear: "bear", cust_rabbit: "bunny", cust_cat: "cat", cust_fox: "fox", cust_panda: "panda", cust_penguin: "penguin", cust_frog: "frog", cust_lion: "lion" };
const hubPets = () => Object.entries(save.rw.pets).map(([id, p]) => ({ id, name: RW.PET[id].name, stage: p.stage || 2, glb: `IMAGE/zy3d/models/${id}.glb` }));   // 小島上走的：全部收集到的寵物（寶寶／長大／超級）
const hubDecor = () => save.rw.decor.map(id => ({ id, glb: `IMAGE/zy3d/models/${id}.glb` }));
// 選單要用時才動態載入 Three.js＋模型；網址加 ?no3d、沒有 WebGL、載入失敗或 8 秒內沒好 → 退回原本卡片選單（遊戲照常玩）
let hub = null;
function hasWebGL() {                                 // Three.js r163 起只支援 WebGL2；探測完把 context 還回去（iPad 同時能開的 context 有限）
  try { const gl = document.createElement("canvas").getContext("webgl2"); if (!gl) return false; const x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); return true; } catch (e) { return false; }
}
function importHub() {
  const url = "./zhuyin-hub3d.js?v=8";
  if (window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap")) return import(url);
  return new Promise((ok, no) => {                    // 舊 iPad（iOS 16.3 以前）不支援 importmap → 補 es-module-shims 再載
    const s = document.createElement("script"); s.src = "IMAGE/zy3d/vendor/es-module-shims/es-module-shims.js";
    s.onload = () => window.importShim ? window.importShim(new URL(url, import.meta.url).href).then(ok, no) : no(new Error("no importShim")); s.onerror = no; document.head.appendChild(s);
  });
}
function hubFail(why) { console.warn("[hub3d] 退回卡片選單：", why); hub = null; document.body.classList.remove("hub3d"); document.body.classList.add("hub-off"); $("townBtn").classList.add("hidden"); $("townTag").classList.add("hidden");
  clearTimeout(wxTimer); weather = null; ocean = null; wxKind = null; if (wxSound) { try { wxSound.stop(); } catch (e) {} wxSound = null; wxAudioOn = false; } }   // 天氣跟著 3D 小島一起收（卡片選單不報天氣）
function initHub() {
  if (/[?&]no3d\b/.test(location.search) || !hasWebGL()) { document.body.classList.add("hub-off"); return Promise.resolve(null); }   // hub-off：卡片選單才顯示背景圖
  let settled = false;                                 // （Three.js 已由 zhuyin.html 的 modulepreload 跟頁面一起開始抓）
  const ready = importHub().then(m => m.createHub({ host: $("menu"), onFriend: f => { play("tap"); say(f.name); }, onFail: hubFail, newbie: () => stickerCount() === 0,
    onGacha: () => { play("select"); openGacha(); },   // 獎勵系統（docs/zhuyin-rewards-spec.md）
    stickers: stickerCount, onCivic: (k, info) => PZ(() => civicEvent(k, info)), onPlace: (p, open) => { $("townBtn").querySelector(".nav-ico").textContent = p === "main" ? "🏙️" : "🏝️"; $("townTag").querySelector(".nav-word").textContent = p === "main" ? (open ? "新市區" : "新市區 🔒") : "回小島"; $("townBtn").setAttribute("aria-label", p === "main" ? "新市區" : "回小島"); $("townBtn").classList.toggle("back", p !== "main"); },
    labels: { gacha: { ico: "🎁", word: "扭蛋" } } }))
    .then(h => { if (settled) { h.dispose(); return null; } settled = true; hub = h; document.body.classList.add("hub3d"); initWeather(); return h; },
      e => { if (!settled) { settled = true; hubFail(e && e.message || e); } return null; });
  const late = new Promise(r => setTimeout(() => { if (!settled) { settled = true; hubFail("逾時"); } r(null); }, 8000));
  return Promise.race([ready, late]);
}

// 天氣（阿葉 10-11：隨機晴天／陰天／下雨／雷雨／颱風）：js/zhuyin-weather.js 掛在 3D 小島上（只在選單跑）；
// 打開一律晴天，之後每 2～4 分鐘有六成機會換天氣（玩遊戲時也會換，回小島貓頭鷹再說）；雨停轉晴會出彩虹；雨聲／雷聲是程式合成的，跟「背景音樂」開關一起開關、進遊戲就靜音
let weather = null, ocean = null, wxMod = null, wxSound = null, wxKind = null, wxTimer = 0, wxAudioOn = false, wxPending = "";   // wxPending：遊戲中天氣變了 → 記玩家最後看到的天氣，回小島時貓頭鷹說新天氣
const WX_LINES = { sunny: "今天是晴天，太陽好溫暖！", cloudy: "今天是陰天，雲好多喔！", rain: "下雨了！滴答滴答！", storm: "打雷了！轟隆隆！", typhoon: "颱風來了！大家要待在家裡喔！" };
// 日夜（阿葉 10-11 選 B：遊戲內加速，真實 30 分鐘＝一天：白天 17 分、黃昏 3 分、晚上 7 分、清晨 3 分）：js/zhuyin-clock.js
// 時間存 localStorage「zy_clock」（全家共用），只在畫面看得到時前進；網址 ?clock=day|dusk|night|dawn|0.62 或 ?night=1|0 → 固定不走
const clock = createClock();
const PHASE_LINES = { dusk: ["太陽要下山囉！", "天空變成橘色了！"], night: ["天黑了，路燈亮起來了！", "月亮出來了，好漂亮！"], dawn: ["天快亮了，早安！", "太陽公公要起床囉！"] };
let phasePending = "";                                 // 玩遊戲時換了時段 → 回小島貓頭鷹再說
const envObj = { night: 0, dusk: 0, dawn: 0, kind: "sunny" };   // 給海洋外掛每格讀的環境（同一個物件，每秒 applyNight／換天氣時更新，不每格新建）
clock.onPhase(ph => {
  if (!PHASE_LINES[ph]) { phasePending = ""; return; }  // 白天不特別說
  if (mode || !hub) { phasePending = ph; return; }
  const t = pick(PHASE_LINES[ph]); $("guideText").textContent = t; queueTalk(t);   // 排隊：不切斷正在講的話
});
async function initWeather() {
  if (!hub || weather) return;
  try {
    const m = wxMod = await import("./zhuyin-weather.js?v=3"); if (!hub) return;
    const q = (location.search.match(/[?&]weather=(\w+)/) || [])[1];   // 網址 ?weather=rain 可指定（截圖、宣傳片用）
    wxKind = m.WEATHERS[q] ? q : "sunny";             // 阿葉 10-11：打開一律晴天，玩的過程中再變
    wxSound = m.createWeatherSound(); if (wxSound.setDuck) wxSound.setDuck(() => engineTalking());   // 講話時雷聲小一點
    weather = hub.use(c => m.weatherPlugin(c, { kind: wxKind, sound: wxSound }));
    if (weather && weather.setLight) PZ(() => weather.setLight(clock.get(), { instant: true }));   // 一打開就是時鐘現在的光線
    if (!q) scheduleWeather();
    wxAudio();
  } catch (e) { console.warn("[weather]", e); }
  // 海（阿葉 10-11：海浪要會動、有雲、小魚、海鷗）：js/zhuyin-ocean.js；跟著日夜時鐘與天氣變（颱風浪大、晚上沒海鷗）
  try {
    const om = await import("./zhuyin-ocean.js?v=1"); if (!hub || ocean) return;
    const s = clock.get(); envObj.night = s.night; envObj.dusk = s.dusk; envObj.dawn = s.dawn; envObj.kind = wxKind || "sunny";
    ocean = hub.use(c => om.oceanPlugin(c, { env: () => envObj }));
  } catch (e) { console.warn("[ocean]", e); }
}
function scheduleWeather() {
  clearTimeout(wxTimer);
  wxTimer = setTimeout(() => { if (weather && (mode || !talking()) && Math.random() < 0.6) setWeather(wxMod.pickWeather()); scheduleWeather(); }, 120000 + Math.random() * 120000);   // 每 2～4 分鐘可能換一次（玩遊戲時也會換）
}
function setWeather(k) {
  if (!weather || !wxMod.WEATHERS[k] || k === wxKind) return;
  const from = wxKind; wxKind = k; weather.set(k); envObj.kind = k;   // 海也跟著換（颱風浪大、沒海鷗）
  if (mode) { if (!wxPending) wxPending = from; return; }   // 在遊戲裡換的 → 記住玩家最後看到的天氣，回小島再說
  const t = wxLine(from); $("guideText").textContent = t; queueTalk(t);   // 排隊：不切斷正在講的話
}
// 從 from 變成現在的天氣要說的話（真的看過下雨才說彩虹）
function wxLine(from) { return ["rain", "storm", "typhoon"].includes(from) && wxKind === "sunny" ? "雨停了！看，天上有彩虹！" : WX_LINES[wxKind]; }
// 雨聲：聲音解鎖後才能開；選單＋背景音樂開＝有聲音，其他時候靜音
function wxAudio() {
  if (!wxSound) return;
  if (!wxAudioOn) { const c = voiceCtx(); if (!c) return; try { wxSound.start(c); wxAudioOn = true; } catch (e) { return; } }
  wxSound.setVolume(!mode && !document.hidden && save.music && $("menu") && !$("menu").classList.contains("hidden") ? 1 : 0);
}
document.addEventListener("visibilitychange", () => wxAudio());
document.addEventListener("pointerdown", () => setTimeout(wxAudio, 50), { capture: true, passive: true });

// 新市區（hub3d 的城市設施與事件）：唸設施名字、警笛／鐘聲、救火、救護；還沒蓋好 → 說還差幾張貼紙（阿葉 10-11）
function civicEvent(k, info = {}) {
  if (mode) return;                                    // 只在選單（3D 小島）
  const who = info.name || "小動物";
  const LINES = { police: "警察局！警車出動巡邏囉！", fire: "消防局！消防車出動囉！", hospital: "醫院！救護車出發囉！", school: "學校！叮噹叮噹，上課囉！",
    town: "這裡是新市區！", main: "", fireStart: "失火了！快叫消防車！", fireTap: "消防車馬上來！", fireOut: "火熄滅了，謝謝消防員！",
    sick: who + "不舒服，救護車來了！", healed: who + "好了，謝謝醫生！" };
  if (k === "locked" || k === "townLocked") { play("select"); guideSay(`再收集 ${Math.max(1, info.need - stickerCount())} 張貼紙，${k === "locked" ? info.name : "新市區"}就蓋好囉！`, false); talk("收集更多貼紙，就能蓋好囉！"); return; }
  if (k === "spray") { play("pop", 0.7); return; }
  if (k === "built" || k === "townOpen") { play("win"); $("townBtn").classList.add("news"); guideSay(k === "townOpen" ? "橋蓋好了！新市區開放囉！" : `新市區的${info.name}蓋好了！`); return; }
  if (k === "town") $("townBtn").classList.remove("news");
  const line = LINES[k]; if (line === undefined) return;
  if (k === "police" || k === "fire" || k === "hospital" || k === "fireTap" || k === "sick") siren(k === "fireTap" ? "fire" : k === "sick" ? "hospital" : k);
  else if (k === "school") { bell(); PZ(schoolCard); }
  else if (k === "fireOut" || k === "healed") play("win"); else if (line) play("select");
  if (line) guideSay(line);
}
// 學校＝複習教室：打鐘後跳出一張收集過的貼紙、唸一次（複習學過的字）
function schoolCard() {
  const ws = WORDS.filter(w => save.stickers[w.h]); if (!ws.length) return;
  document.querySelectorAll(".school-card").forEach(x => x.remove());
  const w = pick(ws), card = el("div", "school-card"); card.appendChild(el("div", "sc-t", "🏫 今天複習")); card.appendChild(stickerNode(w)); $("menu").appendChild(card);
  const tok = navToken; setTimeout(() => { if (tok === navToken && !mode) say(w.h); }, 1500);
  setTimeout(() => { card.classList.add("bye"); setTimeout(() => card.remove(), 500); }, 5200);
}
// 程式合成的警笛（警車：高低兩音、消防車：上下滑、救護車：慢的高低）＋學校鐘聲；音量比語音小很多
function tone(c, f0, f1, t0, dur, type = "sine", vol = 0.05) {
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.03); g.gain.setValueAtTime(vol, t0 + dur - 0.05); g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function siren(kind) {
  const c = voiceCtx(); if (!c) return; const t = c.currentTime + 0.02;
  if (kind === "police") for (let i = 0; i < 6; i++) tone(c, i % 2 ? 770 : 960, i % 2 ? 770 : 960, t + i * 0.32, 0.3, "triangle", 0.035);
  else if (kind === "fire") for (let i = 0; i < 3; i++) { tone(c, 600, 1150, t + i * 0.7, 0.35, "triangle", 0.03); tone(c, 1150, 600, t + i * 0.7 + 0.35, 0.35, "triangle", 0.03); }
  else for (let i = 0; i < 4; i++) tone(c, i % 2 ? 620 : 830, i % 2 ? 620 : 830, t + i * 0.5, 0.48, "triangle", 0.03);
}
function bell() { const c = voiceCtx(); if (!c) return; const t = c.currentTime + 0.02; [1320, 990, 1320, 990].forEach((f, i) => tone(c, f, f, t + i * 0.28, 0.6, "sine", 0.05)); }

// ---------- 畫面切換 / 嚮導 ----------
let mode = null, round = [], idx = 0, results = [], locked = false, wrongThisQ = 0, combo = 0, earned = [], idleTimer = null, roundStars = 0, qToken = 0, roundTreats = 0;
const READING = new Set(["order", "hunt"]);          // 看注音自己讀的模式：題目完全不出聲，按提示才唸
function showScreen(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== id);
  const inGame = id in MODES; $("speakBtn").classList.toggle("hidden", !inGame || id === "match");   // 泡泡：「再聽」＝再唸一次目前這顆的符號
  $("speakLabel").textContent = READING.has(id) ? "提示" : "再聽"; $("speakBtn").classList.remove("pulse");
  $("settingsBtn").classList.toggle("hidden", id !== "menu"); $("playerBtn").classList.toggle("hidden", id !== "menu");
  $("townBtn").classList.toggle("hidden", id !== "menu" || !hub); $("townTag").classList.toggle("hidden", id !== "menu" || !hub);   // 新市區按鈕：只在 3D 小島選單
  $("progress").classList.toggle("hidden", !inGame || BOARD(id));
  $("guide").classList.toggle("hidden", id !== "menu");
  document.body.classList.toggle("on-menu", id === "menu"); hudOpen("L", false); hudOpen("R", false);   // 換畫面：上方家長按鈕一律收起來（遊戲裡 🏠🎵 照常顯示）
  if (hub) { if (id === "menu") hub.show(); else hub.hide(); }   // 3D 小島只在選單畫面渲染（省電）
  setTimeout(wxAudio, 0);                              // 天氣聲：只有選單有
}
function guideSay(text, speak = true) { owl.selfText = text; $("guideText").textContent = text; owlShow(speak); if (speak) talk(text); setTimeout(() => { owl.selfText = null; }, 0); }   // 標記只管這一次（下次別處寫一樣的字也要彈出）

// ---------- 選單上方按鈕收合（阿葉 10-11「上面左邊跟右邊的選項可以做收放，不然畫面太雜亂了」）----------
// 家長用的 🏠🎵（左）、🐻換人⚙️（右）收在兩個「⋯」把手裡：點把手展開，8 秒沒碰自動收回；開始玩後第一次進選單先展開 4 秒，讓家長知道在哪。
// 收起來只是 visibility:hidden（位置還在）→ 3D 小島擺鏡頭時照樣避開它們：展開時不會蓋到浮標，小島也不會因為收放而跳動。
const HUD_IDLE = 8000, HUD_TOUR = 4000, hudT = { L: 0, R: 0 };
let hudToured = false;
function hudOpen(side, on, ms = HUD_IDLE) {
  const box = $("hud" + side), btn = $("hud" + side + "Btn"); if (!box) return;
  box.classList.toggle("open", on); btn.setAttribute("aria-expanded", on ? "true" : "false");
  clearTimeout(hudT[side]); if (on) hudT[side] = setTimeout(() => hudIdle(side), ms);
}
function hudIdle(side) {                               // 閒置時間到：家長還按著 ⚙️（2 秒家長鎖）就再等一下
  if (lockHold) { hudT[side] = setTimeout(() => hudIdle(side), 1000); return; }
  hudOpen(side, false);
}
function hudTour() { if (hudToured || !document.body.classList.contains("on-menu")) return; hudToured = true; hudOpen("L", true, HUD_TOUR); hudOpen("R", true, HUD_TOUR); }
for (const side of ["L", "R"]) {
  $("hud" + side + "Btn").onclick = () => { play("tap"); hudOpen(side, !$("hud" + side).classList.contains("open")); };
  $("hud" + side).addEventListener("pointerdown", () => { if ($("hud" + side).classList.contains("open")) hudOpen(side, true); }, { capture: true, passive: true });   // 有在用：重新算 8 秒
}
document.addEventListener("pointerdown", e => {        // 點畫面其他地方（小島、膠囊、貓頭鷹）＝收起來；彈窗裡的點擊不算
  if (!document.body.classList.contains("on-menu") || e.target.closest?.(".overlay")) return;
  for (const side of ["L", "R"]) if ($("hud" + side).classList.contains("open") && !$("hud" + side).contains(e.target)) hudOpen(side, false);
}, { capture: true, passive: true });

// ---------- 貓頭鷹收起來（阿葉 10-11「貓頭鷹可以點選隱藏，或者提示完多久就消失，或者點一下就消失」）----------
// 有新的話 → 彈出來；唸完再 4 秒（不出聲的話＝看字 4 秒＋每字 0.15 秒，再 4 秒）→ 對話框淡出、貓頭鷹縮成右下角的探頭。
// 顯示中點貓頭鷹或對話框＝馬上收；點探頭＝彈出來再講一次。#guideText 的字一直留著（只用 class 藏），測試和重講都讀它。
// 看不到的時候（開始畫面、遊戲中、彈窗開著）不算時間。
const owl = { t0: 0, read: 0, quiet: 0, last: performance.now(), selfText: null };
function owlShow(speak) {
  $("guide").classList.remove("fold"); owl.t0 = owl.quiet = performance.now();
  owl.read = speak && save.talk ? 0 : 4000 + 150 * $("guideText").textContent.length;
}
function owlFold() { $("guide").classList.add("fold"); }
setInterval(() => {
  const now = performance.now(), dt = Math.min(1000, now - owl.last), g = $("guide"); owl.last = now;
  if (g.classList.contains("fold")) return;
  if (document.hidden || document.body.classList.contains("gate-on") || g.classList.contains("hidden") || document.querySelector(".overlay:not(.hidden)")) { owl.t0 += dt; owl.quiet += dt; return; }
  if (talking()) owl.quiet = now;
  if (now - owl.t0 >= owl.read + 4000 && now - owl.quiet >= 4000) owlFold();
}, 250);
// 別的地方直接改 #guideText（天氣播報、開場自我介紹）也算新的話；guideSay 自己寫的那次跳過（它已經處理過了）
new MutationObserver(ms => { for (const m of ms) {
  const n = m.addedNodes; if (n.length !== 1 || n[0].nodeType !== 3) continue;   // 注音模組把字拆成小 span 的那次不算
  if (n[0].nodeValue === owl.selfText) owl.selfText = null; else owlShow(false);
} }).observe($("guideText"), { childList: true });
function armIdle() {                                   // 家長設定秒數沒動作 → 只讓「🔊 提示」閃，不出聲
  clearIdle(); if (!save.hintWait || BOARD(mode)) return;
  idleTimer = setTimeout(() => { if (locked || !mode) return; hintPulse(true); }, save.hintWait * 1000);
}
function hintPulse(on) { $("speakBtn").classList.toggle("pulse", on); }
let introUntil = 0;                                    // 第一次玩的開場語還在講：題目語音排在後面，不打斷它
function askSay(t) { if (Date.now() < introUntil) queueSay(t); else say(t); }
function clearIdle() { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; }
function speakPrompt() { const q = round[idx]; if (!q) return; say(mode === "order" ? "我要" + q.word.h : q.word.h); }
// 小孩按「🔊 提示」：唸題目；已經錯 2 次的話，順便讓正確答案晃一下（幫忙只在他開口要的時候給）
function useHint() {
  hintPulse(false); if (locked || !mode) return;
  if (mode === "bubble") { if (bubbleGame) bubbleGame.sayCurrent(); return; }
  speakPrompt(); armIdle();
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
  for (let i = 0; i < Math.max(n, round.length); i++) { const s = el("span"), rt = !!round[i]?.retry; if (results[i] === "gold") s.className = "gold"; else if (results[i] === "silver") s.className = "silver"; if (rt) s.classList.add("retry"); if (i === idx) s.classList.add("cur"); if (results[i] === "gold" && results[i - 1] === "gold" && !rt) s.classList.add("link"); p.appendChild(s); }   // link：A5 連續金星用金色光帶連起來；retry：最後「再試一次」的題
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
  if (!mode || BOARD(mode) || idx >= MODES[mode].rounds) { lsSet(K("resume"), null); return; }
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
  firstPlay = save.intro[m] ? null : m;                 // A20：第一次玩這個模式 → 第 1 題 6 秒沒動作就示範
  if (!save.intro[m] && save.talk) { save.intro[m] = 1; persist(); introUntil = Date.now() + 6000; talk(MODES[m].intro, () => { introUntil = 0; }); }   // 說明語音關著＝不算聽過（家長開回來時還會唸）
  await ensure(m, tok);
  if (tok !== navToken) return;                        // 等圖的時候小孩已經點去別的地方
  lsSet(K("last_mode"), m);
  mode = m; idx = 0; results = []; combo = 0; earned = []; locked = false; wrongThisQ = 0; retryDone = false; wrongN = []; roundTreats = 0;
  const pool = m === "order" ? WORDS.filter(w => w.c === "food") : WORDS;
  round = BOARD(m) ? [] : makeRound(pool, m);
  if (resume) {                                        // 接著上次的題目、從上次那題開始
    const rw = resume.words.map(([h, level]) => ({ word: findWord(h), level })).filter(q => q.word);
    if (rw.length === round.length) { round = rw; idx = resume.idx; results = resume.results || []; combo = resume.combo || 0; earned = (resume.earned || []).map(findWord).filter(Boolean); }
  }
  voicePreload(round.flatMap(q => m === "order" ? ["我要" + q.word.h, q.word.h + "，謝謝你！"]   // 這回合的題目語音先抓
    : m === "hunt" ? [q.word.h, "找到了，" + q.word.h] : [q.word.h]).concat(m === "hunt" ? PHRASES.flatMap(p => [p.h, "找到了，" + p.h]) : []));
  showScreen(m);
  nextQ();
  setTimeout(() => { preload("result"); try { SFX.party.load(); } catch (e) {} }, 2500);   // 玩的時候偷偷準備結算要用的
}
function nextQ() {
  clearIdle();
  if (!BOARD(mode) && idx === MODES[mode].rounds && !retryDone) { retryDone = true; if (addRetries()) return; }
  if (!BOARD(mode) && idx >= round.length) return showResult();
  saveResume();                                       // 每題開始前存一次：關掉平板也能從這題繼續
  wrongThisQ = 0; locked = false; curOpts = null; hintPulse(false); drawProgress();
  ({ fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone, whack: buildWhack, frog: buildFrog, bubble: buildBubble })[mode](round[idx]);
  armIdle(); PZ(polishQ);
}
// 答對：金星（一次對）/ 銀星（錯過再對）；連對音高照大調音階往上爬（A1）＋更多星星；連對 3、6 題、全對有分等級的稱讚（A12）
function correct(target, onDone, { tolerate = 0, holdMs = 1200, autoMs = 1800 } = {}) {   // holdMs：多久後點一下可以跳下一題（A6：揭曉至少停 1.2 秒，免得連點把國字跳掉）
  locked = true; clearIdle(); hintPulse(false);
  const n = MODES[mode].rounds, retry = !!round[idx]?.retry, gold = wrongThisQ <= tolerate; results[idx] = gold ? "gold" : "silver";
  roundTreats++;                                       // 點心：每題答對 +1（已經有貼紙的詞也算）
  if (!retry) wrongN[idx] = wrongThisQ;
  if (gold) { if (!retry) combo++; const w = round[idx]?.word; if (w && !save.stickers[w.h] && !PHRASES.includes(w)) { save.stickers[w.h] = 1; earned.push(w); persist(); } } else if (!retry) combo = 0;   // 再試一次答對也給貼紙（那一下是一次就對）
  const praise = !gold || n <= 1 || retry ? "" : combo === n ? "全部都對！注音小天才！" : combo === 6 ? "哇，六題都對！" : combo === 3 ? "好棒！" : "";   // 再試一次的題不稱讚連對（連對數已經斷過）
  if (praise) autoMs = Math.max(autoMs, 3000);          // 有稱讚的那題多停一下
  play("ok", gold ? stepRate(combo - 1) : 1); burst(target, 10 + Math.min(combo, 4) * 5, BURST[mode]);   // 錯過再對＝回到 Do
  if (praise && save.talk) { const me = {}; pendingSays.add(me); gLater(() => { pendingSays.delete(me); queueTalk(praise); }, 800); }   // 排隊中就算「還在講」：換題要等它
  const pre = PZ(promptBefore);
  if (onDone) onDone(); drawProgress();
  PZ(() => polishCorrect(target, gold, pre));
  const token = ++qToken;                              // 這一題的代號：舊題的計時器不能跳過新題
  const adv = e => {
    if (e && e.target?.closest?.("#homeBtn, #musicBtn, #confirm")) return;   // 按 🏠／🎵／暫停選單不算「點一下下一題」
    document.removeEventListener("pointerdown", adv, true); if (token !== qToken) return; qToken++; idx++; nextQ();
  };
  gLater(() => { if (locked && token === qToken) document.addEventListener("pointerdown", adv, true); }, holdMs);   // 鎖定中再點一下＝直接下一題
  afterQuiet(() => { if (locked && token === qToken) adv(); }, autoMs, LOOK_MS);   // 阿葉 10-10 ②：答案詞＋稱讚播完、再留一下看答案才換題（最快 autoMs）
}
const LOOK_MS = 700;                                   // 語音講完後留給小孩看答案的時間
// 等語音（含排隊中的句子）講完、再安靜 look 毫秒、而且本局時鐘過了 minMs 才做 fn；語音卡住最多等 6 秒（iOS speechSynthesis.speaking 偶爾卡 true）。走本局計時器（暫停凍結、離開作廢）
function afterQuiet(fn, minMs, look = 0) {
  const t0 = gNow(); let quietAt = 0;
  const tick = () => {
    const now = gNow();
    if (talking() && now - t0 < 6000) { quietAt = 0; gLater(tick, 120); return; }
    if (!quietAt) quietAt = now;
    if (now - quietAt >= look && now - t0 >= minMs) fn(); else gLater(tick, 120);
  };
  gLater(tick, 250);
}
// 阿葉 10-10 ⑤：每輪最後，剛剛卡住的（錯過才對＝銀星）挑最多 2 題再試一次，答對才結算；星星照第一次作答算，不會變少也不會變多
let retryDone = false, wrongN = [];
function addRetries() {
  const n = MODES[mode].rounds;
  const stuck = [...Array(n).keys()].filter(i => results[i] === "silver" && round[i]).sort((a, b) => (wrongN[b] || 1) - (wrongN[a] || 1) || b - a).slice(0, 2).sort((a, b) => a - b);
  if (!stuck.length) return false;
  round.push(...stuck.map(i => ({ word: round[i].word, level: round[i].level, retry: true })));
  drawProgress(); hintPulse(false);
  const sec = $(mode), b = el("div", "retry-banner", "剛剛卡住的，再試一次！"); sec.appendChild(b); setTimeout(() => b.remove(), 2600);
  play("select"); talk("剛剛卡住的，再試一次！");
  afterQuiet(nextQ, 1700, 200);
  return true;
}
// 家長頁「容易混淆的注音／聲調」（阿葉 10-10 ⑤）：答錯時，正解跟小孩選的只差一個地方（聲母／韻母／聲調）才記；整個不一樣的（亂點）不算
const INITIALS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ", TONE_NAME = ["一聲", "二聲", "三聲", "四聲", "輕聲"];
function bumpMix(key) { save.mix[key] = (save.mix[key] || 0) + 1; lsSet(K("mix"), save.mix); }
function mixSym(x, y) { if (!x || !y || x === y) return; while (x.length > 1 && y.length > 1 && x[0] === y[0]) { x = x.slice(1); y = y.slice(1); } bumpMix([x, y].sort().join("|")); }   // ㄧㄠ／ㄧㄡ → ㄠ／ㄡ
function mixTone(a, b) { if (a !== b) bumpMix("t:" + [a, b].sort().join("|")); }
function noteMix(want, got) {
  try {
    if (!want || !got || want.length !== got.length) return;
    const sp = s => { const i = INITIALS.includes(s.sym[0]) ? s.sym[0] : ""; return { i, f: s.sym.slice(i.length), t: s.tone }; }, d = [];
    want.forEach((w, k) => { const a = sp(w), b = sp(got[k]); if (a.i !== b.i) d.push(() => mixSym(a.i, b.i)); if (a.f !== b.f) d.push(() => mixSym(a.f, b.f)); if (a.t !== b.t) d.push(() => mixTone(a.t, b.t)); });
    if (d.length === 1) d[0]();
  } catch (e) {}
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
    onTap(b, () => {                                   // A2：手指一碰就算；isConnected：同一下點擊已經換題（舊的魚被拿掉）就不算
      if (locked || !b.isConnected) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); noteMix(parseZ(q.word.z), o.syls); if (o.toneFake) { const d = o.syls.diffAt ?? 0, t = b.querySelectorAll(".syl")[d]?.querySelector(".tone"); if (t) t.classList.add("hint"); } }
    });
    pond.appendChild(b); PZ(() => fitZ(lab, z, 6.5));   // A15：標籤固定大小、字縮放
  });
  curOpts = opts; askSay(q.word.h);
}
function hintCorrect(container, sel, opts) {         // 第二次錯：正解輕輕搖晃當提示
  const nodes = [...container.querySelectorAll(sel)]; const i = opts.findIndex(o => o.ok); if (nodes[i]) { nodes[i].classList.add("wiggle"); setTimeout(() => nodes[i].classList.remove("wiggle"), 1500); }
}

// ---------- 點餐（真正練「看注音→懂意思」：不自動唸，錯 1 次或閒置才唸）----------
function buildOrder(q) {
  const cust = $("customer"); cust.src = `IMAGE/zhuyin/${pick(friends()).id}.webp`; cust.className = "customer enter";   // A8：下一位客人從右邊滑進來
  const bubble = $("orderBubble"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z)));
  const shelf = $("shelf"); shelf.innerHTML = "";
  const foods = WORDS.filter(w => w.c === "food"), opts = makeOptions(q.word, Math.min(q.level, 2), foods).filter(o => o.word);
  for (const o of opts) {
    const it = el("button", "item"); it.textContent = o.word.e;   // 只有圖：國字＋注音會直接洩漏答案，答對後泡泡才揭曉
    onTap(it, () => {
      if (locked || !it.isConnected) return;
      if (o.ok) { it.classList.add("ok"); correct(it, () => { bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(q.word.z), q.word.h)); say(q.word.h + "，謝謝你！"); }); }   // 客人吃東西的動作在 polishCorrect（食物飛到嘴邊才嚼）
      else { wrong(it); if (o.word) noteMix(parseZ(q.word.z), parseZ(o.word.z)); cust.classList.remove("no", "enter", "chew"); void cust.offsetWidth; cust.classList.add("no"); PZ(() => fxMark(cust, "?", { cls: "qm", at: [0.5, 0.02], rise: 3, dur: 800 })); }   // A10：客人搖頭、頭上冒「?」
    });
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
  const slotsEl = $("slots"); slotsEl.innerHTML = ""; bq = { syls, slots: [], toneSlots: [] }; document.querySelectorAll(".tone-tip").forEach(x => x.remove());
  syls.forEach(s => {
    const g = el("div", "sylSlot"), col = el("div", "col"), arr = [];
    for (let i = 0; i < s.sym.length; i++) { const d = el("div", "slot"); col.appendChild(d); arr.push(d); }
    const ts = el("div", "slot toneSlot off"); g.appendChild(col); g.appendChild(ts); slotsEl.appendChild(g); bq.slots.push(arr); bq.toneSlots.push(ts);
  });
  const tray = $("tray"); tray.innerHTML = "";
  for (const c of shuffle([...need.map(c => ({ t: "s", v: c })), ...pool.map(c => ({ t: "s", v: c }))])) { const b = el("button", "tile", c.v); b.dataset.v = c.v; if (!PZ(() => dragTile(b, false))) b.onclick = () => placeSym(b); tray.appendChild(b); }   // A8：可以點、也可以拖
  const toneRow = $("toneRow"); toneRow.innerHTML = ""; toneRow.classList.add("hidden");
  [0, 1, 2, 3, 4].forEach(t => { const b = el("button", "tile toneTile" + (t ? " tv" + (t + 1) : ""), TONE_TILE[t]); b.dataset.v = t; b.setAttribute("aria-label", t ? TONE_NAME[t] : "一聲（空白，不用加符號）"); if (!PZ(() => dragTile(b, true))) b.onclick = () => placeTone(b); toneRow.appendChild(b); });   // tv2~tv5：跟題目同一套向量聲調圖
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
function placeSym(b, pref) {                          // pref：拖曳放開時手指底下那一格（是這個符號的正解格就放那格；對錯判定規則不變）
  if (locked || b.classList.contains("used")) return;
  const empties = emptySlots(); if (!empties.length) return;
  const fits = ([i, j]) => bq.syls[i].sym[j] === b.dataset.v;
  const hit = empties.find(e => e[2] === pref && fits(e)) || empties.find(fits);   // 放到任一空格的正解（小孩先拼第二個音節也算對）
  if (hit) { const d = hit[2]; d.dataset.v = b.dataset.v; d.textContent = b.dataset.v; d.classList.remove("bad", "cur"); d.classList.add("good"); b.classList.add("used"); play("tap", stepRate(pz.placed++)); PZ(() => tileLand(b, d)); }   // A8：每放對一格音高升一級、積木飛進格子
  else {
    wrongThisQ++; combo = 0; play("ng"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); const d = pref && !pref.dataset.v ? pref : empties[0][2]; d.classList.remove("bad"); void d.offsetWidth; d.classList.add("bad");
    const e = empties.find(x => x[2] === d); if (e) { const want = bq.syls[e[0]].sym[e[1]], got = b.dataset.v; if (INITIALS.includes(want) === INITIALS.includes(got)) mixSym(want, got); }   // 同類（聲母對聲母、韻母對韻母）放錯才算混淆
    if (wrongThisQ >= 2) hintPulse(true);
  }
  markCur(); refreshToneRow(); armIdle();
}
function refreshToneRow() {                          // 有音節符號填滿且還沒聲調 → 顯示聲調積木、該格亮起
  let anyOpen = false;
  bq.syls.forEach((s, i) => { const full = bq.slots[i].every(d => d.dataset.v); const ts = bq.toneSlots[i]; if (full && ts.dataset.v === undefined) { ts.classList.remove("off"); ts.classList.add("open"); anyOpen = true; } else ts.classList.remove("open"); });
  $("toneRow").classList.toggle("hidden", !anyOpen);
  const oi = bq.syls.findIndex((s, k) => bq.toneSlots[k].classList.contains("open"));
  if (oi >= 0 && bq.syls[oi].tone === 0 && !lsGet(K("tone1tip"), 0)) { lsSet(K("tone1tip"), 1); toneTip(true); }   // ⑥ 第一次遇到一聲：教他按空白積木
  if (!anyOpen && bq.syls.every((s, i) => bq.toneSlots[i].dataset.v !== undefined)) finishBuild();
}
function placeTone(b) {
  if (locked) return;
  const i = bq.syls.findIndex((s, k) => bq.toneSlots[k].classList.contains("open")); if (i < 0) return;
  const ts = bq.toneSlots[i], v = +b.dataset.v;
  if (v === bq.syls[i].tone) { document.querySelectorAll(".tone-tip").forEach(x => x.remove()); b.classList.remove("tipped"); ts.dataset.v = v; ts.textContent = TONE_TILE[v]; if (v) ts.classList.add("tv" + (v + 1)); ts.classList.remove("bad"); ts.classList.add("good"); play("tap", stepRate(pz.placed++)); PZ(() => tileLand(b, ts)); }
  else { wrongThisQ++; combo = 0; play("ng"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); ts.classList.remove("bad"); void ts.offsetWidth; ts.classList.add("bad"); mixTone(bq.syls[i].tone, v);
    if (bq.syls[i].tone === 0 && !bq.tipAgain) { bq.tipAgain = true; toneTip(false); }   // 一聲放錯：再提醒一次（只出字、不再唸）
    if (wrongThisQ >= 2) hintPulse(true); }
  refreshToneRow(); armIdle();
}
// ⑥ 一聲＝空白積木的提示：泡泡指著空白積木＋它晃一下；speak＝順便唸出來（第一次）
function toneTip(speak) {
  const row = $("toneRow"), blank = row.querySelector('.toneTile[data-v="0"]'); if (!blank) return;
  document.querySelectorAll(".tone-tip").forEach(x => x.remove());
  const tip = el("div", "tone-tip", "第一聲不用加符號，按這個空白格就好"); $("build").appendChild(tip);
  const r = blank.getBoundingClientRect(), sr = $("build").getBoundingClientRect();
  const cx = r.left + r.width / 2 - sr.left, tw = tip.offsetWidth, x = Math.min(sr.width - tw / 2 - 8, Math.max(tw / 2 + 8, cx));   // 泡泡夾在畫面內，箭頭照樣指著空白積木
  tip.style.left = x + "px"; tip.style.top = (r.top - sr.top) + "px"; tip.style.setProperty("--ax", (cx - x + tw / 2) + "px");
  blank.classList.add("tipped"); wiggle(blank);
  const tok = navToken, q = idx; setTimeout(() => { if (tok === navToken && idx === q) { tip.classList.add("bye"); setTimeout(() => tip.remove(), 400); } }, 5200);
  if (speak) talk("第一聲不用加符號，按這個空白格就好");
}
function finishBuild() {
  const q = round[idx];
  correct($("slots"), () => { $("buildPrompt").appendChild(el("span", "han", q.word.h)); say(q.word.h); }, { tolerate: 1 });   // 錯 ≤1 次仍算金星
}

// ---------- 尋寶（場景 8 個東西，泡泡只給注音、不唸；後段用「顏色＋東西」短語）----------
function buildHunt(q) {
  const scene = $("scene"); scene.innerHTML = "";
  const bubble = $("huntBubble"); bubble.innerHTML = ""; $("bag").textContent = `🎒 ${results.slice(0, MODES.hunt.rounds).filter(Boolean).length}/${MODES.hunt.rounds}`;   // A8：背包「找到幾個／共幾個」（答對時東西飛進去才加）
  let target = q.word, objs;
  if (q.level >= 3) {                                // 短語題：目標＋它的顏色配對＋6 個其他詞
    target = q.retry && PHRASES.includes(q.word) ? q.word : pick(PHRASES); q.word = target; const pairE = target.pair;   // 再試一次：同一個短語
    const others = shuffle(WORDS.filter(w => w.e !== target.e && w.e !== pairE)).slice(0, 6);
    objs = shuffle([{ e: target.e, ok: true }, { e: pairE, ok: false }, ...others.map(w => ({ e: w.e, ok: false }))]);
  } else { const others = shuffle(WORDS.filter(w => w !== q.word && w.e !== q.word.e)).slice(0, 7); objs = shuffle([{ e: q.word.e, ok: true }, ...others.map(w => ({ e: w.e, ok: false }))]); }
  bubble.appendChild(renderZ(parseZ(target.z)));
  const cols = 4, rows = 2;                          // 4×2 格點＋隨機抖動，不重疊
  objs.forEach((o, i) => {
    const b = el("button", "obj", o.e); const c = i % cols, r = Math.floor(i / cols);
    const portrait = innerHeight > innerWidth, jx = portrait ? 2 : 6;
    b.style.left = (5 + c * 23 + Math.random() * jx) + "%"; b.style.top = (8 + r * 44 + Math.random() * 12) + "%";
    onTap(b, () => {
      if (locked || !b.isConnected) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(target.z), target.h)); say("找到了，" + target.h); }); }
      else wrong(b);
    });
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
  board.style.setProperty("--zf1", Math.min(best.h * 0.75 / 3.4, best.w * 0.82 / 1.8) + "px");   // A14：單音節卡只有一欄，字可以大很多（8 張約 70px）
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
  voicePreload(words.map(w => w.h));                   // 配對成功會唸詞
  board.className = "board n" + cards.length; layoutBoard(cards.length);
  for (const c of cards) {
    const card = el("button", "card k" + c.kind); const inner = el("div", "inner"); const back = el("div", "face back"); const front = el("div", "face front");   // kz＝注音卡（藍背）、ke＝圖卡（橘背）
    if (c.kind === "z") { const zs = parseZ(c.w.z); front.appendChild(renderZ(zs)); if (zs.length === 1) card.classList.add("one"); } else { front.appendChild(el("div", "em", c.w.e)); }
    inner.appendChild(back); inner.appendChild(front); card.appendChild(inner); card._c = c;
    onTap(card, () => { if (card.isConnected) flip(card); }); board.appendChild(card);   // A2：手指一碰就翻
  }
  PZ(() => matchCount(false));                          // A14：頂上配對計數「0/4」
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
    gLater(() => { a.classList.add("done"); b.classList.add("done"); play("ok", stepRate(mq.matched)); burst(b, 12); say(a._c.w.h); mq.matched++; mq.open = []; mq.busy = false;
      const pic = a._c.kind === "e" ? a : b, reveal = () => { if (!pic.querySelector(".front .han")) pic.querySelector(".front").appendChild(el("div", "han", a._c.w.h)); };   // 配對成功才揭曉國字（自動加注音）
      if (!PZ(() => pairFx(a, b, reveal))) reveal();    // A3：兩張一起放大＋金框，閃光從注音卡飛到圖卡再揭曉
      const w = a._c.w; if (!save.stickers[w.h]) { save.stickers[w.h] = 1; earned.push(w); persist(); }   // 配對成功＝讀對了，直接貼貼紙
      if (mq.matched === mq.pairs) finishMatch(); }, 350);
  } else {
    mq.miss++;
    let done = false;                                  // 錯配：停 0.9 秒（16/24 張 1.2 秒，可以點一下提早蓋回）；蓋回的牌背留腳印
    const back = () => { if (done) return; done = true; mq.hold = null; a.classList.remove("up"); b.classList.remove("up"); a.classList.add("seen"); b.classList.add("seen"); play("flip", 0.85); mq.open = []; mq.busy = false; };   // A3：翻錯只是蓋回去，不播失敗音
    gLater(() => { if (!done && mq.pairs > 4) mq.hold = back; }, 450);
    gLater(back, mq.pairs > 4 ? 1200 : 900);
  }
}
// 翻牌圖卡不收的詞（櫻木 B4：看圖猜不出、或圖意會偏）
const MATCH_EXCLUDE = new Set(["紅色", "黃色", "藍色", "綠色", "爸爸", "媽媽", "爺爺", "奶奶", "寶寶", "醫生", "警察", "老師",
  "跑步", "游泳", "睡覺", "唱歌", "跳舞", "笑", "哭", "水", "杯子", "積木", "玩具", "湯", "嘴巴"]);
function finishMatch() {
  clearIdle(); locked = true; results = ["gold"]; combo = 0; roundTreats += mq.pairs;   // 翻牌：每配對一組 1 個點心
  const th = { 4: [4, 8], 8: [10, 18], 12: [16, 28] }[mq.pairs] || [mq.pairs, mq.pairs * 2];   // 櫻木 B1：3 星／2 星的錯配上限
  results[0] = mq.miss <= th[0] ? "gold" : "silver"; mq.stars = mq.miss <= th[0] ? 3 : mq.miss <= th[1] ? 2 : 1;
  persist(); gLater(() => talk("全部找到了！"), 900); gLater(showResult, 1800);   // 走本局計時器：結算前離開＝不會跳出結算畫面
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
    onTap(b, () => {
      if (locked || !b.isConnected) return;
      if (o.ok) { b.classList.add("ok"); play("pop"); correct(b, () => { p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); noteMix(ts, o.syls); play("tap", 0.6); }               // A10：氣球漏氣扭一扭（CSS .balloon.ng）
    });
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
  const field = $("field"); field.innerHTML = ""; field.classList.remove("lock"); const cells = [];
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
  const lk = now < s.lockUntil; if (lk !== !!s.lk) { s.lk = lk; $("field").classList.toggle("lock", lk); }   // A11：敲錯鎖定中注音牌變灰
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
  c.z = z; c.sign.innerHTML = ""; const zz = renderZ(parseZ(z)); zz.style.fontSize = (s.ts.length >= 2 ? 4 : 5) + "vmin"; c.sign.appendChild(zz);
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
  if (!s || !c.mole.isConnected || s.done || locked || c.state !== "up") return;   // isConnected：同一下點擊已經換題（舊地鼠被拿掉）就不算
  if (now < s.lockUntil) { play("tap", 0.7); c.mole.classList.remove("meh"); void c.mole.offsetWidth; c.mole.classList.add("meh"); return; }   // A11：敲錯鎖定中點了有回應（牌子是灰的），不算分也不算錯
  armIdle();
  if (c.ok) {
    s.missOk = 0; s.wrongRun = 0;
    // 連續 2 次很快敲中 → 探頭短一點；最近 2 秒內有敲錯（亂拍）不算「很快」，免得亂拍把難度壓到最難還存進存檔
    if (c.until - now >= 1500 && now - s.lastWrongAt > 2000) { if (++s.fast >= 2) { adjustUp(-0.2); s.fast = 0; } } else s.fast = 0;
    s.hits++; const gold = ++whackRun % 5 === 0;
    c.state = "hit"; c.mole.className = "mole up hit" + (gold ? " golden" : "");
    if (gold) { play("sticker"); burst(c.mole, 22, "🌟"); } else { play("pop", 1 + s.hits * 0.1); burst(c.mole, 6, "💫"); PZ(() => fxSpray(c.mole.querySelector(".mbody") || c.mole, 8, { colors: ["#8b5a2b", "#a0703c", "#6d4321", "#5c3a1a"], size: 2.6, dist: 9, grav: 12, dur: 600 })); }   // A7：地鼠＝土塊＋暈眩星
    $("whackDots").children[s.hits - 1]?.classList.add("on");
    setTimeout(() => { if (c.state === "hit") moleDown(c, performance.now(), false); }, 450);
    if (s.hits >= WH.hits) {
      s.done = true; cancelAnimationFrame(s.raf);
      for (const o of s.cells) if (o !== c && o.state === "up") moleDown(o, now, false);
      correct($("whackPic"), () => { $("whackPic").appendChild(renderZ(s.ts, s.q.word.h)); say(s.q.word.h); }, { tolerate: 1, holdMs: 1200, autoMs: 2200 });   // 連打中的小孩別一下就把揭曉跳掉
    }
  } else {
    wrongThisQ++; combo = 0; whackRun = 0; s.wrongRun++; s.lastWrongAt = now; if (c.z) noteMix(s.ts, parseZ(c.z)); s.lockUntil = now + 500 * Math.min(3, s.wrongRun); play("ng");
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
  gLater(() => { if (!frogLive(s)) return; f.classList.remove("jump"); PZ(() => fxRipple(lp)); if (done) done(); }, 460);   // A4：落地水波
}
function padTap(pad, o) {
  const s = fq, now = performance.now(); if (!s || !pad.isConnected || !frogLive(s) || locked || pad.classList.contains("sink")) return;   // 里維 10-10：「再點一下換題」跟荷葉同一下點擊時，舊荷葉不能推進新題
  if (s.busy) { if (!o.ok && now - s.okAt < 150 && !s.slapped) { s.slapped = true; wrongThisQ++; } return; }   // 整個手掌拍下去（正解剛好先算到）：還是記一次錯
  if (now < s.lockUntil) return;                       // 跳錯後 0.8 秒全部荷葉點不動（亂點不會因為錯的沉掉就一定過）
  armIdle();
  if (o.ok) {
    s.busy = true; s.okAt = now; s.slapped = false; frogStreak = Math.min(8, frogStreak + 1); hintPulse(false);
    play("tap", 1.4); const sq = PZ(() => s.frog.animate([{ scale: "1 1" }, { scale: "1.08 0.8" }], { duration: 80, easing: "ease-out", fill: "forwards" }));   // A4：點下當下就出聲、青蛙先壓扁 80ms 再跳
    gLater(() => { if (sq) sq.cancel(); if (frogLive(s)) frogJump(pad._lp, () => {
      pad.classList.remove("enter"); pad.classList.add("bloom"); play("pop", Math.pow(2, frogStreak / 12)); burst(pad, 16);   // 跳對特效要比掉水大很多（防故意跳水）
      for (const c of s.cols) if (c.pad !== pad) c.pad.classList.add("gone");
      gLater(() => {
        if (!frogLive(s)) return;
        for (const c of s.cols) if (c.pad !== pad) c.pad.remove();
        s.step++;
        if (s.step >= s.k) frogJump([s.k + 1], finishFrog); else { s.busy = false; showPads(); }
      }, 350);
    }); }, 80);
  } else {
    wrongThisQ++; combo = 0; frogStreak = 0; s.lockUntil = now + 800; noteMix([s.ts[s.step]], parseZ(o.z)); play("ng"); burst(pad, 4, "💧"); pad.classList.add("sink");
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

// ---------- 泡泡救援灣（阿葉 10-11，GPT 提案）：引擎在 js/zhuyin-bubble.js（第一次玩才載）；十個固定關卡、三種符號、救小企鵝 ----------
const BOARD = m => m === "match" || m === "bubble";      // 單一盤面的模式：沒有一題一題的回合
const BUBBLE_N = 10;
let bubbleMod = null, bubbleGame = null, bubbleRun = null, bubbleLevel = 0;
const importBubble = () => bubbleMod || (bubbleMod = import("./zhuyin-bubble.js?v=1").catch(e => { bubbleMod = null; throw e; }));
async function buildBubble() {
  const tok = navToken; let m;
  try { m = await importBubble(); } catch (e) { console.warn("[bubble]", e); if (tok === navToken) goMenu(); return; }
  if (tok !== navToken || mode !== "bubble") return;
  if (!bubbleGame) bubbleGame = m.createBubbleGame($("bubbleRoot"), {
    say: t => say(t), talk: t => talk(t), play, later: (fn, ms) => gLater(fn, ms), paused: () => gamePaused,
    onWin: r => bubbleWin(r), onFull: () => bubbleFull(), animalImg: "IMAGE/zhuyin/cust_penguin.webp", animalName: "小企鵝" });
  bubbleRun = { level: bubbleLevel, stars: 0, rescued: 0 };
  bubbleGame.start(bubbleLevel);
}
function bubbleWin(r) {
  if (mode !== "bubble") return;
  locked = true; clearIdle();
  const b = save.bubble; b.stars[r.level] = Math.max(b.stars[r.level] || 0, r.stars); b.lv = Math.max(b.lv, Math.min(BUBBLE_N - 1, r.level + 1)); if (r.level === BUBBLE_N - 1) b.all = 1; persist();
  bubbleRun = { ...r }; results = [r.stars >= 3 ? "gold" : "silver"]; roundTreats += 2 + (r.rescued || 0);
  gLater(showResult, 700);
}
function bubbleFull() {
  if (mode !== "bubble") return;
  talk("泡泡太多了，我們再試一次！");
  gLater(() => { if (mode === "bubble" && bubbleGame) bubbleGame.start(bubbleRun.level); }, 2400);
}
// 選關：過過的關有星星、下一關黃框、還沒到的鎖著
function openBubblePick() {
  const box = $("bubbleLevels"); box.innerHTML = "";
  for (let i = 0; i < BUBBLE_N; i++) {
    const open = i <= save.bubble.lv, s = save.bubble.stars[i] || 0, b = el("button", "bb-lv" + (open ? "" : " locked") + (i === save.bubble.lv && !save.bubble.all ? " next" : ""));
    b.appendChild(el("div", "n", String(i + 1))); b.appendChild(el("div", "s", open ? "⭐".repeat(s) || "　" : "🔒"));
    b.disabled = !open; b.setAttribute("aria-label", `第 ${i + 1} 關`);
    b.onclick = () => { play("select"); bubbleLevel = i; $("bubblePick").classList.add("hidden"); startMode("bubble"); };
    box.appendChild(b);
  }
  $("bubblePick").classList.remove("hidden");
}

// ---------- 結算（B1）：星星一顆顆蓋章 → 新貼紙一張張貼 → 星星飛進星星罐 → 按鈕最後才淡入 ----------
// 演出中點畫面＝快轉到最後（小孩不會卡住）；按鈕一直在 DOM 裡、只用透明度淡入（測試用 JS .click() 照常有效）
let rs = null;                                        // 這次結算演出的狀態；換畫面（navToken 變）或快轉後作廢
const RESULT_TEXT = any => mode === "match" ? "全部配對成功！" : mode === "bubble" ? `救出 ${bubbleRun?.rescued || 1} 隻小企鵝！` : mode === "fish" ? `釣到 ${any} 條魚！` : mode === "hunt" ? `找到 ${any} 個寶物！` : mode === "tone" ? `戳破 ${any} 顆氣球！` : mode === "whack" ? `敲到 ${any * WH.hits} 隻地鼠！` : mode === "frog" ? `青蛙過了 ${any} 條河！` : `完成 ${any} 題！`;
function showResult() {
  clearIdle(); locked = false; lsSet(K("resume"), null); document.querySelectorAll("#result .rw-strip").forEach(x => x.remove());
  voicePreload([`拿到 ${earned.length} 張新貼紙！`]);
  const n = MODES[mode].rounds, first = results.slice(0, n), golds = first.filter(r => r === "gold").length, any = first.filter(Boolean).length;   // 星星只算第一次作答（再試一次的題不算）
  roundStars = mode === "match" ? (mq?.stars || 2) : mode === "bubble" ? (bubbleRun?.stars || 2) : golds >= n - 1 ? 3 : golds >= Math.ceil(n / 2) ? 2 : 1;
  const prevBest = save.best[mode] || 0, record = prevBest > 0 && roundStars > prevBest;   // 個人紀錄（B14）：第一次玩沒有紀錄可破
  if (roundStars > prevBest) save.best[mode] = roundStars;
  const jarFrom = RW.jarLeft(save.rw, save.stars);
  save.stars += roundStars;
  const rwGain = { coins: RW.creditJar(save.rw, save.stars), stamp: RW.stampToday(save.rw, today()), cats: RW.categoryBonus(save.rw, CATS.map(c => ({ id: c.id, words: WORDS.filter(w => w.c === c.id).map(w => w.h) })), save.stickers), treats: roundTreats, fed: RW.feed(save.rw, roundTreats) };
  persist();
  const st = rs = { tok: navToken, T: [], fly: [], done: false, said: false, record, stamped: false, jarFrom, t0: performance.now(), k: earned.length, rw: rwGain };
  const at = (ms, fn) => st.T.push(setTimeout(() => { if (rs === st && !st.done && st.tok === navToken) fn(); }, ms));
  showScreen("result"); play("party"); duck(true); setTimeout(() => duck(false), 7000);
  $("resultCf").innerHTML = ""; confetti(45, $("resultCf"));
  $("resultText").textContent = RESULT_TEXT(any);
  // 星星：三格先放灰星，拿到的 0.5／0.9／1.3 秒蓋章，各配 Do-Mi-So；第 3 顆大爆＋整頁輕震
  const starsEl = $("resultStars"); starsEl.innerHTML = ""; starsEl.classList.remove("done");
  const stars = [0, 1, 2].map(i => { const s = el("span", "star" + (i < roundStars ? " on" : "")); s.style.setProperty("--d", (0.5 + i * 0.4) + "s"); starsEl.appendChild(s); return s; });
  for (let i = 0; i < roundStars; i++) at(500 + i * 400, () => { play("ok", [1, 1.26, 1.5][i]); burst(stars[i], i === 2 ? 20 : 8); if (i === 2) quake(); });
  if (record) at(1750, () => stampRecord(st));
  // 貼紙：1.8 秒起每 0.45 秒一張、一張比一張高 2 個半音；最後一張後 0.3 秒唸「拿到 N 張」
  const box = $("resultStickers"); box.innerHTML = ""; box.classList.remove("done"); box.classList.toggle("many", st.k > 6);
  earned.forEach((w, i) => { const s = stickerNode(w, true); s.style.animationDelay = (1.8 + i * 0.45) + "s"; box.appendChild(s); at(1800 + i * 450, () => play("sticker", 2 ** (2 * i / 12))); });
  const tVoice = st.k ? 1800 + (st.k - 1) * 450 + 300 : 1800;
  at(tVoice, () => resultVoice(st));
  if (!st.k) at(1800, () => showPracticed(st));
  // 星星罐：右下常駐，先顯示加星前的數字；星星飛進去時一格一格跳
  const jarBtn = $("hatchHint"); paintJar(jarBtn, jarFrom); jarBtn.classList.remove("ready");
  const tFly = Math.max(tVoice + 400, 2400);
  at(tFly, () => flyStarsToJar(st, stars.slice(0, roundStars)));
  at(tFly + Math.max(0, roundStars - 1) * 150 + 800, () => finishResult(st, false));
  $("resultBtns").classList.add("wait");
  $("againBtn").textContent = mode === "bubble" && bubbleRun && bubbleRun.level < BUBBLE_N - 1 ? "▶️ 下一關" : "🔁 再玩";
}
function quake() {                                    // 整頁輕震 0.2 秒（放大一點點再震，邊緣不會露出底色）
  try { $("result").animate([{ transform: "none" }, { transform: "scale(1.025) translate(-0.7vmin, 0.4vmin)" }, { transform: "scale(1.02) translate(0.6vmin, -0.4vmin)" }, { transform: "scale(1.01) translate(-0.3vmin, 0.2vmin)" }, { transform: "none" }], { duration: 200 }); } catch (e) {}
}
function stampRecord(st) { if (st.stamped) return; st.stamped = true; $("resultStars").appendChild(el("div", "rec-stamp", "新紀錄！")); play("win"); }
function resultVoice(st) {
  if (st.said) return; st.said = true;
  if (mode === "bubble") talk("小企鵝都救出來了，好厲害！"); else if (st.k) talk(`拿到 ${st.k} 張新貼紙！`); else talk(practicedWords().every(w => save.stickers[w.h]) ? "都收集過了，好厲害！" : "下次直接答對，就能拿到新貼紙喔！");
}
// 這回合練過的詞（貼紙詞庫裡有的、不重複）
function practicedWords() { const ws = mode === "match" ? (mq?.words || []) : mode === "bubble" ? [] : round.map(q => q.word); return [...new Map(ws.filter(w => w && !PHRASES.includes(w)).map(w => [w.h, w])).values()]; }
function showPracticed(st) {                           // 沒有新貼紙：列出練過的詞（小貼紙、不 slap）＋一句話
  const box = $("resultStickers"); if (st.shownPracticed) return; st.shownPracticed = true;
  if (mode === "bubble") { box.appendChild(el("div", "all-done", `第 ${(bubbleRun?.level || 0) + 1} 關過關！`)); return; }
  const ws = practicedWords(), all = ws.every(w => save.stickers[w.h]);
  box.appendChild(el("div", "all-done", all ? "都收集過了，好厲害！" : "下次直接答對，就能拿到新貼紙喔！"));
  const row = el("div", "mini-row"); for (const w of ws.slice(0, 12)) { const s = stickerNode(w); s.classList.add("mini"); row.appendChild(s); } box.appendChild(row);
}
// 星星從結算的星星位置畫弧線飛進右下的星星罐（0.6 秒、縮到 0.3），每到一顆罐子漲一點、數字跳一格
function flyStarsToJar(st, from) {
  const jarBtn = $("hatchHint"), jar = jarBtn.querySelector(".jar"), fx = $("fx");
  from.forEach((s, j) => st.T.push(setTimeout(() => {
    if (st.done || rs !== st) return;
    const a = s.getBoundingClientRect(), b = jar.getBoundingClientRect(), f = el("div", "flystar", "⭐"); fx.appendChild(f); st.fly.push(f);
    const half = parseFloat(getComputedStyle(f).fontSize) / 2, x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - innerHeight * 0.12, frames = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t, x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1; frames.push({ transform: `translate(${(x - half).toFixed(1)}px, ${(y - half).toFixed(1)}px) scale(${(1 - 0.7 * t).toFixed(2)})` }); }
    const an = f.animate(frames, { duration: 600, easing: "ease-in", fill: "forwards" });
    an.onfinish = () => { f.remove(); if (st.done || rs !== st) return; paintJar(jarBtn, st.jarFrom + j + 1); const t = jarBtn.querySelector(".jarText"); t.classList.remove("tick"); void t.offsetWidth; t.classList.add("tick"); play("tap", 1.2 + j * 0.15); };
  }, j * 150)));
}
// 收尾（自動演完或快轉）：所有東西直接到最後的樣子，按鈕淡入
function finishResult(st, skipped) {
  if (st.done) return; st.done = true; st.T.forEach(clearTimeout); st.fly.forEach(f => f.remove());
  $("resultStars").classList.add("done"); $("resultStickers").classList.add("done");
  if (!st.k) showPracticed(st);
  if (st.record) stampRecord(st);
  if (!st.said) resultVoice(st);
  updateJar(); PZ(() => rewardStrip(st));
  const btns = $("resultBtns"); btns.classList.add("arming"); btns.classList.remove("wait");
  setTimeout(() => btns.classList.remove("arming"), skipped ? 350 : 0);   // 快轉那一下的手指不會順便按到「再玩」
}
// 貼紙：圖＋國字（國字旁邊自動加注音）
function stickerNode(w, fresh) { const s = el("div", "sticker" + (fresh ? " fresh" : "") + (w.h.length >= 3 ? " long" : "")); s.appendChild(el("div", "em", w.e)); s.appendChild(el("div", "hz", w.h)); return s; }

// ---------- 星星罐 / 孵蛋 ----------
function paintJar(b, inJar) {                          // 一個星星罐按鈕畫成罐裡有 inJar 顆（B11：0 顆時罐裡兩顆虛線小星）
  const f = b.querySelector(".jarFill"), t = b.querySelector(".jarText"), j = b.querySelector(".jar");
  if (f) f.style.height = Math.min(100, inJar / EGG_STARS * 100) + "%";
  if (t) t.textContent = `${Math.min(inJar, EGG_STARS)}/${EGG_STARS}`;
  if (j) j.classList.toggle("empty", inJar <= 0);
}
function updateJar() {
  const inJar = RW.jarLeft(save.rw, save.stars), coins = save.rw.coins + save.rw.gold;
  for (const b of document.querySelectorAll(".jarBtn")) {
    if (b.id === "hatchHint" && rs && !rs.done) continue;   // 結算演出中的罐子由演出自己畫
    paintJar(b, inJar); b.classList.toggle("ready", coins > 0);
    const e = b.querySelector(".egg"); if (e && !b.id) { const n = String(coins); e.classList.toggle("zero", coins === 0); if (e.textContent !== "🪙" + n) { e.textContent = ""; e.append(el("i", "eg-ico", "🪙"), n); } }   // 幣圖示單獨一個 <i>：只有它會輕跳，數字不動
  }
}
// 星星罐（舊的「孵蛋」）→ 扭蛋機：有扭蛋幣就打開扭蛋機，沒有就說還差幾顆星
function tryHatch() {
  if (save.rw.coins + save.rw.gold > 0) { openGacha(); return; }
  guideSay(`再 ${EGG_STARS - RW.jarLeft(save.rw, save.stars)} 顆星星就可以扭蛋囉！`);
}
// ---------- 扭蛋機（docs/zhuyin-rewards-spec.md）：投幣轉一轉 → 膠囊掉下來（顏色＝稀有度）→ 點膠囊打開 → 寵物蛋就孵蛋、裝飾放上小島、點心餵夥伴 ----------
const CAPSULE = { common: "capsule_blue", rare: "capsule_purple", ssr: "capsule_gold" };
let gachaBusy = false;
async function openGacha() {
  const tok = navToken; await ensure("gacha", tok); if (tok !== navToken) return;
  renderGacha(); $("gacha").classList.remove("hidden");
  if (!gachaBusy) talk(save.rw.coins + save.rw.gold > 0 ? "投一枚扭蛋幣，轉一轉！" : "收集星星，就能拿到扭蛋幣喔！");
}
function renderGacha() {
  const c = save.rw.coins, g = save.rw.gold;
  $("gachaCoins").textContent = `🪙 ${c}`; $("gachaGold").textContent = `🌟 ${g}`; $("gachaGold").classList.toggle("hidden", !g);
  $("gachaGo").disabled = gachaBusy || c <= 0; $("gachaGoGold").disabled = gachaBusy || g <= 0; $("gachaGoGold").classList.toggle("hidden", !g);
  $("gachaNext").textContent = c + g > 0 ? "" : `再 ${EGG_STARS - RW.jarLeft(save.rw, save.stars)} 顆⭐換一枚扭蛋幣`;
}
async function spinGacha(useGold) {
  if (gachaBusy) return;
  const prize = RW.pull(save.rw, { useGold }); if (!prize) { renderGacha(); return; }
  gachaBusy = true; if (!persist()) guideSay("存檔空間滿了，請爸媽到家長設定看一下喔！", false); renderGacha(); play("select");
  try { await gachaShow(prize); } catch (e) { console.warn("[gacha]", e); }
  finally { gachaBusy = false; persist(); renderGacha(); updateJar(); if (hub) { hub.setPets(hubPets()); hub.setDecor(hubDecor()); } }
}
async function gachaShow(prize) {
  const m = $("gachaMachine"), cap = $("gachaCap"), box = $("gachaPrize"); box.classList.add("hidden"); box.innerHTML = "";
  m.classList.remove("spin"); void m.offsetWidth; m.classList.add("spin");
  for (let i = 0; i < 4; i++) setTimeout(() => play("tap", 0.9 + i * 0.12), i * 260);
  await new Promise(r => setTimeout(r, 1150));
  cap.src = `IMAGE/zhuyin/${CAPSULE[prize.tier]}.webp`; cap.className = "gacha-cap drop " + prize.tier; play("pop", prize.tier === "ssr" ? 1.4 : 1);
  if (prize.tier === "ssr") { play("sticker"); PZ(() => fxFlash()); }
  $("gachaTip").textContent = "點一下膠囊打開！";
  await new Promise(r => { cap.onclick = () => { cap.onclick = null; r(); }; setTimeout(() => { if (cap.onclick) { cap.onclick = null; r(); } }, 6000); });
  cap.classList.add("open"); play("win"); $("gachaTip").textContent = "";
  await new Promise(r => setTimeout(r, 380));
  cap.className = "gacha-cap hidden";
  if (prize.kind === "pet" && !prize.dup) {
    const p = RW.PET[prize.id]; $("gacha").classList.add("hidden");
    await playHatchShow(`IMAGE/zhuyin/pets/${p.id}.webp`, p.name, { taps: 3, line: p.name + "來了！", egg: prize.tier });
    $("gacha").classList.remove("hidden"); showPrize(prize.tier === "ssr" ? "🌈 超稀有！" : "💜 稀有！", `${p.name}來小島了！`, `IMAGE/zhuyin/pets/${p.id}.webp`);
  } else if (prize.kind === "pet") { showPrize("🍪 點心 +" + prize.amount, `已經有${RW.PET[prize.id].name}了，換成點心！`, `IMAGE/zhuyin/pets/${prize.id}.webp`); talk("換成點心囉！"); }
  else if (prize.kind === "decor") { const d = RW.DECOR.find(x => x.id === prize.id); showPrize(d.e + " " + d.name, "放到小島上了！"); talk("小島多了一個新裝飾！"); }
  else { showPrize("🍪 點心 +" + prize.amount, "點心會餵給你的夥伴，讓牠長大！"); talk("拿到點心了！"); }
  if (prize.grew) { const p = RW.PET[save.rw.partner]; queueTalk(`${p.name}${prize.grew === 3 ? "變成超級" : "長大"}了！`); }
}
function showPrize(title, sub, img) {
  const box = $("gachaPrize"); box.innerHTML = "";
  if (img) { const i = el("img", "gp-img"); i.src = img; i.alt = ""; box.appendChild(i); }
  box.appendChild(el("div", "gp-t", title)); box.appendChild(el("div", "gp-s", sub)); box.classList.remove("hidden");
}
// 結算畫面最下面一行：點心、集章卡、扭蛋幣、夥伴長大
function rewardStrip(st) {
  if (!st.rw || st.rwShown) return; st.rwShown = true;
  const g = st.rw, box = el("div", "rw-strip"), add = t => box.appendChild(el("span", "", t));
  if (g.treats) add(`🍪 點心 +${g.treats}`);
  if (g.stamp.stamped) add(g.stamp.gold ? "📅 集章卡集滿！🌟 金幣 +1" : `📅 集章 ${save.rw.stamps}/7`);
  if (g.coins) add(`🪙 扭蛋幣 +${g.coins}`);
  if (g.cats.length) add(`🎉 ${g.cats.map(id => CATS.find(c => c.id === id)?.label).join("、")}貼紙集滿！🪙 +${g.cats.length}`);
  if (g.fed.grew) { const p = RW.PET[save.rw.partner]; add(`✨ ${p.name}${g.fed.grew === 3 ? "變成超級" : "長大"}了！`); setTimeout(() => { if (rs === st) talk(`${p.name}${g.fed.grew === 3 ? "變成超級" : "長大"}了！`); }, 1200); }
  document.querySelectorAll("#result .rw-strip").forEach(x => x.remove());
  if (box.children.length) $("result").appendChild(box);   // 放在左上角（不推擠中間的星星、貼紙、按鈕）
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// 孵蛋演出（B4）：晃三段漸強（±6°/0.6s → ±12°/0.5s×2 → ±18°/0.25s×3，tap 0.9/1.1/1.3）→ 第 2 段起畫裂痕 → 白光破殼 → 朋友＋背後放射光
// 之後獎勵系統的孵蛋直接沿用：taps:3＝小孩自己點蛋 3 下（每下一段）才破殼；預設自動演。回傳 Promise，按「太棒了」關掉時 resolve
let hatchDone = null;
function playHatchShow(imgSrc, name, { taps = 0, line = "", egg: egg_ = "" } = {}) {
  return new Promise(resolve => {
    const ov = $("hatch"), box = ov.querySelector(".hatchBox"), egg = $("hatchEgg"), img = $("hatchFriend"), T = [];
    const STAGES = [{ cls: "s1", ms: 600, rate: 0.9 }, { cls: "s2", ms: 1000, rate: 1.1, crack: ["ck1"] }, { cls: "s3", ms: 750, rate: 1.3, crack: ["ck2", "ck3"] }];
    let stage = 0, out = false;
    box.classList.remove("out"); egg.className = "hatchEgg" + (taps ? " tappable" : "") + (egg_ === "rare" || egg_ === "ssr" ? " " + egg_ : ""); img.classList.add("hidden"); img.src = imgSrc;
    $("hatchName").textContent = ""; $("hatchClose").classList.add("hidden"); ov.classList.remove("hidden");
    const shake = () => {
      const s = STAGES[stage++]; egg.classList.remove("s1", "s2", "s3"); void egg.offsetWidth; egg.classList.add(s.cls, ...(s.crack || [])); play("tap", s.rate);
      if (stage === STAGES.length) T.push(setTimeout(hatch, s.ms + 120));
    };
    const hatch = () => {
      if (out) return; out = true; egg.onclick = null;
      const fl = $("flash"); fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go");
      egg.className = "hatchEgg gone"; img.classList.remove("hidden"); box.classList.add("out");
      $("hatchName").textContent = name + "來了！"; $("hatchClose").classList.remove("hidden");
      play("win"); confetti(40); talk(line || name + "來了！");
    };
    hatchDone = () => { T.forEach(clearTimeout); egg.onclick = null; box.classList.remove("out"); resolve(); };
    if (taps) { egg.onclick = () => { if (stage < STAGES.length && !out) shake(); }; const idle = () => { if (stage < STAGES.length && !out) { shake(); T.push(setTimeout(idle, 1600)); } }; T.push(setTimeout(idle, 4000)); }   // 小孩 4 秒沒點：蛋自己搖（不會卡住）
    else { T.push(setTimeout(shake, 250)); T.push(setTimeout(shake, 250 + 600 + 250)); T.push(setTimeout(shake, 250 + 600 + 250 + 1000 + 200)); }
  });
}

// ---------- 貼紙圖鑑 ----------
const stickerTilt = h => { let x = 0; for (const c of h) x = (x * 31 + c.charCodeAt(0)) % 997; return (x % 61) / 10 - 3; };   // -3°～+3°
async function openAlbum(cat) {
  const tok = nav(); await ensure("album", tok); if (tok !== navToken) return;
  showScreen("album"); cat = cat || CATS[0].id;
  const tabs = $("albumTabs"); tabs.innerHTML = "";
  for (const c of CATS) { const got = WORDS.filter(w => w.c === c.id && save.stickers[w.h]).length, all = WORDS.filter(w => w.c === c.id).length; const t = el("button", "tab" + (c.id === cat ? " on" : ""), `${c.icon} ${got}/${all}`); t.onclick = () => { play("select"); openAlbum(c.id); }; tabs.appendChild(t); }
  { const t = el("button", "tab pets" + (cat === "pets" ? " on" : ""), `🐣 ${Object.keys(save.rw.pets).length}/${RW.PETS.length}`); t.onclick = () => { play("select"); openAlbum("pets"); }; tabs.appendChild(t); }
  const grid = $("albumGrid"); grid.innerHTML = ""; grid.classList.toggle("pet-grid", cat === "pets");
  if (cat === "pets") { renderPets(grid); $("albumCount").textContent = `${stickerCount()} / ${WORDS.length}`; return; }
  for (const w of WORDS.filter(w => w.c === cat)) {
    if (save.stickers[w.h]) { const s = stickerNode(w); s.style.rotate = stickerTilt(w.h) + "deg"; s.onclick = () => say(w.h); grid.appendChild(s); }   // 每張歪一點點像真的貼上去（B7；同一個詞每次歪的角度一樣）
    else { const s = el("div", "sticker empty"); s.appendChild(el("div", "em", w.e)); grid.appendChild(s); }
  }
  $("albumCount").textContent = `${stickerCount()} / ${WORDS.length}`;
}

// 動物朋友圖鑑：28 格；收集到的＝圖＋名字＋階段，點一下選成「夥伴」（點心餵牠）；沒收集到＝剪影＋稀有度框
function renderPets(grid) {
  for (const p of RW.PETS) {
    const have = save.rw.pets[p.id], card = el("button", "pet-card " + p.tier + (have ? "" : " none") + (save.rw.partner === p.id ? " partner" : ""));
    const i = el("img", "pc-img"); i.src = `IMAGE/zhuyin/pets/${p.id}.webp`; i.alt = ""; i.loading = "lazy"; card.appendChild(i);
    if (have) {
      card.appendChild(el("div", "pc-n", p.name));
      card.appendChild(el("div", "pc-s", ["", "寶寶", "長大", "超級"][have.stage] + (save.rw.partner === p.id ? "・夥伴" : "")));
      const left = RW.toNextStage(have); if (save.rw.partner === p.id && left) card.appendChild(el("div", "pc-s", `再 ${left} 個🍪${have.stage === 1 ? "長大" : "變超級"}`));
      card.onclick = () => { play("select"); save.rw.partner = p.id; persist(); say(p.name); openAlbum("pets"); };
    } else { card.appendChild(el("div", "pc-n", "？")); card.disabled = true; }
    grid.appendChild(card);
  }
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
  const wxFrom = hub && $("settings").classList.contains("hidden") ? wxPending : "";   // 設定頁開著（還原備份／清除）先不說
  if (wxFrom) wxPending = "";
  const phFrom = hub && $("settings").classList.contains("hidden") && phasePending === clock.get().phase ? phasePending : "";
  if (wxFrom && wxFrom !== wxKind) { phasePending = ""; const t = wxLine(wxFrom); $("guideText").textContent = t; setTimeout(() => { if (!mode) queueTalk(t); }, 600); }   // 玩遊戲時天氣變了：回小島先說天氣（變回原樣就不說；同時換了時段只說天氣）
  else if (phFrom) { phasePending = ""; const t = pick(PHASE_LINES[phFrom]); $("guideText").textContent = t; setTimeout(() => { if (!mode) queueTalk(t); }, 600); }   // 玩遊戲時天黑了／天亮了：回小島說一句
  else { const total = stickerCount(); guideSay(total === 0 ? "你好！快來選遊戲玩吧！" : total < 5 ? "再收集幾張貼紙，就能開新遊戲喔！" : pick(["今天要玩哪個呢？", "貼紙越來越多了！", "來釣魚還是去尋寶？", ...(wxKind ? [WX_LINES[wxKind]] : [])]), false); }
  if (hub) { hub.refresh(); hub.setPets(hubPets()); hub.setDecor(hubDecor()); }   // 3D 小島跟著更新：鎖頭、鏡頭擺位、島上走的寵物、扭蛋抽到的裝飾
}
let menuPrefetch = null;
function goMenu() {
  nav(); stopSpeech(); introUntil = 0;                 // 作廢所有等圖中的導覽、停掉還沒講完的語音
  mode = null; clearIdle(); locked = false; showScreen("menu"); playBgm("island"); renderMenu();
  clearTimeout(menuPrefetch);                         // 選單停 2 秒 → 預抓上次玩的那關（第一次玩＝釣魚），星星罐快滿就預抓孵蛋
  menuPrefetch = setTimeout(() => { preload(lsGet(K("last_mode"), "fish")); if (save.rw.coins + save.rw.gold > 0 || RW.jarLeft(save.rw, save.stars) >= EGG_STARS - 3) { preload("gacha"); preload("hatch"); } }, 2000);
}
function askHome() {                                  // 遊戲中按 🏠：休息選單（繼續／重新開始／回小島），左上是拇指位置，誤觸率高
  if (!mode || $("menu").classList.contains("hidden") === false) { goMenu(); return; }
  clearIdle(); gPause(); $("confirm").classList.remove("hidden"); talk("暫停");
}
// 換人玩：三個存檔位（小熊／小兔／小貓），各有各的貼紙、星星、朋友
function openPlayers() {
  const list = $("playerList"); list.innerHTML = "";
  SLOTS.forEach((p, i) => {
    const n = i + 1, s = slotSummary(n), b = el("button", "player" + (n === slot ? " on" : ""));
    b.appendChild(el("div", "pe", p.e)); b.appendChild(el("div", "pn", p.name)); b.appendChild(el("div", "ps", `📒 ${s.stickers}　⭐ ${s.stars}`));
    b.onclick = () => { play("select"); loadSlot(n); $("players").classList.add("hidden"); goMenu(); const hi = helloText(); guideSay(hi ? hi + "快來選遊戲玩吧！" : `${p.name}，歡迎回來！`); };   // 新存檔：貓頭鷹先自我介紹（B8）
    list.appendChild(b);
  });
  $("players").classList.remove("hidden");
}
// 翻牌：先選張數（阿葉 10-10：多一倍、兩倍以上的卡牌選難度）；B9：1／2／3 張疊起來的牌圖示
const MATCH_SIZES = [{ n: 8, label: "簡單", stars: "⭐" }, { n: 16, label: "普通", stars: "⭐⭐" }, { n: 24, label: "困難", stars: "⭐⭐⭐" }];
function openMatchPick() {
  const box = $("matchSizes"); box.innerHTML = "";
  for (const [i, s] of MATCH_SIZES.entries()) {
    const b = el("button", "msize" + (s.n === save.matchSize ? " on" : ""));
    const stack = el("div", "mstack c" + (i + 1)); for (let k = 0; k <= i; k++) stack.appendChild(el("i")); b.appendChild(stack);
    b.appendChild(el("div", "mn", `${s.n} 張`)); b.appendChild(el("div", "ml", s.label)); b.appendChild(el("div", "ms", s.stars));
    b.onclick = () => { play("select"); save.matchSize = s.n; persist(); $("matchPick").classList.add("hidden"); startMode("match"); };
    box.appendChild(b);
  }
  $("matchPick").classList.remove("hidden");
}

// ---------- 綁定 ----------
for (const b of document.querySelectorAll(".mode-card")) {
  b.addEventListener("pointerdown", () => preload(b.dataset.mode));   // 手指一碰就開始抓，放開時多半已經好了
  b.onclick = () => { play("select"); const m = b.dataset.mode; if (m === "match" && stickerCount() >= MODES.match.need) openMatchPick(); else if (m === "bubble" && stickerCount() >= MODES.bubble.need && save.bubble.lv > 0) openBubblePick(); else { if (m === "bubble") bubbleLevel = Math.min(BUBBLE_N - 1, save.bubble.lv); startMode(m); } };
}
$("homeBtn").onclick = () => { if ($("album").classList.contains("hidden") === false || $("result").classList.contains("hidden") === false) goMenu(); else askHome(); };
$("confirmYes").onclick = () => { $("confirm").classList.add("hidden"); goMenu(); };
$("confirmNo").onclick = () => { $("confirm").classList.add("hidden"); gResume(); armIdle(); };
$("confirmRestart").onclick = () => { $("confirm").classList.add("hidden"); gResume(); play("select"); lsSet(K("resume"), null); startMode(mode); };
$("resumeBtn").onclick = () => { const r = getResume(); if (!r) return; play("select"); if (r.mode === "match") startMode("match"); else startMode(r.mode, r); };
$("playerBtn").onclick = () => { play("select"); openPlayers(); };
$("playerTag").onclick = () => { play("select"); openPlayers(); };
$("townBtn").onclick = $("townTag").onclick = () => { if (!hub) return; play("select"); hub.goPlace(hub.place() === "main" ? "town" : "main"); };
$("matchPickClose").onclick = () => { play("select"); $("matchPick").classList.add("hidden"); };
$("bubblePickClose").onclick = () => { play("select"); $("bubblePick").classList.add("hidden"); };
// 家長設定：存檔（備份全部／還原／清除重來＝按兩次才清，避免小孩誤觸）
let resetArmed = 0, restoreArmed = null, restoreTimer = 0;
function saveMsg(t) { $("saveMsg").textContent = t; }
const daysAgo = t => Math.floor((Date.now() - t) / 864e5);
// 上次備份：N 天前；有進度卻超過 14 天沒備份（或從沒備份過）→ 家長畫面最上面提醒（B6）
function renderBackupInfo() {
  const t = +lsGet("zy_last_backup", 0) || 0, d = daysAgo(t), any = [1, 2, 3].some(n => { const s = slotSummary(n); return s.stickers > 0 || s.stars > 0; });
  $("lastBackup").textContent = !t ? "上次備份：還沒備份過" : `上次備份：${d < 1 ? "今天" : d + " 天前"}`;
  const late = any && (!t || d > 14), nag = $("backupNag"); nag.classList.toggle("hidden", !late);
  if (late) nag.textContent = (t ? `⚠️ 已經 ${d} 天沒備份了。` : "⚠️ 還沒有備份過。") + "按下面的「📋 備份全部」，把備份碼存到 LINE 或備忘錄，換平板或瀏覽器被清掉也找得回進度。";
}
const slotLine = (i, c) => `${SLOTS[i].e} ${SLOTS[i].name}（貼紙 ${Object.keys(c.stickers).length} 張、星星 ${c.stars} 顆）`;
function disarmRestore() { restoreArmed = null; clearTimeout(restoreTimer); const rb = $("restoreBtn"); rb.classList.remove("armed"); rb.textContent = "📥 還原"; }
$("backupBtn").onclick = async () => {
  const code = exportCode(), ta = $("saveCode"); ta.classList.remove("hidden"); ta.value = code; ta.select(); disarmRestore();
  lsSet("zy_last_backup", Date.now()); renderBackupInfo();
  try { await navigator.clipboard.writeText(code); saveMsg("✅ 三位（小熊、小兔、小貓）的備份碼已複製，貼到 LINE 或備忘錄存起來。"); } catch (e) { saveMsg("請長按上面的備份碼，選「拷貝」存起來（三位都在裡面）。"); }
};
$("restoreBtn").onclick = () => {
  const ta = $("saveCode"), rb = $("restoreBtn"), v = ta.value.trim();
  if (ta.classList.contains("hidden") || !v || v === exportCode()) { disarmRestore(); ta.classList.remove("hidden"); ta.value = ""; ta.focus(); saveMsg("把備份碼貼在上面的框框，再按一次「還原」。"); return; }
  const r = readCode(v);
  if (!r) { disarmRestore(); saveMsg("❌ 這不是正確的備份碼（要以 ZY2: 或 ZY1: 開頭）。"); return; }
  const who = r.v === 2 ? r.slots.map((c, i) => slotHasData(c) ? slotLine(i, c) : null).filter(Boolean) : [];
  if (r.v === 2 && restoreArmed !== v) {               // 三位一起的備份：先講清楚會蓋掉哪幾位，再按一次才真的還原
    const skip = r.slots.map((c, i) => slotHasData(c) ? null : SLOTS[i].name).filter(Boolean);
    restoreArmed = v; rb.classList.add("armed"); rb.textContent = "⚠️ 確定還原";
    saveMsg(`這個備份碼會還原：${who.join("、")}。這台平板上這幾位現在的進度會被蓋掉${skip.length ? `（${skip.join("、")}的備份是空的，不會動）` : ""}。確定的話，再按一次「確定還原」。`);
    clearTimeout(restoreTimer); restoreTimer = setTimeout(disarmRestore, 15000); return;
  }
  disarmRestore();
  const res = importCode(v);
  if (res === "ok") { saveMsg(r.v === 1 ? `✅ 舊版備份碼（只有一位）已還原到 ${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}：貼紙 ${stickerCount()} 張、星星 ${save.stars} 顆。` : `✅ 已還原：${who.join("、")}。`); renderSettings(); renderMenu(); }
  else if (res === "fail") { loadSlot(slot); saveMsg("❌ 瀏覽器存不進去（可能是無痕模式或空間滿了），進度沒有改變。"); }
  else saveMsg("❌ 這不是正確的備份碼（要以 ZY2: 或 ZY1: 開頭）。");
};
$("resetBtn").onclick = () => {
  const b = $("resetBtn");
  if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); b.classList.add("armed"); b.textContent = "⚠️ 再按一次確定"; saveMsg(`會清除 ${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name} 的全部貼紙、星星和朋友。`); setTimeout(() => { b.classList.remove("armed"); b.textContent = "🗑️ 清除重來"; }, 4000); return; }
  resetArmed = 0; clearSlot(); b.classList.remove("armed"); b.textContent = "🗑️ 清除重來"; saveMsg(`已清除，${SLOTS[slot - 1].name}從頭開始。`); renderMenu();
};
$("musicBtn").onclick = toggleMusic; $("musicBtn").classList.toggle("off", !save.music);
$("speakBtn").onclick = useHint;
// 家長設定：提示等待時間
function renderSettings() {
  for (const b of document.querySelectorAll("#hintOpts button")) b.classList.toggle("on", +b.dataset.v === save.hintWait);
  for (const b of document.querySelectorAll("#musicOpts button")) b.classList.toggle("on", +b.dataset.v === (save.music ? 1 : 0));
  for (const b of document.querySelectorAll("#talkOpts button")) b.classList.toggle("on", +b.dataset.v === (save.talk ? 1 : 0));
  renderMix();
  $("rwStats").textContent = `扭蛋幣 ${save.rw.coins}、金幣 ${save.rw.gold}、點心 ${save.rw.treats}、動物朋友 ${Object.keys(save.rw.pets).length}/${RW.PETS.length}、抽過 ${save.rw.pulls} 次`;
}
// 容易搞混的注音（目前這位）：次數多的排前面，最多 6 組
function renderMix() {
  $("mixName").textContent = `${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}`;
  const box = $("mixList"); box.innerHTML = "";
  const list = Object.entries(save.mix || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!list.length) { box.appendChild(el("div", "set-note", "還沒有資料。玩一陣子之後，這裡會列出最常搞混的注音和聲調。")); return; }
  for (const [k, n] of list) {
    const tone = k.startsWith("t:"), [a, b] = (tone ? k.slice(2) : k).split("|"), name = x => tone ? TONE_NAME[+x] : x;
    const row = el("div", "mix-row" + (tone ? " tone" : "")); row.appendChild(el("span", "mix-a", name(a))); row.appendChild(el("span", "mix-x", "↔")); row.appendChild(el("span", "mix-a", name(b))); row.appendChild(el("span", "mix-n", `${n} 次`)); box.appendChild(row);
  }
}
function openSettings() {
  play("select"); renderSettings(); renderBackupInfo(); disarmRestore(); $("lockTip").classList.add("hidden");
  $("setSlotName").textContent = `${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}`; $("saveCode").classList.add("hidden"); saveMsg(""); $("settings").classList.remove("hidden");
}
// 家長鎖（B6）：⚙️ 按住 2 秒（進度環跑滿）才開；放開得太早＝只晃一下＋小字「家長請按住 2 秒」。
// 網址帶 ?debug 時保留「點一下就開」（tools/zy-test 用 .click() 開設定）
const DEBUG = /[?&]debug\b/.test(location.search), LOCK_MS = 2000;
let lockHold = null, lockTipT = 0, lockOpenedAt = 0;
function lockStart() {
  if (lockHold) return; const b = $("settingsBtn"), t0 = performance.now(); b.classList.add("holding");
  const step = now => { if (!lockHold) return; const p = Math.min(1, (now - t0) / LOCK_MS); b.style.setProperty("--p", p.toFixed(3));
    if (p >= 1) { lockEnd(true); lockOpenedAt = Date.now(); openSettings(); return; } lockHold.raf = requestAnimationFrame(step); };
  lockHold = { raf: requestAnimationFrame(step) };
}
function lockEnd(opened) {
  const h = lockHold; if (!h) return; lockHold = null; cancelAnimationFrame(h.raf);
  const b = $("settingsBtn"); b.classList.remove("holding"); b.style.setProperty("--p", 0);
  if (opened) return;
  play("tap", 0.8); b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge");
  const tip = $("lockTip"); tip.classList.remove("hidden"); clearTimeout(lockTipT); lockTipT = setTimeout(() => tip.classList.add("hidden"), 1800);
}
{
  const b = $("settingsBtn");
  b.addEventListener("pointerdown", e => { if (e.button > 0) return; e.preventDefault(); lockStart(); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => lockEnd(false));
  b.addEventListener("contextmenu", e => e.preventDefault());   // iPad 長按不要跳出選單
  b.onclick = () => { if (DEBUG && Date.now() - lockOpenedAt > 800) openSettings(); };
}
for (const b of document.querySelectorAll("#hintOpts button")) b.onclick = () => { save.hintWait = +b.dataset.v; persist(); play("tap"); renderSettings(); };
for (const b of document.querySelectorAll("#musicOpts button")) b.onclick = () => { setMusic(+b.dataset.v); play("tap"); renderSettings(); };
for (const b of document.querySelectorAll("#talkOpts button")) b.onclick = () => { save.talk = +b.dataset.v; persist(); play("tap"); if (!save.talk) stopSpeech(); renderSettings(); };
$("settingsClose").onclick = () => { play("select"); $("settings").classList.add("hidden"); };
$("againBtn").onclick = () => { play("select"); if (mode === "bubble" && bubbleRun) bubbleLevel = Math.min(BUBBLE_N - 1, bubbleRun.level + 1); startMode(mode); };
$("menuBtn").onclick = () => { play("select"); goMenu(); };
$("albumBtn").onclick = () => { play("select"); openAlbum(); };
$("resultAlbumBtn").onclick = () => { play("select"); openAlbum(); };
$("albumBack").onclick = () => { play("select"); goMenu(); };
for (const b of document.querySelectorAll(".jarBtn")) b.onclick = () => { play("select"); tryHatch(); };
$("hatchClose").onclick = () => { play("select"); $("hatch").classList.add("hidden"); const f = hatchDone; hatchDone = null; if (f) f(); else updateJar(); };   // 收尾交給 playHatchShow 的呼叫端
// 結算演出中點畫面＝快轉到最後（開頭 0.7 秒內不算：最後一題連點的那幾下不會把整段演出跳掉）
$("result").addEventListener("pointerdown", () => { if (rs && !rs.done && rs.tok === navToken && performance.now() - rs.t0 > 700) finishResult(rs, true); });
$("guide").onclick = e => {                             // 點探頭＝貓頭鷹彈出來再講一次；顯示中點貓頭鷹／對話框＝收起來
  if (e.target.closest("#owlPeek")) { play("tap"); owlShow(true); say($("guideText").textContent); } else { owlFold(); if (!mode) stopSpeech(); }   // 收起來就閉嘴（排隊中的下一句照講）
};
$("gachaGo").onclick = () => spinGacha(false); $("gachaGoGold").onclick = () => spinGacha(true);
$("gachaClose").onclick = () => { if (gachaBusy) return; play("select"); $("gacha").classList.add("hidden"); updateJar(); };
// 第一次觸碰就起音樂。goMenu() 開頁時已經設好 curBgm，但那時瀏覽器擋自動播放 → 這裡要補播（原本 !curBgm 判斷讓它永遠不播）
document.addEventListener("pointerdown", () => { if (!save.music) return; if (!curBgm) playBgm("island"); else if (curBgm.paused) curBgm.play().catch(() => {}); }, { once: true });
for (const ev of ["touchend", "click"]) document.addEventListener(ev, unlockAudio, { capture: true, once: true });   // iOS：第一次點擊解鎖語音與音效
document.addEventListener("pointerdown", voiceUnlock, { capture: true, passive: true });   // 常駐：iOS 切背景或接電話後 AudioContext 會被暫停，下一次點擊再 resume
// 預錄語音預載（只下載＋解碼、不擋畫面）：等開頁的檔案都到了再抓開場語、稱讚、選單台詞，不跟開頁搶頻寬
const startupVoice = () => voicePreload([...Object.values(MODES).map(m => m.intro), ...PRAISE, "找到了！", "暫停", "蛋要孵出來了！", "全部找到了！",
  "你好！快來選遊戲玩吧！", "再收集幾張貼紙，就能開新遊戲喔！", "今天要玩哪個呢？", "貼紙越來越多了！", "來釣魚還是去尋寶？"]);
{ const t = setInterval(() => { if ($("loading").classList.contains("hidden")) { clearInterval(t); setTimeout(startupVoice, 300); } }, 250); }   // 讀取畫面關了（3D 小島也好了）才開始抓
window.addEventListener("resize", () => { if (mode === "bubble" && bubbleGame) PZ(() => bubbleGame.relayout()); if (mode === "fish" && !locked) buildFish(round[idx]); if (mode === "match" && mq) layoutBoard(mq.pairs * 2); if (mode === "whack") layoutField(); if (mode === "frog") relayoutFrog(); });
// 開頁讀取進度（B12）：數「真的載入完」的檔案（圖、程式、3D 模型）÷ 預估總數（上次完整開頁數到幾個，第一次用 40）；開完記下這次的數量
const boot = { n: 0, total: Math.max(10, +lsGet("zy_ld_total", 40) || 40), done: false, obs: null };
try { boot.obs = new PerformanceObserver(l => { if (boot.done) return; boot.n += l.getEntries().length; setLoadProgress(Math.min(0.96, boot.n / boot.total)); }); boot.obs.observe({ type: "resource", buffered: true }); } catch (e) {}
// 開頁：讀取畫面蓋著，等貓頭鷹＋3D 小島（小島最多等 8 秒）；3D 模式選單背景被小島蓋住 → 退回卡片選單時才等背景圖
(async () => {
  const cap = p => Promise.race([p, new Promise(r => setTimeout(r, 6000))]), h = initHub();
  await Promise.all([h, cap(loadImg("guide_owl"))]);
  if (!hub) await cap(Promise.all(assetsOf("menu").map(loadImg)));
  boot.done = true; try { boot.obs && boot.obs.disconnect(); } catch (e) {} if (boot.n >= 10) lsSet("zy_ld_total", boot.n); setLoadProgress(1);
  goMenu(); showLoading(false); $("startGate").classList.remove("hidden");
})();
$("startBtn").onclick = () => {                         // 開始玩：這一下點擊同時解鎖聲音、開音樂、貓頭鷹打招呼（新存檔：先自我介紹）
  document.body.classList.remove("gate-on"); $("startGate").classList.add("hidden"); play("select");
  if (save.music && curBgm) curBgm.play().catch(() => {});
  const hi = helloText(); if (hi) $("guideText").textContent = hi + "快來選遊戲玩吧！";
  setTimeout(() => talk($("guideText").textContent), 300);
  hudTour();                                           // 上方家長按鈕先展開 4 秒，讓家長知道收在「⋯」裡
};
// 夜間（B15）：晚上遊戲背景加藍紫色＋幾顆會閃的星星；時間由日夜時鐘決定（night > 0.5 才算晚上），3D 小島每秒推一次連續光線
let nightShown = null;
function applyNight() {
  const s = clock.tick();                                // 只在畫面看得到時前進；切背景／鎖螢幕＝時間停
  const on = s.night > 0.5;
  if (on !== nightShown) {
    nightShown = on; document.body.classList.toggle("night", on);
    if (on) for (const id of Object.keys(MODES)) {
      const sc = $(id); if (!sc || sc.querySelector(":scope > .night-sky")) continue;
      const sky = el("div", "night-sky");
      for (let i = 0; i < 7; i++) { const t = el("i"), z = (2 + Math.random() * 1.6).toFixed(1) + "vmin"; t.style.left = (5 + i * 13 + Math.random() * 7).toFixed(1) + "%"; t.style.top = (3 + Math.random() * 28).toFixed(1) + "%"; t.style.width = t.style.height = z; t.style.animationDelay = -(Math.random() * 2.4).toFixed(2) + "s"; sky.appendChild(t); }
      sc.insertBefore(sky, sc.firstChild);
    }
  }
  if (weather && weather.setLight) PZ(() => weather.setLight(s, { fade: 1.5 }));   // 3D 小島：黃昏、晚上、清晨連續變化
  envObj.night = s.night; envObj.dusk = s.dusk; envObj.dawn = s.dawn; envObj.kind = wxKind || "sunny";   // 海：跟著日夜與天氣
  return s;
}
applyNight(); setInterval(applyNight, 1000);
document.addEventListener("visibilitychange", () => applyNight());   // 回到前景馬上對一次（背景的時間不補算）
if (location.search.includes("debug")) window.__zy = { renderZ, parseZ, WORDS, stickerNode, zMissing, get wq() { return wq; }, get fq() { return fq; }, get idx() { return idx; }, get results() { return results; }, get wrong() { return wrongThisQ; }, get mode() { return mode; }, get round() { return round; }, get curOpts() { return curOpts; }, get bubble() { return bubbleGame; }, get bubbleSave() { return save.bubble; }, setWeather, get weather() { return wxKind; }, get weatherFx() { return weather; }, get clock() { return clock; }, get oceanFx() { return ocean; }, toneVariant, pickDistractors, zToStr };   // 測試用（tools/zy-test）
if (DEBUG) window.__zyB = { exportCode, readCode, importCode, playHatchShow, applyNight, get rs() { return rs; }, get best() { return save.best; }, get matchSize() { return save.matchSize; } };   // 外殼測試用（tools/zy-test/shell.js）
