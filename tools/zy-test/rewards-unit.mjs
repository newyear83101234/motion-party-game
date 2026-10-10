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
for (const l of out) console.log(l);
const bad = out.filter(l => l.startsWith("FAIL")).length; console.log(bad ? `\n${bad} FAILED / ${out.length}` : `\nALL PASS (${out.length})`);
