// 方塊爆破畫面測試：獨立 headless Chromium（不碰共用瀏覽器）
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/bb-test/ui.js [輸出資料夾]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.BB_URL || "http://127.0.0.1:8765/blocks.html";
const OUT = process.argv[2] || path.join(process.env.TEMP, "bb-shots");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, "01-menu.png") });

  // 1) 經典模式：用滑鼠真的拖一塊上去
  await p.click("#bClassic"); await p.waitForTimeout(500);
  const L = await p.evaluate(() => ({ ...__bb.L }));
  const before = await p.evaluate(() => __bb.game.S.moves);
  await p.mouse.move(L.sx[1], L.ty); await p.mouse.down();
  await p.mouse.move(L.sx[1], L.ty - 80, { steps: 4 });
  await p.mouse.move(L.bx + L.B / 2, L.by + L.B * 0.75, { steps: 8 });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, "02-dragging.png") });
  await p.mouse.up(); await p.waitForTimeout(300);
  const after = await p.evaluate(() => __bb.game.S.moves);
  check("滑鼠拖曳放下一塊", after === before + 1, `moves ${before}→${after}`);

  // 2) 拖到棋盤外 → 不放、飛回托盤
  const t0 = await p.evaluate(() => __bb.game.S.tray.filter(Boolean).length);
  await p.mouse.move(L.sx[0], L.ty); await p.mouse.down(); await p.mouse.move(L.sx[0], L.ty - 10, { steps: 3 }); await p.mouse.up();
  await p.waitForTimeout(300);
  const t1 = await p.evaluate(() => __bb.game.S.tray.filter(Boolean).length);
  check("沒拖到棋盤上不會放", t0 === t1, `tray ${t0}→${t1}`);

  // 3) 消行特效：排一個會消 2 條、連擊 3 的局面，抓三個時間點
  await p.evaluate(() => {
    const S = __bb.game.S;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) S.grid[r][c] = null;
    for (let r = 6; r < 8; r++) for (let c = 0; c < 8; c++) if (c !== 2) S.grid[r][c] = { k: (r * 3 + c) % 7, gem: null };
    S.grid[1][1] = { k: 5, gem: null }; S.grid[3][5] = { k: 0, gem: null };
    S.tray = [{ id: "i2v", k: 3, gems: null }, { id: "o2", k: 1, gems: null }, { id: "i3h", k: 6, gems: null }];
    S.combo = 2;
  });
  // 拖曳預覽（會消的線變色＋亮光）
  const cell = L.cell;
  await p.mouse.move(L.sx[0], L.ty); await p.mouse.down();
  const tx = L.gx + 2.5 * cell, ty = L.gy + 7 * cell + cell * 0.9 + cell;   // 目標格子中心 + 手指偏移（lift = h*cell/2 + 0.9cell）
  await p.mouse.move(tx, ty, { steps: 10 }); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, "03-preview.png") });
  const snap = await p.evaluate(() => null);
  await p.mouse.up();
  await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, "04-clear-120ms.png") });
  await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, "05-clear-370ms.png") });
  const st = await p.evaluate(() => ({ combo: __bb.game.S.combo, score: __bb.game.S.score }));
  check("消 2 條＋連擊", st.combo === 3, JSON.stringify(st));
  void snap;

  // 4) 放不下 → 結束畫面
  await p.evaluate(() => {
    const S = __bb.game.S;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) S.grid[r][c] = ((r + c) % 2 === 0 || r === 0) ? { k: (r + c) % 7, gem: null } : null;
    S.grid[0][7] = null; S.grid[1][7] = null;
    S.tray = [{ id: "i2v", k: 3, gems: null }, { id: "o3", k: 1, gems: null }, null];
    __bb.doPlace(0, 0, 7);
  });
  await p.waitForTimeout(1200); await p.screenshot({ path: path.join(OUT, "06-over-gray.png") });
  await p.waitForTimeout(1200);
  const cur = await p.evaluate(() => __bb.current);
  check("放不下 → 結束畫面", cur === "sOver", cur);
  await p.screenshot({ path: path.join(OUT, "07-over.png") });

  // 5) 冒險第 1 關：畫面＋過關
  await p.click("#bOverHome"); await p.waitForTimeout(200);
  await p.click("#bAdventure"); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, "08-levels.png") });
  await p.click("#levelGrid .lv >> nth=0"); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, "09-level1.png") });
  // 用電腦玩家邏輯直接玩到過關（最多 200 步）
  const lv = await p.evaluate(async () => {
    const { C } = __bb;
    for (let k = 0; k < 200; k++) {
      const g = __bb.game; if (g.S.won || g.S.over) break;
      const rows = C.gridRows(g.S.grid); let best = null;
      g.S.tray.forEach((q, i) => { if (!q) return; const s = C.SHAPE_BY_ID[q.id];
        for (let r = 0; r + s.h <= 8; r++) for (let c = 0; c + s.wd <= 8; c++) if (C.canPlaceRows(rows, s, r, c)) {
          const res = C.placeRows(rows, s, r, c);
          const rest = g.S.tray.filter((x, j) => x && j !== i).map(x => C.SHAPE_BY_ID[x.id]);
          if (rest.length && !C.allPlaceable(res.rows, rest)) continue;   // 別把手上其他塊卡死
          const v = res.lines * 100 - C.filledCount(res.rows) + Math.random();
          if (!best || v > best.v) best = { i, r, c, v }; } });
      if (!best) break;
      __bb.doPlace(best.i, best.r, best.c);
      await new Promise(r => setTimeout(r, 40));
    }
    return { won: __bb.game.S.won, moves: __bb.game.S.moves, goals: __bb.game.S.goals };
  });
  await p.waitForTimeout(900); await p.screenshot({ path: path.join(OUT, "10-level-win-fx.png") });
  await p.waitForTimeout(1500);
  const cur2 = await p.evaluate(() => __bb.current);
  check("第 1 關可以過關", lv.won && cur2 === "sResult", JSON.stringify({ won: lv.won, moves: lv.moves, cur2 }));
  await p.screenshot({ path: path.join(OUT, "11-result.png") });
  const done = await p.evaluate(() => JSON.parse(localStorage.getItem("bb_adv") || "{}"));
  check("過關有存檔", (done.done || []).includes(1), JSON.stringify(done));

  // 6) 經典模式存檔：重新整理後接著玩
  await p.click("#bResLevels"); await p.click("#bLvBack"); await p.click("#bClassic"); await p.waitForTimeout(300);
  await p.evaluate(() => { const S = __bb.game.S; const i = S.tray.findIndex(Boolean); const s = __bb.C.SHAPE_BY_ID[S.tray[i].id];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (__bb.game.canPlace(i, r, c)) { __bb.doPlace(i, r, c); return; } });
  const sc1 = await p.evaluate(() => __bb.game.S.score);
  await p.reload(); await p.waitForTimeout(400);
  const sub = await p.textContent("#classicSub");
  await p.click("#bClassic"); await p.waitForTimeout(300);
  const sc2 = await p.evaluate(() => __bb.game.S.score);
  check("重新整理後接著玩", sc1 === sc2 && sc1 > 0, `${sc1} → ${sc2}，選單字「${sub}」`);

  // 7) 壞存檔：經典存檔格式壞掉、冒險進度不是陣列 → 不當掉、照常開新局
  // 要在「舊頁面關閉時自動存檔」之後才寫壞資料 → 用 init script 在新頁面載入前寫
  await ctx.addInitScript(() => {
    if (window.name !== "bad") return;
    window.name = "";
    localStorage.setItem("bb_save_classic", '{"grid":null,"tray":[1]}'); localStorage.setItem("bb_adv", '{"done":"x"}'); localStorage.setItem("bb_best", '"abc"');
  });
  await p.evaluate(() => { window.name = "bad"; });
  await p.reload(); await p.waitForTimeout(400);
  const badSaved = await p.evaluate(() => localStorage.getItem("bb_save_classic"));
  if (!/"grid":null/.test(badSaved || "")) check("（測試本身）壞存檔有寫進去", false, badSaved);
  const advTxt = await p.textContent("#menuAdv");
  await p.click("#bClassic"); await p.waitForTimeout(300);
  const ok7 = await p.evaluate(() => !!__bb.game && __bb.game.S.score === 0 && __bb.current === null);
  check("壞存檔不當掉、改開新局", ok7 && /已過 0/.test(advTxt), advTxt);

  // 8) 系統取消觸控（pointercancel）→ 不放
  const m0 = await p.evaluate(() => __bb.game.S.moves);
  await p.evaluate(() => {
    const L = __bb.L, ev = (type, x, y) => document.getElementById("cv").dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, isPrimary: true }));
    ev("pointerdown", L.sx[0], L.ty); ev("pointermove", L.bx + L.B / 2, L.by + L.B * 0.8); ev("pointercancel", L.bx + L.B / 2, L.by + L.B * 0.8);
  });
  await p.waitForTimeout(250);
  check("pointercancel 不會放下", (await p.evaluate(() => __bb.game.S.moves)) === m0);

  check("沒有 JS 錯誤", errs.length === 0, errs.slice(0, 3).join(" | "));
  console.log(results.join("\n"));
  console.log("截圖：" + OUT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
