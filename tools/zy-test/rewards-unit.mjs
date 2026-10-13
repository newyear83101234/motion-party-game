// 獎勵系統純邏輯單元測試：node tools/zy-test/rewards-unit.mjs
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const R = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/zhuyin-rewards.js")).href);
const out = []; const ok = (n, c, i = "") => out.push(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`);
const seq = arr => { let k = 0; return () => arr[k++ % arr.length]; };

// 搬家：舊存檔孵過 2 顆蛋、星星 35 顆
{
  const rw = R.migrate({ eggs: 2 });
  ok("搬家：起始 4 隻＋孵過的 2 隻（熊貓、企鵝）", Object.keys(rw.pets).sort().join() === ["bear", "bunny", "cat", "fox", "panda", "penguin"].sort().join(), Object.keys(rw.pets).join());
  ok("搬家：孵蛋用掉 2 罐", rw.jarCoins === 2 && rw.coins === 0);
  const n = R.creditJar(rw, 35);
  ok("星星 35 顆、用掉 2 罐 → 給 1 枚幣、罐子剩 5 顆", n === 1 && rw.coins === 1 && R.jarLeft(rw, 35) === 5, `${n} ${rw.coins} ${R.jarLeft(rw, 35)}`);
  ok("再算一次不重複給", R.creditJar(rw, 35) === 0 && rw.coins === 1);
}
// 保底：一直抽到普通也一定在第 5 抽拿到稀有以上、第 15 抽拿到超稀有
{
  const rw = R.migrate({ eggs: 0 }); rw.coins = 30;
  const tiers = []; for (let i = 0; i < 15; i++) tiers.push(R.pull(rw, { rand: () => 0.99 }).tier);   // 0.99＝永遠是普通
  ok("保底：第 5、10 抽稀有以上", tiers[4] !== "common" && tiers[9] !== "common", tiers.join(","));
  ok("保底：第 15 抽超稀有", tiers[14] === "ssr", tiers[14]);
  ok("保底之間是普通", tiers.slice(0, 4).every(t => t === "common"));
}
// 不重複優先：稀有抽 17 次＝17 隻不同；第 18 次重複＝點心 20
{
  const rw = R.migrate({ eggs: 4 }); rw.coins = 40; let r = 0.5; const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const got = new Set(); let dup = null;
  for (let i = 0; i < 25; i++) { rw.pity.rare = R.PITY.rare - 1; rw.pity.ssr = 0; const x = R.pull(rw, { rand: seq([0.5, rand(), rand()]) }); if (x.kind === "pet" && !x.dup && x.tier === "rare") got.add(x.id); if (x.dup) { dup = x; break; } }
  ok("稀有寵物不重複：17 隻都拿到才會重複", got.size === 17 && dup && dup.amount === 20, `${got.size} ${JSON.stringify(dup)}`);
}
// 金幣保證稀有以上；沒有幣抽不了
{
  const rw = R.migrate({}); rw.gold = 1;
  const x = R.pull(rw, { useGold: true, rand: () => 0.99 });
  ok("金幣：保證稀有以上", x && x.tier !== "common", JSON.stringify(x));
  ok("沒有幣：抽不了（回 null）", R.pull(rw) === null && R.pull(rw, { useGold: true }) === null);
}
// 點心包在 pull() 當下就入帳（中途關頁不會掉）
{
  const rw = R.migrate({}); rw.coins = 1; rw.pets.dog = { stage: 1, t: 25 }; rw.partner = "dog";
  const x = R.pull(rw, { rand: seq([0.9, 0.9]) });   // 普通、不給裝飾 → 點心包
  ok("點心包：pull 當下就加點心、夥伴長大有回報", x.kind === "treats" && rw.treats === 10 && rw.pets.dog.t === 35 && x.grew === 2, JSON.stringify(x));
}
// 集章卡：同一天只蓋一次；第 7 格換金幣
{
  const rw = R.migrate({});
  let g = null; for (let d = 1; d <= 7; d++) { R.stampToday(rw, "2026-10-" + String(d).padStart(2, "0")); g = R.stampToday(rw, "2026-10-" + String(d).padStart(2, "0")); }
  ok("集章卡：一天一格、7 格換 1 金幣後歸 0", rw.gold === 1 && rw.stamps === 0 && g.stamped === false, JSON.stringify(rw.stamps));
}
// 長大：寶寶 30 點心長大、110 超級
{
  const rw = R.migrate({}); rw.pets.dog = { stage: 1, t: 0 }; rw.partner = "dog";
  const a = R.feed(rw, 29), b = R.feed(rw, 1), c = R.feed(rw, 79), d = R.feed(rw, 1);
  ok("長大：29 不長、30 長大、109 不長、110 超級", !a.grew && b.grew === 2 && !c.grew && d.grew === 3, JSON.stringify([a, b, c, d]));
  ok("還差幾個點心", R.toNextStage({ stage: 1, t: 10 }) === 20 && R.toNextStage({ stage: 3, t: 200 }) === 0);
}
// 分類集滿給幣（只一次）
{
  const rw = R.migrate({}); const cats = [{ id: "a", words: ["貓", "狗"] }, { id: "b", words: ["魚"] }];
  const g1 = R.categoryBonus(rw, cats, { 貓: 1, 狗: 1 }), g2 = R.categoryBonus(rw, cats, { 貓: 1, 狗: 1 });
  ok("分類集滿：給 1 幣、不重複給", g1.join() === "a" && !g2.length && rw.coins === 1);
}
// 備份碼清洗
{
  const c = R.cleanRewards({ pets: { dog: { stage: 9, t: 5 }, xx: { stage: 1 } }, partner: "xx", coins: -3, decor: ["flower_arch", "bad"], pity: { rare: 99 } });
  ok("備份碼清洗：壞欄位丟掉、數字有上下限", c.pets.dog.stage === 3 && !c.pets.xx && c.partner === "bear" && c.coins === 0 && c.decor.join() === "flower_arch" && c.pity.rare === R.PITY.rare, JSON.stringify(c));
}
// 機率大概對（10 萬抽、不算保底）
{
  const rw = R.migrate({}); const n = 100000, cnt = { common: 0, rare: 0, ssr: 0 }; let s = 7;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) { rw.coins = 1; rw.pity = { rare: 0, ssr: 0 }; cnt[R.pull(rw, { rand }).tier]++; }
  const f = k => cnt[k] / n;
  ok("機率：普通≈70%、稀有≈25%、超稀有≈5%", Math.abs(f("common") - 0.7) < 0.01 && Math.abs(f("rare") - 0.25) < 0.01 && Math.abs(f("ssr") - 0.05) < 0.005, JSON.stringify(cnt));
}
// ===================== 10-12 寵物換裝 =====================
// 搬家：舊存檔（沒有獎勵資料／有獎勵資料但沒有衣櫃）都補 closet＝帽子＋蝴蝶結、wear＝{}
{
  const a = R.migrate({ eggs: 1 }), b = R.migrate({ rewards: { pets: { bear: { stage: 2, t: 30 } }, coins: 3 } });
  ok("換裝搬家：新／舊存檔都補 closet=[hat,bow]、wear={}", a.closet.join() === "hat,bow" && b.closet.join() === "hat,bow" && JSON.stringify(a.wear) === "{}" && JSON.stringify(b.wear) === "{}" && b.coins === 3, JSON.stringify([a.closet, b.closet, b.wear]));
  const c = R.migrate({ rewards: { closet: ["crown", "crown", "bad", 5], wear: [1, 2] } });
  ok("換裝搬家：壞衣櫃清掉重複／不認得的、起始兩件一定在；wear 不是物件就重設", c.closet.join() === "hat,bow,crown" && JSON.stringify(c.wear) === "{}", JSON.stringify(c.closet));
}
// 拿到配件：新的回 true、重複回 false、不認得的回 false
{
  const rw = R.migrate({});
  ok("giveWear：新的 true、重複 false、不認得 false", R.giveWear(rw, "wings") === true && R.giveWear(rw, "wings") === false && R.giveWear(rw, "hat") === false && R.giveWear(rw, "rocket") === false && rw.closet.join() === "hat,bow,wings", rw.closet.join());
  ok("配送站 8 個任務各送不同的一件、都在目錄裡", R.DELIVER_GIFTS.length === 8 && new Set(R.DELIVER_GIFTS).size === 8 && R.DELIVER_GIFTS.every(i => R.WEAR_BY_ID[i] && !R.START_WEAR.includes(i)) && R.WEAR.length === 10);
}
// 穿／脫：部位要對、只能穿擁有的、寵物要已收集；同部位替換；null＝脫掉
{
  const rw = R.migrate({});
  const r1 = R.setWear(rw, "bear", "head", "hat");
  const r2 = R.setWear(rw, "bear", "side", "hat");          // 部位不對
  const r3 = R.setWear(rw, "bear", "head", "crown");        // 沒有皇冠
  const r4 = R.setWear(rw, "dog", "head", "hat");           // 還沒收集小狗
  const r5 = R.setWear(rw, "bear", "tail", "hat");          // 沒有這個部位
  const r6 = R.setWear(rw, "bear", "head", "rocket");       // 不認得的配件
  ok("setWear：擁有＋部位對才穿得上，其餘都拒絕", r1 && !r2 && !r3 && !r4 && !r5 && !r6 && R.wearOf(rw, "bear").head === "hat", JSON.stringify([r1, r2, r3, r4, r5, r6, rw.wear]));
  R.giveWear(rw, "party_hat"); R.setWear(rw, "bear", "head", "party_hat"); R.setWear(rw, "bear", "side", "bow");
  ok("setWear：同部位替換（帽子→派對帽）、不同部位並存", JSON.stringify(R.wearOf(rw, "bear")) === JSON.stringify({ head: "party_hat", side: "bow", back: null }), JSON.stringify(R.wearOf(rw, "bear")));
  ok("setWear：null＝脫掉", R.setWear(rw, "bear", "head", null) && R.wearOf(rw, "bear").head === null && rw.wear.bear.head === null);
  ok("每隻寵物各穿各的", JSON.stringify(R.wearOf(rw, "cat")) === JSON.stringify({ head: null, side: null, back: null }));
}
// wearOf 預設：超級階段沒設定＝皇冠＋披風；自己選的（含脫掉）優先；超級寵物不用擁有也能穿回預設那兩件；沒收集的寵物全空
{
  const rw = R.migrate({}); rw.pets.dog = { stage: 3, t: 120 }; rw.pets.pig = { stage: 1, t: 0 };
  ok("wearOf：超級預設皇冠＋披風、寶寶／長大預設全空", JSON.stringify(R.wearOf(rw, "dog")) === JSON.stringify({ head: "crown", side: null, back: "cape" }) && JSON.stringify(R.wearOf(rw, "pig")) === JSON.stringify({ head: null, side: null, back: null }));
  R.setWear(rw, "dog", "head", "hat"); R.setWear(rw, "dog", "back", null);
  ok("wearOf：超級寵物自己選的優先（帽子、脫掉披風）", JSON.stringify(R.wearOf(rw, "dog")) === JSON.stringify({ head: "hat", side: null, back: null }), JSON.stringify(R.wearOf(rw, "dog")));
  ok("超級寵物沒有皇冠也能穿回預設皇冠；一般寵物不行", R.setWear(rw, "dog", "head", "crown") && R.wearOf(rw, "dog").head === "crown" && !R.setWear(rw, "pig", "head", "crown") && !rw.closet.includes("crown"));
  ok("wearOf：沒收集的寵物全空", JSON.stringify(R.wearOf(rw, "dragon")) === JSON.stringify({ head: null, side: null, back: null }));
  rw.wear.pig = { head: "crown", side: "hat", back: "wings" };   // 手改壞的存檔：沒擁有、部位不對
  ok("wearOf：存檔裡不合法的值當作沒穿", JSON.stringify(R.wearOf(rw, "pig")) === JSON.stringify({ head: null, side: null, back: null }));
}
// 備份碼清洗：保留 closet／wear，丟掉不合法的
{
  const c = R.cleanRewards({ pets: { bear: { stage: 2 }, dog: { stage: 3 } }, closet: ["wings", "zzz", "wings"],
    wear: { bear: { head: "hat", side: "crown", back: "wings", tail: "hat" }, dog: { head: "crown", back: null, side: "flower" }, ghost: { head: "hat" }, cat: { head: "hat" } } });
  ok("清洗：closet 去重、丟不認得、補起始兩件", c.closet.join() === "hat,bow,wings", c.closet.join());
  ok("清洗：wear 只留合法值（部位對、擁有或超級預設、寵物有收集），null 保留", JSON.stringify(c.wear) === JSON.stringify({ bear: { head: "hat", back: "wings" }, dog: { head: "crown", back: null } }), JSON.stringify(c.wear));
  const z = R.cleanRewards({ pets: { bear: { stage: 2 } } });
  ok("清洗：舊備份碼沒有換裝欄位 → 起始衣櫃、空 wear", z.closet.join() === "hat,bow" && JSON.stringify(z.wear) === "{}");
  const rt = R.cleanRewards(JSON.parse(JSON.stringify(c)));
  ok("清洗：洗過的再洗一次不變（備份碼來回）", JSON.stringify(rt) === JSON.stringify(c));
}
// 扭蛋普通獎：裝飾＋可抽配件一起當池子；配件會進衣櫃；全拿到就給點心；只有 4 件可抽
{
  const rw = R.migrate({}); rw.coins = 200; const got = { decor: new Set(), wear: new Set() }; let treats = 0, s = 11;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 200; i++) { rw.pity = { rare: 0, ssr: 0 }; const x = R.pull(rw, { rand: seq([0.99, 0.1, rand()]) }); if (x.kind === "decor") got.decor.add(x.id); else if (x.kind === "wear") got.wear.add(x.id); else treats++; }   // 每抽：普通、抽「東西」、池子裡隨機一個
  ok("普通獎池：拿得到全部 3 種裝飾＋4 件可抽配件，而且都進存檔", got.decor.size === 3 && got.wear.size === 4 && [...got.wear].every(i => R.GACHA_WEAR.includes(i) && rw.closet.includes(i)) && rw.decor.length === 3, JSON.stringify([[...got.decor], [...got.wear]]));
  ok("普通獎池：不可抽的配件（翅膀、彩虹披風…）一件都沒出現", !rw.closet.some(i => !R.GACHA_WEAR.includes(i) && !R.START_WEAR.includes(i)), rw.closet.join());
  const before = rw.treats; const y = R.pull(Object.assign(rw, { coins: 1, pity: { rare: 0, ssr: 0 } }), { rand: seq([0.9, 0.1, 0.1]) });
  ok("普通獎池：全拿到之後就算抽中「東西」也給點心包", y.kind === "treats" && rw.treats === before + R.TREAT_PACK, JSON.stringify(y));
}
{
  const rw = R.migrate({}); rw.coins = 1;
  const x = R.pull(rw, { rand: seq([0.9, 0.1, 0.99]) });   // 普通、抽「東西」、池子最後一個（7 件中第 7 件＝最後一個可抽配件）
  ok("普通獎池：抽到配件回傳 kind=wear、id，且已放進衣櫃", x.kind === "wear" && x.id === R.GACHA_WEAR[R.GACHA_WEAR.length - 1] && rw.closet.includes(x.id), JSON.stringify(x));
}
// 普通獎的「東西／點心」各一半、保底不變（再跑一次大量統計）
{
  const rw = R.migrate({}); const n = 60000; let item = 0, common = 0, s = 3;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) { rw.coins = 1; rw.pity = { rare: 0, ssr: 0 }; rw.decor = []; rw.closet = ["hat", "bow"]; const x = R.pull(rw, { rand }); if (x.tier === "common") { common++; if (x.kind !== "treats") item++; } }
  ok("普通獎：東西≈50%（池子沒空時）", Math.abs(item / common - R.COMMON_ITEM_RATE) < 0.015, `${item}/${common}`);
  const rw2 = R.migrate({}); rw2.coins = 30; const t2 = []; for (let i = 0; i < 15; i++) t2.push(R.pull(rw2, { rand: () => 0.99 }).tier);
  ok("保底不變：第 5、10 抽稀有以上、第 15 抽超稀有", t2[4] !== "common" && t2[9] !== "common" && t2[14] === "ssr", t2.join(","));
}
// 公開機率常數與文字（家長頁）
{
  const t = R.oddsText();
  ok("機率表：GACHA_ODDS 與 RATES 一致、文字含 4 件可抽配件名、其他配件送貨拿", R.GACHA_ODDS.common.rate === R.RATES.common && R.GACHA_ODDS.common.wear.length === 4 && t.length === 6 && ["皇冠", "小花", "派對帽", "背包"].every(n => t[0].includes(n)) && t[5].includes("翅膀"), t[0]);
  // 寧次 10-12：每一項寫實際機率、百分比放段首（35%／35%／25%／5%，加起來 100%）
  const lead = t.slice(0, 4).map(s => (s.match(/^(\d+)%/) || [])[1]).map(Number);
  ok("機率表：前 4 段段首＝各項實際百分比 35／35／25／5（加起來 100）", lead.join() === "35,35,25,5" && lead.reduce((a, b) => a + b, 0) === 100 && t[0].includes("裝飾") && t[1].includes("點心包") && t[1].includes("70%"), JSON.stringify(t.slice(0, 4)));
}
// 存檔不可信（里維 10-12）：migrate 先洗再用，壞掉的不會丟錯（開頁白屏）
{
  const bad = [{ rewards: { pets: 5 } }, { rewards: { pets: "x", closet: 7, wear: [1], pity: 3, decor: "a", catBonus: {}, partner: 9 } }, { rewards: 5 }, { rewards: "壞掉" }, { rewards: [] }, null, undefined, 5, {}];
  const res = bad.map(o => { try { const r = R.migrate(o); return ["bear", "bunny", "cat", "fox"].every(id => r.pets[id] && r.pets[id].stage === 2) && r.partner === "bear" && r.closet.join() === "hat,bow" && JSON.stringify(r.wear) === "{}" ? "ok" : "壞:" + JSON.stringify(r); } catch (e) { return "丟錯:" + e.message; } });
  ok("migrate：壞存檔（pets:5、型別全錯、rewards 不是物件、null）不丟錯、起始 4 隻＋起始衣櫃", res.every(x => x === "ok"), JSON.stringify(res));
  const g = R.migrate({ rewards: "壞掉", eggs: 2 });
  ok("migrate：rewards 不是物件＝當新存檔，照樣做 eggs 搬家（6 隻、用掉 2 罐）", Object.keys(g.pets).length === 6 && g.pets.panda && g.pets.penguin && g.jarCoins === 2, JSON.stringify(g.pets));
  const p = R.migrate({ rewards: { pets: 5 }, eggs: 2 });
  ok("migrate：rewards 是物件但欄位壞＝洗乾淨後保留（不當舊存檔、不重複給 eggs 的朋友）", Object.keys(p.pets).length === 4 && p.jarCoins === 0, JSON.stringify(p.pets));
  const good = { pets: { bear: { stage: 2, t: 31 }, bunny: { stage: 2, t: 30 }, cat: { stage: 3, t: 120 }, fox: { stage: 1, t: 4 }, dog: { stage: 3, t: 200 } }, partner: "dog", coins: 3, gold: 1, jarCoins: 12, treats: 250,
    decor: ["statue_owl"], stamps: 4, stampDay: "2026-10-11", pity: { rare: 2, ssr: 9 }, catBonus: ["animal"], pulls: 30, closet: ["hat", "bow", "wings", "crown"], wear: { dog: { head: "hat", back: null }, bear: { back: "wings" } },
    evo: { e: { cat: 30 }, done: ["dog"], day: "2026-10-12", tb: 12, seen: 1 } };   // v7 寵物進化
  const m = R.migrate({ rewards: JSON.parse(JSON.stringify(good)), eggs: 4 });
  ok("migrate：正常存檔洗過完全不變（不掉任何欄位）", JSON.stringify(m) === JSON.stringify(good), JSON.stringify(m));
}
// 原型鏈上的鍵（"constructor"、"toString"、"__proto__"）騙不過查表（里維 10-12）
{
  const d = JSON.parse('{"pets":{"constructor":{"stage":2},"toString":{"stage":3},"__proto__":{"stage":2},"bear":{"stage":2}},"partner":"constructor","closet":["constructor","toString","__proto__","hasOwnProperty","wings"],' +
    '"wear":{"constructor":{"head":"hat"},"toString":{"head":"hat"},"bear":{"head":"constructor","side":"toString","back":"wings"}}}');
  const c = R.cleanRewards(d);
  ok("清洗：原型鏈鍵不算寵物／配件／穿著，夥伴退回小熊", JSON.stringify(Object.keys(c.pets)) === '["bear"]' && c.partner === "bear" && c.closet.join() === "hat,bow,wings" && JSON.stringify(c.wear) === JSON.stringify({ bear: { back: "wings" } }), JSON.stringify(c));
  const m = R.migrate({ rewards: d });
  ok("migrate：原型鏈鍵的存檔照樣開得起來、夥伴＝小熊", m.partner === "bear" && !Object.prototype.hasOwnProperty.call(m.pets, "constructor") && m.pets.bear, JSON.stringify(Object.keys(m.pets)));
  const rw = R.migrate({});
  const r = [R.giveWear(rw, "constructor"), R.giveWear(rw, "toString"), R.canWear(rw, "constructor", "hat"), R.canWear(rw, "bear", "constructor"), R.setWear(rw, "constructor", "head", "hat"), R.setWear(rw, "bear", "head", "toString")];
  ok("giveWear／canWear／setWear：原型鏈鍵一律拒絕、衣櫃不變", r.every(x => x === false) && rw.closet.join() === "hat,bow" && JSON.stringify(rw.wear) === "{}", JSON.stringify(r));
  rw.wear.bear = JSON.parse('{"head":"constructor"}');
  ok("wearOf：存檔裡的原型鏈鍵當作沒穿；沒收集的「寵物」constructor 全空", JSON.stringify(R.wearOf(rw, "bear")) === JSON.stringify({ head: null, side: null, back: null }) && JSON.stringify(R.wearOf(rw, "constructor")) === JSON.stringify({ head: null, side: null, back: null }));
}
// 配件擺放微調：items → pets[部位] → pets[配件] 疊加
{
  const fit = { items: { bow: { r: [0, -25, -22] } }, pets: { lion: { head: { p: [0, -0.05, 0], s: 0.9 }, crown: { p: [0, 0.01, 0.02], s: 1.1 }, bow: { hide: true } } } };
  const a = R.wearPose(fit, "lion", "crown"), b = R.wearPose(fit, "bear", "bow"), c = R.wearPose(fit, "lion", "bow"), d = R.wearPose(null, "bear", "hat"), e = R.wearPose(fit, "lion", "baby_tuft");
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  ok("wearPose：部位＋配件疊加（p 相加、s 相乘）", near(a.p[1], -0.04) && near(a.p[2], 0.02) && near(a.s, 0.99) && a.r.join() === "0,0,0", JSON.stringify(a));
  ok("wearPose：配件預設旋轉、hide、沒資料＝原樣、寶寶小芽算頭上", b.r.join() === "0,-25,-22" && !b.hide && c.hide && d.s === 1 && d.p.join() === "0,0,0" && near(e.p[1], -0.05), JSON.stringify([b, c, e]));
}
// v7 寵物進化（docs/zhuyin-v7-plan.md §2）：能量只給超級、還沒進化的夥伴；滿 100 等演出；清洗；每天第一次餵點心；爬塔樓層記號
{
  const rw = R.migrate({});
  ok("新存檔有 evo（空的、tb＝-1、沒看過演出）", JSON.stringify(rw.evo) === JSON.stringify({ e: {}, done: [], day: "", tb: -1, seen: 0 }), JSON.stringify(rw.evo));
  ok("夥伴還是長大（不是超級）：加不了能量", R.evoAdd(rw, 10).got === 0 && JSON.stringify(rw.evo.e) === "{}" && !R.canCharge(rw, "bear"));
  rw.pets.bear.stage = 3;
  const a = R.evoAdd(rw, 10), b = R.evoAdd(rw, 85), c = R.evoAdd(rw, 40), d = R.evoAdd(rw, 5);
  ok("超級夥伴：+10、+85、+40（只加到 100、剛好集滿）、滿了再加＝0", a.got === 10 && b.got === 85 && c.got === 5 && c.full && !b.full && d.got === 0 && !d.full && R.evoEnergy(rw, "bear") === 100, JSON.stringify([a, b, c, d]));
  ok("滿了＝ready 名單有小熊、還沒進化", R.evoIsReady(rw, "bear") && R.evoReadyList(rw).join() === "bear" && !R.isEvo(rw, "bear"));
  ok("evolve：進化、能量清掉、不能再進化", R.evolve(rw, "bear") && R.isEvo(rw, "bear") && !("bear" in rw.evo.e) && !R.evolve(rw, "bear") && R.evoAdd(rw, 10).got === 0);
  ok("evolve：能量沒滿／沒有這隻＝false", !R.evolve(rw, "cat") && !R.evolve(rw, "dragon") && !R.evolve(rw, "constructor"));
  ok("evoName：超級＋名字", R.evoName("elephant") === "超級小象" && R.evoName("dragon") === "超級彩虹小龍");
}
{
  const rw = R.migrate({}); rw.pets.cat.stage = 3; rw.partner = "cat";
  const a = R.evoFeedDay(rw, "2026-10-13"), b = R.evoFeedDay(rw, "2026-10-13"), c = R.evoFeedDay(rw, "2026-10-14");
  ok("每天第一次餵點心 +5（同一天第二次 0、隔天又 +5）", a.got === 5 && b.got === 0 && c.got === 5 && R.evoEnergy(rw, "cat") === 10 && rw.evo.day === "2026-10-14", JSON.stringify([a, b, c]));
  rw.partner = "bear";
  const d = R.evoFeedDay(rw, "2026-10-15"), dayKept = rw.evo.day === "2026-10-14";
  rw.partner = "cat";
  ok("夥伴不能集的那天：不算用掉（換成超級夥伴同一天還能拿）", d.got === 0 && dayKept && R.evoFeedDay(rw, "2026-10-15").got === 5);
}
{
  const rw = R.migrate({}); rw.pets.cat.stage = 3; rw.partner = "cat";
  const a = R.evoTower(rw, 7, 6), b = R.evoTower(rw, 7, 7), c = R.evoTower(rw, 10, 7), d = R.evoTower(rw, 3, 10);
  ok("爬塔：第一次對＝用存之前的樓層當起點（6→7：+2）、同樓層 0、到 10 層 +6、樓層歸零不扣也不給", a.got === 2 && b.got === 0 && c.got === 6 && d.got === 0 && rw.evo.tb === 10 && R.evoEnergy(rw, "cat") === 8, JSON.stringify([a, b, c, d, rw.evo.tb]));
  const rw2 = R.migrate({}); rw2.pets.cat.stage = 3; rw2.partner = "cat";
  ok("爬塔：舊存檔第一次對、存之前已經爬到 30 層＝不補發", R.evoTower(rw2, 30, 30).got === 0 && rw2.evo.tb === 30);
  ok("能量常數：3 星 10、樓層 2、守塔怪 40、每天餵點心 5、滿 100", R.EVO_GAIN.star3 === 10 && R.EVO_GAIN.floor === 2 && R.EVO_GAIN.boss === 40 && R.EVO_GAIN.feedDay === 5 && R.EVO_MAX === 100);
}
{
  const d = JSON.parse('{"pets":{"bear":{"stage":3},"cat":{"stage":2},"dog":{"stage":3}},"partner":"bear","evo":{"e":{"bear":250,"cat":50,"dog":-4,"constructor":30,"elephant":20},"done":["dog","cat","toString",5,"dog"],"day":"2026-10-13xx","tb":"abc","seen":"yes"}}');
  const c = R.cleanRewards(d).evo;
  ok("清洗 evo：能量 0..100、只留有這隻＋超級的、done 不重複且要超級、原型鏈鍵不算、tb 壞＝-1", JSON.stringify(c) === JSON.stringify({ e: { bear: 100 }, done: ["dog"], day: "2026-10-13", tb: -1, seen: 1 }), JSON.stringify(c));
  ok("清洗 evo：不是物件＝全新", JSON.stringify(R.cleanRewards({ pets: {}, evo: [1, 2] }).evo) === JSON.stringify({ e: {}, done: [], day: "", tb: -1, seen: 0 }) && JSON.stringify(R.cleanRewards({ pets: {}, evo: "x" }).evo.done) === "[]");
  const rw = R.migrate({}); rw.evo = null; rw.pets.bear.stage = 3;
  ok("存檔裡 evo 被弄壞成 null：evoAdd 自己補回來", R.evoAdd(rw, 10).got === 10 && rw.evo.e.bear === 10);
}
for (const l of out) console.log(l);
const bad = out.filter(l => l.startsWith("FAIL")).length; console.log(bad ? `\n${bad} FAILED / ${out.length}` : `\nALL PASS (${out.length})`);
