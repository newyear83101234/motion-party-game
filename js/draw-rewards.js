// 變色龍扭蛋＋貼紙本：畫完一張就開一顆扭蛋、拿一張貼紙收進貼紙本，讓小孩有理由畫下一張。
// 原則（審查官定的）：東西只會增加、不會消失；不計時、不扣分——3～5 歲也不會卡關哭。
// 不 import 其他模組（版號會變），聲音、換畫面等都從 deps 傳進來
const KEY = "draw-rewards";
const DIR = "IMAGE/draw/stickers/";
const UI = "IMAGE/draw/ui/";
// 每主題 6 張。圖檔（透明背景 PNG）還沒放進來或載入失敗時，用 emoji 代替
const SETS = {
  animal: [["puppy", "🐶"], ["kitten", "🐱"], ["bunny", "🐰"], ["elephant", "🐘"], ["lion", "🦁"], ["panda", "🐼"]],
  vehicle: [["racecar", "🏎️"], ["schoolbus", "🚌"], ["firetruck", "🚒"], ["rocket", "🚀"], ["hotairballoon", "🎈"], ["sailboat", "⛵"]],
  dino: [["trex", "🦖"], ["triceratops", "🦕"], ["longneck", "🦕"], ["dinoegg", "🥚"], ["pterodactyl", "🦅"], ["volcano", "🌋"]],
  fairy: [["crown", "👑"], ["wand", "🪄"], ["unicorn", "🦄"], ["castle", "🏰"], ["fairy", "🧚"], ["rainbow", "🌈"]],
  ocean: [["whale", "🐳"], ["clownfish", "🐠"], ["octopus", "🐙"], ["turtle", "🐢"], ["starfish", "⭐"], ["shell", "🐚"]],
  sweets: [["cupcake", "🧁"], ["icecream", "🍦"], ["donut", "🍩"], ["lollipop", "🍭"], ["cake", "🎂"], ["strawberry", "🍓"]],
  kpop: [["rumi", "💜"], ["mira", "💃"], ["zoey", "😆"], ["derpy", "🐯"], ["sussie", "🐦"], ["goldmic", "🎤"]],   // 獵魔女團（阿葉 11-01 加，自己家玩）
};
const COLOR = { animal: "#ffa63d", vehicle: "#4fb3ff", dino: "#3fc58a", fairy: "#ff7eb6", ocean: "#20bfd6", sweets: "#a77bff", kpop: "#8f5cff" };
// 扭蛋殼的顏色（r,g,b 兩段：亮→暗），每顆隨機挑；金蛋固定金色
const EGGS = [["255,143,184", "255,84,140"], ["127,208,255", "40,150,255"], ["155,227,122", "70,185,60"],
  ["255,212,92", "255,160,20"], ["199,162,255", "150,100,255"], ["120,232,214", "20,185,170"]];
const GOLD_EGG = ["255,226,110", "232,160,0"];
const CONFETTI = ["#ff6b5b", "#ffc93c", "#4fcf9b", "#4fb3ff", "#a77bff", "#ff7eb6", "#fff"];

const ALL = [];   // [{ id, theme, emo }]，順序 = 主題順序 × 主題內順序
const BY = Object.create(null);
for (const [theme, list] of Object.entries(SETS)) for (const [id, emo] of list) { const s = { id, theme, emo }; ALL.push(s); BY[id] = s; }

const wait = ms => new Promise(r => setTimeout(r, ms));
const rnd = a => a[Math.floor(Math.random() * a.length)];
function el(tag, cls, html = "") { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
function today() {
  const d = new Date();   // 用平板的當地日期（不是 UTC）：台灣半夜 0 點就換新的一天
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// 每張貼紙固定一個小角度（看 id 算出來）：重畫時不會亂跳，但整頁看起來像手貼的
function tilt(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return (h % 15) - 7; }

const blank = () => ({ v: 1, got: [], gold: [], done: Object.create(null), daily: "" });
// 讀存檔：整個壞掉 → 空的；個別欄位壞掉 → 只把那一欄清乾淨（不認得的貼紙 id 丟掉、重複的合併）
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { s = null; }
  if (!s || typeof s !== "object" || Array.isArray(s) || s.v !== 1) return blank();
  const ids = a => (Array.isArray(a) ? [...new Set(a.filter(id => typeof id === "string" && BY[id]))] : []);
  const st = blank();
  st.got = ids(s.got);
  st.gold = ids(s.gold).filter(id => st.got.includes(id));   // 金色版一定是已經有的貼紙
  if (s.done && typeof s.done === "object" && !Array.isArray(s.done))
    for (const [k, n] of Object.entries(s.done)) if (Number.isFinite(n) && n > 0) st.done[k] = Math.floor(n);
  if (typeof s.daily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.daily)) st.daily = s.daily;
  return st;
}

const TIMING = { autoOpen: 3500, hint: 1500 };   // 蛋幾毫秒沒點自己開、幾毫秒出現手指（測試可調長）
export function mountRewards(deps) {
  const A = deps.A, v = deps.v || "1";
  // 主題順序照主程式給的；主程式沒列到的主題接在後面（每張貼紙一定都看得到）
  const given = Array.isArray(deps.themes) ? deps.themes.filter(t => t && SETS[t.id]) : [];
  const THEMES = [...new Set([...given.map(t => t.id), ...Object.keys(SETS)])].map(id => {
    const t = given.find(g => g.id === id) || {};
    let img = t.img || "theme-" + id + ".png";
    if (!img.includes("/")) img = UI + img;
    if (!img.includes("?")) img += "?v=" + v;
    return { id, img, color: t.color || COLOR[id] };
  });
  const SPREADS = Math.ceil(THEMES.length / 2);   // 攤開一次看兩頁，一頁一個主題

  if (!document.querySelector('link[data-mod="rewards"]')) {
    const l = el("link"); l.rel = "stylesheet"; l.href = "css/draw-rewards.css?v=" + v; l.dataset.mod = "rewards";
    document.head.append(l);
  }

  // 扭蛋要用的變色龍、貼紙本圖示先暖好快取：第一次開扭蛋時不會等圖（主程式首頁本來就載過變色龍，網址一樣）
  for (const f of ["mascot.png", "btn-book.png"]) new Image().src = UI + f + "?v=" + v;

  let state = load();
  const fresh = new Set();   // 剛拿到、還沒在貼紙本看過的：打開貼紙本時「啪」一聲貼上去
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("貼紙存檔失敗：" + (e && e.message)); }
  };
  const has = id => state.got.includes(id);
  const isGold = id => state.gold.includes(id);
  const themeFull = theme => !!SETS[theme] && SETS[theme].every(([id]) => has(id));
  const stickerSrc = id => DIR + id + ".png?v=" + v;

  // ── 貼紙圖：圖檔在就用圖，不在（404）就換成 emoji；結果記起來，同一張不會一直重試 ──
  const imgOk = Object.create(null);
  function stickerEl(id) {
    const s = BY[id];
    const emo = () => el("span", "stk emo", s.emo);
    if (imgOk[id] === false) return emo();
    const img = new Image();
    img.className = "stk"; img.alt = ""; img.draggable = false;
    img.onload = () => { imgOk[id] = true; img.classList.add("ok"); };   // 載到之前透明：Safari 不會閃一個破圖示
    img.onerror = () => { imgOk[id] = false; img.replaceWith(emo()); };
    img.src = stickerSrc(id);
    if (imgOk[id]) img.classList.add("ok");
    return img;
  }
  // 扭蛋開之前先確認圖在不在（蛋掉下來要 1 秒，夠時間），免得貼紙出現時才從圖換成 emoji
  function probe(id) {
    if (id in imgOk) return Promise.resolve(imgOk[id]);
    return new Promise(res => {
      const img = new Image(), t = setTimeout(() => res(false), 1500);
      img.onload = () => { clearTimeout(t); imgOk[id] = true; res(true); };
      img.onerror = () => { clearTimeout(t); imgOk[id] = false; res(false); };
      img.src = stickerSrc(id);
    });
  }

  // ── 挑貼紙：先給這個主題還沒有的 → 別的主題還沒有的 → 全部集滿了給金色版 ──
  function pick(theme, goldEgg) {
    const got = new Set(state.got), shiny = new Set(state.gold), mine = s => s.theme === theme;
    const pools = [ALL.filter(s => mine(s) && !got.has(s.id)), ALL.filter(s => !got.has(s.id)),
      ALL.filter(s => mine(s) && !shiny.has(s.id)), ALL.filter(s => !shiny.has(s.id)), ALL.filter(mine), ALL];
    const s = rnd(pools.find(p => p.length));
    const gold = !!goldEgg || got.has(s.id);   // 已經有了（全滿）就是金色版；金蛋開出來的直接是金色版
    if (!got.has(s.id)) state.got.push(s.id);
    if (gold && !shiny.has(s.id)) state.gold.push(s.id);
    fresh.add(s.id);
    return { id: s.id, gold };
  }

  // 同時叫好幾次 grant（連點、每日＋畫完）就排隊一顆一顆開，畫面上永遠只有一個扭蛋遮罩
  let chain = Promise.resolve();
  function grant({ count = 1, theme = null, gold = false } = {}) {
    const n = Math.max(1, Math.min(10, Math.floor(Number(count)) || 1));
    const list = [];
    for (let i = 0; i < n; i++) list.push(pick(theme, gold));
    save();   // 先存檔再播動畫：動畫途中關掉 App，貼紙也已經是他的
    const ids = list.map(g => g.id);
    const run = chain.then(() => play(list)).catch(e => console.warn("扭蛋動畫出錯：" + (e && e.message))).then(() => {
      if (book.classList.contains("on")) paint();
      return ids;
    });
    chain = run;
    return run;
  }

  // ── 開扭蛋動畫 ──
  function flyTarget() {
    let r = null;
    try { r = deps.bookAnchor && deps.bookAnchor(); } catch { r = null; }
    if (r && r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: Math.min(r.width, r.height) };
    return { x: innerWidth - 70, y: 64, s: 88 };   // 沒有貼紙本按鈕（或藏起來了）就飛向右上角
  }
  async function play(list) {
    const ov = el("div", "gacha");
    ov.id = "gacha";
    const mascot = Object.assign(new Image(), { className: "g-mascot", alt: "", draggable: false, src: UI + "mascot.png?v=" + v });
    mascot.onerror = () => mascot.remove();
    ov.append(mascot);
    document.body.append(ov);
    let parts = null;
    try { if (deps.Particles) parts = new deps.Particles(ov); } catch { parts = null; }
    try {
      for (let i = 0; i < list.length; i++) await one(ov, list[i], i === 0, mascot, parts);
      ov.classList.add("bye");   // 先讓手指穿過去，淡出完再整個拿掉
      await wait(300);
    } finally {
      if (parts?.c) parts.c.width = parts.c.height = 0;   // 整個螢幕大的粒子畫布馬上釋放（iPad 記憶體）
      ov.remove();   // 不管中間出什麼錯，遮罩一定拿掉，不會擋住主程式
    }
  }

  async function one(ov, g, first, mascot, parts) {
    const [c1, c2] = g.gold ? GOLD_EGG : rnd(EGGS);
    const egg = el("button", "g-egg" + (g.gold ? " gold" : ""));
    egg.id = "gachaEgg"; egg.dataset.sfx = "none"; egg.setAttribute("aria-label", "打開扭蛋");
    egg.style.setProperty("--c1", c1); egg.style.setProperty("--c2", c2);
    const wob = el("span", "g-wob"), shell = el("span", "g-shell"), top = el("span", "g-top"), bot = el("span", "g-bot");
    const peek = el("span", "g-peek");   // 透明上蓋裡隱約看得到貼紙的顏色，開之前就有期待
    peek.append(stickerEl(g.id));
    top.append(peek, el("span", "g-gloss"));
    shell.append(top, bot); wob.append(shell); egg.append(wob);
    const floor = el("span", "g-floor");
    ov.style.setProperty("--d", first ? ".4s" : "0s");   // 第一顆等變色龍探頭（0.4 秒）再掉，之後的馬上掉
    ov.append(floor, egg);
    const imgReady = probe(g.id);

    // 點蛋（或點遮罩任何地方）就開；蛋還在掉的時候點，落地馬上開。只認在遮罩上「按下」的那一下：
    // 主程式是放開手指才觸發完成鈕，那一下的放開不能直接把蛋點開
    let phase = "drop", early = false, down = false, open, skip;
    const opened = new Promise(r => { open = r; }), skipped = new Promise(r => { skip = r; });
    const tap = () => {
      if (phase === "drop") early = true;
      else if (phase === "wait") { phase = "open"; open(); }
      else if (phase === "show") { phase = "fly"; skip(); }
    };
    egg.onclick = tap;
    ov.onpointerdown = () => { down = true; };
    ov.onpointerup = () => { if (down) tap(); down = false; };

    const timers = [setTimeout(() => A.sfx("pop", { gain: 0.7 }), first ? 820 : 420)];   // 落地「咚」一聲
    await wait(first ? 1400 : 1000);   // 第一顆等變色龍探頭完再掉
    phase = "wait";
    egg.classList.add("wait");
    if (early) tap();
    timers.push(setTimeout(tap, TIMING.autoOpen));   // 3.5 秒沒點就自己開：不會卡在這裡（櫻木：5 秒太久）
    let hint = null;   // 停 1.5 秒沒點：蛋上出現點擊手指（跟其他畫面同一個提示樣子）
    timers.push(setTimeout(() => { if (phase !== "wait") return; const r = egg.getBoundingClientRect(); hint = el("div", "foil-hint"); Object.assign(hint.style, { position: "fixed", left: r.left + r.width / 2 + "px", top: r.top + r.height / 2 + "px", zIndex: 30 }); ov.append(hint); }, TIMING.hint));
    await opened;
    timers.forEach(clearTimeout); hint?.remove();

    // 開！上下兩半彈開＋閃光＋彩帶＋星星，貼紙轉一圈放大出現、背後放射光芒
    const ok = await imgReady;
    egg.classList.remove("wait"); egg.classList.add("open");
    A.sfx("magic");
    mascot.classList.remove("cheer"); void mascot.offsetWidth; mascot.classList.add("cheer");
    const flash = el("span", "g-flash"), rays = el("span", "g-rays" + (g.gold ? " gold" : "")), glow = el("span", "g-glow" + (g.gold ? " gold" : ""));
    const stk = el("span", "g-stk" + (g.gold ? " gold" : ""));
    stk.append(ok ? stickerEl(g.id) : el("span", "stk emo", BY[g.id].emo));
    const conf = el("span", "g-confs");
    for (let i = 0; i < 34; i++) {
      const c = el("i", "g-conf" + (i % 3 ? "" : " dot")), a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 260;
      c.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 80}px;--r:${Math.random() * 720 - 360}deg;` +
        `background:${g.gold && i % 2 ? "#ffd54a" : rnd(CONFETTI)};animation-delay:${Math.random() * 0.08}s`;
      conf.append(c);
    }
    ov.append(rays, glow, flash, conf, stk);
    if (parts) { const r = egg.getBoundingClientRect(); parts.stars(r.left + r.width / 2, r.top + r.height / 2, r.width * 1.4); }
    await wait(750);
    phase = "show";
    await Promise.race([wait(1200), skipped]);   // 看 1.2 秒（等不及的小孩點一下就收進去）
    phase = "fly";

    // 縮小飛進貼紙本
    const to = flyTarget(), r = stk.getBoundingClientRect();
    const dx = to.x - (r.left + r.width / 2), dy = to.y - (r.top + r.height / 2);
    api.lastFly = to;
    rays.classList.add("off"); glow.classList.add("off"); egg.remove(); floor.remove();
    // 目的地：遮罩上浮一本貼紙本（蓋在主程式貼紙本按鈕的位置；遮罩是暗的，不浮出來小孩看不到貼紙飛去哪）
    let dest = ov.querySelector(".g-dest");
    if (!dest) {
      dest = Object.assign(new Image(), { className: "g-dest", alt: "", draggable: false, src: UI + "btn-book.png?v=" + v });
      dest.onerror = () => { dest.style.visibility = "hidden"; };
      ov.append(dest);
    }
    const ds = Math.round(to.s * 0.9);
    dest.style.cssText = `left:${to.x - ds / 2}px;top:${to.y - ds / 2}px;width:${ds}px;height:${ds}px`;
    if (stk.animate) {
      const an = stk.animate([{ transform: "none" }, { transform: "scale(1.12)", offset: 0.2 },
        { transform: `translate(${dx}px, ${dy}px) scale(.16)`, opacity: 0.9 }],
      { duration: 650, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
      await Promise.race([an.finished.catch(() => {}), wait(900)]);   // 背景分頁動畫可能不跑，最多等 0.9 秒
    } else await wait(650);
    A.note(14, { gain: 0.3 });
    dest.classList.remove("hit"); void dest.offsetWidth; dest.classList.add("hit");
    const ping = el("span", "g-ping");
    ping.style.left = to.x + "px"; ping.style.top = to.y + "px";
    ov.append(ping);
    [flash, rays, glow, conf, stk].forEach(e => e.remove());
    await wait(220);
    setTimeout(() => ping.remove(), 500);
  }

  // ── 貼紙本畫面 ──
  const book = el("section", "screen");
  book.id = "book";
  const top = el("header", "top bk-top");
  const home = el("button", "big", "🏠");
  home.id = "bookHome"; home.setAttribute("aria-label", "回首頁");
  home.onclick = () => deps.onHome && deps.onHome();
  const tabs = el("nav", "bk-tabs");
  const tabBtn = {};
  THEMES.forEach((t, i) => {
    const b = el("button", "bk-tab");
    b.id = "bookTab-" + t.id; b.dataset.sfx = "pick"; b.setAttribute("aria-label", t.id);
    b.style.setProperty("--c", t.color);
    const img = Object.assign(new Image(), { alt: "", draggable: false, src: t.img });
    img.onerror = () => img.replaceWith(el("span", "emo", SETS[t.id][0][1]));
    b.append(img);
    b.onclick = () => go(Math.floor(i / 2));
    tabs.append(b); tabBtn[t.id] = b;
  });
  const countEl = el("div", "bk-count", '<span class="st">🌟</span><b id="bookN">0</b><span class="of">/ ' + ALL.length + "</span>");
  countEl.id = "bookCount";
  top.append(home, tabs, countEl);
  const desk = el("div", "bk-desk");
  const bk = el("div", "bk");
  bk.id = "bookBody";
  const pgL = el("div", "bk-pg l"), pgR = el("div", "bk-pg r"), spine = el("div", "bk-spine");
  const prev = el("button", "bk-corner l", "<span>◀</span>"), next = el("button", "bk-corner r", "<span>▶</span>");
  prev.id = "bookPrev"; next.id = "bookNext";
  prev.setAttribute("aria-label", "上一頁"); next.setAttribute("aria-label", "下一頁");
  prev.dataset.sfx = next.dataset.sfx = "none";   // 翻頁自己有聲音
  prev.onclick = () => go(cur - 1);
  next.onclick = () => go(cur + 1);
  bk.append(pgL, pgR, spine, prev, next);
  const deco = Object.assign(new Image(), { className: "bk-mascot", alt: "", draggable: false, src: UI + "mascot.png?v=" + v });
  deco.onerror = () => deco.remove();
  desk.append(bk, deco);
  book.append(top, desk);
  document.body.append(book);

  // 左右滑動也能翻頁（手指拖過貼紙不會觸發點擊：主程式的按鈕移動超過 20px 就不算點）
  let sw = null;
  bk.addEventListener("pointerdown", e => { if (e.isPrimary) sw = [e.clientX, e.clientY]; });
  bk.addEventListener("pointerup", e => {
    if (!sw || !e.isPrimary) return;
    const dx = e.clientX - sw[0], dy = e.clientY - sw[1];
    sw = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.3) go(cur + (dx < 0 ? 1 : -1));
  });
  bk.addEventListener("pointercancel", () => { sw = null; });

  // 一頁 = 一個主題：上面主題圖示＋6 顆進度點（集滿戴金色皇冠），下面 2×3 格貼紙
  function pageNodes(t) {
    if (!t) return [el("div", "bk-blank")];
    const list = SETS[t.id], full = themeFull(t.id);
    const head = el("div", "bk-head" + (full ? " full" : ""));
    head.style.setProperty("--c", t.color);
    const badge = el("span", "bk-badge");
    const ico = Object.assign(new Image(), { alt: "", draggable: false, src: t.img });
    ico.onerror = () => ico.replaceWith(el("span", "emo", list[0][1]));
    badge.append(ico);
    if (full) { const c = el("span", "bk-crown", "👑"); c.id = "crown-" + t.id; badge.append(c); }
    const dots = el("span", "bk-dots");
    for (const [id] of list) dots.append(el("i", has(id) ? (isGold(id) ? "on gold" : "on") : ""));
    head.append(badge, dots);
    const grid = el("div", "bk-grid");
    list.forEach(([id], i) => {
      const own = has(id), b = el("button", "slot " + (own ? "own" : "empty") + (own && isGold(id) ? " gold" : ""));
      b.id = "slot-" + id; b.dataset.sfx = "none"; b.dataset.id = id;
      b.style.setProperty("--r", tilt(id) + "deg");
      b.append(stickerEl(id));
      if (!own) b.append(el("i", "q", "?"));
      b.onclick = () => {
        const cls = own ? "boing" : "nope";
        b.classList.remove("boing", "nope"); void b.offsetWidth; b.classList.add(cls);
        if (own) { A.note(6 + i * 2, { gain: 0.32 }); if (isGold(id)) A.chime(0.1); }
        else A.sfx("tap", { gain: 0.35 });
      };
      grid.append(b);
    });
    return [head, grid];
  }
  function fill(pg, t) {
    pg.replaceChildren(...pageNodes(t));
    pg.classList.toggle("full", !!t && themeFull(t.id));
  }
  let cur = 0, flip = null;
  function paint() {
    const L = THEMES[cur * 2], R = THEMES[cur * 2 + 1];
    fill(pgL, L); fill(pgR, R);
    // 剛拿到的貼紙這次看到了：「啪」一聲貼上去（只有第一次看到時）
    for (const b of bk.querySelectorAll(".bk-pg > .bk-grid .slot.own"))
      if (fresh.has(b.dataset.id)) { b.classList.add("new"); fresh.delete(b.dataset.id); }
    THEMES.forEach((t, i) => { tabBtn[t.id].classList.toggle("on", Math.floor(i / 2) === cur); tabBtn[t.id].classList.toggle("full", themeFull(t.id)); });
    prev.classList.toggle("off", cur === 0);
    next.classList.toggle("off", cur === SPREADS - 1);
    book.querySelector("#bookN").textContent = state.got.length;
  }
  function endFlip() {
    if (!flip) return;
    clearTimeout(flip.t); flip.leaf.remove(); flip = null;
    bk.classList.remove("flipping");
    paint();
  }
  // 翻頁：一張「紙」繞著書脊翻過去，正面是舊的那頁、背面是新的那頁
  function go(sp) {
    sp = Math.max(0, Math.min(SPREADS - 1, sp));
    endFlip();
    if (sp === cur) return;
    const fwd = sp > cur, old = cur;
    cur = sp;
    if (!book.classList.contains("on")) { paint(); return; }
    A.sfx("pop", { gain: 0.45 });
    const T = i => THEMES[i];
    const leaf = el("div", "bk-leaf " + (fwd ? "r" : "l"));
    const f = el("div", "bk-pg face " + (fwd ? "r" : "l")), back = el("div", "bk-pg face back " + (fwd ? "l" : "r"));
    if (fwd) { fill(f, T(old * 2 + 1)); fill(back, T(sp * 2)); fill(pgL, T(old * 2)); fill(pgR, T(sp * 2 + 1)); }
    else { fill(f, T(old * 2)); fill(back, T(sp * 2 + 1)); fill(pgL, T(sp * 2)); fill(pgR, T(old * 2 + 1)); }
    leaf.append(f, back);
    bk.append(leaf);
    bk.classList.add("flipping");
    flip = { leaf, t: setTimeout(endFlip, 650) };
    THEMES.forEach((t, i) => tabBtn[t.id].classList.toggle("on", Math.floor(i / 2) === cur));
  }

  function openBook(theme) {
    endFlip();
    let i = THEMES.findIndex(t => t.id === theme);
    if (i < 0) {   // 沒指定主題：翻到最近剛拿到的貼紙那頁
      const last = [...fresh].pop();
      i = last ? THEMES.findIndex(t => t.id === BY[last].theme) : cur * 2;
    }
    cur = Math.max(0, Math.floor(i / 2));
    paint();
    deps.show("book");
  }

  function dailyReady() { return state.daily !== today(); }
  function claimDaily() {
    if (!dailyReady()) return Promise.resolve([]);
    state.daily = today();
    return grant({ count: 1 });   // grant 裡面會一起存檔
  }

  const api = {
    grant, openBook,
    markDone(artId) { if (!artId) return; state.done[artId] = (state.done[artId] || 0) + 1; save(); },
    isDone: artId => !!state.done[artId],
    doneCount: () => Object.keys(state.done).length,
    count: () => state.got.length,
    owned: () => [...state.got],
    dailyReady, claimDaily, stickerSrc,
    stickerEmoji: id => (BY[id] ? BY[id].emo : ""),
    themeOf: id => (BY[id] ? BY[id].theme : null),     // 貼紙屬於哪個主題（我的世界拿來當裝飾）   // 圖檔還沒放進來時，主程式可以先用 emoji
    themeFull,                                         // 某主題 6 張集滿（主程式之後拿來解鎖東西）
    lastFly: null,
  };
  // 給測試用
  window.__rewards = {
    timing: TIMING,
    get state() { return state; },
    ids: ALL.map(s => s.id),
    sets: Object.fromEntries(Object.entries(SETS).map(([k, l]) => [k, l.map(x => x[0])])),
    get lastFly() { return api.lastFly; },
    reset() { state = blank(); fresh.clear(); save(); paint(); },
    grantNow(ids = []) {
      for (const id of ids) if (BY[id] && !has(id)) state.got.push(id);
      save(); paint();
      return [...state.got];
    },
  };
  paint();
  return api;
}
