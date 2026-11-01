// 注音小島 v8 我的家（docs/zhuyin-v8-plan.md §3；10-31 阿葉「照建議」）
// 房子看「從開工那天起拿到的星星」自動長大（不花掉）：帳篷 → 小木屋 → 磚頭房子 → 兩層樓 → 城堡 → 金色城堡；
// 花園小舖用「我的星星」（錢包＝主程式的 save.tops.stars，跟陀螺共用）買裝飾、自己擺在前院；信箱每天一封貓頭鷹的信。
// 3D（房子、前院、信箱）在 js/zhuyin-hub3d.js（setHome／homeEdit／playHomeUpgrade）；這裡管資料、規則和畫面上的面板。
// 規則：不扣東西——房子只看「拿到」的星星（花掉不會變小）；買東西要點兩顆不同的鈕；買過的永遠是你的（收進倉庫、換位置都不再收錢）；當天買的可以原價退。

// ---------- 資料 ----------
export const HOME_LV = [0, 10, 50, 130, 250, 400];      // 第 1..6 級要幾點（點數＝開工那天起拿到的星星）
export const HOME_NAME = ["", "帳篷", "小木屋", "磚頭房子", "兩層樓", "城堡", "金色城堡"];
export const HOME_STEP = 10;                             // 兩級之間每 10 點多一樣工地零件
export const YARD_N = 10;
export const yardCap = lv => (lv >= 5 ? 10 : lv >= 3 ? 8 : 6);
export const GARDEN_LV = 2;                              // 房子變小木屋才開花園小舖（新的小孩第一天不要一次塞太多新東西）
// 花園小舖（id＝js/zhuyin-hub3d.js GARDEN3D 的鍵；e＝3D 圖示還沒畫好時先用的 emoji）
export const GARDEN = [
  { id: "fl_red", name: "紅花圃", e: "🌺", price: 3 }, { id: "fl_yellow", name: "黃花圃", e: "🌼", price: 3 },
  { id: "mushroom", name: "蘑菇", e: "🍄", price: 3 }, { id: "stones", name: "石頭路", e: "⚪", price: 3 },
  { id: "sunflower", name: "向日葵", e: "🌻", price: 5 }, { id: "tulip", name: "鬱金香", e: "🌷", price: 5 },
  { id: "tree", name: "小樹", e: "🌳", price: 5 }, { id: "fence", name: "小籬笆", e: "🚧", price: 5 },
  { id: "swing", name: "鞦韆", e: "🎠", price: 8 }, { id: "slide", name: "溜滑梯", e: "🎢", price: 8 },
  { id: "lamp", name: "路燈", e: "💡", price: 8 }, { id: "scarecrow", name: "稻草人", e: "👒", price: 8 },
  { id: "pond", name: "小池塘", e: "🦆", price: 12 }, { id: "fountain", name: "噴水池", e: "⛲", price: 12 },
  { id: "arch", name: "彩虹門", e: "🌈", price: 20 },
  { id: "gramophone", name: "留聲機", e: "📻", price: 12, max: 1 },   // v8 第二批：點了打開唱片牆（主程式 onHomeItem）；第一次買到送一張唱片（api.onBuy）；一個存檔只能有 1 台
];
export const GARDEN_BY_ID = Object.fromEntries(GARDEN.map(g => [g.id, g]));
export const maxOf = id => (GARDEN_BY_ID[id] && GARDEN_BY_ID[id].max) || 9;   // 一樣東西最多幾個（留聲機 1 台，其他 9 個）
export const GIFT = "fl_red";                            // 第一次打開花園小舖送的
// 貓頭鷹的信（每天一封，照日期輪流；固定句子＝之後可以預錄配音）
export const LETTERS = [
  "早安！今天也要開開心心玩遊戲喔！", "你的家越來越漂亮了，大家都好羨慕！", "貓頭鷹老師說：你今天也很棒！",
  "花園裡的花開了，快去看看吧！", "今天天氣很好，帶夥伴出去走走吧！", "記得多喝水，休息一下眼睛喔！",
  "小島上的動物朋友都在等你！", "你知道嗎？注音符號有三十七個喔！", "今天想蓋什麼呢？玩遊戲就能蓋房子喔！",
  "謝謝你每天來小島，我們好開心！", "試試看沒玩過的遊戲吧！", "晚上記得早點睡覺，明天見！",
  "你的夥伴說：最喜歡你了！", "每天練習一點點，就會越來越厲害！",
];
export const LINES = {
  welcome: "這是你的家！玩遊戲房子會變大喔！",   // 貓頭鷹對話框最多兩行（再長會擋到浮標）
  building: "還在蓋喔！", almost: "快蓋好了！", done: "金色城堡蓋好了！好厲害！",
  gardenOpen: "可以布置花園囉！點一下房子看看！", gardenLocked: "房子變成小木屋，就能布置花園喔！",
  gift: "送你一個紅花圃！點一下花圃，再點一個格子，就放好了！",
  poor: "再玩一下遊戲，就能買囉！", full: "前院滿了，先放倉庫囉！", refund: "退回去了，星星還給你！",
  mailNew: "信箱有一封信喔！", mailRead: "今天的信看過囉，明天再來看看！",
  wallet: "你的星星可以玩陀螺、買花園的東西！",
};
export const upLine = lv => `你的家變成${HOME_NAME[lv]}了！`;
// 貓頭鷹對話框上寫的短版（一行）：選單擺鏡頭時對話框只留一行的空間，寫兩行會擋到浮標；聲音照樣唸完整的那句
export const SHORT = { welcome: "這是你的家！", gardenOpen: "可以布置花園囉！", up: lv => `變成${HOME_NAME[lv]}了！` };

// ---------- 存檔 ----------
// { base 開工那天的累積星星（save.stars）, lv 已經看過升級演出的級 1..6, own { 裝飾: 幾個 }, yard [YARD_N 格：裝飾 id 或 null],
//   today { day 日期, n { 裝飾: 今天買了幾個 } }（當天可以退）, mail 最後讀信的日期, gift 送過花圃了, flag 打倒過守塔怪（門口燈塔小旗）, hi 打過招呼了 }
export function cleanHome(d, stars) {
  const S = Math.max(0, Math.floor(+stars) || 0);
  const out = { base: S, lv: 1, own: {}, yard: Array(YARD_N).fill(null), today: { day: "", n: {} }, mail: "", gift: 0, flag: 0, hi: 0 };
  if (!d || typeof d !== "object") return out;
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(+v) || 0));
  out.base = Number.isFinite(+d.base) && d.base !== null && d.base !== "" ? num(d.base, 0, S) : S;   // 比現在的累積星星還多／沒有這欄＝壞資料：當作今天開工（不然老玩家一開就是金色城堡）
  out.lv = num(d.lv, 1, 6);
  if (d.own && typeof d.own === "object") for (const g of GARDEN) { const n = num(d.own[g.id], 0, maxOf(g.id)); if (n) out.own[g.id] = n; }
  if (Array.isArray(d.yard)) { const used = {}; for (let i = 0; i < YARD_N; i++) { const id = d.yard[i]; if (typeof id === "string" && out.own[id] && (used[id] || 0) < out.own[id]) { out.yard[i] = id; used[id] = (used[id] || 0) + 1; } } }
  if (d.today && typeof d.today === "object" && typeof d.today.day === "string" && /^\d{4}-\d\d-\d\d$/.test(d.today.day)) {
    out.today.day = d.today.day; if (d.today.n && typeof d.today.n === "object") for (const g of GARDEN) { const n = Math.min(num(d.today.n[g.id], 0, 9), out.own[g.id] || 0); if (n) out.today.n[g.id] = n; }
  }
  if (typeof d.mail === "string" && /^\d{4}-\d\d-\d\d$/.test(d.mail)) out.mail = d.mail;
  for (const k of ["gift", "flag", "hi"]) if (d[k]) out[k] = 1;
  return out;
}
// 現在幾點、幾級、工地零件幾樣、到下一級的進度（0..1）
export function homeInfo(h, stars) {
  const pts = Math.max(0, (Math.floor(+stars) || 0) - h.base);
  let lv = 1; while (lv < 6 && pts >= HOME_LV[lv]) lv++;
  if (lv >= 6) return { pts, lv: 6, part: 0, frac: 1, max: true };
  const lo = HOME_LV[lv - 1], hi = HOME_LV[lv];
  return { pts, lv, part: Math.floor((pts - lo) / HOME_STEP), frac: (pts - lo) / (hi - lo), max: false };
}
export const placed = (h, id) => h.yard.filter(x => x === id).length;
export const spare = (h, id) => (h.own[id] || 0) - placed(h, id);   // 倉庫裡（沒擺出來）的有幾個
export const refundable = (h, id, day) => h.today.day === day && (h.today.n[id] || 0) > 0 && spare(h, id) > 0;
function buyItem(h, id, day) {
  if (h.today.day !== day) h.today = { day, n: {} };
  h.own[id] = Math.min(maxOf(id), (h.own[id] || 0) + 1); h.today.n[id] = (h.today.n[id] || 0) + 1;
}
function refundItem(h, id, day) {
  if (!refundable(h, id, day)) return 0;
  h.own[id]--; if (!h.own[id]) delete h.own[id]; h.today.n[id]--; if (!h.today.n[id]) delete h.today.n[id];
  return GARDEN_BY_ID[id].price;
}
// 一排磚頭進度條（不寫數字、不寫「星星」：錢包才有⭐數字，免得小孩搞混）。
// 最後一塊照剩下的進度畫一部分（拿 1 點也看得出來）；尾巴放下一級房子的灰色剪影（看得到「下一個是什麼」才會想再玩）——櫻木 10-31
export const HOME_ICON = ["", "⛺", "🛖", "🏠", "🏡", "🏰", "🏯"];
export function brickBar(frac, n = 8, nextLv = 0) {
  const b = document.createElement("span"); b.className = "hm-bricks"; b.setAttribute("aria-hidden", "true");
  for (let i = 0; i < n; i++) b.appendChild(document.createElement("i"));
  if (nextLv && HOME_ICON[nextLv]) { const g = document.createElement("em"); g.className = "hm-next"; g.textContent = HOME_ICON[nextLv]; b.appendChild(g); }
  setBricks(b, frac); return b;
}
export function setBricks(b, frac) {
  const n = b.querySelectorAll("i").length, v = Math.max(0, Math.min(1, frac)) * n;
  b.querySelectorAll("i").forEach((e, i) => { const f = Math.max(0, Math.min(1, v - i)); e.className = f >= 1 ? "on" : ""; e.style.setProperty("--f", f >= 1 ? "1" : f.toFixed(3)); });
}

// ---------- 畫面 ----------
// api：{ hub(), home() 存檔物件, stars() 累積星星, wallet() 我的星星, pay(n) / earn(n), save(), day(), talk(text), say(text), play(name),
//        topsOpen() 陀螺競技場開了沒, petGlb() 夥伴 { id, glb }, onClose(), onBuy(id)?（買到了：回傳一句要說的話或空，例如留聲機送唱片） }
export function createHome(api) {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  let icons = {};                                        // 3D 渲染的小圖（hub.homeIcons）；沒有就用 emoji
  const iconEl = id => { const ic = el("span", "hg-ico"); if (icons[id]) { const im = el("img"); im.src = icons[id]; im.alt = ""; ic.appendChild(im); } else ic.textContent = GARDEN_BY_ID[id].e; return ic; };
  // ===== 房子卡片（點房子／浮標）=====
  const card = el("div", "hm-card hidden"); card.setAttribute("role", "dialog");
  card.innerHTML = '<div class="hm-c-ico">🏠</div><div class="hm-c-body"><div class="hm-c-name"></div><div class="hm-c-row"><span class="hm-c-bar"></span><span class="hm-c-msg"></span></div></div>' +
    '<div class="hm-c-btns"><button class="big-btn alt hm-c-mail hidden" type="button">✉️ 看信</button><button class="big-btn hm-c-go" type="button">🌷 布置花園</button></div><button class="pk-x hm-c-x" type="button" aria-label="關閉">✕</button>';
  document.body.appendChild(card);
  card.querySelector(".hm-c-x").onclick = () => { api.play("tap"); hideCard(); };
  card.querySelector(".hm-c-mail").onclick = () => { api.play("select"); hideCard(); openMail(); };   // 櫻木：信箱太小找不到 → 卡片上一顆大的「看信」
  card.querySelector(".hm-c-go").onclick = () => { if (card.querySelector(".hm-c-go").classList.contains("off")) { api.play("tap"); api.talk(LINES.gardenLocked); return; } api.play("select"); hideCard(); openGarden(); };
  function showCard() {
    const h = api.home(), I = homeInfo(h, api.stars()), lv = Math.min(I.lv, h.lv);   // 還沒播升級演出：照目前看到的樣子講
    card.querySelector(".hm-c-ico").textContent = HOME_ICON[lv] || "🏠";
    card.querySelector(".hm-c-name").textContent = `我的家・${HOME_NAME[lv]}`;
    const bar = card.querySelector(".hm-c-bar"); bar.innerHTML = ""; if (!I.max) bar.appendChild(brickBar(I.frac, 8, Math.min(6, I.lv + 1)));
    const msg = I.max ? LINES.done : I.frac >= 0.8 ? LINES.almost : LINES.building; card.querySelector(".hm-c-msg").textContent = msg;
    const go = card.querySelector(".hm-c-go"), open = h.lv >= GARDEN_LV; go.classList.toggle("off", !open); go.textContent = open ? "🌷 布置花園" : "🔒 布置花園";
    card.querySelector(".hm-c-mail").classList.toggle("hidden", h.mail === api.day());
    card.classList.remove("hidden");
    if (!h.hi) { h.hi = 1; api.save(); api.talk(LINES.welcome); } else api.talk(open ? msg : LINES.gardenLocked);
  }
  function hideCard() { card.classList.add("hidden"); }

  // ===== 花園小舖（布置花園）=====
  // 手上拿著的東西（held）一定記得從哪來（from：格子編號｜"buy" 剛買的｜"store" 倉庫）：按「好了」、換拿別件、✕，都放回原本那格（被占了＝第一個空格），
  // 真的放不下才進倉庫並說「先放倉庫囉」——不會默默不見（櫻木 10-31）
  const panel = el("div", "hm-garden hidden"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "花園小舖");
  panel.innerHTML = '<div class="hg-head"><span class="hg-title">🌷 花園小舖</span><span class="hg-wallet">我的星星 ⭐<b>0</b></span><button class="big-btn hg-done" type="button">✔ 好了</button></div>' +
    '<div class="hg-hint"><span class="hg-held"></span><button class="hg-cancel hidden" type="button" aria-label="放回去">✕ 放回去</button><button class="hg-refund hidden" type="button"></button><span class="hg-tip"></span><button class="hg-store hidden" type="button">📦 收進倉庫</button>' +
    // 買嗎？：放在這一列（不浮在前院上面）；「✔ 買」在右邊，跟貨架上點的那一格不同位置
    '<div class="hg-buy hidden"><span class="hg-buy-t"></span><span class="hg-buy-s"></span><button class="hg-buy-x" type="button" aria-label="不要買">✕</button><button class="big-btn hg-buy-go" type="button">✔ 買</button></div></div><div class="hg-shelf"></div>';
  document.body.appendChild(panel);
  const shelf = panel.querySelector(".hg-shelf"), buyBox = panel.querySelector(".hg-buy"), tipEl = panel.querySelector(".hg-tip");
  let held = null, from = null, buying = null, buyAt = 0, opened = false, tipMsg = "", tipUntil = 0;
  const cap = () => yardCap(api.home().lv);
  const say = t => { tipMsg = t; tipUntil = performance.now() + 3500; api.talk(t); };   // 說的話也寫在提示列（布置時貓頭鷹藏著；語音關掉也看得到）
  // 手上的東西放回去：原本那格 → 第一個空格 → 倉庫（說一聲）
  function putBack() {
    if (!held) return; const h = api.home(), c = cap();
    if (from === "store") { held = null; from = null; return; }   // 從倉庫拿出來的：放回倉庫就好
    if (typeof from === "number" && from < c && !h.yard[from]) { h.yard[from] = held; pop = from; }
    else { const k = h.yard.slice(0, c).findIndex(x => !x); if (k >= 0) { h.yard[k] = held; pop = k; } else say(LINES.full); }
    held = null; from = null; api.save();
  }
  panel.querySelector(".hg-done").onclick = () => { api.play("select"); closeGarden(); };
  panel.querySelector(".hg-cancel").onclick = () => { api.play("unload"); putBack(); sync(); };
  panel.querySelector(".hg-store").onclick = () => { if (!held) return; api.play("unload"); held = null; from = null; sync(); };   // 手上的放回倉庫（還是你的）
  panel.querySelector(".hg-refund").onclick = () => {
    if (!held || from === "buy") return; const h = api.home(), back = refundItem(h, held, api.day()); if (!back) return;
    api.earn(back); api.play("coin"); say(LINES.refund); held = null; from = null; api.save(); sync();
  };
  panel.querySelector(".hg-buy-x").onclick = () => { api.play("tap"); buying = null; renderBuy(); };
  panel.querySelector(".hg-buy-go").onclick = () => {
    if (!buying || performance.now() - buyAt < 400) return;   // 防連點：跟第一下隔 0.4 秒以上才算
    const g = GARDEN_BY_ID[buying], h = api.home(); if (api.wallet() < g.price || (h.own[g.id] || 0) >= maxOf(g.id)) { buying = null; renderBuy(); return; }
    api.pay(g.price); buyItem(h, g.id, api.day()); api.play("coin"); buying = null;
    let extra = ""; try { extra = (api.onBuy && api.onBuy(g.id)) || ""; } catch (e) { console.warn("[home] onBuy", e); }   // 例：第一次買到留聲機＝送一張唱片
    if (h.yard.slice(0, cap()).some(x => !x)) { held = g.id; from = "buy"; api.play("pop"); } else say(LINES.full);   // 買完直接拿在手上擺；前院滿了＝先放倉庫
    if (extra) say(extra);
    api.save(); sync();
  };
  function renderBuy() {
    buyBox.classList.toggle("hidden", !buying); panel.querySelector(".hg-hint").classList.toggle("buying", !!buying);
    shelf.querySelectorAll(".hg-item").forEach(c => c.classList.toggle("hg-sel", c.dataset.id === buying));
    if (!buying) return;
    const g = GARDEN_BY_ID[buying], w = api.wallet();
    buyBox.querySelector(".hg-buy-t").textContent = `${g.name} ⭐${g.price}`;
    const s = buyBox.querySelector(".hg-buy-s"); s.textContent = `⭐${w} → ⭐${w - g.price}`;   // 錢包從幾顆變幾顆（櫻木：三個⭐數字會分不清哪個是價錢）
    if (w - g.price < 5 && api.topsOpen()) s.appendChild(el("span", "hg-top", "🌀"));   // 剩不到 5 顆：提醒「陀螺要 5 顆喔」（灰色小陀螺，不擋人）
  }
  function sync() {                                     // 存檔 → 3D、面板
    const h = api.home();
    panel.querySelector(".hg-wallet b").textContent = String(api.wallet());
    for (const it of shelf.querySelectorAll(".hg-item")) {
      const g = GARDEN_BY_ID[it.dataset.id], sp = spare(h, g.id), pl = placed(h, g.id), max = (h.own[g.id] || 0) >= maxOf(g.id), poor = !sp && !max && api.wallet() < g.price;
      it.classList.toggle("poor", poor || (!sp && max)); it.classList.toggle("have", sp > 0); it.classList.toggle("held", held === g.id);
      it.querySelector(".hg-price").textContent = sp > 0 ? `可以放 ${sp}` : max ? "買滿了" : poor ? `還差 ${g.price - api.wallet()} 顆⭐` : pl ? `⭐${g.price}・有 ${pl}` : `⭐${g.price}`;
    }
    const hl = panel.querySelector(".hg-held"); hl.innerHTML = ""; if (held) hl.appendChild(iconEl(held)); hl.classList.toggle("on", !!held);
    tipEl.textContent = performance.now() < tipUntil ? tipMsg : held ? `點一個格子，把${GARDEN_BY_ID[held].name}放下去` : "點一個東西，再點前院的格子";
    panel.querySelector(".hg-store").classList.toggle("hidden", !held);
    panel.querySelector(".hg-cancel").classList.toggle("hidden", !held);
    const rf = panel.querySelector(".hg-refund"), canRf = held && from !== "buy" && refundable(h, held, api.day());   // 剛買完不給退（連點「✔ 買」不會變退貨）；從倉庫／格子拿起來的今天買的才能退
    rf.classList.toggle("hidden", !canRf); if (canRf) rf.textContent = `💰 退回 ⭐${GARDEN_BY_ID[held].price}`;
    pushHub(); const hub = api.hub(); if (hub) hub.homeEdit(opened, !!held);
    renderBuy();
  }
  function renderShelf() {
    shelf.innerHTML = "";
    for (const g of GARDEN) {
      const it = el("button", "hg-item"); it.type = "button"; it.dataset.id = g.id;
      it.append(iconEl(g.id), el("span", "hg-name", g.name), el("span", "hg-price"));
      it.onclick = () => tapItem(g.id, it);
      shelf.appendChild(it);
    }
  }
  function tapItem(id, it) {
    const h = api.home(), g = GARDEN_BY_ID[id];
    if (held === id) { api.play("unload"); putBack(); sync(); return; }   // 再點一次手上那件＝放回去
    if (held) putBack();                                // 換拿別件：手上的先放回原本那格
    if (!buying) sync();                                // 錢包可能在別處變過（陀螺、退貨）：先把價錢／還差幾顆刷新
    api.say(g.name);                                    // 點貨架唸名字（不是作答，順便聽注音）
    if (spare(h, id) > 0) { api.play("pop"); buying = null; held = id; from = "store"; sync(); return; }   // 倉庫裡有：直接拿起來擺（不用再付）
    if ((h.own[id] || 0) >= maxOf(id)) { api.play("tap"); return; }   // 一樣東西最多 9 個（留聲機 1 台；再買不會多，星星不能白扣）
    if (api.wallet() < g.price) { api.play("tap"); it.classList.remove("shake"); void it.offsetWidth; it.classList.add("shake"); say(LINES.poor); sync(); return; }
    api.play("select"); buying = id; buyAt = performance.now(); sync();
  }
  // 3D 前院的格子被點（hub opts.onYard）：手上有東西＝放下（那格本來有東西＝換到手上，記得是從這格拿的）；沒拿東西＝把那格的東西拿起來（換位置）
  function onYard(i) {
    if (!opened) return; const h = api.home(); if (i >= cap()) return;
    buying = null;
    if (held) { const old = h.yard[i]; h.yard[i] = held; held = old || null; from = old ? i : null; api.play("load"); pop = i; }
    else if (h.yard[i]) { held = h.yard[i]; from = i; h.yard[i] = null; api.play("pop"); }
    else { api.play("tap"); return; }
    api.save(); sync();
  }
  let pop = -1;
  function pushHub() { const hub = api.hub(); if (hub) hub.setHome(state()); pop = -1; }
  function state() {
    const h = api.home(), I = homeInfo(h, api.stars()), lv = Math.min(I.lv, h.lv);   // 升級演出還沒播＝先照舊的樣子畫
    return { lv, part: lv < I.lv ? 0 : I.part, cap: yardCap(lv), yard: h.yard.slice(), mail: h.mail !== api.day(), flag: !!h.flag, pet: api.petGlb(), pop };
  }
  async function openGarden() {
    const h = api.home(); if (h.lv < GARDEN_LV) { api.talk(LINES.gardenLocked); return; }
    const hub = api.hub(); if (hub && hub.homeBusy && hub.homeBusy()) return;   // 升級演出／第一天介紹中：先看完
    opened = true; held = null; from = null; buying = null; tipUntil = 0;
    if (!h.gift) { h.gift = 1; buyItemFree(h, GIFT); api.save(); }
    renderShelf(); panel.classList.remove("hidden"); document.body.classList.add("garden-on"); sync();
    if (h.own[GIFT] && !h.yard.includes(GIFT) && Object.keys(h.own).length === 1) { say(LINES.gift); sync(); shelf.querySelector(`[data-id=${GIFT}]`)?.classList.add("gift"); }
    if (hub && hub.homeIcons && !Object.keys(icons).length) { try { icons = await hub.homeIcons(GARDEN.map(g => g.id)) || {}; if (opened) { const gift = shelf.querySelector(".gift"); renderShelf(); if (gift) shelf.querySelector(`[data-id=${gift.dataset.id}]`)?.classList.add("gift"); sync(); } } catch (e) {} }
  }
  function buyItemFree(h, id) { h.own[id] = Math.min(9, (h.own[id] || 0) + 1); }
  function closeGarden() {
    if (!opened) return; putBack(); opened = false; buying = null;   // 手上還拿著＝放回原本那格（不會默默不見）
    panel.classList.add("hidden"); document.body.classList.remove("garden-on");
    const hub = api.hub(); if (hub) hub.homeEdit(false); pushHub(); api.onClose();
  }
  // ===== 信箱 =====
  const letter = el("div", "overlay hm-letter hidden");
  letter.innerHTML = '<div class="dialog hm-l-paper"><div class="hm-l-env">✉️</div><img class="hm-l-owl" src="IMAGE/zhuyin/guide_owl.webp" alt=""><div class="hm-l-text"></div><button class="big-btn hm-l-ok" type="button">好！</button></div>';
  document.body.appendChild(letter);
  letter.querySelector(".hm-l-ok").onclick = () => { api.play("tap"); letter.classList.add("hidden"); };
  function openMail() {
    const h = api.home(), d = api.day();
    if (h.mail === d) { api.talk(LINES.mailRead); return; }
    const k = Math.floor(Date.parse(d + "T00:00:00Z") / 864e5), t = LETTERS[((k % LETTERS.length) + LETTERS.length) % LETTERS.length];
    h.mail = d; api.save(); pushHub();
    letter.querySelector(".hm-l-text").textContent = t; letter.classList.remove("hidden"); api.play("ding"); api.talk(t);
  }
  return {
    state, push: pushHub, showCard, hideCard, openGarden, closeGarden, onYard, openMail,
    isOpen: () => opened, cardOpen: () => !card.classList.contains("hidden"), letterOpen: () => !letter.classList.contains("hidden"),
    gardenArea: () => { const r = panel.getBoundingClientRect(); return r.height ? { top: r.top } : null; },
    debug: { get held() { return held; }, get from() { return from; }, get buying() { return buying; }, panel, card, letter },
  };
}
