// ===================== 注音小島（注音小遊戲 v3）=====================
// 目標玩家：5 歲、已會拼讀注音的小孩。純手指點、無命制。
// 八個模式：釣魚 / 點餐 / 積木 / 尋寶 / 翻牌 / 聲調氣球 / 打地鼠 / 跳跳蛙（後兩個 2026-10-10 加）。長期動力：貼紙圖鑑（每個詞一張貼紙）＋星星罐孵蛋（解鎖朋友）。
// 設計依據：櫻木花道（遊戲設計）＋寧次（UI/UX）2026-09-09 審查報告；規格見 memory project-zhuyin-game.md
import { WORDS, PHRASES, CATS, FRIENDS } from "./zhuyin-words.js";
import { startAnnotate, missing as zMissing } from "./zhuyin-ann.js?v=10";
import { voiceUnlock, voiceSay, voiceStop, voiceSpeaking, voicePreload, voiceCtx, voiceBind } from "./zhuyin-voice.js?v=8";
import A from "./zhuyin-audio.js?v=3";               // 音訊引擎：一個 AudioContext、music／sfx／voice／ambience 四條 bus（docs/zhuyin-v5-plan.md §5）
import * as RW from "./zhuyin-rewards.js?v=3";   // 獎勵系統（扭蛋機）純邏輯
import { createClock } from "./zhuyin-clock.js?v=1";   // 日夜時鐘（真實 30 分鐘＝小島一天）
import { createPlaza, PLAZA_URL } from "./zhuyin-plaza.js?v=1";   // ?v 要跟 zhuyin.html 的 modulepreload 一樣；10-12 小島同樂廣場（全島合作目標；只送匿名加總）；PLAZA_URL：注音戰鬥陀螺的全島陀螺榜也送到同一個後端
import * as ST from "./zhuyin-stats.js?v=2";          // 10-12 家長頁「玩了什麼」本機遊玩紀錄（?v 要跟 zhuyin.html 的 modulepreload 一樣；只存本機、不上傳、不進備份碼）
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
  bubble: { rounds: 1, need: 30, intro: "發射泡泡，救出小企鵝！",       bgm: "bubble" },   // 阿葉 10-11：泡泡救援灣（GPT 提案）
  deliver: { rounds: 1, need: 20, intro: "把貨物送到大家的家！", bgm: "road" },   // 10-12 彩虹配送站（彩虹島；need＝hub3d 的 RAINBOW_NEED）
  detective: { rounds: 1, need: 20, intro: "仔細聽，選出你聽到的那一句！", bgm: "calm" },   // 10-12 詞句小偵探（彩虹島「詞句偵探社」；開場語＝模組的 LINES.intro，第一次玩由模組自己唸）
  tops: { rounds: 1, need: 30, intro: "用注音拼出五個字，變成戰鬥陀螺！", bgm: "road" },   // 10-12 注音戰鬥陀螺（歸仁區「陀螺競技場」；need＝歸仁區開放門檻；開場語由模組每次自己唸）
  tower: { rounds: 1, need: 30, intro: "這是挑戰燈塔！爬到最頂樓，就是燈塔王！", bgm: "road" },   // 10-13 挑戰燈塔（爬塔，主島燈塔岬；開場語＝模組 LINES.intro，模組自己唸；docs/zhuyin-v6-plan.md §5）
};
// 小島介紹卡／🗺️ 全部遊戲清單（10-12 阿葉：「點下去想看是哪些關卡時就直接進入了」「這樣會不知道還有哪些關卡」）：
// name＝介紹卡的大標題（貓頭鷹唸「名字！」，tools/voice/build_lines.py 的 pick_ 台詞）；desc＝一句話說這裡玩什麼（給 5 歲聽得懂）；ico 沒寫＝用卡片的圖示；
// short＝🗺️ 清單卡片上的短名字（≤ 3 個字：加了注音一行才放得下；沒寫＝跟 name 一樣）
const GAME_INFO = {
  fish: { name: "釣魚", desc: "聽聲音，釣起對的魚" },
  order: { name: "點餐", desc: "看注音，把餐點拿給客人" },
  build: { name: "積木", desc: "把注音積木放進格子裡" },
  hunt: { name: "尋寶", desc: "看注音，找到藏起來的東西" },
  match: { name: "翻牌", desc: "翻開牌，把注音和圖配成對" },
  tone: { name: "聲調氣球", short: "氣球", desc: "聽聲音，戳破對的聲調氣球" },
  whack: { name: "打地鼠", desc: "聽聲音，敲對的地鼠" },
  frog: { name: "跳跳蛙", desc: "聽聲音，跳到對的荷葉上" },
  bubble: { name: "泡泡救援灣", short: "泡泡", desc: "發射泡泡，救出小動物" },
  deliver: { name: "彩虹配送站", short: "配送站", desc: "看訂單，把貨物送到家" },
  detective: { name: "詞句小偵探", short: "偵探社", desc: "仔細聽，選出你聽到的那句話" },
  tops: { name: "戰鬥陀螺", short: "陀螺", desc: "用注音拼五個字，跟陀螺對戰" },
  tower: { name: "挑戰燈塔", short: "燈塔", ico: "🗼", desc: "爬上燈塔，挑戰第 100 層" },   // 10-13 爬塔
  gacha: { name: "扭蛋機", ico: "🎁", desc: "投扭蛋幣，抽寵物和禮物" },
  dress: { name: "寵物服裝店", short: "服裝店", ico: "🎀", desc: "幫寵物換上漂亮的衣服" },
};
const SELF_INTRO = new Set(["detective", "tops", "tower"]);     // 模組自己唸教學（卡片／鍵盤等教學講完才出來）：主程式不唸 MODES.intro，免得念兩次
const TOPS_STARS = 15, TOPS_MAX = 3;                   // 注音戰鬥陀螺（docs/zhuyin-tops-spec.md §1）：每 15 顆星星換 1 張陀螺券、最多存 3 張；第一次免費
// 陀螺詞句＝剛好 5 個國字（範圍 U+3400–U+9FFF，跟 js/zhuyin-ann.js 一樣）；用字碼組出來：原始碼裡不放範圍兩端的怪字（不然 tools/build_zhuyin_ui.py 會把它們當畫面文字收進字典）
const HAN5 = new RegExp("^[" + String.fromCharCode(0x3400) + "-" + String.fromCharCode(0x9fff) + "]{5}$");
const DELIVER_TASKS = 12;                              // 彩虹配送站關數（10-13 由 8 加到 12：9–12 是進階關）＝js/zhuyin-deliver.js TASKS.length（模組載入前就要用：存檔、選關、備份碼；模組載入時會核對）
const PRAISE = ["好棒！", "哇！", "就是它！", "太厲害了！", "你好會拼喔！"];
const EGG_STARS = 10;                               // 星星罐滿幾顆孵一顆蛋
// v6 難度等級（docs/zhuyin-v6-plan.md §1、§2）：主程式 7 個遊戲＋翻牌各有 Lv1–Lv5（Lv1＝原本的玩法）；存檔 zy{n}_lv。
// 這兩個常數 loadSlot 開頁就會用到（cleanLv），所以放最上面；旋鈕表 LVP 在「出題」段
const LV_MODES = ["fish", "order", "build", "hunt", "match", "tone", "whack", "frog"], LV_MAX = 5;
const TOWER_MODES = ["fish", "order", "build", "hunt", "tone", "whack", "frog"];   // 爬塔（playFloor，§2.4）能用的短題遊戲

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
  if (gold && [3, 5, 8].includes(combo) && RN() > 1) PZ(() => comboBadge(combo));  // A12
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
      bag.textContent = `🎒 ${results.slice(0, RN()).filter(Boolean).length}/${RN()}`; bag.classList.remove("got"); void bag.offsetWidth; bag.classList.add("got"); if (tok === navToken) play("pop", 1.4);
    });
  }
  else if (m === "build") [...document.querySelectorAll("#slots .slot")].forEach((d, i) => setTimeout(() => { d.classList.remove("hop2"); void d.offsetWidth; d.classList.add("hop2"); }, 250 + i * 80));   // A8：拼完各格依序跳
  if (sur) PZ(() => polishSurprise(m, target));
  const n = RN(); if (n > 1 && idx === n - 1) setTimeout(() => A.bgmRate(1), 1200);   // A19 衝刺結束
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
// A19：最後一題衝刺：BGM 快 6%（Web Audio 沒辦法保留音高，音高跟著升約半音）、進度最後一格閃
function polishSprint() {
  const n = RN(), last = n > 1 && idx === n - 1;
  A.bgmRate(last ? 1.06 : 1);
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
let statsDirty = false;                               // 遊玩紀錄有還沒寫進 localStorage 的秒數（換存檔位前要先寫給舊的那位）
function loadSlot(n) {
  if (statsDirty && save.stats) { lsSet(K("stats"), save.stats); statsDirty = false; }   // 換人前，舊那位的遊玩秒數先存好
  slot = n; lsSet("zy_slot", n);
  save.stickers = lsGet(K("stickers"), {});           // { 國字: 1 } 第一次一次答對就貼上
  save.stars = lsGet(K("stars"), 0);                  // 累積星星（罐子）
  save.eggs = lsGet(K("eggs"), 0);                    // 孵過幾顆蛋 → FRIENDS[4 + eggs] 以前都解鎖
  save.intro = lsGet(K("intro"), {});                 // 哪些模式聽過開場語
  save.matchSize = lsGet(K("match_size"), 8);         // 翻牌上次選的張數（新存檔預設 8＝簡單）
  save.best = lsGet(K("best"), {});                   // 個人紀錄（B14）：{ 模式: 最佳星數 }
  save.lv = cleanLv(lsGet(K("lv"), null)); save.rt = cleanRt(lsGet(K("rt"), null));   // v6：難度等級 { 模式: { max, cur, st, two, one } }、作答秒數（沙漏自適應；只存本機）
  save.bubble = cleanBubble(lsGet(K("bubble"), null));   // 讀出來先清洗（壞資料：stars 不是物件、lv 是字串…）；cleanBubble 是 function 宣告，開頁這裡就能用
  if (save.bubble.all && (save.bubble.lv === 9 || save.bubble.lv === 29)) { save.bubble.lv += 1; delete save.bubble.all; }   // 舊存檔（10 關或 30 關版、全通）升級後接著玩下一區第 1 關（v6：30→50 關）   // 泡泡救援灣：lv＝下一關（0 起算）、stars＝每關最佳星數
  save.deliver = cleanDeliver(lsGet(K("deliver"), null));   // 彩虹配送站（10-12）：lv＝下一關（0 起算）、stars＝每關最佳星數、all＝8 關都過了
  save.detective = cleanDetective(lsGet(K("detective"), null));   // 詞句小偵探（10-12）：seen＝玩過的題目 id、best＝最佳星數
  save.tops = cleanTops(lsGet(K("tops"), null));       // 注音戰鬥陀螺（10-12）：tickets 陀螺券、starsBank 存著換券的星星、freeUsed 第一次免費用過了、best、home 我家排行、history 最近 10 句
  if (topsUnpend(save.tops)) lsSet(K("tops"), save.tops);   // 上次下場了還沒打完頁面就沒了（iPad 回收分頁、重新整理）＝那張券退回（里維必修 2）
  save.mix = lsGet(K("mix"), {});
  save.stats = ST.clean(lsGet(K("stats"), null), ST.taipeiDay(Date.now()));   // 玩了什麼（家長頁）：最近 60 天的每日分鐘／次數＋每個遊戲累計；讀出來先清洗
  save.rw = RW.migrate({ eggs: save.eggs, rewards: lsGet(K("rewards"), null) });   // 扭蛋幣、寵物、點心、集章卡…（docs/zhuyin-rewards-spec.md）；舊的 eggs 自動搬成已收集的朋友
  RW.creditJar(save.rw, save.stars); lsSet(K("rewards"), save.rw);   // 搬家結果馬上存（不等下一次 persist）                     // 容易混淆的注音／聲調：{ "ㄅ|ㄆ": 次數, "t:1|2": 次數 }（家長頁顯示）
}
loadSlot(slot);
const persist = () => [lsSet(K("stickers"), save.stickers), lsSet(K("stars"), save.stars), lsSet(K("eggs"), save.eggs), lsSet(K("intro"), save.intro), lsSet(K("match_size"), save.matchSize), lsSet(K("best"), save.best), lsSet(K("bubble"), save.bubble), lsSet(K("deliver"), save.deliver), lsSet(K("detective"), save.detective), lsSet(K("tops"), save.tops), lsSet(K("rewards"), save.rw), lsSet("zy_music", save.music), lsSet("zy_hint_wait", save.hintWait), lsSet("zy_talk", save.talk)].every(Boolean);
// （10-12 晚 阿葉：「不用把新的遊戲特別標出來，小孩玩久就知道了」→ 小島浮標的「新」拿掉，記「玩過哪些」的 zy{n}_seen 也不再寫）
const slotSummary = n => ({ stickers: Object.keys(lsGet(`zy${n}_stickers`, {})).length, stars: lsGet(`zy${n}_stars`, 0) });
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // 請瀏覽器不要自動清掉存檔
// 備份碼（B6）：ZY2＝三個存檔位一次包起來（換平板或瀏覽器被清掉時可以還原）；舊的 ZY1（只有一位）照樣能還原到目前這一位
const b64enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const b64dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));
const slotRaw = n => { const g = (k, d) => lsGet(`zy${n}_${k}`, d); return { s: Object.keys(g("stickers", {}) || {}), st: g("stars", 0), eg: g("eggs", 0), b: g("best", {}), i: Object.keys(g("intro", {}) || {}), m: g("match_size", 8), rw: g("rewards", null), dv: g("deliver", null), bb: g("bubble", null), dt: g("detective", null), tp: g("tops", null), lv: g("lv", null) }; };   // lv：v6 難度等級   // dv：彩虹配送站進度（10-12）；bb：泡泡救援灣進度（10-12 補上，之前漏了）；dt：詞句小偵探、tp：注音戰鬥陀螺（10-12）
// 泡泡救援灣進度清洗：{ lv 下一關, stars { 關: 1..3 }, all }（關卡數上限寫寬一點，之後加關舊碼照樣能還原）
function cleanBubble(d) {
  const out = { lv: 0, stars: {} }; if (!d || typeof d !== "object") return out;
  out.lv = Math.min(99, Math.max(0, Math.floor(+d.lv) || 0));
  if (d.stars && typeof d.stars === "object") for (const [k, v] of Object.entries(d.stars)) { const i = +k, s = Math.floor(+v) || 0; if (Number.isInteger(i) && i >= 0 && i < 100 && s > 0) out.stars[i] = Math.min(3, s); }
  if (d.all) out.all = 1;
  return out;
}
// 彩虹配送站進度清洗（存檔、備份碼共用）：{ lv 下一關 0..DELIVER_TASKS-1, stars { 關: 1..3 }, all }；壞的欄位丟掉
function cleanDeliver(d) {                             // DELIVER_TASKS 宣告在 MODES 下面（loadSlot 開頁就會用到）
  const out = { lv: 0, stars: {} }; if (!d || typeof d !== "object") return out;
  out.lv = Math.min(DELIVER_TASKS - 1, Math.max(0, Math.floor(+d.lv) || 0));
  if (d.stars && typeof d.stars === "object") for (const [k, v] of Object.entries(d.stars)) { const i = +k, s = Math.floor(+v) || 0; if (Number.isInteger(i) && i >= 0 && i < DELIVER_TASKS && s > 0) out.stars[i] = Math.min(3, s); }
  // 10-13 由 8 關加到 12 關：舊存檔 lv 停在 7、all=1（8 關都過了）→ 下一關（第 9 關）要開起來，all 改成「12 關都過了」才算
  const done = Object.keys(out.stars).map(Number); if (done.length) out.lv = Math.max(out.lv, Math.min(DELIVER_TASKS - 1, Math.max(...done) + 1));
  if (out.stars[DELIVER_TASKS - 1]) out.all = 1;
  return out;
}
// 詞句小偵探進度清洗（存檔、備份碼共用）：{ seen 玩過的題目 id（最多 200 個）, best 最佳星數 0..3, lv { max 已開到第幾級 1..5, cur 上次玩的級, st { 級: 最佳星 }, two 最高級連續 2★ 次數 } }
// 10-13 等級：舊存檔沒有 lv，但 best 已是 3★ → 直接開到第 2 級（跟 js/zhuyin-detective.js cleanLv 同規則；模組是第一次玩才載，所以這裡自己清一份）
function cleanDetective(d) {
  const out = { seen: [], best: 0, lv: { max: 1, cur: 1, st: {}, two: 0 } }; if (!d || typeof d !== "object") return out;
  if (Array.isArray(d.seen)) out.seen = [...new Set(d.seen.filter(id => typeof id === "string" && /^[\w-]{1,32}$/.test(id)))].slice(-200);
  out.best = Math.min(3, Math.max(0, Math.floor(+d.best) || 0));
  const L = d.lv && typeof d.lv === "object" ? d.lv : null, lv = out.lv;
  lv.max = L ? Math.min(5, Math.max(1, Math.floor(+L.max) || 1)) : out.best >= 3 ? 2 : 1;
  lv.cur = L ? Math.min(lv.max, Math.max(1, Math.floor(+L.cur) || lv.max)) : lv.max;
  if (L && L.st && typeof L.st === "object") for (const [k, v] of Object.entries(L.st)) { const i = +k, x = Math.floor(+v) || 0; if (Number.isInteger(i) && i >= 1 && i <= 5 && x > 0) lv.st[i] = Math.min(3, x); }
  if (L) lv.two = Math.min(2, Math.max(0, Math.floor(+L.two) || 0));
  return out;
}
// v6 難度等級清洗（存檔、備份碼共用）：{ 模式: { max 開到第幾級 1..5, cur 上次選的級 1..max, st { 級: 最佳星數 1..3 }, two 在 max 級連續 2 星幾次 0..2, one 在 max 級連續 1 星幾次 0..1 } }
// 不認得的模式丟掉（泡泡、配送站、偵探各有自己的進度）
function cleanLv(d) {
  const out = {}; if (!d || typeof d !== "object") return out;
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(+v) || 0));
  for (const m of LV_MODES) {
    const r = d[m]; if (!r || typeof r !== "object") continue;
    const max = num(r.max, 1, LV_MAX), st = {};
    if (r.st && typeof r.st === "object") for (let k = 1; k <= LV_MAX; k++) { const s = num(r.st[k], 0, 3); if (s) st[k] = s; }
    out[m] = { max, cur: num(r.cur, 1, max), st, two: num(r.two, 0, 2), one: num(r.one, 0, 1) };
  }
  return out;
}
// 作答秒數（沙漏自適應，§2.1）：{ 模式: [最近 30 次「第一次就答對」的秒數，每音節（積木＝每塊、青蛙＝每排）] }；只存本機、不進備份碼
function cleanRt(d) {
  const out = {}; if (!d || typeof d !== "object") return out;
  for (const m of LV_MODES) if (Array.isArray(d[m])) out[m] = d[m].map(Number).filter(x => x > 0 && x < 60).slice(-30);
  return out;
}
// 注音戰鬥陀螺存檔清洗（存檔、備份碼共用；docs/zhuyin-tops-spec.md §5）：
// { tickets 0..3, starsBank 0..15（換券用的星星）, freeUsed（第一次免費用過了）, pending（下場扣了券、還沒打完：0 沒有／1 一張券／2 免費那次）,
//   best {p,power}, home 我家排行前 5 {p,power,z}, history 最近 10 句 {p,power,win,o（對手；同一句再下場時避開）},
//   eggs 陀螺蛋（沒券時打好的句子，最多 3 顆）{p,power,z}, rank 段位 0..4（v7：新手、銅牌、銀牌、金牌、彩虹；贏一場升一段＝對手越來越強） }
// 詞句一律剛好 5 個國字（HAN5，跟 js/zhuyin-ann.js 同一個國字範圍）；戰力 0..9999（規格上限）
function cleanTops(d) {
  const out = { tickets: 0, starsBank: 0, freeUsed: 0, pending: 0, best: null, home: [], history: [], eggs: [], rank: 0 }; if (!d || typeof d !== "object") return out;
  const num = (v, hi) => Math.min(hi, Math.max(0, Math.floor(+v) || 0));
  const zOk = z => Array.isArray(z) && z.length === 5 && z.every(s => typeof s === "string" && s.length <= 6);
  const ent = e => e && typeof e === "object" && typeof e.p === "string" && HAN5.test(e.p) ? { p: e.p, power: num(e.power, 9999), ...(zOk(e.z) ? { z: e.z.slice() } : {}) } : null;
  out.tickets = num(d.tickets, TOPS_MAX); out.starsBank = num(d.starsBank, TOPS_STARS); if (d.freeUsed) out.freeUsed = 1; out.pending = num(d.pending, 2); out.rank = num(d.rank, 4);
  out.best = ent(d.best); if (out.best) delete out.best.z;
  if (Array.isArray(d.home)) { const m = new Map(); for (const e of d.home.map(ent).filter(Boolean)) if (!m.has(e.p) || m.get(e.p).power < e.power) m.set(e.p, e); out.home = [...m.values()].sort((a, b) => b.power - a.power || (a.p < b.p ? -1 : 1)).slice(0, 5); }
  if (Array.isArray(d.history)) out.history = d.history.map(e => { const x = ent(e); if (x) { delete x.z; if (e.win) x.win = 1; if (typeof e.o === "string" && HAN5.test(e.o)) x.o = e.o; } return x; }).filter(Boolean).slice(-10);
  if (Array.isArray(d.eggs)) { const m = new Map(); for (const e of d.eggs.map(ent).filter(Boolean)) { m.delete(e.p); m.set(e.p, e); } out.eggs = [...m.values()].slice(-3); }   // 10-12 陀螺蛋：同一句只留一顆、最多 3 顆（新的在後）
  return out;
}
// 存檔裡有「下場扣了、還沒打完」的券 → 退回（免費那次＝freeUsed 還原、一般券＝tickets＋1，最多 TOPS_MAX）並歸零。回傳有沒有改（呼叫端負責存檔）
// loadSlot 開頁就會呼叫：這裡只碰傳進來的 t（不碰 topsPending 等後面才宣告的變數）
function topsUnpend(t) {
  const pd = t.pending | 0; if (!pd) return false;
  if (pd === 2) t.freeUsed = 0; else t.tickets = Math.min(TOPS_MAX, t.tickets + 1);
  t.pending = 0; return true;
}
// 備份碼裡的一位 → 乾淨的存檔資料：只收詞庫有的詞、只收認得的模式、數字有上下限（不是正確格式就回 null）
function cleanSlot(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.s)) return null;
  const valid = new Set(WORDS.map(w => w.h)), modes = Object.keys(MODES), num = (v, hi) => Math.min(hi, Math.max(0, Math.floor(+v) || 0));
  const best = {}; if (d.b && typeof d.b === "object") for (const m of modes) { const v = num(d.b[m], 3); if (v) best[m] = v; }
  const intro = {}; if (Array.isArray(d.i)) for (const m of d.i) if (modes.includes(m)) intro[m] = 1;
  return { stickers: Object.fromEntries(d.s.filter(h => typeof h === "string" && valid.has(h)).map(h => [h, 1])), stars: num(d.st, 99999), eggs: num(d.eg, FRIENDS.length - 4),
    best, intro, matchSize: [8, 16, 24].includes(+d.m) ? +d.m : 8, rewards: d.rw ? RW.cleanRewards(d.rw) : null, deliver: d.dv ? cleanDeliver(d.dv) : null, bubble: d.bb ? cleanBubble(d.bb) : null,
    detective: d.dt ? cleanDetective(d.dt) : null, tops: d.tp ? cleanTops(d.tp) : null, lv: d.lv ? cleanLv(d.lv) : null };
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
  const keys = ["stickers", "stars", "eggs", "best", "intro", "match_size", "resume", "hello", "rewards", "deliver", "bubble", "detective", "tops", "lv", "rt"], snap = {};
  for (let n = 1; n <= 3; n++) for (const k of keys) { try { snap[`zy${n}_${k}`] = localStorage.getItem(`zy${n}_${k}`); } catch (e) {} }
  let ok = true;
  r.slots.forEach((c, i) => {
    if (!slotHasData(c)) return;
    const n = i + 1, w = (k, v) => { ok = lsSet(`zy${n}_${k}`, v) && ok; };
    w("stickers", c.stickers); w("stars", c.stars); w("eggs", c.eggs); w("best", c.best); w("intro", c.intro); w("match_size", c.matchSize); w("hello", 1);
    if (c.rewards) w("rewards", c.rewards); else { try { localStorage.removeItem(`zy${n}_rewards`); } catch (e) {} }   // 舊備份碼沒有獎勵資料：照 eggs 重新搬家
    if (c.deliver) w("deliver", c.deliver); else { try { localStorage.removeItem(`zy${n}_deliver`); } catch (e) {} }   // 彩虹配送站進度（10-12 以前的備份碼沒有＝從第 1 關開始）
    if (c.bubble) w("bubble", c.bubble);   // 泡泡進度；10-12 以前的備份碼沒有這欄 → 保留這台平板原本的泡泡進度（以前的行為，不清掉）
    for (const [k, v] of [["detective", c.detective], ["tops", c.tops], ["lv", c.lv]]) { if (v) w(k, v); else { try { localStorage.removeItem(`zy${n}_${k}`); } catch (e) {} } }   // 詞句小偵探、陀螺（10-12）、難度等級（v6；舊備份碼沒有＝照最佳星數重算，best 3 星的開到第 2 級）：整位蓋掉（舊備份碼沒有＝從頭開始，跟配送站一樣）
    for (const k of ["resume", "rt"]) { try { localStorage.removeItem(`zy${n}_${k}`); } catch (e) {} }   // 這台平板上「沒玩完的那一回合」、作答秒數（沙漏自適應）跟還原的進度對不上 → 丟掉
  });
  if (ok && r.hw !== null) { save.hintWait = r.hw; ok = lsSet("zy_hint_wait", r.hw); }
  if (!ok) for (const [k, v] of Object.entries(snap)) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }   // 寫一半失敗：整批放回原狀
  loadSlot(slot); return ok ? "ok" : "fail";
}
function clearSlot() { PZ(() => towerForget(slot)); for (const k of ["stickers", "stars", "eggs", "intro", "last_mode", "resume", "match_size", "whack_up", "best", "hello", "mix", "bubble", "deliver", "detective", "tops", "rewards", "seen", "stats", "lv", "rt", "tower"]) { try { localStorage.removeItem(K(k)); } catch (e) {} } statsDirty = false; PZ(() => plaza.clearSlot(slot)); loadSlot(slot); }   // 同樂廣場「這位這週幫了多少」（zy_plaza_mine）也一起清
// 新存檔第一次進來（B8）：貓頭鷹先自我介紹；已經有進度的舊存檔不會突然被介紹
function helloText() {
  if (lsGet(K("hello"), 0)) return null; lsSet(K("hello"), 1);
  return stickerCount() === 0 && !save.stars ? "你好！我是貓頭鷹老師！" : null;
}
const stickerCount = () => Object.keys(save.stickers).length;
const friends = () => FRIENDS.filter(f => save.rw.pets[RW.FRIEND_PET[f.id]]);   // 點餐的客人：已經收集的那幾位朋友

// ---------- 音效 / 音樂 / 語音 ----------
// 全部走 js/zhuyin-audio.js（Web Audio）：音效 audio/sfx/<名字>.mp3、背景音樂 audio/bgm/<key>.mp3（舊的 MUSIC/zy_*.mp3 留給宣傳片工具）
// play(名字, 速度)：速度連音高一起變（連對音階往上爬）；任何 audio/sfx 裡有的名字都能播，沒有的安靜略過；"party"＝結算 jingle（播的時候自動壓低音樂）
A.setMusic(!!save.music);
voiceBind({ ctx: () => A.ctx(true), out: () => A.busFor("voice") });   // 預錄配音：同一個 AudioContext、接 voice bus
function play(name, rate = 1) { A.sfx(name, { rate }); }
// 背景音樂：同一首不重播、換曲 0.6 秒交叉淡化；音樂關著也記住要播哪首
function playBgm(key) { A.bgmRate(1); A.playBgm(key); }   // 速度歸零：最後一題衝刺（A19）加快過
// 選單的背景音樂：看人在哪座島（主島晚上＝搖籃曲）
function menuBgmKey(p) {
  p = p || (hub && hub.place ? hub.place() : "main");
  return p === "town" ? "town" : p === "rainbow" ? "rainbow" : document.body.classList.contains("night") ? "night" : "island";
}
function setMusic(on) { save.music = on ? 1 : 0; persist(); A.setMusic(!!save.music); $("musicBtn").classList.toggle("off", !save.music); if (typeof wxAudio === "function") wxAudio(); }   // 音樂開關管背景音樂＋環境音（天氣、海鷗），不管音效與配音
function toggleMusic() {                               // B10：關掉＝白底＋紅斜線；切換時彈一下＋tap 音
  setMusic(!save.music); const b = $("musicBtn"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); play("tap");
}
function duck(on) { A.duck(on, "voice"); }             // 講話時把音樂壓低 10 dB（聽力題的關鍵；150 ms 壓下、400 ms 回來）
let sayTok = 0;                                        // 只有最新那句講完才把音樂放回來（被打斷的舊句晚到的 onend 不算）
let zhVoice = null;
function loadVoice() { const vs = speechSynthesis.getVoices(); zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null; }
if ("speechSynthesis" in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
// 先用 Gemini 預錄的真人語音（js/zhuyin-voice.js，阿葉 10-10「語調太像機械音」）；沒錄到的句子才退回瀏覽器語音
function say(text, rate = 0.85, onEnd) {
  voiceStop();                                         // 先停前一句預錄（它的 onEnd 會 duck(false)），之後才壓音樂
  const me = ++sayTok, unduck = () => { if (me === sayTok) duck(false); };
  let vdone = false; const vfin = () => { if (vdone) return; vdone = true; unduck(); if (onEnd) onEnd(); };
  if (voiceSay(text, { onEnd: vfin })) {               // 不傳 rate：預錄是自然語速，改 rate 連音高一起變
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
    duck(true); return;
  }
  if (!("speechSynthesis" in window)) { if (onEnd) setTimeout(onEnd, 300); return; }
  try {
    speechSynthesis.cancel(); duck(true); let done = false;
    const fin = () => { if (done) return; done = true; unduck(); if (onEnd) onEnd(); };
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
// iOS Safari：AudioContext 與瀏覽器語音都要在「手指點擊當下」解鎖；之後等圖載完才出聲也不會被吞掉
let audioUnlocked = false;
function unlockAudio() {
  A.unlock(); voiceUnlock();                           // 共用的 AudioContext（每次都要能 resume：iOS 切背景、接電話後會被暫停）；第一次順便開始放音樂
  if (audioUnlocked) return; audioUnlocked = true;
  try { if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
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
  whack: ["bg_garden", "hole", "mole_up_body", "mole_hit_body"], bubble: () => [BUBBLE_TAB_IMG[Math.floor(bubbleLevel / 10)] || "cust_penguin"], frog: ["bg_frog", "frog_sit", "frog_jump", "lilypad", "lilypad_flower", "stone"],
  order: () => ["bg_shop", ...friends().map(f => f.id)],
  hatch: () => ["egg", "egg_rare", "egg_ssr"], gacha: ["gacha_machine", "capsule_blue", "capsule_purple", "capsule_gold"],
  deliver: ["goods_hat", "goods_apple", "goods_banana", "goods_watermelon", "goods_bread", "goods_milk"],   // 配送站貨架（3D 場景模組自己載）
  detective: ["pets/dog"],                             // 詞句小偵探：偵探小狗（js/zhuyin-detective.js 的 mascotImg）
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
let navToken = 0, loadingOwner = 0, towerNavKeep = false, inNav = false;   // towerNavKeep：爬塔一層開始／結束時的 nav()（playFloor→startMode、towerEnd）不能把整座塔停掉
function nav() { const tok = ++navToken; qToken++; gClear(); pendingSays.clear(); if (bubbleGame) PZ(() => bubbleGame.stop()); if (deliverGame) PZ(() => deliverGame.stop());
  if (detectiveGame) PZ(() => detectiveGame.stop()); if (topsGame) PZ(() => topsGame.stop()); PZ(topsRefund);   // 10-12 詞句小偵探、陀螺：停語音、停 rAF、釋放 WebGL；陀螺下場了還沒打完就離開＝券退回
  if (towerGame && !towerNavKeep) { inNav = true; PZ(() => towerGame.stop()); inNav = false; }   // 10-13 挑戰燈塔：停流程、收愛心 HUD、正在玩的那層 abort（爬塔自己換層的 nav 不停：towerNavKeep）
  if (loadingOwner) { loadingOwner = 0; showLoading(false); } return tok; }   // qToken++＋gClear：上一局還沒到的換題、結算、稱讚全部作廢
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
const hubPets = () => Object.entries(save.rw.pets).map(([id, p]) => ({ id, name: RW.PET[id].name, stage: p.stage || 2, glb: `IMAGE/zy3d/models/${id}.glb`, wear: RW.wearOf(save.rw, id),
  evo: RW.isEvo(save.rw, id), ready: RW.evoIsReady(save.rw, id) }));   // 小島上走的：全部收集到的寵物（寶寶／長大／超級）；wear＝身上穿什麼（換裝畫面選的，超級沒選＝皇冠＋披風）；v7 evo＝進化型（更大＋光環＋星星）、ready＝能量滿（頭上發光 ✨，點了看進化）
const hubDecor = () => save.rw.decor.map(id => ({ id, glb: `IMAGE/zy3d/models/${id}.glb` }));
// 選單要用時才動態載入 Three.js＋模型；網址加 ?no3d、沒有 WebGL、載入失敗或 8 秒內沒好 → 退回原本卡片選單（遊戲照常玩）
let hub = null;
let dressMod = null, dressUI = null, dressFrom = "";   // 寵物換裝畫面（10-12）：dressFrom＝從哪裡開的（"menu"｜"album"），空字串＝沒開
function hasWebGL() {                                 // Three.js r163 起只支援 WebGL2；探測完把 context 還回去（iPad 同時能開的 context 有限）
  try { const gl = document.createElement("canvas").getContext("webgl2"); if (!gl) return false; const x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); return true; } catch (e) { return false; }
}
function importHub() {
  const url = "./zhuyin-hub3d.js?v=13";
  if (window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap")) return import(url);
  return new Promise((ok, no) => {                    // 舊 iPad（iOS 16.3 以前）不支援 importmap → 補 es-module-shims 再載
    const s = document.createElement("script"); s.src = "IMAGE/zy3d/vendor/es-module-shims/es-module-shims.js";
    s.onload = () => window.importShim ? window.importShim(new URL(url, import.meta.url).href).then(ok, no) : no(new Error("no importShim")); s.onerror = no; document.head.appendChild(s);
  });
}
function hubFail(why) { console.warn("[hub3d] 退回卡片選單：", why); hub = null; document.body.classList.remove("hub3d"); document.body.classList.add("hub-off"); for (const id of PLACE_IDS) $(id).classList.add("hidden");
  clearTimeout(wxTimer); weather = null; ocean = null; wxKind = null; if (wxSound) { try { wxSound.stop(); } catch (e) {} wxSound = null; wxAudioOn = false; } }   // 天氣跟著 3D 小島一起收（卡片選單不報天氣）
function initHub() {
  if (/[?&]no3d\b/.test(location.search) || !hasWebGL()) { document.body.classList.add("hub-off"); return Promise.resolve(null); }   // hub-off：卡片選單才顯示背景圖
  let settled = false;                                 // （Three.js 已由 zhuyin.html 的 modulepreload 跟頁面一起開始抓）
  const ready = importHub().then(m => m.createHub({ host: $("menu"), onFriend: f => { play("tap"); say(f.name); }, onFail: hubFail, newbie: () => stickerCount() === 0,
    onGacha: () => { play("select"); openGacha(); },   // 獎勵系統（docs/zhuyin-rewards-spec.md）
    stickers: stickerCount, onCivic: (k, info) => PZ(() => civicEvent(k, info)), onPlace: (p, open, st) => PZ(() => { placeButtons(p, st || { town: open }); if (!mode) playBgm(menuBgmKey(p)); }),   // 換島＝換選單音樂
    onDress: () => PZ(() => { play("select"); openDress(save.rw.partner, "menu"); }),   // 10-12 寵物服裝店（彩虹島）→ 換裝畫面（先選夥伴）
    onEvolve: id => PZ(() => startEvolve(id)),          // v7 點頭上發光的 ✨（或點那隻寵物）＝看進化演出
    onPick: (m, info) => PZ(() => (m ? showPick(m, info) : hidePick())),   // 10-12 點一下建築＝介紹卡；收起來＝null
    pickArea: () => { const r = $("pick").getBoundingClientRect(); return r.height ? { top: r.top } : null; },
    onIsle: p => { play("whoosh"); hub.goPlace(p); },     // 10-12 點遠方的島／橋頭路牌＝飛過去（跟地點鈕一樣的音效）
    labels: { gacha: { ico: "🎁", word: "扭蛋" }, dress: { ico: "🎀", word: "服裝店" }, detective: { word: "偵探社" }, tops: { word: "陀螺競技場" }, tower: { word: "挑戰燈塔" },   // 偵探社／陀螺競技場：浮標寫建築名（卡片選單的卡片寫短的「偵探」「陀螺」）
      signs: { rainbow: "彩虹島", town: "歸仁區", main: "回小島" } } }))   // 10-12 橋頭路牌的字
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
  if (mode || !hub || dressFrom) { phasePending = ph; return; }   // 換裝畫面開著也等回小島再說
  const t = pick(PHASE_LINES[ph]); $("guideText").textContent = t; queueTalk(t);   // 排隊：不切斷正在講的話
});
async function initWeather() {
  if (!hub || weather) return;
  const omP = import("./zhuyin-ocean.js?v=3"); omP.catch(() => {});   // 海洋外掛跟天氣一起開抓（效能體檢 10-12：原本等天氣載完才抓）；掛上去的順序不變
  try {
    const m = wxMod = await import("./zhuyin-weather.js?v=5"); if (!hub) return;
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
    const om = await omP; if (!hub || ocean) return;
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
  if (mode || dressFrom) { if (!wxPending) wxPending = from; return; }   // 在遊戲裡（或換裝畫面）換的 → 記住玩家最後看到的天氣，回小島再說
  const t = wxLine(from); $("guideText").textContent = t; queueTalk(t);   // 排隊：不切斷正在講的話
}
// 從 from 變成現在的天氣要說的話（真的看過下雨才說彩虹）
function wxLine(from) { return ["rain", "storm", "typhoon"].includes(from) && wxKind === "sunny" ? "雨停了！看，天上有彩虹！" : WX_LINES[wxKind]; }
// 雨聲：聲音解鎖後才能開；選單＋背景音樂開＝有聲音，其他時候靜音
function wxAudio() {
  if (!wxSound) return;
  if (!wxAudioOn) { const c = voiceCtx(); if (!c) return; try { wxSound.start(c, A.busFor("ambience")); wxAudioOn = true; } catch (e) { return; } }   // 接 ambience bus（音樂開關一起管）
  wxSound.setVolume(!mode && !document.hidden && save.music && $("menu") && !$("menu").classList.contains("hidden") ? 1 : 0);
}
document.addEventListener("visibilitychange", () => wxAudio());
document.addEventListener("pointerdown", () => setTimeout(wxAudio, 50), { capture: true, passive: true });
// 海邊環境音：在 3D 小島選單停著時，偶爾很小聲的海鷗（白天、沒下雨）或遠遠的船笛；走 ambience bus（音樂關掉就沒有）
(function seaside() {
  setTimeout(() => {
    try {
      if (hub && !mode && !document.hidden && save.music && !talking() && $("menu") && !$("menu").classList.contains("hidden")) {
        const day = clock.get().night < 0.5, wet = ["rain", "storm", "typhoon"].includes(wxKind);
        if (day && !wet && Math.random() < 0.75) A.sfx("seagull", { bus: "ambience", gain: 0.3, rate: 0.9 + Math.random() * 0.2 });
        else if (Math.random() < 0.5) A.sfx("boat_horn", { bus: "ambience", gain: 0.22 });
      }
    } catch (e) {}
    seaside();
  }, 28000 + Math.random() * 30000);
})();

// 地點鈕（10-12 起兩顆）：🏙️歸仁區、🌈彩虹島；人在哪座島，那顆就變 🏝️「回小島」（hub3d 的 opts.onPlace 通知）；還沒開的島名字後面加 🔒
const PLACE_IDS = ["townBtn", "townTag", "rainbowBtn", "rainbowTag"];
const PLACE_BTN = { town: ["townBtn", "townTag", "🏙️", "歸仁區"], rainbow: ["rainbowBtn", "rainbowTag", "🌈", "彩虹島"] };
function placeButtons(p, st = {}) {
  for (const [k, [b, tg, ico, word]] of Object.entries(PLACE_BTN)) {
    const here = p === k, open = st[k] !== false;
    $(b).querySelector(".nav-ico").textContent = here ? "🏝️" : ico;
    $(tg).querySelector(".nav-word").textContent = here ? "回小島" : open ? word : word + " 🔒";
    $(b).setAttribute("aria-label", here ? "回小島" : word); $(b).title = here ? "回小島" : word; $(b).classList.toggle("back", here);
  }
}
// 「繼續玩」出現時 body 加 has-resume：橫式它放在 🌈 圓鈕右邊，「彩虹島」小字收起來（css/zhuyin.css）
new MutationObserver(() => document.body.classList.toggle("has-resume", !$("resumeBtn").classList.contains("hidden"))).observe($("resumeBtn"), { attributes: true, attributeFilter: ["class"] });
const goIsle = k => { if (!hub) return; play("whoosh"); hub.goPlace(hub.place() === k ? "main" : k); };   // 再按一次（變成 🏝️ 的那顆）＝回主島

// ---------- 小島介紹卡（10-12 阿葉：「點下去想看是哪些關卡時就直接進入了，沒辦法決定是不是要玩這關」）----------
// 點一下建築／浮標（hub3d opts.onPick）→ 下面彈出介紹卡：大圖示、名字、一句「這裡玩什麼」、最佳星星（或關卡進度、扭蛋幣、陀螺券）、
// 鎖著＝「再收集 N 張貼紙」沒有開始鈕；「▶️ 開始玩」＝hub.start（跟同一棟再點一次一樣）；✕＝收起來。貓頭鷹唸名字。
// 介紹卡開著：貓頭鷹（直式在下面）、左下膠囊（橫式在下面）先淡出（body.pick-on；位置照樣佔著，小島不重擺）
let pickMode = null;
const modeIco = m => (GAME_INFO[m] && GAME_INFO[m].ico) || document.querySelector(`.mode-card[data-mode=${m}] .big`)?.textContent || "🎮";
const starRow = n => { const w = el("span", "pk-stars"); for (let i = 0; i < 3; i++) w.appendChild(el("i", i < n ? "on" : "", "⭐")); return w; };
// 介紹卡／清單上的「成績」：一般遊戲＝最佳星星；泡泡、配送站＝過了幾關；陀螺＝陀螺券；扭蛋機＝扭蛋幣；服裝店＝沒有
function pickMeta(m) {
  if (m === "gacha") return el("span", "pk-txt", `🪙 ${save.rw.coins + save.rw.gold}`);
  if (m === "dress") return null;
  if (m === "tower") return towerMeta();               // 10-13 挑戰燈塔：最高第幾層
  if (m === "bubble" || m === "deliver") { const n = Object.keys(save[m].stars || {}).length; return el("span", "pk-txt", `🏁 ${n}／${m === "bubble" ? BUBBLE_N : DELIVER_TASKS} 關・越後面越難`); }   // 10-13：關卡制的難度＝第幾關（泡泡 50、配送 12），寫出總關數讓家長看得懂
  if (m === "tops") return el("span", "pk-txt", `🎟️ ${save.tops.tickets + (save.tops.freeUsed ? 0 : 1)}・對手段位 ${topsRankLabel()}`);   // 10-13 v7：陀螺的難度＝對手段位（新手→銅→銀→金→彩虹）
  return starRow(m === "detective" ? save.detective.best : save.best[m] || 0);
}
const pickNeed = (m, info = {}) => m === "dress" ? (info.locked ? Math.max(1, (info.need || 20) - stickerCount()) : 0) : MODES[m] ? Math.max(0, MODES[m].need - stickerCount()) : 0;
function showPick(m, info = {}) {
  const g = GAME_INFO[m]; if (!g || mode) return;
  pickMode = m;
  const need = pickNeed(m, info), lockedM = need > 0, box = $("pick");
  $("pkIco").textContent = modeIco(m); $("pkName").textContent = g.name; $("pkDesc").textContent = g.desc;
  const meta = $("pkMeta"); meta.innerHTML = ""; const mt = lockedM ? null : pickMeta(m); if (mt) meta.appendChild(mt);
  $("pkLock").textContent = lockedM ? `🔒 再收集 ${need} 張貼紙` : "";
  PZ(() => pickLevels(m, lockedM));                     // v6：五色等級徽章（可切換，預設最高級）
  box.classList.toggle("locked", lockedM); box.dataset.mode = m;
  if (box.classList.contains("hidden")) { box.classList.remove("hidden"); } else { box.classList.remove("swap"); void box.offsetWidth; box.classList.add("swap"); }   // 換一棟：彈一下
  document.body.classList.add("pick-on");
  play("tap"); talk(g.name + "！");                      // 貓頭鷹唸名字（說明語音關著就不唸）
}
// v6 介紹卡的等級徽章（§2.1、§1.4）：名字下面一排五顆圓形徽章（綠藍紫橘金＋數字，不用星星圖案免得跟分數混淆）；沒開的灰＋🔒；
// 每顆下面小字＝那級最佳星數；預設選開到的最高級（max），點一顆＝這次玩那一級（存 cur）
const lvBadge = (n, cls = "") => el("span", ("lv-badge lv" + n + " " + cls).trim(), String(n));
function pickLevels(m, lockedM) {
  let row = $("pkLv"); if (!row) { row = el("div", "pk-lv"); row.id = "pkLv"; $("pkMeta").before(row); }   // 放在星星那一排（取代整體最佳星星：每顆徽章下面就有那級的星星），卡片才不會變高擋到小島
  const det = m === "detective" && save.detective && save.detective.lv;   // 10-13 阿葉「有幾個關卡還沒設定難易度」：偵探的五級原本只在偵探自己的開始畫面選 → 介紹卡也列出來（選的那級＝偵探選級畫面的預設）
  row.innerHTML = ""; const on = (LV_MODES.includes(m) || !!det) && !lockedM; row.classList.toggle("hidden", !on); $("pick").classList.toggle("has-lv", on); if (!on) return;
  const r = det ? save.detective.lv : lvRec(m), keep = det ? persist : lvSave;
  if (r.cur !== r.max) { r.cur = r.max; keep(); }
  for (let k = 1; k <= LV_MAX; k++) {
    const open = k <= r.max, b = el("button", "lv-pick" + (k === r.cur ? " on" : "") + (open ? "" : " locked")); b.type = "button"; b.dataset.lv = k;
    b.setAttribute("aria-label", open ? `第 ${k} 級` : `第 ${k} 級還沒打開`);
    b.appendChild(lvBadge(k)); if (!open) b.appendChild(el("i", "lv-lock", "🔒"));
    b.appendChild(el("span", "lv-st", r.st[k] ? "⭐".repeat(r.st[k]) : ""));
    b.onclick = e => {
      e.stopPropagation();
      if (!open) { play("select"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); return; }
      play("tap"); r.cur = k; keep(); for (const x of row.children) x.classList.toggle("on", +x.dataset.lv === k);
    };
    row.appendChild(b);
  }
}
function hidePick() {
  if (!pickMode && $("pick").classList.contains("hidden")) return;
  pickMode = null; $("pick").classList.add("hidden"); document.body.classList.remove("pick-on");
}
$("pkGo").onclick = () => { const m = pickMode; if (m && hub) hub.start(m); };
$("pkClose").onclick = () => { play("tap"); if (hub) hub.deselect(); else hidePick(); };
// 介紹卡開著時點了別的介面（膠囊、地點鈕、把手…）＝收起來；點小島（畫布、浮標）交給 hub3d（點別棟＝換、點空白＝收）
document.addEventListener("pointerdown", e => {   // （只算真的手指：hub3d 預載用的假 pointerdown 會打在隱藏的 .mode-card 上，不能把卡片收掉）
  if (!pickMode || !e.isTrusted || !e.target.closest || e.target.closest("#pick, .hub-stage, .hub-tags, .mode-cards")) return;
  if (hub) hub.deselect(); else hidePick();
}, { capture: true, passive: true });

// ---------- 🗺️ 全部遊戲（10-12 阿葉：「這樣會不知道還有哪些關卡」）----------
// 全畫面清單：依「主島／歸仁區／彩虹島」分組，每張卡＝圖示＋名字＋星星（或鎖）；點一張＝鏡頭飛到那座島那棟建築、開它的介紹卡。
// 還沒開的島：標題寫還差幾張貼紙，那組的卡點了只會晃一下、貓頭鷹說上鎖台詞（不飛過去）
const ISLE_NAME = { main: ["🏝️", "主島"], town: ["🏙️", "歸仁區"], rainbow: ["🌈", "彩虹島"] };
function renderGames() {
  const box = $("gamesList"); box.innerHTML = ""; if (!hub || !hub.games) return;
  const G = hub.games(), n = stickerCount();
  for (const isle of ["main", "town", "rainbow"]) {
    const list = G.list.filter(x => x.isle === isle && GAME_INFO[x.mode]); if (!list.length) continue;
    const ord = Object.keys(GAME_INFO); list.sort((a, b) => ord.indexOf(a.mode) - ord.indexOf(b.mode));   // 照 GAME_INFO 的順序（大致是解鎖順序；扭蛋機、服裝店排最後）
    const open = G.open[isle], sec = el("section", "gl-group" + (open ? "" : " locked")); sec.dataset.isle = isle;
    const hd = el("div", "gl-head"); hd.appendChild(el("span", "gl-hi", ISLE_NAME[isle][0])); hd.appendChild(el("span", "gl-hn", ISLE_NAME[isle][1]));
    if (!open) hd.appendChild(el("span", "gl-hl", `🔒 ${G.need[isle]}`));   // 跟小島浮標、清單卡片一樣寫「🔒 要幾張貼紙」（橫式歸仁區那欄窄，寫一整句會擠到彩虹島）
    sec.appendChild(hd);
    const grid = el("div", "gl-grid");
    for (const x of list) {
      const need = MODES[x.mode] ? Math.max(0, MODES[x.mode].need - n) : (x.locked ? 1 : 0), lk = !open || need > 0;
      const b = el("button", "gl-card" + (lk ? " locked" : "")); b.type = "button"; b.dataset.mode = x.mode;
      b.appendChild(el("span", "gl-ico", modeIco(x.mode))); b.appendChild(el("span", "gl-name", GAME_INFO[x.mode].short || GAME_INFO[x.mode].name));
      const meta = el("span", "gl-meta");
      if (lk) meta.appendChild(el("span", "gl-lock", open ? `🔒 ${MODES[x.mode].need}` : "🔒")); else { const mt = pickMeta(x.mode); if (mt) meta.appendChild(mt); }
      b.appendChild(meta);
      b.onclick = () => pickFromList(x.mode, isle, open);
      grid.appendChild(b);
    }
    sec.appendChild(grid); box.appendChild(sec);
  }
}
function openGames() { if (!hub || mode) return; play("select"); hub.deselect(); renderGames(); $("games").classList.remove("hidden"); $("gamesList").scrollTop = 0; }
function closeGames() { $("games").classList.add("hidden"); }
function pickFromList(m, isle, open) {
  if (!hub) return;
  if (!open) {                                         // 還沒開的島：晃一下＋上鎖台詞（跟點地圖上那座島一樣）
    const b = document.querySelector(`#gamesList .gl-card[data-mode=${m}]`); if (b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
    civicEvent(isle === "town" ? "townLocked" : "rainbowLocked", { need: hub.games().need[isle] }); return;
  }
  closeGames();
  if (hub.place() !== isle) play("whoosh");
  hub.pick(m);
}
$("mapBtn").onclick = openGames;
$("gamesClose").onclick = () => { play("select"); closeGames(); };
$("games").addEventListener("click", e => { if (e.target === $("games")) closeGames(); });   // 點清單外面的暗處＝關
// 🗺️ 在左上那組（#hudL，跟 🏙️／🌈 地點鈕同一欄）：橫式在 🌈 下面、直式在第三排最左邊（css/zhuyin.css）。
// （試過放右上「⋯」旁邊：🐻 被擠往左，4:3 的「換人」小字會碰到「繼續玩」）
// 彩虹配送站（mode "deliver"，10-12）：真的遊戲在「泡泡救援灣」段後面的 buildDeliver（卡片 .mode-card[data-mode=deliver]、畫面 #deliver／#deliverRoot）
// 歸仁區（hub3d 的城市設施與事件）：唸設施名字、警笛／鐘聲、救火、救護；還沒蓋好 → 說還差幾張貼紙（阿葉 10-11）
function civicEvent(k, info = {}) {
  if (mode) return;                                    // 只在選單（3D 小島）
  const who = info.name || "小動物";
  const LINES = { police: "警察局！警車出動巡邏囉！", fire: "消防局！消防車出動囉！", hospital: "醫院！救護車出發囉！", school: "學校！叮噹叮噹，上課囉！",
    town: "這裡是歸仁區！", rainbow: "這裡是彩虹島！", main: "", fireStart: "失火了！快叫消防車！", fireTap: "消防車馬上來！", fireOut: "火熄滅了，謝謝消防員！",
    sick: who + "不舒服，救護車來了！", healed: who + "好了，謝謝醫生！" };
  if (k === "locked" || k === "townLocked") { play("select"); guideSay(`再收集 ${Math.max(1, info.need - stickerCount())} 張貼紙，${k === "locked" ? info.name : "歸仁區"}就蓋好囉！`, false); talk("收集更多貼紙，就能蓋好囉！"); return; }
  if (k === "rainbowLocked") { play("select"); guideSay(`再收集 ${Math.max(1, info.need - stickerCount())} 張貼紙，彩虹島就開放囉！`, false); talk("收集更多貼紙，就能去彩虹島囉！"); return; }   // 10-12 彩虹島還沒開（點橋、點島上的建築、按 🌈）
  if (k === "rainbowOpen") { play("unlock"); $("rainbowBtn").classList.add("news"); guideSay("彩虹橋接好了！彩虹島開放囉！"); return; }
  if (k === "rainbow") $("rainbowBtn").classList.remove("news");
  if (k === "spray") { play("pop", 0.7); return; }
  if (k === "built" || k === "townOpen") { play("unlock"); $("townBtn").classList.add("news"); guideSay(k === "townOpen" ? "橋蓋好了！歸仁區開放囉！" : `歸仁區的${info.name}蓋好了！`); return; }
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
  o.connect(g); g.connect(A.busFor("sfx") || c.destination); o.start(t0); o.stop(t0 + dur + 0.02);   // 接 sfx bus（跟其他音效同一個總音量）
}
function siren(kind) {
  const c = voiceCtx(); if (!c) return; const t = c.currentTime + 0.02;
  if (kind === "police") for (let i = 0; i < 6; i++) tone(c, i % 2 ? 770 : 960, i % 2 ? 770 : 960, t + i * 0.32, 0.3, "triangle", 0.035);
  else if (kind === "fire") for (let i = 0; i < 3; i++) { tone(c, 600, 1150, t + i * 0.7, 0.35, "triangle", 0.03); tone(c, 1150, 600, t + i * 0.7 + 0.35, 0.35, "triangle", 0.03); }
  else for (let i = 0; i < 4; i++) tone(c, i % 2 ? 620 : 830, i % 2 ? 620 : 830, t + i * 0.5, 0.48, "triangle", 0.03);
}
function bell() { const c = voiceCtx(); if (!c) return; const t = c.currentTime + 0.02; [1320, 990, 1320, 990].forEach((f, i) => tone(c, f, f, t + i * 0.28, 0.6, "sine", 0.05)); }

// ---------- 畫面切換 / 嚮導 ----------
let mode = null, round = [], idx = 0, results = [], locked = false, wrongThisQ = 0, combo = 0, earned = [], idleTimer = null, roundStars = 0, qToken = 0, roundTreats = 0, selfIntro = false;   // selfIntro：這一局是這個模式第一次玩、教學交給模組唸（10-12 偵探）
// ---------- 玩了什麼（家長頁，本機遊玩紀錄；邏輯在 js/zhuyin-stats.js）----------
// 秒數：遊戲畫面看得到（不含選單／結算／讀取中）、分頁在前景、暫停選單沒開，才每秒 +1；每 10 秒寫一次，切背景／離開頁面時補寫
const statsDay = () => ST.taipeiDay(Date.now());
function statsSave() { if (statsDirty && lsSet(K("stats"), save.stats)) statsDirty = false; }
function statsPlay(m) { if (ST.startPlay(save.stats, m, statsDay())) { statsDirty = true; statsSave(); } }
function statsStars(m, n) { if (ST.addStars(save.stats, m, n, statsDay())) { statsDirty = true; statsSave(); } }
let statsAcc = 0;
setInterval(() => {
  if (document.hidden || !mode || gamePaused || tower) return;   // 爬塔局（playFloor）不記遊玩紀錄（§2.4）
  const s = $(mode); if (!s || s.classList.contains("hidden")) return;
  if (ST.addSec(save.stats, 1, statsDay())) { statsDirty = true; if (++statsAcc >= 10) { statsAcc = 0; statsSave(); } }
}, 1000);
document.addEventListener("visibilitychange", () => { if (document.hidden) statsSave(); });
window.addEventListener("pagehide", statsSave);
const READING = new Set(["order", "hunt"]);         // 看注音自己讀的模式：題目完全不出聲，按提示才唸
function showScreen(id, keepIsle = false) {          // keepIsle：回選單但留在剛剛那座島（換裝畫面關掉時；從遊戲回來一律回主島）
  if (id !== "dress" && dressFrom) { dressFrom = ""; PZ(() => dressUI && dressUI.close(true)); }   // 換裝畫面還開著就要換畫面（保險）：先收掉，WebGL 才會釋放
  document.body.classList.toggle("on-dress", id === "dress");
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== id);
  const inGame = id in MODES; $("speakBtn").classList.toggle("hidden", !inGame || id === "match" || id === "deliver" || id === "detective" || id === "tops" || id === "tower");   // 泡泡：「再聽」＝再唸一次目前這顆的符號；配送站右上自己有 💡／🔊；偵探上面自己有「🔊 再聽一次」；陀螺不唸小孩打的字（沒有提示鈕）
  $("speakLabel").textContent = READING.has(id) ? "提示" : "再聽"; $("speakBtn").classList.remove("pulse");
  $("settingsBtn").classList.toggle("hidden", id !== "menu"); $("playerBtn").classList.toggle("hidden", id !== "menu");
  for (const pid of PLACE_IDS) $(pid).classList.toggle("hidden", id !== "menu" || !hub);   // 地點鈕（歸仁區、彩虹島）：只在 3D 小島選單
  $("progress").classList.toggle("hidden", !inGame || BOARD(id));
  $("guide").classList.toggle("hidden", id !== "menu");
  document.body.classList.toggle("on-menu", id === "menu"); hudOpen("L", false); hudOpen("R", false);   // 換畫面：上方家長按鈕一律收起來（遊戲裡 🏠🎵 照常顯示）
  if (hub) { if (id !== "menu") hub.hide(); else if (keepIsle && hub.resume) hub.resume(); else hub.show(); }   // 3D 小島只在選單畫面渲染（省電；換裝畫面開著也停）
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
function speakPrompt() {
  const q = round[idx]; if (!q) return; say(mode === "order" ? "我要" + q.word.h : q.word.h);
  if (mode === "order" && q.word2 && !oq?.got.has(q.word2)) queueSay("我要" + q.word2.h);   // v6 點餐 Lv4 起客人一次點 2 樣：兩句都唸（整句都有預錄）
  hgVoice();                                           // 金星沙漏：按 🔊 重聽時暫停，唸完再走
}
// 小孩按「🔊 提示」：唸題目；已經錯 2 次的話，順便讓正確答案晃一下（幫忙只在他開口要的時候給）
function useHint() {
  hintPulse(false); if (locked || !mode) return;
  if (mode === "bubble") { if (bubbleGame) bubbleGame.sayCurrent(); return; }
  if (mode === "deliver") { if (deliverGame) deliverGame.sayCurrent(); return; }   // （按鈕平常藏著：配送站右上自己有 🔊）
  if (mode === "detective") { if (detectiveGame) detectiveGame.sayCurrent(); return; }   // （按鈕平常藏著：偵探上面自己有「🔊 再聽一次」）
  if (mode === "tops") return;
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
  const p = $("progress"); p.innerHTML = ""; const n = RN(); if (n <= 1) { p.classList.add("hidden"); return; } p.classList.remove("hidden");
  for (let i = 0; i < Math.max(n, round.length); i++) { const s = el("span"), rt = !!round[i]?.retry; if (results[i] === "gold") s.className = "gold"; else if (results[i] === "silver") s.className = "silver"; if (rt) s.classList.add("retry"); if (i === idx) s.classList.add("cur"); if (results[i] === "gold" && results[i - 1] === "gold" && !rt) s.classList.add("link"); p.appendChild(s); }   // link：A5 連續金星用金色光帶連起來；retry：最後「再試一次」的題
}

// ---------- 出題 ----------
// v6 §1.5 聽音題：台灣口音與合成語音常分不出 ㄣ/ㄥ、ㄢ/ㄤ、ㄓ/ㄗ、ㄕ/ㄙ、ㄔ/ㄘ（只能亂猜）→ 聽音題的干擾項不用這幾組差別（看注音題：點餐、尋寶、積木照用）。
// earKey＝把這幾組併成同一個、拿掉聲調：跟正解 earKey 一樣的詞＝耳朵分不出來（或只差聲調）→ 不當一般干擾；
// 只差聲調的假選項一律用 toneVariant 做（三聲變調、輕聲的排除規則都在裡面），每題最多 1 個
const EAR = { "ㄥ": "ㄣ", "ㄤ": "ㄢ", "ㄗ": "ㄓ", "ㄙ": "ㄕ", "ㄘ": "ㄔ" };
const earKey = syls => syls.map(s => [...s.sym].map(c => EAR[c] || c).join("")).join(" ");
// 干擾項：level 1 同音節數隨機；level 2 優先同聲母/韻母；level 3 混入「同音不同聲調」假詞
// v6：listen＝聽音題（套 §1.5）；strict＝全近似（每個音節都同聲母或同韻母；不夠才退回一般近似）；fake＝放不放 1 個只差聲調的假詞（沒寫＝level ≥ 3 才放）
function makeOptions(target, level, pool, count = 4, { listen = false, strict = false, fake } = {}) {
  const ts = parseZ(target.z), n = ts.length, tk = earKey(ts), heard = w => !listen || earKey(parseZ(w.z)) !== tk;
  const same = pool.filter(w => w !== target && parseZ(w.z).length === n && heard(w));
  const close = (w, all) => { const s = parseZ(w.z), hit = (x, i) => x.sym[0] === ts[i].sym[0] || x.sym.slice(-1) === ts[i].sym.slice(-1); return all ? s.every(hit) : s.some(hit); };
  const near = same.filter(w => close(w, false)), tight = strict ? near.filter(w => close(w, true)) : [];
  const opts = [{ syls: ts, word: target, ok: true }], used = new Set([target.z]);
  const add = list => { for (const w of shuffle([...list])) { if (opts.length >= count) break; if (w === target || used.has(w.z)) continue; used.add(w.z); opts.push({ syls: parseZ(w.z), word: w, ok: false }); } };
  if (fake ?? level >= 3) { const alt = toneVariant(ts, [], true); if (!used.has(zToStr(alt))) { used.add(zToStr(alt)); opts.push({ syls: alt, word: null, ok: false, toneFake: true }); } }
  if (strict && tight.length >= 2) add(tight);
  add(level >= 2 && near.length >= 2 ? near : same);
  add(pool.filter(heard));
  return shuffle(opts);
}
// 櫻木 10-10 兩個陷阱不能拿來當假牌：
//  ① 三聲變調：ㄌㄠˇ ㄏㄨˇ 唸起來是ㄌㄠˊ，前一個ˇ改成ˊ＝小孩照耳朵聽到的點反而被判錯
//  ② 輕聲：桃子的ㄗ˙ 改成ㄗˇ，正好是小孩學過的「子」→ 輕聲音節一律不改
//  （v6 起統一用「唸起來一樣」判斷：假牌照三聲變調唸出來跟正解一樣＝不能用，兩個方向都擋）
// 三聲變調：兩個三聲連在一起，前一個唸成二聲（ㄌㄠˇ ㄏㄨˇ 唸 ㄌㄠˊ ㄏㄨˇ）
function sounds(syls) { const o = syls.map(s => ({ ...s })); for (let i = 0; i + 1 < syls.length; i++) if (syls[i].tone === 2 && syls[i + 1].tone === 2) o[i].tone = 1; return zToStr(o); }
// 改一個音節的聲調（noZero=假詞不用一聲，否則畫面上沒符號可提示）；both（v6 聲調氣球 Lv5）＝兩個字的聲調都可能改
function toneVariant(ts, exclude = [], noZero = false, both = false) {
  const can = ts.map((s, i) => i).filter(i => ts[i].tone !== 4); if (!can.length) return ts.map(s => ({ ...s }));
  const heard = sounds(ts);
  for (let tries = 0; tries < 40; tries++) {
    const alt = ts.map(s => ({ ...s })), at = both && can.length > 1 && Math.random() < 0.5 ? can : [pick(can)];
    for (const i of at) { let nt; do { nt = noZero ? 1 + rnd(3) : rnd(4); } while (nt === alt[i].tone); alt[i].tone = nt; }
    alt.diffAt = at[0];
    if (sounds(alt) === heard) continue;                // 唸出來跟正解一樣（三聲變調）＝小孩照耳朵點反而被判錯
    const key = zToStr(alt); if (!exclude.includes(key)) return alt;
  }
  return ts.map(s => ({ ...s }));
}
// 題序：由短到長；優先「還沒貼紙」的詞（每回合都有新貼紙可拿）
// v6：L＝難度等級（換音節數比例：積木／青蛙 Lv4 起有 3 音節詞、氣球 Lv3 起多是雙音節）；n＝題數（爬塔一層 3–5 題）
function makeRound(pool, m, L = 1, n = MODES[m].rounds) {
  const key = new Map(pool.map(w => [w, (save.stickers[w.h] ? 1 : 0) + Math.random()]));   // 沒貼紙的排前面（key 只算一次，排序才穩）
  const bySyl = k => pool.filter(w => parseZ(w.z).length === k).sort((a, b) => key.get(a) - key.get(b));
  const plan = (LV_PLAN[m] && LV_PLAN[m][L - 1]) || (m === "build" || m === "whack" ? [[1, 3], [2, 3]] : m === "tone" ? [[1, 5], [2, 3]] : m === "frog" ? [[2, 4], [3, 1]] : [[1, 3], [2, 4], [3, 1]]);
  let seq = []; for (const [k, c] of plan) seq.push(...bySyl(k).slice(0, c));
  while (seq.length < n) seq.push(pick(pool)); seq = seq.slice(0, n);
  const LV = { whack: [1, 1, 2, 2, 3, 3], frog: [1, 1, 2, 2, 3] }[m];   // 新遊戲照設計稿逐題給難度（共用公式會跳過 level 2）
  const base = i => LV ? LV[Math.min(i, LV.length - 1)] : i < 3 ? 1 : i < n - 2 ? 2 : 3;
  // 尋寶「顏色＋東西」短語題（level 3）：Lv1–2 照原本（最後 2 題）、Lv3 三分之一、Lv4–5 一半（都排在後面）
  const ph = m === "hunt" && L >= 3 ? Math.round(n * (L === 3 ? 1 / 3 : 1 / 2)) : -1;
  const out = seq.map((w, i) => ({ word: w, level: ph >= 0 ? (i >= n - ph ? 3 : Math.min(2, base(i))) : m === "fish" && L >= 3 ? 3 : m === "fish" && L === 2 ? Math.max(2, base(i)) : base(i) }));
  if (m === "order" && LVP.order.two[L - 1]) {          // 點餐 Lv4 起：客人一次點 2 樣（第二樣挑別的食物，圖不能一樣）
    const used = new Set(out.map(q => q.word));
    for (const q of out) { const c = shuffle(pool.filter(w => w !== q.word && w.e !== q.word.e && !used.has(w))); q.word2 = c[0] || pool.find(w => w !== q.word && w.e !== q.word.e); if (q.word2) used.add(q.word2); }
  }
  return out;
}

// ---------- v6 難度等級（docs/zhuyin-v6-plan.md §2）：旋鈕表、存檔、升級、星星 ----------
// 每個陣列 5 格＝Lv1..Lv5；Lv1＝原本的玩法（只有沒寫在這裡的舊規則照舊）
const LVP = {
  fish:  { n: [4, 4, 5, 6, 6], swim: [0, 0, 6, 3.6, 3.6], noPic: [0, 0, 0, 0, 1], hg: [0, 0, 12, 9.5, 7] },   // n 條魚；swim＝來回游一趟幾秒（0＝不動）；hg＝單音節沙漏秒數（每多 1 音節＋2）
  order: { n: [4, 5, 6, 6, 8], near: [0, 1, 2, 3, 99], two: [0, 0, 0, 1, 1], hg: [0, 0, 15, 12.5, 10] },     // 貨架幾樣；近音食物幾個（99＝全部）；two＝一次點 2 樣；沙漏＝釣魚＋3 秒
  build: { extra: [0, 3, 4, 5, 6], twin: [0, 0, 1, 1, 1], hg: [0, 0, 4, 3.2, 2.5] },                         // 多餘積木（Lv1 照原本 1＋題目 level）；twin＝多餘積木改放易混符號；沙漏＝要放幾塊 × 秒
  hunt:  { n: [8, 8, 10, 12, 12], near: [0, 1, 2, 3, 3], hg: [0, 0, 15, 12.5, 10] },                          // 場景幾個東西；近音物件幾個
  match: { pairs: [4, 6, 8, 10, 12], peek: [3, 2, 1, 0, 0], th: [1.25, 1.1, 0.9, 0.75, 0.6], same: [0, 0, 0, 2, 2] },   // 幾對；開局全亮預覽秒數；3 星錯配上限＝對數×th（2 星＝兩倍）；same＝混入幾對同聲母的詞
  tone:  { five: [0, 1, 0, 0, 0], drift: [0, 0, 14, 9, 6], both: [0, 0, 0, 0, 1], hg: [0, 0, 12, 9.5, 7] },   // five＝單音節加輕聲選項（5 顆）；drift＝氣球飄過整片天空幾秒（0＝不飄）；both＝兩個字都可能改
  whack: { ok: [0.45, 0.4, 0.35, 0.3, 0.3], hits: [3, 3, 4, 4, 5], three: [0, 0, 1, 1, 1] },                // 正解冒出機率；每個目標敲幾下；three＝一開始就同時 3 隻（Lv1–2 照原本第 5 題起 3 隻）
  frog:  { pads: [0, 3, 3, 4, 4], hg: [0, 0, 6, 4.8, 3.5] },                                                   // 每排荷葉（0＝原本：第 1 題 2 片、之後 3 片）；沙漏每排秒數
};
const LV_PLAN = {                                       // 音節數比例（沒寫＝原本的 plan）
  build: [null, null, null, [[1, 2], [2, 3], [3, 1]], [[1, 1], [2, 3], [3, 2]]],
  tone: [null, [[1, 6], [2, 2]], [[1, 2], [2, 6]], [[1, 2], [2, 6]], [[1, 2], [2, 6]]],
  frog: [null, null, null, [[2, 3], [3, 2]], [[2, 2], [3, 3]]],
};
const HG_MULT = [2.0, 2.0, 2.0, 1.6, 1.3];             // 沙漏自適應倍率（§2.1：Lv3 2.0／Lv4 1.6／Lv5 1.3）
const STRICT0 = ["build", "whack", "frog"];             // Lv4 起 tolerate 改 0（錯 1 次就不算金）
// 解鎖畫面（§2.1）：「🎉 第 N 級打開了！」＋一行新東西（也唸出來；台詞登記在 tools/voice/build_lines.py 的 v6 段）
const LV_SAY = ["", "", "第二級打開了！", "第三級打開了！", "第四級打開了！", "第五級打開了！"];
const LV_NEW = {
  fish:  { 2: "長得像的注音變多了！", 3: "魚會游了！還有金星沙漏！", 4: "魚變多了，游得更快！", 5: "圖藏起來了，用耳朵聽！" },
  order: { 2: "貨架上的東西變多了！", 3: "長得像的食物變多了！還有金星沙漏！", 4: "客人要兩樣東西！", 5: "貨架上有八樣東西！" },
  build: { 2: "多了更多積木！", 3: "長得像的積木出現了！還有金星沙漏！", 4: "三個字的詞來了！", 5: "積木最多，要更快喔！" },
  hunt:  { 2: "藏了長得像的東西！", 3: "東西變多了！還有金星沙漏！", 4: "十二個東西，更難找了！", 5: "要找得更快喔！" },
  match: { 2: "牌變多了，偷看時間變短！", 3: "十六張牌！", 4: "沒有偷看時間了！還有長得像的注音！", 5: "二十四張牌，最難的！" },
  tone:  { 2: "多了輕聲氣球！", 3: "氣球會飛了！還有金星沙漏！", 4: "氣球飛得更快！", 5: "兩個字的聲調都可能變！" },
  whack: { 2: "地鼠變狡猾了！", 3: "同時冒出三隻地鼠！", 4: "要敲四下才過關！", 5: "要敲五下才過關！" },
  frog:  { 2: "每排都有三片荷葉！", 3: "小心順序陷阱！還有金星沙漏！", 4: "四片荷葉，三個字的詞！", 5: "荷葉最多，要跳得更快！" },
};
const HG_TIP = "沙子蓋滿以前答對，就是金星喔！";      // 第一次開到第 3 級（有沙漏的遊戲）多說一句
const LV_WARM = ["", "要先回第一級暖身嗎？", "要先回第二級暖身嗎？", "要先回第三級暖身嗎？", "要先回第四級暖身嗎？"];   // 在最高級連 2 次 1 星：貓頭鷹問（不強迫）
let lvNow = 1;                                          // 這一局玩第幾級（startMode 設；爬塔＝opts.lv）
const lvp = k => (LVP[mode] && LVP[mode][k] ? LVP[mode][k][lvNow - 1] : 0);
// 某模式的等級紀錄：沒有就照最佳星數建（§1.6 舊存檔照顧：best 已經 3 星 → 直接開到 Lv2）
function lvRec(m) {
  if (!LV_MODES.includes(m)) return null;
  let r = save.lv[m];
  if (!r) { const b = Math.min(3, save.best[m] || 0); r = save.lv[m] = { max: b >= 3 ? 2 : 1, cur: 1, st: b ? { 1: b } : {}, two: 0, one: 0 }; r.cur = r.max; }
  return r;
}
function lvSave() { lsSet(K("lv"), save.lv); }
// 這一局玩第幾級：繼續上次那一局＝那一局的級；否則＝上次選的級（介紹卡切換的；新存檔＝1）
function lvStart(m, resume) {
  const r = lvRec(m); if (!r) return 1;
  const lr = resume && +resume.lv; return lr >= 1 && lr <= r.max ? lr : Math.min(r.cur, r.max);
}
// 一般遊戲的星星（§2.2）：金星＝第一次就答對而且在沙漏內；Lv1–4：金 ≥ n−1 3 星、金 ≥ ⌈n/2⌉ 2 星；Lv5：全金 3 星、金 ≥ n−2 2 星
function lvStars(golds, n, L) {
  if (L >= 5) return golds >= n ? 3 : golds >= n - 2 ? 2 : 1;
  return golds >= n - 1 ? 3 : golds >= Math.ceil(n / 2) ? 2 : 1;
}
// 結算更新等級（§2.1）。回傳 { L, prevSt 這級原本最佳, up 開了第幾級（0＝沒開）, warm 建議回第幾級暖身（0＝不建議）, bonus 高等級加碼, low 暖身局, jar 這次放進星星罐幾顆 }
function lvAfter(m, L, stars) {
  const r = lvRec(m), prevSt = r.st[L] || 0, low = L <= r.max - 2;   // 防刷星：玩比最高級低 2 級以上＝暖身，星星罐最多放 1 顆（best 照記；是少拿不是扣）
  if (stars > prevSt) r.st[L] = stars;
  let up = 0, warm = 0;
  if (L === r.max) {
    if (stars >= 3) { r.two = 0; r.one = 0; if (r.max < LV_MAX) up = ++r.max; }
    else if (stars === 2) { r.one = 0; if (++r.two >= 3 && r.max < LV_MAX) { up = ++r.max; r.two = 0; } r.two = Math.min(2, r.two); }   // 連續 3 次 2 星也開（防卡死）
    else { r.two = 0; if (++r.one >= 2) { r.one = 0; if (r.max > 1) warm = r.max - 1; } }
  }
  if (up) r.cur = up;
  const bonus = !low && stars >= 3 ? (L >= 5 ? 2 : L >= 3 ? 1 : 0) : 0;   // 高等級 3 星多放：Lv3–4 +1、Lv5 +2
  lvSave();
  return { L, prevSt, up, warm, bonus, low, jar: low ? Math.min(1, stars) : stars + bonus };
}

// ---------- v6 爬塔局（§2.4）的共用狀態：題數、事件 ----------
let tower = null;                                       // playFloor 進行中：{ m, n, lv, timer, extra, onEvent, res, resolve, prev, prevMode, ended }
const RN = () => (tower ? tower.n : MODES[mode].rounds);   // 這一局幾題（爬塔一層 3–5 題）
const twx = k => !!(tower && tower.extra && tower.extra[k]);   // 爬塔 extra：flash（注音亮 2 秒蓋起來）、noPic（聽音題藏圖）
function twEvent(type) {                                // 爬塔局的事件 → opts.onEvent；同時累計 Result
  const t = tower; if (!t || t.ended) return;
  const k = { gold: "golds", silver: "silvers", wrong: "wrongs", timeout: "timeouts" }[type]; if (k) t.res[k]++;
  twDispatch++; try { t.onEvent({ type, q: idx }); } catch (e) { console.warn("[tower] onEvent", e); } finally { twDispatch--; }
}
let twDispatch = 0;                                      // 正在把事件交給爬塔（期間爬塔說要結束＝等這個答題函式跑完再收，里維 10-13）
// ---------- v6 給爬塔用的介面（docs/zhuyin-v6-plan.md §2.4）----------
// playFloor(opts) → { done: Promise<Result>, abort() }
//   opts = { mode: "fish"|"order"|"build"|"hunt"|"tone"|"whack"|"frog", n: 題數（1..10，預設 3）, lv: 1..5（套 §2.3 參數）,
//            timer: "off"|"silver"|"heart", extra: { flash?, noPic?, words?: [{ h, z, e }] }, onEvent: ev => {} }
//   ev = { type: "gold"|"silver"|"wrong"|"timeout", q: 第幾題（0 起） }；Result = { golds, silvers, wrongs, timeouts, aborted }
// 進入時自己把該模式的遊戲畫面開起來；結束（或 abort、🏠 暫停選單按「離開挑戰」）時把遊戲畫面收掉、回到呼叫前看得到的那個 .screen（mode 一起還原）。
// 爬塔局：沒有再試一次、不出一般結算、不給貼紙、不進星星罐、不記 best／lv／stats／繼續玩、不算同樂廣場（獎勵由爬塔模組自己給）。
// 注意：開始與結束都會 nav()（清掉全部本局計時器 gLater、navToken＋1）→ 爬塔模組不要用 gLater 排跨層的事；爬塔畫面如果是 .overlay，進層前自己先藏、done 之後再打開。
// 取用：zhuyin.js 裡直接呼叫 playFloor(...)；模組外用 window.__zyTowerApi.playFloor（測試另掛 window.__zy.playFloor）
function playFloor(opts = {}) {
  const res = { golds: 0, silvers: 0, wrongs: 0, timeouts: 0, aborted: false }, m = opts && opts.mode;
  if (!TOWER_MODES.includes(m)) { res.aborted = true; console.warn("[tower] playFloor：不支援的 mode", m); return { done: Promise.resolve(res), abort() {} }; }
  if (tower) towerEnd(tower, true);
  const vis = [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden"));
  let resolve; const done = new Promise(r => { resolve = r; });
  const t = tower = { m, n: Math.max(1, Math.min(10, Math.floor(+opts.n) || 3)), lv: Math.max(1, Math.min(LV_MAX, Math.floor(+opts.lv) || 1)),
    timer: ["off", "silver", "heart"].includes(opts.timer) ? opts.timer : "off", extra: opts.extra && typeof opts.extra === "object" ? opts.extra : {},
    onEvent: typeof opts.onEvent === "function" ? opts.onEvent : () => {}, res, resolve, prev: vis ? vis.id : "menu", prevMode: mode, ended: false };
  startMode(m, null, t).catch(e => { console.warn("[tower]", e); towerEnd(t, true); });
  return { done, abort: () => (twDispatch ? setTimeout(() => towerEnd(t, true), 0) : towerEnd(t, true)) };
}
function towerEnd(t, aborted) {
  if (!t || t.ended) return; t.ended = true; t.res.aborted = !!aborted;
  if (tower === t) tower = null;
  if (wq) { cancelAnimationFrame(wq.raf); wq.done = true; }
  if (!inNav) { towerNavKeep = true; nav(); towerNavKeep = false; } hgStop(); if (aborted) stopSpeech(); clearIdle(); hintPulse(false);
  const dead = t.prev === t.m || LV_MODES.includes(t.prev) || t.prev === "result";   // 呼叫前就在某個一般遊戲／結算畫面（不該發生）：回小島
  mode = dead ? null : (t.prevMode || null); locked = false; lvNow = 1;
  $("confirm").classList.add("hidden"); confirmLabels(false);
  showScreen(dead ? "menu" : t.prev); if (mode === "tower") playBgm(MODES.tower.bgm);
  t.resolve({ ...t.res });
}

// ---------- 回合流程 ----------
// resume：上次沒玩完的回合（每題開始前自動存），回選單時可以「▶ 繼續」
const findWord = h => WORDS.find(w => w.h === h) || PHRASES.find(w => w.h === h) || null;
function saveResume() {
  if (tower) return;                                   // 爬塔局不存「繼續玩」（也不能蓋掉小孩原本沒玩完的那一局）
  if (!mode || BOARD(mode) || idx >= MODES[mode].rounds) { lsSet(K("resume"), null); return; }
  lsSet(K("resume"), { mode, idx, results, combo, earned: earned.map(w => w.h), words: round.map(q => q.word2 ? [q.word.h, q.level, q.word2.h] : [q.word.h, q.level]), lv: lvNow, t: Date.now() });   // lv：v6 這一局玩第幾級；第 3 格＝點餐第二樣
}
function getResume() {
  const r = lsGet(K("resume"), null);
  if (!r || !MODES[r.mode] || !Array.isArray(r.words) || r.idx >= r.words.length || Date.now() - r.t > 14 * 864e5) return null;
  return r;
}
// tw：爬塔局（playFloor 傳進來，§2.4）＝不看貼紙門檻、不記同樂廣場／遊玩紀錄／繼續玩、沒有再試一次；題目可以由爬塔指定（extra.words）
async function startMode(m, resume, tw) {
  if (tower && tower !== tw) towerEnd(tower, true);    // 爬塔局進行中被別的遊戲打斷＝離開挑戰
  if (!tw && stickerCount() < MODES[m].need) { play("select"); guideSay(`再收集 ${MODES[m].need - stickerCount()} 張貼紙就可以玩囉！`); return; }
  towerNavKeep = !!tw; const tok = nav(); towerNavKeep = false; stopSpeech(); introUntil = 0; clearIdle(); locked = true;
  if (!tw) { pzAdd("play", 1); PZ(() => plaza.roundStart()); }   // 同樂廣場：開始一局（全島「這週大家玩了幾次」）；這一局幫了多少從 0 算
  // 音樂與開場語在「點下去的當下」就開始（iOS 要求在點擊裡啟動聲音；圖片載入時也不會一片安靜）
  playBgm(MODES[m].bgm);
  firstPlay = tw || save.intro[m] || SELF_INTRO.has(m) ? null : m;   // A20：第一次玩這個模式 → 第 1 題 6 秒沒動作就示範（自己有教學的模組不用）
  selfIntro = false;
  if (!tw && !save.intro[m] && save.talk) { save.intro[m] = 1; persist(); if (SELF_INTRO.has(m)) selfIntro = true; else { introUntil = Date.now() + 6000; talk(MODES[m].intro, () => { introUntil = 0; }); } }   // 說明語音關著＝不算聽過（家長開回來時還會唸）；偵探／陀螺：交給模組唸（selfIntro）
  await ensure(m, tok);
  if (tok !== navToken || (tw && tower !== tw)) return;   // 等圖的時候小孩已經點去別的地方（爬塔局被 abort 了）
  if (!tw) { lsSet(K("last_mode"), m); statsPlay(m); }   // 10-12：小島浮標已不標「新」（markSeen 已移除）；statsPlay＝家長頁本機遊玩紀錄
  lvNow = tw ? tw.lv : lvStart(m, resume);              // v6：這一局玩第幾級
  mode = m; idx = 0; results = []; combo = 0; earned = []; locked = false; wrongThisQ = 0; retryDone = !!tw; wrongN = []; roundTreats = 0;
  const pool = m === "order" ? WORDS.filter(w => w.c === "food") : WORDS;
  round = BOARD(m) ? [] : makeRound(pool, m, lvNow, RN());
  if (tw && Array.isArray(tw.extra.words)) {           // 爬塔指定題目（例：第 100 層用積木拼「登頂」）：放在前面，不夠的照常出
    const want = tw.extra.words.filter(w => w && typeof w.h === "string" && typeof w.z === "string").slice(0, RN()).map(w => ({ word: { e: "⭐", c: "", ...w }, level: 1 }));
    round = [...want, ...round].slice(0, RN());
  }
  if (resume && !tw) {                                 // 接著上次的題目、從上次那題開始
    const rw = resume.words.map(([h, level, h2]) => ({ word: findWord(h), level, ...(h2 && findWord(h2) ? { word2: findWord(h2) } : {}) })).filter(q => q.word);
    if (rw.length === round.length) { round = rw; idx = resume.idx; results = resume.results || []; combo = resume.combo || 0; earned = (resume.earned || []).map(findWord).filter(Boolean); }
  }
  voicePreload(round.flatMap(q => m === "order" ? ["我要" + q.word.h, q.word.h + "，謝謝你！", ...(q.word2 ? ["我要" + q.word2.h, q.word2.h + "，謝謝你！", q.word.h] : [])]   // 這回合的題目語音先抓
    : m === "hunt" ? [q.word.h, "找到了，" + q.word.h] : [q.word.h]).concat(m === "hunt" ? PHRASES.flatMap(p => [p.h, "找到了，" + p.h]) : []));
  showScreen(m);
  nextQ();
  setTimeout(() => { preload("result"); A.preloadSfx(["party"]); }, 2500);   // 玩的時候偷偷準備結算要用的
  setTimeout(() => { if (tok === navToken && mode === m) A.prefetchBgm(menuBgmKey()); }, 6000);   // 結束後最可能回選單：先把選單音樂解碼好（記憶體上限 3 首，滿了就不預載）
}
function nextQ() {
  clearIdle(); hgStop();
  if (!BOARD(mode) && idx === RN() && !retryDone) { retryDone = true; if (addRetries()) return; }
  if (!BOARD(mode) && idx >= round.length) return tower ? towerEnd(tower, false) : showResult();   // 爬塔局：不出一般結算，直接把結果交回爬塔
  saveResume();                                       // 每題開始前存一次：關掉平板也能從這題繼續
  wrongThisQ = 0; locked = false; curOpts = null; hintPulse(false); drawProgress();
  ({ fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone, whack: buildWhack, frog: buildFrog, bubble: buildBubble, deliver: buildDeliver, detective: buildDetective, tops: buildTops, tower: buildTower })[mode](round[idx]);
  armIdle(); PZ(polishQ);
}
// 答對：金星（一次對）/ 銀星（錯過再對）；連對音高照大調音階往上爬（A1）＋更多星星；連對 3、6 題、全對有分等級的稱讚（A12）
function correct(target, onDone, { tolerate = 0, holdMs = 1200, autoMs = 1800 } = {}) {   // holdMs：多久後點一下可以跳下一題（A6：揭曉至少停 1.2 秒，免得連點把國字跳掉）
  locked = true; clearIdle(); hintPulse(false);
  if (LV_MODES.includes(mode) && STRICT0.includes(mode) && lvNow >= 4) tolerate = 0;   // v6 §2.2：積木／蛙／地鼠 Lv4 起錯 1 次就不算金
  const inTime = hgDone();                             // v6 金星沙漏：跑完（＋0.3 秒寬限）才答對＝銀星（不算錯）
  const n = RN(), retry = !!round[idx]?.retry, gold = wrongThisQ <= tolerate && inTime; results[idx] = gold ? "gold" : "silver";
  if (!retry && wrongThisQ === 0) PZ(() => rtAdd(mode));   // 作答秒數（沙漏自適應）：只記第一次就答對的
  twEvent(gold ? "gold" : "silver");                   // 爬塔局：通知爬塔（扣心、加分由爬塔自己算）
  roundTreats++;                                       // 點心：每題答對 +1（已經有貼紙的詞也算）
  if (!tower) { pzAdd("read", 1); if (mode === "fish") pzAdd("fish", 1); }   // 同樂廣場：讀字週＝任何模式答對題數、釣魚週＝釣到的魚（再試一次的題也算）；爬塔局不算
  if (!retry) wrongN[idx] = wrongThisQ;
  if (gold) { if (!retry) combo++; for (const w of [round[idx]?.word, round[idx]?.word2]) if (!tower && w && WORDS.includes(w) && !save.stickers[w.h] && !PHRASES.includes(w)) { save.stickers[w.h] = 1; earned.push(w); persist(); } } else if (!retry) combo = 0;   // 再試一次答對也給貼紙（那一下是一次就對）；點餐兩樣都給；爬塔局不給貼紙
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
  round.push(...stuck.map(i => ({ word: round[i].word, level: round[i].level, retry: true, ...(round[i].word2 ? { word2: round[i].word2 } : {}) })));
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
  wrongThisQ++; combo = 0; play("ng"); twEvent("wrong");
  elm.classList.remove("ng"); void elm.offsetWidth; elm.classList.add("ng"); setTimeout(() => elm.classList.add("dim"), 400);
  armIdle(); if (wrongThisQ >= 2) hintPulse(true);      // 錯 2 次：提示按鈕閃，引導他按
}

// ---------- v6 金星沙漏（docs/zhuyin-v6-plan.md §1.3）----------
// Lv3 起每題在進度條旁一顆金星慢慢被沙蓋住：跑完前第一次就答對＝金星；跑完還是可以答（變銀星），題目照常繼續、不算錯、不扣東西。
// 不用數字、不用紅色、不閃、沒有滴答聲；最後 3 秒星星慢慢轉銀色。聽音題：題目唸完才開始算；按 🔊 重聽時暫停、唸完再走；跑完後 0.3 秒內點對仍算金星。
// 時間走本局時鐘 gNow（暫停選單開著＝凍結）；切到背景（畫面停了一陣子）回來的空檔也不算。
// 沒有沙漏的級（Lv1–2）一樣在背後計時：記「第一次就答對」花幾秒（zy{n}_rt），累積 15 筆後沙漏秒數照小孩的速度調。
// 爬塔局（tower.timer）："off"＝不出沙漏；"silver"＝跟一般一樣；"heart"＝跑完發 {type:"timeout"}（爬塔扣心），沙漏消失、題目繼續
const HG_GRACE = 300, HG_SILVER = 3000;
const hg = { key: "", on: false, ms: 0, used: 0, from: 0, run: false, wait: false, units: 0, acc: 0, out: false, late: false, gone: false, heart: false, raf: 0, last: 0, el: null };
let hgScale = 1;                                        // 測試用（window.__zy.hgScale(k)）：沙漏秒數乘這個
const hgElapsed = () => hg.used + (hg.run ? gNow() - hg.from : 0);
// 這題的沙漏秒數（ms）：預設＝§2.3 各遊戲的秒數；作答秒數 ≥ 15 筆 → clamp(中位數 × 音節 × 倍率, 預設 × 0.6, 預設 × 1.5)
function hgSecs(m, L, units) {
  const P = LVP[m]; if (!P || !P.hg) return 0;
  const base = P.hg[Math.max(2, L - 1)] * (L < 3 ? 1.25 : 1);   // 爬塔 Lv1–2 也要沙漏時：Lv3 的秒數再寬 25%
  const def = m === "build" || m === "frog" ? base * units : base + 2 * Math.max(0, units - 1);   // 積木＝每塊幾秒、青蛙＝每排幾秒；其他＝單音節秒數、每多 1 音節 +2 秒
  const rt = save.rt[m] || []; let sec = def;
  if (rt.length >= 15) { const s = [...rt].sort((a, b) => a - b), med = s[s.length >> 1]; sec = Math.min(def * 1.5, Math.max(def * 0.6, med * units * HG_MULT[L - 1])); }
  return sec * 1000 * hgScale;
}
// 每題（青蛙＝每排）出完題呼叫。units＝這題幾個音節（積木＝要放幾塊、青蛙＝1 排）；listen＝聽音題（唸完題目才開始算）；row＝青蛙下一排（重新計時、時間累計）
function hgBegin({ units = 1, listen = true, row = false } = {}) {
  const key = `${navToken}:${idx}:${qToken}`, again = hg.key === key;
  if (again && !row) { hgPlace(); return; }            // 同一題重畫（轉向）：照原本的時間走
  if (!again) { hg.acc = 0; hg.units = 0; hg.out = hg.late = hg.gone = false; } else hg.acc += hgElapsed();
  hg.key = key; hg.units += units; hg.used = 0; hg.run = false; hg.wait = false; hg.out = hg.late && !hg.gone;
  const timed = !!(LVP[mode] && LVP[mode].hg) && (tower ? tower.timer !== "off" : lvNow >= 3);
  hg.on = timed && !hg.late; hg.ms = hg.on ? hgSecs(mode, lvNow, units) : 0; hg.heart = !!(tower && tower.timer === "heart");
  hgDraw(true);
  if (listen) hgWaitQuiet(); else hgGo();
  if (!hg.raf) { hg.last = 0; hg.raf = requestAnimationFrame(hgLoop); }
}
function hgGo() { if (!hg.key || hg.run) return; hg.from = gNow(); hg.run = true; hg.wait = false; }
function hgHold() { if (hg.run) { hg.used += gNow() - hg.from; hg.run = false; } hg.wait = false; }
function hgWaitQuiet() {                               // 語音（題目、重聽、排隊中的句子）講完才走；卡住最多等 8 秒
  const key = hg.key, t0 = performance.now(); hg.wait = true;
  const tick = () => { if (hg.key !== key || !hg.wait) return; if (talking() && performance.now() - t0 < 8000) { gLater(tick, 120); return; } hgGo(); };
  gLater(tick, 150);
}
function hgVoice() { if (!hg.key || locked) return; hgHold(); hgWaitQuiet(); }   // 按 🔊 重聽：暫停
// 答對時呼叫（correct）：停住計時，回傳「還在沙漏內」（沒有沙漏＝true）；星星停在當下的顏色
function hgDone() {
  if (!hg.key) return true;                            // 這題沒有計時（地鼠、翻牌、子模組）
  hgHold(); const ok = !hg.late && (!hg.on || hgElapsed() <= hg.ms + HG_GRACE);
  if (hg.el && hg.on && !hg.gone) hg.el.classList.add(ok ? "got" : "out");
  return ok;
}
function hgStop() { hg.key = ""; hg.run = hg.wait = hg.on = false; if (hg.el) hg.el.classList.add("hidden"); }
function hgLoop() {
  hg.raf = 0;
  if (!hg.key || !hg.key.startsWith(navToken + ":") || !mode) { hgStop(); return; }   // 離開這一局（回小島、重新開始）
  const now = gNow(), dt = hg.last ? now - hg.last : 0; hg.last = now;
  if (hg.run && dt > 1000) hg.from += dt - 16;         // 畫面停了一陣子（切背景、鎖屏）：那段不算
  if (hg.on && !hg.late && !locked) {
    const e = hgElapsed();
    if (e >= hg.ms) hg.out = true;
    if (e >= hg.ms + HG_GRACE) { hg.late = true; if (hg.heart) { hg.gone = true; twEvent("timeout"); } }   // 爬塔 heart：發 timeout、沙漏消失
  }
  hgDraw(); hg.raf = requestAnimationFrame(hgLoop);
}
function hgMake() {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 21 : 48; pts.push((50 + r * Math.cos(a)).toFixed(1) + " " + (54 + r * Math.sin(a)).toFixed(1)); }
  const d = "M" + pts.join("L") + "Z", e = el("div", "hg hidden"); e.id = "hg"; e.setAttribute("aria-hidden", "true");
  e.innerHTML = `<svg viewBox="0 0 100 100"><defs><clipPath id="hgClip"><path d="${d}"/></clipPath></defs><path class="hg-au" d="${d}"/><path class="hg-ag" d="${d}"/><g clip-path="url(#hgClip)"><rect class="hg-sand" x="0" y="0" width="100" height="100"/></g><path class="hg-rim" d="${d}"/></svg>`;
  document.body.appendChild(e); hg.el = e; return e;
}
function hgDraw(first) {
  const show = hg.key && (hg.on || hg.late) && !hg.gone;
  if (!show) { if (hg.el) hg.el.classList.add("hidden"); return; }
  const e = hg.el || hgMake();
  if (first || e.classList.contains("hidden")) { e.classList.remove("hidden", "got", "out"); hgPlace(); }
  const el_ = hg.on ? hgElapsed() : hg.ms, p = hg.on && hg.ms ? Math.min(1, el_ / hg.ms) : 1, left = hg.on ? hg.ms - el_ : 0;
  e.style.setProperty("--sand", (p * 0.86).toFixed(3));                       // 沙最多蓋到 86%（上面的尖角一直看得到顏色）
  e.style.setProperty("--ag", (hg.out || hg.late ? 1 : Math.max(0, Math.min(1, 1 - left / Math.min(HG_SILVER, hg.ms / 2)))).toFixed(3));   // 最後 3 秒慢慢轉銀（很短的沙漏＝最後一半，不然一開始就是銀的）
  e.classList.toggle("out", hg.out || hg.late);
}
function hgPlace() {                                   // 放在進度條右邊；擠不下（直式、提示鈕擋到）就放進度條正下方
  const e = hg.el; if (!e) return;
  const pr = $("progress").getBoundingClientRect(), v = pzVm(), s = 11 * v, sb = $("speakBtn"), hb = sb && !sb.classList.contains("hidden") ? sb.getBoundingClientRect() : null;
  let x = pr.right + 1.5 * v, y = pr.top + pr.height / 2 - s / 2;
  if (hb && hb.width && hb.left < x + s + v && hb.right > x - v) {   // 提示鈕在同一個橫向範圍：同一排（橫式）＝擠不下；直式進度條在提示鈕下面一排＝往下挪一點避開
    if (hb.top < pr.bottom - pr.height / 2) y = Math.max(y, hb.bottom + 0.5 * v); else y = 1e9;
  }
  if (!pr.width || x + s > innerWidth - v || y > innerHeight) { x = innerWidth / 2 - s / 2; y = (pr.width ? pr.bottom : 3 * v) + v; }
  e.style.left = x + "px"; e.style.top = y + "px"; e.style.width = e.style.height = s + "px";
}
window.addEventListener("resize", () => PZ(hgPlace));
// 作答秒數（§2.1）：第一次就答對才記；每音節（積木＝每塊、青蛙＝每排）正規化；爬塔局不記
function rtAdd(m) {
  if (tower || !LVP[m] || !LVP[m].hg || !hg.key || !hg.units) return;
  const sec = (hg.acc + hgElapsed()) / 1000 / hg.units; if (!(sec > 0.2 && sec < 60)) return;
  const a = save.rt[m] || (save.rt[m] = []); a.push(Math.round(sec * 100) / 100); if (a.length > 30) a.splice(0, a.length - 30);
  lsSet(K("rt"), save.rt);
}

// ---------- 釣魚 ----------
function buildFish(q) {
  const p = $("fishPrompt"); p.innerHTML = ""; const noPic = lvp("noPic") || twx("noPic"); p.textContent = noPic ? "👂" : q.word.e; p.classList.toggle("nopic", !!noPic);   // v6 Lv5／爬塔 noPic：題目圖藏起來只靠耳朵（答對才揭曉）
  const pond = $("pond"); pond.innerHTML = "";
  const L = lvNow, cnt = LVP.fish.n[L - 1];             // v6：魚 4/4/5/6/6 條；干擾 Lv2 近似、Lv3 加 1 個只差聲調、Lv4 全近似、Lv5 全近似＋聲調
  const opts = makeOptions(q.word, q.level, WORDS, cnt, { listen: true, strict: L >= 4, fake: L >= 3 ? L !== 4 : undefined }), W = pond.clientWidth, H = pond.clientHeight, portrait = matchMedia("(orientation: portrait)").matches;   // 跟 CSS 同一套直橫判斷（3:4 iPad 以前會算錯而疊在一起）
  const many = opts.length > 4, sc = many ? 0.8 : 1;    // 5–6 條魚：橫式 3×2、直式 2×3，魚縮小一點（css .fishBtn.sm）
  const vm = Math.min(innerWidth, innerHeight) / 100, bw = (portrait ? 40 : 30) * vm * sc, bh = (portrait ? 34 : 32) * vm * sc;   // 魚＋下方注音標籤的總高
  const cols = portrait ? 2 : 3, rows = Math.ceil(opts.length / cols);
  opts.forEach((o, i) => {
    const b = el("button", "fishBtn" + (many ? " sm" : "")); b.appendChild(el("div", "fishImg"));
    const lab = el("div", "zlabel"), z = renderZ(o.syls), maxLen = Math.max(...o.syls.map(x => x.sym.length));
    z.style.fontSize = (o.syls.length >= 3 ? 3.8 : o.syls.length === 2 ? (maxLen >= 3 ? 4.2 : 4.8) : (maxLen >= 3 ? 5 : 6)) + "vmin"; lab.appendChild(z); b.appendChild(lab);
    let x, y;
    if (many) { const c = i % cols, r = Math.floor(i / cols); x = c * (W / cols) + (W / cols - bw) / 2; y = r * (H / rows) + (H / rows - bh) / 2 + (!portrait && c % 2 ? 0.04 * H : 0); b._cw = W / cols; }
    else if (portrait) { x = (i % 2) * (W / 2) + (W / 2 - bw) / 2; y = Math.floor(i / 2) * (H / 2) + (H / 2 - bh) / 2; b._cw = W / 2; } else { x = i * (W / 4) + (W / 4 - bw) / 2; y = (H - bh) / 2 + (i % 2 ? 0.1 : -0.1) * H; b._cw = W / 4; }
    b.style.left = Math.max(0, x) + "px"; b.style.top = Math.max(0, y) + "px"; b._bw = bw;
    onTap(b, () => {                                   // A2：手指一碰就算；isConnected：同一下點擊已經換題（舊的魚被拿掉）就不算
      if (locked || !b.isConnected) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { if (noPic) { p.textContent = q.word.e; p.classList.remove("nopic"); } p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); noteMix(parseZ(q.word.z), o.syls); if (o.toneFake) { const d = o.syls.diffAt ?? 0, t = b.querySelectorAll(".syl")[d]?.querySelector(".tone"); if (t) t.classList.add("hint"); } }
    });
    pond.appendChild(b); PZ(() => fitZ(lab, z, 6.5));   // A15：標籤固定大小、字縮放
  });
  curOpts = opts; askSay(q.word.h);
  if (lvp("swim")) PZ(() => swim(pond, ".fishBtn", lvp("swim")));   // v6 Lv3 起魚慢慢游（Lv4–5 快一點）
  hgBegin({ units: parseZ(q.word.z).length, listen: true });
}
// v6：選項會動（魚來回游、氣球往上飄）。走本局時鐘（暫停凍結）；答對（locked）就停；用 translate（不碰 CSS 的上下浮動動畫）
// 剛出題時位移從 0 慢慢加大（選項進場動畫用的也是 translate，接得上不跳）
function swim(host, sel, sec, up = false) {
  const tok = navToken, q = qToken, t0 = gNow(), els = [...host.querySelectorAll(sel)];
  const H = host.clientHeight, ph = shuffle(els.map((e, i) => i / els.length));
  host.classList.toggle("drift", up);
  if (up) for (const e of els) e._top = e.offsetTop;
  const step = () => {
    if (tok !== navToken || q !== qToken || locked || !host.isConnected || !els.some(e => e.isConnected)) return;   // 轉向重出題（舊的選項拿掉了）：這一圈停
    const t = (gNow() - t0) / 1000, ramp = Math.min(1, Math.max(0, (t - 0.6) / 1));
    els.forEach((e, i) => {
      if (!e.isConnected || e.classList.contains("ok")) return;
      if (up) {                                         // 氣球：往上飄出頂端，從底下再冒出來（不算錯）；每顆速度差一點，慢慢錯開
        const bh = e.offsetHeight, cyc = H + bh, d = (H / sec) * (0.85 + 0.3 * ph[i]) * Math.max(0, t - 0.6), top = ((e._top + bh - d) % cyc + cyc) % cyc - bh;
        e.style.translate = `0px ${(top - e._top).toFixed(1)}px`;
      } else {                                          // 魚：在自己那一格裡來回游（不會游進隔壁那格）
        const a = Math.max(1.5 * pzVm(), ((e._cw || 0) - (e._bw || 0)) / 2) * ramp;
        e.style.translate = `${(a * Math.sin((t / sec) * 2 * Math.PI + ph[i] * 6.28)).toFixed(1)}px ${(1.2 * pzVm() * Math.sin(t * 1.7 + i) * ramp).toFixed(1)}px`;
      }
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function hintCorrect(container, sel, opts) {         // 第二次錯：正解輕輕搖晃當提示
  const nodes = [...container.querySelectorAll(sel)]; const i = opts.findIndex(o => o.ok && !o.taken); if (nodes[i]) { nodes[i].classList.add("wiggle"); setTimeout(() => nodes[i].classList.remove("wiggle"), 1500); }
}

// ---------- 點餐（真正練「看注音→懂意思」：不自動唸，錯 1 次或閒置才唸）----------
let oq = null;                                          // v6 點餐這一題：{ want: [要的詞], got: Set(已經拿到的) }（客人一次點 2 樣時用）
function buildOrder(q) {
  const cust = $("customer"); cust.src = `IMAGE/zhuyin/${pick(friends()).id}.webp`; cust.className = "customer enter";   // A8：下一位客人從右邊滑進來
  const want = q.word2 ? [q.word, q.word2] : [q.word]; oq = { want, got: new Set() };
  const bubble = $("orderBubble"); bubble.innerHTML = ""; bubble.classList.toggle("two", want.length > 1); bubble.classList.remove("flashed");
  const part = w => { const s = el("span", "ow"); s.appendChild(renderZ(parseZ(w.z))); return s; };
  const parts = want.map(part); for (const s of parts) bubble.appendChild(s);   // 兩樣＝兩個注音泡泡，拿到一樣就揭曉那一樣
  const shelf = $("shelf"); shelf.innerHTML = "";
  const foods = WORDS.filter(w => w.c === "food"), L = lvNow;
  let opts;
  if (L <= 1) opts = makeOptions(q.word, Math.min(q.level, 2), foods).filter(o => o.word);   // Lv1＝原本
  else {                                               // v6 Lv2 起：貨架 5/6/6/8 樣，其中近音食物 1/2/3/全部（點餐是看注音題，ㄣㄥ 這幾組照用）
    const n = LVP.order.n[L - 1], nearN = LVP.order.near[L - 1], used = new Set(want.map(w => w.e));
    const ts = want.flatMap(w => parseZ(w.z)), close = w => parseZ(w.z).some(x => ts.some(t => x.sym[0] === t.sym[0] || x.sym.slice(-1) === t.sym.slice(-1)));
    const others = foods.filter(w => !want.includes(w) && !used.has(w.e)), near = shuffle(others.filter(close)), far = shuffle(others.filter(w => !close(w)));
    const pickN = [...near.slice(0, nearN), ...far, ...near.slice(nearN)];
    opts = want.map(w => ({ word: w, ok: true }));
    for (const w of pickN) { if (opts.length >= n) break; if (used.has(w.e)) continue; used.add(w.e); opts.push({ word: w, ok: false }); }
    opts = shuffle(opts);
  }
  shelf.classList.toggle("many", opts.length > 4); shelf.classList.toggle("lots", opts.length > 6);
  for (const o of opts) {
    const it = el("button", "item"); it.textContent = o.word.e;   // 只有圖：國字＋注音會直接洩漏答案，答對後泡泡才揭曉
    onTap(it, () => {
      if (locked || !it.isConnected || o.taken) return;
      if (o.ok) {
        o.taken = true; oq.got.add(o.word); const pi = want.indexOf(o.word), done = oq.got.size >= want.length;
        if (!done) {                                   // 兩樣的第一樣：飛到客人那邊、那個泡泡揭曉（題目還沒完，沙漏照走）
          it.classList.add("ok"); play("ok"); burst(it, 8, "💖"); PZ(() => flyTo(it, cust, { at: [0.5, 0.42], hide: true, dur: 550, scale: 0.35 }));
          bubble.classList.remove("flashed"); parts[pi].innerHTML = ""; parts[pi].appendChild(renderZ(parseZ(o.word.z), o.word.h)); parts[pi].classList.add("got"); say(o.word.h);
          return;
        }
        it.classList.add("ok"); correct(it, () => { bubble.classList.remove("flashed"); bubble.innerHTML = ""; for (const w of want) { const s = el("span", "ow got"); s.appendChild(renderZ(parseZ(w.z), w.h)); bubble.appendChild(s); } say(o.word.h + "，謝謝你！"); });   // 客人吃東西的動作在 polishCorrect（食物飛到嘴邊才嚼）
      }
      else { wrong(it); if (o.word) noteMix(parseZ(want.find(w => !oq.got.has(w)).z), parseZ(o.word.z)); cust.classList.remove("no", "enter", "chew"); void cust.offsetWidth; cust.classList.add("no"); PZ(() => fxMark(cust, "?", { cls: "qm", at: [0.5, 0.02], rise: 3, dur: 800 })); }   // A10：客人搖頭、頭上冒「?」
    });
    shelf.appendChild(it);
  }
  curOpts = opts;
  if (twx("flash")) { const k = qToken; gLater(() => { if (k === qToken && !locked) bubble.classList.add("flashed"); }, 2000); }   // 爬塔 flash：注音亮 2 秒就蓋起來（點蓋子不會再打開，要靠記憶）
  hgBegin({ units: want.reduce((s, w) => s + parseZ(w.z).length, 0), listen: false });   // 看注音題：一出題就開始算（不唸題目）
}

// ---------- 積木（即時判定：放對亮綠、放錯彈回；符號填滿的音節才亮聲調格）----------
const ALL_SYMS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ";
let bq = null;
function buildBuild(q) {
  const p = $("buildPrompt"); p.innerHTML = ""; p.textContent = q.word.e;
  const syls = parseZ(q.word.z), need = syls.flatMap(s => [...s.sym]);
  const L = lvNow, extra = Math.max(L <= 1 ? 0 : LVP.build.extra[L - 1], 1 + q.level);   // v6：多餘積木 Lv1 照原本（2–4 顆，看題目 level），Lv2–5 至少 3/4/5/6 顆（不會比 Lv1 後段少）
  const twins = LVP.build.twin[L - 1] ? shuffle([...new Set(need.map(buildTwin).filter(c => c && !need.includes(c)))]) : [];   // Lv3 起先放長得像的（ㄅㄆ ㄉㄊ ㄢㄤ…）
  const pool = [...twins, ...shuffle([...ALL_SYMS].filter(c => !need.includes(c) && !twins.includes(c)))].slice(0, extra);
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
  hgBegin({ units: need.length + syls.length, listen: true });   // 沙漏＝要放的積木數（符號＋聲調）× 秒數；先聽完詞再算
}
// 積木 Lv3 起的易混符號（§2.3：看注音題才用 ㄓㄗ、ㄕㄙ 這幾組）
const LOOKALIKE = ["ㄅㄆ", "ㄉㄊ", "ㄢㄤ", "ㄣㄥ", "ㄓㄗ", "ㄕㄙ", "ㄧㄩ", "ㄛㄜ"];
function buildTwin(c) { const g = LOOKALIKE.find(p => p.includes(c)); return g ? g.replace(c, "") : null; }
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
    wrongThisQ++; combo = 0; play("ng"); twEvent("wrong"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); const d = pref && !pref.dataset.v ? pref : empties[0][2]; d.classList.remove("bad"); void d.offsetWidth; d.classList.add("bad");
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
  else { wrongThisQ++; combo = 0; play("ng"); twEvent("wrong"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); ts.classList.remove("bad"); void ts.offsetWidth; ts.classList.add("bad"); mixTone(bq.syls[i].tone, v);
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
  const bubble = $("huntBubble"); bubble.innerHTML = ""; bubble.classList.remove("flashed"); $("bag").textContent = `🎒 ${results.slice(0, RN()).filter(Boolean).length}/${RN()}`;   // A8：背包「找到幾個／共幾個」（答對時東西飛進去才加）
  const L = lvNow, total = LVP.hunt.n[L - 1], nearN = LVP.hunt.near[L - 1];   // v6：場景 8/8/10/12/12 個東西、近音物件 0/1/2/3/3 個
  // 近音物件（看注音題，ㄣㄥ 這幾組照用）：注音同聲母或同韻母、圖不一樣的詞
  const nearOf = (tz, bad) => { const ts = parseZ(tz); return shuffle(WORDS.filter(w => !bad.has(w.e) && parseZ(w.z).some(x => ts.some(t => x.sym[0] === t.sym[0] || x.sym.slice(-1) === t.sym.slice(-1))))); };
  const fill = (objs, bad, tz) => { const nr = nearOf(tz, bad).slice(0, nearN); for (const w of nr) { bad.add(w.e); objs.push({ e: w.e, ok: false }); } for (const w of shuffle(WORDS.filter(w => !bad.has(w.e)))) { if (objs.length >= total) break; bad.add(w.e); objs.push({ e: w.e, ok: false }); } return shuffle(objs); };
  let target = q.word, objs;
  if (q.level >= 3) {                                // 短語題：目標＋它的顏色配對＋6 個其他詞
    target = q.retry && PHRASES.includes(q.word) ? q.word : pick(PHRASES); q.word = target; const pairE = target.pair;   // 再試一次：同一個短語
    if (L <= 1) { const others = shuffle(WORDS.filter(w => w.e !== target.e && w.e !== pairE)).slice(0, 6); objs = shuffle([{ e: target.e, ok: true }, { e: pairE, ok: false }, ...others.map(w => ({ e: w.e, ok: false }))]); }
    else objs = fill([{ e: target.e, ok: true }, { e: pairE, ok: false }], new Set([target.e, pairE]), target.z);
  } else if (L <= 1) { const others = shuffle(WORDS.filter(w => w !== q.word && w.e !== q.word.e)).slice(0, 7); objs = shuffle([{ e: q.word.e, ok: true }, ...others.map(w => ({ e: w.e, ok: false }))]); }
  else objs = fill([{ e: q.word.e, ok: true }], new Set([q.word.e]), q.word.z);
  bubble.appendChild(renderZ(parseZ(target.z)));
  const portrait = innerHeight > innerWidth, n = objs.length;   // 8＝4×2（原本）；10＝橫 5×2／直 3×4；12＝橫 6×2／直 3×4。格點＋隨機抖動，不重疊
  const cols = n <= 8 ? 4 : portrait ? 3 : n <= 10 ? 5 : 6, rows = Math.ceil(n / cols), cw = 90 / cols, rh = 88 / rows;
  objs.forEach((o, i) => {
    const b = el("button", "obj", o.e); const c = i % cols, r = Math.floor(i / cols);
    const jx = n <= 8 ? (portrait ? 2 : 6) : 2, jy = rows <= 2 ? 12 : 4;
    b.style.left = (5 + c * (n <= 8 ? 23 : cw) + Math.random() * jx) + "%"; b.style.top = (8 + r * (rows <= 2 ? 44 : rh) + Math.random() * jy) + "%";
    onTap(b, () => {
      if (locked || !b.isConnected) return;
      if (o.ok) { b.classList.add("ok"); correct(b, () => { bubble.classList.remove("flashed"); bubble.innerHTML = ""; bubble.appendChild(renderZ(parseZ(target.z), target.h)); say("找到了，" + target.h); }); }
      else wrong(b);
    });
    scene.appendChild(b);
  });
  scene.classList.toggle("many", n > 8);
  curOpts = objs;
  if (twx("flash")) { const k = qToken; gLater(() => { if (k === qToken && !locked) bubble.classList.add("flashed"); }, 2000); }   // 爬塔 flash：注音亮 2 秒就蓋起來
  hgBegin({ units: parseZ(target.z).length, listen: false });
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
  const L = lvNow, pairs = LVP.match.pairs[L - 1];     // v6：張數改由等級決定（4/6/8/10/12 對＝8/12/16/20/24 張），取代原本的 8/16/24 張選擇
  const key = new Map(WORDS.map(w => [w, (save.stickers[w.h] ? 1 : 0) + Math.random()]));
  // 圖卡選詞：排除看圖猜不出來的（顏色、人物、動作、水/杯子/積木/玩具/湯/嘴巴）與三音節；
  // 同一盤同一個圖不重複；12 對以下不放共用音節的詞（熊＋熊貓、雞＋小雞會讓小孩搞混；24 張＝Lv5 才放）
  const words = [], seenE = new Set(), seenSyl = new Set(), cand = WORDS.filter(w => parseZ(w.z).length <= 2 && !MATCH_EXCLUDE.has(w.h)).sort((a, b) => key.get(a) - key.get(b));
  const can = (w, also = []) => { const syl = w.z.split(" "); return !words.includes(w) && !seenE.has(w.e) && !also.some(x => x.e === w.e) && !(pairs < 12 && syl.some(x => seenSyl.has(x) || also.some(y => y.z.split(" ").includes(x)))); };
  const take = w => { seenE.add(w.e); w.z.split(" ").forEach(x => seenSyl.add(x)); words.push(w); };
  for (let g = 0; g < LVP.match.same[L - 1]; g++) {    // Lv4 起：先放 2 對「同聲母」的詞（注音卡長得像，要看仔細）
    const by = new Map(); for (const w of cand) if (INITIALS.includes(w.z[0])) by.set(w.z[0], [...(by.get(w.z[0]) || []), w]);
    let hit = null;
    for (const a of shuffle([...by.values()])) { for (const w1 of a) { if (!can(w1)) continue; const w2 = a.find(w => w !== w1 && can(w, [w1])); if (w2) { hit = [w1, w2]; break; } } if (hit) break; }
    if (hit) hit.forEach(take);
  }
  for (const w of cand) { if (words.length >= pairs) break; if (can(w)) take(w); }
  const cards = shuffle(words.flatMap(w => [{ w, kind: "z" }, { w, kind: "e" }]));
  mq = { open: [], matched: 0, miss: 0, words, busy: false, pairs, hold: null, peek: false };
  voicePreload(words.map(w => w.h));                   // 配對成功會唸詞
  board.className = "board n" + cards.length; layoutBoard(cards.length);
  for (const c of cards) {
    const card = el("button", "card k" + c.kind); const inner = el("div", "inner"); const back = el("div", "face back"); const front = el("div", "face front");   // kz＝注音卡（藍背）、ke＝圖卡（橘背）
    if (c.kind === "z") { const zs = parseZ(c.w.z); front.appendChild(renderZ(zs)); if (zs.length === 1) card.classList.add("one"); } else { front.appendChild(el("div", "em", c.w.e)); }
    inner.appendChild(back); inner.appendChild(front); card.appendChild(inner); card._c = c;
    onTap(card, () => { if (card.isConnected) flip(card); }); board.appendChild(card);   // A2：手指一碰就翻
  }
  PZ(() => matchCount(false));                          // A14：頂上配對計數「0/4」
  const pk = LVP.match.peek[L - 1];                     // v6：開局全部亮著預覽 3/2/1/0/0 秒（點任何一張＝提早蓋回並翻那張）
  if (pk) { mq.peek = true; for (const c of board.children) c.classList.add("up"); const m0 = mq; gLater(() => { if (mq === m0) matchPeekEnd(); }, 450 + pk * 1000); }
}
function matchPeekEnd() { if (!mq || !mq.peek) return; mq.peek = false; for (const c of $("board").children) if (!c.classList.contains("done")) c.classList.remove("up"); }
function flip(card) {
  if (mq.peek) matchPeekEnd();                          // 預覽中點一張：全部蓋回，這一張照常翻開
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
  const t3 = Math.round(mq.pairs * LVP.match.th[lvNow - 1]), th = [t3, t3 * 2];   // v6 §2.3：3 星錯配上限＝對數 × 1.25/1.1/0.9/0.75/0.6（取整）、2 星＝兩倍
  results[0] = mq.miss <= th[0] ? "gold" : "silver"; mq.stars = mq.miss <= th[0] ? 3 : mq.miss <= th[1] ? 2 : 1;
  persist(); gLater(() => talk("全部找到了！"), 900); gLater(showResult, 1800);   // 走本局計時器：結算前離開＝不會跳出結算畫面
}

// ---------- 聲調氣球（同一組符號、四種聲調，戳對的爆）----------
function buildTone(q) {
  const p = $("tonePrompt"); p.innerHTML = ""; const noPic = twx("noPic"); p.textContent = noPic ? "👂" : q.word.e; p.classList.toggle("nopic", noPic);   // 爬塔 noPic：題目圖藏起來
  const sky = $("sky"); sky.innerHTML = ""; sky.style.removeProperty("--n");
  const L = lvNow, ts = parseZ(q.word.z), opts = [{ syls: ts, ok: true }], used = [zToStr(ts)];
  const five = LVP.tone.five[L - 1] && ts.length === 1, both = !!LVP.tone.both[L - 1] && ts.length >= 2;   // v6：Lv2 單音節加輕聲（5 顆）；Lv5 兩個字的聲調都可能改
  if (five) for (let t = 0; t <= 4; t++) { if (t === ts[0].tone) continue; const alt = [{ sym: ts[0].sym, tone: t }]; used.push(zToStr(alt)); opts.push({ syls: alt, ok: false }); }   // 一二三四聲＋輕聲全部
  else while (opts.length < 4) { const alt = toneVariant(ts, used, false, both); const k = zToStr(alt); if (used.includes(k)) break; used.push(k); opts.push({ syls: alt, ok: false }); }
  sky.classList.toggle("five", opts.length > 4);
  shuffle(opts).forEach((o, i) => {
    const b = el("button", "balloon c" + (i % 4)); b.appendChild(el("div", "balloonImg")); b.appendChild(el("div", "bstring"));
    const lab = el("div", "zlabel"), z = renderZ(o.syls), ml = Math.max(...ts.map(x => x.sym.length)); z.style.fontSize = (ts.length >= 2 ? (ml >= 3 ? 4.2 : 5) : (ml >= 3 ? 5.4 : 6.5)) + "vmin"; lab.appendChild(z); b.appendChild(lab);
    b.style.left = (opts.length > 4 ? 2 + i * 19.6 : 4 + i * 24) + "%"; b.style.animationDelay = (-i * 0.7) + "s";
    onTap(b, () => {
      if (locked || !b.isConnected) return;
      if (o.ok) { b.classList.add("ok"); play("pop"); correct(b, () => { if (noPic) { p.textContent = q.word.e; p.classList.remove("nopic"); } p.appendChild(el("span", "han", q.word.h)); say(q.word.h); }); }
      else { wrong(b); noteMix(ts, o.syls); play("tap", 0.6); }               // A10：氣球漏氣扭一扭（CSS .balloon.ng）
    });
    sky.appendChild(b);
  });
  curOpts = opts; askSay(q.word.h);
  sky.classList.remove("drift"); if (LVP.tone.drift[L - 1]) PZ(() => swim(sky, ".balloon", LVP.tone.drift[L - 1], true));   // v6 Lv3 起氣球往上飄（飄出頂端從底下再冒，不算錯）
  hgBegin({ units: ts.length, listen: true });
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
  const ts = parseZ(target), ek = earKey(ts);
  const pool = sylPool(ts.length).filter(z => z !== target && !exclude.includes(z) && earKey(parseZ(z)) !== ek);   // 只差聲調的留給 level 3，前段不出（太難）；v6 §1.5：地鼠、青蛙是聽音題，ㄣㄥ/ㄢㄤ/ㄓㄗ/ㄕㄙ/ㄔㄘ 的差別也不出
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
const whHits = () => (mode === "whack" ? LVP.whack.hits[lvNow - 1] : WH.hits);   // v6：每個目標要敲中 3/3/4/4/5 次
function layoutField() {
  const f = $("field"); if (!f || !f.firstChild) return; const r = f.firstChild.getBoundingClientRect();
  f.style.setProperty("--cw", r.width + "px"); f.style.setProperty("--ch", r.height + "px");
}
function buildWhack(q) {
  if (wq) cancelAnimationFrame(wq.raf);
  if (idx === 0) whackRun = 0;
  const ts = parseZ(q.word.z);
  const pic = $("whackPic"); pic.innerHTML = ""; pic.appendChild(el("div", "tem", twx("noPic") ? "👂" : q.word.e));   // 爬塔 noPic：目標圖藏起來只靠耳朵
  const dots = $("whackDots"); dots.innerHTML = ""; for (let i = 0; i < whHits(); i++) dots.appendChild(el("span"));
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
  if (now >= s.nextSpawn && now >= s.pauseUntil && vis.length < (LVP.whack.three[lvNow - 1] || idx >= 4 ? 3 : 2)) {   // 櫻木：第 5 題才同時 3 隻（雙音節剛出現那題先別一起加難）；v6 Lv3 起一開始就 3 隻
    const busyCol = new Set(s.cells.map((c, i) => c.state !== "down" ? i % WH.cols : -1));
    const free = s.cells.filter((c, i) => c.state === "down" && now - c.last >= 600 && !busyCol.has(i % WH.cols));
    if (free.length) moleUp(pick(free), !okVis && (s.hintNext || now - s.lastOkSeen > 2000 || Math.random() < LVP.whack.ok[lvNow - 1]), now);   // v6：正解冒出機率 45/40/35/30/30%
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
    if (s.hits >= whHits()) {
      s.done = true; cancelAnimationFrame(s.raf);
      for (const o of s.cells) if (o !== c && o.state === "up") moleDown(o, now, false);
      correct($("whackPic"), () => { const tm = $("whackPic").querySelector(".tem"); if (tm) tm.textContent = s.q.word.e; $("whackPic").appendChild(renderZ(s.ts, s.q.word.h)); say(s.q.word.h); }, { tolerate: 1, holdMs: 1200, autoMs: 2200 });   // 連打中的小孩別一下就把揭曉跳掉；Lv4 起 tolerate 0（correct 裡改）
    }
  } else {
    wrongThisQ++; combo = 0; whackRun = 0; s.wrongRun++; twEvent("wrong"); s.lastWrongAt = now; if (c.z) noteMix(s.ts, parseZ(c.z)); s.lockUntil = now + 500 * Math.min(3, s.wrongRun); play("ng");
    c.mole.classList.add("nope"); setTimeout(() => moleDown(c, performance.now(), false), 350);
    if (wrongThisQ >= 2) hintPulse(true);
  }
}

// ---------- 注音跳跳蛙（櫻木 A2：聽整個詞→切成音節→依序找出每個音節的注音）----------
// 起點→每個音節一排荷葉（第 1 個詞 2 片，之後 3 片）→終點石頭（詞的圖）。跳錯：荷葉沉下去、青蛙不動；沒有時限。
// 位置用「第幾排、第幾片」記，轉平板（直↔橫）時重新換算，不用重出題
let fq = null, frogStreak = 0;                          // frogStreak：跨詞累計連續跳對（每跳高半音）
function fpos(i, j = 0, n = 1) {                       // i：0＝起點荷葉、1..k＝音節排、k+1＝石頭；j/n：這排第幾片／共幾片
  const s = fq, t = i / (s.k + 1), off = (j - (n - 1) / 2) * (n >= 4 ? (s.portrait ? 23 : 21) : (s.portrait ? 31 : 27));   // v6 Lv4 起 4 片荷葉：排密一點才放得下
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
  const stone = el("div", "fstone"); stone._lp = [k + 1]; fplace(stone); stone.appendChild(el("div", "fpic", twx("noPic") ? "👂" : q.word.e)); river.appendChild(stone);   // 爬塔 noPic：石頭上的圖藏起來
  const frog = el("div", "frog"); frog._lp = [0]; fplace(frog); river.appendChild(frog);
  fq.frog = frog; fq.stone = stone;
  showPads(); askSay(q.word.h);
}
function showPads() {
  const s = fq, i = s.step, target = zToStr([s.ts[i]]), n = LVP.frog.pads[lvNow - 1] || (idx === 0 ? 2 : 3), level = round[idx].level;   // v6：每排 2→3/3/3/4/4 片
  const own = s.ts.map(x => zToStr([x]));              // 干擾排除這個詞自己的任何音節
  const avoid = s.ts[i].tone === 2 && s.ts[i + 1]?.tone === 2 ? [s.ts[i].sym + "ˊ"] : [];   // 三聲變調唸出來的樣子不能當假牌
  // level 3＝順序陷阱（櫻木）：把同一個詞的下一個（最後一排用前一個）音節放進來，練「依序」；v6 Lv3 起每題都有；耳朵分不出的（ㄕ／ㄙ…）不當陷阱
  const other = own[i + 1] ?? own[i - 1], trap = (level >= 3 || lvNow >= 3) && other && other !== target && earKey(parseZ(other)) !== earKey([s.ts[i]]);
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
  hgBegin({ units: 1, listen: true, row: i > 0 });     // v6 沙漏每排 6/4.8/3.5 秒（每排重新算；任何一排跑完＝這題銀星）
}
function frogJump(lp, done) {
  const s = fq, f = s.frog; f.classList.remove("jump"); void f.offsetWidth; f.classList.add("jump"); f._lp = lp; fplace(f);
  f.classList.toggle("onstone", lp[0] === s.k + 1);
  gLater(() => { if (!frogLive(s)) return; f.classList.remove("jump"); PZ(() => fxRipple(lp)); if (done) done(); }, 460);   // A4：落地水波
}
function padTap(pad, o) {
  const s = fq, now = performance.now(); if (!s || !pad.isConnected || !frogLive(s) || locked || pad.classList.contains("sink")) return;   // 里維 10-10：「再點一下換題」跟荷葉同一下點擊時，舊荷葉不能推進新題
  if (s.busy) { if (!o.ok && now - s.okAt < 150 && !s.slapped) { s.slapped = true; wrongThisQ++; twEvent("wrong"); } return; }   // 整個手掌拍下去（正解剛好先算到）：還是記一次錯
  if (now < s.lockUntil) return;                       // 跳錯後 0.8 秒全部荷葉點不動（亂點不會因為錯的沉掉就一定過）
  armIdle();
  if (o.ok) {
    s.busy = true; s.okAt = now; s.slapped = false; frogStreak = Math.min(8, frogStreak + 1); hintPulse(false); hgHold();   // 沙漏：跳的時候停（下一排出來再算）
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
    wrongThisQ++; combo = 0; frogStreak = 0; s.lockUntil = now + 800; twEvent("wrong"); noteMix([s.ts[s.step]], parseZ(o.z)); play("ng"); burst(pad, 4, "💧"); pad.classList.add("sink");
    const rv = $("river"); rv.classList.add("hold"); setTimeout(() => rv.classList.remove("hold"), 800);
    s.cols = s.cols.filter(c => c.pad !== pad); setTimeout(() => pad.remove(), 650);
    if (wrongThisQ >= 2) hintPulse(true);
  }
}
function finishFrog() {
  const s = fq, w = el("div", "fword"); w.appendChild(el("div", "fwe", s.q.word.e)); w.appendChild(renderZ(s.ts, s.q.word.h)); $("river").appendChild(w);
  const pic = s.stone.querySelector(".fpic"); if (pic) pic.textContent = s.q.word.e;   // noPic：到了石頭才揭曉圖
  correct(s.stone, () => say(s.q.word.h), { tolerate: s.k >= 3 ? 1 : 0, holdMs: 1200, autoMs: 2200 });   // Lv4 起 tolerate 0（correct 裡改）
}
// 提示（已錯 2 次再按）：地鼠＝正確那隻金框＋晃一下＋多待 1.5 秒（沒冒出來就讓下一隻是正解）；青蛙＝正確荷葉晃一下
function wiggle(e) { if (!e) return; e.classList.remove("wiggle"); void e.offsetWidth; e.classList.add("wiggle"); setTimeout(() => e.classList.remove("wiggle"), 1500); }
function gameHint() {
  if (mode === "whack" && wq && !wq.done) { const c = wq.cells.find(c => c.ok && c.state === "up"); if (c) { wiggle(c.sign); c.mole.classList.add("hinted"); c.until += 1500; } else { wq.hintNext = true; wq.nextSpawn = 0; } }
  if (mode === "frog" && fq && !fq.busy) wiggle(fq.cols.find(c => c.o.ok)?.pad);
}

// ---------- 泡泡救援灣（阿葉 10-11，GPT 提案）：引擎在 js/zhuyin-bubble.js（第一次玩才載）；十個固定關卡、三種符號、救小企鵝 ----------
const BOARD = m => m === "match" || m === "bubble" || m === "deliver" || m === "detective" || m === "tops" || m === "tower";      // 單一盤面的模式：沒有一題一題的回合（偵探、陀螺的回合在模組裡）
let BUBBLE_N = 50, BUBBLE_PER = 10, BUBBLE_ZONES = [];      // 模組載入後改成 LEVELS.length／LEVELS_PER_ZONE／ZONES（v6：五區，每區 10 關）
let bubbleMod = null, bubbleGame = null, bubbleRun = null, bubbleLevel = 0, bubbleTab = 0;
const importBubble = () => bubbleMod || (bubbleMod = import("./zhuyin-bubble.js?v=3").then(m => { BUBBLE_N = m.LEVELS.length; BUBBLE_PER = m.LEVELS_PER_ZONE; BUBBLE_ZONES = m.ZONES; return m; }).catch(e => { bubbleMod = null; throw e; }));
const bubbleZoneOf = lv => Math.min(Math.max(0, BUBBLE_ZONES.length - 1), Math.floor(lv / BUBBLE_PER));
const bubbleAnimal = lv => (BUBBLE_ZONES[bubbleZoneOf(lv)] || { name: "小企鵝" }).name;
const BUBBLE_WIN_TALK = ["小企鵝都救出來了，好厲害！", "小螃蟹都救出來了，好厲害！", "小鯨魚都救出來了，好厲害！", "小象都救出來了，好厲害！", "小獅子都救出來了，好厲害！"];
// 泡泡引擎只建一次（一般關卡和爬塔 Boss 共用）；每區救的動物圖
function ensureBubbleGame(m) {
  if (!bubbleGame) bubbleGame = m.createBubbleGame($("bubbleRoot"), {
    say: t => say(t), talk: t => talk(t), play, later: (fn, ms) => gLater(fn, ms), paused: () => gamePaused,
    onWin: r => bubbleWin(r), onFull: () => bubbleFull(), onPress: e => bubbleBossPress(e), onStop: e => bubbleStopped(e),
    animalImgs: { penguin: "IMAGE/zhuyin/cust_penguin.webp", crab: "IMAGE/zhuyin/pets/crab.webp", whale: "IMAGE/zhuyin/pets/whale.webp",
      elephant: "IMAGE/zhuyin/pets/elephant.webp", lion: "IMAGE/zhuyin/pets/lion.webp" } });
  return bubbleGame;
}
async function buildBubble() {
  const tok = navToken; let m;
  try { m = await importBubble(); } catch (e) { console.warn("[bubble]", e); if (tok === navToken) goMenu(); return; }
  if (tok !== navToken || mode !== "bubble") return;
  ensureBubbleGame(m);
  bubbleRun = { level: bubbleLevel, stars: 0, rescued: 0 };
  bubbleGame.start(bubbleLevel);
}
function bubbleWin(r) {
  if (bubbleBoss) { bubbleBossWin(r); return; }        // 爬塔 Boss：不存進度、不給星星
  if (mode !== "bubble") return;
  locked = true; clearIdle();
  const b = save.bubble; b.stars[r.level] = Math.max(b.stars[r.level] || 0, r.stars); b.lv = Math.max(b.lv, Math.min(BUBBLE_N - 1, r.level + 1)); if (r.level === BUBBLE_N - 1) b.all = 1; persist();
  bubbleRun = { ...r }; results = [r.stars >= 3 ? "gold" : "silver"]; roundTreats += 2 + (r.rescued || 0);
  pzAdd("rescue", r.rescued || 0);                     // 同樂廣場：救援週＝泡泡救出幾隻
  gLater(showResult, 700);
}
function bubbleFull() {
  if (mode !== "bubble" || bubbleBoss) return;           // Boss 碰底線走 onPress，不會到這裡（保險）
  talk("泡泡太多了，我們再試一次！");
  gLater(() => { if (mode === "bubble" && bubbleGame && !bubbleBoss) bubbleGame.start(bubbleRun.level); }, 2400);
}

// ---------- v6 爬塔用的泡泡 Boss（docs/zhuyin-v6-plan.md §3、§5.3）----------
// playBubbleBoss({ level: 盤面（LEVELS 的第幾個，0 起）, ceilingEvery: 每幾發天花板降一排, onEvent }) → { done: Promise<{ cleared, shots, presses, aborted }>, abort() }
// 自己開泡泡畫面、結束（救完／abort／🏠 離開挑戰）時收掉並回到呼叫前的畫面。碰到底線不重來：發 onEvent({ type: "press" }) 並整片往上退 2 排。
// 不存泡泡進度、不給星星／貼紙、不記同樂廣場。🏠 暫停選單在 Boss 時是「繼續玩／離開挑戰」（離開＝aborted）。
let bubbleBoss = null;
function playBubbleBoss({ level = 0, ceilingEvery = 8, onEvent } = {}) {
  if (bubbleBoss) bubbleBoss.finish({ aborted: true });   // 上一場還沒收（保險）
  let resolveDone; const done = new Promise(r => { resolveDone = r; });
  const prev = [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden"))?.id || "menu";
  const B = bubbleBoss = { presses: 0, shots: 0, prev, prevMode: mode, done: false, level: Math.max(0, level | 0), every: Math.max(1, Math.floor(+ceilingEvery) || 8) };
  B.emit = ev => { B.inEmit = true; try { if (onEvent) onEvent(ev); } catch (e) { console.warn("[bubble boss] onEvent", e); } finally { B.inEmit = false; } };
  B.finish = res => {
    if (B.done) return; B.done = true;
    const s = bubbleGame && bubbleGame.state(); if (s && s.boss) { B.shots = s.shots; B.presses = s.presses; }
    if (bubbleBoss === B) bubbleBoss = null;
    bossPauseMenu(false); $("confirm").classList.add("hidden");
    if (bubbleGame) PZ(() => bubbleGame.stop());
    if (gamePaused) gResume();
    if (mode === "bubble") { mode = B.prevMode; showScreen(B.prev); if (B.prev === "menu") playBgm(menuBgmKey()); else if (mode === "tower") playBgm(MODES.tower.bgm); }
    resolveDone(Object.assign({ cleared: false, shots: B.shots, presses: B.presses, aborted: false }, res));
  };
  (async () => {
    let m; try { m = await importBubble(); } catch (e) { console.warn("[bubble]", e); B.finish({ aborted: true }); return; }
    if (B.done) return;
    clearIdle(); mode = "bubble"; locked = false;
    showScreen("bubble"); playBgm(MODES.bubble.bgm); bossPauseMenu(true);
    ensureBubbleGame(m).start(Math.min(BUBBLE_N - 1, B.level), { boss: true, drop: B.every });
  })();
  return { done, abort: () => (B.inEmit ? setTimeout(() => B.finish({ aborted: true }), 0) : B.finish({ aborted: true })) };
}
function bubbleBossWin(r) { const B = bubbleBoss; if (!B) return; B.shots = r.shots; B.presses = r.presses || 0; B.finish({ cleared: true, shots: r.shots, presses: r.presses || 0 }); }
function bubbleBossPress(e) { const B = bubbleBoss; if (!B) return; B.presses = e.presses; B.emit({ type: "press", presses: e.presses, shots: e.shots }); }
function bubbleStopped(e) { if (e && e.boss && bubbleBoss && !bubbleBoss.done) bubbleBoss.finish({ aborted: true }); }   // 別的地方把泡泡畫面收掉了（例如 goMenu）：這場算離開
// 🏠 暫停選單：Boss 進行中「回小島」變「離開挑戰」、藏「重新開始」；點擊在捕獲階段先攔下來（原本的 onclick 不會跑）
function bossPauseCatch(e) {
  const B = bubbleBoss; if (!B) return;
  const b = e.target && e.target.closest && e.target.closest("#confirmYes, #confirmRestart"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  if (b.id === "confirmYes") { play("select"); B.finish({ aborted: true }); }
}
function bossPauseMenu(on) {
  const yes = $("confirmYes"), rs = $("confirmRestart");
  document.body.classList.toggle("zy-bubble-boss", on);   // Boss 進行中（爬塔畫面若是蓋在上面的 overlay，可用這個 class 先藏起來）
  if (on) { document.addEventListener("click", bossPauseCatch, true); if (!yes.dataset.bossTxt) { yes.dataset.bossTxt = yes.textContent; yes.textContent = "🚪 離開挑戰"; } rs.classList.add("hidden"); }
  else { document.removeEventListener("click", bossPauseCatch, true); if (yes.dataset.bossTxt) { yes.textContent = yes.dataset.bossTxt; delete yes.dataset.bossTxt; } rs.classList.remove("hidden"); }
}
window.__zyTowerApi = Object.assign(window.__zyTowerApi || {}, { playBubbleBoss });   // 爬塔模組（分身 D）從這裡拿
if (location.search.includes("debug")) setTimeout(() => { if (window.__zy) window.__zy.playBubbleBoss = playBubbleBoss; }, 0);   // 測試用（window.__zy 在檔尾才建）
// 選關：上方是三個區頁籤（顯示該區符號＋救的動物，前一區全過才開）、下面是該區 10 關（過過的關有星星、下一關黃框、還沒到的鎖著）
// 解鎖規則：save.bubble.lv＝目前玩到的關；第 k 區要 lv ≥ k×10（＝前一區 10 關全過）；區內第 i 關要 i ≤ lv。兩種鎖是同一條「逐關解鎖」線。
const BUBBLE_TAB_IMG = ["cust_penguin", "pets/crab", "pets/whale", "pets/elephant", "pets/lion"];
async function openBubblePick() {
  try { await importBubble(); } catch (e) { console.warn("[bubble]", e); return; }
  bubbleTab = bubbleZoneOf(Math.min(BUBBLE_N - 1, save.bubble.lv));      // 一打開停在目前進度那一區
  renderBubblePick();
  $("bubblePick").classList.remove("hidden");
}
function renderBubblePick() {
  const lv = save.bubble.lv, tabs = $("bubbleZones"), box = $("bubbleLevels"); tabs.innerHTML = ""; box.innerHTML = "";
  BUBBLE_ZONES.forEach((z, k) => {
    const open = lv >= k * BUBBLE_PER, t = el("button", "bb-ztab" + (k === bubbleTab ? " on" : "") + (open ? "" : " locked"));
    const im = el("img"); im.src = IMG(BUBBLE_TAB_IMG[k] || BUBBLE_TAB_IMG[0]); im.alt = ""; im.draggable = false; t.appendChild(im);
    t.appendChild(el("div", "zs", z.syms)); if (!open) t.appendChild(el("div", "zl", "🔒"));
    t.setAttribute("aria-label", `第 ${k + 1} 區 ${z.syms}${open ? "" : "，還沒開"}`); t.setAttribute("aria-pressed", k === bubbleTab ? "true" : "false");
    t.onclick = () => {
      if (!open) { play("ng"); talk("先把前面的關卡都過完，才能來這裡喔！"); t.classList.remove("shake"); void t.offsetWidth; t.classList.add("shake"); return; }
      play("select"); bubbleTab = k; renderBubblePick();
    };
    tabs.appendChild(t);
  });
  for (let i = bubbleTab * BUBBLE_PER; i < Math.min(BUBBLE_N, (bubbleTab + 1) * BUBBLE_PER); i++) {
    const open = i <= lv, s = save.bubble.stars[i] || 0, b = el("button", "bb-lv" + (open ? "" : " locked") + (i === lv && !save.bubble.all ? " next" : ""));
    b.appendChild(el("div", "n", String(i + 1))); b.appendChild(el("div", "s", open ? "⭐".repeat(s) || "　" : "🔒"));
    b.disabled = !open; b.setAttribute("aria-label", `第 ${i + 1} 關`);
    b.onclick = () => { play("select"); bubbleLevel = i; $("bubblePick").classList.add("hidden"); startMode("bubble"); };
    box.appendChild(b);
  }
}

// ---------- 彩虹配送站（10-12，docs/zhuyin-v5-plan.md §2）：引擎在 js/zhuyin-deliver.js（第一次玩才載，要 three）；8 個固定任務、線性解鎖 ----------
// 存檔 save.deliver＝{ lv 下一關, stars { 關: 最佳星 }, all }；第一次過關送換裝（模組 onWin 的 gift → RW.giveWear）；沒送錯過的商品詞給貼紙。
let deliverMod = null, deliverGame = null, deliverRun = null, deliverLevel = 0;
function importDeliver() {
  if (deliverMod) return deliverMod;
  const url = "./zhuyin-deliver.js?v=3";               // 要 three（importmap）；舊 iPad 沒有 importmap → 跟 3D 小島一樣走 es-module-shims
  const p = window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap") ? import(url)
    : window.importShim ? window.importShim(new URL(url, import.meta.url).href) : Promise.reject(new Error("no importmap"));
  return (deliverMod = p.then(m => { if (m.TASKS.length !== DELIVER_TASKS) console.warn("[deliver] 關數跟 DELIVER_TASKS 對不上", m.TASKS.length); return m; }).catch(e => { deliverMod = null; throw e; }));
}
const DELIVER_WIN_TALK = "東西都送到了，好厲害！";
const DELIVER_FAIL = "配送站現在打不開，等一下再試試看！";
async function buildDeliver() {
  const tok = navToken; let m;
  const slow = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);   // 第一次載引擎（three 小島已經抓過，通常很快）
  try { m = await importDeliver(); } catch (e) { console.warn("[deliver]", e); }
  clearTimeout(slow); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }
  if (tok !== navToken || mode !== "deliver") return;
  if (!m) { goMenu(); guideSay(DELIVER_FAIL); return; }
  // 第一次玩的開場語還在講（introUntil）：居民的話排在後面，不打斷它（排隊的沒有 onEnd，模組自己有保險計時）
  if (!deliverGame) deliverGame = m.createDeliverGame($("deliverRoot"), {
    say: (t, r, cb) => Date.now() < introUntil ? queueSay(t) : say(t, r, cb), talk: (t, cb) => Date.now() < introUntil ? queueTalk(t) : talk(t, cb), play: n => play(n), later: (fn, ms) => gLater(fn, ms), paused: () => gamePaused,
    onSave: r => deliverSave(r), onWin: r => deliverWin(r), onFail: f => setTimeout(() => deliverFail(f), 0),   // onSave＝送完最後一件立刻存檔；onWin＝演出完才轉場；失敗可能在 start() 裡面同步通知：等 start 跑完再收
    petImg: id => `IMAGE/zhuyin/pets/${id}.webp`, isCleared: i => (save.deliver.stars[i] || 0) > 0, hintWait: () => save.hintWait,
  });
  deliverRun = { task: deliverLevel, stars: 0, saved: false };   // saved：這一局存過了沒（onSave 與 onWin 都會走 deliverSave，只存一次）
  try { await deliverGame.start(deliverLevel); } catch (e) { console.warn("[deliver] start", e); }
}
// 存檔（里維 10-12）：送完最後一件模組就呼叫 onSave → 馬上存；以前等 onWin（3.6–6 秒演出後）才存，中間按 🏠 進度、禮物、貼紙全丟
// 防重複：同一局（deliverRun）只存一次、而且關卡要對得上（上一局晚到的回呼不會存進這一局）
function deliverSave(r) {
  if (mode !== "deliver" || !r || !deliverRun || deliverRun.saved || deliverRun.task !== r.task) return false;
  deliverRun.saved = true;
  pzAdd("deliver", (r.orders || []).length);           // 同樂廣場：送貨週＝這一局送到幾件（同一局只存一次＝只算一次）
  const d = save.deliver, first = !(d.stars[r.task] > 0);   // first＝這一關以前沒過過（進階關的扭蛋幣只送第一次）
  d.stars[r.task] = Math.max(d.stars[r.task] || 0, r.stars); d.lv = Math.max(d.lv, Math.min(DELIVER_TASKS - 1, r.task + 1)); if (r.task === DELIVER_TASKS - 1) d.all = 1;
  if (r.gift) RW.giveWear(save.rw, r.gift);           // 第一次過關的禮物（換裝）進衣櫃
  if (r.coin && first) save.rw.coins = Math.min(999, save.rw.coins + 1);   // 10-13 進階關 9–12：第一次過關 1 枚扭蛋幣（上限跟 cleanRewards 一樣 999）
  for (const o of r.orders || []) {                    // 貼紙：沒送錯過的訂單＝一次答對（跟其他模式一樣，第一次答對就貼上）
    const w = WORDS.find(x => x.h === o.word); if (w && !o.wrong && !save.stickers[w.h]) { save.stickers[w.h] = 1; earned.push(w); }
  }
  persist();
  return true;
}
function deliverWin(r) {                              // 演出完：只管轉場（存檔已在 deliverSave；沒走過 onSave 的舊流程在這裡補存一次）
  if (mode !== "deliver") return;
  deliverSave(r);
  locked = true; clearIdle();
  deliverRun = { ...r, saved: true }; results = [r.stars >= 3 ? "gold" : "silver"]; roundTreats += 2 + (r.orders ? r.orders.length : 1);
  gLater(() => { showResult(); if (deliverGame) PZ(() => deliverGame.stop()); }, 400);   // 結算畫面出來就把 3D 場景收掉（WebGL 釋放）
}
function deliverFail(f) {
  if (mode !== "deliver") return;
  console.warn("[deliver] 3D 場景失敗，回小島", f);
  lsSet(K("resume"), null); goMenu(); guideSay(DELIVER_FAIL);
}
// 選關：12 格（每列 4 個、3 列）（save.deliver.lv＝目前玩到的關；i ≤ lv 才開），過過的有星星、下一關黃框
function openDeliverPick() { renderDeliverPick(); $("deliverPick").classList.remove("hidden"); }
function renderDeliverPick() {
  const d = save.deliver, box = $("deliverLevels"); box.innerHTML = "";
  for (let i = 0; i < DELIVER_TASKS; i++) {
    const open = i <= d.lv, s = d.stars[i] || 0, b = el("button", "bb-lv" + (open ? "" : " locked") + (i === d.lv && !d.all ? " next" : ""));
    b.appendChild(el("div", "n", String(i + 1))); b.appendChild(el("div", "s", open ? "⭐".repeat(s) || "　" : "🔒"));
    b.disabled = !open; b.setAttribute("aria-label", `第 ${i + 1} 關`);
    b.onclick = () => { play("select"); deliverLevel = i; $("deliverPick").classList.add("hidden"); startMode("deliver"); };
    box.appendChild(b);
  }
}

// ---------- 詞句小偵探（10-12；js/zhuyin-detective.js＋css/zhuyin-detective.css；入口＝彩虹島「詞句偵探社」）----------
// 念一句耳熟的歌詞 → 三句只差幾個字的卡片選一張；每回合 5 題（題庫不夠就全出）、不倒數不扣命、答錯不公布答案（規則都在模組裡）。
// 第一次玩：教學交給模組唸（start({ intro:true })：卡片等教學講完才出來）；之後 intro:false（主程式本來就不唸開場語，見 SELF_INTRO）。
// 答對一題（模組的 onCorrect）＝點心 +1、同樂廣場讀字週 +1；演出完（onWin）存檔 save.detective＝{ seen, best }，結算走共用 showResult（星星＝模組算的、點心再 +2、唸 WIN_TALK）。
let detectiveMod = null, detectiveGame = null, detectiveRun = null, detectiveWinTalk = "", detectiveAdv = null;
const importDetective = () => detectiveMod || (detectiveMod = import("./zhuyin-detective.js?v=4").catch(e => { detectiveMod = null; throw e; }));
const DETECTIVE_FAIL = "偵探社現在打不開，等一下再試試看！";
async function buildDetective() {
  const tok = navToken; let m;
  const slow = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);
  try { m = await importDetective(); } catch (e) { console.warn("[detective]", e); }
  clearTimeout(slow); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }
  if (tok !== navToken || mode !== "detective") return;
  if (!m) { goMenu(); guideSay(DETECTIVE_FAIL); return; }
  detectiveWinTalk = m.WIN_TALK; detectiveAdv = m.advanceLevel;
  if (!detectiveGame) detectiveGame = m.createDetectiveGame($("detectiveRoot"), {
    levels: () => save.detective.lv, seen: () => save.detective.seen,   // 10-13 等級：選等級畫面、出題優先沒玩過的
    say: (t, r, cb) => say(t, r, cb), talk: (t, cb) => talk(t, cb), play: n => play(n), later: (fn, ms) => gLater(fn, ms), paused: () => gamePaused,
    stopVoice: () => stopSpeech(), preload: ts => { voicePreload(ts); },   // stopVoice：真的停掉 zhuyin-voice 正在播的那句（換題、離開、重聽不疊播）
    onCorrect: () => { if (mode !== "detective") return; roundTreats++; pzAdd("read", 1); },
    onWin: r => detectiveWin(r), mascotImg: IMG("pets/dog"),
  });
  detectiveRun = { stars: 0, correct: 0, firstTry: 0, total: 0 };
  detectiveGame.start({ intro: selfIntro, pick: true });   // 先出「選等級」畫面（五色徽章），按「開始」才出題
}
function detectiveWin(r) {
  if (mode !== "detective" || !r) return;
  locked = true; clearIdle();
  const d = save.detective, ids = (r.items || []).map(x => x && x.id).filter(id => typeof id === "string");
  d.seen = [...new Set([...d.seen, ...ids])].slice(-200); d.best = Math.max(d.best, Math.min(3, Math.max(1, r.stars | 0)));
  if (detectiveAdv) d.lv = detectiveAdv(d.lv, r.lv | 0 || 1, r.stars | 0).rec;   // 等級：最高級 3★ 或連續 3 次 2★ 升下一級（模組的 advanceLevel，跟升級畫面同一個）
  persist();
  detectiveRun = { ...r }; results = [r.stars >= 3 ? "gold" : "silver"]; roundTreats += 2;
  gLater(showResult, 400);
}

// ---------- 注音戰鬥陀螺（10-12；js/zhuyin-tops.js＋css/zhuyin-tops.css；入口＝歸仁區「陀螺競技場」；docs/zhuyin-tops-spec.md）----------
// 用注音拼 5 個字 → 5 顆陀螺 → 一對一對戰。要「陀螺券」：每次結算拿到的星星都存進 save.tops.starsBank，滿 15 顆換 1 張（最多 3 張）；第一次免費。
// 券在按「下場！」那一刻才扣（模組呼叫 useTicket）；下場了還沒打完就離開（🏠 回小島、重新開始、3D 掛掉）＝那張券退回（topsRefund，小孩誤觸不會白白損失 15 顆星星）。
// 全島陀螺榜：讀＝同樂廣場後端 doGet 的 tops（只有公開的前 5 名；不足 5 筆用模組的 LEGENDS 補）；送＝POST {k:"top", p}（只有詞句本身，戰力伺服器重算）。
//   跟同樂廣場同一個開關：家長關掉廣場、或在本機／自動化瀏覽器（plaza 的 netOK）＝不送也不讀，全島榜只有島上傳說。我家排行＝這台平板（save.tops.home）。
// 結算是模組自己的畫面（勝負、戰力、兩個排行榜、再玩一次／回小島）；陀螺不給星星（券的經濟跟星星罐分開），所以不走共用 showResult、也不送同樂廣場的 star。
let topsMod = null, topsGame = null, topsPending = null, topsLegends = [], topsIsland = [];   // topsPending：已經扣了券、還沒打完的那一場 { free }
function importTops() {
  if (topsMod) return topsMod;
  const url = "./zhuyin-tops.js?v=2";                   // 要 three（importmap）；舊 iPad 沒有 importmap → 跟 3D 小島一樣走 es-module-shims
  const p = window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap") ? import(url)
    : window.importShim ? window.importShim(new URL(url, import.meta.url).href) : Promise.reject(new Error("no importmap"));
  return (topsMod = p.catch(e => { topsMod = null; throw e; }));
}
const TOPS_FAIL = "陀螺競技場現在打不開，等一下再試試看！";
const TOPS_DICT_URL = new URL("./zhuyin-tops-dict.json?v=1", import.meta.url).href;   // 預載跟模組用同一個網址（模組裡有快取）
// 手指一碰陀螺卡片／3D 競技場浮標（hub3d 會轉成卡片的 pointerdown）＝先抓引擎＋字典（10-12 里維：放開時多半已經好了）
function topsPreload() { importTops().then(m => m.loadDict && m.loadDict(TOPS_DICT_URL)).catch(() => {}); }
{ const c = document.querySelector(".mode-card[data-mode=tops]"); if (c) c.addEventListener("pointerdown", topsPreload); }
const topsNeed = () => Math.max(1, TOPS_STARS - save.tops.starsBank);
// v7 段位（對手難度）：新手 → 銅牌 → 銀牌 → 金牌 → 彩虹；贏一場升一段（模組 onWin 的 info.rank）。名字跟 js/zhuyin-tops.js 的 RANKS 一樣（tools/zy-test/tops.js 比對）
// 介紹卡用：topsRankLabel() → "🥉 銅牌"（純函式，不動畫面、不呼叫 nav/goMenu、不清 gLater）
const TOPS_RANKS = [["🔰", "新手"], ["🥉", "銅牌"], ["🥈", "銀牌"], ["🥇", "金牌"], ["🌈", "彩虹"]];
function topsRank() { return Math.min(TOPS_RANKS.length - 1, Math.max(0, save.tops.rank | 0)); }
function topsRankLabel() { const r = TOPS_RANKS[topsRank()]; return `${r[0]} ${r[1]}`; }
if (location.search.includes("debug")) setTimeout(() => { if (window.__zy) Object.assign(window.__zy, { topsRankLabel }); }, 0);   // 測試用（window.__zy 在檔案最後才建，模組跑完才合併）
const topsNet = () => { try { return plaza.isOn() && !!plaza.debug.netOK; } catch (e) { return false; } };   // 跟同樂廣場同一個開關（plaza 的 netOK：本機／自動化瀏覽器不連，?plaza=on 才連）
// 結算拿到星星：存進 starsBank，滿 15 顆換 1 張券；券滿 3 張時 starsBank 最多存到 15（用掉一張後，下次結算再換）。回傳這次換到幾張
function topsCredit(n) {
  const t = save.tops; let got = 0;
  t.starsBank += Math.max(0, Math.floor(+n) || 0);
  while (t.starsBank >= TOPS_STARS && t.tickets < TOPS_MAX) { t.tickets++; t.starsBank -= TOPS_STARS; got++; }
  t.starsBank = Math.min(TOPS_STARS, t.starsBank);
  return got;
}
function topsUseTicket() {                             // 第一次免費優先（有券也先用免費的那次）
  const t = save.tops;
  if (!t.freeUsed) { t.freeUsed = 1; topsPending = { free: true }; }
  else if (t.tickets > 0) { t.tickets--; topsPending = { free: false }; }
  else return false;
  t.pending = topsPending.free ? 2 : 1;                 // 扣券跟「待退」一起存（里維必修 2）：分頁被回收／重新整理，下次開頁 loadSlot 會退回
  persist(); return true;
}
function topsRefund() {                                // nav() 呼叫：下場了還沒打完就離開 → 退回那張券（免費那次也還回去）
  topsPending = null;                                  // 以存檔的 save.tops.pending 為準（loadSlot 已經退過就不會再退一次）
  if (topsUnpend(save.tops)) persist();
}
// （10-12 起沒券不擋在門口：模組照樣進打字畫面，打好的句子存成陀螺蛋；「再拿 N 顆星星」改在模組的結算／蛋畫面用 15 格集點卡顯示，回小島時貓頭鷹再說）
// 全島榜（模組開局就要，挑對手用）：後端公開的前 5 名（最多等 4 秒；連不上用上次讀到的），不足 5 筆用島上傳說補（戰力由模組照公式算）
async function topsBoard() {
  let tops = null;
  if (topsNet()) {
    try { const d = await Promise.race([plaza.refresh(), new Promise(r => setTimeout(() => r(null), 4000))]); tops = d && d.tops; } catch (e) {}
    if (!Array.isArray(tops)) { const c = lsGet("zy_plaza_cache", null); tops = c && c.d && Array.isArray(c.d.tops) ? c.d.tops : []; }
  }
  const island = cleanTops({ home: (Array.isArray(tops) ? tops : []).filter(e => e && Number.isFinite(+e.power)) }).home.map(e => ({ p: e.p, power: e.power }));   // 同一個清洗：剛好 5 個國字、戰力 0..9999、同一句只留最高、前 5（沒有戰力的壞資料丟掉）
  topsIsland = island.slice();
  for (const p of topsLegends) if (island.length < 5 && !island.some(e => e.p === p)) island.push({ p });
  return { island, home: save.tops.home.map(e => ({ ...e })), recent: save.tops.history.filter(e => e.o).map(e => ({ p: e.p, o: e.o })) };   // recent：同一句再下場時避開打過的對手（10-12 櫻木）
}
// 可能進全島前 5 才送（模組判斷）：POST {k:"top", p} → { ok, power, status: "public"|"pending"|"below" }；失敗或沒連線＝安靜（回 null，結算不顯示上榜字）
function topsSubmit(phrase) {
  if (!topsNet() || typeof phrase !== "string" || !HAN5.test(phrase)) return null;
  const ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
  return fetch(PLAZA_URL, { method: "POST", body: JSON.stringify({ k: "top", p: phrase }), headers: { "Content-Type": "text/plain;charset=utf-8" },   // text/plain：不觸發 CORS 預檢（跟同樂廣場一樣）
    cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", keepalive: true, ...(ctl ? { signal: ctl.signal } : {}) })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (!j || j.ok !== true) return null;
      const res = { pending: j.status === "pending", public: j.status === "public" };
      if (res.public) res.rank = Math.min(5, 1 + topsIsland.filter(e => e.p !== phrase && e.power > (+j.power || 0)).length);   // 自動公開（後端開關）：直接上榜＝顯示名次
      return res;
    })
    .catch(() => null).finally(() => clearTimeout(tm));
}
async function buildTops() {
  const tok = navToken; let m;
  const slow = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);   // 第一次載引擎（three 小島已經抓過，通常很快）
  try { m = await importTops(); } catch (e) { console.warn("[tops]", e); }
  clearTimeout(slow); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }
  if (tok !== navToken || mode !== "tops") return;
  if (!m) { goMenu(); guideSay(TOPS_FAIL); return; }
  topsLegends = m.LEGENDS || [];
  if (!topsGame) topsGame = m.createTopsGame($("topsRoot"), {
    say: (t, r, cb) => say(t, r, cb), talk: (t, cb) => talk(t, cb), play: (n, r) => play(n, r), later: (fn, ms) => gLater(fn, ms), paused: () => gamePaused,
    onWin: info => topsWin(info), onSubmit: p => topsSubmit(p), leaderboard: () => topsBoard(),
    tickets: () => save.tops.tickets, useTicket: () => topsUseTicket(), firstFree: () => !save.tops.freeUsed, needStars: () => topsNeed(),
    starsBank: () => save.tops.starsBank,                // 15 格集點卡（10-12 櫻木）
    rank: () => topsRank(),                              // v7 段位（對手照段位挑）
    bgm: k => { if (mode === "tops") playBgm(k || MODES.tops.bgm); },   // v7：合體起＝battle；回打字＝null → 換回 road
    eggs: () => save.tops.eggs.map(e => ({ p: e.p, ...(e.z ? { z: e.z.slice() } : {}) })), setEggs: l => { save.tops.eggs = cleanTops({ eggs: l }).eggs; persist(); },   // 陀螺蛋：沒券時打好的句子
    onExit: e => setTimeout(() => topsExit(e), 0), onFail: f => setTimeout(() => topsFail(f), 0),
    dictUrl: TOPS_DICT_URL,
  });
  try { await topsGame.start(); } catch (e) { console.warn("[tops] start", e); }
}
// 分出勝負（模組 onWin，結算畫面出來前）：券這一場用掉了（不退）；最佳、我家排行（模組算好的前 5）、最近 10 句存起來
function topsWin(info) {
  if (mode !== "tops" || !info || typeof info.phrase !== "string") return;
  topsPending = null;
  const t = save.tops, power = Math.max(0, Math.min(9999, Math.floor(+info.power) || 0));
  t.pending = 0;                                       // 打完了：券這一場用掉（不退），下面 persist() 一起存
  t.home = cleanTops({ home: Array.isArray(info.home) ? info.home : [] }).home;
  if (!t.best || power > t.best.power) t.best = { p: info.phrase, power };
  t.history = cleanTops({ history: [...t.history, { p: info.phrase, power, win: info.win ? 1 : 0, o: info.opponent && info.opponent.p }] }).history;
  if (info.win && info.rank && Number.isFinite(+info.rank.to)) t.rank = Math.max(t.rank, Math.min(t.rank + 1, TOPS_RANKS.length - 1, Math.floor(+info.rank.to)));   // v7 段位：贏了最多升一段、不會降
  persist();
}
function topsExit(e) {                                 // 模組要回小島：結算按 🏝️、存好陀螺蛋後按 🏝️（why "noticket"＝貓頭鷹說還差幾顆星星）
  if (mode !== "tops") return;
  goMenu();
  if (e && e.why === "noticket") guideSay(`再拿 ${topsNeed()} 顆星星就能玩陀螺喔！`, false);
}
function topsFail(f) {                                 // 字典載不到、3D 畫面被系統收走：回小島（下場了沒打完的券由 nav() 退回）；沒有 WebGL2＝模組照樣用平面畫面玩，不用回去
  if (mode !== "tops" || !f || f.why === "nowebgl") { if (f) console.warn("[tops]", f.why); return; }
  console.warn("[tops] 打不開，回小島", f);
  goMenu(); guideSay(TOPS_FAIL);
}

// ---------- 挑戰燈塔（爬塔／無限挑戰，10-13；js/zhuyin-tower.js＋zhuyin-tower-core.js＋css/zhuyin-tower.css；入口＝主島燈塔岬；docs/zhuyin-v6-plan.md §5）----------
// 1–100 層，一層一個遊戲（呼叫主程式的 playFloor）、每 10 層守塔怪（泡泡 Boss＝playBubbleBoss、連戰＝playFloor 6 次）；規則都在模組裡。
// 爬塔名字（24 個代號）＋排行榜前 5 名：後端＝同樂廣場同一個 Apps Script（tw_claim／tw_ping／tw_score／tw_leave；doGet 的 tower）。跟同樂廣場同一個開關（topsNet）。
// 存檔 zy{n}_tower（模組 cleanTower 清洗）；秘密碼只在本機、只用 POST 送、不印出來。星星＝放進星星罐（也算陀螺券、同樂廣場收集週）；扭蛋幣＝save.rw.coins。
let towerMod = null, towerGame = null, towerCoreP = null;
const importTower = () => towerMod || (towerMod = import("./zhuyin-tower.js?v=1").catch(e => { towerMod = null; throw e; }));
const towerCore = () => towerCoreP || (towerCoreP = import("./zhuyin-tower-core.js?v=1").catch(e => { towerCoreP = null; throw e; }));   // 每天回報、家長頁用（同一個網址＝跟模組同一份）
const TOWER_FAIL = "燈塔現在打不開，等一下再試試看！";
const towerNet = () => topsNet();
const TOWER_STUB = /[?&]towerstub(=|&|$)/.test(location.search);
function towerPost(body) {                             // POST text/plain（不觸發 CORS 預檢，跟陀螺榜一樣）；回後端物件或 null（連不上／逾時）
  if (!towerNet()) return Promise.resolve(null);
  const ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
  return fetch(PLAZA_URL, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" },
    cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", keepalive: true, ...(ctl ? { signal: ctl.signal } : {}) })
    .then(r => (r.ok ? r.json() : null)).then(j => (j && typeof j === "object" ? j : null)).catch(() => null).finally(() => clearTimeout(tm));
}
async function towerBoard(force) {                     // 讀同樂廣場的 doGet（tower 欄位）；連不上用上次讀到的
  if (!towerNet()) return null;
  let d = null;
  try { d = await Promise.race([plaza.refresh(!!force), new Promise(r => setTimeout(() => r(null), 5000))]); } catch (e) {}
  if (!d || !d.tower) { const c = lsGet("zy_plaza_cache", null); d = c && c.d; }
  return d && d.tower && typeof d.tower === "object" ? d.tower : null;
}
function towerGive(g) {                                // 爬塔的獎勵：星星進星星罐（滿了換扭蛋幣）、扭蛋幣；不扣任何東西
  const n = Math.max(0, Math.min(5, Math.floor(+(g && g.stars)) || 0)), c = Math.max(0, Math.min(3, Math.floor(+(g && g.coins)) || 0));
  if (n) { save.stars += n; statsStars("tower", n); RW.creditJar(save.rw, save.stars); topsCredit(n); pzAdd("star", n); }
  if (c) { save.rw.coins += c; PZ(() => RW.evoAdd(save.rw, RW.EVO_GAIN.boss)); }   // v7：爬塔只在「第一次打倒某隻守塔怪」給扭蛋幣（zhuyin-tower.js clearFloor 的 coin）→ 同時給進化能量 +40
  if (n || c) persist();
}
// v7 進化能量（爬塔）：樓層＝存爬塔進度時看「最高通過樓層」有沒有比記號高（RW.evoTower，第一次到新樓層每層 +2）；守塔怪＝towerGive 的 coins。
// 不改 zhuyin-tower.js：接在 towerApi 的 store／give 上。爬塔中不跳任何畫面、不出聲（不打斷）；能量集滿＝回小島時貓頭鷹提醒（evoMenu）。
function evoTowerStore(t) {
  const prev = lsGet(K("tower"), null), tb0 = save.rw.evo ? save.rw.evo.tb : -1, r = RW.evoTower(save.rw, t && t.best, prev && prev.best);
  if (r.got || save.rw.evo.tb !== tb0) lsSet(K("rewards"), save.rw);   // 只存獎勵（第一次對上記號也存，不然重整後又從 -1 開始）
}
function towerExit(where) {                            // 結算的「去玩別的」＝回小島；連輸 2 場的「去泡泡灣」＝回小島後點泡泡（解鎖、選關照原本的流程）
  goMenu();
  if (where === "bubble") setTimeout(() => { if (!mode) document.querySelector(".mode-card[data-mode=bubble]")?.click(); }, 80);
}
const towerApi = () => ({
  say: (t, r, cb) => say(t, r, cb), talk: (t, cb) => talk(t, cb), play: (n, r) => play(n, r), stopVoice: () => stopSpeech(), paused: () => gamePaused,
  load: () => lsGet(K("tower"), null), store: t => { PZ(() => evoTowerStore(t)); lsSet(K("tower"), t); }, give: g => towerGive(g),   // v7：存之前先比最高樓層（進化能量）
  playFloor: o => (TOWER_STUB ? null : playFloor(o)),  // 主程式 7 個遊戲的一層（§2.4）；網址 ?towerstub＝用模組的模擬關卡（tools/zy-test/tower.js 測爬塔流程用）
  playBubbleBoss: o => (TOWER_STUB ? null : playBubbleBoss(o)),   // 泡泡守塔怪（§3）
  net: () => towerNet(), post: b => towerPost(b), board: f => towerBoard(f),
  modeInfo: m => ({ name: (GAME_INFO[m] && GAME_INFO[m].name) || m, ico: modeIco(m) }), me: () => SLOTS[slot - 1],
  showTower: () => { if (mode === "tower" && $("tower").classList.contains("hidden")) showScreen("tower"); },
  exit: w => towerExit(w), owlImg: IMG("guide_owl"),
});
async function buildTower() {
  const tok = navToken; let m;
  const slow = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);
  try { m = await importTower(); } catch (e) { console.warn("[tower]", e); }
  clearTimeout(slow); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }
  if (tok !== navToken || mode !== "tower") return;
  if (!m) { goMenu(); guideSay(TOWER_FAIL); return; }
  if (!towerGame) towerGame = m.createTowerGame($("towerRoot"), towerApi());
  towerGame.start({ intro: selfIntro });
}
function towerMeta() {                                 // 介紹卡／🗺️ 清單：最高第幾層
  const t = lsGet(K("tower"), null) || {}, best = Math.max(0, Math.min(100, Math.floor(+t.best) || 0));
  return el("span", "pk-txt", best >= 100 ? "👑 第 100 層" : `🗼 第 ${best} 層`);
}
// 開遊戲時每天回報一次「來了」（tw_ping，延長代號到期日）＋補送還沒送到的樓層；被釋出了＝本機樓層歸零（下次進塔模組會跟小孩說）
let towerDailyBusy = false;
async function towerDaily() {
  if (towerDailyBusy || mode === "tower" || !towerNet()) return;
  const n = slot, raw = lsGet(`zy${n}_tower`, null); if (!raw || !raw.code) return;
  towerDailyBusy = true;
  try {
    const C = await towerCore(), t = C.cleanTower(raw), day = C.taipeiDay(Date.now());
    if (t.pingDay === day && !C.scorePending(t)) return;
    const r = await C.syncTower(t, towerPost, day);
    if (r.changed && n === slot && mode !== "tower") lsSet(`zy${n}_tower`, t);
  } catch (e) { console.warn("[tower] daily", e && e.message); } finally { towerDailyBusy = false; }
}
$("startBtn").addEventListener("click", () => setTimeout(towerDaily, 5000));
setInterval(() => { if (!mode && !document.hidden) towerDaily(); }, 60000);   // 換人玩、斷線恢復後也補得到
function towerForget(n = slot) {                       // 清除重來／家長放棄：把代號還給大家（送不到也沒關係，七天後自己過期）
  const raw = lsGet(`zy${n}_tower`, null);
  if (raw && typeof raw.code === "string" && typeof raw.sec === "string" && towerNet()) towerPost({ k: "tw_leave", c: raw.code, s: raw.sec });
}
// 家長設定「挑戰燈塔」：這位的爬塔名字、最高樓層；「放棄爬塔名字」按兩次才放（樓層歸零、徽章保留）。家長設定本身在 ⚙️ 按住 2 秒的閘門後面
let towerLeaveArmed = 0;
function renderTowerSec() {
  const box = $("towerSecState"); if (!box) return;
  const who = `${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}`, lb = $("towerLeaveBtn");
  towerLeaveArmed = 0; lb.textContent = "🏳️ 放棄爬塔名字"; lb.classList.remove("armed"); $("towerSecMsg").textContent = "";
  towerCore().then(C => {
    const t = C.cleanTower(lsGet(K("tower"), null)), cd = C.codeOf(t.code);
    box.textContent = cd ? `${who}：爬塔名字「${cd.e} ${cd.name}」，最高第 ${t.best} 層（存檔點第 ${t.cp} 層）` : `${who}：還沒有爬塔名字（最高第 ${t.best} 層）。在燈塔畫面按住「選爬塔名字」2 秒就能選。`;
    lb.classList.toggle("hidden", !cd);
    $("towerNetNote").classList.toggle("hidden", towerNet());
  }).catch(() => { box.textContent = ""; });
}
new MutationObserver(() => { if (!$("settings").classList.contains("hidden")) renderTowerSec(); }).observe($("settings"), { attributes: true, attributeFilter: ["class"] });
$("towerLeaveBtn").onclick = () => {
  play("tap");
  if (!towerLeaveArmed) { towerLeaveArmed = Date.now(); $("towerLeaveBtn").textContent = "⚠️ 再按一次：放棄名字、樓層歸零"; $("towerLeaveBtn").classList.add("armed"); return; }
  towerForget(slot);
  towerCore().then(C => { const t = C.applyLost(C.cleanTower(lsGet(K("tower"), null)), ""); lsSet(K("tower"), t); renderTowerSec(); $("towerSecMsg").textContent = "已經放棄，這個代號別人可以選了。"; });
};
window.addEventListener("resize", () => { if (mode === "tower" && towerGame) PZ(() => towerGame.relayout()); });
if (location.search.includes("debug")) window.__zyTower = { get game() { return towerGame; }, daily: towerDaily, board: towerBoard };   // 測試用（tools/zy-test/tower.js）

// ---------- 結算（B1）：星星一顆顆蓋章 → 新貼紙一張張貼 → 星星飛進星星罐 → 按鈕最後才淡入 ----------
// 演出中點畫面＝快轉到最後（小孩不會卡住）；按鈕一直在 DOM 裡、只用透明度淡入（測試用 JS .click() 照常有效）
let rs = null;                                        // 這次結算演出的狀態；換畫面（navToken 變）或快轉後作廢
const RESULT_TEXT = any => mode === "match" ? "全部配對成功！" : mode === "deliver" ? "全部送到了！" : mode === "detective" ? `找到 ${detectiveRun?.correct || detectiveRun?.total || 1} 句話！` : mode === "bubble" ? `救出 ${bubbleRun?.rescued || 1} 隻${bubbleAnimal(bubbleRun?.level || 0)}！` : mode === "fish" ? `釣到 ${any} 條魚！` : mode === "hunt" ? `找到 ${any} 個寶物！` : mode === "tone" ? `戳破 ${any} 顆氣球！` : mode === "whack" ? `敲到 ${any * whHits()} 隻地鼠！` : mode === "frog" ? `青蛙過了 ${any} 條河！` : `完成 ${any} 題！`;
function showResult() {
  clearIdle(); locked = false; lsSet(K("resume"), null); document.querySelectorAll("#result .rw-strip, #result > .pz-note").forEach(x => x.remove()); $("result").style.paddingTop = "";   // pz-note：同樂廣場小字（10-12）；paddingTop：上一次獎勵膠囊讓出的空間
  voicePreload([`拿到 ${earned.length} 張新貼紙！`]);
  const n = MODES[mode].rounds, first = results.slice(0, n), golds = first.filter(r => r === "gold").length, any = first.filter(Boolean).length;   // 星星只算第一次作答（再試一次的題不算）
  const L = LV_MODES.includes(mode) ? lvNow : 0;      // v6 難度等級（泡泡、配送站、偵探各有自己的關卡，不走這套）
  roundStars = mode === "match" ? (mq?.stars || 2) : mode === "bubble" ? (bubbleRun?.stars || 2) : mode === "deliver" ? (deliverRun?.stars || 2) : mode === "detective" ? Math.min(3, Math.max(1, detectiveRun?.stars || 2)) : lvStars(golds, n, L);
  const lvr = L ? lvAfter(mode, L, roundStars) : null;   // 升級、暖身建議、高等級加碼、防刷星
  const prevBest = save.best[mode] || 0, record = lvr ? lvr.prevSt > 0 && roundStars > lvr.prevSt : prevBest > 0 && roundStars > prevBest;   // 個人紀錄（B14）：第一次玩沒有紀錄可破；有等級的遊戲＝跟同一級比
  if (roundStars > prevBest) save.best[mode] = roundStars;
  const jarAdd = lvr ? lvr.jar : roundStars;           // 星星罐這次放幾顆（暖身局最多 1、高等級 3 星加碼）
  const jarFrom = RW.jarLeft(save.rw, save.stars);
  save.stars += jarAdd; statsStars(mode, roundStars);   // 玩了什麼：這個遊戲累計星星（記表現，不是罐子）
  pzAdd("star", jarAdd); const pzGain = PZ(() => plaza.roundGain()); PZ(() => plaza.flushSoon(2500));   // 同樂廣場：收集週＝結算拿到的星星；這一局幫了多少（左上小字）；演出完合併送出
  const rwGain = { coins: RW.creditJar(save.rw, save.stars), stamp: RW.stampToday(save.rw, today()), cats: RW.categoryBonus(save.rw, CATS.map(c => ({ id: c.id, words: WORDS.filter(w => w.c === c.id).map(w => w.h) })), save.stickers), treats: roundTreats, fed: RW.feed(save.rw, roundTreats),
    tickets: topsCredit(jarAdd) };                     // 10-12 陀螺券：這次的星星也存進陀螺的 starsBank（跟星星罐分開算，不扣罐子）
  rwGain.evo = PZ(() => evoAfterRound(L, roundStars, lvr, roundTreats)) || null;   // v7 進化能量：第 3 級以上 3 星、每天第一次餵點心（只加給超級的夥伴）
  persist();
  const st = rs = { tok: navToken, T: [], fly: [], done: false, said: false, record, stamped: false, jarFrom, t0: performance.now(), k: earned.length, rw: rwGain, lv: lvr };
  st.pz = pzGain || null;                              // 同樂廣場：{ n, key, unit } 或 null（沒幫到／關掉／從沒連上過）
  const at = (ms, fn) => st.T.push(setTimeout(() => { if (rs === st && !st.done && st.tok === navToken) fn(); }, ms));
  showScreen("result"); play("party");                  // 結算 jingle：走 sfx bus，播的那幾秒音樂自動壓低
  $("resultCf").innerHTML = ""; confetti(45, $("resultCf"));
  $("resultText").textContent = RESULT_TEXT(any);
  // 星星：三格先放灰星，拿到的 0.5／0.9／1.3 秒蓋章，各配 Do-Mi-So；第 3 顆大爆＋整頁輕震
  const starsEl = $("resultStars"); starsEl.innerHTML = ""; starsEl.classList.remove("done");
  const stars = [0, 1, 2].map(i => { const s = el("span", "star" + (i < roundStars ? " on" : "")); s.style.setProperty("--d", (0.5 + i * 0.4) + "s"); starsEl.appendChild(s); return s; });
  for (let i = 0; i < roundStars; i++) at(500 + i * 400, () => { play("ok", [1, 1.26, 1.5][i]); burst(stars[i], i === 2 ? 20 : 8); if (i === 2) quake(); });
  if (record) at(1750, () => stampRecord(st));
  // 貼紙：1.8 秒起每 0.45 秒一張、一張比一張高 2 個半音；最後一張後 0.3 秒唸「拿到 N 張」
  const box = $("resultStickers"); box.innerHTML = ""; box.classList.remove("done"); box.classList.toggle("many", st.k > 6); $("result").classList.toggle("many", st.k > 6);   // 很多新貼紙：貼紙、星星縮小（css）
  earned.forEach((w, i) => { const s = stickerNode(w, true); s.style.animationDelay = (1.8 + i * 0.45) + "s"; box.appendChild(s); at(1800 + i * 450, () => play("sticker", 2 ** (2 * i / 12))); });
  const tVoice = st.k ? 1800 + (st.k - 1) * 450 + 300 : 1800;
  at(tVoice, () => resultVoice(st));
  if (!st.k) at(1800, () => showPracticed(st));
  // 星星罐：右下常駐，先顯示加星前的數字；星星飛進去時一格一格跳
  const jarBtn = $("hatchHint"); paintJar(jarBtn, jarFrom); jarBtn.classList.remove("ready");
  const tFly = Math.max(tVoice + 400, 2400);
  const flyFrom = [...stars.slice(0, Math.min(jarAdd, roundStars)), ...Array(Math.max(0, jarAdd - roundStars)).fill(stars[2])];   // 加碼的星星從第 3 顆飛出去；暖身局只飛 1 顆
  at(tFly, () => flyStarsToJar(st, flyFrom));
  at(tFly + Math.max(0, flyFrom.length - 1) * 150 + 800, () => finishResult(st, false));
  PZ(() => lvResultReset(st));                         // v6：暖身鈕先收起來（finishResult 才決定要不要出現）
  $("resultBtns").classList.add("wait");
  $("againBtn").textContent = mode === "bubble" && bubbleRun && bubbleRun.level < BUBBLE_N - 1 ? "▶️ 下一關"
    : mode === "deliver" ? (deliverRun && deliverRun.task < DELIVER_TASKS - 1 ? "▶️ 下一關" : "🚚 選關") : "🔁 再玩";   // 配送站最後一關過了：改成打開選關
}
function quake() {                                    // 整頁輕震 0.2 秒（放大一點點再震，邊緣不會露出底色）
  try { $("result").animate([{ transform: "none" }, { transform: "scale(1.025) translate(-0.7vmin, 0.4vmin)" }, { transform: "scale(1.02) translate(0.6vmin, -0.4vmin)" }, { transform: "scale(1.01) translate(-0.3vmin, 0.2vmin)" }, { transform: "none" }], { duration: 200 }); } catch (e) {}
}
function stampRecord(st) { if (st.stamped) return; st.stamped = true; $("resultStars").appendChild(el("div", "rec-stamp", "新紀錄！")); play("win"); }
function resultVoice(st) {
  if (st.said) return; st.said = true;
  if (mode === "bubble") talk(BUBBLE_WIN_TALK[bubbleZoneOf(bubbleRun?.level || 0)] || BUBBLE_WIN_TALK[0]); else if (mode === "deliver" && !st.k) talk(DELIVER_WIN_TALK); else if (mode === "detective") talk(detectiveWinTalk || "全部找到了，你是厲害的小偵探！"); else if (st.k) talk(`拿到 ${st.k} 張新貼紙！`); else talk(practicedWords().every(w => save.stickers[w.h]) ? "都收集過了，好厲害！" : "下次直接答對，就能拿到新貼紙喔！");
  PZ(() => lvResultVoice(st));                         // v6：開了新的一級／建議回上一級暖身（排在後面唸）
}
// ---------- v6 結算：開新一級的畫面、暖身鈕、加碼 ----------
function lvResultVoice(st) {
  const r = st.lv; if (!r) return;
  if (r.up) { queueTalk(LV_SAY[r.up]); queueTalk(LV_NEW[mode][r.up]); if (r.up === 3 && LVP[mode].hg) queueTalk(HG_TIP); }
  else if (r.warm) queueTalk(LV_WARM[r.warm]);
}
function lvResultReset(st) { const b = $("lvWarmBtn"); if (b) b.classList.add("hidden"); $("resultAlbumBtn").classList.remove("hidden"); const o = $("lvUp"); if (o) o.classList.add("hidden"); }
// 結算演完（或快轉）：開了新的一級＝跳出「🎉 第 N 級打開了！」卡（點一下關掉）；連 2 次 1 星＝結算按鈕多一顆「回第 N 級暖身」（不強迫）
function lvResultShow(st) {
  const r = st.lv; if (!r || st.lvShown) return; st.lvShown = true;
  if (r.warm) {
    let b = $("lvWarmBtn"); if (!b) { b = el("button", "big-btn alt lv-warm"); b.id = "lvWarmBtn"; $("resultBtns").insertBefore(b, $("againBtn").nextSibling); }
    b.textContent = `⬇️ 回第 ${r.warm} 級`; b.classList.remove("hidden"); $("resultAlbumBtn").classList.add("hidden");   // 暖身鈕暫時取代「📒 貼紙」（一排還是三顆，不會擠到右下的星星罐）
    b.onclick = () => { const rec = lvRec(mode); play("select"); if (rec) { rec.cur = Math.min(rec.max, r.warm); lvSave(); } startMode(mode); };
  }
  if (!r.up) return;
  let ov = $("lvUp");
  if (!ov) { ov = el("div", "overlay lv-up hidden"); ov.id = "lvUp"; $("result").appendChild(ov); ov.addEventListener("pointerdown", e => { e.stopPropagation(); ov.classList.add("hidden"); play("tap"); }); }
  ov.innerHTML = ""; const d = el("div", "dialog lv-box");
  d.appendChild(lvBadge(r.up, "big")); d.appendChild(el("div", "lv-t", `🎉 第 ${r.up} 級打開了！`)); d.appendChild(el("div", "lv-s", LV_NEW[mode][r.up])); d.appendChild(el("button", "big-btn lv-ok", "好！"));
  ov.appendChild(d); ov.classList.remove("hidden"); play("unlock"); PZ(() => confetti(30, ov));
}
// 這回合練過的詞（貼紙詞庫裡有的、不重複）
function practicedWords() { const ws = mode === "match" ? (mq?.words || []) : mode === "bubble" || mode === "detective" ? [] : mode === "deliver" ? (deliverRun?.orders || []).map(o => WORDS.find(w => w.h === o.word)) : round.map(q => q.word); return [...new Map(ws.filter(w => w && !PHRASES.includes(w)).map(w => [w.h, w])).values()]; }
function showPracticed(st) {                           // 沒有新貼紙：列出練過的詞（小貼紙、不 slap）＋一句話
  const box = $("resultStickers"); if (st.shownPracticed) return; st.shownPracticed = true;
  if (mode === "bubble") { box.appendChild(el("div", "all-done", `第 ${(bubbleRun?.level || 0) + 1} 關過關！`)); return; }
  if (mode === "detective") {                          // 偵探：沒有貼紙詞，改說一次就聽對幾句（只顯示、不唸）
    const f = detectiveRun?.firstTry || 0, n = detectiveRun?.total || 0;
    box.appendChild(el("div", "all-done", n && f >= n ? "每一句都一次就聽對！" : f > 0 ? `一次就聽對 ${f} 句！` : "多聽幾次就找到了，好棒！")); return;
  }
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
    an.onfinish = () => { f.remove(); if (st.done || rs !== st) return; paintJar(jarBtn, st.jarFrom + j + 1); const t = jarBtn.querySelector(".jarText"); t.classList.remove("tick"); void t.offsetWidth; t.classList.add("tick"); play("star", 2 ** (2 * j / 12)); };   // 星星進罐：一顆比一顆高一個全音
  }, j * 150)));
}
// 收尾（自動演完或快轉）：所有東西直接到最後的樣子，按鈕淡入
function finishResult(st, skipped) {
  if (st.done) return; st.done = true; st.T.forEach(clearTimeout); st.fly.forEach(f => f.remove());
  $("resultStars").classList.add("done"); $("resultStickers").classList.add("done");
  if (!st.k) showPracticed(st);
  if (st.record) stampRecord(st);
  if (!st.said) resultVoice(st);
  updateJar(); PZ(() => rewardStrip(st)); PZ(() => lvResultShow(st));   // v6：新的一級打開了／暖身鈕
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
  if (prize.amount) PZ(() => { prize.evo = RW.evoFeedDay(save.rw, today()); });   // v7：點心包／重複寵物換點心也算「今天第一次餵點心」（進化能量 +5）
  gachaBusy = true; if (!persist()) guideSay("存檔空間滿了，請爸媽到家長設定看一下喔！", false); renderGacha(); play("select");
  try { await gachaShow(prize); } catch (e) { console.warn("[gacha]", e); }
  finally { gachaBusy = false; persist(); renderGacha(); updateJar(); if (hub) { hub.setPets(hubPets()); hub.setDecor(hubDecor()); } PZ(evoSync); }
}
async function gachaShow(prize) {
  const m = $("gachaMachine"), cap = $("gachaCap"), box = $("gachaPrize"); box.classList.add("hidden"); box.innerHTML = "";
  m.classList.remove("spin"); void m.offsetWidth; m.classList.add("spin");
  play("gacha_crank");                                 // 轉把手（約 1.4 秒）
  await new Promise(r => setTimeout(r, 1150));
  cap.src = `IMAGE/zhuyin/${CAPSULE[prize.tier]}.webp`; cap.className = "gacha-cap drop " + prize.tier; play("pop", prize.tier === "ssr" ? 1.4 : 1);
  if (prize.tier === "ssr") { play("sticker"); PZ(() => fxFlash()); }
  $("gachaTip").textContent = "點一下膠囊打開！";
  await new Promise(r => { cap.onclick = () => { cap.onclick = null; r(); }; setTimeout(() => { if (cap.onclick) { cap.onclick = null; r(); } }, 6000); });
  cap.classList.add("open"); play("capsule_open"); $("gachaTip").textContent = "";
  await new Promise(r => setTimeout(r, 380));
  cap.className = "gacha-cap hidden";
  if (prize.kind === "pet" && !prize.dup) {
    const p = RW.PET[prize.id]; $("gacha").classList.add("hidden");
    await playHatchShow(`IMAGE/zhuyin/pets/${p.id}.webp`, p.name, { taps: 3, line: p.name + "來了！", egg: prize.tier });
    $("gacha").classList.remove("hidden"); showPrize(prize.tier === "ssr" ? "🌈 超稀有！" : "💜 稀有！", `${p.name}來小島了！`, `IMAGE/zhuyin/pets/${p.id}.webp`);
  } else if (prize.kind === "pet") { showPrize("🍪 點心 +" + prize.amount, `已經有${RW.PET[prize.id].name}了，換成點心！`, `IMAGE/zhuyin/pets/${prize.id}.webp`); talk("換成點心囉！"); }
  else if (prize.kind === "decor") { const d = RW.DECOR.find(x => x.id === prize.id); showPrize(d.e + " " + d.name, "放到小島上了！"); talk("小島多了一個新裝飾！"); }
  else if (prize.kind === "wear" && RW.WEAR_BY_ID[prize.id]) { play("wear"); showPrize(RW.WEAR_BY_ID[prize.id].name, RW.wearGotLine(prize.id), `IMAGE/zhuyin/wear_${prize.id}.webp`); talk(RW.wearGotLine(prize.id)); }   // 10-12 寵物配件（普通獎）
  else { showPrize("🍪 點心 +" + prize.amount, "點心會餵給你的夥伴，讓牠長大！"); talk("拿到點心了！"); }
  if (prize.grew) { const p = RW.PET[save.rw.partner]; queueTalk(`${p.name}${prize.grew === 3 ? "變成超級" : "長大"}了！`); }
  if (prize.evo && prize.evo.full && RW.PET[prize.evo.id]) queueTalk(`${RW.PET[prize.evo.id].name}好像要進化了！`);   // v7：點心讓夥伴的進化能量剛好集滿
}
function showPrize(title, sub, img) {
  const box = $("gachaPrize"); box.innerHTML = "";
  if (img) { const i = el("img", "gp-img"); i.src = img; i.alt = ""; box.appendChild(i); }
  box.appendChild(el("div", "gp-t", title)); box.appendChild(el("div", "gp-s", sub)); box.classList.remove("hidden");
}
// 結算畫面最下面一行：點心、集章卡、扭蛋幣、夥伴長大
function rewardStrip(st) {
  if (!st.rw || st.rwShown) return; st.rwShown = true;
  const g = st.rw, box = el("div", "rw-strip"), add = t => box.appendChild(el("span", "rw-pill", t));   // rw-pill：一行一顆膠囊（裡面的國字會被自動注音包成 span.ac，CSS 只認 .rw-pill）
  if (g.coins || g.cats.length || (g.stamp.stamped && g.stamp.gold)) play("coin");   // 拿到扭蛋幣／金幣
  if (g.treats) add(`🍪 點心 +${g.treats}`);
  if (st.lv && st.lv.bonus) add(`🏅 第 ${st.lv.L} 級加碼 ⭐+${st.lv.bonus}`);   // v6：高等級 3 星多放星星罐
  if (st.lv && st.lv.low) add("🏃 暖身局 ⭐+1");       // v6：比最高級低 2 級以上＝暖身，星星罐只放 1 顆
  if (g.stamp.stamped) add(g.stamp.gold ? "📅 集章卡集滿！🌟 金幣 +1" : `📅 集章 ${save.rw.stamps}/7`);
  if (g.coins) add(`🪙 扭蛋幣 +${g.coins}`);
  if (g.cats.length) add(`🎉 ${g.cats.map(id => CATS.find(c => c.id === id)?.label).join("、")}貼紙集滿！🪙 +${g.cats.length}`);
  if (g.fed.grew) { const p = RW.PET[save.rw.partner]; add(`✨ ${p.name}${g.fed.grew === 3 ? "變成超級" : "長大"}了！`); setTimeout(() => { if (rs === st) talk(`${p.name}${g.fed.grew === 3 ? "變成超級" : "長大"}了！`); }, 1200); }
  if (g.tickets && stickerCount() >= MODES.tops.need) { add(`🎟️ 陀螺券 +${g.tickets}`); setTimeout(() => { if (rs === st) queueTalk("拿到一張陀螺券了！"); }, 1600); }   // 10-12 陀螺券（陀螺競技場開了才提：還沒開的先默默存著）
  if (g.evo && g.evo.got) add(`💫 進化能量 +${g.evo.got}`);   // v7 寵物進化：能量只給超級的夥伴；集滿＝回小島點牠看進化
  if (g.evo && g.evo.full && RW.PET[g.evo.id]) { const nm = RW.PET[g.evo.id].name; add(`🌟 ${nm}要進化了！`); setTimeout(() => { if (rs === st) queueTalk(`${nm}好像要進化了！`); }, 2000); }
  if (st.pz) {   // 10-12 同樂廣場：左下角小字（不跳出、不打斷；css/zhuyin-plaza.css）；寬度到右下星星罐左邊為止
    document.querySelectorAll("#result > .pz-note").forEach(x => x.remove());
    const nt = el("div", "pz-note", `🎪 ＋${st.pz.n} 已經算進大家的進度囉！`), jr = $("hatchHint").getBoundingClientRect();
    if (jr.width) nt.style.maxWidth = Math.min(pzVm() * 46, Math.max(pzVm() * 30, jr.left - pzVm() * 6)) + "px";
    $("result").appendChild(nt);
  }
  document.querySelectorAll("#result .rw-strip").forEach(x => x.remove());
  if (box.children.length) {                           // 放在最上面一排（🏠🎵 右邊；不推擠中間的星星、貼紙、按鈕）
    $("result").appendChild(box); PZ(fitRewardStrip);
  }
}
// 獎勵膠囊（最上面一排）多到換第二排、碰到標題：#result 上方留白，整塊內容往下挪（內容是置中的，留白要給兩倍）；轉向時重算
function fitRewardStrip() {
  const r = $("result"), box = r.querySelector(".rw-strip"); r.style.paddingTop = ""; if (!box || r.classList.contains("hidden")) return;
  const b = box.getBoundingClientRect().bottom + pzVm() * 1.5, t = $("resultText").getBoundingClientRect().top;
  if (b > t) r.style.paddingTop = Math.ceil((b - t) * 2 + (parseFloat(getComputedStyle(r).paddingTop) || 0)) + "px";
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
      play("hatch"); confetti(40); talk(line || name + "來了！");
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
  $("dressBtn").classList.toggle("hidden", cat !== "pets");   // 「👗 換裝」只在動物朋友分頁
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
    const have = save.rw.pets[p.id], evo = !!have && RW.isEvo(save.rw, p.id), card = el("button", "pet-card " + p.tier + (have ? "" : " none") + (save.rw.partner === p.id ? " partner" : "") + (evo ? " evo" : ""));
    if (evo) { card.appendChild(el("div", "pc-aura")); card.appendChild(evoBadge()); }   // v7 進化型：圖後面一圈光、左上角星星徽記（css/zhuyin.css「寵物進化」段）
    const i = el("img", "pc-img"); i.src = `IMAGE/zhuyin/pets/${p.id}.webp`; i.alt = ""; i.loading = "lazy"; card.appendChild(i);
    if (have) {
      const nm = evo ? RW.evoName(p.id) : p.name;
      card.appendChild(el("div", "pc-n" + (nm.length >= 5 ? " long" : ""), nm));
      card.appendChild(el("div", "pc-s", (evo ? "進化" : ["", "寶寶", "長大", "超級"][have.stage]) + (save.rw.partner === p.id ? "・夥伴" : "")));
      const left = RW.toNextStage(have); if (save.rw.partner === p.id && left) card.appendChild(el("div", "pc-s", `再 ${left} 個🍪${have.stage === 1 ? "長大" : "變超級"}`));
      if (!evo && have.stage >= 3 && (save.rw.partner === p.id || RW.evoEnergy(save.rw, p.id) > 0)) card.appendChild(evoBar(p.id));   // v7 進化能量條（夥伴才會集；換掉的夥伴留著原本的能量）
      card.onclick = () => { play("select"); save.rw.partner = p.id; persist(); say(p.name); openAlbum("pets"); };
      const dr = el("span", "pc-dress", "👗"); dr.setAttribute("role", "button"); dr.setAttribute("aria-label", "換裝");   // 右上角小 👗：直接幫這隻換裝（不改夥伴）
      dr.onclick = e => { e.stopPropagation(); play("select"); openDress(p.id, "album"); }; card.appendChild(dr);
    } else { card.appendChild(el("div", "pc-n", "？")); card.disabled = true; }
    grid.appendChild(card);
  }
}

// ---------- 寵物進化（v7，docs/zhuyin-v7-plan.md §2；2026-10-13）----------
// 能量（數值＝js/zhuyin-rewards.js 的 EVO_GAIN，只給「已經超級、還沒進化」的夥伴）：第 3 級以上拿 3 星 +10、每天第一次餵點心 +5（結算 evoAfterRound／扭蛋點心包 spinGacha）、
//   爬塔第一次到新樓層每層 +2、第一次打倒守塔怪 +40（towerApi 的 store／give → evoTowerStore／towerGive）。
// 能量滿 → 回小島：選單「✨ 進化！」膠囊（#evoBtn，卡片選單也有）＋3D 小島那隻頭上的 ✨（hubPets 的 ready）＋貓頭鷹「XX好像要進化了！」（evoMenu）。
// 點了＝startEvolve：只在小島選單或圖鑑（遊戲中、爬塔中不演）。演出＝js/zhuyin-evolve.js（第一次完整、之後點一下跳過；減少動態＝不轉不震）。
// 音樂：進化曲 evolve（manifest bgm、loop:false＝一次性，走 A.sfx 播；跳過／結束 A.stopSfx 淡出 1 秒）；原本的背景音樂先停、演完放回原本那首（A.debug().want）。
// 介面副作用：不呼叫 nav()／goMenu()、不換 .screen、不清 gLater；演出蓋住全黑後 hub.hide()（3D 小島停止渲染），演完 hub.resume()（留在原本那座島）；
//   從圖鑑點的：演完重畫圖鑑（openAlbum("pets")，它自己會 nav()）。進化在演出「開始前」就存檔（中途關掉頁面也不會白集）。
let evoBusy = false, evoModP = null, evoHintAt = 0;
const EVO_SOUNDS = ["evolve", "ev_charge", "ev_burst", "ev_sparkle"];
const evoReduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
function importEvolve() { return evoModP || (evoModP = import("./zhuyin-evolve.js?v=1").catch(e => { evoModP = null; throw e; })); }
// 結算這一局給的進化能量（showResult 呼叫）→ { got 加了幾點, full 剛好集滿, id 夥伴 }
function evoAfterRound(L, stars, lvr, treats) {
  const got = [];
  if (L >= 3 && stars >= 3 && lvr && !lvr.low) got.push(RW.evoAdd(save.rw, RW.EVO_GAIN.star3));   // 暖身局（比最高級低 2 級以上）不算
  if (treats > 0) got.push(RW.evoFeedDay(save.rw, today()));
  return { got: got.reduce((s, r) => s + r.got, 0), full: got.some(r => r.full), id: save.rw.partner };
}
function evoBadge(cls = "") { const b = el("span", "evo-badge" + (cls ? " " + cls : "")); b.appendChild(el("i")); return b; }   // 進化徽記：金色星星（css 畫）
// 圖鑑卡片的進化能量條：條＋右邊「進化後的剪影」（發光的黑影＋小星星＝目標）；集滿＝「✨ 進化！」點了直接看演出（不換夥伴）
function evoBar(id) {
  const n = RW.evoEnergy(save.rw, id), full = n >= RW.EVO_MAX, row = el("div", "pc-evo" + (full ? " full" : ""));
  const bar = el("div", "pc-evo-bar"), fill = el("i"); fill.style.width = Math.round(Math.min(1, n / RW.EVO_MAX) * 100) + "%"; bar.appendChild(fill);
  bar.appendChild(el("b", "", full ? "✨ 進化！" : `💫 ${n}/${RW.EVO_MAX}`));
  const goal = el("span", "pc-evo-goal"), gi = el("img"); gi.src = `IMAGE/zhuyin/pets/${id}.webp`; gi.alt = ""; gi.loading = "lazy"; goal.append(gi, evoBadge("mini"));
  row.append(bar, goal);
  if (full) { row.setAttribute("role", "button"); row.onclick = e => { e.stopPropagation(); startEvolve(id); }; }
  return row;
}
// 選單的「✨ 進化！」膠囊：能量滿的那隻（夥伴優先）；沒有就藏起來。有的話先抓演出模組與音效（點下去不用等）。回傳那隻的 id 或 null
function evoSync() {
  const b = $("evoBtn"); if (!b) return null;
  const ids = RW.evoReadyList(save.rw), id = ids.includes(save.rw.partner) ? save.rw.partner : ids[0] || null;
  b.classList.toggle("hidden", !id); if (!id) return null;
  if (b.dataset.pet !== id) { b.dataset.pet = id; const im = b.querySelector("img"); if (im) im.src = `IMAGE/zhuyin/pets/${id}.webp`; }
  importEvolve().catch(() => {}); PZ(() => A.preloadSfx(EVO_SOUNDS).catch(() => {}));
  return id;
}
// 回小島（renderMenu）：膠囊＋貓頭鷹提醒「XX好像要進化了！」（排在天氣那句後面；45 秒內講過就不再講，renderMenu 很多地方會叫）
let evoHintPend = false;
function evoMenu() {
  const id = evoSync(); if (!id || mode || evoBusy || evoHintPend || (evoHintAt && performance.now() - evoHintAt < 45000)) return;
  evoHintPend = true; let tries = 0;
  const go = () => {
    if (mode || evoBusy || $("menu").classList.contains("hidden") || !RW.evoIsReady(save.rw, id)) { evoHintPend = false; return; }
    if (document.body.classList.contains("gate-on") || talking()) { if (++tries < 60) setTimeout(go, 1000); else evoHintPend = false; return; }   // 開始畫面還在／貓頭鷹在講別的（開場招呼、天氣）：等講完再說
    evoHintPend = false; evoHintAt = performance.now();
    const t = `${RW.PET[id].name}好像要進化了！`; guideSay(t, false); queueTalk(t);
  };
  setTimeout(go, 900);
}
// 家長設定「扭蛋機」段：進化規則（從 RW.EVO_GAIN 產生，不寫死）＋目前狀況
function evoParentText() {
  const G = RW.EVO_GAIN, p = save.rw.partner, done = (save.rw.evo && save.rw.evo.done) || [], pn = RW.PET[p] ? RW.PET[p].name : p;
  const now = RW.isEvo(save.rw, p) ? `目前的夥伴：${RW.evoName(p)}（已進化）。` : RW.canCharge(save.rw, p) ? `目前的夥伴${pn}：進化能量 ${RW.evoEnergy(save.rw, p)}/${RW.EVO_MAX}。` : `目前的夥伴${pn}還沒變超級（變超級之後才開始集進化能量）。`;
  return [`🌟 寵物進化：夥伴變成超級之後，集滿進化能量 ${RW.EVO_MAX} 就能進化成「閃耀＋名字」（第 3 級以上拿 3 星 +${G.star3}，暖身局不算；每天第一次餵點心 +${G.feedDay}；挑戰燈塔第一次到新樓層每層 +${G.floor}；第一次打贏守塔怪 +${G.boss}）。能量滿了回小島點牠看進化，進化不會退回去。`,
    now + (done.length ? `已進化：${done.map(id => RW.evoName(id)).join("、")}。` : "")];
}
// 看進化演出（小島的 ✨／選單膠囊／圖鑑的「✨ 進化！」）。回傳 Promise<是否演了>
async function startEvolve(id) {
  const scr = [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden")), where = scr ? scr.id : "";
  if (evoBusy || tower || (where !== "menu" && where !== "album") || !RW.evoIsReady(save.rw, id)) return false;   // 不在遊戲中途／爬塔中打斷
  evoBusy = true;
  const p = RW.PET[id], sup = RW.evoName(id), canSkip = !!(save.rw.evo && save.rw.evo.seen), tok = navToken;
  let hidHub = false;
  const bgmWas = PZ(() => A.debug().want) || null;     // 演完放回原本的音樂（選單＝島的音樂；圖鑑＝原本在放的那首）
  play("select"); stopSpeech(); A.stopBgm({ fade: 0.8 });
  RW.evolve(save.rw, id); persist();                    // 先存：演出中關掉頁面也已經進化
  try {
    let mod = null; try { mod = await importEvolve(); } catch (e) { console.warn("[evolve] 演出模組載入失敗，直接進化", e); }
    if (mod) {
      const ready = A.preloadSfx(EVO_SOUNDS, { low: false }).catch(() => null);
      await mod.playEvolve({ img: `IMAGE/zhuyin/pets/${id}.webp`, callText: `${p.name}進化——`, revealText: `${sup}！`, okText: "🎉 太棒了", canSkip, reduce: evoReduce(), ready,
        sfx: (n, r) => play(n, r || 1), say: t => talk(t), confetti: host => confetti(40, host),
        music: on => { if (!on) A.stopSfx("evolve", { fade: 1 }); else if (save.music) A.sfx("evolve", { gain: 0.7 }); },   // 背景音樂關著＝不放進化曲（音效照放）；停＝1 秒淡出（跳過、按太棒了）
        onDark: () => { if (where === "menu" && hub && tok === navToken) { hub.hide(); hidHub = true; } } });
    } else { confetti(40); talk(`${sup}！`); }
    save.rw.evo.seen = 1;                                // 看過一次完整的 → 之後可以跳過
  } catch (e) { console.warn("[evolve]", e); }
  finally {
    PZ(() => A.stopSfx("evolve", { fade: 1 })); persist(); evoBusy = false;
    if (tok === navToken) {
      if (bgmWas) playBgm(bgmWas);
      if (where === "menu" && !mode) { if (hub) { if (hidHub) hub.resume(); hub.setPets(hubPets()); } PZ(evoSync); updateJar(); }
      else if (!$("album").classList.contains("hidden")) openAlbum("pets");
    }
  }
  return true;
}
{ const b = $("evoBtn"); if (b) b.onclick = () => { const id = b.dataset.pet; if (id) startEvolve(id); }; }
if (location.search.includes("debug")) window.__zyEvo = Object.assign(window.__zyEvo || {}, { start: id => startEvolve(id), sync: () => evoSync(), towerStore: t => evoTowerStore(t), towerGive: g => towerGive(g), get busy() { return evoBusy; } });   // 測試用（tools/zy-test/evolve.js）：towerStore／towerGive＝爬塔存檔／給獎勵的接點

// ---------- 寵物換裝（js/zhuyin-dress.js，10-12；docs/zhuyin-v5-plan.md §3）----------
// 入口：彩虹島「寵物服裝店」（hub3d opts.onDress）、圖鑑「🐣 動物朋友」的「👗 換裝」大鈕（開目前的夥伴）與每張卡右上角的 👗（開那一隻）。
// 開著的時候：3D 小島停止渲染（showScreen 呼叫 hub.hide）、放換裝音樂；「穿好了」關掉 → 回原本的畫面（小島留在剛剛那座島）＋原本的音樂，小島上的寵物換上新衣服。
// （dressMod／dressUI／dressFrom 宣告在「3D 選單小島」段 let hub 旁邊：showScreen、天氣、日夜都會看 dressFrom）
function importDress() {
  if (dressMod) return dressMod;
  const url = "./zhuyin-dress.js?v=2";                 // 要 three（importmap）；舊 iPad 沒有 importmap → 跟 3D 小島一樣走 es-module-shims（小島載入時已經補好）
  const p = window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap") ? import(url)
    : window.importShim ? window.importShim(new URL(url, import.meta.url).href) : Promise.reject(new Error("no importmap"));
  return (dressMod = p.catch(e => { dressMod = null; throw e; }));
}
const dressPets = () => RW.PETS.filter(p => save.rw.pets[p.id]).map(p => ({ id: p.id, name: p.name, stage: save.rw.pets[p.id].stage || 2 }));   // 寵物列：照圖鑑的順序
async function openDress(petId, from) {
  if (dressFrom || mode) return;                       // 已經開著／遊戲中不開
  const tok = nav();
  const slow = setTimeout(() => { if (tok === navToken) { loadingOwner = tok; showLoading(true); } }, 150);
  let m = null;
  try { m = await importDress(); } catch (e) { console.warn("[dress]", e); }
  clearTimeout(slow); if (loadingOwner === tok) { loadingOwner = 0; showLoading(false); }
  if (tok !== navToken || mode || dressFrom) return;  // 等的時候小孩點去別的地方了
  if (!m) { guideSay("服裝店現在打不開，等一下再試試看！", from === "menu"); return; }
  if (!dressUI) dressUI = m.createDress($("dress"), {
    say: t => say(t), talk: t => talk(t), play: (n, r) => play(n, r), later: gLater,
    rw: () => save.rw, save: () => { if (!persist()) guideSay("存檔空間滿了，請爸媽到家長設定看一下喔！", false); }, pets: dressPets,
    onClose: closeDressDone,
  });
  dressFrom = from || "menu";
  showScreen("dress");                                 // 選單／圖鑑收起來、3D 小島停止渲染、上方按鈕收起來
  playBgm("dress");
  dressUI.open(save.rw.pets[petId] ? petId : save.rw.partner);
  PZ(() => dressUI.relayout());
}
function closeDressDone() {                            // 「穿好了」→ 回原本的畫面與音樂
  const from = dressFrom; dressFrom = ""; if (!from) return;
  persist();
  if (from === "album") { openAlbum("pets"); playBgm(menuBgmKey()); return; }
  showScreen("menu", true); playBgm(menuBgmKey());     // 留在剛剛那座島（彩虹島服裝店進來的就回彩虹島）
  renderMenu();                                        // 跟從遊戲回來一樣更新選單；裡面的 hub.setPets(hubPets()) 讓小島上的寵物換上新衣服
}

// ---------- 小島同樂廣場（10-12；js/zhuyin-plaza.js；docs/zhuyin-plaza-spec.md）----------
// 全島合作目標：只送匿名加總 {週次, 種類, 數量}（家長頁可關）。事件掛勾：startMode＝play、correct()＝read（釣魚模式另記 fish）、
// 泡泡過關＝rescue（救出幾隻）、配送存檔＝deliver（送到幾件）、結算＝star（拿到幾顆星）；送哪一種由本週主題決定（模組處理）。
// 🎪 圓鈕 → 全畫面卡片；讀到本週大家做到第幾段 → 3D 小島慶祝裝飾（hub.celebrate）；換週／第一次看到新的一段 → 貓頭鷹說（遊戲中等回小島）
const plaza = createPlaza({ root: $("plaza"), say: t => say(t), talk: t => talk(t), queue: t => queueTalk(t), play: n => play(n), slot: () => slot,
  onMenu: () => !mode && !$("menu").classList.contains("hidden"), onUpdate: i => PZ(() => pzSync(i)), onClose: () => PZ(pzNews) });
const pzAdd = (k, n) => PZ(() => plaza.add(k, n));
let pzLv = -1;                                         // 3D 小島現在掛第幾段的慶祝裝飾
function pzSync(i = plaza.info()) {
  document.body.classList.toggle("plaza-off", !i.on);
  $("plazaBtn").classList.toggle("news", !!i.badge);   // 換週、新的一段還沒打開來看：🎪 小紅標
  if (hub && hub.celebrate && i.lv !== pzLv) { pzLv = i.lv; hub.celebrate(i.lv); }
  pzNews();
}
// 換週介紹主題、第一次看到新的一段（貓頭鷹「大家一起做到了！」＋小島連放煙火）：只在小島選單上說；遊戲中、換裝、彈窗開著先不拿（回小島 renderMenu 再說）
function pzNews() {
  if (mode || dressFrom || $("menu").classList.contains("hidden") || document.body.classList.contains("gate-on") || document.querySelector(".overlay:not(.hidden)")) return;
  const news = plaza.takeNews(); if (!news.length) return;
  for (const n of news) if (n.kind === "level") { if (hub && hub.celebrate) { pzLv = n.lv; hub.celebrate(n.lv, { fanfare: true }); } play("win"); }
  $("guideText").textContent = news[news.length - 1].text || news[news.length - 1].line;   // 對話框放短版（一句約兩行，不擋浮標）；改字＝貓頭鷹自動彈出來
  news.forEach((n, k) => setTimeout(() => { if (!mode) queueTalk(n.line); }, 700 + k * 50));   // 排隊：不切斷正在講的話（天氣／時段的那句先講）
}
// 🎪 放哪裡：橫式（或沒有 3D 的卡片選單）＝左下「貼紙／星星罐」那排第三顆；直式 3D 小島＝上面第二排（歸仁區／彩虹島右邊；左下那排已經滿了）
function placePlazaBtn() {
  const b = $("plazaBtn"), host = matchMedia("(orientation: portrait)").matches && document.body.classList.contains("hub3d") ? $("hudL") : document.querySelector("#menu > .menu-bottom");
  if (host && b.parentNode !== host) host.appendChild(b);
}
{ const mq = matchMedia("(orientation: portrait)"), f = () => PZ(placePlazaBtn); if (mq.addEventListener) mq.addEventListener("change", f); else if (mq.addListener) mq.addListener(f); }
function openPlaza() { if (!plaza.isOn()) return; play("select"); stopSpeech(); plaza.open(); }

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
  PZ(placePlazaBtn);                                   // 🎪（10-12 同樂廣場）先放好位置，3D 小島擺鏡頭才會避開它
  if (hub) { hub.refresh(); hub.setPets(hubPets()); hub.setDecor(hubDecor()); }   // 3D 小島跟著更新：鎖頭、鏡頭擺位、島上走的寵物、扭蛋抽到的裝飾
  PZ(() => { pzSync(); if (!document.body.classList.contains("gate-on")) plaza.refresh(); });   // 同樂廣場：慶祝裝飾、小紅標、遊戲中累積的新消息（貓頭鷹）；回小島順便讀一次（30 秒內讀過就不讀）
  PZ(evoMenu);                                         // v7 寵物進化：能量滿＝選單的「✨ 進化！」膠囊＋貓頭鷹提醒（小島上那隻頭上的 ✨ 由 hubPets 的 ready 帶過去）
}
let menuPrefetch = null;
function goMenu() {
  nav(); stopSpeech(); introUntil = 0;                 // 作廢所有等圖中的導覽、停掉還沒講完的語音
  mode = null; clearIdle(); locked = false; showScreen("menu"); playBgm(menuBgmKey()); renderMenu();   // 選單音樂看島＋日夜（主島／歸仁區／彩虹島／晚上）
  clearTimeout(menuPrefetch);                         // 選單停 2 秒 → 預抓上次玩的那關（第一次玩＝釣魚），星星罐快滿就預抓孵蛋
  menuPrefetch = setTimeout(() => { const lm = lsGet(K("last_mode"), "fish"); preload(lm); if (MODES[lm]) A.prefetchBgm(MODES[lm].bgm); if (save.rw.coins + save.rw.gold > 0 || RW.jarLeft(save.rw, save.stars) >= EGG_STARS - 3) { preload("gacha"); preload("hatch"); } }, 2000);
}
function askHome() {                                  // 遊戲中按 🏠：休息選單（繼續／重新開始／回小島），左上是拇指位置，誤觸率高
  if (!mode || $("menu").classList.contains("hidden") === false) { goMenu(); return; }
  clearIdle(); gPause(); confirmLabels(!!tower || !!bubbleBoss); $("confirm").classList.remove("hidden"); talk("暫停");   // 爬塔一層（playFloor）或泡泡守塔怪：繼續／離開挑戰
}
// 暫停選單的字：爬塔局＝「繼續／離開挑戰」（沒有重新開始）；一般＝「繼續玩／重新開始／回小島」
function confirmLabels(tw) {
  $("confirmNo").textContent = tw ? "▶️ 繼續" : "▶️ 繼續玩"; $("confirmYes").textContent = tw ? "🚪 離開挑戰" : "🏝️ 回小島";
  $("confirmRestart").classList.toggle("hidden", tw);
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
// 翻牌：v6 起張數改由難度等級決定（Lv1–5＝8/12/16/20/24 張，LVP.match.pairs），原本的「選張數」畫面（#matchPick）不再打開；save.matchSize 只留著給舊備份碼

// ---------- 綁定 ----------
for (const b of document.querySelectorAll(".mode-card")) {
  b.addEventListener("pointerdown", () => preload(b.dataset.mode));   // 手指一碰就開始抓，放開時多半已經好了
  b.onclick = () => { play("select"); const m = b.dataset.mode; if (m === "bubble" && stickerCount() >= MODES.bubble.need && save.bubble.lv > 0) openBubblePick();   // 翻牌：v6 起直接開始（張數＝等級）
    else if (m === "deliver" && stickerCount() >= MODES.deliver.need && save.deliver.lv > 0) openDeliverPick();   // 配送站：過過第 1 關就先選關
    else {   // 陀螺：沒券也照樣進去（10-12 櫻木：打好的句子存成陀螺蛋，拿到券再孵；模組自己顯示集點卡）
      if (m === "bubble") bubbleLevel = Math.min(BUBBLE_N - 1, save.bubble.lv); if (m === "deliver") deliverLevel = save.deliver.lv; startMode(m); } };
}
$("homeBtn").onclick = () => { if ($("album").classList.contains("hidden") === false || $("result").classList.contains("hidden") === false) goMenu(); else askHome(); };
$("confirmYes").onclick = () => { $("confirm").classList.add("hidden"); if (tower) { towerEnd(tower, true); return; } goMenu(); };   // 爬塔局：離開挑戰＝abort
$("confirmNo").onclick = () => { $("confirm").classList.add("hidden"); gResume(); armIdle(); };
$("confirmRestart").onclick = () => { $("confirm").classList.add("hidden"); gResume(); play("select"); lsSet(K("resume"), null); startMode(mode); };
$("resumeBtn").onclick = () => { const r = getResume(); if (!r) return; play("select"); if (r.mode === "match") startMode("match"); else startMode(r.mode, r); };
$("playerBtn").onclick = () => { play("select"); openPlayers(); };
$("playerTag").onclick = () => { play("select"); openPlayers(); };
$("townBtn").onclick = $("townTag").onclick = () => goIsle("town");
$("rainbowBtn").onclick = $("rainbowTag").onclick = () => goIsle("rainbow");   // 10-12 彩虹島
$("plazaBtn").onclick = openPlaza;                     // 10-12 小島同樂廣場
$("matchPickClose").onclick = () => { play("select"); $("matchPick").classList.add("hidden"); };
$("bubblePickClose").onclick = () => { play("select"); $("bubblePick").classList.add("hidden"); };
$("deliverPickClose").onclick = () => { play("select"); $("deliverPick").classList.add("hidden"); };
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
  for (const b of document.querySelectorAll("#plazaOpts button")) b.classList.toggle("on", +b.dataset.v === (plaza.isOn() ? 1 : 0));   // 同樂廣場開關（zy_plaza_on）
  renderMix(); renderStats();
  const odds = $("rwOdds"); if (odds) { odds.innerHTML = ""; for (const t of RW.oddsText()) odds.appendChild(el("div", "", t)); }   // 機率公開：跟 js/zhuyin-rewards.js 的 RATES／PITY／GACHA_WEAR 同一份資料產生
  $("rwStats").textContent = `扭蛋幣 ${save.rw.coins}、金幣 ${save.rw.gold}、點心 ${save.rw.treats}、動物朋友 ${Object.keys(save.rw.pets).length}/${RW.PETS.length}、抽過 ${save.rw.pulls} 次`;
  PZ(() => { const e = $("rwEvo"); if (e) { e.innerHTML = ""; for (const t of evoParentText()) e.appendChild(el("div", "", t)); } });   // v7 寵物進化：規則（從 RW.EVO_GAIN 產生）＋目前的夥伴能量、已進化的
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
// 玩了什麼（目前這位，本機紀錄）：最近 7 天分鐘長條、每個遊戲次數／平均星星／最後一次、最常搞混的前 5 組（mix 只記符號，所以顯示注音不顯示國字）
function renderStats() {
  const st = save.stats, today = statsDay(), WD = ["日", "一", "二", "三", "四", "五", "六"];
  $("statsName").textContent = `${SLOTS[slot - 1].e} ${SLOTS[slot - 1].name}`;
  const days = ST.lastDays(st, 7, today), maxSec = Math.max(600, ...days.map(d => d.sec)), box = $("statsDays"); box.innerHTML = "";   // 長條至少以 10 分鐘為滿格（玩 1 分鐘不會畫成滿格）
  for (const d of days) {
    const m = Math.round(d.sec / 60), txt = d.sec === 0 ? "0 分" : m === 0 ? "<1 分" : m + " 分", dt = new Date(d.day + "T00:00:00Z");
    const col = el("div", "st-day" + (d.sec === 0 ? " zero" : "") + (d.day === today ? " today" : "")), bw = el("div", "st-bar-box"), bar = el("div", "st-bar");
    bar.style.height = (d.sec / maxSec * 100).toFixed(1) + "%"; bw.appendChild(bar); col.appendChild(bw);
    col.appendChild(el("div", "st-min", txt)); col.appendChild(el("div", "st-date", `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`)); col.appendChild(el("div", "st-wd", d.day === today ? "今天" : `週${WD[dt.getUTCDay()]}`)); box.appendChild(col);
  }
  const mb = $("statsModes"); mb.innerHTML = "";
  const head = el("div", "st-row head"); for (const t of ["遊戲", "次數", "平均星星", "最後玩"]) head.appendChild(el("span", t === "遊戲" ? "" : "n", t)); mb.appendChild(head);
  for (const r of ST.modeRows(st)) {
    const row = el("div", "st-row" + (r.played ? "" : " none")); row.appendChild(el("span", "nm", `${r.icon} ${r.name}`));
    if (r.played) { row.appendChild(el("span", "n", `${r.plays} 次`)); row.appendChild(el("span", "av", `⭐ ${r.avg.toFixed(1)}`)); row.appendChild(el("span", "ls", ST.dayLabel(r.last, today) || "—")); }
    else row.appendChild(el("span", "why", "還沒玩過"));
    mb.appendChild(row);
  }
  const xb = $("statsMix"); if (!xb) return;   // 10-12：跟正下方「容易搞混的注音」重複 → 家長頁拿掉這塊，保留原本那段（有說明、列 6 組）
  xb.innerHTML = "";
  const list = Object.entries(save.mix || {}).filter(([k, n]) => typeof n === "number").sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!list.length) { xb.appendChild(el("div", "set-note", "還沒有記錄")); return; }
  for (const [k, n] of list) {
    const tone = k.startsWith("t:"), [a, b] = (tone ? k.slice(2) : k).split("|"), name = x => tone ? (TONE_NAME[+x] || "?") : x;
    const row = el("div", "mix-row" + (tone ? " tone" : "")); row.appendChild(el("span", "mix-a", name(a))); row.appendChild(el("span", "mix-x", "↔")); row.appendChild(el("span", "mix-a", name(b))); row.appendChild(el("span", "mix-n", `${n} 次`)); xb.appendChild(row);
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
for (const b of document.querySelectorAll("#plazaOpts button")) b.onclick = () => { play("tap"); PZ(() => plaza.setOn(+b.dataset.v === 1)); renderSettings(); if (hub) hub.refresh(); };   // 同樂廣場：關＝不送不讀、🎪 收起來、小島慶祝收掉（hub.refresh＝鏡頭重擺）
$("settingsClose").onclick = () => { play("select"); $("settings").classList.add("hidden"); };
$("againBtn").onclick = () => {
  play("select"); if (mode === "bubble" && bubbleRun) bubbleLevel = Math.min(BUBBLE_N - 1, bubbleRun.level + 1);
  if (mode === "deliver" && deliverRun) { if (deliverRun.task >= DELIVER_TASKS - 1) { openDeliverPick(); return; } deliverLevel = deliverRun.task + 1; }   // 配送站：下一關；8 關都過了＝選關
  startMode(mode);
};
$("menuBtn").onclick = () => { play("select"); goMenu(); };
$("albumBtn").onclick = () => { play("select"); openAlbum(); };
$("resultAlbumBtn").onclick = () => { play("select"); openAlbum(); };
$("albumBack").onclick = () => { play("select"); goMenu(); };
$("dressBtn").onclick = () => { play("select"); openDress(save.rw.partner, "album"); };   // 圖鑑動物朋友的「👗 換裝」：開目前的夥伴（點卡片＝換夥伴，所以點哪隻就換哪隻）
for (const b of document.querySelectorAll(".jarBtn")) b.onclick = () => { play("select"); tryHatch(); };
$("hatchClose").onclick = () => { play("select"); $("hatch").classList.add("hidden"); const f = hatchDone; hatchDone = null; if (f) f(); else updateJar(); };   // 收尾交給 playHatchShow 的呼叫端
// 結算演出中點畫面＝快轉到最後（開頭 0.7 秒內不算：最後一題連點的那幾下不會把整段演出跳掉）
$("result").addEventListener("pointerdown", () => { if (rs && !rs.done && rs.tok === navToken && performance.now() - rs.t0 > 700) finishResult(rs, true); });
$("guide").onclick = e => {                             // 點探頭＝貓頭鷹彈出來再講一次；顯示中點貓頭鷹／對話框＝收起來
  if (e.target.closest("#owlPeek")) { play("tap"); owlShow(true); say($("guideText").textContent); } else { owlFold(); if (!mode) stopSpeech(); }   // 收起來就閉嘴（排隊中的下一句照講）
};
$("gachaGo").onclick = () => spinGacha(false); $("gachaGoGold").onclick = () => spinGacha(true);
$("gachaClose").onclick = () => { if (gachaBusy) return; play("select"); $("gacha").classList.add("hidden"); updateJar(); };
// 第一次觸碰就起音樂：goMenu() 開頁時已經記下要播哪首（那時還沒解鎖聲音），A.unlock() 會接著播；開頁時讓選單音樂一定有一首
document.addEventListener("pointerdown", () => { if (!mode) playBgm(menuBgmKey()); }, { once: true });
for (const ev of ["touchend", "click"]) document.addEventListener(ev, unlockAudio, { capture: true, once: true });   // iOS：第一次點擊解鎖語音與音效
for (const ev of ["pointerdown", "touchend"]) document.addEventListener(ev, () => { A.unlock(); voiceUnlock(); }, { capture: true, passive: true });   // 常駐：iOS 切背景或接電話後 AudioContext 會被暫停，下一次點擊再 resume（舊 iOS 只認 touchend 當解鎖手勢）
// 預錄語音預載（只下載＋解碼、不擋畫面）：等開頁的檔案都到了再抓開場語、稱讚、選單台詞，不跟開頁搶頻寬
const startupVoice = () => voicePreload([...Object.values(MODES).map(m => m.intro), ...PRAISE, "找到了！", "暫停", "蛋要孵出來了！", "全部找到了！",
  "你好！快來選遊戲玩吧！", "再收集幾張貼紙，就能開新遊戲喔！", "今天要玩哪個呢？", "貼紙越來越多了！", "來釣魚還是去尋寶？"]);
// 3D 小島建築全部長好（最多等 12 秒；沒有 3D 小島＝不用等）：效能體檢 10-12 實測背景音樂、音效、語音跟建築模型和調色盤搶頻寬，建築晚 1～2 秒才長出來
let builtWait = null;
const hubBuilt = () => builtWait || (builtWait = hub && hub.whenBuilt ? Promise.race([hub.whenBuilt(), new Promise(r => setTimeout(r, 12000))]) : Promise.resolve());
// 讀取畫面關了：先抓第一下點擊就要響的兩個小音效（共 7KB）；其他音效（約 0.5MB）、開場語音等建築長好再抓（解鎖後解碼）
{ const t = setInterval(() => { if ($("loading").classList.contains("hidden")) { clearInterval(t); A.preloadSfx(["select", "tap"], { low: false }); hubBuilt().then(() => { setTimeout(startupVoice, 300); setTimeout(() => A.preloadSfx(), 600); }); } }, 250); }
// 按下「開始玩」的那一刻（不等放開手指）就抓貓頭鷹的招呼語；背景音樂在同一下 pointerdown 解鎖聲音時就開始抓（js/zhuyin-audio.js unlock）
$("startBtn").addEventListener("pointerdown", () => {
  const hi = !lsGet(K("hello"), 0) && stickerCount() === 0 && !save.stars;   // 同 helloText()，但不記「打過招呼」
  voicePreload([hi ? "你好！我是貓頭鷹老師！快來選遊戲玩吧！" : $("guideText").textContent]);
}, { once: true });
window.addEventListener("resize", () => { if (mode === "bubble" && bubbleGame) PZ(() => bubbleGame.relayout()); if (mode === "deliver" && deliverGame) PZ(() => deliverGame.relayout());
  if (mode === "detective" && detectiveGame) PZ(() => detectiveGame.relayout()); if (mode === "tops" && topsGame) PZ(() => topsGame.relayout()); PZ(fitRewardStrip); if (mode === "fish" && !locked && round[idx] && !$("fish").classList.contains("hidden")) buildFish(round[idx]); if (mode === "match" && mq) layoutBoard(mq.pairs * 2); if (mode === "whack") layoutField(); if (mode === "frog") relayoutFrog(); });
// 開頁讀取進度（B12）：數「真的載入完」的檔案（圖、程式、3D 模型）÷ 預估總數（上次完整開頁數到幾個，第一次用 40）；開完記下這次的數量
const boot = { n: 0, total: Math.max(10, +lsGet("zy_ld_total", 40) || 40), done: false, obs: null };
try { boot.obs = new PerformanceObserver(l => { if (boot.done) return; boot.n += l.getEntries().length; setLoadProgress(Math.min(0.96, boot.n / boot.total)); }); boot.obs.observe({ type: "resource", buffered: true }); } catch (e) {}
// 開頁：讀取畫面蓋著，等貓頭鷹＋3D 小島（小島最多等 8 秒）；3D 模式選單背景被小島蓋住 → 退回卡片選單時才等背景圖
(async () => {
  const cap = p => Promise.race([p, new Promise(r => setTimeout(r, 6000))]), h = initHub();
  await Promise.all([h, cap(loadImg("guide_owl"))]);
  if (!hub) await cap(Promise.all(assetsOf("menu").map(loadImg)));
  boot.done = true; try { boot.obs && boot.obs.disconnect(); } catch (e) {} if (boot.n >= 10) lsSet("zy_ld_total", boot.n); setLoadProgress(1);
  if (hub) A.holdUntil(hubBuilt());                    // 選單音樂（goMenu 會點播）：還沒按開始之前，等建築長好才下載；一按開始（解鎖聲音）就馬上抓
  goMenu(); showLoading(false); $("startGate").classList.remove("hidden");
})();
$("startBtn").onclick = () => {                         // 開始玩：這一下點擊同時解鎖聲音、開音樂、貓頭鷹打招呼（新存檔：先自我介紹）
  document.body.classList.remove("gate-on"); $("startGate").classList.add("hidden"); play("select");
  A.unlock();                                          // 解鎖聲音＋開始放選單音樂（音樂關著就不放）
  const hi = helloText(); if (hi) $("guideText").textContent = hi + "快來選遊戲玩吧！";
  setTimeout(() => talk($("guideText").textContent), 300);
  hudTour();                                           // 上方家長按鈕先展開 4 秒，讓家長知道收在「⋯」裡
  setTimeout(() => PZ(() => { plaza.refresh(); pzNews(); }), 1500);   // 同樂廣場：讀這週進度（換週介紹主題、新的一段在打招呼之後才說）
};
// 夜間（B15）：晚上遊戲背景加藍紫色＋幾顆會閃的星星；時間由日夜時鐘決定（night > 0.5 才算晚上），3D 小島每秒推一次連續光線
let nightShown = null;
function applyNight() {
  const s = clock.tick();                                // 只在畫面看得到時前進；切背景／鎖螢幕＝時間停
  const on = s.night > 0.5;
  if (on !== nightShown) {
    const first = nightShown === null; nightShown = on; document.body.classList.toggle("night", on);
    if (!first && !mode && !dressFrom) playBgm(menuBgmKey());   // 主島天黑／天亮：選單音樂換成搖籃曲／白天的（在別的島不變；遊戲中、換裝畫面中等回選單再換）
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
if (location.search.includes("debug")) window.__zy = { renderZ, parseZ, WORDS, stickerNode, zMissing, get wq() { return wq; }, get fq() { return fq; }, get idx() { return idx; }, get results() { return results; }, get wrong() { return wrongThisQ; }, get mode() { return mode; }, get round() { return round; }, get curOpts() { return curOpts; }, get bubble() { return bubbleGame; }, get bubbleSave() { return save.bubble; }, get bubbleTab() { return bubbleTab; }, get bubbleN() { return BUBBLE_N; }, setWeather, get weather() { return wxKind; }, get weatherFx() { return weather; }, get clock() { return clock; }, get oceanFx() { return ocean; }, toneVariant, pickDistractors, zToStr, get dress() { return dressUI; }, get dressFrom() { return dressFrom; }, get deliver() { return deliverGame; }, get deliverSave() { return save.deliver; }, get deliverRun() { return deliverRun; }, get plaza() { return plaza; }, get stats() { return save.stats; }, get hub() { return hub; },
  get detective() { return detectiveGame; }, get detectiveSave() { return save.detective; }, get detectiveRun() { return detectiveRun; }, get tops() { return topsGame; }, get topsSave() { return save.tops; }, get topsPending() { return topsPending; }, get roundTreats() { return roundTreats; } };   // 測試用（tools/zy-test）；plaza＝同樂廣場（10-12）；detective／tops＝詞句小偵探、陀螺（10-12）
if (DEBUG) window.__zyB = { exportCode, readCode, importCode, playHatchShow, applyNight, get rs() { return rs; }, get best() { return save.best; }, get matchSize() { return save.matchSize; } };   // 外殼測試用（tools/zy-test/shell.js）
window.__zyTowerApi = Object.assign(window.__zyTowerApi || {}, { playFloor });   // v6 爬塔模組取用（§2.4）；不能整個蓋掉（泡泡區段先掛了 playBubbleBoss）
// v6 難度等級測試用（tools/zy-test/levels.js）：等級存檔、沙漏狀態、旋鈕表、playFloor；setLv(m, lv, keepMax)＝最高級設成 lv（keepMax＝只往上不往下）、這次玩 lv；hgScale(k)＝沙漏秒數乘 k
if (window.__zy) Object.defineProperties(window.__zy, Object.getOwnPropertyDescriptors({
  get lv() { return save.lv; }, get lvNow() { return lvNow; }, get rt() { return save.rt; }, get hg() { return { on: hg.on, ms: hg.ms, run: hg.run, wait: hg.wait, out: hg.out, late: hg.late, gone: hg.gone, elapsed: hgElapsed(), shown: !!hg.el && !hg.el.classList.contains("hidden") }; },
  get mq() { return mq; }, get oq() { return oq; }, get tower() { return tower; }, LVP, playFloor, lvStars, lvAfter, lvRec, showPick, earKey,
  setLv(m, n, keepMax) { const r = lvRec(m); if (!r) return null; r.max = keepMax ? Math.max(r.max, n) : n; r.cur = n; r.two = r.one = 0; lvSave(); return { ...r }; },
  hgScale(k) { hgScale = +k || 1; return hgScale; },
}));
