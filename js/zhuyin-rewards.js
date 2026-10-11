// ===================== 注音小島：獎勵系統（扭蛋機）—— 純邏輯，沒有畫面 =====================
// 規格：docs/zhuyin-rewards-spec.md（2026-10-10 阿葉拍板）。底線：不花錢、永不倒退、重複不浪費（換點心）、有保底、機率公開。
// 這個檔只算資料（可在 Node 單元測試：tools/zy-test/rewards-unit.mjs）；畫面在 zhuyin.js 的「扭蛋機／動物朋友」段。

// 28 隻寵物：id＝IMAGE/zy3d/models/<id>.glb、IMAGE/zhuyin/pets/<id>.webp
export const PETS = [
  // 原本的 8 位朋友（熊、兔、貓、狐狸＝一開始就有）
  { id: "bear", name: "小熊", tier: "base" }, { id: "bunny", name: "小兔", tier: "base" }, { id: "cat", name: "小貓", tier: "base" }, { id: "fox", name: "小狐狸", tier: "base" },
  { id: "panda", name: "熊貓", tier: "friend" }, { id: "penguin", name: "企鵝", tier: "friend" }, { id: "frog", name: "青蛙", tier: "friend" }, { id: "lion", name: "小獅子", tier: "friend" },
  // 稀有 17 隻
  ...[["dog", "小狗"], ["chick", "小雞"], ["pig", "小豬"], ["cow", "乳牛"], ["monkey", "猴子"], ["koala", "無尾熊"], ["giraffe", "長頸鹿"], ["tiger", "老虎"], ["deer", "小鹿"],
    ["parrot", "鸚鵡"], ["bee", "蜜蜂"], ["crab", "螃蟹"], ["beaver", "河狸"], ["hog", "山豬"], ["polar", "北極熊"], ["caterpillar", "毛毛蟲"], ["elephant", "小象"]].map(([id, name]) => ({ id, name, tier: "rare" })),
  // 超稀有 3 隻
  { id: "dino", name: "小恐龍", tier: "ssr" }, { id: "whale", name: "小鯨魚", tier: "ssr" }, { id: "dragon", name: "彩虹小龍", tier: "ssr" },
];
export const PET = Object.fromEntries(PETS.map(p => [p.id, p]));
// 舊存檔的朋友（FRIENDS 的 id）→ 寵物 id；前 4 隻一開始就有，後 4 隻＝以前孵蛋孵出來的
export const FRIEND_PET = { cust_bear: "bear", cust_rabbit: "bunny", cust_cat: "cat", cust_fox: "fox", cust_panda: "panda", cust_penguin: "penguin", cust_frog: "frog", cust_lion: "lion" };
// 普通獎：小島裝飾（自製模型，hub.setDecor 會擺到放置點）或點心包
export const DECOR = [
  { id: "statue_owl", name: "貓頭鷹雕像", e: "🦉" }, { id: "statue_bpmf", name: "ㄅㄆㄇ雕像", e: "🗿" }, { id: "flower_arch", name: "花拱門", e: "💐" },
];
export const RATES = { common: 0.70, rare: 0.25, ssr: 0.05 };   // 家長設定頁照這個顯示
export const PITY = { rare: 5, ssr: 15 };                        // 第 5 抽保證稀有以上、第 15 抽保證超稀有
export const GROW = [30, 110];                                    // 寶寶→長大：累積 30 點心；長大→超級：累積 110
export const STARS_PER_COIN = 10, STAMPS_PER_GOLD = 7, TREAT_PACK = 10, DUP_TREATS = 20;

// ---------- 寵物換裝（10-12，docs/zhuyin-v5-plan.md §3）----------
// 存檔：closet＝擁有的配件 id 陣列；wear＝{ 寵物id: { head, side, back } }（值＝配件 id；null＝自己脫掉；沒有這個鍵＝沒設定→用預設）
// 模型＝IMAGE/zy3d/models/<id>.glb（原點＝掛點）；衣櫃圖＝IMAGE/zhuyin/wear_<id>.webp
export const WEAR_SLOTS = ["head", "side", "back"];
export const WEAR_SLOT_NAME = { head: "頭上", side: "旁邊", back: "背上" };
export const WEAR_ANCHOR = { head: "head", side: "head_side", back: "back" };   // 部位 → models.json anchors 的鍵
export const WEAR = [
  { id: "hat", slot: "head", name: "帽子", e: "🎩" }, { id: "crown", slot: "head", name: "皇冠", e: "👑" },
  { id: "flower_crown", slot: "head", name: "花圈", e: "🌸" }, { id: "party_hat", slot: "head", name: "派對帽", e: "🥳" },
  { id: "bow", slot: "side", name: "蝴蝶結", e: "🎀" }, { id: "flower", slot: "side", name: "小花", e: "🌼" },
  { id: "cape", slot: "back", name: "披風", e: "🦸" }, { id: "wings", slot: "back", name: "翅膀", e: "🪽" },
  { id: "backpack", slot: "back", name: "背包", e: "🎒" }, { id: "cape_rainbow", slot: "back", name: "彩虹披風", e: "🌈" },
];
export const WEAR_BY_ID = Object.fromEntries(WEAR.map(w => [w.id, w]));
export const START_WEAR = ["hat", "bow"];                                                                    // 一開始就送
export const DELIVER_GIFTS = ["flower", "flower_crown", "backpack", "party_hat", "cape", "wings", "crown", "cape_rainbow"];   // 彩虹配送站任務 T1..T8 第一次過關送（索引 0＝T1）
export const GACHA_WEAR = ["crown", "flower", "party_hat", "backpack"];                                     // 扭蛋普通獎也抽得到的 4 件（其餘只能送貨拿）
export const SUPER_WEAR = { head: "crown", back: "cape" };                                                  // 超級階段沒自己選時的預設樣子（不用擁有）
export const wearGotLine = id => "拿到" + WEAR_BY_ID[id].name + "了！";                                    // 扭蛋／送貨拿到配件時唸的句子（tools/voice/build_lines.py 照這個展開預錄）
export const COMMON_ITEM_RATE = 0.5;                                                                      // 普通獎：一半機會給還沒拿到的裝飾／配件，另一半（或都拿到了）給點心包

// 原型鏈上的鍵（"constructor"、"toString"…）不算：查表一律用自己的屬性（Object.hasOwn 舊 iPad 沒有）
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// 新存檔／舊存檔搬家：舊的 eggs（孵過幾顆蛋）→ 已收集的朋友；孵蛋用掉的星星不重複給幣
// 存檔不可信（手改、壞掉、版本混亂）：rewards 先過 cleanRewards 再用；連物件都不是＝當新存檔（照樣做 eggs 搬家）（里維 10-12：{pets:5} 會讓開頁白屏）
export function migrate(old) {
  const o = old && typeof old === "object" ? old : {};
  const clean = o.rewards != null ? cleanRewards(o.rewards) : null;
  const r = clean || {
    pets: {}, partner: "bear", coins: 0, gold: 0, jarCoins: 0, treats: 0, decor: [], stamps: 0, stampDay: "", pity: { rare: 0, ssr: 0 }, catBonus: [], pulls: 0,
    closet: [...START_WEAR], wear: {},                               // 舊存檔沒有衣櫃：起始的帽子＋蝴蝶結（cleanRewards 也會補）
  };
  if (!clean) {
    const friendIds = Object.keys(FRIEND_PET), eggs = Math.max(0, Math.min(4, o.eggs | 0));
    friendIds.slice(0, 4 + eggs).forEach(f => { r.pets[FRIEND_PET[f]] = { stage: 2, t: GROW[0] }; });   // 以前的朋友都已經是長大的樣子（點心算到 30：再 80 個變超級）
    r.jarCoins = eggs;                                               // 孵過幾顆蛋＝用掉幾罐
  }
  for (const id of ["bear", "bunny", "cat", "fox"]) if (!r.pets[id]) r.pets[id] = { stage: 2, t: GROW[0] };
  if (!r.pets[r.partner]) r.partner = "bear";
  return r;
}
// 星星進罐：每滿 10 顆給 1 枚扭蛋幣（回傳這次新給了幾枚）
export function creditJar(rw, stars) {
  const n = Math.floor(Math.max(0, stars) / STARS_PER_COIN) - rw.jarCoins;
  if (n > 0) { rw.coins += n; rw.jarCoins += n; return n; }
  return 0;
}
export const jarLeft = (rw, stars) => Math.max(0, stars - rw.jarCoins * STARS_PER_COIN);   // 罐子裡現在幾顆（0～9）
// 集章卡：每天第一局玩完蓋 1 格；7 格換 1 枚金幣。回傳 { stamped, gold }
export function stampToday(rw, day) {
  if (rw.stampDay === day) return { stamped: false, gold: false };
  rw.stampDay = day; rw.stamps++;
  if (rw.stamps >= STAMPS_PER_GOLD) { rw.stamps = 0; rw.gold++; return { stamped: true, gold: true }; }
  return { stamped: true, gold: false };
}
// 點心：自動餵給夥伴；回傳 { grew: 新階段或 0 }
export function feed(rw, n) {
  rw.treats += n;
  const p = rw.pets[rw.partner]; if (!p || n <= 0) return { grew: 0 };
  p.t = (p.t || 0) + n;
  const want = p.t >= GROW[1] ? 3 : p.t >= GROW[0] ? 2 : 1;
  if (want > (p.stage || 1)) { p.stage = want; return { grew: want }; }
  return { grew: 0 };
}
export const toNextStage = p => !p ? 0 : p.stage >= 3 ? 0 : Math.max(0, GROW[p.stage - 1] - (p.t || 0));
// 抽一次：useGold＝金幣（保證稀有以上）。rand 可注入（測試用）。回傳獎品 { tier, kind: "pet"|"decor"|"treats", id?, amount?, dup? }
export function pull(rw, { useGold = false, rand = Math.random } = {}) {
  if (useGold) { if (rw.gold <= 0) return null; rw.gold--; } else { if (rw.coins <= 0) return null; rw.coins--; }
  rw.pulls++;
  let tier;
  const forceSsr = rw.pity.ssr + 1 >= PITY.ssr, forceRare = useGold || rw.pity.rare + 1 >= PITY.rare;
  if (forceSsr) tier = "ssr";
  else { const x = rand(); tier = x < RATES.ssr ? "ssr" : x < RATES.ssr + RATES.rare ? "rare" : "common"; if (tier === "common" && forceRare) tier = rand() < RATES.ssr / (RATES.ssr + RATES.rare) ? "ssr" : "rare"; }
  rw.pity.ssr = tier === "ssr" ? 0 : rw.pity.ssr + 1;
  rw.pity.rare = tier === "common" ? rw.pity.rare + 1 : 0;
  const pickOne = list => list[Math.floor(rand() * list.length)];
  if (tier === "common") {   // 還沒拿到的小島裝飾＋可抽的配件一起當池子（10-12）；都拿到了就給點心
    const left = [...DECOR.filter(d => !rw.decor.includes(d.id)).map(d => ({ kind: "decor", id: d.id })),
      ...GACHA_WEAR.filter(id => !(rw.closet || []).includes(id)).map(id => ({ kind: "wear", id }))];
    if (left.length && rand() < COMMON_ITEM_RATE) {
      const it = pickOne(left);
      if (it.kind === "decor") rw.decor.push(it.id); else giveWear(rw, it.id);
      return { tier, kind: it.kind, id: it.id };
    }
    return { tier, kind: "treats", amount: TREAT_PACK, grew: feed(rw, TREAT_PACK).grew };
  }
  // 寵物：優先給還沒有的；這個稀有度都收齊了 → 往下找沒有的；全部收齊 → 重複＝點心 20
  const has = id => !!rw.pets[id];
  let pool = PETS.filter(p => p.tier === tier && !has(p.id));
  if (!pool.length && tier === "ssr") { pool = PETS.filter(p => p.tier === "rare" && !has(p.id)); if (pool.length) tier = "rare"; }   // 超稀有都有了：給還沒有的稀有（畫面照實標稀有）
  if (!pool.length) { const all = PETS.filter(p => p.tier === tier); const d = pickOne(all); return { tier, kind: "pet", id: d.id, dup: true, amount: DUP_TREATS, grew: feed(rw, DUP_TREATS).grew }; }
  const p = pickOne(pool); rw.pets[p.id] = { stage: 1, t: 0 };
  return { tier, kind: "pet", id: p.id, dup: false };
}
// 貼紙分類集滿：每個分類給 1 枚扭蛋幣（只給一次）。cats＝[{id, words:[國字…]}]；回傳新給的分類 id 陣列
export function categoryBonus(rw, cats, stickers) {
  const got = [];
  for (const c of cats) if (!rw.catBonus.includes(c.id) && c.words.length && c.words.every(h => stickers[h])) { rw.catBonus.push(c.id); rw.coins++; got.push(c.id); }
  return got;
}
// 備份碼裡的獎勵資料 → 乾淨的資料（壞的欄位丟掉，不是正確格式回 null）
export function cleanRewards(d) {
  if (!d || typeof d !== "object") return null;
  const num = (v, hi) => Math.min(hi, Math.max(0, Math.floor(+v) || 0));
  const pets = {}; if (d.pets && typeof d.pets === "object") for (const [id, v] of Object.entries(d.pets)) if (own(PET, id) && v && typeof v === "object") pets[id] = { stage: Math.min(3, Math.max(1, v.stage | 0 || 1)), t: num(v.t, 99999) };
  const closet = cleanCloset(d.closet);
  const wear = {};                                                   // 只留：有這隻寵物、部位對、配件對得上部位、而且穿得了（有這件或超級預設）；null＝自己脫掉也保留
  if (d.wear && typeof d.wear === "object" && !Array.isArray(d.wear)) for (const [id, v] of Object.entries(d.wear)) {
    if (!own(pets, id) || !v || typeof v !== "object") continue;
    const o = {};
    for (const s of WEAR_SLOTS) {
      if (!own(v, s)) continue;
      const x = v[s];
      if (x === null) o[s] = null;
      else if (typeof x === "string" && own(WEAR_BY_ID, x) && WEAR_BY_ID[x].slot === s && (closet.includes(x) || (pets[id].stage >= 3 && SUPER_WEAR[s] === x))) o[s] = x;
    }
    if (Object.keys(o).length) wear[id] = o;
  }
  return { pets, partner: typeof d.partner === "string" && own(PET, d.partner) && own(pets, d.partner) ? d.partner : "bear", coins: num(d.coins, 999), gold: num(d.gold, 99), jarCoins: num(d.jarCoins, 99999), treats: num(d.treats, 999999),
    decor: Array.isArray(d.decor) ? d.decor.filter(x => DECOR.some(q => q.id === x)) : [], stamps: num(d.stamps, STAMPS_PER_GOLD - 1), stampDay: typeof d.stampDay === "string" ? d.stampDay.slice(0, 10) : "",
    pity: { rare: num(d.pity && d.pity.rare, PITY.rare), ssr: num(d.pity && d.pity.ssr, PITY.ssr) }, catBonus: Array.isArray(d.catBonus) ? d.catBonus.filter(x => typeof x === "string").slice(0, 50) : [], pulls: num(d.pulls, 99999),
    closet, wear };
}

// ---------- 寵物換裝：純邏輯 ----------
// 衣櫃清洗：只留認得的配件、不重複，起始的帽子＋蝴蝶結一定在
function cleanCloset(c) {
  const out = [...START_WEAR];
  if (Array.isArray(c)) for (const x of c) if (typeof x === "string" && own(WEAR_BY_ID, x) && !out.includes(x)) out.push(x);
  return out;
}
// 這隻寵物穿得了這件嗎：擁有，或是超級寵物的預設皇冠／披風
export function canWear(rw, pet, id) {
  const w = own(WEAR_BY_ID, id) ? WEAR_BY_ID[id] : null, p = rw && rw.pets && own(rw.pets, pet) ? rw.pets[pet] : null;
  if (!w || !p) return false;
  return (Array.isArray(rw.closet) && rw.closet.includes(id)) || ((p.stage | 0) >= 3 && SUPER_WEAR[w.slot] === id);
}
// 拿到一件配件（配送站任務、扭蛋）：回傳是不是新拿到的（已經有＝false，不重複給）
export function giveWear(rw, id) {
  if (!own(WEAR_BY_ID, id)) return false;
  if (!Array.isArray(rw.closet)) rw.closet = [...START_WEAR];
  if (rw.closet.includes(id)) return false;
  rw.closet.push(id); return true;
}
// 幫寵物穿（id）或脫（null）某個部位：寵物要已收集、部位要對、只能穿擁有的（超級寵物的預設皇冠／披風也可以）。回傳成功與否
export function setWear(rw, pet, slot, id) {
  if (!rw || !rw.pets || !own(rw.pets, pet) || !WEAR_SLOTS.includes(slot)) return false;
  if (id != null && (!own(WEAR_BY_ID, id) || WEAR_BY_ID[id].slot !== slot || !canWear(rw, pet, id))) return false;
  if (!rw.wear || typeof rw.wear !== "object" || Array.isArray(rw.wear)) rw.wear = {};
  const cur = rw.wear[pet] && typeof rw.wear[pet] === "object" ? rw.wear[pet] : (rw.wear[pet] = {});
  cur[slot] = id == null ? null : id;
  return true;
}
// 這隻寵物現在穿什麼（hub3d／換裝預覽用）：{ head, side, back }，值＝配件 id 或 null
// 沒設定的部位：超級階段預設 head＝皇冠、back＝披風，其他空；玩家自己選的（含脫掉）優先。寶寶頭上的小芽由畫面自己加（head 是 null 時）
export function wearOf(rw, pet) {
  const out = { head: null, side: null, back: null }, p = rw && rw.pets && own(rw.pets, pet) ? rw.pets[pet] : null;
  if (!p) return out;
  const mine = rw.wear && own(rw.wear, pet) && rw.wear[pet] && typeof rw.wear[pet] === "object" ? rw.wear[pet] : {};
  for (const s of WEAR_SLOTS) {
    if (own(mine, s)) { const id = mine[s]; out[s] = id && own(WEAR_BY_ID, id) && WEAR_BY_ID[id].slot === s && canWear(rw, pet, id) ? id : null; }
    else if ((p.stage | 0) >= 3 && SUPER_WEAR[s]) out[s] = SUPER_WEAR[s];
  }
  return out;
}
// 配件擺放（hub3d 與換裝預覽共用同一份微調）：fit＝models.json 的 wear_fit。回傳 { p:[x,y,z] 加在掛點上（模型原始單位、glTF 座標）, s 倍率, r:[x,y,z] 度（Euler XYZ） }
// 疊加順序：items[配件] → pets[寵物][部位] → pets[寵物][配件]（p、r 相加，s 相乘；hide:true＝這隻不顯示這件）
export function wearPose(fit, pet, id) {
  const slot = WEAR_BY_ID[id] ? WEAR_BY_ID[id].slot : id === "baby_tuft" ? "head" : null;
  const out = { p: [0, 0, 0], s: 1, r: [0, 0, 0], hide: false };
  const items = fit && fit.items, mine = fit && fit.pets && fit.pets[pet];
  for (const d of [items && items[id], mine && slot && mine[slot], mine && mine[id]]) {
    if (!d || typeof d !== "object") continue;
    for (let k = 0; k < 3; k++) { if (Array.isArray(d.p)) out.p[k] += +d.p[k] || 0; if (Array.isArray(d.r)) out.r[k] += +d.r[k] || 0; }
    if (+d.s > 0) out.s *= +d.s;
    if (d.hide) out.hide = true;
  }
  return out;
}
// 家長設定頁的公開機率（10-12 更新：普通獎加入配件）
export const GACHA_ODDS = {
  common: { rate: RATES.common, itemRate: COMMON_ITEM_RATE, decor: DECOR.map(d => d.id), wear: GACHA_WEAR, otherwise: { kind: "treats", amount: TREAT_PACK } },
  rare: { rate: RATES.rare, pets: PETS.filter(p => p.tier === "rare").map(p => p.id) },
  ssr: { rate: RATES.ssr, pets: PETS.filter(p => p.tier === "ssr").map(p => p.id) },
  pity: PITY, dupTreats: DUP_TREATS,
};
// 寧次 10-12：「普通 70%：一半機會…」容易誤讀 → 每一項直接寫實際機率、百分比放段首（普通的兩項加起來＝RATES.common）
export function oddsText() {
  const pc = x => Math.round(x * 100) + "%";
  return [
    `${pc(RATES.common * COMMON_ITEM_RATE)}　小島裝飾或寵物配件（普通，藍色膠囊）：從還沒拿到的${DECOR.map(d => d.name).join("、")}、${GACHA_WEAR.map(i => WEAR_BY_ID[i].name).join("、")}裡抽一個；全部拿到之後，這 ${pc(RATES.common * COMMON_ITEM_RATE)} 也改成點心包。`,
    `${pc(RATES.common * (1 - COMMON_ITEM_RATE))}　點心包 +${TREAT_PACK}（普通，藍色膠囊）。普通的兩項加起來 ${pc(RATES.common)}。`,
    `${pc(RATES.rare)}　稀有寵物（紫色膠囊）：${GACHA_ODDS.rare.pets.length} 隻，還沒有的優先。`,
    `${pc(RATES.ssr)}　超稀有寵物（金色膠囊）：${GACHA_ODDS.ssr.pets.map(i => PET[i].name).join("、")}，還沒有的優先。`,
    `保底：連續 ${PITY.rare - 1} 次沒拿到稀有，第 ${PITY.rare} 次一定稀有以上；連續 ${PITY.ssr - 1} 次沒拿到超稀有，第 ${PITY.ssr} 次一定超稀有。重複的寵物換成點心 ${DUP_TREATS} 個。`,
    `其他配件（${WEAR.filter(w => !GACHA_WEAR.includes(w.id) && !START_WEAR.includes(w.id)).map(w => w.name).join("、")}）只能在彩虹配送站送貨拿到，不用抽。`,
  ];
}
