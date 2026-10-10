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

// 新存檔／舊存檔搬家：舊的 eggs（孵過幾顆蛋）→ 已收集的朋友；孵蛋用掉的星星不重複給幣
export function migrate(old) {
  const r = {
    pets: {}, partner: "bear", coins: 0, gold: 0, jarCoins: 0, treats: 0, decor: [], stamps: 0, stampDay: "", pity: { rare: 0, ssr: 0 }, catBonus: [], pulls: 0,
    ...(old.rewards || {}),
  };
  if (!old.rewards) {
    const friendIds = Object.keys(FRIEND_PET), eggs = Math.max(0, Math.min(4, old.eggs | 0));
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
  if (tier === "common") {
    const left = DECOR.filter(d => !rw.decor.includes(d.id));
    if (left.length && rand() < 0.5) { const d = pickOne(left); rw.decor.push(d.id); return { tier, kind: "decor", id: d.id }; }
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
  const pets = {}; if (d.pets && typeof d.pets === "object") for (const [id, v] of Object.entries(d.pets)) if (PET[id] && v && typeof v === "object") pets[id] = { stage: Math.min(3, Math.max(1, v.stage | 0 || 1)), t: num(v.t, 99999) };
  return { pets, partner: PET[d.partner] && pets[d.partner] ? d.partner : "bear", coins: num(d.coins, 999), gold: num(d.gold, 99), jarCoins: num(d.jarCoins, 99999), treats: num(d.treats, 999999),
    decor: Array.isArray(d.decor) ? d.decor.filter(x => DECOR.some(q => q.id === x)) : [], stamps: num(d.stamps, STAMPS_PER_GOLD - 1), stampDay: typeof d.stampDay === "string" ? d.stampDay.slice(0, 10) : "",
    pity: { rare: num(d.pity && d.pity.rare, PITY.rare), ssr: num(d.pity && d.pity.ssr, PITY.ssr) }, catBonus: Array.isArray(d.catBonus) ? d.catBonus.filter(x => typeof x === "string").slice(0, 50) : [], pulls: num(d.pulls, 99999) };
}
