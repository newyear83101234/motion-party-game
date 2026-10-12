// 挑戰燈塔純邏輯測試（10-13）：node tools/zy-test/tower-unit.mjs
// 驗：樓層表（7 種遊戲每段都有、不連續重複、依樓層固定、題數、等級、沙漏、記憶／藏圖只給對的遊戲、Boss 種類）、愛心（扣心、教學層不扣、補心、Boss 補滿、保底金色愛心）、
//     存檔點、獎勵（5 的倍數第一次 +1 星、Boss 第一次 +1 幣＋徽章、登頂王冠、代號收回後不重發）、保底星星一天 3 場、本機存檔清洗、跟後端同步（ping／score 夾 +20／lost）
import * as C from "../../js/zhuyin-tower-core.js";

let pass = 0, fail = 0; const fails = [];
const ok = (cond, name, info) => { if (cond) pass++; else { fail++; fails.push(name + (info !== undefined ? "  → " + JSON.stringify(info) : "")); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b });

// ---------- 樓層表 ----------
const T = C.towerTable();
eq(T.length, 100, "A1 100 層");
for (let s = 0; s < 10; s++) {
  const ms = C.segModes(s);
  eq(ms.length, 9, `A2 第 ${s} 段 9 個一般層`);
  ok(C.MODES7.every(m => ms.includes(m)), `A3 第 ${s} 段 7 種都出現`, ms);
  ok(ms.every((m, i) => i === 0 || m !== ms[i - 1]), `A4 第 ${s} 段不連續重複`, ms);
  if (C.SEGS[s].pref) ok(C.SEGS[s].pref.includes(ms[0]), `A5 第 ${s} 段教學層用看得到新東西的遊戲`, ms[0]);
  eq(C.segModes(s), ms, `A6 第 ${s} 段依樓層固定（再算一次一樣）`);
  const mx = C.mixModes(s); eq(new Set(mx).size, 6, `A7 第 ${s} 段連戰 6 種不同遊戲`);
}
for (const p of T) {
  const f = p.f, seg = Math.floor((f - 1) / 10), S = C.SEGS[seg];
  if (p.kind === "normal") {
    eq(p.steps.length, 1, `A8 第 ${f} 層一層一個遊戲`);
    const st = p.steps[0];
    eq(st.n, f <= 30 ? 3 : f <= 90 ? 4 : 5, `A9 第 ${f} 層題數`);
    eq(st.lv, [1, 2, 3, 3, 4, 4, 5, 5, 5, 5][seg], `A10 第 ${f} 層等級`);
    eq(st.timer, f <= 20 ? "off" : f <= 30 ? "silver" : "heart", `A11 第 ${f} 層沙漏`);
    if (st.extra.flash) ok(S.flash && C.READ_MODES.has(st.mode), `A12 第 ${f} 層 flash 只給點餐／尋寶`, st);
    if (st.extra.noPic) ok(S.noPic && C.EAR_MODES.has(st.mode), `A13 第 ${f} 層 noPic 只給聽音題`, st);
    if (S.flash && C.READ_MODES.has(st.mode)) ok(st.extra.flash, `A14 第 ${f} 層該 flash`);
  }
}
for (let i = 1; i < 100; i++) if (T[i].kind === "normal" && T[i - 1].kind === "normal") ok(T[i].steps[0].mode !== T[i - 1].steps[0].mode, `A15 第 ${i + 1} 層跟上一層不同遊戲`);
eq([10, 30, 50, 70, 90].map(f => C.floorPlan(f).kind), ["bubble", "bubble", "bubble", "bubble", "bubble"], "A16 10/30/50/70/90＝泡泡 Boss");
eq([20, 40, 60, 80].map(f => C.floorPlan(f).kind), ["mix", "mix", "mix", "mix"], "A17 20/40/60/80＝連戰");
eq([8, 8, 7, 7, 6].map((e, i) => C.floorPlan(10 + i * 20).steps[0].every), [8, 8, 7, 7, 6], "A18 泡泡 Boss 下壓 8/8/7/7/6 發");
ok([10, 30, 50, 70, 90].map(f => C.floorPlan(f).steps[0].level).every((v, i, a) => i === 0 || v > a[i - 1]), "A19 泡泡 Boss 盤面由易到難");
{ const p = C.floorPlan(40); eq(p.steps.length, 6, "A20 連戰 6 題"); ok(p.steps.every(s => s.n === 1 && s.timer === "heart" && s.lv === 3), "A21 連戰每題 1 題、超時扣心、參數用該段", p.steps); eq(new Set(p.steps.map(s => s.mode)).size, 6, "A22 連戰每題換一種遊戲"); }
{ const p = C.floorPlan(100); eq(p.kind, "final", "A23 第 100 層"); eq(p.steps.map(s => s.type), ["floor", "floor", "floor", "floor", "floor", "floor", "bubble", "floor"], "A24 第 100 層＝連戰 6 題→泡泡→積木");
  eq(p.steps[6].every, 6, "A25 第 100 層泡泡 6 發"); eq(p.steps[7].mode, "build", "A26 最後用積木"); eq(p.steps[7].extra.words[0].h, "登頂", "A27 拼出登頂"); }
eq([1, 11, 21, 91].map(f => C.floorPlan(f).teach), [true, true, true, true], "A28 每段第 1 層＝教學層");
eq([5, 15, 95].map(f => C.floorPlan(f).heal), [true, true, true], "A29 第 5、15…層補心");
eq([C.nextBoss(0), C.nextBoss(13), C.nextBoss(20), C.nextBoss(99)], [10, 20, 30, 100], "A30 下一個 Boss");
// 全部題數加起來＝不會兩三次就過關
{ const q = T.reduce((n, p) => n + p.steps.reduce((m, s) => m + (s.type === "floor" ? s.n : 3), 0), 0); ok(q >= 350, "A31 登頂至少要答 350 題以上", q); }

// ---------- 愛心 ----------
{ let h = C.newHearts(); eq(h, { red: 3, gold: 0 }, "B1 開場 3 顆");
  h = C.loseHeart(h); eq(C.heartsLeft(h), 2, "B2 扣 1 顆");
  h = C.healHeart(h); eq(h.red, 3, "B3 補 1 顆"); h = C.healHeart(h); eq(h.red, 3, "B4 補心上限 3");
  h = C.loseHeart(C.loseHeart(h)); h = C.refillHearts(h); eq(h.red, 3, "B5 Boss 補滿");
  let g = C.newHearts(2); g = C.loseHeart(g); eq(g, { red: 2, gold: 2 }, "B6 先掉紅的、金色的留著");
  g = C.loseHeart(C.loseHeart(C.loseHeart(g))); eq(g, { red: 0, gold: 1 }, "B7 紅的掉完才掉金色");
  eq(C.heartsLeft(C.loseHeart(C.newHearts(0, 0)) ), 2, "B8"); }
{ const p = C.floorPlan(12), t1 = C.floorPlan(11), p31 = C.floorPlan(33), p21 = C.floorPlan(23);
  ok(C.costsHeart(p, p.steps[0], { type: "wrong" }), "B9 答錯扣心");
  ok(!C.costsHeart(t1, t1.steps[0], { type: "wrong" }), "B10 教學層答錯不扣");
  ok(!C.costsHeart(p21, p21.steps[0], { type: "timeout" }), "B11 21–30 層超時只變銀不扣心");
  ok(C.costsHeart(p31, p31.steps[0], { type: "timeout" }), "B12 31 層起超時扣心");
  ok(!C.costsHeart(p, p.steps[0], { type: "gold" }) && !C.costsHeart(p, p.steps[0], { type: "silver" }), "B13 答對不扣");
  ok(C.costsHeart(C.floorPlan(10), C.floorPlan(10).steps[0], { type: "press" }), "B14 泡泡碰到底線扣心"); }
// 保底金色愛心
{ const t = C.cleanTower({}); const day = "2026-10-14";
  for (let i = 0; i < 2; i++) C.endRun(t, { reached: 0, floor: 3, played: true, stars: 1 }, "fail", day);
  eq(C.goldFor(t, 1), 0, "B15 連輸 2 場沒有金色愛心");
  C.endRun(t, { reached: 0, floor: 4, played: true, stars: 1 }, "fail", day); eq(C.goldFor(t, 1), 1, "B16 同段連輸 3 場＝1 顆");
  C.endRun(t, { reached: 0, floor: 4, played: true, stars: 1 }, "fail", day); C.endRun(t, { reached: 0, floor: 4, played: true, stars: 1 }, "fail", day);
  eq(C.goldFor(t, 1), 2, "B17 連輸 5 場＝2 顆");
  C.endRun(t, { reached: 12, floor: 14, played: true, stars: 1 }, "fail", day); eq(t.lose, { s: 1, n: 1 }, "B18 換段重算");
  C.clearFloor(t, 10); eq(t.lose.n, 0, "B19 打過 Boss 連輸歸零"); }

// ---------- 存檔點、獎勵 ----------
{ const t = C.cleanTower({});
  eq(C.startFloor(t), 1, "C1 第一次從第 1 層");
  let r = C.clearFloor(t, 4); eq([r.star, r.coin, t.best], [0, 0, 4], "C2 第 4 層沒獎勵");
  r = C.clearFloor(t, 5); eq(r.star, 1, "C3 第一次到第 5 層 +1 星");
  r = C.clearFloor(t, 5); eq(r.star, 0, "C4 第二次到第 5 層不再給");
  r = C.clearFloor(t, 10); eq([r.star, r.coin, r.badge, t.cp], [1, 1, 10, 10], "C5 第一次打倒第 10 層 Boss：星＋幣＋徽章、存檔點 10");
  eq(C.startFloor(t), 11, "C6 下次從第 11 層開始");
  r = C.clearFloor(t, 10); eq([r.coin, r.badge], [0, 0], "C7 Boss 第二次不給幣");
  for (let f = 11; f <= 100; f++) C.clearFloor(t, f);
  eq([t.cp, t.best, t.crown, t.badges.length, t.paid5], [90, 100, 1, 10, 100], "C8 登頂：存檔點 90、王冠、10 枚徽章、20 顆星");
  C.applyLost(t, "lost"); eq([t.cp, t.best, t.code, t.notice, t.crown, t.badges.length, t.paid5], [0, 0, "", "lost", 1, 10, 100], "C9 代號收回：樓層歸零、徽章王冠保留");
  r = C.clearFloor(t, 5); eq(r.star, 0, "C10 收回後重爬，5 的倍數不再給星（只獎勵第一次）");
  r = C.clearFloor(t, 10); eq(r.coin, 0, "C11 收回後重打 Boss 不再給幣"); }
// 星星總數＝20、幣＝10
{ const t = C.cleanTower({}); let stars = 0, coins = 0; for (let f = 1; f <= 100; f++) { const r = C.clearFloor(t, f); stars += r.star; coins += r.coin; } eq([stars, coins], [20, 10], "C12 整座塔共 20 星、10 幣"); }
// 保底星星
{ const t = C.cleanTower({}), d1 = "2026-10-14", d2 = "2026-10-15";
  const g = () => C.endRun(t, { reached: 0, floor: 2, played: true, stars: 0 }, "fail", d1).guarantee;
  eq([g(), g(), g(), g()], [1, 1, 1, 0], "C13 保底 1 星，一天最多 3 場");
  eq(C.endRun(t, { reached: 0, floor: 2, played: true, stars: 0 }, "fail", d2).guarantee, 1, "C14 隔天又有");
  eq(C.endRun(t, { reached: 5, floor: 6, played: true, stars: 1 }, "fail", d2).guarantee, 0, "C15 這場拿過星星就不補");
  eq(C.endRun(t, { reached: 0, floor: 1, played: false, stars: 0 }, "rest", d2).guarantee, 0, "C16 沒玩到題目不給");
  const t2 = C.cleanTower({ last: 7 }); const o = C.endRun(t2, { reached: 12, floor: 13, played: true, stars: 1 }, "fail", d1);
  eq([o.prev, t2.last], [7, 12], "C17 旗子：上次 7、這次 12"); }

// ---------- 存檔清洗 ----------
{ const S = "0123456789abcdef0123456789abcdef";
  eq(C.cleanTower(null).cp, 0, "D1 null");
  eq(C.cleanTower("x").best, 0, "D2 字串");
  const t = C.cleanTower({ code: "tiger", sec: S, cp: 37, best: 250, last: -3, sent: 999, badges: [10, 10, 15, "20", 300], crown: "y", lose: { s: 22, n: -1 }, gN: 9, pingDay: "昨天", notice: "x", runs: 1.7 });
  eq([t.code, t.cp, t.best, t.last, t.sent, t.badges, t.crown, t.lose, t.gN, t.pingDay, t.notice, t.runs], ["tiger", 30, 100, 0, 100, [10, 20], 1, { s: 9, n: 0 }, 3, "", "", 1], "D3 夾範圍、去重、徽章只留 Boss 層");
  eq(C.cleanTower({ code: "tiger", sec: "abc" }).code, "", "D4 秘密碼格式不對＝沒有代號");
  eq(C.cleanTower({ code: "unicorn", sec: S }).code, "", "D5 代號不在清單");
  eq(C.cleanTower({ cp: 40, best: 12 }).best, 40, "D6 最高樓層不會低於存檔點");
  eq(C.cleanTower({ best: 30, sent: 30 }).sent, 0, "D7 沒代號 sent 歸零");
  ok(C.SEC_RE.test(C.newSecret()), "D8 秘密碼 32 碼 hex");
  ok(C.newSecret() !== C.newSecret(), "D9 每次不一樣");
  eq(C.CODES.length, 24, "D10 24 個代號"); eq(new Set(C.CODES.map(c => c.id)).size, 24, "D11 代號不重複");
  eq(C.cleanBoard({ board: [{ c: "tiger", f: 30 }, { c: "x", f: 9 }, { c: "ox", f: 0 }, { c: "dog", f: 120 }], taken: ["tiger", "tiger", "zz", 3] }),
    { board: [{ c: "tiger", f: 30 }, { c: "dog", f: 100 }], taken: ["tiger"] }, "D12 榜清洗"); }

// ---------- 跟後端同步 ----------
const S = "fedcba9876543210fedcba9876543210";
const fakeServer = (state) => async body => { state.calls.push(body); if (state.down) return null;
  if (body.k === "tw_ping") return state.lost ? { ok: false, why: "lost" } : { ok: true, f: state.f };
  if (body.k === "tw_score") { if (state.lost) return { ok: false, why: "lost" }; state.f = Math.max(state.f, Math.min(body.f, state.f + 20)); return { ok: true, f: state.f }; }
  return { ok: false, why: "bad_body" }; };
{ const st = { f: 0, calls: [] }, t = C.cleanTower({ code: "tiger", sec: S, best: 47, cp: 40 });
  const r = await C.syncTower(t, fakeServer(st), "2026-10-14");
  eq([r.pinged, r.sent, t.sent, t.pingDay, st.f], [true, true, 47, "2026-10-14", 47], "E1 ping＋score 送到追上（47 要送 3 次，每次 +20）");
  eq(st.calls.map(c => c.k), ["tw_ping", "tw_score", "tw_score", "tw_score"], "E2 呼叫順序");
  ok(st.calls.every(c => Object.keys(c).length === (c.k === "tw_score" ? 4 : 3)), "E3 只送 k/c/s(/f)，沒有多的欄位", st.calls);
  st.calls = []; await C.syncTower(t, fakeServer(st), "2026-10-14"); eq(st.calls.length, 0, "E4 同一天、沒有新分數＝不送"); }
{ const st = { f: 0, calls: [], down: true }, t = C.cleanTower({ code: "tiger", sec: S, best: 12 });
  const r = await C.syncTower(t, fakeServer(st), "2026-10-14"); eq([r.changed, t.code, t.best, t.pingDay], [false, "tiger", 12, ""], "E5 離線：本機不動、下次再送");
  st.down = false; const r2 = await C.syncTower(t, fakeServer(st), "2026-10-14"); eq([r2.sent, t.sent], [true, 12], "E6 上線後補送"); }
{ const st = { f: 0, calls: [], lost: true }, t = C.cleanTower({ code: "tiger", sec: S, best: 33, cp: 30, badges: [10, 20, 30], paid5: 30 });
  const r = await C.syncTower(t, fakeServer(st), "2026-10-14");
  eq([r.lost, t.code, t.sec, t.best, t.cp, t.notice, t.badges.length, t.paid5], [true, "", "", 0, 0, "lost", 3, 30], "E7 一週沒來被釋出：樓層歸零、徽章保留、要通知"); }
{ const t = C.cleanTower({ best: 20 }); const r = await C.syncTower(t, async () => { throw new Error("不該送"); }, "2026-10-14"); eq(r.changed, false, "E8 沒代號不送"); }
{ const t = C.cleanTower({ best: 25 }); C.applyClaim(t, "ox", S, 0, "2026-10-14"); eq([t.code, t.sent, C.scorePending(t)], ["ox", 0, true], "E9 選了代號：之前爬的樓層排隊送"); }

console.log(fails.map(f => "FAIL  " + f).join("\n"));
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
