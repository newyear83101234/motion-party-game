// 方塊爆破：自動對打用的電腦玩家（sim.mjs / trace.mjs 共用）
import * as C from "../../js/blocks-core.js";

// 盤面好壞：越空、越不碎、能放的形狀越多越好
export function evalRows(rows) {
  let fits = 0;
  for (const s of C.SHAPES) if (C.fitsAnywhere(rows, s)) fits += s.n;
  let lonely = 0;
  for (let r = 0; r < C.N; r++) for (let c = 0; c < C.N; c++) {
    if (rows[r] >> c & 1) continue;
    const up = r === 0 || (rows[r - 1] >> c & 1), dn = r === C.N - 1 || (rows[r + 1] >> c & 1);
    const lf = c === 0 || (rows[r] >> (c - 1) & 1), rt = c === C.N - 1 || (rows[r] >> (c + 1) & 1);
    if (up && dn && lf && rt) lonely++;
  }
  // 平整度：列／欄裡「有↔空」交界越少越好（邊界當作有格子）
  let trans = 0;
  for (let r = 0; r < C.N; r++) { let prev = 1; for (let c = 0; c < C.N; c++) { const b = rows[r] >> c & 1; if (b !== prev) trans++; prev = b; } if (!prev) trans++; }
  for (let c = 0; c < C.N; c++) { let prev = 1; for (let r = 0; r < C.N; r++) { const b = rows[r] >> c & 1; if (b !== prev) trans++; prev = b; } if (!prev) trans++; }
  return fits * 1.0 - C.filledCount(rows) * 1.5 - lonely * 8 - trans * 1.2;
}
export function botMove(g) {
  const rows = C.gridRows(g.S.grid);
  let best = null;
  g.S.tray.forEach((p, i) => {
    if (!p) return;
    const s = C.SHAPE_BY_ID[p.id];
    for (let r = 0; r + s.h <= C.N; r++) for (let c = 0; c + s.wd <= C.N; c++) {
      if (!C.canPlaceRows(rows, s, r, c)) continue;
      const res = C.placeRows(rows, s, r, c);
      // 放了之後手上其他塊還要放得完（像人會先放大塊、不把自己卡死）
      const rest = g.S.tray.filter((q, j) => q && j !== i).map(q => C.SHAPE_BY_ID[q.id]);
      if (rest.length && !C.allPlaceable(res.rows, rest, { n: 4000 })) continue;
      let v = evalRows(res.rows) + res.lines * 30;
      // 冒險：消到寶石加分
      if (g.S.mode === "adventure" && res.lines) {
        for (let rr = 0; rr < C.N; rr++) for (let cc = 0; cc < C.N; cc++)
          if (((res.fullRows >> rr & 1) || (res.fullCols >> cc & 1)) && g.S.grid[rr][cc] && g.S.grid[rr][cc].gem) v += 25;
      }
      if (!best || v > best.v) best = { i, r, c, v };
    }
  });
  return best;
}
export function play(g, cap = 3000) {
  let t0 = 0, deals = 0;
  while (!g.S.over && !g.S.won && g.S.moves < cap) {
    const m = botMove(g);
    if (!m) break;
    const a = performance.now();
    const ev = g.place(m.i, m.r, m.c);
    if (ev.refilled) { t0 += performance.now() - a; deals++; }
  }
  return { moves: g.S.moves, score: g.S.score, won: g.S.won, dealMs: deals ? t0 / deals : 0 };
}
