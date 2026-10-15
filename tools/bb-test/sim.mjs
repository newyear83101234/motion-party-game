// 方塊爆破：電腦自動對打，量難度用
// 用法：node tools/bb-test/sim.mjs classic 200     → 經典模式 200 局的步數／分數分布
//       node tools/bb-test/sim.mjs adventure 20    → 每關跑 20 次的過關率
import * as C from "../../js/blocks-core.js";
import { play } from "./bot.mjs";

const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];

const [mode = "classic", nArg = "100"] = process.argv.slice(2);
const n = +nArg;
if (mode === "classic") {
  const res = [];
  for (let k = 0; k < n; k++) res.push(play(C.createGame({ mode: "classic", seed: 1000 + k })));
  const mv = res.map(r => r.moves), sc = res.map(r => r.score);
  console.log(`經典 ${n} 局`);
  console.log(`  步數 p10/p50/p90 = ${pct(mv, .1)} / ${pct(mv, .5)} / ${pct(mv, .9)}`);
  console.log(`  分數 p10/p50/p90 = ${pct(sc, .1)} / ${pct(sc, .5)} / ${pct(sc, .9)}`);
  console.log(`  出塊平均耗時 ${(res.reduce((a, r) => a + r.dealMs, 0) / n).toFixed(2)} ms`);
} else {
  const from = +(process.argv[4] || 1), to = +(process.argv[5] || C.LEVEL_COUNT);
  const rows = [];
  for (let L = from; L <= to; L++) {
    let win = 0; const mv = [];
    for (let k = 0; k < n; k++) { const r = play(C.createGame({ mode: "adventure", level: L, seed: L * 100 + k }), 600); if (r.won) { win++; mv.push(r.moves); } }
    const def = C.levelDef(L);
    rows.push(`關${String(L).padStart(2)}  過關 ${String(Math.round(win / n * 100)).padStart(3)}%  步數中位 ${mv.length ? pct(mv, .5) : "-"}  目標 ${def.goals.map(g => g.t === "score" ? "分數" + g.need : g.gem + g.need).join(" ")}`);
  }
  console.log(rows.join("\n"));
}
