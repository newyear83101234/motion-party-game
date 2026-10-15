// 追經典模式早死的局：印出死前盤面與手上三塊
// 用法：node tools/bb-test/trace.mjs [局數] [早死門檻步數]
import * as C from "../../js/blocks-core.js";
import { botMove } from "./bot.mjs";

const games = +(process.argv[2] || 60), early = +(process.argv[3] || 40);
const show = rows => rows.map(x => [...Array(C.N)].map((_, c) => x >> c & 1 ? "#" : ".").join("")).join("\n");
const shape = id => { const s = C.SHAPE_BY_ID[id]; return id + "(" + s.n + ")"; };
let printed = 0, deathFill = [];
for (let k = 0; k < games; k++) {
  const g = C.createGame({ mode: "classic", seed: 1000 + k });
  let lastTray = null, lastRows = null;
  while (!g.S.over && g.S.moves < 3000) {
    if (g.S.tray.filter(Boolean).length === 3) { lastTray = g.S.tray.map(p => p.id); lastRows = C.gridRows(g.S.grid); }
    const m = botMove(g); if (!m) break;
    g.place(m.i, m.r, m.c);
  }
  deathFill.push(C.filledCount(C.gridRows(g.S.grid)));
  if (g.S.moves < early && printed < 3) {
    printed++;
    console.log(`\n=== seed ${1000 + k} 死在第 ${g.S.moves} 步，最後一組發牌時盤面：`);
    console.log(show(lastRows));
    console.log("發到：", lastTray.map(shape).join(" "), " 三塊全放得下？", C.allPlaceable(lastRows, lastTray.map(id => C.SHAPE_BY_ID[id])));
    console.log("死時盤面：\n" + show(C.gridRows(g.S.grid)));
    console.log("手上剩：", g.S.tray.filter(Boolean).map(p => shape(p.id)).join(" "));
  }
}
deathFill.sort((a, b) => a - b);
console.log("\n死時盤面格數 p10/p50/p90 =", deathFill[Math.floor(games * .1)], deathFill[Math.floor(games * .5)], deathFill[Math.floor(games * .9)]);
