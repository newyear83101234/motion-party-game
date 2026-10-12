// ===================== 注音小島：挑戰燈塔（爬塔／無限挑戰）=====================
// 規格 docs/zhuyin-v6-plan.md §5（阿葉 10-13：1–100 層登頂、24 個代號、一週沒來釋出歸零、排行榜前 5 名、「千萬不要兩三次就過關」）。
// 規則（樓層表、愛心、存檔點、獎勵、存檔清洗、後端同步）都在 js/zhuyin-tower-core.js；這個檔是畫面與流程。
// 畫面：塔的主畫面（這一段 10 層的燈塔、我在第幾層、存檔點、1–100 的小量尺、我的爬塔名字、前 5 名榜、規則）、
//       選名字（24 格，家長按住 2 秒才打得開）、樓層開場卡、愛心 HUD（蓋在遊戲畫面上、不擋操作）、Boss 開場／過關（繼續爬／先休息）、
//       愛心用完＝撐降落傘飄回存檔點（不出現 GAME OVER、愛心變泡泡飄走）、結算＝一座塔（這次的旗子、上次的半透明旗子）。
// 不能讓小孩哭：怪塔不怪人（「這座塔今天好滑喔！」）、不扣星星／貼紙／幣、「再爬一次」大「去玩別的」小、連輸 2 場建議先去泡泡灣。
//
// 介面（主程式 js/zhuyin.js「挑戰燈塔」段照這個接）：
//   createTowerGame(root, api) → { start(opts), stop(), relayout(), state(), debug }
//   api：say(text, rate, onEnd)／talk(text, onEnd)（說明語音開關管）／play(name, rate)／stopVoice()／paused()（暫停選單開著）
//        load() → 本機存檔原始物件；store(t) 存回去
//        give({ stars, coins }) → 星星放進星星罐、扭蛋幣（主程式負責存檔、陀螺券、同樂廣場、家長頁紀錄）
//        playFloor(opts) → { done: Promise<{ golds, silvers, wrongs, timeouts, aborted }>, abort() } 或 null（還沒接上 → 用模組自己的模擬版）
//        playBubbleBoss(opts) → { done: Promise<{ cleared, shots, presses, aborted }>, abort() } 或 null（同上）
//        net() → 能不能連後端；post(body) → Promise<回應物件|null>；board(force) → Promise<後端 doGet 的 tower 欄位 { board, taken }|null>（模組自己清洗）
//        modeInfo(m) → { name, ico }；me() → { e, name }（存檔位的動物）；showTower()（一層玩完確認塔的畫面在前面）；exit(where)："menu"｜"bubble"
//        owlImg（貓頭鷹圖）
import * as C from "./zhuyin-tower-core.js?v=1";

// 會唸出來的台詞（登記在 tools/voice/build_lines.py「10-13 挑戰燈塔」；國字盡量不用「一」「不」——變調字典標不準）
export const LINES = {
  intro: "這是挑戰燈塔！爬到最頂樓，就是燈塔王！",
  hearts: "你有三顆愛心，答錯會掉愛心，用完就要先休息囉！",
  noName: "請爸爸媽媽幫你選爬塔的名字！",
  lost: "好久沒來，爬塔名字放掉了。徽章還在喔！",
  practice: "這層是練習，答錯也沒關係！",
  seg_look: "接下來的答案很像，要看仔細喔！",
  seg_sand: "金星沙漏出現了！沙子漏完以前答對，就是金星！",
  seg_time: "從這裡開始，沙漏跑完會掉愛心喔！",
  seg_move: "東西會動了！魚會游，氣球會飄！",
  seg_flash: "注音只亮兩秒，要記住喔！",
  seg_hard: "接下來是最難的關卡，加油！",
  seg_hardflash: "最難的關卡，還要記住注音！",
  seg_ears: "圖片藏起來了，只能靠耳朵聽！",
  seg_last: "最後十層！每層五題，衝上頂樓！",
  heal: "補愛心囉！",
  gift: "貓頭鷹送你金色愛心！",
  bossBubble: "泡泡守塔怪來了！把泡泡打下來！",
  bossMix: "守塔怪的連續挑戰！每題都換遊戲！",
  bossFinal: "最後的挑戰！三關都過就登頂！",
  bossWin: "打敗守塔怪了！這裡是存檔點！",
  ask: "要繼續爬，還是先休息？",
  star5: "第一次爬到這裡，送你星星！",
  badge: "拿到燈塔徽章和扭蛋幣！",
  slip: "這座塔今天好滑喔！",
  higher: "比上次爬更高了！",
  rest: "休息好了，再來挑戰！",
  bubbleTip: "先去泡泡灣玩玩，再回來挑戰吧！",
  guarantee: "爬塔辛苦了，送你星星！",
  summit: "登頂了！你是燈塔王！",
  picked: "好棒！這就是你的爬塔名字！",
  taken: "這個名字有人選了，換別的吧！",
  offline: "連不上網路，等等再試！",
};
const SEG_LINE = { look: "seg_look", sand: "seg_sand", time: "seg_time", move: "seg_move", flash: "seg_flash", hard: "seg_hard", hardflash: "seg_hardflash", ears: "seg_ears", last: "seg_last" };
// 畫面上的字（不唸）
const UI = {
  title: "挑戰燈塔", noName: "還沒有名字", myName: "我的爬塔名字", best: "最高", cp: "存檔點", floor: n => `第 ${n} 層`, from: n => `從第 ${n} 層開始爬`,
  board: "排行榜", boardEmpty: "還沒有人上榜，快來當第 1 名！", boardOff: "要連上網路才會看到排行榜", you: "你",
  rules: "規則", gate: "選爬塔名字", gateHold: "家長請按住 2 秒", go: "出發！", climb: "繼續爬", restBtn: "先休息", again: "再爬一次", other: "去玩別的", bubble: "去泡泡灣",
  practice: "練習層", heal: "補愛心", sand: "金星沙漏", time: "超時掉愛心", flash: "注音會蓋起來", ears: "只靠耳朵", move: "東西會動",
  bossBubble: "泡泡守塔怪", bossMix: "守塔怪連戰", bossFinal: "最後的挑戰", savePoint: "存檔點！",
  thisTime: n => (n > 0 ? `這次爬到第 ${n} 層！` : "這次在塔底休息"), higherBy: n => `比上次高 ${n} 層！`, toBoss: n => `再 ${n} 層就到守塔怪`, nextFrom: n => `下次從第 ${n} 層開始`,
  firstTry: n => `第 1 次挑戰就爬到第 ${n} 層！`, summitT: "登頂！", restT: "休息一下",
  pickT: "選爬塔名字", pickZodiac: "生肖", pickStars: "星座", takenTag: "有人了", mineTag: "你的", pickOk: (e, n) => `就選 ${e} ${n}`, back: "回去",
  pickRule1: "選了以後，別人就不能選。", pickRule2: "七天沒來玩，名字會放掉，樓層從第 1 層重新開始。",
  loading: "讀取中…", offline: "連不上網路，等等再試", netOff: "家長關掉了同樂廣場，所以現在不能選名字。還是可以爬塔，只是不會上排行榜。", busy: "現在好多人，等等再試",
  lostT: "爬塔名字放掉了", lostD: "七天沒來玩，名字放掉了，樓層從第 1 層重新開始。徽章還在喔！請爸爸媽媽再幫你選名字。", ok: "好",
  mix: (i, n) => `連戰 ${i}/${n}`, stubT: "模擬關卡", stubQ: (i, n) => `第 ${i} 題／共 ${n} 題`, stubOk: "答對", stubNg: "答錯", stubTime: "時間到", stubPress: "碰到底線", stubWin: "救出來了",
};
// 規則（小孩看的，每行一個圖示）
const RULES = [
  ["❤️", "有三顆愛心，答錯會掉愛心。"], ["⏳", "從第 31 層開始，沙漏跑完也會掉愛心。"], ["💛", "第 5、15、25…層會補愛心。"],
  ["🚩", "每 10 層有守塔怪，打敗它就是存檔點，下次從那裡開始。"], ["⭐", "第 1 次爬到 5、10、15…層送星星；打敗守塔怪送扭蛋幣和徽章。"],
  ["🏷️", "七天沒來玩，爬塔名字會放掉，樓層從第 1 層重新開始（徽章會留下來）。"], ["🏆", "排行榜只列前 5 名的名字和樓層。"],
];
// 隱私說明（家長看的；noann 不加注音）
const PARENT_NOTE = "會送出：代號（例如「虎」）、最高樓層、一組只存在這台平板的隨機碼（伺服器只存它的雜湊，用來確認是這台平板）。不會送出名字、小熊／小兔／小貓是誰、IP、每天有沒有玩。七天沒打開遊戲，代號會放掉、樓層歸零。";
const BOSS_ICO = { bubble: "🫧", mix: "🎯", final: "👑" };

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const taipeiToday = () => C.taipeiDay(Date.now());

export function createTowerGame(root, api) {
  const A = { say() {}, talk(t, cb) { if (cb) setTimeout(cb, 0); }, play() {}, stopVoice() {}, paused: () => false,
    load: () => null, store() {}, give() {}, playFloor: () => null, playBubbleBoss: () => null,
    net: () => false, post: async () => null, board: async () => null, modeInfo: m => ({ name: m, ico: "🎮" }), me: () => ({ e: "🐻", name: "" }),
    showTower() {}, exit() {}, owlImg: "IMAGE/zhuyin/guide_owl.webp", ...api };
  let tok = 0, T = C.cleanTower(null), ui = null, hud = null;
  const S = { phase: "idle", run: null, cur: null, ov: "", board: null, taken: [], loaded: false, syncing: null, stub: null, pickSel: null, pickBusy: false, notice: "" };
  const alive = my => my === tok;
  const save = () => { try { A.store(T); } catch (e) { console.warn("[tower] store", e); } };

  // ---------- 計時（暫停選單開著／切到背景＝不走；stop() 後作廢）----------
  function wait(ms, my = tok) {
    return new Promise(res => {
      let left = ms, last = performance.now();
      const step = () => { if (!alive(my)) return res(false); const now = performance.now(); if (!A.paused() && !document.hidden) left -= now - last; last = now; if (left <= 0) return res(true); setTimeout(step, Math.min(100, left)); };
      setTimeout(step, Math.min(100, ms));
    });
  }
  // 說明語音：講完（或說明語音關著）才 resolve；最多等 maxMs（語音卡住也不會停在這裡）
  function talkP(text, maxMs = 7000, my = tok) {
    return new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(alive(my)); } };
      try { A.talk(text, fin); } catch (e) { fin(); } setTimeout(fin, maxMs); });
  }
  // 貓頭鷹對話框（主畫面左下）：顯示字＋（可選）唸
  function owl(text, speak = true) {
    if (!ui) return;
    ui.bubble.textContent = text; ui.owl.classList.remove("hide"); ui.owl.classList.remove("pop"); void ui.owl.offsetWidth; ui.owl.classList.add("pop");
    if (speak) A.talk(text);
    clearTimeout(S.owlT); const my = tok; S.owlT = setTimeout(() => { if (alive(my) && ui && ui.bubble.textContent === text) ui.owl.classList.add("hide"); }, 3500 + text.length * 220);   // 講完過一下就收起來（不擋按鈕）
  }

  // ---------- 骨架 ----------
  function build() {
    root.innerHTML = "";
    const wrap = h("div", "tw-wrap");
    const sky = h("div", "tw-sky"); for (let i = 0; i < 4; i++) { const c = h("i", "tw-cloud"); c.style.setProperty("--i", i); sky.appendChild(c); } sky.appendChild(h("div", "tw-sea")); wrap.appendChild(sky);
    const head = h("div", "tw-head"); const title = h("div", "tw-title"); title.appendChild(h("span", "tw-title-ico", "🗼")); title.appendChild(h("span", "", UI.title)); head.appendChild(title);
    const mePill = h("div", "tw-mepill"); head.appendChild(mePill); wrap.appendChild(head);
    const body = h("div", "tw-body");
    const tbox = h("div", "tw-towerbox");
    const meter = h("div", "tw-meter"); tbox.appendChild(meter);
    const tower = h("div", "tw-tower"); tbox.appendChild(tower);
    body.appendChild(tbox);
    const side = h("div", "tw-side");
    const meCard = h("div", "tw-card tw-mecard"); side.appendChild(meCard);
    const boardCard = h("div", "tw-card tw-board"); side.appendChild(boardCard);
    const btns = h("div", "tw-btns");
    const go = h("button", "big-btn tw-go"); go.type = "button"; go.onclick = () => { if (S.phase !== "home") return; A.play("select"); startRun(); }; btns.appendChild(go);
    const rulesBtn = h("button", "tw-small tw-rulesbtn"); rulesBtn.type = "button"; rulesBtn.appendChild(h("span", "", "📜")); rulesBtn.appendChild(h("span", "", UI.rules)); rulesBtn.onclick = () => { A.play("tap"); openRules(); }; btns.appendChild(rulesBtn);
    side.appendChild(btns); body.appendChild(side); wrap.appendChild(body);
    const owlEl = h("div", "tw-owl hide"); const oi = h("img"); oi.src = A.owlImg; oi.alt = ""; owlEl.appendChild(oi); const bubble = h("div", "tw-bubble"); owlEl.appendChild(bubble);
    owlEl.onclick = () => { owlEl.classList.add("hide"); }; wrap.appendChild(owlEl);
    const ovs = h("div", "tw-ovs"); wrap.appendChild(ovs);
    root.appendChild(wrap);
    ui = { wrap, mePill, meter, tower, meCard, boardCard, go, owl: owlEl, bubble, ovs };
    relayout();
  }
  function relayout() { if (!ui) return; const land = innerWidth > innerHeight; ui.wrap.classList.toggle("tw-land", land); ui.wrap.classList.toggle("tw-port", !land); }

  // ---------- 主畫面 ----------
  const avatarEmoji = () => (T.code && C.codeOf(T.code) ? C.codeOf(T.code).e : (A.me().e || "🐻"));
  function renderHome() {
    if (!ui) return;
    const sf = C.startFloor(T);
    renderMe(); renderBoard();
    renderTower(C.segOf(sf), sf, { cp: T.cp, best: T.best });
    ui.go.innerHTML = ""; ui.go.appendChild(h("span", "", "▶️")); ui.go.appendChild(h("span", "", sf > 1 ? UI.from(sf) : UI.go));
  }
  function renderMe() {
    if (!ui) return;
    const cd = C.codeOf(T.code);
    // 上面的名字膠囊
    ui.mePill.innerHTML = "";
    ui.mePill.appendChild(h("span", "tw-mp-e", cd ? cd.e : "🏷️")); ui.mePill.appendChild(h("span", "tw-mp-n", cd ? cd.name : UI.noName));
    ui.mePill.classList.toggle("none", !cd);
    // 我的卡
    const mc = ui.meCard; mc.innerHTML = "";
    const row = h("div", "tw-mc-row"); row.appendChild(h("div", "tw-mc-e", avatarEmoji()));
    const nm = h("div", "tw-mc-nm"); nm.appendChild(h("div", "tw-mc-lbl", UI.myName)); nm.appendChild(h("div", "tw-mc-name" + (cd ? "" : " none"), cd ? cd.name : UI.noName)); row.appendChild(nm); mc.appendChild(row);
    const st = h("div", "tw-mc-st");
    const s1 = h("span", "tw-chip"); s1.appendChild(h("span", "", "🏔️")); s1.appendChild(h("span", "", `${UI.best} ${UI.floor(T.best)}`)); st.appendChild(s1);
    const s2 = h("span", "tw-chip"); s2.appendChild(h("span", "", "🚩")); s2.appendChild(h("span", "", `${UI.cp} ${UI.floor(T.cp)}`)); st.appendChild(s2);
    if (T.badges.length || T.crown) { const s3 = h("span", "tw-chip gold"); s3.appendChild(h("span", "", T.crown ? "👑" : "🏅")); s3.appendChild(h("span", "", `× ${T.badges.length}`)); st.appendChild(s3); }
    mc.appendChild(st);
    const gate = h("button", "tw-gate" + (cd ? " small" : "")); gate.type = "button";
    gate.appendChild(h("span", "tw-gate-ic", "👨‍👩‍👧")); const gt = h("span", "tw-gate-t"); gt.appendChild(h("span", "", UI.gate)); gt.appendChild(h("small", "", UI.gateHold)); gate.appendChild(gt); gate.appendChild(h("i", "tw-ring"));
    holdGate(gate, () => openPicker()); mc.appendChild(gate);
  }
  function renderBoard() {
    if (!ui) return;
    const bc = ui.boardCard; bc.innerHTML = "";
    const hd = h("div", "tw-bd-h"); hd.appendChild(h("span", "", "🏆")); hd.appendChild(h("span", "", UI.board)); bc.appendChild(hd);
    const list = h("ol", "tw-bd-list");
    if (!S.board) { bc.appendChild(h("div", "tw-bd-empty", !A.net() ? UI.boardOff : S.boardTried ? UI.offline : UI.loading)); return; }
    if (!S.board.length) { bc.appendChild(h("div", "tw-bd-empty", UI.boardEmpty)); return; }
    S.board.forEach((r, i) => {
      const cd = C.codeOf(r.c); if (!cd) return;
      const li = h("li", "tw-bd-row" + (r.c === T.code ? " me" : "")); li.appendChild(h("span", "tw-bd-rk", ["🥇", "🥈", "🥉", "4", "5"][i]));
      li.appendChild(h("span", "tw-bd-e", cd.e)); const nm = h("span", "tw-bd-nm", cd.name); if (r.c === T.code) nm.appendChild(h("small", "tw-bd-you", UI.you)); li.appendChild(nm);
      li.appendChild(h("span", "tw-bd-f", (r.f >= C.TOP ? "👑 " : "") + UI.floor(r.f))); list.appendChild(li);
    });
    bc.appendChild(list);
  }
  // 塔：這一段的 10 層（上面是 Boss）＋旁邊 1–100 的小量尺。cur＝現在要爬（或正在爬）的樓層
  function renderTower(seg, cur, { cp = T.cp, best = T.best, done = 0 } = {}) {
    if (!ui) return;
    const tw = ui.tower; tw.innerHTML = "";
    const cap = h("div", "tw-cap"); cap.appendChild(h("i", "tw-lamp")); cap.appendChild(h("i", "tw-roof")); tw.appendChild(cap);
    const lo = seg * 10 + 1;
    for (let f = lo + 9; f >= lo; f--) {
      const p = C.floorPlan(f), fl = h("div", "tw-fl" + ((f - lo) % 2 ? " odd" : "") + (p.boss ? " boss" : "") + (f <= Math.max(cp, done) ? " done" : f <= best ? " seen" : "") + (f === cur ? " cur" : "") + (f === cp && cp ? " cp" : ""));
      fl.dataset.f = f; fl.style.setProperty("--k", lo + 9 - f);   // 越上面越窄（燈塔的樣子）
      fl.appendChild(h("span", "tw-fl-n", String(f)));
      const ico = p.boss ? BOSS_ICO[p.kind] : p.teach ? "📖" : p.heal ? "💗" : (A.modeInfo(p.steps[0].mode).ico || "🎮");
      fl.appendChild(h("span", "tw-fl-ic", ico));
      if (f <= Math.max(cp, done)) fl.appendChild(h("span", "tw-fl-ok", "⭐"));
      if (p.boss && cp >= f) fl.appendChild(h("span", "tw-fl-flag", "🚩"));
      tw.appendChild(fl);
    }
    const base = h("div", "tw-base", `${UI.floor(lo)}～${UI.floor(lo + 9)}`); tw.appendChild(base);
    placeAvatar(cur);
    // 量尺：10 格（每格 10 層），塗到最高樓層，存檔點一面小旗
    const m = ui.meter; m.innerHTML = "";
    for (let s = 9; s >= 0; s--) { const c = h("i", "tw-m-seg" + (s === seg ? " on" : "")); c.style.setProperty("--fill", Math.max(0, Math.min(1, (best - s * 10) / 10)).toFixed(2)); m.appendChild(c); }
    const top = h("span", "tw-m-top", "👑"); m.appendChild(top);
    if (cp) { const fl = h("span", "tw-m-cp", "🚩"); fl.style.setProperty("--y", (cp / C.TOP).toFixed(3)); m.appendChild(fl); }
  }
  function placeAvatar(f) {
    if (!ui) return;
    let av = ui.wrap.querySelector(".tw-avatar"); const row = ui.tower.querySelector(`.tw-fl[data-f="${f}"]`);
    if (!row) { if (av) av.remove(); return; }
    const from = av ? av.getBoundingClientRect() : null;
    if (!av) { av = h("div", "tw-avatar"); av.appendChild(h("span", "tw-av-e", avatarEmoji())); }
    av.querySelector(".tw-av-e").textContent = avatarEmoji();
    row.appendChild(av);
    if (from && from.width) { const to = av.getBoundingClientRect(), dx = from.left - to.left, dy = from.top - to.top;
      if (Math.abs(dx) + Math.abs(dy) > 2) try { av.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px)`, offset: 0.55 }, { transform: "none" }], { duration: 650, easing: "ease-out" }); } catch (e) {} }
  }

  // ---------- 家長閘門（按住 2 秒；跟 ⚙️ 家長設定同一種）----------
  function holdGate(btn, onPass) {
    let hold = null, tipT = 0;
    const end = opened => { if (!hold) return; cancelAnimationFrame(hold.raf); hold = null; btn.classList.remove("holding"); btn.style.setProperty("--p", 0);
      if (opened) return; A.play("tap", 0.8); btn.classList.remove("nudge"); void btn.offsetWidth; btn.classList.add("nudge");
      btn.classList.add("tip"); clearTimeout(tipT); tipT = setTimeout(() => btn.classList.remove("tip"), 1800); };
    btn.addEventListener("pointerdown", e => {
      if (e.button > 0 || hold) return; e.preventDefault(); const t0 = performance.now(); btn.classList.add("holding");
      const step = now => { if (!hold) return; const p = Math.min(1, (now - t0) / 2000); btn.style.setProperty("--p", p.toFixed(3)); if (p >= 1) { end(true); onPass(); return; } hold.raf = requestAnimationFrame(step); };
      hold = { raf: requestAnimationFrame(step) };
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, () => end(false));
    btn.addEventListener("contextmenu", e => e.preventDefault());
  }

  // ---------- 覆蓋層 ----------
  function overlay(name, cls = "") {
    closeOverlay(); const ov = h("div", "tw-ov tw-ov-" + name + (cls ? " " + cls : "")); ov.dataset.ov = name; ui.ovs.appendChild(ov); S.ov = name;
    if (name !== "floor" && name !== "fall") ui.owl.classList.add("hide");   // 貓頭鷹只在樓層開場、降落傘時講話；其他卡片開著就先收起來（不擋按鈕）
    return ov;
  }
  function closeOverlay() { if (ui) ui.ovs.innerHTML = ""; S.ov = ""; }
  const card = (ov, cls = "") => { const c = h("div", "tw-ovc " + cls); ov.appendChild(c); return c; };
  function btn(label, cls, onclick, ico) { const b = h("button", cls); b.type = "button"; if (ico) b.appendChild(h("span", "", ico)); b.appendChild(h("span", "", label)); b.onclick = onclick; return b; }
  function openRules() {
    const ov = overlay("rules"), c = card(ov, "tw-rules");
    c.appendChild(h("div", "tw-ovt", "📜 " + UI.rules));
    const ul = h("ul", "tw-rl"); for (const [ic, t] of RULES) { const li = h("li"); li.appendChild(h("span", "tw-rl-ic", ic)); li.appendChild(h("span", "tw-rl-t", t)); ul.appendChild(li); } c.appendChild(ul);
    c.appendChild(btn(UI.ok, "big-btn", () => { A.play("select"); closeOverlay(); }, "👌"));
  }
  function openNotice() {
    const ov = overlay("notice"), c = card(ov, "tw-notice");
    c.appendChild(h("div", "tw-ovt", "🏷️ " + UI.lostT)); c.appendChild(h("div", "tw-ovd", UI.lostD));
    c.appendChild(btn(UI.ok, "big-btn", () => { A.play("select"); T.notice = ""; save(); closeOverlay(); }, "👌"));
    talkP(LINES.lost);
  }

  // ---------- 選名字（家長閘門後）----------
  async function openPicker() {
    A.play("select");
    const ov = overlay("pick"), c = card(ov, "tw-pick");
    c.appendChild(h("div", "tw-ovt", "🏷️ " + UI.pickT));
    if (!A.net()) { c.appendChild(h("div", "tw-ovd", UI.netOff)); c.appendChild(btn(UI.back, "big-btn alt small", () => { A.play("select"); closeOverlay(); }, "↩️")); return; }
    const msg = h("div", "tw-pk-msg", UI.loading); c.appendChild(msg);
    const grid = h("div", "tw-pk-grid"); c.appendChild(grid);
    const rules = h("div", "tw-pk-rules"); rules.appendChild(h("div", "", UI.pickRule1)); rules.appendChild(h("div", "", UI.pickRule2)); c.appendChild(rules);
    c.appendChild(h("div", "tw-pk-parent noann", PARENT_NOTE));
    const row = h("div", "tw-pk-btns");
    const okB = btn(UI.pickOk("", ""), "big-btn tw-pk-ok", () => claim()); okB.disabled = true; row.appendChild(okB);
    row.appendChild(btn(UI.back, "big-btn alt small", () => { A.play("select"); closeOverlay(); }, "↩️")); c.appendChild(row);
    S.pickSel = null;
    const my = tok;
    const draw = () => {
      grid.innerHTML = "";
      for (const [label, list] of [[UI.pickZodiac, C.CODES.slice(0, 12)], [UI.pickStars, C.CODES.slice(12)]]) {
        grid.appendChild(h("div", "tw-pk-sec", label));
        const g = h("div", "tw-pk-g");
        for (const cd of list) {
          const mine = cd.id === T.code, taken = !mine && S.taken.includes(cd.id);
          const b = h("button", "tw-pk-b" + (taken ? " taken" : "") + (mine ? " mine" : "") + (S.pickSel === cd.id ? " sel" : "")); b.type = "button"; b.dataset.c = cd.id;
          b.appendChild(h("span", "tw-pk-e", cd.e)); b.appendChild(h("span", "tw-pk-n", cd.name));
          if (taken) b.appendChild(h("span", "tw-pk-tag", UI.takenTag)); else if (mine) b.appendChild(h("span", "tw-pk-tag mine", UI.mineTag));
          b.onclick = () => {
            if (S.pickBusy) return;
            if (taken) { A.play("tap", 0.8); b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge"); return; }
            A.play("tap"); S.pickSel = cd.id; A.talk(cd.name); draw();
          };
          g.appendChild(b);
        }
        grid.appendChild(g);
      }
      const sel = C.codeOf(S.pickSel);
      okB.disabled = !sel || S.pickSel === T.code; okB.innerHTML = ""; okB.appendChild(h("span", "", "✅")); okB.appendChild(h("span", "", sel ? UI.pickOk(sel.e, sel.name) : UI.pickOk("", "").trim()));
    };
    draw();
    const raw = await A.board(true); if (!alive(my) || S.ov !== "pick") return;
    S.boardTried = true; if (raw) { const d = C.cleanBoard(raw); S.board = d.board; S.taken = d.taken; msg.textContent = ""; renderBoard(); } else msg.textContent = UI.offline;
    draw();
    async function claim() {
      const cd = C.codeOf(S.pickSel); if (!cd || S.pickBusy) return;
      S.pickBusy = true; okB.disabled = true; msg.textContent = UI.loading; A.play("select");
      const sec = T.sec || C.newSecret(), old = T.code && T.code !== cd.id ? T.code : "";
      const r = await A.post({ k: "tw_claim", c: cd.id, s: sec });
      S.pickBusy = false; if (!alive(my)) return;
      if (r && r.ok === true) {
        C.applyClaim(T, cd.id, sec, r.f, taipeiToday()); save();
        if (old) A.post({ k: "tw_leave", c: old, s: sec });   // 換名字：舊的放掉（送不到也沒關係，七天後自己過期）
        if (!S.taken.includes(cd.id)) S.taken.push(cd.id);
        closeOverlay(); renderHome(); owl(LINES.picked, true); A.play("unlock");
        await sync(); await loadBoard(true);
        return;
      }
      if (r && r.why === "taken") { if (!S.taken.includes(cd.id)) S.taken.push(cd.id); S.pickSel = null; msg.textContent = LINES.taken; A.talk(LINES.taken); draw(); return; }
      msg.textContent = r ? UI.busy : UI.offline; if (!r) A.talk(LINES.offline); draw();
    }
  }

  // ---------- 後端同步（每天一次 tw_ping、分數排隊重送）----------
  function sync() {
    if (S.syncing) return S.syncing;
    if (!A.net() || !T.code) return Promise.resolve(null);
    const my = tok;
    S.syncing = C.syncTower(T, b => A.post(b), taipeiToday()).then(r => {
      S.syncing = null; if (r && r.changed) save();
      if (r && r.lost && alive(my)) { if (S.phase === "home") { renderHome(); openNotice(); } }
      return r;
    }, () => { S.syncing = null; return null; });
    return S.syncing;
  }
  async function loadBoard(force) {
    const my = tok; const d = await A.board(force); if (!alive(my)) return;
    S.boardTried = true; if (d) { const b = C.cleanBoard(d); S.board = b.board; S.taken = b.taken; } renderBoard();
  }

  // ---------- 愛心 HUD（蓋在遊戲畫面上；pointer-events:none 不擋操作）----------
  function hudEnsure() {
    if (hud) return hud;
    hud = h("div", "tw-hud hidden"); hud.setAttribute("aria-hidden", "true");
    hud.appendChild(h("span", "tw-hud-f")); hud.appendChild(h("span", "tw-hud-h")); hud.appendChild(h("span", "tw-hud-x"));
    document.body.appendChild(hud); return hud;
  }
  function hudSet() {
    const r = S.run; if (!r) return; const el = hudEnsure();
    el.querySelector(".tw-hud-f").textContent = "🗼 " + r.floor;
    const hh = el.querySelector(".tw-hud-h"); hh.innerHTML = "";
    for (let i = 0; i < C.HEARTS; i++) hh.appendChild(h("i", "tw-ht" + (i < r.hearts.red ? "" : " off"), i < r.hearts.red ? "❤️" : "🤍"));
    for (let i = 0; i < r.hearts.gold; i++) hh.appendChild(h("i", "tw-ht gold", "💛"));
    const x = el.querySelector(".tw-hud-x"); x.textContent = r.mix ? UI.mix(r.mix[0], r.mix[1]) : r.plan && r.plan.teach ? UI.practice : "";
    x.classList.toggle("hidden", !x.textContent);
  }
  const hudShow = on => { hudEnsure().classList.toggle("hidden", !on); if (on) hudSet(); };
  // 掉心：那顆心變成泡泡往上飄走（不碎、不紅閃、不震）
  function heartBubble(fromEl) {
    const r = fromEl && fromEl.getBoundingClientRect(); if (!r || !r.width) return;
    const b = h("div", "tw-hbub"); b.appendChild(h("span", "", "❤️")); b.style.left = (r.left + r.width / 2) + "px"; b.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(b); setTimeout(() => b.remove(), 2200);
  }
  function loseHeart() {
    const r = S.run; if (!r || C.heartsLeft(r.hearts) <= 0) return;
    const hs = hudEnsure().querySelectorAll(".tw-ht:not(.off)"), last = r.hearts.red > 0 ? [...hs].filter(x => !x.classList.contains("gold")).pop() : [...hs].pop();
    heartBubble(last); A.play("pop", 0.75);
    r.hearts = C.loseHeart(r.hearts); r.lost++; hudSet();
    if (C.heartsLeft(r.hearts) <= 0) { r.failing = true; if (S.cur) try { S.cur.abort(); } catch (e) {} }
  }

  // ---------- 一場挑戰 ----------
  async function startRun() {
    const my = tok; closeOverlay();
    const sf = C.startFloor(T), gold = C.goldFor(T, sf);
    S.run = { start: sf, floor: sf, reached: sf - 1, hearts: C.newHearts(gold), played: false, stars: 0, coins: 0, badges: [], lost: 0, failing: false, mix: null, plan: null };
    S.phase = "run"; ui.wrap.classList.add("tw-running");   // 爬塔中：主畫面的開始鈕、家長閘門先藏起來（不會誤按）
    if (!T.seen) { T.seen = 1; save(); await talkP(LINES.hearts); if (!alive(my)) return; }
    if (gold) { owl(LINES.gift, false); A.play("unlock"); await talkP(LINES.gift); if (!alive(my)) return; }
    while (alive(my) && S.run) {
      const r = S.run, plan = C.floorPlan(r.floor); r.plan = plan;
      const go = await floorIntro(plan, my); if (!alive(my)) return;
      if (!go) return endRun("rest");
      const res = await playPlan(plan, my); if (!alive(my)) return;
      if (res === "fail") return fall();
      if (res === "abort") return endRun("rest");
      // 過關
      const rw = C.clearFloor(T, plan.f); r.reached = plan.f; save();
      if (rw.star) { r.stars++; A.give({ stars: 1 }); }
      if (rw.coin) { r.coins++; A.give({ coins: 1 }); r.badges.push(rw.badge); }
      if (plan.boss) {
        r.hearts = C.refillHearts(r.hearts); sync();
        if (plan.f >= C.TOP) return summit(rw);
        const cont = await bossDone(plan, rw, my); if (!alive(my)) return;
        if (!cont) return endRun("rest");
      } else { await floorDone(plan, rw, my); if (!alive(my)) return; }
      r.floor = plan.f + 1;
    }
  }
  // 樓層開場卡：第幾層、玩什麼、這層的新東西、愛心；按「出發」或幾秒後自動開始。回 true＝開始
  async function floorIntro(plan, my) {
    const r = S.run; S.phase = "intro"; hudShow(false); A.showTower();
    renderMe(); renderTower(plan.seg, plan.f, { cp: T.cp, best: T.best, done: plan.f - 1 });
    const ov = overlay("floor"), c = card(ov, "tw-fi" + (plan.boss ? " boss" : ""));
    c.appendChild(h("div", "tw-fi-num", UI.floor(plan.f)));
    const g = h("div", "tw-fi-game");
    if (plan.boss) { g.appendChild(h("span", "tw-fi-ico", BOSS_ICO[plan.kind])); g.appendChild(h("span", "tw-fi-nm", plan.kind === "bubble" ? UI.bossBubble : plan.kind === "mix" ? UI.bossMix : UI.bossFinal)); }
    else { const mi = A.modeInfo(plan.steps[0].mode); g.appendChild(h("span", "tw-fi-ico", mi.ico)); g.appendChild(h("span", "tw-fi-nm", mi.name)); }
    c.appendChild(g);
    const tags = h("div", "tw-fi-tags"), st = plan.steps[0], tag = (ic, t) => { const x = h("span", "tw-tag"); x.appendChild(h("span", "", ic)); x.appendChild(h("span", "", t)); tags.appendChild(x); };
    if (plan.teach) tag("📖", UI.practice);
    const healed = plan.heal && r.hearts.red < C.HEARTS;   // 第 5、15…層：開場就補（新的那顆彈出來）
    if (healed) { tag("💗", UI.heal); r.hearts = C.healHeart(r.hearts); }
    if (st.type === "floor" && st.timer === "silver") tag("⏳", UI.sand);
    if (plan.steps.some(s => s.timer === "heart")) tag("⏳", UI.time);
    if (st.type === "floor" && st.lv >= 4 && (st.mode === "fish" || st.mode === "tone")) tag("🏃", UI.move);
    if (plan.steps.some(s => s.extra && s.extra.flash)) tag("🙈", UI.flash);
    if (plan.steps.some(s => s.extra && s.extra.noPic)) tag("👂", UI.ears);
    if (tags.children.length) c.appendChild(tags);
    const hearts = h("div", "tw-fi-hearts"); c.appendChild(hearts);
    const drawHearts = () => { hearts.innerHTML = ""; for (let i = 0; i < C.HEARTS; i++) hearts.appendChild(h("i", "tw-ht" + (i < r.hearts.red ? "" : " off"), i < r.hearts.red ? "❤️" : "🤍")); for (let i = 0; i < r.hearts.gold; i++) hearts.appendChild(h("i", "tw-ht gold", "💛")); };
    drawHearts();
    if (healed) { const reds = hearts.querySelectorAll(".tw-ht:not(.off):not(.gold)"); if (reds.length) reds[reds.length - 1].classList.add("grow"); }
    let started = false, release = null;
    const goB = btn(UI.go, "big-btn tw-start", () => { if (started) return; started = true; A.play("select"); if (release) release(true); }, "▶️"); c.appendChild(goB);
    const tapped = new Promise(res => { release = res; });
    // 這層要說的話（教學層＝這段的新東西；補心；Boss）
    const talks = [];
    if (plan.boss) talks.push(plan.kind === "bubble" ? LINES.bossBubble : plan.kind === "mix" ? LINES.bossMix : LINES.bossFinal);
    else if (plan.teach) { if (SEG_LINE[plan.key]) talks.push(LINES[SEG_LINE[plan.key]]); talks.push(LINES.practice); }
    const said = (async () => {
      if (healed) { A.play("star"); await talkP(LINES.heal, 3000, my); }
      for (const t of talks) { if (!alive(my)) return; owl(t, false); await talkP(t, 8000, my); }
    })();
    const auto = (async () => { await said; if (!alive(my)) return false; return wait(talks.length ? 2500 : 2200, my); })();
    const ok = await Promise.race([tapped, auto]);
    if (!alive(my)) return false;
    started = true; if (ui) ui.owl.classList.add("hide");
    if (ok !== false) A.stopVoice();
    closeOverlay();
    return ok !== false;
  }
  // 玩這層的每一步：回 "clear"｜"fail"｜"abort"
  async function playPlan(plan, my) {
    const r = S.run; S.phase = "play"; r.failing = false;
    const floorSteps = plan.steps.filter(s => s.type === "floor").length; let fi = 0;
    for (const step of plan.steps) {
      if (!alive(my)) return "abort";
      r.mix = plan.kind !== "normal" && step.type === "floor" && floorSteps > 1 ? [++fi, floorSteps] : null;
      hudShow(true);
      const onEvent = ev => {
        if (!alive(my) || !ev || r.failing) return;
        if (ev.type === "gold" || ev.type === "silver") r.played = true;
        if (ev.type === "wrong" || ev.type === "timeout" || ev.type === "press") r.played = true;
        if (C.costsHeart(plan, step, ev)) loseHeart();
      };
      let hd = null;
      try {
        if (step.type === "bubble") hd = A.playBubbleBoss({ level: step.level, ceilingEvery: step.every, onEvent }) || stubBubble({ level: step.level, ceilingEvery: step.every, onEvent });
        else hd = A.playFloor({ mode: step.mode, n: step.n, lv: step.lv, timer: step.timer, extra: { ...step.extra }, onEvent }) || stubFloor({ mode: step.mode, n: step.n, lv: step.lv, timer: step.timer, extra: step.extra, onEvent });
      } catch (e) { console.warn("[tower] playFloor", e); hd = null; }
      if (!hd || !hd.done) { hudShow(false); return "abort"; }
      S.cur = hd;
      let res = null; try { res = await hd.done; } catch (e) { console.warn("[tower] floor", e); res = { aborted: true }; }
      S.cur = null; if (!alive(my)) return "abort";
      r.played = true;
      if (r.failing || C.heartsLeft(r.hearts) <= 0) { hudShow(false); A.showTower(); return "fail"; }
      if (!res || res.aborted) { hudShow(false); A.showTower(); return "abort"; }
      if (step.type === "bubble" && res.cleared === false) { hudShow(false); A.showTower(); return "abort"; }
    }
    hudShow(false); A.showTower(); r.mix = null;
    return "clear";
  }
  // 一般樓層過關：小人往上跳一層、5 的倍數第一次送星星
  async function floorDone(plan, rw, my) {
    S.phase = "clear";
    renderTower(plan.seg, plan.f, { cp: T.cp, best: T.best, done: plan.f - 1 });
    A.play("ok", 1.2);
    const next = plan.f + 1; await wait(250, my); if (!alive(my)) return;
    const row = ui.tower.querySelector(`.tw-fl[data-f="${plan.f}"]`); if (row) { row.classList.add("done", "pop"); if (!row.querySelector(".tw-fl-ok")) row.appendChild(h("span", "tw-fl-ok", "⭐")); }
    if (C.segOf(next) === plan.seg) placeAvatar(next);
    if (rw.star) { toast("⭐ +1"); A.play("star"); await talkP(LINES.star5, 4000, my); }
    await wait(rw.star ? 400 : 900, my);
  }
  // Boss 過關：存檔點、補滿愛心、第一次給扭蛋幣＋徽章；問「繼續爬／先休息」→ 回 true＝繼續
  async function bossDone(plan, rw, my) {
    S.phase = "boss";
    renderTower(plan.seg, plan.f, { cp: T.cp, best: T.best, done: plan.f });
    A.play("party");
    const ov = overlay("boss"), c = card(ov, "tw-bw");
    c.appendChild(h("div", "tw-bw-ic", "🎉"));
    c.appendChild(h("div", "tw-ovt", `${UI.floor(plan.f)} ${UI.savePoint}`));
    const rew = h("div", "tw-rew");
    const chip = (ic, t, cls = "") => { const x = h("span", "tw-chip big " + cls); x.appendChild(h("span", "", ic)); x.appendChild(h("span", "", t)); rew.appendChild(x); };
    chip("❤️", UI.heal + " ×3"); if (rw.badge) chip("🏅", UI.floor(rw.badge), "gold"); if (rw.coin) chip("🪙", "+1", "gold"); if (rw.star) chip("⭐", "+1", "gold");
    c.appendChild(rew);
    const row = h("div", "tw-bw-btns"); let pick = null; const chosen = new Promise(res => { pick = res; });
    row.appendChild(btn(UI.climb, "big-btn tw-climb", () => { A.play("select"); pick(true); }, "⬆️"));
    row.appendChild(btn(UI.restBtn, "big-btn alt small tw-restb", () => { A.play("select"); pick(false); }, "☕"));
    c.appendChild(row);
    (async () => { await talkP(LINES.bossWin, 5000, my); if (rw.coin) await talkP(LINES.badge, 5000, my); if (alive(my) && S.ov === "boss") A.talk(LINES.ask); })();
    const v = await chosen; if (!alive(my)) return false; A.stopVoice(); closeOverlay(); return v;
  }
  // 登頂
  async function summit(rw) {
    const my = tok; S.phase = "summit"; A.play("party");
    const ov = overlay("summit"), c = card(ov, "tw-bw tw-summit");
    c.appendChild(h("div", "tw-bw-ic", "👑")); c.appendChild(h("div", "tw-ovt", UI.summitT));
    const rew = h("div", "tw-rew"); for (const [ic, t] of [["🏅", UI.floor(100)], ...(rw.coin ? [["🪙", "+1"]] : []), ...(rw.star ? [["⭐", "+1"]] : [])]) { const x = h("span", "tw-chip big gold"); x.appendChild(h("span", "", ic)); x.appendChild(h("span", "", t)); rew.appendChild(x); }
    c.appendChild(rew); confetti(c);
    await talkP(LINES.summit, 6000, my); if (!alive(my)) return;
    await wait(1200, my); if (!alive(my)) return;
    endRun("summit");
  }
  // 愛心用完：撐降落傘飄回存檔點（愛心變泡泡飄走；不出現 GAME OVER）
  async function fall() {
    const my = tok, r = S.run; S.phase = "fall"; hudShow(false); A.showTower(); A.stopVoice();
    renderTower(C.segOf(r.floor), r.floor, { cp: T.cp, best: T.best, done: r.floor - 1 });
    const ov = overlay("fall"); const box = h("div", "tw-fall");
    const p = h("div", "tw-para"); p.appendChild(h("span", "tw-para-c", "🪂")); p.appendChild(h("span", "tw-para-e", avatarEmoji())); box.appendChild(p);
    ov.appendChild(box);
    // 從小人現在的位置（這層）飄到存檔點那層（不在這一段＝飄到塔底）；愛心從小人身邊變泡泡往上飄
    const wr = ui.wrap.getBoundingClientRect(), av = ui.wrap.querySelector(".tw-avatar"), ar = av ? av.getBoundingClientRect() : null;
    const dest = ui.tower.querySelector(`.tw-fl[data-f="${T.cp}"]`) || ui.tower.querySelector(".tw-base"), dr = dest ? dest.getBoundingClientRect() : null;
    const x0 = ar ? ar.left + ar.width / 2 - wr.left : wr.width / 2, y0 = ar ? ar.top - wr.top - ar.height : wr.height * 0.1;
    const x1 = dr ? dr.right - wr.left + (ar ? ar.width : 40) * 0.2 : x0, y1 = dr ? dr.top + dr.height / 2 - wr.top - (ar ? ar.height * 1.4 : 0) : wr.height * 0.6;
    try { p.animate([{ left: x0 + "px", top: y0 + "px" }, { left: x1 + "px", top: y1 + "px" }], { duration: 3200, easing: "ease-in-out", fill: "forwards" }); } catch (e) {}
    p.style.left = x1 + "px"; p.style.top = y1 + "px";
    for (let i = 0; i < 3; i++) { const b = h("span", "tw-fbub", "❤️"); b.style.setProperty("--i", i); b.style.left = (x0 + (i - 1) * 40) + "px"; b.style.top = (y0 + 40) + "px"; box.appendChild(b); }
    if (av) av.classList.add("gone");
    A.play("whoosh"); owl(LINES.slip, false);
    await talkP(LINES.slip, 5000, my); if (!alive(my)) return;
    await wait(1200, my); if (!alive(my)) return;
    endRun("fail");
  }
  // 一場結束 → 結算（一座塔：這次的旗子、上次的半透明旗子）
  function endRun(kind) {
    const my = tok, r = S.run; if (!r) return;
    S.run = null; S.phase = "result"; hudShow(false); A.showTower(); if (S.cur) { try { S.cur.abort(); } catch (e) {} S.cur = null; }
    if (ui) ui.wrap.classList.remove("tw-running");
    const out = C.endRun(T, { reached: r.reached, floor: r.floor, played: r.played, stars: r.stars }, kind === "summit" ? "rest" : kind, taipeiToday());
    if (out.guarantee) { r.stars++; A.give({ stars: 1 }); }
    save(); sync();
    const sf = C.startFloor(T);
    renderHome();
    const ov = overlay("result"), c = card(ov, "tw-res");
    // 左：一座塔（1–100），旗子
    const mini = h("div", "tw-mini");
    for (let s = 9; s >= 0; s--) mini.appendChild(h("i", "tw-mini-s" + (s % 2 ? " odd" : "")));
    mini.appendChild(h("span", "tw-mini-top", "👑"));
    const flag = (n, cls, ico) => { const f = h("span", "tw-flag " + cls); f.appendChild(h("span", "tw-flag-i", ico)); f.appendChild(h("span", "tw-flag-n", String(n))); f.style.setProperty("--y", (Math.max(0, n) / C.TOP).toFixed(3)); mini.appendChild(f); };
    if (out.prev > 0 && out.prev !== r.reached) flag(out.prev, "prev", "🏳️");   // 上次的旗子插在塔的左邊（跟這次的不會疊在一起）
    flag(r.reached, "now", "🚩");
    c.appendChild(mini);
    // 右：字＋獎勵＋按鈕
    const info = h("div", "tw-res-info");
    info.appendChild(h("div", "tw-ovt", kind === "summit" ? "👑 " + UI.summitT : kind === "rest" ? "☕ " + UI.restT : "🪂 " + UI.thisTime(r.reached)));
    const higher = r.reached - out.prev, first = out.prev === 0 && r.reached > 0 && T.runs <= 1;
    if (kind !== "fail" && r.reached > 0 && !first) info.appendChild(h("div", "tw-res-l", UI.thisTime(r.reached)));
    if (out.prev > 0 && higher > 0) info.appendChild(h("div", "tw-res-l good", "📈 " + UI.higherBy(higher)));
    else if (first) info.appendChild(h("div", "tw-res-l good", "🎉 " + UI.firstTry(r.reached)));
    if (r.reached < C.TOP) info.appendChild(h("div", "tw-res-l", "🎯 " + UI.toBoss(C.nextBoss(r.reached) - r.reached)));
    info.appendChild(h("div", "tw-res-l", "🚩 " + UI.nextFrom(sf)));
    if (r.stars || r.coins || r.badges.length) {
      const rew = h("div", "tw-rew");
      const chip = (ic, t) => { const x = h("span", "tw-chip big gold"); x.appendChild(h("span", "", ic)); x.appendChild(h("span", "", t)); rew.appendChild(x); };
      if (r.stars) chip("⭐", "+" + r.stars); if (r.coins) chip("🪙", "+" + r.coins); for (const b of r.badges) chip("🏅", UI.floor(b));
      info.appendChild(rew);
    }
    const tip = kind === "fail" && out.lose >= 2;
    const row = h("div", "tw-res-btns");
    row.appendChild(btn(kind === "rest" ? UI.climb : UI.again, "big-btn tw-again", () => { A.play("select"); closeOverlay(); S.phase = "home"; startRun(); }, kind === "rest" ? "⬆️" : "🔁"));
    const sub = h("div", "tw-res-sub");
    if (tip) sub.appendChild(btn(UI.bubble, "tw-small tw-tobubble", () => { A.play("select"); A.exit("bubble"); }, "🐧"));
    sub.appendChild(btn(UI.other, "tw-small tw-other", () => { A.play("select"); A.exit("menu"); }, "🏝️"));
    row.appendChild(sub); info.appendChild(row);
    if (tip) info.appendChild(h("div", "tw-res-tip", LINES.bubbleTip));
    c.appendChild(info);
    (async () => {
      if (kind === "fail" && higher > 0 && out.prev > 0) await talkP(LINES.higher, 4000, my);
      else if (kind === "rest") await talkP(LINES.rest, 4000, my);
      if (out.guarantee && alive(my)) { toast("⭐ +1"); await talkP(LINES.guarantee, 4000, my); }
      if (tip && alive(my)) await talkP(LINES.bubbleTip, 5000, my);
    })();
    // 結算後回到塔主畫面的狀態（按「再爬一次」從存檔點開始）
    S.phase = "result";
  }
  function toast(t) { if (!ui) return; const x = h("div", "tw-toast", t); ui.wrap.appendChild(x); setTimeout(() => x.remove(), 1800); }
  function confetti(host) { for (let i = 0; i < 26; i++) { const p = h("i", "tw-cf"); p.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "%"); p.style.setProperty("--d", (Math.random() * 0.8).toFixed(2) + "s"); p.style.setProperty("--c", ["#ff6b6b", "#ffd54a", "#4fb6f0", "#7ad66b", "#b583f2"][i % 5]); host.appendChild(p); } }

  // ---------- 模擬版（主程式的 playFloor／playBubbleBoss 還沒接上時；也給測試用）----------
  function stubPanel(title) {
    const ov = overlay("stub"), c = card(ov, "tw-stub"); c.appendChild(h("div", "tw-ovt", "🧪 " + UI.stubT + "：" + title)); return c;
  }
  function stubFloor(o) {
    const my = tok, mi = A.modeInfo(o.mode); let q = 0, wrongQ = 0, timedQ = -1, fin = null;
    const res = { golds: 0, silvers: 0, wrongs: 0, timeouts: 0, aborted: false };
    const done = new Promise(r => { fin = r; });
    const c = stubPanel(`${mi.ico} ${mi.name}`), info = h("div", "tw-stub-q"); c.appendChild(info);
    const row = h("div", "tw-stub-btns"); c.appendChild(row);
    const draw = () => { info.textContent = UI.stubQ(q + 1, o.n); };
    const end = () => { if (S.ov === "stub") closeOverlay(); S.stub = null; fin({ ...res }); };
    row.appendChild(btn(UI.stubOk, "big-btn tw-stub-ok", () => { if (!alive(my)) return; const g = wrongQ === 0 && timedQ !== q; if (g) res.golds++; else res.silvers++; o.onEvent({ type: g ? "gold" : "silver", q }); q++; wrongQ = 0; if (q >= o.n) end(); else draw(); }, "✅"));
    row.appendChild(btn(UI.stubNg, "big-btn alt tw-stub-ng", () => { if (!alive(my)) return; res.wrongs++; wrongQ++; o.onEvent({ type: "wrong", q }); }, "❌"));
    if (o.timer !== "off") row.appendChild(btn(UI.stubTime, "big-btn alt tw-stub-time", () => { if (!alive(my) || timedQ === q) return; timedQ = q; res.timeouts++; if (o.timer === "heart") o.onEvent({ type: "timeout", q }); }, "⏰"));   // silver：沙漏跑完只變銀（不發事件，這題答對算銀星）
    draw(); S.stub = { kind: "floor", mode: o.mode, n: o.n, lv: o.lv, timer: o.timer, extra: o.extra };
    return { done, abort() { res.aborted = true; end(); } };
  }
  function stubBubble(o) {
    const my = tok; let fin = null; const res = { cleared: false, shots: 0, presses: 0, aborted: false };
    const done = new Promise(r => { fin = r; });
    const c = stubPanel(`🫧 ${UI.bossBubble}`), row = h("div", "tw-stub-btns"); c.appendChild(row);
    const end = () => { if (S.ov === "stub") closeOverlay(); S.stub = null; fin({ ...res }); };
    row.appendChild(btn(UI.stubWin, "big-btn tw-stub-win", () => { if (!alive(my)) return; res.cleared = true; end(); }, "🎉"));
    row.appendChild(btn(UI.stubPress, "big-btn alt tw-stub-press", () => { if (!alive(my)) return; res.presses++; o.onEvent({ type: "press" }); }, "💥"));
    S.stub = { kind: "bubble", level: o.level, every: o.ceilingEvery };
    return { done, abort() { res.aborted = true; end(); } };
  }

  // ---------- 對外 ----------
  async function start(opts = {}) {
    tok++; const my = tok;
    T = C.cleanTower(A.load()); S.run = null; S.cur = null; S.phase = "home"; S.board = null;
    build(); renderHome();
    if (T.notice === "lost") openNotice();
    else if (!T.runs && opts.intro !== false) { owl(LINES.intro, false); talkP(LINES.intro, 7000, my).then(ok => { if (ok && alive(my) && !T.code && S.phase === "home") owl(LINES.noName, true); }); }
    else if (!T.code && A.net()) owl(LINES.noName, false);
    loadBoard(false);
    const r = await sync(); if (!alive(my)) return;
    if (r && (r.changed || r.sent)) { if (S.phase === "home") renderHome(); loadBoard(true); }
  }
  function stop() {
    tok++;
    if (S.cur) { try { S.cur.abort(); } catch (e) {} S.cur = null; }
    S.run = null; S.phase = "idle"; S.stub = null; if (ui) ui.wrap.classList.remove("tw-running");
    if (hud) hud.classList.add("hidden");
    try { A.stopVoice(); } catch (e) {}
    if (ui) { ui.ovs.innerHTML = ""; }
  }
  function state() {
    const r = S.run;
    return { phase: S.phase, ov: S.ov, floor: r ? r.floor : 0, hearts: r ? { ...r.hearts } : null, reached: r ? r.reached : 0, stars: r ? r.stars : 0,
      code: T.code, cp: T.cp, best: T.best, last: T.last, sent: T.sent, badges: T.badges.slice(), crown: T.crown, notice: T.notice,
      stub: S.stub ? { ...S.stub } : null, board: S.board ? S.board.slice() : null, taken: S.taken.slice(), hud: !!hud && !hud.classList.contains("hidden") };
  }
  return { start, stop, relayout, state, debug: { get T() { return T; }, plan: f => C.floorPlan(f), sync, openPicker, loadBoard } };
}
