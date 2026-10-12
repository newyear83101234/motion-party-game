// 注音戰鬥陀螺：戰力分佈統計（調 js/zhuyin-tops-power.js 的 ★ 數字用）
// 用法：node tools/tops/power_dist.mjs        （固定亂數種子，每次結果一樣）
// 印：①50 句隨機常用字組合 ②2 萬句大樣本的分位數與「8000 以上」比例 ③規格例句與隨機靈感 ④最強可能組合（看 9999 有多難）
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const P = await import(pathToFileURL(path.join(ROOT, "js/zhuyin-tops-power.js")).href);
const D = P.decodeDict(JSON.parse(fs.readFileSync(path.join(ROOT, "js/zhuyin-tops-dict.json"), "utf8")));
let seed = 20261012;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const COMMON = Math.min(3000, D.n);                      // 小孩會打的字：字頻前 3000
const pickPhrase = () => Array.from({ length: 5 }, () => D.chars[Math.floor(rnd() * COMMON)]).join("");
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const summary = arr => { const s = arr.slice().sort((x, y) => x - y), n = s.length, mean = s.reduce((x, y) => x + y, 0) / n;
  return { n, min: s[0], p05: q(s, 0.05), p25: q(s, 0.25), median: q(s, 0.5), p75: q(s, 0.75), p95: q(s, 0.95), max: s[n - 1], mean: Math.round(mean),
    in3000_6500: +(s.filter(x => x >= 3000 && x <= 6500).length / n * 100).toFixed(1) + "%", ge8000: +(s.filter(x => x >= 8000).length / n * 100).toFixed(2) + "%", eq9999: s.filter(x => x >= 9999).length }; };

const fifty = Array.from({ length: 50 }, () => { const p = pickPhrase(); return [p, P.powerOf(p, D).total]; });
console.log("① 50 句隨機常用字組合（字頻前 " + COMMON + " 字）");
console.log(fifty.map(([p, v]) => p + " " + v).join("　"));
console.log(JSON.stringify(summary(fifty.map(x => x[1]))));

const big = Array.from({ length: 20000 }, () => P.powerOf(pickPhrase(), D));
console.log("\n② 2 萬句大樣本");
console.log(JSON.stringify(summary(big.map(r => r.total))));
const bc = {}; for (const r of big) for (const b of r.bonuses) bc[b.id] = (bc[b.id] || 0) + 1;
console.log("加成出現率：" + Object.entries(bc).map(([k, v]) => `${k} ${(v / big.length * 100).toFixed(1)}%`).join("、"));
const singles = D.chars.slice(0, COMMON).split("").map(c => P.charPower(P.statsOf(c, D))).sort((a, b) => a - b);
console.log("單字戰力（前 " + COMMON + " 字）：" + JSON.stringify({ min: singles[0], p05: q(singles, 0.05), median: q(singles, 0.5), p95: q(singles, 0.95), max: singles[singles.length - 1] }));

console.log("\n③ 例句");
const EX = ["宇宙強爸爸", "超級賽亞人", "努力小紅帽", "紅色翹翹板", "勇敢小兔子"];
for (const p of EX) { const r = P.powerOf(p, D); console.log(`${p} ${r.total}（單字 ${r.perChar.map(c => c.ch + c.power).join(" ")}；加成 ${r.bonuses.map(b => b.name + "+" + b.value).join(" ") || "無"}）`); }

console.log("\n④ 最強可能組合");
const all = D.chars.split("").map(c => [c, P.charPower(P.statsOf(c, D))]).sort((a, b) => b[1] - a[1]);
const top5 = all.slice(0, 5).map(x => x[0]).join("");
console.log("全表最強 5 個不同的字：" + top5 + " " + P.powerOf(top5, D).total + "（" + all.slice(0, 5).map(x => x.join("")).join(" ") + "）");
const topCommon = D.chars.slice(0, COMMON).split("").map(c => [c, P.charPower(P.statsOf(c, D))]).sort((a, b) => b[1] - a[1]);
const tc5 = topCommon.slice(0, 5).map(x => x[0]).join("");
console.log("常用前 " + COMMON + " 最強 5 字：" + tc5 + " " + P.powerOf(tc5, D).total);
const same = all[0][0].repeat(5);
console.log("最強的字打 5 次：" + same + " " + P.powerOf(same, D).total + "　兩字疊兩次：" + (all[0][0] + all[0][0] + all[1][0] + all[1][0] + all[2][0]) + " " + P.powerOf(all[0][0] + all[0][0] + all[1][0] + all[1][0] + all[2][0], D).total);
// 爬山找加成全拿的最高分（大人想衝 9999 的話大概長這樣）
let bestP = top5, bestV = P.powerOf(top5, D).total;
const pool = all.slice(0, 400).map(x => x[0]);
for (let it = 0; it < 60000; it++) {
  const arr = bestP.split(""); arr[Math.floor(rnd() * 5)] = pool[Math.floor(rnd() * pool.length)];
  const p = arr.join(""), v = P.powerOf(p, D).total; if (v >= bestV) { bestV = v; bestP = p; }
}
const br = P.powerOf(bestP, D);
console.log("爬山找到的最高分：" + bestP + " " + bestV + "（原始總和 " + br.sum + "＋加成 " + br.bonuses.map(b => b.name).join("") + "）");
